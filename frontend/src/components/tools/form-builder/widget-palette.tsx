"use client"

/**
 * Widget Palette Component
 * 
 * Sidebar containing draggable widget types for the GUI Form Builder.
 * Widgets are organized by category: Input, Selection, Display.
 */
import {
    Type,
    AlignLeft,
    Hash,
    Mail,
    Lock,
    ChevronDown,
    CheckSquare,
    Circle,
    ToggleLeft,
    Heading,
    Minus,
    FileText,
    GripVertical,
    Calendar,
    Clock,
    FileUp,
    Image as ImageIcon
} from "lucide-react"
import { cn } from "@/lib/utils"

// Widget type definitions
export interface WidgetType {
    id: string
    name: string
    icon: React.ReactNode
    category: "input" | "selection" | "display"
    defaultConfig: Partial<WidgetConfig>
}

export interface WidgetConfig {
    id: string
    type: string
    label: string
    placeholder?: string
    required: boolean
    validation?: {
        min_length?: number
        max_length?: number
        min_value?: number
        max_value?: number
        pattern?: string
    }
    options?: Array<{ label: string; value: string }>
    default?: string
    url?: string
    alt_text?: string
    layout?: {
        row: number
        col: number
        rowSpan: number
        colSpan: number
    }
}

// Available widget types
export const WIDGET_TYPES: WidgetType[] = [
    // Input widgets
    {
        id: "text_input",
        name: "Text Input",
        icon: <Type className="h-4 w-4" />,
        category: "input",
        defaultConfig: {
            type: "text_input",
            label: "Text Field",
            placeholder: "Enter text...",
            required: false
        }
    },
    {
        id: "text_area",
        name: "Text Area",
        icon: <AlignLeft className="h-4 w-4" />,
        category: "input",
        defaultConfig: {
            type: "text_area",
            label: "Text Area",
            placeholder: "Enter longer text...",
            required: false
        }
    },
    {
        id: "number",
        name: "Number",
        icon: <Hash className="h-4 w-4" />,
        category: "input",
        defaultConfig: {
            type: "number",
            label: "Number",
            placeholder: "Enter a number...",
            required: false
        }
    },
    {
        id: "email",
        name: "Email",
        icon: <Mail className="h-4 w-4" />,
        category: "input",
        defaultConfig: {
            type: "email",
            label: "Email Address",
            placeholder: "name@example.com",
            required: false,
            validation: { pattern: "^[^@]+@[^@]+\\.[^@]+$" }
        }
    },
    {
        id: "password",
        name: "Password",
        icon: <Lock className="h-4 w-4" />,
        category: "input",
        defaultConfig: {
            type: "password",
            label: "Password",
            placeholder: "Enter password...",
            required: false
        }
    },
    {
        id: "date_picker",
        name: "Date Picker",
        icon: <Calendar className="h-4 w-4" />,
        category: "input",
        defaultConfig: {
            type: "date_picker",
            label: "Select Date",
            required: false
        }
    },
    {
        id: "time_picker",
        name: "Time Picker",
        icon: <Clock className="h-4 w-4" />,
        category: "input",
        defaultConfig: {
            type: "time_picker",
            label: "Select Time",
            required: false
        }
    },
    {
        id: "file_picker",
        name: "File Picker",
        icon: <FileUp className="h-4 w-4" />,
        category: "input",
        defaultConfig: {
            type: "file_picker",
            label: "Select File",
            required: false
        }
    },
    // Selection widgets
    {
        id: "dropdown",
        name: "Dropdown",
        icon: <ChevronDown className="h-4 w-4" />,
        category: "selection",
        defaultConfig: {
            type: "dropdown",
            label: "Select Option",
            required: false,
            options: [
                { label: "Option 1", value: "option1" },
                { label: "Option 2", value: "option2" }
            ]
        }
    },
    {
        id: "checkbox_group",
        name: "Checkbox Group",
        icon: <CheckSquare className="h-4 w-4" />,
        category: "selection",
        defaultConfig: {
            type: "checkbox_group",
            label: "Select Multiple",
            required: false,
            options: [
                { label: "Choice A", value: "a" },
                { label: "Choice B", value: "b" }
            ]
        }
    },
    {
        id: "radio_group",
        name: "Radio Group",
        icon: <Circle className="h-4 w-4" />,
        category: "selection",
        defaultConfig: {
            type: "radio_group",
            label: "Choose One",
            required: false,
            options: [
                { label: "Option A", value: "a" },
                { label: "Option B", value: "b" }
            ]
        }
    },
    {
        id: "toggle",
        name: "Toggle Switch",
        icon: <ToggleLeft className="h-4 w-4" />,
        category: "selection",
        defaultConfig: {
            type: "toggle",
            label: "Enable Feature",
            required: false,
            default: "false"
        }
    },
    // Display widgets
    {
        id: "section_header",
        name: "Section Header",
        icon: <Heading className="h-4 w-4" />,
        category: "display",
        defaultConfig: {
            type: "section_header",
            label: "Section Title",
            required: false
        }
    },
    {
        id: "divider",
        name: "Divider",
        icon: <Minus className="h-4 w-4" />,
        category: "display",
        defaultConfig: {
            type: "divider",
            label: "",
            required: false
        }
    },
    {
        id: "instructional_text",
        name: "Instructions",
        icon: <FileText className="h-4 w-4" />,
        category: "display",
        defaultConfig: {
            type: "instructional_text",
            label: "Enter helpful instructions here...",
            required: false
        }
    },
    {
        id: "picture",
        name: "Picture",
        icon: <ImageIcon className="h-4 w-4" />,
        category: "display",
        defaultConfig: {
            type: "picture",
            label: "Image",
            url: "https://placehold.co/600x400",
            alt_text: "Placeholder Image",
            required: false
        }
    }
]

interface WidgetPaletteProps {
    onDragStart: (widgetType: WidgetType) => void
}

export function WidgetPalette({ onDragStart }: WidgetPaletteProps) {
    const inputWidgets = WIDGET_TYPES.filter(w => w.category === "input")
    const selectionWidgets = WIDGET_TYPES.filter(w => w.category === "selection")
    const displayWidgets = WIDGET_TYPES.filter(w => w.category === "display")

    const renderWidgetItem = (widget: WidgetType) => (
        <div
            key={widget.id}
            draggable
            onDragStart={() => onDragStart(widget)}
            className={cn(
                "flex items-center gap-2 p-2 rounded-md cursor-grab",
                "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
                "hover:border-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20",
                "transition-colors select-none"
            )}
        >
            <GripVertical className="h-4 w-4 text-slate-400" />
            <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-700">
                {widget.icon}
            </div>
            <span className="text-sm font-medium">{widget.name}</span>
        </div>
    )

    return (
        <div className="w-64 border-r bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-6 overflow-y-auto h-full">
            <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Input Fields
                </h3>
                <div className="space-y-2">
                    {inputWidgets.map(renderWidgetItem)}
                </div>
            </div>

            <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Selection
                </h3>
                <div className="space-y-2">
                    {selectionWidgets.map(renderWidgetItem)}
                </div>
            </div>

            <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Display
                </h3>
                <div className="space-y-2">
                    {displayWidgets.map(renderWidgetItem)}
                </div>
            </div>
        </div>
    )
}
