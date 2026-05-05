
import * as React from "react";
import { Play, RotateCcw, Loader2, ArrowRight, CheckCircle2, AlertCircle, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBuilderStore } from "@/lib/builder-store";
import { cn } from "@/lib/utils";
import { FormRenderer } from "@/components/tools/form-builder/form-renderer";
import { WidgetConfig } from "@/components/tools/form-builder/widget-palette";
import { ScrollArea } from "@/components/ui/scroll-area";

export function DryRunPanel() {
    const {
        isExecuting,
        testInputs,
        setTestInputs,
        startDryRunStep,
        nextDryRunStep,
        submitDryRunInput,
        inputsSchema,
        executionSteps,
        clearExecution,
        lastExecutionState,
        executionStatus,
        waitingNodeInfo,
        activeNodeId,
        nodes,
        isDirty,
        saveBlueprint
    } = useBuilderStore();

    const [jsonError, setJsonError] = React.useState<string | null>(null);
    const [formValues, setFormValues] = React.useState<Record<string, any>>({});
    const [isOpen, setIsOpen] = React.useState(false);
    const [executionError, setExecutionError] = React.useState<string | null>(null);
    const [showSaveWarning, setShowSaveWarning] = React.useState(false);
    const [expandedOutput, setExpandedOutput] = React.useState<{ nodeLabel: string; data: unknown } | null>(null);

    // Initialize test inputs from schema if empty
    React.useEffect(() => {
        if (Object.keys(testInputs).length === 0 && inputsSchema) {
            const defaults: Record<string, any> = {};
            const props = (inputsSchema as any).properties || {};
            for (const key of Object.keys(props)) {
                defaults[key] = ""; // Default empty string
            }
            if (Object.keys(defaults).length > 0) {
                setTestInputs(defaults);
            }
        }
    }, [inputsSchema, testInputs, setTestInputs]);

    React.useEffect(() => {
        const schema = waitingNodeInfo?.schema as any;
        const components = schema?.components || schema?.widgets || [];
        const initialBackendValues = (waitingNodeInfo as any)?.initial_values || {};

        console.log("[DryRunPanel] Schema Update:", {
            waitingNodeInfo,
            initialBackendValues,
            componentsLength: components.length
        });

        // Initialize with ALL backend values (to keep hidden variables like dynamic lists),
        // then ensure all widgets have at least a null value if missing.
        const initialValues: Record<string, any> = { ...initialBackendValues };

        if (Array.isArray(components)) {
            components.forEach((comp: any) => {
                if (comp.id && initialValues[comp.id] === undefined) {
                    initialValues[comp.id] = null;
                }
            });
        }
        setFormValues(initialValues);
    }, [waitingNodeInfo?.waitingNodeId, waitingNodeInfo?.schema]);

    const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        try {
            const parsed = JSON.parse(val);
            setTestInputs(parsed);
            setJsonError(null);
        } catch (err: any) {
            setJsonError(err.message);
        }
    };

    const [previewNode, setPreviewNode] = React.useState<any>(null);

    const handleStart = async () => {
        if (jsonError) return;

        // Check for unsaved changes
        if (isDirty) {
            setShowSaveWarning(true);
            return;
        }

        setExecutionError(null); // Clear previous errors
        await startDryRunStep();
    };

    const handleSaveAndStart = async () => {
        setShowSaveWarning(false);
        await saveBlueprint();
        setExecutionError(null);
        await startDryRunStep();
    };

    const handleNext = async () => {


        // DEBUG LOGS
        const storeState = useBuilderStore.getState();
        console.log("[DryRun] handleNext called", {
            activeNodeId,
            nodesCount: nodes.length,
            edgesCount: storeState.edges.length,
            executionStepsCount: executionSteps.length
        });

        // Predictive Logic: Determine the next node
        if (activeNodeId) {
            const currentNode = nodes.find(n => n.id === activeNodeId);
            const outgoingEdges = storeState.edges.filter(e => e.source === activeNodeId);

            console.log("[DryRun] Current Node Analysis", { currentNode, outgoingEdges });

            let targetNodeId: string | null = null;

            // Handle Condition Nodes
            if (currentNode?.data?.primitiveType === "CONDITION") {
                const lastOutput = executionSteps[executionSteps.length - 1]?.output_data;
                if (lastOutput && typeof lastOutput === 'object' && 'result' in lastOutput) {
                    const result = String(lastOutput.result); // "true" or "false"
                    const matchingEdge = outgoingEdges.find(e => e.data?.condition === result);
                    if (matchingEdge) targetNodeId = matchingEdge.target;
                }
            } else {
                // Linear flow: take the first edge
                if (outgoingEdges.length > 0) {
                    targetNodeId = outgoingEdges[0].target;
                }
            }
        }

        // Standard behavior
        console.log("[DryRun] Proceeding with standard execution");
        await nextDryRunStep();
    };

    const handleConfirmPreview = async () => {
        setPreviewNode(null);
        await nextDryRunStep();
    };

    const handleSubmitForm = async () => {
        await submitDryRunInput(formValues);
    };

    const handleRestart = () => {
        clearExecution();
        setExecutionError(null);
    };

    const lastStep = executionSteps.length > 0 ? executionSteps[executionSteps.length - 1] : null;
    const isPaused = executionStatus === "paused";
    const isWaiting = executionStatus === "waiting_for_input";
    const isCompleted = executionStatus === "completed";
    const isFailed = executionStatus === "failed";

    return (
        <>
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Play className="h-4 w-4" />
                        Dry Run
                    </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px] flex flex-col gap-0 h-full">
                    <SheetHeader className="pb-4 border-b">
                        <SheetTitle>Interactive Dry Run</SheetTitle>
                        <SheetDescription>
                            Step through your agent's execution, interact with GUI tools, and map outputs.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto py-6 space-y-6">
                        {/* Initial State: Not Started or PENDING */}
                        {(!executionStatus || executionStatus === "pending") && (
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <Label>Start Inputs (JSON)</Label>
                                    
                                    {/* Structural Warning */}
                                    {(() => {
                                        const schemaType = (inputsSchema as any)?.type || "object";
                                        const isArrayInput = Array.isArray(testInputs);
                                        
                                        if (schemaType === "object" && isArrayInput) {
                                            return (
                                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800 space-y-2 animate-in fade-in slide-in-from-top-1">
                                                    <div className="flex items-center gap-2 font-bold uppercase">
                                                        <AlertCircle className="w-4 h-4" /> Structural Mismatch
                                                    </div>
                                                    <p>
                                                        Your schema expects an <b>Object</b>, but you provided an <b>Array</b>. 
                                                        The agent needs a variable name to store this list.
                                                    </p>
                                                    <div className="bg-white/50 p-2 rounded font-mono text-[10px] border border-amber-100">
                                                        {`{ "batch": [...] }`}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}

                                    <div className="relative">
                                        <Textarea
                                            className={cn(
                                                "font-mono text-xs min-h-[150px]",
                                                (jsonError || (Array.isArray(testInputs) && (inputsSchema as any)?.type !== "array")) && "border-amber-500 focus-visible:ring-amber-500"
                                            )}
                                            defaultValue={JSON.stringify(testInputs, null, 2)}
                                            onChange={handleJsonChange}
                                            placeholder='{ "input": "value" }'
                                        />
                                        {jsonError && (
                                            <span className="text-xs text-red-500 absolute -bottom-5 left-0">
                                                {jsonError}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    onClick={handleStart}
                                    disabled={isExecuting || !!jsonError || (Array.isArray(testInputs) && (inputsSchema as any)?.type === "object")}
                                    className="w-full"
                                >
                                    {isExecuting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Running...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="mr-2 h-4 w-4" />
                                            Start Execution
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}

                        {/* Active State View */}
                        {executionStatus && executionStatus !== "pending" && (
                            <div className="space-y-6">

                                {/* Status Banner */}
                                <div className={cn(
                                    "flex items-center gap-3 p-4 rounded-lg border",
                                    isExecuting ? "bg-blue-50 border-blue-200" :
                                        isWaiting ? "bg-amber-50 border-amber-200" :
                                            isCompleted ? "bg-green-50 border-green-200" :
                                                isFailed ? "bg-red-50 border-red-200" :
                                                    "bg-slate-50 border-slate-200"
                                )}>
                                    {isExecuting ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> :
                                        isWaiting ? <AlertCircle className="h-5 w-5 text-amber-600" /> :
                                            isCompleted ? <CheckCircle2 className="h-5 w-5 text-green-600" /> :
                                                isFailed ? <AlertCircle className="h-5 w-5 text-red-600" /> :
                                                    <Play className="h-5 w-5 text-slate-600" />}

                                    <div className="flex-1">
                                        <p className="font-medium text-sm">
                                            {isExecuting ? "Executing Step..." :
                                                isWaiting ? "Action Required" :
                                                    isCompleted ? "Execution Completed" :
                                                        isFailed ? "Execution Failed" :
                                                            `Paused at ${activeNodeId}`}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {executionSteps.length} steps executed
                                        </p>
                                    </div>

                                    {!isExecuting && (
                                        <Button variant="ghost" size="icon" onClick={handleRestart} title="Restart">
                                            <RotateCcw className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>

                                {/* Execution History - All Steps with Details */}
                                {executionSteps.length > 0 && (
                                    <details className="group" open>
                                        <summary className="cursor-pointer flex items-center justify-between py-2 px-3 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                            <span className="font-medium text-sm">Execution History ({executionSteps.length} steps)</span>
                                            <span className="text-xs text-muted-foreground group-open:hidden">Click to expand</span>
                                            <span className="text-xs text-muted-foreground hidden group-open:inline">Click to collapse</span>
                                        </summary>
                                        <div className="mt-2 space-y-3 max-h-[400px] overflow-y-auto">
                                            {executionSteps.map((step, idx) => (
                                                <div key={step.node_id + idx} className="border rounded-lg overflow-hidden">
                                                    {/* Step Header */}
                                                    <div className={cn(
                                                        "flex items-center gap-2 p-2 text-sm",
                                                        step.status === "completed" ? "bg-green-50 dark:bg-green-900/20" :
                                                            step.status === "failed" ? "bg-red-50 dark:bg-red-900/20" :
                                                                "bg-blue-50 dark:bg-blue-900/20"
                                                    )}>
                                                        {step.status === "completed" ?
                                                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> :
                                                            step.status === "failed" ?
                                                                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" /> :
                                                                <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />}
                                                        <span className="font-medium text-xs flex-1">{step.node_label || step.node_id}</span>
                                                        <span className="text-xs text-muted-foreground">{step.node_type}</span>
                                                        {step.duration_ms && (
                                                            <span className="text-xs text-muted-foreground">{step.duration_ms}ms</span>
                                                        )}
                                                    </div>

                                                    {/* Step Output - Always Visible */}
                                                    <div className="p-2 border-t bg-white dark:bg-slate-900 space-y-2">
                                                        {step.output_data && Object.keys(step.output_data).length > 0 ? (
                                                            <div>
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-xs font-medium text-slate-500">Output:</span>
                                                                    <button
                                                                        onClick={() => setExpandedOutput({
                                                                            nodeLabel: step.node_label || step.node_id,
                                                                            data: step.output_data
                                                                        })}
                                                                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                                        title="Expand output"
                                                                    >
                                                                        <Maximize2 className="h-3 w-3 text-slate-500" />
                                                                    </button>
                                                                </div>
                                                                <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-x-auto max-h-[80px] overflow-y-auto">
                                                                    {JSON.stringify(step.output_data, null, 2)}
                                                                </pre>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic">No output data</span>
                                                        )}
                                                        {step.error && (
                                                            <div>
                                                                <span className="text-xs font-medium text-red-500 block mb-1">Error:</span>
                                                                <pre className="text-xs font-mono bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-400">
                                                                    {step.error}
                                                                </pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                )}

                                {/* Step Result / Output */}
                                {!waitingNodeInfo && lastStep && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label>Current Output ({lastStep.node_id})</Label>
                                            <span className="text-xs text-muted-foreground">{lastStep.node_type}</span>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-md border text-xs font-mono overflow-auto max-h-[200px]">
                                            {JSON.stringify(lastStep.output_data, null, 2)}
                                        </div>
                                        {lastExecutionState && (
                                            <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded flex gap-2 items-start">
                                                <CheckCircle2 className="h-3 w-3 mt-0.5" />
                                                <div>
                                                    Variables captured. You can close this panel to use the <strong>Variable Picker</strong> in any node's inspector, then re-open to continue.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Control Buttons (Next Step) */}
                                {isPaused && (
                                    <div className="flex flex-col gap-2">
                                        {/* Instruction Preview (for LLM Decision Nodes) */}
                                        {(() => {
                                            const currentNode = activeNodeId ? nodes.find(n => n.id === activeNodeId) : null;
                                            if (currentNode?.data?.primitiveType === "LLM_DECISION") {
                                                const params = currentNode.data.params as any;
                                                const instruction = params.instruction || "";

                                                // Helper function to resolve dot/bracket notation with FUZZY matching
                                                const resolveValue = (path: string, scope: any): any => {
                                                    if (!scope) return undefined;
                                                    console.log(`[SidebarPreview resolveValue] Path: ${path}, Scope keys: ${Object.keys(scope).slice(0, 5).join(', ')}...`);

                                                    // 1. Direct match first (fast path)
                                                    if (scope[path] !== undefined) {
                                                        console.log(`[SidebarPreview resolveValue] Direct match found for '${path}'`);
                                                        return scope[path];
                                                    }

                                                    // 2. Parse Root Variable and Accessors
                                                    const complexMatch = path.match(/^([a-zA-Z0-9_\-]+)(.*)$/);
                                                    if (!complexMatch) return undefined;

                                                    let [_, rootVar, accessors] = complexMatch;
                                                    console.log(`[SidebarPreview resolveValue] Root: '${rootVar}', Accessors: '${accessors}'`);

                                                    // 3. Find Root Variable (Fuzzy Match)
                                                    let current = scope[rootVar];

                                                    if (current === undefined) {
                                                        // Fuzzy Search: Normalize both and compare
                                                        const normalizedRoot = rootVar.replace(/[_\-]/g, '').toLowerCase();
                                                        const matchingKey = Object.keys(scope).find(k =>
                                                            k.replace(/[_\-]/g, '').toLowerCase() === normalizedRoot
                                                        );
                                                        if (matchingKey) {
                                                            console.log(`[SidebarPreview resolveValue] Fuzzy match: '${rootVar}' -> '${matchingKey}'`);
                                                            current = scope[matchingKey];
                                                        }
                                                    }

                                                    if (current === undefined) {
                                                        console.log(`[SidebarPreview resolveValue] Root var '${rootVar}' not found`);
                                                        return undefined;
                                                    }

                                                    // 4. Process Accessors
                                                    const accessorRegex = /\[['"]([^'"]+)['"]\]|\.([a-zA-Z0-9_\-]+)/g;
                                                    let match;
                                                    while ((match = accessorRegex.exec(accessors)) !== null) {
                                                        if (current === undefined) break;
                                                        const prop = match[1] || match[2];
                                                        console.log(`[SidebarPreview resolveValue] Accessing prop '${prop}' on current: ${typeof current}`);
                                                        current = current[prop];
                                                    }

                                                    console.log(`[SidebarPreview resolveValue] Final value: ${current}`);
                                                    return current;
                                                };

                                                const resolveTemplate = (text: string, context: any) => {
                                                    if (!text) return "";
                                                    console.log(`[SidebarPreview resolveTemplate] Input: ${text.substring(0, 80)}...`);
                                                    const result = text.replace(/\{\{([^}]+)\}\}/g, (match: string, variable: string) => {
                                                        const key = variable.trim();
                                                        const val = resolveValue(key, context);
                                                        if (val !== undefined && typeof val === 'object') return JSON.stringify(val);
                                                        return val !== undefined ? String(val) : match;
                                                    });
                                                    console.log(`[SidebarPreview resolveTemplate] Result: ${result.substring(0, 80)}...`);
                                                    return result;
                                                };

                                                // 1. Prepare Global Context
                                                const globalVars = lastExecutionState?.variables || {};

                                                // 2. Process Input Context
                                                let localContext = {};
                                                try {
                                                    const rawContextTemplate = params.input_context || "{}";
                                                    // Log raw context
                                                    console.log("[SidebarPreview] Raw Input Context Template:", rawContextTemplate);

                                                    const resolvedContextStr = resolveTemplate(rawContextTemplate, globalVars);
                                                    console.log("[SidebarPreview] Resolved Context String:", resolvedContextStr);

                                                    localContext = JSON.parse(resolvedContextStr);
                                                    console.log("[SidebarPreview] Parsed Local Context:", localContext);
                                                } catch (e) {
                                                    console.error("[SidebarPreview] Context Parse Error:", e);
                                                }

                                                // 3. Merge Contexts
                                                const combinedContext = { ...globalVars, ...localContext };
                                                console.log("[SidebarPreview] Combined Context:", combinedContext);

                                                // 4. Resolve Instruction
                                                const resolvedInstruction = resolveTemplate(instruction, combinedContext);

                                                return (
                                                    <div className="space-y-2 mb-2">
                                                        <Label className="text-amber-600">Preview: Instruction to be sent</Label>
                                                        <div className="bg-amber-50 p-3 rounded-md border border-amber-200 text-xs font-mono whitespace-pre-wrap">
                                                            {resolvedInstruction}
                                                        </div>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            Values resolved from current execution state.
                                                        </p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}

                                        <Button onClick={handleNext} disabled={isExecuting} className="w-full" variant="default">
                                            {isExecuting ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Running...
                                                </>
                                            ) : (
                                                <>
                                                    Next Step
                                                    <ArrowRight className="ml-2 h-4 w-4" />
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}

                                {/* Final Output */}
                                {isCompleted && lastStep?.output_data && (
                                    <div className="space-y-2 pt-4 border-t">
                                        <Label>Final Result</Label>
                                        <div className="bg-green-50 p-4 rounded-md border border-green-200 text-sm font-mono overflow-auto max-h-[300px]">
                                            {JSON.stringify(lastStep.output_data, null, 2)}
                                        </div>
                                        <Button variant="outline" onClick={handleRestart} className="w-full mt-4">
                                            <RotateCcw className="mr-2 h-4 w-4" />
                                            Start New Dry Run
                                        </Button>
                                    </div>
                                )}

                                {/* Error Display */}
                                {isFailed && lastStep && (
                                    <div className="space-y-2 pt-4 border-t">
                                        <Label className="text-red-600">Error Details</Label>
                                        <div className="bg-red-50 p-4 rounded-md border border-red-200 text-sm">
                                            <div className="font-semibold text-red-700 mb-2">Node: {lastStep.node_id}</div>
                                            <div className="font-mono text-xs text-red-600 whitespace-pre-wrap">
                                                {lastStep.error || executionError || "Unknown error occurred"}
                                            </div>
                                            {lastStep.output_data && (
                                                <details className="mt-3">
                                                    <summary className="cursor-pointer text-xs text-red-700 underline">Show raw output</summary>
                                                    <pre className="mt-2 text-xs overflow-auto max-h-[200px] bg-white p-2 rounded">
                                                        {JSON.stringify(lastStep.output_data, null, 2)}
                                                    </pre>
                                                </details>
                                            )}
                                        </div>
                                        <Button variant="destructive" onClick={handleRestart} className="w-full">
                                            <RotateCcw className="mr-2 h-4 w-4" />
                                            Restart
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* LLM Instruction Preview Popup */}
            {(() => {
                const currentNode = previewNode;

                return (
                    <Dialog open={!!previewNode} onOpenChange={(open) => !open && setPreviewNode(null)}>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <AlertCircle className="h-5 w-5 text-blue-500" />
                                    Confirm Instruction (Preview)
                                </DialogTitle>
                                <DialogDescription>
                                    Review the instruction that will be sent to the LLM. Variables have been resolved with current values.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="py-4">
                                {(() => {
                                    if (!currentNode) return null;
                                    const params = currentNode.data.params as any;
                                    const instruction = params.instruction || "";

                                    // Debug: Log available variables
                                    console.log("[DryRunPreview] Available Variables:", lastExecutionState?.variables);

                                    // Helper function to resolve dot/bracket notation with FUZZY matching
                                    const resolveValue = (path: string, scope: any): any => {
                                        if (!scope) return undefined;

                                        // 1. Direct match first (fast path)
                                        if (scope[path] !== undefined) return scope[path];

                                        // 2. Parse Root Variable and Accessors
                                        const complexMatch = path.match(/^([a-zA-Z0-9_\-]+)(.*)$/);
                                        if (!complexMatch) return undefined;

                                        let [_, rootVar, accessors] = complexMatch;

                                        // 3. Find Root Variable (Fuzzy Match)
                                        let current = scope[rootVar];

                                        if (current === undefined) {
                                            // Fuzzy Search: Normalize both and compare
                                            // This handles call_tool_ID vs call-tool-ID vs call_tool-ID
                                            const normalizedRoot = rootVar.replace(/[_\-]/g, '').toLowerCase();
                                            const matchingKey = Object.keys(scope).find(k =>
                                                k.replace(/[_\-]/g, '').toLowerCase() === normalizedRoot
                                            );
                                            if (matchingKey) {
                                                console.log(`[SidebarPreview] Fuzzy match: '${rootVar}' -> '${matchingKey}'`);
                                                current = scope[matchingKey];
                                            }
                                        }

                                        if (current === undefined) return undefined;

                                        // 4. Process Accessors
                                        const accessorRegex = /\[['"]([^'"]+)['"]\]|\.([a-zA-Z0-9_\-]+)/g;
                                        let match;
                                        while ((match = accessorRegex.exec(accessors)) !== null) {
                                            if (current === undefined) break;
                                            const prop = match[1] || match[2];
                                            current = current[prop];
                                        }

                                        return current;
                                    };


                                    const resolveTemplate = (text: string, context: any) => {
                                        if (!text) return "";
                                        return text.replace(/\{\{([^}]+)\}\}/g, (match: string, variable: string) => {
                                            const key = variable.trim();
                                            const val = resolveValue(key, context);
                                            // Format objects/arrays for display
                                            if (val !== undefined && typeof val === 'object') return JSON.stringify(val);
                                            return val !== undefined ? String(val) : match;
                                        });
                                    };

                                    // 1. Prepare Global Context
                                    const globalVars = lastExecutionState?.variables || {};

                                    // 2. Process Input Context (The "Local" Variables)
                                    let localContext = {};
                                    try {
                                        // input_context is usually a JSON string template: '{"var": "{{ val }}"}'
                                        // We resolve it *as a string* first, then parse
                                        const rawContextTemplate = params.input_context || "{ }";
                                        const resolvedContextStr = resolveTemplate(rawContextTemplate, globalVars);
                                        localContext = JSON.parse(resolvedContextStr);
                                    } catch (e) {
                                        console.warn("[Preview] Failed to parse input_context", e);
                                        // Fallback: Use resolved string validation/debugging?
                                        // If parsing fails, we can't build local context.
                                    }

                                    // 3. Merge Contexts (Local overrides Global for instruction)
                                    // Actually, LLM instruction usually *only* sees localContext if provided, 
                                    // but let's assume it has access to merged for safety or strictly local.
                                    // Standard behavior: Instruction sees strict input_context keys.
                                    const combinedContext = { ...globalVars, ...localContext };

                                    // 4. Resolve Instruction
                                    const resolvedInstruction = resolveTemplate(instruction, combinedContext);

                                    return (
                                        <div className="space-y-2">
                                            <Label>Resolved Instruction</Label>
                                            <div className="bg-slate-50 p-4 rounded-md border text-sm font-mono whitespace-pre-wrap">
                                                {resolvedInstruction}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t">
                                <Button variant="outline" onClick={handleRestart}>
                                    Abort
                                </Button>
                                <Button onClick={handleNext} disabled={isExecuting}>
                                    {isExecuting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Running...
                                        </>
                                    ) : (
                                        <>
                                            Continue Execution
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                );
            })()}

            {/* Waiting for Input: Popup Dialog */}
            <Dialog open={!!waitingNodeInfo} onOpenChange={() => { }}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            User Input Required
                        </DialogTitle>
                        <DialogDescription>
                            {waitingNodeInfo?.description || waitingNodeInfo?.toolName || "Please fill out the form to continue."}
                        </DialogDescription>
                    </DialogHeader>

                    {waitingNodeInfo && (
                        <div className="py-4">
                            {(() => {
                                const schema = waitingNodeInfo.schema as any;
                                // Robustly find GUI config (nested or flat)
                                const guiConfig = schema?.gui_schema || schema?.configuration?.gui_schema || schema;
                                const widgets = guiConfig?.components || guiConfig?.widgets;
                                const layout = guiConfig?.layout;

                                if (widgets && Array.isArray(widgets) && widgets.length > 0) {
                                    return (
                                        <FormRenderer
                                            widgets={widgets}
                                            layout={layout}
                                            value={formValues}
                                            context={(waitingNodeInfo as any)?.initial_values || {}}
                                            onChange={(id, val) => setFormValues(prev => ({ ...prev, [id]: val }))}
                                        />
                                    );
                                }

                                // Fallback if no specific widgets found
                                return <div className="text-red-500">No form definition found.</div>;
                            })()}
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={handleRestart}>
                            Abort
                        </Button>
                        <Button onClick={handleSubmitForm} disabled={isExecuting}>
                            {isExecuting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                "Submit & Continue"
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Expanded Output Dialog */}
            <Dialog open={!!expandedOutput} onOpenChange={(open) => !open && setExpandedOutput(null)}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader className="shrink-0">
                        <DialogTitle>Output: {expandedOutput?.nodeLabel}</DialogTitle>
                        <DialogDescription>
                            Full output data from this execution step
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 mt-4 overflow-auto border rounded bg-slate-50 dark:bg-slate-800">
                        <pre className="text-sm font-mono p-4 whitespace-pre-wrap break-words">
                            {expandedOutput?.data ? JSON.stringify(expandedOutput.data, null, 2) : ""}
                        </pre>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Save Warning Dialog */}
            <AlertDialog open={showSaveWarning} onOpenChange={setShowSaveWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unsaved Changes Detected</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have unsaved changes in your blueprint. The Dry Run will execute the last saved version.
                            Would you like to save your changes first?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSaveAndStart}>
                            Save & Continue
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
