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
import { CanvasToolbar } from "./canvas-toolbar";
import { StickyNoteNode } from "./nodes/sticky-note-node";
import { WorkflowInstanceNode } from "./nodes/workflow-instance-node";
import { WorkflowTemplateDialog } from "./workflow-template-dialog";

import { useCanvasStore, getZoomLevel, LinkType, CanvasLink, Viewport, DomainDefinition } from "./canvas-store";

import { LinkTypeDialog } from "./link-type-dialog";
import { DomainSelector } from "./domain-selector";
import { MCPToolConfigDialog, MCPToolConfig } from "./mcp-tool-config-dialog";
import { AgentToolConfigDialog, AgentToolConfig } from "./agent-tool-config-dialog";
import { layoutService } from "./services/layout-service";
import { checkZoneLayoutFit } from "@/lib/layout-engine";
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

import { useToast } from "@/components/ui/use-toast";
import { CanvasPalette } from "./canvas-palette";
import { InspectorPanel } from "./inspector-panel";
import { OCRConversionDialog } from "./ocr-conversion-dialog";
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
    sticky: StickyNoteNode,
    workflow: WorkflowInstanceNode,
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

    console.log("[CanvasViewInner] Render Debug:", {
        canvasId: useCanvasStore.getState().canvasId,
        thingsCount: useCanvasStore.getState().things.length,
        nodesCount: useCanvasStore.getState().things.length + useCanvasStore.getState().domains.length,
        zoomLevel: useCanvasStore.getState().zoomLevel,
        nodeTypesKeys: Object.keys(nodeTypesMemo),
        storeThings: useCanvasStore.getState().things,
        storeDomains: useCanvasStore.getState().domains
    });

    // Canvas store state - Using selectors to minimize re-renders
    const canvasId = useCanvasStore(s => s.canvasId);
    const things = useCanvasStore(s => s.things);
    const links = useCanvasStore(s => s.links);
    const domains = useCanvasStore(s => s.domains);
    const viewport = useCanvasStore(s => s.viewport);
    const zoomLevel = useCanvasStore(s => s.zoomLevel);
    const selectedThingIds = useCanvasStore(s => s.selectedThingIds);
    const selectedDomainIds = useCanvasStore(s => s.selectedDomainIds);
    const selectionMode = useCanvasStore(s => s.selectionMode);
    const showLinks = useCanvasStore(s => s.showLinks);
    const hiddenNodeLinks = useCanvasStore(s => s.hiddenNodeLinks);
    const semanticZoomEnabled = useCanvasStore(s => s.semanticZoomEnabled);
    const dockedThingId = useCanvasStore(s => s.dockedThingId);
    const dockPosition = useCanvasStore(s => s.dockPosition);
    const editingThingId = useCanvasStore(s => s.editingThingId);
    const sidebarCollapsed = useCanvasStore(s => s.sidebarCollapsed);
    const snapToGrid = useCanvasStore(s => s.snapToGrid); // Grid System
    const accessLevel = useCanvasStore((s) => s.accessLevel);
    const isReadOnly = accessLevel === "read";

    // Actions
    const updateViewport = useCanvasStore(s => s.updateViewport);
    const saveViewport = useCanvasStore(s => s.saveViewport);
    const moveThing = useCanvasStore(s => s.moveThing);
    const updateThing = useCanvasStore(s => s.updateThing);
    const updateThings = useCanvasStore(s => s.updateThings);
    const deleteThing = useCanvasStore(s => s.deleteThing);
    const selectThing = useCanvasStore(s => s.selectThing);
    const selectDomain = useCanvasStore(s => s.selectDomain);
    const emitCanvasEvent = useCanvasStore(s => s.emitCanvasEvent);
    const checkThingInDomain = useCanvasStore(s => s.checkThingInDomain);
    const updateDomain = useCanvasStore(s => s.updateDomain);
    const getHierarchyDepth = useCanvasStore(s => s.getHierarchyDepth);
    const toggleIconify = useCanvasStore(s => s.toggleIconify);
    const setDockedThing = useCanvasStore(s => s.setDockedThing);
    const deleteSelectedNodes = useCanvasStore(s => s.deleteSelectedNodes);

    // Additional actions needed for internal handlers or sub-components
    const addThing = useCanvasStore(s => s.addThing);
    const addLink = useCanvasStore(s => s.addLink);
    const deleteLink = useCanvasStore(s => s.deleteLink);
    const clearSelection = useCanvasStore(s => s.clearSelection);
    const addDomain = useCanvasStore(s => s.addDomain);
    const moveDomain = useCanvasStore(s => s.moveDomain);
    const addThingToDomain = useCanvasStore(s => s.addThingToDomain);
    const removeThingFromDomain = useCanvasStore(s => s.removeThingFromDomain);
    const setSelectedItems = useCanvasStore(s => s.setSelectedItems);
    const setSelectionMode = useCanvasStore(s => s.setSelectionMode);
    const toggleShowLinks = useCanvasStore(s => s.toggleShowLinks);
    const setSemanticZoomEnabled = useCanvasStore(s => s.setSemanticZoomEnabled);
    const triggerZoneLayout = useCanvasStore(s => s.triggerZoneLayout); // Layout Engine
    const activeScenario = useCanvasStore(s => s.activeScenario);

    // Dummy stubs for variables that were previously destructured but now moved to CanvasToolbar
    // We keep them here if there are other parts of the component still using them
    const setSelectedModel = (model: string | null) => useCanvasStore.getState().setSelectedModel(model);
    const setVisionModel = (model: string | null) => useCanvasStore.getState().setVisionModel(model);
    const visionModel = useCanvasStore.getState().visionModel; // Read-only for some logic maybe?
    const selectedModel = useCanvasStore.getState().selectedModel;

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
    }, [isResizing, dockPosition, sidebarCollapsed]);

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

    // Link type dialog state
    const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
    const [showDomainSelector, setShowDomainSelector] = React.useState(false);
    const [selectedDomainDef, setSelectedDomainDef] = React.useState<DomainDefinition | null>(null);
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
    const [showOCRDialog, setShowOCRDialog] = React.useState(false);

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
        type: thing.type === "sticky" ? "sticky" : thing.type === "workflow" ? "workflow" : "thing",
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
        style: (!thing.iconified && useCanvasStore.getState().zoomLevel !== "domain") ? {
            width: thing.width ?? 400, // Default width if not set to prevent auto-resize to content
            height: thing.height ?? 300, // Default height if not set to prevent auto-resize to content
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
    // Handle domain resize LIVE (Preview)
    const handleDomainResize = React.useCallback((domainId: string, width: number, height: number, x?: number, y?: number) => {
        const domain = domains.find(d => d.id === domainId);
        if (!domain) return;

        // Constraint Check: Can the icons fit in the new size?
        const domainThings = things.filter(t => t.domain_id === domainId);
        if (domainThings.length > 0) {
            const zoneCount = domain.drop_zones?.length || 0;
            if (zoneCount > 0) {
                const cols = zoneCount === 1 ? 1 : 2;
                const rows = Math.ceil(zoneCount / cols);

                const domainContentWidth = width - 16;
                const domainContentHeight = height - 40;

                // Correct spacing: Size = (Total - (N-1) * Gap) / N
                const zoneWidth = (domainContentWidth - (cols - 1) * 8) / cols;
                const zoneHeight = (domainContentHeight - (rows - 1) * 8) / rows;

                const ITEM_W = 120;
                const ITEM_H = 80;
                const GAP = 8;
                const PADDING = 16;

                const availZW = zoneWidth - PADDING * 2;
                const availZH = zoneHeight - PADDING * 2;

                // Precise capacity: floor((avail + gap) / (item + gap))
                const actualItemsPerRow = Math.max(0, Math.floor((availZW + GAP) / (ITEM_W + GAP)));
                const actualItemsPerCol = Math.max(0, Math.floor((availZH + GAP) / (ITEM_H + GAP)));

                const totalCapacity = actualItemsPerRow * actualItemsPerCol * zoneCount;

                if (domainThings.length > totalCapacity) {
                    return;
                }
            }
        }

        // 1. Update Domain Geometry LOCALLY (using moveDomain which is local-only)
        moveDomain(domainId, x ?? 0, y ?? 0, width, height);

        // 2. Trigger Layout Recalculation (Fluid Layout PREVIEW)
        triggerZoneLayout(domainId, true); // true = preview mode (local only, no DB persist)
    }, [moveDomain, triggerZoneLayout, domains, things]);

    // Handle domain resize END (Commit)
    const handleDomainResizeEnd = React.useCallback((domainId: string, width: number, height: number, x?: number, y?: number) => {
        const updates: any = { width, height };
        if (x !== undefined) updates.position_x = x;
        if (y !== undefined) updates.position_y = y;

        // 1. Commit Domain Geometry to Backend
        updateDomain(domainId, updates);

        // 2. Commit Layout to Backend
        triggerZoneLayout(domainId, false); // false = commit mode
    }, [updateDomain, triggerZoneLayout]);

    const domainNodes: Node[] = React.useMemo(() => domains.map((domain) => {
        // Calculate hierarchy depth
        const depth = getHierarchyDepth(domain.id);
        // Find parent name if exists
        const parent = domain.parent_id ? domains.find(d => d.id === domain.parent_id) : null;
        const parentName = parent?.name;

        // Calculate required bounds for blocking
        const domainThings = things.filter(t => t.domain_id === domain.id);
        let minW = 200;
        let minH = 150;

        if (domainThings.length > 0) {
            const zoneCount = domain.drop_zones?.length || 0;
            const cols = zoneCount === 1 ? 1 : 2;
            const rows = Math.ceil(zoneCount / cols);

            // To fit at least one item per row/col across zones
            // MinZoneWidth = 120 (item) + 32 (padding) = 152
            // MinDomainWidth = cols * 152 + (cols-1)*8 (gap) + 16 (padding)
            minW = Math.max(minW, cols * 152 + (cols - 1) * 8 + 16);
            // MinZoneHeight = 80 (item) + 32 (padding) = 112
            // MinDomainHeight = rows * 112 + (rows-1)*8 (gap) + 40 (domain padding)
            minH = Math.max(minH, rows * 112 + (rows - 1) * 8 + 40);
        }

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
                onResize: handleDomainResize, // Live fluid layout
                onResizeEnd: handleDomainResizeEnd, // Commit
                minWidth: minW,
                minHeight: minH,
            },
            draggable: true,
            selectable: true,
            zIndex: (domain.z_index ?? -1) + (depth * 0.01), // Hierarchy-aware Z-index (children on top of parents)
            style: {
                width: domain.width || 300,
                height: domain.height || 200,
            },
        };
    }), [domains, things, zoomLevel, handleDomainUpdate, handleDomainResize, selectedDomainIds, getHierarchyDepth]);

    // Combine nodes (memoized)
    const allNodes = React.useMemo(() =>
        [...domainNodes, ...thingNodes],
        [domainNodes, thingNodes]
    );

    // Link type colors
    const getLinkColor = React.useCallback((linkType: string) => {
        // Check custom scenario types first
        const customType = activeScenario?.configuration?.link_types?.find((t: any) => t.id === linkType);
        if (customType?.color) return customType.color;

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
    }, [activeScenario]);

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

                const customType = activeScenario?.configuration?.link_types?.find((t: any) => t.id === link.type);
                const edgeColor = customType?.color || getLinkColor(link.type);

                let strokeDasharray = undefined;
                if (customType?.stroke_style === 'dashed') strokeDasharray = '5,5';
                else if (customType?.stroke_style === 'dotted') strokeDasharray = '2,2';

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
                        color: edgeColor,
                    },
                    style: {
                        stroke: edgeColor,
                        strokeWidth: 2,
                        strokeDasharray,
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
    }, [links, showLinks, hiddenNodeLinks, activeScenario, getLinkColor]);

    // React Flow state - initialized with current nodes
    const [nodes, setNodes, onNodesChange] = useNodesState(allNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(allEdges);

    console.log("[CanvasViewInner] Node Array Debug:", {
        thingNodesLen: thingNodes.length,
        domainNodesLen: domainNodes.length,
        allNodesLen: allNodes.length,
        nodesStateLen: nodes.length
    });

    // Sync stores with React Flow state

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
            z: d.z_index,
            vc: d.visual_config,
            dz: d.drop_zones
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
            // Track analysis progress precisely
            plan_len: (t.content as any)?.execution_plan ? JSON.stringify((t.content as any).execution_plan).length : 0,
            has_result: (t.content as any)?.analysis_result ? true : false,
            processing_status: (t.content as any)?.processing_status,
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
            // Re-use logic for selection
            // For now simplified to avoid errors, or just log
            console.log("Selection drag stop", nodes.length);
        },
        []
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
            setIsDraggingNode(true);
        },
        [] // Dependency array for onNodeDragStart
    );

    // Handle node drag end - save position
    // Handle node drag end - save position
    const onNodeDragStop = React.useCallback(
        async (_: React.MouseEvent, node: Node) => {
            setIsDraggingNode(false);

            if (node.type === "thing" || node.type === "sticky") {
                const startPos = dragStartPosRef.current;

                // Safety check: ensure we have a start position for the dragged node
                // (This now works for Things too, thanks to the fix in onNodeDragStart)
                if (!startPos || startPos.id !== node.id) {
                    return;
                }

                const deltaX = node.position.x - startPos.x;
                const deltaY = node.position.y - startPos.y;

                // 0. Ignore Micro-Moves (Fix for Click vs Drag)
                // If the move is tiny (likely a shaky click), abort the drag logic.
                // This prevents clicks on toolbar buttons from triggering domain assignments/layout.
                if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) {
                    dragStartPosRef.current = null;
                    setIsDraggingNode(false);
                    return;
                }

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

                    console.log(`[CanvasView] DragStop Node=${n.id} TargetDomain=${targetDomainId} Pos=${n.x},${n.y}`);

                    let dropZoneId: string | undefined;
                    let shouldIconify = false;

                    // Drop Zone Detection
                    if (targetDomainId) {
                        const domain = domains.find(d => d.id === targetDomainId);

                        // Check Definition for Drop Zones
                        const activeScenario = useCanvasStore.getState().activeScenario;
                        const definition = activeScenario?.configuration?.domain_definitions?.find(d =>
                            (domain?.type && d.id === domain.type) || d.name === domain?.name
                        );

                        console.log("[CanvasView] Debug Drop: Definition Found", definition);

                        const availableZones = domain?.drop_zones || definition?.drop_zones || [];
                        console.log("[CanvasView] Debug Drop: Available Zones", availableZones);

                        if (domain && availableZones.length > 0) {
                            // shouldIconify = true; // REMOVED: Aggressive default

                            // Calculate Hit (Center of Item relative to Domain)
                            const thing = things.find(t => t.id === n.id);
                            const w = thing?.width ?? 400;
                            const h = thing?.height ?? 300;
                            const cx = n.x + w / 2;
                            const cy = n.y + h / 2;

                            const rx = cx - domain.position_x;
                            const ry = cy - domain.position_y;

                            console.log(`[CanvasView] Debug Drop: Hit Test rx=${rx} ry=${ry} (Domain Pos: ${domain.position_x}, ${domain.position_y})`);

                            // --- GEOMETRY CALCULATION START ---
                            // Replicate CSS Grid Layout logic
                            const PADDING_TOP = 32;
                            const PADDING_X = 8;
                            const PADDING_BOTTOM = 8;
                            const GAP = 8;

                            const domainW = domain.width || 400;
                            const domainH = domain.height || 300;

                            const availW = domainW - (PADDING_X * 2);
                            const availH = domainH - PADDING_TOP - PADDING_BOTTOM;

                            const zoneCount = availableZones.length;
                            const cols = zoneCount === 1 ? 1 : 2;
                            const rows = Math.ceil(zoneCount / cols);

                            const cellW = (availW - ((cols - 1) * GAP)) / cols;
                            const cellH = (availH - ((rows - 1) * GAP)) / rows;

                            console.log(`[CanvasView] Geom: Domain ${domainW}x${domainH}. Cell ${cellW}x${cellH}. Zones=${zoneCount}`);

                            const hitZone = availableZones.find((z, idx) => {
                                const colIndex = idx % cols;
                                const rowIndex = Math.floor(idx / cols);

                                const zx = PADDING_X + (colIndex * (cellW + GAP));
                                const zy = PADDING_TOP + (rowIndex * (cellH + GAP));
                                const zw = cellW;
                                const zh = cellH;

                                // Debug individual zone geometry
                                console.log(`[CanvasView] Zone ${z.id} Check: [${zx}, ${zy}, ${zw}, ${zh}] vs Hit[${rx}, ${ry}]`);

                                return (
                                    rx >= zx && rx <= (zx + zw) &&
                                    ry >= zy && ry <= (zy + zh)
                                );
                            });
                            // --- GEOMETRY CALCULATION END ---

                            // Hit check logic
                            let currentDropZoneId: string | undefined = undefined;
                            let isInsideDomainBounds = rx >= 0 && rx <= domainW && ry >= 0 && ry <= domainH;
                            
                            console.log(`[CanvasView] Hit detection: domain=${targetDomainId}, rx=${rx.toFixed(1)}, ry=${ry.toFixed(1)}, inside=${isInsideDomainBounds}`);

                            if (isInsideDomainBounds) {
                                // Iterate drop zones to find hit
                                for (const zone of availableZones) {
                                    const colIndex = availableZones.indexOf(zone) % cols;
                                    const rowIndex = Math.floor(availableZones.indexOf(zone) / cols);

                                    const zx = PADDING_X + (colIndex * (cellW + GAP));
                                    const zy = PADDING_TOP + (rowIndex * (cellH + GAP));
                                    const zw = cellW;
                                    const zh = cellH;

                                    // Debug individual zone geometry
                                    console.log(`[CanvasView] Zone ${zone.id} Check: [${zx.toFixed(1)}, ${zy.toFixed(1)}, ${zw.toFixed(1)}, ${zh.toFixed(1)}] vs Hit[${rx.toFixed(1)}, ${ry.toFixed(1)}]`);

                                    const hit = (
                                        rx >= zx &&
                                        rx <= zx + zw &&
                                        ry >= zy &&
                                        ry <= zy + zh
                                    );

                                    if (hit) {
                                        currentDropZoneId = zone.id;
                                        console.log(`[CanvasView] HIT Drop Zone: ${zone.label || zone.id} at relative ({${rx.toFixed(1)}, ${ry.toFixed(1)}})`);
                                        break;
                                    }
                                }

                                if (currentDropZoneId) {
                                    dropZoneId = currentDropZoneId;
                                    shouldIconify = true; // Only iconify if we actually HIT a zone
                                    useCanvasStore.getState().flashDropZone(dropZoneId);
                                } else {
                                    console.log(`[CanvasView] Debug Drop: No zone hit in domain ${targetDomainId}`);
                                }
                            } else {
                                console.log("[CanvasView] Debug Drop: Not inside domain bounds");
                            }
                            // --- GEOMETRY CALCULATION END ---
                        }
                    }

                    // Return update payload
                    return {
                        id: n.id,
                        updates: {
                            position_x: n.x,
                            position_y: n.y,
                            domain_id: targetDomainId,
                            ...(shouldIconify ? { iconified: true } : {})
                        },
                        transientExtras: dropZoneId ? { drop_zone_id: dropZoneId } : undefined
                    };
                });

                // 3. Atomic Batch Update
                console.log("[CanvasView] Drag end update payload:", updates);
                await updateThings(updates);

                // 4. Trigger Layout Engine for affected domains
                // OPTIMIZED: Only trigger layout if we dropped INTO a zone or changed domains.
                // Avoids "snap" when moving normally within a domain.
                const domainsToLayout = new Set<string>();

                updates.forEach(u => {
                    // If we have a drop zone hit, definitely layout
                    if (u.transientExtras?.drop_zone_id) {
                        if (u.updates.domain_id) domainsToLayout.add(u.updates.domain_id);
                    }
                });

                domainsToLayout.forEach(domainId => {
                    triggerZoneLayout(domainId);
                });

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
            }

            setIsDraggingNode(false);
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
                // Check if target is an agent tool
                const targetThing = things.find(t => t.id === connection.target);
                if (targetThing?.type === "agent_tool") {
                    // 1. Create a data flow link (visual)
                    addLink(
                        connection.source,
                        connection.target,
                        "related",
                        "Data Input",
                        "Input data for agent"
                    );

                    // 2. Open mapping dialog for this specific agent
                    setEditingAgentId(connection.target);
                    setShowAgentToolDialog(true);
                    return;
                }

                setPendingConnection({
                    source: connection.source,
                    target: connection.target,
                });
                setEditingLink(null);
                setLinkDialogOpen(true);
            }
        },
        [things, addLink]
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

                // Highlight source fragment with enriched target title
                const store = useCanvasStore.getState();
                const targetNode = store.things.find(t => t.id === link.target_id);
                store.setHighlightedFragment({
                    thingId: link.source_id,
                    fragment: {
                        ...link.source_fragment,
                        linkTitle: link.label || link.type,
                        targetTitle: targetNode?.title || "Target Node"
                    }
                });
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
                    const targetNode = things.find(t => t.id === link.target_id);
                    setHighlightedFragment({
                        thingId: link.source_id,
                        fragment: {
                            ...link.source_fragment,
                            linkTitle: link.label || link.type,
                            targetTitle: targetNode?.title || "Target Node"
                        }
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
                    const targetNode = things.find(t => t.id === incomingWithFragment.target_id);
                    setHighlightedFragment({
                        thingId: incomingWithFragment.source_id,
                        fragment: {
                            ...incomingWithFragment.source_fragment,
                            linkTitle: incomingWithFragment.label || incomingWithFragment.type,
                            targetTitle: targetNode?.title || "Target Node"
                        }
                    });
                    return;
                }
            }

            // Retain highlight if we are editing a link to avoid clearing focus loss highlights
            if (editingLink && editingLink.source_fragment) {
                const targetNode = things.find(t => t.id === editingLink.target_id);
                setHighlightedFragment({
                    thingId: editingLink.source_id,
                    fragment: {
                        ...editingLink.source_fragment,
                        linkTitle: editingLink.label || editingLink.type,
                        targetTitle: targetNode?.title || "Target Node"
                    }
                });
                return;
            }

            // If nothing matched, clear highlight
            setHighlightedFragment(null);
        },
        [editingLink, things, links]
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

            // Capture current canvasId to ensure items are added to THIS canvas
            // even if the user switches while a dialog or async call is pending.
            const currentCanvasId = useCanvasStore.getState().canvasId;
            setPendingCanvasId(currentCanvasId);

            switch (toolType) {
                case "text":
                    setPendingDropPos(position);
                    setShowTextDialog(true);
                    break;
                case "sticky":
                    await addThing(
                        "sticky",
                        { text: "" },
                        position,
                        300, // Default width
                        300, // Default height
                        "New Sticky", // title
                        color // color from palette
                    );
                    break;
                case "url":
                    setPendingDropPos(position);
                    setShowUrlDialog(true);
                    break;
                case "domain":
                    setPendingDropPos(position);
                    setShowDomainSelector(true);
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
                case "agent_tool":
                    setPendingDropPos(position);
                    setShowAgentToolDialog(true);
                    break;
                case "archimate_tool":
                    await addThing(
                        "archimate_tool",
                        {},
                        position,
                        undefined, // width
                        undefined, // height
                        "ArchiMate Importer" // title
                    );
                    break;
                case "workflow":
                    setPendingDropPos(position);
                    setShowWorkflowDialog(true);
                    break;
                case "ocr_conversion":
                    setShowOCRDialog(true);
                    break;
            }
            return;
        }

        // Handle File Drop
        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) return;

        const { clientX, clientY } = event;
        const position = screenToFlowPosition({ x: clientX, y: clientY });

        // Calculate Drop Zone Hit (Pre-calc for batch)
        let dropZoneId: string | undefined;
        // Default size for hit testing and new item (400x300)
        const DEFAULT_W = 400;
        const DEFAULT_H = 300;

        const { findEnclosingDomain, activeScenario, domains: freshDomains } = useCanvasStore.getState();
        const targetDomainId = findEnclosingDomain(position.x, position.y, DEFAULT_W, DEFAULT_H);

        if (targetDomainId) {
            const domain = freshDomains.find(d => d.id === targetDomainId);
            const definition = activeScenario?.configuration?.domain_definitions?.find(d =>
                (domain?.type && d.id === domain.type) || d.name === domain?.name
            );
            const availableZones = domain?.drop_zones || definition?.drop_zones || [];

            if (domain && availableZones.length > 0) {
                // Calculate Hit (Center of Item relative to Domain)
                const cx = position.x + DEFAULT_W / 2;
                const cy = position.y + DEFAULT_H / 2;

                const rx = cx - domain.position_x;
                const ry = cy - domain.position_y;

                // --- GEOMETRY CALCULATION START ---
                // Replicate CSS Grid Layout logic
                const PADDING_TOP = 32;
                const PADDING_X = 8;
                const PADDING_BOTTOM = 8;
                const GAP = 8;

                const domainW = domain.width || 400;
                const domainH = domain.height || 300;

                const availW = domainW - (PADDING_X * 2);
                const availH = domainH - PADDING_TOP - PADDING_BOTTOM;

                const zoneCount = availableZones.length;
                const cols = zoneCount === 1 ? 1 : 2;
                const rows = Math.ceil(zoneCount / cols);

                // W: (Total - (cols-1)*gap) / cols
                const cellW = (availW - ((cols - 1) * GAP)) / cols;

                // H: (Total - (rows-1)*gap) / rows
                const cellH = (availH - ((rows - 1) * GAP)) / rows;

                console.log(`[CanvasView] Geom: Domain ${domainW}x${domainH}. Cell ${cellW}x${cellH}. Zones=${zoneCount}`);

                // Find Hit
                const hitZone = availableZones.find((z, idx) => {
                    const colIndex = idx % cols;
                    const rowIndex = Math.floor(idx / cols);

                    const zx = PADDING_X + (colIndex * (cellW + GAP));
                    const zy = PADDING_TOP + (rowIndex * (cellH + GAP));
                    const zw = cellW;
                    const zh = cellH;

                    // Debug individual zone geometry
                    console.log(`[CanvasView] Zone ${z.id} Check: [${zx}, ${zy}, ${zw}, ${zh}] vs Hit[${rx}, ${ry}]`);

                    return (
                        rx >= zx && rx <= (zx + zw) &&
                        ry >= zy && ry <= (zy + zh)
                    );
                });
                // --- GEOMETRY CALCULATION END ---
                if (hitZone) {
                    dropZoneId = hitZone.id;
                    console.log(`[CanvasView] File Drop Hit Zone: ${dropZoneId}`);
                }
            }
        }

        const transExtras = dropZoneId ? { drop_zone_id: dropZoneId } : undefined;

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
                        DEFAULT_W, // width
                        DEFAULT_H, // height
                        file.name, // title
                        undefined, // color
                        undefined, // scrapeOptions
                        transExtras // transientExtras
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
                        DEFAULT_W, // width
                        DEFAULT_H, // height
                        file.name, // title
                        undefined, // color
                        undefined, // scrapeOptions
                        transExtras // transientExtras
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
                            DEFAULT_W, // width
                            DEFAULT_H, // height
                            file.name, // title
                            undefined, // color
                            undefined, // scrapeOptions
                            transExtras // transientExtras
                        );
                    }
                }
            }
        }

    };

    // Handle Context Menu Actions
    const handleContextMenuAction = React.useCallback(async (action: string, context: "canvas" | "domain" | "selection", domainId?: string, fragment?: any) => {
        // Capture current canvas ID to allow operations to complete on the correct canvas even if context switches
        const currentCanvasId = useCanvasStore.getState().canvasId;
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

            const result = await analyzeBatch(tIds, apiAction as "summarize" | "identify_purpose", selectedModel || undefined, currentCanvasId);

            if (result) {
                // Create a text note with the result
                // Calculate position relative to selection or center
                let pos = getCenterPosition();
                const newThing = await addThing(
                    "text",
                    { text: `** ${action === "identify_purpose" ? "Purposes" : "Summary"} Analysis **\n\n${result} ` },
                    pos,
                    undefined, // width
                    undefined, // height
                    `${action === "identify_purpose" ? "Purpose" : "Summary"} Analysis`, // title
                    undefined, // color
                    undefined // scrapeOptions
                );

                if (newThing) {
                    // Link new thing to all source things
                    for (const sourceId of tIds) {
                        await addLink(
                            newThing.id,
                            sourceId,
                            "derived_from" as any,
                            "Analysis Source",
                            "Source item used for this analysis",
                            undefined,
                            undefined,
                            undefined,
                            currentCanvasId
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
            const { selectedThingIds, things, selectedDomainIds, loadCanvas } = useCanvasStore.getState();
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
                if (currentCanvasId) {
                    await layoutService.arrange({
                        canvas_id: currentCanvasId,
                        thing_ids: tIds
                    });

                    // Refresh canvas
                    await loadCanvas(currentCanvasId);
                    toast({ title: "Arrangement Complete", description: "Layout updated." });
                }
            } catch (e) {
                console.error("Layout failed", e);
                toast({ title: "Layout Failed", description: "Could not arrange things.", variant: "destructive" });
            }

        } else if (action.startsWith("execute_template:")) {
            const templateId = action.split(":")[1];
            const { selectedThingIds, selectedDomainIds, things, domains, selectedModel, visionModel, levelOfDetail } = useCanvasStore.getState();
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
                const response = await fetch(`${API_URL}/canvases/${currentCanvasId}/execute-template/stream`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        template_id: templateId,
                        thing_ids: tIds,
                        canvas_id: currentCanvasId,

                        model: activeModel,
                        level_of_detail: levelOfDetail,
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
                                // Clean up step name if it looks like an ID
                                const displayName = stepName.startsWith("node_") ? "Processing Step" : stepName;

                                updateToast({
                                    id: toastId,
                                    title: displayName.includes("Section") ? `Processing ${displayName}` : displayName,
                                    description: (
                                        <div className="flex flex-col gap-2 mt-1">
                                            {/* Heartbeat Line */}
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <div className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                </div>
                                                <span className="font-medium">Analysis in progress...</span>
                                            </div>
                                        </div>
                                    ),
                                    duration: 1000000,
                                });
                            } else if (event.type === "progress") {
                                updateToast({
                                    id: toastId,
                                    description: (
                                        <div className="flex flex-col gap-2 mt-1">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <div className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                </div>
                                                <span className="font-medium">{event.message}</span>
                                            </div>
                                        </div>
                                    ),
                                    duration: 1000000
                                });
                            } else if (event.type === "log") {
                                // Support both 'content' (new) and 'message' (legacy) field names
                                const logMessage = event.content || event.message || "";
                                const isStartStep = logMessage.includes("Starting Step");
                                const displayMessage = (isStartStep && event.node_label)
                                    ? `Processing section: ${event.node_label}`
                                    : logMessage;

                                // Only update title if it's a significant step change
                                if (isStartStep && event.node_label) {
                                    updateToast({
                                        id: toastId,
                                        title: `Processing: ${event.node_label}`,
                                        description: (
                                            <div className="flex flex-col gap-2 mt-1">
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <div className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                    </div>
                                                    <span className="font-medium">Generating content...</span>
                                                </div>
                                            </div>
                                        ),
                                        duration: 1000000
                                    });
                                } else {
                                    // For normal logs, just show the text 
                                    // BUT KEEP THE TITLE if possible? Toast updates overwrite everything.
                                    // We just update description to show the log message as the "heartbeat" text
                                    updateToast({
                                        id: toastId,
                                        description: (
                                            <div className="flex flex-col gap-2 mt-1">
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <div className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                    </div>
                                                    <span>{displayMessage}</span>
                                                </div>
                                            </div>
                                        ),
                                        duration: 1000000
                                    });
                                }
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
                                console.log("[Canvas] node_created event received:", event);
                                const newNode = event.node;
                                if (newNode) {
                                    console.log("[Canvas] Adding new node to store:", newNode.id, newNode.type);
                                    useCanvasStore.getState().addServerThing(newNode as any);
                                } else {
                                    console.error("[Canvas] node_created event missing node data:", event);
                                }
                                // Also add any links that came with the node (already created on backend)
                                if (event.links && Array.isArray(event.links) && event.links.length > 0) {
                                    console.log("[Canvas] Adding links from node_created:", event.links.length);
                                    const currentLinks = useCanvasStore.getState().links;
                                    useCanvasStore.setState({ links: [...currentLinks, ...event.links] });
                                }
                            } else if (event.type === "links_created") {
                                console.log("[Canvas] links_created event received:", event.links?.length);
                                // Handle links sent separately from node (already created on backend)
                                if (event.links && Array.isArray(event.links) && event.links.length > 0) {
                                    const currentLinks = useCanvasStore.getState().links;
                                    useCanvasStore.setState({ links: [...currentLinks, ...event.links] });
                                }
                            } else if (event.type === "plan_update") {
                                const newPlan = event.plan;
                                console.log("[Canvas] plan_update event received:", newPlan);
                                if (newPlan && targetThings.length > 0) {
                                    const sourceThingId = targetThings[0].id;
                                    const currentThing = useCanvasStore.getState().things.find(t => t.id === sourceThingId);
                                    if (currentThing) {
                                        console.log(`[Canvas] Updating streaming plan for thing ${sourceThingId}. New plan nodes count: ${Array.isArray(newPlan) ? newPlan.length : (newPlan.nodes ? newPlan.nodes.length : 0)}`);
                                        useCanvasStore.getState().syncThing(sourceThingId, {
                                            content: {
                                                ...currentThing.content,
                                                execution_plan: newPlan
                                            }
                                        });
                                    }
                                }
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
    const [showAgentToolDialog, setShowAgentToolDialog] = React.useState(false);
    const [showWorkflowDialog, setShowWorkflowDialog] = React.useState(false);

    // Track dragging state for smooth animations
    const [isDraggingNode, setIsDraggingNode] = React.useState(false);

    // Track drop position for dialog-based creation
    const [pendingDropPos, setPendingDropPos] = React.useState<{ x: number, y: number } | null>(null);
    const [pendingCanvasId, setPendingCanvasId] = React.useState<string | null>(null);
    const [editingAgentId, setEditingAgentId] = React.useState<string | null>(null);

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
            400, // width
            300, // height
            config.tool_name, // title
            undefined, // color
            undefined, // scrapeOptions
            undefined // transientExtras
        );
        setShowMCPToolDialog(false);
        setPendingDropPos(null);
        setPendingCanvasId(null);
    };

    // Agent Tool Creation/Update Handler
    const handleAddAgentTool = async (config: AgentToolConfig) => {
        if (editingAgentId) {
            // Update existing agent node with new mappings/arguments
            const agent = things.find(t => t.id === editingAgentId);
            if (agent) {
                await updateThing(editingAgentId, {
                    title: config.blueprint_name,
                    content: {
                        ...agent.content,
                        blueprint_id: config.blueprint_id,
                        blueprint_name: config.blueprint_name,
                        arguments: config.arguments,
                        argument_mappings: config.argument_mappings,
                        inputSchema: config.inputSchema,
                        status: "ready"
                    }
                });
            }
            setEditingAgentId(null);
        } else {
            // Create new agent node
            await addThing(
                "agent_tool",
                {
                    blueprint_id: config.blueprint_id,
                    blueprint_name: config.blueprint_name,
                    arguments: config.arguments,
                    argument_mappings: config.argument_mappings,
                    inputSchema: config.inputSchema,
                    status: "ready"
                },
                pendingDropPos || getCenterPosition(),
                400, // width
                300, // height
                config.blueprint_name, // title
                undefined, // color
                undefined, // scrapeOptions
                undefined // transientExtras
            );
        }
        setShowAgentToolDialog(false);
        setPendingDropPos(null);
        setPendingCanvasId(null);
    };

    // Workflow Creation Handler
    const handleAddWorkflow = async (template: any, customName: string, customDescription: string) => {
        const storeModel = useCanvasStore.getState().selectedModel;
        const storeVisionModel = useCanvasStore.getState().visionModel;

        await addThing(
            "workflow",
            {
                template_id: template.id,
                template_name: template.name,
                template_description: customDescription || template.description || "",
                status: "IDLE",
                current_node_ids: [],
                instance_id: undefined,
                state_payload: {},
                selected_model: storeModel,
                selected_vision_model: storeVisionModel
            },
            pendingDropPos || getCenterPosition(),
            450, // default width
            380, // default height
            customName || template.name, // title
            "#f5f3ff", // violet theme color
            undefined, // scrapeOptions
            undefined // transientExtras
        );
        setShowWorkflowDialog(false);
        setPendingDropPos(null);
        setPendingCanvasId(null);
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
            400, // width
            300, // height
            textContent.slice(0, 30), // title
            undefined, // color
            undefined // scrapeOptions
        );

        setTextContent("");
        setShowTextDialog(false);
        setPendingDropPos(null);
        setPendingCanvasId(null);
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
            400, // width
            300, // height
            urlContent.trim(), // title
            undefined, // color
            {
                depth: scrapeDepth,
                warn_external: warnExternal
            }
        );
        setUrlContent("");
        setScrapeDepth(0); // Reset after add
        setPendingDropPos(null);
        setPendingCanvasId(null);
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

        console.log("[CanvasView] Creating domain with def:", selectedDomainDef);
        await addDomain(
            domainName,
            domainDescription,
            dropPos,
            selectedDomainDef?.visual_config?.color || "#6366f1",
            parentId,
            selectedDomainDef ? {
                type: selectedDomainDef.id,
                visual_config: selectedDomainDef.visual_config,
                metadata_schema: selectedDomainDef.metadata_schema,
                drop_zones: selectedDomainDef.drop_zones
            } : undefined
        );

        setDomainName("");
        setDomainDescription("");
        setSelectedDomainDef(null);
        setShowDomainDialog(false);
        setPendingDropPos(null);
        setPendingCanvasId(null);
    };

    // Create new conversation and add to canvas
    const handleNewConversation = async (position?: { x: number; y: number }, autoLinkTargets: Array<{ id: string; type: string }> = [], color?: string, sourceCanvasId?: string) => {
        const newConvId = await createNewConversation();
        if (newConvId) {
            let finalPos = position || getCenterPosition();

            // Adjust position relative to source nodes if dropping on a thing or multiple things
            const targetThings = autoLinkTargets.filter(t => t.type === "thing");
            if (targetThings.length > 0) {
                const storeThings = useCanvasStore.getState().things;
                const sourceNodes = targetThings.map(t => storeThings.find(st => st.id === t.id)).filter(Boolean);

                if (sourceNodes.length === 1) {
                    const sourceNode = sourceNodes[0];
                    if (sourceNode) {
                        finalPos = {
                            x: sourceNode.position_x + (sourceNode.width || 400) + 50,
                            y: sourceNode.position_y
                        };
                    }
                } else if (sourceNodes.length > 1) {
                    let sumX = 0;
                    let sumY = 0;
                    sourceNodes.forEach(node => {
                        sumX += node!.position_x + ((node!.width || 400) / 2);
                        sumY += node!.position_y + ((node!.height || 300) / 2);
                    });
                    finalPos = {
                        x: sumX / sourceNodes.length,
                        y: sumY / sourceNodes.length
                    };
                }
            }

            const canvasIdToUse = sourceCanvasId || pendingCanvasId || undefined;

            // Detect Domain Grouping
            const targetDomain = autoLinkTargets.find(t => t.type === 'domain');
            const nestedDomainId = targetDomain ? targetDomain.id : undefined;

            const newThing = await addThing(
                "conversation",
                {
                    conversation_id: newConvId,
                    messages: [],
                },
                finalPos,
                400, // width
                300, // height
                "New Conversation", // title
                color,
                undefined // scrapeOptions
            );

            if (newThing) {
                setActiveConversationId(newConvId);

                // Auto-link logic (Link to ALL drop targets, including domains)
                // This satisfies "Linked with the domain" requirement
                if (autoLinkTargets.length > 0) {
                    for (const target of autoLinkTargets) {
                        await addLink(
                            newThing.id,
                            target.id,
                            "related",
                            "Context",
                            "Context for this conversation",
                            undefined, // sourceFragment
                            undefined, // targetFragment
                            undefined, // targetCanvasId
                            canvasIdToUse // sourceCanvasId
                        );
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
            400, // width
            300, // height
            conversation.title || "Selected Conversation", // title
            undefined, // color
            undefined // scrapeOptions
        );

        setSelectedConversationId(null);
        setShowConversationDialog(false);
        setPendingDropPos(null);
        setPendingCanvasId(null);
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

    const processFiles = async (files: File[], position: { x: number; y: number }) => {
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
                        400, // width
                        300, // height
                        file.name // title
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
                        400, // width
                        300, // height
                        file.name // title
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
                            400, // width
                            300, // height
                            file.name // title
                        );
                    }
                }
            }
        }
    };


    const handleImageSelectReused = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        await processFiles(files, getCenterPosition());
        if (e.target) e.target.value = "";
    };

    const handleDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        await processFiles(files, getCenterPosition());
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
                400, // width
                300, // height
                "Image Slideshow" // title
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
            {/* Canvas Header with Model Selector, Tools and Toggles */}
            <CanvasToolbar />

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
                                isDraggingFile && !isReadOnly && "ring-4 ring-inset ring-blue-400 bg-blue-50/50 dark:bg-blue-950/30"
                            )}
                            onContextMenu={isReadOnly ? (e) => e.preventDefault() : handlePaneContextMenu}
                            onDragOverCapture={isReadOnly ? undefined : handleDragOver}
                            onDragEnterCapture={isReadOnly ? undefined : handleDragOver}
                            onDragLeave={isReadOnly ? undefined : handleDragLeave}
                            onDrop={isReadOnly ? undefined : handleFileDrop}
                        >
                            {/* Drop zone overlay */}
                            {isDraggingFile && !isReadOnly && (
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
                                onEdgesDelete={isReadOnly ? undefined : handleEdgesDelete}
                                snapToGrid={snapToGrid}
                                snapGrid={[20, 20]} // Standard 20px grid
                                onConnect={isReadOnly ? undefined : onConnect}
                                onNodeDragStart={onNodeDragStart}
                                onNodeDragStop={onNodeDragStop}
                                onNodeClick={onNodeClick}
                                onEdgeClick={onEdgeClick}
                                onSelectionChange={onSelectionChange}
                                onPaneClick={onPaneClick}
                                onNodeContextMenu={isReadOnly ? (e) => e.preventDefault() : onNodeContextMenu}
                                onDragOver={isReadOnly ? undefined : handleDragOver}
                                onDrop={isReadOnly ? undefined : handleFileDrop}
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
                                nodesDraggable={!isReadOnly}
                                nodesConnectable={!isReadOnly}
                                elementsSelectable={true}
                                className={cn(
                                    "bg-slate-50 dark:bg-slate-950",
                                    !isDraggingNode && "animate-movement"
                                )}
                                onInit={(instance) => {
                                    instance.fitView();
                                }}
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
                                    useCanvasStore.getState().setHighlightedFragment(null);
                                }}
                                onConfirm={editingLink ? handleUpdateLink : handleCreateLink}
                                onDelete={editingLink ? handleDeleteLink : undefined}
                                initialType={editingLink?.type || "related"}
                                initialLabel={editingLink?.label || ""}
                                initialDescription={editingLink?.description || ""}
                                mode={editingLink ? "edit" : "create"}
                                availableLinkTypes={activeScenario?.configuration?.link_types || []}
                                keepStandardLinks={activeScenario?.configuration?.keep_standard_links ?? false}
                            />

                            <AgentToolConfigDialog
                                open={showAgentToolDialog}
                                onOpenChange={(open) => {
                                    setShowAgentToolDialog(open);
                                    if (!open) setEditingAgentId(null);
                                }}
                                onConfirm={handleAddAgentTool}
                                sourceNodes={things}
                                links={links}
                                existingConfig={editingAgentId ? { ...things.find(t => t.id === editingAgentId)?.content, id: editingAgentId } : undefined}
                                mode={editingAgentId ? "mapping" : "create"}
                                showMapping={!!editingAgentId}
                            />

                            <WorkflowTemplateDialog
                                open={showWorkflowDialog}
                                onOpenChange={setShowWorkflowDialog}
                                onConfirm={handleAddWorkflow}
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

            <DomainSelector
                isOpen={showDomainSelector}
                onOpenChange={setShowDomainSelector}
                onSelect={(def) => {
                    if (def) {
                        setDomainName(def.name);
                        setDomainDescription(def.description || "");
                        setSelectedDomainDef(def);
                    } else {
                        setDomainName("");
                        setDomainDescription("");
                        setSelectedDomainDef(null);
                    }
                    setShowDomainSelector(false);
                    setShowDomainDialog(true);
                }}
            />

            {/* Inspector Panel - Right Side */}
            <div className="absolute top-0 right-0 h-full pointer-events-none flex justify-end">
                <div className="pointer-events-auto h-full">
                    <InspectorPanel />
                </div>
            </div>
            <OCRConversionDialog
                isOpen={showOCRDialog}
                onClose={() => setShowOCRDialog(false)}
            />
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
        <ReactFlowProvider>
            <CanvasViewInner />
        </ReactFlowProvider>
    );
}
