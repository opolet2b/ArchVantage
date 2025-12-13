"use client"

/**
 * Form Builder Component
 * 
 * Main component that combines Widget Palette, Canvas, and Properties Panel
 * for building GUI form tools.
 */
import { useState, useCallback } from "react"
import { WidgetPalette, WidgetType, WidgetConfig } from "./widget-palette"
import { FormBuilderCanvas } from "./form-builder-canvas"
import { WidgetPropertiesPanel } from "./widget-properties-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Save, Eye } from "lucide-react"

interface FormBuilderProps {
    initialConfig?: {
        title?: string
        submit_label?: string
        components?: WidgetConfig[]
    }
    onSave: (config: {
        tool_type: string
        version: string
        title: string
        submit_label: string
        components: WidgetConfig[]
    }) => void
}

export function FormBuilder({ initialConfig, onSave }: FormBuilderProps) {
    const [formTitle, setFormTitle] = useState(initialConfig?.title || "New Form")
    const [submitLabel, setSubmitLabel] = useState(initialConfig?.submit_label || "Submit")
    const [widgets, setWidgets] = useState<WidgetConfig[]>(initialConfig?.components || [])
    const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
    const [draggedWidget, setDraggedWidget] = useState<WidgetType | null>(null)

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
    }, [selectedWidgetId])

    // Get selected widget
    const selectedWidget = widgets.find(w => w.id === selectedWidgetId) || null

    // Handle save
    const handleSave = () => {
        onSave({
            tool_type: "gui",
            version: "1.0",
            title: formTitle,
            submit_label: submitLabel,
            components: widgets
        })
    }

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
                            onChange={(e) => setFormTitle(e.target.value)}
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
                            onChange={(e) => setSubmitLabel(e.target.value)}
                            className="h-8 w-36"
                        />
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                    </Button>
                    <Button size="sm" onClick={handleSave}>
                        <Save className="h-4 w-4 mr-2" />
                        Save Form
                    </Button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                <WidgetPalette onDragStart={handlePaletteDragStart} />

                <div
                    className="flex-1 flex"
                    onDrop={handleCanvasDrop}
                    onDragOver={(e) => e.preventDefault()}
                >
                    <FormBuilderCanvas
                        widgets={widgets}
                        selectedWidgetId={selectedWidgetId}
                        onWidgetsChange={setWidgets}
                        onSelectWidget={setSelectedWidgetId}
                        onWidgetDrop={handleWidgetDrop}
                    />
                </div>

                <WidgetPropertiesPanel
                    widget={selectedWidget}
                    onWidgetChange={handleWidgetChange}
                />
            </div>
        </div>
    )
}

// Export all components
export { WidgetPalette, type WidgetType, type WidgetConfig } from "./widget-palette"
export { FormBuilderCanvas } from "./form-builder-canvas"
export { WidgetPropertiesPanel } from "./widget-properties-panel"
