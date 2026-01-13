"use client";

/**
 * Tool Tester Component
 *
 * Provides a UI to test MCP tools with dynamic input forms,
 * execution, logs, and output display.
 */
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Play,
    Loader2,
    CheckCircle,
    XCircle,
    ChevronDown,
    ChevronUp,
    Terminal,
} from "lucide-react";
import { cn, API_URL } from "@/lib/utils";


// Interface for property schema
interface PropertySchema {
    type?: string;
    description?: string;
    default?: unknown;
}

// Interface for MCP function schema
interface MCPFunction {
    name: string;
    description?: string;
    inputSchema?: {
        type?: string;
        properties?: Record<string, PropertySchema>;
        required?: string[];
    };
}

interface ToolTesterProps {
    toolId: number | null;
    selectedFunctions: MCPFunction[];
    toolName?: string;
    toolInputSchema?: {
        type?: string;
        properties?: Record<string, PropertySchema>;
        required?: string[];
    };
    onExecutionComplete?: (result: Record<string, unknown>) => void;
}

interface ExecutionLog {
    id: string;
    timestamp: Date;
    type: "info" | "success" | "error" | "request" | "response";
    message: string;
    data?: unknown;
}

export function ToolTester({
    toolId,
    selectedFunctions,
    toolName,
    toolInputSchema,
    onExecutionComplete,
}: ToolTesterProps) {
    // State
    const [selectedFunction, setSelectedFunction] = useState<string>(
        selectedFunctions[0]?.name || ""
    );
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [isExecuting, setIsExecuting] = useState(false);
    const [logs, setLogs] = useState<ExecutionLog[]>([]);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);

    // Prefer tool's input_schema over individual function schemas
    // This is the schema for pipeline input parameters
    const inputSchema = toolInputSchema || selectedFunctions.find(
        (f) => f.name === selectedFunction
    )?.inputSchema;
    const properties: Record<string, PropertySchema> = inputSchema?.properties || {};
    const requiredFields = inputSchema?.required || [];

    // Add a log entry
    const addLog = (
        type: ExecutionLog["type"],
        message: string,
        data?: unknown
    ) => {
        setLogs((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                type,
                message,
                data,
            },
        ]);
    };

    // Clear logs and results
    const clearResults = () => {
        setLogs([]);
        setResult(null);
        setError(null);
    };

    // Deep parse nested JSON strings for better display
    const formatOutput = (data: unknown): unknown => {
        if (typeof data === "string") {
            // Try to parse string as JSON
            try {
                const parsed = JSON.parse(data);
                return formatOutput(parsed);
            } catch {
                return data;
            }
        }
        if (Array.isArray(data)) {
            return data.map(formatOutput);
        }
        if (data && typeof data === "object") {
            const formatted: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(data)) {
                formatted[key] = formatOutput(value);
            }
            return formatted;
        }
        return data;
    };

    // Extract meaningful content from MCP response
    const extractContent = (data: unknown): string => {
        try {
            const formatted = formatOutput(data);

            // Try to extract text content from MCP response structure
            if (formatted && typeof formatted === "object") {
                const obj = formatted as Record<string, unknown>;

                // Check for nested result.content[0].text pattern
                if (obj.result && typeof obj.result === "object") {
                    const result = obj.result as Record<string, unknown>;
                    if (Array.isArray(result.content)) {
                        const textItems = result.content
                            .filter((c: unknown) => {
                                const item = c as Record<string, unknown>;
                                return item?.type === "text" && item?.text;
                            })
                            .map((c: unknown) => {
                                const item = c as Record<string, unknown>;
                                const text = item?.text;
                                // If text is a string, try to parse it as JSON for better formatting
                                if (typeof text === "string") {
                                    try {
                                        const parsed = JSON.parse(text);
                                        return JSON.stringify(parsed, null, 2);
                                    } catch {
                                        return text;
                                    }
                                }
                                return typeof text === "object"
                                    ? JSON.stringify(text, null, 2)
                                    : String(text);
                            });

                        if (textItems.length > 0) {
                            return textItems.join("\n\n");
                        }
                    }
                }
            }

            // Default: stringify the formatted output
            return JSON.stringify(formatted, null, 2);
        } catch (e) {
            // Fallback for any errors
            return JSON.stringify(data, null, 2);
        }
    };

    // Handle input change
    const handleInputChange = (field: string, value: string) => {
        setInputValues((prev) => ({ ...prev, [field]: value }));
    };

    // Execute the tool pipeline (not just a single function)
    const handleExecute = async () => {
        if (!toolId) {
            setError("No tool selected");
            return;
        }

        setIsExecuting(true);
        setError(null);
        setResult(null);
        clearResults();

        // Build arguments object, parsing JSON values where needed
        const args: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(inputValues)) {
            // Skip empty values for non-required fields
            if (!value && !requiredFields.includes(key)) {
                continue;
            }

            // Try to parse as JSON for complex types, otherwise use as string
            const propType = properties[key]?.type;
            if (propType === "number" || propType === "integer") {
                args[key] = parseFloat(value) || 0;
            } else if (propType === "boolean") {
                args[key] = value.toLowerCase() === "true";
            } else if (propType === "object" || propType === "array") {
                try {
                    args[key] = JSON.parse(value);
                } catch {
                    args[key] = value;
                }
            } else {
                args[key] = value;
            }
        }

        addLog("request", `Executing tool pipeline`, args);

        try {
            const token = localStorage.getItem("token");

            // Call the pipeline execution endpoint instead of single function
            const response = await fetch(
                `${API_URL}/tools/${toolId}/execute-pipeline`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        input: args,  // Pipeline expects {input: {...}}
                        id: 1
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                const errorMsg = data.detail || "Execution failed";
                addLog("error", errorMsg);
                setError(errorMsg);
            } else {
                addLog("response", "Pipeline execution completed", data);
                setResult(data);

                // Check for errors in result
                if (data?.error) {
                    addLog("error", data.error);
                    setError(data.error);
                } else if (data?.result?.isError) {
                    const errorText =
                        data.result?.content?.[0]?.text || "Tool returned error";
                    addLog("error", errorText);
                    setError(errorText);
                } else {
                    addLog("success", "Pipeline executed successfully");
                    onExecutionComplete?.(data);
                }
            }
        } catch (err) {
            const errorMsg =
                err instanceof Error ? err.message : "Network error";
            addLog("error", errorMsg);
            setError(errorMsg);
        } finally {
            setIsExecuting(false);
        }
    };

    // Render input field based on type
    const renderInputField = (
        fieldName: string,
        schema: PropertySchema
    ): React.ReactNode => {
        const isRequired = requiredFields.includes(fieldName);
        const fieldType = schema.type || "string";
        const placeholder = schema.description || `Enter ${fieldName}`;

        return (
            <div key={fieldName} className="space-y-1">
                <Label htmlFor={fieldName} className="text-xs flex items-center gap-1">
                    {fieldName}
                    {isRequired && (
                        <span className="text-red-500 text-xs">*</span>
                    )}
                    <span className="text-muted-foreground font-normal">
                        ({fieldType})
                    </span>
                </Label>
                {fieldType === "object" || fieldType === "array" ? (
                    <Textarea
                        id={fieldName}
                        placeholder={placeholder}
                        value={inputValues[fieldName] || ""}
                        onChange={(e) =>
                            handleInputChange(fieldName, e.target.value)
                        }
                        className="font-mono text-xs h-20"
                    />
                ) : (
                    <Input
                        id={fieldName}
                        type={
                            fieldType === "number" || fieldType === "integer"
                                ? "number"
                                : "text"
                        }
                        placeholder={placeholder}
                        value={inputValues[fieldName] || ""}
                        onChange={(e) =>
                            handleInputChange(fieldName, e.target.value)
                        }
                        className="h-8 text-sm"
                    />
                )}
                {schema.description && (
                    <p className="text-xs text-muted-foreground">
                        {schema.description}
                    </p>
                )}
            </div>
        );
    };

    // Get log icon
    const getLogIcon = (type: ExecutionLog["type"]) => {
        switch (type) {
            case "success":
                return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
            case "error":
                return <XCircle className="h-3.5 w-3.5 text-red-500" />;
            case "request":
                return <Play className="h-3.5 w-3.5 text-blue-500" />;
            case "response":
                return <Terminal className="h-3.5 w-3.5 text-purple-500" />;
            default:
                return <Terminal className="h-3.5 w-3.5 text-slate-400" />;
        }
    };

    // Don't render if no tool or functions
    if (!toolId) {
        return (
            <div className="p-4 text-center text-muted-foreground text-sm border rounded-lg bg-slate-50 dark:bg-slate-900">
                Save the tool first to enable testing
            </div>
        );
    }

    if (selectedFunctions.length === 0) {
        return (
            <div className="p-4 text-center text-muted-foreground text-sm border rounded-lg bg-slate-50 dark:bg-slate-900">
                Select at least one MCP function to test
            </div>
        );
    }

    return (
        <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-950">
            {/* Header */}
            <div
                className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 border-b cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                        Test Tool{toolName ? `: ${toolName}` : ""}
                    </span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {isExpanded && (
                <div className="p-4 space-y-4">
                    {/* Function selector - hidden when using pipeline (toolInputSchema is set) */}
                    {!toolInputSchema && selectedFunctions.length > 1 && (
                        <div className="space-y-1">
                            <Label className="text-xs">Function</Label>
                            <Select
                                value={selectedFunction}
                                onValueChange={(value) => {
                                    setSelectedFunction(value);
                                    setInputValues({});
                                    clearResults();
                                }}
                            >
                                <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Select function" />
                                </SelectTrigger>
                                <SelectContent>
                                    {selectedFunctions.map((func) => (
                                        <SelectItem
                                            key={func.name}
                                            value={func.name}
                                        >
                                            {func.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Function description - show selected function desc if no tool input schema */}
                    {!toolInputSchema && selectedFunctions.find(f => f.name === selectedFunction)?.description && (
                        <p className="text-xs text-muted-foreground bg-slate-50 dark:bg-slate-900 p-2 rounded">
                            {selectedFunctions.find(f => f.name === selectedFunction)?.description}
                        </p>
                    )}

                    {/* Input fields */}
                    {Object.keys(properties).length > 0 ? (
                        <div className="space-y-3">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Input Parameters
                            </Label>
                            {(Object.entries(properties) as [string, PropertySchema][]).map(
                                ([name, schema]) => renderInputField(name, schema)
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground italic">
                            This function has no input parameters
                        </p>
                    )}

                    {/* Execute button */}
                    <div className="flex justify-end">
                        <Button
                            onClick={handleExecute}
                            disabled={isExecuting}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {isExecuting ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Play className="h-4 w-4 mr-2" />
                            )}
                            Execute
                        </Button>
                    </div>

                    {/* Logs */}
                    {logs.length > 0 && (
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Execution Log
                            </Label>
                            <ScrollArea className="h-32 border rounded p-2 bg-slate-50 dark:bg-slate-900">
                                <div className="space-y-1">
                                    {logs.map((log) => (
                                        <div
                                            key={log.id}
                                            className={cn(
                                                "flex items-start gap-2 text-xs font-mono p-1 rounded",
                                                log.type === "error" &&
                                                "bg-red-50 dark:bg-red-900/20",
                                                log.type === "success" &&
                                                "bg-green-50 dark:bg-green-900/20"
                                            )}
                                        >
                                            {getLogIcon(log.type)}
                                            <span className="text-muted-foreground">
                                                {log.timestamp.toLocaleTimeString()}
                                            </span>
                                            <span className="flex-1">
                                                {log.message}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}

                    {/* Error display */}
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                                <XCircle className="h-4 w-4" />
                                <span className="text-sm font-medium">
                                    Error
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                {error}
                            </p>
                        </div>
                    )}

                    {/* Result display */}
                    {result && !error && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                    Output
                                </Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => {
                                        navigator.clipboard.writeText(extractContent(result));
                                    }}
                                >
                                    Copy
                                </Button>
                            </div>
                            <div className="border rounded bg-slate-50 dark:bg-slate-900 max-h-96 overflow-auto">
                                <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words">
                                    {extractContent(result)}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
