"use client";

/**
 * Inspector Panel Component
 *
 * Right sidebar with contextual content:
 * - Tool Palette when nothing selected
 * - Node parameter editor when node selected
 */
import { useState, useEffect, useRef } from "react";
import { Node } from "@xyflow/react";
import {
    Globe,
    GitBranch,
    Wrench,
    Repeat,
    FileText,
    Brain,
    FileJson,
    Search,
    ChevronRight,
    ChevronLeft,
    Loader2,
    AlertCircle,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useBuilderStore } from "@/lib/builder-store";
import { PRIMITIVE_CONFIGS, PrimitiveType, ModelPreset } from "@/lib/builder-types";
import { cn, API_URL } from "@/lib/utils";
import { MappingEditor } from "./mapping-editor";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { VariablePicker } from "./variable-picker";
import { TemplateSelector } from "./template-selector";
import { ExpressionBuilder } from "./expression-builder";
import { InputSchemaBuilder } from "./input-schema-builder";

// Node data interface with index signature for React Flow compatibility
interface BuilderNodeData {
    label: string;
    primitiveType: PrimitiveType;
    params: Record<string, unknown>;
    [key: string]: unknown;
}

const ICON_MAP: Record<string, React.ReactNode> = {
    Globe: <Globe className="h-4 w-4" />,
    GitBranch: <GitBranch className="h-4 w-4" />,
    Wrench: <Wrench className="h-4 w-4" />,
    Repeat: <Repeat className="h-4 w-4" />,
    FileText: <FileText className="h-4 w-4" />,
    Brain: <Brain className="h-4 w-4" />,
    FileJson: <FileJson className="h-4 w-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
    logic: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
    data: "text-cyan-500 bg-cyan-50 dark:bg-cyan-900/20",
    ai: "text-pink-500 bg-pink-50 dark:bg-pink-900/20",
    integration: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
};

/**
 * Tool interface for the Call Tool primitive.
 */
interface ToolDefinition {
    id: number;
    name: string;
    description: string;
    configuration?: {
        // Consolidated input schema (manually edited or auto-generated)
        input_schema?: {
            type?: string;
            properties?: Record<string, {
                type?: string;
                description?: string;
                default?: unknown;
            }>;
            required?: string[];
        };
        // Individual function schemas from MCP servers
        selected_functions?: Array<{
            name: string;
            description?: string;
            inputSchema?: {
                type?: string;
                properties?: Record<string, {
                    type?: string;
                    description?: string;
                    default?: unknown;
                }>;
                required?: string[];
            };
        }>;
    };
}

/**
 * Interface for argument with agent-decide flag.
 */
interface ArgumentConfig {
    value: string;
    letAgentDecide: boolean;
}

export function InspectorPanel() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [panelWidth, setPanelWidth] = useState(288); // Default w-72 = 288px
    const isResizing = useRef(false);

    const selectedNodeId = useBuilderStore((state) => state.selectedNodeId);
    const blueprintId = useBuilderStore((state) => state.blueprintId);
    const nodes = useBuilderStore((state) => state.nodes);
    const updateNodeParams = useBuilderStore((state) => state.updateNodeParams);
    const deleteNode = useBuilderStore((state) => state.deleteNode);

    const selectedNode = nodes.find((n) => n.id === selectedNodeId) as Node<BuilderNodeData> | undefined;

    // Handle resize mouse events
    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", stopResize);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        // Calculate new width based on mouse position from right edge
        const newWidth = window.innerWidth - e.clientX;
        // Clamp between min (200px) and max (600px)
        setPanelWidth(Math.max(200, Math.min(600, newWidth)));
    };

    const stopResize = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", stopResize);
    };

    if (isCollapsed) {
        return (
            <div className="w-12 border-l bg-slate-50 dark:bg-slate-900 flex flex-col items-center py-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsCollapsed(false)}
                    className="mb-4"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="writing-vertical-lr text-sm font-medium text-muted-foreground">
                    {selectedNode ? "Inspector" : "Palette"}
                </div>
            </div>
        );
    }

    // Filter primitives by search
    const filteredPrimitives = PRIMITIVE_CONFIGS.filter(
        (p) =>
            p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Handle drag start from palette
    const handleDragStart = (e: React.DragEvent, type: PrimitiveType) => {
        e.dataTransfer.setData("application/primitive-type", type);
        e.dataTransfer.effectAllowed = "move";
    };

    return (
        <div
            className="border-l bg-slate-50 dark:bg-slate-900 flex flex-col shrink-0 relative"
            style={{ width: panelWidth }}
        >
            {/* Resize handle on left edge */}
            <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-10"
                onMouseDown={startResize}
            />
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b">
                <h3 className="font-semibold text-sm">
                    {selectedNode ? "Inspector" : "Tool Palette"}
                </h3>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsCollapsed(true)}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                {selectedNode ? (
                    <NodeInspector
                        node={selectedNode}
                        onUpdate={(params) => updateNodeParams(selectedNode.id, params)}
                        onDelete={() => deleteNode(selectedNode.id)}
                    />
                ) : (
                    <div className="p-3 space-y-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search primitives..."
                                className="pl-8"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Primitives by category */}
                        {["integration", "logic", "data", "ai"].map((category) => {
                            const categoryPrimitives = filteredPrimitives.filter(
                                (p) => p.category === category
                            );
                            if (categoryPrimitives.length === 0) return null;

                            return (
                                <div key={category}>
                                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                        {category}
                                    </h4>
                                    <div className="space-y-2">
                                        {categoryPrimitives.map((primitive) => (
                                            <div
                                                key={primitive.type}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, primitive.type)}
                                                className={cn(
                                                    "flex items-start gap-3 p-2 rounded-lg cursor-grab border hover:border-blue-300 transition-colors",
                                                    "bg-white dark:bg-slate-800"
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        "p-1.5 rounded",
                                                        CATEGORY_COLORS[primitive.category]
                                                    )}
                                                >
                                                    {ICON_MAP[primitive.icon]}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm">
                                                        {primitive.label}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground line-clamp-1">
                                                        {primitive.description}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}

// =============================================================================
// Node Inspector Sub-component
// =============================================================================

interface NodeInspectorProps {
    node: {
        id: string;
        data: {
            label: string;
            primitiveType: PrimitiveType;
            params: Record<string, unknown>;
        };
    };
    onUpdate: (params: Record<string, unknown>) => void;
    onDelete: () => void;
}

interface JsonEditorProps {
    value: unknown;
    onChange: (value: unknown) => void;
    placeholder?: string;
    minHeight?: string;
}

function JsonEditor({ value, onChange, placeholder, minHeight = "min-h-[60px]" }: JsonEditorProps) {
    const [text, setText] = useState(() => {
        if (value === undefined || value === null) return "";
        return JSON.stringify(value, null, 2);
    });

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (value === undefined || value === null) {
            if (text !== "") setText("");
        } else {
            try {
                const currentParsed = text ? JSON.parse(text) : undefined;
                if (JSON.stringify(currentParsed) !== JSON.stringify(value)) {
                    setText(JSON.stringify(value, null, 2));
                }
            } catch {
                // If invalid, keep local text
            }
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newText = e.target.value;
        setText(newText);

        if (newText.trim() === "") {
            setError(null);
            onChange({});
            return;
        }

        try {
            const parsed = JSON.parse(newText);
            setError(null);
            onChange(parsed);
        } catch (err) {
            setError("Invalid JSON");
        }
    };

    return (
        <div className="space-y-1">
            <Textarea
                placeholder={placeholder}
                className={cn("font-mono text-xs", minHeight, error ? "border-red-500 focus-visible:ring-red-500" : "")}
                value={text}
                onChange={handleChange}
            />
            {error && <p className="text-[10px] text-red-500">{error}</p>}
        </div>
    );
}

function NodeInspector({ node, onUpdate, onDelete }: NodeInspectorProps) {
    const params = node.data.params || {};
    const primitiveType = node.data.primitiveType;

    // Get blueprintId from store for schema discovery
    const blueprintId = useBuilderStore((state) => state.blueprintId);
    const selectedNode = node; // Alias for consistency with MappingEditor

    // State for available tools (used by CALL_TOOL)
    const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);
    const [isLoadingTools, setIsLoadingTools] = useState(false);
    const [selectedToolConfig, setSelectedToolConfig] = useState<ToolDefinition | null>(null);
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);

    // State for available LLMs (used by LLM_DECISION)
    const [llmModels, setLlmModels] = useState<ModelPreset[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    // Fetch tools when CALL_TOOL node is selected
    useEffect(() => {
        if (primitiveType === "CALL_TOOL") {
            const fetchTools = async () => {
                setIsLoadingTools(true);
                try {
                    const response = await fetch(`${API_URL}/tools`, {
                        headers: {
                            "Authorization": `Bearer ${localStorage.getItem("token")}`
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        setAvailableTools(data);
                    }
                } catch (error) {
                    console.error("Failed to fetch tools", error);
                } finally {
                    setIsLoadingTools(false);
                }
            };
            fetchTools();
        }
    }, [primitiveType]);

    // Fetch LLM models when LLM_DECISION or TEXT_TEMPLATE node is selected
    useEffect(() => {
        if (primitiveType === "LLM_DECISION" || primitiveType === "TEXT_TEMPLATE") {
            const fetchModels = async () => {
                setIsLoadingModels(true);
                try {
                    const response = await fetch(`${API_URL}/config/presets`, {
                        headers: {
                            "Authorization": `Bearer ${localStorage.getItem("token")}`
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        setLlmModels(data.presets || []);
                    }
                } catch (error) {
                    console.error("Failed to fetch models", error);
                } finally {
                    setIsLoadingModels(false);
                }
            };
            fetchModels();
        }
    }, [primitiveType]);

    // Fetch full tool configuration when tool is selected
    useEffect(() => {
        if (params.tool_id && primitiveType === "CALL_TOOL") {
            const fetchToolConfig = async () => {
                setIsLoadingConfig(true);
                try {
                    const response = await fetch(`${API_URL}/tools/${params.tool_id}`, {
                        headers: {
                            "Authorization": `Bearer ${localStorage.getItem("token")}`
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        setSelectedToolConfig(data);

                        // Auto-populate tool_description if not already set
                        // This handles cases when loading existing blueprints
                        if (!params.tool_description && data.description) {
                            onUpdate({
                                ...params,
                                tool_description: data.description
                            });
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch tool config", error);
                } finally {
                    setIsLoadingConfig(false);
                }
            };
            fetchToolConfig();
        } else {
            setSelectedToolConfig(null);
        }
    }, [params.tool_id, primitiveType]);

    const handleParamChange = (key: string, value: unknown) => {
        onUpdate({ ...params, [key]: value });
    };

    // Handle tool selection - also update tool_name and tool_description for display
    const handleToolSelect = (toolId: string) => {
        const id = parseInt(toolId);
        const selectedTool = availableTools.find(t => t.id === id);
        // Reset arguments when tool changes, set tool description as default
        onUpdate({
            ...params,
            tool_id: id,
            tool_name: selectedTool?.name || "Unknown Tool",
            tool_description: selectedTool?.description || "",
            arguments: {},
            agent_decide_args: []
        });
    };

    // Handle description change
    const handleDescriptionChange = (value: string) => {
        onUpdate({
            ...params,
            tool_description: value
        });
    };

    // Handle argument value change
    const handleArgumentChange = (argName: string, value: string) => {
        const currentArgs = (params.arguments as Record<string, unknown>) || {};
        onUpdate({
            ...params,
            arguments: { ...currentArgs, [argName]: value }
        });
    };

    // Handle "Let Agent Decide" toggle
    const handleAgentDecideToggle = (argName: string, enabled: boolean) => {
        const currentAgentArgs = (params.agent_decide_args as string[]) || [];
        let newAgentArgs: string[];
        if (enabled) {
            newAgentArgs = [...currentAgentArgs, argName];
        } else {
            newAgentArgs = currentAgentArgs.filter(a => a !== argName);
        }
        onUpdate({
            ...params,
            agent_decide_args: newAgentArgs
        });
    };

    // Get argument schema from selected tool - prioritize consolidated input_schema
    const getArgumentSchema = () => {
        if (!selectedToolConfig?.configuration) return [];

        const allArgs: Array<{
            name: string;
            type?: string;
            description?: string;
            required: boolean;
        }> = [];

        // First, check for consolidated input_schema (from Tools Builder)
        const consolidatedSchema = selectedToolConfig.configuration.input_schema;
        if (consolidatedSchema?.properties) {
            const properties = consolidatedSchema.properties;
            const required = consolidatedSchema.required || [];
            Object.entries(properties).forEach(([name, schema]) => {
                allArgs.push({
                    name,
                    type: schema.type,
                    description: schema.description,
                    required: required.includes(name)
                });
            });
            return allArgs;
        }

        // Fall back to individual function schemas
        if (selectedToolConfig.configuration.selected_functions) {
            selectedToolConfig.configuration.selected_functions.forEach(func => {
                const properties = func.inputSchema?.properties || {};
                const required = func.inputSchema?.required || [];
                Object.entries(properties).forEach(([name, schema]) => {
                    // Avoid duplicates
                    if (!allArgs.find(a => a.name === name)) {
                        allArgs.push({
                            name,
                            type: schema.type,
                            description: schema.description,
                            required: required.includes(name)
                        });
                    }
                });
            });
        }

        return allArgs;
    };

    return (
        <div className="p-3 space-y-4">
            {/* Node Info */}
            <div>
                <Label className="text-xs text-muted-foreground">Node ID</Label>
                <div className="text-sm font-mono truncate">{node.id}</div>
            </div>

            <Separator />

            {/* Parameter fields based on primitive type */}
            {primitiveType === "HTTP_REQUEST" && (
                <>
                    <div className="space-y-2">
                        <Label>Method</Label>
                        <select
                            className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                            value={(params.method as string) || "GET"}
                            onChange={(e) => handleParamChange("method", e.target.value)}
                        >
                            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>URL</Label>
                        <div className="flex gap-1">
                            <Input
                                placeholder="https://api.example.com/..."
                                value={(params.url as string) || ""}
                                onChange={(e) => handleParamChange("url", e.target.value)}
                            />
                            <VariablePicker onSelect={(path) => handleParamChange("url", ((params.url as string) || "") + `{{${path}}}`)} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Use {"{{variable}}"} for dynamic values
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>Headers (JSON)</Label>
                        <Textarea
                            placeholder='{"Content-Type": "application/json"}'
                            className="font-mono text-xs"
                            value={JSON.stringify(params.headers || {}, null, 2)}
                            onChange={(e) => {
                                try {
                                    handleParamChange("headers", JSON.parse(e.target.value));
                                } catch {
                                    // Invalid JSON, ignore
                                }
                            }}
                        />
                    </div>
                </>
            )}

            {primitiveType === "CONDITION" && (
                <>
                    <div className="space-y-2">
                        <Label>Expression</Label>
                        <ExpressionBuilder
                            value={(params.expression as string) || ""}
                            onChange={(getValue) => handleParamChange("expression", getValue)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Build a condition to check (If true → Green path, Else → Red path)
                        </p>
                    </div>
                </>
            )}

            {primitiveType === "CALL_TOOL" && (
                <>
                    <div className="space-y-2">
                        <Label>Select Tool</Label>
                        {isLoadingTools ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading tools...
                            </div>
                        ) : availableTools.length === 0 ? (
                            <div className="text-sm text-muted-foreground p-2 border rounded-md bg-amber-50 dark:bg-amber-900/20">
                                No tools available. Create tools in the Tools section first.
                            </div>
                        ) : (
                            <select
                                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                                value={(params.tool_id as number) || ""}
                                onChange={(e) => handleToolSelect(e.target.value)}
                            >
                                <option value="">-- Select a tool --</option>
                                {availableTools.map((tool) => (
                                    <option key={tool.id} value={tool.id}>
                                        {tool.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        {params.tool_id !== undefined && params.tool_id !== null && (
                            <p className="text-xs text-muted-foreground">
                                Tool ID: {String(params.tool_id)}
                            </p>
                        )}
                    </div>

                    {/* Description field - editable context for the LLM */}
                    {params.tool_id !== undefined && params.tool_id !== null && (
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                Description
                                <HelpTooltip contentPath="agent-builder/call_tool_description" />
                            </Label>
                            <Textarea
                                placeholder="Describe what this tool should do in this context (e.g., 'Get the user's name', 'Fetch the dollar to euro exchange rate')"
                                value={(params.tool_description as string) || ""}
                                onChange={(e) => handleDescriptionChange(e.target.value)}
                                className="text-sm min-h-[60px]"
                            />
                            <p className="text-xs text-muted-foreground">
                                This description helps the AI understand the purpose of this tool in your workflow.
                            </p>
                        </div>
                    )}

                    {/* Schemas Inspector */}
                    {selectedToolConfig && (
                        <div className="space-y-2">
                            <Label>Tool Schemas</Label>
                            <div className="rounded-md border bg-slate-50 dark:bg-slate-900 overflow-hidden">
                                <details className="group border-b last:border-0">
                                    <summary className="flex items-center justify-between p-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium">
                                        Input Schema
                                        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                                    </summary>
                                    <div className="p-2 border-t bg-white dark:bg-slate-950">
                                        <ScrollArea className="h-40 w-full rounded border bg-slate-50 dark:bg-slate-900 p-2">
                                            <pre className="text-[10px] font-mono whitespace-pre-wrap">
                                                {JSON.stringify(
                                                    selectedToolConfig.configuration?.input_schema ||
                                                        (selectedToolConfig as any).tool_type === "gui" ? selectedToolConfig.configuration : "No schema defined",
                                                    null, 2
                                                )}
                                            </pre>
                                        </ScrollArea>
                                    </div>
                                </details>
                                <details className="group border-b last:border-0">
                                    <summary className="flex items-center justify-between p-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium">
                                        Output Schema
                                        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                                    </summary>
                                    <div className="p-2 border-t bg-white dark:bg-slate-950">
                                        <ScrollArea className="h-40 w-full rounded border bg-slate-50 dark:bg-slate-900 p-2">
                                            <pre className="text-[10px] font-mono whitespace-pre-wrap">
                                                {JSON.stringify(
                                                    (selectedToolConfig.configuration as any)?.output_schema || "Dynamic / Not Defined",
                                                    null, 2
                                                )}
                                            </pre>
                                        </ScrollArea>
                                    </div>
                                </details>
                            </div>
                        </div>
                    )}

                    {/* Smart Arguments Form */}
                    {params.tool_id !== undefined && params.tool_id !== null && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Arguments</Label>
                                {isLoadingConfig && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Loading...
                                    </div>
                                )}
                            </div>

                            {getArgumentSchema().length === 0 && !isLoadingConfig ? (
                                <div className="text-sm text-muted-foreground p-3 border rounded-md bg-slate-50 dark:bg-slate-800/50">
                                    <p className="font-medium mb-1">No arguments required</p>
                                    <p className="text-xs">This tool doesn't require any input parameters, or the tool configuration doesn't specify arguments.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {getArgumentSchema().map((arg) => {
                                        const currentArgs = (params.arguments as Record<string, unknown>) || {};
                                        const agentDecideArgs = (params.agent_decide_args as string[]) || [];
                                        const isAgentDecide = agentDecideArgs.includes(arg.name);

                                        return (
                                            <div key={arg.name} className="border rounded-md p-3 space-y-2">
                                                {/* Argument name, type, and description */}
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <Label className="text-sm font-medium">
                                                            {arg.name}
                                                        </Label>
                                                        {arg.required && (
                                                            <span className="text-xs text-red-500">*required</span>
                                                        )}
                                                        {arg.type && (
                                                            <span className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                                {arg.type}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {arg.description && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {arg.description}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Agent Decides checkbox - on its own line */}
                                                <div className="flex items-center">
                                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={isAgentDecide}
                                                            onChange={(e) => handleAgentDecideToggle(arg.name, e.target.checked)}
                                                            className="h-4 w-4 rounded border"
                                                        />
                                                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                                                            Agent Decides
                                                        </span>
                                                    </label>
                                                </div>

                                                {!isAgentDecide && (
                                                    <div className="flex gap-1">
                                                        <Input
                                                            placeholder={`Enter ${arg.name}...`}
                                                            value={(currentArgs[arg.name] as string) || ""}
                                                            onChange={(e) => handleArgumentChange(arg.name, e.target.value)}
                                                            className="text-sm"
                                                        />
                                                        <VariablePicker onSelect={(path) =>
                                                            handleArgumentChange(arg.name, ((currentArgs[arg.name] as string) || "") + `{{${path}}}`)
                                                        } />
                                                    </div>
                                                )}

                                                {isAgentDecide && (
                                                    <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                                                        ✨ The agent will determine this value at runtime based on context.
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )
            }

            {
                primitiveType === "TEXT_TEMPLATE" && (
                    <>
                        {/* Source Text */}
                        <div className="space-y-2">
                            <Label>Source Text</Label>
                            <div className="flex gap-1">
                                <Textarea
                                    placeholder="Raw content to restructure, or use {{variable}} reference"
                                    className="min-h-[100px]"
                                    value={(params.source_text as string) || ""}
                                    onChange={(e) => handleParamChange("source_text", e.target.value)}
                                />
                                <VariablePicker onSelect={(path) =>
                                    handleParamChange("source_text", `{{${path}}}`)
                                } />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                The raw text content to be restructured by the LLM
                            </p>
                        </div>

                        {/* Template Selection */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Template *</Label>
                                {params.template_id && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs text-red-500 hover:text-red-700"
                                        onClick={() => {
                                            onUpdate({
                                                ...params,
                                                template_id: "",
                                                template_name: ""
                                            });
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        Clear
                                    </Button>
                                )}
                            </div>

                            {/* Selected Template Display */}
                            {params.template_id && params.template_name ? (
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-md">
                                    <div className="flex items-start gap-2">
                                        <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 truncate">
                                                {params.template_name}
                                            </p>
                                            <p className="text-xs text-blue-600 dark:text-blue-400 font-mono truncate">
                                                ID: {params.template_id}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 flex-shrink-0">
                                            Selected
                                        </Badge>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-md">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                        <p className="text-xs text-amber-700 dark:text-amber-300">
                                            <strong>Required:</strong> Select a template below to format the output
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Template Tree Selector */}
                            <TemplateSelector
                                selectedId={(params.template_id as string) || null}
                                onSelect={(templateId, templateName) => {
                                    console.log('[Inspector] Template selected:', { templateId, templateName });
                                    // Update both template_id and template_name in a single call
                                    onUpdate({
                                        ...params,
                                        template_id: templateId,
                                        template_name: templateName
                                    });
                                    console.log('[Inspector] Updated params:', { template_id: templateId, template_name: templateName });
                                }}
                            />
                        </div>

                        {/* LLM Model Selector */}
                        <div className="space-y-2">
                            <Label>LLM Model</Label>
                            {isLoadingModels ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading models...
                                </div>
                            ) : (
                                <select
                                    className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                                    value={(params.llm_model as string) || "default"}
                                    onChange={(e) => handleParamChange("llm_model", e.target.value)}
                                >
                                    <option value="default">Default (System Configured)</option>
                                    {llmModels.map((model) => (
                                        <option key={model.name} value={model.name}>
                                            {model.name} {model.model_name ? `(${model.model_name})` : ""}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Output Variable */}
                        <div className="space-y-2">
                            <Label>Output Variable</Label>
                            <Input
                                placeholder="generated_markdown"
                                value={(params.output_variable as string) || "generated_markdown"}
                                onChange={(e) => handleParamChange("output_variable", e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Variable name to store the generated markdown
                            </p>
                        </div>
                    </>
                )
            }

            {
                primitiveType === "LLM_DECISION" && (
                    <>
                        <div className="space-y-2">
                            <Label>Model</Label>
                            {isLoadingModels ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading models...
                                </div>
                            ) : llmModels.length === 0 ? (
                                <Input
                                    placeholder="default"
                                    value={(params.model as string) || "default"}
                                    onChange={(e) => handleParamChange("model", e.target.value)}
                                />
                            ) : (
                                <select
                                    className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                                    value={(params.model as string) || "default"}
                                    onChange={(e) => handleParamChange("model", e.target.value)}
                                >
                                    <option value="default">Default (System Configured)</option>
                                    {llmModels.map((model) => (
                                        <option key={model.name} value={model.name}>
                                            {model.name} {model.model_name ? `(${model.model_name})` : ""}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                Instruction
                                <HelpTooltip contentPath="agent-builder/llm_decision_instruction" />
                            </Label>
                            <div className="flex gap-2">
                                <Textarea
                                    id="instruction-textarea"
                                    placeholder="Analyze the input and determine the best action..."
                                    value={(params.instruction as string) || ""}
                                    onChange={(e) => handleParamChange("instruction", e.target.value)}
                                    className="min-h-[80px]"
                                />
                            </div>

                            {/* Variable Helper for Instruction */}
                            {(() => {
                                let contextKeys: string[] = [];
                                try {
                                    if (params.input_context && typeof params.input_context === "string") {
                                        const parsed = JSON.parse(params.input_context);
                                        contextKeys = Object.keys(parsed);
                                    }
                                } catch { }

                                if (contextKeys.length > 0) {
                                    return (
                                        <div className="flex items-center gap-2">
                                            <select
                                                className="h-7 w-full text-xs rounded-md border bg-background px-2"
                                                id="instruction-var-select"
                                            >
                                                <option value="">Select Input Variable...</option>
                                                {contextKeys.map(key => (
                                                    <option key={key} value={key}>{key}</option>
                                                ))}
                                            </select>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => {
                                                    const select = document.getElementById("instruction-var-select") as HTMLSelectElement;
                                                    const textarea = document.getElementById("instruction-textarea") as HTMLTextAreaElement;
                                                    const valueToInsert = select.value;

                                                    if (valueToInsert && textarea) {
                                                        const start = textarea.selectionStart;
                                                        const end = textarea.selectionEnd;
                                                        const current = (params.instruction as string) || "";

                                                        // Wraps in Jinja2 syntax as requested
                                                        const textToInsert = `{{${valueToInsert}}}`;

                                                        const newValue = current.substring(0, start) + textToInsert + current.substring(end);

                                                        handleParamChange("instruction", newValue);

                                                        // Restore focus/cursor
                                                        setTimeout(() => {
                                                            textarea.focus();
                                                            textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
                                                        }, 0);
                                                    }
                                                }}
                                            >
                                                Insert
                                            </Button>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                Input Schema
                                <HelpTooltip contentPath="agent-builder/llm_decision_input_context" />
                            </Label>
                            <InputSchemaBuilder
                                nodeId={selectedNode?.id}
                                value={(params.input_context as string) || ""}
                                onChange={(val) => handleParamChange("input_context", val)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={(params.send_context_to_llm as boolean) !== false}
                                    onChange={(e) => handleParamChange("send_context_to_llm", e.target.checked)}
                                    className="rounded border-gray-300"
                                />
                                Send Input Context to LLM
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                If checked, the Input Schema JSON is sent as the user message. Uncheck this if you only use it for variable resolution in the instruction.
                            </p>
                        </div>
                    </>
                )
            }

            {
                primitiveType === "FOREACH" && (
                    <>
                        <div className="space-y-2">
                            <Label>Items Variable</Label>
                            <Input
                                placeholder="items"
                                value={(params.items as string) || ""}
                                onChange={(e) => handleParamChange("items", e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Iterator Variable</Label>
                            <Input
                                placeholder="item"
                                value={(params.iterator_var as string) || "item"}
                                onChange={(e) => handleParamChange("iterator_var", e.target.value)}
                            />
                        </div>
                    </>
                )
            }

            {
                primitiveType === "JSON_MAPPING" && (
                    <>
                        {/* Mapping Editor - dropdown-based field mapping */}
                        <MappingEditor
                            blueprintId={blueprintId || ""}
                            nodeId={selectedNode?.id || ""}
                            mappings={Array.isArray(params.mappings) ? params.mappings as { source: string; target: string }[] : []}
                            onMappingsChange={(newMappings) => handleParamChange("mappings", newMappings)}
                        />

                        <Separator className="my-3" />

                        {/* Advanced: Manual Source/Template */}
                        <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                Advanced: Manual JMESPath
                            </summary>
                            <div className="mt-3 space-y-3">
                                <div className="space-y-2">
                                    <Label className="text-xs">Source Variable</Label>
                                    <Input
                                        placeholder="response.data"
                                        className="h-7 text-xs"
                                        value={(params.source as string) || ""}
                                        onChange={(e) => handleParamChange("source", e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs flex items-center gap-2">
                                        JMESPath Template
                                        <HelpTooltip contentPath="agent-builder/json_mapping_template" />
                                    </Label>
                                    <Textarea
                                        placeholder="items[*].{id: id, name: name}"
                                        className="font-mono text-xs min-h-[60px]"
                                        value={
                                            typeof params.template === "object" && params.template !== null
                                                ? JSON.stringify(params.template, null, 2)
                                                : (params.template as string) || ""
                                        }
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            try {
                                                if (value.trim().startsWith("{") || value.trim().startsWith("[")) {
                                                    handleParamChange("template", JSON.parse(value));
                                                } else {
                                                    handleParamChange("template", value);
                                                }
                                            } catch {
                                                handleParamChange("template", value);
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </details>
                    </>
                )
            }

            {
                primitiveType === "END" && (
                    <>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                Output Template (JSON)
                                <HelpTooltip contentPath="agent-builder/end_node_output_template" />
                            </Label>
                            <JsonEditor
                                value={params.output_template}
                                onChange={(val) => handleParamChange("output_template", val)}
                                placeholder='{ "final_result": "{{llm_output}}" }'
                                minHeight="min-h-[100px]"
                            />
                            <p className="text-xs text-muted-foreground">
                                Define the final JSON structure. Keys are output names, values can be {"{{variable}}"} references.
                                Leave empty to return all variables.
                            </p>
                        </div>
                    </>
                )
            }

            <Separator />

            {/* Delete Button */}
            <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={onDelete}
            >
                Delete Node
            </Button>
        </div >
    );
}
