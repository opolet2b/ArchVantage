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
    /** Existing overlays/regions to display */
    overlays?: { id: string; label?: string; x: number; y: number; width: number; height: number }[];
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
    overlays = [],
}: ImageViewerProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const imageRef = React.useRef<HTMLImageElement>(null);
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

        // Calculate selection rectangle in screen pixels
        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const width = Math.abs(selectionEnd.x - selectionStart.x);
        const height = Math.abs(selectionEnd.y - selectionStart.y);

        // Only create fragment if selection is meaningful (> 10px)
        if (width > 10 && height > 10 && imageRef.current) {
            const img = imageRef.current;

            // Calculate scale factors
            const scaleX = img.naturalWidth / img.width;
            const scaleY = img.naturalHeight / img.height;

            // Calculate natural coordinates for cropping
            const naturalX = x * scaleX;
            const naturalY = y * scaleY;
            const naturalWidth = width * scaleX;
            const naturalHeight = height * scaleY;

            // Generate Base64 crop
            let base64Content = "";
            try {
                const canvas = document.createElement("canvas");
                canvas.width = naturalWidth;
                canvas.height = naturalHeight;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    ctx.drawImage(
                        img,
                        naturalX, naturalY, naturalWidth, naturalHeight,
                        0, 0, naturalWidth, naturalHeight
                    );
                    base64Content = canvas.toDataURL("image/jpeg");
                }
            } catch (e) {
                console.error("Failed to crop image:", e);
            }

            // Calculate percentages (0-100) for robust storage
            const pctX = (x / img.width) * 100;
            const pctY = (y / img.height) * 100;
            const pctW = (width / img.width) * 100;
            const pctH = (height / img.height) * 100;

            const fragment: RegionFragment = {
                type: "region",
                x: pctX,
                y: pctY,
                width: pctW,
                height: pctH,
                content: base64Content // Store cropped image data here!
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
                ref={imageRef}
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
                        left: `${currentSelection.x}%`,
                        top: `${currentSelection.y}%`,
                        width: `${currentSelection.width}%`,
                        height: `${currentSelection.height}%`,
                    }}
                >
                    <span className="absolute -top-5 left-0 text-xs bg-green-500 text-white px-1 rounded">
                        Selection
                    </span>
                </div>
            )}

            {/* Existing Overlays */}
            {overlays.map((overlay) => (
                <div
                    key={overlay.id}
                    className="absolute border-2 border-yellow-500 bg-yellow-500/10 pointer-events-auto cursor-pointer hover:bg-yellow-500/30 transition-colors group"
                    style={{
                        left: `${overlay.x}%`,
                        top: `${overlay.y}%`,
                        width: `${overlay.width}%`,
                        height: `${overlay.height}%`,
                    }}
                    title={overlay.label || "Linked Region"}
                >
                    {overlay.label && (
                        <span className="absolute -top-6 left-0 text-xs bg-yellow-500 text-black px-1 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            {overlay.label}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

