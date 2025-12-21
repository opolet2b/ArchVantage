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
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    Node,
    Edge,
    Connection,
    NodeTypes,
    NodeChange,
    useReactFlow,
    ReactFlowProvider,
    OnNodesChange,
    OnEdgesChange,
} from "reactflow";
import "reactflow/dist/style.css";

import { useCanvasStore, getZoomLevel, LinkType, CanvasLink } from "./canvas-store";
import { ThingNode } from "./nodes/thing-node";
import { DomainNode } from "./nodes/domain-node";
import { CanvasToolbar } from "./canvas-toolbar";
import { LinkTypeDialog } from "./link-type-dialog";
import { cn, API_URL } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Brain, Loader2 } from "lucide-react";
import { CanvasContextMenu } from "./canvas-context-menu";

// =============================================================================
// Node Types
// =============================================================================

// Node Types definition moved inside component to ensure stability with React Flow
const nodeTypesMemo = {
    thing: ThingNode,
    domain: DomainNode,
};

const edgeTypesMemo = {};


// =============================================================================
// Canvas View Inner (needs ReactFlow context)
// =============================================================================

function CanvasViewInner() {
    const { fitView, getViewport, setViewport } = useReactFlow();

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
        updateThing,
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
    } = useCanvasStore();

    // Model state from store
    const selectedModel = useCanvasStore((state) => state.selectedModel);
    const setSelectedModel = useCanvasStore((state) => state.setSelectedModel);

    // Model presets state for dropdown
    interface ModelPreset {
        name: string;
        type: "local" | "remote";
        model_name?: string;
    }
    const [models, setModels] = React.useState<ModelPreset[]>([]);
    const [isLoadingModels, setIsLoadingModels] = React.useState(true);

    // Fetch available models on mount (only once)
    React.useEffect(() => {
        const fetchModels = async () => {
            try {
                const token = localStorage.getItem("token");
                const res = await fetch(`${API_URL}/config/presets`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const data = await res.json();
                    const presetList = data.presets || [];
                    setModels(presetList);
                    // Auto-select first model if none selected in store
                    const currentModel = useCanvasStore.getState().selectedModel;
                    if (!currentModel && presetList.length > 0) {
                        setSelectedModel(presetList[0].name);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch model presets:", error);
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
    const [contextMenuContext, setContextMenuContext] = React.useState<"canvas" | "domain">("canvas");
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

    // Convert things to React Flow nodes (memoized)
    const thingNodes: Node[] = React.useMemo(() => things.map((thing) => ({
        id: thing.id,
        type: "thing",
        position: { x: thing.position_x, y: thing.position_y },
        data: {
            thing,
            zoomLevel,
            isSelected: selectedThingIds.includes(thing.id),
            onOpenConversation: handleOpenConversation,
            onToggleIconify: toggleIconify,
            onDelete: deleteThing,
        },
        draggable: true,
        // Include width/height if thing has been resized or use default for heavy types (skip for iconified)
        style: (!thing.iconified) ? {
            width: thing.width ?? 400, // Default width if not set to prevent auto-resize to content
            height: thing.height ?? undefined, // Allow height to be auto if not set, or set default?
        } : undefined,
    })), [things, zoomLevel, selectedThingIds, handleOpenConversation, toggleIconify, deleteThing]);

    // Handle domain rename
    const handleDomainRename = React.useCallback((domainId: string, newName: string) => {
        updateDomain(domainId, { name: newName });
    }, [updateDomain]);

    // Handle domain right-click (context menu for domain) - defined here before domainNodes
    const handleDomainContextMenu = React.useCallback(
        (event: React.MouseEvent, domainId: string) => {
            event.preventDefault();
            event.stopPropagation();
            setContextMenuPosition({ x: event.clientX, y: event.clientY });
            setContextMenuContext("domain");
            setContextMenuDomainId(domainId);
            setContextMenuOpen(true);
        },
        []
    );

    // Convert domains to React Flow nodes (memoized, rendered behind things)
    // Handle domain resize end
    const handleDomainResize = React.useCallback((domainId: string, width: number, height: number) => {
        console.log(`[CanvasView] Domain resized: ${domainId} to ${width}x${height}`);
        updateDomain(domainId, { width, height });
    }, [updateDomain]);

    const domainNodes: Node[] = React.useMemo(() => domains.map((domain) => ({
        id: domain.id,
        type: "domain",
        position: { x: domain.position_x, y: domain.position_y },
        data: {
            domain,
            zoomLevel,
            onRename: handleDomainRename,
            onContextMenu: handleDomainContextMenu,
            onResizeEnd: handleDomainResize,
        },
        draggable: true,
        selectable: true,
        zIndex: -1, // Behind things
        style: {
            width: domain.width || 300,
            height: domain.height || 200,
        },
    })), [domains, zoomLevel, handleDomainRename, handleDomainContextMenu, handleDomainResize]);

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
    const allEdges: Edge[] = React.useMemo(() => links.map((link) => ({
        id: link.id,
        source: link.source_id,
        target: link.target_id,
        label: link.label || undefined,
        type: "smoothstep",
        animated: link.type === "derived_from",
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
    })), [links]);

    // React Flow state - initialized with current nodes
    const [nodes, setNodes, onNodesChange] = useNodesState(allNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(allEdges);

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
                    // console.log("[CanvasView] Dimension change detected (ignored)", change.id);
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
            console.log("[CanvasView] Skipping sync during resize");
            return;
        }

        const domainsKey = JSON.stringify(domains.map(d => ({ id: d.id, x: d.position_x, y: d.position_y, w: d.width, h: d.height })));
        const thingsKey = JSON.stringify(things.map(t => ({ id: t.id, x: t.position_x, y: t.position_y, w: t.width, h: t.height, iconified: t.iconified })));

        // Only update if something actually changed
        if (domainsKey !== prevDomainsRef.current || thingsKey !== prevThingsRef.current) {
            console.log("[CanvasView] Syncing nodes - domains:", domains.length, "things:", things.length);
            prevDomainsRef.current = domainsKey;
            prevThingsRef.current = thingsKey;
            setNodes(allNodes);
        }
    }, [domains, things, zoomLevel, selectedThingIds, allNodes, setNodes]);

    React.useEffect(() => {
        setEdges(allEdges);
    }, [allEdges, setEdges]);

    // Track domain drag start position
    const dragStartPosRef = React.useRef<{ id: string; x: number; y: number } | null>(null);

    // Handle node drag start - capture starting position for domains
    const onNodeDragStart = React.useCallback(
        (_: React.MouseEvent, node: Node) => {
            if (node.type === "domain") {
                dragStartPosRef.current = {
                    id: node.id,
                    x: node.position.x,
                    y: node.position.y,
                };
            }
        },
        []
    );

    // Handle node drag end - save position
    const onNodeDragStop = React.useCallback(
        async (_: React.MouseEvent, node: Node) => {
            if (node.type === "thing") {
                // Move the thing
                moveThing(node.id, node.position.x, node.position.y);

                // Check if thing was dropped inside a domain
                const domainId = checkThingInDomain(
                    node.id,
                    node.position.x,
                    node.position.y
                );

                // Get current thing to check if domain changed
                const thing = things.find(t => t.id === node.id);
                console.log("[DragStop] Thing:", node.id);
                console.log("[DragStop] New position:", node.position.x, node.position.y);
                console.log("[DragStop] Found in domain:", domainId);
                console.log("[DragStop] Thing's current domain_id:", thing?.domain_id);

                if (thing) {
                    if (domainId && thing.domain_id !== domainId) {
                        // Add to new domain
                        console.log("[DragStop] Adding to domain:", domainId);
                        await addThingToDomain(node.id, domainId);
                    } else if (!domainId && thing.domain_id) {
                        // Remove from domain
                        console.log("[DragStop] Removing from domain:", thing.domain_id);
                        await removeThingFromDomain(node.id);
                    }
                }

                // Persist position to backend
                await updateThing(node.id, {
                    position_x: node.position.x,
                    position_y: node.position.y,
                });
            } else if (node.type === "domain") {
                // Calculate how much the domain moved
                const startPos = dragStartPosRef.current;

                if (startPos && startPos.id === node.id) {
                    const deltaX = node.position.x - startPos.x;
                    const deltaY = node.position.y - startPos.y;

                    // Only move things if there was actual movement
                    if (deltaX !== 0 || deltaY !== 0) {
                        // Move all things that belong to this domain
                        const domainThings = things.filter(t => t.domain_id === node.id);

                        // Update React Flow nodes immediately for smooth visual update
                        setNodes((nds) => nds.map((n) => {
                            if (n.type === "thing") {
                                const thing = domainThings.find(t => t.id === n.id);
                                if (thing) {
                                    return {
                                        ...n,
                                        position: {
                                            x: n.position.x + deltaX,
                                            y: n.position.y + deltaY,
                                        },
                                    };
                                }
                            }
                            return n;
                        }));

                        // Update store immediately (synchronous)
                        for (const thing of domainThings) {
                            const newX = thing.position_x + deltaX;
                            const newY = thing.position_y + deltaY;
                            moveThing(thing.id, newX, newY);
                        }

                        // Batch backend updates in parallel (fire and forget)
                        Promise.all(
                            domainThings.map((thing) =>
                                updateThing(thing.id, {
                                    position_x: thing.position_x + deltaX,
                                    position_y: thing.position_y + deltaY,
                                })
                            )
                        ).catch(err => console.error("[Domain Drag] Failed to persist thing positions:", err));
                    }
                }

                // Move domain immediately
                moveDomain(node.id, node.position.x, node.position.y);

                // Persist domain position (fire and forget)
                updateDomain(node.id, {
                    position_x: node.position.x,
                    position_y: node.position.y,
                }).catch(err => console.error("[Domain Drag] Failed to persist domain position:", err));

                // Clear drag start
                dragStartPosRef.current = null;
            }
        },
        [moveThing, moveDomain, updateThing, updateDomain, checkThingInDomain,
            addThingToDomain, removeThingFromDomain, things, setNodes]
    );

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
        async (type: LinkType, label?: string) => {
            if (pendingConnection) {
                await addLink(
                    pendingConnection.source,
                    pendingConnection.target,
                    type,
                    label
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
        async (type: LinkType, label?: string) => {
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
                            body: JSON.stringify({ type, label }),
                        }
                    );
                    // Update local state
                    useCanvasStore.setState((state) => ({
                        links: state.links.map((l) =>
                            l.id === editingLink.id ? { ...l, type, label: label || null } : l
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
        (_: React.MouseEvent, node: Node) => {
            if (node.type === "thing") {
                selectThing(node.id);
            }
        },
        [selectThing]
    );

    // Handle canvas click (deselect)
    const onPaneClick = React.useCallback(() => {
        clearSelection();
    }, [clearSelection]);

    // Handle canvas right-click (context menu)
    const handlePaneContextMenu = React.useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();
            setContextMenuPosition({ x: event.clientX, y: event.clientY });
            setContextMenuContext("canvas");
            setContextMenuDomainId(undefined);
            setContextMenuOpen(true);
        },
        []
    );

    // Drag-and-drop file handling state
    const [isDraggingFile, setIsDraggingFile] = React.useState(false);

    // Handle file drag over
    const handleDragOver = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes("Files")) {
            e.dataTransfer.dropEffect = "copy";
            setIsDraggingFile(true);
        }
    }, []);

    // Handle selection change for traceability highlighting
    const onSelectionChange = React.useCallback(
        ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
            const { setHighlightedFragment, links } = useCanvasStore.getState();

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

    // Handle file drop on canvas
    const handleFileDrop = React.useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingFile(false);

            const files = Array.from(e.dataTransfer.files);
            if (files.length === 0) return;

            // Calculate drop position in canvas coordinates
            const position = {
                x: e.clientX - viewport.x,
                y: e.clientY - viewport.y,
            };

            for (const file of files) {
                console.log(`[FileDrop] Processing file: ${file.name}, type: ${file.type}, size: ${file.size}`);

                if (file.type.startsWith("image/")) {
                    console.log(`[FileDrop] Adding as image: ${file.name}`);
                    await addThing(
                        "image",
                        {
                            filename: file.name,
                            file_path: URL.createObjectURL(file),
                        },
                        position,
                        file.name
                    );
                    console.log(`[FileDrop] Image added successfully: ${file.name}`);
                } else {
                    // Determine if file is text-based or binary
                    const textExtensions = ['.txt', '.md', '.json', '.csv', '.xml', '.html', '.htm', '.yaml', '.yml', '.log'];
                    const isTextFile = textExtensions.some(ext => file.name.toLowerCase().endsWith(ext)) ||
                        file.type.startsWith('text/') ||
                        file.type === 'application/json';

                    console.log(`[FileDrop] isTextFile: ${isTextFile}`);

                    if (isTextFile) {
                        // Read text content for text-based documents
                        try {
                            console.log(`[FileDrop] Reading as text file`);
                            const text = await file.text();
                            console.log(`[FileDrop] Text content length: ${text.length}`);
                            await addThing(
                                "document",
                                {
                                    filename: file.name,
                                    content: text,
                                },
                                position,
                                file.name
                            );
                            console.log(`[FileDrop] Added text document`);
                        } catch (err) {
                            console.error("[FileDrop] Failed to read file as text:", file.name, err);
                        }
                    } else {
                        // For binary files (PDF, Excel, Word), store as blob URL
                        console.log(`[FileDrop] Adding as binary document`);
                        try {
                            const blobUrl = URL.createObjectURL(file);
                            console.log(`[FileDrop] Blob URL created: ${blobUrl}`);
                            const result = await addThing(
                                "document",
                                {
                                    filename: file.name,
                                    file_path: blobUrl,
                                    file_type: file.type,
                                    file_size: file.size,
                                },
                                position,
                                file.name
                            );
                            console.log(`[FileDrop] addThing result:`, result);
                            if (!result) {
                                console.error(`[FileDrop] addThing returned null - check canvasId and auth token`);
                            }
                        } catch (err) {
                            console.error(`[FileDrop] Error adding binary document:`, err);
                        }
                        console.log(`[FileDrop] Added binary document`);
                    }
                }
                // Offset subsequent files so they don't stack
                position.x += 50;
                position.y += 30;
            }
        },
        [addThing, viewport]
    );

    return (
        <div className="h-full w-full flex flex-col relative">
            {/* Canvas Header with Model Selector */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Brain className="h-4 w-4" />
                    <span>Model:</span>
                    {isLoadingModels ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Select
                            value={selectedModel || ""}
                            onValueChange={setSelectedModel}
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
            </div>

            <div
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
                {/* React Flow View - DEBUG MODE: NODES RE-ENABLED WITH DEBUG RENDERER */}
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDragStop={onNodeDragStop}
                    // onMoveEnd={onMoveEnd} // Disabled
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                    onSelectionChange={onSelectionChange}
                    onPaneClick={onPaneClick}
                    onDragOver={handleDragOver}
                    onDrop={handleFileDrop}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypesMemo}
                    // fitView // Disabled
                    minZoom={0.1}
                    maxZoom={2}
                    defaultViewport={viewport}
                    selectNodesOnDrag={false}
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

                {/* Canvas Toolbar */}
                <CanvasToolbar />

                {/* Link Type Dialog */}
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
                    mode={editingLink ? "edit" : "create"}
                />

                {/* Canvas Context Menu */}
                <CanvasContextMenu
                    isOpen={contextMenuOpen}
                    position={contextMenuPosition}
                    context={contextMenuContext}
                    domainId={contextMenuDomainId}
                    onClose={() => setContextMenuOpen(false)}
                />
            </div>
        </div>
    );
}

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

            // Fetch user's canvases to see if any exist
            const token = localStorage.getItem("token");
            try {
                const res = await fetch(`${API_URL}/canvases`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (res.ok) {
                    const canvases = await res.json();
                    if (canvases.length > 0) {
                        // Load the first existing canvas
                        await loadCanvas(canvases[0].id);
                    }
                }
            } catch (err) {
                console.error("[CanvasView] Failed to fetch canvases:", err);
            }

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
        console.log("[CanvasView] RENDER STATE: Auth Error or Not Initialized + No Token", { authError, isInitialized, hasToken });
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
        console.log("[CanvasView] RENDER STATE: Loading (isInitialized=false && !storeCanvasId)");
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

    console.log("[CanvasView] RENDER STATE: Rendering CanvasViewInner for canvas:", storeCanvasId);
    return (
        <ReactFlowProvider>
            <CanvasViewInner />
        </ReactFlowProvider>
    );
}

