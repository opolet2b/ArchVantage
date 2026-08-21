import * as React from "react";
import { CanvasThing, useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, FileText, LayoutGrid, Info, Activity, DollarSign, ShieldAlert, RefreshCw } from "lucide-react";
import { useAnalyze } from "./use-analyze";

interface TimeMatrixViewerProps {
    thing: CanvasThing;
}

export type TimeStep = "WAITING" | "EXTRACTING" | "READY";

export interface TimeApp {
    id: string;
    name: string;
    technicalHealth: number; // 0 to 10
    businessValue: number; // 0 to 10
    runCost: number;
    riskProfile: string;
    quadrant: "Tolerate" | "Invest" | "Migrate" | "Eliminate";
    citations: string[];
}

export function TimeMatrixViewer({ thing }: TimeMatrixViewerProps) {
    const updateThing = useCanvasStore((state) => state.updateThing);
    const links = useCanvasStore((state) => state.links);
    const canvasId = useCanvasStore((state) => state.canvasId);
    const things = useCanvasStore((state) => state.things);
    const { analyze } = useAnalyze();
    const [extractProgress, setExtractProgress] = React.useState(0);
    const [selectedApp, setSelectedApp] = React.useState<TimeApp | null>(null);

    const linkedThings = links.filter((l) => l.target_id === thing.id || l.source_id === thing.id);

    const linkedDocs = React.useMemo(() => {
        return linkedThings.map(link => {
            const linkedThingId = link.source_id === thing.id ? link.target_id : link.source_id;
            const linkedThing = things.find(t => t.id === linkedThingId);
            return { linkId: link.id, linkedThingId, title: linkedThing?.title || 'Unknown Document' };
        });
    }, [linkedThings, things, thing.id]);

    const [selectedDocs, setSelectedDocs] = React.useState<Record<string, boolean>>({});

    React.useEffect(() => {
        setSelectedDocs(prev => {
            const next = { ...prev };
            let changed = false;
            linkedDocs.forEach(doc => {
                if (next[doc.linkedThingId] === undefined) {
                    next[doc.linkedThingId] = true;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [linkedDocs]);

    React.useEffect(() => {
        if (thing.content?.timeState?.step !== "EXTRACTING") {
            setExtractProgress((prev) => prev !== 0 ? 0 : prev);
        }
    }, [thing.content?.timeState?.step]);

    const stateContent: any = thing.content?.timeState || {};
    const step: TimeStep = stateContent.step || "WAITING";
    const apps: TimeApp[] = stateContent.apps || [];

    const updateTimeState = (updates: Partial<typeof stateContent>) => {
        updateThing(thing.id, {
            content: {
                ...thing.content,
                timeState: { ...stateContent, ...updates }
            }
        });
    };

    const checkStatus = React.useCallback(async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/time_matrix/status/${thing.id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.step === 'READY' && step !== 'READY') {
                    updateTimeState({ step: "READY", apps: data.apps });
                } else if (data.step === 'WAITING' && step !== 'WAITING') {
                    updateTimeState({ step: "WAITING", apps: [] });
                } else if (data.step === 'EXTRACTING' && step !== 'EXTRACTING') {
                    updateTimeState({ step: "EXTRACTING" });
                }
            }
        } catch (err) {
            console.error("Failed to check status", err);
        }
    }, [thing.id, step]);

    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (step === "EXTRACTING") {
            interval = setInterval(() => {
                checkStatus();
            }, 15000);
        }
        return () => clearInterval(interval);
    }, [step, checkStatus]);

    const handleExtract = async () => {
        const activeLinks = linkedThings.filter(link => {
            const linkedThingId = link.source_id === thing.id ? link.target_id : link.source_id;
            return selectedDocs[linkedThingId] !== false;
        });

        if (activeLinks.length === 0) {
            alert("Please select at least one document to extract application data.");
            return;
        }

        updateTimeState({ step: "EXTRACTING" });
        setExtractProgress(5);

        try {
            const selectedDocIds = activeLinks.map(link => link.source_id === thing.id ? link.target_id : link.source_id);
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/time_matrix/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    thing_id: thing.id,
                    selected_link_ids: selectedDocIds,
                    canvas_id: canvasId
                })
            });
            if (!res.ok) throw new Error("Time Matrix extraction failed");
            if (!res.body) throw new Error("No response body");

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let done = false;
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
                                setExtractProgress(10 + fraction * 80);
                            } else if (data.type === "completed") {
                                setExtractProgress(100);
                                const allApps = data.apps || [];
                                if (allApps.length === 0) {
                                    alert("No applications could be extracted from these documents.");
                                    updateTimeState({ step: "WAITING", apps: [] });
                                } else {
                                    updateTimeState({ step: "READY", apps: allApps });
                                }
                            } else if (data.type === "error") {
                                throw new Error(data.message);
                            }
                        } catch (e) {
                            console.error("Failed to parse SSE event:", e);
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error("Extraction failed:", error);
            updateTimeState({ step: "WAITING" });
        }
    };

    const [isExporting, setIsExporting] = React.useState(false);

    const handleExportWord = async () => {
        setIsExporting(true);
        try {
            const response = await fetch(`/api/v1/canvases/${canvasId}/export-time-matrix`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({ apps })
            });

            if (!response.ok) {
                throw new Error("Failed to export Word document");
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "TIME_Matrix_Export.docx";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error: any) {
            console.error("Export error:", error);
            alert(`Failed to export: ${error.message}`);
        } finally {
            setIsExporting(false);
        }
    };


    if (step === "READY") {
        return (
            <div className="flex w-full h-full min-h-0 bg-background text-foreground overflow-hidden">
                {/* Panel 1: Catalog List */}
                <div className="w-1/4 border-r flex flex-col p-4 bg-muted/10 overflow-y-auto">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-primary" /> Application Catalog
                    </h3>
                    <div className="flex flex-col gap-2">
                        {apps.map(app => (
                            <div 
                                key={app.id} 
                                className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${selectedApp?.id === app.id ? 'ring-2 ring-primary border-primary' : ''}`}
                                onClick={() => setSelectedApp(app)}
                            >
                                <div className="font-medium">{app.name}</div>
                                <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                                    <span>T: {app.technicalHealth} | V: {app.businessValue}</span>
                                    <Badge variant="outline" className="text-[10px]">{app.quadrant}</Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Panel 2: Interactive 2D Matrix */}
                <div className="flex-1 flex flex-col p-4 relative bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-lg">TIME Matrix Analysis</h3>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={handleExtract}>
                                <RefreshCw className="h-4 w-4 mr-2" /> Re-analyze
                            </Button>
                            <Button variant="default" size="sm" onClick={handleExportWord} disabled={isExporting}>
                                {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                                Export to Word
                            </Button>
                        </div>
                    </div>
                    
                    {/* Matrix Plot Area */}
                    <div className="flex-1 relative border-l-2 border-b-2 border-slate-300 dark:border-slate-700 m-4 ml-8 mb-8">
                        {/* Axes Labels */}
                        <div className="absolute -left-8 top-1/2 -translate-y-1/2 -rotate-90 text-sm font-medium text-slate-500 tracking-wider">
                            Business Value (0-10)
                        </div>
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-sm font-medium text-slate-500 tracking-wider">
                            Technical Health (0-10)
                        </div>

                        {/* Quadrant Lines (Crosshair) */}
                        <div className="absolute inset-0 flex">
                            <div className="w-1/2 border-r border-dashed border-slate-300 dark:border-slate-700 h-full"></div>
                        </div>
                        <div className="absolute inset-0 flex flex-col">
                            <div className="h-1/2 border-b border-dashed border-slate-300 dark:border-slate-700 w-full"></div>
                        </div>

                        {/* Quadrant Labels */}
                        <div className="absolute top-2 right-2 text-xl font-bold text-slate-300 dark:text-slate-700/50 pointer-events-none">INVEST</div>
                        <div className="absolute top-2 left-2 text-xl font-bold text-slate-300 dark:text-slate-700/50 pointer-events-none">MIGRATE</div>
                        <div className="absolute bottom-2 right-2 text-xl font-bold text-slate-300 dark:text-slate-700/50 pointer-events-none">TOLERATE</div>
                        <div className="absolute bottom-2 left-2 text-xl font-bold text-slate-300 dark:text-slate-700/50 pointer-events-none">ELIMINATE</div>

                        {/* Plot Bubbles */}
                        {apps.map(app => {
                            const left = `${(app.technicalHealth / 10) * 100}%`;
                            const bottom = `${(app.businessValue / 10) * 100}%`;
                            const size = Math.max(20, Math.min(60, (app.runCost || 10000) / 2000));
                            const isSelected = selectedApp?.id === app.id;
                            
                            let color = "bg-blue-500";
                            if (app.quadrant.toUpperCase() === "INVEST") color = "bg-green-500";
                            if (app.quadrant.toUpperCase() === "MIGRATE") color = "bg-amber-500";
                            if (app.quadrant.toUpperCase() === "ELIMINATE") color = "bg-red-500";
                            if (app.quadrant.toUpperCase() === "TOLERATE") color = "bg-slate-500";

                            return (
                                <div 
                                    key={app.id}
                                    onClick={() => setSelectedApp(app)}
                                    className={`absolute rounded-full ${color} opacity-80 cursor-pointer transition-all hover:scale-110 flex items-center justify-center shadow-lg ${isSelected ? 'ring-4 ring-primary ring-offset-2 opacity-100 z-10' : 'z-0'}`}
                                    style={{
                                        left, 
                                        bottom,
                                        width: size,
                                        height: size,
                                        transform: 'translate(-50%, 50%)'
                                    }}
                                    title={`${app.name} (Cost: $${app.runCost || 0})`}
                                >
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Panel 3: Context & Evidence Drawer */}
                <div className="w-1/4 border-l flex flex-col bg-muted/10">
                    <div className="p-4 border-b bg-muted/30">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <Info className="w-5 h-5 text-primary" /> Evidence
                        </h3>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto">
                        {selectedApp ? (
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-xl font-bold">{selectedApp.name}</h4>
                                    <Badge className="mt-2 text-sm">{selectedApp.quadrant}</Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-background p-3 rounded-md border text-center">
                                        <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Tech Health</div>
                                        <div className="text-2xl font-bold">{selectedApp.technicalHealth}/10</div>
                                    </div>
                                    <div className="bg-background p-3 rounded-md border text-center">
                                        <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Bus. Value</div>
                                        <div className="text-2xl font-bold">{selectedApp.businessValue}/10</div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                                        <span className="font-medium">Run Cost:</span> 
                                        <span>${selectedApp.runCost?.toLocaleString() || "N/A"}</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-sm">
                                        <ShieldAlert className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                        <div>
                                            <span className="font-medium">Risk Profile:</span> 
                                            <p className="text-muted-foreground mt-1">{selectedApp.riskProfile || "None reported"}</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h5 className="font-semibold text-sm mb-2 border-b pb-1">Document Citations</h5>
                                    {selectedApp.citations?.length > 0 ? (
                                        <ul className="space-y-2">
                                            {selectedApp.citations.map((cit, idx) => (
                                                <li key={idx} className="text-xs text-muted-foreground bg-background p-2 rounded border italic">
                                                    "{cit}"
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">No direct citations extracted.</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-center flex-col gap-2">
                                <LayoutGrid className="w-10 h-10 opacity-20" />
                                <p className="text-sm">Select an application from the matrix or catalog to view its evidence.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 h-full p-4 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <LayoutGrid className="h-5 w-5 text-primary" />
                <h3 className="text-md font-semibold">TIME Matrix Engine</h3>
            </div>

            {step === "WAITING" && (
                <div className="flex flex-col items-center justify-center flex-1 text-slate-500 gap-4 max-w-2xl mx-auto w-full px-4">
                    <div className="bg-muted/30 border rounded-lg p-6 w-full shadow-sm">
                        <h4 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
                            <Info className="h-5 w-5 text-primary" /> What is the TIME Matrix?
                        </h4>
                        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                            The <strong>TIME Matrix</strong> (Tolerate, Invest, Migrate, Eliminate) is a strategic portfolio management framework used to evaluate existing software applications. It scores applications across two main dimensions:
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5 mb-4">
                            <li><strong>Technical Health:</strong> Assesses code quality, architecture modernization, and technical debt.</li>
                            <li><strong>Business Value:</strong> Measures how critical the application is to business operations and strategic goals.</li>
                        </ul>
                        <p className="text-sm text-muted-foreground">
                            Based on these scores, applications are categorized into quadrants, guiding strategic decisions on whether to <em>invest</em> in them, <em>migrate</em> them, <em>tolerate</em> them, or <em>eliminate</em> them entirely.
                        </p>
                    </div>

                    <div className="text-center mt-4">
                        <p className="text-sm font-semibold text-foreground mb-2">1. Select Documents for Extraction</p>
                        <p className="text-xs">The LangGraph Engine will extract applications and score their Technical Health and Business Value.</p>
                    </div>
                    
                    <div className="w-full max-w-md bg-background border rounded-lg overflow-hidden mt-2 shadow-sm">
                        <div className="bg-muted/50 p-3 border-b flex justify-between items-center">
                            <span className="text-xs font-semibold flex items-center gap-2">
                                <FileText className="h-4 w-4" /> Available Documents ({linkedDocs.length})
                            </span>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto p-2">
                            {linkedDocs.length === 0 ? (
                                <div className="text-center text-xs text-muted-foreground py-8">
                                    No documents linked yet.<br/>Connect a document node to this matrix.
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {linkedDocs.map(doc => (
                                        <label key={doc.linkedThingId} className="flex items-center gap-3 p-2 hover:bg-muted/30 rounded cursor-pointer transition-colors">
                                            <input 
                                                type="checkbox" 
                                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                                checked={selectedDocs[doc.linkedThingId] !== false}
                                                onChange={(e) => {
                                                    setSelectedDocs(prev => ({
                                                        ...prev,
                                                        [doc.linkedThingId]: e.target.checked
                                                    }));
                                                }}
                                            />
                                            <span className="text-sm font-medium text-foreground truncate" title={doc.title}>{doc.title}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <Button 
                        onClick={handleExtract} 
                        disabled={linkedDocs.length === 0 || !Object.values(selectedDocs).some(v => v !== false)} 
                        className="mt-4"
                        size="lg"
                    >
                        <Play className="h-4 w-4 mr-2" /> Start Extraction Engine
                    </Button>
                </div>
            )}

            {step === "EXTRACTING" && (
                <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm mx-auto text-slate-500 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="w-full space-y-2">
                        <Progress value={extractProgress} className="h-2 w-full" />
                        <p className="text-sm font-medium animate-pulse text-center">Reading context & running multi-agent extraction...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
