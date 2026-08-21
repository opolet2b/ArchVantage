import * as React from "react";
import { CanvasThing, useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, Loader2, Play, RefreshCw, CheckCircle2, Download } from "lucide-react";
import { useAnalyze } from "./use-analyze";
import { MarkdownViewer } from "./markdown-viewer";

interface ArchitectureMemoViewerProps {
    thing: CanvasThing;
}

export type MemoStep = "WAITING" | "GENERATING" | "DONE";

export function ArchitectureMemoViewer({ thing }: ArchitectureMemoViewerProps) {
    const updateThing = useCanvasStore((state) => state.updateThing);
    const links = useCanvasStore((state) => state.links);
    const things = useCanvasStore((state) => state.things);
    const canvasId = useCanvasStore((state) => state.canvasId);
    const { analyze } = useAnalyze();
    const [progress, setProgress] = React.useState(0);
    const [selectedLinkIds, setSelectedLinkIds] = React.useState<Set<string>>(new Set());
    const [isExporting, setIsExporting] = React.useState(false);

    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (thing.content?.memoState?.step === "GENERATING") {
            setProgress(0);
            interval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 95) return 95;
                    // Progress much slower. 0.015 means it takes ~1 minute to reach 85%
                    return prev + Math.max(0.2, (95 - prev) * 0.015);
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
    const linkedIds = linkedThings.map(l => l.target_id === thing.id ? l.source_id : l.target_id);
    
    // Auto-select new links when they appear
    React.useEffect(() => {
        setSelectedLinkIds(prev => {
            const next = new Set(prev);
            let changed = false;
            const deselected = (stateContent.deselectedLinkIds as string[]) || [];
            linkedIds.forEach(id => {
                if (!next.has(id) && !deselected.includes(id)) {
                    next.add(id);
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [linkedIds.join(',')]);

    const handleExportDocx = async () => {
        if (!memoContent) return;
        try {
            setIsExporting(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/${canvasId}/export-docx`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { "Authorization": `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ markdown: memoContent })
            });

            if (!response.ok) {
                throw new Error("Export failed");
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "Architecture_Memo.docx";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error("Export error:", error);
            alert("Failed to export document.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleGenerate = async () => {
        if (selectedLinkIds.size === 0) {
            alert("Please select at least one document to extract context from.");
            return;
        }

        updateMemoState({ step: "GENERATING" });

        try {
            // Trigger backend langgraph process
            const response = await analyze({ 
                canvasId: canvasId || "",
                thingId: thing.id, // We analyze this memo node
                fragment: { type: "text", content: JSON.stringify(Array.from(selectedLinkIds)) } as unknown as import("./types").TextFragment,
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
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleExportDocx} disabled={isExporting} className="h-6 px-2 text-xs">
                            {isExporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />} 
                            Export Word
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => updateMemoState({ step: "WAITING" })} className="h-6 px-2 text-xs">
                            <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                        </Button>
                    </div>
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
                <div className="flex flex-col items-center justify-start flex-1 gap-4 mt-8">
                    <div className="text-center">
                        <p className="text-sm mb-2">Linked Context Documents</p>
                        <p className="text-xs text-muted-foreground">Select the documents the AI Architect should analyze.</p>
                    </div>
                    
                    <div className="w-full max-w-sm space-y-2 max-h-48 overflow-y-auto border rounded-md p-2 bg-muted/10">
                        {linkedIds.length === 0 ? (
                            <div className="text-xs text-center text-muted-foreground py-4">
                                No links found. Please link documents to this memo node.
                            </div>
                        ) : (
                            linkedIds.map(id => {
                                const t = things.find(th => th.id === id);
                                return (
                                    <div key={id} className="flex items-center space-x-2 p-1.5 hover:bg-muted/30 rounded-sm">
                                        <input
                                            type="checkbox"
                                            id={`doc-${id}`}
                                            checked={selectedLinkIds.has(id)}
                                            onChange={(e) => {
                                                const next = new Set(selectedLinkIds);
                                                if (e.target.checked) {
                                                    next.add(id);
                                                } else {
                                                    next.delete(id);
                                                }
                                                setSelectedLinkIds(next);
                                                
                                                // Persist deselected so they don't auto-select on next render
                                                const deselected = linkedIds.filter(lid => !next.has(lid));
                                                updateMemoState({ deselectedLinkIds: deselected });
                                            }}
                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <label htmlFor={`doc-${id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 truncate cursor-pointer">
                                            {t?.title || t?.type || "Unknown Document"}
                                        </label>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    
                    <Button onClick={handleGenerate} disabled={selectedLinkIds.size === 0} className="mt-4">
                        <Play className="h-4 w-4 mr-2" /> Generate Memo ({selectedLinkIds.size})
                    </Button>
                </div>
            )}

            {step === "GENERATING" && (
                <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm mx-auto text-slate-500 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="w-full space-y-2">
                        <Progress value={progress} className="h-2 w-full" />
                        <p className="text-sm font-medium animate-pulse text-center">
                            {progress < 30 ? "Querying knowledge base for architectural context..." : 
                             progress < 60 ? "Synthesizing retrieved chunks (Tree Summarize)..." : 
                             progress < 85 ? "Drafting C-Level Memo..." : 
                             "Finalizing formatting..."}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
