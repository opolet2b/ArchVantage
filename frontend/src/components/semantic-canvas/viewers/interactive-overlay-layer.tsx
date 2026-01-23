"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { RegionFragment } from "./types";

interface InteractiveOverlayLayerProps {
    /** Exposes container ref for parent to access dimensions/context */
    containerRef?: React.RefObject<HTMLDivElement>;

    /** Current list of region fragments to display */
    overlays: RegionFragment[];

    /** Whether selection mode is active */
    selectionEnabled?: boolean;

    /** Callback when a new selection is made (mouse up after drag) */
    onSelectionComplete: (rect: { x: number; y: number; width: number; height: number; pctX: number; pctY: number; pctW: number; pctH: number }) => void;

    /** Callback for actions on existing overlays */
    onOverlayAction?: (action: 'resize' | 'delete' | 'click', id: string, data?: any) => void;

    /** Active/Selected overlay ID */
    activeOverlayId?: string | null;

    /** Optional classname */
    className?: string;

    /** Children (the content to overlay, e.g. <img/> or <canvas/>) */
    children: React.ReactNode;
}

/**
 * InteractiveOverlayLayer
 * 
 * A pure UI component that handles:
 * 1. Drawing the green selection box (creation)
 * 2. Rendering existing overlays
 * 3. Handling resize/move events on overlays
 * 4. Emitting standardized events to the parent
 * 
 * It is Context-Agnostic: It doesn't know about PDF pages or Slides, just pixels and percentages.
 */
export function InteractiveOverlayLayer({
    containerRef: externalRef,
    overlays,
    selectionEnabled = true,
    onSelectionComplete,
    onOverlayAction,
    activeOverlayId: propActiveId,
    className,
    children
}: InteractiveOverlayLayerProps) {
    // Internal ref if none provided
    const internalRef = React.useRef<HTMLDivElement>(null);
    const containerRef = externalRef || internalRef;

    // Local state for drawing new selection
    const [isSelecting, setIsSelecting] = React.useState(false);
    const [selectionStart, setSelectionStart] = React.useState<{ x: number; y: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = React.useState<{ x: number; y: number } | null>(null);

    // Local state for active overlay (if not controlled)
    const [localActiveId, setLocalActiveId] = React.useState<string | null>(null);
    const activeId = propActiveId !== undefined ? propActiveId : localActiveId;

    // Helper: Get relative position within container
    const getRelativePosition = (e: React.MouseEvent): { x: number; y: number } | null => {
        const container = containerRef.current;
        if (!container) return null;

        const rect = container.getBoundingClientRect();

        // Calculate scale factor (CSS Pixels vs Rendered Pixels)
        // Important for zoomed views (like ReactFlow or scaled PDF pages)
        const scaleX = rect.width / container.offsetWidth;
        const scaleY = rect.height / container.offsetHeight;

        if (scaleX === 0 || scaleY === 0) return null;

        return {
            x: (e.clientX - rect.left) / scaleX,
            y: (e.clientY - rect.top) / scaleY,
        };
    };

    // --- Creation Handlers ---

    const handleMouseDown = (e: React.MouseEvent) => {
        // Only handle if directly on the container (or bubble up from children)
        // We let overlays handle their own mousedown (stopPropagation)
        if (!selectionEnabled) return;

        // Clear active selection on background click
        if (activeId) {
            if (onOverlayAction) onOverlayAction('click', '', null); // Clear
            setLocalActiveId(null);
        }

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
        if (!isSelecting || !selectionStart || !selectionEnd) {
            setIsSelecting(false);
            return;
        }

        // 1. Calculate Rect in CSS Pixels
        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const width = Math.abs(selectionEnd.x - selectionStart.x);
        const height = Math.abs(selectionEnd.y - selectionStart.y);

        // 2. Minimum size check
        if (width > 10 && height > 10 && containerRef.current) {
            const container = containerRef.current;

            // 3. Calculate Percentages
            const pctX = (x / container.offsetWidth) * 100;
            const pctY = (y / container.offsetHeight) * 100;
            const pctW = (width / container.offsetWidth) * 100;
            const pctH = (height / container.offsetHeight) * 100;

            onSelectionComplete({
                x, y, width, height,
                pctX, pctY, pctW, pctH
            });
        }

        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
    };

    // --- Render ---

    // Measure container dimensions for children
    const [containerDims, setContainerDims] = React.useState<{ w: number, h: number } | null>(null);

    React.useEffect(() => {
        const updateDims = () => {
            if (containerRef.current) {
                setContainerDims({
                    w: containerRef.current.offsetWidth,
                    h: containerRef.current.offsetHeight
                });
            }
        };

        // Initial setup
        updateDims();

        // Resize observer for robustness
        const ro = new ResizeObserver(updateDims);
        if (containerRef.current) ro.observe(containerRef.current);

        return () => ro.disconnect();
    }, [containerRef]);

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative overlay-container",
                selectionEnabled ? "cursor-crosshair" : "cursor-default select-text",
                className
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setIsSelecting(false)}
        >
            {/* The Content (Image, PDF Page, etc) - Rendered underneath */}
            {children}

            {/* Drawing Selection Box */}
            {isSelecting && selectionStart && selectionEnd && (
                <div
                    className="absolute border-2 border-green-500 bg-green-500/20 pointer-events-none z-50"
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
                    containerDims={containerDims}
                    isActive={activeId === overlay.id}
                    onAction={(action, data) => {
                        if (onOverlayAction) onOverlayAction(action, overlay.id as string, data);
                        if (action === 'click') setLocalActiveId(overlay.id as string);
                    }}
                />
            ))}
        </div>
    );
}

// --- Overlay Item Sub-Component ---

interface OverlayItemProps {
    overlay: RegionFragment;
    isActive: boolean;
    containerDims: { w: number, h: number } | null;
    onAction: (action: 'resize' | 'delete' | 'click', data?: any) => void;
}

function OverlayItem({ overlay, isActive, containerDims, onAction }: OverlayItemProps) {
    // Local state for smooth resizing
    const [local, setLocal] = React.useState(overlay);

    React.useEffect(() => {
        setLocal(overlay);
    }, [overlay]);

    // Resizing Logic
    const startPosRef = React.useRef<{ x: number, y: number, w: number, h: number } | null>(null);
    const mouseStartRef = React.useRef<{ x: number, y: number } | null>(null);
    const handleRef = React.useRef<string | null>(null);
    const latestLocalRef = React.useRef(local); // Track latest for commit

    React.useEffect(() => { latestLocalRef.current = local }, [local]);

    const handleResizeStart = (e: React.MouseEvent, handle: string) => {
        e.stopPropagation();
        e.preventDefault();

        if (!containerDims) {
            // console.warn("[OverlayItem] Resize aborted: Missing containerDims");
            return;
        }

        // console.log("[OverlayItem] Resize Start", { handle, dims: containerDims, local });

        handleRef.current = handle;
        startPosRef.current = { x: local.x, y: local.y, w: local.width, h: local.height };
        mouseStartRef.current = { x: e.clientX, y: e.clientY };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    };

    const handleResizeMove = (e: MouseEvent) => {
        if (moveListenerRef.current) moveListenerRef.current(e);
    };

    // Updated Move Logic
    const handleResizeMoveImpl = (e: MouseEvent) => {
        if (!handleRef.current || !startPosRef.current || !mouseStartRef.current || !containerDims) return;

        const { w: containerW, h: containerH } = containerDims;
        if (containerW === 0 || containerH === 0) return;

        // Calculate delta %
        const deltaX_px = e.clientX - mouseStartRef.current.x;
        const deltaY_px = e.clientY - mouseStartRef.current.y;

        const deltaX_pct = (deltaX_px / containerW) * 100;
        const deltaY_pct = (deltaY_px / containerH) * 100;

        let { x, y, w: width, h: height } = startPosRef.current;

        if (handleRef.current.includes("e")) width = Math.max(1, width + deltaX_pct);
        if (handleRef.current.includes("s")) height = Math.max(1, height + deltaY_pct);
        if (handleRef.current.includes("w")) {
            const maxD = width - 1;
            const d = Math.min(maxD, deltaX_pct);
            x += d;
            width -= d;
        }
        if (handleRef.current.includes("n")) {
            const maxD = height - 1;
            const d = Math.min(maxD, deltaY_pct);
            y += d;
            height -= d;
        }

        setLocal(prev => ({ ...prev, x, y, width, height }));
    };

    // Keep listener fresh in ref
    const moveListenerRef = React.useRef(handleResizeMoveImpl);
    moveListenerRef.current = handleResizeMoveImpl;

    const handleResizeEnd = () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);

        // Commit
        const final = latestLocalRef.current;
        // console.log("[OverlayItem] Resize End. Committing:", final);
        onAction('resize', { x: final.x, y: final.y, width: final.width, height: final.height });
    };

    return (
        <div
            className={cn(
                "absolute border-2 pointer-events-auto group transition-colors cursor-pointer",
                isActive ? "border-green-400 z-50 bg-green-500/10" : "border-green-600/50 z-40 hover:border-green-500 bg-transparent"
            )}
            style={{
                left: `${local.x}%`,
                top: `${local.y}%`,
                width: `${local.width}%`,
                height: `${local.height}%`,
            }}
            onClick={(e) => {
                e.stopPropagation();
                // Click is handled by MouseDown for better reliability
            }}
            onMouseDown={(e) => {
                // IMPORTANT: Stop propagation to prevent "Creation Point" / Drawing mode from triggering on background
                e.stopPropagation();
                onAction('click', e);
            }}
        >
            {isActive && (
                <>
                    {/* Delete */}
                    <button
                        className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-600 z-50"
                        onClick={(e) => {
                            e.stopPropagation();
                            onAction('delete');
                        }}
                    >
                        <X className="h-3 w-3" />
                    </button>

                    {/* Handles */}
                    {['nw', 'ne', 'sw', 'se'].map(h => (
                        <div
                            key={h}
                            className={cn(
                                "absolute w-3 h-3 bg-white border border-green-600 z-50",
                                h === 'nw' ? "-top-1 -left-1 cursor-nw-resize" : "",
                                h === 'ne' ? "-top-1 -right-1 cursor-ne-resize" : "",
                                h === 'sw' ? "-bottom-1 -left-1 cursor-sw-resize" : "",
                                h === 'se' ? "-bottom-1 -right-1 cursor-se-resize" : ""
                            )}
                            onMouseDown={(e) => handleResizeStart(e, h)}
                        />
                    ))}
                </>
            )}
            {/* Label - visible always, but z-index adjustments might be needed */}
            {(overlay.label || overlay.id) && (
                <div className={cn(
                    "absolute -top-6 left-0 text-white text-xs px-2 py-0.5 rounded shadow-sm whitespace-nowrap overflow-hidden max-w-full pointer-events-none transition-opacity",
                    isActive ? "bg-green-600 z-50" : "bg-black/50 z-20 group-hover:bg-black/75"
                )}>
                    {overlay.label || overlay.id}
                </div>
            )}
        </div>
    );
}
