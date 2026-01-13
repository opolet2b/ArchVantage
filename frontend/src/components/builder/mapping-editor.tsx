"use client";

/**
 * Mapping Editor Component
 *
 * Provides a powerful inline editor for JSON data transformation.
 * Features:
 * - Expression-based mapping (Python-like syntax)
 * - Variable discovery from upstream nodes
 * - Structured field builder (Source + Type + Function)
 * - Direct target field selection
 */
import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, RefreshCw, AlertCircle, Loader2, Wand2, Calculator, Info, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SelectGroup,
    SelectLabel
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { API_URL, cn } from "@/lib/utils";
import { useBuilderStore } from "@/lib/builder-store";
import { PrimitiveType } from "@/lib/builder-types";

interface SchemaField {
    name: string;
    type: string;
    label?: string;
}

interface NodeSchema {
    node_id: string;
    node_type: string;
    label?: string;
    fields: SchemaField[];
    source?: string;
    error?: string;
    note?: string;
}

interface FieldMapping {
    source?: string; // Legacy
    expression?: string; // New
    target: string;
}

interface MappingEditorProps {
    blueprintId: string;
    nodeId: string;
    mappings: FieldMapping[];
    onMappingsChange: (mappings: FieldMapping[]) => void;
}

// ... [Schema helper functions omitted for brevity, logic remains identical] ...
// Re-implementing them briefly to ensure the file is complete and self-contained if we are replacing the whole file, 
// OR we can assume they are available if we are only replacing the component. 
// However, the tool is replace_file_content, so I must include everything I want in the file if I'm replacing a huge chunk or strict range.
// The prompt asked for "ReplacementContent". 
// Since I am replacing the WHOLE file (StartLine 1 to 577), I must provide the FULL content.

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

/**
 * Get input schema for a node type (client-side version).
 */
function getNodeInputSchema(primitiveType: PrimitiveType, _params: Record<string, unknown>): SchemaField[] {
    switch (primitiveType) {
        case "CALL_TOOL":
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
        case "DOCUMENT_CONVERTER":
            return [
                { name: "input_file_path", type: "string", label: "Input File Path" },
                { name: "input_content", type: "string", label: "Input Content" },
                { name: "input_format", type: "string", label: "Input Format" },
                { name: "output_format", type: "string", label: "Output Format" },
                { name: "output_path", type: "string", label: "Output Path (optional)" },
            ];
        case "END":
            return [
                { name: "result", type: "any", label: "Final Result" },
            ];
        default:
            return [];
    }
}

const MAPPING_TYPES = [
    { value: "any", label: "Any (No Cast)", wrap: (v: string) => v },
    { value: "str", label: "String", wrap: (v: string) => `str(${v})` },
    { value: "int", label: "Integer", wrap: (v: string) => `int(${v})` },
    { value: "float", label: "Float", wrap: (v: string) => `float(${v})` },
    { value: "bool", label: "Boolean", wrap: (v: string) => `bool(${v})` },
    { value: "list", label: "List", wrap: (v: string) => `list(${v})` },
    { value: "dict", label: "Object (Dict)", wrap: (v: string) => `dict(${v})` },
];

const MAPPING_FUNCTIONS = [
    {
        label: "Operators", options: [
            { value: " + ", label: "Plus (+)" },
            { value: " - ", label: "Minus (-)" },
            { value: " * ", label: "Multiply (*)" },
            { value: " / ", label: "Divide (/)" },
        ]
    },
    {
        label: "String", options: [
            { value: " + \" \" + ", label: "Concatenate Space" },
            { value: ".upper()", label: "Popup Case (upper)" },
            { value: ".lower()", label: "Lower Case (lower)" },
            { value: "len()", label: "Length (len)" },
        ]
    },
    {
        label: "Date/Time", options: [
            { value: "now()", label: "Current Time" },
            { value: "isoformat()", label: "ISO Format" },
        ]
    },
];

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

    // Editor state
    const [newExpression, setNewExpression] = useState("");
    const [newTarget, setNewTarget] = useState("");

    // Field Builder State
    const [selectedSourceNode, setSelectedSourceNode] = useState<string>("");
    const [selectedSourceField, setSelectedSourceField] = useState<string>("");
    const [selectedType, setSelectedType] = useState<string>("any");

    const inputRef = useRef<HTMLInputElement>(null);
    const nodes = useBuilderStore((state) => state.nodes);
    const edges = useBuilderStore((state) => state.edges);

    const fetchToolSchema = async (toolId: number, forOutput: boolean): Promise<SchemaField[]> => {
        try {
            const response = await fetch(`${API_URL}/tools/${toolId}`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
            });
            if (!response.ok) return [];

            const tool = await response.json();
            const config = tool.configuration || {};
            console.log("[MappingEditor] Fetched Tool:", tool.name, tool.id);
            console.log("[MappingEditor] Config Output Schema:", config.output_schema);

            if (forOutput) {
                const outputSchema = config.output_schema || {};
                const outFields: SchemaField[] = [];

                if (outputSchema.properties) {
                    for (const [name, prop] of Object.entries(outputSchema.properties)) {
                        const propData = prop as { type?: string; description?: string };
                        outFields.push({ name, type: propData.type || "string", label: propData.description || name });
                    }
                } else if (outputSchema.type === "array" && outputSchema.items?.properties) {
                    // It's an array output. Expose root list (empty name triggers node reference)
                    outFields.push({ name: "", type: "array", label: "Root List (All Items)" });
                    // Expose item properties for easy mapping via JMESPath
                    for (const [name, prop] of Object.entries(outputSchema.items.properties)) {
                        const propData = prop as { type?: string; description?: string };
                        outFields.push({
                            name: `[*].${name}`,
                            type: propData.type || "string",
                            label: `(Item) ${propData.description || name}`
                        });
                    }
                }

                if (outFields.length > 0) return outFields;
                // Fallback: If generic object, assume 'result' property or root?
                // Usually generic format implies object w/ properties.
                // If we know nothing, maybe empty name?
                // But sticking to 'result' is safer legacy wise if tools wrapped it.
                // However, for consistency, let's use check properties.
                return [{ name: "result", type: "object", label: `Result from ${tool.name || "tool"}` }];
            }

            // --- Input Schema Logic (Only if !forOutput) ---
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

            // Check for MCP functions (parameters)
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

        // Incoming: All OTHER nodes' Output Schema
        // This allows sourcing data from anywhere in the graph
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

        // Outgoing: ONLY downstream connected nodes' Input Schema 
        // This shows what fields the actual next nodes in the workflow expect
        const downstreamNodeIds = new Set<string>();
        edges.forEach(edge => {
            if (edge.source === nodeId) {
                downstreamNodeIds.add(edge.target);
            }
        });

        for (const targetNode of nodes) {
            // Only include nodes that are actually connected downstream
            if (!downstreamNodeIds.has(targetNode.id)) continue;

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
            // Force client-side discovery to ensure we see ALL nodes in the editor state
            // (Server-side endpoint might only return connected nodes or saved state)
            const localSchemas = await buildLocalSchemas();
            setIncoming(localSchemas.incoming);
            setOutgoing(localSchemas.outgoing);
            if (localSchemas.incoming.length === 0 && localSchemas.outgoing.length === 0) {
                setErrors(["No other nodes found to map fields from/to."]);
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

    // --- Constants ---

    // We define these inside or outside component. Inside is fine for now but outside is cleaner.
    // Let's refactor to use constant references if possible, but for replace_file_content 
    // we just replace the body where these arrays were defined before (or add them).

    const MAPPING_TYPES = [
        { label: "Any (No Cast)", value: "any", wrap: (s: string) => s },
        { label: "String", value: "str", wrap: (s: string) => `str(${s})` },
        { label: "Integer", value: "int", wrap: (s: string) => `int(${s})` },
        { label: "Float", value: "float", wrap: (s: string) => `float(${s})` },
        { label: "Boolean", value: "bool", wrap: (s: string) => `bool(${s})` },
        { label: "List", value: "list", wrap: (s: string) => `list(${s})` },
        { label: "Dict", value: "dict", wrap: (s: string) => `dict(${s})` },
        { label: "Date", value: "date", wrap: (s: string) => `date(${s})` },
        { label: "DateTime", value: "datetime", wrap: (s: string) => `datetime(${s})` },
        { label: "Time", value: "time", wrap: (s: string) => `time(${s})` },
    ];

    const MAPPING_FUNCTIONS = [
        {
            label: "Operators",
            options: [
                { label: "Plus (+)", value: " + " },
                { label: "Minus (-)", value: " - " },
                { label: "Multiply (*)", value: " * " },
                { label: "Divide (/)", value: " / " },
                { label: "Concatenate Space", value: ' + " " + ' },
            ]
        },
        {
            label: "Methods",
            options: [
                { label: "Upper Case .upper()", value: ".upper()" },
                { label: "Lower Case .lower()", value: ".lower()" },
                { label: "Title Case .title()", value: ".title()" },
                { label: "Capitalize .capitalize()", value: ".capitalize()" },
            ]
        },
        {
            options: [
                { label: "Length len()", value: "len()" },
                { label: "Format format()", value: "format()" },
                { label: "Round round()", value: "round()" },
                { label: "Current Time", value: "datetime.now()" },
                { label: "List Extraction (JMESPath)", value: "search('items[*].name', input)" },
            ]
        },
        {
            label: "Collections",
            options: [
                { label: "Keys .keys()", value: ".keys()" },
                { label: "Values .values()", value: ".values()" },
                { label: "Items .items()", value: ".items()" },
                { label: "Join list .join()", value: '" ".join()' },
            ]
        }
    ];



    // ... [Previous Helper Functions] ...

    const getFieldExpression = (nodeId: string, field: string, typeVal: string) => {
        if (!nodeId) return "";
        const safeNodeId = nodeId.replace(/-/g, "_");
        let expr = "";

        if (!field) {
            expr = safeNodeId;
        } else if (field.startsWith("[*].")) {
            expr = `search('${field}', ${safeNodeId})`;
        } else {
            const isValidIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field);
            if (isValidIdentifier) {
                expr = `${safeNodeId}.${field}`;
            } else {
                expr = `${safeNodeId}['${field}']`;
            }
        }

        const typeDef = MAPPING_TYPES.find(t => t.value === typeVal);
        if (typeDef && typeVal !== "any") {
            expr = typeDef.wrap(expr);
        }
        return expr;
    };

    const handleInsertField = () => {
        // Appends current selection to expression at cursor
        if (!selectedSourceNode) return;
        const insertion = getFieldExpression(selectedSourceNode, selectedSourceField, selectedType);

        let start = inputRef.current?.selectionStart || newExpression.length;
        let end = inputRef.current?.selectionEnd || newExpression.length;

        const newVal = newExpression.substring(0, start) + insertion + newExpression.substring(end);
        setNewExpression(newVal);

        // Reset selection? Maybe keep it for multiple inserts
        // setSelectedSourceField("");
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleInsertFunction = (func: string) => {
        let start = inputRef.current?.selectionStart || newExpression.length;
        let end = inputRef.current?.selectionEnd || newExpression.length;
        const newVal = newExpression.substring(0, start) + func + newExpression.substring(end);
        setNewExpression(newVal);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleAddMapping = () => {
        if (newExpression && newTarget) {
            const updated = [
                ...mappings,
                { expression: newExpression, target: newTarget },
            ];
            onMappingsChange(updated);
            setNewExpression("");
            setNewTarget("");
        }
    };

    const handleRemoveMapping = (index: number) => {
        const updated = mappings.filter((_, i) => i !== index);
        onMappingsChange(updated);
    };

    const handleUpdateMapping = (index: number, field: keyof FieldMapping, value: string) => {
        const updated = [...mappings];
        updated[index] = { ...updated[index], [field]: value };
        if (field === 'expression') delete updated[index].source;
        onMappingsChange(updated);
    };

    const extractNodeInfo = (expression: string): Array<{ nodeId: string; nodeName: string }> => {
        const refs: Array<{ nodeId: string; nodeName: string }> = [];
        const nodePattern = /\b([a-zA-Z0-9_-]+)\s*(?:\.|\[)/g;
        let match;
        while ((match = nodePattern.exec(expression)) !== null) {
            const nodeId = match[1];
            const node = nodes.find(n => n.id === nodeId || n.id.replace(/-/g, '_') === nodeId);
            if (node) {
                const nodeData = node.data as { label?: string; primitiveType?: string };
                const nodeName = (nodeData.label as string) || (nodeData.primitiveType as string) || nodeId;
                refs.push({ nodeId: node.id, nodeName });
            }
        }
        return refs;
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Label className="text-sm font-medium">Data Transformation</Label>
                    <p className="text-xs text-muted-foreground">Map and transform data using expressions.</p>
                </div>
                <div className="flex gap-1">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                <Info className="h-3 w-3" /> Syntax
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                            <div className="space-y-2 text-xs">
                                <h4 className="font-medium">Expression Syntax</h4>
                                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                    <li>Variables: <code>node_id.field</code></li>
                                    <li>Concat: <code>name + " " + suffix</code></li>
                                    <li>Functions: <code>str(), int(), len()</code></li>
                                    <li>Slicing: <code>items[0:5]</code></li>
                                    <li>Methods: <code>str.title(), list.join()</code></li>
                                    <li>Lists: <code>search('items[*].name', input)</code></li>
                                </ul>
                                <div className="mt-2 text-[10px] text-muted-foreground border-t pt-2">
                                    <p className="font-semibold">List Extraction (JMESPath):</p>
                                    <p>Use <code>search('pattern', data)</code> to extract values from lists.</p>
                                    <p>Example: <code>search('users[*].email', input_data)</code></p>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchSchemas} disabled={isLoading}>
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                </div>
            </div>

            {/* Mappings List */}
            <div className="space-y-2">
                {mappings.map((mapping, index) => {
                    const expression = mapping.expression || mapping.source || "";
                    const nodeRefs = extractNodeInfo(expression);
                    return (
                        <div key={index} className="space-y-1.5 p-3 bg-slate-50 dark:bg-slate-900/40 rounded border group">
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                    <div className="shrink-0 flex items-center">
                                        <span className="text-[10px] text-muted-foreground mr-1">To:</span>
                                        <Select
                                            value={mapping.target}
                                            onValueChange={(val) => handleUpdateMapping(index, "target", val)}
                                        >
                                            <SelectTrigger className="h-6 text-xs px-2 min-w-[120px] max-w-[200px] border-dashed border-slate-300 dark:border-slate-700 bg-transparent">
                                                <span className="truncate font-mono font-semibold text-blue-600 dark:text-blue-400">
                                                    {mapping.target}
                                                </span>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {targetFields.map((f, i) => (
                                                    <SelectItem key={i} value={f.value} className="text-xs">
                                                        <span className="font-mono text-blue-600 dark:text-blue-400">{f.value}</span>
                                                        <span className="ml-2 text-muted-foreground">({f.nodeLabel})</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Source Badges */}
                                    {nodeRefs.length > 0 && (
                                        <div className="flex flex-wrap gap-1 ml-1 border-l pl-2 border-slate-200 dark:border-slate-800">
                                            {nodeRefs.map((ref, i) => (
                                                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 font-mono">
                                                    <span className="text-muted-foreground">src:</span>
                                                    <span className="font-semibold">{ref.nodeId}</span>
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <Button className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" variant="ghost" size="icon" onClick={() => handleRemoveMapping(index)}>
                                    <Trash2 className="h-3 w-3 text-red-500" />
                                </Button>
                            </div>
                            <Textarea
                                className="min-h-[40px] font-mono text-xs bg-white dark:bg-black resize-y"
                                value={expression}
                                onChange={(e) => handleUpdateMapping(index, "expression", e.target.value)}
                                placeholder="Expression..."
                            />
                        </div>
                    );
                })}
            </div>

            {/* New Mapping Builder */}
            <div className="border rounded-md p-3 bg-slate-50/50 dark:bg-slate-900/20 space-y-3">
                <div className="flex items-center gap-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">New Mapping</Label>
                </div>

                <div className="grid gap-4">

                    {/* Source Field Selector Row */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Source Field Builder</Label>
                        <div className="flex gap-2 items-end">
                            <div className="flex-1 min-w-0">
                                <Select
                                    value={selectedSourceNode && selectedSourceField ? `${selectedSourceNode}:${selectedSourceField}` : ""}
                                    onValueChange={(val) => {
                                        const [node, field] = val.split(":");
                                        setSelectedSourceNode(node);
                                        setSelectedSourceField(field);
                                        // Auto-populate expression
                                        const expr = getFieldExpression(node, field, selectedType);
                                        setNewExpression(expr);
                                    }}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Select Source Field..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {incoming.length === 0 && <div className="p-2 text-xs text-muted-foreground">No upstream nodes</div>}
                                        {incoming.map((node) => (
                                            <SelectGroup key={node.node_id}>
                                                <SelectLabel className="text-xs font-bold text-muted-foreground px-2 py-1.5">{node.label} ({node.node_id})</SelectLabel>
                                                <SelectItem value={`${node.node_id}:`} className="text-xs pl-4 italic">
                                                    <span className="font-mono text-muted-foreground">Root (Whole Object)</span>
                                                </SelectItem>
                                                {node.fields.map((field) => (
                                                    <SelectItem key={`${node.node_id}:${field.name}`} value={`${node.node_id}:${field.name}`} className="text-xs pl-4">
                                                        <span className="font-mono">{field.name}</span>
                                                        <span className="ml-2 text-[10px] text-muted-foreground">({field.type})</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="w-[110px] shrink-0">
                                <Select
                                    value={selectedType}
                                    onValueChange={(val) => {
                                        setSelectedType(val);
                                        if (selectedSourceNode) {
                                            const expr = getFieldExpression(selectedSourceNode, selectedSourceField, val);
                                            setNewExpression(expr);
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MAPPING_TYPES.map(t => (
                                            <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <Button
                                size="sm"
                                className="h-8 px-3 text-xs"
                                variant="secondary"
                                onClick={handleInsertField}
                                disabled={!selectedSourceNode}
                            >
                                Append <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                        </div>
                    </div>

                    {/* Expression Row */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium">Expression</Label>
                            <Select onValueChange={handleInsertFunction}>
                                <SelectTrigger className="h-6 text-xs w-[140px] px-2 border-dashed">
                                    <Wand2 className="h-3 w-3 mr-1" />
                                    <SelectValue placeholder="Add Function..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {MAPPING_FUNCTIONS.map(group => (
                                        <SelectGroup key={group.label}>
                                            <SelectLabel className="text-xs font-bold text-muted-foreground px-2 py-1.5">{group.label}</SelectLabel>
                                            {group.options.map((opt, optIndex) => (
                                                <SelectItem key={`${group.label}-${optIndex}`} value={opt.value} className="text-xs font-mono">
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Input
                            ref={inputRef}
                            className="h-8 font-mono text-xs"
                            placeholder="e.g. node1.field + '_suffix'"
                            value={newExpression}
                            onChange={(e) => setNewExpression(e.target.value)}
                        />
                    </div>

                    {/* Target Field Row */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Target Field</Label>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                {targetFields.length > 0 ? (
                                    <Select value={newTarget} onValueChange={setNewTarget}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Select Target Field..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {targetFields.map((f, i) => (
                                                <SelectItem key={i} value={f.value} className="text-xs">
                                                    <span className="font-mono text-blue-600 dark:text-blue-400">{f.value}</span>
                                                    <span className="ml-2 text-muted-foreground">({f.nodeLabel})</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input
                                        className="h-8 text-xs"
                                        placeholder="e.g. output_field_name"
                                        value={newTarget}
                                        onChange={(e) => setNewTarget(e.target.value)}
                                    />
                                )}
                            </div>

                            <Button size="sm" className="h-8 disabled:opacity-50" onClick={handleAddMapping} disabled={!newExpression || !newTarget}>
                                <Plus className="h-4 w-4 mr-1" /> Add
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Discovery Errors */}
            {
                errors.length > 0 && (
                    <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Schema Warnings:</span>
                        <ul className="text-xs text-amber-600 dark:text-amber-400 mt-1 list-disc list-inside">
                            {errors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                    </div>
                )
            }
        </div >
    );
}
