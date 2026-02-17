"use client";

import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, Sparkles, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSortableData } from "@/hooks/use-sortable-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { API_URL } from "@/lib/utils";

interface OutputFormatItem {
    id: string;
    type: string;
    name: string;
    extension: string;
    content_type?: string;
    structure_template?: any;
}

export function OutputFormatsTab() {
    const { toast } = useToast();
    const [items, setItems] = useState<OutputFormatItem[]>([]);
    const [categories, setCategories] = useState<any[]>([]); // For dropdown
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [newItem, setNewItem] = useState<Partial<OutputFormatItem>>({
        type: "",
        name: "",
        extension: "",
        content_type: "",
        structure_template: "",
    });

    useEffect(() => {
        fetchItems();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/categories`);
            if (res.ok) {
                const data = await res.json();
                // Filter for Output Format context
                const outputCats = data.filter((c: any) => c.context === "Output Format");
                setCategories(outputCats);
            }
        } catch (error) {
            console.error("Failed to fetch categories:", error);
        }
    };

    const fetchItems = async () => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/output-formats`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setItems(data);
                } else {
                    console.error("Expected array but got:", data);
                    setItems([]);
                }
            }
        } catch (error) {
            console.error("Failed to fetch output formats:", error);
            setItems([]);
        }
    };

    const handleSave = async () => {
        try {
            if (!newItem.type) {
                alert("Please select a Format Type (Category).");
                return;
            }

            // Prepare payload
            const payload = { ...newItem };

            // Parse structure template if string
            if (typeof payload.structure_template === 'string' && payload.structure_template.trim() !== "") {
                try {
                    payload.structure_template = JSON.parse(payload.structure_template);
                } catch (e) {
                    alert("Structure Template must be valid JSON");
                    return;
                }
            } else if (payload.structure_template === "") {
                payload.structure_template = null;
            }

            const url = editingId
                ? `${API_URL}/smart-templates/output-formats/${editingId}`
                : `${API_URL}/smart-templates/output-formats`;
            const method = editingId ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                if (editingId) {
                    setItems(items.map(item => item.id === editingId ? data : item));
                    toast({ title: "Success", description: "Output format updated successfully." });
                } else {
                    setItems([...items, data]);
                    toast({ title: "Success", description: "Output format created successfully." });
                }
                setIsDialogOpen(false);
                resetForm();
            } else {
                console.error("Save failed:", res.statusText);
                const errorData = await res.json().catch(() => ({}));
                let errorMessage = errorData.detail || `Failed to save: ${res.statusText}`;
                if (typeof errorMessage !== 'string') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                toast({ title: "Error", description: errorMessage, variant: "destructive" });
            }
        } catch (error) {
            console.error("Failed to save output format:", error);
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        }
    };

    const handleEdit = (item: OutputFormatItem) => {
        setNewItem({
            type: item.type,
            name: item.name,
            extension: item.extension,
            content_type: item.content_type || "",
            structure_template: item.structure_template || "",
        });
        setEditingId(item.id);
        setIsDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/output-formats/${id}`, { method: "DELETE" });
            if (res.ok) setItems(items.filter(item => item.id !== id));
        } catch (error) {
            console.error("Failed to delete output format:", error);
        }
    };

    const resetForm = () => {
        setNewItem({ type: "", name: "", content_type: "", structure_template: "", extension: "" }); // Updated reset    const resetForm = () => {
        setNewItem({ type: "", name: "", content_type: "", structure_template: "", extension: "" }); // Updated reset
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
                <div className="text-sm text-muted-foreground">{items.length} output formats defined.</div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Add Format
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">{editingId ? "Edit Output Format" : "Add Output Format"}</DialogTitle>
                            <DialogDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                                CONFIGURE EXPORT FORMAT
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-4 flex-1 overflow-y-auto px-1">
                            <div className="space-y-2">
                                <Label htmlFor="type" className="text-xs font-semibold text-muted-foreground uppercase">FORMAT TYPE (CATEGORY) *</Label>
                                <Select
                                    value={newItem.type}
                                    onValueChange={(val) => setNewItem({ ...newItem, type: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories.map((c) => (
                                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase">FRIENDLY NAME</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Microsoft Word Document"
                                    value={newItem.name}
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="extension" className="text-xs font-semibold text-muted-foreground uppercase">FILE EXTENSION</Label>
                                <Input
                                    id="extension"
                                    placeholder="e.g. pdf (no dot)"
                                    value={newItem.extension || ""}
                                    onChange={(e) => setNewItem({ ...newItem, extension: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="content" className="text-xs font-semibold text-muted-foreground uppercase">CONTENT TYPE (MIME)</Label>
                                <Input
                                    id="content"
                                    placeholder="e.g. application/pdf"
                                    value={newItem.content_type || ""}
                                    onChange={(e) => setNewItem({ ...newItem, content_type: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="structure" className="text-xs font-semibold text-muted-foreground uppercase">STRUCTURE TEMPLATE (JSON)</Label>
                                <Textarea
                                    id="structure"
                                    placeholder="{ ... }"
                                    value={typeof newItem.structure_template === 'string' ? newItem.structure_template : JSON.stringify(newItem.structure_template, null, 2)}
                                    onChange={(e) => setNewItem({ ...newItem, structure_template: e.target.value })}
                                    className="min-h-[150px] font-mono text-xs"
                                />
                                <p className="text-[10px] text-muted-foreground">Must be valid JSON</p>
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
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('type')}>
                                <div className="flex items-center">
                                    Type
                                    {getSortIcon('type')}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('name')}>
                                <div className="flex items-center">
                                    Format Name
                                    {getSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('content_type')}>
                                <div className="flex items-center">
                                    MIME Type
                                    {getSortIcon('content_type')}
                                </div>
                            </TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedItems.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-mono font-medium">{item.type}</TableCell>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{item.content_type}</TableCell>
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
