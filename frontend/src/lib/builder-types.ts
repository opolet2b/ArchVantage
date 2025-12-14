/**
 * Agent Builder TypeScript Types
 *
 * Types matching backend schemas for Agent Blueprints.
 * These types support the JSON Blueprint DSL for the visual graph editor.
 */

/**
 * Standard primitive types available in the Agent Builder.
 */
export type PrimitiveType =
    | "START"
    | "END"
    | "HTTP_REQUEST"
    | "CALL_TOOL"
    | "CONDITION"
    | "JSON_MAPPING"
    | "TEXT_TEMPLATE"
    | "FOREACH"
    | "LLM_DECISION";

/**
 * UI position for a node in the graph editor.
 */
export interface NodePosition {
    x: number;
    y: number;
}

/**
 * Display metadata for a graph node.
 */
export interface NodeMetadata {
    label: string;
    ui_position: NodePosition;
}

/**
 * A single node in the agent graph.
 */
export interface GraphNode {
    id: string;
    type: PrimitiveType;
    metadata: NodeMetadata;
    params: Record<string, unknown>;
}

/**
 * An edge connecting two nodes in the agent graph.
 */
export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    condition?: string;
}

/**
 * Complete graph structure with nodes and edges.
 */
export interface AgentGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

/**
 * Full blueprint response from the backend.
 */
export interface Blueprint {
    id: string;
    name: string;
    description?: string;
    version: string;
    graph: AgentGraph;
    inputs_schema: Record<string, unknown>;
    secrets_requirements: string[];
    owner_id: number;
    is_published: boolean;
    created_at: string;
    updated_at?: string;
}

/**
 * Blueprint creation request.
 */
export interface BlueprintCreate {
    name: string;
    description?: string;
    graph: AgentGraph;
    inputs_schema: Record<string, unknown>;
    secrets_requirements: string[];
}

/**
 * Blueprint update request.
 */
export interface BlueprintUpdate {
    name?: string;
    description?: string;
    graph?: AgentGraph;
    inputs_schema?: Record<string, unknown>;
    secrets_requirements?: string[];
    is_published?: boolean;
}

/**
 * Lightweight blueprint item for list views.
 */
export interface BlueprintListItem {
    id: string;
    name: string;
    description?: string;
    version: string;
    is_published: boolean;
    created_at: string;
}

/**
 * Request to generate a blueprint from natural language.
 */
export interface BlueprintGenerateRequest {
    prompt: string;
    model?: string;
}

/**
 * Response from blueprint generation.
 */
export interface BlueprintGenerateResponse {
    blueprint: Blueprint;
    discovered_tools: string[];
}

/**
 * Request to execute a blueprint.
 */
export interface BlueprintExecuteRequest {
    inputs: Record<string, unknown>;
}

/**
 * Status of a blueprint execution.
 */
export type ExecutionStatus = "pending" | "running" | "completed" | "failed" | "waiting_for_input";

/**
 * A single step in the execution trace.
 */
export interface ExecutionStep {
    node_id: string;
    node_type: PrimitiveType;
    status: ExecutionStatus;
    input_data: Record<string, unknown>;
    output_data?: Record<string, unknown>;
    error?: string;
    duration_ms?: number;
}

/**
 * Response from blueprint execution.
 */
export interface BlueprintExecuteResponse {
    execution_id: number;
    status: ExecutionStatus;
    outputs: Record<string, unknown>;
    steps: ExecutionStep[];
    error_message?: string;
    started_at: string;
    completed_at?: string;
}

/**
 * Streaming execution event types.
 */
export type StreamEventType = "start" | "step" | "complete" | "error";

/**
 * Streaming execution event.
 */
export interface StreamEvent {
    type: StreamEventType;
    blueprint_id?: string;
    inputs?: Record<string, unknown>;
    node_id?: string;
    node_type?: PrimitiveType;
    node_label?: string;  // Human-readable name for display
    status?: ExecutionStatus;
    input_data?: Record<string, unknown>;
    output_data?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: string;
    message?: string;
    duration_ms?: number;
    // GUI tool pause properties
    gui_schema?: Record<string, unknown>;
    tool_name?: string;
    description?: string;
}

/**
 * Secret response (value is never exposed).
 */
export interface SecretResponse {
    id: number;
    key_name: string;
    created_at: string;
}

// =============================================================================
// Primitive Parameter Types
// =============================================================================

/**
 * Parameters for HTTP_REQUEST primitive.
 */
export interface HTTPRequestParams {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    url: string;
    headers: Record<string, string>;
    body?: Record<string, unknown>;
}

/**
 * Parameters for CALL_TOOL primitive.
 */
export interface CallToolParams {
    tool_id: number;
    arguments: Record<string, unknown>;
}

/**
 * Parameters for CONDITION primitive.
 */
export interface ConditionParams {
    expression: string;
    true_target: string;
    false_target: string;
}

/**
 * Parameters for JSON_MAPPING primitive.
 */
export interface JSONMappingParams {
    source: string;
    template: string;
}

/**
 * Parameters for TEXT_TEMPLATE primitive.
 */
export interface TextTemplateParams {
    template_string: string;
    variables: Record<string, string>;
}

/**
 * Parameters for FOREACH primitive.
 */
export interface ForEachParams {
    items: string;
    iterator_var: string;
    subprocess_graph: AgentGraph;
}

/**
 * Parameters for LLM_DECISION primitive.
 */
export interface LLMDecisionParams {
    model: string;
    instruction: string;
    input_context: string;
    output_variable: string;
}

// =============================================================================
// Node Configuration for React Flow
// =============================================================================

/**
 * Primitive configuration for the palette.
 */
export interface PrimitiveConfig {
    type: PrimitiveType;
    label: string;
    description: string;
    icon: string;
    category: "logic" | "data" | "ai" | "integration";
    defaultParams: Record<string, unknown>;
}

/**
 * All available primitives with their configurations.
 */
export const PRIMITIVE_CONFIGS: PrimitiveConfig[] = [
    {
        type: "START",
        label: "Start",
        description: "Entry point of the workflow",
        icon: "Play",
        category: "logic",
        defaultParams: {}
    },
    {
        type: "END",
        label: "End",
        description: "Exit point of the workflow",
        icon: "Square",
        category: "logic",
        defaultParams: {}
    },
    {
        type: "HTTP_REQUEST",
        label: "HTTP Request",
        description: "Make REST API calls",
        icon: "Globe",
        category: "integration",
        defaultParams: { method: "GET", url: "", headers: {}, body: null }
    },
    {
        type: "CONDITION",
        label: "Condition",
        description: "Branching logic (If/Else)",
        icon: "GitBranch",
        category: "logic",
        defaultParams: { expression: "", true_target: "", false_target: "" }
    },
    {
        type: "CALL_TOOL",
        label: "Call Tool",
        description: "Invoke a registered tool",
        icon: "Wrench",
        category: "integration",
        defaultParams: { tool_id: 0, arguments: {} }
    },
    {
        type: "JSON_MAPPING",
        label: "JSON Mapping",
        description: "Extract and transform JSON data",
        icon: "FileJson",
        category: "data",
        defaultParams: { source: "", template: "" }
    },
    {
        type: "TEXT_TEMPLATE",
        label: "Text Template",
        description: "Format text using templates",
        icon: "FileText",
        category: "data",
        defaultParams: { template_string: "", variables: {} }
    },
    {
        type: "FOREACH",
        label: "For Each",
        description: "Iterate over lists",
        icon: "Repeat",
        category: "logic",
        defaultParams: {
            items: "",
            iterator_var: "item",
            subprocess_graph: { nodes: [], edges: [] }
        }
    },
    {
        type: "LLM_DECISION",
        label: "LLM Decision",
        description: "Use AI for reasoning and routing",
        icon: "Brain",
        category: "ai",
        defaultParams: {
            model: "default",
            instruction: "",
            input_context: "",
            output_variable: "llm_output"
        }
    }
];
