"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Database, Loader2, FileText, ChevronRight } from "lucide-react";
import { API_URL } from "@/lib/utils";

function getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
}
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCanvasStore } from "./canvas-store";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface KnowledgeBaseConfig {
    id: string;
    name: string;
    ontology_classes?: any[];
}

interface KBDocumentBrowserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectDocument: (doc: any) => void;
}

export function KBDocumentBrowserDialog({
    open,
    onOpenChange,
    onSelectDocument
}: KBDocumentBrowserDialogProps) {
    const [query, setQuery] = React.useState("");
    const [results, setResults] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [selectedKbFilter, setSelectedKbFilter] = React.useState<string>("all");
    const [ontologyClassFilter, setOntologyClassFilter] = React.useState<string>("all");
    const [hasInitialSearch, setHasInitialSearch] = React.useState(false);
    
    const selectedKbIds = useCanvasStore(state => state.selectedKbIds);
    const [kbs, setKbs] = React.useState<KnowledgeBaseConfig[]>([]);

    React.useEffect(() => {
        if (open) {
            setHasInitialSearch(false);
            setQuery("");
            fetchKbs();
        }
    }, [open]);

    React.useEffect(() => {
        if (open && kbs.length > 0 && !hasInitialSearch) {
            handleSearch();
            setHasInitialSearch(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, kbs.length, hasInitialSearch]);

    const fetchKbs = async () => {
        try {
            const token = getAuthToken();
            const res = await fetch(`${API_URL}/knowledge/kb`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setKbs(data);
            }
        } catch (err) {
            console.error("Failed to fetch KBs:", err);
        }
    };

    const handleSearch = async () => {
        setIsLoading(true);
        try {
            const token = getAuthToken();
            let kbsToSearch = selectedKbIds;
            if (selectedKbFilter !== "all") {
                kbsToSearch = [selectedKbFilter];
            }
            if (!kbsToSearch || kbsToSearch.length === 0) {
                kbsToSearch = kbs.map(kb => kb.id);
            }
            
            if (kbsToSearch.length === 0) {
                setResults([]);
                return;
            }

            const reqBody = {
                query: query,
                kb_ids: kbsToSearch,
                limit: 50,
                ontology_class: ontologyClassFilter !== "all" ? ontologyClassFilter : null
            };

            const res = await fetch(`${API_URL}/knowledge/kb/search`, {
                method: "POST",
                headers: { 
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(reqBody)
            });

            if (res.ok) {
                const data = await res.json();
                setResults(data.data || []);
            } else {
                setResults([]);
            }
        } catch (err) {
            console.error("Failed to search KB documents:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const availableClasses = React.useMemo(() => {
        const classes = new Set<string>();
        let targetKbs = kbs;
        if (selectedKbFilter !== "all") {
            targetKbs = kbs.filter(k => k.id === selectedKbFilter);
        } else if (selectedKbIds && selectedKbIds.length > 0) {
            targetKbs = kbs.filter(k => selectedKbIds.includes(k.id));
        }
        
        targetKbs.forEach(kb => {
            if (kb.ontology_classes) {
                kb.ontology_classes.forEach((c: any) => classes.add(c.name || c));
            }
        });
        return Array.from(classes).sort();
    }, [kbs, selectedKbFilter, selectedKbIds]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl flex flex-col h-[80vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-blue-500" />
                        Browse Knowledge Base Documents
                    </DialogTitle>
                    <DialogDescription>
                        Search and insert documents or nodes from your selected Knowledge Bases.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="flex flex-col gap-3 mt-4">
                    <div className="flex items-center gap-2">
                        <Select value={selectedKbFilter} onValueChange={setSelectedKbFilter}>
                            <SelectTrigger className="w-[250px]">
                                <SelectValue placeholder="All Selected KBs" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Selected KBs</SelectItem>
                                {kbs.map(kb => (
                                    <SelectItem key={kb.id} value={kb.id}>{kb.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={ontologyClassFilter} onValueChange={setOntologyClassFilter}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Any Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any Type</SelectItem>
                                {availableClasses.map(cls => (
                                    <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search documents by keywords (leave blank to browse all)..."
                                className="pl-9 w-full"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSearch();
                                }}
                            />
                        </div>
                        <Button onClick={handleSearch} disabled={isLoading} className="w-[120px]">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                        </Button>
                    </div>
                </div>
                
                <div className="flex-1 mt-4 border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                    <div className="overflow-y-auto h-full">
                        <div className="p-4 flex flex-col gap-2 min-w-0">
                            {results.length === 0 ? (
                                <div className="text-center text-slate-500 py-12">
                                    {isLoading ? "Searching..." : "No documents found. Adjust your filters or enter a search term."}
                                </div>
                            ) : (
                                results.map((doc, idx) => (
                                    <div 
                                        key={doc['@rid'] || idx}
                                        className="flex flex-col w-full min-w-0 overflow-hidden p-3 rounded-lg border bg-white dark:bg-slate-950 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer transition-colors"
                                        onClick={() => onSelectDocument(doc)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 shrink-0 text-blue-500" />
                                            <span className="font-medium text-slate-900 dark:text-slate-100 break-words line-clamp-2">
                                                {doc.name || "Untitled Document"}
                                            </span>
                                            <span className="ml-auto shrink-0 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                                                {doc['@type']}
                                            </span>
                                        </div>
                                        {doc.summary && (
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                                {doc.summary}
                                            </p>
                                        )}
                                        {doc.source_uri && (
                                            <p className="text-xs text-blue-400 mt-2 break-all">
                                                Source: {doc.source_uri}
                                            </p>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
