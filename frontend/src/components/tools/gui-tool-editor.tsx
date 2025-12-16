"use client"

/**
 * GUI Tool Editor Component
 * 
 * Wrapper around FormBuilder for editing GUI-type tools.
 * Handles loading/saving GUI schema to/from tool configuration.
 */
import { useState, useEffect } from "react"
import { FormBuilder, WidgetConfig } from "./form-builder"
import { Tool, ToolPermission } from "./tool-list"
import { ToolPermissionsPanel } from "./tool-permissions-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react"

interface GUIToolEditorProps {
    tool: Tool | null
    onSave: (tool: Partial<Tool>) => void
    onDelete: (toolId: number) => void
    onBack?: () => void
    onDirtyChange?: (isDirty: boolean) => void
}

export function GUIToolEditor({ tool, onSave, onDelete, onBack, onDirtyChange }: GUIToolEditorProps) {
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [isPublic, setIsPublic] = useState(false)
    const [permissions, setPermissions] = useState<ToolPermission[]>([])
    const [showPermissions, setShowPermissions] = useState(false)

    // Dirty state tracking
    const [formDirty, setFormDirty] = useState(false)
    const [metaDirty, setMetaDirty] = useState(false)

    // Load tool data
    useEffect(() => {
        if (tool) {
            setName(tool.name)
            setDescription(tool.description || "")
            setIsPublic(tool.is_public)
            setPermissions(tool.permissions || [])
        } else {
            setName("")
            setDescription("")
            setIsPublic(false)
            setPermissions([])
        }
        setMetaDirty(false)
    }, [tool])

    // Notify parent of total dirty state
    useEffect(() => {
        const isDirty = formDirty || metaDirty
        onDirtyChange?.(isDirty)
    }, [formDirty, metaDirty, onDirtyChange])

    const handleMetaChange = (updater: () => void) => {
        updater()
        setMetaDirty(true)
    }

    // Get initial form config from tool
    const getInitialConfig = () => {
        if (tool?.configuration?.gui_schema) {
            return {
                title: tool.configuration.gui_schema.title,
                submit_label: tool.configuration.gui_schema.submit_label,
                components: tool.configuration.gui_schema.components,
                layout: tool.configuration.gui_schema.layout,
                output_schema: tool.configuration.output_schema,
                input_schema: tool.configuration.input_schema
            }
        }
        return undefined
    }

    // Handle form builder save
    const handleFormSave = (formConfig: {
        tool_type: string
        version: string
        title: string
        submit_label: string
        components: WidgetConfig[]
        layout: { rows: number; cols: number }
        output_schema: any
        input_schema: any
    }) => {
        const toolData: Partial<Tool> = {
            name: name || formConfig.title,
            description,
            is_public: isPublic,
            tool_type: "gui",
            configuration: {
                gui_schema: formConfig,
                output_schema: formConfig.output_schema,
                input_schema: formConfig.input_schema
            },
            permissions,  // Include permissions
            // Generate system prompt for GUI tool
            system_prompt: generateSystemPrompt(formConfig)
        }
        onSave(toolData)
    }

    // Generate system prompt for GUI tool
    const generateSystemPrompt = (formConfig: {
        title: string
        components: WidgetConfig[]
    }): string => {
        const fieldList = formConfig.components
            .filter(c => !["section_header", "divider", "instructional_text"].includes(c.type))
            .map(c => c.label)
            .join(", ")

        return `Use this tool when you need to collect the following information from the user: ${fieldList}.

Do not ask for these fields individually via chat. Instead, call this tool to present a complete form to the user.

Form: ${formConfig.title}

Fields:
${formConfig.components
                .filter(c => !["section_header", "divider", "instructional_text"].includes(c.type))
                .map(c => `- ${c.label} (${c.id})${c.required ? " [Required]" : ""}`)
                .join("\n")}`
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Top bar with tool metadata */}
            <div className="flex items-center gap-4 p-4 border-b bg-white dark:bg-slate-900">
                {onBack && (
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                )}

                <div className="flex-1 flex items-center gap-4">
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Tool Name</Label>
                        <Input
                            value={name}
                            onChange={(e) => handleMetaChange(() => setName(e.target.value))}
                            placeholder="My GUI Tool"
                            className="h-8 w-48"
                        />
                    </div>

                    <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <Input
                            value={description}
                            onChange={(e) => handleMetaChange(() => setDescription(e.target.value))}
                            placeholder="What does this form collect?"
                            className="h-8"
                        />
                    </div>

                    {/* Permissions Toggle */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPermissions(!showPermissions)}
                        className="flex items-center gap-1"
                    >
                        {showPermissions ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                        Permissions
                        {permissions.length > 0 && (
                            <span className="ml-1 text-xs bg-primary/20 px-1.5 rounded-full">
                                {permissions.length}
                            </span>
                        )}
                    </Button>
                </div>

                {tool && (
                    <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => onDelete(tool.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Collapsible Permissions Panel */}
            {showPermissions && (
                <div className="p-4 border-b bg-slate-50/50 dark:bg-slate-900/50">
                    <ToolPermissionsPanel
                        permissions={permissions}
                        onChange={(perms) => handleMetaChange(() => setPermissions(perms))}
                    />
                </div>
            )}

            {/* Form Builder */}
            <FormBuilder
                initialConfig={getInitialConfig()}
                onSave={handleFormSave}
                onDirtyChange={setFormDirty}
            />
        </div>
    )
}
