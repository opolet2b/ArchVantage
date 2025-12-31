"use client";

import React, { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { API_URL } from "@/lib/utils";

interface GlobalCategoryItem {
    id: string;
    name: string;
    context: string;
    active: boolean;
}

export function GlobalCategoriesTab() {
    const [items, setItems] = useState<GlobalCategoryItem[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

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
        }
    };

    const handleSave = async () => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/categories`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newItem),
            });

            if (res.ok) {
                const data = await res.json();
                setItems([...items, data]);
                setIsDialogOpen(false);
                // Reset form
                setNewItem({ name: "", context: "Taxonomy", active: true });
            }
        } catch (error) {
            console.error("Failed to save category:", error);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/categories/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setItems(items.filter(item => item.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete category:", error);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    {items.length} categories defined.
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Add Category
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px] max-h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">Add Global Category</DialogTitle>
                            <DialogDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                                CONFIGURE CATEGORY PARAMETERS
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-4 flex-1 overflow-y-auto px-1">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase">CATEGORY NAME</Label>
                                <Input
                                    id="name"
                                    value={newItem.name}
                                    placeholder="e.g. Legal"
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="context" className="text-xs font-semibold text-muted-foreground uppercase">CONTEXT</Label>
                                <Select value={newItem.context} onValueChange={(val) => setNewItem({ ...newItem, context: val })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select context" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Taxonomy">Taxonomy</SelectItem>
                                        <SelectItem value="Document Sections">Document Sections</SelectItem>
                                        <SelectItem value="Frameworks">Frameworks</SelectItem>
                                        <SelectItem value="AI Personas">AI Personas</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="active" className="text-xs font-semibold text-muted-foreground uppercase">ACTIVE STATUS</Label>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="active"
                                        checked={newItem.active}
                                        onCheckedChange={(checked) => setNewItem({ ...newItem, active: checked })}
                                    />
                                    <Label htmlFor="active" className="text-sm text-muted-foreground font-normal">
                                        {newItem.active ? "Category is active" : "Category is inactive"}
                                    </Label>
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="flex sm:justify-between w-full gap-2">
                            <DialogClose asChild>
                                <Button variant="outline" className="flex-1">Cancel</Button>
                            </DialogClose>
                            <Button onClick={handleSave} className="flex-1 bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                                <Check className="mr-2 h-4 w-4" /> Save Category
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Context</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground">No categories found.</TableCell>
                            </TableRow>
                        )}
                        {items.map((item) => (
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
                                        <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
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
