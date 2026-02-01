"use client";

import * as React from "react";
import { DomainDefinition, MetadataField, DropZone } from "../canvas-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Box, List, Move } from "lucide-react";

interface DomainDefinitionEditorProps {
    domain: DomainDefinition;
    onChange: (domain: DomainDefinition) => void;
}

export function DomainDefinitionEditor({ domain, onChange }: DomainDefinitionEditorProps) {

    const updateVisual = (field: string, value: any) => {
        onChange({
            ...domain,
            visual_config: { ...domain.visual_config, [field]: value }
        });
    };

    const addMetadataField = () => {
        const newField: MetadataField = { key: `field_${Date.now()}`, label: "New Field", type: "text" };
        onChange({
            ...domain,
            metadata_schema: [...(domain.metadata_schema || []), newField]
        });
    };

    const updateMetadataField = (index: number, field: MetadataField) => {
        const newSchema = [...(domain.metadata_schema || [])];
        newSchema[index] = field;
        onChange({ ...domain, metadata_schema: newSchema });
    };

    const removeMetadataField = (index: number) => {
        const newSchema = [...(domain.metadata_schema || [])];
        newSchema.splice(index, 1);
        onChange({ ...domain, metadata_schema: newSchema });
    };

    const addDropZone = () => {
        const newZone: DropZone = {
            id: `zone_${Date.now()}`,
            label: "Drop Zone",
            dashed_style: true,
            accepts_types: ["*"]
        };
        onChange({
            ...domain,
            drop_zones: [...(domain.drop_zones || []), newZone]
        });
    };

    // ... Similar handlers for Drop Zones

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Domain Name</Label>
                    <Input value={domain.name} onChange={e => onChange({ ...domain, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                    <Label>ID (System)</Label>
                    <Input value={domain.id} onChange={e => onChange({ ...domain, id: e.target.value })} className="font-mono bg-muted" />
                </div>
            </div>

            <Tabs defaultValue="visuals">
                <TabsList className="w-full">
                    <TabsTrigger value="visuals" className="flex-1"><Box className="w-4 h-4 mr-2" /> Visuals</TabsTrigger>
                    <TabsTrigger value="metadata" className="flex-1"><List className="w-4 h-4 mr-2" /> Metadata</TabsTrigger>
                    <TabsTrigger value="dropzones" className="flex-1"><Move className="w-4 h-4 mr-2" /> Drop Zones</TabsTrigger>
                </TabsList>

                <TabsContent value="visuals" className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Primary Color</Label>
                            <div className="flex gap-2">
                                <Input type="color" value={domain.visual_config.color}
                                    onChange={e => updateVisual("color", e.target.value)}
                                    className="w-12 p-1 cursor-pointer" />
                                <Input value={domain.visual_config.color}
                                    onChange={e => updateVisual("color", e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Corner Radius ({domain.visual_config.corner_radius || 0}px)</Label>
                            <Slider
                                min={0} max={24} step={2}
                                value={[domain.visual_config.corner_radius || 0]}
                                onValueChange={vals => updateVisual("corner_radius", vals[0])}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Border Style</Label>
                            <Select value={domain.visual_config.border_style || "solid"}
                                onValueChange={v => updateVisual("border_style", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="solid">Solid</SelectItem>
                                    <SelectItem value="dashed">Dashed</SelectItem>
                                    <SelectItem value="dotted">Dotted</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="metadata" className="space-y-4 pt-4">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-medium">Schema Fields</h4>
                        <Button type="button" size="sm" variant="outline" onClick={addMetadataField}><Plus className="w-4 h-4 mr-2" /> Add Field</Button>
                    </div>
                    {/* List of metadata fields */}
                    <div className="space-y-2">
                        {(domain.metadata_schema || []).map((field, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                                <Input value={field.key} onChange={e => updateMetadataField(idx, { ...field, key: e.target.value })} placeholder="Key" className="font-mono text-xs w-1/3" />
                                <Input value={field.label} onChange={e => updateMetadataField(idx, { ...field, label: e.target.value })} placeholder="Label" className="flex-1" />
                                <Select value={field.type} onValueChange={v => updateMetadataField(idx, { ...field, type: v as any })}>
                                    <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="date">Date</SelectItem>
                                        <SelectItem value="select">Select</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeMetadataField(idx)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="dropzones" className="space-y-4 pt-4">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-medium">Drop Zones</h4>
                        <Button type="button" size="sm" variant="outline" onClick={addDropZone}><Plus className="w-4 h-4 mr-2" /> Add Zone</Button>
                    </div>
                    {/* List of drop zones */}
                    <div className="space-y-2">
                        {(domain.drop_zones || []).map((zone, idx) => (
                            <Card key={idx}>
                                <CardContent className="p-3 grid gap-2">
                                    <div className="flex gap-2">
                                        <Input value={zone.label}
                                            onChange={e => {
                                                const newZones = [...(domain.drop_zones || [])];
                                                newZones[idx].label = e.target.value;
                                                onChange({ ...domain, drop_zones: newZones });
                                            }}
                                            placeholder="Zone Label" />
                                        <Button type="button" variant="ghost" size="icon" onClick={() => {
                                            const newZones = [...(domain.drop_zones || [])];
                                            newZones.splice(idx, 1);
                                            onChange({ ...domain, drop_zones: newZones });
                                        }}><Trash2 className="w-4 h-4" /></Button>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <Label className="text-xs">Dashed?</Label>
                                        <Input type="checkbox" checked={zone.dashed_style}
                                            onChange={e => {
                                                const newZones = [...(domain.drop_zones || [])];
                                                newZones[idx].dashed_style = e.target.checked;
                                                onChange({ ...domain, drop_zones: newZones });
                                            }}
                                            className="w-4 h-4" />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
