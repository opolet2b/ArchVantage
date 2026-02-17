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
import { useToast } from "@/components/ui/use-toast";
import { API_URL } from "@/lib/utils";

// Define interface matching the API schema
interface PersonaItem {
    id: string;
    role: string;
    description: string;
    system_prompt: string;
    tone: string;
}

interface PersonasTabProps {
    selectedPreset?: string;
}

export function PersonasTab({ selectedPreset }: PersonasTabProps) {
    const { toast } = useToast();
    // State for data and loading
    const [items, setItems] = useState<PersonaItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);

    // Form state
    const [newItem, setNewItem] = useState<Partial<PersonaItem>>({
        role: "",
        description: "",
        system_prompt: "",
        tone: "Professional",
    });

    // Fetch data
    useEffect(() => {
        fetchPersonas();
    }, []);

    const fetchPersonas = async () => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/personas`);
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (error) {
            console.error("Failed to fetch personas:", error);
        }
    };

    const handleSave = async () => {
        try {
            const url = editingId
                ? `${API_URL}/smart-templates/personas/${editingId}`
                : `${API_URL}/smart-templates/personas`;

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
                    toast({ title: "Success", description: "Persona updated successfully." });
                } else {
                    setItems([...items, data]);
                    toast({ title: "Success", description: "Persona created successfully." });
                }
                setIsDialogOpen(false);
                resetForm();
            } else {
                const errorData = await res.json();
                let errorMessage = errorData.detail || "Failed to save persona.";
                if (typeof errorMessage !== 'string') {
                    errorMessage = JSON.stringify(errorMessage);
                }
                toast({ title: "Error", description: errorMessage, variant: "destructive" });
            }
        } catch (error) {
            console.error("Failed to save persona:", error);
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        }
    };

    const handleSuggestPrompt = async () => {
        if (!selectedPreset) {
            alert("Please select an AI Configuration in the main Admin Panel header.");
            return;
        }
        if (!newItem.role) {
            alert("Please enter a Role Name first.");
            return;
        }

        setIsSuggesting(true);
        try {
            const res = await fetch(`${API_URL}/smart-templates/suggest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    preset_name: selectedPreset,
                    type: "persona-prompt",
                    details: {
                        role: newItem.role,
                        tone: newItem.tone || "Professional"
                    }
                })
            });

            if (res.ok) {
                const data = await res.json();
                setNewItem(prev => ({ ...prev, system_prompt: data.suggestion }));
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

    const handleEdit = (item: PersonaItem) => {
        setNewItem({
            role: item.role,
            description: item.description,
            system_prompt: item.system_prompt,
            tone: item.tone,
        });
        setEditingId(item.id);
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setNewItem({ role: "", description: "", system_prompt: "", tone: "Professional" });
        setEditingId(null);
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/personas/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setItems(items.filter(item => item.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete persona:", error);
        }
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
                    {items.length} personas defined.
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Add Persona
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">{editingId ? "Edit Persona" : "Add Persona"}</DialogTitle>
                            <DialogDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                                CONFIGURE AI SPECIALIST
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-4 flex-1 overflow-y-auto px-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="role" className="text-xs font-semibold text-muted-foreground uppercase">ROLE NAME</Label>
                                    <Input
                                        id="role"
                                        placeholder="e.g. Senior Risk Analyst"
                                        value={newItem.role}
                                        onChange={(e) => setNewItem({ ...newItem, role: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tone" className="text-xs font-semibold text-muted-foreground uppercase">TONE</Label>
                                    <Input
                                        id="tone"
                                        placeholder="e.g. Professional, Critical"
                                        value={newItem.tone}
                                        onChange={(e) => setNewItem({ ...newItem, tone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-xs font-semibold text-muted-foreground uppercase">SHORT DESCRIPTION</Label>
                                <Input
                                    id="description"
                                    placeholder="Briefly describe what this persona does..."
                                    value={newItem.description}
                                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="prompt" className="text-xs font-semibold text-muted-foreground uppercase">SYSTEM PROMPT</Label>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 px-2 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        onClick={handleSuggestPrompt}
                                        disabled={isSuggesting}
                                    >
                                        {isSuggesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                                        Suggest
                                    </Button>
                                </div>
                                <Textarea
                                    id="prompt"
                                    placeholder="Enter the system instructions for the AI..."
                                    value={newItem.system_prompt}
                                    onChange={(e) => setNewItem({ ...newItem, system_prompt: e.target.value })}
                                    className="min-h-[200px] font-mono text-xs"
                                />
                            </div>
                        </div>
                        <DialogFooter className="flex sm:justify-between w-full gap-2">
                            <DialogClose asChild>
                                <Button variant="outline" className="flex-1">Cancel</Button>
                            </DialogClose>
                            <Button onClick={handleSave} className="flex-1 bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                                <Check className="mr-2 h-4 w-4" /> Save Persona
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md max-h-[600px] overflow-auto relative">
                <Table containerClassName="overflow-visible">
                    <TableHeader className="sticky top-0 bg-secondary z-10">
                        <TableRow>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('role')}>
                                <div className="flex items-center">
                                    Role
                                    {getSortIcon('role')}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('tone')}>
                                <div className="flex items-center">
                                    Tone
                                    {getSortIcon('tone')}
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
                                <TableCell className="font-medium">{item.role}</TableCell>
                                <TableCell>{item.tone}</TableCell>
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
