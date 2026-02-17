import { useState, useEffect } from "react";
import { Node } from "@xyflow/react";
import { API_URL } from "@/lib/utils";
import { useBuilderStore } from "@/lib/builder-store";
import { PrimitiveType } from "@/lib/builder-types";
import { getNodeOutputSchema, SchemaField } from "@/lib/builder-utils";

export interface NodeSchema {
    node_id: string;
    node_type: string;
    label: string;
    fields: SchemaField[];
    source: "local" | "server";
}

const getNodeInputSchema = (type: string, params: any): SchemaField[] => {
    switch (type) {
        case "END":
            return [{ name: "final_output", type: "object", label: "Final Output" }];
        case "HTTP_REQUEST":
            return [
                { name: "url", type: "string", label: "URL" },
                { name: "body", type: "object", label: "Body" }
            ];
        // ... add others as needed
        default:
            return [];
    }
};

export function useSchemaDiscovery(nodeId: string | undefined) {
    const [isLoading, setIsLoading] = useState(false);
    const [incoming, setIncoming] = useState<NodeSchema[]>([]);
    const [outgoing, setOutgoing] = useState<NodeSchema[]>([]);
    const [errors, setErrors] = useState<string[]>([]);

    const nodes = useBuilderStore((state) => state.nodes);
    const edges = useBuilderStore((state) => state.edges);
    const blueprintId = useBuilderStore((state) => state.blueprintId);

    const fetchToolSchema = async (toolId: number, forOutput: boolean): Promise<SchemaField[]> => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return [];

            const response = await fetch(`${API_URL}/tools/${toolId}`, {
                headers: { "Authorization": `Bearer ${token}` },
            });
            if (!response.ok) return [];

            const tool = await response.json();
            const config = tool.configuration || {};
            const fields: SchemaField[] = [];

            if (tool.tool_type === "gui" || config.gui_schema) {
                const guiSchema = config.gui_schema || {};
                const guiFields = guiSchema.fields || guiSchema.components || [];
                for (const field of guiFields) {
                    const fieldName = field.id || field.name || "";
                    if (fieldName) fields.push({ name: fieldName, type: field.type || "string", label: field.title || field.label || fieldName });
                }
                if (fields.length > 0) return fields;
            }

            const inputSchema = config.input_schema || {};
            if (inputSchema.properties) {
                for (const [name, prop] of Object.entries(inputSchema.properties)) {
                    const propData = prop as { type?: string; description?: string };
                    fields.push({ name, type: propData.type || "string", label: propData.description || name });
                }
                if (fields.length > 0) return fields;
            }

            // Check for MCP functions (simplified)
            const selectedFunctions = config.selected_functions || [];
            if (selectedFunctions.length > 0) {
                for (const func of selectedFunctions) {
                    const inputParams = func.inputSchema?.properties || {};
                    for (const [name, prop] of Object.entries(inputParams)) {
                        const propData = prop as { type?: string; description?: string };
                        fields.push({ name, type: propData.type || "string", label: propData.description || name });
                    }
                }
                if (fields.length > 0) return fields;
            }

            if (forOutput) return [{ name: "result", type: "object", label: `Result from ${tool.name || "tool"}` }];
            return [];
        } catch (error) {
            console.error("Failed to fetch tool schema:", error);
            return [];
        }
    };

    const buildLocalSchemas = async (): Promise<{ incoming: NodeSchema[]; outgoing: NodeSchema[] }> => {
        if (!nodeId) return { incoming: [], outgoing: [] };
        const localIncoming: NodeSchema[] = [];
        const localOutgoing: NodeSchema[] = [];

        // Incoming: All OTHER nodes' Output Schema (Global)
        const upstreamNodes = nodes.filter(n => n.id !== nodeId);

        for (const sourceNode of upstreamNodes) {
            const nodeData = sourceNode.data as { primitiveType?: PrimitiveType; label?: string; params?: Record<string, unknown> };
            const primitiveType = nodeData.primitiveType || "START";
            const params = nodeData.params || {};
            let fields: SchemaField[];

            if (primitiveType === "CALL_TOOL" && params.tool_id) {
                fields = await fetchToolSchema(params.tool_id as number, true);
                if (fields.length === 0) fields = getNodeOutputSchema(primitiveType, params);
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

        // Outgoing: All OTHER nodes' Input Schema (Global)
        const downstreamNodes = nodes.filter(n => n.id !== nodeId);

        for (const targetNode of downstreamNodes) {
            const nodeData = targetNode.data as { primitiveType?: PrimitiveType; label?: string; params?: Record<string, unknown> };
            const primitiveType = nodeData.primitiveType || "END";
            const params = nodeData.params || {};
            let fields: SchemaField[];

            if (primitiveType === "CALL_TOOL" && params.tool_id) {
                fields = await fetchToolSchema(params.tool_id as number, false);
                if (fields.length === 0) fields = getNodeInputSchema(primitiveType, params);
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

        return { incoming: localIncoming, outgoing: localOutgoing };
    };

    const fetchSchemas = async () => {
        setIsLoading(true);
        setErrors([]);
        try {
            const localSchemas = await buildLocalSchemas();
            setIncoming(localSchemas.incoming);
            setOutgoing(localSchemas.outgoing);
        } catch (error) {
            setErrors([`Error: ${error}`]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSchemas();
    }, [blueprintId, nodeId, nodes, edges]); // Re-run when graph changes

    return { incoming, outgoing, isLoading, errors, refresh: fetchSchemas };
}
