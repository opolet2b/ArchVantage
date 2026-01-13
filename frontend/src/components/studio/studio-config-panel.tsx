"use client";

import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Settings2, Sparkles } from "lucide-react";
import { PipelineStep } from "./studio-canvas";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { API_URL } from "@/lib/utils";
import { MultiSelect, Option } from "@/components/ui/multi-select";
import { SuggestionDialog } from "@/components/studio/suggestion-dialog";
import { VariableEditor, VariableConfig } from "@/components/studio/variable-editor";

interface StudioConfigPanelProps {
    selectedStep: PipelineStep | null;
    onUpdateStep: (id: string, updates: Partial<PipelineStep>) => void;
    selectedPreset?: string; // Add optional prop for LLM preset
}

export function StudioConfigPanel(props: StudioConfigPanelProps) {
    const { selectedStep, onUpdateStep } = props;
    const [personas, setPersonas] = React.useState<any[]>([]);
    const [frameworks, setFrameworks] = React.useState<any[]>([]);
    const [sections, setSections] = React.useState<any[]>([]);
    const [renderingTypes, setRenderingTypes] = React.useState<any[]>([]);
    const [outputFormats, setOutputFormats] = React.useState<any[]>([]);

    // --- AI Suggestion Logic ---
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [intentDialogOpen, setIntentDialogOpen] = useState(false);
    const [intentMode, setIntentMode] = useState<"extractor" | "agent" | "extractor-focus" | "extractor-exclude">("extractor");

    // Filter rendering types based on selected category (safely handle null selectedStep)
    const synthesisCategories = Array.from(new Set(renderingTypes.map((rt: any) => rt.category)));

    const filteredRenderingTypes = selectedStep?.config?.synthesisCategory
        ? renderingTypes.filter((rt: any) => rt.category === selectedStep.config.synthesisCategory)
        : renderingTypes;

    // Helper options
    const sectionOptions: Option[] = sections.map(s => ({ label: s.name, value: s.id }));

    // Define handlers before early return
    const handleUpdateConfig = (key: string, value: any) => {
        if (!selectedStep) return;
        onUpdateStep(selectedStep.id, {
            config: {
                ...selectedStep.config,
                [key]: value
            }
        });
    };

    const handleSuggestObjective = (mode: "extractor" | "agent" | "extractor-focus" | "extractor-exclude") => {
        if (!props.selectedPreset) {
            alert("Please select an LLM Configuration in the header first.");
            return;
        }
        if (!selectedStep) return;

        setIntentMode(mode);
        setIntentDialogOpen(true);
    };

    const handleDialogSubmit = async (intent: string) => {
        if (!selectedStep) return;

        setIsSuggesting(true);
        setIntentDialogOpen(false); // Close dialog immediately or wait? Let's close first.

        try {
            // Map section IDs to Names (only relevant for extractor, but harmless for agent)
            const selectedSectionIds = selectedStep.config?.sourceSections || [];
            const selectedSectionNames = sections
                .filter((s: any) => selectedSectionIds.includes(s.id))
                .map((s: any) => s.name);

            if (selectedSectionIds.includes("entire")) {
                selectedSectionNames.push("Entire Document");
            }

            const payload = {
                preset_name: props.selectedPreset,
                source_sections: selectedSectionNames,
                entities: selectedStep.config?.entitiesOfInterest || "",
                user_intent: intent,
                mode: intentMode
            };

            const res = await fetch(`${API_URL}/smart-templates/suggest-objective`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                let targetField = "";
                if (intentMode === 'extractor') targetField = "instructions";
                else if (intentMode === 'extractor-focus') targetField = "focus";
                else if (intentMode === 'extractor-exclude') targetField = "exclude";
                else targetField = "objective"; // agent

                handleUpdateConfig(targetField, data.suggestion);
            } else {
                alert("Failed to generate suggestion. Check backend logs.");
            }
        } catch (error) {
            console.error(error);
            alert("Error generating suggestion.");
        } finally {
            setIsSuggesting(false);
        }
    };

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                // Parallel fetch for efficiency
                const [pRes, fRes, sRes, rRes, oRes] = await Promise.all([
                    fetch(`${API_URL}/smart-templates/personas`),
                    fetch(`${API_URL}/smart-templates/frameworks`),
                    fetch(`${API_URL}/smart-templates/sections`),
                    fetch(`${API_URL}/smart-templates/rendering-types`),
                    fetch(`${API_URL}/smart-templates/output-formats`)
                ]);

                if (pRes.ok) setPersonas(await pRes.json());
                if (fRes.ok) setFrameworks(await fRes.json());
                if (sRes.ok) setSections(await sRes.json());
                if (rRes.ok) setRenderingTypes(await rRes.json());
                if (oRes.ok) setOutputFormats(await oRes.json());
            } catch (err) {
                console.error("Failed to load config options", err);
            }
        };

        fetchData();
    }, []);

    // --- Resize Logic ---
    const [panelWidth, setPanelWidth] = useState(350);
    const isResizing = React.useRef(false);

    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", stopResize);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const newWidth = window.innerWidth - e.clientX;
        // Clamp width between 250px and 900px
        setPanelWidth(Math.max(250, Math.min(900, newWidth)));
    };

    const stopResize = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", stopResize);
    };

    if (!selectedStep) {
        return (
            <div className="w-80 border-l bg-muted/10 h-full p-6 flex flex-col items-center justify-center text-muted-foreground text-center">
                <p className="text-sm">Select a step in the canvas to configure it.</p>
            </div>
        );
    }

    // Filter output formats based on config.type (not explicitly set currently, maybe infer from step type or add type selector later)
    // For now show all, or if we had a "Type" selector in formatter.

    return (
        <div
            className="border-l bg-background flex flex-col h-full overflow-hidden shadow-xl z-20 relative shrink-0"
            style={{ width: panelWidth }}
        >
            {/* Resize Handle */}
            <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-50"
                onMouseDown={startResize}
            />
            {/* Header */}
            <div className={`h-14 border-b flex items-center px-6 gap-3 font-semibold text-sm uppercase tracking-wider
                ${selectedStep.type === 'extractor' ? 'bg-blue-50/50 text-blue-700' :
                    selectedStep.type === 'agent' ? 'bg-purple-50/50 text-purple-700' :
                        selectedStep.type === 'visualizer' ? 'bg-pink-50/50 text-pink-700' : 'bg-rose-50/50 text-rose-700'
                }`}>
                <Settings2 className="h-4 w-4" />
                {selectedStep.type} Configuration
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">

                {/* --- Step Name --- */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-muted-foreground uppercase">Step Name</Label>
                            <HelpTooltip contentPath="smart-analysis/step_name" />
                        </div>
                        <Input
                            value={selectedStep.name}
                            onChange={(e) => onUpdateStep(selectedStep.id, { name: e.target.value })}
                            className="font-medium"
                        />
                    </div>
                </div>

                {/* --- EXTRACTOR CONFIG --- */}
                {selectedStep.type === 'extractor' && (
                    <div className="space-y-6">

                        {/* Asset Scope Selection */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Asset Scope</Label>
                                <HelpTooltip contentPath="smart-analysis/asset_scope" />
                            </div>
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                <button
                                    className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-all ${selectedStep.config?.asset_scope !== 'multiple'
                                        ? "bg-white text-blue-600 shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    onClick={() => handleUpdateConfig("asset_scope", "single")}
                                >
                                    Single Asset
                                </button>
                                <button
                                    className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-all ${selectedStep.config?.asset_scope === 'multiple'
                                        ? "bg-white text-blue-600 shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    onClick={() => handleUpdateConfig("asset_scope", "multiple")}
                                >
                                    Multiple (Compare)
                                </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                {selectedStep.config?.asset_scope === 'multiple'
                                    ? "Analysis generally involves comparison or aggregation across multiple selected files."
                                    : "Analysis is performed on a single selected file."}
                            </p>
                        </div>

                        {/* Extraction Mode Selection */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Extraction Mode</Label>
                                <HelpTooltip contentPath="smart-analysis/extraction_mode" />
                            </div>
                            <Select
                                value={selectedStep.config?.mode || "semantic"}
                                onValueChange={(val) => handleUpdateConfig("mode", val)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="semantic">Semantic Analysis (Default)</SelectItem>
                                    <SelectItem value="table">Table / Structure</SelectItem>
                                    <SelectItem value="ocr">OCR / Verbatim</SelectItem>
                                    <SelectItem value="raw">Raw / Pass-Through (No AI)</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">
                                {selectedStep.config?.mode === 'table' ? "Strictly transcribes tabular data row-by-row." :
                                    selectedStep.config?.mode === 'ocr' ? "Extracts raw text exactly as it appears." :
                                        selectedStep.config?.mode === 'raw' ? "Passes selection directly to next step (Bypasses AI)." :
                                            "Analyzes and filters information based on meaning."}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Source Sections</Label>
                                <HelpTooltip contentPath="smart-analysis/source_sections" />
                            </div>
                            <MultiSelect
                                options={sections.map(s => ({ label: s.name, value: s.id }))}
                                selected={selectedStep.config?.sourceSections || []}
                                onChange={(val) => handleUpdateConfig("sourceSections", val)}
                                placeholder="Select sections..."
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Extraction Focus</Label>
                                <div className="flex items-center gap-2">
                                    <HelpTooltip contentPath="smart-analysis/focus" />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[10px] px-2 gap-1 text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50"
                                        onClick={() => handleSuggestObjective("extractor-focus")}
                                        disabled={isSuggesting}
                                    >
                                        {isSuggesting && intentMode === "extractor-focus" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                        Suggest
                                    </Button>
                                </div>
                            </div>
                            <Textarea
                                placeholder="What main elements or topics should be extracted?"
                                value={selectedStep.config?.focus || ""}
                                onChange={(e) => handleUpdateConfig("focus", e.target.value)}
                                className="min-h-[80px]"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Exclude Patterns</Label>
                                <div className="flex items-center gap-2">
                                    <HelpTooltip contentPath="smart-analysis/exclude" />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[10px] px-2 gap-1 text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50"
                                        onClick={() => handleSuggestObjective("extractor-exclude")}
                                        disabled={isSuggesting}
                                    >
                                        {isSuggesting && intentMode === "extractor-exclude" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                        Suggest
                                    </Button>
                                </div>
                            </div>
                            <Textarea
                                placeholder="What should be strictly ignored? (e.g. boilerplate, headers)"
                                value={selectedStep.config?.exclude || ""}
                                onChange={(e) => handleUpdateConfig("exclude", e.target.value)}
                                className="min-h-[60px]"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Additional Instructions</Label>
                                    <HelpTooltip contentPath="smart-analysis/instructions" />
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[10px] px-2 gap-1 text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50"
                                    onClick={() => handleSuggestObjective("extractor")}
                                    disabled={isSuggesting}
                                >
                                    {isSuggesting && intentMode === "extractor" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                    Suggest
                                </Button>
                            </div>
                            <Textarea
                                placeholder="Any specific formatting or processing rules..."
                                value={selectedStep.config?.instructions || ""}
                                onChange={(e) => handleUpdateConfig("instructions", e.target.value)}
                                className="min-h-[100px]"
                            />
                        </div>
                    </div>
                )}

                {/* Agent Config (AI Reasoning) */}
                {selectedStep.type === "agent" && (
                    <div className="space-y-5">
                        <div className="bg-purple-50 dark:bg-purple-900/10 p-3 rounded text-xs text-purple-600 dark:text-purple-400 font-medium">
                            Configure AI reasoning logic.
                        </div>



                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Persona</Label>
                                <HelpTooltip contentPath="smart-analysis/persona" />
                            </div>
                            <Select
                                value={selectedStep.config?.personaId}
                                onValueChange={(val) => handleUpdateConfig("personaId", val)}
                            >
                                <SelectTrigger><SelectValue placeholder="Select persona..." /></SelectTrigger>
                                <SelectContent>
                                    {personas.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.role}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Framework (Optional)</Label>
                                <HelpTooltip contentPath="smart-analysis/framework" />
                            </div>
                            <Select
                                value={selectedStep.config?.frameworkId || "none"}
                                onValueChange={(val) => handleUpdateConfig("frameworkId", val === "none" ? undefined : val)}
                            >
                                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {frameworks.map(f => (
                                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Reasoning Depth</Label>
                                <HelpTooltip contentPath="smart-analysis/reasoning_depth" />
                            </div>
                            <Select
                                value={selectedStep.config?.reasoningDepth || "medium"}
                                onValueChange={(val) => handleUpdateConfig("reasoningDepth", val)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low (Fast)</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High (Thorough)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="pt-2 border-t">
                            <div className="flex items-center justify-between mb-2">
                                <HelpTooltip contentPath="smart-analysis/variables" />
                            </div>
                            <VariableEditor
                                variables={selectedStep.config?.variables || []}
                                onChange={(vars) => handleUpdateConfig("variables", vars)}
                                selectedPreset={props.selectedPreset}
                            />
                        </div>

                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Objective <span className="text-red-500">*</span></Label>
                                    <HelpTooltip contentPath="smart-analysis/agent_objective" />
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[10px] px-2 gap-1 text-purple-600 hover:text-purple-700 border-purple-200 hover:bg-purple-50"
                                    onClick={() => handleSuggestObjective("agent")}
                                    disabled={isSuggesting}
                                >
                                    {isSuggesting && intentMode === "agent" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                    Suggest
                                </Button>
                            </div>
                            <Textarea
                                placeholder="Describe what the agent should analyze or achieve..."
                                value={selectedStep.config?.objective || ""}
                                onChange={(e) => handleUpdateConfig("objective", e.target.value)}
                                className="min-h-[100px] border-l-2 border-l-purple-500"
                            />
                            <p className="text-[10px] text-muted-foreground">The primary prompt for the agent. Other fields will provide context for the suggestion.</p>
                        </div>
                    </div>
                )}

                {/* Visualizer Config */}
                {selectedStep.type === "visualizer" && (
                    <div className="space-y-5">
                        <div className="bg-pink-50 dark:bg-pink-900/10 p-3 rounded text-xs text-pink-600 dark:text-pink-400 font-medium">
                            Configure visual output.
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Synthesis Category</Label>
                                <HelpTooltip contentPath="smart-analysis/synthesis_category" />
                            </div>
                            <Select
                                value={selectedStep.config?.synthesisCategory}
                                onValueChange={(val) => {
                                    onUpdateStep(selectedStep.id, {
                                        config: {
                                            ...selectedStep.config,
                                            synthesisCategory: val,
                                            renderingType: undefined
                                        }
                                    });
                                }}
                            >
                                <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                                <SelectContent>
                                    {synthesisCategories.map((c: any) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Rendering Type</Label>
                                <HelpTooltip contentPath="smart-analysis/rendering_type" />
                            </div>
                            <Select
                                value={selectedStep.config?.renderingType}
                                onValueChange={(val) => handleUpdateConfig("renderingType", val)}
                                disabled={!selectedStep.config?.synthesisCategory}
                            >
                                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                                <SelectContent>
                                    {filteredRenderingTypes.map((rt: any) => (
                                        <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}

                {/* Formatter Config */}
                {selectedStep.type === "formatter" && (
                    <div className="space-y-5">
                        <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded text-xs text-amber-600 dark:text-amber-400 font-medium">
                            Define output file format.
                        </div>

                        <div className="space-y-4">
                            {/* Format Category */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Format Category</Label>
                                    <HelpTooltip contentPath="smart-analysis/format_category" />
                                </div>
                                <Select
                                    value={selectedStep.config?.formatCategory}
                                    onValueChange={(val) => {
                                        onUpdateStep(selectedStep.id, {
                                            config: {
                                                ...selectedStep.config,
                                                formatCategory: val,
                                                outputFormatId: undefined, // Reset specific format
                                                // Clear legacy fields
                                                textFormatId: undefined,
                                                graphicsFormatId: undefined,
                                                dataFormatId: undefined
                                            }
                                        });
                                    }}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                                    <SelectContent>
                                        {Array.from(new Set(outputFormats.map(f => f.type))).map((cat: any) => (
                                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Output Format */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase">Output Format</Label>
                                <Select
                                    value={selectedStep.config?.outputFormatId}
                                    onValueChange={(val) => handleUpdateConfig("outputFormatId", val)}
                                    disabled={!selectedStep.config?.formatCategory}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select format..." /></SelectTrigger>
                                    <SelectContent>
                                        {outputFormats
                                            .filter(f => f.type === selectedStep.config?.formatCategory)
                                            .map(of => (
                                                <SelectItem key={of.id} value={of.id}>{of.name}</SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            <SuggestionDialog
                isOpen={intentDialogOpen}
                onClose={() => setIntentDialogOpen(false)}
                onSubmit={handleDialogSubmit}
                isLoading={isSuggesting}
                title={
                    intentMode === 'agent' ? "Suggest Agent Objective" :
                        intentMode === 'extractor-focus' ? "Suggest Extraction Focus" :
                            intentMode === 'extractor-exclude' ? "Suggest Exclusion Patterns" :
                                "Suggest Additional Instructions"
                }
                description={
                    intentMode === 'agent' ? "Briefly describe the goal of the analysis you want the agent to perform." :
                        intentMode === 'extractor-focus' ? "Describe what specific data points or topics you want to capture." :
                            intentMode === 'extractor-exclude' ? "Describe what kind of content should be ignored (e.g. headers, footers)." :
                                "Briefly describe how you want the data to be processed or formatted."
                }
            />

            <div className="p-4 border-t bg-slate-50">
                <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-indigo-200 uppercase font-bold tracking-wide text-xs h-10">
                    Apply Step Config
                </Button>
            </div>
        </div>
    );
}
