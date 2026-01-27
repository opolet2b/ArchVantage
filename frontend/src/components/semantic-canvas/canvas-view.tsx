/**
 * Semantic Canvas View
 *
 * Main canvas component using React Flow for spatial arrangement
 * of things with semantic zoom behavior.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Node,
    Edge,
    Connection,
    ReactFlowProvider,
    Panel,
    NodeChange,
    useReactFlow,
    EdgeTypes,
    MarkerType,
    useNodesInitialized,
} from "reactflow";
import "reactflow/dist/style.css";
import domToImage from "dom-to-image-more";

import { ThingNode } from "./nodes/thing-node";
import { DomainNode } from "./nodes/domain-node";
import { TextThingEditor } from "./nodes/text-thing-editor";
import { CustomEdge } from "./edges/custom-edge";

import { useCanvasStore, getZoomLevel, LinkType, CanvasLink, Viewport } from "./canvas-store";

import { LinkTypeDialog } from "./link-type-dialog";
import { MCPToolConfigDialog, MCPToolConfig } from "./mcp-tool-config-dialog";
import { layoutService } from "./services/layout-service";
import { cn, API_URL } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, Eye, FolderOpen, Layout, RefreshCcw, Camera, Hand, MousePointer2, Link as LinkIcon, Unlink, Maximize2, Minimize2, X } from "lucide-react";
import { CanvasContextMenu } from "./canvas-context-menu";
import { SelectionProvider } from "./viewers/selection-context";
import { useToast } from "@/components/ui/use-toast";
import { CanvasPalette } from "./canvas-palette";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useConversation } from "@/lib/conversation-context";
import { useViewMode } from "@/lib/view-mode-context";
import { Switch } from "@/components/ui/switch";
import { ContextualTrainer, TrainerStep } from "@/components/ui/contextual-trainer";
import { Trash2 } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// =============================================================================
// Node Types
// =============================================================================

// Node Types definition moved inside component to ensure stability with React Flow
const nodeTypesMemo = {
    thing: ThingNode,
    domain: DomainNode,
};

const edgeTypesMemo: EdgeTypes = {
    custom: CustomEdge,
};




// =============================================================================
// Canvas View Inner (needs ReactFlow context)
// =============================================================================

function CanvasViewInner() {
    const { fitView, getViewport, setViewport, screenToFlowPosition } = useReactFlow();
    const nodesInitialized = useNodesInitialized();
    const { toast } = useToast();

    // Canvas store state
    const {
        canvasId,
        things,
        links,
        domains,
        viewport,
        zoomLevel,
        updateViewport,
        saveViewport,
        moveThing,
        moveThings,
        updateThing,
        updateThings,
        addThing,
        deleteThing,
        addLink,
        deleteLink,
        selectThing,
        clearSelection,
        selectedThingIds,
        moveDomain,
        updateDomain,
        checkThingInDomain,
        addThingToDomain,
        removeThingFromDomain,
        toggleIconify,
        selectedModel,
        setSelectedModel,
        selectedDomainIds,
        selectDomain,
        addDomain,
        setVisionModel,
        setSelectedItems,
        selectionMode,
        setSelectionMode,
        getHierarchyDepth,
        showLinks,
        hiddenNodeLinks,
        toggleShowLinks,
        semanticZoomEnabled,
        setSemanticZoomEnabled,
        deleteSelectedNodes,
        dockedThingId,
        dockPosition,
        setDockedThing,
        editingThingId,
        sidebarCollapsed,
    } = useCanvasStore();

    // Dock sizing state
    const [dockWidth, setDockWidth] = React.useState(400);
    const [dockHeight, setDockHeight] = React.useState(300);
    const [isResizing, setIsResizing] = React.useState(false);

    const handleResize = React.useCallback((e: MouseEvent) => {
        if (!isResizing || !dockPosition) return;

        if (dockPosition === 'left') {
            setDockWidth(Math.max(200, e.clientX));
        } else if (dockPosition === 'right') {
            const paletteWidth = sidebarCollapsed ? 48 : 256;
            setDockWidth(Math.max(200, window.innerWidth - e.clientX - paletteWidth));
        } else if (dockPosition === 'top') {
            setDockHeight(Math.max(150, e.clientY - 64)); // 64 is approx header height
        } else if (dockPosition === 'bottom') {
            setDockHeight(Math.max(150, window.innerHeight - e.clientY));
        }
    }, [isResizing, dockPosition]);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    React.useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleResize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', handleResize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', handleResize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, handleResize, stopResizing]);

    const renderDockedThing = (id: string) => {
        const thing = things.find(t => t.id === id);
        if (!thing) return null;

        // If this thing is currently being edited, render the editor inline
        if (id === editingThingId && thing.type === 'text') {
            return (
                <div className="h-full border-none shadow-none">
                    <TextThingEditor
                        thing={thing}
                        isOpen={true}
                        inline={true}
                        onClose={() => useCanvasStore.getState().setEditingThingId(null)}
                        onSave={async (newContent: string) => {
                            await updateThing(thing.id, {
                                content: { ...thing.content, text: newContent }
                            });
                        }}
                    />
                </div>
            );
        }

        return (
            <div className="h-full">
                <ThingNode
                    id={id}
                    data={{
                        thing,
                        zoomLevel: 'domain',
                        isSelected: false,
                        onOpenConversation: handleOpenConversation,
                        onToggleIconify: toggleIconify,
                        onDelete: handleSafeDeleteThing,
                        onResizeEnd: handleThingResize,
                    }}
                    type="thing"
                    selected={false}
                    zIndex={1000}
                    isConnectable={false}
                    xPos={0}
                    yPos={0}
                    dragging={false}
                />
            </div>
        );
    };

    // Model state from store
    const visionModel = useCanvasStore((state) => state.visionModel);
    // The setVisionModel is already destructured above, so this line is redundant.
    // const setVisionModel = useCanvasStore((state) => state.setVisionModel);

    // Debug render
    // Polling for processing items (RAG status)
    const refreshThings = useCanvasStore((state) => state.refreshThings);

    React.useEffect(() => {
        const hasProcessingItems = things.some(
            t => t.rag_status === "processing" || t.rag_status === "pending"
        );

        if (hasProcessingItems) {
            const interval = setInterval(() => {
                refreshThings();
            }, 3000); // Poll every 3 seconds

            return () => clearInterval(interval);
        }
    }, [things, refreshThings]);


    // Sync Store Viewport -> React Flow (One way on load/change of canvasId)
    // This ensures we start at the right place when switching canvases
    React.useEffect(() => {
        if (canvasId && viewport) {
            setViewport(viewport);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasId, setViewport]); // Only trigger on canvasId change (new canvas loaded)

    // Save viewport on unmount to capture final state (prevents debouncing loss)
    React.useEffect(() => {
        return () => {
            saveViewport();
        };
    }, [saveViewport]);


    // Model presets state for dropdown
    interface ModelPreset {
        name: string;
        type: "local" | "remote";
        model_name?: string;
        is_vision?: boolean;
    }
    const [models, setModels] = React.useState<ModelPreset[]>([]);
    const [isLoadingModels, setIsLoadingModels] = React.useState(true);



    // Fetch available models and defaults on mount (only once)
    React.useEffect(() => {
        const fetchModels = async () => {
            try {
                const token = localStorage.getItem("token");
                const headers: HeadersInit = token ? { "Authorization": `Bearer ${token}` } : {};

                // Fetch presets and defaults in parallel
                const [presetsRes, defaultsRes] = await Promise.all([
                    fetch(`${API_URL}/config/presets`, { headers }),
                    fetch(`${API_URL}/config/defaults`, { headers })
                ]);

                if (presetsRes.ok) {
                    const data = await presetsRes.json();
                    const presetList: ModelPreset[] = data.presets || [];
                    setModels(presetList);

                    let defaultLlmName: string | null = null;
                    let defaultVisionName: string | null = null;

                    if (defaultsRes.ok) {
                        const defaults = await defaultsRes.json();
                        defaultLlmName = defaults.default_llm;
                        defaultVisionName = defaults.default_vision;
                    }

                    // Set LLM Model: Current store > Default > First available
                    const currentModel = useCanvasStore.getState().selectedModel;
                    if (!currentModel) {
                        if (defaultLlmName && presetList.some(p => p.name === defaultLlmName)) {
                            setSelectedModel(defaultLlmName);
                        } else if (presetList.length > 0) {
                            setSelectedModel(presetList[0].name);
                        }
                    }

                    // Set Vision Model: Current store > Default > First vision available
                    const currentVisionModel = useCanvasStore.getState().visionModel;
                    if (!currentVisionModel) {
                        if (defaultVisionName && presetList.some(p => p.name === defaultVisionName)) {
                            setVisionModel(defaultVisionName);
                        } else {
                            const firstVision = presetList.find(p => p.is_vision);
                            if (firstVision) {
                                setVisionModel(firstVision.name);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to fetch model presets or defaults:", error);
            } finally {
                setIsLoadingModels(false);
            }
        };
        fetchModels();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    // Link type dialog state
    const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
    const [pendingConnection, setPendingConnection] = React.useState<{
        source: string;
        target: string;
    } | null>(null);
    const [editingLink, setEditingLink] = React.useState<CanvasLink | null>(null);

    // Context menu state
    const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
    const [contextMenuPosition, setContextMenuPosition] = React.useState({ x: 0, y: 0 });
    const [contextMenuContext, setContextMenuContext] = React.useState<"canvas" | "domain" | "selection">("canvas");
    const [contextMenuDomainId, setContextMenuDomainId] = React.useState<string | undefined>(undefined);

    // Handle opening a conversation from canvas
    const handleOpenConversation = React.useCallback((conversationId: string) => {
        // Dispatch event to switch to chat mode with the conversation active
        window.dispatchEvent(
            new CustomEvent("open-conversation", { detail: { conversationId } })
        );
    }, []);

    // nodeTypes moved to top-level
    const nodeTypes = nodeTypesMemo;

    // Handle thing resize end
    const handleThingResize = React.useCallback((thingId: string, width: number, height: number) => {
        updateThing(thingId, { width, height });
    }, [updateThing]);

    // Handle Safe Deletion (Confirmation for Conversation Nodes)
    const handleSafeDeleteThing = React.useCallback(async (thingId: string) => {
        const thing = things.find(t => t.id === thingId);
        if (!thing) return;

        if (thing.type === 'conversation') {
            const hasLinks = links.some(l => l.source_id === thingId || l.target_id === thingId);
            if (hasLinks) {
                const confirmed = window.confirm(
                    "This conversation has linked context.\n\nDeleting it will remove these links. Continue?"
                );
                if (!confirmed) return;
            }
        }

        await deleteThing(thingId);
    }, [things, links, deleteThing]);

    // Convert things to React Flow nodes (memoized)
    const thingNodes: Node[] = React.useMemo(() => things.map((thing) => ({
        id: thing.id,
        type: "thing",
        selected: selectedThingIds.includes(thing.id),
        position: { x: thing.position_x, y: thing.position_y },
        data: {
            thing,
            zoomLevel,
            isSelected: selectedThingIds.includes(thing.id),
            onOpenConversation: handleOpenConversation,
            onToggleIconify: toggleIconify,
            onDelete: handleSafeDeleteThing,
            onResizeEnd: handleThingResize,
        },
        draggable: true,
        zIndex: thing.z_index ?? 0, // Use stored z_index
        // Include width/height if thing has been resized or use default for heavy types (skip for iconified)
        style: (!thing.iconified) ? {
            width: thing.width ?? 400, // Default width if not set to prevent auto-resize to content
            height: thing.height ?? undefined, // Allow height to be auto if not set, or set default?
        } : undefined,
    })), [things, zoomLevel, selectedThingIds, handleOpenConversation, toggleIconify, deleteThing, handleThingResize]);

    // Handle domain update (name, description, color)
    const handleDomainUpdate = React.useCallback((domainId: string, updates: { name?: string; description?: string; color?: string }) => {
        updateDomain(domainId, updates as any);
    }, [updateDomain]);

    // Handle node right-click (context menu) - Replaces manual domain handlers
    const onNodeContextMenu = React.useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            // Critical: Stop propagation so the pane context menu doesn't fire and overwrite state
            event.stopPropagation();

            // Check if node is in current selection
            const isSelected = node.type === "thing"
                ? selectedThingIds.includes(node.id)
                : selectedDomainIds.includes(node.id);

            if (!isSelected) {
                // If not selected, select it (exclusive)
                if (node.type === "thing") selectThing(node.id);
                else selectDomain(node.id); // Recursive by default (as per store)
            }

            // Set context to "selection" (acts on all selected items)
            setContextMenuPosition({ x: event.clientX, y: event.clientY });
            setContextMenuContext("selection");
            setContextMenuDomainId(undefined); // Not used in selection context
            setContextMenuOpen(true);
        },
        [selectedThingIds, selectedDomainIds, selectThing, selectDomain]
    );

    // Handle domain right-click (context menu for domain) - defined here before domainNodes
    // Note: We need this bridge because React Flow sometimes fails to trigger onNodeContextMenu
    // for complex custom nodes with z-indexing layers.
    const handleDomainContextMenu = React.useCallback(
        (event: React.MouseEvent, domainId: string) => {
            // Find the node object to pass to onNodeContextMenu
            const mockNode: Node = {
                id: domainId,
                type: "domain",
                data: {}, // Minimal data needed
                position: { x: 0, y: 0 } // Dummy
            };
            onNodeContextMenu(event, mockNode);
        },
        [onNodeContextMenu]
    );


    // Convert domains to React Flow nodes (memoized, rendered behind things)
    // Handle domain resize end
    // Handle domain resize end
    const handleDomainResize = React.useCallback((domainId: string, width: number, height: number, x?: number, y?: number) => {
        const updates: any = { width, height };
        if (x !== undefined) updates.position_x = x;
        if (y !== undefined) updates.position_y = y;
        updateDomain(domainId, updates);
    }, [updateDomain]);

    const domainNodes: Node[] = React.useMemo(() => domains.map((domain) => {
        // Calculate hierarchy depth
        const depth = getHierarchyDepth(domain.id);
        // Find parent name if exists
        const parent = domain.parent_id ? domains.find(d => d.id === domain.parent_id) : null;
        const parentName = parent?.name;

        return {
            id: domain.id,
            type: "domain",
            selected: selectedDomainIds.includes(domain.id),
            position: { x: domain.position_x, y: domain.position_y },
            data: {
                domain,
                zoomLevel,
                depth,
                parentName,
                onUpdate: handleDomainUpdate,
                onContextMenu: handleDomainContextMenu,
                onResizeEnd: handleDomainResize,
            },
            draggable: true,
            selectable: true,
            zIndex: domain.z_index ?? -1, // Use stored z_index (always <= -1)
            style: {
                width: domain.width || 300,
                height: domain.height || 200,
            },
        };
    }), [domains, zoomLevel, handleDomainUpdate, handleDomainResize, selectedDomainIds, getHierarchyDepth]);

    // Combine nodes (memoized)
    const allNodes = React.useMemo(() =>
        [...domainNodes, ...thingNodes],
        [domainNodes, thingNodes]
    );

    // Link type colors
    const getLinkColor = (linkType: string) => {
        switch (linkType) {
            case "related": return "#3b82f6"; // blue
            case "references": return "#22c55e"; // green
            case "derived_from": return "#a855f7"; // purple
            case "contains": return "#14b8a6"; // teal
            case "proves": return "#0ea5e9"; // sky blue
            case "refutes": return "#ef4444"; // red
            case "prerequisite": return "#f97316"; // orange
            case "influences": return "#06b6d4"; // cyan
            case "triggers": return "#eab308"; // yellow
            case "blocks": return "#a855f7"; // violet
            case "supersedes": return "#64748b"; // slate
            default: return "#6366f1"; // indigo fallback
        }
    };

    // Convert links to React Flow edges (memoized)
    const allEdges: Edge[] = React.useMemo(() => {
        // Group links by source-target pair to calculate offsets
        const groups: Record<string, typeof links> = {};

        // Filter out cross-canvas links (they shouldn't be drawn as edges here)
        // AND apply global/local visibility filters
        const visibleLinks = links.filter(l => {
            // 1. Cross-canvas check
            if (l.target_canvas_id && l.target_canvas_id !== canvasId) return false;

            // 2. Global switch
            if (!showLinks) return false;

            // 3. Per-node switch (hide if EITHER end is hidden)
            if (hiddenNodeLinks.includes(l.source_id)) return false;
            if (hiddenNodeLinks.includes(l.target_id)) return false;

            return true;
        });

        visibleLinks.forEach(link => {
            const key = `${link.source_id}-${link.target_id}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(link);
        });

        const edges: Edge[] = [];

        Object.values(groups).forEach(group => {
            // Sort group to ensure consistent ordering (e.g. by creation time or ID)
            // This prevents jumping when links are added/removed
            group.sort((a, b) => a.id.localeCompare(b.id));

            const total = group.length;

            group.forEach((link, index) => {
                // Determine offset for this link
                // Pattern: Center (0), then alternate variants
                // Count 1: [0]
                // Count 2: [1, -1] or [0.5, -0.5]? Let's use integers for our CustomEdge logic.
                // CustomEdge logic: 0 is straight. +/- N are curves.
                // If Count 1: offset 0
                // If Count 2: offset 1, -1
                // If Count 3: 0, 1, -1
                // If Count 4: 1.5, 0.5, -0.5, -1.5? (Equidistant)

                // Let's us a simple centering logic:
                // Shift indices to be centered around 0.
                // e.g. Count 3: indices 0, 1, 2 -> -1, 0, 1
                // Count 2: indices 0, 1 -> -0.5, 0.5

                const centeredIndex = index - (total - 1) / 2;

                // If total is 1, centeredIndex is 0.
                // If total is 2, -0.5, 0.5. (Magnify by 2? -> -1, 1)
                // If total is 3, -1, 0, 1.

                // Adjust magnitude slightly for better separation if only 2
                // Force mostly integer steps for cleaner look?
                // Our CustomEdge multiplies offset by 25px.

                edges.push({
                    id: link.id,
                    source: link.source_id,
                    target: link.target_id,
                    sourceHandle: (link.source_fragment?.type === "region") ? `fragment-handle-${link.id}` : undefined,
                    label: link.label || undefined,
                    type: "custom", // Use our CustomEdge
                    data: {
                        offset: centeredIndex
                    },
                    animated: link.type === "derived_from",
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 20,
                        height: 20,
                        color: getLinkColor(link.type),
                    },
                    style: {
                        stroke: getLinkColor(link.type),
                        strokeWidth: 2,
                    },
                    labelStyle: {
                        fontSize: 12,
                        fontWeight: 500,
                    },
                    labelBgStyle: {
                        fill: "#fff",
                        fillOpacity: 0.9,
                    },
                });
            });
        });

        return edges;
    }, [links, showLinks, hiddenNodeLinks]);

    // React Flow state - initialized with current nodes
    const [nodes, setNodes, onNodesChange] = useNodesState(allNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(allEdges);

    // Sync stores with React Flow state
    React.useEffect(() => {
        setNodes(allNodes);
    }, [allNodes, setNodes]);

    React.useEffect(() => {
        setEdges(allEdges);
    }, [allEdges, setEdges]);

    // Handle navigation to specific node via URL param
    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        // Wait for React Flow to measure nodes (dimensions > 0)
        if (!nodesInitialized) return;

        const params = new URLSearchParams(window.location.search);
        const targetNodeId = params.get('node');

        if (targetNodeId && nodes.length > 0) {
            const targetNode = nodes.find(n => n.id === targetNodeId);
            if (targetNode) {
                selectThing(targetNodeId);

                fitView({
                    nodes: [{ id: targetNodeId }],
                    duration: 1000,
                    padding: 0.2,
                    maxZoom: 2,
                });

                // Remove the param so we don't re-focus on updates or refresh
                const newUrl = window.location.pathname;
                window.history.replaceState({}, '', newUrl + `?focused=${targetNodeId}`);
            }
        }
    }, [nodes, selectThing, fitView, nodesInitialized]);

    // Debounce timer for resize persistence
    const resizeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    // Flag to prevent sync during resize
    const isResizingRef = React.useRef(false);

    // Custom nodes change handler to capture resize events
    const handleNodesChange = React.useCallback(
        (changes: NodeChange[]) => {
            // Apply changes to React Flow state
            // Apply changes to React Flow state
            onNodesChange(changes);

            // Check for dimension changes (resize events)
            changes.forEach((change) => {
                // TEMPORARY FIX: Disable dimension sync to prevent infinite loop on load
                // The issue is likely that React Flow fires "dimensions" events on mount/layout
                // which updates store -> which updates nodes -> which re-renders -> loop.
                // We only want to handle explicit user resize actions (via Resizer component)
                // or use a stricter check.
                /*
                if (change.type === "dimensions" && change.dimensions) {
                    // One-way sync check: only update if significantly different?
                    // Or just relying on the Resizer component's onResize event (if available) would be better.
                    
                    // Mark as resizing to prevent sync from overwriting
                    isResizingRef.current = true;

                    const node = nodes.find(n => n.id === change.id);

                    if (node?.type === "domain") {
                           // ... (omitted for fix)
                    }
                }
                */
                // Just logging for now to see volume
                if (change.type === "dimensions") {
                }
            });
        },
        [onNodesChange, nodes, moveDomain, updateDomain, updateThing, moveThing]
    );

    // Sync store changes to React Flow (use JSON comparison to avoid infinite loops)
    const prevDomainsRef = React.useRef<string>("");
    const prevThingsRef = React.useRef<string>("");

    React.useEffect(() => {
        // Skip sync during resize to prevent state overwrites
        if (isResizingRef.current) {
            return;
        }

        const domainsKey = JSON.stringify(domains.map(d => ({
            id: d.id,
            x: d.position_x,
            y: d.position_y,
            w: d.width,
            h: d.height,
            c: d.color,
            n: d.name,
            d: d.description,
            z: d.z_index
        })));
        const thingsKey = JSON.stringify(things.map(t => ({
            id: t.id,
            x: t.position_x,
            y: t.position_y,
            w: t.width,
            h: t.height,
            z: t.z_index,
            iconified: t.iconified,
            rag_status: t.rag_status,
            updated_at: t.updated_at,
            // Track content changes (simplistic hash for regions and VLM desc)
            regions: t.type === 'image' ? (t.content as any).regions?.length : undefined,
            // Track slideshow changes specifically
            slides_ts: t.type === 'slideshow' ? (t.content as any)._analysis_timestamp : undefined,
            has_desc: (t.content as any).description ? true : false,
            has_gen_desc: (t.content as any).generated_description ? true : false,
        })));

        // Only update if something actually changed
        if (domainsKey !== prevDomainsRef.current || thingsKey !== prevThingsRef.current) {
            prevDomainsRef.current = domainsKey;
            prevThingsRef.current = thingsKey;
            setNodes(allNodes);
        }
    }, [domains, things, zoomLevel, selectedThingIds, allNodes, setNodes]);

    React.useEffect(() => {
        setEdges(allEdges);
    }, [allEdges, setEdges]);

    // Handle selection drag events (for Pointer Mode multi-select)
    const onSelectionDragStart = React.useCallback(
        (_: React.MouseEvent, nodes: Node[]) => {
            // No-op for now, just symmetry
        },
        []
    );

    const onSelectionDragStop = React.useCallback(
        async (_: React.MouseEvent, nodes: Node[]) => {
            // Re-use the "Direct Position Reading" logic
            // Prepare SINGLE Batch Update Payload using DIRECT positions
            const updates = nodes
                .filter(n => n.type === 'thing')
                .map(n => {
                    // Check domain membership using the NODE'S current position
                    const targetDomainId = checkThingInDomain(
                        n.id,
                        n.position.x,
                        n.position.y
                    );

                    // Map to update payload
                    return {
                        id: n.id,
                        updates: {
                            position_x: n.position.x,
                            position_y: n.position.y,
                            domain_id: targetDomainId
                        }
                    };
                });

            if (updates.length > 0) {
                await updateThings(updates);
            }
        },
        [updateThings, checkThingInDomain]
    );

    // Track domain drag start position
    const dragStartPosRef = React.useRef<{ id: string; x: number; y: number } | null>(null);

    // Handle node drag start - capture starting position for domains AND things
    const onNodeDragStart = React.useCallback(
        (_: React.MouseEvent, node: Node) => {
            // Track start position for ANY node type to support delta calculations in onDragStop
            dragStartPosRef.current = {
                id: node.id,
                x: node.position.x,
                y: node.position.y,
            };
        },
        [] // Dependency array for onNodeDragStart
    );

    // Handle node drag end - save position
    // Handle node drag end - save position
    const onNodeDragStop = React.useCallback(
        async (_: React.MouseEvent, node: Node) => {

            if (node.type === "thing") {
                const startPos = dragStartPosRef.current;

                // Safety check: ensure we have a start position for the dragged node
                // (This now works for Things too, thanks to the fix in onNodeDragStart)
                if (!startPos || startPos.id !== node.id) {
                    return;
                }

                const deltaX = node.position.x - startPos.x;
                const deltaY = node.position.y - startPos.y;

                let nodesToProcess: { id: string; x: number; y: number }[] = [];

                // 1. Identify Items & Calculate New Positions
                if (node.selected && selectedThingIds.length > 1) {
                    // Multi-Select: Calculate position for EACH item based on Delta
                    const selectedThings = things.filter(t => selectedThingIds.includes(t.id));

                    nodesToProcess = selectedThings.map(t => ({
                        id: t.id,
                        x: t.position_x + deltaX,
                        y: t.position_y + deltaY
                    }));
                } else {
                    // Single Select: Use the node's final position directly (Delta also works and is consistent)
                    nodesToProcess = [{
                        id: node.id,
                        x: node.position.x,
                        y: node.position.y
                    }];
                }

                // 2. Process Domain Logic for EACH Item (Loop of "Single Selects")
                const updates = nodesToProcess.map(n => {
                    // Check domain membership using the CALCULATED valid position
                    const targetDomainId = checkThingInDomain(
                        n.id,
                        n.x,
                        n.y
                    );

                    // Return update payload
                    return {
                        id: n.id,
                        updates: {
                            position_x: n.x,
                            position_y: n.y,
                            domain_id: targetDomainId
                        }
                    };
                });

                // 3. Atomic Batch Update
                await updateThings(updates);

                // =============================================================================
                // Transclusion Drop Logic
                // =============================================================================
                // Check if we dropped this node onto a Textarea (Text Node Editor)
                // Since React Flow intercepts the drag, the native onDrop on the textarea won't fire for existing nodes.
                // We manually check the element under the mouse cursor.
                try {
                    // We need the mouse event object to get clientX/Y. 
                    // onNodeDragStop signature is (event, node).
                    // The event passed to onNodeDragStop is a MouseEvent.
                    const mouseEvent = _ as React.MouseEvent;
                    const targetEl = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);

                    if (targetEl && targetEl.tagName === "TEXTAREA") {
                        const textarea = targetEl as HTMLTextAreaElement;
                        // Dispatch a custom drop event or modify value directly
                        // To be safe and reuse the logic in ThingNode, we can try to dispatch a 'drop' event
                        // But DataTransfer is read-only in synthetic events usually.

                        // Let's just modify the value directly for reliability here
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const text = textarea.value;
                        const droppedNodeId = node.id;

                        // Prevent self-reference
                        // We need to find the ID of the node containing this textarea. 
                        // We can look up the tree or check data attributes.
                        const parentNode = textarea.closest('[data-thing-id]');
                        const targetThingId = parentNode?.getAttribute('data-thing-id');

                        if (targetThingId && targetThingId !== droppedNodeId) {
                            const transclusionTag = `{{node:${droppedNodeId}}}`;
                            const newText = text.substring(0, start) + transclusionTag + text.substring(end);

                            // Update the textarea value
                            // React controlled components need the setter, but triggering an 'input' event usually works
                            // or we can try to use the native value setter
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                            if (nativeInputValueSetter) {
                                nativeInputValueSetter.call(textarea, newText);
                                const inputEvent = new Event('input', { bubbles: true });
                                textarea.dispatchEvent(inputEvent);

                                // Restore cursor
                                const newCursorPos = start + transclusionTag.length;
                                textarea.setSelectionRange(newCursorPos, newCursorPos);
                                textarea.focus();

                                toast({
                                    title: "Node Transcluded",
                                    description: `Inserted reference to ${node.data.thing.title || "Node"}`,
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error("Transclusion drop detection failed", err);
                }

                // Reset drag start
                dragStartPosRef.current = null;

            } else if (node.type === "domain") {
                // Domain Drag Logic (Delta based for children)
                const startPos = dragStartPosRef.current;
                const domain = domains.find(d => d.id === node.id);

                if (startPos && startPos.id === node.id) {
                    const deltaX = node.position.x - startPos.x;
                    const deltaY = node.position.y - startPos.y;

                    if (deltaX !== 0 || deltaY !== 0) {
                        // Get FRESH state from store to avoid stale closure issues
                        const freshDomains = useCanvasStore.getState().domains;
                        const freshThings = useCanvasStore.getState().things;

                        // Helper to get all descendant domain IDs recursively
                        const getAllDescendantDomainIds = (parentId: string): string[] => {
                            const children = freshDomains.filter(d => d.parent_id === parentId);
                            return children.flatMap(c => [c.id, ...getAllDescendantDomainIds(c.id)]);
                        };

                        const descendantDomainIds = getAllDescendantDomainIds(node.id);
                        const allDomainIds = [node.id, ...descendantDomainIds];

                        // Get all things in this domain AND all descendant domains
                        const allThingsToMove = freshThings.filter(t =>
                            t.domain_id && allDomainIds.includes(t.domain_id)
                        );

                        // Move things along with domain
                        if (allThingsToMove.length > 0) {
                            const thingUpdates = allThingsToMove.map(t => ({
                                id: t.id,
                                updates: {
                                    position_x: t.position_x + deltaX,
                                    position_y: t.position_y + deltaY
                                }
                            }));
                            updateThings(thingUpdates);
                        }

                        // Move all child domains along with parent (use moveDomain for immediate local update)
                        if (descendantDomainIds.length > 0) {
                            for (const childDomainId of descendantDomainIds) {
                                const childDomain = freshDomains.find(d => d.id === childDomainId);
                                if (childDomain) {
                                    // Use moveDomain for immediate local update
                                    moveDomain(
                                        childDomainId,
                                        childDomain.position_x + deltaX,
                                        childDomain.position_y + deltaY,
                                        childDomain.width,
                                        childDomain.height
                                    );
                                    // Also persist to backend
                                    updateDomain(childDomainId, {
                                        position_x: childDomain.position_x + deltaX,
                                        position_y: childDomain.position_y + deltaY
                                    }).catch(err =>
                                        console.error(`[Domain Drag] Failed to persist child domain ${childDomainId}:`, err)
                                    );
                                }
                            }
                        }
                    }
                }

                // Check for domain nesting (dropped inside another domain?)
                const checkDomainInDomain = useCanvasStore.getState().checkDomainInDomain;
                const centerX = node.position.x + ((domain?.width || 300) / 2);
                const centerY = node.position.y + ((domain?.height || 200) / 2);
                const newParentId = checkDomainInDomain(node.id, centerX, centerY);

                // Check if domain was dragged OUT of its parent
                const wasInParent = domain?.parent_id;
                let shouldClearParent = false;

                if (wasInParent && !newParentId) {
                    // Check if still inside old parent bounds
                    const oldParent = domains.find(d => d.id === wasInParent);
                    if (oldParent) {
                        const stillInside = (
                            centerX >= oldParent.position_x &&
                            centerX <= oldParent.position_x + (oldParent.width || 300) &&
                            centerY >= oldParent.position_y - 40 &&
                            centerY <= oldParent.position_y + (oldParent.height || 200)
                        );
                        if (!stillInside) {
                            shouldClearParent = true;
                        }
                    }
                }

                // Build update payload
                const domainUpdate: { position_x: number; position_y: number; parent_id?: string | null } = {
                    position_x: node.position.x,
                    position_y: node.position.y,
                };

                if (newParentId && newParentId !== domain?.parent_id) {
                    domainUpdate.parent_id = newParentId;
                } else if (shouldClearParent) {
                    domainUpdate.parent_id = null;
                }

                // Persist domain position and parent
                updateDomain(node.id, domainUpdate).catch(err =>
                    console.error("[Domain Drag] Failed to persist domain position:", err)
                );

                // Clear drag start
                dragStartPosRef.current = null;
            } else if (node.type === "thing") {
                // Thing drag handling is managed by React Flow components
            }
        },
        [updateThings, updateDomain, checkThingInDomain, things, selectedThingIds, domains]
    );

    // Handle viewport changes (Zoom/Pan) - Critical for Semantic Zoom!
    const handleMove = React.useCallback((_: any, viewport: any) => {
        updateViewport(viewport);
    }, [updateViewport]);


    // Handle new connections - open dialog to select type
    const onConnect = React.useCallback(
        (connection: Connection) => {
            if (connection.source && connection.target) {
                setPendingConnection({
                    source: connection.source,
                    target: connection.target,
                });
                setEditingLink(null);
                setLinkDialogOpen(true);
            }
        },
        []
    );

    // Handle link creation with selected type
    const handleCreateLink = React.useCallback(
        async (type: LinkType, label: string, description: string) => {
            if (pendingConnection) {
                await addLink(
                    pendingConnection.source,
                    pendingConnection.target,
                    type,
                    label,
                    description
                );
                setPendingConnection(null);
                setLinkDialogOpen(false);
            }
        },
        [pendingConnection, addLink]
    );

    // Handle edge click to edit link
    const onEdgeClick = React.useCallback(
        (_: React.MouseEvent, edge: Edge) => {
            const link = links.find((l) => l.id === edge.id);
            if (link) {
                setEditingLink(link);
                setPendingConnection(null);
                setLinkDialogOpen(true);
            }
        },
        [links]
    );

    // Handle link update
    const handleUpdateLink = React.useCallback(
        async (type: LinkType, label: string, description: string) => {
            if (editingLink) {
                // Update via API
                const token = localStorage.getItem("token");
                try {
                    await fetch(
                        `${API_URL}/canvases/${canvasId}/links/${editingLink.id}`,
                        {
                            method: "PATCH",
                            headers: {
                                Authorization: `Bearer ${token}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ type, label, description }),
                        }
                    );
                    // Update local state
                    useCanvasStore.setState((state) => ({
                        links: state.links.map((l) =>
                            l.id === editingLink.id ? { ...l, type, label: label || null, description: description || null } : l
                        ),
                    }));
                } catch (err) {
                    console.error("Failed to update link:", err);
                }
                setEditingLink(null);
                setLinkDialogOpen(false);
            }
        },
        [editingLink, canvasId]
    );

    // Handle link deletion
    const handleDeleteLink = React.useCallback(async () => {
        if (editingLink) {
            await deleteLink(editingLink.id);
            setEditingLink(null);
            setLinkDialogOpen(false);
        }
    }, [editingLink, deleteLink]);

    // Handle edge deletion from UI (cascade delete)
    const handleEdgesDelete = React.useCallback(async (edges: Edge[]) => {
        for (const edge of edges) {
            const link = links.find(l => l.id === edge.id);
            if (!link) continue;

            // Delete the link
            await deleteLink(link.id);

            // Check for cascade delete of target "derived" thing
            // If target has only this incoming link and is a "text" (result) type
            const incomingLinks = links.filter(l => l.target_id === link.target_id);
            if (incomingLinks.length <= 1) {
                const targetThing = things.find(t => t.id === link.target_id);
                // Only cascade if it's a text/result node and relation is derived_from/related
                if (targetThing && (targetThing.type === "text" || targetThing.type === "agent_result")) {
                    await deleteThing(targetThing.id);
                }
            }
        }
    }, [links, things, deleteLink, deleteThing]);

    // Handle viewport changes
    const onMoveEnd = React.useCallback(() => {
        const vp = getViewport();
        updateViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
    }, [getViewport, updateViewport]);

    // Save viewport on unmount or after debounce
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            saveViewport();
        }, 1000);

        return () => clearTimeout(timeout);
    }, [viewport, saveViewport]);

    // Handle node selection
    const onNodeClick = React.useCallback(
        (event: React.MouseEvent, node: Node) => {
            const shiftKey = event.shiftKey;

            // Note: For "things", we rely on React Flow's native selection handling 
            // which syncs to store via onSelectionChange. 
            // We only manually handle Domain clicks to trigger the special Recursive Selection logic.

            if (node.type === "domain") {
                // Recursive selection of content
                // We use the store action because it calculates children logic
                selectDomain(node.id, shiftKey, true);
            }
        },
        [selectDomain]
    );

    // Handle canvas click (deselect)
    const onPaneClick = React.useCallback(() => {
        clearSelection();
    }, [clearSelection]);

    // Handle canvas rights-click (context menu)
    const handlePaneContextMenu = React.useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();

            // CHECK FOR SELECTION OVERSHOOT:
            // Sometimes right-clicking on a selection box (drag rect) or between selected items bubbles to here.
            // If the user right-clicks while things are selected, check if they clicked on something selection-related.
            // React Flow selection rect usually has class 'react-flow__selection' or similar.
            // Or just check if we have a selection and assume intent if not clicked on empty space? 
            // Better: Check event target.
            const target = event.target as HTMLElement;
            // Common classes for selection visuals
            const isSelectionClick =
                target.classList.contains('react-flow__selection') ||
                target.classList.contains('react-flow__nodesselection') ||
                target.classList.contains('react-flow__nodesselection-rect');

            // Also, if we have a non-empty selection, and the user right-clicks,
            // standard behavior in many apps (like Windows explorer) is:
            // - If click is ON a selected item -> Selection Menu (handled by onNodeContextMenu)
            // - If click is ON whitespace -> Deselect and show View Menu (Canvas context)

            // The issue is React Flow's drag selection box might block the click or bubble it up as "pane" click.

            const { selectedThingIds, selectedDomainIds } = useCanvasStore.getState();
            const hasSelection = selectedThingIds.length > 0 || selectedDomainIds.length > 0;

            if (hasSelection && isSelectionClick) {
                setContextMenuPosition({ x: event.clientX, y: event.clientY });
                setContextMenuContext("selection");
                setContextMenuDomainId(undefined);
                setContextMenuOpen(true);
                return;
            }

            // Spec: Right-Click on Canvas Background: The selection is cleared.
            clearSelection();

            setContextMenuPosition({ x: event.clientX, y: event.clientY });
            setContextMenuContext("canvas");
            setContextMenuDomainId(undefined);
            setContextMenuOpen(true);
        },
        [clearSelection]
    );

    // =============================================================================
    // Ghost Mode Logic (Mouse Tracking)
    // =============================================================================
    const transclusionGhostId = useCanvasStore((state) => state.transclusionGhostId);
    const ghostThing = transclusionGhostId ? things.find(t => t.id === transclusionGhostId) : null;
    const [ghostPos, setGhostPos] = React.useState<{ x: number, y: number } | null>(null);

    React.useEffect(() => {
        if (!transclusionGhostId) {
            setGhostPos(null);
            return;
        }

        const handleMouseMove = (e: MouseEvent) => {
            setGhostPos({ x: e.clientX, y: e.clientY });
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                useCanvasStore.getState().setTransclusionGhostId(null);
            }
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [transclusionGhostId]);

    // Drag-and-drop file handling state
    const [isDraggingFile, setIsDraggingFile] = React.useState(false);

    // Handle file drag over
    // Handle file drag over
    const handleDragOver = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.types.includes("application/semantic-canvas-tool")) {
            e.dataTransfer.dropEffect = "copy";
            // Do NOT show file overlay for tools
            return;
        }

        if (e.dataTransfer.types.includes("Files")) {
            e.dataTransfer.dropEffect = "copy";
            setIsDraggingFile(true);
        }
    }, []);

    // Handle selection change (Sync with Store + Traceability)
    const onSelectionChange = React.useCallback(
        ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
            const { setHighlightedFragment, links, setSelectedItems } = useCanvasStore.getState();

            // 1. Sync React Flow selection to Store (for drag selection)
            // Note: This fires on every selection change (click, drag, etc.)
            // We need to map the selected nodes to our store structure
            const thingIds = selectedNodes
                .filter(n => n.type === 'thing')
                .map(n => n.id);
            const domainIds = selectedNodes
                .filter(n => n.type === 'domain')
                .map(n => n.id);

            // Only update if triggered by interaction that React Flow controls (like drag)
            // But since we control 'selected' prop, we must use our setters.
            // Using a batched setter to avoid tearing
            setSelectedItems(thingIds, domainIds);

            // 2. Traceability (Highlighting) logic
            // Priority 1: Selected Link
            if (selectedEdges.length === 1) {
                const edge = selectedEdges[0];
                const link = links.find(l => l.id === edge.id);
                // Check if link has source fragment data
                if (link && link.source_fragment) {
                    setHighlightedFragment({
                        thingId: link.source_id,
                        fragment: link.source_fragment
                    });
                    return;
                }
            }

            // Priority 2: Selected Node (Trace back to source)
            if (selectedNodes.length === 1) {
                const node = selectedNodes[0];
                // Find incoming links that have fragment data
                // We prioritize "related" links or just take the first one with data
                const incomingWithFragment = links.find(
                    l => l.target_id === node.id && l.source_fragment
                );

                if (incomingWithFragment) {
                    setHighlightedFragment({
                        thingId: incomingWithFragment.source_id,
                        fragment: incomingWithFragment.source_fragment
                    });
                    return;
                }
            }

            // If nothing matched, clear highlight
            setHighlightedFragment(null);
        },
        []
    );

    // Handle drag leave
    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Check if we're actually leaving the container, not just entering a child
        if (e.currentTarget.contains(e.relatedTarget as any)) {
            return;
        }

        setIsDraggingFile(false);
    }, []);

    // NUCLEAR OPTION: Global override to force allow dragging
    React.useEffect(() => {
        const handleGlobalDragOver = (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "copy";
            }
        };
        const handleGlobalDrop = (e: DragEvent) => {
            // Let the specific handler handle it, but prevent browser default (opening file)
            e.preventDefault();
        };

        window.addEventListener("dragover", handleGlobalDragOver);
        window.addEventListener("drop", handleGlobalDrop);

        return () => {
            window.removeEventListener("dragover", handleGlobalDragOver);
            window.removeEventListener("drop", handleGlobalDrop);
        };
    }, []);

    // Handle file drop - Upload to Asset Service
    const handleFileDrop = async (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingFile(false);

        // Check for Tool Drop (from Palette)
        const toolType = event.dataTransfer.getData("application/semantic-canvas-tool");
        const color = event.dataTransfer.getData("application/semantic-canvas-color") || undefined;
        if (toolType) {
            const { clientX, clientY } = event;
            const position = screenToFlowPosition({ x: clientX, y: clientY });

            // Ideally we'd center on cursor, but position is top-left.
            // Let's create center logic if needed, or just use click position.

            switch (toolType) {
                case "text":
                    setPendingDropPos(position);
                    setShowTextDialog(true);
                    break;
                case "url":
                    setPendingDropPos(position);
                    setShowUrlDialog(true);
                    break;
                case "domain":
                    setPendingDropPos(position);
                    setShowDomainDialog(true);
                    break;
                case "conversation":
                    // Check for drop collisions
                    const dropTargets: Array<{ id: string; type: string }> = [];

                    // 1. Check Drop Targets (Hit Tests)
                    const hitDomains = domains.filter(d => {
                        const xHit = position.x >= d.position_x && position.x <= d.position_x + (d.width || 300);
                        const yHit = position.y >= d.position_y - 40 && position.y <= d.position_y + (d.height || 200);
                        return xHit && yHit;
                    });

                    const hitThings = things.filter(t =>
                        position.x >= t.position_x &&
                        position.x <= t.position_x + (t.width || 400) &&
                        position.y >= t.position_y &&
                        position.y <= t.position_y + (t.height || 300)
                    );

                    // PRIORITY 1: Direct Manipulation (Dropped ON something)
                    if (hitDomains.length > 0) {
                        // Link to the top-most domain (last one)
                        dropTargets.push({ id: hitDomains[hitDomains.length - 1].id, type: 'domain' });
                        // EXPLICIT: Domain Grouping takes precedence. Do not check selection or things.
                    } else if (hitThings.length > 0) {
                        // Link to top-most thing
                        dropTargets.push({ id: hitThings[hitThings.length - 1].id, type: 'thing' });
                    } else {
                        // PRIORITY 2: Indirect Selection (Dropped on Empty Space)
                        // If dropped on empty space, use the current selection context
                        if (selectedThingIds.length > 0 || selectedDomainIds.length > 0) {
                            selectedThingIds.forEach(id => dropTargets.push({ id, type: 'thing' }));
                            selectedDomainIds.forEach(id => dropTargets.push({ id, type: 'domain' }));
                        }
                    }

                    await handleNewConversation(position, dropTargets, color);
                    break;
                case "import_conversation":
                    // TODO: Pass color to import dialog if needed, or just let it use default
                    setPendingDropPos(position);
                    setShowConversationDialog(true);
                    break;
                case "image":
                    // File picker uses center, which is fine.
                    imageInputRef.current?.click();
                    break;
                case "document":
                    documentInputRef.current?.click();
                    break;
                case "slideshow":
                    setPendingDropPos(position);
                    setShowImageSlidesDialog(true);
                    break;
                case "mcp_tool":
                    setPendingDropPos(position);
                    setShowMCPToolDialog(true);
                    break;
                case "archimate_tool":
                    await addThing(
                        "archimate_tool",
                        {},
                        position,
                        "ArchiMate Importer"
                    );
                    break;
            }
            return;
        }

        // Handle File Drop
        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) return;

        const { clientX, clientY } = event;
        const position = screenToFlowPosition({ x: clientX, y: clientY });

        // ... (Existing file processing logic, adapted to use drop position)
        for (const file of files) {
            if (file.type.startsWith("image/")) {
                const upload = await uploadFile(file);
                if (upload) {
                    await addThing(
                        "image",
                        {
                            filename: file.name,
                            file_path: upload.url,
                            asset_id: upload.id,
                            file_hash: upload.file_hash,
                        },
                        position, // Use drop position
                        file.name
                    );
                }
            } else {
                const textExtensions = ['.txt', '.md', '.json', '.xml', '.html', '.htm', '.yaml', '.yml', '.log'];
                const isTextFile = textExtensions.some(ext => file.name.toLowerCase().endsWith(ext)) ||
                    (file.type.startsWith('text/') && !file.type.includes('csv'));

                if (isTextFile) {
                    const text = await file.text();
                    await addThing(
                        "document",
                        {
                            filename: file.name,
                            content: text,
                        },
                        position,
                        file.name
                    );
                } else {
                    const upload = await uploadFile(file);
                    if (upload) {
                        await addThing(
                            "document",
                            {
                                filename: file.name,
                                file_path: upload.url,
                                asset_id: upload.id,
                                file_hash: upload.file_hash,
                                file_type: file.type,
                                file_size: file.size,
                            },
                            position,
                            file.name
                        );
                    }
                }
            }
        }
    };

    // Handle Context Menu Actions
    const handleContextMenuAction = React.useCallback(async (action: string, context: "canvas" | "domain" | "selection", domainId?: string, fragment?: any) => {
        // toast({ title: "Debug Action", description: action }); // Removed debug toast

        if (action === "discover_links") {
            const { selectedThingIds, selectedDomainIds, discoverLinks } = useCanvasStore.getState();
            let tIds: string[] = [];
            let dIds: string[] = [];

            if (context === "selection") {
                tIds = [...selectedThingIds];
                dIds = [...selectedDomainIds];
            } else if (context === "domain" && domainId) {
                dIds = [domainId];
            } else if (context === "canvas") {
                const { things, domains } = useCanvasStore.getState();
                tIds = things.filter(t => !t.domain_id).map(t => t.id);
                dIds = domains.map(d => d.id);
            }

            if (tIds.length === 0 && dIds.length === 0) {
                console.warn("No items selected for discovery");
                toast({
                    title: "Nothing to Analyze",
                    description: "No items present to discover links.",
                    variant: "default"
                });
                return;
            }

            const { id: toastId, update: updateToast } = toast({
                title: "Discovering Links",
                description: "Analyzing selection and building links... (this may take a moment)",
                duration: 1000000, // Persistent until updated
            });

            // Call store
            const result = await discoverLinks(tIds, dIds);

            if (result) {
                updateToast({
                    id: toastId,
                    title: "Discovery Complete",
                    description: `Found ${result.links_created} new links.`,
                    duration: 5000,
                });
            } else {
                updateToast({
                    id: toastId,
                    title: "Discovery Failed",
                    description: "Could not discover links. See console for details.",
                    variant: "destructive",
                    duration: 5000,
                });
            }
        } else if (action === "summary_analysis" || action === "identify_purpose") {
            const { selectedThingIds, selectedDomainIds, analyzeBatch, addThing, addLink, selectedModel } = useCanvasStore.getState();
            let tIds: string[] = [];

            if (context === "selection") {
                tIds = [...selectedThingIds];
                // Include things in domains if needed, but analyzeBatch expects thingIds
                // Let's grab things from domains too
                const { things } = useCanvasStore.getState();
                const thingsInDomains = things.filter(t => t.domain_id && selectedDomainIds.includes(t.domain_id)).map(t => t.id);
                tIds = [...new Set([...tIds, ...thingsInDomains])];
            } else if (context === "domain" && domainId) {
                const { things } = useCanvasStore.getState();
                tIds = things.filter(t => t.domain_id === domainId).map(t => t.id);
            } else if (context === "canvas") {
                const { things } = useCanvasStore.getState();
                tIds = things.filter(t => !t.domain_id).map(t => t.id);
            }

            if (tIds.length === 0) {
                toast({ title: "Nothing to analyze", description: "No items selected." });
                return;
            }

            toast({ title: "Analyzing...", description: "Processing selected items..." });

            // Map UI action to Backend API enum
            const apiAction = action === "summary_analysis" ? "summarize" : action;

            const result = await analyzeBatch(tIds, apiAction as "summarize" | "identify_purpose", selectedModel || undefined);

            if (result) {
                // Create a text note with the result
                // Calculate position relative to selection or center
                let pos = getCenterPosition();
                const newThing = await addThing(
                    "text",
                    { text: `** ${action === "identify_purpose" ? "Purposes" : "Summary"} Analysis **\n\n${result} ` },
                    pos,
                    `${action === "identify_purpose" ? "Purpose" : "Summary"} Analysis`
                );

                if (newThing) {
                    // Link new thing to all source things
                    for (const sourceId of tIds) {
                        await addLink(
                            newThing.id,
                            sourceId,
                            "derived_from" as any,
                            "Analysis Source",
                            "Source item used for this analysis"
                        );
                    }
                }

                toast({ title: "Analysis Complete", description: "Result added to canvas." });
            } else {
                console.error("[SummaryAnalysis] Result was empty or null.");
                toast({ title: "Analysis Failed", variant: "destructive" });
            }

        } else if (action.startsWith("reorder_")) {
            // Z-Order Reordering Actions
            const reorderAction = action.replace("reorder_", "") as "front" | "back" | "forward" | "backward";
            const { selectedThingIds, selectedDomainIds, reorderItem } = useCanvasStore.getState();

            // Reorder all selected things and domains
            const allIds = [...selectedThingIds, ...selectedDomainIds];

            if (allIds.length === 0) {
                toast({ title: "Nothing Selected", description: "Select items to reorder." });
                return;
            }

            for (const id of allIds) {
                await reorderItem(id, reorderAction);
            }

            toast({ title: "Reordered", description: `Items moved ${reorderAction}.` });

        } else if (action === "arrange_things") {
            const { selectedThingIds, things, selectedDomainIds, loadCanvas, canvasId } = useCanvasStore.getState();
            let tIds: string[] | undefined = undefined;

            if (context === "selection") {
                tIds = [...selectedThingIds];
                const thingsInDomains = things.filter(t => t.domain_id && selectedDomainIds.includes(t.domain_id)).map(t => t.id);
                tIds = [...new Set([...tIds, ...thingsInDomains])];
            } else if (context === "domain" && domainId) {
                tIds = things.filter(t => t.domain_id === domainId).map(t => t.id);
            } else {
                // Canvas context -> All things (pass undefined to service)
                tIds = undefined;
            }

            if (tIds && tIds.length === 0) {
                toast({ title: "Nothing to arrange", description: "No items selected." });
                return;
            }

            toast({ title: "Arranging Things", description: "Calculating optimal layout..." });

            try {
                if (canvasId) {
                    await layoutService.arrange({
                        canvas_id: canvasId,
                        thing_ids: tIds
                    });

                    // Refresh canvas
                    await loadCanvas(canvasId);
                    toast({ title: "Arrangement Complete", description: "Layout updated." });
                }
            } catch (e) {
                console.error("Layout failed", e);
                toast({ title: "Layout Failed", description: "Could not arrange things.", variant: "destructive" });
            }

        } else if (action.startsWith("execute_template:")) {
            const templateId = action.split(":")[1];
            const { selectedThingIds, selectedDomainIds, things, domains, selectedModel, visionModel } = useCanvasStore.getState();
            let tIds: string[] = [];
            let dIds: string[] = [];

            if (context === "selection") {
                tIds = [...selectedThingIds];
                dIds = [...selectedDomainIds];
            } else if (context === "domain" && domainId) {
                dIds = [domainId];
            } else if (context === "canvas") {
                tIds = things.filter(t => !t.domain_id).map(t => t.id);
                dIds = domains.map(d => d.id);
            }

            if (tIds.length === 0 && dIds.length === 0) {
                toast({
                    title: "No items selected",
                    description: "Please select items to analyze.",
                    variant: "destructive"
                });
                return;
            }

            const { id: toastId, update: updateToast, dismiss: dismissToast } = toast({
                title: "Starting Analysis",
                description: "Initializing pipeline...",
                duration: 1000000, // Keep open
            });

            // Determine Model to use (LLM or VLM)
            let activeModel = selectedModel;
            const targetThings = things.filter(t => tIds.includes(t.id));
            const hasVisualContent = targetThings.some(t => t.type === "image" || t.type === "video" || t.type === "slideshow");

            // Priority:
            // 1. Fragment is Region (Visual) -> VLM
            // 2. Fragment is Text -> LLM (even if on image, we want text analysis usually, though VLM is fine too. Let's stick to LLM for text)
            // 3. No Fragment, Has Visual Content -> VLM

            if (fragment && fragment.type === "region") {
                activeModel = visionModel || selectedModel;
            } else if (!fragment && hasVisualContent) {
                activeModel = visionModel || selectedModel;
            }
            updateToast({ id: toastId, description: `Starting pipeline(Model: ${activeModel || 'Default'})...` });

            try {
                const token = localStorage.getItem("token");
                const response = await fetch(`${API_URL}/canvases/${canvasId}/execute-template/stream`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        template_id: templateId,
                        thing_ids: tIds,
                        canvas_id: canvasId,
                        model: activeModel,
                        source_fragment: fragment ? {
                            ...fragment,
                            start_offset: (fragment as any).startOffset,
                            end_offset: (fragment as any).endOffset,
                            page_number: (fragment as any).pageNumber,
                            message_id: (fragment as any).messageId
                        } : undefined
                    })
                });

                if (!response.ok) throw new Error("Failed to start analysis");
                if (!response.body) throw new Error("No response body");

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const event = JSON.parse(line);

                            if (event.type === "step_start") {
                                const stepName = event.step.node_label || event.step.node_type;
                                updateToast({
                                    id: toastId,
                                    title: "Running Analysis...",
                                    description: `Executing Step: ${stepName} `,
                                    duration: 1000000,
                                });
                            } else if (event.type === "complete") {
                                const result = event.data;
                                if (result.status === "completed") {
                                    updateToast({
                                        id: toastId,
                                        title: "Analysis Completed",
                                        description: "Template executed successfully.",
                                        duration: 5000,
                                    });
                                    // Refresh things to show new results/content
                                    useCanvasStore.getState().refreshThings();
                                } else {
                                    updateToast({
                                        id: toastId,
                                        title: "Analysis Failed",
                                        description: result.error || "Unknown error",
                                        variant: "destructive",
                                        duration: 5000,
                                    });
                                }
                            } else if (event.type === "node_created") {
                                const newNode = event.node;
                                // Convert to partial Thing format expected by store or use validation
                                // Assuming store.addThing handles the node as returned by backend
                                // Use addServerThing to just update local state without POST
                                useCanvasStore.getState().addServerThing(newNode as any);
                                // Cast to any because backend event might be slightly different type shape, but store expects CanvasThing.
                                // It should be compatible.

                                // Also refresh links if they were created server-side but not pushed
                                // Or we can manually push links if the event contained them. 
                                // Since backend creates links, a full refresh might be safest, 
                                // but let's try to be responsive.
                                // If the backend sent links, we could add them.
                                // For now, let's trigger a refresh of links just in case, 
                                // or rely on refreshThings() called in 'complete' (wait, 'complete' happens BEFORE 'node_created'?)
                                // Backend logic: yield 'complete' -> yield 'node_created'.
                                // But 'complete' event handling in frontend currently calls refreshThings()

                                // Issue: Frontend receives 'complete', refreshes. DB might NOT have the node yet (if commit is slow).
                                // THEN Frontend receives 'node_created'.

                                // Better approach: Remove refreshThings from 'complete' and do it on 'node_created' OR 'complete' (with backend change).
                                // But I can't change the order easily without buffering.

                                // Safe fix: On 'node_created', force a refresh OR add to local state.
                                // Adding to local state is instant.

                                // We'll assume addThing updates the UI.
                            } else if (event.type === "error") {
                                updateToast({
                                    id: toastId,
                                    title: "Analysis Error",
                                    description: event.content,
                                    variant: "destructive",
                                    duration: 5000,
                                });
                            }
                        } catch (e) {
                            console.error("Error parsing stream event:", e);
                        }
                    }
                }
            } catch (err: any) {
                console.error("Streaming error:", err);
                updateToast({
                    id: toastId,
                    title: "Analysis Error",
                    description: err.message || "Failed to execute template.",
                    variant: "destructive",
                    duration: 5000,
                });
            }
        }
    }, []);

    // =============================================================================
    // Migrated Toolbar State & Logic
    // =============================================================================
    const { conversations, createNewConversation, setActiveConversationId } = useConversation();
    const { setViewMode } = useViewMode();

    // Dialog states
    // Modals
    const [showTextDialog, setShowTextDialog] = React.useState(false);
    const [showDomainDialog, setShowDomainDialog] = React.useState(false);
    const [showUrlDialog, setShowUrlDialog] = React.useState(false);
    const [showConversationDialog, setShowConversationDialog] = React.useState(false);
    const [showImageSlidesDialog, setShowImageSlidesDialog] = React.useState(false);
    const [showMCPToolDialog, setShowMCPToolDialog] = React.useState(false);

    // Track drop position for dialog-based creation
    const [pendingDropPos, setPendingDropPos] = React.useState<{ x: number, y: number } | null>(null);

    // Form states
    const [textContent, setTextContent] = React.useState("");
    const [domainName, setDomainName] = React.useState("");
    const [domainDescription, setDomainDescription] = React.useState("");
    const [urlContent, setUrlContent] = React.useState("");
    const [scrapeDepth, setScrapeDepth] = React.useState(0);
    const [warnExternal, setWarnExternal] = React.useState(true);
    const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(null);

    // MCP Tool Creation Handler
    const handleAddMCPTool = async (config: MCPToolConfig) => {
        await addThing(
            "mcp_tool",
            {
                server_id: config.server_id,
                server_name: config.server_name,
                tool_name: config.tool_name,
                tool_description: config.tool_description,
                arguments: config.arguments,
                inputSchema: config.inputSchema,
                status: "ready"
            },
            pendingDropPos || getCenterPosition(),
            config.tool_name
        );
        setShowMCPToolDialog(false);
        setPendingDropPos(null);
    };

    // File input refs
    const imageInputRef = React.useRef<HTMLInputElement>(null);
    const documentInputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);

    // Calculate center position for new items (helper)
    const getCenterPosition = () => ({
        x: -viewport.x + 400,
        y: -viewport.y + 300,
    });

    // Add text note
    const handleAddText = async () => {
        if (!textContent.trim()) return;

        await addThing(
            "text",
            { text: textContent },
            pendingDropPos || getCenterPosition(),
            textContent.slice(0, 30),
            undefined, // width
            undefined, // height
            undefined, // domainId
            undefined  // color
        );

        setTextContent("");
        setShowTextDialog(false);
        setPendingDropPos(null);
    };

    // Add URL
    const handleAddUrl = async () => {
        if (!urlContent.trim()) return;

        // Position at pendingDropPos or center
        const position = pendingDropPos || getCenterPosition();

        await addThing(
            "url",
            { url: urlContent.trim() },
            position,
            urlContent.trim(),
            undefined,
            undefined,
            undefined,
            undefined,
            {
                depth: scrapeDepth,
                warn_external: warnExternal
            }
        );
        setUrlContent("");
        setScrapeDepth(0); // Reset after add
        setPendingDropPos(null);
        setShowUrlDialog(false);
    };

    // Add domain
    const handleAddDomain = async () => {
        if (!domainName.trim() || !domainDescription.trim()) return;

        const dropPos = pendingDropPos || getCenterPosition();

        // Detect if dropping inside an existing domain
        const checkDomainInDomain = useCanvasStore.getState().checkDomainInDomain;
        // Use a temporary ID to check (we don't have the real ID yet)
        // We need a simpler check that just finds containing domain
        let parentId: string | null = null;
        for (const domain of domains) {
            if (
                dropPos.x >= domain.position_x &&
                dropPos.x <= domain.position_x + (domain.width || 300) &&
                dropPos.y >= domain.position_y - 40 &&
                dropPos.y <= domain.position_y + (domain.height || 200)
            ) {
                // Check if this domain is deeper than current candidate
                const depth = getHierarchyDepth(domain.id);
                const currentDepth = parentId ? getHierarchyDepth(parentId) : -1;
                if (depth > currentDepth) {
                    parentId = domain.id;
                }
            }
        }

        await addDomain(
            domainName,
            domainDescription,
            dropPos,
            "#6366f1",
            parentId
        );

        setDomainName("");
        setDomainDescription("");
        setShowDomainDialog(false);
        setPendingDropPos(null);
    };

    // Create new conversation and add to canvas
    const handleNewConversation = async (position?: { x: number; y: number }, autoLinkTargets: Array<{ id: string; type: string }> = [], color?: string) => {
        const newConvId = await createNewConversation();
        if (newConvId) {
            const pos = position || getCenterPosition();

            // Detect Domain Grouping
            const targetDomain = autoLinkTargets.find(t => t.type === 'domain');
            const nestedDomainId = targetDomain ? targetDomain.id : undefined;

            const newThing = await addThing(
                "conversation",
                {
                    conversation_id: newConvId,
                    messages: [],
                },
                pos,
                "New Conversation",
                undefined, // width
                undefined, // height
                undefined, // domainId (No containment, just linking)
                color
            );

            if (newThing) {
                setActiveConversationId(newConvId);

                // Auto-link logic (Link to ALL drop targets, including domains)
                // This satisfies "Linked with the domain" requirement
                if (autoLinkTargets.length > 0) {
                    for (const target of autoLinkTargets) {
                        await addLink(newThing.id, target.id, "related", "Context", "Context for this conversation");
                    }
                }
            }
        }
    };

    // Add existing conversation to canvas
    const handleAddExistingConversation = async () => {
        if (!selectedConversationId) return;

        const conversation = conversations.find(c => c.id === selectedConversationId);
        if (!conversation) return;

        await addThing(
            "conversation",
            {
                conversation_id: conversation.id,
                messages: conversation.messages || [],
            },
            pendingDropPos || getCenterPosition(),
            conversation.title || "Conversation"
        );

        setSelectedConversationId(null);
        setShowConversationDialog(false);
        setPendingDropPos(null);
    };

    // Handle file selection from file picker
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        // Reuse handleFileDrop logic or call uploadFile directly?
        // Since handleFileDrop is complex and tied to drag events, let's reuse a simple uploader
        // DO NOT DUPLICATE uploadFile logic here. We can expose a helper or just copy the simple upload.
        // For now, let's just trigger the same logic as drag-drop but we need to mock the event or extract logic.
        // Extraction is better.
        // Actually, let's just use the logic from toolbar.

        // ... (We need uploadFile helper reused)
    };

    // Helper to upload file (from Toolbar migration)
    const uploadFile = async (file: File): Promise<{ id: string; url: string; file_hash?: string } | null> => {
        try {
            const formData = new FormData();
            formData.append("file", file);

            const token = localStorage.getItem("token");
            const headers: HeadersInit = {};
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const response = await fetch(`${API_URL}/assets/upload`, {
                method: "POST",
                headers,
                body: formData,
            });

            if (!response.ok) throw new Error(`Upload failed: ${response.statusText} `);

            const data = await response.json();
            return { id: data.id, url: data.url, file_hash: data.file_hash };
        } catch (error) {
            console.error("Failed to upload file:", error);
            return null;
        }
    };

    const processFiles = async (files: File[]) => {
        for (const file of files) {
            // ... (Simple processing logic)
            if (file.type.startsWith("image/")) {
                const upload = await uploadFile(file);
                if (upload) {
                    await addThing(
                        "image",
                        {
                            filename: file.name,
                            file_path: upload.url,
                            asset_id: upload.id,
                        },
                        getCenterPosition(),
                        file.name
                    );
                }
            } else {
                // Document logic
                // ...
                const textExtensions = ['.txt', '.md', '.json', '.xml', '.html', '.htm', '.yaml', '.yml', '.log'];
                const isTextFile = textExtensions.some(ext => file.name.toLowerCase().endsWith(ext)) ||
                    (file.type.startsWith('text/') && !file.type.includes('csv'));

                if (isTextFile) {
                    const text = await file.text();
                    await addThing(
                        "document",
                        {
                            filename: file.name,
                            content: text,
                        },
                        getCenterPosition(),
                        file.name
                    );
                } else {
                    const upload = await uploadFile(file);
                    if (upload) {
                        await addThing(
                            "document",
                            {
                                filename: file.name,
                                file_path: upload.url,
                                asset_id: upload.id,
                                file_type: file.type,
                                file_size: file.size,
                            },
                            getCenterPosition(),
                            file.name
                        );
                    }
                }
            }
        }
    };


    const handleImageSelectReused = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        await processFiles(files);
        if (e.target) e.target.value = "";
    };

    const handleDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        await processFiles(files);
        if (e.target) e.target.value = "";
    };

    const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        // Filter for images
        const imageFiles = files
            .filter(f => f.type.startsWith("image/"))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        if (imageFiles.length === 0) {
            alert("No images found in the selected folder.");
            return;
        }

        // Upload all images
        const uploadedSlides = [];
        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];
            const upload = await uploadFile(file);
            if (upload) {
                uploadedSlides.push({
                    index: i,
                    elements: [
                        {
                            id: `img - ${i} `,
                            type: "IMAGE",
                            x: 0,
                            y: 0,
                            w: 1,
                            h: 1,
                            src: upload.url
                        }
                    ],
                    image_asset_id: upload.id
                });
            }
        }

        if (uploadedSlides.length > 0) {
            await addThing(
                "slideshow",
                {
                    source_type: "image_folder",
                    total_slides: uploadedSlides.length,
                    slides: uploadedSlides
                },
                pendingDropPos || getCenterPosition(),
                "Image Slideshow"
            );
        }

        setShowImageSlidesDialog(false);
        setPendingDropPos(null);
        if (e.target) e.target.value = "";
    };

    const handleCaptureThumbnail = async () => {
        const node = document.querySelector(".react-flow__viewport") as HTMLElement;
        if (!node) return;

        // Use a toast to indicate processing
        toast({ title: "Capturing Preview", description: "Generating canvas thumbnail..." });

        try {
            const dataUrl = await domToImage.toPng(node, {
                bgcolor: '#f8fafc', // match bg-slate-50
                quality: 0.8,
                // We capture the viewport transform div, so it respects current zoom/pan
                // But typically users want a "clean" shot.
                // If we grab .react-flow__viewport, we get the huge canvas layer.
                // If we grab .react-flow (container), we get what's on screen (cropped).
                // Let's grab the container for a true "thumbnail" of the current view.
            });

            // Actually, let's grab the container to avoid massive image generation of the infinite canvas
            const containerNode = document.querySelector(".react-flow") as HTMLElement;
            if (!containerNode) return;

            const dataUrlContainer = await domToImage.toPng(containerNode, {
                bgcolor: '#f8fafc',
                quality: 0.8,
                width: 800, // Force a reasonable thumbnail size? No, dom-to-image uses node size. 
                // We can scale it down if needed, but let's just store the screenshot.
                // Ideally we resize this before sending to server to save bandwidth/storage.
            });

            // Update settings (merge with existing)
            const currentSettings = useCanvasStore.getState().canvasSettings || {};
            await useCanvasStore.getState().updateCanvasSettings({
                ...currentSettings,
                thumbnail: dataUrlContainer
            });

            toast({ title: "Thumbnail Updated", description: "Canvas preview saved." });
        } catch (error) {
            console.error("Thumbnail capture failed:", error);
            toast({ title: "Capture Failed", description: "Could not generate thumbnail.", variant: "destructive" });
        }
    };

    return (
        <div className="h-full w-full flex flex-col relative">
            {/* Canvas Header with Model Selector */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-slate-900 shrink-0">
                <div id="canvas-model-selectors" className="flex items-center">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Brain className="h-4 w-4" />
                        <span>Model:</span>
                        {isLoadingModels ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Select
                                value={selectedModel || ""}
                                onValueChange={(value) => {
                                    setSelectedModel(value);
                                    useCanvasStore.getState().updateCanvasSettings({ model: value });
                                }}
                            >
                                <SelectTrigger className="w-[200px] h-8 text-sm">
                                    <SelectValue placeholder="Select model..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {models.map((model) => (
                                        <SelectItem key={model.name} value={model.name}>
                                            <div className="flex items-center gap-2">
                                                <span>{model.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    ({model.type})
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Vision Model Selector */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground border-l pl-4 ml-4">
                        <Eye className="h-4 w-4" />
                        <span>Vision:</span>
                        {isLoadingModels ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Select
                                value={visionModel || ""}
                                onValueChange={(value) => {
                                    setVisionModel(value);
                                    useCanvasStore.getState().updateCanvasSettings({ vision_model: value });
                                }}
                            >
                                <SelectTrigger className="w-[200px] h-8 text-sm">
                                    <SelectValue placeholder="Select vision model..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {models.filter(m => m.is_vision).map((model) => (
                                        <SelectItem key={model.name} value={model.name}>
                                            <div className="flex items-center gap-2">
                                                <span>{model.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    ({model.type})
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                    {models.filter(m => m.is_vision).length === 0 && (
                                        <div className="p-2 text-xs text-muted-foreground">
                                            No vision models configured
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>

                {/* Selection Mode Toggle */}
                <div className="flex items-center gap-1 border-l pl-4 ml-4 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-md">
                    <Button
                        variant={selectionMode === "hand" ? "secondary" : "ghost"}
                        size="sm"
                        className={cn("h-8 w-8 p-0", selectionMode === "hand" && "bg-white dark:bg-slate-700 shadow-sm")}
                        onClick={() => setSelectionMode("hand")}
                        title="Hand Tool (Pan) - Hold Shift to Select"
                    >
                        <Hand className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={selectionMode === "selection" ? "secondary" : "ghost"}
                        size="sm"
                        className={cn("h-8 w-8 p-0", selectionMode === "selection" && "bg-white dark:bg-slate-700 shadow-sm")}
                        onClick={() => setSelectionMode("selection")}
                        title="Pointer Tool (Select) - Drag to Select"
                    >
                        <MousePointer2 className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex items-center gap-2 border-l pl-4 ml-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-slate-500 hover:text-blue-600"
                        onClick={handleCaptureThumbnail}
                        title="3D orientation thumbnail"
                    >
                        <Camera className="h-4 w-4 mr-2" />
                        3D capture
                    </Button>
                </div>

                {/* Global Link Visibility Toggle */}
                <div className="flex items-center gap-2 border-l pl-4 ml-4">
                    <div className="flex items-center gap-2">
                        <Label htmlFor="links-toggle" className="text-xs font-medium text-slate-500 cursor-pointer">
                            Links
                        </Label>
                        <Switch
                            id="links-toggle"
                            checked={showLinks}
                            onCheckedChange={toggleShowLinks}
                        />
                    </div>
                </div>

                {/* Semantic Zoom Toggle & Level Display */}
                <div className="flex items-center gap-4 border-l pl-4 ml-4 h-8">
                    <div className="flex items-center gap-2">
                        <Label htmlFor="semantic-toggle" className="text-xs font-medium text-slate-500 cursor-pointer">
                            Semantic
                        </Label>
                        <Switch
                            id="semantic-toggle"
                            checked={semanticZoomEnabled}
                            onCheckedChange={setSemanticZoomEnabled}
                        />
                    </div>

                    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500 tabular-nums min-w-[45px] justify-center">
                        {Math.round(viewport.zoom * 100)}%
                    </div>
                </div>

                <div className="flex items-center gap-2 border-l pl-4 ml-4">
                    <Button
                        id="canvas-sync-btn"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-slate-500 hover:text-green-600"
                        onClick={async () => {
                            const confirmed = window.confirm(
                                "Sync All Files?\n\n" +
                                "This will check all file-based items on the canvas for changes and re-ingest them if necessary.\n" +
                                "This process may take some time."
                            );
                            if (confirmed) {
                                toast({
                                    title: "Syncing All Items",
                                    description: "Checking and updating all files...",
                                    duration: 3000,
                                });
                                try {
                                    // @ts-ignore - syncAllThings is dynamic
                                    await useCanvasStore.getState().syncAllThings();
                                    toast({
                                        title: "Sync Complete",
                                        description: "All items have been synced.",
                                        duration: 3000,
                                    });
                                    // Refresh the list to reflect status
                                    useCanvasStore.getState().refreshThings();
                                } catch (error) {
                                    toast({
                                        title: "Sync Failed",
                                        description: "An error occurred while syncing items.",
                                        variant: "destructive",
                                    });
                                }
                            }
                        }}
                        title="Sync All Files"
                    >
                        <RefreshCcw className="h-4 w-4 mr-2" />
                        Sync All
                    </Button>

                    <div className="h-6 w-px bg-border mx-2" />

                    {/* Delete Selected Button */}
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 shadow-sm"
                                disabled={selectedThingIds.length === 0 && selectedDomainIds.length === 0}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete ({selectedThingIds.length + selectedDomainIds.length})
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Selected Items?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently delete {selectedThingIds.length} things and {selectedDomainIds.length} domains.
                                    Any associated assets will also be removed. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => deleteSelectedNodes()}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            {/* Workspace with Docking Support and Palette */}
            <div className="flex-1 flex flex-row overflow-hidden relative">
                {/* Main Interaction Area (Docks + Canvas) */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Top Docked Content */}
                    {dockedThingId && dockPosition === 'top' && (
                        <>
                            <div
                                className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 shadow-xl overflow-hidden relative group"
                                style={{ height: dockHeight }}
                            >
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 bg-white/80 dark:bg-slate-800/80 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        onClick={() => setDockedThing(null, null)}
                                    >
                                        <X className="h-4 w-4 text-slate-500 hover:text-red-500" />
                                    </Button>
                                </div>
                                <div className="h-full overflow-auto p-4">
                                    {renderDockedThing(dockedThingId)}
                                </div>
                            </div>
                            {/* Horizontal Splitter */}
                            <div
                                className="h-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-row-resize transition-colors z-20"
                                onMouseDown={() => setIsResizing(true)}
                            />
                        </>
                    )}

                    {/* Middle Section (Left Dock + Canvas + Right Dock) */}
                    <div className="flex-1 flex flex-row overflow-hidden relative">
                        {/* Left Docked Content */}
                        {dockedThingId && dockPosition === 'left' && (
                            <>
                                <div
                                    className="bg-white dark:bg-slate-900 border-r dark:border-slate-800 shadow-xl overflow-hidden relative group"
                                    style={{ width: dockWidth }}
                                >
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 bg-white/80 dark:bg-slate-800/80 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            onClick={() => setDockedThing(null, null)}
                                        >
                                            <X className="h-4 w-4 text-slate-500 hover:text-red-500" />
                                        </Button>
                                    </div>
                                    <div className="h-full overflow-auto p-4">
                                        {renderDockedThing(dockedThingId)}
                                    </div>
                                </div>
                                {/* Vertical Splitter */}
                                <div
                                    className="w-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-col-resize transition-colors z-20"
                                    onMouseDown={() => setIsResizing(true)}
                                />
                            </>
                        )}

                        {/* Main React Flow Canvas */}
                        <div
                            id="canvas-area"
                            className={cn(
                                "flex-1 relative",
                                isDraggingFile && "ring-4 ring-inset ring-blue-400 bg-blue-50/50 dark:bg-blue-950/30"
                            )}
                            onContextMenu={handlePaneContextMenu}
                            onDragOverCapture={handleDragOver}
                            onDragEnterCapture={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleFileDrop}
                        >
                            {/* Drop zone overlay */}
                            {isDraggingFile && (
                                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                                    <div className="bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg text-lg font-medium">
                                        Drop files to add to canvas
                                    </div>
                                </div>
                            )}

                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                onNodesChange={handleNodesChange}
                                onEdgesChange={onEdgesChange}
                                onMove={onMoveEnd}
                                onEdgesDelete={handleEdgesDelete}
                                onConnect={onConnect}
                                onNodeDragStart={onNodeDragStart}
                                onNodeDragStop={onNodeDragStop}
                                onNodeClick={onNodeClick}
                                onEdgeClick={onEdgeClick}
                                onSelectionChange={onSelectionChange}
                                onPaneClick={onPaneClick}
                                onNodeContextMenu={onNodeContextMenu}
                                onDragOver={handleDragOver}
                                onDrop={handleFileDrop}
                                nodeTypes={nodeTypes}
                                edgeTypes={edgeTypesMemo}
                                minZoom={0.1}
                                maxZoom={2}
                                defaultViewport={viewport}
                                onSelectionDragStart={onSelectionDragStart}
                                onSelectionDragStop={onSelectionDragStop}
                                selectNodesOnDrag={true}
                                panOnDrag={selectionMode === "hand" ? true : [1, 2]}
                                selectionOnDrag={selectionMode === "selection"}
                                selectionKeyCode={selectionMode === "selection" ? null : "Shift"}
                                multiSelectionKeyCode="Shift"
                                nodesDraggable={true}
                                nodesConnectable={true}
                                elementsSelectable={true}
                                className="bg-slate-50 dark:bg-slate-950"
                            >
                                <Background gap={20} size={1} />
                                <Controls />
                                <MiniMap
                                    nodeStrokeWidth={3}
                                    zoomable
                                    pannable
                                    className="!bg-white dark:!bg-slate-900"
                                />
                            </ReactFlow>

                            <LinkTypeDialog
                                isOpen={linkDialogOpen}
                                onClose={() => {
                                    setLinkDialogOpen(false);
                                    setPendingConnection(null);
                                    setEditingLink(null);
                                }}
                                onConfirm={editingLink ? handleUpdateLink : handleCreateLink}
                                onDelete={editingLink ? handleDeleteLink : undefined}
                                initialType={editingLink?.type || "related"}
                                initialLabel={editingLink?.label || ""}
                                initialDescription={editingLink?.description || ""}
                                mode={editingLink ? "edit" : "create"}
                            />

                            <CanvasContextMenu
                                isOpen={contextMenuOpen}
                                position={contextMenuPosition}
                                context={contextMenuContext}
                                domainId={contextMenuDomainId}
                                onClose={() => setContextMenuOpen(false)}
                                onAction={handleContextMenuAction}
                            />
                        </div>

                        {/* Right Docked Content (Inside Palette) */}
                        {dockedThingId && dockPosition === 'right' && (
                            <>
                                {/* Vertical Splitter */}
                                <div
                                    className="w-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-col-resize transition-colors z-20"
                                    onMouseDown={() => setIsResizing(true)}
                                />
                                <div
                                    className="bg-white dark:bg-slate-900 border-l dark:border-slate-800 shadow-xl overflow-hidden relative group"
                                    style={{ width: dockWidth }}
                                >
                                    <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 bg-white/80 dark:bg-slate-800/80 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            onClick={() => setDockedThing(null, null)}
                                        >
                                            <X className="h-4 w-4 text-slate-500 hover:text-red-500" />
                                        </Button>
                                    </div>
                                    <div className="h-full overflow-auto p-4">
                                        {renderDockedThing(dockedThingId)}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Bottom Docked Content */}
                    {dockedThingId && dockPosition === 'bottom' && (
                        <>
                            {/* Horizontal Splitter */}
                            <div
                                className="h-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-row-resize transition-colors z-20"
                                onMouseDown={() => setIsResizing(true)}
                            />
                            <div
                                className="bg-white dark:bg-slate-900 border-t dark:border-slate-800 shadow-xl overflow-hidden relative group"
                                style={{ height: dockHeight }}
                            >
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 bg-white/80 dark:bg-slate-800/80 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        onClick={() => setDockedThing(null, null)}
                                    >
                                        <X className="h-4 w-4 text-slate-500 hover:text-red-500" />
                                    </Button>
                                </div>
                                <div className="h-full overflow-auto p-4">
                                    {renderDockedThing(dockedThingId)}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Rightmost Sidebar Palette */}
                <CanvasPalette />
            </div>

            {/* Hidden Input Refs (Migrated from Toolbar) */}
            <input
                type="file"
                ref={imageInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageSelectReused}
                multiple
            />
            <input
                type="file"
                ref={documentInputRef}
                accept=".txt,.md,.json,.csv,.xml,.html,.pdf,.doc,.docx"
                className="hidden"
                onChange={handleDocumentSelect}
                multiple
            />
            <input
                type="file"
                ref={folderInputRef}
                // @ts-ignore - webkitdirectory is not standard but supported
                webkitdirectory=""
                directory=""
                className="hidden"
                onChange={handleFolderSelect}
                multiple
            />

            {/* Tool Dialogs (Migrated from Toolbar) */}
            <Dialog open={showTextDialog} onOpenChange={setShowTextDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Text Note</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Textarea
                            value={textContent}
                            onChange={(e) => setTextContent(e.target.value)}
                            placeholder="Enter your text..."
                            rows={5}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowTextDialog(false)}>Cancel</Button>
                        <Button onClick={handleAddText}>Add</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showUrlDialog} onOpenChange={setShowUrlDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add URL</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>URL</Label>
                            <Input
                                value={urlContent}
                                onChange={(e) => setUrlContent(e.target.value)}
                                placeholder="https://..."
                            />
                        </div>
                        <div className="space-y-4 pt-2">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium">Scrape Depth</Label>
                                    <p className="text-xs text-muted-foreground">How many internal link levels to follow (0 = current page only)</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        className="flex h-9 w-20 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={scrapeDepth}
                                        onChange={(e) => setScrapeDepth(parseInt(e.target.value))}
                                    >
                                        <option value={0}>0</option>
                                        <option value={1}>1</option>
                                        <option value={2}>2</option>
                                        <option value={3}>3</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium">Internal Navigation Only</Label>
                                    <p className="text-xs text-muted-foreground">Warn before jumping to external (non-scraped) sites</p>
                                </div>
                                <Switch
                                    checked={warnExternal}
                                    onCheckedChange={setWarnExternal}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowUrlDialog(false)}>Cancel</Button>
                        <Button onClick={handleAddUrl}>Add</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showDomainDialog} onOpenChange={setShowDomainDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Domain</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Domain Name <span className="text-red-500">*</span></Label>
                            <Input
                                value={domainName}
                                onChange={(e) => setDomainName(e.target.value)}
                                placeholder="Research, Projects, Ideas..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description <span className="text-red-500">*</span></Label>
                            <Textarea
                                value={domainDescription}
                                onChange={(e) => setDomainDescription(e.target.value)}
                                placeholder="Describe the purpose of this domain..."
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDomainDialog(false)}>Cancel</Button>
                        <Button
                            onClick={handleAddDomain}
                            disabled={!domainName.trim() || !domainDescription.trim()}
                        >
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showConversationDialog} onOpenChange={setShowConversationDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Import Conversation</DialogTitle>
                        <DialogDescription>
                            Select a conversation to add to your canvas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[300px] overflow-y-auto">
                        {conversations.length === 0 ? (
                            <div className="text-center text-muted-foreground text-sm py-4">
                                No conversations found.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {conversations.map((conv) => (
                                    <div
                                        key={conv.id}
                                        className={cn(
                                            "p-3 rounded-md border cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors",
                                            selectedConversationId === conv.id && "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                        )}
                                        onClick={() => setSelectedConversationId(conv.id)}
                                    >
                                        <div className="font-medium text-sm truncate">{conv.title || "Untitled Conversation"}</div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {new Date(conv.created_at).toLocaleDateString()} · {conv.messages?.length || 0} messages
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowConversationDialog(false)}>Cancel</Button>
                        <Button onClick={handleAddExistingConversation} disabled={!selectedConversationId}>Import</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* MCP Tool Dialog */}
            <MCPToolConfigDialog
                open={showMCPToolDialog}
                onOpenChange={setShowMCPToolDialog}
                onConfirm={handleAddMCPTool}
            />

            <Dialog open={showImageSlidesDialog} onOpenChange={setShowImageSlidesDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Import Image Slides</DialogTitle>
                        <DialogDescription>
                            Create a slideshow from a folder of images (PNG, JPG).
                            Ensure your slides are exported as images in a single folder.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 flex flex-col items-center gap-4 text-center">
                        <FolderOpen className="h-12 w-12 text-blue-500 opacity-80" />
                        <p className="text-sm text-muted-foreground">
                            Select the folder containing your slide images.<br />
                            They will be ordered by filename.
                        </p>
                        <Button onClick={() => folderInputRef.current?.click()}>
                            Select Folder
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowImageSlidesDialog(false)}>Cancel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ContextualTrainer
                workflowId="canvas_walkthrough"
                steps={CANVAS_TRAINER_STEPS}
            />

            {/* Ghost Element Overlay */}
            {ghostThing && ghostPos && (
                <div
                    className="fixed pointer-events-none z-50 flex items-center gap-2 px-3 py-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur border-2 border-purple-500 rounded-lg shadow-xl transform -translate-x-1/2 -translate-y-1/2"
                    style={{ left: ghostPos.x, top: ghostPos.y }}
                >
                    <LinkIcon className="w-4 h-4 text-purple-500 animate-pulse" />
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{ghostThing.title || "Untitled"}</span>
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">Click a Text editor to place</span>
                    </div>
                </div>
            )}
        </div >
    );
}

const CANVAS_TRAINER_STEPS: TrainerStep[] = [
    {
        targetId: "canvas-palette",
        title: "Tools & Palette",
        content: <p>Drag and drop items from here to create content on your canvas, including Notes, URLs, and new Conversations.</p>,
        position: "left"
    },
    {
        targetId: "canvas-model-selectors",
        title: "AI & Vision Models",
        content: <p>Select which AI models to use for this canvas. You can choose different models for text generation (LLM) and image analysis (Vision).</p>,
        position: "bottom"
    },
    {
        targetId: "canvas-area",
        title: "Infinite Workspace",
        content: <p>This is your infinite canvas. Double-click anywhere to create a note, or drag files directly onto the surface.</p>,
        position: "top"
    },
    {
        targetId: "canvas-sync-btn",
        title: "Sync Files",
        content: <p>If you've modified local files that are on the canvas, click this to re-process and update them.</p>,
        position: "bottom"
    }
];

// =============================================================================
// Canvas View (with Provider)
// =============================================================================

interface CanvasViewProps {
    canvasId?: string;
}

export function CanvasView({ canvasId: propCanvasId }: CanvasViewProps) {
    const { loadCanvas, createCanvas, canvasId: storeCanvasId, error } = useCanvasStore();
    const [isInitialized, setIsInitialized] = React.useState(false);
    const [authError, setAuthError] = React.useState(false);
    const [selectedCanvasId, setSelectedCanvasId] = React.useState<string | undefined>(propCanvasId);

    // Check for auth token
    const hasToken = typeof window !== "undefined" && !!localStorage.getItem("token");

    // Listen for canvas selection events from sidebar
    React.useEffect(() => {
        const handleCanvasSelect = (event: CustomEvent<{ canvasId: string }>) => {
            setSelectedCanvasId(event.detail.canvasId);
            setIsInitialized(false);
        };

        window.addEventListener(
            "canvas-select",
            handleCanvasSelect as EventListener
        );

        return () => {
            window.removeEventListener(
                "canvas-select",
                handleCanvasSelect as EventListener
            );
        };
    }, []);

    // Load or create canvas on mount or when selection changes
    React.useEffect(() => {
        let mounted = true;

        const init = async () => {
            // Check for authentication first
            if (!hasToken) {
                setAuthError(true);
                if (mounted) setIsInitialized(true);
                return;
            }

            // If a specific canvas is selected, load it
            if (selectedCanvasId) {
                // Prevent infinite loop: if this canvas is already loaded, don't reload
                if (storeCanvasId === selectedCanvasId) {
                    if (mounted) setIsInitialized(true);
                    return;
                }

                await loadCanvas(selectedCanvasId);
                if (mounted) setIsInitialized(true);
                return;
            }

            // If store already has a canvas loaded, use it
            if (storeCanvasId) {
                if (mounted) setIsInitialized(true);
                return;
            }

            // Fetch logic removed to prevent race condition with deep linking.
            // CanvasList (Sidebar) handles default selection on Home Page.
            // CanvasPage handles selection on Deep Link.
            if (mounted) setIsInitialized(true);

            if (mounted) setIsInitialized(true);
        };

        // Force initialization to true to debug "infinite loading"
        // If this works, the problem was just the initialization logic
        setIsInitialized(true);
        init();

        return () => {
            mounted = false;
        };
        // Only depend on selectedCanvasId and hasToken to avoid re-running on every store change
    }, [selectedCanvasId, hasToken, loadCanvas, storeCanvasId]);



    // Show login prompt if not authenticated
    if (authError || (!isInitialized && !hasToken)) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="text-lg font-medium text-slate-600 dark:text-slate-400">
                        Please log in to use the canvas
                    </div>
                    <a
                        href="/login"
                        className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Go to Login
                    </a>
                </div>
            </div>
        );
    }

    // Only show loading if we haven't initialized AND we don't have a canvas yet
    if (!isInitialized && !storeCanvasId) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="flex flex-col items-center space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 dark:border-slate-100" />
                    <div className="text-lg font-medium text-slate-600 dark:text-slate-400">
                        Loading canvas...
                    </div>
                </div>
            </div>
        );
    }

    // Show error if canvas creation failed
    if (error) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="text-center space-y-2">
                    <div className="text-red-600">Failed to load canvas</div>
                    <div className="text-sm text-muted-foreground">{error}</div>
                </div>
            </div>
        );
    }

    // Show empty state if no canvas is loaded
    if (!storeCanvasId) {
        return (
            <div className="h-full w-full flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="text-lg font-medium text-slate-600 dark:text-slate-400">
                        No canvas selected
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Create a new canvas using the <strong>+</strong> button in the sidebar,<br />
                        or select an existing canvas from the list.
                    </div>
                </div>
            </div>
        );
    }
    return (
        <SelectionProvider>
            <ReactFlowProvider>
                <CanvasViewInner />
            </ReactFlowProvider>
        </SelectionProvider>
    );
}

