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
    Layout
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
    | "import_conversation";

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
    }
];

// =============================================================================
// Component
// =============================================================================

export function CanvasPalette() {

    const handleDragStart = (e: React.DragEvent, tool: CanvasTool) => {
        // Set drag data
        e.dataTransfer.setData("application/semantic-canvas-tool", tool.id);
        e.dataTransfer.effectAllowed = "copy";

        // Create a custom drag image if needed, or let browser handle it
        // For distinct visuals, we could set drag image, but standard ghost is usually fine for sidebar items
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
                        onDragStart={(e) => handleDragStart(e, tool)}
                        className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border bg-white dark:bg-slate-800",
                            "hover:border-blue-400 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing",
                            "dark:border-slate-700 dark:hover:border-blue-500"
                        )}
                    >
                        <div className="p-2 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {tool.icon}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">{tool.name}</span>
                            <span className="text-[10px] text-muted-foreground">{tool.description}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
