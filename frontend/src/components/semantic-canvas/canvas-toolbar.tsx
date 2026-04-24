/**
 * Canvas Toolbar
 * 
 * Floating toolbar for model selection, tool selection, and global toggles.
 * Isolated to prevent full canvas re-renders on minor UI state changes.
 */
"use client";

import * as React from "react";
import { Brain, Loader2, Eye, Hand, MousePointer2, Camera, RefreshCcw, Trash2, Bot, Sparkles, User, Layers, Wand2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useCanvasStore } from "./canvas-store";
import { cn, API_URL } from "@/lib/utils";
import { ScenarioSelector } from "./scenario-selector";
import { CanvasSettingsDialog } from "./canvas-settings-dialog";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import domToImage from "dom-to-image-more";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ModelPreset {
    id?: number | string;
    name: string;
    type: "local" | "remote";
    model_name?: string;
    is_vision?: boolean;
    is_speech?: boolean;
    is_browser_native?: boolean;
}

export const CanvasToolbar = React.memo(function CanvasToolbar() {
    const { toast } = useToast();

    // Selectors to minimize re-renders
    const selectedModel = useCanvasStore((s) => s.selectedModel);
    const visionModel = useCanvasStore((s) => s.visionModel);
    const selectedSttModel = useCanvasStore((s) => s.selectedSttModel);
    const sttProfiles = useCanvasStore((s) => s.sttProfiles);
    const selectionMode = useCanvasStore((s) => s.selectionMode);
    const showLinks = useCanvasStore((s) => s.showLinks);
    const semanticZoomEnabled = useCanvasStore((s) => s.semanticZoomEnabled);
    const selectedThingIds = useCanvasStore((s) => s.selectedThingIds);
    const selectedDomainIds = useCanvasStore((s) => s.selectedDomainIds);
    const canvasId = useCanvasStore((s) => s.canvasId);
    const activeScenario = useCanvasStore((s) => s.activeScenario);
    const toolbarConfig = activeScenario?.configuration?.ui_overrides?.toolbar_config;
    const selectedKbId = useCanvasStore((s) => s.selectedKbId);
    // Viewport moved to ZoomIndicator for performance

    // Actions
    const setSelectedModel = useCanvasStore((s) => s.setSelectedModel);
    const setVisionModel = useCanvasStore((s) => s.setVisionModel);
    const setSelectedSttModel = useCanvasStore((s) => s.setSelectedSttModel);
    const setSttProfiles = useCanvasStore((s) => s.setSttProfiles);
    const setSelectionMode = useCanvasStore((s) => s.setSelectionMode);
    const toggleShowLinks = useCanvasStore((s) => s.toggleShowLinks);
    const setSemanticZoomEnabled = useCanvasStore((s) => s.setSemanticZoomEnabled);
    const deleteSelectedNodes = useCanvasStore((s) => s.deleteSelectedNodes);
    const things = useCanvasStore((s) => s.things);
    const domains = useCanvasStore((s) => s.domains);
    const refreshThings = useCanvasStore((s) => s.refreshThings);
    const updateCanvasSettings = useCanvasStore((s) => s.updateCanvasSettings);
    const setSelectedKbId = useCanvasStore((s) => s.setSelectedKbId);

    // @ts-ignore
    const showStandardTools = !toolbarConfig || toolbarConfig.keep_standard_tools !== false;

    const handleCustomTool = (tool: any) => {
        // useCanvasStore.getState().executeCustomTool(tool); // Pending Implementation 
        // For now, just toast
        toast({ title: "Custom Tool Clicked", description: `You clicked ${tool.label}` });
    };

    const [models, setModels] = React.useState<ModelPreset[]>([]);
    const [isLoadingModels, setIsLoadingModels] = React.useState(true);
    const [scenarioSelectorOpen, setScenarioSelectorOpen] = React.useState(false);

    const [kbs, setKbs] = React.useState<any[]>([]);
    const [isLoadingKbs, setIsLoadingKbs] = React.useState(true);



    React.useEffect(() => {
        const fetchModels = async () => {
            try {
                const token = localStorage.getItem("token");
                const headers: HeadersInit = token ? { "Authorization": `Bearer ${token}` } : {};

                const [presetsRes, defaultsRes, kbsRes] = await Promise.all([
                    fetch(`${API_URL}/config/presets`, { headers }),
                    fetch(`${API_URL}/config/defaults`, { headers }),
                    fetch(`${API_URL}/knowledge/kb`, { headers })
                ]);

                if (presetsRes.ok) {
                    const data = await presetsRes.json();
                    const presetList: ModelPreset[] = data.presets || [];
                    setModels(presetList);

                    let defaultLlmName: string | null = null;
                    let defaultVisionName: string | null = null;
                    let defaultSttName: string | null = null;

                    if (defaultsRes.ok) {
                        const defaults = await defaultsRes.json();
                        defaultLlmName = defaults.default_llm;
                        defaultVisionName = defaults.default_vision;
                        defaultSttName = defaults.default_speech;
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

                    // Handle STT Profiles
                    const sttList = presetList.filter(p => (p as any).is_speech);
                    setSttProfiles(sttList);

                    if (!selectedSttModel) {
                        if (defaultSttName && sttList.some(p => p.name === defaultSttName)) {
                            setSelectedSttModel(defaultSttName);
                        } else if (sttList.length > 0) {
                            // If we have an ID, we should use it. 
                            // In transcribe.py it looks for name or id.
                            const firstStt = sttList[0];
                            setSelectedSttModel((firstStt as any).id?.toString() || firstStt.name);
                        }
                    }
                }

                if (kbsRes && kbsRes.ok) {
                    const kbData = await kbsRes.json();
                    setKbs(kbData);
                }
            } catch (error) {
                console.error("Failed to fetch model presets or kbs:", error);
            } finally {
                setIsLoadingModels(false);
                setIsLoadingKbs(false);
            }
        };
        fetchModels();
    }, [selectedModel, visionModel, selectedSttModel, setSelectedModel, setVisionModel, setSelectedSttModel, setSttProfiles]);

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
        <div className="flex flex-wrap items-center justify-between px-4 py-2 border-b bg-white dark:bg-slate-900 shrink-0 gap-y-2">
            <div id="canvas-model-selectors" className="flex flex-wrap items-center gap-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">
                    <Brain className="h-4 w-4" />
                    <span>Model:</span>
                    {isLoadingModels ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Select
                            value={selectedModel || ""}
                            onValueChange={(value) => {
                                console.log("[CanvasToolbar] Selected Model Change:", value);
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

                <div className="flex items-center gap-2 text-sm text-muted-foreground border-l pl-4 mr-4">
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



                <div className="flex items-center gap-2 text-sm text-muted-foreground border-l pl-4 mr-4">
                    <LucideIcons.Database className="h-4 w-4" />
                    <span>Knowledge Base:</span>
                    {isLoadingKbs ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Select
                            value={selectedKbId || "none"}
                            onValueChange={(value) => {
                                setSelectedKbId(value === "none" ? null : value);
                                updateCanvasSettings({ kb_id: value === "none" ? null : value });
                            }}
                        >
                            <SelectTrigger className="w-[200px] h-8 text-sm">
                                <SelectValue placeholder="Select Knowledge Base..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">
                                    <span className="text-muted-foreground italic">None</span>
                                </SelectItem>
                                {kbs.map((kb) => (
                                    <SelectItem key={kb.id} value={kb.id}>
                                        <div className="flex flex-col">
                                            <span>{kb.name}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                                {kbs.length === 0 && (
                                    <div className="p-2 text-xs text-muted-foreground">
                                        No active KBs found
                                    </div>
                                )}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-md border">
                    {showStandardTools && (
                        <>
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
                        </>
                    )}

                    {/* Custom Main Tools moved to Node Selection Toolbar */}
                </div>

                <div className="flex items-center gap-1 border-l pl-4">
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

                <div className="h-6 w-px bg-border mx-2 hidden sm:block" />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 shadow-sm">
                            <LucideIcons.MoreHorizontal className="h-4 w-4 mr-2" />
                            View & Actions
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[240px]">
                        <DropdownMenuLabel>View Options</DropdownMenuLabel>

                        <div className="flex items-center justify-between px-2 py-1.5">
                            <Label htmlFor="grid-toggle" className="text-sm font-normal cursor-pointer">
                                Show Grid
                            </Label>
                            <Switch
                                id="grid-toggle"
                                checked={useCanvasStore((s) => s.snapToGrid)}
                                onCheckedChange={() => useCanvasStore.getState().toggleSnapToGrid()}
                            />
                        </div>

                        <div className="flex items-center justify-between px-2 py-1.5">
                            <Label htmlFor="links-toggle" className="text-sm font-normal cursor-pointer">
                                Show Links
                            </Label>
                            <Switch
                                id="links-toggle"
                                checked={showLinks}
                                onCheckedChange={() => toggleShowLinks()}
                            />
                        </div>

                        <div className="flex items-center justify-between px-2 py-1.5 border-b pb-2 mb-1">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="semantic-toggle" className="text-sm font-normal cursor-pointer">
                                    Semantic Zoom
                                </Label>
                            </div>
                            <div className="flex flex-row items-center gap-2">
                                <Switch
                                    id="semantic-toggle"
                                    checked={!!semanticZoomEnabled}
                                    onCheckedChange={setSemanticZoomEnabled}
                                />
                                <ZoomIndicator />
                            </div>
                        </div>

                        <DropdownMenuLabel>Actions</DropdownMenuLabel>

                        <DropdownMenuItem onClick={handleCaptureThumbnail} className="cursor-pointer">
                            <Camera className="h-4 w-4 mr-2 text-slate-500" />
                            <span>Capture 3D Thumbnail</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                            className="cursor-pointer text-green-600 focus:text-green-600 focus:bg-green-50 dark:focus:bg-green-950/30"
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
                        >
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            <span>Sync All Files</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <div className="h-6 w-px bg-border mx-2 hidden sm:block" />

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
                    <AlertDialogContent className="max-w-md w-full overflow-hidden flex flex-col max-h-[90vh] p-0 gap-0 shadow-2xl border-slate-200 dark:border-slate-800">
                        <div className="p-6 pb-2 shrink-0">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-xl font-bold tracking-tight">Delete Selected Items?</AlertDialogTitle>
                                <AlertDialogDescription className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                    This will permanently delete {selectedThingIds.length} things and {selectedDomainIds.length} domains.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                        </div>

                        <div className="px-6 py-2 flex-1 min-h-0">
                            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-50/50 dark:bg-slate-900/50 flex flex-col h-[280px] w-full min-w-0">
                                <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b flex justify-between items-center shrink-0">
                                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500">Items List</span>
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full shadow-sm">
                                        {selectedThingIds.length + selectedDomainIds.length} Selected
                                    </span>
                                </div>

                                <div className="overflow-y-auto flex-1 p-2 space-y-1 w-full min-w-0 scroll-smooth">
                                    {selectedThingIds.map(id => {
                                        const thing = things.find(t => t.id === id);
                                        return (
                                            <div key={id} className="flex items-center gap-3 py-2 px-3 hover:bg-white dark:hover:bg-slate-800 rounded-md transition-all group border border-transparent hover:border-slate-200/50 dark:hover:border-slate-700/50 hover:shadow-sm min-w-0">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)] shrink-0" />
                                                <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 flex-1 truncate min-w-0">
                                                    {thing?.title || thing?.type || "Unknown Thing"}
                                                </span>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0 bg-slate-100 dark:bg-slate-900/80 px-2 py-0.5 rounded-sm whitespace-nowrap min-w-[70px] text-center">
                                                    {thing?.type || "Thing"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {selectedDomainIds.map(id => {
                                        const domain = domains.find(d => d.id === id);
                                        return (
                                            <div key={id} className="flex items-center gap-3 py-2 px-3 hover:bg-white dark:hover:bg-slate-800 rounded-md transition-all group border border-transparent hover:border-slate-200/50 dark:hover:border-slate-700/50 hover:shadow-sm min-w-0">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)] shrink-0" />
                                                <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 flex-1 truncate min-w-0">
                                                    {domain?.name || "Unnamed Domain"}
                                                </span>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0 bg-slate-100 dark:bg-slate-900/80 px-2 py-0.5 rounded-sm whitespace-nowrap min-w-[70px] text-center">
                                                    Domain
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 pt-4 border-t bg-slate-50 dark:bg-slate-900/40 shrink-0 mt-2">
                            <AlertDialogFooter className="sm:space-x-3 gap-2 sm:gap-0">
                                <AlertDialogCancel className="mt-0 font-semibold px-6 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => deleteSelectedNodes()}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold px-6 shadow-md"
                                >
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </div>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            <div className="flex items-center gap-2">
                <CanvasSettingsDialog />
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
