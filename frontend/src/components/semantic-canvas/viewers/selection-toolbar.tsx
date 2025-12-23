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
} from "lucide-react";
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
    position: { x: number; y: number };
    /** Callback when an LLM action is triggered */
    onAction: (action: LLMAction, fragment: Fragment) => void;
    /** Callback when link action is triggered */
    onLink?: (fragment: Fragment) => void;
    /** Callback to close the toolbar */
    onClose: () => void;
    /** Whether an action is in progress */
    isLoading?: boolean;
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
}: SelectionToolbarProps) {
    const toolbarRef = React.useRef<HTMLDivElement>(null);

    // Adjust position to stay on screen
    const adjustedPosition = React.useMemo(() => {
        // Guard against undefined position
        if (!position) {
            return { x: 100, y: 100 };
        }

        const padding = 10;
        let x = position.x;
        let y = position.y - 50; // Above the selection

        // Ensure toolbar stays within viewport
        if (typeof window !== "undefined") {
            const toolbarWidth = 220;
            const toolbarHeight = 40;

            if (x + toolbarWidth > window.innerWidth - padding) {
                x = window.innerWidth - toolbarWidth - padding;
            }
            if (x < padding) x = padding;

            if (y < padding) {
                y = position.y + 20; // Below the selection instead
            }
        }

        return { x, y };
    }, [position]);

    // Close on click outside
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

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
                    "fixed z-50 flex items-center gap-1 p-1",
                    "bg-white dark:bg-slate-800 rounded-lg shadow-lg border",
                    // Visual feedback for region selection
                    fragment.type === "region" ? "border-2 border-green-500 shadow-green-500/20" : "border-slate-200 dark:border-slate-700",
                    "animate-in fade-in-0 zoom-in-95 duration-150"
                )}
                style={{
                    left: adjustedPosition.x,
                    top: adjustedPosition.y,
                }}
            >
                {isLoading ? (
                    <div className="flex items-center gap-2 px-3 py-1">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Processing...</span>
                    </div>
                ) : (
                    <>
                        {/* Summarize */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => onAction("summarize", fragment)}
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
                                    onClick={() => onAction("explain", fragment)}
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
                                    onClick={() => onAction("extract_points", fragment)}
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
                                    onClick={() => onAction("ask", fragment)}
                                >
                                    <MessageSquare className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Ask about this...</TooltipContent>
                        </Tooltip>

                        {/* Divider */}
                        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

                        {/* Link */}
                        {onLink && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => onLink(fragment)}
                                    >
                                        <Link2 className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Link to another node</TooltipContent>
                            </Tooltip>
                        )}

                        {/* Close */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-muted-foreground"
                                    onClick={onClose}
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
