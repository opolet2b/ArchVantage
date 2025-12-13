"use client"

/**
 * Agent Input Form
 * 
 * A dynamic form component that renders input fields based on an agent's
 * inputs_schema. Supports text, number, boolean, and select input types.
 */
import * as React from "react"
import { Loader2, Play, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

/**
 * JSON Schema property definition.
 */
interface SchemaProperty {
    type: string
    description?: string
    default?: unknown
    enum?: string[]
}

/**
 * Agent inputs schema following JSON Schema format.
 */
interface InputsSchema {
    type?: string
    properties?: Record<string, SchemaProperty>
    required?: string[]
}

interface AgentInputFormProps {
    /**
     * The agent's name for display.
     */
    agentName: string
    /**
     * The agent's inputs schema.
     */
    inputsSchema: InputsSchema
    /**
     * Whether the form is currently submitting.
     */
    isSubmitting: boolean
    /**
     * Callback when the form is submitted.
     */
    onSubmit: (inputs: Record<string, unknown>) => void
    /**
     * Callback when the form is cancelled.
     */
    onCancel: () => void
}

export function AgentInputForm({
    agentName,
    inputsSchema,
    isSubmitting,
    onSubmit,
    onCancel
}: AgentInputFormProps) {
    const [values, setValues] = React.useState<Record<string, unknown>>({})

    /**
     * Initialize form values from defaults.
     */
    React.useEffect(() => {
        const defaults: Record<string, unknown> = {}
        const properties = inputsSchema?.properties || {}

        for (const [key, prop] of Object.entries(properties)) {
            if (prop.default !== undefined) {
                defaults[key] = prop.default
            } else if (prop.type === "string") {
                defaults[key] = ""
            } else if (prop.type === "number" || prop.type === "integer") {
                defaults[key] = 0
            } else if (prop.type === "boolean") {
                defaults[key] = false
            }
        }

        setValues(defaults)
    }, [inputsSchema])

    /**
     * Handle input value change.
     */
    const handleChange = (key: string, value: unknown) => {
        setValues(prev => ({ ...prev, [key]: value }))
    }

    /**
     * Handle form submission.
     */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSubmit(values)
    }

    /**
     * Check if a field is required.
     */
    const isRequired = (key: string) => {
        return inputsSchema?.required?.includes(key) ?? false
    }

    /**
     * Render input field based on type.
     */
    const renderField = (key: string, prop: SchemaProperty) => {
        const value = values[key]
        const required = isRequired(key)

        // Enum/Select
        if (prop.enum && prop.enum.length > 0) {
            return (
                <Select
                    value={value as string}
                    onValueChange={(v) => handleChange(key, v)}
                >
                    <SelectTrigger>
                        <SelectValue placeholder={`Select ${key}...`} />
                    </SelectTrigger>
                    <SelectContent>
                        {prop.enum.map((option) => (
                            <SelectItem key={option} value={option}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )
        }

        // Boolean
        if (prop.type === "boolean") {
            return (
                <div className="flex items-center gap-2">
                    <Switch
                        checked={value as boolean}
                        onCheckedChange={(checked) => handleChange(key, checked)}
                    />
                    <span className="text-sm text-muted-foreground">
                        {value ? "Yes" : "No"}
                    </span>
                </div>
            )
        }

        // Number
        if (prop.type === "number" || prop.type === "integer") {
            return (
                <Input
                    type="number"
                    value={value as number}
                    onChange={(e) => handleChange(key, Number(e.target.value))}
                    required={required}
                    step={prop.type === "integer" ? 1 : "any"}
                />
            )
        }

        // String - use textarea if description suggests long text
        const isLongText = prop.description?.toLowerCase().includes("text") ||
            prop.description?.toLowerCase().includes("description") ||
            prop.description?.toLowerCase().includes("content")

        if (isLongText) {
            return (
                <Textarea
                    value={value as string}
                    onChange={(e) => handleChange(key, e.target.value)}
                    required={required}
                    placeholder={prop.description || `Enter ${key}...`}
                    rows={3}
                />
            )
        }

        // Default: string input
        return (
            <Input
                type="text"
                value={value as string}
                onChange={(e) => handleChange(key, e.target.value)}
                required={required}
                placeholder={prop.description || `Enter ${key}...`}
            />
        )
    }

    const properties = inputsSchema?.properties || {}
    const hasProperties = Object.keys(properties).length > 0

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground mb-2">
                Configure inputs for <span className="text-foreground">{agentName}</span>
            </div>

            {!hasProperties && (
                <div className="text-sm text-muted-foreground py-4 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    This agent has no required inputs
                </div>
            )}

            {hasProperties && (
                <div className="space-y-4">
                    {Object.entries(properties).map(([key, prop]) => (
                        <div key={key} className="space-y-2">
                            <Label htmlFor={key} className="text-sm">
                                {key}
                                {isRequired(key) && (
                                    <span className="text-red-500 ml-1">*</span>
                                )}
                            </Label>
                            {prop.description && (
                                <p className="text-xs text-muted-foreground">
                                    {prop.description}
                                </p>
                            )}
                            {renderField(key, prop)}
                        </div>
                    ))}
                </div>
            )}

            {/* Form Actions */}
            <div className="flex justify-end gap-2 pt-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={isSubmitting}
                >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Running...
                        </>
                    ) : (
                        <>
                            <Play className="h-4 w-4 mr-1" />
                            Execute Agent
                        </>
                    )}
                </Button>
            </div>
        </form>
    )
}
