"use client";

import React, { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSortableData } from "@/hooks/use-sortable-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { API_URL } from "@/lib/utils";

interface SectionItem {
    id: string;
    name: string;
    group_type: string;
    category_name?: string;
    expertise_level?: string;
}

interface GlobalCategoryItem {
    id: string;
    name: string;
    context: string;
    active: boolean;
}

export function SectionsTab() {
    const [items, setItems] = useState<SectionItem[]>([]);
    const [categories, setCategories] = useState<GlobalCategoryItem[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const { toast } = useToast();

    const [newItem, setNewItem] = useState<Partial<SectionItem>>({
        name: "",
        group_type: "Generic",
        category_name: "None (Generic)",
        expertise_level: "Professional"
    });
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            // Fetch Sections
            const sectRes = await fetch(`${API_URL}/smart-templates/sections`);
            if (sectRes.ok) {
                const sectData = await sectRes.json();
                setItems(sectData);
            }

            // Fetch Categories with context "Document Sections"
            const catRes = await fetch(`${API_URL}/smart-templates/categories?context=Document Sections`);
            if (catRes.ok) {
                const catData = await catRes.json();
                setCategories(catData);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
        }
    };

    const handleEdit = (item: SectionItem) => {
        setNewItem(item);
        setEditingId(item.id);
        setIsDialogOpen(true);
    };

    const handleDeleteClick = (id: string) => {
        setItemToDelete(id);
        setIsDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (itemToDelete) {
            try {
                const res = await fetch(`${API_URL}/smart-templates/sections/${itemToDelete}`, {
                    method: "DELETE",
                });

                if (res.ok) {
                    setItems(items.filter(i => i.id !== itemToDelete));
                    toast({ title: "Section deleted" });
                }
            } catch (error) {
                console.error("Failed to delete section:", error);
                toast({ title: "Failed to delete section", variant: "destructive" });
            }
            setIsDeleteDialogOpen(false);
            setItemToDelete(null);
        }
    };

    const handleSave = async () => {
        try {
            const url = editingId
                ? `${API_URL}/smart-templates/sections/${editingId}`
                : `${API_URL}/smart-templates/sections`;
            const method = editingId ? "PUT" : "POST";

            // If Generic, ensure category is cleared or set to None
            const payload = { ...newItem };
            if (payload.group_type === "Generic") {
                payload.category_name = "None (Generic)";
            }

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                if (editingId) {
                    setItems(items.map(i => i.id === editingId ? data : i));
                    toast({ title: "Success", description: "Section updated successfully." });
                } else {
                    setItems([...items, data]);
                    toast({ title: "Success", description: "Section created successfully." });
                }
                setIsDialogOpen(false);
                resetForm();
            } else {
                const errorData = await res.json();
                let errorMessage = errorData.detail || "Failed to save section.";
                if (typeof errorMessage !== 'string') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                toast({ title: "Error", description: errorMessage, variant: "destructive" });
            }
        } catch (error) {
            console.error("Failed to save section:", error);
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        }
    };

    const resetForm = () => {
        setNewItem({ name: "", group_type: "Generic", category_name: "None (Generic)", expertise_level: "Professional" });
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
                <div className="text-sm text-muted-foreground">
                    {items.length} sections defined.
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Add Section
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">{editingId ? "Edit Document Section" : "Add New Document Section"}</DialogTitle>
                            <DialogDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                                CONFIGURE SYSTEM PARAMETERS
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-4 flex-1 overflow-y-auto px-1">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase">SECTION NAME</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Conclusions"
                                    value={newItem.name}
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase">GROUP TYPE</Label>
                                <div className="flex bg-muted/30 p-1 rounded-lg border">
                                    <button
                                        onClick={() => setNewItem({ ...newItem, group_type: "Generic", category_name: "None (Generic)" })}
                                        className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${newItem.group_type === "Generic"
                                            ? "bg-[#4F46E5] text-white shadow-sm"
                                            : "text-muted-foreground hover:bg-muted/50"
                                            }`}
                                    >
                                        Generic
                                    </button>
                                    <button
                                        onClick={() => setNewItem({ ...newItem, group_type: "Domain-Specific", category_name: categories.length > 0 ? categories[0].name : "None" })}
                                        className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${newItem.group_type === "Domain-Specific"
                                            ? "bg-[#4F46E5] text-white shadow-sm"
                                            : "text-muted-foreground hover:bg-muted/50"
                                            }`}
                                    >
                                        Domain-Specific
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="category" className="text-xs font-semibold text-muted-foreground uppercase">CATEGORY MAPPING</Label>
                                <Select
                                    value={newItem.category_name}
                                    onValueChange={(val) => setNewItem({ ...newItem, category_name: val })}
                                    disabled={newItem.group_type === "Generic"}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select Category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="None (Generic)">None (Generic)</SelectItem>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('group_type')}>
                                <div className="flex items-center">
                                    Type
                                    {getSortIcon('group_type')}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('category_name')}>
                                <div className="flex items-center">
                                    Category
                                    {getSortIcon('category_name')}
                                </div>
                            </TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedItems.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell>{item.group_type}</TableCell>
                                <TableCell>
                                    {item.group_type === "Generic"
                                        ? <span>-</span>
                                        : <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">{item.category_name}</span>
                                    }
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDeleteClick(item.id)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this document section.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
