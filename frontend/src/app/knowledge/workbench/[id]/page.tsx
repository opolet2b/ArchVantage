"use client";

import React, { useState } from "react";
import { ChevronLeft, Save, Plus, Link as LinkIcon, Box, FileText, Database, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { CytoscapeGraph } from "@/components/knowledge-graph/cytoscape-graph";
import ReconciliationCenter from "@/components/knowledge-graph/reconciliation-center";
import { SourceManager, type KnowledgeSource } from "@/components/knowledge-graph/source-manager";
import { OntologyManager } from "@/components/knowledge-graph/ontology-manager";
import { Switch } from "@/components/ui/switch";
import { API_URL } from "@/lib/utils";

export default function KnowledgeWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
    const unwrappedParams = React.use(params);
    const isNew = unwrappedParams.id === "new";
    const [activeTab, setActiveTab] = useState("sources");
    const [sources, setSources] = useState<KnowledgeSource[]>([]);
    const [kbMeta, setKbMeta] = useState({
        name: isNew ? "Untitled Knowledge Base" : "Pharma Research Graph",
        description: isNew ? "" : "Knowledge graph containing clinical trial data mapped to the OMOP vocabulary."
    });
    const [extractedClasses, setExtractedClasses] = useState<any[]>([]);
    const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
    const [extractedEdges, setExtractedEdges] = useState<any[]>([]);
    const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
    const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
    const [ingestionStatus, setIngestionStatus] = useState<string>("idle");
    const [isEstablishing, setIsEstablishing] = useState<boolean>(false);
    const [forceReindex, setForceReindex] = useState<boolean>(false);

    const [presets, setPresets] = useState<any[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<string>("");

    const { toast } = useToast();
    const router = useRouter();

    React.useEffect(() => {
        const fetchPresets = async () => {
            try {
                const res = await fetch(`${API_URL}/config/presets`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setPresets(data.presets || []);
                }
            } catch (error) {
                console.error("Failed to fetch LLM presets", error);
            }
        };
        fetchPresets();
    }, []);

    const fetchKB = React.useCallback(async () => {
        if (!isNew && unwrappedParams.id) {
            try {
                const res = await fetch(`${API_URL}/knowledge/kb/${unwrappedParams.id}`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setKbMeta({ name: data.name || "", description: data.description || "" });
                    setSelectedPreset(data.llm_config_id || "");
                    setSources(data.sources || []);
                    const loadedClasses = data.ontology_classes || [];
                    setExtractedClasses(loadedClasses);
                    setSelectedClasses(loadedClasses.filter((c: any) => c.approved !== false).map((c: any) => c.name));

                    const loadedEdges = data.ontology_edges || [];
                    setExtractedEdges(loadedEdges);
                    setSelectedEdges(loadedEdges.filter((e: any) => e.approved !== false).map((e: any) => `${e.source}|${e.relation}|${e.target}`));

                    setSelectedSourceIds(data.selected_source_ids || []);
                    setIngestionStatus(data.ingestion_status || "idle");
                }
            } catch (error) {
                console.error("Failed to fetch KB config", error);
                toast({ title: "Error", description: "Could not load Knowledge Base configuration.", variant: "destructive" });
            }
        }
    }, [isNew, unwrappedParams.id]);

    React.useEffect(() => {
        fetchKB();
    }, [fetchKB]);

    // Polling for ingestion status if running
    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (ingestionStatus === "running") {
            interval = setInterval(async () => {
                if (!isNew && unwrappedParams.id) {
                    try {
                        const res = await fetch(`${API_URL}/knowledge/kb/${unwrappedParams.id}`, {
                            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                        });
                        if (res.ok) {
                            const data = await res.json();
                            setIngestionStatus(data.ingestion_status || "idle");
                        }
                    } catch (error) {
                        console.error("Polling error", error);
                    }
                }
            }, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [ingestionStatus, isNew, unwrappedParams.id]);

    const handleSaveDraft = async () => {
        const payload = {
            name: kbMeta.name,
            description: kbMeta.description,
            llm_config_id: selectedPreset,
            sources: sources,
            selected_source_ids: selectedSourceIds,
            ontology_classes: extractedClasses.map(c => ({ ...c, approved: selectedClasses.includes(c.name) })),
            ontology_edges: extractedEdges.map(e => ({ ...e, approved: selectedEdges.includes(`${e.source}|${e.relation}|${e.target}`) })),
            status: "draft"
        };

        try {
            const url = isNew ? `${API_URL}/knowledge/kb` : `${API_URL}/knowledge/kb/${unwrappedParams.id}`;
            const method = isNew ? "POST" : "PUT";
            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                toast({ title: "Configuration Saved", description: "Successfully saved Knowledge Base configuration." });
                if (isNew) {
                    router.push(`/knowledge/workbench/${data.id}`);
                }
            } else {
                toast({ title: "Save Failed", description: "Failed to save the Knowledge Base configuration.", variant: "destructive" });
            }
        } catch (error) {
            console.error("Save error", error);
            toast({ title: "Save Failed", description: "Network error occurred while saving.", variant: "destructive" });
        }
    };

    const handleEstablishDB = async () => {
        if (isNew) {
            toast({ title: "Save Configuration First", description: "You must save the Knowledge Base configuration before establishing it.", variant: "destructive" });
            return;
        }

        setIsEstablishing(true);
        try {
            const res = await fetch(`${API_URL}/knowledge/kb/${unwrappedParams.id}/establish?force=${forceReindex}`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                }
            });

            if (res.ok) {
                toast({ title: "Knowledge Base Established", description: forceReindex ? "Full re-index started!" : "Incremental update started!" });
                // Instantly set to running to show the UI spinner for the background ingestion step
                setIngestionStatus("running");
                // Reset force toggle after kick-off
                setForceReindex(false);
                // Refresh graph tab availability or status
                fetchKB();
            } else {
                toast({ title: "Establishment Failed", description: "Failed to create graph schema.", variant: "destructive" });
            }
        } catch (error) {
            console.error("Establish error", error);
            toast({ title: "Establishment Failed", description: "Network error occurred.", variant: "destructive" });
        } finally {
            setIsEstablishing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden relative">
            {/* Header */}
            <div className="h-14 border-b flex items-center justify-between px-4 bg-background z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <Link href="/knowledge" className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronLeft className="h-4 w-4" />
                        BACK TO LIBRARY
                    </Link>
                    <div className="h-6 w-px bg-slate-200 mx-2" />
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600">
                            <Database className="h-5 w-5" />
                        </div>
                        <div>
                            <Input
                                value={kbMeta.name}
                                onChange={(e) => setKbMeta({ ...kbMeta, name: e.target.value })}
                                className="font-bold text-sm leading-none text-slate-800 h-6 border-transparent hover:border-input focus-visible:ring-0 p-0 shadow-none px-1 -ml-1 w-[300px]"
                            />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-[200px]">
                        <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                            <SelectTrigger className="h-8 text-xs border-dashed border-slate-300">
                                <SelectValue placeholder="Select LLM Config" />
                            </SelectTrigger>
                            <SelectContent>
                                {presets.map(p => (
                                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleSaveDraft} className="rounded-full px-6 font-semibold border-slate-300">
                        <Save className="mr-2 h-4 w-4" /> SAVE CONFIGURATION
                    </Button>
                    <div className="flex items-center gap-2 border-l pl-3 mr-1">
                        <Switch
                            id="force-reindex"
                            checked={forceReindex}
                            onCheckedChange={setForceReindex}
                            className="scale-75"
                        />
                        <Label htmlFor="force-reindex" className="text-[10px] font-bold text-muted-foreground cursor-pointer uppercase tracking-tighter">
                            Force re-index
                        </Label>
                    </div>
                    <Button size="sm" onClick={handleEstablishDB} disabled={isEstablishing || ingestionStatus === 'running'} className="bg-slate-900 hover:bg-black text-white rounded-full px-6 font-semibold shadow-lg shadow-slate-900/10">
                        {isEstablishing || ingestionStatus === 'running' ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isEstablishing ? 'Initializing Graph...' : 'Ingesting Data...'}</>
                        ) : (
                            <><Database className="mr-2 h-4 w-4" /> {isNew ? "Establish Knowledge Base" : "Update Knowledge Base"}</>
                        )}
                    </Button>
                </div>
            </div>

            {/* Main Workbench Layout */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-6 max-w-7xl mx-auto w-full">

                {/* Meta Section (Description) */}
                <div className="mb-6 space-y-2 shrink-0">
                    <Label className="text-muted-foreground text-xs uppercase font-bold tracking-wider">Description</Label>
                    <Textarea
                        placeholder="Describe the purpose of this Knowledge Base..."
                        className="resize-none h-20 bg-muted/20 border-dashed"
                        value={kbMeta.description}
                        onChange={(e) => setKbMeta({ ...kbMeta, description: e.target.value })}
                    />
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <TabsList className="w-fit mb-6 shrink-0">
                        <TabsTrigger value="sources" className="flex items-center gap-2">
                            <LinkIcon className="h-4 w-4" /> 1. Manage Sources
                        </TabsTrigger>
                        <TabsTrigger value="ontology" className="flex items-center gap-2">
                            <Box className="h-4 w-4" /> 2. Ontology & Schema
                        </TabsTrigger>
                        <TabsTrigger value="graph" className="flex items-center gap-2" disabled={isNew}>
                            <FileText className="h-4 w-4" /> 3. Graph Explorer
                        </TabsTrigger>
                        <TabsTrigger value="reconciliation" className="flex items-center gap-2" disabled={isNew}>
                            <Database className="h-4 w-4" /> 4. Reconciliation
                        </TabsTrigger>
                    </TabsList>

                    {/* Step 1: Sources */}
                    <TabsContent value="sources" className="flex-1 min-h-0 mt-0 outline-none overflow-y-auto pr-2 pb-10">
                        <SourceManager sources={sources} setSources={setSources} />
                    </TabsContent>

                    {/* Step 2: Ontology */}
                    <TabsContent value="ontology" className="flex-1 min-h-0 mt-0 outline-none overflow-y-auto pr-2 pb-10">
                        <OntologyManager
                            sources={sources}
                            llmConfigId={selectedPreset}
                            extractedClasses={extractedClasses}
                            setExtractedClasses={setExtractedClasses}
                            selectedClasses={selectedClasses}
                            setSelectedClasses={setSelectedClasses}
                            extractedEdges={extractedEdges}
                            setExtractedEdges={setExtractedEdges}
                            selectedEdges={selectedEdges}
                            setSelectedEdges={setSelectedEdges}
                            selectedSourceIds={selectedSourceIds}
                            setSelectedSourceIds={setSelectedSourceIds}
                        />
                    </TabsContent>

                    {/* Step 3: Cytoscape (Only if established!) */}
                    <TabsContent value="graph" className="flex-1 min-h-0 flex flex-col mt-0 outline-none border rounded-xl overflow-hidden bg-muted/20 pb-16">
                        <CytoscapeGraph
                            kbId={unwrappedParams.id}
                            ingestionStatus={ingestionStatus}
                            sources={sources}
                            ontologyClasses={selectedClasses}
                        />
                    </TabsContent>

                    {/* Step 4: Reconciliation (Only if established!) */}
                    <TabsContent value="reconciliation" className="flex-1 min-h-0 mt-0 outline-none overflow-y-auto pr-2 pb-10">
                        <ReconciliationCenter kbId={unwrappedParams.id} approvedClasses={selectedClasses} />
                    </TabsContent>

                </Tabs>
            </div>
        </div>
    );
}
