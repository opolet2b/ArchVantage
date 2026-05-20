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
    /** Transclusion locking state map */
    transclusionStates?: Record<string, any>;
    /** Callback to update transclusion state */
    onTransclusionStateChange?: (nodeId: string, state: any) => void;
    /** Optional components override for ReactMarkdown */
    components?: Record<string, React.ElementType>;
    /** Whether to render in export mode */
    exportMode?: boolean;
    /** Current host node ID or list of ancestors for cycle detection */
    ancestorIds?: string[];
    /** Callback when a link is clicked */
    onLinkClick?: (href: string) => void;
    /** Optional highlight fragment */
    highlight?: any;
}

// =============================================================================
// Markdown Viewer Component
// =============================================================================

// React Flow and Store imports
import { useReactFlow } from "reactflow";
import { useCanvasStore } from "../canvas-store";
import { ExternalLink } from "lucide-react";
import { TransclusionBlock } from "./transclusion-block";

// =============================================================================
// Markdown Viewer Component
// =============================================================================

export function MarkdownViewer({
    content,
    onSelect,
    className,
    selectionEnabled = true,
    transclusionStates,
    onTransclusionStateChange,
    components,
    exportMode = false,
    ancestorIds = [],
    onLinkClick,
    highlight,
}: MarkdownViewerProps) {
    console.log("[MarkdownViewer] RENDER", { contentLength: content?.length, hasOnSelect: !!onSelect, hasHighlight: !!highlight });
    const containerRef = React.useRef<HTMLDivElement>(null);
    const lastMousePos = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // React Flow hooks for camera control
    // Note: useReactFlow must be used within ReactFlowProvider. 
    // If MarkdownViewer is used outside, this might throw or return null.
    // Assuming context availability given its usage in ThingNode.
    const { fitView } = useReactFlow();
    const selectThing = useCanvasStore(state => state.selectThing);
    // Needed to identify host node? We don't strictly have hostNodeId prop here.
    // We can try to infer it if necessary, or just skip self-cycle check for now (or pass it down later).
    // Actually, ThingNode uses SelectableContent which wraps MarkdownViewer.
    // We might need to pass `thingId` as a prop to MarkdownViewer to enable proper cycle check.
    // For now, let's keep it optional.

    // We need 'things' to resolve Evidence names
    const things = useCanvasStore(state => state.things);
    const highlightTarget = useCanvasStore(state => state.highlightTarget);

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

    // Pre-process content to make Evidence citations clickable AND handle Transclusions
    const processedContent = React.useMemo(() => {
        if (!content) return "";
        let processed = content;

        // 1. Evidence: Replace (Evidence: <uuid>) with [Evidence: <uuid>](#evidence-<uuid>)
        processed = processed.replace(/\(Evidence:\s*([a-f0-9-]+)\)/gi, "[Evidence: $1](#evidence-$1)");

        // 2. Transclusions: Replace {{node:<uuid>}} with [Transclusion:<uuid>](transclude:<uuid>)
        // Updated to support optional fragment ID: {{node:<uuid>#<fragmentId>}}
        const transclusionRegex = /\{\{node:\s*([a-f0-9-]+)(?:#([a-zA-Z0-9_-]+))?\s*\}\}/gi;
        processed = processed.replace(transclusionRegex, (match, uuid, fragmentId) => {
            const suffix = fragmentId ? `#${fragmentId}` : "";
            return `[Transclusion: ${uuid}${suffix}](transclude:${uuid}${suffix})`;
        });

        // 3. Page Breaks: Replace ---page-break--- with a hidden marker element
        processed = processed.replace(/^---page-break---$/gm, "[[PDF_PAGE_BREAK]]");

        // 4. Smart Highlights
        if (highlightTarget && highlightTarget.length > 0) {
            highlightTarget.forEach(match => {
                if (!match.text || typeof match.text !== 'string' || match.text.length < 5) return;
                // Escape regex special chars
                const escaped = match.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                try {
                    // Global replace, case insensitive
                    const re = new RegExp(escaped, 'gi');
                    // Wrap in a custom link hash we can intercept
                    // We use a zero-width space or similar if needed, but standard link syntax is best
                    processed = processed.replace(re, (m) => `[${m}](#highlight-match)`);
                } catch (e) {
                    console.warn("Failed to create highlight regex", e);
                }
            });
        }

        // 5. Selected Link Traceability Highlight
        if (highlight && highlight.type === "text" && highlight.content) {
            const hText = highlight.content.trim();
            if (hText.length >= 2) {
                const escaped = hText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                try {
                    const re = new RegExp(`(${escaped})`, 'i'); // Match the first occurrence
                    processed = processed.replace(re, `[$1](#link-highlight-match)`);
                } catch (e) {
                    console.warn("Failed to create trace highlight regex", e);
                }
            }
        }

        return processed;
    }, [content, highlightTarget, highlight]);

    // Auto-scroll to active link highlight
    React.useEffect(() => {
        if (!highlight || highlight.type !== "text") return;
        
        const timer = setTimeout(() => {
            const el = containerRef.current?.querySelector("#active-link-highlight");
            if (el) {
                console.log("[MarkdownViewer] Auto-scrolling to highlighted text fragment");
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 200); // slight delay to allow rendering
        
        return () => clearTimeout(timer);
    }, [highlight, processedContent]);

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
                urlTransform={(url) => {
                    if (url.startsWith("transclude:")) return url;
                    return url;
                }}
                components={{
                    ...components,
                    // Map <p> to <div> to allow block-level transclusions (tables, etc.) invalid inside <p>
                    p: ({ children }) => {
                        // Check if children contain our page break marker
                        const hasPageBreak = React.Children.toArray(children).some(
                            child => typeof child === "string" && child.includes("[[PDF_PAGE_BREAK]]")
                        );

                        if (hasPageBreak) {
                            return (
                                <div
                                    data-pdf-page-break="true"
                                    className="pdf-page-break-marker h-px w-full my-4 border-t border-dashed border-blue-200 dark:border-blue-900 flex items-center justify-center relative print:hidden"
                                    style={{ height: '1px' }}
                                >
                                    <span className="absolute px-2 py-0.5 text-[8px] uppercase tracking-widest text-blue-400 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-full">
                                        Page Break
                                    </span>
                                </div>
                            );
                        }

                        return <div className="mb-4">{children}</div>;
                    },
                    img: (props) => {
                        if (components?.img) {
                            const CustomImg = components.img as any;
                            return <CustomImg {...props} />;
                        }
                        if (!props.src) return null;
                        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                        return <img {...props} />;
                    },
                    a: ({ href, children, ...props }) => {
                        // 1. Highlight Match
                        if (href === "#highlight-match") {
                            return (
                                <span className="bg-yellow-200 dark:bg-yellow-900/50 text-slate-900 dark:text-slate-100 rounded-sm px-0.5 box-decoration-clone">
                                    {children}
                                </span>
                            );
                        }

                        // 1.b. Link Traceability Highlight Match (Pulsating amber, premium glow)
                        if (href === "#link-highlight-match") {
                            return (
                                <span 
                                    id="active-link-highlight"
                                    className="bg-amber-200 dark:bg-amber-950/70 border-b-2 border-amber-500 text-slate-900 dark:text-slate-100 rounded-sm px-1 py-0.5 box-decoration-clone shadow-[0_0_15px_rgba(245,158,11,0.8)] animate-pulse font-semibold"
                                    title={highlight?.targetTitle ? `Linked to: ${highlight.targetTitle} (${highlight.linkTitle || 'related'})` : "Source Selection"}
                                >
                                    {children}
                                </span>
                            );
                        }

                        // 2. Evidence Links
                        if (href?.startsWith("#evidence-")) {
                            const thingId = href.replace("#evidence-", "");
                            return (
                                <span
                                    className="inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded cursor-pointer hover:underline align-middle mx-1"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        selectThing(thingId);
                                        fitView({ nodes: [{ id: thingId }], duration: 800, padding: 0.2 });
                                    }}
                                >
                                    <ExternalLink className="h-3 w-3" />
                                    {children}
                                </span>
                            );
                        }

                        // 3. Transclusions
                        if (href?.startsWith("transclude:")) {
                            const raw = href.replace("transclude:", "");
                            // Split on first '#', but handles cases where there's no fragment
                            // Note: raw might be "uuid" or "uuid#frag"
                            const [nodeId, fragmentId] = raw.includes("#") ? raw.split("#") : [raw, undefined];

                            // Retrieve locking state
                            const state = transclusionStates?.[nodeId];
                            const isLocked = state?.locked === true;
                            const snapshot = state?.snapshot;

                            // Safety check: limit nested transclusion depth
                            if ((ancestorIds?.length || 0) > 10) {
                                return (
                                    <span className="p-2 border border-dashed border-slate-300 rounded text-xs text-slate-400 block w-full text-center">
                                        [Maximum Transclusion Depth Reached]
                                    </span>
                                );
                            }

                            return (
                                <TransclusionBlock
                                    nodeId={nodeId}
                                    fragmentId={fragmentId}
                                    ancestorIds={ancestorIds}
                                    isLocked={isLocked}
                                    snapshotContent={snapshot}
                                    exportMode={exportMode}
                                    onToggleLock={() => {
                                        if (onTransclusionStateChange) {
                                            // Toggle lock state
                                            const newState = {
                                                ...state,
                                                locked: !isLocked,
                                                // If we are locking (was unlocked), we expect parent to capture snapshot.
                                                // If we are unlocking, we clear or ignore snapshot.
                                            };
                                            onTransclusionStateChange(nodeId, newState);
                                        }
                                    }}
                                />
                            );
                        }

                        return (
                            <a
                                href={href}
                                onClick={(e) => {
                                    if (onLinkClick && href) {
                                        e.preventDefault();
                                        onLinkClick(href);
                                    }
                                }}
                                target="_blank"
                                rel="noopener noreferrer"
                                {...props}
                            >
                                {children}
                            </a>
                        );
                    },
                }}
            >
                {processedContent}
            </ReactMarkdown>
        </div >
    );
}

// Wrap in React.memo to prevent re-renders when props haven't changed
// This is critical to preserve text selection state in URL nodes and other markdown content
export const MemoizedMarkdownViewer = React.memo(MarkdownViewer);
