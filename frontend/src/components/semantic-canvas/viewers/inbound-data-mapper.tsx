import * as React from "react";
import { useCanvasStore, Thing } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { Settings, Waypoints, Save, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface InboundDataMapperProps {
    thing: Thing;
}

export function InboundDataMapper({ thing }: InboundDataMapperProps) {
    const { things, links, updateThing } = useCanvasStore();
    const content = thing.content as any;

    const incomingLinks = links.filter(l => l.target_id === thing.id);
    const sourceNodes = incomingLinks.map(l => things.find(t => t.id === l.source_id)).filter(Boolean);

    const getIncomingSchemaInfo = () => {
        const info: Array<{ key: string, type: string }> = [];
        
        sourceNodes.forEach(node => {
            if (node.type === "form_tool") {
                const values = node.content.values || node.content.populatedSchema?.data;
                if (values && Object.keys(values).length > 0) {
                    Object.entries(values).forEach(([k, v]) => {
                        if (!info.find(i => i.key === k)) info.push({ key: k, type: typeof v });
                    });
                } else {
                    let guiSchema = node.content.gui_schema;
                    console.log("[InboundDataMapper] Form tool guiSchema raw:", guiSchema);
                    if (typeof guiSchema === "string") {
                        try { guiSchema = JSON.parse(guiSchema); } catch (e) { console.error("Parse error", e); }
                    }
                    console.log("[InboundDataMapper] Form tool guiSchema parsed:", guiSchema);
                    if (guiSchema?.output_schema?.properties) {
                        Object.entries(guiSchema.output_schema.properties).forEach(([k, v]: [string, any]) => {
                            if (!info.find(i => i.key === k)) info.push({ key: k, type: v.type || "string" });
                        });
                    } else if (guiSchema?.properties) {
                        Object.entries(guiSchema.properties).forEach(([k, v]: [string, any]) => {
                            if (!info.find(i => i.key === k)) info.push({ key: k, type: v.type || "string" });
                        });
                    } else if (guiSchema?.components) {
                        guiSchema.components.forEach((c: any) => {
                            const fieldKey = c.id || c.key;
                            if (fieldKey && !info.find(i => i.key === fieldKey)) info.push({ key: fieldKey, type: c.type || "string" });
                        });
                    }
                }
            } else {
                let values: any = {};
                if (node.type === "agent_result") values = node.content.result || node.content.outputs || {};
                else if (typeof node.content === "object" && node.type !== "text") values = node.content.data || node.content.values || node.content;
                
                if (values && typeof values === "object" && !Array.isArray(values)) {
                    Object.entries(values).forEach(([k, v]) => {
                        if (!info.find(i => i.key === k)) info.push({ key: k, type: typeof v });
                    });
                }
            }
        });
        return info;
    };

    const schemaInfo = getIncomingSchemaInfo();
    const availableKeys = schemaInfo.map(i => i.key);

    const [mapping, setMapping] = React.useState<any>(content.input_mapping || {
        enabled: false,
        format: "table",
        spreadsheet_format: "columns",
        behavior: "replace",
        selectedKeys: [],
    });

    const [isDialogOpen, setIsDialogOpen] = React.useState(false);

    const handleSaveConfig = () => {
        updateThing(thing.id, {
            content: {
                ...content,
                input_mapping: mapping
            }
        });
        setIsDialogOpen(false);
    };

    if (sourceNodes.length === 0) return null;

    return (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="secondary" size="sm" className="h-7 px-2 shadow-sm bg-background/80 backdrop-blur text-xs">
                        <Waypoints className="h-3 w-3 mr-1 text-blue-500" /> Mapping
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Inbound Data Mapping</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-5">
                        <div className="flex items-center space-x-2 bg-muted/50 p-2 rounded">
                            <Checkbox 
                                id="enableMapping" 
                                checked={mapping.enabled}
                                onCheckedChange={(c) => setMapping({ ...mapping, enabled: !!c })}
                            />
                            <Label htmlFor="enableMapping" className="font-semibold cursor-pointer">Enable Automatic Ingestion</Label>
                        </div>
                        
                        {mapping.enabled && (
                            <>
                                <div className="space-y-2">
                                    <Label>Ingestion Behavior</Label>
                                    <Select value={mapping.behavior || "replace"} onValueChange={v => setMapping({...mapping, behavior: v})}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="replace">Replace (Live Sync)</SelectItem>
                                            <SelectItem value="append">Append (Accumulate as List)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {thing.type !== "spreadsheet" && (
                                    <div className="space-y-2">
                                        <Label>Display Format</Label>
                                        <Select value={mapping.format} onValueChange={v => setMapping({...mapping, format: v})}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="table">Markdown Table</SelectItem>
                                                <SelectItem value="bullets">Bullet Points</SelectItem>
                                                <SelectItem value="raw">Raw JSON</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                
                                {thing.type === "spreadsheet" && (
                                    <div className="space-y-2">
                                        <Label>Spreadsheet Layout</Label>
                                        <Select value={mapping.spreadsheet_format || "columns"} onValueChange={v => setMapping({...mapping, spreadsheet_format: v})}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="columns">In columns (Standard Table)</SelectItem>
                                                <SelectItem value="rows">In rows (Key/Value pairs)</SelectItem>
                                                <SelectItem value="raw">Raw JSON in single cell</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label>Select Fields to Display</Label>
                                    <div className="border rounded-md p-2 max-h-[250px] overflow-y-auto space-y-1">
                                        {schemaInfo.map(info => {
                                            const isSelected = mapping.selectedKeys.includes(info.key);
                                            return (
                                                <div key={info.key} className="flex items-center space-x-2 p-1 hover:bg-muted/50 rounded">
                                                    <Checkbox 
                                                        checked={isSelected}
                                                        onCheckedChange={(c) => {
                                                            if (c) {
                                                                setMapping({...mapping, selectedKeys: [...mapping.selectedKeys, info.key]});
                                                            } else {
                                                                setMapping({...mapping, selectedKeys: mapping.selectedKeys.filter((key: string) => key !== info.key)});
                                                            }
                                                        }}
                                                    />
                                                    <Label className="text-sm font-normal cursor-pointer flex-1">
                                                        {info.key} <span className="text-muted-foreground text-xs ml-2">({info.type})</span>
                                                    </Label>
                                                </div>
                                            );
                                        })}
                                        {availableKeys.length === 0 && (
                                            <div className="text-sm text-muted-foreground p-2">
                                                No structured data found in incoming links. Ensure the upstream node (like a Form) has submitted data.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="flex justify-end pt-2">
                            <Button onClick={handleSaveConfig}><Save className="w-4 h-4 mr-2"/> Save Mapping</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
