"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Play, AlertCircle, CheckCircle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, API_URL } from "@/lib/utils";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

interface RunPipelineDialogProps {
    open: boolean;
    onCancel: () => void;
    toolId: number;
    inputSchema?: Record<string, any>;
}

export function RunPipelineDialog({ open, onCancel, toolId, inputSchema }: RunPipelineDialogProps) {
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [isExecuting, setIsExecuting] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setInputValues({});
            setResult(null);
            setError(null);
            setIsExecuting(false);
        }
    }, [open]);

    // Generate input fields from schema
    const inputFields = inputSchema?.properties ? Object.entries(inputSchema.properties).map(([key, def]: [string, any]) => ({
        name: key,
        description: def.description || key,
        type: def.type || "string",
        required: (inputSchema.required as string[] || []).includes(key)
    })) : [];

    const handleRun = async () => {
        setIsExecuting(true);
        setError(null);
        setResult(null);

        try {
            // Prepare inputs with correct types
            const formattedInput: Record<string, any> = {};

            inputFields.forEach(field => {
                const value = inputValues[field.name];
                if (value === undefined || value === "") return;

                if (field.type === "integer" || field.type === "number") {
                    formattedInput[field.name] = Number(value);
                } else if (field.type === "boolean") {
                    formattedInput[field.name] = value.toLowerCase() === "true" || value === "1";
                } else {
                    formattedInput[field.name] = value;
                }
            });

            const token = localStorage.getItem("token");
            const response = await fetch(`${API_URL}/tools/${toolId}/execute-pipeline`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    input: formattedInput,
                    include_trace: true
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Execution failed");
            }

            // Check for JSON-RPC error
            if (data.result?.isError) {
                // Even if isError is true, we might have trace data if using my backend logic?
                // Wait, standard correct response wrapper puts trace inside result?
                // Let's assume result wrapper structure.
                setResult(data.result);
            } else {
                setResult(data.result);
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to execute pipeline");
        } finally {
            setIsExecuting(false);
        }
    };

    const renderTrace = (trace: any[]) => {
        if (!trace || !Array.isArray(trace) || trace.length === 0) return null;

        return (
            <div className="mt-6 space-y-2">
                <h4 className="font-medium text-sm text-slate-500 uppercase tracking-wider">Execution Trace</h4>
                <Accordion type="single" collapsible className="w-full space-y-2">
                    {trace.map((step, index) => (
                        <div key={index} className="border rounded-lg overflow-hidden">
                            <AccordionItem value={`item-${index}`} className="border-none">
                                <AccordionTrigger className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    <div className="flex items-center gap-3 w-full">
                                        {step.status === "success" ? (
                                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                        ) : step.status === "failed" ? (
                                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                        ) : (
                                            <div className="h-4 w-4 rounded-full border-2 border-slate-300" />
                                        )}
                                        <div className="text-left flex-1 min-w-0">
                                            <div className="font-medium truncate">{step.function_ref}</div>
                                            <div className="text-xs text-muted-foreground truncate font-mono">ID: {step.step_id}</div>
                                        </div>
                                        {step.error && (
                                            <span className="text-xs text-red-500 font-medium mr-2">Failed</span>
                                        )}
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="bg-slate-50 dark:bg-slate-900 border-t px-4 py-3">
                                    <div className="space-y-3 text-xs">
                                        <div>
                                            <div className="font-semibold mb-1 text-slate-500">Input Arguments:</div>
                                            <pre className="bg-white dark:bg-black p-2 rounded border overflow-auto max-h-40">
                                                {JSON.stringify(step.input, null, 2)}
                                            </pre>
                                        </div>
                                        {step.output && (
                                            <div>
                                                <div className="font-semibold mb-1 text-slate-500">Output Result:</div>
                                                <pre className="bg-white dark:bg-black p-2 rounded border overflow-auto max-h-40">
                                                    {JSON.stringify(step.output, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {step.error && (
                                            <div>
                                                <div className="font-semibold mb-1 text-red-500">Error:</div>
                                                <pre className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-2 rounded border border-red-200 dark:border-red-800 overflow-auto">
                                                    {step.error}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </div>
                    ))}
                </Accordion>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={() => onCancel()}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Execute Pipeline</DialogTitle>
                    <DialogDescription>
                        Run the full pipeline from start to finish.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-6 pt-2 pb-6">
                        {/* Input Form */}
                        {inputFields.length > 0 ? (
                            <div className="space-y-4">
                                {inputFields.map((field) => (
                                    <div key={field.name} className="space-y-1">
                                        <Label htmlFor={`run-${field.name}`}>
                                            {field.name}
                                            {field.required && <span className="text-red-500 ml-1">*</span>}
                                        </Label>
                                        <Input
                                            id={`run-${field.name}`}
                                            placeholder={field.description}
                                            value={inputValues[field.name] || ""}
                                            onChange={(e) => setInputValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                                            disabled={isExecuting}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground italic p-4 border rounded bg-slate-50 dark:bg-slate-900">
                                No inputs defined in schema.
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <div>
                                    <div className="font-semibold">Execution Failed</div>
                                    <div>{error}</div>
                                </div>
                            </div>
                        )}

                        {/* Result Display */}
                        {result && (
                            <div className="space-y-4 pt-4 border-t">
                                <div>
                                    <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                                        {result.isError ? (
                                            <XCircle className="h-5 w-5 text-red-500" />
                                        ) : (
                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                        )}
                                        Result
                                    </h3>
                                    <div className="bg-slate-50 dark:bg-slate-950 border rounded-lg p-4 font-mono text-sm overflow-auto max-h-60">
                                        {/* Result content array from JSON-RPC */}
                                        {result.content && Array.isArray(result.content)
                                            ? result.content.map((c: any, i: number) => (
                                                <div key={i}>
                                                    {c.type === 'text' ? (
                                                        <pre className="whitespace-pre-wrap">{c.text}</pre>
                                                    ) : (
                                                        JSON.stringify(c)
                                                    )}
                                                </div>
                                            ))
                                            : JSON.stringify(result, null, 2)
                                        }
                                    </div>
                                </div>

                                {renderTrace(result._execution_trace)}
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="gap-2 sm:gap-0 mt-auto pt-4 border-t">
                    <Button variant="outline" onClick={onCancel} disabled={isExecuting}>
                        Close
                    </Button>
                    <Button onClick={handleRun} disabled={isExecuting || (inputFields.length > 0 && inputFields.some(f => f.required && !inputValues[f.name]))}>
                        {isExecuting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Executing...
                            </>
                        ) : (
                            <>
                                <Play className="mr-2 h-4 w-4" />
                                Run Pipeline
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
