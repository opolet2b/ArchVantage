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

// React Flow and Store imports
import { useReactFlow } from "reactflow";
import { useCanvasStore } from "../canvas-store";
import { ExternalLink } from "lucide-react";

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

    // React Flow hooks for camera control
    // Note: useReactFlow must be used within ReactFlowProvider. 
    // If MarkdownViewer is used outside, this might throw or return null.
    // Assuming context availability given its usage in ThingNode.
    const { fitView } = useReactFlow();
    const selectThing = useCanvasStore(state => state.selectThing);
    const things = useCanvasStore(state => state.things);

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

    // Pre-process content to make Evidence citations clickable
    const processedContent = React.useMemo(() => {
        if (!content) return "";
        // Replace (Evidence: <uuid>) with [Evidence: <uuid>](#evidence-<uuid>)
        return content.replace(/\(Evidence:\s*([a-f0-9-]+)\)/gi, "[Evidence: $1](#evidence-$1)");
    }, [content]);

    return (
        <div
            ref={containerRef}
            className={cn(
                "prose prose-sm dark:prose-invert max-w-none",
                "prose-headings:text-foreground prose-p:text-foreground",
                "prose-a:text-blue-600 dark:prose-a:text-blue-400",
                "prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-1 prose-code:rounded prose-code:text-slate-900 dark:prose-code:text-slate-100",
                "prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800 prose-pre:text-slate-900 dark:prose-pre:text-slate-100",
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
                    },
                    a: ({ href, children, ...props }) => {
                        if (href?.startsWith("#evidence-")) {
                            const evidenceId = href.replace("#evidence-", "");
                            const thing = things.find(t => t.id === evidenceId);
                            const label = thing?.title || "Evidence";

                            return (
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        console.log("Zooming to Evidence:", evidenceId);
                                        // Trigger Zoom and Select
                                        try {
                                            selectThing(evidenceId);
                                            fitView({ nodes: [{ id: evidenceId }], duration: 800, padding: 0.2 });
                                        } catch (err) {
                                            console.warn("Failed to zoom to evidence (provider missing?):", err);
                                        }
                                    }}
                                    title={`Jump to Source: ${label}`}
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors mx-1 cursor-pointer align-baseline border border-blue-200 dark:border-blue-800"
                                >
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate max-w-[150px]">{label}</span>
                                </button>
                            );
                        }
                        return <a href={href} {...props}>{children}</a>;
                    }
                }}
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    );
}
