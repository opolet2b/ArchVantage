import React, { useRef, useMemo, useEffect } from 'react';
import { UploadCloud, Link as LinkIcon, Search, ChevronUp, ChevronDown, X, HelpCircle } from 'lucide-react';
import { useCanvasStore, CanvasThing } from '../canvas-store';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { parseArchimateXml, ParsedArchimate, ArchimateNodeData } from '../services/archimate-parser';
import { cn } from '@/lib/utils';
import ReactFlow, { Background, Controls, MiniMap, Node as RFNode, Edge as RFEdge, ReactFlowProvider, MarkerType, Handle, Position, useUpdateNodeInternals, Panel, useReactFlow } from 'reactflow';
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
    links?: any[];
    onSelect?: (fragment: any, position: { x: number; y: number }) => void;
}

const HighlightedText = ({ text, highlight }: { text?: string; highlight?: string }) => {
    if (!text) return null;
    if (!highlight || !highlight.trim()) return <>{text}</>;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <mark key={i} className="bg-yellow-200 text-slate-900 rounded-sm px-0.5">{part}</mark>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    );
};

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
const ArchimateFlowElement = ({ data }: { data: { node: ArchimateNodeData, isContainer: boolean, isLinked: boolean, isSearchHighlighted?: boolean, isCurrentSearchResult?: boolean, searchQuery?: string } }) => {
    const n = data.node;
    const style = getArchimateStyle(n.type);
    const isGroup = n.type === 'Group';
    const isContainer = data.isContainer;
    const isLinked = data.isLinked;
    const isCurrentSearchResult = data.isCurrentSearchResult;
    const isSearchHighlighted = data.isSearchHighlighted;

    return (
        <div 
            className={cn(
                "flex p-2 text-xs rounded-sm shadow-sm transition-all w-full h-full cursor-default relative pointer-events-auto",
                isGroup ? "items-start justify-start border-dashed bg-opacity-30 border-2" : 
                isContainer ? "items-start justify-start border-solid border pl-2 pt-1" :
                "items-center justify-center border-solid border text-center",
                isCurrentSearchResult ? "ring-2 ring-blue-500 ring-offset-2 z-50 shadow-md" : "hover:shadow-md",
                isSearchHighlighted && !isCurrentSearchResult ? "ring-1 ring-blue-300 ring-offset-1" : ""
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
                <HighlightedText text={n.name} highlight={data.searchQuery} />
            </div>
            <div className="absolute top-1 right-1 pointer-events-none z-10 flex gap-1">
                {isLinked && (
                    <div className="bg-blue-500 text-white rounded-full p-0.5 shadow-sm" title="This element has a semantic link">
                        <LinkIcon className="w-2.5 h-2.5" />
                    </div>
                )}
                {style.icon}
            </div>
        </div>
    );
};

const nodeTypes = {
    archimate: ArchimateFlowElement
};

function TopToolbar({
    searchQuery, setSearchQuery, searchResults, currentSearchIndex, setCurrentSearchIndex, setSelectedNodeId, activeDiagramId, setActiveDiagramId,
    parsedData, activeDiagram, isReadOnly, fileInputRef,
    impactModeEnabled, setImpactModeEnabled, setImpactAnalysis, calculateImpact, selectedNodeId
}: {
    searchQuery: string, setSearchQuery: (q: string) => void, searchResults: {diagramId: string, nodeId: string}[], currentSearchIndex: number, setCurrentSearchIndex: (i: number) => void, setSelectedNodeId: (id: string | null) => void, activeDiagramId: string | null, setActiveDiagramId: (id: string | null) => void,
    parsedData: ParsedArchimate, activeDiagram: any, isReadOnly: boolean, fileInputRef: React.RefObject<HTMLInputElement>,
    impactModeEnabled: boolean, setImpactModeEnabled: (b: boolean) => void, setImpactAnalysis: any, calculateImpact: (id: string) => void, selectedNodeId: string | null
}) {
    const reactFlow = useReactFlow();
    const [pendingFocusNodeId, setPendingFocusNodeId] = React.useState<string | null>(null);

    const handleNext = () => {
        if (searchResults.length === 0) return;
        const nextIndex = (currentSearchIndex + 1) % searchResults.length;
        setCurrentSearchIndex(nextIndex);
        focusResult(searchResults[nextIndex]);
    };

    const handlePrev = () => {
        if (searchResults.length === 0) return;
        const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
        setCurrentSearchIndex(prevIndex);
        focusResult(searchResults[prevIndex]);
    };

    const focusResult = (result: {diagramId: string, nodeId: string}) => {
        if (result.diagramId !== activeDiagramId) {
            setActiveDiagramId(result.diagramId);
            setPendingFocusNodeId(result.nodeId);
        } else {
            focusNode(result.nodeId);
        }
    };

    const focusNode = (nodeId: string) => {
        setSelectedNodeId(nodeId);
        const node = reactFlow.getNode(nodeId);
        if (node) {
            reactFlow.setCenter(node.position.x + (node.style?.width as number || 120) / 2, node.position.y + (node.style?.height as number || 55) / 2, { zoom: 1.5, duration: 800 });
            setPendingFocusNodeId(null);
        }
    };

    React.useEffect(() => {
        if (pendingFocusNodeId) {
            setTimeout(() => {
                focusNode(pendingFocusNodeId);
            }, 100);
        }
    }, [reactFlow.getNodes(), pendingFocusNodeId]);

    React.useEffect(() => {
        if (searchResults.length > 0 && searchQuery && currentSearchIndex === 0 && !pendingFocusNodeId) {
            focusResult(searchResults[0]);
        }
    }, [searchResults, searchQuery]);

    return (
        <Panel position="top-center" className="nodrag m-2 bg-white/95 dark:bg-slate-900/95 p-1 rounded-md shadow-md border border-slate-200 dark:border-slate-800 flex items-center backdrop-blur-sm z-50 pointer-events-auto divide-x divide-slate-200 dark:divide-slate-700">
            {/* Diagram Switcher and Re-import */}
            <div className="flex items-center gap-2 px-3 py-1">
                {parsedData.diagrams && parsedData.diagrams.length > 1 && (
                    <select 
                        className="text-sm font-semibold text-slate-600 bg-transparent px-2 py-1 outline-none hover:bg-slate-50 transition-colors cursor-pointer"
                        value={activeDiagramId || ''}
                        onChange={(e) => {
                            setActiveDiagramId(e.target.value);
                            setSelectedNodeId(null);
                        }}
                    >
                        {parsedData.diagrams.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                )}
                {parsedData.diagrams && parsedData.diagrams.length === 1 && (
                    <div className="text-sm font-semibold text-slate-600 bg-transparent px-2 py-1 pointer-events-none">
                        {activeDiagram?.name}
                    </div>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isReadOnly}
                    className="h-7 px-2"
                    title="Re-import file"
                >
                    <UploadCloud className="w-4 h-4 mr-1.5" />
                    Re-import
                </Button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-1 px-3 py-1">
                <Search className="w-4 h-4 text-slate-500" />
                <Input 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            if (e.shiftKey) handlePrev();
                            else handleNext();
                        }
                    }}
                    placeholder="Search nodes..." 
                    className="h-7 text-xs border-0 focus-visible:ring-0 focus-visible:ring-offset-0 w-48 bg-transparent"
                />
                {searchResults.length > 0 && (
                    <span className="text-xs text-slate-500 whitespace-nowrap mr-1">
                        {currentSearchIndex + 1} / {searchResults.length}
                    </span>
                )}
                {searchQuery && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        setSearchQuery('');
                        setSelectedNodeId(null);
                    }}>
                        <X className="w-3 h-3" />
                    </Button>
                )}
                <div className="flex flex-col ml-1">
                    <Button variant="ghost" size="icon" className="h-4 w-5 rounded-none rounded-t-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800" onClick={handlePrev} disabled={searchResults.length === 0}>
                        <ChevronUp className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-4 w-5 rounded-none rounded-b-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800" onClick={handleNext} disabled={searchResults.length === 0}>
                        <ChevronDown className="w-3 h-3" />
                    </Button>
                </div>
            </div>

            {/* Impact Analysis */}
            <div className="flex items-center gap-3 px-3 py-1">
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                        <Label htmlFor="archimate-impact-mode" className="text-xs font-bold cursor-pointer text-blue-600 dark:text-blue-400">
                            Impact Analysis
                        </Label>
                        <TooltipProvider>
                            <Tooltip delayDuration={100}>
                                <TooltipTrigger asChild>
                                    <span className="inline-flex cursor-help">
                                        <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs z-[9999]" side="bottom" sideOffset={5}>
                                    <p>When enabled, clicking a node will recursively trace and highlight all connected nodes and edges, helping visualize downstream and upstream dependencies.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-0.5">Click to trace dependencies</span>
                </div>
                <Switch 
                    id="archimate-impact-mode"
                    checked={impactModeEnabled}
                    onCheckedChange={(c) => {
                        setImpactModeEnabled(c);
                        if (!c) setImpactAnalysis({ active: false, nodeIds: new Set(), edgeIds: new Set() });
                        else if (selectedNodeId) calculateImpact(selectedNodeId);
                    }}
                    className="scale-75"
                />
            </div>
        </Panel>
    );
}

export function ArchiMateToolViewer({ thing, links, onSelect }: ArchiMateToolViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    const accessLevel = useCanvasStore(state => state.accessLevel);
    const highlightedFragment = useCanvasStore(state => state.highlightedFragment);
    const isReadOnly = accessLevel === "read";
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [activeDiagramId, setActiveDiagramId] = React.useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<{diagramId: string, nodeId: string}[]>([]);
    const [currentSearchIndex, setCurrentSearchIndex] = React.useState(0);

    const [impactModeEnabled, setImpactModeEnabled] = React.useState(false);
    const [impactAnalysis, setImpactAnalysis] = React.useState<{
        active: boolean;
        nodeIds: Set<string>;
        edgeIds: Set<string>;
    }>({ active: false, nodeIds: new Set(), edgeIds: new Set() });

    const hasData = thing.content && thing.content.archimateData;
    const parsedData = hasData as ParsedArchimate;

    const updateNodeInternals = useUpdateNodeInternals();
    const [innerViewport, setInnerViewport] = React.useState({ x: 0, y: 0, zoom: 1 });

    const linkedFragments = React.useMemo(() => {
        if (!links) return [];
        const frags: any[] = [];
        links.forEach(l => {
            if (l.source_id === thing.id && l.source_fragment?.type === "archimate_node") {
                frags.push(l.source_fragment);
            }
            if (l.target_id === thing.id && l.target_fragment?.type === "archimate_node") {
                frags.push(l.target_fragment);
            }
        });
        return frags;
    }, [links, thing.id]);

    // Update outer node internals when links change so React Flow finds any new dynamic handles
    React.useEffect(() => {
        updateNodeInternals(thing.id);
    }, [links, thing.id, updateNodeInternals]);

    // Default to the first diagram when data loads
    React.useEffect(() => {
        if (parsedData?.diagrams && parsedData.diagrams.length > 0) {
            if (!activeDiagramId || !parsedData.diagrams.find(d => d.id === activeDiagramId)) {
                setActiveDiagramId(parsedData.diagrams[0].id);
            }
        }
    }, [parsedData, activeDiagramId]);

    const activeDiagram = useMemo(() => {
        return parsedData?.diagrams?.find(d => d.id === activeDiagramId) || parsedData?.diagrams?.[0];
    }, [parsedData, activeDiagramId]);

    // Search effect
    React.useEffect(() => {
        if (!searchQuery.trim() || !parsedData?.diagrams) {
            setSearchResults([]);
            setCurrentSearchIndex(0);
            return;
        }
        const q = searchQuery.toLowerCase();
        const results: {diagramId: string, nodeId: string}[] = [];
        
        parsedData.diagrams.forEach(d => {
            d.nodes.forEach(n => {
                if (n.name?.toLowerCase().includes(q) || 
                    n.documentation?.toLowerCase().includes(q) ||
                    n.properties?.some(p => p.key?.toLowerCase().includes(q) || p.value?.toLowerCase().includes(q))) {
                    results.push({ diagramId: d.id, nodeId: n.id });
                }
            });
        });
        
        setSearchResults(results);
        setCurrentSearchIndex(0);
    }, [searchQuery, parsedData]);

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
                setActiveDiagramId(null);
                setSelectedNodeId(null);
                setSearchQuery('');
            } catch (err) {
                console.error("Failed to parse Archimate XML:", err);
                alert("Failed to parse the file. Please ensure it is a valid Archi export.");
            }
        };
        reader.readAsText(file);
    };

    const calculateImpact = React.useCallback((startNodeId: string) => {
        if (!activeDiagram) return;
        const connectedNodes = new Set<string>([startNodeId]);
        const connectedEdges = new Set<string>();
        
        let newlyAdded = [startNodeId];
        
        while (newlyAdded.length > 0) {
            const nextBatch: string[] = [];
            
            activeDiagram.edges.forEach(edge => {
                if (newlyAdded.includes(edge.source) && !connectedNodes.has(edge.target)) {
                    connectedEdges.add(edge.id);
                    connectedNodes.add(edge.target);
                    nextBatch.push(edge.target);
                }
                if (newlyAdded.includes(edge.target) && !connectedNodes.has(edge.source)) {
                    connectedEdges.add(edge.id);
                    connectedNodes.add(edge.source);
                    nextBatch.push(edge.source);
                }
            });
            
            newlyAdded = nextBatch;
        }
        
        setImpactAnalysis({
            active: true,
            nodeIds: connectedNodes,
            edgeIds: connectedEdges
        });
    }, [activeDiagram]);

    // Map parsed data to ReactFlow nodes and edges
    const { nodes, edges } = useMemo(() => {
        if (!activeDiagram) return { nodes: [], edges: [] };

        const allNodes = activeDiagram.nodes;
        
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

            const isImpactHighlighted = impactAnalysis.active ? impactAnalysis.nodeIds.has(n.id) : true;
            const isSearchHighlighted = searchQuery.trim() !== '' ? searchResults.some(r => r.nodeId === n.id && r.diagramId === activeDiagramId) : false;
            
            let opacity = 1;
            if (impactAnalysis.active && searchQuery.trim() !== '') {
                opacity = (isImpactHighlighted && isSearchHighlighted) ? 1 : 0.2;
            } else if (impactAnalysis.active) {
                opacity = isImpactHighlighted ? 1 : 0.2;
            } else if (searchQuery.trim() !== '') {
                opacity = isSearchHighlighted ? 1 : 0.2;
            }

            return {
                id: n.id,
                type: 'archimate',
                position: { x: n.bounds?.x || 0, y: n.bounds?.y || 0 },
                style: { 
                    width: n.bounds?.width || 120, 
                    height: n.bounds?.height || 55,
                    opacity: opacity,
                    transition: 'opacity 0.3s ease'
                },
                data: { 
                    node: n, 
                    isContainer: hasChildren || n.type === 'Group',
                    isLinked: linkedFragments.some(f => f.nodeId === n.id),
                    isSearchHighlighted,
                    isCurrentSearchResult: searchResults[currentSearchIndex]?.nodeId === n.id && searchResults[currentSearchIndex]?.diagramId === activeDiagramId,
                    searchQuery
                },
                draggable: false, // Prevent dragging inside the canvas to keep standard layout
                selectable: true
            };
        });

        const flowEdges: RFEdge[] = activeDiagram.edges.map(e => {
            const isImpactHighlighted = impactAnalysis.active ? impactAnalysis.edgeIds.has(e.id) : true;
            
            // For edges, we primarily care about impact highlighting, search doesn't highlight edges
            // but if search is active and impact is active, we just follow impact.
            // If only search is active, we just dim edges to make nodes pop, or leave them as is. Let's leave them or dim them.
            const isHighlighted = isImpactHighlighted;
            
            let opacity = 1;
            if (impactAnalysis.active) {
                opacity = isHighlighted ? 1 : 0.3;
            } else if (searchQuery.trim() !== '') {
                opacity = 0.4;
            }

            return {
                id: e.id,
                source: e.source,
                target: e.target,
                type: 'straight',
                animated: impactAnalysis.active && isHighlighted,
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 15,
                    height: 15,
                    color: impactAnalysis.active ? (isHighlighted ? '#3b82f6' : '#cbd5e1') : '#64748b'
                },
                style: { 
                    stroke: impactAnalysis.active ? (isHighlighted ? '#3b82f6' : '#cbd5e1') : '#64748b', 
                    strokeWidth: impactAnalysis.active && isHighlighted ? 2.5 : 1.5,
                    transition: 'stroke 0.3s, stroke-width 0.3s, opacity 0.3s',
                    opacity: opacity
                }
            };
        });

        return { nodes: flowNodes, edges: flowEdges };
    }, [activeDiagram, linkedFragments, impactAnalysis, searchQuery, searchResults, currentSearchIndex]);

    const selectedNodeData = useMemo(() => {
        if (!selectedNodeId || !activeDiagram) return null;
        return activeDiagram.nodes.find(n => n.id === selectedNodeId);
    }, [selectedNodeId, activeDiagram]);

    const getHighlightRect = React.useCallback(() => {
        if (!highlightedFragment || highlightedFragment.thingId !== thing.id) return null;
        if (highlightedFragment.fragment.type !== "archimate_node") return null;

        const nodeId = (highlightedFragment.fragment as any).nodeId;
        const innerNode = nodes.find(n => n.id === nodeId);
        if (!innerNode) return null;

        const x = (innerNode.position.x) * innerViewport.zoom + innerViewport.x;
        const y = (innerNode.position.y) * innerViewport.zoom + innerViewport.y;
        const width = (innerNode.style?.width as number || 120) * innerViewport.zoom;
        const height = (innerNode.style?.height as number || 55) * innerViewport.zoom;

        return { x, y, width, height };
    }, [highlightedFragment, thing.id, nodes, innerViewport]);

    return (
        <div className="flex flex-col w-full h-full bg-slate-100 dark:bg-slate-950 relative">
            {/* Highlight overlay for selected/linked fragments */}
            {highlightedFragment && highlightedFragment.thingId === thing.id && getHighlightRect() && (
                <div 
                    className="absolute border-2 border-red-500 bg-red-500/20 pointer-events-none z-50 transition-all duration-300"
                    style={{
                        left: `${getHighlightRect()?.x}px`,
                        top: `${getHighlightRect()?.y}px`,
                        width: `${getHighlightRect()?.width}px`,
                        height: `${getHighlightRect()?.height}px`,
                    }}
                />
            )}
            
            {/* Using nowheel to stop the outer canvas from zooming, but custom noWheelClassName on inner so it still zooms! */}
            <input
                type="file"
                accept=".xml,.archimate"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
            />
            <div className="flex-1 relative nodrag nowheel overflow-hidden flex">
                    {!hasData ? (
                        <div className="flex flex-col items-center justify-center w-full h-full gap-4 text-slate-500 p-4">
                            <UploadCloud className="h-10 w-10 text-slate-300" />
                            <div className="text-center">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No Diagram Loaded</p>
                                <p className="text-xs text-slate-500 mt-1">Upload an .xml or .archimate file</p>
                            </div>
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
                        <>
                            <div className="flex-1 h-full relative">
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
                                        onNodeClick={(_, node) => {
                                            setSelectedNodeId(node.id);
                                            if (impactModeEnabled) {
                                                calculateImpact(node.id);
                                            }
                                        }}
                                        onPaneClick={() => {
                                            setSelectedNodeId(null);
                                            if (impactModeEnabled) {
                                                setImpactAnalysis({ active: false, nodeIds: new Set(), edgeIds: new Set() });
                                            }
                                        }}
                                        onMove={(event, viewport) => {
                                            setInnerViewport(prev => {
                                                if (prev.x === viewport.x && prev.y === viewport.y && prev.zoom === viewport.zoom) {
                                                    return prev;
                                                }
                                                return viewport;
                                            });
                                        }}
                                    >
                                        <Background color="#ccc" gap={16} />
                                        <Controls position="bottom-right" />
                                        <MiniMap 
                                            position="bottom-left" 
                                            pannable={true}
                                            zoomable={true}
                                            nodeColor={(n) => {
                                                if (n.type === 'Group') return '#f9f9f9';
                                                return '#e2e8f0'; 
                                            }} 
                                            maskColor="rgba(0,0,0, 0.1)" 
                                        />
                                        <TopToolbar 
                                            searchQuery={searchQuery}
                                            setSearchQuery={setSearchQuery}
                                            searchResults={searchResults}
                                            currentSearchIndex={currentSearchIndex}
                                            setCurrentSearchIndex={setCurrentSearchIndex}
                                            setSelectedNodeId={setSelectedNodeId}
                                            activeDiagramId={activeDiagramId}
                                            setActiveDiagramId={setActiveDiagramId}
                                            parsedData={parsedData}
                                            activeDiagram={activeDiagram}
                                            isReadOnly={isReadOnly}
                                            fileInputRef={fileInputRef}
                                            impactModeEnabled={impactModeEnabled}
                                            setImpactModeEnabled={setImpactModeEnabled}
                                            setImpactAnalysis={setImpactAnalysis}
                                            calculateImpact={calculateImpact}
                                            selectedNodeId={selectedNodeId}
                                        />
                                    </ReactFlow>
                                </ReactFlowProvider>

                            </div>

                        {/* Right Side Properties Panel */}
                        {selectedNodeData && (
                            <div className="w-80 h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-20 flex flex-col overflow-hidden animate-in slide-in-from-right-8 pointer-events-auto">
                                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-between items-start gap-2">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg leading-tight mb-1">
                                            <HighlightedText text={selectedNodeData.name || 'Unnamed Element'} highlight={searchQuery} />
                                        </h3>
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                                            {getArchimateStyle(selectedNodeData.type).icon}
                                            {selectedNodeData.type}
                                        </div>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        className="shrink-0 h-8 text-xs font-medium bg-white"
                                        onClick={(e) => {
                                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                                            if (onSelect) {
                                                onSelect({
                                                    type: 'archimate_node',
                                                    nodeId: selectedNodeData.id,
                                                    nodeName: selectedNodeData.name,
                                                    nodeType: selectedNodeData.type
                                                }, { x: rect.left, y: rect.top - 10 });
                                            }
                                        }}
                                    >
                                        <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
                                        Select
                                    </Button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar text-sm text-slate-700 dark:text-slate-300">
                                    {selectedNodeData.documentation ? (
                                        <div className="mb-6">
                                            <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Documentation</h4>
                                            <div className="whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 p-3 rounded text-slate-700 dark:text-slate-300">
                                                <HighlightedText text={selectedNodeData.documentation} highlight={searchQuery} />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mb-6 italic text-slate-400">No documentation provided.</div>
                                    )}

                                    {selectedNodeData.properties && selectedNodeData.properties.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Properties</h4>
                                            <div className="flex flex-col gap-2">
                                                {selectedNodeData.properties.map((p, i) => (
                                                    <div key={i} className="flex flex-col bg-slate-50 dark:bg-slate-800/50 p-2 rounded">
                                                        <span className="text-xs font-medium text-slate-500">
                                                            <HighlightedText text={p.key} highlight={searchQuery} />
                                                        </span>
                                                        <span className="font-medium text-slate-900 dark:text-slate-100">
                                                            <HighlightedText text={p.value} highlight={searchQuery} />
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
                        <p className="text-sm">No diagrams found in this file.</p>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isReadOnly}
                        >
                            Select Another File
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
