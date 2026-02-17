"use client";

/**
 * Builder Header Component
 *
 * Top bar with agent name, LLM selector, and action buttons.
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Save, Rocket, Download, Settings, ChevronDown } from "lucide-react";
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
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { DryRunPanel } from "./dry-run-panel";

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
    const nodes = useBuilderStore((state) => state.nodes);
    const edges = useBuilderStore((state) => state.edges);

    // Fetch configured model presets and defaults from Settings
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const token = localStorage.getItem("token");
                const headers: HeadersInit = token ? { "Authorization": `Bearer ${token}` } : {};

                const [presetsRes, defaultsRes] = await Promise.all([
                    fetch(`${API_URL}/config/presets`, { headers }),
                    fetch(`${API_URL}/config/defaults`, { headers })
                ]);

                if (presetsRes.ok) {
                    const data = await presetsRes.json();
                    const presetList: ModelPreset[] = data.presets || [];
                    setModels(presetList);

                    let defaultLlmName: string | null = null;
                    if (defaultsRes.ok) {
                        const defaults = await defaultsRes.json();
                        defaultLlmName = defaults.default_llm;
                    }

                    // Proactive matching: Only auto-select if nothing is currently in the store
                    // This prevents overwriting the loaded test_config.selectedModel
                    const currentStoredModel = useBuilderStore.getState().selectedModel;

                    if ((!currentStoredModel || currentStoredModel === "default") && !selectedModel && presetList.length > 0) {
                        if (defaultLlmName && presetList.some(p => p.name === defaultLlmName)) {
                            setSelectedModel(defaultLlmName);
                        } else if (presetList.length > 0) {
                            setSelectedModel(presetList[0].name);
                        }
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

    // Removed duplicate handleSave


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

    const selectedModelName = selectedModel === "default"
        ? "Default (System)"
        : (models.find((m) => m.name === selectedModel)?.name || (isLoadingModels ? "Loading..." : selectedModel || "Select Model"));

    // Fetch available agents for switching
    const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

    const fetchAgents = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/agent-blueprints`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAgents(data);
            }
        } catch (error) {
            console.error("Failed to fetch agents", error);
        }
    }, []);

    useEffect(() => {
        fetchAgents();
    }, [fetchAgents]);

    const handleSave = async () => {
        const saved = await saveBlueprint();
        if (saved) {
            // Refresh list to include new agent or updated name
            fetchAgents();

            if (!useBuilderStore.getState().blueprintId) {
                // Redirect to the new blueprint's edit URL
                router.push(`/agents/builder/${saved.id}`);
            }
        }
    };

    const handleSwitchAgent = (agentId: string) => {
        if (isDirty) {
            if (!confirm("You have unsaved changes. Discard them?")) return;
        }
        router.push(`/agents/builder/${agentId}`);
    };

    return (
        <header className="flex items-center justify-between h-14 px-4 border-b bg-white dark:bg-slate-950 shrink-0">
            {/* Left: Agent Name */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/agents-tools/agents")}
                >
                    ← Back
                </Button>

                {/* Switch Agent Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-2 px-2">
                            <span className="sr-only">Switch Agent</span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 max-h-96 overflow-y-auto">
                        <DropdownMenuItem onClick={() => handleSwitchAgent("new")}>
                            <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">+</span>
                                </div>
                                <span className="font-medium">New Agent</span>
                            </div>
                        </DropdownMenuItem>
                        {agents.length > 0 && <div className="h-px bg-border my-1" />}
                        {agents.map(agent => (
                            <DropdownMenuItem key={agent.id} onClick={() => handleSwitchAgent(agent.id)}>
                                <span>{agent.name}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

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
                <HelpTooltip contentPath="agent-builder/agent_name" />
            </div>

            {/* Center: LLM Selector */}
            <div className="flex items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                            <Settings className="h-4 w-4" />
                            {selectedModelName}
                            <ChevronDown className="h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                        <DropdownMenuItem
                            onClick={() => setSelectedModel("default")}
                            className={selectedModel === "default" ? "bg-slate-100 dark:bg-slate-800" : ""}
                        >
                            Default (System Configured)
                        </DropdownMenuItem>
                        {models.length > 0 && <div className="h-px bg-border my-1" />}
                        {isLoadingModels ? (
                            <DropdownMenuItem disabled>Loading models...</DropdownMenuItem>
                        ) : models.length === 0 ? (
                            <DropdownMenuItem disabled>No presets configured</DropdownMenuItem>
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
                <HelpTooltip contentPath="agent-builder/model_selector" />
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
                <DryRunPanel />

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
