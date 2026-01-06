"use client";

import * as React from "react";
import {
    Type,
    Link,
    FileText,
    Image,
    FolderOpen,
    MessageSquare,
    Import,
    Presentation,
    Layout,
    Palette,
    Server
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "./canvas-store";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";


// =============================================================================
// Types
// =============================================================================

export type ToolType =
    | "text"
    | "url"
    | "document"
    | "image"
    | "slideshow"
    | "domain"
    | "conversation"
    | "import_conversation"
    | "mcp_tool";

export interface CanvasTool {
    id: ToolType;
    name: string;
    icon: React.ReactNode;
    description: string;
}

// =============================================================================
// Constants
// =============================================================================

export const CANVAS_TOOLS: CanvasTool[] = [
    {
        id: "conversation",
        name: "New Conversation",
        icon: <MessageSquare className="h-4 w-4" />,
        description: "Start a new chat thread"
    },
    {
        id: "import_conversation",
        name: "Import Conversation",
        icon: <Import className="h-4 w-4" />,
        description: "Add existing chat"
    },
    {
        id: "text",
        name: "Text Note",
        icon: <Type className="h-4 w-4" />,
        description: "Add a sticky note"
    },
    {
        id: "url",
        name: "URL / Bookmark",
        icon: <Link className="h-4 w-4" />,
        description: "Save a web link"
    },
    {
        id: "document",
        name: "Document",
        icon: <FileText className="h-4 w-4" />,
        description: "Upload PDF, TXT, MD..."
    },
    {
        id: "image",
        name: "Image",
        icon: <Image className="h-4 w-4" />,
        description: "Upload an image"
    },
    {
        id: "slideshow",
        name: "Image Slides",
        icon: <Presentation className="h-4 w-4" />,
        description: "Import folder of images"
    },
    {
        id: "domain",
        name: "New Domain",
        icon: <FolderOpen className="h-4 w-4" />,
        description: "Group items together"
    },
    {
        id: "mcp_tool",
        name: "MCP Tool",
        icon: <Server className="h-4 w-4" />,
        description: "Connect to external tools"
    },

];

const PRESET_COLORS = [
    "#f8fafc", "#fca5a5", "#fdba74", "#fcd34d", "#bef264",
    "#86efac", "#67e8f9", "#93c5fd", "#c4b5fd", "#f0abfc",
    "#fda4af", "#cbd5e1"
];

const DEFAULT_TOOL_COLORS: Record<string, string> = {
    // Basic text/doc - Slate/White
    text: "#f8fafc",
    document: "#f8fafc",

    // Conversation - Blue
    conversation: "#eff6ff",
    message: "#eff6ff",
    import_conversation: "#eff6ff",

    // Media - Pink/Rose/Purple
    image: "#fff1f2",
    slideshow: "#fff1f2",
    video: "#faf5ff",

    // Data - Emerald/Teal/Cyan
    database: "#ecfdf5",
    table: "#f0f9ff",
    agent_result: "#f5f3ff",

    // Links - Blue/Sky
    url: "#f0f9ff",

    // Domain - Indigo
    domain: "#e0e7ff",

    // MCP - Orange/Amber
    mcp_tool: "#ffedd5"
};


// =============================================================================
// Component
// =============================================================================

export function CanvasPalette() {

    // State to track custom colors for tools
    const [toolColors, setToolColors] = React.useState<Record<string, string>>(DEFAULT_TOOL_COLORS);
    // Track open state for each tool's color picker
    const [openPopovers, setOpenPopovers] = React.useState<Record<string, boolean>>({});

    const handlePopoverOpenChange = (toolId: string, isOpen: boolean) => {
        setOpenPopovers(prev => ({ ...prev, [toolId]: isOpen }));
    };

    // Sync with store settings for persistence
    const { canvasSettings, updateCanvasSettings } = useCanvasStore();

    React.useEffect(() => {
        if (canvasSettings?.tool_colors) {
            setToolColors(prev => ({
                ...prev,
                ...canvasSettings.tool_colors
            }));
        }
    }, [canvasSettings]);

    const handleDragStart = (e: React.DragEvent, tool: CanvasTool) => {
        // Set drag data
        e.dataTransfer.setData("application/semantic-canvas-tool", tool.id);

        // Pass the currently selected color for this tool
        const toolColor = toolColors[tool.id];
        if (toolColor) {
            e.dataTransfer.setData("application/semantic-canvas-color", toolColor);
        }

        e.dataTransfer.effectAllowed = "copy";
    };

    const handleColorSelect = (toolId: string, color: string) => {
        const newColors = {
            ...toolColors,
            [toolId]: color
        };
        setToolColors(newColors);

        // Close popover
        handlePopoverOpenChange(toolId, false);

        // Persist to backend and update store
        const currentSettings = canvasSettings || {};
        updateCanvasSettings({
            ...currentSettings,
            tool_colors: newColors
        });
    };

    const handleDragStartWithColor = (e: React.DragEvent, tool: CanvasTool) => {
        console.log("[CanvasPalette] Drag Start (With Color):", tool.id);
        // Set drag data
        e.dataTransfer.setData("application/semantic-canvas-tool", tool.id);

        // Pass selected color
        const color = toolColors[tool.id] || DEFAULT_TOOL_COLORS[tool.id];
        if (color) {
            e.dataTransfer.setData("application/semantic-canvas-color", color);
        }

        e.dataTransfer.effectAllowed = "copy";
    };


    return (
        <div className="w-64 border-l bg-slate-50/50 dark:bg-slate-900/50 flex flex-col h-full">
            <div className="p-4 border-b shrink-0">
                <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Layout className="h-4 w-4" />
                    Canvas Tools
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="text-xs text-muted-foreground mb-4">
                    Drag items onto the canvas to create them.
                </div>

                {CANVAS_TOOLS.map((tool) => (
                    <div
                        key={tool.id}
                        draggable
                        onDragStart={(e) => handleDragStartWithColor(e, tool)}
                        className={cn(
                            "group flex items-center gap-3 p-3 rounded-lg border bg-white dark:bg-slate-800",
                            "hover:border-blue-400 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing",
                            "dark:border-slate-700 dark:hover:border-blue-500",
                            "relative"
                        )}
                        style={{ borderLeftColor: toolColors[tool.id], borderLeftWidth: "4px" }}
                    >
                        <div className="p-2 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {tool.icon}
                        </div>
                        <div className="flex flex-col flex-1">
                            <span className="text-sm font-medium">{tool.name}</span>
                            <span className="text-[10px] text-muted-foreground">{tool.description}</span>
                        </div>

                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Popover
                                open={openPopovers[tool.id] || false}
                                onOpenChange={(isOpen) => handlePopoverOpenChange(tool.id, isOpen)}
                            >
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full p-0 hover:bg-slate-100 dark:hover:bg-slate-700">
                                        <div className="relative">
                                            <Palette className="h-4 w-4 text-muted-foreground absolute -top-1 -right-1 opacity-50" />
                                            <div
                                                className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                                                style={{ backgroundColor: toolColors[tool.id] || "#fff" }}
                                            />
                                        </div>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-48 p-2">
                                    <div className="grid grid-cols-4 gap-2">
                                        {PRESET_COLORS.map(color => (
                                            <button
                                                key={color}
                                                className={cn(
                                                    "w-8 h-8 rounded-full border hover:scale-110 transition-transform",
                                                    toolColors[tool.id] === color && "ring-2 ring-offset-1 ring-blue-500"
                                                )}
                                                style={{ backgroundColor: color }}
                                                onClick={() => handleColorSelect(tool.id, color)}
                                            />
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                ))}
            </div>
        </div>
    );
}
