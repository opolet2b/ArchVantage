/**
 * Image Viewer Component
 *
 * Renders images with region selection capability.
 * Users can draw rectangles to select regions for fragment creation.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { cn, API_URL } from "@/lib/utils";
import type { RegionFragment } from "./types";

// =============================================================================
// Props
// =============================================================================

interface ImageViewerProps {
    /** Image source URL (blob URL or regular URL) */
    src: string;
    /** Alt text for the image */
    alt?: string;
    /** Callback when a region is selected */
    onSelect?: (fragment: RegionFragment) => void;
    /** Optional className for styling */
    className?: string;
    /** Whether selection is enabled */
    selectionEnabled?: boolean;
}

// =============================================================================
// Image Viewer Component
// =============================================================================

export function ImageViewer({
    src,
    alt = "Image",
    onSelect,
    className,
    selectionEnabled = true,
}: ImageViewerProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [isSelecting, setIsSelecting] = React.useState(false);
    const [selectionStart, setSelectionStart] = React.useState<{ x: number; y: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = React.useState<{ x: number; y: number } | null>(null);
    const [currentSelection, setCurrentSelection] = React.useState<RegionFragment | null>(null);

    // Get relative position within container
    const getRelativePosition = (e: React.MouseEvent): { x: number; y: number } | null => {
        const container = containerRef.current;
        if (!container) return null;

        const rect = container.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    // Handle mouse down - start selection
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!selectionEnabled || !onSelect) return;

        const pos = getRelativePosition(e);
        if (!pos) return;

        setIsSelecting(true);
        setSelectionStart(pos);
        setSelectionEnd(pos);
        setCurrentSelection(null);
    };

    // Handle mouse move - update selection
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isSelecting || !selectionStart) return;

        const pos = getRelativePosition(e);
        if (!pos) return;

        setSelectionEnd(pos);
    };

    // Handle mouse up - complete selection
    const handleMouseUp = () => {
        if (!isSelecting || !selectionStart || !selectionEnd || !onSelect) {
            setIsSelecting(false);
            return;
        }

        // Calculate selection rectangle
        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const width = Math.abs(selectionEnd.x - selectionStart.x);
        const height = Math.abs(selectionEnd.y - selectionStart.y);

        // Only create fragment if selection is meaningful (> 10px)
        if (width > 10 && height > 10) {
            const fragment: RegionFragment = {
                type: "region",
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(width),
                height: Math.round(height),
            };

            setCurrentSelection(fragment);
            onSelect(fragment);
        }

        setIsSelecting(false);
    };

    // Calculate selection box style
    const getSelectionBoxStyle = (): React.CSSProperties | undefined => {
        if (!selectionStart || !selectionEnd) return undefined;

        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const width = Math.abs(selectionEnd.x - selectionStart.x);
        const height = Math.abs(selectionEnd.y - selectionStart.y);

        return {
            left: x,
            top: y,
            width,
            height,
        };
    };

    // State for blob URL
    const [imageSrc, setImageSrc] = React.useState<string>(src);
    const [error, setError] = React.useState<boolean>(false);
    const objectUrlRef = React.useRef<string | null>(null); // To keep track of created object URLs for cleanup

    // Effect: Load image with Auth if it's a backend asset
    React.useEffect(() => {
        // Cleanup previous object URL if it exists
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }

        // If it's a Blob URL (already loaded locally) or external URL, no need to fetch
        if (src.startsWith("blob:") || src.startsWith("http")) {
            setImageSrc(src);
            return;
        }

        // If it's a relative API path, we need to fetch with token
        if (src.startsWith("/api/")) {
            const token = localStorage.getItem("token");

            const fetchImage = async () => {
                try {
                    // Prepend backend URL if needed
                    let urlToFetch = src;

                    // If src is relative /api/... and doesn't contain protocol, prepend API_URL (minus the /api/v1 suffix if duplicates)
                    // API_URL is usually http://localhost:8000/api/v1
                    // src is /api/v1/assets/...

                    // To be safe: use fully qualified URL if we know API_URL
                    if (API_URL && !src.startsWith("http")) {
                        // API_URL might be http://localhost:8000/api/v1
                        // We want http://localhost:8000 + src (if src includes /api/v1)
                        // Or if src is /assets/..., we append to API_URL

                        // Parse API_URL to get origin
                        try {
                            const apiUrlObj = new URL(API_URL);
                            urlToFetch = `${apiUrlObj.origin}${src}`;
                        } catch (e) {
                            // If API_URL is relative or invalid, just use it as prefix logic?
                            // Fallback:
                            urlToFetch = src; // Browser will handle relative to current origin (3000)
                            // This is where it fails if no proxy.

                            // Hardcode check: replace /api/ with http://localhost:8000/api/ for dev
                            if (process.env.NODE_ENV === 'development') {
                                urlToFetch = `http://localhost:8000${src}`;
                            }
                        }
                    }

                    const headers: HeadersInit = {};
                    if (token) {
                        headers["Authorization"] = `Bearer ${token}`;
                    }

                    console.log(`[ImageViewer] Fetching secure image: ${urlToFetch}`);
                    const res = await fetch(urlToFetch, {
                        headers
                    });

                    if (!res.ok) throw new Error(`Failed to load image: ${res.status}`);

                    const blob = await res.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    objectUrlRef.current = objectUrl; // Store for cleanup
                    setImageSrc(objectUrl);
                } catch (err) {
                    console.error("Failed to load secure image:", err);
                    setError(true);
                }
            };
            fetchImage();

            return () => {
                // Cleanup function for this specific effect run
                if (objectUrlRef.current) {
                    URL.revokeObjectURL(objectUrlRef.current);
                    objectUrlRef.current = null;
                }
            };
        }
    }, [src]);

    if (error) {
        return (
            <div className={cn("flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500", className)} style={{ minHeight: 200 }}>
                Broken Image
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative inline-block",
                selectionEnabled && "cursor-crosshair",
                className
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => isSelecting && handleMouseUp()}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageSrc}
                alt={alt}
                className="max-w-full h-auto pointer-events-none select-none"
                draggable={false}
            />

            {/* Selection box while dragging */}
            {isSelecting && selectionStart && selectionEnd && (
                <div
                    className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
                    style={getSelectionBoxStyle()}
                />
            )}

            {/* Completed selection display */}
            {currentSelection && !isSelecting && (
                <div
                    className="absolute border-2 border-green-500 bg-green-500/20 pointer-events-none"
                    style={{
                        left: currentSelection.x,
                        top: currentSelection.y,
                        width: currentSelection.width,
                        height: currentSelection.height,
                    }}
                >
                    <span className="absolute -top-5 left-0 text-xs bg-green-500 text-white px-1 rounded">
                        {currentSelection.width}×{currentSelection.height}
                    </span>
                </div>
            )}
        </div>
    );
}
