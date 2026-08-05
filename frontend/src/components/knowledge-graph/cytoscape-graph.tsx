import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw, ZoomIn, ZoomOut, Expand, Loader2, RefreshCcw, Shrink, Layers, Scan, Network, Filter, Database, Grid3x3, Target, Search, Route, GripHorizontal, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import CytoscapeComponent from 'react-cytoscapejs';
import { AdjacencyMatrix } from "./adjacency-matrix";
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { API_URL } from "@/lib/utils"
import { MultiSelect, type Option } from "@/components/ui/multi-select"
import { type KnowledgeSource } from "./source-manager"

cytoscape.use(dagre);

interface CytoscapeGraphProps {
    kbId?: string;
    ingestionStatus?: string;
    sources?: KnowledgeSource[];
    ontologyClasses?: string[];
}

export function CytoscapeGraph({ kbId, ingestionStatus, sources = [], ontologyClasses = [] }: CytoscapeGraphProps) {
    const [elements, setElements] = useState<any[]>([])
    const [metadata, setMetadata] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [perspective, setPerspective] = useState<"relational" | "hierarchical" | "matrix" | "focus">("relational")
    const [isLensActive, setIsLensActive] = useState(false)
    const [isBundled, setIsBundled] = useState(false)
    const [selectedSourceFilters, setSelectedSourceFilters] = useState<string[]>([])
    const [appliedSourceFilters, setAppliedSourceFilters] = useState<string[]>([])

    // Taxonomy Filters
    const [selectedOntologyFilters, setSelectedOntologyFilters] = useState<string[]>(ontologyClasses)
    const [appliedOntologyFilters, setAppliedOntologyFilters] = useState<string[]>(ontologyClasses)

    const [highlightedTypes, setHighlightedTypes] = useState<string[]>([])
    const [stepperIndices, setStepperIndices] = useState<Record<string, number>>({})
    const [isLegendExpanded, setIsLegendExpanded] = useState(true)
    const [legendOffset, setLegendOffset] = useState({ x: 0, y: 0 })
    const [selectedNode, setSelectedNode] = useState<any>(null)
    const cyRef = useRef<any>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Map sources to options for multi-select
    const sourceOptions: Option[] = sources.map(src => ({
        label: src.name || src.id,
        // The value should be the URI prefix used for filtering
        value: src.type === 'url' ? src.config.url : src.config.path
    })).filter(opt => opt.value); // ensure value exists

    const fetchGraph = useCallback(async () => {
        if (!kbId) return;
        setIsLoading(true)
        try {
            const backendPerspective = perspective === "matrix" ? "relational" : perspective;
            let url = `${API_URL}/knowledge/kb/${kbId}/graph?perspective=${backendPerspective}`;

            // Add source filters to URL
            if (appliedSourceFilters.length > 0) {
                appliedSourceFilters.forEach(src => {
                    url += `&sources=${encodeURIComponent(src)}`;
                });
            }

            // Add ontology class filters to URL
            if (appliedOntologyFilters.length > 0) {
                appliedOntologyFilters.forEach(cls => {
                    url += `&classes=${encodeURIComponent(cls)}`;
                });
            } else if (ontologyClasses.length > 0) {
                // If nothing is explicitly applied but classes exist, pass a dummy to ensure it returns empty
                url += `&classes=--NONE--`
            }

            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                }
            })
            if (res.ok) {
                const data = await res.json()

                // Color generator based on string
                const getColor = (str: string) => {
                    let hash = 0;
                    for (let i = 0; i < str.length; i++) {
                        hash = str.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
                    return '#' + '00000'.substring(0, 6 - c.length) + c;
                };

                // Add colors to nodes
                const processedElements = (data.elements || []).map((el: any) => {
                    if (el.group === 'nodes') {
                        // Apply fixed colors if they came from backend (source/type nodes), otherwise generate
                        const color = el.data.color || getColor(el.data.type || 'Entity');
                        return {
                            ...el,
                            data: {
                                ...el.data,
                                color: color
                            }
                        };
                    }
                    return el;
                });

                setElements(processedElements)
                setMetadata(data.metadata || null)
                setSelectedNode(null) // Reset selection when graph reloads
                setHighlightedTypes([]) // Reset highlights
            }
        } catch (error) {
            console.error("Failed to fetch graph", error)
        } finally {
            setIsLoading(false)
        }
    }, [kbId, perspective, appliedSourceFilters, appliedOntologyFilters, ontologyClasses]);

    // Synchronize initial filters when ontologyClasses prop is loaded or updated
    useEffect(() => {
        if (ontologyClasses.length > 0) {
            if (appliedOntologyFilters.length === 0 && selectedOntologyFilters.length === 0) {
                // Initial load
                setSelectedOntologyFilters(ontologyClasses);
                setAppliedOntologyFilters(ontologyClasses);
            } else {
                // Merge any newly added classes that aren't in the filters yet
                const newClasses = ontologyClasses.filter(c => !appliedOntologyFilters.includes(c) && !selectedOntologyFilters.includes(c));
                if (newClasses.length > 0) {
                    setSelectedOntologyFilters(prev => [...prev, ...newClasses]);
                    setAppliedOntologyFilters(prev => [...prev, ...newClasses]);
                }
            }
        }
    }, [ontologyClasses]);

    useEffect(() => {
        fetchGraph()
    }, [fetchGraph])

    useEffect(() => {
        if (ingestionStatus === 'completed') {
            fetchGraph()
        }
    }, [ingestionStatus, fetchGraph])

    // Calculate unique types and their colors for the Legend
    const legendItems = useMemo(() => {
        const types = new Map<string, string>();
        elements.forEach(el => {
            if (el.group === 'nodes' && el.data.type) {
                if (!types.has(el.data.type)) {
                    types.set(el.data.type, el.data.color);
                }
            }
        });
        return Array.from(types.entries()).map(([type, color]) => ({ type, color })).sort((a, b) => a.type.localeCompare(b.type));
    }, [elements]);

    const typeCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        elements.forEach(el => {
            if (el.group === 'nodes' && el.data.type) {
                counts[el.data.type] = (counts[el.data.type] || 0) + 1;
            }
        });
        return counts;
    }, [elements]);

    const handleStepperJump = useCallback((type: string, direction: 'next' | 'prev' | 'first', e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!cyRef.current) return;
        const cy = cyRef.current;
        
        const nodes = cy.nodes().filter((n: any) => n.data('type') === type);
        if (nodes.length === 0) return;
        
        const currentIndex = stepperIndices[type] || 0;
        let nextIndex = currentIndex;
        
        if (direction === 'first') {
            nextIndex = 0;
        } else if (direction === 'next') {
            nextIndex = currentIndex + 1 >= nodes.length ? 0 : currentIndex + 1;
        } else {
            nextIndex = currentIndex - 1 < 0 ? nodes.length - 1 : currentIndex - 1;
        }
        
        setStepperIndices(prev => ({ ...prev, [type]: nextIndex }));
        const targetNode = nodes[nextIndex];
        
        cy.animate({
            center: { eles: targetNode },
            zoom: 1.0, // Readably zoomed in
            duration: 600,
            easing: 'ease-out-cubic'
        });
    }, [stepperIndices]);

    useEffect(() => {
        // When selectedNode changes, the container width animates to 2/3 or full.
        // We wait for the animation to finish (roughly 300ms) then resize the cytoscape canvas.
        const timer = setTimeout(() => {
            if (cyRef.current) {
                cyRef.current.resize();
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [selectedNode]);

    // Apply Focus+Context Depth
    useEffect(() => {
        if (perspective === 'focus' && cyRef.current) {
            const cy = cyRef.current;
            let rootNode = selectedNode ? cy.getElementById(selectedNode.id) : null;
            
            if (!rootNode || rootNode.empty()) {
                let maxDegree = -1;
                cy.nodes().forEach((n: any) => {
                    const degree = n.degree(false);
                    if (degree > maxDegree) {
                        maxDegree = degree;
                        rootNode = n;
                    }
                });
            }

            if (rootNode && !rootNode.empty()) {
                const dijkstra = cy.elements().dijkstra(rootNode);
                cy.batch(() => {
                    cy.nodes().forEach((n: any) => {
                        const dist = dijkstra.distanceTo(n);
                        n.data('focus_depth', dist === Infinity ? 10 : dist);
                        
                        n.removeClass('focus-root focus-d1 focus-d2 focus-far');
                        if (dist === 0) n.addClass('focus-root');
                        else if (dist === 1) n.addClass('focus-d1');
                        else if (dist === 2) n.addClass('focus-d2');
                        else n.addClass('focus-far');
                    });
                    cy.edges().forEach((e: any) => {
                        const distS = dijkstra.distanceTo(e.source());
                        const distT = dijkstra.distanceTo(e.target());
                        e.removeClass('focus-far');
                        if (distS > 2 || distT > 2) e.addClass('focus-far');
                    });
                });
                const layout = cy.layout({
                    name: 'concentric',
                    concentric: (n: any) => 10 - (n.data('focus_depth') || 0),
                    levelWidth: () => 1,
                    spacingFactor: 1.5,
                    animate: true,
                    animationDuration: 500
                });
                layout.run();
                
                // Keep the camera zoomed in and centered on the root node
                cy.animate({
                    center: { eles: rootNode },
                    zoom: 0.8,
                    duration: 500,
                    easing: 'ease-out-cubic'
                });
            }
        }
    }, [perspective, selectedNode]);

    // Filtering Lens Effect
    useEffect(() => {
        if (!cyRef.current) return;
        const cy = cyRef.current;

        const handleMouseMove = (evt: any) => {
            if (!isLensActive) return;
            const pos = evt.position; // Logical coordinates
            const LENS_RADIUS = 250; // Radius of the spotlight
            
            cy.batch(() => {
                const inRadius = cy.nodes().filter((n: any) => {
                    const nPos = n.position();
                    const dx = nPos.x - pos.x;
                    const dy = nPos.y - pos.y;
                    return Math.sqrt(dx * dx + dy * dy) <= LENS_RADIUS;
                });
                
                cy.elements().removeClass('lens-focus lens-faded');
                
                if (inRadius.length > 0) {
                    cy.elements().addClass('lens-faded');
                    inRadius.removeClass('lens-faded').addClass('lens-focus');
                    // Ensure edges connected to focused nodes are visible
                    inRadius.connectedEdges().removeClass('lens-faded');
                } else {
                    cy.elements().addClass('lens-faded'); // Fade all if none in radius
                }
            });
        };

        if (isLensActive) {
            cy.on('mousemove', handleMouseMove);
            cy.elements().addClass('lens-faded'); // Start heavily faded
            
            // Clean up selections/fades from other modes
            cy.elements().removeClass('faded');
            setSelectedNode(null);
        } else {
            cy.off('mousemove', handleMouseMove);
            cy.elements().removeClass('lens-focus lens-faded');
        }

        return () => {
            cy.off('mousemove', handleMouseMove);
        };
    }, [isLensActive]);

    // Interactive Legend / Highlight Logic
    useEffect(() => {
        if (!cyRef.current) return;
        const cy = cyRef.current;
        
        if (highlightedTypes.length === 0) {
            cy.elements().removeClass('legend-faded legend-focus');
            return;
        }

        cy.batch(() => {
            // Drop opacity of everything first
            cy.elements().addClass('legend-faded');
            
            // Find nodes of selected types
            const focusedNodes = cy.nodes().filter((n: any) => highlightedTypes.includes(n.data('type')));
            focusedNodes.removeClass('legend-faded').addClass('legend-focus');
            
            // Highlight edges between two focused nodes, or all connected edges?
            // To provide context, highlighting their immediate edges is best.
            focusedNodes.connectedEdges().removeClass('legend-faded');
        });
        
        // Clean up on unmount or if dependencies change
        return () => {
            cy.elements().removeClass('legend-faded legend-focus');
        };
    }, [highlightedTypes, elements]);

    const handleAutoDive = useCallback((cy: cytoscape.Core) => {
        if (perspective === 'focus') return;
        if (cy.zoom() < 0.5) {
            const rootNode = cy.nodes().max((n: any) => n.degree(false)).ele;
            if (rootNode && !rootNode.empty()) {
                cy.animate({
                    center: { eles: rootNode },
                    zoom: 0.8,
                    duration: 800,
                    easing: 'ease-out-cubic'
                });
            }
        }
    }, [perspective]);

    // Auto-dive into large graphs to prevent microscopic zoom
    useEffect(() => {
        if (!cyRef.current || perspective === 'focus') return;
        const cy = cyRef.current;
        
        // Wait for react-cytoscapejs to finish its automatic fit
        const timer = setTimeout(() => {
            handleAutoDive(cy);
        }, 400); // Allow layout to settle

        return () => clearTimeout(timer);
    }, [perspective, elements, isLoading, handleAutoDive]);

    const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)
    const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)
    const handleFit = () => cyRef.current?.fit()

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
        // Add a slight delay to allow CSS transition before fitting the graph
        setTimeout(() => {
            if (cyRef.current && !cyRef.current.destroyed()) {
                try {
                    cyRef.current.resize();
                    if (perspective === 'focus') {
                        const rootNode = cyRef.current.nodes('.focus-root');
                        if (rootNode && !rootNode.empty()) {
                            cyRef.current.animate({
                                center: { eles: rootNode },
                                zoom: 0.8,
                                duration: 500,
                                easing: 'ease-out-cubic'
                            });
                        } else {
                            cyRef.current.fit();
                        }
                    } else {
                        cyRef.current.fit();
                        handleAutoDive(cyRef.current);
                    }
                } catch (e) {
                    console.warn("Cytoscape resize/fit aborted:", e);
                }
            }
        }, 100);
    }

    // Placeholder for Lazy Update Trigger
    const handleLazyUpdate = async (nodeId: string) => {
        console.log(`Triggering Lazy Update for Node: ${nodeId}`)
        // const res = await fetch(`/api/v1/knowledge/lazy-update`, { ... })
    }

    const cyStylesheet = useMemo(() => [
        {
            selector: 'node',
            style: {
                'label': 'data(label)',
                'background-color': 'data(color)',
                'color': '#1e293b',
                'font-size': '10px',
                'width': '24px',
                'height': '24px',
                'text-wrap': 'wrap',
                'text-max-width': '120px',
                'text-valign': 'bottom',
                'text-margin-y': 6,
                'text-halign': 'center',
                'text-background-opacity': 0.8,
                'text-background-color': '#ffffff',
                'text-background-padding': '2px',
                'text-background-shape': 'roundrectangle',
                'border-width': 2,
                'border-color': '#ffffff',
                'transition-property': 'opacity, width, height, font-size, border-width',
                'transition-duration': 300
            }
        },
        {
            selector: 'edge',
            style: {
                'label': 'data(label)',
                'width': 1.5,
                'line-color': '#94a3b8',
                'target-arrow-color': '#94a3b8',
                'target-arrow-shape': 'triangle',
                'curve-style': isBundled ? 'taxi' : 'bezier',
                'taxi-direction': 'auto',
                'taxi-turn': '15px',
                'taxi-turn-min-distance': '5px',
                'font-size': '9px',
                'text-rotation': 'autorotate',
                'text-background-opacity': 0.8,
                'text-background-color': '#ffffff',
                'text-background-padding': '1px',
                'color': '#64748b',
                'transition-property': 'opacity, width',
                'transition-duration': 300
            }
        },
        {
            selector: 'node.zoom-low',
            style: {
                'label': '',
                'width': '8px',
                'height': '8px',
                'border-width': 1
            }
        },
        {
            selector: 'node.zoom-high',
            style: {
                'width': '36px',
                'height': '36px',
                'font-size': '12px',
                'text-margin-y': 8
            }
        },
        {
            selector: 'edge.zoom-low',
            style: {
                'label': '',
                'width': 0.5,
                'arrow-scale': 0.5
            }
        },
        {
            selector: '.faded',
            style: {
                'opacity': 0.1,
                'label': ''
            }
        },
        {
            selector: 'node.focus-root',
            style: {
                'width': '48px',
                'height': '48px',
                'font-size': '14px',
                'border-width': 4,
                'border-color': '#4f46e5',
                'z-index': 100
            }
        },
        {
            selector: 'node.focus-d1',
            style: {
                'width': '32px',
                'height': '32px',
                'font-size': '11px',
            }
        },
        {
            selector: 'node.focus-d2',
            style: {
                'width': '20px',
                'height': '20px',
                'font-size': '9px',
                'text-opacity': 0.7
            }
        },
        {
            selector: 'node.focus-far',
            style: {
                'width': '12px',
                'height': '12px',
                'label': '',
                'opacity': 0.4
            }
        },
        {
            selector: 'edge.focus-far',
            style: {
                'opacity': 0.15
            }
        },
        {
            selector: '.lens-faded',
            style: {
                'opacity': 0.05,
                'label': ''
            }
        },
        {
            selector: 'node.lens-focus',
            style: {
                'border-color': '#f59e0b',
                'border-width': 4
            }
        },
        {
            selector: '.legend-faded',
            style: {
                'opacity': 0.1,
                'label': ''
            }
        },
        {
            selector: 'node.legend-focus',
            style: {
                'border-width': 3,
                'border-color': '#10b981' // Green rim to show it's selected via legend
            }
        }
    ] as any, [isBundled]);

    const cyLayout = useMemo(() => (
        perspective === "hierarchical"
            ? { name: 'dagre', rankDir: 'TB', nodeSep: 120, rankSep: 160 }
            : perspective === "focus"
                ? {
                    name: 'concentric',
                    concentric: (n: any) => 10 - (n.data('focus_depth') || 0),
                    levelWidth: () => 1,
                    spacingFactor: 1.5,
                    animate: true
                }
                : {
                    name: 'cose',
                    randomize: true,
                    componentSpacing: 60,
                    nodeOverlap: 10,
                    padding: 50,
                    nodeRepulsion: () => 400000,
                    idealEdgeLength: () => 100,
                    edgeElasticity: () => 100,
                    gravity: 80,
                    numIter: 250, // Dropped from 1000 for instant calculation
                    initialTemp: 200,
                    coolingFactor: 0.95,
                    minTemp: 1.0,
                    animate: false // Pre-compute and render instantly instead of simulating live
                }
    ) as any, [perspective]);

    return (
        <div className={`flex flex-col flex-1 min-h-0 ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'relative w-full'}`}>
            {/* Standard Flex Toolbar (No longer floating) */}
            <div className="flex items-center justify-between p-3 border-b bg-background/50 z-10 shrink-0">
                <div className="flex gap-2 items-center">
                    <Button variant="ghost" size="sm" onClick={fetchGraph} title="Refresh Graph" disabled={isLoading} className="bg-white border shadow-sm text-slate-600 px-2 h-8">
                        <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                    <div className="flex items-center gap-1 bg-white border p-1 rounded-md shadow-sm">
                        <Button variant="ghost" size="sm" onClick={handleZoomIn} title="Zoom In" className="h-6 w-6 p-0 rounded-sm text-slate-500 hover:text-slate-900"><ZoomIn className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={handleZoomOut} title="Zoom Out" className="h-6 w-6 p-0 rounded-sm text-slate-500 hover:text-slate-900"><ZoomOut className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={handleFit} title="Fit to Screen" className="h-6 w-6 p-0 rounded-sm text-slate-500 hover:text-slate-900"><Scan className="h-4 w-4" /></Button>
                    </div>
                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                    <div className="flex items-center gap-1 bg-white border p-1 rounded-md shadow-sm">
                        <Button
                            variant={perspective === "relational" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setPerspective("relational")}
                            className="text-[11px] h-6 px-3 rounded-sm font-semibold"
                        >
                            <Network className="h-3.5 w-3.5 mr-1" /> Relational
                        </Button>
                        <Button
                            variant={perspective === "hierarchical" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setPerspective("hierarchical")}
                            className="text-[11px] h-6 px-3 rounded-sm font-semibold"
                        >
                            <Layers className="h-3.5 w-3.5 mr-1" /> Hierarchical
                        </Button>
                        <Button
                            variant={perspective === "focus" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setPerspective("focus")}
                            className="text-[11px] h-6 px-3 rounded-sm font-semibold"
                        >
                            <Target className="h-3.5 w-3.5 mr-1" /> Focus
                        </Button>
                        <Button
                            variant={perspective === "matrix" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setPerspective("matrix")}
                            className="text-[11px] h-6 px-3 rounded-sm font-semibold"
                        >
                            <Grid3x3 className="h-3.5 w-3.5 mr-1" /> Matrix
                        </Button>
                    </div>
                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                    <div className="flex items-center gap-1 bg-white border p-1 rounded-md shadow-sm">
                        <Button
                            variant={isBundled ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setIsBundled(!isBundled)}
                            className="text-[11px] h-6 px-3 rounded-sm font-semibold"
                            title="Toggle Edge Bundling"
                        >
                            <Route className="h-3.5 w-3.5 mr-1" /> Bundle
                        </Button>
                        <Button
                            variant={isLensActive ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setIsLensActive(!isLensActive)}
                            className="text-[11px] h-6 px-3 rounded-sm font-semibold"
                            title="Toggle Magic Lens"
                        >
                            <Search className="h-3.5 w-3.5 mr-1" /> Lens
                        </Button>
                    </div>
                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                    <Button variant="ghost" size="sm" onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"} className="bg-white border shadow-sm text-slate-600 px-2 h-8">
                        {isFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                    </Button>
                </div>

                <div className="flex gap-4">
                    <div className="flex items-center gap-3 bg-muted/20 border-slate-200 border rounded-full px-4 py-1.5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)] text-[11px] font-medium text-slate-600">
                        <span className="text-muted-foreground/80 uppercase tracking-widest font-bold text-[10px] mr-1">Legend</span>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm border border-blue-600/20"></div> Synced <span className="text-muted-foreground/50 ml-0.5">(Blue)</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm border border-amber-600/20"></div> Outdated <span className="text-muted-foreground/50 ml-0.5">(Amber)</span></div>
                    </div>
                </div>
            </div>

            {/* Canvas and Side Panel Container */}
            <div className="relative w-full flex-1 flex min-h-0 overflow-hidden">

                {/* Unified Sidebar for both Source and Taxonomy Filters */}
                <div className="w-[280px] border-r border-dashed border-muted-foreground/20 bg-muted/5 shrink-0 flex flex-col h-full overflow-hidden relative z-20 transition-all duration-300">
                    <div className="p-4 border-b bg-background/50 flex items-center gap-2 shrink-0">
                        <Filter className="h-4 w-4 text-indigo-600" />
                        <span className="font-semibold text-sm">Graph Filters</span>
                    </div>

                    <div className="flex-1 overflow-y-auto flex flex-col min-h-0">

                        {/* Source Filter Section */}
                        {sources.length > 0 && (
                            <div className="p-4 border-b border-dashed border-slate-200 shrink-0">
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <Database className="h-3 w-3 text-slate-400" />
                                    Filter by Source
                                </label>
                                <MultiSelect
                                    options={sourceOptions}
                                    selected={selectedSourceFilters}
                                    onChange={setSelectedSourceFilters}
                                    placeholder="Select sources..."
                                    className="bg-white border-slate-200 text-xs shadow-sm py-1 min-h-[32px]"
                                />
                            </div>
                        )}

                        {/* Taxonomy Filter Section */}
                        <div className="flex flex-col flex-1 min-h-0">
                            <div className="p-4 pb-2 flex items-center justify-between shrink-0">
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <Layers className="h-3 w-3 text-slate-400" />
                                    Taxonomy
                                </label>
                                <div className="flex gap-2 items-center">
                                    <button
                                        onClick={() => setSelectedOntologyFilters(ontologyClasses)}
                                        className="text-[10px] uppercase font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                    >ALL</button>
                                    <span className="text-muted-foreground/20 text-[10px]">|</span>
                                    <button
                                        onClick={() => setSelectedOntologyFilters([])}
                                        className="text-[10px] uppercase font-bold text-slate-400 hover:text-slate-700 transition-colors"
                                    >NONE</button>
                                    <span className="ml-2 text-[10px] font-mono font-medium bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                        {selectedOntologyFilters.length}/{ontologyClasses.length}
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
                                {ontologyClasses.length === 0 ? (
                                    <div className="text-xs text-muted-foreground italic text-center py-8">No ontology classes defined for this KB.</div>
                                ) : (
                                    ontologyClasses.map(cls => (
                                        <div key={cls} className="flex items-center space-x-2.5">
                                            <input
                                                type="checkbox"
                                                id={`filter-${cls}`}
                                                checked={selectedOntologyFilters.includes(cls)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedOntologyFilters(prev => [...prev, cls]);
                                                    } else {
                                                        setSelectedOntologyFilters(prev => prev.filter(c => c !== cls));
                                                    }
                                                }}
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                            />
                                            <label
                                                htmlFor={`filter-${cls}`}
                                                className="text-xs font-medium leading-none cursor-pointer text-slate-600 truncate hover:text-indigo-800 transition-colors"
                                                title={cls}
                                            >
                                                {cls}
                                            </label>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-200 bg-background/80 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                        <Button
                            className="w-full shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors disabled:bg-slate-300"
                            size="sm"
                            disabled={isLoading || (JSON.stringify(selectedOntologyFilters.sort()) === JSON.stringify(appliedOntologyFilters.sort()) && JSON.stringify(selectedSourceFilters.sort()) === JSON.stringify(appliedSourceFilters.sort()))}
                            onClick={() => {
                                setAppliedOntologyFilters([...selectedOntologyFilters]);
                                setAppliedSourceFilters([...selectedSourceFilters]);
                            }}
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Filter className="h-4 w-4 mr-2 text-white/80" />}
                            Apply Filters
                        </Button>
                    </div>
                </div>

                {/* Canvas Container */}
                <div
                    ref={containerRef}
                    className={`h-full border-2 border-dashed border-muted-foreground/20 m-4 rounded-xl overflow-hidden bg-slate-50/50 transition-all duration-300 ${selectedNode ? 'flex-1' : 'w-full'}`}
                >
                    {isLoading ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mb-2" />
                            <p>Loading Graph Data...</p>
                        </div>
                    ) : elements.length > 0 ? (
                        perspective === "matrix" ? (
                            <AdjacencyMatrix elements={elements} />
                        ) : (
                            <div className="relative w-full h-full">
                                {/* Floating Interactive Legend */}
                                <div 
                                    className="absolute bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg rounded-md z-10 w-56 flex flex-col"
                                    style={{ 
                                        top: 16, right: 16, 
                                        transform: `translate(${legendOffset.x}px, ${legendOffset.y}px)`,
                                        maxHeight: isLegendExpanded ? '70%' : 'auto'
                                    }}
                                >
                                    {/* Drag Handle & Header */}
                                    <div 
                                        className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between p-2 cursor-move select-none bg-slate-50/80 border-b border-slate-100 rounded-t-md"
                                        onPointerDown={(e) => {
                                            const startX = e.clientX;
                                            const startY = e.clientY;
                                            const startOffsetX = legendOffset.x;
                                            const startOffsetY = legendOffset.y;
                                            
                                            const onMove = (moveEvt: PointerEvent) => {
                                                setLegendOffset({
                                                    x: startOffsetX + (moveEvt.clientX - startX),
                                                    y: startOffsetY + (moveEvt.clientY - startY)
                                                });
                                            };
                                            const onUp = () => {
                                                window.removeEventListener('pointermove', onMove);
                                                window.removeEventListener('pointerup', onUp);
                                            };
                                            window.addEventListener('pointermove', onMove);
                                            window.addEventListener('pointerup', onUp);
                                        }}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <GripHorizontal className="h-3.5 w-3.5 text-slate-400" />
                                            Highlight Legend
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {highlightedTypes.length > 0 && (
                                                <button 
                                                    onPointerDown={(e) => e.stopPropagation()} 
                                                    onClick={() => setHighlightedTypes([])} 
                                                    className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer transition-colors"
                                                >Clear</button>
                                            )}
                                            <button 
                                                onPointerDown={(e) => e.stopPropagation()} 
                                                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                            >
                                                {isLegendExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {isLegendExpanded && (
                                        <div className="space-y-1 p-2 overflow-y-auto custom-scrollbar">
                                        {legendItems.map((item) => {
                                            const isHighlighted = highlightedTypes.includes(item.type);
                                            const count = typeCounts[item.type] || 0;
                                            return (
                                                <div 
                                                    key={item.type}
                                                    onClick={() => {
                                                        const isNowHighlighted = !isHighlighted;
                                                        setHighlightedTypes(prev => 
                                                            isNowHighlighted ? [...prev, item.type] : prev.filter(t => t !== item.type)
                                                        )
                                                        if (isNowHighlighted) {
                                                            setTimeout(() => handleStepperJump(item.type, 'first'), 50);
                                                        }
                                                    }}
                                                    className={`flex items-center gap-2 cursor-pointer p-1.5 rounded-sm transition-all ${
                                                        isHighlighted ? 'bg-indigo-50 ring-1 ring-indigo-200/50 shadow-sm' : 'hover:bg-slate-100'
                                                    } ${highlightedTypes.length > 0 && !isHighlighted ? 'opacity-40 grayscale-[0.5]' : 'opacity-100'}`}
                                                >
                                                    <div className="w-3.5 h-3.5 rounded-full border border-slate-200/50 flex-shrink-0 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]" style={{ backgroundColor: item.color }}></div>
                                                    <div className={`flex-1 text-[11px] truncate transition-colors ${isHighlighted ? 'font-semibold text-indigo-900' : 'text-slate-600 font-medium'}`} title={item.type}>{item.type}</div>
                                                    
                                                    {isHighlighted && count > 0 && (
                                                        <div className="flex items-center gap-0.5 bg-white/60 border border-indigo-100 rounded px-0.5 shadow-sm" onPointerDown={(e) => e.stopPropagation()}>
                                                            <button 
                                                                onClick={(e) => handleStepperJump(item.type, 'prev', e)}
                                                                className="p-0.5 hover:bg-slate-200 hover:text-slate-900 rounded text-slate-500 transition-colors"
                                                            >
                                                                <ChevronLeft className="w-3 h-3" />
                                                            </button>
                                                            <span className="text-[9px] font-mono font-bold text-indigo-900 min-w-[24px] text-center">
                                                                {(stepperIndices[item.type] || 0) + 1}/{count}
                                                            </span>
                                                            <button 
                                                                onClick={(e) => handleStepperJump(item.type, 'next', e)}
                                                                className="p-0.5 hover:bg-slate-200 hover:text-slate-900 rounded text-slate-500 transition-colors"
                                                            >
                                                                <ChevronRight className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                    )}
                                </div>
                                <CytoscapeComponent
                                    elements={elements}
                                    style={{ width: '100%', height: '100%' }}
                                    minZoom={0.15}
                                maxZoom={3}
                                cy={(cy) => {
                                    cyRef.current = cy;
                                    
                                    // Semantic Zooming Logic
                                    const applySemanticZoom = () => {
                                        const z = cy.zoom();
                                        if (z < 0.6) {
                                            cy.elements().removeClass('zoom-high zoom-medium').addClass('zoom-low');
                                        } else if (z > 1.8) {
                                            cy.elements().removeClass('zoom-low zoom-medium').addClass('zoom-high');
                                        } else {
                                            cy.elements().removeClass('zoom-low zoom-high').addClass('zoom-medium');
                                        }
                                    };

                                    cy.on('zoom', () => {
                                        applySemanticZoom();
                                    });

                                    // Faceted Browsing / Focus Mode Logic
                                    cy.on('tap', 'node', function (evt) {
                                        if (isLensActive) return; // Disable tap interactions while lens is running
                                        
                                        const node = evt.target;
                                        setSelectedNode(node.data());
                                        
                                        if (perspective !== 'focus') {
                                            // Fade out non-neighbors (Faceted Focus)
                                            cy.elements().removeClass('faded');
                                            const neighbors = node.neighborhood();
                                            cy.elements().not(neighbors).not(node).addClass('faded');
                                        }
                                    });

                                    cy.on('tap', function (evt) {
                                        if (evt.target === cy) {
                                            setSelectedNode(null);
                                            // Remove fade effect
                                            cy.elements().removeClass('faded');
                                        }
                                    });

                                    // Initial setup
                                    applySemanticZoom();
                                }}
                                layout={cyLayout}
                                stylesheet={cyStylesheet}
                            />
                            </div>
                        )
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                {metadata?.ingestion_status === 'failed' ? (
                                    <AlertCircle className="h-8 w-8 text-red-500" />
                                ) : (
                                    <RefreshCw className={`h-8 w-8 text-slate-400 ${metadata?.ingestion_status === 'running' ? 'animate-spin' : ''}`} />
                                )}
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-2">
                                {metadata?.ingestion_status === 'running'
                                    ? "AI Discovery in Progress..."
                                    : metadata?.ingestion_status === 'failed'
                                        ? "Ingestion Failed"
                                        : "No nodes found in this Knowledge Base."
                                }
                            </h3>
                            <p className="max-w-[400px] mb-6 text-sm leading-relaxed text-slate-500">
                                {metadata?.ingestion_status === 'running'
                                    ? "Please wait while our AI scans your documents for entities and relationships. This may take a minute."
                                    : metadata?.ingestion_status === 'failed'
                                        ? `Error: ${metadata?.error || "A problem occurred during ingestion."} Try establishing the KB again or check backend logs.`
                                        : "Click 'Establish/Update Knowledge Base' in the Configuration tab to start the AI discovery process."
                                }
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fetchGraph()}
                                className="bg-white hover:bg-slate-50 border-slate-200"
                            >
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Refresh Graph
                            </Button>
                        </div>
                    )}
                </div>

                {/* Node Metadata Side Panel */}
                {selectedNode && (
                    <div className="w-1/3 h-full overflow-y-auto border-l bg-card p-6 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)] transition-all duration-300 relative z-20">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-bold break-words">{selectedNode.label.split('\n')[0]}</h3>
                                <div className="text-sm font-medium text-indigo-600 mt-1 uppercase tracking-wider">{selectedNode.type}</div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setSelectedNode(null)} className="flex-shrink-0">
                                <span className="sr-only">Close</span>
                                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                            </Button>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-1">
                                <div className="text-xs text-muted-foreground uppercase font-semibold">Node ID</div>
                                <div className="text-sm font-mono bg-muted p-2 rounded">{selectedNode.id}</div>
                            </div>

                            {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 ? (
                                <div className="space-y-4">
                                    <div className="text-xs text-muted-foreground uppercase font-semibold border-b pb-2">Properties</div>

                                    {/* Handle common properties generically */}
                                    {Object.entries(selectedNode.properties).map(([key, value]) => {
                                        if (key === 'name' || key === 'label') return null; // Already shown in header

                                        return (
                                            <div key={key} className="space-y-1">
                                                <div className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</div>
                                                <div className="text-sm">
                                                    {typeof value === 'string' && value.startsWith('http') ? (
                                                        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                                                            {value}
                                                        </a>
                                                    ) : typeof value === 'object' ? (
                                                        <pre className="bg-slate-50 p-2 text-xs rounded border break-words whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                                                    ) : (
                                                        <div className="break-words">{String(value)}</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground italic border-t pt-4">No additional properties available for this node.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Ingestion Status Overlay */}
            {ingestionStatus === "running" && (
                <div className="absolute bottom-6 right-6 z-20 flex items-center gap-3 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg animate-pulse border border-indigo-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-semibold tracking-wide uppercase">AI Discovery in Progress...</span>
                </div>
            )}
        </div>
    )
}
