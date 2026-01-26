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
    depth?: number; // Hierarchy depth: 0 = root, 1 = child, etc.
    parentName?: string; // Name of parent domain for display
    onUpdate?: (domainId: string, updates: { name?: string; description?: string; color?: string }) => void;
    onContextMenu?: (event: React.MouseEvent, domainId: string) => void;
    onResizeEnd?: (domainId: string, width: number, height: number, x?: number, y?: number) => void;
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Pencil, Palette } from "lucide-react";
import { HexColorPicker } from "react-colorful";

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

const PRESET_COLORS = [
    "#64748b", // Slate
    "#ef4444", // Red
    "#f97316", // Orange
    "#eab308", // Yellow
    "#84cc16", // Lime
    "#22c55e", // Green
    "#10b981", // Emerald
    "#06b6d4", // Cyan
    "#3b82f6", // Blue
    "#6366f1", // Indigo
    "#a855f7", // Purple
    "#d946ef", // Fuchsia
    "#ec4899", // Pink
    "#f43f5e", // Rose
];

/**
 * DomainNode - Memoized for performance optimization.
 * 
 * Prevents unnecessary re-renders when canvas state changes but this
 * specific node's props remain the same.
 */
export const DomainNode = React.memo(function DomainNode({ data, selected }: NodeProps<DomainNodeData>) {
    const { domain, zoomLevel, onUpdate, onContextMenu, depth = 0, parentName } = data;
    const [isEditing, setIsEditing] = React.useState(false);
    const [editName, setEditName] = React.useState(domain.name);
    const [editDescription, setEditDescription] = React.useState(domain.description || "");
    const [isColorPickerOpen, setIsColorPickerOpen] = React.useState(false);

    // Buffered color state for the picker
    const [tempColor, setTempColor] = React.useState(domain.color);

    // Sync tempColor with domain.color from props when picker is closed
    // This ensures we start with the current saved color when opening
    React.useEffect(() => {
        if (!isColorPickerOpen) {
            setTempColor(domain.color);
        }
    }, [domain.color, isColorPickerOpen]);

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

    // Commit color update (Validate button)
    const handleValidateColor = () => {
        if (onUpdate) {
            onUpdate(domain.id, { color: tempColor });
        }
        setIsColorPickerOpen(false);
    };

    // Commit preset instantly
    const handlePresetClick = (c: string) => {
        setTempColor(c); // Update temp for consistency
        if (onUpdate) {
            onUpdate(domain.id, { color: c });
        }
        setIsColorPickerOpen(false);
    };

    // Use tempColor for display while picking to verify look, otherwise reliable domain.color
    const displayColor = isColorPickerOpen ? tempColor : domain.color;

    // Opacity decreases at higher zoom levels (domains fade as you zoom in)
    const opacity = zoomLevel === "domain" ? 0.8 :
        zoomLevel === "summary" ? 0.5 :
            zoomLevel === "preview" ? 0.3 : 0.2;

    return (
        <>
            {/* Enhanced NodeResizer with visible handles */}
            <NodeResizer
                color={displayColor}
                isVisible={selected}
                minWidth={150}
                minHeight={100}
                handleStyle={resizeHandleStyle}
                lineStyle={lineHandleStyle}
                onResizeEnd={(_e, params) => {
                    if (data.onResizeEnd) {
                        data.onResizeEnd(domain.id, params.width, params.height, params.x, params.y);
                    }
                }}
            />

            {/* Connection Handles - Left (Target) and Right (Source) only */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-3 !h-3 !bg-orange-500 border-2 border-white dark:border-slate-950"
                style={{ zIndex: 50 }}
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-orange-500 border-2 border-white dark:border-slate-950"
                style={{ zIndex: 50 }}
            />

            {/* Main Container Wrapper - No Opacity ensures child elements like Label are fully visible */}
            <div
                className="w-full h-full relative"
                onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onContextMenu?.(e, domain.id);
                }}
            >
                {/* Visual Background Layer - Opacity Applied Here */}
                <div
                    className={cn(
                        "absolute inset-0 rounded-xl border-2",
                        selected ? "border-solid" : "border-dashed",
                        "transition-all duration-300"
                    )}
                    style={{
                        borderColor: displayColor,
                        backgroundColor: `${displayColor}${Math.max(10, 30 - depth * 5).toString(16).padStart(2, '0')}`, // Lighter for deeper
                        opacity,
                        // Visual depth indicator: inset shadow (stronger for deeper levels)
                        boxShadow: depth > 0
                            ? `inset 0 0 ${depth * 15}px rgba(0, 0, 0, ${0.1 + depth * 0.05})`
                            : 'none',
                    }}
                />

                {/* Domain label - High Contrast Black on White (Outside Opacity Layer) */}
                <div
                    className={cn(
                        "absolute -top-7 left-2 px-3 py-1 rounded-md text-sm font-semibold flex items-center gap-2",
                        "!bg-[#ffffff] shadow-sm transition-all", // Enforce 100% White
                        "!text-[#000000]", // Enforce 100% Black
                        selected && "ring-2 ring-offset-1"
                    )}
                    style={{
                        // REMOVED: backgroundColor setting
                        // REMOVED: color setting
                        // Kept ring color matching domain
                        "--tw-ring-color": displayColor,
                    } as React.CSSProperties}
                >
                    <div className="flex flex-col">
                        <span>{domain.name}</span>
                        {parentName && (
                            <span className="text-xs font-normal !text-[#000000]">
                                in {parentName}
                            </span>
                        )}
                    </div>

                    {/* Controls Container (Edit + Color) */}
                    <div className={cn(
                        "flex items-center gap-1",
                        // Always visible
                    )}>
                        {/* Edit Button */}
                        <div
                            className="cursor-pointer p-1 rounded-full hover:bg-black/10"
                            onClick={handleEditClick}
                            title="Edit Domain"
                        >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </div>

                        {/* Color Picker */}
                        <Popover open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
                            <PopoverTrigger asChild>
                                <div
                                    className="cursor-pointer p-1 rounded-full hover:bg-black/10"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Let PopoverTrigger handle basic toggle, but prevent canvas deselect
                                    }}
                                    title="Change Color"
                                >
                                    <Palette className="h-3.5 w-3.5" strokeWidth={2.5} />
                                </div>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-64 p-3"
                                align="start"
                                side="bottom"
                            // Allows closing on outside click naturally
                            >
                                <div className="space-y-3">
                                    <div className="font-medium text-xs text-muted-foreground">Select Color</div>
                                    <div className="grid grid-cols-7 gap-2">
                                        {PRESET_COLORS.map((c) => (
                                            <div
                                                key={c}
                                                className={cn(
                                                    "w-6 h-6 rounded-full cursor-pointer hover:scale-110 transition-transform active:scale-95 border border-slate-200",
                                                    displayColor === c && "ring-2 ring-offset-1 ring-black/50"
                                                )}
                                                style={{ backgroundColor: c }}
                                                onClick={() => handlePresetClick(c)}
                                                title={c}
                                            />
                                        ))}
                                    </div>
                                    <div className="space-y-2 pt-2 border-t">
                                        <Label className="text-xs font-semibold">Custom Color</Label>
                                        <div className="flex flex-col gap-2 items-center">
                                            <HexColorPicker
                                                color={tempColor}
                                                onChange={setTempColor}
                                                style={{ width: "100%", height: "150px" }}
                                            />
                                            <div className="flex w-full gap-2">
                                                <div className="relative flex-1">
                                                    <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">#</span>
                                                    <Input
                                                        value={tempColor.replace("#", "")}
                                                        onChange={(e) => setTempColor(`#${e.target.value}`)}
                                                        className="h-8 pl-4 py-1 text-xs"
                                                        placeholder="HEX"
                                                    />
                                                </div>
                                                <Button
                                                    size="sm"
                                                    className="h-8 px-4 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                                                    onClick={handleValidateColor}
                                                >
                                                    Validate
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Selection indicator - corner dots when not selected */}
                {!selected && (
                    <>
                        <div
                            className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full opacity-50"
                            style={{ backgroundColor: displayColor }}
                        />
                        <div
                            className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full opacity-50"
                            style={{ backgroundColor: displayColor }}
                        />
                        <div
                            className="absolute -top-1 -right-1 w-3 h-3 rounded-full opacity-50"
                            style={{ backgroundColor: displayColor }}
                        />
                        <div
                            className="absolute -top-1 -left-1 w-3 h-3 rounded-full opacity-50"
                            style={{ backgroundColor: displayColor }}
                        />
                    </>
                )}

                {/* Connection Handles (Required for edges to connect to domains) */}
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: displayColor }}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: displayColor }}
                />
                <Handle
                    type="target"
                    id="top"
                    position={Position.Top}
                    className="!w-3 !h-3 opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: displayColor }}
                />
                <Handle
                    type="source"
                    id="bottom"
                    position={Position.Bottom}
                    className="!w-3 !h-3 opacity-0 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: displayColor }}
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
});

