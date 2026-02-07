"use client";

import * as React from "react";
import { useCanvasStore, MetadataField, Domain } from "./canvas-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    X, Info, Database, Sparkles, Pin, List, Box,
    Calendar as CalendarIcon, Clock, Palette,
    Settings, Save, RotateCcw, GripVertical
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function InspectorPanel() {
    const inspectorOpen = useCanvasStore(s => s.inspectorOpen);
    const inspectedItemId = useCanvasStore(s => s.inspectedItemId);
    const inspectedItemType = useCanvasStore(s => s.inspectedItemType);
    const setInspectorOpen = useCanvasStore(s => s.setInspectorOpen);

    const things = useCanvasStore(s => s.things);
    const updateThing = useCanvasStore(s => s.updateThing);

    const domains = useCanvasStore(s => s.domains);
    const updateDomain = useCanvasStore(s => s.updateDomain);

    const activeScenario = useCanvasStore(s => s.activeScenario);

    // --- Local State for UX ---
    const [width, setWidth] = React.useState(350);
    const [isResizing, setIsResizing] = React.useState(false);

    // Edits buffer: Stores ONLY the changes. structure mirrors the target object.
    // For Thing: { custom_metadata: { key: value } }
    // For Domain: { name: "...", color: "...", metadata_values: { key: value } }
    const [edits, setEdits] = React.useState<Record<string, any>>({});

    // Resolve the inspected item
    const item = React.useMemo(() => {
        if (inspectedItemType === 'thing') {
            return things.find(t => t.id === inspectedItemId);
        } else if (inspectedItemType === 'domain') {
            return domains.find(d => d.id === inspectedItemId);
        }
        return null;
    }, [inspectedItemId, inspectedItemType, things, domains]);

    // Reset edits when item changes
    React.useEffect(() => {
        setEdits({});
    }, [inspectedItemId, inspectedItemType]);

    // Resize Logic
    const startResizing = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            // Calculate new width: Window Width - Mouse X
            // (Assuming panel is anchored right)
            const newWidth = window.innerWidth - e.clientX;
            // Clamp
            const clamped = Math.min(Math.max(newWidth, 300), 800);
            setWidth(clamped);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);


    // For Things, we need the associated domain for schema context
    const associatedDomain = React.useMemo(() => {
        if (inspectedItemType === 'thing' && item) {
            return domains.find(d => d.id === (item as any).domain_id);
        }
        return null;
    }, [item, inspectedItemType, domains]);

    // For Domains, we need the effective schema (scenario definition vs local override)
    const domainSchema = React.useMemo(() => {
        if (inspectedItemType === 'domain' && item) {
            const domain = item as Domain;
            if (!activeScenario?.configuration?.domain_definitions) return domain.metadata_schema;

            // Try to match by type or name to find definition
            const def = activeScenario.configuration.domain_definitions.find(d =>
                (domain.type && d.id === domain.type) || d.name === domain.name
            );
            return def?.metadata_schema || domain.metadata_schema;
        }
        return null;
    }, [item, inspectedItemType, activeScenario]);


    if (!inspectorOpen || !item) return null;

    const handleClose = () => setInspectorOpen(false);

    // --- Type Guards ---
    const isThing = inspectedItemType === 'thing';
    const isDomain = inspectedItemType === 'domain';

    // --- Buffered Value Getters ---

    // Check if we have unsaved changes
    const hasChanges = Object.keys(edits).length > 0;

    // Helper to get effective value (Edit > Current > Default)
    // path: ['custom_metadata', 'field_key'] or ['name']
    const getEffectiveValue = (path: string[]) => {
        // Check edits first
        let currentEdit = edits;
        for (const p of path) {
            if (currentEdit === undefined || currentEdit === null) break;
            currentEdit = currentEdit[p];
        }
        if (currentEdit !== undefined) return currentEdit;

        // Fallback to item
        let currentItem = item as any;
        for (const p of path) {
            if (currentItem === undefined || currentItem === null) break;
            currentItem = currentItem[p];
        }
        return currentItem;
    };

    // --- Update Handler (Buffers changes) ---

    const setEditValue = (path: string[], value: any) => {
        setEdits(prev => {
            const next = { ...prev };
            let ptr = next;
            for (let i = 0; i < path.length - 1; i++) {
                if (!ptr[path[i]]) ptr[path[i]] = {};
                // If we are branching off from a primitive in edits (shouldn't happen with correct usage), handle it?
                // For now assume path structure is consistent.

                // Deep copy if we are modifying an existing object in edits to avoid mutation issues (though new obj 'next' handles root)
                ptr[path[i]] = { ...ptr[path[i]] };
                ptr = ptr[path[i]];
            }
            ptr[path[path.length - 1]] = value;
            return next;
        });
    };

    // --- Commit / Cancel ---

    const handleSave = () => {
        if (!hasChanges) return;

        if (isThing) {
            // For thing, we are likely updating custom_metadata.
            // We need to merge edits.custom_metadata with existing custom_metadata (shallow merge of keys is fine usually, but let's be safe)
            const thing = item as any;
            const mergedCustomMetadata = {
                ...thing.custom_metadata,
                ...(edits.custom_metadata || {})
            };

            // If we have other top-level edits for things in future, handle them.
            updateThing(thing.id, {
                ...edits,
                custom_metadata: mergedCustomMetadata
            });
        } else if (isDomain) {
            const domain = item as any;
            // Domain properties might be mixed (name, description, metadata_values)
            const updates = { ...edits };
            if (updates.metadata_values) {
                updates.metadata_values = {
                    ...domain.metadata_values,
                    ...updates.metadata_values
                };
            }
            updateDomain(domain.id, updates);
        }

        setEdits({});
    };

    const handleCancel = () => {
        setEdits({});
    };


    // --- Toggle Pin (Buffered) ---
    const togglePin = (key: string, section: 'technical' | 'custom' | 'system') => {
        if (!isThing) return;

        // Get current pinned list (considering pending edits)
        const currentPinned = getEffectiveValue(['custom_metadata', '_pinned_fields']) || [];
        const fieldId = `${section}:${key}`;

        const newPinned = currentPinned.includes(fieldId)
            ? currentPinned.filter((p: string) => p !== fieldId)
            : [...currentPinned, fieldId];

        setEditValue(['custom_metadata', '_pinned_fields'], newPinned);
    };

    const isPinned = (key: string, section: 'technical' | 'custom' | 'system') => {
        if (!isThing) return false;
        const pinned = getEffectiveValue(['custom_metadata', '_pinned_fields']) || [];
        return pinned.includes(`${section}:${key}`);
    };


    // --- Generic Field Renderer ---
    const renderMetadataField = (
        field: MetadataField,
        basePath: string[],
        canPin: boolean = false,
        section?: 'custom'
    ) => {
        const fullPath = [...basePath, field.key];
        const currentValue = getEffectiveValue(fullPath);
        const onChange = (val: any) => setEditValue(fullPath, val);

        return (
            <div key={field.key} className="space-y-2 group p-2 rounded-md border border-transparent hover:border-slate-100 dark:hover:border-slate-800 transition-colors">
                <div className="flex justify-between items-center">
                    <Label className={cn("text-xs font-medium flex items-center gap-1", field.required && "after:content-['*'] after:ml-0.5 after:text-red-500")}>
                        {field.label}
                        {field.description && (
                            <div className="group/help relative inline-block">
                                <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                                <div className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 w-48 p-2 bg-slate-900 text-slate-50 text-[10px] rounded shadow-lg opacity-0 invisible group-hover/help:opacity-100 group-hover/help:visible transition-all z-50 pointer-events-none">
                                    {field.description}
                                </div>
                            </div>
                        )}
                    </Label>
                    {canPin && section && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity", isPinned(field.key, section) && "opacity-100 text-blue-500")}
                            onClick={() => togglePin(field.key, section)}
                        >
                            <Pin className="w-3 h-3" />
                        </Button>
                    )}
                </div>

                {/* Inputs based on type */}
                {field.type === 'text' && (
                    field.ui_component === 'textarea' ?
                        <Textarea
                            value={currentValue || ''}
                            onChange={e => onChange(e.target.value)}
                            className="text-sm min-h-[80px]"
                            placeholder={field.placeholder}
                        /> :
                        <Input
                            value={currentValue || ''}
                            onChange={e => onChange(e.target.value)}
                            className="h-8 text-sm"
                            placeholder={field.placeholder}
                        />
                )}

                {field.type === 'number' && (
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            value={currentValue ?? ''}
                            onChange={e => {
                                const val = e.target.value === '' ? undefined : Number(e.target.value);
                                onChange(val);
                            }}
                            className="h-8 text-sm"
                            min={field.min} max={field.max} step={field.step}
                        />
                    </div>
                )}

                {field.type === 'boolean' && (
                    <div className="flex items-center gap-2">
                        {field.ui_component === 'switch' ? (
                            <Switch
                                checked={!!currentValue}
                                onCheckedChange={onChange}
                            />
                        ) : (
                            <Checkbox
                                checked={!!currentValue}
                                onCheckedChange={onChange}
                            />
                        )}
                        <span className="text-xs text-muted-foreground">
                            {!!currentValue ? (field.true_label || 'True') : (field.false_label || 'False')}
                        </span>
                    </div>
                )}

                {field.type === 'select' && (
                    <Select
                        value={currentValue !== undefined && currentValue !== null ? String(currentValue) : ''}
                        onValueChange={onChange}
                    >
                        <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                            {(field.options || []).map(opt => (
                                <SelectItem key={opt.value} value={String(opt.value)}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {field.type === 'multi-select' && (
                    <MultiSelect
                        options={(field.options || []).map(opt => ({ ...opt, value: String(opt.value) }))}
                        selected={Array.isArray(currentValue) ? currentValue.map(String) : []}
                        onChange={onChange}
                        placeholder="Select multiple..."
                        className="text-sm"
                    />
                )}

                {field.type === 'date' && (
                    <div className="relative">
                        <CalendarIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                            type="date"
                            className="pl-8 h-8 text-sm"
                            value={currentValue || ""}
                            onChange={(e) => onChange(e.target.value)}
                        />
                    </div>
                )}

                {field.type === 'time' && (
                    <div className="relative">
                        <Clock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                            type="time"
                            className="pl-8 h-8 text-sm"
                            value={currentValue || ""}
                            onChange={(e) => onChange(e.target.value)}
                        />
                    </div>
                )}

                {field.type === 'range' && (
                    <div className="space-y-3 pt-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{field.min ?? 0}</span>
                            <span className="font-medium text-primary">{currentValue ?? field.min ?? 0}</span>
                            <span>{field.max ?? 100}</span>
                        </div>
                        <Slider
                            min={field.min ?? 0}
                            max={field.max ?? 100}
                            step={field.step ?? 1}
                            value={[currentValue ?? field.min ?? 0]}
                            onValueChange={(vals) => onChange(vals[0])}
                        />
                    </div>
                )}

                {/* Fallback for unsupported types */}
                {!['text', 'number', 'boolean', 'select', 'multi-select', 'date', 'time', 'range'].includes(field.type) && (
                    <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded border border-yellow-200">
                        Field type '{field.type}' not fully supported.
                    </div>
                )}
            </div>
        );
    };


    return (
        <div
            className="border-l bg-background h-full flex flex-col shadow-xl z-50 relative transition-[width] duration-0"
            style={{ width: width }}
        >
            {/* Resize Handle */}
            <div
                className={cn(
                    "absolute top-0 bottom-0 -left-1 w-2 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-[60]",
                    isResizing && "bg-blue-500/50 w-full left-0 opacity-0 cursor-ew-resize" // Cover to capture mouse events if needed, but window listener is better
                )}
                onMouseDown={startResizing}
            >
                <div className="absolute top-1/2 -mt-4 left-0.5 w-[3px] h-8 bg-slate-300 rounded-full dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="shrink-0 h-14 flex items-center justify-between px-4 border-b bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2 overflow-hidden">
                    {isThing ? <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <Settings className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    <span className="font-semibold text-sm truncate">
                        {isThing ? "Inspector" : isDomain ? "Domain Inspector" : "Inspector"}
                    </span>
                    {isDomain && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1 flex-shrink-0">Domain</Badge>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {/* Save Controls */}
                    {hasChanges ? (
                        <div className="flex items-center gap-1 mr-2 animate-in fade-in slide-in-from-right-2 duration-200">
                            <Button size="sm" onClick={handleSave} className="h-7 px-2 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white">
                                <Save className="w-3 h-3" />
                                Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                                <RotateCcw className="w-3 h-3" />
                            </Button>
                        </div>
                    ) : (
                        item && (
                            <div className="mr-2 text-[10px] text-muted-foreground italic opacity-50">
                                Up to date
                            </div>
                        )
                    )}

                    <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Content Switch */}
            {isThing && (
                <Tabs defaultValue="properties" className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 pt-2">
                        <TabsList className="w-full grid grid-cols-3">
                            <TabsTrigger value="technical" className="text-xs">Tech</TabsTrigger>
                            <TabsTrigger value="properties" className="text-xs">Props</TabsTrigger>
                            <TabsTrigger value="insights" className="text-xs">AI</TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Technical Metadata (Read-Only) */}
                    <TabsContent value="technical" className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full">
                            {/* Standard Tech Fields */}
                            <div className="space-y-4">
                                {/* Source Type */}
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Source Type</Label>
                                    <div className="text-sm font-medium capitalize">
                                        {(item as any).technical_metadata?.source_type || (item as any).type || 'Unknown'}
                                    </div>
                                </div>

                                {/* File Details (if applicable) */}
                                {((item as any).technical_metadata?.file_name || (item as any).content?.file_name) && (
                                    <div className="space-y-1 bg-muted/30 p-2 rounded">
                                        <Label className="text-xs text-muted-foreground mb-1 block">File Details</Label>
                                        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
                                            <span className="text-muted-foreground">Name:</span>
                                            <span className="font-mono break-all">{(item as any).technical_metadata?.file_name || (item as any).content?.file_name}</span>

                                            {(item as any).technical_metadata?.file_size && (
                                                <>
                                                    <span className="text-muted-foreground">Size:</span>
                                                    <span>{formatBytes((item as any).technical_metadata.file_size)}</span>
                                                </>
                                            )}

                                            {(item as any).technical_metadata?.mime_type && (
                                                <>
                                                    <span className="text-muted-foreground">Type:</span>
                                                    <span className="font-mono">{(item as any).technical_metadata.mime_type}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Chronology */}
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Chronology</Label>
                                    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs px-2 border-l-2">
                                        <span className="text-muted-foreground">Created:</span>
                                        <span>{new Date((item as any).created_at).toLocaleString()}</span>

                                        {(item as any).updated_at && (
                                            <>
                                                <span className="text-muted-foreground">Modified:</span>
                                                <span>{new Date((item as any).updated_at).toLocaleString()}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Origin */}
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Origin</Label>
                                    <div className="text-xs font-mono bg-muted p-2 rounded select-all break-all text-muted-foreground">
                                        {(item as any).technical_metadata?.source_path || (item as any).content?.url || (item as any).content?.path || 'N/A'}
                                    </div>
                                </div>

                                {/* Owner ID */}
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Owner ID</Label>
                                    <div className="text-xs font-mono text-muted-foreground">
                                        {(item as any).technical_metadata?.owner_id || (item as any).owner_id || 'System'}
                                    </div>
                                </div>

                                <Separator className="my-2" />

                                {/* Other Technical Metadata (Folded) */}
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground mb-2 block">Raw Metadata</Label>
                                    {(item as any).technical_metadata && Object.entries((item as any).technical_metadata).map(([key, value]) => {
                                        // Skip fields we already displayed
                                        if (['source_type', 'file_name', 'file_size', 'mime_type', 'source_path', 'owner_id'].includes(key)) return null;

                                        return (
                                            <div key={key} className="space-y-1 group relative pl-2 border-l border-slate-100 dark:border-slate-800">
                                                <div className="flex justify-between items-center">
                                                    <Label className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</Label>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className={cn("h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity", isPinned(key, 'technical') && "opacity-100 text-blue-500")}
                                                        onClick={() => togglePin(key, 'technical')}
                                                    >
                                                        <Pin className="w-2.5 h-2.5" />
                                                    </Button>
                                                </div>
                                                <div className="text-[11px] break-words">
                                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    {/* Properties (Custom Metadata - Editable) */}
                    <TabsContent value="properties" className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-6">
                                {/* Global Metadata Section */}
                                {activeScenario?.configuration?.thing_metadata_schema && activeScenario.configuration.thing_metadata_schema.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg border flex items-center gap-2">
                                            <div className="bg-slate-200 dark:bg-slate-700 p-1 rounded">
                                                <List className="w-3 h-3 text-slate-700 dark:text-slate-300" />
                                            </div>
                                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Global Metadata</span>
                                        </div>
                                        <div className="pl-1 space-y-4">
                                            {activeScenario.configuration.thing_metadata_schema.map((field) =>
                                                renderMetadataField(
                                                    field,
                                                    ['custom_metadata'], // Path to this metadata block in edits/item
                                                    true,
                                                    'custom'
                                                )
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Context Fields Section (Renamed from Domain Metadata) */}
                                {associatedDomain && (
                                    <div className="space-y-4 pt-2 border-t">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-100 dark:border-blue-800 flex items-center gap-2">
                                            <div className="bg-blue-100 dark:bg-blue-800 p-1 rounded">
                                                <Box className="w-3 h-3 text-blue-700 dark:text-blue-300" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">Context Fields</div>
                                                <div className="text-[10px] text-blue-600 dark:text-blue-400 opacity-80">from {associatedDomain.name}</div>
                                            </div>
                                        </div>
                                        <div className="pl-1 space-y-4">
                                            {associatedDomain.metadata_schema?.map((field: MetadataField) =>
                                                renderMetadataField(
                                                    field,
                                                    ['custom_metadata'],
                                                    true,
                                                    'custom'
                                                )
                                            )}
                                            {(!associatedDomain.metadata_schema || associatedDomain.metadata_schema.length === 0) && (
                                                <div className="text-xs text-muted-foreground italic px-2">No context fields defined.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    {/* Insights (System/AI Metadata - Read/Write) */}
                    <TabsContent value="insights" className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-4">
                                <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-100 dark:border-purple-800 flex items-start gap-3">
                                    <Sparkles className="w-4 h-4 text-purple-600 mt-0.5" />
                                    <div>
                                        <div className="text-xs text-purple-600 dark:text-purple-300 font-medium mb-1">AI Insights</div>
                                        <p className="text-[10px] text-muted-foreground">
                                            System-generated analysis and metadata.
                                        </p>
                                    </div>
                                </div>

                                {/* Render system_metadata from content */}
                                {(item as any).content?.system_metadata && Object.entries((item as any).content.system_metadata as Record<string, any>).map(([key, value]) => (
                                    <div key={key} className="space-y-1 group">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs font-mono text-muted-foreground">{key}</Label>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn("h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity", isPinned(key, 'system') && "opacity-100 text-blue-500")}
                                                onClick={() => togglePin(key, 'system')}
                                            >
                                                <Pin className="w-3 h-3" />
                                            </Button>
                                        </div>
                                        <div className="text-xs bg-slate-950 text-slate-50 p-2 rounded overflow-x-auto">
                                            <pre className="whitespace-pre-wrap">
                                                {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                ))}

                                {!(item as any).content?.system_metadata && (
                                    <div className="text-center py-8 text-xs text-muted-foreground">
                                        No system metadata available.
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            )}

            {isDomain && (
                <Tabs defaultValue="properties" className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 pt-2">
                        <TabsList className="w-full grid grid-cols-2">
                            <TabsTrigger value="properties" className="text-xs">Properties</TabsTrigger>
                            <TabsTrigger value="metadata" className="text-xs flex gap-1">
                                Metadata
                                {domainSchema && domainSchema.length > 0 &&
                                    <Badge variant="secondary" className="px-1 py-0 h-4 text-[9px]">{domainSchema.length}</Badge>
                                }
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="properties" className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Name</Label>
                                        <Input
                                            value={getEffectiveValue(['name']) || ''}
                                            onChange={(e) => setEditValue(['name'], e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Description</Label>
                                        <Textarea
                                            value={getEffectiveValue(['description']) || ''}
                                            onChange={(e) => setEditValue(['description'], e.target.value)}
                                            rows={3}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Color</Label>
                                        <div className="flex flex-col gap-3">
                                            <div className="flex gap-2">
                                                <div
                                                    className="w-10 h-10 rounded border"
                                                    style={{ backgroundColor: getEffectiveValue(['color']) }}
                                                />
                                                <Input
                                                    value={getEffectiveValue(['color']) || ''}
                                                    onChange={(e) => setEditValue(['color'], e.target.value)}
                                                    className="font-mono"
                                                />
                                            </div>
                                            {/* Simple Color Picker Popover */}
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" size="sm" className="w-full">
                                                        <Palette className="w-4 h-4 mr-2" />
                                                        Pick Color
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-3">
                                                    <HexColorPicker
                                                        color={getEffectiveValue(['color'])}
                                                        onChange={(c) => setEditValue(['color'], c)}
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-[10px] text-muted-foreground pt-4 border-t">
                                    Domain ID: <span className="font-mono select-all ml-1 bg-muted px-1 rounded">{(item as any).id}</span>
                                </div>
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="metadata" className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-6">
                                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-semibold text-indigo-900 dark:text-indigo-100">Domain Metadata</h4>
                                        <Info className="w-3 h-3 text-indigo-400" />
                                    </div>
                                    <p className="text-[10px] text-indigo-700 dark:text-indigo-300 leading-tight mt-1">
                                        These values apply to the domain itself, not the items within it.
                                    </p>
                                </div>

                                {domainSchema && domainSchema.length > 0 ? (
                                    <div className="space-y-4">
                                        {domainSchema.map((field: MetadataField) =>
                                            renderMetadataField(
                                                field,
                                                ['metadata_values']
                                            )
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-slate-50/50 dark:bg-slate-900/20">
                                        <List className="w-10 h-10 mb-2 opacity-20" />
                                        <p className="text-xs">No metadata schema defined.</p>
                                        <p className="text-[10px] mt-1 opacity-70">Configure schema in Scenario Settings.</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}
