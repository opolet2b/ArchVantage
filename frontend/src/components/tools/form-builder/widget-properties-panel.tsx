"use client"

/**
 * Widget Properties Panel Component
 * 
 * Contextual editor panel for configuring selected widget properties.
 * Shows different options based on widget type.
 */
import { WidgetConfig } from "./widget-palette"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, Settings } from "lucide-react"

interface WidgetPropertiesPanelProps {
    widget: WidgetConfig | null
    onWidgetChange: (widget: WidgetConfig) => void
}

export function WidgetPropertiesPanel({
    widget,
    onWidgetChange
}: WidgetPropertiesPanelProps) {
    if (!widget) {
        return (
            <div className="w-72 border-l bg-slate-50/50 dark:bg-slate-900/50 p-4 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                    <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Select a widget to edit its properties</p>
                </div>
            </div>
        )
    }

    const updateWidget = (updates: Partial<WidgetConfig>) => {
        onWidgetChange({ ...widget, ...updates })
    }

    const updateValidation = (key: string, value: number | string | undefined) => {
        const newValidation = { ...widget.validation, [key]: value }
        // Remove undefined values
        Object.keys(newValidation).forEach(k => {
            if (newValidation[k as keyof typeof newValidation] === undefined) {
                delete newValidation[k as keyof typeof newValidation]
            }
        })
        updateWidget({ validation: Object.keys(newValidation).length > 0 ? newValidation : undefined })
    }

    const addOption = () => {
        const options = widget.options || []
        const newIndex = options.length + 1
        updateWidget({
            options: [...options, { label: `Option ${newIndex}`, value: `option${newIndex}` }]
        })
    }

    const updateOption = (index: number, field: "label" | "value", newValue: string) => {
        const options = [...(widget.options || [])]
        options[index] = { ...options[index], [field]: newValue }
        updateWidget({ options })
    }

    const removeOption = (index: number) => {
        const options = widget.options?.filter((_, i) => i !== index)
        updateWidget({ options })
    }

    const isInputType = ["text_input", "text_area", "number", "email", "password", "date_picker", "time_picker", "file_picker"].includes(widget.type)
    const hasOptions = ["dropdown", "checkbox_group", "radio_group"].includes(widget.type)
    const isDisplayType = ["section_header", "divider", "instructional_text", "picture"].includes(widget.type)

    return (
        <div className="w-72 border-l bg-slate-50/50 dark:bg-slate-900/50 p-4 overflow-y-auto">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Widget Properties
            </h3>

            <div className="space-y-4">
                {/* Field ID */}
                <div className="space-y-2">
                    <Label htmlFor="field-id">Field ID</Label>
                    <Input
                        id="field-id"
                        value={widget.id}
                        onChange={(e) => updateWidget({ id: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                        placeholder="field_name"
                        className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                        Variable name in JSON output
                    </p>
                </div>

                {/* Label */}
                <div className="space-y-2">
                    <Label htmlFor="field-label">Label</Label>
                    {widget.type === "instructional_text" ? (
                        <Textarea
                            id="field-label"
                            value={widget.label}
                            onChange={(e) => updateWidget({ label: e.target.value })}
                            placeholder="Enter instruction text..."
                            rows={3}
                        />
                    ) : (
                        <Input
                            id="field-label"
                            value={widget.label}
                            onChange={(e) => updateWidget({ label: e.target.value })}
                            placeholder="Field label"
                        />
                    )}
                </div>

                {/* Picture Properties */}
                {widget.type === "picture" && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="field-url">Image URL</Label>
                            <Input
                                id="field-url"
                                value={widget.url || ""}
                                onChange={(e) => updateWidget({ url: e.target.value })}
                                placeholder="https://..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="field-alt">Alt Text</Label>
                            <Input
                                id="field-alt"
                                value={widget.alt_text || ""}
                                onChange={(e) => updateWidget({ alt_text: e.target.value })}
                                placeholder="Description of image"
                            />
                        </div>
                    </>
                )}

                {/* Placeholder (for input types) */}
                {isInputType && (
                    <div className="space-y-2">
                        <Label htmlFor="field-placeholder">Placeholder</Label>
                        <Input
                            id="field-placeholder"
                            value={widget.placeholder || ""}
                            onChange={(e) => updateWidget({ placeholder: e.target.value })}
                            placeholder="Hint text..."
                        />
                    </div>
                )}

                {/* Required toggle (not for display types) */}
                {!isDisplayType && (
                    <div className="flex items-center justify-between">
                        <Label htmlFor="field-required">Required</Label>
                        <Switch
                            id="field-required"
                            checked={widget.required}
                            onCheckedChange={(checked) => updateWidget({ required: checked })}
                        />
                    </div>
                )}

                {/* Default value */}
                {!isDisplayType && widget.type !== "checkbox_group" && (
                    <div className="space-y-2">
                        <Label htmlFor="field-default">Default Value</Label>
                        <Input
                            id="field-default"
                            value={widget.default || ""}
                            onChange={(e) => updateWidget({ default: e.target.value })}
                            placeholder="Default value..."
                        />
                    </div>
                )}

                {/* Validation rules */}
                {isInputType && (
                    <div className="space-y-3 pt-2 border-t">
                        <h4 className="text-sm font-medium">Validation</h4>

                        {(widget.type === "text_input" || widget.type === "text_area" || widget.type === "password") && (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Min Length</Label>
                                        <Input
                                            type="number"
                                            value={widget.validation?.min_length ?? ""}
                                            onChange={(e) => updateValidation("min_length", e.target.value ? parseInt(e.target.value) : undefined)}
                                            placeholder="-"
                                            className="h-8"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Max Length</Label>
                                        <Input
                                            type="number"
                                            value={widget.validation?.max_length ?? ""}
                                            onChange={(e) => updateValidation("max_length", e.target.value ? parseInt(e.target.value) : undefined)}
                                            placeholder="-"
                                            className="h-8"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {widget.type === "number" && (
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-xs">Min Value</Label>
                                    <Input
                                        type="number"
                                        value={widget.validation?.min_value ?? ""}
                                        onChange={(e) => updateValidation("min_value", e.target.value ? parseFloat(e.target.value) : undefined)}
                                        placeholder="-"
                                        className="h-8"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Max Value</Label>
                                    <Input
                                        type="number"
                                        value={widget.validation?.max_value ?? ""}
                                        onChange={(e) => updateValidation("max_value", e.target.value ? parseFloat(e.target.value) : undefined)}
                                        placeholder="-"
                                        className="h-8"
                                    />
                                </div>
                            </div>
                        )}

                        {(widget.type === "text_input" || widget.type === "email") && (
                            <div className="space-y-1">
                                <Label className="text-xs">Regex Pattern</Label>
                                <Input
                                    value={widget.validation?.pattern ?? ""}
                                    onChange={(e) => updateValidation("pattern", e.target.value || undefined)}
                                    placeholder="^[a-zA-Z]+$"
                                    className="h-8 font-mono text-xs"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Options (for selection types) */}
                {hasOptions && (
                    <div className="space-y-3 pt-2 border-t">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium">Options</h4>
                            <Button variant="outline" size="sm" onClick={addOption}>
                                <Plus className="h-3 w-3 mr-1" />
                                Add
                            </Button>
                        </div>

                        <div className="space-y-2">
                            {widget.options?.map((option, index) => (
                                <div key={index} className="flex gap-1">
                                    <Input
                                        value={option.label}
                                        onChange={(e) => updateOption(index, "label", e.target.value)}
                                        placeholder="Label"
                                        className="h-8 text-sm"
                                    />
                                    <Input
                                        value={option.value}
                                        onChange={(e) => updateOption(index, "value", e.target.value)}
                                        placeholder="Value"
                                        className="h-8 text-sm font-mono"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        onClick={() => removeOption(index)}
                                    >
                                        <Trash2 className="h-3 w-3 text-red-500" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Layout Configuration */}
                <div className="space-y-3 pt-2 border-t">
                    <h4 className="text-sm font-medium">Layout</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">Col Span</Label>
                            <Input
                                type="number"
                                min={1}
                                value={widget.layout?.colSpan ?? 1}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1
                                    updateWidget({
                                        layout: { ...(widget.layout || { row: 0, col: 0, rowSpan: 1, colSpan: 1 }), colSpan: val }
                                    })
                                }}
                                className="h-8"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Row Span</Label>
                            <Input
                                type="number"
                                min={1}
                                value={widget.layout?.rowSpan ?? 1}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1
                                    updateWidget({
                                        layout: { ...(widget.layout || { row: 0, col: 0, rowSpan: 1, colSpan: 1 }), rowSpan: val }
                                    })
                                }}
                                className="h-8"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
