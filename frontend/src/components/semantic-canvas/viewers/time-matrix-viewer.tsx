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

    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (thing.content?.timeState?.step === "EXTRACTING") {
            setExtractProgress(0);
            interval = setInterval(() => {
                setExtractProgress((prev) => {
                    if (prev >= 90) return 90;
                    return prev + Math.max(1, (90 - prev) * 0.1);
                });
            }, 500);
        } else {
            setExtractProgress((prev) => prev !== 0 ? 0 : prev);
        }
        return () => clearInterval(interval);
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

    const linkedThings = links.filter((l) => l.target_id === thing.id || l.source_id === thing.id);

    const handleExtract = async () => {
        if (linkedThings.length === 0) {
            alert("Please link at least one document to extract application data.");
            return;
        }

        updateTimeState({ step: "EXTRACTING" });

        try {
            const prompt = `You are an Enterprise Architect AI. Your task is to extract Application Portfolio data from the provided document to build a TIME Matrix (Tolerate, Invest, Migrate, Eliminate).
CRITICAL RULES:
1. Identify all software applications mentioned.
2. Extract or estimate 'Technical Health' (0 to 10) based on code quality, modern stack, etc.
3. Extract or estimate 'Business Value' (0 to 10) based on alignment, criticality, usage.
4. Extract 'runCost' as a numeric value if available (e.g., license fees).
5. Extract 'riskProfile' (e.g., SLA breaches, compliance issues).
6. Determine 'quadrant' strictly by these rules:
   - High Tech (>=5) + High Value (>=5) = Invest
   - Low Tech (<5) + High Value (>=5) = Migrate
   - High Tech (>=5) + Low Value (<5) = Tolerate
   - Low Tech (<5) + Low Value (<5) = Eliminate
7. Include 'citations' (exact snippets from text justifying the scores).

Return a JSON array of objects. Each object MUST have: id (string), name (string), technicalHealth (number), businessValue (number), runCost (number), riskProfile (string), quadrant (string), citations (array of strings). Only return the JSON array.`;

            const extractionPromises = linkedThings.map(async (link) => {
                const linkedThingId = link.source_id === thing.id ? link.target_id : link.source_id;
                const linkedThing = things.find(t => t.id === linkedThingId);
                const contentText = linkedThing?.content?.text || linkedThing?.title || "";
                
                return await analyze({ 
                    canvasId: canvasId || "",
                    thingId: linkedThingId,
                    fragment: { type: "text", content: typeof contentText === "string" ? contentText : JSON.stringify(contentText) } as any,
                    action: "ask",
                    customPrompt: prompt
                });
            });

            const results = await Promise.all(extractionPromises);
            let allApps: TimeApp[] = [];
            
            results.forEach((response) => {
                if (!response || !response.result) return;
                try {
                    let responseText = response.result;
                    if (responseText.includes('```json')) {
                        responseText = responseText.split('```json')[1].split('```')[0].trim();
                    } else if (responseText.includes('```')) {
                        responseText = responseText.split('```')[1].split('```')[0].trim();
                    }
                    const match = responseText.match(/\[[\s\S]*\]/);
                    let jsonStr = match ? match[0] : responseText;
                    
                    const extracted = JSON.parse(jsonStr);
                    if (Array.isArray(extracted)) {
                        allApps = [...allApps, ...extracted];
                    }
                } catch (e) {
                    console.error("Failed to parse JSON", e);
                }
            });

            if (allApps.length === 0) {
                alert("No applications could be extracted from these documents.");
                updateTimeState({ step: "WAITING", apps: [] });
            } else {
                updateTimeState({ step: "READY", apps: allApps });
            }
        } catch (error: any) {
            console.error("Extraction failed:", error);
            alert(`Extraction failed: ${error.message}`);
            updateTimeState({ step: "WAITING" });
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
                        <Button variant="outline" size="sm" onClick={handleExtract}>
                            <RefreshCw className="h-4 w-4 mr-2" /> Re-analyze
                        </Button>
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
                <div className="flex flex-col items-center justify-center flex-1 text-slate-500 gap-4">
                    <div className="text-center max-w-sm">
                        <p className="text-sm mb-2 font-semibold text-foreground">1. Link your Architectural Documents</p>
                        <p className="text-xs">The LangGraph Engine will extract applications and score their Technical Health and Business Value.</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium">
                        <FileText className="h-4 w-4" /> {linkedThings.length} Links Found
                    </div>
                    <Button onClick={handleExtract} disabled={linkedThings.length === 0} className="mt-2">
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
