import React, { useState, useRef } from 'react';
import { XMLParser } from 'fast-xml-parser';
import { useCanvasStore, CanvasThing, LinkType } from '../canvas-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface ArchiMateToolViewerProps {
    thing: CanvasThing;
}

// Minimal interfaces for parsed data
interface AMElement {
    id: string;
    type: string;
    name: string;
}

interface AMRelationship {
    id: string;
    sourceId: string;
    targetId: string;
    type: string;
}

interface AMViewNode {
    id: string; // View node ID
    elementRef: string; // Ref to actual element
    x: number;
    y: number;
    w: number;
    h: number;
    type: string;
}

interface AMViewConnection {
    id: string;
    relationshipRef: string;
    sourceId: string; // View Node Source
    targetId: string; // View Node Target
}

interface AMView {
    id: string;
    name: string;
    nodes: AMViewNode[];
    connections: AMViewConnection[];
}

export function ArchiMateToolViewer({ thing }: ArchiMateToolViewerProps) {
    const { addThing, addLink, deleteThing } = useCanvasStore();
    const { toast } = useToast();

    const [file, setFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [parsedModel, setParsedModel] = useState<{
        elements: Record<string, AMElement>;
        relationships: Record<string, AMRelationship>;
        views: AMView[];
    } | null>(null);
    const [selectedViewId, setSelectedViewId] = useState<string>("");
    const [isImporting, setIsImporting] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            parseFile(f);
        }
    };

    const parseFile = async (file: File) => {
        setIsParsing(true);
        try {
            const text = await file.text();
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "@_"
            });
            const jsonObj = parser.parse(text);

            // Basic Normalize Logic (Handling Namespaces roughly)
            // Ideally we traverse identifying key tags regardless of prefix (archimate: vs plain)

            // Helper to find root 'model'
            let modelRoot: any = null;
            // Try common roots
            const keys = Object.keys(jsonObj);
            const rootKey = keys.find(k => k.toLowerCase().includes("model"));
            if (rootKey) modelRoot = jsonObj[rootKey];

            if (!modelRoot) throw new Error("Could not find 'model' root element");

            // 1. Parse Elements
            const elementsMap: Record<string, AMElement> = {};
            // Look for 'elements' arrays. The structure varies by export.
            // Standard: model -> elements -> element
            // Sometimes namespaced.

            // Recursive generic finder could be better, but let's try strict paths for now based on spec
            // Spec: model > elements > element

            // Helper to get array from potential single object
            const asArray = (arr: any) => Array.isArray(arr) ? arr : (arr ? [arr] : []);

            // Identify elements container
            let elementsContainer = modelRoot["elements"] || modelRoot["folder"];
            // Often ArchiMate models use Folders.

            // Flatten generic function to find 'element' tags
            const foundElements: any[] = [];

            const traverseForElements = (node: any) => {
                if (!node) return;
                if (node["element"]) {
                    const els = asArray(node["element"]);
                    els.forEach((el: any) => foundElements.push(el));
                }
                // Check folders
                if (node["folder"]) {
                    const folders = asArray(node["folder"]);
                    folders.forEach((f: any) => traverseForElements(f));
                }
                // Check direct children keys if namespaces usually
                Object.keys(node).forEach(key => {
                    if (key.includes(":element") || key === "element") {
                        const els = asArray(node[key]);
                        els.forEach((el: any) => foundElements.push(el));
                    }
                    if (key.includes("folder")) {
                        const f = asArray(node[key]);
                        f.forEach((sub: any) => traverseForElements(sub));
                    }
                });
            };

            // Look deeply
            if (modelRoot["elements"]) traverseForElements(modelRoot["elements"]);
            else traverseForElements(modelRoot); // Fallback traversal

            foundElements.forEach(el => {
                const id = el["@_identifier"] || el["@_id"];
                const type = el["@_xsi:type"] || el["type"];
                const name = el["name"] ? (typeof el["name"] === 'object' ? el["name"]["#text"] : el["name"]) : (el["label"] ? (typeof el["label"] === 'object' ? el["label"]["#text"] : el["label"]) : "Unnamed");

                if (id) {
                    elementsMap[id] = { id, type, name };
                }
            });

            // 2. Parse Relationships
            const relMap: Record<string, AMRelationship> = {};
            const foundRels: any[] = [];

            const traverseForRels = (node: any) => {
                if (!node) return;
                // relationships -> relationship
                Object.keys(node).forEach(key => {
                    if (key.includes("relationship")) {
                        const rels = asArray(node[key]);
                        rels.forEach((r: any) => foundRels.push(r));
                    }
                    if (key.includes("folder")) {
                        const f = asArray(node[key]);
                        f.forEach((sub: any) => traverseForRels(sub));
                    }
                });
            };

            if (modelRoot["relationships"]) traverseForRels(modelRoot["relationships"]);
            else traverseForRels(modelRoot);

            foundRels.forEach(rel => {
                const id = rel["@_identifier"] || rel["@_id"];
                const source = rel["@_source"];
                const target = rel["@_target"];
                const type = rel["@_xsi:type"] || rel["type"];

                if (id && source && target) {
                    relMap[id] = { id, sourceId: source, targetId: target, type };
                }
            });

            // 3. Parse Views
            const views: AMView[] = [];
            const foundViews: any[] = [];

            const traverseForViews = (node: any) => {
                if (!node || typeof node !== 'object') return;

                // Handle arrays by iterating
                if (Array.isArray(node)) {
                    node.forEach(item => traverseForViews(item));
                    return;
                }

                Object.keys(node).forEach(key => {
                    const value = node[key];
                    const lowerKey = key.toLowerCase();

                    // Detect View elements
                    // Look for 'view' tag or 'diagram' tag
                    if (lowerKey === 'view' || lowerKey.endsWith(':view') ||
                        lowerKey === 'diagram' || lowerKey.endsWith(':diagram')) {

                        const vs = asArray(value);
                        vs.forEach((v: any) => foundViews.push(v));
                        // Do not recurse INSIDE a view (it doesn't contain views)
                        return;
                    }

                    // Recurse into children (folders, lists, etc)
                    // We only recurse if it's an object/array
                    if (typeof value === 'object') {
                        traverseForViews(value);
                    }
                });
            };
            // Views are often in 'views' folder
            if (modelRoot["views"]) traverseForViews({ views: modelRoot["views"] });
            else traverseForViews(modelRoot);

            foundViews.forEach(v => {
                const vid = v["@_identifier"] || v["@_id"];
                const vname = v["name"] ? (typeof v["name"] === 'object' ? v["name"]["#text"] : v["name"]) : (v["label"] ? (typeof v["label"] === 'object' ? v["label"]["#text"] : v["label"]) : "Unnamed View");

                const nodes: AMViewNode[] = [];
                const links: AMViewConnection[] = [];

                const processViewChild = (child: any) => {
                    // child is typically <node> or <connection>
                    // <node identifier="..." elementRef="..." xsi:type="..." x="..." y="..." w="..." h="..." >

                    // We need bounds. Sometimes passed as <bounds x... /> or directly on the node
                    const bounds = child["bounds"] || child["uk.ac.bolton.archimate.editor:bounds"];

                    // Robust check for elementRef (case insensitive check for XML attributes usually lowers keys in some parsers, but here checking both)
                    const elementRef = child["@_elementRef"] || child["@_elementref"];

                    if (elementRef) {
                        // It's a Node
                        const nid = child["@_identifier"] || child["@_id"];
                        const ref = elementRef;
                        let x = 0, y = 0, w = 120, h = 60;

                        if (bounds) {
                            x = parseInt(bounds["@_x"] || "0") || 0;
                            y = parseInt(bounds["@_y"] || "0") || 0;
                            w = parseInt(bounds["@_width"] || "120") || 120;
                            h = parseInt(bounds["@_height"] || "60") || 60;
                        } else {
                            // Try direct attributes
                            if (child["@_x"]) x = parseInt(child["@_x"]) || 0;
                            if (child["@_y"]) y = parseInt(child["@_y"]) || 0;
                            if (child["@_w"]) w = parseInt(child["@_w"]) || 120;
                            if (child["@_h"]) h = parseInt(child["@_h"]) || 60;
                        }

                        nodes.push({ id: nid, elementRef: ref, x, y, w, h, type: child["@_xsi:type"] });
                    }

                    const relationshipRef = child["@_relationshipRef"] || child["@_relationshipref"];

                    if (relationshipRef) {
                        // It's a Connection
                        const lid = child["@_identifier"] || child["@_id"];
                        const ref = relationshipRef;
                        const source = child["@_source"];
                        const target = child["@_target"];
                        links.push({ id: lid, relationshipRef: ref, sourceId: source, targetId: target });
                    } else if (child["sourceConnection"]) {
                        // Sometimes connections are nested in nodes in Archi format
                        const conns = asArray(child["sourceConnection"]);
                        conns.forEach((c: any) => {
                            const lid = c["@_identifier"] || c["@_id"];
                            const ref = c["@_relationshipRef"] || c["@_relationshipref"];
                            const src = c["@_source"];
                            const tgt = c["@_target"];
                            if (ref) {
                                links.push({ id: lid, relationshipRef: ref, sourceId: src, targetId: tgt });
                            }
                        });
                    }

                    // Nested nodes (Composition usually visual)
                    if (child["node"]) {
                        const nested = asArray(child["node"]);
                        nested.forEach(processViewChild);
                    }
                };

                if (v["node"]) {
                    const viewNodes = asArray(v["node"]);
                    viewNodes.forEach(processViewChild);
                }

                // Top level connections if separate
                if (v["connection"]) {
                    const viewConns = asArray(v["connection"]);
                    viewConns.forEach((c: any) => {
                        const lid = c["@_identifier"] || c["@_id"];
                        const ref = c["@_relationshipRef"];
                        const src = c["@_source"];
                        const tgt = c["@_target"];
                        links.push({ id: lid, relationshipRef: ref, sourceId: src, targetId: tgt });
                    });
                }

                views.push({ id: vid, name: vname, nodes, connections: links });
            });

            setParsedModel({
                elements: elementsMap,
                relationships: relMap,
                views
            });

            if (views.length > 0) setSelectedViewId(views[0].id);

        } catch (err) {
            console.error("XML Parse Error:", err);
            toast({ title: "Parsing Failed", description: "Invalid ArchiMate XML file", variant: "destructive" });
        } finally {
            setIsParsing(false);
        }
    };

    const handleKeyImport = async () => {
        if (!parsedModel || !selectedViewId) return;
        setIsImporting(true);

        const elementThingMap: Record<string, string> = {}; // ElementID/ViewNodeID -> ThingID

        try {
            if (selectedViewId === "ALL_ELEMENTS") {
                // Import All Elements Mode (Grid Layout)
                const elements = Object.values(parsedModel.elements);
                const COLUMNS = 5;
                const X_GAP = 220;
                const Y_GAP = 240; // Increased for taller nodes (180h + gap)

                for (let i = 0; i < elements.length; i++) {
                    const el = elements[i];
                    const row = Math.floor(i / COLUMNS);
                    const col = i % COLUMNS;

                    const newThing = await addThing(
                        "archimate_element",
                        {
                            name: el.name,
                            type: el.type,
                            originalId: el.id
                        },
                        {
                            x: thing.position_x + (col * X_GAP),
                            y: thing.position_y + (row * Y_GAP) + 100
                        },
                        180, // Request: 180x180
                        180,
                        el.name
                    );

                    if (newThing) {
                        elementThingMap[el.id] = newThing.id;
                    }
                }

                // Import All Relationships
                const relationships = Object.values(parsedModel.relationships);

                for (const rel of relationships) {
                    const sourceId = elementThingMap[rel.sourceId];
                    const targetId = elementThingMap[rel.targetId];

                    if (sourceId && targetId) {
                        let linkType: LinkType = "related";
                        const archType = rel.type?.toLowerCase() || "";

                        if (archType.includes("composition")) linkType = "contains";
                        else if (archType.includes("aggregation")) linkType = "contains";
                        else if (archType.includes("realization")) linkType = "derived_from";
                        else if (archType.includes("triggering")) linkType = "triggers";
                        else if (archType.includes("flow")) linkType = "triggers";
                        else if (archType.includes("access")) linkType = "references";

                        await addLink(
                            sourceId,
                            targetId,
                            linkType,
                            rel.type || "Association",
                            ""
                        );
                    } else {
                        console.warn(`[ArchiMate] Missing ID map for link: ${rel.id} (Source: ${rel.sourceId}->${sourceId}, Target: ${rel.targetId}->${targetId})`);
                    }
                }
                toast({ title: "Import Successful", description: `Imported ${elements.length} elements.` });

                // Auto-close the importer tool
                deleteThing(thing.id);

            } else if (selectedViewId === "ALL_VIEWS") {
                // Import All Views Mode
                // Start below the importer tool to avoid overlap
                let currentYOffset = (thing.height || 400) + 100;
                const viewGap = 150;
                let totalElements = 0;

                for (const view of parsedModel.views) {
                    // Create View Header
                    await addThing(
                        "text",
                        { text: `## ${view.name}\n\n*Imported View*` },
                        { x: thing.position_x, y: thing.position_y + currentYOffset },
                        undefined,
                        undefined,
                        view.name
                    );

                    // Add space for header
                    const headerHeight = 100;
                    const contentStartY = currentYOffset + headerHeight;

                    // Calculate view bounds to determine offset for next view
                    let maxY = 0;

                    // 1. Create Things for this view
                    for (const vNode of view.nodes) {
                        const elementDef = parsedModel.elements[vNode.elementRef];
                        if (!elementDef) continue;

                        const SCALE_FACTOR = 2.5;
                        const width = (vNode.w || 120) * SCALE_FACTOR;
                        const height = (vNode.h || 60) * SCALE_FACTOR;

                        // Track bounds
                        const bottomY = (vNode.y * SCALE_FACTOR) + height;
                        if (bottomY > maxY) maxY = bottomY;

                        const newThing = await addThing(
                            "archimate_element",
                            {
                                name: elementDef.name,
                                type: elementDef.type,
                                originalId: elementDef.id,
                                viewNodeId: vNode.id,
                                viewId: view.id
                            },
                            {
                                x: thing.position_x + (vNode.x * SCALE_FACTOR),
                                y: thing.position_y + contentStartY + (vNode.y * SCALE_FACTOR)
                            },
                            width,
                            height,
                            elementDef.name
                        );

                        if (newThing) {
                            elementThingMap[vNode.id] = newThing.id;
                            totalElements++;
                        }
                    }

                    // 2. Create Links for this view
                    for (const vConn of view.connections) {
                        const relDef = parsedModel.relationships[vConn.relationshipRef];
                        const sourceThingId = elementThingMap[vConn.sourceId];
                        const targetThingId = elementThingMap[vConn.targetId];

                        if (sourceThingId && targetThingId) {
                            let linkType: LinkType = "related";
                            const archType = relDef?.type?.toLowerCase() || "";

                            if (archType.includes("composition")) linkType = "contains";
                            else if (archType.includes("aggregation")) linkType = "contains";
                            else if (archType.includes("realization")) linkType = "derived_from";
                            else if (archType.includes("triggering")) linkType = "triggers";
                            else if (archType.includes("flow")) linkType = "triggers";
                            else if (archType.includes("access")) linkType = "references";

                            await addLink(
                                sourceThingId,
                                targetThingId,
                                linkType,
                                relDef?.type || "Association",
                                ""
                            );
                        }
                    }

                    // Increment offset for next view, ensuring at least some gap even if empty
                    // Bounds + Header + Gap
                    currentYOffset += (headerHeight + Math.max(maxY, 100) + viewGap);
                }

                toast({ title: "Import Successful", description: `Imported ${parsedModel.views.length} views with ${totalElements} elements.` });
                deleteThing(thing.id);

            } else {
                // Existing View-Based Import Logic
                const view = parsedModel.views.find(v => v.id === selectedViewId);
                if (!view) return;

                // 1. Create Things
                for (const vNode of view.nodes) {
                    const elementDef = parsedModel.elements[vNode.elementRef];
                    if (!elementDef) continue;

                    // Enforce minimum size if XML has weird values (or -1)
                    // ArchiMate tools sometimes use negative for auto-size, or simple small bounds
                    const SCALE_FACTOR = 2.5;
                    const width = (vNode.w || 120) * SCALE_FACTOR;
                    const height = (vNode.h || 60) * SCALE_FACTOR;

                    const newThing = await addThing(
                        "archimate_element",
                        {
                            name: elementDef.name,
                            type: elementDef.type,
                            originalId: elementDef.id,
                            viewNodeId: vNode.id
                        },
                        { x: thing.position_x + (vNode.x * SCALE_FACTOR), y: thing.position_y + (vNode.y * SCALE_FACTOR) },
                        width,
                        height,
                        elementDef.name
                    );

                    if (newThing) {
                        elementThingMap[vNode.id] = newThing.id;
                    }
                }

                // 2. Create Links
                for (const vConn of view.connections) {
                    const relDef = parsedModel.relationships[vConn.relationshipRef];
                    const sourceThingId = elementThingMap[vConn.sourceId];
                    const targetThingId = elementThingMap[vConn.targetId];

                    if (sourceThingId && targetThingId) {
                        let linkType: LinkType = "related";
                        const archType = relDef?.type?.toLowerCase() || "";

                        if (archType.includes("composition")) linkType = "contains";
                        else if (archType.includes("aggregation")) linkType = "contains";
                        else if (archType.includes("realization")) linkType = "derived_from";
                        else if (archType.includes("triggering")) linkType = "triggers";
                        else if (archType.includes("flow")) linkType = "triggers";
                        else if (archType.includes("access")) linkType = "references";

                        await addLink(
                            sourceThingId,
                            targetThingId,
                            linkType,
                            relDef?.type || "Association",
                            ""
                        );
                    }
                }
                toast({ title: "Import Successful", description: `Imported ${view.nodes.length} elements from ${view.name}` });

                // Auto-close the importer tool
                deleteThing(thing.id);
            }

        } catch (e) {
            console.error(e);
            toast({ title: "Import Failed", variant: "destructive" });
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="w-full h-full bg-slate-50 dark:bg-slate-900 border rounded-lg flex flex-col overflow-hidden shadow-sm">
            <div className="p-3 bg-white dark:bg-slate-800 border-b flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded">
                    <Upload className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold">ArchiMate Importer</h3>
                    <p className="text-[10px] text-muted-foreground">Exchange Format (XML)</p>
                </div>
            </div>

            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {!parsedModel ? (
                    <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-lg bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 transition-colors cursor-pointer relative">
                        <input
                            type="file"
                            accept=".xml,.archimate"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={handleFileChange}
                        />
                        {isParsing ? (
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400 mb-2" />
                        ) : (
                            <FileText className="w-8 h-8 text-slate-300 mb-2" />
                        )}
                        <span className="text-xs text-muted-foreground font-medium">
                            {isParsing ? "Parsing XML..." : "Drop XML file here"}
                        </span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <Card className="p-2 bg-white dark:bg-slate-800">
                                <div className="text-xs text-muted-foreground">Elements</div>
                                <div className="text-lg font-bold">{Object.keys(parsedModel.elements).length}</div>
                            </Card>
                            <Card className="p-2 bg-white dark:bg-slate-800">
                                <div className="text-xs text-muted-foreground">Views</div>
                                <div className="text-lg font-bold">{parsedModel.views.length}</div>
                            </Card>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-600">Select View to Build</label>
                            <Select value={selectedViewId} onValueChange={setSelectedViewId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Diagram..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL_ELEMENTS" className="font-semibold border-b">
                                        Import All Elements (Grid Layout)
                                    </SelectItem>
                                    <SelectItem value="ALL_VIEWS" className="font-semibold border-b">
                                        Import All Views (Vertical Stack)
                                    </SelectItem>
                                    {parsedModel.views.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            className="w-full gap-2"
                            onClick={handleKeyImport}
                            disabled={isImporting || !selectedViewId}
                        >
                            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Build Diagram
                        </Button>

                        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setParsedModel(null); setFile(null); setSelectedViewId(""); }}>
                            Reset
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
