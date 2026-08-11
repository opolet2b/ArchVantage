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
    Bot,
    Wand2,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ChevronDown,
    GitBranch,
    Settings,
    Pin,
    PinOff,
    Mic,
    FormInput,
    TableProperties,
    Database
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/features";
import { useCanvasStore } from "./canvas-store";
import { useLayoutStore } from "@/lib/layout-store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
    | "agent_tool"
    | "archimate_tool"
    | "ocr_conversion"
    | "sticky"
    | "workflow"
    | "vocal_note"
    | "form_tool"
    | "spreadsheet"
    | "kb_document";

export interface CanvasTool {
    id: ToolType;
    name: string;
    icon: React.ReactNode;
    description: string;
}

// =============================================================================
// Constants
const ALL_CANVAS_TOOLS: CanvasTool[] = [
    {
        id: "conversation",
        name: "New Conversation",
        icon: <MessageSquare className="h-4 w-4" />,
        description: "Start a new chat thread"
    },
    {
        id: "kb_document",
        name: "KB Document",
        icon: <Database className="h-4 w-4" />,
        description: "Drop a document from a Knowledge Base"
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
        description: "Add a structured text"
    },
    {
        id: "sticky",
        name: "Sticky Note",
        icon: <Palette className="h-4 w-4" />,
        description: "Add a quick note"
    },
    {
        id: "vocal_note",
        name: "Vocal Note",
        icon: <Mic className="h-4 w-4" />,
        description: "Record and transcribe voice"
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
    {
        id: "agent_tool",
        name: "Agent Blueprint",
        icon: <Bot className="h-4 w-4" />,
        description: "Connect & execute an Agent"
    },
    {
        id: "form_tool",
        name: "Forms",
        icon: <FormInput className="h-4 w-4" />,
        description: "Select and use a GUI Form tool"
    },
    {
        id: "spreadsheet",
        name: "Spreadsheet",
        icon: <TableProperties className="h-4 w-4" />,
        description: "Add a new editable spreadsheet"
    },
    {
        id: "ocr_conversion",
        name: "AI OCR Conversion",
        icon: <Wand2 className="h-4 w-4" />,
        description: "Convert scan/image to text"
    },
    {
        id: "workflow",
        name: "Workflow Instance",
        icon: <GitBranch className="h-4 w-4" />,
        description: "Instantiate an interactive automation process"
    },
];

export const CANVAS_TOOLS = ALL_CANVAS_TOOLS.filter(t => {
    switch (t.id) {
        case "workflow": return FEATURES.enableWorkflows;
        case "agent_tool":
        case "mcp_tool": return FEATURES.enableAgents;
        case "kb_document": return FEATURES.enableKnowledgeBase;
        case "document": return FEATURES.enableRAG;
        case "vocal_note": return FEATURES.enableSpeech;
        case "ocr_conversion": return FEATURES.enableOCR;
        case "slideshow": return FEATURES.enableSlideshow;
        case "archimate_tool": return FEATURES.enableArchimate;
        case "form_tool":
        case "spreadsheet": return FEATURES.enableFormsAndSheets;
        case "trade_off_matrix":
        case "architecture_memo": return FEATURES.enableArchitectureTools;
        default: return true;
    }
});

const PRESET_COLORS = [
    "#f8fafc", "#fca5a5", "#fdba74", "#fcd34d", "#bef264",
    "#86efac", "#67e8f9", "#93c5fd", "#c4b5fd", "#f0abfc",
    "#fda4af", "#cbd5e1"
];

const DEFAULT_TOOL_COLORS: Record<string, string> = {
    // Basic text/doc - Slate/White
    text: "#f8fafc",
    sticky: "#fef9c3", // Yellowish default for sticky
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
    mcp_tool: "#ffedd5",

    // Agent - Violet
    agent_tool: "#e0e7ff",
    archimate_tool: "#f1f5f9",
    ocr_conversion: "#fce7f3",
    form_tool: "#fdf4ff",
    spreadsheet: "#f0fdf4",

    // Workflow - Violet
    workflow: "#f5f3ff",
    
    // Vocal note - Rose/Pink
    vocal_note: "#ffe4e6",

    // KB Document - Orange/Yellow
    kb_document: "#fef3c7",
};


// =============================================================================
// Component
// =============================================================================

export function CanvasPalette() {
    const sidebarCollapsed = useCanvasStore(state => state.sidebarCollapsed);
    const toggleSidebarCollapse = useCanvasStore(state => state.toggleSidebarCollapse);
    const isCollapsed = sidebarCollapsed; // Maintain local variable name to minimize further edits
    const setIsCollapsed = toggleSidebarCollapse; // Maintain local variable name to minimize further edits

    const accessLevel = useCanvasStore(state => state.accessLevel);
    const isReadOnly = accessLevel === "read";
    
    const { rightPanelPinned, toggleRightPanelPin } = useLayoutStore();
    const [isHovered, setIsHovered] = React.useState(false);

    // State to track custom colors for tools
    const [toolColors, setToolColors] = React.useState<Record<string, string>>(DEFAULT_TOOL_COLORS);
    // Track open state for each tool's color picker
    const [openPopovers, setOpenPopovers] = React.useState<Record<string, boolean>>({});

    const handlePopoverOpenChange = (toolId: string, isOpen: boolean) => {
        if (isReadOnly) return;
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

    const visibleTools: string[] = canvasSettings?.visible_tools || CANVAS_TOOLS.map(t => t.id);

    const toggleToolVisibility = (toolId: string) => {
        if (isReadOnly) return;
        const currentTools = new Set(visibleTools);
        if (currentTools.has(toolId)) {
            currentTools.delete(toolId);
        } else {
            currentTools.add(toolId);
        }
        
        updateCanvasSettings({
            ...(canvasSettings || {}),
            visible_tools: Array.from(currentTools)
        });
    };

    const toolOrder: string[] = canvasSettings?.tool_order || CANVAS_TOOLS.map(t => t.id);

    const reorderTool = (toolId: string, direction: 'up' | 'down') => {
        if (isReadOnly) return;
        const currentOrder = [...toolOrder];
        
        // Ensure all tools are in the order array to avoid lost tools
        if (currentOrder.length < CANVAS_TOOLS.length) {
            CANVAS_TOOLS.forEach(t => {
                if (!currentOrder.includes(t.id)) currentOrder.push(t.id);
            });
        }
        
        const index = currentOrder.indexOf(toolId);
        if (index === -1) return;
        if (direction === 'up' && index > 0) {
            [currentOrder[index - 1], currentOrder[index]] = [currentOrder[index], currentOrder[index - 1]];
        } else if (direction === 'down' && index < currentOrder.length - 1) {
            [currentOrder[index + 1], currentOrder[index]] = [currentOrder[index], currentOrder[index + 1]];
        } else {
            return;
        }
        updateCanvasSettings({
            ...(canvasSettings || {}),
            tool_order: currentOrder
        });
    };

    const orderedTools = [...CANVAS_TOOLS].sort((a, b) => {
        const indexA = toolOrder.indexOf(a.id);
        const indexB = toolOrder.indexOf(b.id);
        const posA = indexA === -1 ? 999 : indexA;
        const posB = indexB === -1 ? 999 : indexB;
        return posA - posB;
    });

    const handleDragStart = (e: React.DragEvent, tool: CanvasTool) => {
        if (isReadOnly) {
            e.preventDefault();
            return;
        }
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
        if (isReadOnly) return;
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
        if (isReadOnly) {
            e.preventDefault();
            return;
        }
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
            className={cn(
                "h-full flex-shrink-0 transition-all duration-300 relative z-40",
                rightPanelPinned ? (isCollapsed ? "w-12" : "w-64") : "w-1"
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
        <div
            id="canvas-palette"
            className={cn(
                "border-l bg-sidebar flex flex-col h-full shadow-2xl transition-transform duration-300 ease-in-out relative",
                isCollapsed ? "w-12" : "w-64",
                rightPanelPinned ? "translate-x-0" : `absolute top-0 right-0 ${isHovered ? "translate-x-0" : "translate-x-[calc(100%-4px)]"}`
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

            <div className="p-4 border-b shrink-0 flex items-center justify-between">
                {!isCollapsed && (
                    <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Layout className="h-4 w-4" />
                        Canvas Tools
                    </h2>
                )}
                {isCollapsed && (
                    <div className="flex justify-center w-full">
                        <Layout className="h-4 w-4 text-muted-foreground" />
                    </div>
                )}
                
                {!isCollapsed && !isReadOnly && (
                    <div className="flex items-center gap-1">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={toggleRightPanelPin} 
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        >
                            {rightPanelPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        </Button>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
                                    <Settings className="h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3" align="end">
                                <h3 className="font-medium text-sm mb-3">Configure Tools</h3>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                                    {orderedTools.map((tool, index) => (
                                        <div key={`config-${tool.id}`} className="flex items-center justify-between space-x-2 group/tool">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox 
                                                    id={`config-check-${tool.id}`} 
                                                    checked={visibleTools.includes(tool.id)}
                                                    onCheckedChange={() => toggleToolVisibility(tool.id)}
                                                />
                                                <label 
                                                    htmlFor={`config-check-${tool.id}`}
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
                                                >
                                                    <span className="text-muted-foreground">{tool.icon}</span>
                                                    {tool.name}
                                                </label>
                                            </div>
                                            <div className="flex items-center opacity-0 group-hover/tool:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => reorderTool(tool.id, 'up')}
                                                    disabled={index === 0}
                                                >
                                                    <ChevronUp className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => reorderTool(tool.id, 'down')}
                                                    disabled={index === orderedTools.length - 1}
                                                >
                                                    <ChevronDown className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!isCollapsed && (
                    <div className="text-xs text-muted-foreground mb-4">
                        {isReadOnly ? "Viewing in Read-Only mode." : "Drag items onto the canvas to create them."}
                    </div>
                )}

                {orderedTools.filter(tool => visibleTools.includes(tool.id)).map((tool) => (
                    <div
                        key={tool.id}
                        draggable={!isReadOnly}
                        onDragStart={(e) => handleDragStartWithColor(e, tool)}
                        className={cn(
                            "group flex items-center gap-3 p-3 rounded-lg border bg-card",
                            !isReadOnly ? "hover:border-primary hover:shadow-sm transition-all cursor-grab active:cursor-grabbing" : "opacity-60 cursor-not-allowed grayscale-[0.2]",
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

                        {!isCollapsed && !isReadOnly && (
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
        </div>
    );
}
