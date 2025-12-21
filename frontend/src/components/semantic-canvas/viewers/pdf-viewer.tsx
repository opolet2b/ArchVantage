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
import { cn } from "@/lib/utils";
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

    // Handle document load success
    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setIsLoading(false);
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

    if (!isLoaded) {
        return (
            <div className={cn("flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-800", className)}>
                <button
                    onClick={handleLoad}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-md text-sm font-medium transition-colors"
                >
                    Load PDF Document
                </button>
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
                    file={src}
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
