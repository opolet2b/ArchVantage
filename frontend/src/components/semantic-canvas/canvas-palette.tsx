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
    Server,
    ChevronLeft,
    ChevronRight
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
    | "mcp_tool"
    | "archimate_tool";

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
    {
        id: "archimate_tool",
        name: "ArchiMate Tool",
        icon: <Import className="h-4 w-4" />,
        description: "Import ArchiMate XML"
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
    const sidebarCollapsed = useCanvasStore(state => state.sidebarCollapsed);
    const toggleSidebarCollapse = useCanvasStore(state => state.toggleSidebarCollapse);
    const isCollapsed = sidebarCollapsed; // Maintain local variable name to minimize further edits
    const setIsCollapsed = toggleSidebarCollapse; // Maintain local variable name to minimize further edits
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
        <div
            id="canvas-palette"
            className={cn(
                "border-l bg-sidebar flex flex-col h-full transition-all duration-300 ease-in-out relative",
                isCollapsed ? "w-12" : "w-64"
            )}
        >
            {/* Collapse Toggle Button */}
            <Button
                variant="ghost"
                size="icon"
                className="absolute -left-3 top-2 h-6 w-6 rounded-full border bg-white shadow-sm z-50 hover:bg-slate-50 text-slate-500"
                onClick={() => setIsCollapsed()}
            >
                {isCollapsed ? (
                    <ChevronLeft className="h-4 w-4" />
                ) : (
                    <ChevronRight className="h-4 w-4" />
                )}
            </Button>

            <div className="p-4 border-b shrink-0">
                {!isCollapsed && (
                    <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Layout className="h-4 w-4" />
                        Canvas Tools
                    </h2>
                )}
                {isCollapsed && (
                    <div className="flex justify-center">
                        <Layout className="h-4 w-4 text-muted-foreground" />
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!isCollapsed && (
                    <div className="text-xs text-muted-foreground mb-4">
                        Drag items onto the canvas to create them.
                    </div>
                )}

                {CANVAS_TOOLS.map((tool) => (
                    <div
                        key={tool.id}
                        draggable
                        onDragStart={(e) => handleDragStartWithColor(e, tool)}
                        className={cn(
                            "group flex items-center gap-3 p-3 rounded-lg border bg-card",
                            "hover:border-primary hover:shadow-sm transition-all cursor-grab active:cursor-grabbing",
                            "border-border",
                            "relative",
                            isCollapsed && "justify-center p-2"
                        )}
                        style={{ borderLeftColor: toolColors[tool.id], borderLeftWidth: !isCollapsed ? "4px" : "0px" }}
                    >
                        <div className={cn("p-2 rounded-md bg-muted text-muted-foreground", isCollapsed && "p-1.5")}>
                            {tool.icon}
                        </div>
                        {!isCollapsed && (
                            <div className="flex flex-col flex-1">
                                <span className="text-sm font-medium">{tool.name}</span>
                                <span className="text-[10px] text-muted-foreground">{tool.description}</span>
                            </div>
                        )}

                        {!isCollapsed && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Popover
                                    open={openPopovers[tool.id] || false}
                                    onOpenChange={(isOpen) => handlePopoverOpenChange(tool.id, isOpen)}
                                >
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full p-0 hover:bg-muted">
                                            <div className="relative">
                                                <Palette className="h-4 w-4 text-muted-foreground absolute -top-1 -right-1 opacity-50" />
                                                <div
                                                    className="w-5 h-5 rounded-full border-2 border-background shadow-sm ring-1 ring-border"
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
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
