"use client";

import * as React from "react";
import { MetadataField } from "../canvas-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

interface MetadataSchemaEditorProps {
    schema: MetadataField[];
    onChange: (schema: MetadataField[]) => void;
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

    // Update local value if external value changes (unless we are focused - simplistic check)
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

export function MetadataSchemaEditor({ schema, onChange }: MetadataSchemaEditorProps) {

    const addMetadataField = () => {
        const newField: MetadataField = { key: `field_${Date.now()}`, label: "New Field", type: "text" };
        onChange([...(schema || []), newField]);
    };

    const updateMetadataField = (index: number, field: MetadataField) => {
        const newSchema = [...(schema || [])];
        newSchema[index] = field;
        onChange(newSchema);
    };

    const removeMetadataField = (index: number) => {
        const newSchema = [...(schema || [])];
        newSchema.splice(index, 1);
        onChange(newSchema);
    };

    const moveMetadataField = (index: number, direction: 'up' | 'down') => {
        const newSchema = [...(schema || [])];
        if (direction === 'up' && index > 0) {
            [newSchema[index], newSchema[index - 1]] = [newSchema[index - 1], newSchema[index]];
        } else if (direction === 'down' && index < newSchema.length - 1) {
            [newSchema[index], newSchema[index + 1]] = [newSchema[index + 1], newSchema[index]];
        }
        onChange(newSchema);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 italic">About Metadata</h4>
                </div>
                <p className="text-[11px] text-blue-700 dark:text-blue-300 max-w-[250px] leading-tight text-right">
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
                    {(schema || []).map((field, idx) => (
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
                                        disabled={idx === (schema || []).length - 1}
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
                                        <Label className="text-xs">Description (Tooltip)</Label>
                                        <Input
                                            value={field.description || ""}
                                            onChange={e => updateMetadataField(idx, { ...field, description: e.target.value })}
                                            placeholder="Helper text for users..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Input Placeholder</Label>
                                        <Input
                                            value={field.placeholder || ""}
                                            onChange={e => updateMetadataField(idx, { ...field, placeholder: e.target.value })}
                                            placeholder="e.g. Enter a valid email..."
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
        </div >
    );
}
