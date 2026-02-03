"use client";

import * as React from "react";
import { DomainDefinition, MetadataField, DropZone } from "../canvas-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Box, List, Move, HelpCircle, ArrowUp, ArrowDown } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

interface DomainDefinitionEditorProps {
    domain: DomainDefinition;
    onChange: (domain: DomainDefinition) => void;
}

/**
 * Internal component to handle comma-separated options with local state.
 * Prevents "disappearing comma" bug by only syncing on blur or when valid.
 */
function OptionsInput({ value, onChange }: { value: { label: string; value: string }[], onChange: (options: { label: string; value: string }[]) => void }) {
    const serializedValue = React.useMemo(() =>
        value.map(o => `${o.label}${o.label !== o.value ? `:${o.value}` : ''}`).join(', '),
        [value]
    );

    const [localValue, setLocalValue] = React.useState(serializedValue);

    // Update local value if external value changes (unless we are focused)
    React.useEffect(() => {
        setLocalValue(serializedValue);
    }, [serializedValue]);

    const handleBlur = () => {
        const parts = localValue.split(',').map(s => s.trim()).filter(Boolean);
        const optionsMap = new Map<string, { label: string; value: string }>();

        parts.forEach(p => {
            const [label, val] = p.split(':');
            const finalVal = (val || label).trim();
            const finalLabel = label.trim();
            // Last one wins if duplicates exist, or first? Let's keep first.
            if (!optionsMap.has(finalVal)) {
                optionsMap.set(finalVal, { label: finalLabel, value: finalVal });
            }
        });

        onChange(Array.from(optionsMap.values()));
    };

    return (
        <Textarea
            placeholder="High:high, Medium:medium, Low:low"
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            className="h-20"
        />
    );
}

export function DomainDefinitionEditor({ domain, onChange }: DomainDefinitionEditorProps) {

    const updateVisual = (field: string, value: any) => {
        onChange({
            ...domain,
            visual_config: { ...domain.visual_config, [field]: value }
        });
    };

    const addMetadataField = () => {
        const newField: MetadataField = { key: `field_${Date.now()}`, label: "New Field", type: "text" };
        onChange({
            ...domain,
            metadata_schema: [...(domain.metadata_schema || []), newField]
        });
    };

    const updateMetadataField = (index: number, field: MetadataField) => {
        const newSchema = [...(domain.metadata_schema || [])];
        newSchema[index] = field;
        onChange({ ...domain, metadata_schema: newSchema });
    };

    const removeMetadataField = (index: number) => {
        const newSchema = [...(domain.metadata_schema || [])];
        newSchema.splice(index, 1);
        onChange({ ...domain, metadata_schema: newSchema });
    };

    const moveMetadataField = (index: number, direction: 'up' | 'down') => {
        const newSchema = [...(domain.metadata_schema || [])];
        if (direction === 'up' && index > 0) {
            [newSchema[index], newSchema[index - 1]] = [newSchema[index - 1], newSchema[index]];
        } else if (direction === 'down' && index < newSchema.length - 1) {
            [newSchema[index], newSchema[index + 1]] = [newSchema[index + 1], newSchema[index]];
        }
        onChange({ ...domain, metadata_schema: newSchema });
    };

    const addDropZone = () => {
        const newZone: DropZone = {
            id: `zone_${Date.now()}`,
            label: "Drop Zone",
            dashed_style: true,
            accepts_types: ["*"]
        };
        onChange({
            ...domain,
            drop_zones: [...(domain.drop_zones || []), newZone]
        });
    };

    // ... Similar handlers for Drop Zones

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Domain Name</Label>
                    <Input value={domain.name} onChange={e => onChange({ ...domain, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                    <Label>ID (System)</Label>
                    <Input value={domain.id} onChange={e => onChange({ ...domain, id: e.target.value })} className="font-mono bg-muted" />
                </div>
            </div>

            <Tabs defaultValue="visuals">
                <TabsList className="w-full">
                    <TabsTrigger value="visuals" className="flex-1"><Box className="w-4 h-4 mr-2" /> Visuals</TabsTrigger>
                    <TabsTrigger value="metadata" className="flex-1"><List className="w-4 h-4 mr-2" /> Metadata</TabsTrigger>
                    <TabsTrigger value="dropzones" className="flex-1"><Move className="w-4 h-4 mr-2" /> Drop Zones</TabsTrigger>
                </TabsList>

                <TabsContent value="visuals" className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Primary Color</Label>
                            <div className="flex gap-2">
                                <Input type="color" value={domain.visual_config?.color || "#6366f1"}
                                    onChange={e => updateVisual("color", e.target.value)}
                                    className="w-12 p-1 cursor-pointer" />
                                <Input value={domain.visual_config?.color || ""}
                                    onChange={e => updateVisual("color", e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Corner Radius ({domain.visual_config?.corner_radius || 0}px)</Label>
                            <Slider
                                min={0} max={24} step={2}
                                value={[domain.visual_config?.corner_radius || 0]}
                                onValueChange={vals => updateVisual("corner_radius", vals[0])}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Border Style</Label>
                            <Select value={domain.visual_config.border_style || "solid"}
                                onValueChange={v => updateVisual("border_style", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="solid">Solid</SelectItem>
                                    <SelectItem value="dashed">Dashed</SelectItem>
                                    <SelectItem value="dotted">Dotted</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="metadata" className="space-y-4 pt-4">
                    <div className="flex justify-between items-center bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 italic">About Domain Metadata</h4>
                            <HelpTooltip contentPath="canvases/domain-metadata" />
                        </div>
                        <p className="text-[11px] text-blue-700 dark:text-blue-300 max-w-[250px] leading-tight">
                            Define schema fields for governance, agent context, and automatic labeling.
                        </p>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                        <h4 className="text-sm font-medium">Schema Fields</h4>
                        <Button type="button" size="sm" variant="outline" onClick={addMetadataField}><Plus className="w-4 h-4 mr-2" /> Add Field</Button>
                    </div>
                    {/* List of metadata fields */}
                    <div className="space-y-4">
                        <Accordion type="single" collapsible className="w-full">
                            {(domain.metadata_schema || []).map((field, idx) => (
                                <AccordionItem key={idx} value={`item-${idx}`} className="border rounded-lg mb-2 bg-card px-4">
                                    <div className="flex items-center gap-2">
                                        <AccordionTrigger className="flex-1 hover:no-underline py-3">
                                            <div className="flex gap-4 items-center w-full text-left">
                                                <span className="font-mono text-[10px] text-muted-foreground w-20 truncate">{field.key}</span>
                                                <span className="flex-1 font-medium text-sm">{field.label || "Untitled Field"}</span>
                                                <Badge variant="secondary" className="text-[10px] uppercase h-5">{field.type}</Badge>
                                            </div>
                                        </AccordionTrigger>
                                        <div className="flex items-center gap-0.5">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                disabled={idx === 0}
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                onClick={(e) => { e.stopPropagation(); moveMetadataField(idx, 'up'); }}
                                            >
                                                <ArrowUp className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                disabled={idx === (domain.metadata_schema || []).length - 1}
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                onClick={(e) => { e.stopPropagation(); moveMetadataField(idx, 'down'); }}
                                            >
                                                <ArrowDown className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 ml-1"
                                                onClick={(e) => { e.stopPropagation(); removeMetadataField(idx); }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <AccordionContent className="pb-4 pt-2 border-t space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs">Field Label</Label>
                                                <Input
                                                    value={field.label}
                                                    onChange={e => updateMetadataField(idx, { ...field, label: e.target.value })}
                                                    placeholder="Display Name"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">System Key</Label>
                                                <Input
                                                    value={field.key}
                                                    onChange={e => updateMetadataField(idx, { ...field, key: e.target.value })}
                                                    placeholder="snake_case_key"
                                                    className="font-mono"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs">Field Type</Label>
                                                <Select value={field.type} onValueChange={v => updateMetadataField(idx, { ...field, type: v as any })}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="text">Text</SelectItem>
                                                        <SelectItem value="number">Number</SelectItem>
                                                        <SelectItem value="range">Range</SelectItem>
                                                        <SelectItem value="boolean">Boolean</SelectItem>
                                                        <SelectItem value="date">Date</SelectItem>
                                                        <SelectItem value="time">Time</SelectItem>
                                                        <SelectItem value="select">Single Select</SelectItem>
                                                        <SelectItem value="multi-select">Multi Select</SelectItem>
                                                        <SelectItem value="tags">Tags</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">UI Component</Label>
                                                <Select value={field.ui_component || "default"} onValueChange={v => updateMetadataField(idx, { ...field, ui_component: v })}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="default">Default</SelectItem>
                                                        {field.type === 'text' && <SelectItem value="textarea">Textarea</SelectItem>}
                                                        {field.type === 'number' && <SelectItem value="stepper">Stepper (Arrows)</SelectItem>}
                                                        {field.type === 'range' && <SelectItem value="slider">Slider</SelectItem>}
                                                        {field.type === 'boolean' && <SelectItem value="switch">Switch</SelectItem>}
                                                        {field.type === 'select' && <SelectItem value="radio">Radio Group</SelectItem>}
                                                        {field.type === 'multi-select' && <SelectItem value="checkboxes">Checkboxes</SelectItem>}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Type-specific Options */}
                                        {(field.type === 'select' || field.type === 'multi-select') && (
                                            <div className="space-y-2 pt-2">
                                                <Label className="text-xs">Options (Comma separated list of Label:Value or just Value)</Label>
                                                <OptionsInput
                                                    value={field.options || []}
                                                    onChange={options => updateMetadataField(idx, { ...field, options })}
                                                />
                                            </div>
                                        )}

                                        {field.type === 'boolean' && (
                                            <div className="grid grid-cols-2 gap-4 pt-2">
                                                <div className="space-y-2">
                                                    <Label className="text-xs">True Label (e.g., Yes, ON)</Label>
                                                    <Input
                                                        value={field.true_label || ""}
                                                        onChange={e => updateMetadataField(idx, { ...field, true_label: e.target.value })}
                                                        placeholder="True"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs">False Label (e.g., No, OFF)</Label>
                                                    <Input
                                                        value={field.false_label || ""}
                                                        onChange={e => updateMetadataField(idx, { ...field, false_label: e.target.value })}
                                                        placeholder="False"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {(field.type === 'number' || field.type === 'range') && (
                                            <div className="grid grid-cols-3 gap-4 pt-2">
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Min</Label>
                                                    <Input
                                                        type="number"
                                                        value={field.min ?? ""}
                                                        onChange={e => updateMetadataField(idx, { ...field, min: e.target.value ? Number(e.target.value) : undefined })}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Max</Label>
                                                    <Input
                                                        type="number"
                                                        value={field.max ?? ""}
                                                        onChange={e => updateMetadataField(idx, { ...field, max: e.target.value ? Number(e.target.value) : undefined })}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Step/Decimals</Label>
                                                    <Input
                                                        type="number"
                                                        value={field.step ?? field.decimals ?? ""}
                                                        onChange={e => updateMetadataField(idx, {
                                                            ...field,
                                                            step: e.target.value ? Number(e.target.value) : undefined,
                                                            decimals: field.type === 'number' ? (e.target.value ? Number(e.target.value) : undefined) : undefined
                                                        })}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 pt-2">
                                            <Checkbox
                                                id={`req-${idx}`}
                                                checked={field.required}
                                                onCheckedChange={v => updateMetadataField(idx, { ...field, required: !!v })}
                                            />
                                            <Label htmlFor={`req-${idx}`} className="text-xs">Mark as Required</Label>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </div>
                </TabsContent>

                <TabsContent value="dropzones" className="space-y-4 pt-4">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-medium">Drop Zones</h4>
                        <Button type="button" size="sm" variant="outline" onClick={addDropZone}><Plus className="w-4 h-4 mr-2" /> Add Zone</Button>
                    </div>
                    {/* List of drop zones */}
                    <div className="space-y-2">
                        {(domain.drop_zones || []).map((zone, idx) => (
                            <Card key={idx}>
                                <CardContent className="p-3 grid gap-2">
                                    <div className="flex gap-2">
                                        <Input value={zone.label}
                                            onChange={e => {
                                                const newZones = [...(domain.drop_zones || [])];
                                                newZones[idx].label = e.target.value;
                                                onChange({ ...domain, drop_zones: newZones });
                                            }}
                                            placeholder="Zone Label" />
                                        <Button type="button" variant="ghost" size="icon" onClick={() => {
                                            const newZones = [...(domain.drop_zones || [])];
                                            newZones.splice(idx, 1);
                                            onChange({ ...domain, drop_zones: newZones });
                                        }}><Trash2 className="w-4 h-4" /></Button>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <Label className="text-xs">Dashed?</Label>
                                        <Input type="checkbox" checked={zone.dashed_style}
                                            onChange={e => {
                                                const newZones = [...(domain.drop_zones || [])];
                                                newZones[idx].dashed_style = e.target.checked;
                                                onChange({ ...domain, drop_zones: newZones });
                                            }}
                                            className="w-4 h-4" />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
