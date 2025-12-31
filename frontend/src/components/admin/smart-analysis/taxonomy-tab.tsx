"use client";

import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { API_URL } from "@/lib/utils";

// Define interface matching the API schema
interface TaxonomyItem {
    id: string;
    category_name: string;
    activity_type: string;
    input_mode: string;
    description?: string;
}

interface GlobalCategoryItem {
    id: string;
    name: string;
    context: string;
    active: boolean;
}

interface TaxonomyTabProps {
    selectedPreset?: string;
}

export function TaxonomyTab({ selectedPreset }: TaxonomyTabProps) {
    // State for data and loading
    const [items, setItems] = useState<TaxonomyItem[]>([]);
    const [categories, setCategories] = useState<GlobalCategoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);

    // Form state
    const [newItem, setNewItem] = useState<Partial<TaxonomyItem>>({
        category_name: "",
        activity_type: "",
        input_mode: "single",
        description: "",
    });

    // Fetch data
    useEffect(() => {
        fetchTaxonomies();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const catRes = await fetch(`${API_URL}/smart-templates/categories?context=Taxonomy`);
            if (catRes.ok) {
                const catData = await catRes.json();
                setCategories(catData);
            }
        } catch (error) {
            console.error("Failed to fetch categories:", error);
        }
    };

    const fetchTaxonomies = async () => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/taxonomies`);
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (error) {
            console.error("Failed to fetch taxonomies:", error);
        }
    };

    const handleSave = async () => {
        try {
            const url = editingId
                ? `${API_URL}/smart-templates/taxonomies/${editingId}`
                : `${API_URL}/smart-templates/taxonomies`;

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
            console.error("Failed to save taxonomy:", error);
        }
    };

    const handleSuggestDescription = async () => {
        if (!selectedPreset) {
            alert("Please select an AI Configuration in the main Admin Panel header.");
            return;
        }
        if (!newItem.category_name || !newItem.activity_type) {
            alert("Please select a Category and enter an Activity Type first.");
            return;
        }

        setIsSuggesting(true);
        try {
            const res = await fetch(`${API_URL}/smart-templates/suggest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    preset_name: selectedPreset,
                    type: "taxonomy-description",
                    details: {
                        category: newItem.category_name,
                        activity: newItem.activity_type,
                        input_mode: newItem.input_mode
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

    const handleEdit = (item: TaxonomyItem) => {
        setNewItem({
            category_name: item.category_name,
            activity_type: item.activity_type,
            input_mode: item.input_mode,
            description: item.description || "",
        });
        setEditingId(item.id);
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setNewItem({ category_name: "", activity_type: "", input_mode: "single", description: "" });
        setEditingId(null);
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/taxonomies/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setItems(items.filter(item => item.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete taxonomy:", error);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    {items.length} taxonomies defined.
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Add Taxonomy
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">{editingId ? "Edit Taxonomy" : "Add Taxonomy"}</DialogTitle>
                            <DialogDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                                CONFIGURE TAXONOMY PARAMETERS
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-4 flex-1 overflow-y-auto px-1">
                            <div className="space-y-2">
                                <Label htmlFor="category" className="text-xs font-semibold text-muted-foreground uppercase">CATEGORY</Label>
                                <Select value={newItem.category_name} onValueChange={(val) => setNewItem({ ...newItem, category_name: val })}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="activity" className="text-xs font-semibold text-muted-foreground uppercase">ACTIVITY TYPE</Label>
                                <Input
                                    id="activity"
                                    placeholder="e.g. SWOT Analysis"
                                    value={newItem.activity_type}
                                    onChange={(e) => setNewItem({ ...newItem, activity_type: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase">INPUT MODE</Label>
                                <div className="flex bg-muted/30 p-1 rounded-lg border">
                                    <button
                                        onClick={() => setNewItem({ ...newItem, input_mode: "single" })}
                                        className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${newItem.input_mode === "single"
                                            ? "bg-[#4F46E5] text-white shadow-sm"
                                            : "text-muted-foreground hover:bg-muted/50"
                                            }`}
                                    >
                                        Single Document
                                    </button>
                                    <button
                                        onClick={() => setNewItem({ ...newItem, input_mode: "multi" })}
                                        className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${newItem.input_mode === "multi"
                                            ? "bg-[#4F46E5] text-white shadow-sm"
                                            : "text-muted-foreground hover:bg-muted/50"
                                            }`}
                                    >
                                        Multi Document
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="desc" className="text-xs font-semibold text-muted-foreground uppercase">DESCRIPTION</Label>
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
                                    id="desc"
                                    placeholder="Describe the purpose of this analysis..."
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
                                <Check className="mr-2 h-4 w-4" /> Save Resource
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
                            <TableHead>Activity Type</TableHead>
                            <TableHead>Input Mode</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.category_name}</TableCell>
                                <TableCell>{item.activity_type}</TableCell>
                                <TableCell>{item.input_mode}</TableCell>
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
