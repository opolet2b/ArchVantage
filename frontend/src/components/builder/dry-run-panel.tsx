
import * as React from "react";
import { Play, RotateCcw, Loader2, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
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
        activeNodeId
    } = useBuilderStore();

    const [jsonError, setJsonError] = React.useState<string | null>(null);
    const [formValues, setFormValues] = React.useState<Record<string, any>>({});
    const [isOpen, setIsOpen] = React.useState(false);

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

    // Reset form values when waiting info changes
    React.useEffect(() => {
        const schema = waitingNodeInfo?.schema as any;
        const components = schema?.components || schema?.widgets || [];

        const initialValues: Record<string, any> = {};
        if (Array.isArray(components)) {
            components.forEach((comp: any) => {
                if (comp.id) {
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

    const handleStart = async () => {
        if (jsonError) return;
        await startDryRunStep();
    };

    const handleNext = async () => {
        await nextDryRunStep();
    };

    const handleSubmitForm = async () => {
        await submitDryRunInput(formValues);
    };

    const handleRestart = () => {
        clearExecution();
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
                                    <div className="relative">
                                        <Textarea
                                            className={cn(
                                                "font-mono text-xs min-h-[150px]",
                                                jsonError && "border-red-500 focus-visible:ring-red-500"
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
                                    disabled={isExecuting || !!jsonError}
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
                                    <div className="flex gap-2">
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

                                {isFailed && (
                                    <Button variant="destructive" onClick={handleRestart} className="w-full">
                                        <RotateCcw className="mr-2 h-4 w-4" />
                                        Restart
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

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
        </>
    );
}
