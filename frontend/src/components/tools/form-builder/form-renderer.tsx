"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { WidgetConfig } from "./widget-palette"

export interface FormRendererProps {
    widgets: WidgetConfig[]
    layout?: {
        rows: number
        cols: number
    }
    value: Record<string, any>
    onChange: (id: string, value: any) => void
    readOnly?: boolean
}

export function FormRenderer({
    widgets,
    layout = { rows: 1, cols: 2 },
    value: formValues,
    onChange,
    readOnly = false
}: FormRendererProps) {

    const handleValueChange = (id: string, value: any) => {
        if (readOnly) return
        onChange(id, value)
    }

    const renderWidget = (widget: WidgetConfig) => {
        const value = formValues[widget.id] ?? widget.default

        switch (widget.type) {
            case "text_input":
            case "email":
            case "password":
            case "number":
                return (
                    <Input
                        type={widget.type === "text_input" ? "text" : widget.type}
                        placeholder={widget.placeholder}
                        required={widget.required}
                        value={value ?? ""}
                        onChange={(e) => handleValueChange(widget.id, e.target.value)}
                        disabled={readOnly}
                    />
                )
            case "date_picker":
                return (
                    <Input
                        type="date"
                        required={widget.required}
                        value={value ?? ""}
                        onChange={(e) => handleValueChange(widget.id, e.target.value)}
                        disabled={readOnly}
                    />
                )
            case "time_picker":
                return (
                    <Input
                        type="time"
                        required={widget.required}
                        value={value ?? ""}
                        onChange={(e) => handleValueChange(widget.id, e.target.value)}
                        disabled={readOnly}
                    />
                )
            case "text_area":
                return (
                    <Textarea
                        placeholder={widget.placeholder}
                        required={widget.required}
                        rows={3}
                        value={value ?? ""}
                        onChange={(e) => handleValueChange(widget.id, e.target.value)}
                        disabled={readOnly}
                    />
                )
            case "dropdown":
                return (
                    <Select
                        value={value}
                        onValueChange={(v) => handleValueChange(widget.id, v)}
                        disabled={readOnly}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                            {widget.options?.map((opt, i) => (
                                <SelectItem key={i} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )
            case "toggle":
                return (
                    <div className="flex items-center space-x-2">
                        <Switch
                            id={widget.id}
                            checked={!!value}
                            onCheckedChange={(checked) => handleValueChange(widget.id, checked)}
                            disabled={readOnly}
                        />
                        <Label htmlFor={widget.id} className="font-normal text-muted-foreground">
                            {value ? "On" : "Off"}
                        </Label>
                    </div>
                )
            case "checkbox_group":
                return (
                    <div className="space-y-2">
                        {widget.options?.map((opt, i) => {
                            const currentValues = (value as string[]) || []
                            const checked = currentValues.includes(opt.value)
                            return (
                                <div key={i} className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id={`${widget.id}-${i}`}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        checked={checked}
                                        onChange={(e) => {
                                            if (readOnly) return
                                            if (e.target.checked) {
                                                handleValueChange(widget.id, [...currentValues, opt.value])
                                            } else {
                                                handleValueChange(widget.id, currentValues.filter(v => v !== opt.value))
                                            }
                                        }}
                                        disabled={readOnly}
                                    />
                                    <Label htmlFor={`${widget.id}-${i}`} className="font-normal">
                                        {opt.label}
                                    </Label>
                                </div>
                            )
                        })}
                    </div>
                )
            case "radio_group":
                return (
                    <div className="space-y-2">
                        {widget.options?.map((opt, i) => (
                            <div key={i} className="flex items-center space-x-2">
                                <input
                                    type="radio"
                                    name={widget.id}
                                    id={`${widget.id}-${i}`}
                                    className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                                    checked={value === opt.value}
                                    onChange={() => handleValueChange(widget.id, opt.value)}
                                    disabled={readOnly}
                                />
                                <Label htmlFor={`${widget.id}-${i}`} className="font-normal">
                                    {opt.label}
                                </Label>
                            </div>
                        ))}
                    </div>
                )
            case "section_header":
                return (
                    <h3 className="text-lg font-semibold border-b pb-1 mt-4 mb-2">
                        {widget.label}
                    </h3>
                )
            case "divider":
                return <hr className="my-4 border-t" />
            case "instructional_text":
                return (
                    <p className="text-sm text-muted-foreground italic my-2">
                        {widget.label}
                    </p>
                )
            case "picture":
                return (
                    <div className="my-2">
                        <img
                            src={widget.url || "https://placehold.co/600x400"}
                            alt={widget.alt_text || widget.label}
                            className="max-w-full h-auto rounded-md border"
                        />
                        {widget.label && (
                            <p className="text-xs text-muted-foreground mt-1 text-center">
                                {widget.label}
                            </p>
                        )}
                    </div>
                )
            default:
                return <div className="text-red-500">Unknown widget type: {widget.type}</div>
        }
    }

    return (
        <div
            className="grid gap-4"
            style={{
                gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${layout.rows}, minmax(40px, auto))`
            }}
        >
            {widgets.map((widget, i) => {
                const gridStyle: React.CSSProperties = widget.layout ? {
                    gridColumn: `${widget.layout.col + 1} / span ${widget.layout.colSpan}`,
                    gridRow: `${widget.layout.row + 1} / span ${widget.layout.rowSpan}`
                } : {
                    gridColumn: "1 / -1", // Default to full width if no layout
                    gridRow: "auto"
                }

                if (widget.type === "section_header" || widget.type === "divider" || widget.type === "instructional_text") {
                    return (
                        <div key={i} style={gridStyle}>
                            {renderWidget(widget)}
                        </div>
                    )
                }

                return (
                    <div key={widget.id} style={gridStyle} className="space-y-2 min-w-0">
                        <Label className="text-base font-medium">
                            {widget.label}
                            {widget.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        {renderWidget(widget)}
                    </div>
                )
            })}
        </div>
    )
}
