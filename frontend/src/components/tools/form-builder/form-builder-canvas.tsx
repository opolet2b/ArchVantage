"use client"

/**
 * Form Builder Canvas Component
 * 
 * Main canvas area where users drop widgets to build forms.
 * Supports drag-drop, reordering, selection, and deletion.
 */
import { useState } from "react"
import { cn } from "@/lib/utils"
import { WidgetConfig, WidgetType, WIDGET_TYPES } from "./widget-palette"
import { Button } from "@/components/ui/button"
import { Trash2, GripVertical, Settings } from "lucide-react"

interface FormBuilderCanvasProps {
    widgets: WidgetConfig[]
    selectedWidgetId: string | null
    onWidgetsChange: (widgets: WidgetConfig[]) => void
    onSelectWidget: (widgetId: string | null) => void
    onWidgetDrop: (widgetType: WidgetType) => void
}

export function FormBuilderCanvas({
    widgets,
    selectedWidgetId,
    onWidgetsChange,
    onSelectWidget,
    onWidgetDrop
}: FormBuilderCanvasProps) {
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
    const [draggingId, setDraggingId] = useState<string | null>(null)

    // Handle drop from palette
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOverIndex(null)
        // The parent component handles adding the widget via onWidgetDrop
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    // Handle reordering via drag
    const handleWidgetDragStart = (widgetId: string) => {
        setDraggingId(widgetId)
    }

    const handleWidgetDragEnd = () => {
        setDraggingId(null)
        setDragOverIndex(null)
    }

    const handleWidgetDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (draggingId) {
            setDragOverIndex(index)
        }
    }

    const handleWidgetDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault()
        if (draggingId) {
            const dragIndex = widgets.findIndex(w => w.id === draggingId)
            if (dragIndex !== -1 && dragIndex !== dropIndex) {
                const newWidgets = [...widgets]
                const [removed] = newWidgets.splice(dragIndex, 1)
                newWidgets.splice(dropIndex, 0, removed)
                onWidgetsChange(newWidgets)
            }
        }
        setDraggingId(null)
        setDragOverIndex(null)
    }

    // Delete widget
    const handleDeleteWidget = (widgetId: string) => {
        const newWidgets = widgets.filter(w => w.id !== widgetId)
        onWidgetsChange(newWidgets)
        if (selectedWidgetId === widgetId) {
            onSelectWidget(null)
        }
    }

    // Get widget icon by type
    const getWidgetIcon = (type: string) => {
        const widgetType = WIDGET_TYPES.find(w => w.id === type)
        return widgetType?.icon || null
    }

    // Render widget preview based on type
    const renderWidgetPreview = (widget: WidgetConfig) => {
        switch (widget.type) {
            case "text_input":
            case "email":
            case "password":
            case "number":
                return (
                    <div className="mt-2">
                        <input
                            type="text"
                            placeholder={widget.placeholder}
                            disabled
                            className="w-full px-3 py-2 border rounded-md text-sm bg-slate-50 dark:bg-slate-800"
                        />
                    </div>
                )
            case "text_area":
                return (
                    <div className="mt-2">
                        <textarea
                            placeholder={widget.placeholder}
                            disabled
                            rows={3}
                            className="w-full px-3 py-2 border rounded-md text-sm bg-slate-50 dark:bg-slate-800 resize-none"
                        />
                    </div>
                )
            case "dropdown":
                return (
                    <div className="mt-2">
                        <select disabled className="w-full px-3 py-2 border rounded-md text-sm bg-slate-50 dark:bg-slate-800">
                            <option>Select an option...</option>
                            {widget.options?.map((opt, i) => (
                                <option key={i} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                )
            case "checkbox_group":
                return (
                    <div className="mt-2 space-y-1">
                        {widget.options?.map((opt, i) => (
                            <label key={i} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" disabled className="rounded" />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                )
            case "radio_group":
                return (
                    <div className="mt-2 space-y-1">
                        {widget.options?.map((opt, i) => (
                            <label key={i} className="flex items-center gap-2 text-sm">
                                <input type="radio" disabled name={widget.id} />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                )
            case "toggle":
                return (
                    <div className="mt-2 flex items-center gap-2">
                        <div className="w-10 h-6 bg-slate-300 dark:bg-slate-600 rounded-full relative">
                            <div className="w-4 h-4 bg-white rounded-full absolute top-1 left-1" />
                        </div>
                        <span className="text-sm text-muted-foreground">Off</span>
                    </div>
                )
            case "section_header":
                return (
                    <div className="mt-1 text-lg font-semibold border-b pb-1">
                        {widget.label}
                    </div>
                )
            case "divider":
                return <hr className="my-2 border-slate-300 dark:border-slate-600" />
            case "instructional_text":
                return (
                    <p className="text-sm text-muted-foreground mt-1 italic">
                        {widget.label}
                    </p>
                )
            default:
                return null
        }
    }

    return (
        <div
            className="flex-1 p-6 pb-32 overflow-y-auto bg-slate-100/50 dark:bg-slate-800/30"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            <div className="max-w-2xl mx-auto">
                {widgets.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-12 text-center">
                        <p className="text-muted-foreground">
                            Drag widgets from the palette to build your form
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {widgets.map((widget, index) => (
                            <div
                                key={widget.id}
                                draggable
                                onDragStart={() => handleWidgetDragStart(widget.id)}
                                onDragEnd={handleWidgetDragEnd}
                                onDragOver={(e) => handleWidgetDragOver(e, index)}
                                onDrop={(e) => handleWidgetDrop(e, index)}
                                onClick={() => onSelectWidget(widget.id)}
                                className={cn(
                                    "relative p-4 rounded-lg border-2 bg-white dark:bg-slate-900 cursor-pointer transition-all",
                                    selectedWidgetId === widget.id
                                        ? "border-pink-500 shadow-md"
                                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300",
                                    draggingId === widget.id && "opacity-50",
                                    dragOverIndex === index && draggingId !== widget.id && "border-pink-300"
                                )}
                            >
                                {/* Widget header */}
                                <div className="flex items-center gap-2">
                                    <GripVertical className="h-4 w-4 text-slate-400 cursor-grab" />
                                    <div className="p-1 rounded bg-slate-100 dark:bg-slate-700">
                                        {getWidgetIcon(widget.type)}
                                    </div>
                                    <span className="font-medium text-sm flex-1">
                                        {widget.type !== "section_header" &&
                                            widget.type !== "divider" &&
                                            widget.type !== "instructional_text"
                                            ? widget.label
                                            : widget.type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                                    </span>
                                    {widget.required && (
                                        <span className="text-xs text-red-500">*Required</span>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteWidget(widget.id)
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>

                                {/* Widget preview */}
                                {renderWidgetPreview(widget)}

                                {/* Field ID indicator */}
                                <div className="mt-2 text-xs text-muted-foreground font-mono">
                                    ID: {widget.id}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
