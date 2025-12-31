"use client";

import React, { useState } from "react";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface VariableConfig {
    id: string;
    name: string;
    description: string;
    type: "text" | "number" | "date" | "time" | "boolean" | "select_single" | "select_multiple";
    options?: string[]; // For select types
}

interface VariableEditorProps {
    variables: VariableConfig[];
    onChange: (vars: VariableConfig[]) => void;
}

export function VariableEditor({ variables = [], onChange }: VariableEditorProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingVar, setEditingVar] = useState<VariableConfig | null>(null);

    // Temp state for the form
    const [formData, setFormData] = useState<Partial<VariableConfig>>({
        type: "text",
        name: "",
        description: "",
        options: []
    });

    // State for managing options in the form
    const [newOption, setNewOption] = useState("");

    const openForAdd = () => {
        setFormData({
            id: crypto.randomUUID(),
            type: "text",
            name: "",
            description: "",
            options: []
        });
        setEditingVar(null);
        setIsDialogOpen(true);
    };

    const openForEdit = (v: VariableConfig) => {
        setFormData({ ...v });
        setEditingVar(v);
        setIsDialogOpen(true);
    };

    const handleSave = () => {
        if (!formData.name) return; // Simple validation

        const newVar = formData as VariableConfig;

        if (editingVar) {
            // Update existing
            onChange(variables.map(v => v.id === editingVar.id ? newVar : v));
        } else {
            // Add new
            onChange([...variables, newVar]);
        }
        setIsDialogOpen(false);
    };

    const handleDelete = (id: string) => {
        onChange(variables.filter(v => v.id !== id));
    };

    const addOption = () => {
        if (!newOption.trim()) return;
        setFormData(prev => ({
            ...prev,
            options: [...(prev.options || []), newOption.trim()]
        }));
        setNewOption("");
    };

    const removeOption = (idx: number) => {
        setFormData(prev => ({
            ...prev,
            options: (prev.options || []).filter((_, i) => i !== idx)
        }));
    };

    const isSelectType = formData.type === "select_single" || formData.type === "select_multiple";

    return (
        <div className="space-y-3">
            <div className="flex justify-between items-center">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">No Code Variables</Label>
                <Button variant="outline" size="sm" onClick={openForAdd} className="h-7 text-xs">
                    <Plus className="mr-1 h-3 w-3" /> Add Variable
                </Button>
            </div>

            <div className="space-y-2">
                {variables.length === 0 && (
                    <div className="text-xs text-muted-foreground italic text-center py-2 bg-muted/20 rounded">
                        No variables defined.
                    </div>
                )}
                {variables.map(v => (
                    <Card key={v.id} className="p-2 flex items-center justify-between group">
                        <div className="flex flex-col gap-1 overflow-hidden">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm truncate">{v.name}</span>
                                <Badge variant="outline" className="text-[10px] h-4 px-1">{v.type}</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground truncate">{v.description}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openForEdit(v)}>
                                <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => handleDelete(v.id)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{editingVar ? "Edit Variable" : "Add Variable"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(val: any) => setFormData({ ...formData, type: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="time">Time</SelectItem>
                                    <SelectItem value="boolean">Boolean</SelectItem>
                                    <SelectItem value="select_single">Select (Single)</SelectItem>
                                    <SelectItem value="select_multiple">Select (Multiple)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Variable Name</Label>
                            <Input
                                placeholder="e.g. client_segment"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                placeholder="Help the AI understand what this variable represents..."
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        {isSelectType && (
                            <div className="space-y-2 border-t pt-2 mt-2">
                                <Label className="text-xs font-semibold">Options Values</Label>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Add option..."
                                        value={newOption}
                                        onChange={e => setNewOption(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addOption();
                                            }
                                        }}
                                        className="h-8"
                                    />
                                    <Button size="sm" onClick={addOption} className="h-8"><Plus className="h-4 w-4" /></Button>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-2 max-h-32 overflow-y-auto">
                                    {formData.options?.map((opt, idx) => (
                                        <Badge key={idx} variant="secondary" className="pr-1 gap-1">
                                            {opt}
                                            <X className="h-3 w-3 cursor-pointer hover:text-red-500" onClick={() => removeOption(idx)} />
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSave}>Save Variable</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
