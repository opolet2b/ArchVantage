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
import { FormRenderer } from "./form-renderer"

interface FormPreviewDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    submitLabel: string
    widgets: WidgetConfig[]
    layout: {
        rows: number
        cols: number
    }
}

export function FormPreviewDialog({
    open,
    onOpenChange,
    title,
    submitLabel,
    widgets,
    layout = { rows: 1, cols: 2 } // default backup
}: FormPreviewDialogProps) {
    const [formValues, setFormValues] = useState<Record<string, any>>({})
    const [submittedData, setSubmittedData] = useState<Record<string, any> | null>(null)

    const handleSubmit = () => {
        const data: Record<string, any> = {}

        widgets.forEach(widget => {
            // Skip display-only widgets
            if (["section_header", "divider", "instructional_text", "picture"].includes(widget.type)) {
                return
            }

            // Get value from form state, fall back to default, then null
            // Note: We deliberately use ?? null to ensure the key exists in JSON
            const value = formValues[widget.id] ?? widget.default ?? null
            data[widget.id] = value
        })

        setSubmittedData(data)
    }

    const handleBack = () => {
        setSubmittedData(null)
    }

    const handleValueChange = (id: string, value: any) => {
        setFormValues(prev => ({ ...prev, [id]: value }))
    }

    // renderWidget moved to FormRenderer

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle>{title || "Form Preview"}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6">
                    {submittedData ? (
                        <div className="space-y-4">
                            <div className="rounded-md bg-slate-950 p-4">
                                <pre className="text-sm text-slate-50 overflow-auto">
                                    {JSON.stringify(submittedData, null, 2)}
                                </pre>
                            </div>
                        </div>
                    ) : (
                        <FormRenderer
                            widgets={widgets}
                            layout={layout}
                            value={formValues}
                            onChange={(id, value) => handleValueChange(id, value)}
                        />
                    )}
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900/50">
                    {submittedData ? (
                        <Button variant="outline" onClick={handleBack}>
                            Back to Form
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Close
                        </Button>
                    )}

                    {!submittedData && (
                        <Button onClick={handleSubmit}>
                            {submitLabel || "Submit"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
