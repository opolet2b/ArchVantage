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
import { cn } from "@/lib/utils";
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
                src={src}
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
