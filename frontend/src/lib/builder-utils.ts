import { PrimitiveType } from "./builder-types";

export interface SchemaField {
    name: string;
    type: string;
    label?: string;
}

/**
 * Get output schema for a node type (client-side version).
 */
export function getNodeOutputSchema(
    primitiveType: PrimitiveType,
    params: Record<string, unknown>,
    inputsSchema?: any
): SchemaField[] {
    switch (primitiveType) {
        case "START":
            const fields: SchemaField[] = [
                { name: "_started", type: "boolean", label: "Started flag" },
                { name: "_user_id", type: "integer", label: "User ID" },
            ];

            // Recursive helper to discover nested properties in JSON Schema
            const discoverFields = (properties: any, prefix: string) => {
                Object.entries(properties).forEach(([name, prop]: [string, any]) => {
                    const currentPath = `${prefix}.${name}`;
                    fields.push({
                        name: currentPath,
                        type: prop.type || "any",
                        label: prop.description || `Input: ${name}`
                    });

                    // If it's an object with properties, recurse
                    if (prop.type === "object" && prop.properties) {
                        discoverFields(prop.properties, currentPath);
                    }
                    // If it's an array of objects, reveal the potential item structure? 
                    // For now, dot-notation access handles it if we know the schema.
                    if (prop.type === "array" && prop.items?.properties) {
                        discoverFields(prop.items.properties, `${currentPath}[*]`);
                    }
                });
            };

            if (inputsSchema && inputsSchema.properties) {
                discoverFields(inputsSchema.properties, "inputs");
            }
            return fields;
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
        case "FOREACH_START":
            const iterVar = (params.iterator_var as string) || "item";
            const idxVar = (params.index_var as string) || "index";
            const resVar = (params.results_var as string) || "results";
            return [
                { name: iterVar, type: "any", label: `Current Item (${iterVar})` },
                { name: idxVar, type: "integer", label: `Current Index (${idxVar})` },
                { name: resVar, type: "array", label: `Results Accumulator (${resVar})` },
            ];
        case "FOREACH_END":
            // FOREACH_END typically loops back, but might output final results if connected downstream
            return [
                { name: "results", type: "array", label: "Final Results" }
            ];
        case "DOCUMENT_CONVERTER":
            const docOutputVar = (params.output_variable as string) || "converted_document";
            return [
                { name: docOutputVar, type: "string", label: "Converted Document" },
                { name: "output_path", type: "string", label: "Output File Path" },
                { name: "detected_input_format", type: "string", label: "Detected Input Format" },
            ];
        default:
            return [];
    }
}
