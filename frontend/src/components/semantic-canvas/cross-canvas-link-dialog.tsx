"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCanvasStore, CanvasThing } from "./canvas-store";
import { Fragment } from "./viewers";
import { API_URL, cn } from "@/lib/utils";
import { Loader2, Search, ArrowLeft, Check, Link as LinkIcon, FileText, MessageSquare, Image as ImageIcon, Video, Database, Table, Bot, Globe, File, BrainCircuit, Type, Presentation, Lightbulb, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

// Simple Icon Map (matching ThingNode somewhat)
const getIconForType = (type: string) => {
    switch (type) {
        case 'text': return Type;
        case 'conversation': return MessageSquare;
        case 'document': return FileText;
        case 'image': return ImageIcon;
        case 'video': return Video;
        case 'data': return Database;
        case 'table': return Table;
        case 'agent': return Bot;
        case 'url': return Globe;
        case 'slideshow': return Presentation;
        case 'thought': return Lightbulb;
        default: return File;
    }
};

interface CrossCanvasLinkDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sourceThingId: string;
    // sourceFragment removed - not needed for selection only
    onNodeSelected: (targetCanvasId: string, targetNodeId: string, targetTitle: string, targetCanvasName: string) => void;
}

export function CrossCanvasLinkDialog({ open, onOpenChange, sourceThingId, onNodeSelected }: CrossCanvasLinkDialogProps) {
    const [canvases, setCanvases] = React.useState<{ id: string, name: string }[]>([]);

    // Store State
    const currentCanvasId = useCanvasStore(state => state.canvasId);
    // addExternalLink removed
    // addLink removed
    const things = useCanvasStore(state => state.things); // Current canvas things

    // Local State
    // Steps removed - always node selection
    const [selectedCanvasId, setSelectedCanvasId] = React.useState<string>("");
    const [nodes, setNodes] = React.useState<CanvasThing[]>([]);
    const [selectedNodeId, setSelectedNodeId] = React.useState<string>("");
    const [searchQuery, setSearchQuery] = React.useState("");

    // linkType and linkLabel state removed

    const [isLoadingCanvases, setIsLoadingCanvases] = React.useState(false);
    const [isLoadingNodes, setIsLoadingNodes] = React.useState(false);

    // Initial Load
    React.useEffect(() => {
        if (open) {
            setSearchQuery("");
            setSelectedNodeId("");
            // Default to current canvas
            setSelectedCanvasId(currentCanvasId || "");

            // Load Canvases
            setIsLoadingCanvases(true);
            const token = localStorage.getItem("token");
            fetch(`${API_URL}/canvases`, { headers: { Authorization: `Bearer ${token}` } })
                .then(res => res.json())
                .then(data => {
                    setCanvases(data || []);
                })
                .catch(err => console.error("Failed to load canvases:", err))
                .finally(() => setIsLoadingCanvases(false));

            // If defaulting to current canvas, we use store things directly? 
            // Better to fetch fresh to be consistent, or just use store things for "current".
            // Let's rely on the useEffect below to handle node loading/filtering.
        }
    }, [open, currentCanvasId]);

    // Fetch nodes when canvas selected
    React.useEffect(() => {
        if (!selectedCanvasId) {
            setNodes([]);
            return;
        }

        if (selectedCanvasId === currentCanvasId) {
            // Use local store things, filtered to exclude source
            const validTargets = things.filter(t => t.id !== sourceThingId); // Can't link to self
            setNodes(JSON.parse(JSON.stringify(validTargets))); // Deep copy to avoid reference issues
            setIsLoadingNodes(false);
        } else {
            // Fetch from API
            setIsLoadingNodes(true);
            const token = localStorage.getItem("token");
            fetch(`${API_URL}/canvases/${selectedCanvasId}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(res => res.json())
                .then(data => {
                    setNodes(data.things || []);
                })
                .catch(err => console.error("Failed to load nodes:", err))
                .finally(() => setIsLoadingNodes(false));
        }
    }, [selectedCanvasId, currentCanvasId, things, sourceThingId]);

    // Filtered Nodes
    const filteredNodes = React.useMemo(() => {
        if (!searchQuery) return nodes;
        const lower = searchQuery.toLowerCase();
        return nodes.filter(n => (n.title || "Untitled").toLowerCase().includes(lower));
    }, [nodes, searchQuery]);

    const handleNodeSelect = (nodeId: string) => {
        const targetNode = nodes.find(n => n.id === nodeId);
        const targetCanvas = canvases.find(c => c.id === selectedCanvasId);

        if (targetNode && targetCanvas) {
            onNodeSelected(
                selectedCanvasId,
                nodeId,
                targetNode.title || "Untitled",
                targetCanvas.name
            );
            onOpenChange(false);
        }
    };

    // handleConnect and linkTypes removed


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] flex flex-col h-[80vh] max-h-[600px] p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle>Select Link Target</DialogTitle>
                    <DialogDescription>
                        Choose a canvas and node to connect to.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden p-6">
                    <div className="flex flex-col h-full gap-4">
                        {/* Canvas Selector */}
                        <div className="flex flex-col gap-2">
                            <Label>Canvas</Label>
                            <Select value={selectedCanvasId} onValueChange={setSelectedCanvasId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Canvas" />
                                </SelectTrigger>
                                <SelectContent>
                                    {canvases.map(c => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name} {c.id === currentCanvasId ? "(Current)" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Node Search */}
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search nodes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-8"
                            />
                        </div>

                        {/* Node List */}
                        <div className="flex-1 border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                            <ScrollArea className="h-full p-2">
                                {isLoadingNodes ? (
                                    <div className="flex items-center justify-center p-8 text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading Nodes...
                                    </div>
                                ) : filteredNodes.length === 0 ? (
                                    <div className="p-8 text-center text-muted-foreground text-sm">
                                        No nodes found.
                                    </div>
                                ) : (
                                    <div className="grid gap-1">
                                        {filteredNodes.map(node => {
                                            const Icon = getIconForType(node.type);
                                            const isSelected = selectedNodeId === node.id;
                                            return (
                                                <Button
                                                    key={node.id}
                                                    variant={isSelected ? "secondary" : "ghost"}
                                                    className={cn(
                                                        "w-full justify-start h-auto py-2 px-3 hover:bg-slate-200 dark:hover:bg-slate-800",
                                                        isSelected && "bg-slate-200 dark:bg-slate-800 ring-1 ring-primary"
                                                    )}
                                                    onClick={() => handleNodeSelect(node.id)}
                                                >
                                                    <Icon className="h-4 w-4 mr-3 text-muted-foreground shrink-0" />
                                                    <div className="flex flex-col items-start overflow-hidden text-left">
                                                        <span className="font-medium truncate w-full text-foreground">
                                                            {node.title || "Untitled Node"}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground truncate w-full opacity-70">
                                                            {(node.content as any)?.text?.substring?.(0, 50) || node.type}
                                                        </span>
                                                    </div>
                                                    {isSelected && <Check className="ml-auto h-4 w-4 text-primary" />}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-slate-50/50 dark:bg-slate-900/50">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
