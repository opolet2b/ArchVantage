/**
 * Thing Node Component
 *
 * Renders a "thing" on the canvas with semantic zoom behavior.
 * Content display changes based on zoom level.
 * Features resizable containers when selected.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { Handle, Position, NodeProps, NodeResizer } from "reactflow";
import {
    MessageSquare,
    FileText,
    Image,
    Video,
    Database,
    Table,
    Bot,
    Link,
    Type,
    Minimize2,
    Maximize2,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CanvasThing, ZoomLevel } from "../canvas-store";
import {
    MarkdownViewer,
    SpreadsheetViewer,
    ImageViewer,
    PDFViewer,
    ConversationViewer,
    TextViewer,
    SelectableContent,
} from "../viewers";

// =============================================================================
// Icon Mapping
// =============================================================================

const thingIcons: Record<string, React.ElementType> = {
    text: Type,
    conversation: MessageSquare,
    message: MessageSquare,
    document: FileText,
    image: Image,
    video: Video,
    database: Database,
    table: Table,
    agent_result: Bot,
    url: Link,
};

// =============================================================================
// Type-Specific Color Themes (Agent Builder style)
// =============================================================================

interface ThingColorTheme {
    headerBg: string;
    headerBgDark: string;
    iconColor: string;
    borderSelected: string;
    handleColor: string;
}

const thingColors: Record<string, ThingColorTheme> = {
    text: {
        headerBg: "bg-gradient-to-r from-slate-50 to-gray-100",
        headerBgDark: "dark:from-slate-800/50 dark:to-gray-800/50",
        iconColor: "text-slate-600",
        borderSelected: "border-slate-500",
        handleColor: "!bg-slate-500",
    },
    conversation: {
        headerBg: "bg-gradient-to-r from-blue-50 to-indigo-50",
        headerBgDark: "dark:from-blue-900/20 dark:to-indigo-900/20",
        iconColor: "text-blue-600",
        borderSelected: "border-blue-500",
        handleColor: "!bg-blue-500",
    },
    message: {
        headerBg: "bg-gradient-to-r from-blue-50 to-cyan-50",
        headerBgDark: "dark:from-blue-900/20 dark:to-cyan-900/20",
        iconColor: "text-blue-500",
        borderSelected: "border-blue-400",
        handleColor: "!bg-blue-400",
    },
    document: {
        headerBg: "bg-gradient-to-r from-amber-50 to-orange-50",
        headerBgDark: "dark:from-amber-900/20 dark:to-orange-900/20",
        iconColor: "text-amber-600",
        borderSelected: "border-amber-500",
        handleColor: "!bg-amber-500",
    },
    image: {
        headerBg: "bg-gradient-to-r from-pink-50 to-rose-50",
        headerBgDark: "dark:from-pink-900/20 dark:to-rose-900/20",
        iconColor: "text-pink-600",
        borderSelected: "border-pink-500",
        handleColor: "!bg-pink-500",
    },
    video: {
        headerBg: "bg-gradient-to-r from-purple-50 to-fuchsia-50",
        headerBgDark: "dark:from-purple-900/20 dark:to-fuchsia-900/20",
        iconColor: "text-purple-600",
        borderSelected: "border-purple-500",
        handleColor: "!bg-purple-500",
    },
    database: {
        headerBg: "bg-gradient-to-r from-emerald-50 to-teal-50",
        headerBgDark: "dark:from-emerald-900/20 dark:to-teal-900/20",
        iconColor: "text-emerald-600",
        borderSelected: "border-emerald-500",
        handleColor: "!bg-emerald-500",
    },
    table: {
        headerBg: "bg-gradient-to-r from-cyan-50 to-sky-50",
        headerBgDark: "dark:from-cyan-900/20 dark:to-sky-900/20",
        iconColor: "text-cyan-600",
        borderSelected: "border-cyan-500",
        handleColor: "!bg-cyan-500",
    },
    agent_result: {
        headerBg: "bg-gradient-to-r from-violet-50 to-purple-50",
        headerBgDark: "dark:from-violet-900/20 dark:to-purple-900/20",
        iconColor: "text-violet-600",
        borderSelected: "border-violet-500",
        handleColor: "!bg-violet-500",
    },
    url: {
        headerBg: "bg-gradient-to-r from-sky-50 to-blue-50",
        headerBgDark: "dark:from-sky-900/20 dark:to-blue-900/20",
        iconColor: "text-sky-600",
        borderSelected: "border-sky-500",
        handleColor: "!bg-sky-500",
    },
};

// Default color theme for unknown types
const defaultColorTheme: ThingColorTheme = {
    headerBg: "bg-gradient-to-r from-slate-50 to-gray-50",
    headerBgDark: "dark:from-slate-800/50 dark:to-gray-800/50",
    iconColor: "text-slate-500",
    borderSelected: "border-slate-400",
    handleColor: "!bg-slate-400",
};

// =============================================================================
// Resize handle styles
// =============================================================================

const resizeHandleStyle = {
    width: 10,
    height: 10,
    borderRadius: 2,
    border: "2px solid #3b82f6",
    backgroundColor: "white",
};

// =============================================================================
// Thing Node Data
// =============================================================================

interface ThingNodeData {
    thing: CanvasThing;
    zoomLevel: ZoomLevel;
    isSelected: boolean;
    onOpenConversation?: (conversationId: string) => void;
    onToggleIconify?: (thingId: string) => void;
    onDelete?: (thingId: string) => void;
}

// =============================================================================
// Thing Node Component
// =============================================================================

export function ThingNode({ data, selected }: NodeProps<ThingNodeData>) {
    const { thing, zoomLevel, isSelected, onOpenConversation, onToggleIconify, onDelete } = data;
    const Icon = thingIcons[thing.type] || FileText;

    // Get type-specific color theme
    const colorTheme = thingColors[thing.type] || defaultColorTheme;

    // Handle double-click on conversation things to open in chat
    const handleDoubleClick = () => {
        if (thing.type === "conversation" && thing.content.conversation_id && onOpenConversation) {
            onOpenConversation(thing.content.conversation_id as string);
        }
    };

    // Handle iconify toggle
    const handleToggleIconify = (e: React.MouseEvent) => {
        e.stopPropagation();  // Prevent triggering node selection
        if (onToggleIconify) {
            onToggleIconify(thing.id);
        }
    };

    // Get default summary from content
    const getDefaultSummary = (): string => {
        const content = thing.content;
        if (thing.type === "text") {
            return (content.text as string)?.slice(0, 50) || "Text note";
        }
        if (thing.type === "conversation") {
            return `${(content.messages as unknown[])?.length || 0} messages`;
        }
        if (thing.type === "document") {
            return (content.filename as string) || "Document";
        }
        return thing.type;
    };

    // Get content preview
    const getContentPreview = (): string => {
        const content = thing.content;
        if (thing.type === "text") {
            return (content.text as string)?.slice(0, 200) || "";
        }
        if (thing.type === "conversation") {
            const messages = content.messages as Array<{ content?: string }>;
            return messages?.[0]?.content?.slice(0, 200) || "";
        }
        if (thing.type === "document") {
            return (content.content as string)?.slice(0, 200) || "";
        }
        return "";
    };

    // Render full content based on type using appropriate viewer
    // All viewers are wrapped with SelectableContent for selection toolbar
    const renderFullContent = () => {
        const content = thing.content;
        const filename = content.filename as string | undefined;

        switch (thing.type) {
            case "text":
                return (
                    <SelectableContent thingId={thing.id}>
                        <TextViewer
                            content={content.text as string || ""}
                            className="max-h-[200px] overflow-y-auto"
                        />
                    </SelectableContent>
                );

            case "conversation":
                // Keep simpler ones disabled or just text representation for now
                const messages = content.messages as Array<{
                    id?: string;
                    role: "user" | "assistant" | "system";
                    content: string;
                }>;
                return (
                    <SelectableContent thingId={thing.id}>
                        <ConversationViewer
                            messages={messages || []}
                            className="max-h-[200px] overflow-y-auto"
                        />
                    </SelectableContent>
                );

            case "document":
                // Determine document type and use appropriate viewer
                const fileType = content.file_type as string | undefined;
                const filePath = content.file_path as string | undefined;
                const textContent = content.content as string | undefined;

                // PDF files
                if (
                    fileType?.includes("pdf") ||
                    filename?.toLowerCase().endsWith(".pdf")
                ) {
                    if (filePath) {
                        return (
                            <SelectableContent thingId={thing.id}>
                                <PDFViewer
                                    src={filePath}
                                    className="h-[300px]"
                                />
                            </SelectableContent>
                        );
                    }
                }

                // Markdown files
                if (filename?.toLowerCase().endsWith(".md")) {
                    return (
                        <SelectableContent thingId={thing.id}>
                            <MarkdownViewer
                                content={textContent || ""}
                                className="max-h-[200px] overflow-y-auto"
                            />
                        </SelectableContent>
                    );
                }

                // Spreadsheet files (Excel, CSV)
                if (
                    filename?.toLowerCase().match(/\.(xlsx?|csv)$/) ||
                    fileType?.includes("spreadsheet") ||
                    fileType?.includes("excel") ||
                    fileType?.includes("csv")
                ) {
                    return (
                        // <div className="p-2 border rounded bg-slate-100 text-xs">Spreadsheet Viewer Disabled</div>
                        <SelectableContent thingId={thing.id}>
                            <SpreadsheetViewer
                                content={filePath || textContent || ""}
                                filename={filename}
                                className="h-[200px]"
                            />
                        </SelectableContent>
                    );
                }

                // Default: plain text viewer
                return (
                    <SelectableContent thingId={thing.id}>
                        <TextViewer
                            content={textContent?.slice(0, 500) || `File: ${filename || "Unknown"}`}
                            className="max-h-[200px] overflow-y-auto"
                        />
                    </SelectableContent>
                );

            case "image":
                return (
                    <SelectableContent thingId={thing.id}>
                        <ImageViewer
                            src={content.file_path as string}
                            alt={content.alt_text as string || "Image"}
                            className="max-h-[200px]"
                        />
                    </SelectableContent>
                );

            case "url":
                return (
                    <a
                        href={content.url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                    >
                        {content.url as string}
                    </a>
                );

            default:
                return (
                    <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-auto max-h-[200px]">
                        {JSON.stringify(content, null, 2)}
                    </pre>
                );
        }
    };

    // Get display content based on zoom level
    const getDisplayContent = () => {
        switch (zoomLevel) {
            case "domain":
                // Just icon
                return null;

            case "summary":
                // Icon + one-line summary
                return (
                    <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {thing.summaries?.["0.3"] ||
                            thing.title ||
                            getDefaultSummary()}
                    </div>
                );

            case "preview":
                // Title + preview
                return (
                    <div className="space-y-1">
                        <div className="font-medium text-sm truncate">
                            {thing.title || getDefaultTitle()}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                            {thing.summaries?.["0.5"] ||
                                getContentPreview()}
                        </div>
                    </div>
                );

            case "full":
            default:
                // Full content
                return (
                    <div className="space-y-2">
                        <div className="font-medium text-sm">
                            {thing.title || getDefaultTitle()}
                        </div>
                        <div className="text-sm">
                            {renderFullContent()}
                        </div>
                    </div>
                );
        }
    };

    // Default title helper
    const getDefaultTitle = (): string => {
        return thing.title || thing.type;
    };


    // =============================================================================
    // Iconified Mode - compact icon representation
    // =============================================================================
    if (thing.iconified) {
        return (
            <div
                className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center relative",
                    "bg-white dark:bg-slate-800 border-2 shadow-md",
                    "transition-all duration-200 cursor-pointer",
                    (isSelected || selected)
                        ? `${colorTheme.borderSelected} ring-2 ring-offset-1 shadow-lg`
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                )}
                title={thing.title || getDefaultTitle()}
                onDoubleClick={handleDoubleClick}
            >
                {/* Main type icon - colored by type */}
                <Icon className={cn("h-6 w-6", colorTheme.iconColor)} />

                {/* Restore button - shown when selected */}
                {(isSelected || selected) && onToggleIconify && (
                    <button
                        onClick={handleToggleIconify}
                        className={cn(
                            "absolute -top-2 -right-2 w-5 h-5 rounded-full text-white",
                            "flex items-center justify-center shadow-md transition-colors",
                            "bg-slate-600 hover:bg-slate-700"
                        )}
                        title="Restore to full size"
                    >
                        <Maximize2 className="h-3 w-3" />
                    </button>
                )}

                {/* Connection handles - colored by type */}
                <Handle
                    type="target"
                    position={Position.Left}
                    className={cn("!w-3 !h-3", colorTheme.handleColor)}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className={cn("!w-3 !h-3", colorTheme.handleColor)}
                />
            </div>
        );
    }

    // Render based on zoom level
    if (zoomLevel === "domain") {
        // Minimal: just colored circle with icon
        return (
            <div
                className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    "bg-white dark:bg-slate-800 border-2",
                    isSelected
                        ? `${colorTheme.borderSelected} shadow-lg`
                        : "border-slate-200 dark:border-slate-700"
                )}
            >
                <Icon className={cn("h-4 w-4", colorTheme.iconColor)} />
                <Handle type="target" position={Position.Left} className="opacity-0" />
                <Handle type="source" position={Position.Right} className="opacity-0" />
            </div>
        );
    }

    // Card view for other zoom levels
    const minWidth = zoomLevel === "summary" ? 150 : zoomLevel === "preview" ? 200 : 280;

    return (
        <>
            {/* Resize handles when selected */}
            <NodeResizer
                color="#3b82f6"
                isVisible={selected}
                minWidth={minWidth}
                minHeight={60}
                handleStyle={resizeHandleStyle}
            />
            {/* Agent Builder-style container */}
            <div
                className={cn(
                    "rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md",
                    "transition-all duration-200 overflow-hidden",
                    (isSelected || selected)
                        ? `${colorTheme.borderSelected} ring-2 ring-offset-1 shadow-lg`
                        : "border-slate-200 dark:border-slate-700",
                    thing.type === "conversation" && "cursor-pointer hover:shadow-lg"
                )}
                onDoubleClick={handleDoubleClick}
                title={thing.type === "conversation" ? "Double-click to open in chat" : undefined}
                style={{
                    minWidth,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {/* Gradient header - Agent Builder style */}
                <div className={cn(
                    "flex items-center gap-2 px-3 py-2 border-b rounded-t-lg",
                    colorTheme.headerBg,
                    colorTheme.headerBgDark
                )}>
                    <Icon className={cn("h-4 w-4 flex-shrink-0", colorTheme.iconColor)} />
                    {zoomLevel !== "summary" && (
                        <span className="text-sm font-medium truncate flex-1">
                            {thing.title || getDefaultTitle()}
                        </span>
                    )}
                    {/* Iconify button - shown when selected */}
                    {(isSelected || selected) && onToggleIconify && (
                        <button
                            onClick={handleToggleIconify}
                            className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0"
                            title="Reduce to icon"
                        >
                            <Minimize2 className="h-4 w-4 text-slate-500" />
                        </button>
                    )}
                    {/* Delete button - shown when selected */}
                    {(isSelected || selected) && onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(thing.id);
                            }}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex-shrink-0"
                            title="Delete"
                        >
                            <Trash2 className="h-4 w-4 text-red-500" />
                        </button>
                    )}
                </div>

                {/* Body content */}
                {getDisplayContent() && (
                    <div className="px-3 py-3 flex-1 overflow-auto min-h-0">
                        <div className="h-full overflow-auto">
                            {getDisplayContent()}
                        </div>
                    </div>
                )}

                {/* Connection handles - colored by type */}
                <Handle
                    type="target"
                    position={Position.Left}
                    className={cn("!w-3 !h-3", colorTheme.handleColor)}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className={cn("!w-3 !h-3", colorTheme.handleColor)}
                />
            </div>
        </>
    );
}

