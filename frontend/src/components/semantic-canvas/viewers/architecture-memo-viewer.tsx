import * as React from "react";
import { CanvasThing, useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, Loader2, Play, RefreshCw, CheckCircle2, Download, X } from "lucide-react";
import { MarkdownViewer } from "./markdown-viewer";
import { cn } from "@/lib/utils";

interface ArchitectureMemoViewerProps {
    thing: CanvasThing;
}

export type MemoStep = "WAITING" | "GENERATING" | "DONE";

export function ArchitectureMemoViewer({ thing }: ArchitectureMemoViewerProps) {
    const updateThing = useCanvasStore((state) => state.updateThing);
    const links = useCanvasStore((state) => state.links);
    const things = useCanvasStore((state) => state.things);
    const canvasId = useCanvasStore((state) => state.canvasId);
    const [selectedLinkIds, setSelectedLinkIds] = React.useState<Set<string>>(new Set());
    const [isExporting, setIsExporting] = React.useState(false);
    
    // Status and Progress State
    const stateContent: Record<string, unknown> = (thing.content?.memoState as Record<string, unknown>) || {};
    const [step, setStep] = React.useState<MemoStep>((stateContent.step as MemoStep) || "WAITING");
    const [memoContent, setMemoContent] = React.useState<string>((thing.content?.memoContent as string) || "");
    const [progressPercent, setProgressPercent] = React.useState<number>(step === "GENERATING" ? 50 : 0);
    const [progressMessage, setProgressMessage] = React.useState<string>(
        step === "GENERATING" ? 'Running safely in the background...' : ''
    );
    const [elapsedTime, setElapsedTime] = React.useState<number | null>(null);
    const [syncState, setSyncState] = React.useState<'idle' | 'checking' | 'completed' | 'running' | 'error'>('idle');

    const abortControllerRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
        const dbStep = (thing.content?.memoState as Record<string, unknown>)?.step as MemoStep || "WAITING";
        const dbMemo = (thing.content?.memoContent as string) || "";
        if (dbStep === "DONE" && step !== "DONE") {
            setStep("DONE");
            setMemoContent(dbMemo);
        } else if (dbStep === "GENERATING" && step !== "GENERATING") {
            setStep("GENERATING");
        } else if (dbStep === "WAITING" && step !== "WAITING") {
            setStep("WAITING");
        }
    }, [(thing.content?.memoState as Record<string, unknown>)?.step, thing.content?.memoContent]);

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

    const checkStatus = async () => {
        setSyncState('checking');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/architecture_memo/status/${thing.id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.step === 'DONE') {
                    setMemoContent(data.memoContent);
                    setStep('DONE');
                    setSyncState('completed');
                    updateMemoState({ step: "DONE" }, { memoContent: data.memoContent });
                } else if (data.step === 'WAITING') {
                    setStep('WAITING');
                    setSyncState('idle');
                    updateMemoState({ step: "WAITING" });
                } else {
                    if (!abortControllerRef.current) {
                        setProgressMessage('Backend process is still running...');
                    }
                    setSyncState('running');
                }
            } else {
                setSyncState('error');
            }
        } catch (err) {
            console.error("Failed to check status", err);
            setSyncState('error');
        }
        
        setTimeout(() => setSyncState('idle'), 3000);
    };

    // Auto-poll status every 15 seconds while generating
    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (step === 'GENERATING') {
            interval = setInterval(() => {
                if (syncState !== 'checking') {
                    checkStatus();
                }
            }, 15000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [step, syncState]);

    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        } else {
            setStep('WAITING');
            setProgressMessage('Cancelled');
            setElapsedTime(null);
            updateMemoState({ step: "WAITING" });
        }
    };

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

        setStep("GENERATING");
        setProgressPercent(5);
        setProgressMessage("Initiating analysis...");
        updateMemoState({ step: "GENERATING" });

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/architecture_memo/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    thing_id: thing.id,
                    selected_link_ids: Array.from(selectedLinkIds),
                    canvas_id: canvasId
                })
            });
            
            if (!res.ok) throw new Error("API Request Failed");
            if (!res.body) throw new Error("No response body");

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let done = false;

            const startTime = Date.now();
            const timerInterval = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);

            let accumulatedData = "";

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                if (readerDone) {
                    done = true;
                    break;
                }
                
                const chunk = decoder.decode(value, { stream: true });
                accumulatedData += chunk;
                
                const parts = accumulatedData.split("\n\n");
                accumulatedData = parts.pop() || "";
                
                for (const part of parts) {
                    if (part.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(part.slice(6));
                            
                            if (data.type === "step") {
                                setProgressMessage(`Running step: ${data.node}...`);
                                setProgressPercent((prev: number) => prev < 90 ? prev + 10 : prev);
                            } else if (data.type === "chunk_progress") {
                                const fraction = data.completed / Math.max(1, data.total);
                                setProgressMessage(`Extracting Architecture Concepts (Chunk ${data.completed} of ${data.total})...`);
                                setProgressPercent(10 + fraction * 60);
                            } else if (data.type === "completed") {
                                setProgressPercent(100);
                                setProgressMessage("Complete!");
                                
                                setMemoContent(data.memoContent);
                                setStep("DONE");
                                
                                updateMemoState({ step: "DONE" }, { memoContent: data.memoContent });
                            } else if (data.type === "error") {
                                throw new Error(data.message);
                            }
                        } catch (e) {
                            console.error("Failed to parse SSE event:", e);
                        }
                    }
                }
            }
            
            clearInterval(timerInterval);
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('Generation aborted by user');
            } else {
                console.error("Generation failed:", error);
                setProgressMessage(`Network connection dropped or error: ${error.message}`);
                setStep('WAITING');
                // CRITICAL FIX: Do not overwrite DB on error
            }
        } finally {
            abortControllerRef.current = null;
        }
    };

    if (step === "DONE") {
        return (
            <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden w-full relative group bg-white dark:bg-slate-950">
                <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
                    <span className="text-sm font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <FileText className="h-4 w-4 text-blue-500" /> 1-Page Architecture Memo
                    </span>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-8 gap-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                            onClick={checkStatus}
                            disabled={syncState === 'checking'}
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", syncState === 'checking' && "animate-spin")} />
                            {syncState === 'checking' ? "Checking..." : "Sync Status"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportDocx} disabled={isExporting} className="h-8 px-3 text-xs bg-white dark:bg-slate-800">
                            {isExporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-2" />} 
                            Export .docx
                        </Button>
                        <Button variant="default" size="sm" onClick={() => setStep("WAITING")} className="h-8 px-3 text-xs bg-slate-800 hover:bg-slate-700">
                            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Start Over
                        </Button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar p-8 bg-slate-50 dark:bg-slate-950">
                    <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-lg p-10 min-h-full">
                        <MarkdownViewer content={memoContent || "*No content generated.*"} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 h-full w-full relative bg-slate-50 dark:bg-slate-950">
            <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <span className="text-sm font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <FileText className="h-4 w-4 text-blue-500" /> Architecture Memo Generator
                </span>
                {step === 'GENERATING' && (
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs h-7 gap-1"
                        onClick={checkStatus}
                        disabled={syncState === 'checking'}
                    >
                        <RefreshCw className={cn("w-3 h-3", syncState === 'checking' && "animate-spin")} />
                        {syncState === 'checking' && "Checking..."}
                        {syncState === 'idle' && "Sync Status"}
                        {syncState === 'completed' && "Finished!"}
                        {syncState === 'error' && "Sync Failed"}
                        {syncState === 'running' && "Still running..."}
                    </Button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
                    
                    {step === "WAITING" && (
                        <div className="p-8">
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100 dark:border-blue-800/30 shadow-sm">
                                    <FileText className="h-8 w-8" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Create C-Level Memo</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Select the documents you want to include as context. The LLM will analyze them via map-reduce and generate a professional architecture memo.
                                </p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-950/50 rounded-lg p-5 border border-slate-100 dark:border-slate-800 mb-8">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                                    Linked Context Documents <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full text-[10px]">{linkedThings.length}</span>
                                </h4>
                                {linkedThings.length === 0 ? (
                                    <div className="text-sm text-slate-400 italic text-center py-4 bg-white dark:bg-slate-900 rounded border border-dashed border-slate-200 dark:border-slate-700">
                                        No documents linked. Drag a connection from a document node to this memo to add context.
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                                        {linkedThings.map(linkedThing => {
                                            const otherId = linkedThing.target_id === thing.id ? linkedThing.source_id : linkedThing.target_id;
                                            const actualThing = things.find(t => t.id === otherId);
                                            const isSelected = selectedLinkIds.has(otherId);
                                            const title = actualThing?.title || otherId;
                                            const type = actualThing?.type || linkedThing.type;

                                            return (
                                                <div 
                                                    key={linkedThing.id} 
                                                    className={cn(
                                                        "flex items-center gap-3 p-3 rounded-md border transition-colors cursor-pointer",
                                                        isSelected 
                                                            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 shadow-sm" 
                                                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                                                    )}
                                                    onClick={() => {
                                                        const next = new Set(selectedLinkIds);
                                                        if (next.has(otherId)) {
                                                            next.delete(otherId);
                                                        } else {
                                                            next.add(otherId);
                                                        }
                                                        setSelectedLinkIds(next);
                                                        const deselected = linkedIds.filter(id => !next.has(id));
                                                        updateMemoState({ deselectedLinkIds: deselected });
                                                    }}
                                                >
                                                    <div className={cn(
                                                        "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                                                        isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300 dark:border-slate-600"
                                                    )}>
                                                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                                                    </div>
                                                    <div className="truncate flex-1">
                                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{title}</p>
                                                        <p className="text-xs text-slate-400 truncate">{type}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            
                            <Button 
                                onClick={handleGenerate} 
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base font-medium"
                                disabled={selectedLinkIds.size === 0}
                            >
                                <Play className="w-4 h-4 mr-2" /> Generate Memo
                            </Button>
                        </div>
                    )}

                    {step === "GENERATING" && (
                        <div className="p-12">
                            <div className="text-center w-full">
                                <div className="mb-8 flex justify-center">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                                        <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-blue-500 border-l-4 border-l-transparent border-r-4 border-r-transparent relative z-10"></div>
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                                    Writing Memo...
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 h-5">
                                    {progressMessage}
                                </p>
                                
                                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden mb-4 shadow-inner border border-slate-200 dark:border-slate-700/50">
                                    <div 
                                        className="h-full bg-blue-500 transition-all duration-300 ease-out relative"
                                        style={{ width: `${Math.max(5, progressPercent)}%` }}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_2s_infinite]"></div>
                                    </div>
                                </div>
                                
                                <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-8">
                                    <span>{Math.round(progressPercent)}%</span>
                                    {elapsedTime !== null && (
                                        <span className="flex items-center gap-1.5 text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md">
                                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                            {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                                        </span>
                                    )}
                                </div>
                                
                                <Button 
                                    variant="outline"
                                    className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20"
                                    onClick={cancelGeneration}
                                >
                                    <X className="w-4 h-4 mr-2" /> Cancel Generation
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
