"use client";

import * as React from "react";
import { DomainGroup } from "../canvas-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface DomainGroupEditorProps {
    group: DomainGroup;
    onChange: (group: DomainGroup) => void;
}

export function DomainGroupEditor({ group, onChange }: DomainGroupEditorProps) {

    const updateDefaultVisual = (field: string, value: any) => {
        onChange({
            ...group,
            default_visual_config: { ...group.default_visual_config, [field]: value, color: group.default_visual_config?.color || "#000000" }
        });
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label>Group Name (Folder)</Label>
                <Input value={group.name} onChange={e => onChange({ ...group, name: e.target.value })} />
            </div>
            <div className="space-y-2">
                <Label>Description</Label>
                <Input value={group.description || ""} onChange={e => onChange({ ...group, description: e.target.value })} />
            </div>

            <div className="p-4 border rounded-lg bg-muted/20 space-y-4">
                <h4 className="text-sm font-medium">Inheritance Defaults</h4>
                <p className="text-xs text-muted-foreground">Domains inside this group will inherit these visual settings.</p>

                <div className="space-y-2">
                    <Label>Default Color</Label>
                    <div className="flex gap-2">
                        <Input type="color" value={group.default_visual_config?.color || "#000000"}
                            onChange={e => updateDefaultVisual("color", e.target.value)}
                            className="w-12 p-1 cursor-pointer" />
                        <Input value={group.default_visual_config?.color || "#000000"}
                            onChange={e => updateDefaultVisual("color", e.target.value)} />
                    </div>
                </div>
            </div>
        </div>
    );
}
