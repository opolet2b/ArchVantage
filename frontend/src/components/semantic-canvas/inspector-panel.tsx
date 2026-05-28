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
    Settings, Save, RotateCcw, GripVertical,
    Bot, Activity
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
    const [edits, setEdits] = React.useState<Record<string, any>>({});

    // Resolve the inspected item
    const accessLevel = useCanvasStore(s => s.accessLevel);
    const isReadOnly = accessLevel === "read";

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
            const newWidth = window.innerWidth - e.clientX;
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

    // For Domains, we need the effective schema
    const domainSchema = React.useMemo(() => {
        if (inspectedItemType === 'domain' && item) {
            const domain = item as Domain;
            if (!activeScenario?.configuration?.domain_definitions) return domain.metadata_schema;

            const def = activeScenario.configuration.domain_definitions.find(d =>
                (domain.type && d.id === domain.type) || d.name === domain.name
            );
            return def?.metadata_schema || domain.metadata_schema;
        }
        return null;
    }, [item, inspectedItemType, activeScenario]);


    if (!inspectorOpen || !item) return null;

    const handleClose = () => setInspectorOpen(false);

    const isThing = inspectedItemType === 'thing';
    const isDomain = inspectedItemType === 'domain';

    const hasChanges = Object.keys(edits).length > 0;

    const getEffectiveValue = (path: string[]) => {
        let currentEdit = edits;
        for (const p of path) {
            if (currentEdit === undefined || currentEdit === null) break;
            currentEdit = currentEdit[p];
        }
        if (currentEdit !== undefined) return currentEdit;

        let currentItem = item as any;
        for (const p of path) {
            if (currentItem === undefined || currentItem === null) break;
            currentItem = currentItem[p];
        }
        return currentItem;
    };

    const setEditValue = (path: string[], value: any) => {
        if (isReadOnly) return;
        setEdits(prev => {
            const next = { ...prev };
            let ptr = next;
            for (let i = 0; i < path.length - 1; i++) {
                if (!ptr[path[i]]) ptr[path[i]] = {};
                ptr[path[i]] = { ...ptr[path[i]] };
                ptr = ptr[path[i]];
            }
            ptr[path[path.length - 1]] = value;
            return next;
        });
    };

    const handleSave = () => {
        if (!hasChanges || isReadOnly) return;

        if (isThing) {
            const thing = item as any;
            const mergedCustomMetadata = {
                ...thing.custom_metadata,
                ...(edits.custom_metadata || {})
            };

            updateThing(thing.id, {
                ...edits,
                custom_metadata: mergedCustomMetadata
            });
        } else if (isDomain) {
            const domain = item as any;
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


    const togglePin = (key: string, section: 'technical' | 'custom' | 'system') => {
        if (!isThing || isReadOnly) return;

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
                    {canPin && section && !isReadOnly && (
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

                {field.type === 'text' && (
                    field.ui_component === 'textarea' ?
                        <Textarea
                            value={currentValue || ''}
                            onChange={e => onChange(e.target.value)}
                            disabled={isReadOnly}
                            className="text-sm min-h-[80px]"
                            placeholder={field.placeholder}
                        /> :
                        <Input
                            value={currentValue || ''}
                            onChange={e => onChange(e.target.value)}
                            disabled={isReadOnly}
                            className="h-8 text-sm"
                            placeholder={field.placeholder}
                        />
                )}

                {field.type === 'number' && (
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            value={currentValue ?? ''}
                            disabled={isReadOnly}
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
                                disabled={isReadOnly}
                            />
                        ) : (
                            <Checkbox
                                checked={!!currentValue}
                                onCheckedChange={onChange}
                                disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                            disabled={isReadOnly}
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
                            disabled={isReadOnly}
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
                            disabled={isReadOnly}
                        />
                    </div>
                )}

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
            <div
                className={cn(
                    "absolute top-0 bottom-0 -left-1 w-2 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-[60]",
                    isResizing && "bg-blue-500/50 w-full left-0 opacity-0 cursor-ew-resize"
                )}
                onMouseDown={startResizing}
            >
                <div className="absolute top-1/2 -mt-4 left-0.5 w-[3px] h-8 bg-slate-300 rounded-full dark:bg-slate-600" />
            </div>

            <div className="shrink-0 h-14 flex items-center justify-between px-4 border-b bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2 overflow-hidden">
                    {isThing ? <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <Settings className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    <span className="font-semibold text-sm truncate">
                        {isThing ? "Inspector" : isDomain ? "Domain Inspector" : "Inspector"}
                    </span>
                    {isDomain && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1 flex-shrink-0">Domain</Badge>
                    )}
                    {isReadOnly && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-amber-100 text-amber-700 border-amber-200 uppercase font-bold">Read Only</Badge>
                    )}
                    {item && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 text-[9px] px-1.5 ml-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={() => {
                                navigator.clipboard.writeText(item.id);
                            }}
                            title="Copy ID to clipboard"
                        >
                            Copy ID
                        </Button>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {hasChanges && !isReadOnly ? (
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
                        item && !isReadOnly && (
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

            {isThing && (
                <Tabs defaultValue="properties" className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 pt-2">
                        <TabsList className="w-full grid grid-cols-3">
                            <TabsTrigger value="technical" className="text-xs">Tech</TabsTrigger>
                            <TabsTrigger value="properties" className="text-xs">Props</TabsTrigger>
                            <TabsTrigger value="insights" className="text-xs">AI</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="technical" className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-4">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Source Type</Label>
                                    <div className="text-sm font-medium capitalize">
                                        {(item as any).technical_metadata?.source_type || (item as any).type || 'Unknown'}
                                    </div>
                                </div>

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

                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Origin</Label>
                                    <div className="text-xs font-mono bg-muted p-2 rounded select-all break-all text-muted-foreground">
                                        {(item as any).technical_metadata?.source_path || (item as any).content?.url || (item as any).content?.path || 'N/A'}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Owner ID</Label>
                                    <div className="text-xs font-mono text-muted-foreground">
                                        {(item as any).technical_metadata?.owner_id || (item as any).owner_id || 'System'}
                                    </div>
                                </div>

                                <Separator className="my-2" />

                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground mb-2 block">Raw Metadata</Label>
                                    {(item as any).technical_metadata && Object.entries((item as any).technical_metadata).map(([key, value]) => {
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

                    <TabsContent value="properties" className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-6">
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
                                                    ['custom_metadata'],
                                                    true,
                                                    'custom'
                                                )
                                            )}
                                        </div>
                                    </div>
                                )}

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

                    <TabsContent value="insights" className="flex-1 overflow-hidden p-0">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-4">
                                {(() => {
                                    const systemMeta = (item as any).content?.system_metadata || {};
                                    const aiInsight = systemMeta.ai_insight;
                                    const otherMeta = Object.entries(systemMeta).filter(([k]) => k !== 'ai_insight');

                                    const renderMarkdown = (text: string) => {
                                        if (typeof text !== 'string') return String(text);
                                        
                                        // Handle <think> tags specifically by splitting blocks
                                        const blocks = text.split(/(<think>[\s\S]*?<\/think>)/g);
                                        
                                        return blocks.map((block, bi) => {
                                            if (block.startsWith('<think>') && block.endsWith('</think>')) {
                                                const thought = block.slice(7, -8).trim();
                                                if (!thought) return null;
                                                return (
                                                    <div key={bi} className="my-2 p-2 bg-slate-100/30 dark:bg-slate-800/30 border-l-2 border-purple-300 dark:border-purple-700 rounded-r-md text-[10px] italic text-muted-foreground leading-snug">
                                                        <div className="font-bold text-[8px] uppercase mb-1 opacity-50 flex items-center gap-1">
                                                            <Sparkles className="w-2 h-2" />
                                                            Thinking Process
                                                        </div>
                                                        {thought.split('\n').map((line, li) => (
                                                            <div key={li} className="min-h-[0.5rem]">{line}</div>
                                                        ))}
                                                    </div>
                                                );
                                            }

                                            const lines = block.split('\n');
                                            return lines.map((line, i) => {
                                                const trimmed = line.trim();
                                                if (!trimmed && i < lines.length - 1) return <div key={`${bi}-${i}`} className="h-1" />;
                                                
                                                const isBullet = trimmed.startsWith('-');
                                                const isHeader = trimmed.startsWith('#');
                                                
                                                let cleanLine = line;
                                                let className = "mb-1 text-[11px] leading-relaxed";
                                                
                                                if (isBullet) {
                                                    cleanLine = trimmed.substring(1).trim();
                                                    className = cn(className, "pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-purple-400");
                                                } else if (isHeader) {
                                                    const level = (trimmed.match(/^#+/) || ['#'])[0].length;
                                                    cleanLine = trimmed.replace(/^#+\s*/, '');
                                                    className = cn(className, "font-bold text-purple-900 dark:text-purple-100 mt-2 mb-1", 
                                                        level === 1 ? "text-sm" : "text-[12px]");
                                                }

                                                const parts = cleanLine.split(/(\*\*.*?\*\*)/g);
                                                const formattedLine = parts.map((part, pi) => {
                                                    if (part.startsWith('**') && part.endsWith('**')) {
                                                        return <strong key={pi} className="text-purple-700 dark:text-purple-300 font-semibold">{part.slice(2, -2)}</strong>;
                                                    }
                                                    return part;
                                                });
                                                
                                                return (
                                                    <div key={`${bi}-${i}`} className={className}>
                                                        {formattedLine}
                                                    </div>
                                                );
                                            });
                                        });
                                    };

                                    return (
                                        <div className="space-y-6">
                                            {aiInsight ? (
                                                <div className="relative group overflow-hidden rounded-xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-slate-950 shadow-sm">
                                                    <div className="p-3">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="p-1 bg-purple-100 dark:bg-purple-900 rounded-md">
                                                                    <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                                                </div>
                                                                <span className="text-[10px] font-bold text-purple-900 dark:text-purple-100 uppercase tracking-tighter">AI Reasoning Trace</span>
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                onClick={() => navigator.clipboard.writeText(aiInsight)}
                                                            >
                                                                <Box className="w-3 h-3 text-muted-foreground" />
                                                            </Button>
                                                        </div>
                                                        <div className="text-slate-800 dark:text-slate-200 mt-4">
                                                            <div className="relative space-y-6 before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-purple-200 dark:before:via-purple-800 before:to-transparent">
                                                                {aiInsight.split(/\n---\n/).map((eventText: string, idx: number) => {
                                                                    if (!eventText.trim()) return null;
                                                                    
                                                                    // Extract timestamp (### YYYY-MM-DD ...)
                                                                    const timeMatch = eventText.match(/###\s*(.*?)\n/);
                                                                    const timestamp = timeMatch ? timeMatch[1].trim() : '';
                                                                    
                                                                    // Extract automation name (**Name**)
                                                                    const nameMatch = eventText.match(/\*\*(.*?)\*\*/);
                                                                    const autoName = nameMatch ? nameMatch[1].trim() : 'Automation Event';
                                                                    
                                                                    // Clean up the text for markdown rendering
                                                                    let cleanText = eventText.replace(/###.*?\n/, '').replace(/\*\*.*?\*\*/, '').trim();
                                                                    
                                                                    return (
                                                                        <div key={idx} className="relative flex items-start gap-4">
                                                                            <div className="flex items-center justify-center w-8 h-8 rounded-full border-4 border-white dark:border-slate-950 bg-purple-100 dark:bg-purple-900 shadow-sm shrink-0 z-10 mt-1">
                                                                                <Bot className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                                                            </div>
                                                                            <div className="flex-1 p-3 rounded-xl border border-purple-100 dark:border-purple-800/50 bg-white/50 dark:bg-slate-900/50 shadow-sm hover:shadow-md transition-shadow relative before:absolute before:top-4 before:-left-2 before:w-2 before:h-2 before:bg-white/50 dark:before:bg-slate-900/50 before:border-l before:border-b before:border-purple-100 dark:before:border-purple-800/50 before:rotate-45">
                                                                                <div className="flex items-center justify-between mb-2 pb-2 border-b border-purple-50 dark:border-purple-900/30">
                                                                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-[11px] uppercase tracking-wider">{autoName}</h3>
                                                                                    <time className="text-[9px] font-mono text-purple-500/70">{timestamp}</time>
                                                                                </div>
                                                                                <div className="text-slate-700 dark:text-slate-300">
                                                                                    {renderMarkdown(cleanText)}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="h-1 bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 opacity-30" />
                                                </div>
                                            ) : (
                                                <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-100 dark:border-purple-800 flex items-start gap-3">
                                                    <Sparkles className="w-4 h-4 text-purple-600 mt-0.5" />
                                                    <div>
                                                        <div className="text-xs text-purple-600 dark:text-purple-300 font-medium mb-1">AI Insights</div>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            System-generated analysis and metadata.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {otherMeta.length > 0 && (
                                                <div className="space-y-3 pt-2">
                                                    {otherMeta.map(([key, value]) => (
                                                        <div key={key} className="space-y-1 group">
                                                            <div className="flex justify-between items-center px-1">
                                                                <Label className="text-[10px] font-mono text-muted-foreground/70">{key}</Label>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className={cn("h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity", isPinned(key, 'system') && "opacity-100 text-blue-500")}
                                                                    onClick={() => togglePin(key, 'system')}
                                                                >
                                                                    <Pin className="w-3 h-3" />
                                                                </Button>
                                                            </div>
                                                            <div className="text-[10px] bg-slate-950 text-slate-50 p-2 rounded font-mono break-all border border-transparent hover:border-slate-800 transition-colors">
                                                                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {!aiInsight && otherMeta.length === 0 && (
                                                <div className="text-center py-8 text-xs text-muted-foreground">
                                                    No insights available.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
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
                                            disabled={isReadOnly}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Description</Label>
                                        <Textarea
                                            value={getEffectiveValue(['description']) || ''}
                                            onChange={(e) => setEditValue(['description'], e.target.value)}
                                            rows={3}
                                            disabled={isReadOnly}
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
                                                    disabled={isReadOnly}
                                                />
                                            </div>
                                            {!isReadOnly && (
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
                                            )}
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
