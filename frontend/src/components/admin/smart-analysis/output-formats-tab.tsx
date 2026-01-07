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
    const [items, setItems] = useState<OutputFormatItem[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [newItem, setNewItem] = useState<Partial<OutputFormatItem>>({
        type: "Text",
        name: "",
        extension: "",
        content_type: "",
        structure_template: "",
    });

    useEffect(() => {
        fetchItems();
    }, []);

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
            const url = editingId
                ? `${API_URL}/smart-templates/output-formats/${editingId}`
                : `${API_URL}/smart-templates/output-formats`;
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
            console.error("Failed to save output format:", error);
        }
    };

    const handleEdit = (item: OutputFormatItem) => {
        setNewItem({
            type: item.type,
            name: item.name,
            extension: item.extension,
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
        setNewItem({ type: "", name: "", content_type: "", structure_template: "" }); // Updated reset
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
                                <Label htmlFor="type" className="text-xs font-semibold text-muted-foreground uppercase">FORMAT TYPE (EXTENSION)</Label>
                                <Input
                                    id="type"
                                    placeholder="e.g. DOCX, PDF, JSON"
                                    value={newItem.type}
                                    onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                                />
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
                                <Label htmlFor="content" className="text-xs font-semibold text-muted-foreground uppercase">CONTENT TYPE (MIME)</Label>
                                <Input
                                    id="content"
                                    placeholder="e.g. application/vnd.openxmlformats-officedocument..."
                                    value={newItem.content_type || ""}
                                    onChange={(e) => setNewItem({ ...newItem, content_type: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="structure" className="text-xs font-semibold text-muted-foreground uppercase">STRUCTURE TEMPLATE (OPTIONAL)</Label>
                                <Textarea
                                    id="structure"
                                    placeholder="Define structure template..."
                                    value={typeof newItem.structure_template === 'string' ? newItem.structure_template : JSON.stringify(newItem.structure_template, null, 2)}
                                    onChange={(e) => setNewItem({ ...newItem, structure_template: e.target.value })}
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
