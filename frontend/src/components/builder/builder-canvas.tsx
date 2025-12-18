"use client";

/**
 * Builder Canvas Component
 *
 * React Flow canvas with custom node types for primitives.
 * Supports drag-drop from palette and node selection.
 */
import { useCallback, useMemo } from "react";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Connection,
    Edge,
    addEdge,
    BackgroundVariant,
    NodeTypes,
    Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useBuilderStore } from "@/lib/builder-store";
import { PrimitiveType } from "@/lib/builder-types";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HttpRequestNode } from "./nodes/http-request-node";
import { ConditionNode } from "./nodes/condition-node";
import { CallToolNode } from "./nodes/call-tool-node";
import { ForEachNode } from "./nodes/foreach-node";
import { TextTemplateNode } from "./nodes/text-template-node";
import { LlmDecisionNode } from "./nodes/llm-decision-node";
import { JsonMappingNode } from "./nodes/json-mapping-node";
import { StartNode } from "./nodes/start-node";
import { EndNode } from "./nodes/end-node";
import { DocumentConverterNode } from "./nodes/document-converter-node";

// Custom node types mapping
const nodeTypes: NodeTypes = {
    start: StartNode,
    end: EndNode,
    http_request: HttpRequestNode,
    condition: ConditionNode,
    call_tool: CallToolNode,
    foreach: ForEachNode,
    text_template: TextTemplateNode,
    llm_decision: LlmDecisionNode,
    json_mapping: JsonMappingNode,
    document_converter: DocumentConverterNode,
};

export function BuilderCanvas() {
    const nodes = useBuilderStore((state) => state.nodes);
    const edges = useBuilderStore((state) => state.edges);
    const onNodesChange = useBuilderStore((state) => state.onNodesChange);
    const onEdgesChange = useBuilderStore((state) => state.onEdgesChange);
    const setSelectedNodeId = useBuilderStore((state) => state.setSelectedNodeId);
    const addNode = useBuilderStore((state) => state.addNode);
    const reconnectEdge = useBuilderStore((state) => state.reconnectEdge);
    const activeNodeId = useBuilderStore((state) => state.activeNodeId);
    const showNodeIds = useBuilderStore((state) => state.showNodeIds);
    const toggleNodeIds = useBuilderStore((state) => state.toggleNodeIds);

    // Handle new connections
    const onConnect = useCallback(
        (connection: Connection) => {
            if (connection.source && connection.target) {
                useBuilderStore.getState().connectNodes(
                    connection.source,
                    connection.target,
                    connection.sourceHandle || undefined
                );
            }
        },
        []
    );

    const onReconnect = useCallback(
        (oldEdge: Edge, newConnection: Connection) => {
            reconnectEdge(oldEdge, newConnection);
        },
        [reconnectEdge]
    );

    // Handle node selection
    const onNodeClick = useCallback(
        (_: React.MouseEvent, node: { id: string }) => {
            setSelectedNodeId(node.id);
        },
        [setSelectedNodeId]
    );

    // Handle canvas click (deselect)
    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
    }, [setSelectedNodeId]);

    // Handle drag and drop from palette
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData("application/primitive-type") as PrimitiveType;
            if (!type) return;

            // Get canvas position
            const reactFlowBounds = (event.target as HTMLElement)
                .closest(".react-flow")
                ?.getBoundingClientRect();

            if (!reactFlowBounds) return;

            const position = {
                x: event.clientX - reactFlowBounds.left,
                y: event.clientY - reactFlowBounds.top,
            };

            addNode(type, position);
        },
        [addNode]
    );

    // Apply active node highlighting
    const nodesWithHighlight = useMemo(() => {
        return nodes.map((node) => ({
            ...node,
            className: node.id === activeNodeId ? "ring-2 ring-green-500 ring-offset-2" : "",
        }));
    }, [nodes, activeNodeId]);

    return (
        <div className="w-full h-full">
            <ReactFlow
                nodes={nodesWithHighlight}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onReconnect={onReconnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onDragOver={onDragOver}
                onDrop={onDrop}
                nodeTypes={nodeTypes}
                fitView
                snapToGrid
                snapGrid={[16, 16]}
                deleteKeyCode={["Backspace", "Delete"]}
                defaultEdgeOptions={{
                    type: "smoothstep",
                    animated: true,
                }}
                proOptions={{ hideAttribution: true }}
            >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                <Controls />

                {/* Node ID Toggle */}
                <Panel position="top-right" className="m-2">
                    <Button
                        onClick={toggleNodeIds}
                        variant={showNodeIds ? "default" : "outline"}
                        size="sm"
                        className="shadow-md gap-1.5"
                        title={showNodeIds ? "Hide Node IDs" : "Show Node IDs"}
                    >
                        {showNodeIds ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        <span className="text-xs">IDs</span>
                    </Button>
                </Panel>

                <MiniMap
                    nodeColor={(node) => {
                        switch (node.data?.primitiveType) {
                            case "START":
                                return "#22c55e"; // Green
                            case "END":
                                return "#ef4444"; // Red
                            case "HTTP_REQUEST":
                                return "#3b82f6"; // Blue
                            case "CONDITION":
                                return "#f59e0b"; // Amber
                            case "CALL_TOOL":
                                return "#8b5cf6"; // Purple
                            case "LLM_DECISION":
                                return "#ec4899"; // Pink
                            case "FOREACH":
                                return "#10b981"; // Green
                            case "DOCUMENT_CONVERTER":
                                return "#14b8a6"; // Teal
                            default:
                                return "#6b7280"; // Gray
                        }
                    }}
                    maskColor="rgba(0, 0, 0, 0.1)"
                />

                {/* Empty State */}
                {nodes.length === 0 && (
                    <Panel position="top-center" className="mt-20">
                        <div className="text-center p-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur rounded-xl border">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center">
                                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                            </div>
                            <h3 className="font-semibold mb-2">Start Building</h3>
                            <p className="text-sm text-muted-foreground max-w-xs">
                                Drag primitives from the right panel or use the Architect
                                chat to generate a workflow.
                            </p>
                        </div>
                    </Panel>
                )}
            </ReactFlow>
        </div>
    );
}
