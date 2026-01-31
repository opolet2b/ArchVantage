/**
 * Scenario Editor Component
 *
 * Form interface for creating and editing Scenarios.
 * Supports metadata editing and visual configuration of domains.
 */
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, X, Layers, AlertCircle } from "lucide-react";
import { Scenario } from "./canvas-store";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ScenarioEditorProps {
    initialData?: Partial<Scenario>; // if provided, we are editing
    onSave: (data: Partial<Scenario>) => Promise<void>;
    onCancel: () => void;
}

export function ScenarioEditor({ initialData, onSave, onCancel }: ScenarioEditorProps) {
    const { toast } = useToast();
    const [saving, setSaving] = React.useState(false);

    // Metadata State
    const [name, setName] = React.useState(initialData?.name || "");
    const [description, setDescription] = React.useState(initialData?.description || "");
    const [themeColor, setThemeColor] = React.useState(initialData?.theme_color || "#3b82f6");

    // Domains State (extracted from configuration)
    const [domains, setDomains] = React.useState<any[]>(
        initialData?.configuration?.domain_definitions || []
    );

    // Advanced Config (JSON)
    const [advancedConfig, setAdvancedConfig] = React.useState(
        JSON.stringify(
            { ...initialData?.configuration, domain_definitions: undefined }, // exclude domains as they are managed via UI
            null,
            2
        )
    );

    const handleAddDomain = () => {
        setDomains([
            ...domains,
            {
                id: `domain_${Date.now()}`,
                label: "New Domain",
                visual_config: { primary_color: "#10b981", icon: "box", shape: "rounded" }
            }
        ]);
    };

    const handleUpdateDomain = (index: number, field: string, value: any) => {
        const newDomains = [...domains];
        if (field.startsWith("visual_config.")) {
            const configField = field.split(".")[1];
            newDomains[index].visual_config = {
                ...newDomains[index].visual_config,
                [configField]: value
            };
        } else {
            newDomains[index][field] = value;
        }
        setDomains(newDomains);
    };

    const handleDeleteDomain = (index: number) => {
        setDomains(domains.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            // Validate JSON
            let parsedExtras = {};
            try {
                parsedExtras = JSON.parse(advancedConfig);
            } catch (err) {
                toast({ title: "Invalid JSON", description: "Please fix errors in Advanced Configuration.", variant: "destructive" });
                setSaving(false);
                return;
            }

            if (!name.trim()) {
                toast({ title: "Validation Error", description: "Name is required.", variant: "destructive" });
                setSaving(false);
                return;
            }

            const payload: Partial<Scenario> = {
                name,
                description,
                theme_color: themeColor,
                configuration: {
                    ...parsedExtras,
                    domain_definitions: domains
                }
            };

            await onSave(payload);
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to save scenario.", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="h-full flex flex-col gap-6 max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {initialData ? "Edit Scenario" : "Create New Scenario"}
                    </h1>
                    <p className="text-muted-foreground">Configure your vertical mode.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {saving && <span className="animate-spin mr-2">⏳</span>}
                        {initialData ? "Save Changes" : "Create Scenario"}
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1 pr-4">
                <div className="flex flex-col gap-8 pb-10">
                    {/* Basic Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Scenario Name</Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g. Recruiter Mode"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="color">Theme Color</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="color"
                                            type="color"
                                            value={themeColor}
                                            onChange={(e) => setThemeColor(e.target.value)}
                                            className="w-12 h-10 p-1 cursor-pointer"
                                        />
                                        <Input
                                            value={themeColor}
                                            onChange={(e) => setThemeColor(e.target.value)}
                                            placeholder="#RRGGBB"
                                            className="font-mono uppercase"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Describe the purpose of this scenario..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Domains Editor */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Domain Definitions</CardTitle>
                                <CardDescription>Define the types of entities available in this scenario.</CardDescription>
                            </div>
                            <Button type="button" size="sm" variant="outline" onClick={handleAddDomain}>
                                <Plus className="w-4 h-4 mr-2" /> Add Domain
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {domains.length === 0 && (
                                    <div className="text-sm text-center py-6 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                                        No domains defined. Add one to categorize content.
                                    </div>
                                )}
                                {domains.map((domain, idx) => (
                                    <div key={idx} className="flex gap-4 items-start p-4 border rounded-lg bg-card shadow-sm">
                                        <div className="flex-1 grid grid-cols-12 gap-4">
                                            <div className="col-span-5 space-y-1">
                                                <Label className="text-xs">Label</Label>
                                                <Input
                                                    value={domain.label || ""}
                                                    onChange={(e) => handleUpdateDomain(idx, "label", e.target.value)}
                                                    placeholder="e.g. Candidate"
                                                    className="h-8"
                                                />
                                            </div>
                                            <div className="col-span-5 space-y-1">
                                                <Label className="text-xs">ID (System Name)</Label>
                                                <Input
                                                    value={domain.id || ""}
                                                    onChange={(e) => handleUpdateDomain(idx, "id", e.target.value)}
                                                    placeholder="e.g. candidate"
                                                    className="h-8 font-mono text-xs"
                                                />
                                            </div>
                                            <div className="col-span-2 space-y-1">
                                                <Label className="text-xs">Color</Label>
                                                <Input
                                                    type="color"
                                                    value={domain.visual_config?.primary_color || "#000000"}
                                                    onChange={(e) => handleUpdateDomain(idx, "visual_config.primary_color", e.target.value)}
                                                    className="h-8 p-0.5 w-full"
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive mt-5 h-8 w-8"
                                            onClick={() => handleDeleteDomain(idx)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* JSON Config */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Advanced Configuration</CardTitle>
                            <CardDescription>Configure automations, UI overrides, and metadata schemas (JSON).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Alert className="mb-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                                <AlertCircle className="w-4 h-4" />
                                <AlertDescription>
                                    Modify `automations` and `ui_overrides` here. `domain_definitions` are managed above and will be merged automatically.
                                </AlertDescription>
                            </Alert>
                            <div className="font-mono text-xs">
                                <Textarea
                                    value={advancedConfig}
                                    onChange={(e) => setAdvancedConfig(e.target.value)}
                                    rows={15}
                                    className="resize-y"
                                    placeholder="{}"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </ScrollArea>
        </form>
    );
}
