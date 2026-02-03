"use client";

import * as React from "react";
import { CustomLinkType, LinkType } from "../canvas-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEMANTIC_ICONS } from "../icon-utils";

const ICON_KEYS = Object.keys(SEMANTIC_ICONS);

interface LinkTypeEditorProps {
    linkTypes: CustomLinkType[];
    onChange: (types: CustomLinkType[]) => void;
}

export function LinkTypeEditor({ linkTypes, onChange }: LinkTypeEditorProps) {
    const [editingId, setEditingId] = React.useState<string | null>(null);

    const handleAdd = () => {
        // Auto-assign an icon by rotating through the list based on count
        const nextIconIndex = linkTypes.length % ICON_KEYS.length;
        const autoIcon = ICON_KEYS[nextIconIndex];

        const newType: CustomLinkType = {
            id: `link_${Date.now()}`,
            label: "New Relationship",
            description: "Description of relationship...",
            color: "#3b82f6", // Default blue
            stroke_style: "solid",
            end_marker: "arrow",
            icon: autoIcon
        };
        onChange([...linkTypes, newType]);
        setEditingId(newType.id);
    };

    const handleUpdate = (id: string, updates: Partial<CustomLinkType>) => {
        onChange(linkTypes.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const handleDelete = (id: string) => {
        onChange(linkTypes.filter(t => t.id !== id));
        if (editingId === id) setEditingId(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium">Link Types</h3>
                    <p className="text-sm text-muted-foreground">
                        Define the semantic relationships available in this scenario.
                    </p>
                </div>
                <Button onClick={handleAdd} size="sm" type="button">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Link Type
                </Button>
            </div>

            <div className="grid gap-4">
                {linkTypes.length === 0 && (
                    <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground">
                        No custom link types defined. The default system link types will be used.
                    </div>
                )}

                {linkTypes.map((type) => {
                    const isEditing = editingId === type.id;
                    const IconComponent = SEMANTIC_ICONS[type.icon as keyof typeof SEMANTIC_ICONS] || ArrowRight;

                    if (isEditing) {
                        return (
                            <Card key={type.id} className="border-primary ring-1 ring-primary/20">
                                <CardContent className="p-4 space-y-4">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-semibold text-sm">Editing Link Type</h4>
                                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} type="button">Done</Button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Label</Label>
                                            <Input
                                                value={type.label}
                                                onChange={e => handleUpdate(type.id, { label: e.target.value })}
                                                placeholder="e.g. Supports"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Internal ID</Label>
                                            <Input
                                                value={type.id}
                                                onChange={e => handleUpdate(type.id, { id: e.target.value })}
                                                className="font-mono bg-muted"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Short Description</Label>
                                        <Textarea
                                            value={type.description}
                                            onChange={e => handleUpdate(type.id, { description: e.target.value })}
                                            placeholder="Explain when to use this link..."
                                            rows={2}
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label>Color</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="color"
                                                    value={type.color}
                                                    onChange={e => handleUpdate(type.id, { color: e.target.value })}
                                                    className="w-10 p-1 cursor-pointer"
                                                />
                                                <Input
                                                    value={type.color}
                                                    onChange={e => handleUpdate(type.id, { color: e.target.value })}
                                                    className="font-mono"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Icon</Label>
                                            <Select
                                                value={type.icon}
                                                onValueChange={v => handleUpdate(type.id, { icon: v })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ICON_KEYS.map(key => {
                                                        const Ico = SEMANTIC_ICONS[key as keyof typeof SEMANTIC_ICONS];
                                                        return (
                                                            <SelectItem key={key} value={key}>
                                                                <div className="flex items-center gap-2">
                                                                    <Ico className="w-4 h-4" />
                                                                    <span className="capitalize">{key.replace('-', ' ')}</span>
                                                                </div>
                                                            </SelectItem>
                                                        );
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Style</Label>
                                            <Select
                                                value={type.stroke_style}
                                                onValueChange={v => handleUpdate(type.id, { stroke_style: v as any })}
                                            >
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="solid">Solid</SelectItem>
                                                    <SelectItem value="dashed">Dashed</SelectItem>
                                                    <SelectItem value="dotted">Dotted</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="pt-2 flex justify-end">
                                        <Button variant="destructive" size="sm" onClick={() => handleDelete(type.id)} type="button">
                                            <Trash2 className="w-4 h-4 mr-2" /> Delete Type
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    }

                    return (
                        <div
                            key={type.id}
                            className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                            onClick={() => setEditingId(type.id)}
                        >
                            <div
                                className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 border"
                                style={{
                                    borderColor: type.color,
                                    backgroundColor: `${type.color}15`, // 10% opacity
                                    color: type.color
                                }}
                            >
                                <IconComponent className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">{type.label}</span>
                                    <span className="text-xs text-muted-foreground font-mono">({type.id})</span>
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{type.description}</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingId(type.id); }} type="button">
                                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
