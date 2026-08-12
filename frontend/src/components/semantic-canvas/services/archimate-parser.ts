/**
 * Archimate Parser
 * 
 * Parses .archimate XML files exported from Archi and converts them into
 * a structured format suitable for rendering in a custom React Flow instance.
 */

export interface ArchimateBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ArchimateProperty {
    key: string;
    value: string;
}

export interface ArchimateNodeData {
    id: string;
    type: string;
    name: string;
    bounds?: ArchimateBounds;
    documentation?: string;
    properties?: ArchimateProperty[];
}

export interface ArchimateEdgeData {
    id: string;
    source: string;
    target: string;
    type: string;
}

export interface ArchimateDiagram {
    id: string;
    name: string;
    nodes: ArchimateNodeData[];
    edges: ArchimateEdgeData[];
}

export interface ArchimateElementDefinition {
    type: string;
    name: string;
    documentation?: string;
    properties?: ArchimateProperty[];
}

export interface ParsedArchimate {
    elements: Record<string, ArchimateElementDefinition>;
    relationships: Record<string, ArchimateEdgeData>;
    diagrams: ArchimateDiagram[];
}

export async function parseArchimateXml(xmlText: string): Promise<ParsedArchimate> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    const result: ParsedArchimate = {
        elements: {},
        relationships: {},
        diagrams: []
    };

    // Detect format
    const isArchiFormat = Array.from(doc.querySelectorAll('element')).some(el => el.getAttribute('xsi:type')?.startsWith('archimate:'));
    
    if (isArchiFormat) {
        parseArchiFormat(doc, result);
    } else {
        parseOpenGroupFormat(doc, result);
    }

    return result;
}

function parseArchiFormat(doc: Document, result: ParsedArchimate) {
    // 1. Extract Elements (Global definitions)
    const allElements = Array.from(doc.querySelectorAll('element'));
    allElements.forEach(el => {
        const id = el.getAttribute('id');
        const type = el.getAttribute('xsi:type');
        const name = el.getAttribute('name') || '';
        
        if (id && type && !type.includes('Relationship') && !type.includes('Diagram')) {
            const docEl = el.querySelector('documentation');
            const documentation = docEl ? docEl.textContent || undefined : undefined;
            
            const properties: ArchimateProperty[] = [];
            const propEls = Array.from(el.querySelectorAll('property'));
            propEls.forEach(p => {
                const key = p.getAttribute('key');
                const value = p.getAttribute('value');
                if (key && value) properties.push({ key, value });
            });

            result.elements[id] = { 
                type: type.replace('archimate:', ''), 
                name,
                documentation,
                properties
            };
        }
    });

    // 2. Extract Relationships (Global)
    const allRelations = Array.from(doc.querySelectorAll('element'));
    allRelations.forEach(rel => {
        const id = rel.getAttribute('id');
        const type = rel.getAttribute('xsi:type');
        const source = rel.getAttribute('source');
        const target = rel.getAttribute('target');

        if (id && type && type.includes('Relationship') && source && target) {
            result.relationships[id] = {
                id,
                type: type.replace('archimate:', ''),
                source,
                target
            };
        }
    });

    // 3. Extract Diagrams / Views recursively to handle nested coordinates
    const diagramElements = Array.from(doc.querySelectorAll('element'));
    diagramElements.forEach(diag => {
        const type = diag.getAttribute('xsi:type');
        if (type !== 'archimate:ArchimateDiagramModel') return;

        const diagId = diag.getAttribute('id') || 'unknown';
        const diagName = diag.getAttribute('name') || 'Unnamed Diagram';

        const diagram: ArchimateDiagram = {
            id: diagId,
            name: diagName,
            nodes: [],
            edges: []
        };

        const parseDiagramNode = (child: Element, offsetX = 0, offsetY = 0) => {
            const cType = child.getAttribute('xsi:type');
            if (cType !== 'archimate:DiagramObject' && cType !== 'archimate:Group') return;

            const childId = child.getAttribute('id') || '';
            const archimateElementId = child.getAttribute('archimateElement') || '';
            const nameAttr = child.getAttribute('name');
            
            const childrenArray = Array.from(child.children);
            const boundsEl = childrenArray.find(c => c.tagName === 'bounds');
            
            let bounds: ArchimateBounds | undefined = undefined;
            if (boundsEl) {
                bounds = {
                    x: parseInt(boundsEl.getAttribute('x') || '0', 10) + offsetX,
                    y: parseInt(boundsEl.getAttribute('y') || '0', 10) + offsetY,
                    width: parseInt(boundsEl.getAttribute('width') || '120', 10),
                    height: parseInt(boundsEl.getAttribute('height') || '55', 10),
                };
            }

            const refElement = result.elements[archimateElementId];
            if (refElement) {
                diagram.nodes.push({
                    id: childId,
                    type: refElement.type,
                    name: refElement.name,
                    bounds,
                    documentation: refElement.documentation,
                    properties: refElement.properties
                });
            } else if (cType === 'archimate:Group') {
                diagram.nodes.push({
                    id: childId,
                    type: 'Group',
                    name: nameAttr || 'Group',
                    bounds
                });
            } else {
                 diagram.nodes.push({
                    id: childId,
                    type: 'Unknown',
                    name: nameAttr || 'Unknown',
                    bounds
                });
            }

            // Extract Diagram Connections (Edges in the view)
            const connections = childrenArray.filter(c => c.tagName === 'sourceConnection');
            connections.forEach(conn => {
                const connType = conn.getAttribute('xsi:type');
                if (connType !== 'archimate:Connection') return;

                const connId = conn.getAttribute('id') || '';
                const sourceId = conn.getAttribute('source') || '';
                const targetId = conn.getAttribute('target') || '';
                const archimateRelationshipId = conn.getAttribute('archimateRelationship') || '';

                const refRel = result.relationships[archimateRelationshipId];
                
                diagram.edges.push({
                    id: connId,
                    source: sourceId,
                    target: targetId,
                    type: refRel ? refRel.type : 'UnknownRelationship'
                });
            });

            // Parse nested children (e.g. Composition)
            const nestedChildren = childrenArray.filter(c => c.tagName === 'child');
            nestedChildren.forEach(nested => {
                parseDiagramNode(nested, bounds ? bounds.x : offsetX, bounds ? bounds.y : offsetY);
            });
        };

        const topLevelChildren = Array.from(diag.children).filter(c => c.tagName === 'child');
        topLevelChildren.forEach(child => parseDiagramNode(child, 0, 0));

        result.diagrams.push(diagram);
    });
}

function parseOpenGroupFormat(doc: Document, result: ParsedArchimate) {
    // 1. Elements
    const elementsContainer = doc.querySelector('elements');
    if (elementsContainer) {
        Array.from(elementsContainer.querySelectorAll('element')).forEach(el => {
            const id = el.getAttribute('identifier');
            const type = el.getAttribute('xsi:type');
            if (!id || !type) return;

            const nameEl = el.querySelector('name');
            const name = nameEl ? nameEl.textContent || '' : '';
            
            const docEl = el.querySelector('documentation');
            const documentation = docEl ? docEl.textContent || undefined : undefined;
            
            const properties: ArchimateProperty[] = [];
            const propEls = Array.from(el.querySelectorAll('property'));
            propEls.forEach(p => {
                const key = p.getAttribute('propertyDefinitionRef') || 'Property';
                const valueEl = p.querySelector('value');
                const value = valueEl ? valueEl.textContent || '' : '';
                if (value) properties.push({ key, value });
            });

            result.elements[id] = { type, name, documentation, properties };
        });
    }

    // 2. Relationships
    const relationshipsContainer = doc.querySelector('relationships');
    if (relationshipsContainer) {
        Array.from(relationshipsContainer.querySelectorAll('relationship')).forEach(rel => {
            const id = rel.getAttribute('identifier');
            const type = rel.getAttribute('xsi:type');
            const source = rel.getAttribute('source');
            const target = rel.getAttribute('target');

            if (id && type && source && target) {
                result.relationships[id] = { id, type, source, target };
            }
        });
    }

    // 3. Views / Diagrams
    const viewsContainer = doc.querySelector('views > diagrams');
    if (viewsContainer) {
        Array.from(viewsContainer.querySelectorAll('view')).forEach(view => {
            const diagId = view.getAttribute('identifier') || 'unknown';
            const nameEl = view.querySelector('name');
            const diagName = nameEl ? nameEl.textContent || 'Unnamed Diagram' : 'Unnamed Diagram';

            const diagram: ArchimateDiagram = {
                id: diagId,
                name: diagName,
                nodes: [],
                edges: []
            };

            const parseNode = (nodeEl: Element) => {
                const nodeId = nodeEl.getAttribute('identifier') || '';
                const elementRef = nodeEl.getAttribute('elementRef');
                
                let bounds: ArchimateBounds | undefined = undefined;
                const xStr = nodeEl.getAttribute('x');
                const yStr = nodeEl.getAttribute('y');
                const wStr = nodeEl.getAttribute('w');
                const hStr = nodeEl.getAttribute('h');
                
                if (xStr && yStr && wStr && hStr) {
                    bounds = {
                        x: parseInt(xStr, 10),
                        y: parseInt(yStr, 10),
                        width: parseInt(wStr, 10),
                        height: parseInt(hStr, 10),
                    };
                }

                if (elementRef) {
                    const refEl = result.elements[elementRef];
                    if (refEl) {
                        diagram.nodes.push({
                            id: nodeId,
                            type: refEl.type,
                            name: refEl.name,
                            bounds,
                            documentation: refEl.documentation,
                            properties: refEl.properties
                        });
                    }
                } else if (nodeEl.tagName === 'node') {
                    // Could be a container/group
                    const labelEl = nodeEl.querySelector('label');
                    diagram.nodes.push({
                        id: nodeId,
                        type: 'Group',
                        name: labelEl ? labelEl.textContent || 'Group' : 'Group',
                        bounds
                    });
                }

                // Nested nodes
                Array.from(nodeEl.children).filter(c => c.tagName === 'node').forEach(childNode => {
                    parseNode(childNode);
                });
            };

            Array.from(view.children).filter(c => c.tagName === 'node').forEach(n => parseNode(n));

            // View Connections
            Array.from(view.querySelectorAll('connection')).forEach(conn => {
                const connId = conn.getAttribute('identifier') || '';
                const sourceId = conn.getAttribute('source') || '';
                const targetId = conn.getAttribute('target') || '';
                const relationshipRef = conn.getAttribute('relationshipRef') || '';

                const refRel = result.relationships[relationshipRef];
                
                diagram.edges.push({
                    id: connId,
                    source: sourceId,
                    target: targetId,
                    type: refRel ? refRel.type : 'UnknownRelationship'
                });
            });

            result.diagrams.push(diagram);
        });
    }
}
