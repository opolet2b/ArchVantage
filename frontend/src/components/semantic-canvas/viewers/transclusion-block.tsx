/**
 * Transclusion Block Component
 *
 * Renders a "live" embedded view of another node (transclusion).
 * Features cycle detection, refresh, and unlink capabilities.
 */
"use client";

import * as React from "react";
import { useCanvasStore } from "../canvas-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    AlertTriangle,
    RefreshCw,
    Unlink,
    Lock,
    ExternalLink,
    FileText,
    Image as ImageIcon,
    MessageSquare,
    Presentation,
    Loader2,
    Table // Add Table icon
} from "lucide-react";
import { MarkdownViewer } from "./markdown-viewer"; // Import MarkdownViewer
import { ImageViewer } from "./image-viewer"; // Import ImageViewer
import { SpreadsheetViewer } from "./spreadsheet-viewer"; // Import SpreadsheetViewer
import { PDFViewer } from "./pdf-viewer"; // Import PDFViewer
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface TransclusionBlockProps {
    nodeId: string;
    hostNodeId: string;
    onUnlink?: () => void;
    // Locking Props
    isLocked?: boolean;
    onToggleLock?: () => void;
    snapshotContent?: any; // Snapshot of the thing's content when locked
    exportMode?: boolean;
}

export function TransclusionBlock({ nodeId, hostNodeId, onUnlink, isLocked = false, onToggleLock, snapshotContent, exportMode = false }: TransclusionBlockProps) {
    // Live thing from store
    const liveThing = useCanvasStore(state => state.things.find(t => t.id === nodeId));
    const selectThing = useCanvasStore(state => state.selectThing);

    // If locked, we prefer snapshot. BUT we still need 'thing' metadata if possible.
    // However, if we only have the ID, we might not have the title/type in snapshot if we didn't store it.
    // Let's assume snapshot contains at least { content: ... }.
    // Ideally snapshot SHOULD be the whole Thing object or at least { title, type, content }.

    // Derived thing data
    const thingType = (isLocked && snapshotContent?.type) ? snapshotContent.type : (liveThing?.type || "unknown");
    const thingTitle = (isLocked && snapshotContent?.title) ? snapshotContent.title : (liveThing?.title || "Untitled Node");
    const thingContent = (isLocked && snapshotContent?.content) ? snapshotContent.content : (liveThing?.content || {});

    // Detection: If locked but no snapshot, that's an error state or legacy. Fallback to live.
    const effectiveContent = (isLocked && snapshotContent) ? snapshotContent.content : thingContent;

    // Cycle Detection
    const isCycle = nodeId === hostNodeId;
    const [isRefreshed, setIsRefreshed] = React.useState(false);

    // Helper to get Icon
    const getIcon = (type: string) => {
        switch (type) {
            case "text": return FileText;
            case "image": return ImageIcon;
            case "conversation": return MessageSquare;
            case "slideshow": return Presentation;
            case "table": return Table;
            case "spreadsheet": return Table;
            default: return FileText;

        }
    };

    const Icon = getIcon(thingType);

    // Helper to get preview content
    const getContentPreview = React.useMemo(() => {
        // If locked, trust snapshot. If unlocked, check liveThing existence.
        if (!isLocked && !liveThing) return "Node not found.";

        const c = effectiveContent;
        if (!c) return "No content.";

        if (typeof c.markdown === "string") return c.markdown;
        if (typeof c.text === "string") return c.text;
        if (typeof c.content === "string") return c.content;
        if (typeof c.full_text === "string") return c.full_text;
        if (typeof c.text_content === "string") return c.text_content;
        if (typeof c.description === "string") return c.description;

        return JSON.stringify(c, null, 2);
    }, [isLocked, liveThing, effectiveContent]);

    const handleRefresh = React.useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsRefreshed(true);
        setTimeout(() => setIsRefreshed(false), 1000);
    }, []);

    // Handling Lock Toggle
    const handleLockClick = React.useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (onToggleLock) {
            onToggleLock();
        }
    }, [onToggleLock]);

    if (isCycle) {
        return (
            <span className="my-4 p-4 border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30 rounded-md flex items-center gap-3 text-red-600 dark:text-red-400 block w-full">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">Circular Transclusion Detected</span>
            </span>
        );
    }

    if (!isLocked && !liveThing) {
        return (
            <span className="my-4 p-4 border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30 rounded-md flex items-center gap-3 text-amber-600 dark:text-amber-400 block w-full">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">Referenced Node Not Found ({nodeId})</span>
                {onUnlink && (
                    <Button variant="ghost" size="sm" onClick={onUnlink} className="ml-auto h-6 w-6 p-0 hover:bg-amber-100 dark:hover:bg-amber-900/40">
                        <Unlink className="w-3 h-3" />
                    </Button>
                )}
            </span>
        );
    }

    return (
        <span className={cn(
            "group my-4 border rounded-md overflow-hidden transition-all hover:shadow-sm block w-full transclusion-container",
            isLocked
                ? "bg-amber-50/30 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800"
                : "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-700"
        )}>
            {/* Header */}
            <span
                className={cn(
                    "flex items-center gap-2 px-3 py-2 border-b cursor-pointer select-none w-full",
                    isLocked
                        ? "bg-amber-100/50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800"
                        : "bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-800"
                )}
                onClick={(e) => {
                    e.preventDefault();
                    selectThing(nodeId);
                }}
            >
                <Icon className={cn("w-4 h-4", isLocked ? "text-amber-600" : "text-slate-500")} />
                <span className={cn("text-xs font-semibold flex-1 truncate", isLocked ? "text-amber-800 dark:text-amber-200" : "text-slate-700 dark:text-slate-300")}>
                    {thingTitle}
                    {isLocked && <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600 font-bold">(Locked)</span>}
                </span>

                <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Toggle Lock Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-6 w-6", isLocked ? "text-amber-600 hover:text-amber-700 hover:bg-amber-200" : "text-slate-400 hover:text-amber-500")}
                        onClick={handleLockClick}
                        title={isLocked ? "Unlock (Enable Live Updates)" : "Lock (Freeze Content)"}
                    >
                        <Lock className={cn("w-3 h-3", isLocked && "fill-current")} />
                    </Button>

                    {/* Refresh Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-6 w-6", isRefreshed && "animate-spin text-blue-500")}
                        onClick={handleRefresh}
                        title="Refresh Content"
                        disabled={isLocked} // Disable refresh if locked
                    >
                        <RefreshCw className="w-3 h-3" />
                    </Button>
                </span>
            </span>

            {/* Content Preview */}
            <span className={cn(
                "p-3 text-sm text-slate-600 dark:text-slate-400 w-full block",
                exportMode ? "h-auto overflow-visible" : "max-h-[400px] overflow-y-auto"
            )}>
                {/* Image Detection: Type check OR Content check (url/path extension) */}
                {(thingType === "image" ||
                    (typeof effectiveContent?.file_path === 'string' && effectiveContent.file_path.match(/\.(jpeg|jpg|png|gif|webp|svg)$/i)) ||
                    (typeof effectiveContent?.url === 'string' && effectiveContent.url.match(/\.(jpeg|jpg|png|gif|webp|svg)$/i))
                ) ? (
                    <span className="h-[200px] w-full relative block">
                        <ImageViewer
                            src={effectiveContent.url || effectiveContent.file_path || (effectiveContent.image_asset_id ? `/api/v1/assets/${effectiveContent.image_asset_id}` : "")}
                            alt={thingTitle}
                            selectionEnabled={false}
                            className="w-full h-full object-contain"
                        />
                    </span>
                ) : (
                    /* Table Detection: Type check OR Title check OR Content check (csv/data existence) */
                    (thingType === "table" ||
                        thingTitle.toLowerCase().match(/\.(xlsx?|csv)$/) ||
                        (effectiveContent && (effectiveContent.csv || effectiveContent.data || Array.isArray(effectiveContent)))
                    ) ? (
                        <span className={cn(
                            "w-full relative block transclusion-table-wrapper",
                            exportMode ? "h-auto border-none" : "h-[300px] border rounded overflow-hidden"
                        )}>
                            <SpreadsheetViewer
                                content={
                                    typeof effectiveContent === "string" ? effectiveContent :
                                        (effectiveContent.csv || effectiveContent.markdown || effectiveContent.url || effectiveContent.file_path || effectiveContent.content || "")
                                }
                                initialData={effectiveContent.data as any[][]}
                                selectionEnabled={false}
                                className="w-full h-full bg-white dark:bg-slate-900"
                                exportMode={exportMode}
                            />
                        </span>
                    ) : (
                        /* PDF Detection */
                        (thingTitle.toLowerCase().endsWith(".pdf") || (effectiveContent?.file_path || effectiveContent?.url || "").toLowerCase().endsWith(".pdf")) ? (
                            <span className={cn(
                                "w-full relative block",
                                exportMode ? "h-auto border-none" : "h-[400px] border rounded overflow-hidden"
                            )}>
                                <PDFViewer
                                    src={effectiveContent.file_path || effectiveContent.url || ""}
                                    className="w-full h-full"
                                    selectionEnabled={false}
                                    exportMode={exportMode}
                                />
                            </span>
                        ) : (
                            <MarkdownViewer
                                content={getContentPreview}
                                selectionEnabled={false}
                                className="prose-xs"
                                components={{
                                    p: ({ children }) => <span className="block mb-2">{children}</span>
                                }}
                            />
                        )
                    )
                )}
            </span>

            {/* Footer / Metadata */}
            {/* Footer / Metadata - Hide in Export Mode if desired, OR keep minimal. User wanted "screenshot" gone, likely means internal scrollbars. keeping footer for context unless asked. Removing Debug Tag. */}
            <span className={cn(
                "px-3 py-1.5 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px] text-slate-400 w-full",
                // Optional: hide footer in export mode if they want pure content? 
                // User said "content of nodes is exported", usually implies just the body. 
                // Let's hide the footer metadata in export mode for cleaner look.
                exportMode && "hidden"
            )}>
                <span>ID: {nodeId.slice(0, 8)}</span>
                <span className="flex items-center gap-1">
                    {thingType}
                </span>
            </span>
        </span>
    );
}
