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
import { NodeProps, NodeResizer, Handle, Position } from "reactflow";
import { Domain, ZoomLevel } from "../canvas-store";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// =============================================================================
// Domain Node Data
// =============================================================================

interface DomainNodeData {
    domain: Domain;
    zoomLevel: ZoomLevel;
    onUpdate?: (domainId: string, updates: { name: string; description: string }) => void;
    onContextMenu?: (event: React.MouseEvent, domainId: string) => void;
    onResizeEnd?: (domainId: string, width: number, height: number) => void;
}

// ... resize styles ...

// =============================================================================
// Domain Node Component
// =============================================================================

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

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

export function DomainNode({ data, selected }: NodeProps<DomainNodeData>) {
    const { domain, zoomLevel, onUpdate, onContextMenu } = data;
    const [isEditing, setIsEditing] = React.useState(false);
    const [editName, setEditName] = React.useState(domain.name);
    const [editDescription, setEditDescription] = React.useState(domain.description || "");

    // Handle open edit dialog
    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditName(domain.name);
        setEditDescription(domain.description || "");
        setIsEditing(true);
    };

    // Submit update
    const submitUpdate = () => {
        if (editName.trim() && onUpdate) {
            onUpdate(domain.id, {
                name: editName.trim(),
                description: editDescription.trim()
            });
        }
        setIsEditing(false);
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
                onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onContextMenu?.(e, domain.id);
                }}
            >
                {/* Domain label */}
                <div
                    className={cn(
                        "absolute -top-7 left-2 px-3 py-1 rounded-md text-sm font-semibold flex items-center gap-2",
                        "bg-white dark:bg-slate-900 shadow-sm transition-all",
                        selected && "ring-2 ring-offset-1"
                    )}
                    style={{
                        backgroundColor: domain.color,
                        color: "white",
                        "--tw-ring-color": domain.color,
                    } as React.CSSProperties}
                >
                    <span>{domain.name}</span>

                    {/* Edit Button (visible on hover or selection) */}
                    <div
                        className={cn(
                            "cursor-pointer opacity-0 hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-black/20",
                            selected && "opacity-100" // Always visible and full opacity if selected
                        )}
                        onClick={handleEditClick}
                        title="Edit Domain"
                    >
                        <Pencil className="h-4 w-4" strokeWidth={2.5} />
                    </div>
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

                {/* Connection Handles (Required for edges to connect to domains) */}
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: domain.color }}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: domain.color }}
                />
                <Handle
                    type="target"
                    id="top"
                    position={Position.Top}
                    className="!w-3 !h-3 opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: domain.color }}
                />
                <Handle
                    type="source"
                    id="bottom"
                    position={Position.Bottom}
                    className="!w-3 !h-3 opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: domain.color }}
                />
            </div>

            {/* Edit Dialog - Rendered via Portal or using the Dialog component which handles portalling */}
            {isEditing && (
                <Dialog open={isEditing} onOpenChange={setIsEditing}>
                    <DialogContent onClick={(e) => e.stopPropagation()}>
                        <DialogHeader>
                            <DialogTitle>Edit Domain</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Domain Name <span className="text-red-500">*</span></Label>
                                <Input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    placeholder="Domain Name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="Describe the purpose of this domain..."
                                    rows={3}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setIsEditing(false)}
                            >
                                Cancel
                            </Button>
                            <Button onClick={submitUpdate} disabled={!editName.trim()}>
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}

