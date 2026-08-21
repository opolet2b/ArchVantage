import * as React from "react";
import { CanvasThing, useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, CheckCircle2, Loader2, Play, Plus, RefreshCw, FileText, Download, X } from "lucide-react";
import { Document, Paragraph, Table as DocxTable, TableRow, TableCell, TextRun, WidthType, BorderStyle, HeadingLevel } from "docx";
import { SpreadsheetToolViewer } from "./spreadsheet-tool-viewer";
import { cn } from "@/lib/utils";

interface TradeOffMatrixViewerProps {
    thing: CanvasThing;
}

export type MatrixStep = "WAITING" | "EXTRACTING" | "EDITING";

export interface Option {
    id: string;
    category?: string;
    name: string;
    description: string;
    selected: boolean;
}

export function TradeOffMatrixViewer({ thing }: TradeOffMatrixViewerProps) {
    const updateThing = useCanvasStore((state) => state.updateThing);
    const links = useCanvasStore((state) => state.links);
    const canvasId = useCanvasStore((state) => state.canvasId);
    const things = useCanvasStore((state) => state.things);
    const [methodology, setMethodology] = React.useState("LLM Generated");
    
    // Status and Progress State
    const stateContent: any = thing.content?.matrixState || {};
    const [step, setStep] = React.useState<MatrixStep>(stateContent.step || "WAITING");
    const [extractProgress, setExtractProgress] = React.useState<number>(step === "EXTRACTING" ? 50 : 0);
    const [progressMessage, setProgressMessage] = React.useState<string>(
        step === "EXTRACTING" ? 'Running safely in the background...' : ''
    );
    const [elapsedTime, setElapsedTime] = React.useState<number | null>(null);
    const [syncState, setSyncState] = React.useState<'idle' | 'checking' | 'completed' | 'running' | 'error'>('idle');

    const abortControllerRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
        const dbStep = (thing.content?.matrixState as any)?.step || "WAITING";
        if (dbStep === "EDITING" && step !== "EDITING") {
            setStep("EDITING");
        } else if (dbStep === "EXTRACTING" && step !== "EXTRACTING") {
            setStep("EXTRACTING");
        } else if (dbStep === "WAITING" && step !== "WAITING") {
            setStep("WAITING");
        }
    }, [(thing.content?.matrixState as any)?.step]);

    const updateMatrixState = (updates: Partial<typeof stateContent>, data?: any[]) => {
        const contentUpdates: any = {
            matrixState: { ...stateContent, ...updates }
        };
        if (data !== undefined) {
            contentUpdates.data = data;
        }
        updateThing(thing.id, {
            content: {
                ...thing.content,
                ...contentUpdates
            }
        });
    };

    const linkedThings = links.filter((l) => l.target_id === thing.id || l.source_id === thing.id);
    const linkedDocs = React.useMemo(() => {
        return linkedThings.map(link => {
            const linkedThingId = link.source_id === thing.id ? link.target_id : link.source_id;
            return things.find(t => t.id === linkedThingId);
        }).filter((t): t is CanvasThing => t !== undefined);
    }, [linkedThings, things, thing.id]);

    const [selectedDocIds, setSelectedDocIds] = React.useState<string[]>([]);
    
    // Auto-select newly linked documents
    React.useEffect(() => {
        setSelectedDocIds(prev => {
            const newIds = linkedDocs.map(d => d.id).filter(id => !prev.includes(id));
            if (newIds.length > 0) return [...prev, ...newIds];
            return prev;
        });
    }, [linkedDocs]);

    const checkStatus = async () => {
        setSyncState('checking');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/trade_off_matrix/status/${thing.id}`);
            if (res.ok) {
                const resultData = await res.json();
                if (resultData.step === 'EDITING') {
                    setStep('EDITING');
                    setSyncState('completed');
                    updateMatrixState({ step: "EDITING" }, resultData.data);
                } else if (resultData.step === 'WAITING') {
                    setStep('WAITING');
                    setSyncState('idle');
                    updateMatrixState({ step: "WAITING" });
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

    // Auto-poll status every 15 seconds while extracting
    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (step === 'EXTRACTING') {
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
            updateMatrixState({ step: "WAITING" });
        }
    };

    const handleExtract = async () => {
        const selectedDocs = linkedDocs.filter(d => selectedDocIds.includes(d.id));
        
        if (selectedDocs.length === 0) {
            alert("Please select at least one document to extract options from.");
            return;
        }

        setStep("EXTRACTING");
        setExtractProgress(5);
        setProgressMessage("Initiating map-reduce extraction...");
        updateMatrixState({ step: "EXTRACTING" });

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/trade_off_matrix/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    thing_id: thing.id,
                    selected_link_ids: selectedDocs.map(d => d.id),
                    canvas_id: canvasId,
                    methodology: methodology
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
                            
                            if (data.type === "chunk_progress") {
                                const fraction = data.completed / Math.max(1, data.total);
                                setProgressMessage(`Extracting Options (Document ${data.completed} of ${data.total})...`);
                                setExtractProgress(10 + fraction * 80);
                            } else if (data.type === "completed") {
                                setExtractProgress(100);
                                setProgressMessage("Complete!");
                                setStep("EDITING");
                                updateMatrixState({ step: "EDITING", options: [] }, data.data);
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

    const exportToWord = async () => {
        try {
            if (!thing.content?.data || !Array.isArray(thing.content.data)) {
                alert("No data to export");
                return;
            }
            
            const matrixData: any[][] = thing.content.data;
            const rows = matrixData.map((row) => {
                const isDomainRow = String(row[0]).startsWith("Domain:");
                const isEmptyRow = row.every(c => !c);
                const isHeaderRow = String(row[0]) === "Alternative";

                if (isEmptyRow) {
                    return new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: "" })],
                                columnSpan: row.length || 1,
                                borders: {
                                    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                                    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
                                    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                                    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
                                }
                            })
                        ]
                    });
                }

                if (isDomainRow) {
                    return new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ children: [new TextRun({ text: String(row[0]), bold: true, size: 24 })] })],
                                columnSpan: row.length || 1,
                                shading: { fill: "F0F0F0" },
                                borders: {
                                    top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                    left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                    right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                }
                            })
                        ]
                    });
                }

                return new TableRow({
                    children: row.map((cellText) => {
                        return new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: String(cellText), bold: isHeaderRow })] })],
                            width: { size: 100 / (row.length || 1), type: WidthType.PERCENTAGE },
                            shading: isHeaderRow ? { fill: "E0E0E0" } : undefined,
                            borders: {
                                top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                                right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            },
                        });
                    }),
                });
            });

            const table = new DocxTable({
                rows: rows,
                width: { size: 100, type: WidthType.PERCENTAGE },
            });

            const doc = new Document({
                sections: [
                    {
                        properties: {},
                        children: [
                            new Paragraph({
                                text: thing.title || "Trade-off Matrix",
                                heading: HeadingLevel.HEADING_1,
                            }),
                            new Paragraph({
                                text: "Extracted architectural scenarios and alternatives.",
                                spacing: { after: 200 }
                            }),
                            table,
                        ],
                    },
                ],
            });

            const { Packer } = await import("docx");
            const blob = await Packer.toBlob(doc);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${thing.title || "trade-off-matrix"}.docx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error("Export failed", error);
            alert("Failed to export to Word");
        }
    };

    if (step === "EDITING") {
        return (
            <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden relative group/spreadsheet w-full" style={{ height: '100%', width: '100%' }}>
                <div className="flex items-center justify-between p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
                    <span className="text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Table className="h-4 w-4 text-blue-500" /> Trade-off Matrix
                    </span>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-7 gap-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                            onClick={checkStatus}
                            disabled={syncState === 'checking'}
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", syncState === 'checking' && "animate-spin")} />
                            {syncState === 'checking' ? "Checking..." : "Sync Status"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportToWord} className="h-7 px-3 text-xs bg-white dark:bg-slate-800">
                            <Download className="h-3 w-3 mr-1" /> Export Word
                        </Button>
                        <Button variant="default" size="sm" onClick={() => updateMatrixState({ step: "WAITING" })} className="h-7 px-3 text-xs bg-slate-800 hover:bg-slate-700">
                            <RefreshCw className="h-3 w-3 mr-1" /> Re-extract
                        </Button>
                    </div>
                </div>
                <div className="flex-1 relative min-h-0 min-w-0" style={{ height: '100%', width: '100%' }}>
                    <div className="absolute inset-0" style={{ height: '100%', width: '100%' }}>
                        <SpreadsheetToolViewer thing={thing} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 h-full w-full relative bg-slate-50 dark:bg-slate-950">
            <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <span className="text-sm font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <Table className="h-4 w-4 text-blue-500" /> Trade-off Matrix Builder
                </span>
                {step === 'EXTRACTING' && (
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
                                    <Table className="h-8 w-8" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Build Trade-off Matrix</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    The format comparing alternatives aligns with standard practices like ATAM (Architecture Tradeoff Analysis Method) or ADRs.
                                </p>
                            </div>

                            <div className="space-y-6 mb-8">
                                <div>
                                    <p className="text-sm mb-2 font-semibold text-slate-700 dark:text-slate-300">1. Select methodology</p>
                                    <div className="w-full nodrag nopan" onPointerDown={(e) => e.stopPropagation()}>
                                        <select 
                                            value={methodology} 
                                            onChange={(e) => setMethodology(e.target.value)}
                                            className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="LLM Generated">LLM Generated (Dynamic)</option>
                                            <option value="TOGAF">TOGAF</option>
                                            <option value="Zachman Framework">Zachman Framework</option>
                                            <option value="DODAF">DODAF</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div>
                                    <p className="text-sm mb-2 font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                        2. Context documents
                                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full text-[10px]">{linkedDocs.length}</span>
                                    </p>
                                    <div className="flex flex-col gap-2 w-full text-left max-h-48 overflow-y-auto custom-scrollbar p-1 nodrag nopan" onPointerDown={(e) => e.stopPropagation()}>
                                        {linkedDocs.length === 0 ? (
                                            <div className="text-sm text-slate-400 italic text-center py-6 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                                                No linked documents found. Please link a document.
                                            </div>
                                        ) : (
                                            linkedDocs.map(doc => (
                                                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-300 transition-colors">
                                                    <Checkbox 
                                                        id={`doc-${doc.id}`} 
                                                        checked={selectedDocIds.includes(doc.id)} 
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedDocIds([...selectedDocIds, doc.id]);
                                                            } else {
                                                                setSelectedDocIds(selectedDocIds.filter(id => id !== doc.id));
                                                            }
                                                        }}
                                                    />
                                                    <label htmlFor={`doc-${doc.id}`} className="text-sm font-medium leading-none cursor-pointer flex-1 truncate text-slate-700 dark:text-slate-300">
                                                        {doc.title || doc.id}
                                                    </label>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <Button 
                                onClick={handleExtract} 
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base font-medium"
                                disabled={selectedDocIds.length === 0}
                            >
                                <Play className="w-4 h-4 mr-2" /> Extract Options
                            </Button>
                        </div>
                    )}

                    {step === "EXTRACTING" && (
                        <div className="p-12">
                            <div className="text-center w-full">
                                <div className="mb-8 flex justify-center">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                                        <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-blue-500 border-l-4 border-l-transparent border-r-4 border-r-transparent relative z-10"></div>
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                                    Extracting Matrix...
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 h-5">
                                    {progressMessage}
                                </p>
                                
                                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden mb-4 shadow-inner border border-slate-200 dark:border-slate-700/50">
                                    <div 
                                        className="h-full bg-blue-500 transition-all duration-300 ease-out relative"
                                        style={{ width: `${Math.max(5, extractProgress)}%` }}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_2s_infinite]"></div>
                                    </div>
                                </div>
                                
                                <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-8">
                                    <span>{Math.round(extractProgress)}%</span>
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
