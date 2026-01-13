"use client"

/**
 * Form Builder Component
 * 
 * Main component that combines Widget Palette, Canvas, and Properties Panel
 * for building GUI form tools.
 */
import { useState, useCallback, useEffect } from "react"
import { WidgetPalette, WidgetType, WidgetConfig } from "./widget-palette"
export type { WidgetConfig }
import { GridCanvas } from "./grid-canvas"
import { GridToolbar } from "./grid-toolbar"
import { WidgetPropertiesPanel } from "./widget-properties-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Save, Eye, FileJson, FileInput } from "lucide-react"
import { SchemaEditor } from "../schema-editor"
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { FormPreviewDialog } from "./form-preview-dialog"

interface FormBuilderProps {
    initialConfig?: {
        title?: string
        submit_label?: string
        components?: WidgetConfig[]
        layout?: { rows: number; cols: number }
        output_schema?: any
        input_schema?: any
    }
    onSave: (config: {
        tool_type: string
        version: string
        title: string
        submit_label: string
        components: WidgetConfig[]
        layout: { rows: number; cols: number }
        output_schema: any
        input_schema: any
    }) => void
    onDirtyChange?: (isDirty: boolean) => void
}

export function FormBuilder({ initialConfig, onSave, onDirtyChange }: FormBuilderProps) {
    const [formTitle, setFormTitle] = useState(initialConfig?.title || "New Form")
    const [submitLabel, setSubmitLabel] = useState(initialConfig?.submit_label || "Submit")
    const [widgets, setWidgets] = useState<WidgetConfig[]>(initialConfig?.components || [])
    const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
    const [draggedWidget, setDraggedWidget] = useState<WidgetType | null>(null)
    const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null)
    const [showPreview, setShowPreview] = useState(false)

    // Schema State
    const [outputSchema, setOutputSchema] = useState<any>(initialConfig?.output_schema || {})
    const [inputSchema, setInputSchema] = useState<any>(initialConfig?.input_schema || {})
    const [showOutputSchemaEditor, setShowOutputSchemaEditor] = useState(false)
    const [showInputSchemaEditor, setShowInputSchemaEditor] = useState(false)

    // Grid State
    const [gridRows, setGridRows] = useState(initialConfig?.layout?.rows || 4)
    const [gridCols, setGridCols] = useState(initialConfig?.layout?.cols || 2)
    const [selectedCell, setSelectedCell] = useState<{ r: number, c: number } | null>(null)

    // Modification State
    const [isDirty, setIsDirty] = useState(false)

    // Notify parent of dirty state change
    useEffect(() => {
        onDirtyChange?.(isDirty)
    }, [isDirty, onDirtyChange])

    // Generate unique ID for new widgets
    const generateId = (baseId: string): string => {
        let id = baseId
        let counter = 1
        while (widgets.some(w => w.id === id)) {
            id = `${baseId}_${counter}`
            counter++
        }
        return id
    }

    // Handle drag start from palette
    const handlePaletteDragStart = useCallback((widgetType: WidgetType) => {
        setDraggedWidget(widgetType)
    }, [])

    // Handle drop on canvas
    const handleWidgetDrop = useCallback((widgetType: WidgetType) => {
        const newWidget: WidgetConfig = {
            id: generateId(widgetType.id),
            type: widgetType.id,
            label: widgetType.defaultConfig.label || "New Field",
            placeholder: widgetType.defaultConfig.placeholder,
            required: widgetType.defaultConfig.required || false,
            validation: widgetType.defaultConfig.validation as WidgetConfig["validation"],
            options: widgetType.defaultConfig.options,
            default: widgetType.defaultConfig.default
        }
        setWidgets(prev => [...prev, newWidget])
        setSelectedWidgetId(newWidget.id)
        setDraggedWidget(null)
        setIsDirty(true)
    }, [widgets])

    // Handle canvas drop
    const handleCanvasDrop = useCallback(() => {
        if (draggedWidget) {
            handleWidgetDrop(draggedWidget)
        }
    }, [draggedWidget, handleWidgetDrop])

    // Update single widget
    const handleWidgetChange = useCallback((updatedWidget: WidgetConfig) => {
        setWidgets(prev => prev.map(w =>
            w.id === selectedWidgetId ? updatedWidget : w
        ))

        // If ID changed, update selection to keep panel open
        if (selectedWidgetId && updatedWidget.id !== selectedWidgetId) {
            setSelectedWidgetId(updatedWidget.id)
        }

        setIsDirty(true)
    }, [selectedWidgetId])

    // Generic Schema Inference
    const generateSchemaFromWidgets = () => {
        const schema: any = {
            type: "object",
            properties: {},
            required: []
        }

        widgets.forEach(widget => {
            if (["section_header", "divider", "instructional_text", "picture"].includes(widget.type)) return

            // Create a safe key from label if needed, or use ID
            const key = widget.id

            let fieldSchema: any = {
                type: "string",
                description: widget.label
            }

            switch (widget.type) {
                case "number":
                    fieldSchema.type = "number"
                    break
                case "checkbox_group":
                    fieldSchema.type = "array"
                    fieldSchema.items = { type: "string" }
                    break
                case "toggle":
                    fieldSchema.type = "boolean"
                    break
                case "date_picker":
                    fieldSchema.type = "string"
                    fieldSchema.format = "date"
                    break
                case "time_picker":
                    fieldSchema.type = "string"
                    fieldSchema.format = "time"
                    break
                case "text_input":
                case "text_area":
                case "email":
                case "password":
                case "dropdown":
                case "radio_group":
                default:
                    fieldSchema.type = "string"
                    break
            }

            schema.properties[key] = fieldSchema

            if (widget.required) {
                schema.required.push(key)
            }
        })
        return schema
    }

    const inferOutputSchema = () => {
        setOutputSchema(generateSchemaFromWidgets())
        setIsDirty(true)
    }

    const inferInputSchema = () => {
        setInputSchema(generateSchemaFromWidgets())
        setIsDirty(true)
    }

    // Get selected widget
    const selectedWidget = widgets.find(w => w.id === selectedWidgetId) || null

    // Handle save
    const handleSave = () => {
        onSave({
            tool_type: "gui",
            version: "1.0",
            title: formTitle,
            submit_label: submitLabel,
            components: widgets,
            layout: {
                rows: gridRows,
                cols: gridCols
            },
            output_schema: outputSchema,
            input_schema: inputSchema
        })
        setIsDirty(false)
    }

    // Grid Logic
    const handleCellDrop = useCallback((r: number, c: number) => {
        // Handle Move
        if (draggedWidgetId) {
            setWidgets(prev => prev.map(w => {
                if (w.id === draggedWidgetId) {
                    return {
                        ...w,
                        layout: {
                            ...w.layout,
                            row: r,
                            col: c,
                            // Preserve span or reset? Usually reset to 1x1 on move or keep? 
                            // Keeping span might break layout if new pos + span > cols.
                            // Safest is to keep if fits, effectively 'move'.
                            // For simplicity in MVP, we keep existing span but clamp if needed?
                            // Let's just update row/col and let validation (if any) handle it, 
                            // or just layout as is. We'll blindly move it.
                            rowSpan: w.layout?.rowSpan || 1,
                            colSpan: w.layout?.colSpan || 1
                        } as any // cast to avoid strict check issues if layout optional
                    }
                }
                return w
            }))
            setDraggedWidgetId(null)
            setIsDirty(true)
            return
        }

        // Handle New Widget Drop
        if (!draggedWidget) return

        const newWidget: WidgetConfig = {
            id: generateId(draggedWidget.id),
            type: draggedWidget.id,
            label: draggedWidget.defaultConfig.label || "New Field",
            placeholder: draggedWidget.defaultConfig.placeholder,
            required: draggedWidget.defaultConfig.required || false,
            validation: draggedWidget.defaultConfig.validation as WidgetConfig["validation"],
            options: draggedWidget.defaultConfig.options,
            default: draggedWidget.defaultConfig.default,
            layout: {
                row: r,
                col: c,
                rowSpan: 1,
                colSpan: 1
            }
        }
        setWidgets(prev => [...prev, newWidget])
        setSelectedWidgetId(newWidget.id)
        setSelectedCell({ r, c })
        setDraggedWidget(null)
        setIsDirty(true)
    }, [draggedWidget, draggedWidgetId, widgets])

    const handleDeleteWidget = (id: string) => {
        setWidgets(prev => prev.filter(w => w.id !== id))
        if (selectedWidgetId === id) setSelectedWidgetId(null)
        setIsDirty(true)
    }

    // Grid Management
    const handleAddRow = () => {
        setGridRows(prev => prev + 1)
        setIsDirty(true)
    }
    const handleAddCol = () => {
        setGridCols(prev => prev + 1)
        setIsDirty(true)
    }

    const handleRemoveRow = () => {
        if (gridRows <= 1) return
        const hasWidgets = widgets.some(w => (w.layout?.row || 0) >= gridRows - 1)
        if (hasWidgets && !confirm("Widgets in the last row will be removed. Continue?")) return
        setWidgets(prev => prev.filter(w => (w.layout?.row || 0) < gridRows - 1))
        setGridRows(prev => prev - 1)
        setIsDirty(true)
    }

    const handleRemoveCol = () => {
        if (gridCols <= 1) return
        const hasWidgets = widgets.some(w => (w.layout?.col || 0) >= gridCols - 1)
        if (hasWidgets && !confirm("Widgets in the last column will be removed. Continue?")) return
        setWidgets(prev => prev.filter(w => (w.layout?.col || 0) < gridCols - 1))
        setGridCols(prev => prev - 1)
        setIsDirty(true)
    }

    const handleSplit = () => {
        if (!selectedWidget) return
        const layout = selectedWidget.layout || { row: 0, col: 0, rowSpan: 1, colSpan: 1 }
        if (layout.colSpan > 1) {
            handleWidgetChange({ ...selectedWidget, layout: { ...layout, colSpan: layout.colSpan - 1 } })
        } else if (layout.rowSpan > 1) {
            handleWidgetChange({ ...selectedWidget, layout: { ...layout, rowSpan: layout.rowSpan - 1 } })
        }
    }

    const handleMergeCells = () => {
        if (selectedWidget) {
            const layout = selectedWidget.layout!
            if (layout.col + layout.colSpan < gridCols) {
                handleWidgetChange({ ...selectedWidget, layout: { ...layout, colSpan: layout.colSpan + 1 } })
            }
        }
    }

    const canMerge = !!selectedWidget && (selectedWidget.layout?.col || 0) + (selectedWidget.layout?.colSpan || 1) < gridCols
    const canSplit = !!selectedWidget && ((selectedWidget.layout?.colSpan || 1) > 1 || (selectedWidget.layout?.rowSpan || 1) > 1)

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-white dark:bg-slate-900">
                <div className="flex items-center gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="form-title" className="text-xs text-muted-foreground">
                            Form Title
                        </Label>
                        <Input
                            id="form-title"
                            value={formTitle}
                            onChange={(e) => {
                                setFormTitle(e.target.value)
                                setIsDirty(true)
                            }}
                            className="h-8 w-64"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="submit-label" className="text-xs text-muted-foreground">
                            Submit Button Label
                        </Label>
                        <Input
                            id="submit-label"
                            value={submitLabel}
                            onChange={(e) => {
                                setSubmitLabel(e.target.value)
                                setIsDirty(true)
                            }}
                            className="h-8 w-36"
                        />
                    </div>
                </div>
                <div className="flex gap-2">
                    <HelpTooltip contentPath="tools/gui-builder" className="h-8 w-8 border" displayMode="dialog" />
                    <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowInputSchemaEditor(true)}>
                        <FileInput className="h-4 w-4 mr-2" />
                        Input Schema
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowOutputSchemaEditor(true)}>
                        <FileJson className="h-4 w-4 mr-2" />
                        Output Schema
                    </Button>
                    <Button size="sm" onClick={handleSave} className={isDirty ? "relative" : ""}>
                        <Save className="h-4 w-4 mr-2" />
                        Save Form
                        {isDirty && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                <WidgetPalette onDragStart={handlePaletteDragStart} />

                <div className="flex-1 flex flex-col">
                    <GridToolbar
                        onAddRow={handleAddRow}
                        onAddCol={handleAddCol}
                        onRemoveRow={handleRemoveRow}
                        onRemoveCol={handleRemoveCol}
                        onMergeCells={handleMergeCells}
                        onSplitCell={handleSplit}
                        canMerge={canMerge}
                        canSplit={canSplit}
                    />
                    <GridCanvas
                        rows={gridRows}
                        cols={gridCols}
                        widgets={widgets}
                        selectedWidgetId={selectedWidgetId}
                        selectedCell={selectedCell}
                        onSelectWidget={setSelectedWidgetId}
                        onSelectCell={setSelectedCell}
                        onWidgetDrop={(w, cell) => handleCellDrop(cell.r, cell.c)}
                        onDeleteWidget={handleDeleteWidget}
                        onWidgetDragStart={setDraggedWidgetId}
                    />
                </div>

                <WidgetPropertiesPanel
                    widget={selectedWidget}
                    onWidgetChange={handleWidgetChange}
                />
            </div>

            <FormPreviewDialog
                open={showPreview}
                onOpenChange={setShowPreview}
                title={formTitle}
                submitLabel={submitLabel}
                widgets={widgets}
                layout={{ rows: gridRows, cols: gridCols }}
            />

            <SchemaEditor
                title="Edit Output Schema"
                description="Define the JSON schema for the data returned by this form."
                open={showOutputSchemaEditor}
                onOpenChange={setShowOutputSchemaEditor}
                initialSchema={outputSchema}
                onSave={(schema) => {
                    setOutputSchema(schema)
                    setIsDirty(true)
                }}
                onAutoGenerate={inferOutputSchema}
            />

            <SchemaEditor
                title="Edit Input Schema"
                description="Define the JSON schema for the data required to pre-fill this form."
                open={showInputSchemaEditor}
                onOpenChange={setShowInputSchemaEditor}
                initialSchema={inputSchema}
                onSave={(schema) => {
                    setInputSchema(schema)
                    setIsDirty(true)
                }}
                onAutoGenerate={inferInputSchema}
            />
        </div>
    )
}
