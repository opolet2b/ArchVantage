import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { FileUp, Search, CheckCircle2, GitBranch, Lightbulb, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { KnowledgeSource } from "./source-manager"
import { API_URL } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

export function OntologyManager({ sources, llmConfigId, extractedClasses, setExtractedClasses, selectedClasses, setSelectedClasses, extractedEdges, setExtractedEdges, selectedEdges, setSelectedEdges, selectedSourceIds, setSelectedSourceIds }: {
    sources: KnowledgeSource[],
    llmConfigId?: string,
    extractedClasses: { name: string, description: string, source?: string, category?: string }[],
    setExtractedClasses: React.Dispatch<React.SetStateAction<{ name: string, description: string, source?: string, category?: string }[]>>,
    selectedClasses: string[],
    setSelectedClasses: React.Dispatch<React.SetStateAction<string[]>>,
    extractedEdges: { source: string, target: string, relation: string, description: string }[],
    setExtractedEdges: React.Dispatch<React.SetStateAction<{ source: string, target: string, relation: string, description: string }[]>>,
    selectedEdges: string[],
    setSelectedEdges: React.Dispatch<React.SetStateAction<string[]>>,
    selectedSourceIds: string[],
    setSelectedSourceIds: React.Dispatch<React.SetStateAction<string[]>>
}) {
    const { toast } = useToast()
    const [creationMode, setCreationMode] = useState<"import" | "denovo" | null>(null)
    const [activePhase, setActivePhase] = useState("phase1")
    const [isExtracting, setIsExtracting] = useState(false)
    const [progressMessage, setProgressMessage] = useState("")
    const [sortBy, setSortBy] = useState<"none" | "alphabetical" | "source" | "category">("none")

    const [isExtractingEdges, setIsExtractingEdges] = useState(false)
    const [predicateProgress, setPredicateProgress] = useState("")
    const [edgeSortBy, setEdgeSortBy] = useState<"none" | "source_node" | "target_node" | "relation">("none")

    // Automatically switch to denovo mode if there's existing extraction data
    React.useEffect(() => {
        if (extractedClasses.length > 0 || extractedEdges.length > 0) {
            setCreationMode("denovo");
        }
    }, [extractedClasses.length, extractedEdges.length]);

    const handleStartExtraction = async () => {
        if (!llmConfigId) {
            toast({ title: "Validation Error", description: "Please select an LLM Config in the header first.", variant: "destructive" })
            return
        }

        setIsExtracting(true)
        setProgressMessage("Initializing extraction...")
        try {
            const selectedSourceData = sources.filter(s => selectedSourceIds.includes(s.id))
            const res = await fetch(`${API_URL}/knowledge/extract-taxonomy`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    llm_config_id: llmConfigId,
                    sources: selectedSourceData
                })
            })

            if (res.ok && res.body) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let done = false;

                while (!done) {
                    const { value, done: readerDone } = await reader.read();
                    done = readerDone;
                    if (value) {
                        const chunkStr = decoder.decode(value, { stream: true });
                        // The stream might yield multiple JSON objects back to back without newlines, or separated by newlines.
                        // Our python generator yields json.dumps() strings. We can try splitting by "}{" if they stick together, 
                        // but usually they come separated or cleanly. We will use a safe splitting technique.
                        const chunks = chunkStr.split(/(?<=})\s*(?={)/);

                        for (const chunk of chunks) {
                            if (!chunk.trim()) continue;
                            try {
                                const data = JSON.parse(chunk);
                                if (data.type === "progress") {
                                    setProgressMessage(data.message);
                                } else if (data.type === "result") {
                                    const newClasses = data.classes || [];

                                    setExtractedClasses((prev: any[]) => {
                                        const existingNames = new Set(prev.map(c => c.name));
                                        const additions = newClasses.filter((c: any) => !existingNames.has(c.name));

                                        // Auto-select ONLY the novel ones that just arrived
                                        if (additions.length > 0) {
                                            setSelectedClasses((prevSel: string[]) => [...prevSel, ...additions.map((c: any) => c.name)]);
                                        }

                                        return [...prev, ...additions];
                                    });

                                    setActivePhase("phase2");
                                    toast({ title: "Extraction Complete", description: `Found ${newClasses.length} potential classes.` });
                                }
                            } catch (e) {
                                console.warn("Could not parse stream chunk", chunk, e);
                            }
                        }
                    }
                }
            } else {
                let errDesc = "Unknown error";
                try { const err = await res.json(); errDesc = err.detail || errDesc; } catch (e) { }
                toast({ title: "Extraction Failed", description: errDesc, variant: "destructive" })
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Extraction Failed", description: "Network error occurred", variant: "destructive" })
        } finally {
            setIsExtracting(false)
            setProgressMessage("")
        }
    }

    const handleApproveTaxonomy = () => {
        toast({ title: "Taxonomy Approved", description: `Successfully finalized ${selectedClasses.length} classes for the ontology.` });
        setActivePhase("phase3");
    }

    const handleStartPredicateExtraction = async () => {
        if (!llmConfigId) {
            toast({ title: "Validation Error", description: "Please select an LLM Config in the header first.", variant: "destructive" })
            return
        }
        if (selectedClasses.length === 0) {
            toast({ title: "Validation Error", description: "You must approve classes in Phase 2 before extracting predicates.", variant: "destructive" })
            return
        }

        setIsExtractingEdges(true)
        setPredicateProgress("Initializing predicate extraction...")
        try {
            const selectedSourceData = sources.filter(s => selectedSourceIds.includes(s.id))
            const res = await fetch(`${API_URL}/knowledge/extract-predicates`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    llm_config_id: llmConfigId,
                    sources: selectedSourceData,
                    approved_classes: extractedClasses.filter(c => selectedClasses.includes(c.name))
                })
            })

            if (res.ok && res.body) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let done = false;

                while (!done) {
                    const { value, done: readerDone } = await reader.read();
                    done = readerDone;
                    if (value) {
                        const chunkStr = decoder.decode(value, { stream: true });
                        const chunks = chunkStr.split(/(?<=})\s*(?={)/);

                        for (const chunk of chunks) {
                            if (!chunk.trim()) continue;
                            try {
                                const data = JSON.parse(chunk);
                                if (data.type === "progress") {
                                    setPredicateProgress(data.message);
                                } else if (data.type === "result") {
                                    const newEdges = data.edges || [];
                                    setExtractedEdges((prev: any[]) => {
                                        const existingKeys = new Set(prev.map(e => `${e.source}|${e.relation}|${e.target}`));
                                        const additions = newEdges.filter((e: any) => !existingKeys.has(`${e.source}|${e.relation}|${e.target}`));

                                        if (additions.length > 0) {
                                            setSelectedEdges((prevSel: string[]) => [...prevSel, ...additions.map((e: any) => `${e.source}|${e.relation}|${e.target}`)]);
                                        }
                                        return [...prev, ...additions];
                                    });
                                    toast({ title: "Extraction Complete", description: `Found ${newEdges.length} potential relationships.` });
                                }
                            } catch (e) {
                                console.warn("Could not parse stream chunk", chunk, e);
                            }
                        }
                    }
                }
            } else {
                let errDesc = "Unknown error";
                try { const err = await res.json(); errDesc = err.detail || errDesc; } catch (e) { }
                toast({ title: "Extraction Failed", description: errDesc, variant: "destructive" })
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Extraction Failed", description: "Network error occurred", variant: "destructive" })
        } finally {
            setIsExtractingEdges(false)
            setPredicateProgress("")
        }
    }

    const handleApprovePredicates = () => {
        toast({ title: "Ontology Finalized", description: `Successfully approved ${selectedEdges.length} relationships.` });
        // Can trigger actual ArcadeDB save here or leave it to the Workspace Save Draft button
    }

    if (!creationMode) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-[400px]">
                <Card className="hover:border-indigo-400 cursor-pointer transition-colors" onClick={() => setCreationMode("import")}>
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto bg-indigo-50 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4 text-indigo-600">
                            <FileUp className="h-8 w-8" />
                        </div>
                        <CardTitle>Import Industry Standard</CardTitle>
                        <CardDescription>
                            Leverage existing official frameworks (e.g., Pharma, Legal, Finance).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground text-center">
                        <p>Supported Formats: OWL, RDF/TTL, JSON-LD</p>
                    </CardContent>
                </Card>

                <Card className="hover:border-blue-400 cursor-pointer transition-colors" onClick={() => setCreationMode("denovo")}>
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto bg-blue-50 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4 text-blue-600">
                            <Lightbulb className="h-8 w-8" />
                        </div>
                        <CardTitle>Systematic Creation (De Novo)</CardTitle>
                        <CardDescription>
                            Build a custom ontology from scratch using your source documents.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground text-center">
                        <p>Phase 1: Reference Corpus selection</p>
                        <p>Phase 2: Taxonomy extraction</p>
                        <p>Phase 3: Predicates definition</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (creationMode === "import") {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => setCreationMode(null)}>Back</Button>
                    <h3 className="text-lg font-medium">Import External Ontology</h3>
                </div>

                <Card className="border-dashed bg-muted/20">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <FileUp className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                        <h4 className="text-base font-semibold mb-2">Drag and drop your ontology file here</h4>
                        <p className="text-sm text-muted-foreground max-w-sm mb-6">
                            Supported formats: OWL (Web Ontology Language), RDF/XML, Turtle (TTL), and custom JSON-LD.
                        </p>
                        <Button>Browse Files</Button>
                    </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-3 mt-8">
                    <div className="md:col-span-3">
                        <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Or Use Built-in Templates</h4>
                    </div>
                    <Card className="cursor-pointer hover:border-indigo-400">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Pharma/Bio</CardTitle>
                            <CardDescription className="text-xs">MeSH, SNOMED CT</CardDescription>
                        </CardHeader>
                    </Card>
                    <Card className="cursor-pointer hover:border-indigo-400">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Legal</CardTitle>
                            <CardDescription className="text-xs">ELI (European Legislation Identifier)</CardDescription>
                        </CardHeader>
                    </Card>
                    <Card className="cursor-pointer hover:border-indigo-400">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Finance</CardTitle>
                            <CardDescription className="text-xs">FIBO (Financial Industry Business Ontology)</CardDescription>
                        </CardHeader>
                    </Card>
                </div>
            </div>
        )
    }

    if (creationMode === "denovo") {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => setCreationMode(null)}>Back</Button>
                    <h3 className="text-lg font-medium">Systematic Creation (De Novo)</h3>
                </div>

                <Tabs value={activePhase} onValueChange={setActivePhase} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="phase1">1. Reference Corpus</TabsTrigger>
                        <TabsTrigger value="phase2">2. Taxonomy</TabsTrigger>
                        <TabsTrigger value="phase3">3. Predicates</TabsTrigger>
                    </TabsList>

                    <TabsContent value="phase1" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base text-blue-900">Manual Selection of "Benchmark" Sources</CardTitle>
                                <CardDescription>Identify the most reliable subset of your configured sources to build the ground-truth ontology.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm text-left px-8 py-6 bg-muted/20 rounded-md border border-dashed flex flex-col gap-4">
                                    {sources.length === 0 ? (
                                        <p className="text-muted-foreground text-center">No sources configured yet. Go to step "1. Manage Sources" to add them.</p>
                                    ) : (
                                        sources.map((source) => (
                                            <div key={source.id} className="flex items-center space-x-3">
                                                <Checkbox
                                                    id={`source-${source.id}`}
                                                    checked={selectedSourceIds.includes(source.id)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) setSelectedSourceIds([...selectedSourceIds, source.id])
                                                        else setSelectedSourceIds(selectedSourceIds.filter(id => id !== source.id))
                                                    }}
                                                />
                                                <label htmlFor={`source-${source.id}`} className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2">
                                                    {source.name}
                                                    <Badge variant="outline" className="uppercase text-[10px]">{source.type}</Badge>
                                                </label>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-between items-center">
                                <div className="text-xs text-indigo-600 font-medium truncate max-w-[300px]">
                                    {isExtracting && progressMessage}
                                </div>
                                <Button
                                    className="bg-blue-600 w-[160px]"
                                    onClick={handleStartExtraction}
                                    disabled={selectedSourceIds.length === 0 || isExtracting}
                                >
                                    {isExtracting ? (
                                        <>Extracting... <Loader2 className="w-4 h-4 ml-2 animate-spin" /></>
                                    ) : (
                                        <>Start Extraction <Search className="w-4 h-4 ml-2" /></>
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="phase2" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base text-blue-900">Automatic Extraction & Validation</CardTitle>
                                <CardDescription>Select, organize, and review the entity types (classes) automatically extracted from your corpus.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between mb-4 bg-muted/40 p-2 rounded-md border text-sm">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="select-all"
                                            checked={selectedClasses.length === extractedClasses.length && extractedClasses.length > 0}
                                            onCheckedChange={(checked) => {
                                                if (checked) setSelectedClasses(extractedClasses.map(c => c.name))
                                                else setSelectedClasses([])
                                            }}
                                        />
                                        <label htmlFor="select-all" className="font-medium cursor-pointer">
                                            Select All ({selectedClasses.length}/{extractedClasses.length})
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground mr-2">Sort/Group By:</span>
                                        <select
                                            className="px-2 py-1 rounded border bg-background text-sm"
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value as any)}
                                        >
                                            <option value="none">None (As Extracted)</option>
                                            <option value="alphabetical">Alphabetical</option>
                                            <option value="source">Context Source</option>
                                            <option value="category">Category</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="text-sm text-left px-8 py-6 bg-muted/20 rounded-md border border-dashed flex flex-col gap-4 max-h-[400px] overflow-y-auto">
                                    {extractedClasses.length === 0 ? (
                                        <p className="text-muted-foreground text-center">No classes extracted yet. Run the extraction from Step 1.</p>
                                    ) : (
                                        (() => {
                                            let displayList = [...extractedClasses];
                                            if (sortBy === "alphabetical") {
                                                displayList.sort((a, b) => a.name.localeCompare(b.name));
                                            } else if (sortBy === "source") {
                                                displayList.sort((a, b) => (a.source || "").localeCompare(b.source || ""));
                                            } else if (sortBy === "category") {
                                                displayList.sort((a, b) => (a.category || "").localeCompare(b.category || ""));
                                            }

                                            let currentGroup = "";

                                            return displayList.map((cls, idx) => {
                                                const showGroupHeader = (sortBy === "source" && cls.source !== currentGroup) || (sortBy === "category" && cls.category !== currentGroup);
                                                if (showGroupHeader) {
                                                    currentGroup = (sortBy === "source" ? cls.source : cls.category) || "Uncategorized";
                                                }

                                                return (
                                                    <React.Fragment key={idx}>
                                                        {showGroupHeader && (
                                                            <div className="mt-4 mb-2 border-b pb-1 font-semibold text-indigo-800 uppercase tracking-widest text-xs">
                                                                {currentGroup}
                                                            </div>
                                                        )}
                                                        <div className="flex items-start gap-4 p-3 bg-background rounded border transition-colors hover:border-blue-300">
                                                            <Checkbox
                                                                id={`cls-${idx}`}
                                                                className="mt-1"
                                                                checked={selectedClasses.includes(cls.name)}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) setSelectedClasses([...selectedClasses, cls.name])
                                                                    else setSelectedClasses(selectedClasses.filter(n => n !== cls.name))
                                                                }}
                                                            />
                                                            <div className="flex-1">
                                                                <label htmlFor={`cls-${idx}`} className="font-bold text-blue-900 cursor-pointer block">{cls.name}</label>
                                                                <div className="text-muted-foreground text-xs mt-1">{cls.description}</div>

                                                                <div className="flex gap-2 mt-2">
                                                                    {cls.category && <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-800 hover:bg-purple-200">{cls.category}</Badge>}
                                                                    {cls.source && <Badge variant="outline" className="text-[10px] text-muted-foreground">{cls.source}</Badge>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </React.Fragment>
                                                )
                                            })
                                        })()
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-end">
                                <Button
                                    className="bg-blue-600"
                                    disabled={selectedClasses.length === 0}
                                    onClick={handleApproveTaxonomy}
                                >
                                    Approve {selectedClasses.length} Classes <CheckCircle2 className="w-4 h-4 ml-2" />
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="phase3" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base text-blue-900">Define Fundamental Relations</CardTitle>
                                <CardDescription>Automatically discover and validate the predicates (relationships) between your {selectedClasses.length} approved classes.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {selectedClasses.length === 0 && (
                                    <div className="text-sm text-yellow-700 bg-yellow-50 p-4 rounded border border-yellow-200 mb-4">
                                        <AlertCircle className="w-5 h-5 inline mr-2" />
                                        Please approve at least one taxonomy class in Phase 2 before extracting relationships.
                                    </div>
                                )}
                                <div className="flex items-center justify-between mb-4 bg-muted/40 p-2 rounded-md border text-sm">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="select-all-edges"
                                            checked={selectedEdges.length === extractedEdges.length && extractedEdges.length > 0}
                                            onCheckedChange={(checked) => {
                                                if (checked) setSelectedEdges(extractedEdges.map(e => `${e.source}|${e.relation}|${e.target}`))
                                                else setSelectedEdges([])
                                            }}
                                        />
                                        <label htmlFor="select-all-edges" className="font-medium cursor-pointer">
                                            Select All ({selectedEdges.length}/{extractedEdges.length})
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground mr-2">Sort/Group By:</span>
                                        <select
                                            className="px-2 py-1 rounded border bg-background text-sm"
                                            value={edgeSortBy}
                                            onChange={(e) => setEdgeSortBy(e.target.value as any)}
                                        >
                                            <option value="none">None (As Extracted)</option>
                                            <option value="source_node">Subject (Source Node)</option>
                                            <option value="target_node">Object (Target Node)</option>
                                            <option value="relation">Predicate (Relation Type)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="text-sm text-left px-8 py-6 bg-muted/20 rounded-md border border-dashed flex flex-col gap-4 max-h-[400px] overflow-y-auto">
                                    {extractedEdges.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                                            <p className="mb-4">No relations extracted yet.</p>
                                            <Button
                                                variant="outline"
                                                className="bg-background"
                                                disabled={selectedClasses.length === 0 || isExtractingEdges}
                                                onClick={handleStartPredicateExtraction}
                                            >
                                                {isExtractingEdges ? (
                                                    <>Extracting Predicates... <Loader2 className="w-4 h-4 ml-2 animate-spin" /></>
                                                ) : (
                                                    <>Extract Predicates via AI <Search className="w-4 h-4 ml-2" /></>
                                                )}
                                            </Button>
                                        </div>
                                    ) : (
                                        (() => {
                                            let displayList = [...extractedEdges];
                                            if (edgeSortBy === "source_node") {
                                                displayList.sort((a, b) => a.source.localeCompare(b.source));
                                            } else if (edgeSortBy === "target_node") {
                                                displayList.sort((a, b) => a.target.localeCompare(b.target));
                                            } else if (edgeSortBy === "relation") {
                                                displayList.sort((a, b) => a.relation.localeCompare(b.relation));
                                            }

                                            let currentGroup = "";

                                            return displayList.map((edge, idx) => {
                                                const showGroupHeader =
                                                    (edgeSortBy === "source_node" && edge.source !== currentGroup) ||
                                                    (edgeSortBy === "target_node" && edge.target !== currentGroup) ||
                                                    (edgeSortBy === "relation" && edge.relation !== currentGroup);

                                                if (showGroupHeader) {
                                                    if (edgeSortBy === "source_node") currentGroup = edge.source;
                                                    else if (edgeSortBy === "target_node") currentGroup = edge.target;
                                                    else if (edgeSortBy === "relation") currentGroup = edge.relation;
                                                }

                                                const edgeKey = `${edge.source}|${edge.relation}|${edge.target}`;

                                                return (
                                                    <React.Fragment key={idx}>
                                                        {showGroupHeader && (
                                                            <div className="mt-4 mb-2 border-b pb-1 font-semibold text-indigo-800 uppercase tracking-widest text-xs">
                                                                {currentGroup}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-4 p-3 bg-background rounded border transition-colors hover:border-blue-300">
                                                            <Checkbox
                                                                id={`edge-${idx}`}
                                                                checked={selectedEdges.includes(edgeKey)}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) setSelectedEdges([...selectedEdges, edgeKey])
                                                                    else setSelectedEdges(selectedEdges.filter(k => k !== edgeKey))
                                                                }}
                                                            />
                                                            <div className="flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                                <div className="flex items-center gap-3 text-sm font-medium">
                                                                    <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">{edge.source}</Badge>
                                                                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-mono bg-muted px-2 py-1 rounded">--[{edge.relation}]--&gt;</span>
                                                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">{edge.target}</Badge>
                                                                </div>
                                                                <div className="text-muted-foreground text-xs italic md:max-w-[40%] text-right">
                                                                    "{edge.description}"
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </React.Fragment>
                                                )
                                            })
                                        })()
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-between items-center">
                                <div className="text-xs text-indigo-600 font-medium truncate max-w-[300px]">
                                    {isExtractingEdges && predicateProgress}
                                </div>
                                <div className="space-x-2">
                                    {extractedEdges.length > 0 && (
                                        <Button
                                            variant="outline"
                                            disabled={isExtractingEdges}
                                            onClick={handleStartPredicateExtraction}
                                        >
                                            {isExtractingEdges ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                            Re-Extract
                                        </Button>
                                    )}
                                    <Button
                                        className="bg-blue-600"
                                        disabled={selectedEdges.length === 0}
                                        onClick={handleApprovePredicates}
                                    >
                                        Finalize Ontology ({selectedEdges.length}) <GitBranch className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        )
    }

    return null
}
