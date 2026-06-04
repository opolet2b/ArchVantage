/**
 * Scenario Editor Component
 *
 * Form interface for creating and editing Scenarios.
 * Supports metadata editing and visual configuration of domains.
 *
 * PEP 8 style guide compliant.
 */
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Box, Share2, Wrench, FileJson, Lock, Zap, List, Brain } from "lucide-react";
import { API_URL } from "@/lib/utils";

import { Scenario, DomainDefinition, DomainGroup, MetadataField } from "./canvas-store";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DomainPalette } from "./editors/domain-palette";
import { LinkTypeEditor } from "./editors/link-type-editor";
import { AutomationEditor } from "./editors/automation-editor";
import { MetadataSchemaEditor } from "./editors/metadata-schema-editor";
import { ToolbarConfigEditor, ToolbarConfig } from "./editors/toolbar-config-editor";

interface ScenarioEditorProps {
    initialData?: Partial<Scenario>; // if provided, we are editing
    onSave: (data: Partial<Scenario>) => Promise<void>;
    onCancel: () => void;
}

export function ScenarioEditor({ initialData, onSave, onCancel }: ScenarioEditorProps) {
    const { toast } = useToast();
    const [saving, setSaving] = React.useState(false);

    // Basic State
    const [name, setName] = React.useState(initialData?.name || "");
    const [description, setDescription] = React.useState(initialData?.description || "");
    const [themeColor, setThemeColor] = React.useState(initialData?.theme_color || "#3b82f6");
    const [isDefault, setIsDefault] = React.useState(initialData?.is_default || false);

    // Domain State
    const [domains, setDomains] = React.useState<DomainDefinition[]>(
        initialData?.configuration?.domain_definitions || []
    );
    const [groups, setGroups] = React.useState<DomainGroup[]>(
        initialData?.configuration?.domain_groups || []
    );
    const [linkTypes, setLinkTypes] = React.useState<any[]>(
        initialData?.configuration?.link_types || []
    );
    const [thingMetadata, setThingMetadata] = React.useState<MetadataField[]>(
        initialData?.configuration?.thing_metadata_schema || []
    );
    const [keepStandardLinks, setKeepStandardLinks] = React.useState(
        initialData?.configuration?.keep_standard_links ?? false
    );
    const [automations, setAutomations] = React.useState<any[]>(
        initialData?.configuration?.automations || []
    );

    // Toolbar Config
    const [toolbarConfig, setToolbarConfig] = React.useState<ToolbarConfig>(
        initialData?.configuration?.ui_overrides?.toolbar_config || {
            keep_standard_tools: true,
            tools: []
        }
    );

    // -------------------------------------------------------------------------
    // Builder LLM: the LLM used only for building THIS scenario
    // (AI-assisted Suggest / Generate Workflow buttons in the scenario editor).
    // This is NOT the execution LLM selected on the canvas at runtime.
    // -------------------------------------------------------------------------
    const [buildingLlm, setBuildingLlm] = React.useState<string>(
        initialData?.configuration?.building_llm || ""
    );
    // Available LLM presets (fetched from /config/presets)
    const [llmPresets, setLlmPresets] = React.useState<any[]>([]);

    React.useEffect(() => {
        // Fetch available LLM configuration presets for the builder dropdown
        const fetchPresets = async () => {
            try {
                const token = localStorage.getItem("token");
                const headers: HeadersInit = token
                    ? { Authorization: `Bearer ${token}` }
                    : {};
                const res = await fetch(`${API_URL}/config/presets`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    setLlmPresets(data.presets || []);
                }
            } catch (e) {
                console.error("Failed to load LLM presets for scenario editor", e);
            }
        };
        fetchPresets();
    }, []);

    // Advanced Config (JSON) - Excludes UI managed fields
    const [advancedConfig, setAdvancedConfig] = React.useState("");

    React.useEffect(() => {
        if (initialData?.configuration) {
            // Exclude all UI-managed fields so they don't appear twice in the JSON editor
            const {
                domain_definitions,
                domain_groups,
                link_types,
                thing_metadata_schema,
                keep_standard_links,
                automations,
                ui_overrides,
                building_llm,
                ...rest
            } = initialData.configuration;
            setAdvancedConfig(JSON.stringify(rest, null, 2));
        } else {
            setAdvancedConfig("{}");
        }
    }, [initialData]);

    const isSystem = initialData?.is_system;

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
                is_default: isDefault,
                configuration: {
                    ...parsedExtras,
                    domain_definitions: domains,
                    domain_groups: groups,
                    link_types: linkTypes,
                    thing_metadata_schema: thingMetadata,
                    keep_standard_links: keepStandardLinks,
                    automations: automations,
                    // Builder LLM is persisted per-scenario.
                    // It is ONLY used for AI assistance while editing this scenario
                    // (Suggest / Generate Workflow buttons). It does NOT affect execution.
                    building_llm: buildingLlm || undefined,
                    ui_overrides: {
                        ...(initialData?.configuration?.ui_overrides || {}),
                        toolbar_config: toolbarConfig
                    }
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
        <form onSubmit={handleSubmit} className="h-full flex flex-col gap-6 w-full">
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">
                            {initialData ? "Edit Scenario" : "Create New Scenario"}
                        </h1>
                        {isSystem && <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" /> System Protected</Badge>}
                        {isDefault && <Badge variant="default">Default Scenaio</Badge>}
                    </div>

                    <p className="text-muted-foreground">Configure your vertical mode.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
                        Cancel
                    </Button>
                    {!isSystem && (
                        <Button type="submit" disabled={saving}>
                            {saving && <span className="animate-spin mr-2">⏳</span>}
                            {initialData ? "Save Changes" : "Create Scenario"}
                        </Button>
                    )}
                    {isSystem && (
                        <Button type="submit" disabled={saving}>
                            {saving && <span className="animate-spin mr-2">⏳</span>}
                            Update Defaults Only
                        </Button>
                    )}
                </div>
            </div>

            {isSystem && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>System Scenario</AlertTitle>
                    <AlertDescription>
                        This is a core system scenario. You can only change whether it is the Default scenario. Content editing is locked.
                    </AlertDescription>
                </Alert>
            )}

            <Tabs defaultValue="general" className="flex-1 flex flex-col">
                <TabsList className="w-full justify-start border-b rounded-none p-0 h-10 bg-transparent">
                    <TabsTrigger value="general" className="relative h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
                        General
                    </TabsTrigger>
                    <TabsTrigger value="metadata" className="relative h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
                        <List className="w-4 h-4 mr-2" /> Thing Metadata
                    </TabsTrigger>
                    <TabsTrigger value="relationships" className="relative h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
                        <Share2 className="w-4 h-4 mr-2" /> Relationships
                    </TabsTrigger>
                    <TabsTrigger value="tools" className="relative h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
                        <Wrench className="w-4 h-4 mr-2" /> Tools & Agents
                    </TabsTrigger>
                    <TabsTrigger value="domains" className="relative h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
                        <Box className="w-4 h-4 mr-2" /> Domains
                    </TabsTrigger>
                    <TabsTrigger value="automations" className="relative h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
                        <Zap className="w-4 h-4 mr-2" /> Automations
                    </TabsTrigger>
                    <TabsTrigger value="json" className="relative h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
                        <FileJson className="w-4 h-4 mr-2" /> JSON
                    </TabsTrigger>
                </TabsList>

                {/* GENERAL TAB */}
                <TabsContent value="general" className="flex-1 py-4">
                    <div className="grid gap-6">
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
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            disabled={isSystem}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="color">Theme Color</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                type="color"
                                                value={themeColor}
                                                onChange={(e) => setThemeColor(e.target.value)}
                                                disabled={isSystem}
                                                className="w-12 h-10 p-1 cursor-pointer"
                                            />
                                            <Input
                                                value={themeColor}
                                                onChange={(e) => setThemeColor(e.target.value)}
                                                disabled={isSystem}
                                                className="font-mono uppercase"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea
                                        id="description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        disabled={isSystem}
                                        rows={3}
                                    />
                                </div>
                                <div className="flex items-center gap-2 mt-4 p-4 border rounded bg-muted/20">
                                    <Input
                                        type="checkbox"
                                        id="isDefault"
                                        className="w-4 h-4"
                                        checked={isDefault}
                                        onChange={e => setIsDefault(e.target.checked)}
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor="isDefault" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            Set as Default Scenario
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            New canvases will use this scenario automatically if selected.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* ----------------------------------------------------------------
                            Builder LLM Selection
                            The LLM chosen here is used EXCLUSIVELY when building/editing
                            this scenario (Suggest prompts, Generate Workflow, etc.).
                            It has NO effect on scenario execution — that uses the LLM
                            selected in the canvas toolbar at runtime.
                            Each scenario stores its own builder LLM independently.
                        ---------------------------------------------------------------- */}
                        <Card className="border-primary/20 bg-primary/3">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Brain className="w-4 h-4 text-primary" />
                                    Scenario Builder LLM
                                </CardTitle>
                                <CardDescription>
                                    Select the AI model used to assist while <strong>building</strong> this
                                    scenario ("Suggest" and "Generate Workflow" buttons). This does{" "}
                                    <strong>not</strong> affect which model runs the scenario at execution
                                    time — that is always controlled by the canvas-level LLM selector.
                                    Each scenario has its own independent builder LLM.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <Label htmlFor="building-llm">Builder LLM Configuration</Label>
                                    <Select
                                        value={buildingLlm}
                                        onValueChange={setBuildingLlm}
                                        disabled={isSystem}
                                    >
                                        <SelectTrigger id="building-llm" className="w-full max-w-sm">
                                            <SelectValue placeholder="Select LLM for building this scenario..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {llmPresets.map((preset) => (
                                                <SelectItem key={preset.name} value={preset.name}>
                                                    {preset.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {!buildingLlm && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                                            ⚠ No builder LLM selected — AI assist features (Suggest, Generate Workflow) will not work until one is chosen.
                                        </p>
                                    )}
                                    {buildingLlm && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Using <strong>{buildingLlm}</strong> for Suggest &amp; Generate Workflow in this scenario.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* THINGS METADATA TAB */}
                <TabsContent value="metadata" className="flex-1 py-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Global Thing Metadata</CardTitle>
                            <CardDescription>
                                Define metadata fields that apply to ALL things in this scenario, regardless of their domain.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <MetadataSchemaEditor
                                schema={thingMetadata}
                                onChange={setThingMetadata}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* DOMAINS TAB */}
                <TabsContent value="domains" className="flex-1 py-4 h-[600px] flex flex-col">
                    {isSystem ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">System scenarios cannot accept domain modifications.</div>
                    ) : (
                        <DomainPalette
                            groups={groups}
                            domains={domains}
                            onChangeGroups={setGroups}
                            onChangeDomains={setDomains}
                        />
                    )}
                </TabsContent>

                {/* RELATIONSHIPS TAB */}
                <TabsContent value="relationships" className="flex-1 py-4">
                    {isSystem ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">System scenarios cannot accept link modifications.</div>
                    ) : (
                        <Card>
                            <CardContent className="pt-6 space-y-6">
                                <div className="flex items-center space-x-2 border p-4 rounded-md bg-muted/20">
                                    <Input
                                        type="checkbox"
                                        id="keepStandardLinks"
                                        className="w-4 h-4"
                                        checked={keepStandardLinks}
                                        onChange={e => setKeepStandardLinks(e.target.checked)}
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor="keepStandardLinks" className="text-sm font-medium leading-none cursor-pointer">
                                            Keep standard link types
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            If checked, custom link types will be added to the standard list instead of replacing it.
                                        </p>
                                    </div>
                                </div>

                                <LinkTypeEditor
                                    linkTypes={linkTypes}
                                    onChange={setLinkTypes}
                                />
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* TOOLS TAB */}
                <TabsContent value="tools" className="flex-1 py-4">
                    <Tabs defaultValue="toolbar" className="h-full flex flex-col">
                        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
                            <TabsTrigger value="toolbar" className="relative h-9 rounded-none border-b-2 border-transparent px-4 pb-2 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none">
                                Toolbox
                            </TabsTrigger>
                            <TabsTrigger value="analysis" className="relative h-9 rounded-none border-b-2 border-transparent px-4 pb-2 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none">
                                Smart Analysis
                            </TabsTrigger>
                            <TabsTrigger value="agents" className="relative h-9 rounded-none border-b-2 border-transparent px-4 pb-2 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none">
                                Agents
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="toolbar" className="flex-1 py-4 overflow-y-auto">
                            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                                <p className="font-semibold mb-1">Scenario Toolbox</p>
                                <p>Configure custom AI-powered actions and specialized tools that will be available in this scenario. These appear in the Scenario Toolbox overview.</p>
                                {buildingLlm && (
                                    <p className="mt-1 text-blue-600 dark:text-blue-400 text-xs">
                                        Builder LLM: <strong>{buildingLlm}</strong> (set in General tab).
                                    </p>
                                )}
                                {!buildingLlm && (
                                    <p className="mt-1 text-amber-600 dark:text-amber-400 text-xs">
                                        ⚠ No Builder LLM selected. Go to the <strong>General</strong> tab to pick one before using AI assist features.
                                    </p>
                                )}
                            </div>
                            {/* Pass buildingLlm so the Suggest button uses the per-scenario builder LLM */}
                            <ToolbarConfigEditor
                                config={toolbarConfig}
                                onChange={setToolbarConfig}
                                disabled={isSystem}
                                buildingLlm={buildingLlm}
                            />
                        </TabsContent>

                        <TabsContent value="analysis" className="flex-1 py-4">
                            <div className="flex items-center justify-center h-full text-muted-foreground border border-dashed rounded-lg bg-muted/10">
                                Smart Analysis Templates (Coming Soon)
                            </div>
                        </TabsContent>

                        <TabsContent value="agents" className="flex-1 py-4">
                            <div className="flex items-center justify-center h-full text-muted-foreground border border-dashed rounded-lg bg-muted/10">
                                Agent Configuration (Coming Soon)
                            </div>
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                {/* AUTOMATIONS TAB */}
                <TabsContent value="automations" className="flex-1 py-4">
                    <Card>
                        <CardContent className="pt-6">
                            {/* Pass buildingLlm so automations can use the per-scenario builder LLM */}
                            <AutomationEditor
                                domains={domains}
                                linkTypes={linkTypes}
                                automations={automations}
                                onChange={setAutomations}
                                disabled={isSystem}
                                buildingLlm={buildingLlm}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* JSON TAB */}
                <TabsContent value="json" className="flex-1 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                        <div className="md:col-span-1 space-y-4 overflow-y-auto pr-1">
                            <div className="bg-blue-50/60 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 space-y-3 leading-relaxed text-xs">
                                <h4 className="font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                                    <AlertCircle className="w-4 h-4" /> About Advanced Config
                                </h4>
                                <p className="text-blue-800 dark:text-blue-300">
                                    This JSON block stores additional custom properties for the scenario that are not directly controlled by the visual editor tabs. 
                                </p>
                            </div>
                            
                            <div className="bg-muted/30 p-4 rounded-lg border border-primary/10 space-y-3 text-xs leading-relaxed">
                                <h4 className="font-semibold text-foreground">Concrete Examples</h4>
                                
                                <div className="space-y-2">
                                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">Example 1: Styling & Grid Defaults</p>
                                    <pre className="bg-background/80 p-2 rounded border font-mono text-[9px] overflow-x-auto text-primary">
{`{
  "canvas_styling": {
    "grid_size": 20,
    "default_node_width": 250,
    "snap_to_grid": true
  }
}`}
                                    </pre>
                                </div>

                                <div className="space-y-2">
                                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">Example 2: Custom Pipeline Limits</p>
                                    <pre className="bg-background/80 p-2 rounded border font-mono text-[9px] overflow-x-auto text-primary">
{`{
  "pipeline_defaults": {
    "temperature": 0.2,
    "max_tokens": 1500,
    "fallback_model": "gemini-1.5-pro"
  }
}`}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        <Card className="md:col-span-2 h-full flex flex-col">
                            <CardHeader className="py-3">
                                <CardTitle className="text-sm">JSON Configuration Editor</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 pb-4">
                                <Textarea
                                    value={advancedConfig}
                                    onChange={(e) => setAdvancedConfig(e.target.value)}
                                    disabled={isSystem}
                                    className="font-mono text-xs h-full min-h-[350px] resize-none bg-muted/5 border-primary/20"
                                    placeholder="{\n  \n}"
                                />
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </form>
    );
}

