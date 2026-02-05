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
import { useCanvasStore, Domain, ZoomLevel, DropZone, MetadataField } from "../canvas-store";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
    MoreHorizontal, GripHorizontal, FolderOpen, Maximize2, LayoutGrid, Layers,
    Settings, List, Plus, X, Calendar as CalendarIcon, Clock, Hash,
    Pencil, Palette
} from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { MultiSelect } from "@/components/ui/multi-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HexColorPicker } from "react-colorful";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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

// =============================================================================
// Domain Node Data
// =============================================================================

interface DomainNodeData {
    domain: Domain & { visual_config?: any; metadata_schema?: any; type?: string };
    zoomLevel: ZoomLevel;
    depth?: number; // Hierarchy depth: 0 = root, 1 = child, etc.
    parentName?: string; // Name of parent domain for display
    onUpdate?: (domainId: string, updates: { name?: string; description?: string; color?: string }) => void;
    onContextMenu?: (event: React.MouseEvent, domainId: string) => void;
    onResize?: (domainId: string, width: number, height: number, x?: number, y?: number) => void;
    onResizeEnd?: (domainId: string, width: number, height: number, x?: number, y?: number) => void;
    minWidth?: number;
    minHeight?: number;
}

// ... resize styles ...

// =============================================================================
// Domain Node Component
// =============================================================================


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
const DomainNode = React.memo(function DomainNode({ data, selected }: NodeProps<DomainNodeData>) {
    const { domain, zoomLevel, onUpdate, onContextMenu, depth = 0, parentName, minWidth, minHeight } = data;
    const updateDomain = useCanvasStore(s => s.updateDomain);
    const setZoneLayoutMode = useCanvasStore(s => s.setZoneLayoutMode); // Layout Engine
    const activeScenario = useCanvasStore(s => s.activeScenario);
    const [isEditing, setIsEditing] = React.useState(false);

    // Schema Evolution: Prefer the latest schema from the scenario definition if available
    const definition = React.useMemo(() => {
        if (!activeScenario?.configuration?.domain_definitions) return null;
        // Try to match by type (definition ID) or name
        return activeScenario.configuration.domain_definitions.find(d =>
            (domain.type && d.id === domain.type) || d.name === domain.name
        );
    }, [activeScenario, domain.type, domain.name]);

    const effectiveSchema = definition?.metadata_schema || domain.metadata_schema;

    // Extract Visual Config
    const visualConfig = domain.visual_config || {};
    const iconName = visualConfig.icon; // Icon support TODO
    const borderRadius = visualConfig.border_radius !== undefined ? visualConfig.border_radius : 12;
    // If scenario override exists, we might need to access it via store or passed prop, 
    // but typically it's cached in domain.visual_config on creation.

    const [editName, setEditName] = React.useState(domain.name);
    const [editDescription, setEditDescription] = React.useState(domain.description || "");
    const [editMetadata, setEditMetadata] = React.useState<Record<string, any>>(domain.metadata_values || {});
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
        console.log("[DomainNode] Opening edit dialog for domain:", domain.id, "Schema:", effectiveSchema);
        setEditName(domain.name);
        setEditDescription(domain.description || "");
        setEditMetadata(domain.metadata_values || {});
        setIsEditing(true);
    };

    // Submit update
    const submitUpdate = () => {
        if (editName.trim() && onUpdate) {
            console.log("[DomainNode] Submitting update. Metadata values:", editMetadata);
            onUpdate(domain.id, {
                name: editName.trim(),
                description: editDescription.trim(),
                metadata_values: editMetadata // Updated field name
            } as any);
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

    const [resizeHandle, setResizeHandle] = React.useState<string | null>(null);

    // Calculate dynamic constraints
    const getConstraints = () => {
        let minW = minWidth || 200;
        let minH = minHeight || 150;

        return { minWidth: minW, minHeight: minH };
    };

    const constraints = getConstraints();

    return (
        <>
            {/* Enhanced NodeResizer with visible handles */}
            <NodeResizer
                color={displayColor}
                isVisible={selected}
                minWidth={constraints.minWidth}
                minHeight={constraints.minHeight}
                handleStyle={resizeHandleStyle}
                lineStyle={lineHandleStyle}
                onResizeStart={(_e, params) => {
                    // setResizeHandle((params as any).handle); // Removed dynamic constraints logic
                }}
                onResize={(_e, params) => {
                    if (data.onResize) {
                        data.onResize(domain.id, params.width, params.height, params.x, params.y);
                    }
                }}
                onResizeEnd={(_e, params) => {
                    setResizeHandle(null);
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
                        "absolute inset-0 border-2",
                        selected ? "border-solid" : "border-dashed",
                        "transition-all duration-300"
                    )}
                    style={{
                        borderRadius: borderRadius,
                        borderColor: displayColor,
                        backgroundColor: `${displayColor}${Math.max(10, 30 - depth * 5).toString(16).padStart(2, '0')}`, // Lighter for deeper
                        opacity,
                        // Visual depth indicator: inset shadow (stronger for deeper levels)
                        boxShadow: depth > 0
                            ? `inset 0 0 ${depth * 15}px rgba(0, 0, 0, ${0.1 + depth * 0.05})`
                            : 'none',
                    }}
                />

                {/* Visual Drop Zones - Grid Layout */}
                {(domain.drop_zones && domain.drop_zones.length > 0 || definition?.drop_zones && definition.drop_zones.length > 0) && (
                    <div
                        className="absolute inset-0 pt-8 px-2 pb-2 grid gap-2 pointer-events-none z-10"
                        style={{
                            gridTemplateColumns: (domain.drop_zones || definition?.drop_zones || []).length === 1 ? "1fr" : "repeat(2, 1fr)",
                            gridAutoRows: "1fr"
                        }}
                    >
                        {(domain.drop_zones || definition?.drop_zones || []).map((zone, idx) => (
                            <div
                                key={zone.id || idx}
                                className={cn(
                                    "group/zone pointer-events-auto rounded-md border text-xs flex flex-col items-center justify-center text-center gap-1 transition-all h-full w-full relative",
                                    zone.dashed_style ? "border-dashed" : "border-solid",
                                    "bg-white/40 hover:bg-white/70 border-slate-400 dark:border-slate-500 text-slate-700 dark:text-slate-200 shadow-sm overflow-hidden"
                                )}
                                title={zone.description}
                                data-drop-zone-id={zone.id}
                            >
                                {/* Layout Mode Toggle - Visible on Hover or Selection */}
                                <div className={cn(
                                    "absolute top-1 right-1 transition-opacity z-20",
                                    selected ? "opacity-100" : "opacity-0 group-hover/zone:opacity-100"
                                )}>
                                    <button
                                        className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md shadow-md bg-white/95 backdrop-blur-md border border-slate-300 dark:border-slate-600 transition-all hover:scale-110 active:scale-90 flex items-center justify-center"
                                        title={`Switch to ${zone.layout_mode === 'stacked' ? 'Tiled' : 'Stacked'} Layout`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            // Toggle Logic
                                            const newMode = zone.layout_mode === 'stacked' ? 'tiled' : 'stacked';
                                            console.log(`[DomainNode] Toggling zone ${zone.id} to ${newMode}`);
                                            // Call specialized action that triggers layout
                                            setZoneLayoutMode(domain.id, zone.id, newMode);
                                        }}
                                    >
                                        {zone.layout_mode === 'stacked' ? (
                                            <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                        ) : (
                                            <LayoutGrid className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                                        )}
                                    </button>
                                </div>

                                <span className="font-semibold">{zone.label}</span>
                                {zone.accepts_types && zone.accepts_types.length > 0 && (
                                    <span className="text-[9px] opacity-70 uppercase tracking-widest">
                                        {zone.accepts_types.join(", ")}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

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
                    <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Settings className="w-5 h-5 text-slate-500" />
                                Edit Domain: {domain.name}
                            </DialogTitle>
                        </DialogHeader>

                        <Tabs defaultValue="properties" className="w-full flex-1 flex flex-col min-h-0">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="properties">Properties</TabsTrigger>
                                <TabsTrigger value="metadata" className="flex items-center gap-2">
                                    <List className="w-4 h-4" />
                                    Metadata
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="properties" className="space-y-4 py-4 flex-1 overflow-y-auto pr-2">
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
                            </TabsContent>

                            <TabsContent value="metadata" className="space-y-4 py-4 flex-1 overflow-y-auto pr-2 min-h-[300px]">
                                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/30 mb-4">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">About Domain Metadata</h4>
                                        <HelpTooltip contentPath="canvases/domain-metadata" />
                                    </div>
                                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-tight mt-1">
                                        Governance, agent context, and automatic labeling.
                                    </p>
                                </div>


                                {effectiveSchema && effectiveSchema.length > 0 ? (
                                    <div className="space-y-4">
                                        {effectiveSchema.map((field: MetadataField) => {
                                            const value = editMetadata[field.key];

                                            const renderField = () => {
                                                switch (field.type) {
                                                    case 'text':
                                                        if (field.ui_component === 'textarea') {
                                                            return (
                                                                <Textarea
                                                                    value={value || ""}
                                                                    onChange={(e) => setEditMetadata(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                                    placeholder={`Enter ${field.label}...`}
                                                                />
                                                            );
                                                        }
                                                        return (
                                                            <Input
                                                                value={value || ""}
                                                                onChange={(e) => setEditMetadata(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                                placeholder={`Enter ${field.label}...`}
                                                            />
                                                        );
                                                    case 'number':
                                                        return (
                                                            <div className="flex gap-2 items-center">
                                                                <Input
                                                                    type="number"
                                                                    value={value ?? ""}
                                                                    onChange={(e) => {
                                                                        let val = e.target.value !== "" ? Number(e.target.value) : undefined;
                                                                        // Enforce Range if set
                                                                        if (val !== undefined) {
                                                                            if (field.min !== undefined && val < field.min) val = field.min;
                                                                            if (field.max !== undefined && val > field.max) val = field.max;
                                                                        }
                                                                        setEditMetadata(prev => ({ ...prev, [field.key]: val }));
                                                                    }}
                                                                    min={field.min}
                                                                    max={field.max}
                                                                    step={field.step || (field.decimals ? 1 / Math.pow(10, field.decimals) : 1)}
                                                                />
                                                                {field.ui_component === 'stepper' && (
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setEditMetadata(prev => ({ ...prev, [field.key]: (prev[field.key] || 0) + (field.step || 1) }))}><Plus className="h-2 w-2" /></Button>
                                                                        <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => setEditMetadata(prev => ({ ...prev, [field.key]: (prev[field.key] || 0) - (field.step || 1) }))}><X className="h-2 w-2" /></Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    case 'range':
                                                        if (field.ui_component === 'slider') {
                                                            return (
                                                                <div className="space-y-4 pt-2">
                                                                    <div className="flex justify-between text-xs text-muted-foreground">
                                                                        <span>{field.min ?? 0}</span>
                                                                        <span className="font-bold text-primary">{value ?? field.min ?? 0}</span>
                                                                        <span>{field.max ?? 100}</span>
                                                                    </div>
                                                                    <Slider
                                                                        min={field.min ?? 0}
                                                                        max={field.max ?? 100}
                                                                        step={field.step ?? 1}
                                                                        value={[value ?? field.min ?? 0]}
                                                                        onValueChange={(vals) => setEditMetadata(prev => ({ ...prev, [field.key]: vals[0] }))}
                                                                    />
                                                                </div>
                                                            );
                                                        }
                                                        return (
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <Input
                                                                    type="number"
                                                                    value={value ?? ""}
                                                                    onChange={(e) => {
                                                                        let val = Number(e.target.value);
                                                                        // Enforce Range if set
                                                                        if (field.min !== undefined && val < field.min) val = field.min;
                                                                        if (field.max !== undefined && val > field.max) val = field.max;
                                                                        setEditMetadata(prev => ({ ...prev, [field.key]: val }));
                                                                    }}
                                                                    placeholder="Value"
                                                                />
                                                                <div className="flex items-center text-xs text-muted-foreground italic">
                                                                    Range: {field.min ?? 0} - {field.max ?? 100}
                                                                </div>
                                                            </div>
                                                        );
                                                    case 'boolean':
                                                        if (field.ui_component === 'switch') {
                                                            return (
                                                                <div className="flex items-center gap-3 py-1">
                                                                    <Switch
                                                                        id={`switch-${field.key}`}
                                                                        checked={!!value}
                                                                        onCheckedChange={(checked) => setEditMetadata(prev => ({ ...prev, [field.key]: checked }))}
                                                                    />
                                                                    <Label htmlFor={`switch-${field.key}`} className="cursor-pointer">
                                                                        {value ? (field.true_label || "True") : (field.false_label || "False")}
                                                                    </Label>
                                                                </div>
                                                            );
                                                        }
                                                        return (
                                                            <div className="flex items-center gap-2 py-1">
                                                                <Checkbox
                                                                    id={`check-${field.key}`}
                                                                    checked={!!value}
                                                                    onCheckedChange={(checked) => setEditMetadata(prev => ({ ...prev, [field.key]: checked }))}
                                                                />
                                                                <Label htmlFor={`check-${field.key}`} className="cursor-pointer">
                                                                    {value ? (field.true_label || "True") : (field.false_label || "False")}
                                                                </Label>
                                                            </div>
                                                        );
                                                    case 'date':
                                                        return (
                                                            <div className="relative">
                                                                <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                                                                <Input
                                                                    type="date"
                                                                    className="pl-9"
                                                                    value={value || ""}
                                                                    onChange={(e) => setEditMetadata(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                                />
                                                            </div>
                                                        );
                                                    case 'time':
                                                        return (
                                                            <div className="relative">
                                                                <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                                                                <Input
                                                                    type="time"
                                                                    className="pl-9"
                                                                    value={value || ""}
                                                                    onChange={(e) => setEditMetadata(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                                />
                                                            </div>
                                                        );
                                                    case 'select':
                                                        return (
                                                            <Select
                                                                value={value || ""}
                                                                onValueChange={(v) => setEditMetadata(prev => ({ ...prev, [field.key]: v }))}
                                                            >
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue placeholder="Select option..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {field.options?.map((opt) => (
                                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        );
                                                    case 'multi-select':
                                                        return (
                                                            <MultiSelect
                                                                options={field.options || []}
                                                                selected={Array.isArray(value) ? value : []}
                                                                onChange={(vals) => setEditMetadata(prev => ({ ...prev, [field.key]: vals }))}
                                                                placeholder="Select multiple..."
                                                            />
                                                        );
                                                    case 'tags':
                                                        return (
                                                            <div className="space-y-2">
                                                                <div className="flex flex-wrap gap-1 min-h-[36px] p-1.5 border rounded-md bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                                                                    {(Array.isArray(value) ? value : []).map((tag, i) => (
                                                                        <Badge key={i} variant="secondary" className="gap-1">
                                                                            {tag}
                                                                            <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => setEditMetadata(prev => ({ ...prev, [field.key]: (prev[field.key] || []).filter((_: any, idx: number) => idx !== i) }))} />
                                                                        </Badge>
                                                                    ))}
                                                                    <input
                                                                        className="flex-1 bg-transparent outline-none text-sm px-1 min-w-[60px]"
                                                                        placeholder="Add tag..."
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter' || e.key === ',') {
                                                                                e.preventDefault();
                                                                                const val = e.currentTarget.value.trim();
                                                                                if (val) {
                                                                                    setEditMetadata(prev => {
                                                                                        const tags = Array.isArray(prev[field.key]) ? prev[field.key] : [];
                                                                                        if (tags.includes(val)) return prev;
                                                                                        return { ...prev, [field.key]: [...tags, val] };
                                                                                    });
                                                                                    e.currentTarget.value = "";
                                                                                }
                                                                            }
                                                                        }}
                                                                    />
                                                                </div>
                                                                <p className="text-[10px] text-muted-foreground">Press Enter or comma to add tags.</p>
                                                            </div>
                                                        );
                                                    default:
                                                        return <Input value={value || ""} readOnly />;
                                                }
                                            };

                                            return (
                                                <div key={field.key} className="space-y-2 p-3 border rounded-lg bg-card/50">
                                                    <div className="flex justify-between items-center">
                                                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                                                            {field.label}
                                                            {field.required && <span className="text-destructive font-bold">*</span>}
                                                        </Label>
                                                        <Badge variant="outline" className="text-[10px] font-mono py-0 h-4 px-1 opacity-50 border-none">{field.key}</Badge>
                                                    </div>
                                                    {renderField()}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-12 border-2 border-dashed rounded-lg">
                                        <List className="w-12 h-12 mb-2 opacity-20" />
                                        <p className="text-sm">No metadata schema defined for this domain.</p>
                                        <p className="text-[11px] mt-1 italic">Define a schema in the Scenario Configuration.</p>
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>

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

export { DomainNode };


