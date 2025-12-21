/**
 * Text Viewer Component
 *
 * Renders plain text content with text selection support.
 * Fallback viewer for unsupported document types.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { TextFragment } from "./types";

// =============================================================================
// Props
// =============================================================================

interface TextViewerProps {
    /** The text content to render */
    content: string;
    /** Callback when text is selected (includes position for toolbar) */
    onSelect?: (fragment: TextFragment, position: { x: number; y: number }) => void;
    /** Optional className for styling */
    className?: string;
    /** Whether selection is enabled */
    selectionEnabled?: boolean;
    /** Optional highlight fragment */
    highlight?: { startOffset?: number; endOffset?: number; content?: string } | null;
}

// =============================================================================
// Text Viewer Component
// =============================================================================

export function TextViewer({
    content,
    onSelect,
    className,
    selectionEnabled = true,
    highlight,
}: TextViewerProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Handle text selection with global listener to catch selections ending outside the container
    React.useEffect(() => {
        const handleMouseUp = () => {
            if (!selectionEnabled || !onSelect) return;

            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) return;

            const selectedText = selection.toString().trim();
            if (!selectedText) return;

            // Get selection range info
            const range = selection.getRangeAt(0);
            const container = containerRef.current;

            // Critical check: Is the selection actually inside this viewer?
            if (!container || !container.contains(range.commonAncestorContainer)) return;

            // Get selection bounding rect for toolbar position
            const rect = range.getBoundingClientRect();
            const position = {
                x: rect.left + rect.width / 2,
                y: rect.top,
            };

            // Create text fragment
            const fragment: TextFragment = {
                type: "text",
                content: selectedText,
                startOffset: range.startOffset,
                endOffset: range.endOffset,
            };

            onSelect(fragment, position);
        };

        document.addEventListener("mouseup", handleMouseUp);
        // Also listen for keyup (Shift+Arrow keys)
        document.addEventListener("keyup", handleMouseUp);

        return () => {
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("keyup", handleMouseUp);
        };
    }, [onSelect, selectionEnabled]);

    // Render content with potential highlight
    const renderContent = () => {
        if (!highlight || typeof highlight.startOffset !== 'number' || typeof highlight.endOffset !== 'number') {
            return content;
        }

        const { startOffset, endOffset } = highlight;

        // Safety check
        if (startOffset < 0 || endOffset > content.length || startOffset >= endOffset) {
            return content;
        }

        const pre = content.slice(0, startOffset);
        const marked = content.slice(startOffset, endOffset);
        const post = content.slice(endOffset);

        return (
            <>
                {pre}
                <mark className="bg-yellow-200 dark:bg-yellow-900/50 text-slate-900 dark:text-slate-100 rounded px-0.5">
                    {marked}
                </mark>
                {post}
            </>
        );
    };

    return (
        <div
            ref={containerRef}
            className={cn(
                "font-mono text-sm whitespace-pre-wrap break-words",
                "text-slate-700 dark:text-slate-300",
                selectionEnabled && "select-text cursor-text",
                className
            )}
        >
            {renderContent()}
        </div>
    );
}
