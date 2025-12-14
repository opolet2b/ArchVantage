"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { WidgetConfig, WidgetType, WIDGET_TYPES } from "./widget-palette"
import { GripVertical, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface GridCanvasProps {
    rows: number
    cols: number
    widgets: WidgetConfig[]
    selectedWidgetId: string | null
    selectedCell: { r: number, c: number } | null
    onSelectWidget: (widgetId: string | null) => void
    onSelectCell: (cell: { r: number, c: number } | null) => void
    onWidgetDrop: (widgetType: WidgetType, cell: { r: number, c: number }) => void
    onDeleteWidget: (widgetId: string) => void
    onWidgetDragStart: (widgetId: string) => void
}

export function GridCanvas({
    rows,
    cols,
    widgets,
    selectedWidgetId,
    selectedCell,
    onSelectWidget,
    onSelectCell,
    onWidgetDrop,
    onDeleteWidget,
    onWidgetDragStart
}: GridCanvasProps) {
    const [dragOverCell, setDragOverCell] = useState<{ r: number, c: number } | null>(null)

    // Helper to find widget covering a cell
    const getWidgetAt = (r: number, c: number) => {
        return widgets.find(w => {
            const layout = w.layout || { row: 0, col: 0, rowSpan: 1, colSpan: 1 }
            return (
                r >= layout.row &&
                r < layout.row + layout.rowSpan &&
                c >= layout.col &&
                c < layout.col + layout.colSpan
            )
        })
    }

    // Check if cell is the top-left origin of a widget
    const isWidgetOrigin = (w: WidgetConfig, r: number, c: number) => {
        const layout = w.layout || { row: 0, col: 0, rowSpan: 1, colSpan: 1 }
        return layout.row === r && layout.col === c
    }

    const handleDrop = (e: React.DragEvent, r: number, c: number) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOverCell(null)

        // Find if we are dragging a palette item (string format usually)
        // Ideally we pass the object differently, or rely on parent state 'draggedWidget'
        // For now, parent `FormBuilder` knows what's being dragged.
        // We just signal a drop occurred at (r, c).
        // BUT `onWidgetDrop` expects `WidgetType`. We'll assume the parent handles the dragged object lookup if passed null or we need to pass it down.
        // Actually `FormBuilder` has `draggedWidget` state.
        // We'll trust `FormBuilder` to pass the correct `handleWidgetDrop` wrapper.
        // Wait, props definition: `onWidgetDrop: (widgetType: WidgetType...`
        // We can't access `draggedWidget` here.
        // We should just call a simplified `onDrop(r, c)` and let parent handle logic?
        // Let's stick to the prop signature but we might need to modify usage in index.tsx to wrap it.
    }

    // Helper to get widget icon
    const getWidgetIcon = (type: string) => {
        const widgetType = WIDGET_TYPES.find(w => w.id === type)
        return widgetType?.icon || null
    }

    return (
        <div
            className="flex-1 p-8 overflow-auto bg-slate-100/50 dark:bg-slate-800/30 pb-32"
            onClick={() => {
                onSelectCell(null)
                onSelectWidget(null)
            }}
        >
            <div
                className="grid gap-2 mx-auto max-w-4xl relative"
                style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(100px, auto))`
                }}
            >
                {Array.from({ length: rows }).map((_, r) => (
                    Array.from({ length: cols }).map((_, c) => {
                        const widget = getWidgetAt(r, c)
                        const isOrigin = widget ? isWidgetOrigin(widget, r, c) : false

                        // If cell is covered by a widget but not the origin, don't render it (it's spanned)
                        if (widget && !isOrigin) return null

                        return (
                            <div
                                key={`${r}-${c}`}
                                className={cn(
                                    "relative border rounded-lg transition-all min-h-[100px] flex flex-col justify-center",
                                    // Visual states
                                    !widget && "border-dashed border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 hover:bg-slate-100",
                                    widget && "bg-white dark:bg-slate-900 border-solid border-slate-200 dark:border-slate-700 shadow-sm",
                                    // Selection
                                    selectedCell?.r === r && selectedCell?.c === c && !widget && "ring-2 ring-blue-500 bg-blue-50/50",
                                    selectedWidgetId === widget?.id && "ring-2 ring-pink-500 border-pink-500",
                                    // Drag over
                                    dragOverCell?.r === r && dragOverCell?.c === c && "bg-blue-100 border-blue-400",

                                    // Spanning
                                    widget && `col-span-${widget.layout?.colSpan || 1} row-span-${widget.layout?.rowSpan || 1}`
                                )}
                                style={widget ? {
                                    gridColumn: `span ${widget.layout?.colSpan || 1}`,
                                    gridRow: `span ${widget.layout?.rowSpan || 1}`
                                } : undefined}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (widget) {
                                        onSelectWidget(widget.id)
                                        // Also select the cell for context ops?
                                        onSelectCell({ r, c })
                                    } else {
                                        onSelectCell({ r, c })
                                        onSelectWidget(null)
                                    }
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault()
                                    setDragOverCell({ r, c })
                                }}
                                onDragLeave={() => setDragOverCell(null)}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    setDragOverCell(null)
                                    // Pass null for WidgetType as handleCellDrop in parent doesn't use it (uses state)
                                    // We cast to any to bypass strict type check for now or modify interface
                                    onWidgetDrop(null as any, { r, c })
                                }}
                            >
                                {widget ? (
                                    <div
                                        className="p-4 h-full flex flex-col cursor-move"
                                        draggable
                                        onDragStart={(e) => {
                                            e.stopPropagation()
                                            // Set data transfer for visual effect
                                            e.dataTransfer.effectAllowed = "move"
                                            // Notify parent
                                            onWidgetDragStart(widget.id)
                                        }}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1 rounded bg-slate-100 dark:bg-slate-800">
                                                {getWidgetIcon(widget.type)}
                                            </div>
                                            <span className="font-medium text-sm truncate flex-1">
                                                {widget.label}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 -mr-2"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onDeleteWidget(widget.id)
                                                }}
                                            >
                                                <Trash2 className="h-3 w-3 text-red-500" />
                                            </Button>
                                        </div>
                                        <div className="text-xs text-muted-foreground line-clamp-2">
                                            {widget.placeholder || "No placeholder"}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center text-slate-300 dark:text-slate-700">
                                        <span className="text-xs">{r},{c}</span>
                                    </div>
                                )}
                            </div>
                        )
                    })
                ))}
            </div>
        </div>
    )
}
