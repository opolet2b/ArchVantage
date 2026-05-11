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
    /** Optional: render only a specific fragment (crop/zoom) */
    viewFragment?: RegionFragment;
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
    viewFragment,
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
        
        let isMounted = true;
        
        // 1. Regular HTTP URL (not an API asset) - use directly
        if (src.startsWith("http") && !src.includes("/api/v1/assets/")) {
            setImageSrc(src);
            setLoading(false);
            return;
        }

        // 2. Local Blob URL (already fetched or generated)
        if (src.startsWith("blob:") || src.startsWith("data:")) {
            setImageSrc(src);
            setLoading(false);
            return;
        }

        // Check if this is an API asset URL (either relative or full HTTP)
        const isApiAssetUrl = src.startsWith("/api/") || src.includes("/api/v1/assets/");

        if (isApiAssetUrl) {
            const fetchImage = async () => {
                setLoading(true);
                try {
                    const token = localStorage.getItem("token");
                    
                    // Construct final URL
                    let urlToFetch = src;
                    
                    if (src.startsWith("/api/")) {
                        // Ensure we use the full origin to hit the Next.js rewrite proxy correctly
                        urlToFetch = `${window.location.origin}${src}`;
                    } else if (src.includes("/api/v1/assets/")) {
                        // Full URL already, but if it's relative to another host, we keep it
                        urlToFetch = src;
                    }

                    console.log(`[ImageViewer] Fetching secure asset: ${urlToFetch}`);

                    const res = await fetch(urlToFetch, {
                        headers: token ? { "Authorization": `Bearer ${token}` } : {}
                    });

                    if (!res.ok) {
                        console.error(`[ImageViewer] Failed to load image: ${res.status} ${res.statusText} for URL: ${urlToFetch}`);
                        if (isMounted) {
                            setError(true);
                            setLoading(false);
                        }
                        return;
                    }

                    const blob = await res.blob();
                    if (!isMounted) return;

                    const objectUrl = URL.createObjectURL(blob);
                    
                    // Revoke previous local object URL if it exists
                    if (objectUrlRef.current) {
                        URL.revokeObjectURL(objectUrlRef.current);
                    }
                    
                    objectUrlRef.current = objectUrl;
                    setImageSrc(objectUrl);
                    setLoading(false);
                } catch (err) {
                    console.error("[ImageViewer] Error fetching image blob:", err);
                    if (isMounted) {
                        setError(true);
                        setLoading(false);
                    }
                }
            };

            fetchImage();
            return () => {
                isMounted = false;
            };
        } else {
            // Fallback for raw paths or other URLs
            setImageSrc(src);
            setLoading(false);
        }

        // Cleanup on unmount
        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
        };
    }, [src]);

    if (error) {
        return <div className={cn("flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500", className)} style={{ minHeight: 200 }}>Broken Image</div>;
    }

    // If no source provided at all
    if (!src) {
        return <div className={cn("flex items-center justify-center bg-gray-50 dark:bg-gray-800 text-gray-400 italic", className)} style={{ minHeight: 200 }}>No Image Source</div>;
    }

    if (loading) {
        return <div className={cn("flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 animate-pulse", className)} style={{ minHeight: 200 }}>Loading...</div>;
    }

    if (!imageSrc) {
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

    // Calculate crop styles if viewFragment is present
    const cropStyle: React.CSSProperties = viewFragment ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        transformOrigin: 'top left',
        // Scale = 100 / fragment.width
        transform: `scale(${100 / viewFragment.width * 100}%, ${100 / viewFragment.height * 100}%) translate(${-viewFragment.x}%, ${-viewFragment.y}%)`
        // Note: The translate needs to be negative of the position.
        // And since we scale up, the translate happens in the scaled coordinate system?
        // Actually: translate(x,y) scale(s) -> translate happens first? No.
        // transform: translateX(-x%) translateY(-y%) scale(s) -> 
        // We want to move the top-left of the fragment to (0,0) and then scale up.
        // So: translate(-fragment.x%, -fragment.y%) then scale(100/w, 100/h).
        // BUT percentages in translate are relative to the element itself (the image).
    } : {};

    // Better Approach for Cropping:
    // Use a container with overflow:hidden and absolute positioning.
    // If viewFragment is set, we interpret x/y/w/h as percentages of the original image.
    // We want to display just that region filling the container.

    // Better Approach for Cropping:
    // Use a container with overflow:hidden and absolute positioning.
    // If viewFragment is set, we interpret x/y/w/h as percentages of the original image.
    // We want to display just that region filling the container.

    // Proper Image Cropping using Background Image
    // This avoids issues with object-fit padding and element transforms.
    // CSS background-position uses a specific logic: 0% aligns left edges, 100% aligns right edges.
    // To center a specific point x (0-1) in the container, we might need complex calc.
    // BUT: standard 'crop' logic is:
    // Display region (x,y,w,h) of Image in Container.
    // Scale: Image Width = Container Width * (100/w). (Assuming we assume width-fit)
    // Offset: -x * Scale.

    if (viewFragment) {
        // Calculate percentages for background usage
        // Note: background-size percentages are relative to the Container.
        // If we want the *Fragment* to fit the container "contain" style:
        // We need to know aspect ratios. 
        // Fallback: Default to "Cover" behavior (fragment fills container) or "Contain"?
        // Usually transcluson blocks are fixed height.
        // Let's try attempting to fit Width first (common for text flow).

        const scaleW = 100 / viewFragment.width;
        const scaleH = 100 / viewFragment.height;

        // We start with assuming we want to zoom such that fragment width matches container width
        // background-size: `${scaleW * 100}% auto`
        // Then loop at position.
        // Position X: We want `viewFragment.x` (image coord) to be at `0` (container coord).
        // DOM coord = (ImageCoord * Scale) + Offset
        // 0 = (x * Scale) + Offset  => Offset = -x * Scale.
        // CSS background-position can perform this if we use pixel values or precise calc.
        // Using percentages in background-position is tricky (aligns centers).
        // Let's use `transform` on an inner div instead, but without object-fit.

        return (
            <div className={cn("relative w-full h-full overflow-hidden bg-slate-100 dark:bg-slate-900", className)}>
                <img
                    ref={imageRef}
                    src={imageSrc}
                    alt={alt}
                    draggable={false}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        // Force the image to be the size it needs to be so the fragment matches the container 1:1
                        // Strategy: Map fragment (x%, y%, w%, h%) -> Container (0%, 0%, 100%, 100%)
                        // So Image Width = 100% * (100/w)
                        // Image Height = 100% * (100/h)
                        // Left = -(x/w) * 100%
                        // Top = -(y/h) * 100%
                        // Note: This distorts if aspect ratios don't match!
                        // To preserve aspect ratio (Exclude distortion), we must choose ONE scale (min or max)
                        // and center the other axis.

                        // Current Complaint: "Full width of picture... transcluded"
                        // This implies scale is 1.
                        // Let's verify values are correct.
                        // If we force width/height, we distort.
                        // Let's use object-fit: cover on the fragment?
                        // No, let's just straightforwardly Scale & Translate.

                        width: `${100 * (100 / viewFragment.width)}%`,
                        height: `${100 * (100 / viewFragment.height)}%`,
                        transform: `translate(${-viewFragment.x / (100 / viewFragment.width) * (100 / viewFragment.width)}%, ${-viewFragment.y}%)`,
                        // Simplified:
                        // Width is scaled by S_w = 100/w
                        // We want offset -x% of Original Image.
                        // Since new width is S_w * Old, -x% of Old is (-x/100 * OldWidth).
                        // In new coordinates (where 100% = NewWidth), this offset is:
                        // (-x/100 * OldWidth) / NewWidth = (-x/100 * OldWidth) / (S_w * OldWidth) = -x / (100 * S_w) = -x / (100 * 100/w) = -x/100 * w/100... no.
                        // Let's stick to simple Left/Top relative to container.
                        // left: - (x%) * (ContainerWidth / w%) ?
                        // left: - (x / w) * 100 % 
                    }}
                    className="max-w-none max-h-none origin-top-left"
                />
                <div
                    style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        width: `${100 * (100 / viewFragment.width)}%`,
                        height: `${100 * (100 / viewFragment.height)}%`,
                        transform: `translate(${-viewFragment.x}%, ${-viewFragment.y}%)`,
                        // Wait, translate % is relative to the element itself (The big zoomed image).
                        // If Element Width is 2000px (200% of original).
                        // And x is 10%.
                        // We want to shift left by 10% of Original. 
                        // 10% of Original = 200px.
                        // 200px is 10% of 2000px.
                        // So `translate(-x%)` WORKS if width=100%.
                        // If width is scaled, say 2x. 10% of Original is 5% of New?
                        // If new Width = Original * S.
                        // We want shift = Original * x.
                        // Shift / NewWidth = (Original * x) / (Original * S) = x/S.
                        // So translate should be `-(viewFragment.x / (100/viewFragment.width))` ? No.
                        // viewFragment.x is %. 10 => 0.1.
                        // Shift = 0.1 * W_old.
                        // W_new = W_old * (100/w).
                        // Shift_pct_of_new = (0.1 * W_old) / (W_old * 100/w) = 0.1 / (100/w) = 0.1 * w/100.
                        // = (x/100) * (w/100)? No.

                        // Let's use Left/Top % which is relative to PARENT (Container).
                        // Shift = - (x / w) * 100 %.
                        // If x=10, w=20. We want to shift 10 units left.
                        // The container is 20 units wide (showing just the fragment).
                        // So we shift half a container width? Yes.
                        // Left: `${-(viewFragment.x / viewFragment.width) * 100}%`
                    }}
                >
                    <img
                        src={imageSrc}
                        alt={alt}
                        className="w-full h-full object-fill"
                        draggable={false}
                    />
                </div>
            </div>
        );
    }

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
