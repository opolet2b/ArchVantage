import * as React from "react";
import { CanvasThing, useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, Loader2, Play, RefreshCw, CheckCircle2 } from "lucide-react";
import { useAnalyze } from "./use-analyze";
import { MarkdownViewer } from "./markdown-viewer";

interface ArchitectureMemoViewerProps {
    thing: CanvasThing;
}

export type MemoStep = "WAITING" | "GENERATING" | "DONE";

export function ArchitectureMemoViewer({ thing }: ArchitectureMemoViewerProps) {
    const updateThing = useCanvasStore((state) => state.updateThing);
    const links = useCanvasStore((state) => state.links);
    const canvasId = useCanvasStore((state) => state.canvasId);
    const { analyze } = useAnalyze();
    const [progress, setProgress] = React.useState(0);

    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (thing.content?.memoState?.step === "GENERATING") {
            setProgress(0);
            interval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 95) return 95;
                    return prev + Math.max(0.5, (95 - prev) * 0.05);
                });
            }, 500);
        } else {
            setProgress(0);
        }
        return () => clearInterval(interval);
    }, [thing.content?.memoState?.step]);

    const stateContent: Record<string, unknown> = (thing.content?.memoState as Record<string, unknown>) || {};
    const step: MemoStep = (stateContent.step as MemoStep) || "WAITING";
    const memoContent = thing.content?.memoContent as string || "";

    const updateMemoState = (updates: Record<string, unknown>, extra?: Record<string, unknown>) => {
        updateThing(thing.id, {
            content: {
                ...thing.content,
                memoState: { ...stateContent, ...updates },
                ...extra
            }
        });
    };

    const linkedThings = links.filter((l) => l.target_id === thing.id || l.source_id === thing.id);

    const handleGenerate = async () => {
        if (linkedThings.length === 0) {
            alert("Please link at least one document to extract context from.");
            return;
        }

        updateMemoState({ step: "GENERATING" });

        try {
            // Trigger backend langgraph process
            const response = await analyze({ 
                canvasId: canvasId || "",
                thingId: thing.id, // We analyze this memo node
                fragment: { type: "text", content: "" } as unknown as import("./types").TextFragment,
                action: "ask",
                customPrompt: "create a 1-page architecture memo"
            });

            if (response && response.result) {
                updateMemoState({ step: "DONE" }, { memoContent: response.result });
            } else {
                alert("Generation returned empty result.");
                updateMemoState({ step: "WAITING" });
            }
        } catch (error: unknown) {
            console.error("Error during memo generation:", error);
            alert(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
            updateMemoState({ step: "WAITING" });
        }
    };

    if (step === "DONE") {
        return (
            <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden w-full relative group">
                <div className="flex items-center justify-between p-2 border-b bg-muted/30 shrink-0">
                    <span className="text-xs font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4" /> 1-Page Architecture Memo
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => updateMemoState({ step: "WAITING" })} className="h-6 px-2 text-xs">
                        <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                    </Button>
                </div>
                <div className="flex-1 relative min-h-0 min-w-0 p-4 overflow-y-auto bg-white">
                    <MarkdownViewer content={memoContent} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 h-full p-4 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="text-md font-semibold">C-Level Architecture Memo</h3>
            </div>

            {step === "WAITING" && (
                <div className="flex flex-col items-center justify-center flex-1 text-slate-500 gap-4">
                    <div className="text-center">
                        <p className="text-sm mb-2">1. Link context documents</p>
                        <p className="text-xs text-muted-foreground">The AI Architect will analyze them and write a memo.</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium">
                        <FileText className="h-4 w-4" /> {linkedThings.length} Links Found
                    </div>
                    <Button onClick={handleGenerate} disabled={linkedThings.length === 0}>
                        <Play className="h-4 w-4 mr-2" /> Generate Memo
                    </Button>
                </div>
            )}

            {step === "GENERATING" && (
                <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm mx-auto text-slate-500 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="w-full space-y-2">
                        <Progress value={progress} className="h-2 w-full" />
                        <p className="text-sm font-medium animate-pulse text-center">Architect is analyzing & writing...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
