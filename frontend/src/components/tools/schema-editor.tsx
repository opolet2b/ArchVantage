"use client"

import { useState, useEffect } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface SchemaEditorProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title?: string
    description?: string
    initialSchema?: string | object
    onSave: (schema: object) => void
    onAutoGenerate?: () => void
}

export function SchemaEditor({
    open,
    onOpenChange,
    title = "Edit Schema",
    description = "Define the JSON schema for this data structure.",
    initialSchema,
    onSave,
    onAutoGenerate
}: SchemaEditorProps) {
    const [jsonString, setJsonString] = useState("")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            if (typeof initialSchema === 'object' && initialSchema !== null && Object.keys(initialSchema).length > 0) {
                setJsonString(JSON.stringify(initialSchema, null, 2))
            } else if (typeof initialSchema === 'string' && initialSchema.trim().length > 0) {
                setJsonString(initialSchema)
            } else {
                setJsonString("{\n  \"type\": \"object\",\n  \"properties\": {}\n}")
            }
            setError(null)
        }
    }, [open, initialSchema])

    const handleSave = () => {
        try {
            const parsed = JSON.parse(jsonString)
            onSave(parsed)
            onOpenChange(false)
        } catch (e) {
            setError("Invalid JSON: " + (e as Error).message)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="schema">JSON Schema</Label>
                        <Textarea
                            id="schema"
                            value={jsonString}
                            onChange={(e) => setJsonString(e.target.value)}
                            className="h-[300px] font-mono text-sm"
                            spellCheck={false}
                        />
                        {error && (
                            <p className="text-sm text-red-500">{error}</p>
                        )}
                    </div>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between">
                    <div className="flex gap-2">
                        {onAutoGenerate && (
                            <Button variant="secondary" onClick={onAutoGenerate} type="button">
                                Generate from Form
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>Save Changes</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
