"use client";

import * as React from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MousePointer2, Crop, X } from "lucide-react";
import { cn, API_URL } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TextFragment, RegionFragment } from "./types";
import { Handle, Position } from "reactflow";
import { useCanvasStore } from "../canvas-store";

// Import react-pdf styles for text layer
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { InteractiveOverlayLayer } from "./interactive-overlay-layer";

// Configure PDF.js worker
if (typeof Promise.withResolvers === "undefined") {
    if (typeof window !== "undefined") {
        // @ts-expect-error This does not exist on window.Promise
        window.Promise.withResolvers = function () {
            let resolve, reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        };
    }
}

// Only set worker if not already set to avoid race conditions/resets
if (typeof window !== "undefined") {
    // Log version for debugging
    console.log("[PDFViewer] React-PDF version:", (pdfjs as any).version || "unknown");

    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        // Use local worker with fallback
        // In Next.js, public files are at the root
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        console.log("[PDFViewer] Worker source set to:", pdfjs.GlobalWorkerOptions.workerSrc);
    }
}

// =============================================================================
// Props
// =============================================================================

interface PDFViewerProps {
    /** PDF source - blob URL or regular URL */
    src: string;
    /** Callback when text is selected */
    onSelect?: (fragment: TextFragment | RegionFragment, position?: { x: number; y: number }) => void;
    /** Optional className for styling */
    className?: string;
    /** Whether selection is enabled */
    selectionEnabled?: boolean;
    /** Existing overlays/regions to display */
    overlays?: { id: string; label?: string; x: number; y: number; width: number; height: number; type?: string }[];
    /** Callback when an overlay is resized */
    onOverlayResize?: (id: string, x: number, y: number, width: number, height: number) => void;
    /** Callback when an overlay is deleted */
    onOverlayDelete?: (id: string) => void;
    /** Whether to render in export mode */
    exportMode?: boolean;
    /** Optional fragment to display (crops the view to this region) */
    viewFragment?: RegionFragment;
    /** Optional highlight fragment */
    highlight?: any;
}

// =============================================================================
// PDF Viewer Component
// =============================================================================

// =============================================================================
// PDF Viewer Component
// =============================================================================

export function PDFViewer({
    src,
    onSelect,
    className,
    selectionEnabled = true,
    onOverlayResize,
    onOverlayDelete,
    exportMode = false,
    viewFragment,
    highlight,
    ...props
}: PDFViewerProps) {
    const [numPages, setNumPages] = React.useState<number>(0);
    const [pageNumber, setPageNumber] = React.useState<number>(1);
    const [scale, setScale] = React.useState<number | "page-width">("page-width"); // Default to auto-width
    const [containerWidth, setContainerWidth] = React.useState<number | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const pageContainerRef = React.useRef<HTMLDivElement>(null);

    const [isLoaded, setIsLoaded] = React.useState(false);
    const [pageRenderKey, setPageRenderKey] = React.useState(0);

    // Mode state: 'text' or 'region'
    const [mode, setMode] = React.useState<"text" | "region">("text");

    // Overlays state (local, could be lifted if needed)
    // Map initial overlays using props
    const overlays = props.overlays || [];
    const [activeOverlayId, setActiveOverlayId] = React.useState<string | null>(null);

    // State for secure file source
    const [fileSrc, setFileSrc] = React.useState<string | null>(null);
    const objectUrlRef = React.useRef<string | null>(null);

    // State for page dimensions (needed for viewFragment percentage-to-pixel conversion)
    const [pageDimensions, setPageDimensions] = React.useState<{ width: number; height: number } | null>(null);

    // Effect: Load PDF with Auth if it's a backend asset
    React.useEffect(() => {
        // Cleanup previous object URL
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }

        // Reset state
        setError(null);
        setIsLoading(true);

        const loadFile = async () => {
            // Local blob or external http
            if (src.startsWith("blob:") || src.startsWith("http")) {
                setFileSrc(src);
                return;
            }

            // Backend Asset API
            if (src.startsWith("/api/")) {
                const token = localStorage.getItem("token");
                try {
                    let urlToFetch = src;
                    // Prepend API_URL logic
                    if (API_URL && !src.startsWith("http")) {
                        try {
                            const apiUrlObj = new URL(API_URL);
                            urlToFetch = `${apiUrlObj.origin}${src}`;
                        } catch (e) {
                            // If API_URL is relative (e.g. "/api/v1"), new URL() fails.
                            // We keep urlToFetch as src (relative), allowing Next.js rewrites to handle proxying.
                            // This avoids CORS issues by not forcing a direct cross-origin request to localhost:8000.
                        }
                    }
                    const headers: HeadersInit = {};
                    if (token) {
                        headers["Authorization"] = `Bearer ${token}`;
                    }

                    const res = await fetch(urlToFetch, { headers });
                    if (!res.ok) throw new Error(`Failed to load PDF: ${res.status}`);

                    const blob = await res.blob();
                    console.log("[PDFViewer] Fetched blob:", {
                        size: blob.size,
                        type: blob.type,
                        url: urlToFetch
                    });

                    // Check if it's actually a PDF (first few bytes should be %PDF-)
                    if (blob.size > 10) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const result = e.target?.result;
                            if (result instanceof ArrayBuffer) {
                                const header = new TextDecoder().decode(result.slice(0, 5));
                                console.log("[PDFViewer] PDF Header check:", header);
                                if (header !== "%PDF-") {
                                    console.error("[PDFViewer] CRITICAL: Blob does NOT start with %PDF- header!", header);
                                }
                            }
                        };
                        reader.readAsArrayBuffer(blob.slice(0, 10));
                    }

                    const objectUrl = URL.createObjectURL(blob);
                    objectUrlRef.current = objectUrl;
                    setFileSrc(objectUrl);
                } catch (err: any) {
                    console.error("Failed to load secure PDF:", err);
                    setError(err.message || "Failed to load secure PDF");
                    setIsLoading(false);
                }
            } else {
                setFileSrc(src);
            }
        };

        loadFile();

        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
        };
    }, [src]);

    const highlightTarget = useCanvasStore(state => state.highlightTarget);
    const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);

    // Reset index when target changes
    React.useEffect(() => {
        setCurrentMatchIndex(0);
    }, [highlightTarget]);

    // Auto-navigate to page if highlight target provided (and handle index changes)
    React.useEffect(() => {
        if (!highlightTarget || highlightTarget.length === 0) return;

        // Get current match based on index
        const match = highlightTarget[currentMatchIndex];

        if (match && match.page) {
            // Unify page parsing (handles "1", 1, "Page 1")
            const pStr = match.page.toString().replace(/[^0-9]/g, "");
            const pNum = parseInt(pStr, 10);

            if (!isNaN(pNum) && pNum > 0 && pNum !== pageNumber) {
                setPageNumber(pNum);
            }
        }
    }, [highlightTarget, currentMatchIndex]);

    // Navigate to the page specified in viewFragment
    React.useEffect(() => {
        if (!viewFragment) return;

        const fragmentPageNumber = (viewFragment as any).pageNumber;
        if (fragmentPageNumber && fragmentPageNumber !== pageNumber) {
            console.log("[PDFViewer] Navigating to fragment page", { fragmentPageNumber });
            setPageNumber(fragmentPageNumber);
        }
    }, [viewFragment, pageNumber]);

    // Auto-navigate to highlighted page when highlight changes
    React.useEffect(() => {
        if (!highlight) return;
        
        let targetPage: number | undefined;
        const pNum = highlight.page_number ?? highlight.pageNumber;
        const sIndex = highlight.slide_index ?? highlight.slideIndex;

        if (pNum !== undefined) {
            targetPage = pNum;
        } else if (sIndex !== undefined) {
            targetPage = sIndex + 1; // 0-based slide_index/slideIndex to 1-based page number
        }
        
        if (targetPage && targetPage >= 1 && targetPage <= numPages && targetPage !== pageNumber) {
            console.log("[PDFViewer] Navigating to highlighted page", targetPage);
            setPageNumber(targetPage);
        }
    }, [highlight, numPages, pageNumber]);

    // Highlight matching text spans in the PDF Page's text layer
    React.useEffect(() => {
        if (!highlight || highlight.type !== "text" || !highlight.content) return;

        const timer = setTimeout(() => {
            const container = pageContainerRef.current;
            if (!container) return;

            // Find all text layer spans
            const spans = container.querySelectorAll(".react-pdf__Page__textContent span");
            const highlightText = highlight.content.toLowerCase().trim();

            if (spans.length === 0 || !highlightText) return;

            // Clear previous link highlights
            container.querySelectorAll(".pdf-link-highlight").forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(el.textContent || ""), el);
                }
            });

            spans.forEach(span => {
                const text = span.textContent || "";
                const idx = text.toLowerCase().indexOf(highlightText);
                if (idx !== -1) {
                    const originalText = span.textContent || "";
                    const before = originalText.slice(0, idx);
                    const matched = originalText.slice(idx, idx + highlight.content.length);
                    const after = originalText.slice(idx + highlight.content.length);

                    span.innerHTML = "";
                    if (before) span.appendChild(document.createTextNode(before));
                    
                    const marker = document.createElement("mark");
                    marker.className = "pdf-link-highlight bg-amber-200 dark:bg-amber-900/50 text-slate-900 dark:text-slate-100 rounded px-0.5 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse border border-amber-400 font-semibold";
                    marker.appendChild(document.createTextNode(matched));
                    
                    // Add native tooltip to show context of this link/highlight to resolve ambiguity
                    marker.title = highlight.targetTitle 
                        ? `Linked to: ${highlight.targetTitle} (${highlight.linkTitle || 'related'})` 
                        : "Source Selection";

                    span.appendChild(marker);

                    if (after) span.appendChild(document.createTextNode(after));

                    span.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            });
        }, 100);

        return () => clearTimeout(timer);
    }, [highlight, pageNumber, scale, isLoading, pageRenderKey]);


    // Handle document load success
    const onDocumentLoadSuccess = (pdf: any) => {
        setNumPages(pdf.numPages);
        setIsLoading(false);
        setIsLoaded(true);

        // If we have a viewFragment, get the intrinsic page dimensions
        // for accurate percentage-to-pixel conversion
        if (viewFragment) {
            const targetPage = (viewFragment as any).pageNumber || 1;
            pdf.getPage(targetPage).then((page: any) => {
                const vp = page.getViewport({ scale: 1 });
                console.log("[PDFViewer] Got intrinsic page dimensions", {
                    page: targetPage,
                    intrinsicWidth: vp.width,
                    intrinsicHeight: vp.height,
                });
                setPageDimensions({ width: vp.width, height: vp.height });
            }).catch((err: any) => {
                console.error("[PDFViewer] Failed to get page dimensions:", err);
            });
        }
    };

    // Handle document load error
    const onDocumentLoadError = (err: Error) => {
        console.error("PDF load error:", err);
        setError(err.message || "Failed to load PDF");
        setIsLoading(false);
        setIsLoaded(false);
    };

    // Page navigation
    const goToPrevPage = () => setPageNumber((p) => Math.max(1, p - 1));
    const goToNextPage = () => setPageNumber((p) => Math.min(numPages, p + 1));

    // Zoom controls
    const zoomIn = () => setScale((s) => typeof s === "number" ? Math.min(2.0, s + 0.25) : 1.25);
    const zoomOut = () => setScale((s) => typeof s === "number" ? Math.max(0.5, s - 0.25) : 0.75);

    // Auto-resize observer
    React.useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                setContainerWidth(entry.contentRect.width);
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Handle text selection (ONLY in text mode)
    const handleTextSelection = React.useCallback(() => {
        if (!selectionEnabled || !onSelect || mode !== "text") return;

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const selectedText = selection.toString().trim();
        if (!selectedText) return;

        // Create text fragment with page info
        const fragment: TextFragment = {
            type: "text",
            content: selectedText,
            startOffset: 0,
            endOffset: selectedText.length,
            pageNumber: pageNumber,
        };

        // Calculate screen position for toolbar
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const position = {
            x: rect.left + rect.width / 2,
            y: rect.top
        };

        onSelect(fragment, position);
    }, [onSelect, selectionEnabled, pageNumber, mode]);

    // =========================================================================
    // Region Selection Logic (Delegated to InteractiveOverlayLayer)
    // =========================================================================

    const handleSelectionComplete = async (rect: { x: number; y: number; width: number; height: number; pctX: number; pctY: number; pctW: number; pctH: number }) => {
        if (!pageContainerRef.current) return;
        console.log("[PDFViewer] handleSelectionComplete START", { rect });

        // 1. Capture Image Data
        let base64Content = "";
        try {
            // Target the PDF page canvas specifically. react-pdf adds this class.
            // Target the PDF page canvas specifically.
            // Try specific class first, then generic tag.
            let canvas = pageContainerRef.current.querySelector("canvas.react-pdf__Page__canvas") as HTMLCanvasElement | null;
            if (!canvas) {
                const canvases = pageContainerRef.current.getElementsByTagName("canvas");
                if (canvases.length > 0) {
                    canvas = canvases[0];
                    console.log("[PDFViewer] Found generic canvas", canvas);
                }
            }

            if (!canvas) {
                console.error("[PDFViewer] No canvas found for capture via selector or tag name", pageContainerRef.current);
            }

            if (canvas) {
                // Create a temporary canvas to draw the crop
                const tempCanvas = document.createElement("canvas");
                // We need to account for the canvas scaling (retain quality)
                const canvasRect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / canvasRect.width;
                const scaleY = canvas.height / canvasRect.height;

                // Ensure dimensions are positive
                const targetWidth = Math.max(1, rect.width * scaleX);
                const targetHeight = Math.max(1, rect.height * scaleY);

                tempCanvas.width = targetWidth;
                tempCanvas.height = targetHeight;

                const ctx = tempCanvas.getContext("2d");
                if (ctx) {
                    ctx.drawImage(
                        canvas,
                        rect.x * scaleX, rect.y * scaleY, rect.width * scaleX, rect.height * scaleY,
                        0, 0, targetWidth, targetHeight
                    );
                    base64Content = tempCanvas.toDataURL("image/jpeg");
                }
            } else {
                console.warn("[PDFViewer] No canvas found for capture. DOM content:", pageContainerRef.current.innerHTML.slice(0, 200));
            }
        } catch (err) {
            console.error("Failed to crop PDF region:", err);
        }

        // 2. Create Fragment
        const regionId = Date.now().toString();
        const fragment: RegionFragment = {
            id: regionId,
            type: "region",
            x: rect.pctX,
            y: rect.pctY,
            width: rect.pctW,
            height: rect.pctH,
            content: base64Content,
            slideIndex: pageNumber // Re-use slideIndex or add pageNumber? Type def says pageNumber on TextFragment... let's check types.
            // RegionFragment definition needs pageNumber? 
            // In types.ts: RegionFragment has slideIndex. TextFragment has pageNumber.
            // Let's use slideIndex as a proxy for pageNumber since they are conceptually similar (pages/slides)
            // OR strictly add pageNumber to RegionFragment.
            // Let's check types.ts again.
        };
        // Wait, I should check types.tsx. I can't see it now.
        // Assuming I should add it to the spread or just reuse slideIndex for now if generic.
        // Actually, slideIndex is usually 0-based index. PageNumber is 1-based in PDF.js usually.
        // Let's coerce: slideIndex: pageNumber - 1 ? 
        // PDFViewer uses 'pageNumber' state starting at 1.
        (fragment as any).slideIndex = pageNumber - 1; // Map PDF page 1 -> Index 0 to align with concept of "Index"
        (fragment as any).pageNumber = pageNumber; // Explicitly add both? 

        // 3. Notify Parent
        if (onSelect) {
            // Calculate screen position for toolbar
            const container = pageContainerRef.current;
            const containerRect = container.getBoundingClientRect();

            const screenPos = {
                x: containerRect.left + rect.x + rect.width / 2,
                y: containerRect.top + rect.y + rect.height
            };

            onSelect(fragment, screenPos);
        }

        // Note: We don't need to manually update local overlays here if the parent
        // handles onSelect -> database -> props.overlays cycle properly.
        // If not, we might need ephemeral state. But typically thing.content update loop handles it.
    }

    // Filter overlays for current page logic (TODO based on data)
    // Currently storage doesn't seem to have page info on regions clearly?
    // User request: "overlay on a scanned PDF is an overlay over a long multi-pages scanned document / picture with scrolling"
    // If it's scrolling, we have multiple pages.
    // Current PDFViewer renders ONE page at a time with buttons.
    // So distinct pages.
    // We should filter overlays based on page. But current overlays prop is just a flat list.
    // Assumption: we will eventually add pageIndex to fragments.
    // For now, allow all (might be confusing) or try to adhere to session?
    // Let's pass all but maybe filtered if they have page metadata.
    const currentOverlays = overlays.filter(o => {
        const pNum = (o as any).page_number ?? (o as any).pageNumber;
        if (pNum !== undefined) return pNum === pageNumber;
        const sIndex = (o as any).slide_index ?? (o as any).slideIndex;
        if (sIndex !== undefined) return sIndex === (pageNumber - 1);
        return (pageNumber === 1);
    });

    const handleOverlayAction = (action: 'resize' | 'delete' | 'click', id: string, data?: any) => {
        if (action === 'click') {
            setActiveOverlayId(id);
            // Re-trigger onSelect with FRESH CAPTURE
            const overlay = overlays.find(o => o.id === id);
            if (overlay && onSelect && pageContainerRef.current) {
                // 1. Capture Content again
                let base64Content = "";
                try {
                    const canvas = (pageContainerRef.current.querySelector("canvas.react-pdf__Page__canvas") ||
                        pageContainerRef.current.querySelector("canvas")) as HTMLCanvasElement | null;

                    if (canvas) {
                        const rect = {
                            x: (overlay.x / 100) * canvas.offsetWidth,
                            y: (overlay.y / 100) * canvas.offsetHeight,
                            width: (overlay.width / 100) * canvas.offsetWidth,
                            height: (overlay.height / 100) * canvas.offsetHeight
                        };

                        const tempCanvas = document.createElement("canvas");
                        const scaleX = canvas.width / canvas.offsetWidth;
                        const scaleY = canvas.height / canvas.offsetHeight;
                        const targetWidth = Math.max(1, rect.width * scaleX);
                        const targetHeight = Math.max(1, rect.height * scaleY);

                        tempCanvas.width = targetWidth;
                        tempCanvas.height = targetHeight;

                        const ctx = tempCanvas.getContext("2d");
                        if (ctx) {
                            ctx.drawImage(
                                canvas,
                                rect.x * scaleX, rect.y * scaleY, rect.width * scaleX, rect.height * scaleY,
                                0, 0, targetWidth, targetHeight
                            );
                            base64Content = tempCanvas.toDataURL("image/jpeg");
                        }
                    }
                } catch (e) {
                    console.error("Failed to re-capture region", e);
                }

                const fragment: RegionFragment = {
                    id: overlay.id,
                    type: "region",
                    x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height,
                    content: base64Content || (overlay as any).content // Fallback if capture fails
                };

                const container = pageContainerRef.current;
                const rect = container.getBoundingClientRect();
                const xPx = (overlay.x / 100) * rect.width;
                const yPx = (overlay.y / 100) * rect.height;
                const wPx = (overlay.width / 100) * rect.width;
                const hPx = (overlay.height / 100) * rect.height;

                const screenPos = {
                    x: rect.left + xPx + wPx / 2,
                    y: rect.top + yPx + hPx
                };
                onSelect(fragment, screenPos);
            }
        }
        if (action === 'delete') onOverlayDelete?.(id);
        if (action === 'resize') onOverlayResize?.(id, data.x, data.y, data.width, data.height);
    };

    const handleLoad = () => {
        setIsLoading(true);
        setError(null);
        setIsLoaded(true);
    };

    if (error) {
        return (
            <span className={cn("flex flex-col items-center justify-center p-4 gap-2", className)}>
                <span className="text-sm text-red-500">{error}</span>
                <button
                    onClick={handleLoad}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs"
                >
                    Retry
                </button>
            </span>
        );
    }

    if (!isLoaded && !fileSrc) {
        return (
            <span className={cn("flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-800", className)}>
                {/* Initial loading state waiting for fetch */}
                <span className="text-sm text-muted-foreground">Preparing document...</span>
            </span>
        );
    }

    return (
        <span className={cn("flex flex-col h-full", className)}>
            {/* Controls - Hide in Export Mode */}
            {!exportMode && !viewFragment && (
                <span className="flex items-center justify-between p-2 border-b bg-slate-50 dark:bg-slate-800">
                    {/* Page navigation */}
                    <span className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={goToPrevPage}
                            disabled={pageNumber <= 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm">
                            Page {pageNumber} of {numPages}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={goToNextPage}
                            disabled={pageNumber >= numPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </span>

                    {/* Zoom controls */}
                    <span className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={zoomOut}>
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="text-sm">
                            {scale === "page-width" ? "Auto" : `${Math.round(scale * 100)}%`}
                        </span>
                        <Button variant="ghost" size="sm" onClick={zoomIn}>
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                    </span>

                    {/* Mode Toggles */}
                    <span className="flex items-center gap-1 border-l pl-2 ml-2">
                        <Button
                            variant={mode === "text" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setMode("text")}
                            title="Text Selection Mode"
                            className={mode === "text" ? "bg-slate-200 dark:bg-slate-700" : ""}
                        >
                            <MousePointer2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={mode === "region" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setMode("region")}
                            title="Region Selection Mode"
                            className={mode === "region" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : ""}
                        >
                            <Crop className="h-4 w-4" />
                        </Button>
                    </span>
                </span>
            )}

            {/* PDF content */}
            <span
                className={cn(
                    "flex-1 overflow-auto flex justify-center bg-slate-200 dark:bg-slate-900 block",
                    mode === "text" ? "select-text" : "select-none"
                )}
                onMouseUp={() => { if (mode === "text") handleTextSelection(); }}
            >
                <Document
                    file={fileSrc}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={
                        <span className="flex items-center justify-center p-8 block w-full">
                            <span className="text-sm text-muted-foreground">Loading PDF...</span>
                        </span>
                    }
                >
                    <span ref={pageContainerRef} className="relative mx-auto w-fit block">
                        {exportMode && numPages > 0 ? (
                            /* Export Mode: Render ALL Pages sequentially */
                            <span className="flex flex-col gap-4">
                                {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                                    <Page
                                        key={pageNum}
                                        pageNumber={pageNum}
                                        scale={typeof scale === "number" ? scale : undefined}
                                        width={(scale === "page-width" && containerWidth) ? Math.max(containerWidth - 32, 200) : undefined}
                                        className="shadow-lg mx-auto"
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                        onRenderError={(error) => {
                                            if (error.name === 'AbortException' || error.message.includes('cancelled')) return;
                                            console.error(`Page ${pageNum} render error:`, error);
                                        }}
                                    />
                                ))}
                            </span>
                        ) : (
                            /* Interactive Mode: Render Single Page with Overlays */
                            <InteractiveOverlayLayer
                                overlays={currentOverlays as RegionFragment[]}
                                selectionEnabled={mode === "region" && selectionEnabled}
                                onSelectionComplete={handleSelectionComplete}
                                onOverlayAction={handleOverlayAction}
                                activeOverlayId={activeOverlayId}
                                highlight={highlight}
                            >
                                {viewFragment ? (() => {
                                    // viewFragment coords are percentages (0-100) relative to the rendered page.
                                    // pageDimensions holds INTRINSIC page dims from document load.
                                    // Since containerWidth is null, Page renders at intrinsic scale (scale=1),
                                    // so intrinsic dimensions ARE the rendered dimensions.

                                    if (!pageDimensions) {
                                        return (
                                            <span className="flex items-center justify-center p-4">
                                                <span className="text-sm text-muted-foreground">Loading region...</span>
                                            </span>
                                        );
                                    }

                                    // The rendered page dimensions equal the intrinsic dimensions
                                    // (since no explicit width prop is passed to Page)
                                    const renderedWidth = pageDimensions.width;
                                    const renderedHeight = pageDimensions.height;

                                    // Convert percentages to pixels
                                    const pxX = (viewFragment.x / 100) * renderedWidth;
                                    const pxY = (viewFragment.y / 100) * renderedHeight;
                                    const pxW = (viewFragment.width / 100) * renderedWidth;
                                    const pxH = (viewFragment.height / 100) * renderedHeight;

                                    console.log("[PDFViewer] Cropping region (analytical)", {
                                        fragment: { x: viewFragment.x, y: viewFragment.y, w: viewFragment.width, h: viewFragment.height },
                                        intrinsicDims: pageDimensions,
                                        pixels: { x: pxX, y: pxY, w: pxW, h: pxH },
                                    });

                                    return (
                                        <span
                                            className="block relative overflow-hidden mx-auto"
                                            style={{
                                                width: `${pxW}px`,
                                                height: `${pxH}px`,
                                            }}
                                        >
                                            <span
                                                className="block absolute"
                                                style={{
                                                    left: `-${pxX}px`,
                                                    top: `-${pxY}px`,
                                                }}
                                            >
                                                {pageNumber >= 1 && pageNumber <= numPages ? (
                                                    <Page
                                                        pageNumber={pageNumber}
                                                        className="shadow-lg"
                                                        onRenderError={(error) => {
                                                            if (error.name === 'AbortException' || error.message.includes('cancelled')) {
                                                                return;
                                                            }
                                                            console.error('Page render error:', error);
                                                        }}
                                                        renderTextLayer={false}
                                                        renderAnnotationLayer={false}
                                                    />
                                                ) : (
                                                    <span className="flex items-center justify-center p-4">
                                                        <span className="text-sm text-red-500">Invalid page {pageNumber}</span>
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                    );
                                })() : (
                                    /* Normal full page view */
                                    numPages > 0 && pageNumber >= 1 && pageNumber <= numPages ? (
                                        <Page
                                            pageNumber={pageNumber}
                                            scale={typeof scale === "number" ? scale : undefined}
                                            width={(scale === "page-width" && containerWidth) ? Math.max(containerWidth - 32, 200) : undefined}
                                            className={cn(
                                                "shadow-lg mx-auto",
                                            )}
                                            onRenderError={(error) => {
                                                if (error.name === 'AbortException' || error.message.includes('cancelled')) {
                                                    return;
                                                }
                                                console.error('Page render error:', error);
                                            }}
                                            onRenderSuccess={() => setPageRenderKey(p => p + 1)}
                                            renderTextLayer={(selectionEnabled && mode === "text") || (highlight && highlight.type === "text")}
                                            renderAnnotationLayer={false}
                                        />
                                    ) : (
                                        <span className="flex items-center justify-center p-8">
                                            <span className="text-sm text-muted-foreground">
                                                {numPages === 0 ? "Loading document..." : `Invalid page ${pageNumber}`}
                                            </span>
                                        </span>
                                    )
                                )}
                            </InteractiveOverlayLayer>
                        )}
                    </span>
                </Document>
            </span>
            {/* Match Navigation Floating Toolbar */}
            {highlightTarget && highlightTarget.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-lg rounded-full px-3 py-1.5 flex items-center gap-2 z-50">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        Match {currentMatchIndex + 1} of {highlightTarget.length}
                    </span>
                    <div className="flex items-center border-l border-slate-200 dark:border-slate-700 pl-2 ml-1 gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full"
                            onClick={() => setCurrentMatchIndex(i => Math.max(0, i - 1))}
                            disabled={currentMatchIndex === 0}
                            title="Previous match"
                        >
                            <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full"
                            onClick={() => setCurrentMatchIndex(i => Math.min(highlightTarget.length - 1, i + 1))}
                            disabled={currentMatchIndex === highlightTarget.length - 1}
                            title="Next match"
                        >
                            <ChevronRight className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            )}
        </span>
    );
}




