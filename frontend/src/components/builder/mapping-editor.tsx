"use client";

/**
 * Mapping Editor Component
 *
 * Shows dropdown-based field mapping for JSON_MAPPING nodes.
 * Fetches available fields from incoming/outgoing nodes via API.
 * Falls back to local schema discovery when blueprint is not saved.
 */
import { useState, useEffect } from "react";
import { Plus, Trash2, RefreshCw, AlertCircle, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/lib/utils";
import { useBuilderStore } from "@/lib/builder-store";
import { PrimitiveType } from "@/lib/builder-types";

/**
 * Field definition from schema discovery.
 */
interface SchemaField {
    name: string;
    type: string;
    label?: string;
}

/**
 * Schema from a connected node.
 */
interface NodeSchema {
    node_id: string;
    node_type: string;
    label?: string;
    fields: SchemaField[];
    source?: string;
    error?: string;
    note?: string;
}

/**
 * A single field mapping.
 */
interface FieldMapping {
    source: string;
    target: string;
}

interface MappingEditorProps {
    blueprintId: string;
    nodeId: string;
    mappings: FieldMapping[];
    onMappingsChange: (mappings: FieldMapping[]) => void;
}

/**
 * Get output schema for a node type (client-side version).
 */
function getNodeOutputSchema(primitiveType: PrimitiveType, params: Record<string, unknown>): SchemaField[] {
    switch (primitiveType) {
        case "START":
            return [
                { name: "_started", type: "boolean", label: "Started flag" },
                { name: "_user_id", type: "integer", label: "User ID" },
            ];
        case "HTTP_REQUEST":
            return [
                { name: "status_code", type: "integer", label: "HTTP Status Code" },
                { name: "data", type: "object", label: "Response Body" },
                { name: "headers", type: "object", label: "Response Headers" },
            ];
        case "CALL_TOOL":
            return [
                { name: "result", type: "object", label: "Tool Result" },
            ];
        case "JSON_MAPPING":
            const outputVar = (params.output_variable as string) || "mapped_data";
            return [
                { name: outputVar, type: "any", label: "Mapped Data" },
                { name: "result", type: "any", label: "Mapping Result" },
            ];
        case "TEXT_TEMPLATE":
            return [
                { name: "formatted_text", type: "string", label: "Formatted Text" },
                { name: "text", type: "string", label: "Output Text" },
            ];
        case "LLM_DECISION":
            const llmOutputVar = (params.output_variable as string) || "llm_output";
            return [
                { name: llmOutputVar, type: "string", label: "LLM Output" },
                { name: "decision", type: "string", label: "Decision" },
                { name: "reasoning", type: "string", label: "Reasoning" },
            ];
        case "CONDITION":
            return [
                { name: "branch", type: "string", label: "Branch taken (true/false)" },
            ];
        case "FOREACH":
            return [
                { name: "results", type: "array", label: "Collected Results" },
                { name: "item", type: "any", label: "Current Item" },
            ];
        default:
            return [];
    }
}

/**
 * Get input schema for a node type (client-side version).
 */
function getNodeInputSchema(primitiveType: PrimitiveType, _params: Record<string, unknown>): SchemaField[] {
    switch (primitiveType) {
        case "CALL_TOOL":
            // For CALL_TOOL, the actual inputs depend on the selected tool
            // Without API access, we show generic fields
            return [
                { name: "input", type: "any", label: "Tool Input" },
            ];
        case "HTTP_REQUEST":
            return [
                { name: "url", type: "string", label: "Request URL" },
                { name: "body", type: "object", label: "Request Body" },
                { name: "headers", type: "object", label: "Request Headers" },
            ];
        case "JSON_MAPPING":
            return [
                { name: "data", type: "any", label: "Input Data" },
            ];
        case "TEXT_TEMPLATE":
            return [
                { name: "context", type: "object", label: "Template Context" },
            ];
        case "LLM_DECISION":
            return [
                { name: "input", type: "string", label: "Input Text" },
                { name: "context", type: "object", label: "Context Variables" },
            ];
        case "CONDITION":
            return [
                { name: "value", type: "any", label: "Value to evaluate" },
            ];
        case "FOREACH":
            return [
                { name: "items", type: "array", label: "Items to iterate" },
            ];
        case "END":
            return [
                { name: "result", type: "any", label: "Final Result" },
            ];
        default:
            return [];
    }
}

export function MappingEditor({
    blueprintId,
    nodeId,
    mappings,
    onMappingsChange,
}: MappingEditorProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [incoming, setIncoming] = useState<NodeSchema[]>([]);
    const [outgoing, setOutgoing] = useState<NodeSchema[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const [newSource, setNewSource] = useState("");
    const [newTarget, setNewTarget] = useState("");

    // Get nodes and edges from the store for local schema discovery
    const nodes = useBuilderStore((state) => state.nodes);
    const edges = useBuilderStore((state) => state.edges);

    /**
     * Fetch tool configuration and extract schema fields.
     */
    const fetchToolSchema = async (toolId: number, forOutput: boolean): Promise<SchemaField[]> => {
        try {
            const response = await fetch(`${API_URL}/tools/${toolId}`, {
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`,
                },
            });
            if (!response.ok) return [];

            const tool = await response.json();
            const config = tool.configuration || {};
            const fields: SchemaField[] = [];

            // Check for GUI tool schema
            if (tool.tool_type === "gui" || config.gui_schema) {
                const guiSchema = config.gui_schema || {};
                // GUI tools store form components as either "fields" or "components"
                const guiFields = guiSchema.fields || guiSchema.components || [];
                for (const field of guiFields) {
                    const fieldName = field.id || field.name || "";
                    if (fieldName) {
                        fields.push({
                            name: fieldName,
                            type: field.type || "string",
                            label: field.title || field.label || fieldName,
                        });
                    }
                }
                if (fields.length > 0) return fields;
            }

            // Check for consolidated input_schema
            const inputSchema = config.input_schema || {};
            if (inputSchema.properties) {
                for (const [name, prop] of Object.entries(inputSchema.properties)) {
                    const propData = prop as { type?: string; description?: string };
                    fields.push({
                        name,
                        type: propData.type || "string",
                        label: propData.description || name,
                    });
                }
                if (fields.length > 0) return fields;
            }

            // Check for MCP functions
            const selectedFunctions = config.selected_functions || [];
            if (selectedFunctions.length > 0) {
                for (const func of selectedFunctions) {
                    const inputParams = func.inputSchema?.properties || {};
                    for (const [name, prop] of Object.entries(inputParams)) {
                        const propData = prop as { type?: string; description?: string };
                        fields.push({
                            name,
                            type: propData.type || "string",
                            label: propData.description || name,
                        });
                    }
                }
                if (fields.length > 0) return fields;
            }

            // For output schema, just return a generic result field
            if (forOutput) {
                return [{ name: "result", type: "object", label: `Result from ${tool.name || "tool"}` }];
            }

            return [];
        } catch (error) {
            console.error("Failed to fetch tool schema:", error);
            return [];
        }
    };

    /**
     * Build local schemas by examining connected nodes.
     * Async to support fetching tool configurations.
     */
    const buildLocalSchemas = async (): Promise<{ incoming: NodeSchema[]; outgoing: NodeSchema[] }> => {
        if (!nodeId) return { incoming: [], outgoing: [] };

        const localIncoming: NodeSchema[] = [];
        const localOutgoing: NodeSchema[] = [];

        // Find edges targeting this node (incoming) - these provide SOURCE fields
        const incomingEdges = edges.filter((e) => e.target === nodeId);
        for (const edge of incomingEdges) {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            if (sourceNode) {
                const nodeData = sourceNode.data as { primitiveType?: PrimitiveType; label?: string; params?: Record<string, unknown> };
                const primitiveType = nodeData.primitiveType || "START";
                const params = nodeData.params || {};

                let fields: SchemaField[];
                if (primitiveType === "CALL_TOOL" && params.tool_id) {
                    // Fetch actual tool schema for CALL_TOOL nodes
                    fields = await fetchToolSchema(params.tool_id as number, true);
                    if (fields.length === 0) {
                        fields = getNodeOutputSchema(primitiveType, params);
                    }
                } else {
                    fields = getNodeOutputSchema(primitiveType, params);
                }

                localIncoming.push({
                    node_id: sourceNode.id,
                    node_type: primitiveType,
                    label: (nodeData.label as string) || primitiveType,
                    fields,
                    source: "local",
                });
            }
        }

        // Find edges from this node (outgoing) - these need TARGET fields
        const outgoingEdges = edges.filter((e) => e.source === nodeId);
        for (const edge of outgoingEdges) {
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (targetNode) {
                const nodeData = targetNode.data as { primitiveType?: PrimitiveType; label?: string; params?: Record<string, unknown> };
                const primitiveType = nodeData.primitiveType || "END";
                const params = nodeData.params || {};

                let fields: SchemaField[];
                if (primitiveType === "CALL_TOOL" && params.tool_id) {
                    // Fetch actual tool schema for CALL_TOOL nodes
                    fields = await fetchToolSchema(params.tool_id as number, false);
                    if (fields.length === 0) {
                        fields = getNodeInputSchema(primitiveType, params);
                    }
                } else {
                    fields = getNodeInputSchema(primitiveType, params);
                }

                localOutgoing.push({
                    node_id: targetNode.id,
                    node_type: primitiveType,
                    label: (nodeData.label as string) || primitiveType,
                    fields,
                    source: "local",
                });
            }
        }

        return { incoming: localIncoming, outgoing: localOutgoing };
    };

    // Fetch schemas from API or build locally when component mounts or node changes
    const fetchSchemas = async () => {
        setIsLoading(true);
        setErrors([]);

        try {
            // If blueprint is saved, try API first
            if (blueprintId && nodeId) {
                try {
                    const response = await fetch(
                        `${API_URL}/agent-blueprints/${blueprintId}/nodes/${nodeId}/schemas`,
                        {
                            headers: {
                                "Authorization": `Bearer ${localStorage.getItem("token")}`,
                            },
                        }
                    );

                    if (response.ok) {
                        const data = await response.json();
                        setIncoming(data.incoming || []);
                        setOutgoing(data.outgoing || []);
                        if (data.discovery_errors?.length > 0) {
                            setErrors(data.discovery_errors);
                        }
                        setIsLoading(false);
                        return;
                    }
                } catch {
                    // API failed, fall through to local discovery
                }
            }

            // Build local schemas (for unsaved blueprints or API fallback)
            const localSchemas = await buildLocalSchemas();
            setIncoming(localSchemas.incoming);
            setOutgoing(localSchemas.outgoing);

            if (localSchemas.incoming.length === 0 && localSchemas.outgoing.length === 0) {
                setErrors(["Connect nodes to enable field discovery"]);
            }
        } catch (error) {
            setErrors([`Error: ${error}`]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSchemas();
    }, [blueprintId, nodeId, nodes, edges]);



    // Get all source fields from incoming nodes
    const sourceFields: { value: string; label: string; nodeLabel: string }[] = [];
    incoming.forEach((schema) => {
        schema.fields.forEach((field) => {
            sourceFields.push({
                value: field.name,
                label: field.label || field.name,
                nodeLabel: schema.label || schema.node_id,
            });
        });
    });

    // Get all target fields from outgoing nodes
    const targetFields: { value: string; label: string; nodeLabel: string }[] = [];
    outgoing.forEach((schema) => {
        schema.fields.forEach((field) => {
            targetFields.push({
                value: field.name,
                label: field.label || field.name,
                nodeLabel: schema.label || schema.node_id,
            });
        });
    });

    const handleAddMapping = () => {
        if (newSource || newTarget) {
            const updated = [
                ...mappings,
                { source: newSource, target: newTarget || newSource },
            ];
            onMappingsChange(updated);
            setNewSource("");
            setNewTarget("");
        }
    };

    const handleRemoveMapping = (index: number) => {
        const updated = mappings.filter((_, i) => i !== index);
        onMappingsChange(updated);
    };

    const handleUpdateMapping = (
        index: number,
        field: "source" | "target",
        value: string
    ) => {
        const updated = [...mappings];
        updated[index] = { ...updated[index], [field]: value };
        onMappingsChange(updated);
    };

    return (
        <div className="space-y-4">
            {/* Header with refresh */}
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Field Mappings</Label>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={fetchSchemas}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <RefreshCw className="h-3 w-3" />
                    )}
                </Button>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs mb-1">
                        <AlertCircle className="h-3 w-3" />
                        <span className="font-medium">Schema Discovery Issues</span>
                    </div>
                    <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
                        {errors.map((err, i) => (
                            <li key={i}>• {err}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Existing mappings */}
            {mappings.length > 0 && (
                <div className="space-y-2">
                    {mappings.map((mapping, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded border"
                        >
                            {/* Source dropdown or input */}
                            <div className="flex-1">
                                {sourceFields.length > 0 ? (
                                    <select
                                        className="w-full h-8 px-2 text-xs rounded border bg-background"
                                        value={mapping.source}
                                        onChange={(e) =>
                                            handleUpdateMapping(index, "source", e.target.value)
                                        }
                                    >
                                        <option value="">-- Source --</option>
                                        {sourceFields.map((f, i) => (
                                            <option key={i} value={f.value}>
                                                {f.value}: {f.label}
                                            </option>
                                        ))}
                                        <option value={mapping.source}>
                                            Custom: {mapping.source}
                                        </option>
                                    </select>
                                ) : (
                                    <Input
                                        className="h-8 text-xs"
                                        placeholder="Source field"
                                        value={mapping.source}
                                        onChange={(e) =>
                                            handleUpdateMapping(index, "source", e.target.value)
                                        }
                                    />
                                )}
                            </div>

                            <span className="text-muted-foreground text-xs">→</span>

                            {/* Target dropdown or input */}
                            <div className="flex-1">
                                {targetFields.length > 0 ? (
                                    <select
                                        className="w-full h-8 px-2 text-xs rounded border bg-background"
                                        value={mapping.target}
                                        onChange={(e) =>
                                            handleUpdateMapping(index, "target", e.target.value)
                                        }
                                    >
                                        <option value="">-- Target --</option>
                                        {targetFields.map((f, i) => (
                                            <option key={i} value={f.value}>
                                                {f.value}: {f.label}
                                            </option>
                                        ))}
                                        <option value={mapping.target}>
                                            Custom: {mapping.target}
                                        </option>
                                    </select>
                                ) : (
                                    <Input
                                        className="h-8 text-xs"
                                        placeholder="Target field"
                                        value={mapping.target}
                                        onChange={(e) =>
                                            handleUpdateMapping(index, "target", e.target.value)
                                        }
                                    />
                                )}
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                onClick={() => handleRemoveMapping(index)}
                            >
                                <Trash2 className="h-3 w-3 text-red-500" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add new mapping */}
            <div className="flex items-center gap-2">
                {sourceFields.length > 0 ? (
                    <select
                        className="flex-1 h-8 px-2 text-xs rounded border bg-background"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                    >
                        <option value="">-- Source --</option>
                        {sourceFields.map((f, i) => (
                            <option key={i} value={f.value}>
                                {f.value}: {f.label}
                            </option>
                        ))}
                    </select>
                ) : (
                    <Input
                        className="flex-1 h-8 text-xs"
                        placeholder="Source field"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                    />
                )}

                <span className="text-muted-foreground text-xs">→</span>

                {targetFields.length > 0 ? (
                    <select
                        className="flex-1 h-8 px-2 text-xs rounded border bg-background"
                        value={newTarget}
                        onChange={(e) => setNewTarget(e.target.value)}
                    >
                        <option value="">-- Target --</option>
                        {targetFields.map((f, i) => (
                            <option key={i} value={f.value}>
                                {f.value}: {f.label}
                            </option>
                        ))}
                    </select>
                ) : (
                    <Input
                        className="flex-1 h-8 text-xs"
                        placeholder="Target field"
                        value={newTarget}
                        onChange={(e) => setNewTarget(e.target.value)}
                    />
                )}

                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={handleAddMapping}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            {/* Help text */}
            <p className="text-xs text-muted-foreground">
                Map fields from incoming nodes to output variables.
                {sourceFields.length === 0 && targetFields.length === 0 && (
                    <span className="block mt-1 text-amber-600">
                        No connected nodes found. Connect nodes to enable auto-discovery.
                    </span>
                )}
            </p>
        </div>
    );
}
