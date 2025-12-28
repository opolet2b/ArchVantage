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
    const [imageSrc, setImageSrc] = React.useState<string>(src);
    const [error, setError] = React.useState<boolean>(false);
    const objectUrlRef = React.useRef<string | null>(null);

    // Effect: Load image with Auth if it's a backend asset
    React.useEffect(() => {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

        if (src.startsWith("blob:") || src.startsWith("http")) {
            setImageSrc(src);
            return;
        }

        if (src.startsWith("/api/")) {
            const fetchImage = async () => {
                try {
                    const token = localStorage.getItem("token");
                    let urlToFetch = src;
                    if (API_URL && !src.startsWith("http")) {
                        try {
                            const apiUrlObj = new URL(API_URL);
                            urlToFetch = `${apiUrlObj.origin}${src}`;
                        } catch (e) {
                            if (process.env.NODE_ENV === 'development') urlToFetch = `http://localhost:8000${src}`;
                        }
                    }
                    const res = await fetch(urlToFetch, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
                    if (!res.ok) throw new Error(`Failed to load: ${res.status}`);

                    const blob = await res.blob();
                    objectUrlRef.current = URL.createObjectURL(blob);
                    setImageSrc(objectUrlRef.current);
                } catch (err) {
                    console.error("Failed to load secure image:", err);
                    setError(true);
                }
            };
            fetchImage();
            return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
        }
    }, [src]);

    if (error) {
        return <div className={cn("flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500", className)} style={{ minHeight: 200 }}>Broken Image</div>;
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
                    const ov = overlays.find(o => o.id === id);
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
