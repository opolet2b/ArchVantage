"use client";

import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_URL } from "@/lib/utils";

interface OutputFormatItem {
    id: string;
    type: string;
    name: string;
    extension: string;
}

export function OutputFormatsTab() {
    const [items, setItems] = useState<OutputFormatItem[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [newItem, setNewItem] = useState<Partial<OutputFormatItem>>({
        type: "Text",
        name: "",
        extension: "",
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
        setNewItem({ type: "Text", name: "", extension: "" });
        setEditingId(null);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">{items.length} formats defined.</div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4F46E5] hover:bg-[#4338CA] text-white"><Plus className="mr-2 h-4 w-4" /> Add Format</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Edit Output Format" : "Add Output Format"}</DialogTitle>
                            <DialogDescription>DEFINE FILE EXTENSIONS AND FORMATS FOR EACH OUTPUT TYPE</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={newItem.type} onValueChange={(val) => setNewItem({ ...newItem, type: val })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Text">Text</SelectItem>
                                        <SelectItem value="Graphics">Graphics</SelectItem>
                                        <SelectItem value="Data">Data</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Format Name</Label>
                                <Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g. Markdown, PDF, Mermaid" />
                            </div>
                            <div className="space-y-2">
                                <Label>File Extension</Label>
                                <Input value={newItem.extension} onChange={(e) => setNewItem({ ...newItem, extension: e.target.value })} placeholder="e.g. md, pdf, svg" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleSave} className="bg-[#4F46E5] text-white">Save</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Format Name</TableHead>
                            <TableHead>Extension</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.type}</TableCell>
                                <TableCell>{item.name}</TableCell>
                                <TableCell>.{item.extension}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
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
