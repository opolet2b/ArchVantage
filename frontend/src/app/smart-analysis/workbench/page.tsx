"use client";

import { useSearchParams } from "next/navigation";

import React, { useState, useEffect } from "react";
import { StudioSidebar, ModuleItem } from "@/components/studio/studio-sidebar";
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

export default function StudioPage() {
    const { toast } = useToast();
    const [steps, setSteps] = useState<PipelineStep[]>([]);
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

    const searchParams = useSearchParams();
    const templateId = searchParams.get("templateId");

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Presets
                const resPresets = await fetch(`${API_URL}/config/presets`);
                const dataPresets = await resPresets.json();
                setPresets(dataPresets.presets || []);

                // Fetch Taxonomies
                let loadedTaxonomies: any[] = [];
                const resTaxonomies = await fetch(`${API_URL}/smart-templates/taxonomies`);
                if (resTaxonomies.ok) {
                    const dataTaxonomies = await resTaxonomies.json();
                    setTaxonomies(dataTaxonomies);
                    loadedTaxonomies = dataTaxonomies;
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
                            setSteps(templateData.pipeline_config.steps);
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

    const handleAddModule = (module: ModuleItem) => {
        const newStep: PipelineStep = {
            id: crypto.randomUUID(),
            moduleId: module.id,
            type: module.type,
            name: module.name,
            config: {}
        };
        setSteps([...steps, newStep]);
        setSelectedStepId(newStep.id);
    };

    const handleDeleteStep = (id: string) => {
        setSteps(steps.filter(s => s.id !== id));
        if (selectedStepId === id) {
            setSelectedStepId(null);
        }
    };

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
            const payload = {
                name: templateMeta.name,
                category_name: selectedTaxonomy.category_name, // Enforce taxonomy category
                activity_type: selectedTaxonomy.activity_type,
                description: templateMeta.description,
                steps_count: steps.length,
                pipeline_config: { steps }
            };

            const url = templateId
                ? `${API_URL}/smart-templates/templates/${templateId}`
                : `${API_URL}/smart-templates/templates`;

            const method = templateId ? "PUT" : "POST";

            const res = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
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

    const selectedStep = steps.find(s => s.id === selectedStepId) || null;

    return (
        <div className="flex flex-col h-screen overflow-hidden">
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
                                            // Optional: auto-fill description if empty?
                                            // const tax = taxonomies.find(t => t.id === val);
                                            // if (tax && !templateMeta.description) setTemplateMeta(prev => ({ ...prev, description: tax.description || "" }));
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
                <StudioSidebar onAddModule={handleAddModule} />
                <StudioCanvas
                    steps={steps}
                    selectedStepId={selectedStepId}
                    onSelectStep={setSelectedStepId}
                    onDeleteStep={handleDeleteStep}
                    onAddModule={handleAddModule}
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
