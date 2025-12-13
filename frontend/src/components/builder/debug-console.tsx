"use client";

/**
 * Debug Console Component
 *
 * Bottom panel with test input editor, run button, and execution trace.
 * Supports GUI tool input prompts during execution.
 */
import { useState, useRef } from "react";
import {
    Play,
    Trash2,
    ChevronUp,
    ChevronDown,
    CheckCircle,
    XCircle,
    Loader2,
    Terminal,
    AlertCircle,
    FormInput,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBuilderStore } from "@/lib/builder-store";
import { cn } from "@/lib/utils";

// Type for GUI schema field
interface GUISchemaField {
    id: string;
    type: string;
    label?: string;
    title?: string; // GUI tools use 'title' instead of 'label'
    placeholder?: string;
    required?: boolean;
}

interface GUISchema {
    title?: string;
    fields?: GUISchemaField[];
    components?: GUISchemaField[]; // GUI form builder uses 'components'
    tool_type?: string;
}

// Component to render GUI input form
function GUIInputForm({
    schema,
    toolId,
    toolName,
    description,
    onSubmit
}: {
    schema: GUISchema;
    toolId?: number | string;  // Tool ID for marker
    toolName: string;
    description?: string;
    onSubmit: (values: Record<string, string>, toolId?: number | string) => void;
}) {
    const [values, setValues] = useState<Record<string, string>>({});

    // Debug: log schema to console
    console.log("[GUIInputForm] Schema received:", schema);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("[GUIInputForm] Submitting values:", values, "for tool:", toolId);
        onSubmit(values, toolId);
    };

    // Get fields array, handling different possible structures
    // GUI form builder uses 'components', backend schema uses 'fields'
    const fields = schema.fields || schema.components || [];

    return (
        <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 mb-2">
                <FormInput className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-amber-800 dark:text-amber-200">
                    {toolName}: Input Required
                </span>
            </div>
            {description && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                    {description}
                </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
                {fields.length > 0 ? (
                    fields.map((field) => (
                        <div key={field.id} className="space-y-1">
                            <Label htmlFor={field.id} className="text-xs">
                                {field.title || field.label || field.id}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            <Input
                                id={field.id}
                                type={field.type === "number" ? "number" : "text"}
                                placeholder={field.placeholder}
                                value={values[field.id] || ""}
                                onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                                className="h-8 text-xs"
                                required={field.required}
                            />
                        </div>
                    ))
                ) : (
                    /* Fallback: single generic input if no fields defined */
                    <div className="space-y-1">
                        <Label htmlFor="user_input" className="text-xs">
                            Your input
                        </Label>
                        <Input
                            id="user_input"
                            type="text"
                            placeholder="Enter your response..."
                            value={values["user_input"] || ""}
                            onChange={(e) => setValues({ ...values, "user_input": e.target.value })}
                            className="h-8 text-xs"
                        />
                    </div>
                )}
                <Button type="submit" size="sm" className="h-7 bg-amber-600 hover:bg-amber-700">
                    Submit & Continue
                </Button>
            </form>
        </div>
    );
}

export function DebugConsole() {
    const [isExpanded, setIsExpanded] = useState(true);
    const [inputJson, setInputJson] = useState("{}");
    const [inputError, setInputError] = useState<string | null>(null);
    const [panelHeight, setPanelHeight] = useState(192); // Default h-48 = 192px
    const isResizing = useRef(false);

    // Handle vertical resize mouse events
    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", stopResize);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        // Calculate new height based on mouse position from bottom edge
        const newHeight = window.innerHeight - e.clientY;
        // Clamp between min (100px) and max (500px)
        setPanelHeight(Math.max(100, Math.min(500, newHeight)));
    };

    const stopResize = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", stopResize);
    };

    const blueprintId = useBuilderStore((state) => state.blueprintId);
    const isExecuting = useBuilderStore((state) => state.isExecuting);
    const consoleLogs = useBuilderStore((state) => state.consoleLogs);
    const testInputs = useBuilderStore((state) => state.testInputs);
    const executeWithStream = useBuilderStore((state) => state.executeWithStream);
    const setTestInputs = useBuilderStore((state) => state.setTestInputs);
    const clearConsoleLogs = useBuilderStore((state) => state.clearConsoleLogs);
    const toggleConsole = useBuilderStore((state) => state.toggleConsole);
    const addConsoleLog = useBuilderStore((state) => state.addConsoleLog);

    const handleRun = () => {
        try {
            const inputs = JSON.parse(inputJson);
            setInputError(null);
            setTestInputs(inputs);
            executeWithStream();
        } catch {
            setInputError("Invalid JSON");
        }
    };

    // Handle GUI form submission
    const handleGUISubmit = (guiValues: Record<string, string>, toolId?: number | string) => {
        // Create the marker that the backend expects: _gui_submitted_for_<tool_id>
        const marker = toolId ? `_gui_submitted_for_${toolId}` : "_gui_submitted";

        // Set the marker with the actual form values
        const newInputs = {
            ...testInputs,
            [marker]: guiValues  // Backend will look for this marker with values
        };
        setTestInputs(newInputs);
        setInputJson(JSON.stringify(newInputs, null, 2));
        addConsoleLog("info", `GUI input received for tool ${toolId}, continuing execution...`, guiValues);
        // Auto-resume: backend will now find the marker and continue
        setTimeout(() => executeWithStream(), 100);
    };

    const getLogIcon = (type: string) => {
        switch (type) {
            case "success":
                return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
            case "error":
                return <XCircle className="h-3.5 w-3.5 text-red-500" />;
            case "step":
                return <Play className="h-3.5 w-3.5 text-blue-500" />;
            default:
                return <Terminal className="h-3.5 w-3.5 text-slate-400" />;
        }
    };

    // Check if log data contains GUI input request
    const isGUIInputRequired = (data: unknown): data is {
        type: string;
        gui_schema: GUISchema;
        tool_id?: number | string;
        tool_name?: string;
        description?: string;
    } => {
        if (!data || typeof data !== "object") return false;
        const d = data as Record<string, unknown>;
        return d.type === "gui_input_required" && !!d.gui_schema;
    };

    return (
        <div className="border-t bg-white dark:bg-slate-950 shrink-0 relative">
            {/* Resize handle on top edge */}
            <div
                className="absolute left-0 right-0 top-0 h-1 cursor-ns-resize hover:bg-blue-500/50 transition-colors z-10"
                onMouseDown={startResize}
            />
            {/* Header */}
            <div className="flex items-center justify-between h-10 px-4 border-b bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Debug Console</span>
                    {consoleLogs.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            ({consoleLogs.length} entries)
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={clearConsoleLogs}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronUp className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={toggleConsole}
                    >
                        <XCircle className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Body */}
            {isExpanded && (
                <div className="flex" style={{ height: panelHeight }}>
                    {/* Test Input */}
                    <div className="w-80 border-r p-3 flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium">Test Input (JSON)</span>
                            <Button
                                size="sm"
                                className="h-7 bg-green-600 hover:bg-green-700"
                                onClick={handleRun}
                                disabled={isExecuting || !blueprintId}
                            >
                                {isExecuting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                ) : (
                                    <Play className="h-3.5 w-3.5 mr-1" />
                                )}
                                Run
                            </Button>
                        </div>
                        <Textarea
                            className="flex-1 font-mono text-xs resize-none"
                            value={inputJson}
                            onChange={(e) => setInputJson(e.target.value)}
                            placeholder='{"key": "value"}'
                        />
                        {inputError && (
                            <div className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {inputError}
                            </div>
                        )}
                        {!blueprintId && (
                            <div className="mt-1 text-xs text-amber-500">
                                Save blueprint before running
                            </div>
                        )}
                    </div>

                    {/* Execution Trace */}
                    <ScrollArea className="flex-1 p-3">
                        {consoleLogs.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                No logs yet. Click Run to execute the blueprint.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {consoleLogs.map((log) => (
                                    <div
                                        key={log.id}
                                        className={cn(
                                            "flex items-start gap-2 text-xs font-mono p-2 rounded",
                                            log.type === "error" && "bg-red-50 dark:bg-red-900/20",
                                            log.type === "success" && "bg-green-50 dark:bg-green-900/20",
                                            log.type === "step" && "bg-blue-50 dark:bg-blue-900/20",
                                            log.type === "info" && "bg-slate-50 dark:bg-slate-800"
                                        )}
                                    >
                                        {getLogIcon(log.type)}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">
                                                    {log.timestamp.toLocaleTimeString()}
                                                </span>
                                                <span>{log.message}</span>
                                            </div>
                                            {/* Check if this is a GUI input request */}
                                            {isGUIInputRequired(log.data) ? (
                                                <GUIInputForm
                                                    schema={log.data.gui_schema}
                                                    toolId={log.data.tool_id}
                                                    toolName={log.data.tool_name || "GUI Tool"}
                                                    description={log.data.description}
                                                    onSubmit={handleGUISubmit}
                                                />
                                            ) : (
                                                log.data !== undefined && log.data !== null && (
                                                    <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto max-w-full">
                                                        {String(JSON.stringify(log.data, null, 2))}
                                                    </pre>
                                                )
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            )}
        </div>
    );
}

