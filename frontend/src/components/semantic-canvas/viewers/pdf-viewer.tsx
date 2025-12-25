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

console.log("[PDFViewer] React-PDF pdfjs.version:", pdfjs.version);
// Use CDN worker to avoid local bundle issues and race conditions
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

    // Region selection state
    const [isSelecting, setIsSelecting] = React.useState(false);
    const [selectionStart, setSelectionStart] = React.useState<{ x: number; y: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = React.useState<{ x: number; y: number } | null>(null);

    // Overlays state (local, could be lifted if needed)
    // Map initial overlays to include potential content if not present
    const [overlays, setOverlays] = React.useState<any[]>(props.overlays || []);
    const [activeOverlayId, setActiveOverlayId] = React.useState<string | null>(null);

    // Sync props.overlays to state if they change (optional, depending on if controlled/uncontrolled)
    React.useEffect(() => {
        if (props.overlays) {
            setOverlays(props.overlays);
        }
    }, [props.overlays]);


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
    // Region Selection Logic
    // =========================================================================

    const getRelativePosition = (e: React.MouseEvent): { x: number; y: number } | null => {
        const container = pageContainerRef.current;
        if (!container) return null;

        const rect = container.getBoundingClientRect();

        // Coordinates relative to the Page container
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (mode !== "region" || !selectionEnabled) return;

        // Clear active overlay when clicking background
        setActiveOverlayId(null);
        e.preventDefault(); // Prevent text selection in region mode

        const pos = getRelativePosition(e);
        if (!pos) return;

        setIsSelecting(true);
        setSelectionStart(pos);
        setSelectionEnd(pos);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isSelecting || !selectionStart) return;

        const pos = getRelativePosition(e);
        if (!pos) return;

        setSelectionEnd(pos);
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        // If we are selecting region
        if (isSelecting && selectionStart && selectionEnd && mode === "region") {
            finishRegionSelection();
            return;
        }

        // If not selecting region, generally we let native events handle text selection
        // But we check here in case.
        if (mode === "text") {
            handleTextSelection();
        }
    };

    const finishRegionSelection = async () => {
        if (!selectionStart || !selectionEnd || !pageContainerRef.current) {
            setIsSelecting(false);
            return;
        }

        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const width = Math.abs(selectionEnd.x - selectionStart.x);
        const height = Math.abs(selectionEnd.y - selectionStart.y);

        if (width > 10 && height > 10) {
            // 1. Capture Image Data
            let base64Content = "";
            try {
                // Find the canvas element inside the page container
                const canvas = pageContainerRef.current.querySelector("canvas");
                if (canvas) {
                    // Create a temporary canvas to draw the crop
                    const tempCanvas = document.createElement("canvas");
                    // We need to account for the canvas scaling (retain quality)
                    const scaleX = canvas.width / canvas.offsetWidth;
                    const scaleY = canvas.height / canvas.offsetHeight;

                    tempCanvas.width = width * scaleX;
                    tempCanvas.height = height * scaleY;

                    const ctx = tempCanvas.getContext("2d");
                    if (ctx) {
                        ctx.drawImage(
                            canvas,
                            x * scaleX, y * scaleY, width * scaleX, height * scaleY,
                            0, 0, width * scaleX, height * scaleY
                        );
                        base64Content = tempCanvas.toDataURL("image/jpeg");
                    }
                }
            } catch (err) {
                console.error("Failed to crop PDF region:", err);
            }

            // 2. Create Fragment
            // Percentage coordinates for storing
            const container = pageContainerRef.current;
            const pctX = (x / container.offsetWidth) * 100;
            const pctY = (y / container.offsetHeight) * 100;
            const pctW = (width / container.offsetWidth) * 100;
            const pctH = (height / container.offsetHeight) * 100;

            const regionId = Date.now().toString();
            // Store content in the fragment
            const fragment: RegionFragment = {
                id: regionId,
                type: "region",
                x: pctX,
                y: pctY,
                width: pctW,
                height: pctH,
                content: base64Content
            };

            // 3. Add to local overlays for visual feedback
            // We use the ID as the label initially if none provided
            const newOverlay = {
                id: regionId,
                label: regionId,
                x: pctX, y: pctY, width: pctW, height: pctH,
                content: base64Content
            };
            setOverlays(prev => [...prev, newOverlay]);
            setActiveOverlayId(regionId);

            // 4. Notify Parent
            if (onSelect) {
                // Calculate screen position for toolbar
                const rect = container.getBoundingClientRect();
                const screenPos = {
                    x: rect.left + x + width / 2,
                    y: rect.top + y + height
                };

                onSelect(fragment, screenPos);
            }
        }

        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
    };

    // Handler for overlay resizing
    const handleOverlayResize = (id: string, x: number, y: number, width: number, height: number) => {
        if (onOverlayResize) {
            onOverlayResize(id, x, y, width, height);
        } else {
            setOverlays(prev => prev.map(o =>
                o.id === id ? { ...o, x, y, width, height } : o
            ));
        }
    };

    // Manual load handler
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
                    mode === "text" ? "select-text" : "select-none cursor-crosshair"
                )}
                onMouseUp={handleMouseUp}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setIsSelecting(false)}
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
                        <Page
                            pageNumber={pageNumber}
                            scale={typeof scale === "number" ? scale : undefined}
                            width={(scale === "page-width" && containerWidth) ? Math.max(containerWidth - 32, 200) : undefined}
                            className={cn(
                                "shadow-lg mx-auto",
                                mode === "region" && "pointer-events-none" // Disable text selection events in region mode
                            )}
                            renderTextLayer={selectionEnabled && mode === "text"} // Only render text layer if text mode
                            renderAnnotationLayer={false}
                        />

                        {/* Region Selection Overlay Container */}
                        <div className="absolute inset-0 pointer-events-none">
                            {/* Selection Box */}
                            {isSelecting && selectionStart && selectionEnd && (
                                <div
                                    className="absolute border-2 border-green-500 bg-green-500/20"
                                    style={{
                                        left: Math.min(selectionStart.x, selectionEnd.x),
                                        top: Math.min(selectionStart.y, selectionEnd.y),
                                        width: Math.abs(selectionEnd.x - selectionStart.x),
                                        height: Math.abs(selectionEnd.y - selectionStart.y),
                                    }}
                                />
                            )}

                            {/* Existing Overlays */}
                            {overlays.map((overlay) => (
                                <OverlayItem
                                    key={overlay.id}
                                    overlay={overlay}
                                    isActive={activeOverlayId === overlay.id}
                                    onResizeProp={handleOverlayResize}
                                    onDeleteProp={(id) => {
                                        if (onOverlayDelete) {
                                            onOverlayDelete(id);
                                        } else {
                                            setOverlays(prev => prev.filter(o => o.id !== id));
                                        }
                                        setActiveOverlayId(null);
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveOverlayId(overlay.id);
                                        // Re-trigger onSelect for this region
                                        if (onSelect && pageContainerRef.current) {
                                            const fragment: RegionFragment = {
                                                id: overlay.id,
                                                type: "region",
                                                x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height,
                                                content: overlay.content
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

                                            // @ts-ignore
                                            onSelect(fragment, screenPos);
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </Document>
            </div >
        </div >
    );
}

// =============================================================================
// Overlay Item Component (Resizeable version for PDF)
// =============================================================================

function OverlayItem({
    overlay,
    isActive,
    onResizeProp,
    onDeleteProp,
    onClick
}: {
    overlay: { id: string; label?: string; x: number; y: number; width: number; height: number };
    isActive: boolean;
    onResizeProp?: (id: string, x: number, y: number, width: number, height: number) => void;
    onDeleteProp?: (id: string) => void;
    onClick?: (e: React.MouseEvent) => void;
}) {
    // Local state for smooth resizing without updating parent on every pixel
    const [localOverlay, setLocalOverlay] = React.useState(overlay);

    // Sync local state when prop updates
    React.useEffect(() => {
        setLocalOverlay(overlay);
    }, [overlay]);

    // Check if we have a label to display (prefer label, fallback to ID if active/requested)
    // The requirement is "green box should have as title the ID of the fragment"
    const displayLabel = overlay.label || overlay.id;

    // Refs for drag math
    const containerRef = React.useRef<HTMLDivElement>(null);
    const startPosRef = React.useRef<{ x: number, y: number, w: number, h: number } | null>(null);
    const mouseStartRef = React.useRef<{ x: number, y: number } | null>(null);
    const handleRef = React.useRef<string | null>(null);

    const handleMouseDown = (e: React.MouseEvent, handleType: string) => {
        e.stopPropagation();
        e.preventDefault();

        handleRef.current = handleType;
        // Use current LOCAL state as start
        startPosRef.current = { x: localOverlay.x, y: localOverlay.y, w: localOverlay.width, h: localOverlay.height };
        mouseStartRef.current = { x: e.clientX, y: e.clientY };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!handleRef.current || !startPosRef.current || !mouseStartRef.current || !containerRef.current) return;

        // Get container dimensions to convert px -> %
        const container = containerRef.current.offsetParent as HTMLElement;
        if (!container) return;

        const containerW = container.offsetWidth;
        const containerH = container.offsetHeight;
        if (containerW === 0 || containerH === 0) return;

        // No zoom scaling issues here typically because the container itself scales, 
        // but let's check if there's a transform on the page?
        // In PDF page, the page itself is scaled via React-PDF's scale prop usually on canvas/text layer.
        // Our overlays are just children of absolute div.
        // If the container is the Page wrapper, its CSS width/height match the rendered size.
        // So simple px -> % conversion should work if event.clientX is handled relative to viewport.

        // We calculate delta in px
        const deltaX_px = e.clientX - mouseStartRef.current.x;
        const deltaY_px = e.clientY - mouseStartRef.current.y;

        const deltaX_pct = (deltaX_px / containerW) * 100;
        const deltaY_pct = (deltaY_px / containerH) * 100;

        let newX = startPosRef.current.x;
        let newY = startPosRef.current.y;
        let newW = startPosRef.current.w;
        let newH = startPosRef.current.h;

        // Apply resize logic based on handle
        if (handleRef.current.includes("e")) { // East
            newW = Math.max(2, startPosRef.current.w + deltaX_pct);
        }
        if (handleRef.current.includes("s")) { // South
            newH = Math.max(2, startPosRef.current.h + deltaY_pct);
        }
        if (handleRef.current.includes("w")) { // West
            const maxDelta = startPosRef.current.w - 2;
            const d = Math.min(maxDelta, deltaX_pct);
            newX = startPosRef.current.x + d;
            newW = startPosRef.current.w - d;
        }
        if (handleRef.current.includes("n")) { // North
            const maxDelta = startPosRef.current.h - 2;
            const d = Math.min(maxDelta, deltaY_pct);
            newY = startPosRef.current.y + d;
            newH = startPosRef.current.h - d;
        }

        // Update LOCAL state only (visual feedback)
        setLocalOverlay(prev => ({ ...prev, x: newX, y: newY, width: newW, height: newH }));
    };

    // We need a ref to track the latest overlay state to commit it
    const latestOverlayRef = React.useRef(localOverlay);
    React.useEffect(() => { latestOverlayRef.current = localOverlay; }, [localOverlay]);

    const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        handleRef.current = null;

        // Commit the change
        if (onResizeProp) {
            const final = latestOverlayRef.current;
            onResizeProp(final.id, final.x, final.y, final.width, final.height);
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn(
                "absolute border-2 pointer-events-auto group transition-colors cursor-pointer",
                isActive ? "border-green-400 z-20 bg-green-500/10" : "border-green-600/50 z-10 hover:border-green-500"
            )}
            style={{
                left: `${localOverlay.x}%`,
                top: `${localOverlay.y}%`,
                width: `${localOverlay.width}%`,
                height: `${localOverlay.height}%`,
            }}
            onMouseDown={(e) => {
                e.stopPropagation();
                onClick?.(e);
            }}
        >
            {/* Label */}
            {displayLabel && (
                <span className="absolute -top-6 left-0 text-xs bg-slate-800 text-white px-2 py-1 rounded shadow overflow-hidden max-w-full truncate whitespace-nowrap z-50">
                    {displayLabel}
                </span>
            )}

            {/* Controls - Only visible when ACTIVE */}
            {isActive && (
                <>
                    {/* Delete Button */}
                    <button
                        className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-600 transition-colors z-50"
                        title="Delete Region"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProp?.(overlay.id);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <X className="h-3 w-3" />
                    </button>

                    {/* Resize Handles (Corners) */}
                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-white border border-green-600 cursor-nw-resize z-40" onMouseDown={(e) => handleMouseDown(e, "nw")} />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-white border border-green-600 cursor-ne-resize z-40" onMouseDown={(e) => handleMouseDown(e, "ne")} />
                    <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border border-green-600 cursor-sw-resize z-40" onMouseDown={(e) => handleMouseDown(e, "sw")} />
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-green-600 cursor-se-resize z-40" onMouseDown={(e) => handleMouseDown(e, "se")} />
                </>
            )}
        </div>
    );
}
