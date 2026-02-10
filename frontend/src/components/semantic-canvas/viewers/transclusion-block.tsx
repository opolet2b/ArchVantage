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
import { ChartViewer } from "./chart-viewer"; // Import ChartViewer for visual outputs
import { PDFViewer } from "./pdf-viewer"; // Import PDFViewer
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface TransclusionBlockProps {
    nodeId: string;
    fragmentId?: string; // Support for fragment transclusion
    /** @deprecated Use ancestorIds for better cycle detection */
    hostNodeId?: string;
    /** List of ancestor node IDs for recursive cycle detection */
    ancestorIds?: string[];
    onUnlink?: () => void;
    // Locking Props
    isLocked?: boolean;
    onToggleLock?: () => void;
    snapshotContent?: any; // Snapshot of the thing's content when locked
    exportMode?: boolean;
}

export function TransclusionBlock({
    nodeId,
    fragmentId,
    hostNodeId,
    ancestorIds = [],
    onUnlink,
    isLocked = false,
    onToggleLock,
    snapshotContent,
    exportMode = false
}: TransclusionBlockProps) {
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
    // Check if current nodeId is already in the ancestor chain
    const isCycle = ancestorIds.includes(nodeId);
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

    // Resolve specific fragment if requested (currently supporting Image Regions and Text/Table Fragments)
    const targetFragment = React.useMemo(() => {
        if (!fragmentId || !effectiveContent) return undefined;

        // 1. Check Regions (Images)
        if (effectiveContent.regions && Array.isArray(effectiveContent.regions)) {
            const region = effectiveContent.regions.find((r: any) => r.id === fragmentId);
            if (region) return region;
        }

        // 2. Check Saved Fragments (Text/Table)
        if (effectiveContent.saved_fragments && Array.isArray(effectiveContent.saved_fragments)) {
            const saved = effectiveContent.saved_fragments.find((f: any) => f.id === fragmentId);
            if (saved) return saved;
        }

        return undefined;
    }, [fragmentId, effectiveContent]);

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
                    {fragmentId && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-[10px]">Fragment</span>}
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
                {/* Content Rendering Logic */}
                {(() => {
                    // 1. Fragment Specific Rendering
                    if (targetFragment) {
                        // Region Fragment (Image/PDF Crop)
                        if (targetFragment.type === "region") {
                            // If we have base64 content (e.g. from PDF selection), display that directly
                            if (targetFragment.content && targetFragment.content.startsWith("data:image")) {
                                return (
                                    <span className="h-[200px] w-full relative block">
                                        <ImageViewer
                                            src={targetFragment.content}
                                            alt={`Fragment of ${thingTitle}`}
                                            selectionEnabled={false}
                                            className="w-full h-full object-contain"
                                        />
                                    </span>
                                );
                            }
                            // Otherwise, it's likely a coordinate-based crop on the original image
                            // We need to know the original source. 
                            // Try to infer from thingType or Content.
                            const imgSource = (effectiveContent.asset_id ? `/api/v1/assets/${effectiveContent.asset_id}` : "") || effectiveContent.url || effectiveContent.file_path || "";
                            if (imgSource) {
                                return (
                                    <span className="h-[200px] w-full relative block">
                                        <ImageViewer
                                            src={imgSource}
                                            alt={`Fragment of ${thingTitle}`}
                                            selectionEnabled={false}
                                            className="w-full h-full object-contain"
                                            viewFragment={targetFragment}
                                        />
                                    </span>
                                );
                            }
                        }

                        // Cell Fragment (Spreadsheet/Table)
                        if (targetFragment.type === "cell") {
                            // Prioritize showing only the selected values
                            const cellFrag = targetFragment as any;

                            // If we have explicit values captured in the fragment, use them!
                            // This ensures "What you select is what you see"
                            if (cellFrag.values && Array.isArray(cellFrag.values) && cellFrag.values.length > 0) {
                                return (
                                    <span className={cn(
                                        "w-full relative block transclusion-table-wrapper",
                                        exportMode ? "h-auto border-none" : "h-auto border rounded overflow-hidden max-h-[300px]"
                                    )}>
                                        <SpreadsheetViewer
                                            content="" // No content needed if initialData is provided
                                            initialData={cellFrag.values}
                                            selectionEnabled={false}
                                            className="w-full h-full bg-white dark:bg-slate-900"
                                            exportMode={exportMode}
                                        />
                                    </span>
                                );
                            }

                            // Fallback: If no values captured, try to slice from main content (if available)
                            // But usually values should be there if captured correctly.
                            // If fallback to full sheet, stick to previous logic.
                            const sheetContent = typeof effectiveContent === "string" ? effectiveContent :
                                (effectiveContent.csv || effectiveContent.markdown || effectiveContent.url || effectiveContent.file_path || effectiveContent.content || "");

                            if (sheetContent) {
                                return (
                                    <span className={cn(
                                        "w-full relative block transclusion-table-wrapper",
                                        exportMode ? "h-auto border-none" : "h-[300px] border rounded overflow-hidden"
                                    )}>
                                        <SpreadsheetViewer
                                            content={sheetContent}
                                            initialData={effectiveContent.data as any[][]}
                                            selectionEnabled={false}
                                            className="w-full h-full bg-white dark:bg-slate-900"
                                            exportMode={exportMode}
                                            highlight={{ range: cellFrag.range }} // Fallback to highlight if we can't slice
                                        />
                                    </span>
                                );
                            }
                        }

                        // Fallback for Text/Other Fragments
                        return (
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600">
                                <div className="italic text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-serif">
                                    "{targetFragment.content || (targetFragment as any).text}"
                                </div>
                                <div className="text-xs text-slate-400 mt-2 text-right">— Selection from {thingTitle}</div>
                            </div>
                        );
                    }

                    // 2. Full Node Rendering (No Fragment)

                    // Image Check
                    if (thingType === "image" ||
                        (typeof effectiveContent?.file_path === 'string' && effectiveContent.file_path.match(/\.(jpeg|jpg|png|gif|webp|svg)$/i)) ||
                        (typeof effectiveContent?.url === 'string' && effectiveContent.url.match(/\.(jpeg|jpg|png|gif|webp|svg)$/i))
                    ) {
                        return (
                            <span className="h-[200px] w-full relative block">
                                <ImageViewer
                                    src={(effectiveContent.asset_id ? `/api/v1/assets/${effectiveContent.asset_id}` : "") || effectiveContent.url || effectiveContent.file_path || ""}
                                    alt={thingTitle}
                                    selectionEnabled={false}
                                    className="w-full h-full object-contain"
                                />
                            </span>
                        );
                    }

                    // Visualizer/Chart Check
                    if (effectiveContent?.visualizer_output?.visual_payload &&
                        (effectiveContent.visualizer_output.visual_payload.structure_type?.toLowerCase() === 'chart' ||
                            effectiveContent.visualizer_output.visual_payload.structure_type?.toLowerCase().includes('chart') ||
                            effectiveContent.visualizer_output.visual_payload.structure_type?.toLowerCase() === 'react_component')
                    ) {
                        return (
                            <span className={cn(
                                "w-full relative block p-2",
                                exportMode ? "h-[300px] border-none" : "h-[300px] border rounded overflow-hidden bg-white dark:bg-slate-900"
                            )}>
                                <ChartViewer
                                    type={(effectiveContent.visualizer_output.visual_payload.structure_type?.toLowerCase() === 'chart' ||
                                        effectiveContent.visualizer_output.visual_payload.structure_type?.toLowerCase() === 'react_component')
                                        ? 'linechart'
                                        : effectiveContent.visualizer_output.visual_payload.structure_type
                                    }
                                    data={effectiveContent.visualizer_output.visual_payload.content}
                                    exportMode={exportMode}
                                    isAnimationActive={false}
                                />
                            </span>
                        );
                    }

                    // Table Check
                    if (thingType === "table" ||
                        thingTitle.toLowerCase().match(/\.(xlsx?|csv)$/) ||
                        (effectiveContent && (effectiveContent.csv || effectiveContent.data || Array.isArray(effectiveContent)))
                    ) {
                        return (
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
                        );
                    }

                    // PDF Check
                    if (thingTitle.toLowerCase().endsWith(".pdf") || (effectiveContent?.file_path || effectiveContent?.url || "").toLowerCase().endsWith(".pdf")) {
                        return (
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
                        );
                    }

                    // Default Markdown/Text
                    return (
                        <MarkdownViewer
                            content={getContentPreview}
                            selectionEnabled={false}
                            className="prose-xs"
                            ancestorIds={[...ancestorIds, nodeId]}
                            components={{
                                p: ({ children }) => <span className="block mb-2">{children}</span>
                            }}
                        />
                    );

                })()}
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
