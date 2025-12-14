"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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

interface FormPreviewDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    submitLabel: string
    widgets: WidgetConfig[]
}

export function FormPreviewDialog({
    open,
    onOpenChange,
    title,
    submitLabel,
    widgets
}: FormPreviewDialogProps) {
    const [formValues, setFormValues] = useState<Record<string, any>>({})

    const handleValueChange = (id: string, value: any) => {
        setFormValues(prev => ({ ...prev, [id]: value }))
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
                    />
                )
            case "dropdown":
                return (
                    <Select value={value} onValueChange={(v) => handleValueChange(widget.id, v)}>
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
                                            if (e.target.checked) {
                                                handleValueChange(widget.id, [...currentValues, opt.value])
                                            } else {
                                                handleValueChange(widget.id, currentValues.filter(v => v !== opt.value))
                                            }
                                        }}
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
            default:
                return <div className="text-red-500">Unknown widget type: {widget.type}</div>
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle>{title || "Form Preview"}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6">
                    <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                        {widgets.map((widget, i) => {
                            if (widget.type === "section_header" || widget.type === "divider" || widget.type === "instructional_text") {
                                return <div key={i}>{renderWidget(widget)}</div>
                            }
                            return (
                                <div key={widget.id} className="space-y-2">
                                    <Label className="text-base font-medium">
                                        {widget.label}
                                        {widget.required && <span className="text-red-500 ml-1">*</span>}
                                    </Label>
                                    {renderWidget(widget)}
                                </div>
                            )
                        })}
                    </form>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900/50">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    <Button onClick={() => alert("This is just a preview. No data is submitted.")}>
                        {submitLabel || "Submit"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
