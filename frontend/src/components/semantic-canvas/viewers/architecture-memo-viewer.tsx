import * as React from "react";
import { CanvasThing, useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Play, RefreshCw, CheckCircle2, Download, X } from "lucide-react";
import { MarkdownViewer } from "./markdown-viewer";
import { useAgentTask } from "@/hooks/use-agent-task";
import { LinkedDocumentSelector } from "./linked-document-selector";
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

    const [memoContent, setMemoContent] = React.useState<string>((thing.content?.memoContent as string) || "");

    const {
        step,
        setStep,
        progressPercent,
        progressMessage,
        elapsedTime,
        syncState,
        checkStatus,
        cancelGeneration,
        handleGenerateStream,
        updateState
    } = useAgentTask({
        thingId: thing.id,
        endpointPath: 'architecture_memo',
        stateKey: 'memoState',
        onCompleted: (data) => {
            setMemoContent(data.memoContent);
            updateState({ step: "DONE" }, { memoContent: data.memoContent });
        }
    });

    React.useEffect(() => {
        const dbMemo = (thing.content?.memoContent as string) || "";
        if (step === "DONE" && dbMemo) {
            setMemoContent(dbMemo);
        }
    }, [step, thing.content?.memoContent]);

    const stateContent: Record<string, unknown> = (thing.content?.memoState as Record<string, unknown>) || {};
    const linkedThings = links
        .filter((l) => l.target_id === thing.id || l.source_id === thing.id)
        .map(link => {
            const otherId = link.target_id === thing.id ? link.source_id : link.target_id;
            return things.find(t => t.id === otherId);
        })
        .filter((t): t is CanvasThing => t !== undefined);
        
    const linkedIds = linkedThings.map(t => t.id);
    
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

    const handleGenerate = () => {
        if (selectedLinkIds.size === 0) {
            alert("Please select at least one document to extract context from.");
            return;
        }

        handleGenerateStream({
            thing_id: thing.id,
            selected_link_ids: Array.from(selectedLinkIds),
            canvas_id: canvasId
        });
    };

    if (step === "DONE") {
        return (
            <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden w-full relative group bg-white dark:bg-slate-950">
                <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
                    <span className="text-sm font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <FileText className="h-4 w-4 text-blue-500" /> 1-Page Architecture Memo
                    </span>
                    <div className="flex gap-2">
                        <Button 
                            size="sm" 
                            variant="ghost"
                            className={cn(
                                "text-slate-600 dark:text-slate-300 transition-colors",
                                syncState === 'idle' ? "hover:bg-slate-100 dark:hover:bg-slate-800" :
                                syncState === 'completed' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                syncState === 'running' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                syncState === 'error' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                "bg-slate-100 dark:bg-slate-800"
                            )}
                            onClick={checkStatus}
                            title="Sync Status from Server"
                            disabled={syncState === 'checking'}
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5 mr-2", syncState === 'checking' && "animate-spin")} />
                            {syncState === 'idle' && "Sync Status"}
                            {syncState === 'checking' && "Checking..."}
                            {syncState === 'completed' && "Finished!"}
                            {syncState === 'running' && "Still running..."}
                            {syncState === 'error' && "Failed to sync"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportDocx} disabled={isExporting}>
                            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} 
                            Export .docx
                        </Button>
                        <Button variant="default" size="sm" onClick={() => setStep("WAITING")}>
                            <RefreshCw className="h-4 w-4 mr-2" /> Start Over
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
                <div className="flex gap-2">
                    <Button 
                        size="sm" 
                        variant="ghost"
                        className={cn(
                            "text-slate-600 dark:text-slate-300 transition-colors",
                            syncState === 'idle' ? "hover:bg-slate-100 dark:hover:bg-slate-800" :
                            syncState === 'completed' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                            syncState === 'running' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                            syncState === 'error' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                            "bg-slate-100 dark:bg-slate-800"
                        )}
                        onClick={checkStatus}
                        title="Sync Status from Server"
                        disabled={syncState === 'checking'}
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5 mr-2", syncState === 'checking' && "animate-spin")} />
                        {syncState === 'idle' && "Sync Status"}
                        {syncState === 'checking' && "Checking..."}
                        {syncState === 'completed' && "Finished!"}
                        {syncState === 'running' && "Still running..."}
                        {syncState === 'error' && "Failed to sync"}
                    </Button>
                </div>
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

                            <LinkedDocumentSelector 
                                linkedThings={linkedThings} 
                                selectedIds={selectedLinkIds}
                                onSelectionChange={setSelectedLinkIds}
                            />
                            
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
                        <div className="flex-1 bg-slate-100/50 dark:bg-slate-950 flex flex-col overflow-hidden relative justify-center">
                            <div className="p-8 max-w-3xl mx-auto flex flex-col items-center gap-6 pb-20">
                                <div className="mt-20 text-center flex flex-col items-center">
                                    <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-6" />
                                    <h3 className="text-xl font-medium text-slate-700 dark:text-slate-200 mb-2">Writing Memo...</h3>
                                    
                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-md mb-6 max-w-md text-sm">
                                        ⚠️ <strong>Do not refresh this page.</strong> If you do, the generation will continue in the background but this screen will lose connection and stop updating automatically.
                                    </div>

                                    {(progressMessage === 'Running safely in the background...' || progressMessage === 'Backend process is still running...') ? (
                                        <div className="text-slate-500 dark:text-slate-400 mb-4 max-w-md space-y-2">
                                            <p className="font-semibold text-amber-600 dark:text-amber-500">
                                                Background process is still running.
                                            </p>
                                            <p className="text-sm">
                                                We cannot estimate the remaining time because the page was refreshed, but the AI is actively processing in the background. Please wait for completion or click "Refresh Status" to check.
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-slate-500 dark:text-slate-400 mb-4 max-w-md h-5">
                                            {progressMessage || 'Initiating analysis...'}
                                        </p>
                                    )}
                                    
                                    {elapsedTime !== null ? (
                                        <div className="w-64 mb-8">
                                            <div className="bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-2 overflow-hidden w-full">
                                                <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                                            </div>
                                            <div className="text-xs text-slate-400 dark:text-slate-500 text-right flex justify-between">
                                                <span>{Math.round(progressPercent)}%</span>
                                                <span>{elapsedTime}s elapsed</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mb-8" />
                                    )}
                                    
                                    <div className="flex gap-4">
                                        <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-900/20" onClick={cancelGeneration}>
                                            Cancel Generation
                                        </Button>
                                        <Button variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-900/50 dark:hover:bg-blue-900/20" onClick={checkStatus}>
                                            Refresh Status
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
