"use client";

import { useSearchParams } from "next/navigation";

import React, { useState, useEffect } from "react";
// Removed StudioSidebar and ModuleItem import
import { StudioCanvas, PipelineStep } from "@/components/studio/studio-canvas";
import { StudioConfigPanel } from "@/components/studio/studio-config-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, ChevronLeft, FileText, Settings } from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

// Fixed Pipeline Steps Definition
const FIXED_STEPS: PipelineStep[] = [
    { id: "step_extractor", moduleId: "mod_extractor", type: "extractor", name: "Data Extractor", config: {}, description: "Extract specific sections or data points." },
    { id: "step_agent", moduleId: "mod_agent", type: "agent", name: "Analyzer", config: {}, description: "Analyze content using a Persona and Framework." },
    { id: "step_visualizer", moduleId: "mod_visualizer", type: "visualizer", name: "Visualizer", config: {}, description: "Generate structural visualizations (Graphs, Tables)." },
    { id: "step_formatter", moduleId: "mod_formatter", type: "formatter", name: "Formatter", config: {}, description: "Format the analysis results (JSON, Markdown)." },
];

export default function StudioPage() {
    const { toast } = useToast();
    // Initialize with FIXED_STEPS by default
    const [steps, setSteps] = useState<PipelineStep[]>(FIXED_STEPS);
    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [templateMeta, setTemplateMeta] = useState({
        name: "",
        category_name: "General",
        description: "",
    });

    const [presets, setPresets] = useState<any[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<string>("");

    // Taxonomy State
    const [taxonomies, setTaxonomies] = useState<any[]>([]);
    const [selectedTaxonomyId, setSelectedTaxonomyId] = useState<string>("");

    // Document Templates State
    const [docTemplates, setDocTemplates] = useState<any[]>([]);
    const [selectedDocTemplateId, setSelectedDocTemplateId] = useState<string>("none");

    const searchParams = useSearchParams();
    const templateId = searchParams.get("templateId");

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Presets
                const resPresets = await fetch(`${API_URL}/config/presets`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                });
                const dataPresets = await resPresets.json();
                setPresets(dataPresets.presets || []);

                // Fetch Taxonomies
                let loadedTaxonomies: any[] = [];
                const resTaxonomies = await fetch(`${API_URL}/smart-templates/taxonomies`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                });
                if (resTaxonomies.ok) {
                    const dataTaxonomies = await resTaxonomies.json();
                    setTaxonomies(dataTaxonomies);
                    loadedTaxonomies = dataTaxonomies;
                }

                // Fetch Document Templates Tree
                const resTree = await fetch(`${API_URL}/templates/tree`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                });
                if (resTree.ok) {
                    const treeData = await resTree.json();
                    // Helper to flatten the tree into a list with full paths
                    const flatten = (nodes: any[], prefix = ""): any[] => {
                        let result: any[] = [];
                        nodes.forEach((n: any) => {
                            // 1. If it's a template node (e.g. at root), add it
                            if (n.type === 'template') {
                                result.push({ ...n, pathName: prefix + n.name });
                            }

                            // 2. If it's a folder, process its contents
                            if (n.type === 'folder') {
                                const folderPath = prefix + n.name + " / ";

                                // Process nested templates in this folder
                                if (n.templates && Array.isArray(n.templates)) {
                                    n.templates.forEach((t: any) => {
                                        result.push({ ...t, pathName: folderPath + t.name });
                                    });
                                }

                                // Recurse into subfolders
                                if (n.children && Array.isArray(n.children)) {
                                    result = [...result, ...flatten(n.children, folderPath)];
                                }
                            }
                        });
                        return result;
                    };
                    setDocTemplates(flatten(treeData.tree || []));
                }

                // Fetch Template if ID exists
                if (templateId) {
                    const resTemplate = await fetch(`${API_URL}/smart-templates/templates/${templateId}`);
                    if (resTemplate.ok) {
                        const templateData = await resTemplate.json();
                        // Populate state
                        setTemplateMeta({
                            name: templateData.name,
                            category_name: templateData.category_name,
                            description: templateData.description || "",
                        });

                        // Set Steps
                        if (templateData.pipeline_config && templateData.pipeline_config.steps) {
                            // OPTIONAL: Merge config into fixed steps instead of replacing? 
                            // For now, to ensure compatibility with "Fundamentally useless" existing pipelines comments from user,
                            // we might want to FORCE the fixed structure but load the config.
                            // BUT, let's assume if it's an existing template, we load it as is for now, 
                            // OR we overwrite it. The user said "The pipeline will always be the same".
                            // Let's safe-guard: if the loaded steps don't look like our fixed steps, we might have issues.
                            // Decision: Load the steps from DB, but if they are missing descriptions, we might want to add them.
                            // Ideally, we should migrate existing templates.
                            // For this task, let's just use what's in DB, but map descriptions if missing.
                            const loadedSteps = templateData.pipeline_config.steps.map((s: any) => {
                                const fixedMatch = FIXED_STEPS.find(fs => fs.type === s.type);
                                return {
                                    ...s,
                                    name: fixedMatch?.name || s.name,
                                    description: s.description || fixedMatch?.description || ""
                                };
                            });
                            setSteps(loadedSteps);
                        } else {
                            setSteps(FIXED_STEPS);
                        }

                        // Set Taxonomy
                        // Find taxonomy matching category + activity
                        const matchingTaxonomy = loadedTaxonomies.find((t: any) =>
                            t.category_name === templateData.category_name &&
                            t.activity_type === templateData.activity_type
                        );
                        if (matchingTaxonomy) {
                            setSelectedTaxonomyId(matchingTaxonomy.id);
                        }

                        // Set Document Template
                        if (templateData.document_template_id) {
                            setSelectedDocTemplateId(templateData.document_template_id);
                        }
                    } else {
                        toast({ title: "Error", description: "Failed to load template.", variant: "destructive" });
                    }
                }
            } catch (error) {
                console.error("Failed to fetch initial data", error);
            }
        };
        fetchData();
    }, [templateId]);

    // Effect to toggle Deep Analysis Mode
    useEffect(() => {
        if (selectedDocTemplateId !== "none") {
            // Deep Analysis Mode: Strict Constraints
            setSteps((currentSteps) =>
                currentSteps.map((s) => {
                    // Always fallback to base fixed step to avoid suffix duplication
                    const fixed = FIXED_STEPS.find((f) => f.type === s.type) || s;

                    if (s.type === "agent") {
                        return { ...s, name: "Deep Analyzer", description: "Constraints driven by Document Template." };
                    }
                    if (s.type === "visualizer" || s.type === "formatter") {
                        return {
                            ...s,
                            name: fixed.name + " (Skipped)",
                            description: "Bypassed in Deep Analysis mode.",
                            enabled: false, // Explicitly disable at root level
                            config: { ...s.config, disabled: true }
                        };
                    }
                    return s;
                })
            );
        } else {
            // Reset to Standard
            setSteps((currentSteps) =>
                currentSteps.map((s) => {
                    const fixed = FIXED_STEPS.find((f) => f.type === s.type);
                    if (fixed) {
                        return {
                            ...s,
                            name: fixed.name,
                            description: fixed.description,
                            enabled: true, // Re-enable
                            config: { ...s.config, disabled: false }
                        };
                    }
                    return s;
                })
            );
        }
    }, [selectedDocTemplateId]);

    const handleUpdateStep = (id: string, updates: Partial<PipelineStep>) => {
        setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const handleSaveTemplate = async () => {
        if (!selectedTaxonomyId) {
            toast({ title: "Validation Error", description: "You must select a Taxonomy (Category/Activity) for the template.", variant: "destructive" });
            return;
        }

        const selectedTaxonomy = taxonomies.find(t => t.id === selectedTaxonomyId);
        if (!selectedTaxonomy) return;

        try {
            // Convert linear steps to Graph format (nodes + edges) for Runtime
            const nodes: any[] = [];
            const edges: any[] = [];

            steps.forEach((step, index) => {
                // Create Node
                nodes.push({
                    ...step, // Copy base properties first
                    data: {
                        // Standard Canvas Node structure
                        label: step.name,
                        // Merge existing config into params
                        params: { ...step.config }
                    },
                    position: { x: 250, y: index * 150 + 100 } // Vertical layout
                });

                // Create Edge
                if (index > 0) {
                    const prevId = steps[index - 1].id;
                    edges.push({
                        id: `edge_${prevId}_${step.id}`,
                        source: prevId,
                        target: step.id,
                        type: "default"
                    });
                }
            });

            const payload = {
                name: templateMeta.name,
                category_name: selectedTaxonomy.category_name, // Enforce taxonomy category
                activity_type: selectedTaxonomy.activity_type,
                description: templateMeta.description,
                steps_count: steps.length,
                pipeline_config: {
                    steps, // Keep steps for Studio UI re-hydration
                    nodes, // Add Nodes for Canvas/Runtime compatibility
                    edges
                },
                document_template_id: selectedDocTemplateId === "none" ? null : selectedDocTemplateId
            };

            const url = templateId
                ? `${API_URL}/smart-templates/templates/${templateId}`
                : `${API_URL}/smart-templates/templates`;

            const method = templateId ? "PUT" : "POST";

            const res = await fetch(url, {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                toast({ title: "Success", description: `Template ${templateId ? 'updated' : 'saved'} successfully.` });
                setIsSaveDialogOpen(false);
            } else {
                toast({ title: "Error", description: `Failed to ${templateId ? 'update' : 'save'} template.`, variant: "destructive" });
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: `Failed to ${templateId ? 'update' : 'save'} template.`, variant: "destructive" });
        }
    };

    const handleToggleStep = (id: string, enabled: boolean) => {
        setSteps(steps.map(s => s.id === id ? { ...s, enabled } : s));
    };

    const selectedStep = steps.find(s => s.id === selectedStepId) || null;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="h-14 border-b flex items-center justify-between px-4 bg-background">
                <div className="flex items-center gap-4">
                    <Link href="/smart-analysis" className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronLeft className="h-4 w-4" />
                        BACK TO LIBRARY
                    </Link>
                    <div className="h-6 w-px bg-slate-200 mx-2" />
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="font-bold text-sm leading-none text-slate-800">{templateMeta.name || "Untitled Template"}</h1>
                            <div className="flex gap-2 mt-1">
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    {templateMeta.category_name}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    {steps.length} Steps
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-[200px]">
                        <Select value={selectedDocTemplateId} onValueChange={setSelectedDocTemplateId}>
                            <SelectTrigger className="h-8 text-xs border-dashed border-slate-300">
                                <SelectValue placeholder="Select Document Template" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Standard Analysis (No Template)</SelectItem>
                                {docTemplates.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.pathName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-[200px]">
                        <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select LLM Config" />
                            </SelectTrigger>
                            <SelectContent>
                                {presets.map(p => (
                                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="bg-slate-900 hover:bg-black text-white rounded-full px-6 font-semibold shadow-lg shadow-slate-900/10">
                                <Save className="mr-2 h-4 w-4" /> SAVE TEMPLATE
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Save Template</DialogTitle>
                                <DialogDescription>
                                    Save your analysis pipeline configuration.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Template Name</Label>
                                    <Input
                                        id="name"
                                        value={templateMeta.name}
                                        onChange={(e) => setTemplateMeta({ ...templateMeta, name: e.target.value })}
                                        placeholder="e.g. Risk Analysis Pipeline"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="taxonomy">Taxonomy (Category & Activity)</Label>
                                    <Select
                                        value={selectedTaxonomyId}
                                        onValueChange={(val) => {
                                            setSelectedTaxonomyId(val);
                                        }}
                                    >
                                        <SelectTrigger id="taxonomy">
                                            <SelectValue placeholder="Select Taxonomy..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {taxonomies.map((t: any) => (
                                                <SelectItem key={t.id} value={t.id}>
                                                    {t.category_name} - {t.activity_type}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea
                                        id="description"
                                        value={templateMeta.description}
                                        onChange={(e) => setTemplateMeta({ ...templateMeta, description: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="docTemplate">Deep Analysis Template (Optional)</Label>
                                    <Select
                                        value={selectedDocTemplateId}
                                        onValueChange={setSelectedDocTemplateId}
                                        disabled={selectedDocTemplateId !== "none"}
                                    >
                                        <SelectTrigger id="docTemplate">
                                            <SelectValue placeholder="None (Standard Analysis)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None (Standard Analysis)</SelectItem>
                                            {docTemplates.map((t: any) => (
                                                <SelectItem key={t.id} value={t.id}>
                                                    {t.pathName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-muted-foreground">
                                        Linking a template forces "Deep Analysis" mode (Strict Constraints).
                                    </p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleSaveTemplate} className="bg-[#4F46E5] text-white">
                                    Save Template
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Removed StudioSidebar */}
                <StudioCanvas
                    steps={steps}
                    selectedStepId={selectedStepId}
                    onSelectStep={setSelectedStepId}
                    onToggleStep={handleToggleStep}
                // Removed onDeleteStep and onAddModule
                />
                <StudioConfigPanel
                    selectedStep={selectedStep}
                    onUpdateStep={handleUpdateStep}
                    selectedPreset={selectedPreset}
                />
            </div>
        </div>
    );
}
