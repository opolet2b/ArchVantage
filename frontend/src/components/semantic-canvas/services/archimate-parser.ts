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

export interface ArchimateNodeData {
    id: string;
    type: string;
    name: string;
    bounds?: ArchimateBounds;
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

export interface ParsedArchimate {
    elements: Record<string, { type: string; name: string }>;
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

    // 1. Extract Elements (Global definitions)
    const allElements = Array.from(doc.querySelectorAll('element'));
    allElements.forEach(el => {
        const id = el.getAttribute('id');
        const type = el.getAttribute('xsi:type');
        const name = el.getAttribute('name') || '';
        
        if (id && type && !type.includes('Relationship') && !type.includes('Diagram')) {
            result.elements[id] = { type: type.replace('archimate:', ''), name };
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
                    bounds
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

    return result;
}
