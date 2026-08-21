import * as React from "react";
import { CanvasThing, useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, CheckCircle2, Loader2, Play, Plus, RefreshCw, FileText, Download } from "lucide-react";
import { Document, Paragraph, Table as DocxTable, TableRow, TableCell, TextRun, WidthType, BorderStyle, HeadingLevel } from "docx";
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
    const [methodology, setMethodology] = React.useState("LLM Generated");

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

    const handleExtract = async () => {
        const selectedDocs = linkedDocs.filter(d => selectedDocIds.includes(d.id));
        console.log("[Trade-off Matrix] Starting extraction process...");
        console.log(`[Trade-off Matrix] Found ${selectedDocs.length} selected documents out of ${linkedDocs.length} linked.`);
        
        if (selectedDocs.length === 0) {
            console.warn("[Trade-off Matrix] Extraction aborted: No documents selected.");
            alert("Please select at least one document to extract options from.");
            return;
        }

        updateMatrixState({ step: "EXTRACTING" });

        try {
            const prompt = `You are an expert Enterprise Architect analyzing a document. Your task is to identify and extract the different architectural scenarios, strategic decisions, or alternative options described in the text. 
METHODOLOGY: ${methodology}
CRITICAL RULES:
1. An "option" MUST be a distinct choice that can be selected INSTEAD of another option in a Trade-off Matrix (e.g., Option A vs. Option B).
2. DO NOT extract general principles, goals, best practices, normative frameworks, value chains, or scoring scales (e.g., "Digital-First", "Once-Only Principle", "0-3 points").
3. If the document defines a single normative standard or process without presenting competing alternatives, you MUST return an empty array [].
Return a JSON array where each object has a 'name' (string), 'description' (string), and 'category' (string) property. Only return the JSON array, nothing else.`;
            
            console.log("[Trade-off Matrix] Starting extraction process across documents using RAG pipeline...");
            
            // Query each document individually. This correctly routes through the backend's LlamaIndex RAG pipeline
            // for documents/slideshows that are too large to fit in the context window.
            const extractionPromises = selectedDocs.map(async (linkedThing) => {
                const linkedThingId = linkedThing.id;
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
                <div className="flex items-center justify-between p-2 border-b bg-muted/30 shrink-0">
                    <span className="text-xs font-semibold flex items-center gap-2">
                        <Table className="h-4 w-4" /> Trade-off Matrix
                    </span>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={exportToWord} className="h-6 px-2 text-xs">
                            <Download className="h-3 w-3 mr-1" /> Export to Word
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => updateMatrixState({ step: "WAITING" })} className="h-6 px-2 text-xs">
                            <RefreshCw className="h-3 w-3 mr-1" /> Re-extract
                        </Button>
                    </div>
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
                    <div className="text-center max-w-md">
                        <p className="text-sm mb-2 text-foreground font-medium">About this tool</p>
                        <p className="text-xs text-muted-foreground mb-4">
                            The format comparing alternatives by Pros, Cons, and Recommended Fit aligns with standard practices like the Architecture Tradeoff Analysis Method (ATAM) by SEI or Architecture Decision Records (ADRs).
                        </p>
                        <p className="text-sm mb-2 font-medium text-foreground">1. Select extraction methodology</p>
                        <div className="mb-4 w-full nodrag nopan" onPointerDown={(e) => e.stopPropagation()}>
                            <select 
                                value={methodology} 
                                onChange={(e) => setMethodology(e.target.value)}
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="LLM Generated">LLM Generated (Dynamic)</option>
                                <option value="TOGAF">TOGAF</option>
                                <option value="Zachman Framework">Zachman Framework</option>
                                <option value="DODAF">DODAF</option>
                            </select>
                        </div>
                        <p className="text-sm mb-2 font-medium text-foreground">2. Select context documents</p>
                        <p className="text-xs text-muted-foreground mb-4">The AI will read them to extract your options.</p>
                        
                        <div className="flex flex-col gap-2 w-full text-left mb-4 max-h-32 overflow-y-auto px-2 py-1 nodrag nopan" onPointerDown={(e) => e.stopPropagation()}>
                            {linkedDocs.length === 0 ? (
                                <div className="text-xs italic text-muted-foreground text-center flex flex-col items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    No linked documents found. Please link a document.
                                </div>
                            ) : (
                                linkedDocs.map(doc => (
                                    <div key={doc.id} className="flex items-center space-x-2 bg-muted/30 p-2 rounded-md">
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
                                        <label htmlFor={`doc-${doc.id}`} className="text-sm font-medium leading-none cursor-pointer flex-1 truncate">
                                            {doc.title || "Untitled Document"}
                                        </label>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <Button onClick={handleExtract} disabled={selectedDocIds.length === 0}>
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
