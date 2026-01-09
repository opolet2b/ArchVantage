"use client";

import * as React from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MousePointer2, Crop, X } from "lucide-react";
import { cn, API_URL } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TextFragment, RegionFragment } from "./types";
import { Handle, Position } from "reactflow";

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
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    console.log("[PDFViewer] Setting PDF.js worker source (Local)");
    // Use local worker copied to public folder to ensure version match and avoid UNPKG issues
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
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

    // Mode state: 'text' or 'region'
    const [mode, setMode] = React.useState<"text" | "region">("text");

    // Overlays state (local, could be lifted if needed)
    // Map initial overlays using props
    const overlays = props.overlays || [];
    const [activeOverlayId, setActiveOverlayId] = React.useState<string | null>(null);

    // State for secure file source
    const [fileSrc, setFileSrc] = React.useState<string | null>(null);
    const objectUrlRef = React.useRef<string | null>(null);

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
                            if (process.env.NODE_ENV === 'development') {
                                urlToFetch = `http://localhost:8000${src}`;
                            }
                        }
                    }

                    console.log(`[PDFViewer] Fetching secure PDF: ${urlToFetch}`);
                    const headers: HeadersInit = {};
                    if (token) {
                        headers["Authorization"] = `Bearer ${token}`;
                    }

                    const res = await fetch(urlToFetch, { headers });
                    if (!res.ok) throw new Error(`Failed to load PDF: ${res.status}`);

                    const blob = await res.blob();
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


    // Handle document load success
    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setIsLoading(false);
        setIsLoaded(true);
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

        console.log("[PDFViewer] Text selected:", fragment);
        onSelect(fragment);
    }, [onSelect, selectionEnabled, pageNumber, mode]);

    // =========================================================================
    // Region Selection Logic (Delegated to InteractiveOverlayLayer)
    // =========================================================================

    const handleSelectionComplete = async (rect: { x: number; y: number; width: number; height: number; pctX: number; pctY: number; pctW: number; pctH: number }) => {
        if (!pageContainerRef.current) return;

        // 1. Capture Image Data
        let base64Content = "";
        try {
            // Target the PDF page canvas specifically. react-pdf adds this class.
            const canvas = (pageContainerRef.current.querySelector("canvas.react-pdf__Page__canvas") ||
                pageContainerRef.current.querySelector("canvas")) as HTMLCanvasElement | null;

            if (canvas) {
                console.log(`[PDFViewer] Found canvas for capture: ${canvas.width}x${canvas.height}`);

                // Create a temporary canvas to draw the crop
                const tempCanvas = document.createElement("canvas");
                // We need to account for the canvas scaling (retain quality)
                const scaleX = canvas.width / canvas.offsetWidth;
                const scaleY = canvas.height / canvas.offsetHeight;

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
                    console.log(`[PDFViewer] Accessing captured content length: ${base64Content.length}`);
                }
            } else {
                console.warn("[PDFViewer] No canvas found for capture via querySelector");
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
        // If overlay has no pageNumber, show it? Or assume page 1?
        // Let's rely on backend storing page info.
        // For compatibility with current implementation:
        if ((o as any).pageNumber !== undefined) {
            return (o as any).pageNumber === pageNumber;
        }
        // If no page number, maybe it was created on "current" page so user expects it here?
        // Or maybe it's global?
        // Let's show it to prevent data hiding, but this is a TODO for the user data model.
        return true;
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
                            console.log(`[PDFViewer] Re-captured content for existing region: ${base64Content.length}`);
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
            <div className={cn("flex flex-col items-center justify-center p-4 gap-2", className)}>
                <span className="text-sm text-red-500">{error}</span>
                <button
                    onClick={handleLoad}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!isLoaded && !fileSrc) {
        return (
            <div className={cn("flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-800", className)}>
                {/* Initial loading state waiting for fetch */}
                <span className="text-sm text-muted-foreground">Preparing document...</span>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Controls */}
            <div className="flex items-center justify-between p-2 border-b bg-slate-50 dark:bg-slate-800">
                {/* Page navigation */}
                <div className="flex items-center gap-2">
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
                </div>

                {/* Zoom controls */}
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={zoomOut}>
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                        {scale === "page-width" ? "Auto" : `${Math.round(scale * 100)}%`}
                    </span>
                    <Button variant="ghost" size="sm" onClick={zoomIn}>
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>

                {/* Mode Toggles */}
                <div className="flex items-center gap-1 border-l pl-2 ml-2">
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
                </div>
            </div>

            {/* PDF content */}
            <div
                className={cn(
                    "flex-1 overflow-auto flex justify-center bg-slate-200 dark:bg-slate-900",
                    mode === "text" ? "select-text" : "select-none"
                )}
                // We handle region selection via the overlay layer now, but text selection locally?
                // The overlay layer captures events if we put it ON TOP.
                // We should put OverlayLayer INSIDE the Page Wrapper.
                // Text selection needs native events. InteractiveOverlayLayer stops propagation if enabled?
                // No, it only stops if it handles it.
                // We need to disable OverlayLayer pointer events if mode === "text"?
                // Or pass `selectionEnabled={mode === 'region'}`
                onMouseUp={() => { if (mode === "text") handleTextSelection(); }}
            >
                <Document
                    file={fileSrc}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={
                        <div className="flex items-center justify-center p-8">
                            <span className="text-sm text-muted-foreground">Loading PDF...</span>
                        </div>
                    }
                >
                    <div ref={pageContainerRef} className="relative mx-auto w-fit">
                        {/* We Wrap the Page with InteractiveOverlayLayer */}
                        <InteractiveOverlayLayer
                            overlays={currentOverlays as RegionFragment[]}
                            selectionEnabled={mode === "region" && selectionEnabled}
                            onSelectionComplete={handleSelectionComplete}
                            onOverlayAction={handleOverlayAction}
                            activeOverlayId={activeOverlayId}
                        >
                            <Page
                                pageNumber={pageNumber}
                                scale={typeof scale === "number" ? scale : undefined}
                                width={(scale === "page-width" && containerWidth) ? Math.max(containerWidth - 32, 200) : undefined}
                                className={cn(
                                    "shadow-lg mx-auto",
                                    // Pointer events for text selection if needed
                                    // mode === "region" && "pointer-events-none" // OverlayLayer handles region events, but we need text selection
                                )}
                                renderTextLayer={selectionEnabled && mode === "text"}
                                renderAnnotationLayer={false}
                            />
                        </InteractiveOverlayLayer>
                    </div>
                </Document>
            </div >
        </div >
    );
}




