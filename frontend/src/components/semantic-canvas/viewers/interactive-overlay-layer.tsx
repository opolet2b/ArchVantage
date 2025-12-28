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

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative select-none",
                selectionEnabled ? "cursor-crosshair" : "cursor-default",
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
    onAction: (action: 'resize' | 'delete' | 'click', data?: any) => void;
}

function OverlayItem({ overlay, isActive, onAction }: OverlayItemProps) {
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
        handleRef.current = handle;
        startPosRef.current = { x: local.x, y: local.y, w: local.width, h: local.height };
        mouseStartRef.current = { x: e.clientX, y: e.clientY };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    };

    const handleResizeMove = (e: MouseEvent) => {
        if (!handleRef.current || !startPosRef.current || !mouseStartRef.current) return;

        // We need parent dimensions to calculate % delta.
        // We can't access ref here easily without passing it down or query selector.
        // Quick hack: look up closest relative parent.
        // Or better: Pass a "scale getter" from parent? 
        // Let's assume standard CSS stacking context for now.

        // NOTE: We used standard clientX delta logic previously.
        // To be simpler and robust in this separated component, let's use pixel deltas
        // heavily dependent on the container size.

        // ISSUE: We don't have container size here inside the global listener.
        // We need to capture container size at START.
        // But `e.target` at start was the handle.
        // Let's rely on `offsetParent`.

        // Since we can't easily get offsetParent inside this global listener without a closure over a Ref to the element,
        // let's rely on the parent logic to solve this? No, OverlayItem should be self-contained for interaction.
        // We will capture it at MouseDown.
    };

    // We need to capture container dims at MouseDown to use in MouseMove
    const containerDimsRef = React.useRef<{ w: number, h: number } | null>(null);

    const handleMouseDownWrapper = (e: React.MouseEvent, handle: string) => {
        const domEl = e.currentTarget as HTMLElement;
        const container = domEl.closest('.relative') as HTMLElement; // Heuristic
        if (container) {
            containerDimsRef.current = { w: container.offsetWidth, h: container.offsetHeight };
        }
        handleResizeStart(e, handle);
    }

    // Updated Move Logic
    const handleResizeMoveImpl = (e: MouseEvent) => {
        if (!handleRef.current || !startPosRef.current || !mouseStartRef.current || !containerDimsRef.current) return;

        const { w: containerW, h: containerH } = containerDimsRef.current;
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

    // Replace the listener ref
    React.useEffect(() => {
        // Just bind the implementation to the name expected by addEventListener
        // But we need to define it outside or use a ref to hold the function
    }, []);

    // Ref-based listener to avoid closure staleness (though we use refs for state mostly)
    const moveListenerRef = React.useRef(handleResizeMoveImpl);
    moveListenerRef.current = handleResizeMoveImpl;

    const handleResizeEnd = () => {
        document.removeEventListener('mousemove', moveListenerRef.current);
        document.removeEventListener('mouseup', handleResizeEnd);

        // Commit
        const final = latestLocalRef.current;
        onAction('resize', { x: final.x, y: final.y, width: final.width, height: final.height });
    };

    return (
        <div
            className={cn(
                "absolute border-2 pointer-events-auto group transition-colors cursor-pointer",
                isActive ? "border-green-400 z-50 bg-green-500/10" : "border-green-600/50 z-40 hover:border-green-500"
            )}
            style={{
                left: `${local.x}%`,
                top: `${local.y}%`,
                width: `${local.width}%`,
                height: `${local.height}%`,
            }}
            onMouseDown={(e) => {
                e.stopPropagation();
                onAction('click', e);
            }}
        >
            {isActive && (
                <>
                    {/* Label (only show when active or always? User said "displayed on top", implying visibility) 
                        Let's show it always if it exists, but maybe style it differently when active.
                        Actually, let's put it outside the isActive check to verify visibility.
                    */}

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
                                "absolute w-3 h-3 bg-white border border-green-600 z-40",
                                h === 'nw' ? "-top-1 -left-1 cursor-nw-resize" : "",
                                h === 'ne' ? "-top-1 -right-1 cursor-ne-resize" : "",
                                h === 'sw' ? "-bottom-1 -left-1 cursor-sw-resize" : "",
                                h === 'se' ? "-bottom-1 -right-1 cursor-se-resize" : ""
                            )}
                            onMouseDown={(e) => handleMouseDownWrapper(e, h)}
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
