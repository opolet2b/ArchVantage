"use client";

/**
 * Builder Header Component
 *
 * Top bar with agent name, LLM selector, and action buttons.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, Rocket, Download, Settings, ChevronDown, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBuilderStore } from "@/lib/builder-store";
import { API_URL } from "@/lib/utils";

/**
 * Model preset interface matching backend schema.
 */
interface ModelPreset {
    name: string;
    type: "local" | "remote";
    model_name?: string;
    api_url?: string;
}

export function BuilderHeader() {
    const router = useRouter();
    const [isEditingName, setIsEditingName] = useState(false);
    const [models, setModels] = useState<ModelPreset[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(true);

    const blueprintName = useBuilderStore((state) => state.blueprintName);
    const setBlueprintName = useBuilderStore((state) => state.setBlueprintName);
    const selectedModel = useBuilderStore((state) => state.selectedModel);
    const setSelectedModel = useBuilderStore((state) => state.setSelectedModel);
    const saveBlueprint = useBuilderStore((state) => state.saveBlueprint);
    const isSaving = useBuilderStore((state) => state.isSaving);
    const isDirty = useBuilderStore((state) => state.isDirty);
    const toggleConsole = useBuilderStore((state) => state.toggleConsole);
    const consoleOpen = useBuilderStore((state) => state.consoleOpen);
    const nodes = useBuilderStore((state) => state.nodes);
    const edges = useBuilderStore((state) => state.edges);

    // Fetch configured model presets from Settings
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await fetch(`${API_URL}/config/presets`);
                if (res.ok) {
                    const data = await res.json();
                    setModels(data.presets || []);
                    // If no model selected and we have presets, select the first one
                    if (!selectedModel && data.presets?.length > 0) {
                        setSelectedModel(data.presets[0].name);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch model presets", error);
            } finally {
                setIsLoadingModels(false);
            }
        };
        fetchModels();
    }, [selectedModel, setSelectedModel]);

    const handleSave = async () => {
        const saved = await saveBlueprint();
        if (saved && !useBuilderStore.getState().blueprintId) {
            // Redirect to the new blueprint's edit URL
            router.push(`/agents/builder/${saved.id}`);
        }
    };

    const handleExport = () => {
        const graph = {
            nodes: nodes.map((n) => ({
                id: n.id,
                type: n.data.primitiveType,
                metadata: {
                    label: n.data.label,
                    ui_position: { x: n.position.x, y: n.position.y }
                },
                params: n.data.params
            })),
            edges: edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                condition: e.data?.condition
            }))
        };

        const blueprint = {
            name: blueprintName,
            graph,
            inputs_schema: {},
            secrets_requirements: []
        };

        const blob = new Blob([JSON.stringify(blueprint, null, 2)], {
            type: "application/json"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${blueprintName.toLowerCase().replace(/\s+/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Find model display name (prefer model_name for local, name for remote)
    const getModelDisplayName = (preset: ModelPreset) => {
        if (preset.type === "local" && preset.model_name) {
            return preset.model_name;
        }
        return preset.name;
    };

    const selectedModelName = models.find((m) => m.name === selectedModel)?.name
        || (isLoadingModels ? "Loading..." : "Select Model");

    return (
        <header className="flex items-center justify-between h-14 px-4 border-b bg-white dark:bg-slate-950 shrink-0">
            {/* Left: Agent Name */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/agents")}
                >
                    ← Back
                </Button>

                {isEditingName ? (
                    <Input
                        value={blueprintName}
                        onChange={(e) => setBlueprintName(e.target.value)}
                        onBlur={() => setIsEditingName(false)}
                        onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                        className="w-64 h-8"
                        autoFocus
                    />
                ) : (
                    <button
                        onClick={() => setIsEditingName(true)}
                        className="text-lg font-semibold hover:text-blue-600 transition-colors flex items-center gap-2"
                    >
                        {blueprintName}
                        {isDirty && <span className="text-xs text-amber-500">●</span>}
                    </button>
                )}
            </div>

            {/* Center: LLM Selector */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Settings className="h-4 w-4" />
                        {selectedModelName}
                        <ChevronDown className="h-3 w-3" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                    {isLoadingModels ? (
                        <DropdownMenuItem disabled>Loading models...</DropdownMenuItem>
                    ) : models.length === 0 ? (
                        <DropdownMenuItem disabled>No models configured</DropdownMenuItem>
                    ) : (
                        models.map((model) => (
                            <DropdownMenuItem
                                key={model.name}
                                onClick={() => setSelectedModel(model.name)}
                                className={selectedModel === model.name ? "bg-slate-100 dark:bg-slate-800" : ""}
                            >
                                {getModelDisplayName(model)}
                            </DropdownMenuItem>
                        ))
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleConsole}
                    className={consoleOpen ? "bg-slate-100 dark:bg-slate-800" : ""}
                >
                    <Terminal className="h-4 w-4 mr-2" />
                    Debug
                </Button>

                <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                </Button>

                <Button
                    variant="default"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700"
                >
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? "Saving..." : "Save"}
                </Button>

                <Button
                    variant="default"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                >
                    <Rocket className="h-4 w-4 mr-2" />
                    Deploy
                </Button>
            </div>
        </header>
    );
}
