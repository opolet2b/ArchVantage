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
    onSelect?: (fragment: RegionFragment, position?: { x: number; y: number }) => void;
    /** Optional className for styling */
    className?: string;
    /** Whether selection is enabled */
    selectionEnabled?: boolean;
    /** Optional callback when an overlay is resized */
    onOverlayResize?: (id: string, x: number, y: number, width: number, height: number) => void;
    /** Optional callback when an overlay is deleted */
    onOverlayDelete?: (id: string) => void;
    /** Optional callback when an overlay is clicked */
    onOverlayClick?: (overlay: any) => void;
    /** Existing overlays/regions to display */
    overlays?: { id: string; label?: string; x: number; y: number; width: number; height: number; type?: string }[];
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
    onOverlayResize,
    onOverlayDelete,
    onOverlayClick,
}: ImageViewerProps) {
    const imageRef = React.useRef<HTMLImageElement>(null);
    // Don't initialize with src if it's an API asset - let useEffect fetch with auth
    const isApiAsset = src?.startsWith("/api/") || src?.includes("/api/v1/assets/");
    const [imageSrc, setImageSrc] = React.useState<string>(isApiAsset ? "" : src);
    const [error, setError] = React.useState<boolean>(false);
    const [loading, setLoading] = React.useState<boolean>(isApiAsset);
    const objectUrlRef = React.useRef<string | null>(null);

    // Effect: Load image with Auth if it's a backend asset
    React.useEffect(() => {
        if (!src) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

        // Blob URLs - use directly
        if (src.startsWith("blob:")) {
            setImageSrc(src);
            return;
        }

        // Check if this is an API asset URL (either relative or full HTTP)
        const isApiAsset = src.startsWith("/api/") || src.includes("/api/v1/assets/");

        if (isApiAsset) {
            const fetchImage = async () => {
                try {
                    const token = localStorage.getItem("token");
                    let urlToFetch = src;

                    // If it's a relative URL starting with /api/, we can just fetch it directly.
                    // The browser will prepend the current origin.
                    // This avoids issues with new URL(relative_api_url) crashing.
                    if (src.startsWith("/api/")) {
                        urlToFetch = src;
                    } else if (src.includes("/api/v1/assets/")) {
                        // If it's a full URL but for our API assets, we might want to ensure it's on our origin
                        // but usually the passed src is already what we want.
                        // Let's keep it simple: use src as is.
                        urlToFetch = src;
                    }

                    const res = await fetch(urlToFetch, {
                        headers: token ? { "Authorization": `Bearer ${token}` } : {}
                    });

                    if (!res.ok) {
                        console.error(`[ImageViewer] Failed to load image: ${res.status} ${res.statusText}`);
                        throw new Error(`Failed to load: ${res.status}`);
                    }

                    const blob = await res.blob();
                    objectUrlRef.current = URL.createObjectURL(blob);
                    setImageSrc(objectUrlRef.current);
                    setLoading(false);
                } catch (err) {
                    console.error("Failed to load secure image:", err);
                    setError(true);
                    setLoading(false);
                }
            };
            fetchImage();
            return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
        }

        // Regular HTTP URL (not an API asset) - use directly
        if (src.startsWith("http")) {
            setImageSrc(src);
            return;
        }
    }, [src]);

    if (error) {
        return <div className={cn("flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500", className)} style={{ minHeight: 200 }}>Broken Image</div>;
    }

    if (loading || !imageSrc) {
        return <div className={cn("flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 animate-pulse", className)} style={{ minHeight: 200 }}>Loading...</div>;
    }

    const handleSelectionComplete = async (rect: { x: number; y: number; width: number; height: number; pctX: number; pctY: number; pctW: number; pctH: number }) => {
        if (!imageRef.current) return;
        const img = imageRef.current; // The <img> element rendered below

        // Helper to grab natural dimensions crop
        // The InteractiveOverlayLayer passes us the CSS pixel rect relative to the container.
        // We need to map this to natural image coordinates for the crop.

        // Scale factors: Natural / Rendered
        const scaleX = img.naturalWidth / img.width;
        const scaleY = img.naturalHeight / img.height;

        const naturalX = rect.x * scaleX;
        const naturalY = rect.y * scaleY;
        const naturalWidth = rect.width * scaleX;
        const naturalHeight = rect.height * scaleY;

        let base64Content = "";
        try {
            const canvas = document.createElement("canvas");
            canvas.width = naturalWidth;
            canvas.height = naturalHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(img, naturalX, naturalY, naturalWidth, naturalHeight, 0, 0, naturalWidth, naturalHeight);
                base64Content = canvas.toDataURL("image/jpeg");
            }
        } catch (e) {
            console.error("Failed to crop image:", e);
        }

        const regionId = Date.now().toString();
        const fragment: RegionFragment = {
            id: regionId,
            type: "region",
            x: rect.pctX,
            y: rect.pctY,
            width: rect.pctW,
            height: rect.pctH,
            content: base64Content
        };

        if (onSelect) {
            // Calculate screen position for toolbar.
            // We can get client rect of the image to add offset?
            // Actually, best to let the parent handle or pass relative?
            // Existing logic expected screen/page coordinates.
            // We can approximate or just pass undefined and let parent handle relative?
            // Let's reconstruct page coordinates from the event equivalent?
            // Or simpler: Pass null and let SelectionToolbar handle simple positioning?
            // Re-calculating:
            const imgRect = img.getBoundingClientRect();
            const screenPos = {
                x: imgRect.left + rect.x + rect.width / 2,
                y: imgRect.top + rect.y + rect.height
            };
            onSelect(fragment, screenPos);
        }
    };

    return (
        <InteractiveOverlayLayer
            className={cn("w-full h-full bg-slate-100 dark:bg-slate-900", className)}
            overlays={overlays as RegionFragment[]} // Cast to match type
            selectionEnabled={selectionEnabled}
            onSelectionComplete={handleSelectionComplete}
            onOverlayAction={(action, id, data) => {
                if (action === 'delete') onOverlayDelete?.(id);
                if (action === 'resize') onOverlayResize?.(id, data.x, data.y, data.width, data.height);
                if (action === 'click') {
                    // Reconstruct fragment and call onSelect to trigger toolbar
                    const ov = overlays.find(o => o.id === id);
                    if (ov && onSelect && imageRef.current) {
                        const img = imageRef.current;

                        // Re-capture content for existing region to ensure it's propagated
                        let base64Content = (ov as any).content || "";
                        try {
                            // Scale factors: Natural / Rendered
                            const scaleX = img.naturalWidth / img.width;
                            const scaleY = img.naturalHeight / img.height;

                            // Map percentage to pixels
                            const pixelX = (ov.x / 100) * img.width;
                            const pixelY = (ov.y / 100) * img.height;
                            const pixelW = (ov.width / 100) * img.width;
                            const pixelH = (ov.height / 100) * img.height;

                            const naturalX = pixelX * scaleX;
                            const naturalY = pixelY * scaleY;
                            const naturalWidth = pixelW * scaleX;
                            const naturalHeight = pixelH * scaleY;

                            const canvas = document.createElement("canvas");
                            canvas.width = naturalWidth;
                            canvas.height = naturalHeight;
                            const ctx = canvas.getContext("2d");
                            if (ctx) {
                                ctx.drawImage(img, naturalX, naturalY, naturalWidth, naturalHeight, 0, 0, naturalWidth, naturalHeight);
                                base64Content = canvas.toDataURL("image/jpeg");
                            }
                        } catch (e) {
                            console.error("Failed to re-capture region:", e);
                        }

                        const fragment: RegionFragment = {
                            id: ov.id,
                            type: "region",
                            x: ov.x,
                            y: ov.y,
                            width: ov.width,
                            height: ov.height,
                            content: base64Content
                        };

                        // Calculate screen position for toolbar
                        const rect = img.getBoundingClientRect();
                        const x = rect.left + (ov.x / 100) * rect.width + (ov.width / 100) * rect.width / 2;
                        const y = rect.top + (ov.y / 100) * rect.height + (ov.height / 100) * rect.height;
                        onSelect(fragment, { x, y });
                    }
                    if (ov) onOverlayClick?.(ov);
                }
            }}
        >
            <div className="flex items-center justify-center w-full h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    ref={imageRef}
                    src={imageSrc}
                    alt={alt}
                    className="block w-auto h-auto max-w-full max-h-full object-contain"
                    style={{ maxHeight: 'inherit' }}
                    draggable={false}
                />
            </div>
        </InteractiveOverlayLayer>
    );
}

// Helper to avoid circular deps if needed
import { InteractiveOverlayLayer } from "./interactive-overlay-layer";
