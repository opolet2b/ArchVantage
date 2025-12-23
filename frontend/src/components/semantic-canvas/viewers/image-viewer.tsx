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
    const containerRef = React.useRef<HTMLDivElement>(null);
    const imageRef = React.useRef<HTMLImageElement>(null);
    const [isSelecting, setIsSelecting] = React.useState(false);
    const [selectionStart, setSelectionStart] = React.useState<{ x: number; y: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = React.useState<{ x: number; y: number } | null>(null);
    const [currentSelection, setCurrentSelection] = React.useState<RegionFragment | null>(null);
    const [activeOverlayId, setActiveOverlayId] = React.useState<string | null>(null);

    // Get relative position within container with scale factor correction for ReactFlow zoom
    const getRelativePosition = (e: React.MouseEvent): { x: number; y: number } | null => {
        const container = containerRef.current;
        if (!container) return null;

        const rect = container.getBoundingClientRect();

        // Calculate scale factor: Screen Size / CSS Size
        // If the canvas is zoomed out (e.g. 0.5), Screen Size will be half of CSS Size.
        // Screen Delta = 100px.
        // We want CSS Delta = 100px / 0.5 = 200px.
        const scaleX = rect.width / container.offsetWidth;
        const scaleY = rect.height / container.offsetHeight;

        if (scaleX === 0 || scaleY === 0) return null;

        return {
            x: (e.clientX - rect.left) / scaleX,
            y: (e.clientY - rect.top) / scaleY,
        };
    };

    // Handle mouse down - start selection
    const handleMouseDown = (e: React.MouseEvent) => {
        console.log("[ImageViewer] MouseDown", { selectionEnabled, hasOnSelect: !!onSelect });
        if (!selectionEnabled || !onSelect) return;

        // Clear active overlay when clicking background
        setActiveOverlayId(null);

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
    const handleMouseUp = (e?: React.MouseEvent) => {
        console.log("[ImageViewer] MouseUp", { isSelecting, selectionStart, selectionEnd });
        if (!isSelecting || !selectionStart || !selectionEnd || !onSelect) {
            setIsSelecting(false);
            return;
        }

        // Calculate selection rectangle in screen pixels
        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const width = Math.abs(selectionEnd.x - selectionStart.x);
        const height = Math.abs(selectionEnd.y - selectionStart.y);

        console.log("[ImageViewer] Selection dims:", { width, height });

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

            // Generate ID immediately so parent components can reference it (e.g. for linking)
            const regionId = Date.now().toString();

            const fragment: RegionFragment = {
                id: regionId,
                type: "region",
                x: pctX,
                y: pctY,
                width: pctW,
                height: pctH,
                content: base64Content // Store cropped image data here!
            };

            setCurrentSelection(fragment);
            console.log("[ImageViewer] Calling onSelect with fragment", fragment);

            // Calculate screen position for toolbar (center bottom of selection)
            const rect = containerRef.current?.getBoundingClientRect();
            const screenPos = rect ? {
                x: rect.left + x + width / 2,
                y: rect.top + y + height
            } : { x: 0, y: 0 };

            // Pass position as second arg if supported
            // @ts-ignore - SelectableContent expects 2 args
            onSelect(fragment, screenPos);
        } else {
            console.log("[ImageViewer] Selection too small or no image ref");
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
            className={cn(
                "relative flex items-center justify-center w-full h-full bg-slate-100 dark:bg-slate-900 rounded-md select-none",
                className
            )}
        >
            {/* Image Container - defined by image size. Events here ensure coords are relative to image. */}
            <div
                ref={containerRef}
                className={cn(
                    "relative flex max-w-full max-h-full",
                    selectionEnabled ? "cursor-crosshair" : "cursor-default"
                )}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => setIsSelecting(false)}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    ref={imageRef}
                    src={imageSrc}
                    alt={alt}
                    className="block w-auto h-auto max-w-full max-h-full"
                    style={{ maxHeight: 'inherit' }} // Inherit max-height from parent to ensure it scales down
                    draggable={false}
                />

                {/* Selection Box */}
                {isSelecting && selectionStart && selectionEnd && (
                    <div
                        className="absolute border-2 border-green-500 bg-green-500/20 pointer-events-none"
                        style={{
                            left: Math.min(selectionStart.x, selectionEnd.x),
                            top: Math.min(selectionStart.y, selectionEnd.y),
                            width: Math.abs(selectionEnd.x - selectionStart.x),
                            height: Math.abs(selectionEnd.y - selectionStart.y),
                        }}
                    />
                )}

                {/* Overlays */}
                {overlays.map((overlay) => (
                    <OverlayItem
                        key={overlay.id}
                        overlay={overlay}
                        isActive={activeOverlayId === overlay.id}
                        onResizeProp={onOverlayResize}
                        onDeleteProp={onOverlayDelete}
                        onClick={(e) => { // Accept event from OverlayItem
                            e.stopPropagation(); // Prevent triggering background click/creation
                            setActiveOverlayId(overlay.id);

                            // Call onSelect to open the analysis toolbar for this region
                            if (onSelect && containerRef.current) {
                                // Reconstruct fragment from overlay
                                const fragment: RegionFragment = {
                                    id: overlay.id, // Include ID for reference
                                    type: "region",
                                    x: overlay.x,
                                    y: overlay.y,
                                    width: overlay.width,
                                    height: overlay.height,
                                    content: (overlay as any).content || "" // Use stored content if available
                                };

                                // Calculate screen position for toolbar
                                const rect = containerRef.current.getBoundingClientRect();
                                const xPx = (overlay.x / 100) * rect.width;
                                const yPx = (overlay.y / 100) * rect.height;
                                const hPx = (overlay.height / 100) * rect.height;
                                const wPx = (overlay.width / 100) * rect.width;

                                const screenPos = {
                                    x: rect.left + xPx + wPx / 2,
                                    y: rect.top + yPx + hPx
                                };

                                // @ts-ignore - SelectableContent expects 2 args
                                onSelect(fragment, screenPos);
                            }

                            if (onOverlayClick) onOverlayClick(overlay, e); // Pass to parent
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

// Separate component for overlay to handle its own interactions
import { Handle, Position } from "reactflow";
import { X, Trash2 } from "lucide-react"; // Import icon for delete

function OverlayItem({
    overlay,
    isActive,
    onResizeProp,
    onDeleteProp,
    onClick
}: {
    overlay: { id: string; label?: string; x: number; y: number; width: number; height: number };
    isActive: boolean;
    onDeleteProp?: (id: string) => void;
    onClick?: (e: React.MouseEvent) => void;
}) {
    // Local state for smooth resizing without updating backend on every pixel
    const [localOverlay, setLocalOverlay] = React.useState(overlay);

    // Sync local state when prop updates (e.g. initial load or external change)
    React.useEffect(() => {
        setLocalOverlay(overlay);
    }, [overlay]);

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

        // Calculate scale factor for overlays too (based on container)
        const rect = container.getBoundingClientRect();
        const scaleX = rect.width / containerW;
        const scaleY = rect.height / containerH;

        if (scaleX === 0 || scaleY === 0) return;

        // Apply scale correction to deltas
        const deltaX_px = (e.clientX - mouseStartRef.current.x) / scaleX;
        const deltaY_px = (e.clientY - mouseStartRef.current.y) / scaleY;

        const deltaX_pct = (deltaX_px / containerW) * 100;
        const deltaY_pct = (deltaY_px / containerH) * 100;

        let newX = startPosRef.current.x;
        let newY = startPosRef.current.y;
        let newW = startPosRef.current.w;
        let newH = startPosRef.current.h;

        // Apply resize logic based on handle
        if (handleRef.current.includes("e")) { // East
            newW = Math.max(5, startPosRef.current.w + deltaX_pct);
        }
        if (handleRef.current.includes("s")) { // South
            newH = Math.max(5, startPosRef.current.h + deltaY_pct);
        }
        if (handleRef.current.includes("w")) { // West
            const maxDelta = startPosRef.current.w - 5;
            const d = Math.min(maxDelta, deltaX_pct);
            newX = startPosRef.current.x + d;
            newW = startPosRef.current.w - d;
        }
        if (handleRef.current.includes("n")) { // North
            const maxDelta = startPosRef.current.h - 5;
            const d = Math.min(maxDelta, deltaY_pct);
            newY = startPosRef.current.y + d;
            newH = startPosRef.current.h - d;
        }

        // Update LOCAL state only (visual feedback)
        setLocalOverlay(prev => ({ ...prev, x: newX, y: newY, width: newW, height: newH }));
    };

    const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // COMMIT logic: Call the prop update now with the final values from LOCAL state
        // We need to read the latest values from state, but state updates might be async inside the listener?
        // Actually, we can recalculate or trust the startRef + last event?
        // Safer: We can't access "localOverlay" inside this closure if it's stale. 
        // But we DO have the refs and we know the last operation.
        // Even better: Use a ref to track "current local overlay values" to ensure we send the exact right thing.
        // OR: Since we are in an effect-like event listener, we should likely just use the refs to recalc final or store "lastCalculated" in a ref.

        // Let's use a "last calculated" ref scheme to be safe, or just re-calculate from mouse position?
        // No, mouseup event coords might not match last mousemove.

        // Simplification: We will trust that we are updating `localOverlay` state.
        // But to send it to parent, we need the value.
        // We can't easily get the React state inside this DOM event listener without a ref.
    };

    // We need a ref to track the latest overlay state to commit it
    const latestOverlayRef = React.useRef(localOverlay);
    React.useEffect(() => { latestOverlayRef.current = localOverlay; }, [localOverlay]);

    const handleMouseUpRef = React.useRef(handleMouseUp);
    handleMouseUpRef.current = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUpRef.current);
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
                e.stopPropagation(); // Stop click from clearing global selection
                onClick?.(e);
            }}
        >
            {/* React Flow Handles for connection visualization */}
            <Handle
                id={`fragment-handle-${overlay.id}`}
                type="source"
                position={Position.Right}
                style={{ opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0 }} // Hidden but functional
            />

            {/* Label if available */}
            {overlay.label && (
                <span className="absolute -top-6 left-0 text-xs bg-slate-800 text-white px-2 py-1 rounded shadow overflow-hidden max-w-full truncate">
                    {overlay.label}
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
                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-white border border-green-600 cursor-nw-resize" onMouseDown={(e) => handleMouseDown(e, "nw")} />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-white border border-green-600 cursor-ne-resize" onMouseDown={(e) => handleMouseDown(e, "ne")} />
                    <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border border-green-600 cursor-sw-resize" onMouseDown={(e) => handleMouseDown(e, "sw")} />
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-green-600 cursor-se-resize" onMouseDown={(e) => handleMouseDown(e, "se")} />
                </>
            )}
        </div>
    );
}

