/**
 * Selection Toolbar Component
 *
 * Floating toolbar that appears when content is selected.
 * Provides LLM actions (summarize, explain, etc.) and linking options.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import {
    FileText,
    Lightbulb,
    Link2,
    MessageSquare,
    ListChecks,
    X,
    Loader2,
    Scan, // Add Scan icon for Transclusion
    Copy,
    Link,
    Volume2,
    Download
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useCanvasStore } from "../canvas-store";
import { speechService } from "@/lib/speech-service";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Fragment } from "./types";

// =============================================================================
// Types
// =============================================================================

export type LLMAction = "summarize" | "explain" | "extract_points" | "ask";

interface SelectionToolbarProps {
    /** The selected fragment */
    fragment: Fragment;
    /** Thing ID containing the selection */
    thingId: string;
    /** Position for the toolbar */
    position: { x: number | string; y: number | string };
    /** Callback when an LLM action is triggered */
    onAction: (action: LLMAction, fragment: Fragment) => void;
    /** Callback when link action is triggered */
    onLink?: (fragment: Fragment) => void;
    /** Callback to close the toolbar */
    onClose: () => void;
    /** Whether an action is in progress */
    isLoading?: boolean;
    /** Disable visual highlighting (green frame) regardless of type */
    disableHighlight?: boolean;
    /** Whether this toolbar is for the whole Thing (Toolbox) vs text selection (Green Toolbox) */
    isThingContext?: boolean;
}

// =============================================================================
// Selection Toolbar Component
// =============================================================================

export function SelectionToolbar({
    fragment,
    thingId,
    position,
    onAction,
    onLink,
    onClose,
    isLoading = false,
    disableHighlight = false,
    isThingContext = false,
    positionMode = "fixed" as "fixed" | "absolute",
}: SelectionToolbarProps & { positionMode?: "fixed" | "absolute" }) {
    const toolbarRef = React.useRef<HTMLDivElement>(null);
    const activeScenario = useCanvasStore((s) => s.activeScenario);
    const toolbarConfig = activeScenario?.configuration?.ui_overrides?.toolbar_config;

    // ... (handleCustomTool omitted for brevity if unchanged, but safely included if strict replace)
    // Actually, I can just replace the signature and the style block.

    const handleCustomTool = (tool: any) => {
        // @ts-ignore
        onAction("custom_tool", { ...fragment, tool_prompt: tool.prompt, tool_label: tool.label });
    };

    // Adjust position to stay on screen
    const adjustedPosition = React.useMemo(() => {
        // Guard against undefined position
        if (!position) {
            return { x: 100, y: 100 };
        }

        // If absolute, use raw position (relative to parent)
        if (positionMode === "absolute") {
            return position;
        }

        const padding = 10;
        let x = position.x;
        // Adjusted adjustment: If it's Thing Context, usually we want it centered or above.
        // Existing logic puts it above by 50px.
        let y = typeof position.y === 'number' ? position.y - 50 : position.y; // Above the selection

        // Ensure toolbar stays within viewport
        if (typeof window !== "undefined" && typeof x === 'number' && typeof y === 'number') {
            const toolbarWidth = 220;
            const toolbarHeight = 40;

            // Safe to cast as we checked type in if condition
            if ((x as number) + toolbarWidth > window.innerWidth - padding) {
                x = window.innerWidth - toolbarWidth - padding;
            }
            if ((x as number) < padding) x = padding;

            if (y < padding) {
                y = (position.y as number) + 20; // Below the selection instead
            }
        }

        return { x, y };
    }, [position, positionMode]);

    // Close on click outside — only when NOT loading
    // Reason: during loading, the toolbar stays mounted showing "Processing..."
    // Firing onClose() from an outside mousedown would interfere with:
    //   a) Scrolling content in other nodes (mousedown on scrollbar triggers this listener)
    //   b) Dropping files onto the canvas (preventDefault during drag breaks the drop zone)
    React.useEffect(() => {
        if (isLoading) return; // Don't close while an action is running

        const handleClickOutside = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose, isLoading]);

    // Close on escape
    React.useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    return (
        <TooltipProvider>
            <div
                ref={toolbarRef}
                className={cn(
                    positionMode === "fixed" ? "fixed" : "absolute",
                    "z-50 flex items-center gap-1 p-1",
                    "bg-white dark:bg-slate-800 rounded-lg shadow-lg border",
                    "bg-popover text-popover-foreground rounded-lg shadow-lg border",
                    // Visual feedback for region selection or text selection (unless disabled)
                    (!disableHighlight && (fragment.type === "region" || fragment.type === "text" || fragment.type === "message"))
                        ? "border-2 border-green-500 shadow-green-500/20"
                        : "border-border",
                    "animate-in fade-in-0 zoom-in-95 duration-150"
                )}
                onMouseDown={(e) => {
                    // stopPropagation: prevent ReactFlow from treating toolbar clicks as canvas pan/drag
                    // NOTE: We intentionally do NOT call e.preventDefault() here.
                    // preventDefault() on a pointerdown/mousedown signals to the browser drag API
                    // that this element does NOT accept drops, causing a "forbidden" cursor
                    // when the user tries to drag files onto the canvas while a toolbar is visible.
                    e.stopPropagation();
                }}
                onPointerDown={(e) => {
                    // Same rationale: stopPropagation only, no preventDefault.
                    // preventDefault would block scroll events on nearby content scrollbars.
                    e.stopPropagation();
                }}
                style={{
                    left: adjustedPosition.x,
                    top: adjustedPosition.y,
                    transform: positionMode === "absolute" ? "translateX(-50%)" : undefined
                }}
            >
                {isLoading ? (
                    <div className="flex items-center gap-2 px-3 py-1">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Processing...</span>
                    </div>
                ) : (
                    <>
                        {/* Standard Tools (Summarize, Explain, etc.) */}
                        {/* Show if:
                            1. It's Text Context (!isThingContext) - Default behavior
                            2. It's Thing Context (Toolbox) AND "Keep Standard Tools" is enabled/default
                        */}
                        {(!isThingContext || (isThingContext && toolbarConfig?.keep_standard_tools !== false)) && (
                            <>
                                {/* Summarize */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onMouseDown={(e) => { e.stopPropagation(); }}
                                            onPointerDown={(e) => { e.stopPropagation(); }}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onAction("summarize", fragment);
                                            }}
                                        >
                                            <FileText className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Summarize</TooltipContent>
                                </Tooltip>

                                {/* Explain */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onMouseDown={(e) => { e.stopPropagation(); }}
                                            onPointerDown={(e) => { e.stopPropagation(); }}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onAction("explain", fragment);
                                            }}
                                        >
                                            <Lightbulb className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Explain</TooltipContent>
                                </Tooltip>

                                {/* Extract Key Points */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onMouseDown={(e) => { e.stopPropagation(); }}
                                            onPointerDown={(e) => { e.stopPropagation(); }}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onAction("extract_points", fragment);
                                            }}
                                        >
                                            <ListChecks className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Extract Key Points</TooltipContent>
                                </Tooltip>

                                {/* Ask (custom prompt) */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onMouseDown={(e) => { e.stopPropagation(); }}
                                            onPointerDown={(e) => { e.stopPropagation(); }}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onAction("ask", fragment);
                                            }}
                                        >
                                            <MessageSquare className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Ask about this...</TooltipContent>
                                </Tooltip>
                            </>
                        )}

                        {/* Custom Tools */}
                        {(() => {
                            // Determine which tool set to show based on context
                            const targetLocation = isThingContext ? "main" : "selection";

                            return toolbarConfig?.tools?.filter((t: any) => t.location === targetLocation).map((tool: any) => {
                                // @ts-ignore
                                const IconComp = LucideIcons[tool.icon] || LucideIcons.Sparkles;
                                return (
                                    <Tooltip key={tool.id}>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={cn(
                                                    "h-8 w-8 p-0 hover:bg-blue-50",
                                                    isThingContext ? "text-indigo-600 hover:text-indigo-700" : "text-blue-600 hover:text-blue-700"
                                                )}
                                                onMouseDown={(e) => { e.stopPropagation(); }}
                                                onPointerDown={(e) => { e.stopPropagation(); }}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleCustomTool(tool);
                                                }}
                                            >
                                                <IconComp className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{tool.label}</TooltipContent>
                                    </Tooltip>
                                );
                            });
                        })()}


                        {/* Transclude (Copy Reference) */}
                        {/* Supported for Regions (have ID) AND Text/Cells (need persistence) */}
                        {(fragment.type === "region" || fragment.type === "text" || fragment.type === "cell") && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onMouseDown={(e) => { e.stopPropagation(); }}
                                        onPointerDown={(e) => { e.stopPropagation(); }}
                                        onClick={async (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const logFragment = fragment ? {
                                                ...fragment,
                                                content: typeof fragment.content === "string" && fragment.content.length > 200
                                                    ? `${fragment.content.substring(0, 100)}... [truncated ${fragment.content.length} chars]`
                                                    : fragment.content
                                            } : fragment;
                                            console.log("[SelectionToolbar] Transclude Clicked", { fragment: logFragment });
                                            let finalFragmentId = fragment.id;
                                            const store = useCanvasStore.getState();

                                            // For region fragments, ALWAYS persist to saved_fragments
                                            // (not just when ID is missing)
                                            if (fragment.type === 'region') {
                                                // Generate ID if missing
                                                if (!finalFragmentId) {
                                                    finalFragmentId = crypto.randomUUID();
                                                }

                                                const fragmentToSave = { ...fragment, id: finalFragmentId };

                                                // Persist to Thing's content.saved_fragments
                                                const thing = store.things.find(t => t.id === thingId);
                                                if (thing) {
                                                    const currentFragments = (thing.content as any).saved_fragments || [];

                                                    // Check if fragment already exists (by ID)
                                                    const existingIndex = currentFragments.findIndex((f: any) => f.id === finalFragmentId);

                                                    let updatedFragments;
                                                    if (existingIndex >= 0) {
                                                        // Update existing fragment
                                                        updatedFragments = [...currentFragments];
                                                        updatedFragments[existingIndex] = fragmentToSave;
                                                        console.log("[SelectionToolbar] Updating existing fragment", { id: finalFragmentId });
                                                    } else {
                                                        // Add new fragment
                                                        updatedFragments = [...currentFragments, fragmentToSave];
                                                        console.log("[SelectionToolbar] Adding new fragment", { id: finalFragmentId });
                                                    }

                                                    await store.updateThing(thingId, {
                                                        content: {
                                                            ...thing.content,
                                                            saved_fragments: updatedFragments
                                                        }
                                                    });
                                                }
                                            } else if (!finalFragmentId) {
                                                // For non-region fragments without ID, generate and save
                                                const newId = crypto.randomUUID();
                                                finalFragmentId = newId;
                                                const newFragment = { ...fragment, id: newId };

                                                const thing = store.things.find(t => t.id === thingId);
                                                if (thing) {
                                                    const currentFragments = (thing.content as any).saved_fragments || [];
                                                    await store.updateThing(thingId, {
                                                        content: {
                                                            ...thing.content,
                                                            saved_fragments: [...currentFragments, newFragment]
                                                        }
                                                    });
                                                }
                                            }

                                            if (finalFragmentId) {
                                                // Use the standard format
                                                const code = `{{node:${thingId}#${finalFragmentId}}}`;
                                                console.log("[SelectionToolbar] Writing to clipboard", { code });
                                                navigator.clipboard.writeText(code);

                                                // OPTIONAL: Also set the ghost ID?
                                                // The user said "Check the transclude function of Things".
                                                // ThingNode sets setTransclusionGhostId.
                                                // However, ghost mode is for the WHOLE thing.
                                                // For fragments, we usually just copy the reference.
                                                // But maybe we should also set a "Fragment Ghost"?
                                                // The current system might not support fragment ghosts.
                                                // Let's stick to copying the reference but with the correct Icon.
                                            }

                                            // Close toolbar
                                            onClose();
                                        }}
                                        title="Pick up to Transclude"
                                    >
                                        <Link className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy Transclusion</TooltipContent>
                            </Tooltip>
                        )}

                        {/* Divider */}
                        <div className="w-px h-5 bg-border mx-1" />

                        {/* Link */}
                        {onLink && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onMouseDown={(e) => { e.stopPropagation(); }}
                                        onPointerDown={(e) => { e.stopPropagation(); }}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (onLink) onLink(fragment);
                                        }}
                                    >
                                        <Link2 className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Link to another node</TooltipContent>
                            </Tooltip>
                        )}

                        {/* TTS Actions */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onMouseDown={(e) => { e.stopPropagation(); }}
                                    onPointerDown={(e) => { e.stopPropagation(); }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        speechService.speak(fragment.content || "");
                                    }}
                                >
                                    <Volume2 className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Read aloud</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onMouseDown={(e) => { e.stopPropagation(); }}
                                    onPointerDown={(e) => { e.stopPropagation(); }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        speechService.download(fragment.content || "");
                                    }}
                                >
                                    <Download className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download audio</TooltipContent>
                        </Tooltip>

                        {/* Close */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-muted-foreground"
                                    onMouseDown={(e) => { e.stopPropagation(); }}
                                    onPointerDown={(e) => { e.stopPropagation(); }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onClose();
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Close</TooltipContent>
                        </Tooltip>
                    </>
                )}
            </div>

        </TooltipProvider>
    );
}
