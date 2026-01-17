"use client";

import * as React from "react";
import {
    ReactFlow,
    Background,
    ReactFlowProvider,
    useReactFlow,
    Node,
    Edge,
    EdgeTypes,
    MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import * as htmlToImage from "html-to-image";
import { ThingNode } from "../semantic-canvas/nodes/thing-node";
import { DomainNode } from "../semantic-canvas/nodes/domain-node";
import { CustomEdge } from "../semantic-canvas/edges/custom-edge";
import { Canvas, CanvasThing, Domain, CanvasLink, LinkType } from "../semantic-canvas/canvas-store";
import { API_URL } from "@/lib/utils";
import { SelectionProvider } from "../semantic-canvas/viewers/selection-context";

// Node types configuration
const nodeTypes = {
    thing: ThingNode,
    domain: DomainNode,
};

const edgeTypes: EdgeTypes = {
    custom: CustomEdge,
};

interface CanvasThumbnailGeneratorProps {
    canvasId: string;
    mode?: 'small' | 'big' | 'both';
    onComplete: () => void;
    onError: (error: string) => void;
}

function ThumbnailGeneratorInner({ canvasId, mode = 'big', onComplete, onError }: CanvasThumbnailGeneratorProps) {
    const { fitView } = useReactFlow();
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [nodes, setNodes] = React.useState<Node[]>([]);
    const [edges, setEdges] = React.useState<Edge[]>([]);
    const [isLoaded, setIsLoaded] = React.useState(false);

    // Lifecycle check to avoid async errors on unmount
    const isMounted = React.useRef(true);
    React.useEffect(() => {
        return () => { isMounted.current = false; };
    }, []);

    // Fetch and prepare data
    React.useEffect(() => {
        const loadCanvas = async () => {
            try {
                const token = localStorage.getItem("token");
                const res = await fetch(`${API_URL}/canvases/${canvasId}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!res.ok) throw new Error("Failed to load canvas data");

                const canvas: Canvas = await res.json();

                // Convert to Nodes/Edges
                const { nodes: flowNodes, edges: flowEdges } = convertToReactFlow(canvas);

                if (isMounted.current) {
                    setNodes(flowNodes);
                    setEdges(flowEdges);
                    setIsLoaded(true);
                }
            } catch (err) {
                console.error("Failed to load canvas for thumbnail:", err);
                if (isMounted.current) {
                    onError(err instanceof Error ? err.message : "Unknown error");
                }
            }
        };

        loadCanvas();
    }, [canvasId, onError]);

    // Capture effect
    React.useEffect(() => {
        if (!isLoaded) return;

        if (nodes.length === 0) {
            // Empty canvas - skip capture to avoid errors/stalls
            // Maybe clear thumbnail if it exists? For now just skip.
            onComplete();
            return;
        }

        const capture = async () => {
            // Wait for React Flow to render nodes
            await new Promise(resolve => setTimeout(resolve, 1500));
            if (!isMounted.current) return;

            // Fit view to ensure everything is visible
            fitView({ padding: 0.2, duration: 200 });

            // Wait for fitView animation
            await new Promise(resolve => setTimeout(resolve, 800));
            if (!isMounted.current) return;

            if (!containerRef.current) {
                return;
            }

            try {
                // Configs
                const BIG_WIDTH = 3840;
                const BIG_HEIGHT = 2160;
                const BIG_SCALE = 3;

                const SMALL_WIDTH = 320;
                const SMALL_HEIGHT = 180;
                const SMALL_SCALE = 1;

                let updates: any = {};

                // Helper to capture at specific resolution
                const captureAt = async (width: number, height: number, scale: number) => {
                    return htmlToImage.toPng(containerRef.current!, {
                        backgroundColor: '#f8fafc',
                        pixelRatio: 1, // We handle scaling manually via width/height style
                        width: width,
                        height: height,
                        style: {
                            visibility: 'visible',
                            opacity: '1',
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                            width: `${width / scale}px`,
                            height: `${height / scale}px`
                        }
                    });
                };

                // Helper to resize image (downsample)
                const resizeImage = (dataUrl: string, targetW: number, targetH: number) => {
                    return new Promise<string>((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = targetW;
                            canvas.height = targetH;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(img, 0, 0, targetW, targetH);
                                resolve(canvas.toDataURL('image/png')); // PNG for quality/transparency consistency
                            } else {
                                resolve(dataUrl); // Fallback
                            }
                        };
                        img.src = dataUrl;
                    });
                };

                if (mode === 'small') {
                    // FAST Path: Direct capture at low res
                    const smallUrl = await captureAt(SMALL_WIDTH, SMALL_HEIGHT, SMALL_SCALE);
                    updates.thumbnail_small = smallUrl;
                } else if (mode === 'big') {
                    // Legacy Path: High Res Only
                    const bigUrl = await captureAt(BIG_WIDTH, BIG_HEIGHT, BIG_SCALE);
                    updates.thumbnail = bigUrl;
                } else if (mode === 'both') {
                    // Dual Path: Capture Big, Downscale for Small (More coherent than capturing twice)
                    const bigUrl = await captureAt(BIG_WIDTH, BIG_HEIGHT, BIG_SCALE);
                    updates.thumbnail = bigUrl;
                    updates.thumbnail_small = await resizeImage(bigUrl, SMALL_WIDTH, SMALL_HEIGHT);
                }

                if (!isMounted.current) return;

                // Update settings directly via API
                const token = localStorage.getItem("token");
                const currentConfig = (await (await fetch(`${API_URL}/canvases/${canvasId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })).json()).owner_config || {};

                await fetch(`${API_URL}/canvases/${canvasId}`, {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        owner_config: {
                            ...currentConfig,
                            ...updates
                        }
                    }),
                });

                if (isMounted.current) {
                    onComplete();
                }
            } catch (err) {
                console.error("Thumbnail capture failed:", err);
                if (isMounted.current) {
                    onError("Capture failed: " + (err instanceof Error ? err.message : String(err)));
                }
            }
        };

        capture();
    }, [isLoaded, nodes, canvasId, fitView, onComplete, onError, mode]);

    if (!isLoaded) return null;

    return (
        <div style={{ position: 'fixed', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', zIndex: -1000, opacity: 0, pointerEvents: 'none' }}>
            <div
                ref={containerRef}
                className={`thumbnail-generator-${canvasId}`}
                style={{
                    // We set the physical size to the base "logical" size (4K / 3) 
                    // so that when we apply scale(3) during capture, it fills the full 4K buffer.
                    width: 3840 / 3,
                    height: 2160 / 3,
                    background: '#f8fafc' // Ensure background is set for capture context
                }}
            >
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    minZoom={0.1}
                >
                    <Background />
                </ReactFlow>
            </div>
        </div>
    );
}

export function CanvasThumbnailGenerator(props: CanvasThumbnailGeneratorProps) {
    return (
        <ReactFlowProvider>
            <SelectionProvider>
                <ThumbnailGeneratorInner {...props} />
            </SelectionProvider>
        </ReactFlowProvider>
    );
}

// Helper to convert Canvas data to React Flow format
// Duplicated/Adapted from canvas-view.tsx to avoid complex dependencies
function convertToReactFlow(canvas: Canvas) {
    const { things, domains, links } = canvas;

    // --- Nodes ---
    const thingNodes: Node[] = things.map((thing) => ({
        id: thing.id,
        type: "thing",
        position: { x: thing.position_x, y: thing.position_y },
        data: {
            thing,
            zoomLevel: "full",
            isSelected: false,
            // Mock handlers to prevent crashes if nodes try to call them
            onOpenConversation: () => { },
            onToggleIconify: () => { },
            onDelete: () => { },
            onResizeEnd: () => { },
        },
        draggable: false,
        style: (!thing.iconified) ? {
            width: thing.width ?? 400,
            height: thing.height ?? undefined,
        } : undefined,
    }));

    const domainNodes: Node[] = domains.map((domain) => ({
        id: domain.id,
        type: "domain",
        position: { x: domain.position_x, y: domain.position_y },
        data: {
            domain,
            zoomLevel: "full",
            onUpdate: () => { },
            onContextMenu: () => { },
            onResizeEnd: () => { },
        },
        draggable: false,
        zIndex: -1,
        style: {
            width: domain.width || 300,
            height: domain.height || 200,
        },
    }));

    // --- Edges ---
    const getLinkColor = (linkType: string) => {
        switch (linkType) {
            case "related": return "#3b82f6";
            case "references": return "#22c55e";
            case "derived_from": return "#a855f7";
            case "contains": return "#14b8a6";
            case "proves": return "#0ea5e9";
            case "refutes": return "#ef4444";
            case "prerequisite": return "#f97316";
            case "influences": return "#06b6d4";
            case "triggers": return "#eab308";
            case "blocks": return "#a855f7";
            case "supersedes": return "#64748b";
            default: return "#6366f1";
        }
    };

    const groups: Record<string, typeof links> = {};
    links.forEach(link => {
        const key = `${link.source_id}-${link.target_id}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(link);
    });

    const edges: Edge[] = [];
    Object.values(groups).forEach(group => {
        group.sort((a, b) => a.id.localeCompare(b.id));
        const total = group.length;

        group.forEach((link, index) => {
            const centeredIndex = index - (total - 1) / 2;
            edges.push({
                id: link.id,
                source: link.source_id,
                target: link.target_id,
                sourceHandle: (link.source_fragment?.type === "region") ? `fragment-handle-${link.id}` : undefined,
                label: link.label || undefined,
                type: "custom",
                data: { offset: centeredIndex },
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
                labelStyle: { fontSize: 12, fontWeight: 500 },
                labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
            });
        });
    });

    return {
        nodes: [...domainNodes, ...thingNodes],
        edges,
    };
}
