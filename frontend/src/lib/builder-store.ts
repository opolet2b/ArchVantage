/**
 * Agent Builder Zustand Store
 *
 * Manages state synchronization between React Flow graph and Blueprint JSON.
 * Handles the "Two Truths" pattern from the frontend specs.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { Node, Edge, OnNodesChange, OnEdgesChange, applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import {
    Blueprint,
    BlueprintCreate,
    GraphNode,
    GraphEdge,
    AgentGraph,
    PrimitiveType,
    ExecutionStep,
    StreamEvent
} from "./builder-types";
import { API_URL } from "./utils";

// =============================================================================
// Store State Interface
// =============================================================================

interface BuilderState {
    // Blueprint metadata
    blueprintId: string | null;
    blueprintName: string;
    blueprintDescription: string;
    isPublished: boolean;
    secretsRequirements: string[];
    inputsSchema: Record<string, unknown>;

    // React Flow state (UI positions included)
    nodes: Node[];
    edges: Edge[];

    // Selected node for inspector
    selectedNodeId: string | null;

    // Architect chat state
    architectMessages: ChatMessage[];
    isGenerating: boolean;
    discoveredTools: string[];

    // Tool selection state for generation
    availableTools: AvailableTool[];
    selectedToolIds: number[];
    isLoadingTools: boolean;

    // Execution state
    isExecuting: boolean;
    executionSteps: ExecutionStep[];
    activeNodeId: string | null;
    testInputs: Record<string, unknown>;

    // UI state
    isDirty: boolean;
    isSaving: boolean;
    selectedModel: string;

    // Console state
    consoleOpen: boolean;
    consoleLogs: ConsoleLog[];
}

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

interface ConsoleLog {
    id: string;
    type: "info" | "error" | "success" | "step";
    message: string;
    data?: unknown;
    timestamp: Date;
}

interface AvailableTool {
    id: number;
    name: string;
    description: string | null;
}

// =============================================================================
// Store Actions Interface
// =============================================================================

interface BuilderActions {
    // Blueprint actions
    setBlueprint: (blueprint: Blueprint) => void;
    setBlueprintName: (name: string) => void;
    setBlueprintDescription: (description: string) => void;
    resetBlueprint: () => void;
    saveBlueprint: () => Promise<Blueprint | null>;
    loadBlueprint: (id: string) => Promise<void>;

    // React Flow actions
    onNodesChange: OnNodesChange<Node>;
    onEdgesChange: OnEdgesChange<Edge>;
    addNode: (type: PrimitiveType, position: { x: number; y: number }) => void;
    updateNodeParams: (nodeId: string, params: Record<string, unknown>) => void;
    deleteNode: (nodeId: string) => void;
    connectNodes: (sourceId: string, targetId: string, condition?: string) => void;

    // Selection actions
    setSelectedNodeId: (nodeId: string | null) => void;

    // Architect actions
    sendArchitectMessage: (content: string) => Promise<void>;
    applyGeneratedBlueprint: (blueprint: Blueprint) => void;
    clearArchitectChat: () => void;

    // Tool selection actions
    fetchAvailableTools: () => Promise<void>;
    toggleToolSelection: (toolId: number) => void;
    clearToolSelection: () => void;

    // Execution actions
    executeBlueprint: () => Promise<void>;
    executeWithStream: () => Promise<void>;
    setTestInputs: (inputs: Record<string, unknown>) => void;
    clearExecution: () => void;

    // UI actions
    setSelectedModel: (model: string) => void;
    toggleConsole: () => void;
    addConsoleLog: (type: ConsoleLog["type"], message: string, data?: unknown) => void;
    clearConsoleLogs: () => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert React Flow nodes/edges to Blueprint graph format.
 */
function flowToGraph(nodes: Node[], edges: Edge[]): AgentGraph {
    const graphNodes: GraphNode[] = nodes.map((node) => ({
        id: node.id,
        type: node.data.primitiveType as PrimitiveType,
        metadata: {
            label: node.data.label as string,
            ui_position: { x: node.position.x, y: node.position.y }
        },
        params: node.data.params as Record<string, unknown>
    }));

    const graphEdges: GraphEdge[] = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        condition: edge.data?.condition as string | undefined
    }));

    return { nodes: graphNodes, edges: graphEdges };
}

/**
 * Convert Blueprint graph to React Flow nodes/edges.
 */
function graphToFlow(graph: AgentGraph): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = graph.nodes.map((node) => ({
        id: node.id,
        type: node.type.toLowerCase(),
        position: { x: node.metadata.ui_position.x, y: node.metadata.ui_position.y },
        data: {
            label: node.metadata.label,
            primitiveType: node.type,
            params: node.params
        }
    }));

    const edges: Edge[] = graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        data: { condition: edge.condition }
    }));

    return { nodes, edges };
}

/**
 * Generate unique ID for nodes and edges.
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get auth token from storage.
 */
function getAuthToken(): string | null {
    if (typeof window !== "undefined") {
        return localStorage.getItem("token");
    }
    return null;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: BuilderState = {
    blueprintId: null,
    blueprintName: "New Agent",
    blueprintDescription: "",
    isPublished: false,
    secretsRequirements: [],
    inputsSchema: {},
    nodes: [],
    edges: [],
    selectedNodeId: null,
    architectMessages: [],
    isGenerating: false,
    discoveredTools: [],
    availableTools: [],
    selectedToolIds: [],
    isLoadingTools: false,
    isExecuting: false,
    executionSteps: [],
    activeNodeId: null,
    testInputs: {},
    isDirty: false,
    isSaving: false,
    selectedModel: "default",
    consoleOpen: false,
    consoleLogs: []
};

// =============================================================================
// Store Creation
// =============================================================================

export const useBuilderStore = create<BuilderState & BuilderActions>()(
    devtools(
        (set, get) => ({
            ...initialState,

            // -----------------------------------------------------------------
            // Blueprint Actions
            // -----------------------------------------------------------------

            setBlueprint: (blueprint) => {
                const { nodes, edges } = graphToFlow(blueprint.graph);
                set({
                    blueprintId: blueprint.id,
                    blueprintName: blueprint.name,
                    blueprintDescription: blueprint.description || "",
                    isPublished: blueprint.is_published,
                    secretsRequirements: blueprint.secrets_requirements,
                    inputsSchema: blueprint.inputs_schema,
                    nodes,
                    edges,
                    isDirty: false
                });
            },

            setBlueprintName: (name) => set({ blueprintName: name, isDirty: true }),

            setBlueprintDescription: (description) =>
                set({ blueprintDescription: description, isDirty: true }),

            resetBlueprint: () => set(initialState),

            saveBlueprint: async () => {
                const state = get();
                const token = getAuthToken();
                if (!token) return null;

                set({ isSaving: true });

                try {
                    const graph = flowToGraph(state.nodes, state.edges);
                    const payload: BlueprintCreate = {
                        name: state.blueprintName,
                        description: state.blueprintDescription,
                        graph,
                        inputs_schema: state.inputsSchema,
                        secrets_requirements: state.secretsRequirements
                    };

                    const method = state.blueprintId ? "PUT" : "POST";
                    const url = state.blueprintId
                        ? `${API_URL}/agent-blueprints/${state.blueprintId}`
                        : `${API_URL}/agent-blueprints`;

                    const res = await fetch(url, {
                        method,
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!res.ok) throw new Error("Failed to save blueprint");

                    const saved = await res.json();
                    set({
                        blueprintId: saved.id,
                        isDirty: false,
                        isSaving: false
                    });

                    get().addConsoleLog("success", `Blueprint saved: ${saved.id}`);
                    return saved;
                } catch (error) {
                    get().addConsoleLog("error", `Save failed: ${error}`);
                    set({ isSaving: false });
                    return null;
                }
            },

            loadBlueprint: async (id) => {
                const token = getAuthToken();
                if (!token) return;

                try {
                    const res = await fetch(`${API_URL}/agent-blueprints/${id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    if (!res.ok) throw new Error("Failed to load blueprint");

                    const blueprint = await res.json();
                    get().setBlueprint(blueprint);
                    get().addConsoleLog("info", `Loaded blueprint: ${blueprint.name}`);
                } catch (error) {
                    get().addConsoleLog("error", `Load failed: ${error}`);
                }
            },

            // -----------------------------------------------------------------
            // React Flow Actions
            // -----------------------------------------------------------------

            onNodesChange: (changes) => {
                set({
                    nodes: applyNodeChanges(changes, get().nodes),
                    isDirty: true
                });
            },

            onEdgesChange: (changes) => {
                set({
                    edges: applyEdgeChanges(changes, get().edges),
                    isDirty: true
                });
            },

            addNode: (type, position) => {
                const id = `${type.toLowerCase()}_${generateId()}`;
                const newNode: Node = {
                    id,
                    type: type.toLowerCase(),
                    position,
                    data: {
                        label: type.replace("_", " "),
                        primitiveType: type,
                        params: {}
                    }
                };

                set({
                    nodes: [...get().nodes, newNode],
                    selectedNodeId: id,
                    isDirty: true
                });
            },

            updateNodeParams: (nodeId, params) => {
                set({
                    nodes: get().nodes.map((node) =>
                        node.id === nodeId
                            ? { ...node, data: { ...node.data, params } }
                            : node
                    ),
                    isDirty: true
                });
            },

            deleteNode: (nodeId) => {
                set({
                    nodes: get().nodes.filter((n) => n.id !== nodeId),
                    edges: get().edges.filter(
                        (e) => e.source !== nodeId && e.target !== nodeId
                    ),
                    selectedNodeId:
                        get().selectedNodeId === nodeId ? null : get().selectedNodeId,
                    isDirty: true
                });
            },

            connectNodes: (sourceId, targetId, condition) => {
                const edgeId = `edge_${generateId()}`;
                set({
                    edges: [
                        ...get().edges,
                        {
                            id: edgeId,
                            source: sourceId,
                            target: targetId,
                            data: { condition }
                        }
                    ],
                    isDirty: true
                });
            },

            // -----------------------------------------------------------------
            // Selection Actions
            // -----------------------------------------------------------------

            setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),

            // -----------------------------------------------------------------
            // Architect Actions
            // -----------------------------------------------------------------

            sendArchitectMessage: async (content) => {
                const token = getAuthToken();
                if (!token) return;

                const userMessage: ChatMessage = {
                    id: generateId(),
                    role: "user",
                    content,
                    timestamp: new Date()
                };

                set({
                    architectMessages: [...get().architectMessages, userMessage],
                    isGenerating: true
                });

                try {
                    // Build canvas context from current nodes/edges
                    const canvasContext = {
                        nodes: get().nodes.map(n => ({
                            id: n.id,
                            type: n.data.primitiveType,
                            label: n.data.label,
                            params: n.data.params
                        })),
                        edges: get().edges.map(e => ({
                            source: e.source,
                            target: e.target
                        }))
                    };

                    // ==== DEBUG: Log canvas context being sent ====
                    console.group("[ARCHITECT DEBUG] Sending to Backend");
                    console.log("User prompt:", content);
                    console.log("Canvas context:", canvasContext);
                    console.log("Nodes:", canvasContext.nodes.map(n => `${n.id} (${n.type})`));
                    console.log("Edges:", canvasContext.edges.map(e => `${e.source} → ${e.target}`));
                    console.groupEnd();

                    const res = await fetch(`${API_URL}/agent-blueprints/generate`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            prompt: content,
                            model: get().selectedModel,
                            selected_tool_ids: get().selectedToolIds,
                            selected_apis: [],
                            canvas_context: canvasContext
                        })
                    });

                    if (!res.ok) throw new Error("Generation failed");

                    const data = await res.json();

                    // ==== DEBUG: Log response received ====
                    console.group("[ARCHITECT DEBUG] Response Received");
                    console.log("Blueprint name:", data.blueprint.name);
                    console.log("Nodes:", data.blueprint.graph.nodes.map((n: { id: string; type: string }) =>
                        `${n.id} (${n.type})`));
                    console.log("Edges:", data.blueprint.graph.edges.map((e: { source: string; target: string }) =>
                        `${e.source} → ${e.target}`));
                    console.groupEnd();

                    const assistantMessage: ChatMessage = {
                        id: generateId(),
                        role: "assistant",
                        content: `Generated a blueprint with ${data.blueprint.graph.nodes.length} nodes. Click "Apply to Graph" to use it.`,
                        timestamp: new Date()
                    };

                    set({
                        architectMessages: [...get().architectMessages, assistantMessage],
                        discoveredTools: data.discovered_tools,
                        isGenerating: false
                    });

                    // Auto-apply the generated blueprint
                    get().applyGeneratedBlueprint(data.blueprint);
                } catch (error) {
                    console.error("[ARCHITECT DEBUG] Error:", error);
                    const errorMessage: ChatMessage = {
                        id: generateId(),
                        role: "assistant",
                        content: `Error: ${error}. Please try again.`,
                        timestamp: new Date()
                    };

                    set({
                        architectMessages: [...get().architectMessages, errorMessage],
                        isGenerating: false
                    });
                }
            },

            applyGeneratedBlueprint: (blueprint) => {
                const { nodes, edges } = graphToFlow(blueprint.graph);

                // ==== DEBUG: Log nodes/edges being applied ====
                console.group("[ARCHITECT DEBUG] Applying to Canvas");
                console.log("Nodes to apply:", nodes.map(n => `${n.id} at (${n.position.x}, ${n.position.y})`));
                console.log("Edges to apply:", edges.map(e => `${e.source} → ${e.target}`));
                console.groupEnd();

                set({
                    nodes,
                    edges,
                    blueprintName: blueprint.name,
                    blueprintDescription: blueprint.description || "",
                    inputsSchema: blueprint.inputs_schema,
                    secretsRequirements: blueprint.secrets_requirements,
                    isDirty: true
                });
                get().addConsoleLog("success", "Applied generated blueprint to canvas");
            },

            clearArchitectChat: () =>
                set({ architectMessages: [], discoveredTools: [] }),

            // -----------------------------------------------------------------
            // Tool Selection Actions
            // -----------------------------------------------------------------

            fetchAvailableTools: async () => {
                const token = getAuthToken();
                if (!token) return;

                set({ isLoadingTools: true });

                try {
                    const res = await fetch(`${API_URL}/tools`, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });

                    if (!res.ok) throw new Error("Failed to fetch tools");

                    const tools = await res.json();
                    set({
                        availableTools: tools.map((t: { id: number; name: string; description: string | null }) => ({
                            id: t.id,
                            name: t.name,
                            description: t.description
                        })),
                        isLoadingTools: false
                    });
                } catch (error) {
                    console.error("Error fetching tools:", error);
                    set({ isLoadingTools: false });
                }
            },

            toggleToolSelection: (toolId) => {
                const current = get().selectedToolIds;
                if (current.includes(toolId)) {
                    set({ selectedToolIds: current.filter(id => id !== toolId) });
                } else {
                    set({ selectedToolIds: [...current, toolId] });
                }
            },

            clearToolSelection: () => set({ selectedToolIds: [] }),

            // -----------------------------------------------------------------
            // Execution Actions
            // -----------------------------------------------------------------

            executeBlueprint: async () => {
                const { blueprintId, testInputs } = get();
                const token = getAuthToken();
                if (!token || !blueprintId) return;

                set({ isExecuting: true, executionSteps: [] });
                get().addConsoleLog("info", "Starting execution...");

                try {
                    const res = await fetch(
                        `${API_URL}/agent-blueprints/${blueprintId}/execute`,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`
                            },
                            body: JSON.stringify({ inputs: testInputs })
                        }
                    );

                    if (!res.ok) throw new Error("Execution failed");

                    const result = await res.json();
                    set({
                        executionSteps: result.steps,
                        isExecuting: false
                    });

                    get().addConsoleLog(
                        result.status === "completed" ? "success" : "error",
                        `Execution ${result.status}`,
                        result.outputs
                    );
                } catch (error) {
                    get().addConsoleLog("error", `Execution error: ${error}`);
                    set({ isExecuting: false });
                }
            },

            executeWithStream: async () => {
                const { blueprintId, testInputs } = get();
                const token = getAuthToken();
                if (!token || !blueprintId) return;

                set({ isExecuting: true, executionSteps: [], consoleOpen: true });
                get().addConsoleLog("info", "Starting streaming execution...");

                // Track if we're waiting for GUI input (don't reset isExecuting in that case)
                let waitingForInput = false;

                try {
                    const res = await fetch(
                        `${API_URL}/agent-blueprints/${blueprintId}/execute/stream`,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`
                            },
                            body: JSON.stringify({ inputs: testInputs })
                        }
                    );

                    if (!res.ok) throw new Error("Stream execution failed");

                    const reader = res.body?.getReader();
                    const decoder = new TextDecoder();

                    if (!reader) throw new Error("No response body");

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
                                const event: StreamEvent = JSON.parse(line);

                                if (event.type === "step") {
                                    set({ activeNodeId: event.node_id || null });
                                    // Show both type and label for better identification
                                    const stepLabel = event.node_label
                                        ? `${event.node_type}: ${event.node_label}`
                                        : event.node_type;
                                    get().addConsoleLog(
                                        "step",
                                        `Step: ${stepLabel}`,
                                        event.output_data
                                    );
                                } else if (event.type === "complete") {
                                    // Check if execution is waiting for user input
                                    if (event.status === "waiting_for_input") {
                                        // Mark that we're waiting for input
                                        waitingForInput = true;
                                        get().addConsoleLog(
                                            "step",
                                            `Waiting for input: ${event.tool_name || "GUI Tool"}`,
                                            {
                                                type: "gui_input_required",
                                                gui_schema: event.gui_schema,
                                                tool_name: event.tool_name,
                                                description: event.description
                                            }
                                        );
                                    } else {
                                        get().addConsoleLog(
                                            event.status === "completed" ? "success" : "error",
                                            `Execution ${event.status}`,
                                            event.outputs
                                        );
                                    }
                                } else if (event.type === "error") {
                                    get().addConsoleLog("error", event.message || "Unknown error");
                                }
                            } catch {
                                // Skip invalid JSON lines
                            }
                        }
                    }
                } catch (error) {
                    get().addConsoleLog("error", `Stream error: ${error}`);
                } finally {
                    // Only reset isExecuting if we're NOT waiting for GUI input
                    if (!waitingForInput) {
                        set({ isExecuting: false, activeNodeId: null });
                    }
                }
            },

            setTestInputs: (inputs) => set({ testInputs: inputs }),

            clearExecution: () =>
                set({ executionSteps: [], activeNodeId: null }),

            // -----------------------------------------------------------------
            // UI Actions
            // -----------------------------------------------------------------

            setSelectedModel: (model) => set({ selectedModel: model }),

            toggleConsole: () => set({ consoleOpen: !get().consoleOpen }),

            addConsoleLog: (type, message, data) => {
                const log: ConsoleLog = {
                    id: generateId(),
                    type,
                    message,
                    data,
                    timestamp: new Date()
                };
                set({ consoleLogs: [...get().consoleLogs, log] });
            },

            clearConsoleLogs: () => set({ consoleLogs: [] })
        }),
        { name: "agent-builder-store" }
    )
);
