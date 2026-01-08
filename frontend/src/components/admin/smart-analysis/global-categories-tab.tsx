"use client";

import React, { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSortableData } from "@/hooks/use-sortable-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { API_URL } from "@/lib/utils";

import { useToast } from "@/components/ui/use-toast";

interface GlobalCategoryItem {
    id: string;
    name: string;
    context: string;
    active: boolean;
    description?: string;
}

export function GlobalCategoriesTab() {
    const { toast } = useToast();
    const [items, setItems] = useState<GlobalCategoryItem[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [newItem, setNewItem] = useState<Partial<GlobalCategoryItem>>({
        name: "",
        context: "Taxonomy",
        active: true,
    });

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/categories`);
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (error) {
            console.error("Failed to fetch categories:", error);
            toast({ title: "Error", description: "Failed to fetch categories", variant: "destructive" });
        }
    };

    const handleOpenAdd = () => {
        setEditingId(null);
        setNewItem({ name: "", context: "Taxonomy", active: true });
        setIsDialogOpen(true);
    };

    const handleEdit = (item: GlobalCategoryItem) => {
        setEditingId(item.id);
        setNewItem({ ...item }); // Copy item data to form
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        try {
            const url = editingId
                ? `${API_URL}/smart-templates/categories/${editingId}`
                : `${API_URL}/smart-templates/categories`;

            const method = editingId ? "PUT" : "POST";

            const res = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newItem),
            });

            if (res.ok) {
                const data = await res.json();
                if (editingId) {
                    setItems(items.map(i => i.id === editingId ? data : i));
                    toast({ title: "Success", description: "Category updated successfully" });
                } else {
                    setItems([...items, data]);
                    toast({ title: "Success", description: "Category created successfully" });
                }
                setIsDialogOpen(false);
                // Reset form
                setNewItem({ name: "", context: "Taxonomy", active: true });
                setEditingId(null);
            } else {
                const err = await res.json();
                toast({ title: "Error", description: err.detail || "Failed to save category", variant: "destructive" });
            }
        } catch (error) {
            console.error("Failed to save category:", error);
            toast({ title: "Error", description: "Failed to save category", variant: "destructive" });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/categories/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setItems(items.filter(item => item.id !== id));
                toast({ title: "Success", description: "Category deleted successfully" });
            } else {
                const err = await res.json();
                toast({ title: "Error", description: err.detail || "Failed to delete category", variant: "destructive" });
            }
        } catch (error) {
            console.error("Failed to delete category:", error);
            toast({ title: "Error", description: "Failed to delete category", variant: "destructive" });
        }
    };

    const resetForm = () => {
        setNewItem({ name: "", context: "Taxonomy", active: true, description: "" });
        setEditingId(null);
    };

    // Sorting
    const { items: sortedItems, requestSort, sortConfig } = useSortableData(items);

    const getSortIcon = (key: string) => {
        if (sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4" />;
        if (sortConfig.direction === 'ascending') return <ArrowUp className="ml-2 h-4 w-4" />;
        return <ArrowDown className="ml-2 h-4 w-4" />;
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">{items.length} categories defined.</div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button onClick={handleOpenAdd} className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Add Category
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">{editingId ? "Edit Category" : "Add New Category"}</DialogTitle>
                            <DialogDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                                MANAGE GLOBAL ANALYSIS CATEGORIES
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase">CATEGORY NAME</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Risk Analysis"
                                    value={newItem.name}
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="context" className="text-xs font-semibold text-muted-foreground uppercase">CONTEXT</Label>
                                <Select value={newItem.context} onValueChange={(val) => setNewItem({ ...newItem, context: val })}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select Context" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Taxonomy">Taxonomy</SelectItem>
                                        <SelectItem value="Document Section">Document Section</SelectItem>
                                        <SelectItem value="Rendering Type">Rendering Type</SelectItem>
                                        <SelectItem value="Framework">Framework</SelectItem>
                                        <SelectItem value="Thesaurus">Thesaurus</SelectItem>
                                        <SelectItem value="Output Format">Output Format</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="desc" className="text-xs font-semibold text-muted-foreground uppercase">DESCRIPTION</Label>
                                <Input
                                    id="desc"
                                    placeholder="Brief description of the category..."
                                    value={newItem.description}
                                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter className="flex justify-between w-full">
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button onClick={handleSave} className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                                <Check className="mr-2 h-4 w-4" /> {editingId ? "Update Category" : "Save Category"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md max-h-[600px] overflow-auto relative">
                <Table containerClassName="overflow-visible">
                    <TableHeader className="sticky top-0 bg-secondary z-10">
                        <TableRow>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('name')}>
                                <div className="flex items-center">
                                    Name
                                    {getSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('context')}>
                                <div className="flex items-center">
                                    Context
                                    {getSortIcon('context')}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('active')}>
                                <div className="flex items-center">
                                    Status
                                    {getSortIcon('active')}
                                </div>
                            </TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedItems.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground">No categories found.</TableCell>
                            </TableRow>
                        )}
                        {sortedItems.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell>{item.context}</TableCell>
                                <TableCell>
                                    <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${item.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                                        {item.active ? "Active" : "Inactive"}
                                    </div>
                                </TableCell>
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
