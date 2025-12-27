/**
 * Markdown Viewer Component
 *
 * Renders markdown content with GitHub-flavored markdown support.
 * Supports text selection for fragment creation.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { TextFragment } from "./types";

// =============================================================================
// Props
// =============================================================================

interface MarkdownViewerProps {
    /** The markdown content to render */
    content: string;
    /** Callback when text is selected (includes position for toolbar) */
    onSelect?: (fragment: TextFragment, position: { x: number; y: number }) => void;
    /** Optional className for styling */
    className?: string;
    /** Whether selection is enabled */
    selectionEnabled?: boolean;
}

// =============================================================================
// Markdown Viewer Component
// =============================================================================

export function MarkdownViewer({
    content,
    onSelect,
    className,
    selectionEnabled = true,
}: MarkdownViewerProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const lastMousePos = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Track mouse position for toolbar placement
    const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    }, []);

    // Handle text selection
    const handleMouseUp = React.useCallback((e: React.MouseEvent) => {
        if (!selectionEnabled || !onSelect) return;

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const selectedText = selection.toString().trim();
        if (!selectedText) return;

        // Get selection range info
        const range = selection.getRangeAt(0);
        const container = containerRef.current;
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
            startOffset: 0, // Could calculate precise offset if needed
            endOffset: selectedText.length,
        };

        onSelect(fragment, position);
    }, [onSelect, selectionEnabled]);

    return (
        <div
            ref={containerRef}
            className={cn(
                "prose prose-sm dark:prose-invert max-w-none",
                "prose-headings:text-foreground prose-p:text-foreground",
                "prose-a:text-blue-600 dark:prose-a:text-blue-400",
                "prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-1 prose-code:rounded",
                "prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800",
                selectionEnabled && "select-text cursor-text",
                className
            )}
            onMouseUp={handleMouseUp}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    img: (props) => {
                        if (!props.src) return null;
                        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                        return <img {...props} />;
                    }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
