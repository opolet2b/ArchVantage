"use client";

import React, { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, Sparkles, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSortableData } from "@/hooks/use-sortable-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { API_URL } from "@/lib/utils";

interface FrameworkItem {
    id: string;
    name: string;
    category_name: string;
    description: string;
    spec: React.ReactNode | string; // spec is stored as JSON string in DB but we might parse it. Actually model says JsonOrStr.
    // For editing in textarea, we'll treat it as string.
    doc_url?: string;
}

interface GlobalCategoryItem {
    id: string;
    name: string;
    context: string;
    active: boolean;
}

interface FrameworksTabProps {
    selectedPreset?: string;
}

export function FrameworksTab({ selectedPreset }: FrameworksTabProps) {
    const [items, setItems] = useState<FrameworkItem[]>([]);
    const [categories, setCategories] = useState<GlobalCategoryItem[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const { toast } = useToast();

    const [newItem, setNewItem] = useState<Partial<FrameworkItem>>({
        name: "",
        category_name: "",
        description: "",
        spec: "",
        doc_url: ""
    });
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        fetchFrameworks();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const catRes = await fetch(`${API_URL}/smart-templates/categories?context=Frameworks`);
            if (catRes.ok) {
                const catData = await catRes.json();
                setCategories(catData);
            }
        } catch (error) {
            console.error("Failed to fetch categories:", error);
            toast({ title: "Failed to fetch categories", variant: "destructive" });
        }
    };

    const fetchFrameworks = async () => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/frameworks`);
            if (res.ok) {
                const data = await res.json();
                // Ensure spec is string for textarea
                const processed = data.map((d: any) => ({
                    ...d,
                    spec: typeof d.spec === 'string' ? d.spec : JSON.stringify(d.spec, null, 2)
                }));
                setItems(processed);
            }
        } catch (error) {
            console.error("Failed to fetch frameworks:", error);
            toast({ title: "Failed to fetch frameworks", variant: "destructive" });
        }
    };

    const handleEdit = (item: FrameworkItem) => {
        setNewItem({
            name: item.name,
            category_name: item.category_name,
            description: item.description,
            spec: item.spec,
            doc_url: item.doc_url || ""
        });
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
                const res = await fetch(`${API_URL}/smart-templates/frameworks/${itemToDelete}`, {
                    method: "DELETE",
                });

                if (res.ok) {
                    setItems(items.filter(i => i.id !== itemToDelete));
                    toast({ title: "Framework deleted" });
                } else {
                    toast({ title: "Failed to delete framework", variant: "destructive" });
                }
            } catch (error) {
                console.error("Failed to delete framework:", error);
                toast({ title: "Failed to delete framework", variant: "destructive" });
            }
            setIsDeleteDialogOpen(false);
            setItemToDelete(null);
        }
    };

    const handleSave = async () => {
        try {
            const url = editingId
                ? `${API_URL}/smart-templates/frameworks/${editingId}`
                : `${API_URL}/smart-templates/frameworks`;
            const method = editingId ? "PUT" : "POST";

            // Try to parse spec to JSON before sending if possible, or send as string and let backend handle
            let payloadSpec = newItem.spec;
            try {
                if (typeof newItem.spec === 'string') {
                    payloadSpec = JSON.parse(newItem.spec);
                }
            } catch (e) {
                // If invalid JSON, send as string. Backend expects JsonOrStr.
                // If the backend expects a valid JSON object for certain operations,
                // this might cause issues. For now, we'll send it as is.
            }

            const payload = { ...newItem, spec: payloadSpec };

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                const processed = {
                    ...data,
                    spec: typeof data.spec === 'string' ? data.spec : JSON.stringify(data.spec, null, 2)
                };

                if (editingId) {
                    setItems(items.map(i => i.id === editingId ? processed : i));
                    toast({ title: "Framework updated" });
                } else {
                    setItems([...items, processed]);
                    toast({ title: "Framework created" });
                }
                setIsDialogOpen(false);
                resetForm();
            } else {
                const errorData = await res.json();
                toast({ title: "Failed to save framework", description: errorData.detail || "Please ensure the specification is valid JSON.", variant: "destructive" });
            }
        } catch (error) {
            console.error("Failed to save framework:", error);
            toast({ title: "Failed to save framework", variant: "destructive" });
        }
    };

    const handleSuggestSpec = async () => {
        if (!selectedPreset) {
            toast({ title: "AI Configuration Missing", description: "Please select an AI Configuration in the main Admin Panel header.", variant: "destructive" });
            return;
        }
        if (!newItem.category_name || !newItem.name) {
            toast({ title: "Missing Information", description: "Please select a Category and enter a Name first.", variant: "destructive" });
            return;
        }

        setIsSuggesting(true);
        try {
            const res = await fetch(`${API_URL}/smart-templates/suggest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    preset_name: selectedPreset,
                    type: "framework-spec",
                    details: {
                        name: newItem.name,
                        category: newItem.category_name,
                        description: newItem.description || "",
                        url: newItem.doc_url || ""
                    }
                })
            });

            if (res.ok) {
                const data = await res.json();
                setNewItem(prev => ({ ...prev, spec: data.suggestion }));
                toast({ title: "Suggestion generated" });
            } else {
                const errorData = await res.json();
                toast({ title: "Failed to generate suggestion", description: errorData.detail || "An unknown error occurred.", variant: "destructive" });
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error generating suggestion", variant: "destructive" });
        } finally {
            setIsSuggesting(false);
        }
    };

    const resetForm = () => {
        setNewItem({ name: "", category_name: "", description: "", spec: "", doc_url: "" });
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
                <div className="text-sm text-muted-foreground">{items.length} frameworks defined.</div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Add Framework
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">{editingId ? "Edit Framework" : "Add Framework"}</DialogTitle>
                            <DialogDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                                CONFIGURE FRAMEWORK PARAMETERS
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-4 flex-1 overflow-y-auto px-1">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase">NAME</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. SWOT Analysis"
                                    value={newItem.name}
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category" className="text-xs font-semibold text-muted-foreground uppercase">CATEGORY</Label>
                                <Select value={newItem.category_name} onValueChange={(val) => setNewItem({ ...newItem, category_name: val })}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select Category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="desc" className="text-xs font-semibold text-muted-foreground uppercase">DESCRIPTION</Label>
                                <Textarea
                                    id="desc"
                                    placeholder="Brief description of the framework..."
                                    value={newItem.description}
                                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="doc_url" className="text-xs font-semibold text-muted-foreground uppercase">DOCUMENTATION URL</Label>
                                <Input
                                    id="doc_url"
                                    placeholder="https://..."
                                    value={newItem.doc_url || ""}
                                    onChange={(e) => setNewItem({ ...newItem, doc_url: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="spec" className="text-xs font-semibold text-muted-foreground uppercase">SPECIFICATION</Label>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 px-2 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        onClick={handleSuggestSpec}
                                        disabled={isSuggesting}
                                    >
                                        {isSuggesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                                        Suggest
                                    </Button>
                                </div>
                                <Textarea
                                    id="spec"
                                    placeholder="e.g. 1. Identify key actors... 2. Analyze relationships..."
                                    value={typeof newItem.spec === 'string' ? newItem.spec : JSON.stringify(newItem.spec, null, 2)}
                                    onChange={(e) => setNewItem({ ...newItem, spec: e.target.value })}
                                    className="min-h-[150px] font-mono text-xs"
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
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('category_name')}>
                                <div className="flex items-center">
                                    Category
                                    {getSortIcon('category_name')}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('description')}>
                                <div className="flex items-center">
                                    Description
                                    {getSortIcon('description')}
                                </div>
                            </TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedItems.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell><span className="bg-slate-100 px-2 py-1 rounded-full text-xs">{item.category_name}</span></TableCell>
                                <TableCell className="max-w-[300px] truncate text-muted-foreground">{item.description}</TableCell>
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
                            This will permanently delete this framework.
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
