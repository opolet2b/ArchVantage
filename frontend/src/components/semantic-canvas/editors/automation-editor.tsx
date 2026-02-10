/**
 * Automation Editor Component
 *
 * UI for defining spatial rules (Triggers + Actions) within a Scenario.
 */
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
    MoreHorizontal, GripHorizontal, FolderOpen, Maximize2, LayoutGrid, Layers,
    Settings, List, Plus, X, Calendar as CalendarIcon, Clock, Hash,
    Pencil, Palette, Sparkles, Target, Zap, Trash2, CheckCircle, AlertTriangle, Repeat
} from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import { API_URL } from "@/lib/utils";
import { DomainDefinition } from "../canvas-store";

/**
 * Visual Rule Builder for criteria filtering.
 */
function CriteriaBuilder({ value, onChange }: { value: string; onChange: (val: string) => void }) {
    const [localRules, setLocalRules] = React.useState<{ field: string; value: string }[]>([]);

    // Sync from props only when external value actually changes
    React.useEffect(() => {
        try {
            const parsed = JSON.parse(value || "{}");
            const fromProp = Object.entries(parsed).map(([field, val]) => ({
                field,
                value: String(val)
            }));

            // Only sync if the prop value is different from our current valid representation
            const currentValid = JSON.stringify(Object.fromEntries(
                localRules.filter(r => r.field.trim()).map(r => [r.field.trim(), r.value])
            ));

            if (value !== currentValid || (localRules.length === 0 && fromProp.length > 0)) {
                setLocalRules(fromProp);
            }
        } catch (e) {
            if (value !== "{}") setLocalRules([]);
        }
    }, [value]);

    const syncToParent = (rulesToSync: { field: string; value: string }[]) => {
        const obj: Record<string, string> = {};
        rulesToSync.forEach(r => {
            if (r.field.trim()) obj[r.field.trim()] = r.value;
        });
        onChange(JSON.stringify(obj));
    };

    const addRule = () => {
        const next = [...localRules, { field: "", value: "" }];
        setLocalRules(next);
        // Don't sync yet, as the new rule is empty and won't change the parent value
    };

    const removeRule = (idx: number) => {
        const next = localRules.filter((_, i) => i !== idx);
        setLocalRules(next);
        syncToParent(next);
    };

    const updateRule = (idx: number, patch: { field?: string; value?: string }) => {
        const next = [...localRules];
        next[idx] = { ...next[idx], ...patch };
        setLocalRules(next);
        syncToParent(next);
    };

    const rules = localRules;

    return (
        <div className="space-y-2 pt-1 border-t mt-2">
            <div className="flex items-center justify-between">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-tight">Filtering Rules</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] hover:bg-primary/10 hover:text-primary" onClick={addRule}>
                    <Plus className="w-3 h-3 mr-1" /> Add Filter
                </Button>
            </div>
            {rules.length === 0 && <p className="text-[10px] text-muted-foreground italic px-1 pb-1">No filters applied. Matches all items in domain.</p>}
            <div className="space-y-1.5">
                {rules.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 p-1.5 rounded-md border bg-muted/20 group animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex-1">
                            <Input
                                className="h-7 text-[10px] font-mono bg-background"
                                value={r.field}
                                placeholder="Attribute Key (e.g. status)"
                                onChange={e => updateRule(i, { field: e.target.value })}
                            />
                        </div>
                        <div className="text-[10px] text-muted-foreground font-medium px-1 uppercase opacity-50">contains</div>
                        <div className="flex-[1.5]">
                            <Input
                                className="h-7 text-[10px] bg-background"
                                value={r.value}
                                placeholder="Value (supports {{vars}})"
                                onChange={e => updateRule(i, { value: e.target.value })}
                            />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeRule(i)}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                ))}
            </div>
            {rules.length > 0 && (
                <p className="text-[9px] text-muted-foreground italic leading-tight px-1 pt-1 border-t border-dashed mt-2">
                    Multiple rules are applied as "AND" logic. Items must match all filters.
                </p>
            )}
        </div>
    );
}

interface AutomationEditorProps {
    automations: any[];
    domains: DomainDefinition[];
    linkTypes: any[];
    onChange: (automations: any[]) => void;
    disabled?: boolean;
}

const HOOKS = [
    { value: "onEntry", label: "When enters a Domain" },
    { value: "onExit", label: "When leaves a Domain" },
    { value: "onDrop", label: "When dropped on Canvas" },
    { value: "onLinkCreated", label: "When link is created" },
    { value: "onMetadataChange", label: "When metadata updates" },
];

export function AutomationEditor({ automations, domains, linkTypes, onChange, disabled }: AutomationEditorProps) {
    const [blueprints, setBlueprints] = React.useState<any[]>([]);
    const [presets, setPresets] = React.useState<any[]>([]);
    const [canvases, setCanvases] = React.useState<any[]>([]);
    const [selectedPreset, setSelectedPreset] = React.useState<string>("");

    React.useEffect(() => {
        const fetchData = async () => {
            const token = localStorage.getItem("token");
            if (!token) return;
            try {
                // Fetch Blueprints
                const bpRes = await fetch(`${API_URL}/agent-blueprints`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (bpRes.ok) setBlueprints(await bpRes.json());

                // Fetch Presets
                const preRes = await fetch(`${API_URL}/config/presets`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (preRes.ok) {
                    const data = await preRes.json();
                    setPresets(data.presets || []);
                    if (data.presets?.length > 0) setSelectedPreset(data.presets[0].name);
                }

                // Fetch Canvases
                const canvRes = await fetch(`${API_URL}/canvases`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (canvRes.ok) {
                    const data = await canvRes.json();
                    setCanvases(data.filter((c: any) => !c.is_archived));
                }
            } catch (err) {
                console.error("Failed to fetch data", err);
            }
        };
        fetchData();
    }, []);

    const addAutomation = () => {
        const newAuto = {
            id: Math.random().toString(36).substring(7),
            name: "New Automation",
            trigger: {
                hook: "onEntry",
                domain_id: domains[0]?.id || ""
            },
            action: {
                blueprint_id: blueprints[0]?.id || ""
            }
        };
        onChange([...automations, newAuto]);
    };

    const updateAutomation = (id: string, updates: any) => {
        onChange(automations.map(a => a.id === id ? { ...a, ...updates } : a));
    };

    const removeAutomation = (id: string) => {
        onChange(automations.filter(a => a.id !== id));
    };

    return (
        <div className="flex flex-col h-full">
            {/* Top Bar: Model Configuration */}
            <div className="flex items-center justify-between p-4 border-b bg-muted/20">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-medium">Spatial Automations</h3>
                    <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap text-muted-foreground">Model Config:</Label>
                        <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                            <SelectTrigger className="h-8 w-[200px] text-xs">
                                <SelectValue placeholder="Select Configuration..." />
                            </SelectTrigger>
                            <SelectContent>
                                {presets.map(p => (
                                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button type="button" onClick={addAutomation} disabled={disabled} size="sm">
                    <Plus className="w-4 h-4 mr-2" /> Add Rule
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {automations.length === 0 && (
                    <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
                        <Zap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">No automations configured for this scenario yet.</p>
                    </div>
                )}

                <div className="grid gap-4">
                    {automations.map((auto) => (
                        <Card key={auto.id} className="relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <Input
                                        value={auto.name}
                                        onChange={(e) => updateAutomation(auto.id, { name: e.target.value })}
                                        className="h-7 font-bold border-none p-0 focus-visible:ring-0 bg-transparent w-full"
                                        placeholder="Enter automation name..."
                                        disabled={disabled}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeAutomation(auto.id)}
                                        className="text-muted-foreground hover:text-destructive"
                                        disabled={disabled}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-6 p-4 rounded-lg bg-muted/30">
                                    {/* TRIGGER SECTION */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                                            <Target className="w-3.5 h-3.5" /> Trigger
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">Hook Event</Label>
                                            <Select
                                                value={auto.trigger.hook}
                                                onValueChange={(val) => updateAutomation(auto.id, {
                                                    trigger: { ...auto.trigger, hook: val }
                                                })}
                                                disabled={disabled}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {HOOKS.map(h => (
                                                        <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {(auto.trigger.hook === "onEntry" || auto.trigger.hook === "onExit" || auto.trigger.hook === "onDrop") && (
                                            <>
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Target Domain</Label>
                                                    <Select
                                                        value={auto.trigger.domain_id}
                                                        onValueChange={(val) => updateAutomation(auto.id, {
                                                            trigger: { ...auto.trigger, domain_id: val, drop_zone_id: undefined }
                                                        })}
                                                        disabled={disabled}
                                                    >
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue placeholder="Select a domain..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="*">Any Domain</SelectItem>
                                                            {domains.map(d => (
                                                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {/* Drop Zone Selector */}
                                                {auto.trigger.domain_id && auto.trigger.domain_id !== "*" && (
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">Target Zone (Optional)</Label>
                                                        <Select
                                                            value={auto.trigger.drop_zone_id || "any"}
                                                            onValueChange={(val) => updateAutomation(auto.id, {
                                                                trigger: { ...auto.trigger, drop_zone_id: val === "any" ? undefined : val }
                                                            })}
                                                            disabled={disabled}
                                                        >
                                                            <SelectTrigger className="h-9">
                                                                <SelectValue placeholder="Anywhere in domain" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {domains.find(d => d.id === auto.trigger.domain_id)?.drop_zones?.map(z => (
                                                                    <SelectItem key={z.id} value={z.id}>{z.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* ACTION SECTION */}
                                    <div className="space-y-3 border-l pl-6">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                                            <Zap className="w-3.5 h-3.5" /> Action
                                        </div>

                                        {/* Action Type Toggle */}
                                        <div className="flex rounded-md bg-muted/50 p-1 mb-4">
                                            <button
                                                type="button"
                                                onClick={() => updateAutomation(auto.id, {
                                                    action: { ...auto.action, type: "blueprint", steps: undefined }
                                                })}
                                                className={`flex-1 text-xs font-medium py-1.5 rounded-sm transition-colors ${auto.action.type !== "pipeline" ? "bg-background shadow-sm" : "hover:bg-background/50"
                                                    }`}
                                            >
                                                Blueprint
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => updateAutomation(auto.id, {
                                                    action: { ...auto.action, type: "pipeline", blueprint_id: undefined, steps: [] }
                                                })}
                                                className={`flex-1 text-xs font-medium py-1.5 rounded-sm transition-colors ${auto.action.type === "pipeline" ? "bg-background shadow-sm" : "hover:bg-background/50"
                                                    }`}
                                            >
                                                Workflow
                                            </button>
                                        </div>

                                        {auto.action.type !== "pipeline" ? (
                                            <div className="space-y-2">
                                                <Label className="text-xs">Run Agent Blueprint</Label>
                                                <Select
                                                    value={auto.action.blueprint_id}
                                                    onValueChange={(val) => updateAutomation(auto.id, {
                                                        action: { ...auto.action, blueprint_id: val }
                                                    })}
                                                    disabled={disabled}
                                                >
                                                    <SelectTrigger className="h-9 h-auto py-2">
                                                        <SelectValue placeholder="Select blueprint..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {blueprints.map(b => (
                                                            <SelectItem key={b.id} value={b.id}>
                                                                <div className="flex flex-col items-start text-xs">
                                                                    <span className="font-bold">{b.name}</span>
                                                                    <span className="text-muted-foreground line-clamp-1">{b.description}</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-[10px] text-muted-foreground italic pt-1">
                                                    Selected agent will receive event context as input.
                                                </p>
                                            </div>
                                        ) : (
                                            <WorkflowBuilder
                                                isRoot
                                                steps={auto.action.steps || []}
                                                onChange={(steps) => updateAutomation(auto.id, {
                                                    action: { ...auto.action, steps }
                                                })}
                                                domains={domains}
                                                linkTypes={linkTypes}
                                                selectedModel={selectedPreset}
                                                canvases={canvases}
                                            />
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}

// --- Workflow Builder Sub-components ---

const PRIMITIVES = [
    { value: "LLM_GENERATION", label: "AI Prompt", icon: "✨" },
    { value: "LOGIC_IF_ELSE", label: "Branch (If/Else)", icon: "🔀" },
    { value: "FOREACH", label: "Loop (For Each)", icon: "🔁" },
    { value: "CANVAS_QUERY", label: "Search Canvas", icon: "🔍" },
    { value: "CANVAS_QUERY_THINGS", label: "Query Domain Things", icon: "🔎" },
    { value: "CANVAS_MOVE_TO_ZONE", label: "Move to Zone", icon: "📍" },
    { value: "CANVAS_SET_PROPERTY", label: "Set Color/Title", icon: "🎨" },
    { value: "CANVAS_CREATE_LINK", label: "Create Link", icon: "🔗" },
    { value: "CANVAS_BATCH_LINK", label: "Batch Link", icon: "⛓️" },
];

const CONTEXT_VARIABLES = [
    { value: "{{ thing_id }}", label: "Thing ID", description: "The UUID of the dropped item" },
    { value: "{{ thing_content }}", label: "Thing Content", description: "The full text or JSON data" },
    { value: "{{ thing_name }}", label: "Thing Name", description: "The title or name of the item" },
    { value: "{{ thing_type }}", label: "Thing Type", description: "e.g. text, image, document" },
    { value: "{{ drop_zone_id }}", label: "Drop Zone ID", description: "ID of the zone where item was dropped" },
    { value: "{{ source_domain_id }}", label: "Source Domain ID", description: "ID of the domain where event occurred" },
    { value: "{{ domain_content }}", label: "Domain Content (Context)", description: "Text summary of all things in the source domain" },
    { value: "{{ domain_items }}", label: "Domain Items (JSON)", description: "Full JSON list of all things in the source domain" },
];

// --- Helper for inserting text at cursor or appending ---
function insertText(current: string, toInsert: string, inputRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement>) {
    if (inputRef?.current) {
        const start = inputRef.current.selectionStart || 0;
        const end = inputRef.current.selectionEnd || 0;
        return current.substring(0, start) + toInsert + current.substring(end);
    }
    return current + (current ? " " : "") + toInsert;
}

function ContextVariableSelector({ onInsert, label = "Insert Variable" }: { onInsert: (v: string) => void, label?: string }) {
    return (
        <Select value="" onValueChange={onInsert}>
            <SelectTrigger className="h-7 text-[10px] w-auto gap-2 bg-muted/50 border-dashed min-w-[120px]">
                <Target className="w-3 h-3 text-muted-foreground" />
                <SelectValue placeholder={label} />
            </SelectTrigger>
            <SelectContent>
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider bg-muted/20">
                    Standard Context
                </div>
                {CONTEXT_VARIABLES.map(v => (
                    <SelectItem key={v.value} value={v.value} className="text-xs">
                        <span className="font-mono text-primary font-semibold mr-2">{v.value}</span>
                        <span className="text-muted-foreground scale-90">{v.label}</span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function SpecificReferencePicker({ domains, onInsert }: { domains: DomainDefinition[], onInsert: (v: string) => void }) {
    return (
        <Select value="" onValueChange={(val) => {
            if (val) onInsert(`{{domain:${val}}}`);
        }}>
            <SelectTrigger className="h-7 text-[10px] w-auto gap-2 bg-muted/50 border-dashed min-w-[120px]">
                <LayoutGrid className="w-3 h-3 text-muted-foreground" />
                <SelectValue placeholder="Pick Domain..." />
            </SelectTrigger>
            <SelectContent>
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider bg-muted/20">
                    Target Specific Domain
                </div>
                {domains.map(d => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                        <span className="font-medium mr-2">{d.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]">{d.id}</span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function WorkflowPopup({ children, title, description }: { children: React.ReactNode, title: string, description?: string }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2 gap-1.5 text-[10px] font-semibold">
                    <Maximize2 className="w-3 h-3" /> Expand Editor
                </Button>
            </DialogTrigger>
            <DialogContent className="w-[94vw] sm:max-w-[94vw] h-[90vh] sm:max-h-[90vh] flex flex-col p-8 m-0 rounded-xl">
                <DialogHeader className="pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-xl flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-primary" /> {title}
                        </DialogTitle>
                        <VariablesHelpDialog />
                    </div>
                    {description && <DialogDescription className="mt-1">{description}</DialogDescription>}
                </DialogHeader>
                <div className="flex-1 overflow-y-auto py-4 pr-2">
                    {children}
                </div>
            </DialogContent>
        </Dialog>
    );
}


function VariablesHelpDialog() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary" title="Variable Reference">
                    <span className="text-xs font-bold rounded-full border w-4 h-4 flex items-center justify-center">?</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Hash className="w-5 h-5 text-primary" /> Variable Reference
                    </DialogTitle>
                    <DialogDescription>
                        Use these variables in input fields to dynamically reference content from the automation context.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 pt-2">
                    {/* Trigger Context */}
                    <section className="space-y-2">
                        <h4 className="text-sm font-bold flex items-center gap-2 border-b pb-1">
                            <Target className="w-4 h-4" /> Trigger Context
                            <span className="text-xs font-normal text-muted-foreground ml-auto">Available on all steps</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            <div className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ thing_id }}"}</code>
                                <span className="text-muted-foreground">ID of the item that triggered the automation</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ thing_name }}"}</code>
                                <span className="text-muted-foreground">Title/Name of the item</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ thing_content }}"}</code>
                                <span className="text-muted-foreground">Full content (text/JSON) of the item</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ thing_type }}"}</code>
                                <span className="text-muted-foreground">Type (e.g. text, image, document)</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ drop_zone_id }}"}</code>
                                <span className="text-muted-foreground">ID of the drop zone (if dropped)</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ source_domain_id }}"}</code>
                                <span className="text-muted-foreground">Domain where the event started</span>
                            </div>
                        </div>
                    </section>

                    {/* Query Results */}
                    <section className="space-y-2">
                        <h4 className="text-sm font-bold flex items-center gap-2 border-b pb-1">
                            <List className="w-4 h-4" /> Query Results
                            <span className="text-xs font-normal text-muted-foreground ml-auto">After 'Query Domain Things'</span>
                        </h4>
                        <div className="grid grid-cols-1 gap-2 text-xs">
                            <div className="grid grid-cols-[180px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ query_results.things }}"}</code>
                                <span className="text-muted-foreground">List of found item objects</span>
                            </div>
                            <div className="grid grid-cols-[180px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ query_results.thing_ids }}"}</code>
                                <span className="text-muted-foreground">List of IDs of all found items (useful for Batch Link)</span>
                            </div>
                            <div className="grid grid-cols-[180px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ query_results.combined_content }}"}</code>
                                <span className="text-muted-foreground">Concatenated content of all found items (great for LLM context)</span>
                            </div>
                            <div className="grid grid-cols-[180px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ query_results.count }}"}</code>
                                <span className="text-muted-foreground">Number of items found</span>
                            </div>
                        </div>
                    </section>

                    {/* Loop Variables */}
                    <section className="space-y-2">
                        <h4 className="text-sm font-bold flex items-center gap-2 border-b pb-1">
                            <Repeat className="w-4 h-4" /> Loop Variables
                            <span className="text-xs font-normal text-muted-foreground ml-auto">Inside 'For Each' Loop</span>
                        </h4>
                        <div className="grid grid-cols-1 gap-2 text-xs">
                            <div className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ item }}"}</code>
                                <span className="text-muted-foreground">The current item ID (or object) in the loop</span>
                            </div>
                            <div className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{"{{ index }}"}</code>
                                <span className="text-muted-foreground">Current iteration index (0-based)</span>
                            </div>
                        </div>
                    </section>

                    {/* Special */}
                    <section className="space-y-2">
                        <h4 className="text-sm font-bold flex items-center gap-2 border-b pb-1">
                            <Sparkles className="w-4 h-4" /> Special References
                        </h4>
                        <div className="grid grid-cols-1 gap-2 text-xs">
                            <div className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">{`{{ domain:ID }}`}</code>
                                <span className="text-muted-foreground">Directly reference a Domain by its ID</span>
                            </div>
                        </div>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function WorkflowBuilder({
    steps,
    onChange,
    domains,
    linkTypes,
    selectedModel,
    canvases = [],
    isRoot = false
}: {
    steps: any[],
    onChange: (s: any[]) => void,
    domains: DomainDefinition[],
    linkTypes: any[],
    selectedModel: string,
    canvases?: any[],
    isRoot?: boolean
}) {
    // ... addStep ... (Keep existing implementation)
    const addStep = (primitive: string) => {
        const newStep: any = {
            id: Math.random().toString(36).substring(7),
            primitive,
            inputs: {}
        };
        // Set default inputs based on primitive
        if (primitive === "CANVAS_MOVE_TO_ZONE") {
            newStep.inputs = { id: "{{thing_id}}", domain_id: domains[0]?.id || "", zone_id: "" };
        } else if (primitive === "LLM_GENERATION") {
            newStep.inputs = { prompt: "Analyze the content of {{thing_id}}...", context: "{{thing_content}}" };
        } else if (primitive === "CANVAS_SET_PROPERTY") {
            newStep.inputs = { id: "{{thing_id}}", color: "#ff0000" };
        } else if (primitive === "LOGIC_IF_ELSE") {
            newStep.inputs = {
                condition: "Is this item relevant to Project X?",
                context: "{{thing_content}}",
                then_steps: [],
                else_steps: []
            };
        } else if (primitive === "CANVAS_QUERY") {
            newStep.inputs = { target_canvas_id: canvases[0]?.id || "", query: "{{thing_name}}", limit: 5 };
        } else if (primitive === "CANVAS_CREATE_LINK") {
            newStep.inputs = { source_id: "{{thing_id}}", target_id: "", label: "related", type: "related", description: "" };
        } else if (primitive === "CANVAS_QUERY_THINGS") {
            newStep.inputs = { domain_id: "*", thing_type: "all", query: "", criteria: "{}", limit: 10 };
        } else if (primitive === "CANVAS_BATCH_LINK") {
            newStep.inputs = { source_id: "{{thing_id}}", target_ids: "{{query_results.thing_ids}}", label: "", type: "related", description: "" };
        } else if (primitive === "FOREACH") {
            newStep.inputs = { items: "{{query_results.thing_ids}}", iterator_var: "item_id", steps: [] };
        }
        onChange([...steps, newStep]);
    };

    const updateStep = (index: number, updates: any) => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], ...updates };
        onChange(newSteps);
    };

    const removeStep = (index: number) => {
        onChange(steps.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            {/* ... Header ... */}
            {isRoot && (
                <div className="flex items-center justify-between pb-1 pt-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-primary" /> Step Sequence
                    </span>
                    <div className="flex items-center gap-1">
                        <VariablesHelpDialog />
                        <WorkflowPopup title="Automation Workflow Editor" description="A larger space to build complex multi-step and conditional automations.">
                            <WorkflowBuilder
                                steps={steps}
                                onChange={onChange}
                                domains={domains}
                                linkTypes={linkTypes}
                                selectedModel={selectedModel}
                                canvases={canvases}
                            />
                        </WorkflowPopup>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {steps.map((step, idx) => (
                    <div key={step.id || idx} className="border rounded-md p-3 bg-background text-sm relative group">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold flex items-center gap-1.5 opacity-90">
                                <span className="text-base">{PRIMITIVES.find(p => p.value === step.primitive)?.icon}</span>
                                {PRIMITIVES.find(p => p.value === step.primitive)?.label || step.primitive}
                            </span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeStep(idx)}>
                                <Trash2 className="w-3 h-3" />
                            </Button>
                        </div>

                        {/* Step Configuration UI */}
                        <div className="space-y-2">
                            {/* ... CANVAS_MOVE_TO_ZONE ... (Keep existing) */}
                            {step.primitive === "CANVAS_MOVE_TO_ZONE" && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-[10px]">Domain</Label>
                                        <Select
                                            value={step.inputs.domain_id}
                                            onValueChange={(val) => updateStep(idx, { inputs: { ...step.inputs, domain_id: val } })}
                                        >
                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-[10px]">Zone</Label>
                                        <Select
                                            value={step.inputs.zone_id}
                                            onValueChange={(val) => updateStep(idx, { inputs: { ...step.inputs, zone_id: val } })}
                                        >
                                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select Zone" /></SelectTrigger>
                                            <SelectContent>
                                                {domains.find(d => d.id === step.inputs.domain_id)?.drop_zones?.map(z => (
                                                    <SelectItem key={z.id} value={z.id}>{z.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}

                            {step.primitive === "LLM_GENERATION" && (
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-semibold text-muted-foreground uppercase">Context Content</Label>

                                        <div className="flex gap-2 mb-1">
                                            <ContextVariableSelector
                                                onInsert={(val) => updateStep(idx, { inputs: { ...step.inputs, context: (step.inputs.context || "") + " " + val } })}
                                                label="Add Variable"
                                            />
                                            <SpecificReferencePicker
                                                domains={domains}
                                                onInsert={(val) => updateStep(idx, { inputs: { ...step.inputs, context: (step.inputs.context || "") + " " + val } })}
                                            />
                                        </div>

                                        <Textarea
                                            className="min-h-[60px] text-xs font-mono"
                                            value={step.inputs.context || "{{thing_content}}"}
                                            onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, context: e.target.value } })}
                                            placeholder="Content to analyze..."
                                        />
                                    </div>

                                    <AIPromptStep
                                        prompt={step.inputs.prompt}
                                        onChange={(val) => updateStep(idx, { inputs: { ...step.inputs, prompt: val } })}
                                        selectedModel={selectedModel}
                                    />
                                </div>
                            )}

                            {/* ... Other Steps ... */}
                            {step.primitive === "CANVAS_SET_PROPERTY" && (
                                <div>
                                    <Label className="text-[10px]">Color</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            className="h-7 w-20 text-xs"
                                            type="color"
                                            value={step.inputs.color}
                                            onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, color: e.target.value } })}
                                        />
                                        <Input
                                            className="h-7 text-xs flex-1"
                                            value={step.inputs.title || ""}
                                            placeholder="Optional New Title"
                                            onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, title: e.target.value } })}
                                        />
                                    </div>
                                </div>
                            )}

                            {step.primitive === "LOGIC_IF_ELSE" && (
                                <div className="space-y-4">
                                    <div className="bg-muted/30 p-3 rounded-md border border-dashed space-y-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                                                <Sparkles className="w-3 h-3" /> Branch Condition
                                            </Label>
                                            <Input
                                                className="h-8 text-xs"
                                                value={step.inputs.condition}
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, condition: e.target.value } })}
                                                placeholder="e.g. Is this a valid recipe?"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <Label className="text-[10px] font-semibold text-muted-foreground uppercase">Context to Evaluate</Label>
                                                <div className="flex gap-1">
                                                    <ContextVariableSelector
                                                        onInsert={(val) => updateStep(idx, { inputs: { ...step.inputs, context: (step.inputs.context || "") + " " + val } })}
                                                        label="Add Var"
                                                    />
                                                    <SpecificReferencePicker
                                                        domains={domains}
                                                        onInsert={(val) => updateStep(idx, { inputs: { ...step.inputs, context: (step.inputs.context || "") + " " + val } })}
                                                    />
                                                </div>
                                            </div>
                                            <Textarea
                                                className="h-16 text-xs font-mono"
                                                value={step.inputs.context || "{{thing_content}}"}
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, context: e.target.value } })}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-600 uppercase">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-600" /> If True
                                            </div>
                                            <div className="border-l-2 border-green-200 pl-3 py-1">
                                                <WorkflowBuilder
                                                    steps={step.inputs.then_steps || []}
                                                    onChange={(s) => updateStep(idx, { inputs: { ...step.inputs, then_steps: s } })}
                                                    domains={domains}
                                                    linkTypes={linkTypes}
                                                    selectedModel={selectedModel}
                                                    canvases={canvases}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 uppercase">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-600" /> If False
                                            </div>
                                            <div className="border-l-2 border-red-200 pl-3 py-1">
                                                <WorkflowBuilder
                                                    steps={step.inputs.else_steps || []}
                                                    onChange={(s) => updateStep(idx, { inputs: { ...step.inputs, else_steps: s } })}
                                                    domains={domains}
                                                    linkTypes={linkTypes}
                                                    selectedModel={selectedModel}
                                                    canvases={canvases}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step.primitive === "CANVAS_QUERY" && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">

                                        <div>
                                            <Label className="text-[10px]">Target Canvas</Label>
                                            <Select
                                                value={step.inputs.target_canvas_id}
                                                onValueChange={(val) => updateStep(idx, { inputs: { ...step.inputs, target_canvas_id: val } })}
                                            >
                                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select Canvas" /></SelectTrigger>
                                                <SelectContent>
                                                    {canvases.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px]">Query</Label>
                                            <Input
                                                className="h-7 text-xs"
                                                value={step.inputs.query}
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, query: e.target.value } })}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground italic">
                                        Results will be available as {"{{query_results}}"} in subsequent steps.
                                    </p>
                                </div>
                            )}

                            {step.primitive === "CANVAS_CREATE_LINK" && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="col-span-2">
                                            <Label className="text-[10px]">Source Item (Link Origin)</Label>
                                            <Input
                                                className="h-7 text-xs"
                                                value={step.inputs.source_id}
                                                placeholder="e.g. {{thing_id}}"
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, source_id: e.target.value } })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-[10px]">Target Item (Link Destination)</Label>
                                            <Input
                                                className="h-7 text-xs"
                                                value={step.inputs.target_id}
                                                placeholder="e.g. {{query_results[0].id}}"
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, target_id: e.target.value } })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-[10px]">Link Label</Label>
                                            <Input
                                                className="h-7 text-xs"
                                                value={step.inputs.label}
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, label: e.target.value } })}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px]">Relationship Type</Label>
                                            <Select
                                                value={step.inputs.type}
                                                onValueChange={(val) => updateStep(idx, { inputs: { ...step.inputs, type: val } })}
                                            >
                                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select Type" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="related">Related (Generic)</SelectItem>
                                                    {linkTypes?.map(lt => (
                                                        <SelectItem key={lt.id} value={lt.id}>{lt.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-1">
                                            <Label className="text-[10px]">Description (Mandatory)</Label>
                                            <Input
                                                className="h-7 text-xs"
                                                value={step.inputs.description}
                                                placeholder="Link reason..."
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, description: e.target.value } })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step.primitive === "CANVAS_QUERY_THINGS" && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px]">Search in Domain</Label>
                                            <Select
                                                value={step.inputs.domain_id}
                                                onValueChange={(val) => updateStep(idx, { inputs: { ...step.inputs, domain_id: val } })}
                                            >
                                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All Domains" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="*">All Domains</SelectItem>
                                                    {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px]">Item Type Filter</Label>
                                            <Select
                                                value={step.inputs.thing_type}
                                                onValueChange={(val) => updateStep(idx, { inputs: { ...step.inputs, thing_type: val } })}
                                            >
                                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Any Type</SelectItem>
                                                    <SelectItem value="text">Text Notes</SelectItem>
                                                    <SelectItem value="document">Documents</SelectItem>
                                                    <SelectItem value="image">Images</SelectItem>
                                                    <SelectItem value="group">Groups</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <Label className="text-[10px]">Search Keywords (Optional)</Label>
                                            <Input className="h-7 text-xs" value={step.inputs.query} placeholder="Search names or content..." onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, query: e.target.value } })} />
                                        </div>
                                        <div className="w-20">
                                            <Label className="text-[10px]">Max Results</Label>
                                            <Input type="number" className="h-7 text-xs" value={step.inputs.limit} onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, limit: parseInt(e.target.value) } })} />
                                        </div>
                                    </div>

                                    <CriteriaBuilder
                                        value={step.inputs.criteria}
                                        onChange={(val) => updateStep(idx, { inputs: { ...step.inputs, criteria: val } })}
                                    />

                                    <div className="p-2 border border-dashed rounded bg-primary/5 text-[10px] text-primary space-y-1">
                                        <p className="font-semibold uppercase tracking-tight">Automation Context:</p>
                                        <p className="italic leading-tight opacity-90">
                                            Results are saved to <code className="bg-primary/10 px-1 rounded">{"{{query_results}}"}</code>.
                                            Access IDs via <code className="bg-primary/10 px-1 rounded">{"{{query_results.thing_ids}}"}</code>.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {step.primitive === "CANVAS_BATCH_LINK" && (
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label className="text-[10px]">Source Item (Link Origin)</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                className="h-7 text-xs flex-1"
                                                value={step.inputs.source_id}
                                                placeholder="e.g. {{thing_id}}"
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, source_id: e.target.value } })}
                                            />
                                            <ContextVariableSelector
                                                onInsert={(val) => updateStep(idx, { inputs: { ...step.inputs, source_id: (step.inputs.source_id || "") + val } })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px]">Target Items (to link)</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                className="h-7 text-xs flex-1"
                                                value={step.inputs.target_ids}
                                                placeholder="e.g. {{query_results.thing_ids}}"
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, target_ids: e.target.value } })}
                                            />
                                            <ContextVariableSelector
                                                onInsert={(val) => updateStep(idx, { inputs: { ...step.inputs, target_ids: (step.inputs.target_ids || "") + val } })}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px]">Relationship Type</Label>
                                            <Select
                                                value={step.inputs.type}
                                                onValueChange={(val) => updateStep(idx, { inputs: { ...step.inputs, type: val } })}
                                            >
                                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select Type" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="related">Related (Generic)</SelectItem>
                                                    {linkTypes?.map(lt => (
                                                        <SelectItem key={lt.id} value={lt.id}>{lt.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px]">Label On Link</Label>
                                            <Input className="h-7 text-xs" value={step.inputs.label} placeholder="Description" onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, label: e.target.value } })} />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-[10px]">Relationship Description (Mandatory)</Label>
                                            <Input
                                                className="h-7 text-xs"
                                                value={step.inputs.description}
                                                placeholder="Explain link reasoning..."
                                                onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, description: e.target.value } })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step.primitive === "FOREACH" && (
                                <div className="space-y-4">
                                    <div className="bg-muted/30 p-3 rounded-md border border-dashed space-y-3">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-semibold text-muted-foreground uppercase">List to Iterate</Label>
                                                <Input
                                                    className="h-8 text-xs font-mono"
                                                    value={step.inputs.items}
                                                    onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, items: e.target.value } })}
                                                    placeholder="e.g. {{query_results.thing_ids}}"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-semibold text-muted-foreground uppercase">Item Alias</Label>
                                                <Input
                                                    className="h-8 text-xs font-mono"
                                                    value={step.inputs.iterator_var}
                                                    onChange={(e) => updateStep(idx, { inputs: { ...step.inputs, iterator_var: e.target.value } })}
                                                    placeholder="item_id"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase">
                                            <Repeat className="w-3 h-3" /> Loop Body
                                        </div>
                                        <div className="border-l-2 border-primary/20 pl-3 py-1">
                                            <WorkflowBuilder
                                                steps={step.inputs.steps || []}
                                                onChange={(s) => updateStep(idx, { inputs: { ...step.inputs, steps: s } })}
                                                domains={domains}
                                                linkTypes={linkTypes}
                                                selectedModel={selectedModel}
                                                canvases={canvases}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <Select onValueChange={addStep}>
                <SelectTrigger className="h-8 w-full border-dashed bg-muted/20">
                    <span className="flex items-center gap-1.5 justify-center text-muted-foreground text-xs">
                        <Plus className="w-3.5 h-3.5" /> Add Workflow Step
                    </span>
                </SelectTrigger>
                <SelectContent>
                    {PRIMITIVES.map(p => (
                        <SelectItem key={p.value} value={p.value}>
                            <span className="flex items-center gap-2">
                                <span>{p.icon}</span> {p.label}
                            </span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function AIPromptStep({ prompt, onChange, selectedModel }: { prompt: string, onChange: (v: string) => void, selectedModel: string }) {
    const [instructions, setInstructions] = React.useState("");
    const [isSuggesting, setIsSuggesting] = React.useState(false);

    const suggestPrompt = async () => {
        if (!selectedModel) {
            alert("Please select a Model Configuration at the top first.");
            return;
        }
        if (!instructions.trim()) {
            return;
        }

        setIsSuggesting(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    messages: [
                        { role: "user", content: `Create a prompt template for an AI agent based on these instructions: "${instructions}". Return ONLY the prompt text, no intro/outro. Use placeholders like {{ thing_id }} if needing reference.` }
                    ],
                    model: selectedModel
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.role === "assistant" && data.content) {
                    onChange(data.content);
                }
            }
        } catch (e) {
            console.error("Suggestion failed", e);
        } finally {
            setIsSuggesting(false);
        }
    };

    return (
        <div className="space-y-2">
            <Label className="text-[10px]">Prompt Template</Label>
            <div className="relative">
                <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={prompt}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Enter prompt for the AI agent..."
                />
            </div>

            <div className="pt-2 border-t mt-2">
                <Label className="text-[10px] text-muted-foreground">Ask AI to write this prompt:</Label>
                <div className="flex gap-2 mt-1">
                    <Input
                        className="h-7 text-xs flex-1"
                        placeholder="e.g. 'Summarize the text in 3 bullet points'"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && suggestPrompt()}
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={suggestPrompt}
                        disabled={isSuggesting || !selectedModel}
                    >
                        {isSuggesting ? "..." : "Suggest"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
