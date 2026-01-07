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
interface ThesaurusItem {
    id: string;
    alias: string;
    domain_industry: string;
    source_org: string;
    terms: React.ReactNode | string; // Stored as JSON or Dict in DB.
}

interface ThesaurusTabProps {
    selectedPreset?: string;
}

export function ThesaurusTab({ selectedPreset }: ThesaurusTabProps) {
    // State for data
    const [items, setItems] = useState<ThesaurusItem[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const { toast } = useToast();

    // Form state
    const [newItem, setNewItem] = useState<Partial<ThesaurusItem>>({
        alias: "",
        domain_industry: "",
        source_org: "",
        terms: "",
    });

    // Fetch data
    useEffect(() => {
        fetchThesauruses();
    }, []);

    const fetchThesauruses = async () => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/thesauruses`);
            if (res.ok) {
                const data = await res.json();
                const processed = data.map((d: any) => ({
                    id: d.id,
                    alias: d.name,
                    domain_industry: d.domain,
                    source_org: d.source,
                    terms: d.terms_mapping ? JSON.stringify(d.terms_mapping, null, 2) : ""
                }));
                setItems(processed);
            }
        } catch (error) {
            console.error("Failed to fetch thesauruses:", error);
        }
    };

    const handleSave = async () => {
        try {
            const url = editingId
                ? `${API_URL}/smart-templates/thesauruses/${editingId}`
                : `${API_URL}/smart-templates/thesauruses`;

            const method = editingId ? "PUT" : "POST";

            let payloadTerms = null;
            try {
                if (newItem.terms && typeof newItem.terms === 'string' && newItem.terms.trim() !== "") {
                    payloadTerms = JSON.parse(newItem.terms);
                }
            } catch (e) {
                alert("Invalid JSON in Terms. Please verify syntax.");
                return; // Stop if JSON is invalid
            }

            // Map frontend keys to backend schema
            const payload = {
                name: newItem.alias,
                domain: newItem.domain_industry,
                source: newItem.source_org,
                terms_mapping: payloadTerms
            };

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                const processed = {
                    id: data.id,
                    alias: data.name,
                    domain_industry: data.domain,
                    source_org: data.source,
                    terms: data.terms_mapping ? JSON.stringify(data.terms_mapping, null, 2) : ""
                };

                if (editingId) {
                    setItems(items.map(item => item.id === editingId ? processed : item));
                    toast({ title: "Thesaurus updated" });
                } else {
                    setItems([...items, processed]);
                    toast({ title: "Thesaurus created" });
                }
                setIsDialogOpen(false);
                resetForm();
            } else {
                const errData = await res.json();
                toast({ title: "Failed to save", description: errData.detail || "Verification failed.", variant: "destructive" });
            }
        } catch (error) {
            console.error("Failed to save thesaurus:", error);
            toast({ title: "Error saving thesaurus", variant: "destructive" });
        }
    };

    const handleSuggestTerms = async () => {
        if (!selectedPreset) {
            alert("Please select an AI Configuration in the main Admin Panel header.");
            return;
        }
        if (!newItem.alias || !newItem.domain_industry) {
            alert("Please enter a Name/Alias and Domain/Industry first.");
            return;
        }

        setIsSuggesting(true);
        try {
            const res = await fetch(`${API_URL}/smart-templates/suggest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    preset_name: selectedPreset,
                    type: "thesaurus-json",
                    details: {
                        name: newItem.alias,
                        domain: newItem.domain_industry,
                        organization: newItem.source_org || ""
                    }
                })
            });

            if (res.ok) {
                const data = await res.json();
                let suggestionContent = data.suggestion;
                try {
                    // Try to parse it first to ensure we can pretty-print it
                    const parsed = JSON.parse(suggestionContent);
                    suggestionContent = JSON.stringify(parsed, null, 2);
                } catch (e) {
                    // If parsing fails, use the raw string (it might be partial or invalid JSON, but better than double escaped)
                    console.warn("Could not parse suggestion as JSON, using raw string", e);
                }
                setNewItem(prev => ({ ...prev, terms: suggestionContent }));
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

    const handleEdit = (item: ThesaurusItem) => {
        setNewItem({
            alias: item.alias,
            domain_industry: item.domain_industry,
            source_org: item.source_org || "",
            terms: item.terms,
        });
        setEditingId(item.id);
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setNewItem({ alias: "", domain_industry: "", source_org: "", terms: "" });
        setEditingId(null);
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/smart-templates/thesauruses/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setItems(items.filter(item => item.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete thesaurus:", error);
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
                    {items.length} thesauruses defined.
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Add Thesaurus
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">{editingId ? "Edit Thesaurus" : "Add Thesaurus"}</DialogTitle>
                            <DialogDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                                CONFIGURE TERMINOLOGY DATABASE
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-4 flex-1 overflow-y-auto px-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="alias" className="text-xs font-semibold text-muted-foreground uppercase">NAME / ALIAS</Label>
                                    <Input
                                        id="alias"
                                        placeholder="e.g. Legal Terms"
                                        value={newItem.alias}
                                        onChange={(e) => setNewItem({ ...newItem, alias: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="domain" className="text-xs font-semibold text-muted-foreground uppercase">DOMAIN / INDUSTRY</Label>
                                    <Input
                                        id="domain"
                                        placeholder="e.g. Law, Medicine"
                                        value={newItem.domain_industry}
                                        onChange={(e) => setNewItem({ ...newItem, domain_industry: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="org" className="text-xs font-semibold text-muted-foreground uppercase">SOURCE ORGANIZATION (OPTIONAL)</Label>
                                <Input
                                    id="org"
                                    placeholder="e.g. ISO, WHO"
                                    value={newItem.source_org}
                                    onChange={(e) => setNewItem({ ...newItem, source_org: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="terms" className="text-xs font-semibold text-muted-foreground uppercase">TERMS (JSON: "TERM": "DEF")</Label>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 px-2 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        onClick={handleSuggestTerms}
                                        disabled={isSuggesting}
                                    >
                                        {isSuggesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                                        Suggest
                                    </Button>
                                </div>
                                <Textarea
                                    id="terms"
                                    placeholder={'{\n  "Term": "Definition",\n  "Another Term": "Another Definition"\n}'}
                                    value={typeof newItem.terms === 'string' ? newItem.terms : JSON.stringify(newItem.terms, null, 2)}
                                    onChange={(e) => setNewItem({ ...newItem, terms: e.target.value })}
                                    className="min-h-[250px] font-mono text-xs"
                                />
                            </div>
                        </div>
                        <DialogFooter className="flex sm:justify-between w-full gap-2">
                            <DialogClose asChild>
                                <Button variant="outline" className="flex-1">Cancel</Button>
                            </DialogClose>
                            <Button onClick={handleSave} className="flex-1 bg-[#4F46E5] hover:bg-[#4338CA] text-white">
                                <Check className="mr-2 h-4 w-4" /> Save Thesaurus
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md max-h-[600px] overflow-auto relative">
                <Table containerClassName="overflow-visible">
                    <TableHeader className="sticky top-0 bg-secondary z-10">
                        <TableRow>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('alias')}>
                                <div className="flex items-center">
                                    Alias
                                    {getSortIcon('alias')}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('domain_industry')}>
                                <div className="flex items-center">
                                    Domain
                                    {getSortIcon('domain_industry')}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort('source_org')}>
                                <div className="flex items-center">
                                    Source
                                    {getSortIcon('source_org')}
                                </div>
                            </TableHead>
                            <TableHead>Preview</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedItems.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.alias}</TableCell>
                                <TableCell>{item.domain_industry}</TableCell>
                                <TableCell>{item.source_org}</TableCell>
                                <TableCell className="max-w-[200px] truncate font-mono text-xs text-muted-foreground">{typeof item.terms === 'string' ? item.terms.substring(0, 50) : JSON.stringify(item.terms).substring(0, 50)}...</TableCell>
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
