"use client";

import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_URL } from "@/lib/utils";

// Define interface matching the API schema
interface RenderingTypeItem {
    id: string;
    category: string;
    name: string;
    description: string;
}

interface RenderingTypesTabProps {
    selectedPreset?: string;
}

export function RenderingTypesTab({ selectedPreset }: RenderingTypesTabProps) {
    // State for data
    const [items, setItems] = useState<RenderingTypeItem[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);

    // Form state
    const [newItem, setNewItem] = useState<Partial<RenderingTypeItem>>({
        category: "TEXT",
        name: "",
        description: "",
    });

    // Fetch data
    useEffect(() => {
        fetchRenderingTypes();
    }, []);

    const fetchRenderingTypes = async () => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/rendering-types`);
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (error) {
            console.error("Failed to fetch rendering types:", error);
        }
    };

    const handleSave = async () => {
        try {
            const url = editingId
                ? `${API_URL}/smart-templates/rendering-types/${editingId}`
                : `${API_URL}/smart-templates/rendering-types`;

            const method = editingId ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newItem),
            });

            if (res.ok) {
                const data = await res.json();
                if (editingId) {
                    setItems(items.map(item => item.id === editingId ? data : item));
                } else {
                    setItems([...items, data]);
                }
                setIsDialogOpen(false);
                resetForm();
            }
        } catch (error) {
            console.error("Failed to save rendering type:", error);
        }
    };

    const handleSuggestDescription = async () => {
        if (!selectedPreset) {
            alert("Please select an AI Configuration in the main Admin Panel header.");
            return;
        }
        if (!newItem.category || !newItem.name) {
            alert("Please select a Category and enter a Name first.");
            return;
        }

        setIsSuggesting(true);
        try {
            const res = await fetch(`${API_URL}/smart-templates/suggest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    preset_name: selectedPreset,
                    type: "rendering-description",
                    details: {
                        name: newItem.name,
                        category: newItem.category
                    }
                })
            });

            if (res.ok) {
                const data = await res.json();
                setNewItem(prev => ({ ...prev, description: data.suggestion }));
            } else {
                alert("Failed to generate suggestion.");
            }
        } catch (error) {
            console.error(error);
            alert("Error generating suggestion.");
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleEdit = (item: RenderingTypeItem) => {
        setNewItem({
            category: item.category,
            name: item.name,
            description: item.description,
        });
        setEditingId(item.id);
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setNewItem({ category: "TEXT", name: "", description: "" });
        setEditingId(null);
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/rendering-types/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setItems(items.filter(item => item.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete rendering type:", error);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    {items.length} rendering types defined.
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Add Type
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">{editingId ? "Edit Rendering Type" : "Add Rendering Type"}</DialogTitle>
                            <DialogDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                                CONFIGURE OUTPUT VISUALIZATION
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="category" className="text-xs font-semibold text-muted-foreground uppercase">CATEGORY</Label>
                                <Select value={newItem.category} onValueChange={(val) => setNewItem({ ...newItem, category: val })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="TEXT">TEXT</SelectItem>
                                        <SelectItem value="GRAPHIC">GRAPHIC</SelectItem>
                                        <SelectItem value="DATA">DATA</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase">NAME</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Markdown Table"
                                    value={newItem.name}
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="description" className="text-xs font-semibold text-muted-foreground uppercase">DESCRIPTION</Label>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 px-2 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        onClick={handleSuggestDescription}
                                        disabled={isSuggesting}
                                    >
                                        {isSuggesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                                        Suggest
                                    </Button>
                                </div>
                                <Textarea
                                    id="description"
                                    placeholder="Explanation of how this type renders..."
                                    value={newItem.description}
                                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                                    className="min-h-[100px]"
                                />
                            </div>
                        </div>
                        <DialogFooter className="flex sm:justify-between w-full gap-2">
                            <DialogClose asChild>
                                <Button variant="outline" className="flex-1">Cancel</Button>
                            </DialogClose>
                            <Button onClick={handleSave} className="flex-1 bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                                <Check className="mr-2 h-4 w-4" /> Save Type
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell><span className="bg-slate-100 px-2 py-1 rounded-full text-xs">{item.category}</span></TableCell>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell className="max-w-[300px] truncate" title={item.description}>{item.description}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
