/**
 * PDF Viewer Component
 *
 * Renders PDF documents with page navigation and text selection.
 * Uses react-pdf for rendering.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { cn, API_URL } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TextFragment } from "./types";

// Import react-pdf styles for text layer
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Configure PDF.js worker - use unpkg for ESM module
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
).toString();

// =============================================================================
// Props
// =============================================================================

interface PDFViewerProps {
    /** PDF source - blob URL or regular URL */
    src: string;
    /** Callback when text is selected */
    onSelect?: (fragment: TextFragment) => void;
    /** Optional className for styling */
    className?: string;
    /** Whether selection is enabled */
    selectionEnabled?: boolean;
}

// =============================================================================
// PDF Viewer Component
// =============================================================================

export function PDFViewer({
    src,
    onSelect,
    className,
    selectionEnabled = true,
}: PDFViewerProps) {
    const [numPages, setNumPages] = React.useState<number>(0);
    const [pageNumber, setPageNumber] = React.useState<number>(1);
    const [scale, setScale] = React.useState<number>(0.75);  // Start smaller for performance
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const [isLoaded, setIsLoaded] = React.useState(false);

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
                } catch (err) {
                    console.error("Failed to load secure PDF:", err);
                    setError("Failed to load secure PDF");
                    setIsLoading(false);
                }
            } else {
                // Fallback for relative paths?
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
        setIsLoaded(true); // Ensure loaded state is true
    };

    // Handle document load error
    const onDocumentLoadError = (err: Error) => {
        console.error("PDF load error:", err);
        setError("Failed to load PDF");
        setIsLoading(false);
        setIsLoaded(false);
    };

    // Page navigation
    const goToPrevPage = () => setPageNumber((p) => Math.max(1, p - 1));
    const goToNextPage = () => setPageNumber((p) => Math.min(numPages, p + 1));

    // Zoom controls
    const zoomIn = () => setScale((s) => Math.min(2.0, s + 0.25));
    const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.25));

    // Handle text selection
    const handleMouseUp = React.useCallback(() => {
        if (!selectionEnabled || !onSelect) return;

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

        onSelect(fragment);
    }, [onSelect, selectionEnabled, pageNumber]);

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
                    <span className="text-sm">{Math.round(scale * 100)}%</span>
                    <Button variant="ghost" size="sm" onClick={zoomIn}>
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* PDF content */}
            <div
                ref={containerRef}
                className="flex-1 overflow-auto flex justify-center bg-slate-200 dark:bg-slate-900"
                onMouseUp={handleMouseUp}
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
                    <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        className="shadow-lg"
                        renderTextLayer={selectionEnabled}
                        renderAnnotationLayer={false}
                    />
                </Document>
            </div>
        </div>
    );
}
