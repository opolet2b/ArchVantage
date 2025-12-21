/**
 * Domain Node Component
 *
 * Renders a domain container on the canvas for grouping things.
 * Features clearly visible resize handles when selected.
 * Double-click on name to rename.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { NodeProps, NodeResizer } from "reactflow";
import { Domain, ZoomLevel } from "../canvas-store";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// =============================================================================
// Domain Node Data
// =============================================================================

interface DomainNodeData {
    domain: Domain;
    zoomLevel: ZoomLevel;
    onRename?: (domainId: string, newName: string) => void;
    onContextMenu?: (event: React.MouseEvent, domainId: string) => void;
    onResizeEnd?: (domainId: string, width: number, height: number) => void;
}

// =============================================================================
// Custom resize handle style for better visibility
// =============================================================================

const resizeHandleStyle = {
    width: 12,
    height: 12,
    borderRadius: 4,
    border: "2px solid white",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
};

const lineHandleStyle = {
    borderWidth: 3,
};

// =============================================================================
// Domain Node Component
// =============================================================================

export function DomainNode({ data, selected }: NodeProps<DomainNodeData>) {
    const { domain, zoomLevel, onRename, onContextMenu } = data;
    const [isEditing, setIsEditing] = React.useState(false);
    const [editName, setEditName] = React.useState(domain.name);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Focus input when editing starts
    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Handle double-click to start editing
    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditName(domain.name);
        setIsEditing(true);
    };

    // Submit rename
    const submitRename = () => {
        if (editName.trim() && editName !== domain.name && onRename) {
            onRename(domain.id, editName.trim());
        }
        setIsEditing(false);
    };

    // Handle keyboard events
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            submitRename();
        } else if (e.key === "Escape") {
            setEditName(domain.name);
            setIsEditing(false);
        }
    };

    // Opacity decreases at higher zoom levels (domains fade as you zoom in)
    const opacity = zoomLevel === "domain" ? 0.8 :
        zoomLevel === "summary" ? 0.5 :
            zoomLevel === "preview" ? 0.3 : 0.2;

    return (
        <>
            {/* Enhanced NodeResizer with visible handles */}
            <NodeResizer
                color={domain.color}
                isVisible={selected}
                minWidth={150}
                minHeight={100}
                handleStyle={resizeHandleStyle}
                lineStyle={lineHandleStyle}
                onResizeEnd={(_e, params) => {
                    if (data.onResizeEnd) {
                        data.onResizeEnd(domain.id, params.width, params.height);
                    }
                }}
            />

            <div
                className={cn(
                    "w-full h-full rounded-xl border-2",
                    selected ? "border-solid" : "border-dashed",
                    "transition-all duration-300"
                )}
                style={{
                    borderColor: domain.color,
                    backgroundColor: `${domain.color}30`,
                    opacity,
                    minWidth: 150,
                    minHeight: 100,
                }}
                onContextMenu={(e) => onContextMenu?.(e, domain.id)}
            >
                {/* Domain label - double-click to edit */}
                <div
                    className={cn(
                        "absolute -top-7 left-2 px-3 py-1 rounded-md text-sm font-semibold",
                        "bg-white dark:bg-slate-900 shadow-sm",
                        selected && "ring-2 ring-offset-1",
                        !isEditing && "cursor-pointer hover:ring-2 hover:ring-offset-1"
                    )}
                    style={{
                        backgroundColor: domain.color,
                        color: "white",
                        // Use CSS variable for ring color
                        "--tw-ring-color": domain.color,
                    } as React.CSSProperties}
                    onDoubleClick={handleDoubleClick}
                    title="Double-click to rename"
                >
                    {isEditing ? (
                        <Input
                            ref={inputRef}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={submitRename}
                            onKeyDown={handleKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            className="h-5 w-32 text-xs px-1 py-0 border-none bg-transparent text-white placeholder:text-white/70"
                        />
                    ) : (
                        domain.name
                    )}
                </div>

                {/* Selection indicator - corner dots when not selected */}
                {!selected && (
                    <>
                        <div
                            className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full opacity-50"
                            style={{ backgroundColor: domain.color }}
                        />
                        <div
                            className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full opacity-50"
                            style={{ backgroundColor: domain.color }}
                        />
                        <div
                            className="absolute -top-1 -right-1 w-3 h-3 rounded-full opacity-50"
                            style={{ backgroundColor: domain.color }}
                        />
                        <div
                            className="absolute -top-1 -left-1 w-3 h-3 rounded-full opacity-50"
                            style={{ backgroundColor: domain.color }}
                        />
                    </>
                )}
            </div>
        </>
    );
}

