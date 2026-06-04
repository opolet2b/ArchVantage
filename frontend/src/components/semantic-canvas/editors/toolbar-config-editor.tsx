/**
 * Toolbar Configuration Editor
 *
 * Allows configuring custom toolbars for a scenario.
 * Supports:
 * - Selecting LLM/VLM for tool assistance (uses the scenario-level builder LLM
 *   set in the General tab, with an optional per-toolbar override)
 * - Toggling standard tools
 * - Adding/Editing/Reordering custom tools for Main and Selection toolbars
 *
 * PEP 8 style guide compliant.
 */
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Plus,
    Trash2,
    MoveUp,
    MoveDown,
    Wand2,
    Bot,
    MousePointer2,
    Hand,
    MessagesSquare,
    PenTool,
    LucideIcon,
    icons,
    Search,
    Save,
    Share,
    Zap,
    Rocket,
    Play,
    Settings,
    Eye,
    Code,
    Link,
    List,
    Check,
    AlertTriangle,
    Info,
    HelpCircle
} from "lucide-react";
import { API_URL } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import * as LucideIcons from "lucide-react";

// Types
export interface ToolbarTool {
    id: string;
    label: string;
    icon: string; // Lucide icon name
    prompt: string;
    location: "main" | "selection";
}

export interface ToolbarConfig {
    keep_standard_tools: boolean;
    llm_model?: string; // Optional per-toolbar model override
    tools: ToolbarTool[];
}

interface ToolbarConfigEditorProps {
    config: ToolbarConfig;
    onChange: (config: ToolbarConfig) => void;
    disabled?: boolean;
    /**
     * The scenario-level builder LLM (set in the General tab).
     * Used as the effective model for Suggest when config.llm_model is not set.
     * This is NOT the execution LLM — it is only used for AI-assisted editing.
     */
    buildingLlm?: string;
}

const COMMON_ICONS = [
    "Sparkles", "Bot", "Wand2", "Brain", "Search",
    "FileText", "MessageSquare", "PenTool", "Trash2",
    "Save", "Share", "Zap", "Rocket", "Play",
    "Settings", "Eye", "Code", "Link", "List",
    "Check", "AlertTriangle", "Info", "HelpCircle"
].sort();

export function ToolbarConfigEditor({ config, onChange, disabled, buildingLlm }: ToolbarConfigEditorProps) {
    const { toast } = useToast();
    const [models, setModels] = React.useState<any[]>([]);

    // Editor State
    const [editingTool, setEditingTool] = React.useState<ToolbarTool | null>(null);
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);
    const [suggestLoading, setSuggestLoading] = React.useState(false);

    // Effective model: use per-toolbar override first, then the scenario-level builder LLM.
    // This ensures the Suggest button works as long as a builder LLM is configured anywhere.
    const effectiveLlm = config.llm_model || buildingLlm || null;

    // Load Models
    React.useEffect(() => {
        const fetchModels = async () => {
            try {
                const token = localStorage.getItem("token");
                const headers: HeadersInit = token ? { "Authorization": `Bearer ${token}` } : {};
                const res = await fetch(`${API_URL}/config/presets`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    setModels(data.presets || []);
                }
            } catch (e) {
                console.error("Failed to load models", e);
            }
        };
        fetchModels();
    }, []);

    const handleAddTool = (location: "main" | "selection") => {
        setEditingTool({
            id: crypto.randomUUID(),
            label: "",
            icon: "Sparkles",
            prompt: "",
            location
        });
        setIsDialogOpen(true);
    };

    const handleEditTool = (tool: ToolbarTool) => {
        setEditingTool({ ...tool });
        setIsDialogOpen(true);
    };

    const handleSaveTool = () => {
        if (!editingTool) return;
        if (!editingTool.label || !editingTool.prompt) {
            toast({ title: "Validation Error", description: "Label and Prompt are required.", variant: "destructive" });
            return;
        }

        const newTools = [...config.tools];
        const index = newTools.findIndex(t => t.id === editingTool.id);

        if (index >= 0) {
            newTools[index] = editingTool;
        } else {
            newTools.push(editingTool);
        }

        onChange({
            ...config,
            tools: newTools
        });
        setIsDialogOpen(false);
        setEditingTool(null);
    };

    const handleDeleteTool = (id: string) => {
        onChange({
            ...config,
            tools: config.tools.filter(t => t.id !== id)
        });
    };

    const handleMoveTool = (id: string, direction: "up" | "down") => {
        const tools = [...config.tools];
        const index = tools.findIndex(t => t.id === id);
        if (index < 0) return;

        // Note: This simple swap logic assumes we are viewing a filtered list, 
        // but we need to swap in the Main list. 
        // To do this correctly for "grouped" views, we need to find the specific "neighbor" of the same location type.

        const currentTool = tools[index];
        // Find all tools of same location
        const sameLocationTools = tools.filter(t => t.location === currentTool.location);
        const localIndex = sameLocationTools.findIndex(t => t.id === id);

        if (direction === "up" && localIndex > 0) {
            const neighbor = sameLocationTools[localIndex - 1];
            const neighborIndex = tools.findIndex(t => t.id === neighbor.id);
            // Swap
            [tools[index], tools[neighborIndex]] = [tools[neighborIndex], tools[index]];
        } else if (direction === "down" && localIndex < sameLocationTools.length - 1) {
            const neighbor = sameLocationTools[localIndex + 1];
            const neighborIndex = tools.findIndex(t => t.id === neighbor.id);
            // Swap
            [tools[index], tools[neighborIndex]] = [tools[neighborIndex], tools[index]];
        }

        onChange({ ...config, tools });
    };

    const handleSuggest = async () => {
        // Prefer the per-toolbar model override, then fall back to the scenario-level builder LLM
        if (!effectiveLlm) {
            toast({
                title: "No Builder LLM Selected",
                description: "Go to the General tab of the Scenario Editor and select a Builder LLM for this scenario.",
                variant: "destructive"
            });
            return;
        }
        if (!editingTool?.prompt) {
            toast({ title: "Empty Prompt", description: "Enter a rough prompt first.", variant: "destructive" });
            return;
        }

        setSuggestLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/ai/generate_system_prompt`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    // Use the effective LLM (toolbar override → scenario builder LLM)
                    model: effectiveLlm,
                    task_description: editingTool.prompt
                })
            });

            if (res.ok) {
                const data = await res.json();
                setEditingTool(prev => prev ? ({ ...prev, prompt: data.system_prompt || data.prompt || prev.prompt }) : null);
                toast({ title: "Prompt Refined" });
            } else {
                toast({ title: "Suggestion Failed", description: "Could not refine prompt.", variant: "destructive" });
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to connect to AI service.", variant: "destructive" });
        } finally {
            setSuggestLoading(false);
        }
    };

    // Render Helper for Tool List
    const ToolList = ({ location }: { location: "main" | "selection" }) => {
        const tools = config.tools.filter(t => t.location === location);

        return (
            <div className="space-y-2">
                {tools.length === 0 && (
                    <div className="text-sm text-muted-foreground italic border border-dashed rounded p-4 text-center">
                        No custom tools defined.
                    </div>
                )}
                {tools.map((tool, idx) => {
                    // Dynamic Icon Component
                    // @ts-ignore
                    const IconComp = LucideIcons[tool.icon] || LucideIcons.Sparkles;

                    return (
                        <div key={tool.id} className="flex items-center gap-2 p-2 rounded border bg-card">
                            <div className="w-8 h-8 flex items-center justify-center bg-muted rounded">
                                <IconComp className="w-4 h-4" />
                            </div>
                            <div className="flex-1 font-medium text-sm">
                                {tool.label}
                            </div>
                            <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleMoveTool(tool.id, "up")} disabled={idx === 0}>
                                    <MoveUp className="w-3 h-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleMoveTool(tool.id, "down")} disabled={idx === tools.length - 1}>
                                    <MoveDown className="w-3 h-3" />
                                </Button>
                                <div className="w-px h-4 bg-border mx-1" />
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditTool(tool)}>
                                    <PenTool className="w-3 h-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteTool(tool.id)}>
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => handleAddTool(location)}>
                    <Plus className="w-3 h-3 mr-2" /> Add Tool
                </Button>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="pt-6 grid gap-6">
                    {/* Header Config */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>AI Configuration Override</Label>
                            <Select
                                value={config.llm_model || ""}
                                onValueChange={(val) => onChange({ ...config, llm_model: val || undefined })}
                                disabled={disabled}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={buildingLlm ? `Using: ${buildingLlm} (builder LLM)` : "Select LLM override..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {models.map(m => (
                                        <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {/* Show which model will actually be used for Suggest */}
                            {effectiveLlm ? (
                                <p className="text-xs text-muted-foreground">
                                    Suggest will use: <strong>{effectiveLlm}</strong>
                                    {config.llm_model
                                        ? " (toolbar override)"
                                        : " (scenario builder LLM — set in General tab)"}
                                </p>
                            ) : (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                    ⚠ No LLM configured. Set a Builder LLM in the General tab.
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Options</Label>
                            <div className="flex items-center space-x-2 border p-3 rounded-md">
                                <Switch
                                    id="keep-std"
                                    checked={config.keep_standard_tools}
                                    onCheckedChange={(checked) => onChange({ ...config, keep_standard_tools: checked })}
                                    disabled={disabled}
                                />
                                <Label htmlFor="keep-std" className="text-sm font-medium cursor-pointer">
                                    Keep Standard Tools
                                </Label>
                            </div>
                        </div>
                    </div>

                    {/* Tool Lists */}
                    <div className="grid grid-cols-2 gap-8">
                        {/* Toolbox (Node Toolbar) */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 pb-2 border-b">
                                <MousePointer2 className="w-4 h-4 text-muted-foreground" />
                                <h3 className="font-semibold text-sm">Toolbox (Node Selection)</h3>
                            </div>
                            <ToolList location="main" />
                        </div>

                        {/* Green Toolbox (Text Selection) */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 pb-2 border-b">
                                <Hand className="w-4 h-4 text-green-600" />
                                <h3 className="font-semibold text-sm">Green Toolbox (Text Context)</h3>
                            </div>
                            <ToolList location="selection" />
                        </div>
                    </div>

                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingTool?.id ? "Edit Tool" : "New Tool"}</DialogTitle>
                        <DialogDescription>Configure the tool's appearance and behavior.</DialogDescription>
                    </DialogHeader>

                    {editingTool && (
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Label</Label>
                                    <Input
                                        value={editingTool.label}
                                        onChange={e => setEditingTool({ ...editingTool, label: e.target.value })}
                                        placeholder="e.g. Summarize"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Icon</Label>
                                    <Select
                                        value={editingTool.icon}
                                        onValueChange={(val) => setEditingTool({ ...editingTool, icon: val })}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select icon..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <ScrollArea className="h-[200px]">
                                                {COMMON_ICONS.map((iconName) => {
                                                    // @ts-ignore
                                                    const IconC = LucideIcons[iconName] || LucideIcons.HelpCircle;
                                                    return (
                                                        <SelectItem key={iconName} value={iconName}>
                                                            <div className="flex items-center gap-2">
                                                                <IconC className="w-4 h-4" />
                                                                <span>{iconName}</span>
                                                            </div>
                                                        </SelectItem>
                                                    );
                                                })}
                                            </ScrollArea>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Label>Prompt</Label>
                                    <Button variant="ghost" size="sm" className="h-5 text-xs gap-1 text-blue-600" onClick={handleSuggest} disabled={suggestLoading}>
                                        <Wand2 className="w-3 h-3" />
                                        {suggestLoading ? "Generating..." : "Suggest"}
                                    </Button>
                                </div>
                                <Textarea
                                    className="min-h-[100px] max-h-[50vh] overflow-y-auto font-mono text-xs"
                                    value={editingTool.prompt}
                                    onChange={e => setEditingTool({ ...editingTool, prompt: e.target.value })}
                                    placeholder="Enter the system prompt or instructions for this tool..."
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveTool}>Save Tool</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
