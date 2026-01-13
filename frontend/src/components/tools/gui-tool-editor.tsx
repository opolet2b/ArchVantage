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
import { API_URL } from "@/lib/utils"

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
    const [categories, setCategories] = useState<{ id: number, name: string }[]>([])
    const [categoryId, setCategoryId] = useState<number | null>(null)

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
            setCategoryId(tool.category_id || null)
        } else {
            setName("")
            setDescription("")
            setIsPublic(false)
            setPermissions([])
            setCategoryId(null)
        }
        setMetaDirty(false)
    }, [tool])

    // Fetch categories
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                // Assuming API_URL is imported or available. If not, need to check imports.
                // ToolEditor imports API_URL from "@/lib/utils". I need to check imports here.
                // Assuming it's imported or I need to add it.
                // Looking at file content, API_URL is NOT imported. I need to add it.
                // I will assume I need to add the import in a separate chunk.
                const response = await fetch(`${API_URL}/categories`, {
                    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
                })
                if (response.ok) {
                    const data = await response.json()
                    setCategories(data)
                }
            } catch (error) {
                console.error("Failed to fetch categories", error)
            }
        }
        fetchCategories()
    }, [])

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
            system_prompt: generateSystemPrompt(formConfig),
            category_id: categoryId || undefined
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

                    <div className="w-48 space-y-1">
                        <Label className="text-xs text-muted-foreground">Category</Label>
                        <select
                            value={categoryId || ""}
                            onChange={(e) => handleMetaChange(() => setCategoryId(e.target.value ? Number(e.target.value) : null))}
                            className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">Uncategorized</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
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
