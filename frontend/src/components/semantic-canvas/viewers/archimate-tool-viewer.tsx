import React, { useRef, useMemo, useEffect } from 'react';
import { UploadCloud } from 'lucide-react';
import { useCanvasStore, CanvasThing } from '../canvas-store';
import { Button } from '@/components/ui/button';
import { parseArchimateXml, ParsedArchimate, ArchimateNodeData } from '../services/archimate-parser';
import { cn } from '@/lib/utils';
import ReactFlow, { Background, Controls, MiniMap, Node as RFNode, Edge as RFEdge, ReactFlowProvider, MarkerType, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';

import {
    ActorIcon,
    RoleIcon,
    ProcessIcon,
    FunctionIcon,
    EventIcon,
    ObjectIcon,
    ComponentIcon,
    ServiceIcon,
    InterfaceIcon,
    NodeIcon,
    DeviceIcon,
    GoalIcon,
    RequirementIcon,
    GroupIcon,
    DefaultIcon
} from './archimate-icons';

interface ArchiMateToolViewerProps {
    thing: CanvasThing;
}

// Helper to assign Archimate standard colors and icons based on element type
function getArchimateStyle(type: string): { bg: string, border: string, icon: React.ReactNode } {
    const t = (type || "").toLowerCase();
    
    let icon = <DefaultIcon className="w-3 h-3 opacity-60" />;
    
    // Business Layer (Yellow)
    if (t.includes('business') || t.includes('actor') || t.includes('role') || t.includes('process') || t.includes('function') || t.includes('event')) {
        if (t.includes('actor')) icon = <ActorIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('role')) icon = <RoleIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('process')) icon = <ProcessIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('function')) icon = <FunctionIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('event')) icon = <EventIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('object') || t.includes('representation')) icon = <ObjectIcon className="w-3 h-3 opacity-60" />;
        return { bg: '#ffffcc', border: '#e6e600', icon };
    }
    // Application Layer (Blue/Cyan)
    if (t.includes('application') || t.includes('component') || t.includes('interface')) {
        if (t.includes('component')) icon = <ComponentIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('service')) icon = <ServiceIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('interface')) icon = <InterfaceIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('object') || t.includes('data')) icon = <ObjectIcon className="w-3 h-3 opacity-60" />;
        return { bg: '#cce6ff', border: '#3399ff', icon };
    }
    // Technology Layer (Green)
    if (t.includes('technology') || t.includes('node') || t.includes('device') || t.includes('infrastructure') || t.includes('network')) {
        if (t.includes('node')) icon = <NodeIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('device')) icon = <DeviceIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('service')) icon = <ServiceIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('interface')) icon = <InterfaceIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('object') || t.includes('artifact')) icon = <ObjectIcon className="w-3 h-3 opacity-60" />;
        return { bg: '#ccffcc', border: '#33cc33', icon };
    }
    // Strategy/Motivation (Purple/Lavender)
    if (t.includes('goal') || t.includes('outcome') || t.includes('principle') || t.includes('requirement') || t.includes('capability') || t.includes('courseofaction')) {
        if (t.includes('goal') || t.includes('objective')) icon = <GoalIcon className="w-3 h-3 opacity-60" />;
        else if (t.includes('requirement') || t.includes('principle')) icon = <RequirementIcon className="w-3 h-3 opacity-60" />;
        return { bg: '#e6ccff', border: '#9933ff', icon };
    }
    // Physical (Green)
    if (t.includes('facility') || t.includes('equipment') || t.includes('material')) {
        return { bg: '#ccffcc', border: '#33cc33', icon: <DefaultIcon className="w-3 h-3 opacity-60" /> };
    }
    // Groups
    if (t === 'group') {
        return { bg: '#f9f9f9', border: '#cccccc', icon: <GroupIcon className="w-3 h-3 opacity-60 text-slate-400" /> };
    }

    // Default/Unknown
    return { bg: '#f1f5f9', border: '#cbd5e1', icon };
}

// Custom Node for rendering ArchiMate elements in the nested ReactFlow
const ArchimateFlowElement = ({ data }: { data: { node: ArchimateNodeData, isContainer: boolean } }) => {
    const n = data.node;
    const style = getArchimateStyle(n.type);
    const isGroup = n.type === 'Group';
    const isContainer = data.isContainer;

    return (
        <div 
            className={cn(
                "flex p-2 text-xs rounded-sm shadow-sm hover:shadow-md transition-shadow w-full h-full cursor-default relative pointer-events-auto",
                isGroup ? "items-start justify-start border-dashed bg-opacity-30 border-2" : 
                isContainer ? "items-start justify-start border-solid border pl-2 pt-1" :
                "items-center justify-center border-solid border text-center"
            )}
            style={{
                backgroundColor: isGroup ? 'transparent' : style.bg,
                borderColor: style.border,
                color: '#333333',
                fontFamily: 'sans-serif',
                lineHeight: 1.2,
                overflow: 'hidden',
            }}
            title={`${n.name}\n[${n.type}]`}
        >
            {/* Invisible handles for edges to connect to */}
            <Handle type="target" position={Position.Top} className="opacity-0 w-full h-full absolute inset-0 !transform-none !border-0 !bg-transparent" />
            <Handle type="source" position={Position.Bottom} className="opacity-0 w-full h-full absolute inset-0 !transform-none !border-0 !bg-transparent" />

            <div className={cn("w-full break-words relative z-10", isGroup ? "font-semibold text-slate-500 ml-5" : isContainer ? "font-medium" : "line-clamp-3 px-3")}>
                {n.name}
            </div>
            <div className="absolute top-1 right-1 pointer-events-none z-10">
                {style.icon}
            </div>
        </div>
    );
};

const nodeTypes = {
    archimate: ArchimateFlowElement
};

export function ArchiMateToolViewer({ thing }: ArchiMateToolViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    const accessLevel = useCanvasStore(state => state.accessLevel);
    const isReadOnly = accessLevel === "read";
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasData = thing.content && thing.content.archimateData;
    const parsedData = hasData as ParsedArchimate;

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            
            try {
                const parsed = await parseArchimateXml(text);
                updateThing(thing.id, {
                    content: { ...thing.content, archimateData: parsed },
                    title: file.name
                });
            } catch (err) {
                console.error("Failed to parse Archimate XML:", err);
                alert("Failed to parse the file. Please ensure it is a valid Archi export.");
            }
        };
        reader.readAsText(file);
    };

    // Map parsed data to ReactFlow nodes and edges
    const { nodes, edges } = useMemo(() => {
        if (!parsedData?.diagrams || parsedData.diagrams.length === 0) return { nodes: [], edges: [] };

        const allNodes = parsedData.diagrams[0].nodes;
        
        const flowNodes: RFNode[] = allNodes.map(n => {
            // Check if this node is a container (contains other nodes)
            const hasChildren = allNodes.some(child => 
                child.id !== n.id &&
                child.bounds && n.bounds &&
                child.bounds.x >= n.bounds.x &&
                child.bounds.y >= n.bounds.y &&
                child.bounds.x + child.bounds.width <= n.bounds.x + n.bounds.width &&
                child.bounds.y + child.bounds.height <= n.bounds.y + n.bounds.height
            );

            return {
                id: n.id,
                type: 'archimate',
                position: { x: n.bounds?.x || 0, y: n.bounds?.y || 0 },
                style: { width: n.bounds?.width || 120, height: n.bounds?.height || 55 },
                data: { node: n, isContainer: hasChildren || n.type === 'Group' },
                draggable: false, // Prevent dragging inside the canvas to keep standard layout
                selectable: true
            };
        });

        const flowEdges: RFEdge[] = parsedData.diagrams[0].edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'straight',
            markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 15,
                height: 15,
                color: '#64748b'
            },
            style: { stroke: '#64748b', strokeWidth: 1.5 }
        }));

        return { nodes: flowNodes, edges: flowEdges };
    }, [parsedData]);

    return (
        <div className="flex flex-col w-full h-full bg-slate-100 dark:bg-slate-950">
            {/* Using nowheel to stop the outer canvas from zooming, but custom noWheelClassName on inner so it still zooms! */}
            <div className="flex-1 relative nodrag nowheel">
                {!hasData ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 p-4">
                        <UploadCloud className="h-10 w-10 text-slate-300" />
                        <div className="text-center">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No Diagram Loaded</p>
                            <p className="text-xs text-slate-500 mt-1">Upload an .xml or .archimate file</p>
                        </div>
                        <input
                            type="file"
                            accept=".xml,.archimate"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                        />
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isReadOnly}
                        >
                            Select File
                        </Button>
                    </div>
                ) : nodes.length > 0 ? (
                    <ReactFlowProvider>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            nodeTypes={nodeTypes}
                            fitView
                            minZoom={0.1}
                            maxZoom={4}
                            nodesDraggable={false}
                            panOnScroll={false}
                            zoomOnScroll={true}
                            noWheelClassName="custom-nowheel"
                        >
                            <Background color="#ccc" gap={16} />
                            <Controls position="bottom-right" />
                            <MiniMap 
                                position="bottom-left" 
                                pannable={true}
                                zoomable={true}
                                nodeColor={(n) => {
                                    if (n.type === 'Group') return '#f9f9f9';
                                    return '#e2e8f0'; // default minimap color
                                }} 
                                maskColor="rgba(0,0,0, 0.1)" 
                            />
                            <div className="absolute top-2 left-2 text-sm font-semibold text-slate-600 bg-white/80 dark:bg-slate-800/80 px-2 py-1 rounded shadow-sm z-10 backdrop-blur-sm pointer-events-none">
                                {parsedData.diagrams[0].name}
                            </div>
                        </ReactFlow>
                    </ReactFlowProvider>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                        <p className="text-sm">No diagrams found in this file.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
