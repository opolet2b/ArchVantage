/**
 * Canvas Toolbar
 * 
 * Floating toolbar for model selection, tool selection, and global toggles.
 * Isolated to prevent full canvas re-renders on minor UI state changes.
 */
"use client";

import * as React from "react";
import { Brain, Loader2, Eye, Hand, MousePointer2, Camera, RefreshCcw, Trash2, Bot, Sparkles, User, Layers } from "lucide-react";
import { useCanvasStore } from "./canvas-store";
import { cn, API_URL } from "@/lib/utils";
import { ScenarioSelector } from "./scenario-selector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import domToImage from "dom-to-image-more";

interface ModelPreset {
    name: string;
    type: "local" | "remote";
    model_name?: string;
    is_vision?: boolean;
}

export const CanvasToolbar = React.memo(function CanvasToolbar() {
    const { toast } = useToast();

    // Selectors to minimize re-renders
    const selectedModel = useCanvasStore((s) => s.selectedModel);
    const visionModel = useCanvasStore((s) => s.visionModel);
    const selectionMode = useCanvasStore((s) => s.selectionMode);
    const showLinks = useCanvasStore((s) => s.showLinks);
    const semanticZoomEnabled = useCanvasStore((s) => s.semanticZoomEnabled);
    const selectedThingIds = useCanvasStore((s) => s.selectedThingIds);
    const selectedDomainIds = useCanvasStore((s) => s.selectedDomainIds);
    const canvasId = useCanvasStore((s) => s.canvasId);
    // Viewport moved to ZoomIndicator for performance

    // Actions
    const setSelectedModel = useCanvasStore((s) => s.setSelectedModel);
    const setVisionModel = useCanvasStore((s) => s.setVisionModel);
    const setSelectionMode = useCanvasStore((s) => s.setSelectionMode);
    const toggleShowLinks = useCanvasStore((s) => s.toggleShowLinks);
    const setSemanticZoomEnabled = useCanvasStore((s) => s.setSemanticZoomEnabled);
    const deleteSelectedNodes = useCanvasStore((s) => s.deleteSelectedNodes);
    const refreshThings = useCanvasStore((s) => s.refreshThings);
    const updateCanvasSettings = useCanvasStore((s) => s.updateCanvasSettings);

    const [models, setModels] = React.useState<ModelPreset[]>([]);
    const [isLoadingModels, setIsLoadingModels] = React.useState(true);
    const [scenarioSelectorOpen, setScenarioSelectorOpen] = React.useState(false);

    React.useEffect(() => {
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
                    let defaultVisionName: string | null = null;

                    if (defaultsRes.ok) {
                        const defaults = await defaultsRes.json();
                        defaultLlmName = defaults.default_llm;
                        defaultVisionName = defaults.default_vision;
                    }

                    if (!selectedModel) {
                        if (defaultLlmName && presetList.some(p => p.name === defaultLlmName)) {
                            setSelectedModel(defaultLlmName);
                        } else if (presetList.length > 0) {
                            setSelectedModel(presetList[0].name);
                        }
                    }

                    if (!visionModel) {
                        if (defaultVisionName && presetList.some(p => p.name === defaultVisionName)) {
                            setVisionModel(defaultVisionName);
                        } else {
                            const firstVision = presetList.find(p => p.is_vision);
                            if (firstVision) {
                                setVisionModel(firstVision.name);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to fetch model presets:", error);
            } finally {
                setIsLoadingModels(false);
            }
        };
        fetchModels();
    }, [selectedModel, visionModel, setSelectedModel, setVisionModel]);

    const handleCaptureThumbnail = async () => {
        const containerNode = document.querySelector(".react-flow") as HTMLElement;
        if (!containerNode) return;

        toast({ title: "Capturing Preview", description: "Generating canvas thumbnail..." });

        try {
            const dataUrlContainer = await domToImage.toPng(containerNode, {
                bgcolor: '#f8fafc',
                quality: 0.8,
            });

            const currentSettings = useCanvasStore.getState().canvasSettings || {};
            await updateCanvasSettings({
                ...currentSettings,
                thumbnail: dataUrlContainer
            });

            toast({ title: "Thumbnail Updated", description: "Canvas preview saved." });
        } catch (error) {
            console.error("Thumbnail capture failed:", error);
            toast({ title: "Capture Failed", description: "Could not generate thumbnail.", variant: "destructive" });
        }
    };

    const handleScenarioSelect = async (scenario: any) => {
        setScenarioSelectorOpen(false);
        const token = localStorage.getItem("token");

        if (!canvasId) {
            toast({ title: "Error", description: "Could not identify current canvas.", variant: "destructive" });
            return;
        }

        try {
            toast({ title: "Applying Scenario", description: `Configuring ${scenario.name} for this workspace...` });
            const res = await fetch(`${API_URL}/scenarios/apply-to-canvas/${canvasId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    scenario_id: scenario.id
                })
            });

            if (res.ok) {
                toast({ title: "Success", description: "Scenario applied successfully." });
                // We don't redirect anymore! We refresh the current state.
                // enhanced refreshThings now pulls and applies the owner_config as well.
                refreshThings();
            } else {
                throw new Error("Failed to apply scenario");
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to apply scenario.", variant: "destructive" });
        }
    };

    return (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-slate-900 shrink-0">
            <div id="canvas-model-selectors" className="flex items-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Brain className="h-4 w-4" />
                    <span>Model:</span>
                    {isLoadingModels ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Select
                            value={selectedModel || ""}
                            onValueChange={(value) => {
                                setSelectedModel(value);
                                updateCanvasSettings({ model: value });
                            }}
                        >
                            <SelectTrigger className="w-[200px] h-8 text-sm">
                                <SelectValue placeholder="Select model..." />
                            </SelectTrigger>
                            <SelectContent>
                                {models.map((model) => (
                                    <SelectItem key={model.name} value={model.name}>
                                        <div className="flex items-center gap-2">
                                            <span>{model.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                ({model.type})
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground border-l pl-4 ml-4">
                    <Eye className="h-4 w-4" />
                    <span>Vision:</span>
                    {isLoadingModels ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Select
                            value={visionModel || ""}
                            onValueChange={(value) => {
                                setVisionModel(value);
                                updateCanvasSettings({ vision_model: value });
                            }}
                        >
                            <SelectTrigger className="w-[200px] h-8 text-sm">
                                <SelectValue placeholder="Select vision model..." />
                            </SelectTrigger>
                            <SelectContent>
                                {models.filter(m => m.is_vision).map((model) => (
                                    <SelectItem key={model.name} value={model.name}>
                                        <div className="flex items-center gap-2">
                                            <span>{model.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                ({model.type})
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                                {models.filter(m => m.is_vision).length === 0 && (
                                    <div className="p-2 text-xs text-muted-foreground">
                                        No vision models configured
                                    </div>
                                )}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1 border-l pl-4 ml-4 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-md">
                <Button
                    variant={selectionMode === "hand" ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("h-8 w-8 p-0", selectionMode === "hand" && "bg-white dark:bg-slate-700 shadow-sm")}
                    onClick={() => setSelectionMode("hand")}
                    title="Hand Tool (Pan) - Hold Shift to Select"
                >
                    <Hand className="h-4 w-4" />
                </Button>
                <Button
                    variant={selectionMode === "selection" ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("h-8 w-8 p-0", selectionMode === "selection" && "bg-white dark:bg-slate-700 shadow-sm")}
                    onClick={() => setSelectionMode("selection")}
                    title="Pointer Tool (Select) - Drag to Select"
                >
                    <MousePointer2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex items-center gap-1 border-l pl-4 ml-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-slate-500 hover:text-primary"
                    onClick={() => setScenarioSelectorOpen(true)}
                    title="Scenarios (Vertical Modes)"
                >
                    <Layers className="h-4 w-4 mr-2" />
                    Scenarios
                </Button>
                <ScenarioSelector
                    open={scenarioSelectorOpen}
                    onOpenChange={setScenarioSelectorOpen}
                    onSelect={handleScenarioSelect}
                />
            </div>

            <div className="flex items-center gap-2 border-l pl-4 ml-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-slate-500 hover:text-blue-600"
                    onClick={handleCaptureThumbnail}
                    title="3D orientation thumbnail"
                >
                    <Camera className="h-4 w-4 mr-2" />
                    3D capture
                </Button>
            </div>

            <div className="flex items-center gap-2 border-l pl-4 ml-4">
                <div className="flex items-center gap-2">
                    <Label htmlFor="grid-toggle" className="text-xs font-medium text-slate-500 cursor-pointer">
                        Grid
                    </Label>
                    <Switch
                        id="grid-toggle"
                        checked={useCanvasStore((s) => s.snapToGrid)}
                        onCheckedChange={() => useCanvasStore.getState().toggleSnapToGrid()}
                    />
                </div>
            </div>

            <div className="flex items-center gap-2 border-l pl-4 ml-4">
                <div className="flex items-center gap-2">
                    <Label htmlFor="links-toggle" className="text-xs font-medium text-slate-500 cursor-pointer">
                        Links
                    </Label>
                    <Switch
                        id="links-toggle"
                        checked={showLinks}
                        onCheckedChange={() => toggleShowLinks()}
                    />
                </div>
            </div>

            <div className="flex items-center gap-2 border-l pl-4 ml-4 h-8">
                <div className="flex items-center gap-2">
                    <Label htmlFor="semantic-toggle" className="text-xs font-medium text-slate-500 cursor-pointer">
                        Semantic
                    </Label>
                    <Switch
                        id="semantic-toggle"
                        checked={!!semanticZoomEnabled}
                        onCheckedChange={setSemanticZoomEnabled}
                    />
                </div>

                <ZoomIndicator />
            </div>

            <div className="flex items-center gap-2 border-l pl-4 ml-4">
                <Button
                    id="canvas-sync-btn"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-slate-500 hover:text-green-600"
                    onClick={async () => {
                        const confirmed = window.confirm("Sync All Files?");
                        if (confirmed) {
                            try {
                                // @ts-ignore
                                await useCanvasStore.getState().syncAllThings();
                                toast({ title: "Sync Complete" });
                                refreshThings();
                            } catch (error) {
                                toast({ title: "Sync Failed", variant: "destructive" });
                            }
                        }
                    }}
                    title="Sync All Files"
                >
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Sync All
                </Button>

                <div className="h-6 w-px bg-border mx-2" />

                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 shadow-sm"
                            disabled={selectedThingIds.length === 0 && selectedDomainIds.length === 0}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete ({selectedThingIds.length + selectedDomainIds.length})
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Selected Items?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete {selectedThingIds.length} things and {selectedDomainIds.length} domains.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => deleteSelectedNodes()}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div >
    );
});

function ZoomIndicator() {
    const viewport = useCanvasStore((s) => s.viewport);
    return (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500 tabular-nums min-w-[45px] justify-center">
            {Math.round(viewport.zoom * 100)}%
        </div>
    );
}
