import * as React from "react";
import { CanvasThing, useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, CheckCircle2, Loader2, Play, Plus, RefreshCw, FileText } from "lucide-react";
import { useAnalyze } from "./use-analyze";
import { SpreadsheetToolViewer } from "./spreadsheet-tool-viewer";

interface TradeOffMatrixViewerProps {
    thing: CanvasThing;
}

export type MatrixStep = "WAITING" | "EXTRACTING" | "VALIDATING" | "GENERATING" | "EDITING";

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
    const { analyze } = useAnalyze();
    const [extractProgress, setExtractProgress] = React.useState(0);

    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (thing.content?.matrixState?.step === "EXTRACTING") {
            setExtractProgress(0);
            interval = setInterval(() => {
                setExtractProgress((prev) => {
                    // Slow down progress as it gets closer to 90%
                    if (prev >= 90) return 90;
                    const increment = Math.max(1, (90 - prev) * 0.1);
                    return prev + increment;
                });
            }, 500);
        } else {
            setExtractProgress(0);
        }
        return () => clearInterval(interval);
    }, [thing.content?.matrixState?.step]);

    const stateContent: any = thing.content?.matrixState || {};
    const step: MatrixStep = stateContent.step || "WAITING";
    const options: Option[] = stateContent.options || [];

    const updateMatrixState = (updates: Partial<typeof stateContent>) => {
        updateThing(thing.id, {
            content: {
                ...thing.content,
                matrixState: { ...stateContent, ...updates }
            }
        });
    };
    const linkedThings = links.filter((l) => l.target_id === thing.id || l.source_id === thing.id);
    const handleExtract = async () => {
        console.log("[Trade-off Matrix] Starting extraction process...");
        console.log(`[Trade-off Matrix] Found ${linkedThings.length} linked documents.`);
        
        if (linkedThings.length === 0) {
            console.warn("[Trade-off Matrix] Extraction aborted: No documents linked.");
            alert("Please link at least one document to extract options from.");
            return;
        }

        updateMatrixState({ step: "EXTRACTING" });

        try {
            const prompt = `You are an expert Enterprise Architect analyzing a document. Your task is to identify and extract the different architectural scenarios, strategic decisions, or alternative options described in the text. 
CRITICAL RULES:
1. An "option" MUST be a distinct choice that can be selected INSTEAD of another option in a Trade-off Matrix (e.g., Option A vs. Option B).
2. DO NOT extract general principles, goals, best practices, normative frameworks, value chains, or scoring scales (e.g., "Digital-First", "Once-Only Principle", "0-3 points").
3. If the document defines a single normative standard or process without presenting competing alternatives, you MUST return an empty array [].
Return a JSON array where each object has a 'name' (string), 'description' (string), and 'category' (string) property. Only return the JSON array, nothing else.`;
            
            console.log("[Trade-off Matrix] Starting extraction process across documents using RAG pipeline...");
            
            // Query each document individually. This correctly routes through the backend's LlamaIndex RAG pipeline
            // for documents/slideshows that are too large to fit in the context window.
            const extractionPromises = linkedThings.map(async (link) => {
                const linkedThingId = link.source_id === thing.id ? link.target_id : link.source_id;
                const linkedThing = things.find(t => t.id === linkedThingId);
                const contentText = linkedThing?.content?.text || linkedThing?.title || "";
                const docName = linkedThing?.title || linkedThingId;
                
                const contentString = typeof contentText === "string" ? contentText : JSON.stringify(contentText);
                
                console.log(`[Trade-off Matrix] ---- PROCESSING DOCUMENT: ${docName} ----`);
                console.log(`[Trade-off Matrix] Document '${docName}' length: ${contentString.length} characters.`);
                console.log(`[Trade-off Matrix] Sending analysis request for document: ${docName}`);
                
                return {
                    docName,
                    response: await analyze({ 
                        canvasId: canvasId || "",
                        thingId: linkedThingId,
                        fragment: { type: "text", content: typeof contentText === "string" ? contentText : JSON.stringify(contentText) } as any,
                        action: "ask",
                        customPrompt: prompt
                    })
                };
            });

            const results = await Promise.all(extractionPromises);
            let allDomains: any[] = [];
            
            results.forEach(({ docName, response }) => {
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
                        allDomains = [...allDomains, ...extracted];
                    }
                } catch (e) {
                    console.error("Failed to parse JSON for doc:", docName, e);
                }
            });

            // Map domains to 2D Spreadsheet array
            const data: any[] = [];
            
            allDomains.forEach((domainData: any) => {
                const domainName = domainData.domain || "General Domain";
                const criteriaColumns = domainData.criteria_columns || ["Pros", "Cons", "Recommended Fit"];
                const alternatives = domainData.alternatives || [];
                
                // Title Row
                data.push([`Domain: ${domainName}`].concat(new Array(criteriaColumns.length).fill("")));
                // Header Row
                data.push(["Alternative"].concat(criteriaColumns));
                
                // Alternatives Rows
                alternatives.forEach((alt: any) => {
                    const evalRow = criteriaColumns.map((c: string) => alt.evaluations?.[c] || "TBD");
                    data.push([alt.name].concat(evalRow));
                });
                
                // Spacer Row
                data.push([""].concat(new Array(criteriaColumns.length).fill("")));
            });
            
            if (data.length > 0 && data[data.length - 1][0] === "") {
                data.pop();
            }

            if (data.length === 0) {
                alert("No trade-offs could be extracted from this document.");
                updateMatrixState({ step: "WAITING", options: [] });
            } else {
                updateThing(thing.id, {
                    content: {
                        ...thing.content,
                        matrixState: { ...stateContent, step: "EDITING", options: [] },
                        data,
                    }
                });
            }
        } catch (error: any) {
            console.error("Error during extraction process:", error);
            alert(`Extraction failed completely: ${error.message}`);
            updateMatrixState({ step: "WAITING" });
        }
    };

    // Removed handleGenerateMatrix since evaluation happens in one step



    if (step === "EDITING") {
        return (
            <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden relative group/spreadsheet w-full" style={{ height: '100%', width: '100%' }}>
                <div className="flex items-center justify-between p-2 border-b bg-muted/30 shrink-0">
                    <span className="text-xs font-semibold flex items-center gap-2">
                        <Table className="h-4 w-4" /> Trade-off Matrix
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => updateMatrixState({ step: "WAITING" })} className="h-6 px-2 text-xs">
                        <RefreshCw className="h-3 w-3 mr-1" /> Re-extract
                    </Button>
                </div>
                {/* We re-use SpreadsheetToolViewer for the powerful grid capabilities */}
                <div className="flex-1 relative min-h-0 min-w-0" style={{ height: '100%', width: '100%' }}>
                    <div className="absolute inset-0" style={{ height: '100%', width: '100%' }}>
                        <SpreadsheetToolViewer thing={thing} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 h-full p-4 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <Table className="h-5 w-5 text-primary" />
                <h3 className="text-md font-semibold">Trade-off Matrix Builder</h3>
            </div>

            {step === "WAITING" && (
                <div className="flex flex-col items-center justify-center flex-1 text-slate-500 gap-4">
                    <div className="text-center">
                        <p className="text-sm mb-2">1. Link documents containing alternatives</p>
                        <p className="text-xs text-muted-foreground">The AI will read them to extract your options.</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium">
                        <FileText className="h-4 w-4" /> {linkedThings.length} Links Found
                    </div>
                    <Button onClick={handleExtract} disabled={linkedThings.length === 0}>
                        <Play className="h-4 w-4 mr-2" /> Extract Options
                    </Button>
                </div>
            )}

            {step === "EXTRACTING" && (
                <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm mx-auto text-slate-500 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="w-full space-y-2">
                        <Progress value={extractProgress} className="h-2 w-full" />
                        <p className="text-sm font-medium animate-pulse text-center">Reading documents & extracting options...</p>
                    </div>
                </div>
            )}

        </div>
    );
}
