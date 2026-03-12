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
import { Save, Eye, FileJson, FileInput, Sparkles, Loader2, FileUp } from "lucide-react"
import { SchemaEditor } from "../schema-editor"
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { FormPreviewDialog } from "./form-preview-dialog"
import { ContextualTrainer, TrainerStep } from "@/components/ui/contextual-trainer"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { API_URL } from "@/lib/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

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

    // LLM Config State
    const [llmModels, setLlmModels] = useState<{ name: string; id: string }[]>([])
    const [selectedLlm, setSelectedLlm] = useState<string>("default")

    // AI Generation State
    const [showAiDialog, setShowAiDialog] = useState(false)
    const [aiDescription, setAiDescription] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)

    // PDF Conversion State
    const [showPdfDialog, setShowPdfDialog] = useState(false)
    const [pdfFile, setPdfFile] = useState<File | null>(null)
    const [isScannedPdf, setIsScannedPdf] = useState(false)
    const [selectedVlm, setSelectedVlm] = useState<string>("")
    const [isConverting, setIsConverting] = useState(false)
    const [isDraggingOver, setIsDraggingOver] = useState(false)

    // VLM models (filtered from presets where is_vision is true)
    const vlmModels = llmModels.filter((m: any) => m.is_vision === true)

    // Notify parent of dirty state change
    useEffect(() => {
        onDirtyChange?.(isDirty)
    }, [isDirty, onDirtyChange])

    // Fetch LLM configuration presets
    useEffect(() => {
        const fetchLlmModels = async () => {
            try {
                const response = await fetch(`${API_URL}/config/presets`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                })
                if (response.ok) {
                    const data = await response.json()
                    let models: { name: string; id: string }[] = []
                    if (Array.isArray(data.presets)) {
                        models = data.presets.map((preset: any) => ({
                            id: preset.name || preset.model_name,
                            name: preset.name || preset.model_name,
                            is_vision: preset.is_vision || false,
                        }))
                    } else {
                        models = Object.entries(data.presets || {}).map(
                            ([id, preset]: [string, any]) => ({
                                id: preset.name || preset.model_name || id,
                                name: preset.name || id,
                                is_vision: preset.is_vision || false,
                            })
                        )
                    }
                    setLlmModels(models)
                    if (models.length > 0 && selectedLlm === "default") {
                        setSelectedLlm(models[0].id)
                    }
                }
            } catch (error) {
                console.error("Failed to fetch LLM models:", error)
            }
        }
        fetchLlmModels()
    }, [])

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

    // Handle AI form generation
    const handleGenerateWithAI = async () => {
        if (!aiDescription.trim()) return
        setIsGenerating(true)
        try {
            const response = await fetch(`${API_URL}/generate-form`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    description: aiDescription,
                    llm_model: selectedLlm,
                }),
            })
            if (response.ok) {
                const data = await response.json()
                const form = data.form
                // Load the generated form into the builder
                if (form.title) setFormTitle(form.title)
                if (form.submit_label) setSubmitLabel(form.submit_label)
                if (form.components) setWidgets(form.components)
                if (form.layout) {
                    setGridRows(form.layout.rows || 4)
                    setGridCols(form.layout.cols || 2)
                }
                setSelectedWidgetId(null)
                setIsDirty(true)
                setShowAiDialog(false)
                setAiDescription("")
            } else {
                const err = await response.json().catch(() => ({}))
                console.error("AI generation failed:", err.detail || response.statusText)
                alert(`Generation failed: ${err.detail || response.statusText}`)
            }
        } catch (error) {
            console.error("Error generating form:", error)
            alert("Failed to generate form. Check your connection and LLM configuration.")
        } finally {
            setIsGenerating(false)
        }
    }

    // Handle PDF form conversion
    const handleConvertPdf = async () => {
        if (!pdfFile) return
        if (isScannedPdf && !selectedVlm) {
            alert("Please select a VLM configuration for scanned PDF processing.")
            return
        }
        setIsConverting(true)
        try {
            const formData = new FormData()
            formData.append("file", pdfFile)
            formData.append("llm_model", selectedLlm)
            formData.append("is_scanned", String(isScannedPdf))
            if (isScannedPdf && selectedVlm) {
                formData.append("vlm_model", selectedVlm)
            }

            const response = await fetch(`${API_URL}/convert-pdf-form`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: formData,
            })
            if (response.ok) {
                const data = await response.json()
                const form = data.form
                if (form.title) setFormTitle(form.title)
                if (form.submit_label) setSubmitLabel(form.submit_label)
                if (form.components) setWidgets(form.components)
                if (form.layout) {
                    setGridRows(form.layout.rows || 4)
                    setGridCols(form.layout.cols || 2)
                }
                setSelectedWidgetId(null)
                setIsDirty(true)
                setShowPdfDialog(false)
                setPdfFile(null)
                setIsScannedPdf(false)
                setSelectedVlm("")
            } else {
                const err = await response.json().catch(() => ({}))
                console.error("PDF conversion failed:", err.detail || response.statusText)
                alert(`Conversion failed: ${err.detail || response.statusText}`)
            }
        } catch (error) {
            console.error("Error converting PDF:", error)
            alert("Failed to convert PDF. Check your connection and LLM configuration.")
        } finally {
            setIsConverting(false)
        }
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
                            id="form-title-input"
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
                <div className="flex gap-2 items-center">
                    {/* LLM Configuration Dropdown */}
                    <Select value={selectedLlm} onValueChange={setSelectedLlm}>
                        <SelectTrigger className="w-[180px] h-9">
                            <SelectValue placeholder="Select LLM" />
                        </SelectTrigger>
                        <SelectContent>
                            {llmModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                    {model.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAiDialog(true)}
                        id="ai-generate-btn"
                    >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Create form with AI
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPdfDialog(true)}
                        id="pdf-convert-btn"
                    >
                        <FileUp className="h-4 w-4 mr-2" />
                        Convert Form
                    </Button>
                    <HelpTooltip contentPath="tools/gui-builder" className="h-8 w-8 border" displayMode="dialog" />
                    <Button variant="outline" size="sm" onClick={() => setShowPreview(true)} id="preview-btn">
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
                    <Button size="sm" onClick={handleSave} className={isDirty ? "relative" : ""} id="save-form-btn">
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
            <div className="flex flex-1 overflow-hidden" id="form-builder-container">
                <div id="widget-palette">
                    <WidgetPalette onDragStart={handlePaletteDragStart} />
                </div>

                <div className="flex-1 flex flex-col">
                    <div id="grid-controls">
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
                    </div>
                    <div id="form-canvas" className="flex-1 overflow-auto">
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
            <ContextualTrainer
                workflowId="form_builder_walkthrough"
                steps={FORM_BUILDER_STEPS}
            />

            {/* AI Form Generation Dialog */}
            <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
                <DialogContent className="sm:max-w-[525px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-amber-500" />
                            Create form with AI
                        </DialogTitle>
                        <DialogDescription>
                            Describe the form you want and the AI will generate it for you.
                            For example: &quot;A form for entering one&apos;s coordinates&quot;
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            value={aiDescription}
                            onChange={(e) => setAiDescription(e.target.value)}
                            placeholder="Describe the form you want to create..."
                            rows={5}
                            className="resize-none"
                            disabled={isGenerating}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setShowAiDialog(false)}
                            disabled={isGenerating}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleGenerateWithAI}
                            disabled={isGenerating || !aiDescription.trim()}
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Generate
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* PDF Form Conversion Dialog */}
            <Dialog open={showPdfDialog} onOpenChange={(open) => {
                setShowPdfDialog(open)
                if (!open) {
                    setPdfFile(null)
                    setIsScannedPdf(false)
                    setSelectedVlm("")
                    setIsDraggingOver(false)
                }
            }}>
                <DialogContent className="sm:max-w-[525px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileUp className="h-5 w-5 text-blue-500" />
                            Convert Form
                        </DialogTitle>
                        <DialogDescription>
                            Upload a PDF or an image (JPG, PNG) and the AI will extract its fields into a form builder configuration.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        {/* File Drop Zone */}
                        <div
                            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                                isDraggingOver
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                                    : pdfFile
                                    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                            }`}
                            onDragOver={(e) => {
                                e.preventDefault()
                                setIsDraggingOver(true)
                            }}
                            onDragLeave={() => setIsDraggingOver(false)}
                            onDrop={(e) => {
                                e.preventDefault()
                                setIsDraggingOver(false)
                                const file = e.dataTransfer.files[0]
                                const allowedTypes = ["application/pdf", "image/jpeg", "image/png"]
                                if (file && allowedTypes.includes(file.type)) {
                                    setPdfFile(file)
                                }
                            }}
                            onClick={() => {
                                const input = document.createElement("input")
                                input.type = "file"
                                input.accept = ".pdf,.jpg,.jpeg,.png"
                                input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0]
                                    if (file) setPdfFile(file)
                                }
                                input.click()
                            }}
                        >
                            {pdfFile ? (
                                <div className="space-y-1">
                                    <FileUp className="h-8 w-8 mx-auto text-green-500" />
                                    <p className="font-medium text-sm">{pdfFile.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {(pdfFile.size / 1024).toFixed(1)} KB — Click to change
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <FileUp className="h-8 w-8 mx-auto text-muted-foreground" />
                                    <p className="text-sm font-medium">Drop a PDF or image here or click to browse</p>
                                    <p className="text-xs text-muted-foreground">PDF, JPG, PNG accepted</p>
                                </div>
                            )}
                        </div>

                        {/* Scanned PDF Switch */}
                        <div className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                                <Label htmlFor="scanned-pdf-toggle" className="text-sm font-medium cursor-pointer">
                                    Scanned Form
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Enable if the form is a scanned document or image (requires a Vision Model)
                                </p>
                            </div>
                            <Switch
                                id="scanned-pdf-toggle"
                                checked={isScannedPdf}
                                onCheckedChange={setIsScannedPdf}
                                disabled={isConverting}
                            />
                        </div>

                        {/* VLM Dropdown (shown only when Scanned PDF is on) */}
                        {isScannedPdf && (
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Vision Model (VLM) *</Label>
                                <Select value={selectedVlm} onValueChange={setSelectedVlm}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a Vision Model..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {vlmModels.length > 0 ? (
                                            vlmModels.map((model) => (
                                                <SelectItem key={model.id} value={model.id}>
                                                    {model.name}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="__none" disabled>
                                                No vision models configured
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    The VLM will analyse the document/image to recognise form fields.
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setShowPdfDialog(false)}
                            disabled={isConverting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConvertPdf}
                            disabled={isConverting || !pdfFile || (isScannedPdf && !selectedVlm)}
                        >
                            {isConverting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Converting...
                                </>
                            ) : (
                                <>
                                    <FileUp className="h-4 w-4 mr-2" />
                                    Convert
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

const FORM_BUILDER_STEPS: TrainerStep[] = [
    {
        targetId: "form-title-input",
        title: "Name Your Form",
        content: <p>Give your form a descriptive title. This will be shown to users.</p>,
        position: "bottom"
    },
    {
        targetId: "widget-palette",
        title: "Palette",
        content: <p>Drag and drop widgets from here onto the canvas to build your form.</p>,
        position: "right"
    },
    {
        targetId: "grid-controls",
        title: "Grid Layout",
        content: <p>Use these controls to add/remove rows and columns, or merge cells for complex layouts.</p>,
        position: "bottom"
    },
    {
        targetId: "form-canvas",
        title: "Canvas",
        content: <p>This is where you design your form. Drop widgets here and click them to edit properties.</p>,
        position: "left"
    },
    {
        targetId: "preview-btn",
        title: "Preview",
        content: <p>See how your form will look to the end user.</p>,
        position: "bottom"
    },
    {
        targetId: "save-form-btn",
        title: "Save",
        content: <p>Once you are happy with your design, save the form to make it available to agents.</p>,
        position: "bottom"
    }
]
