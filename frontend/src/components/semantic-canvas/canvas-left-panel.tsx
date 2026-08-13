"use client";

import * as React from "react";
import { useCanvasStore } from "./canvas-store";
import { cn } from "@/lib/utils";
import { 
    ChevronLeft, 
    ChevronRight, 
    Star, 
    LayoutGrid, 
    SortAsc, 
    SortDesc,
    Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export function CanvasLeftPanel() {
    const {
        things,
        domains,
        leftPanelCollapsed,
        setLeftPanelCollapsed,
        favoriteNodeIds,
        toggleFavoriteNode,
        selectedGridNodeIds,
        toggleSelectedGridNode,
        setSelectedGridNodes,
        gridModeActive,
        setGridModeActive,
        gridLayoutMode,
        setGridLayoutMode
    } = useCanvasStore();

    const [filterFavorites, setFilterFavorites] = React.useState(false);
    const [filterDomainId, setFilterDomainId] = React.useState<string>("all");
    const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("asc");
    const [searchQuery, setSearchQuery] = React.useState("");

    // Helpers
    const getThingTitle = (thing: any) => thing.title || "Untitled Node";
    
    // Filtering
    const filteredThings = React.useMemo(() => {
        let result = [...things];
        
        if (filterFavorites) {
            result = result.filter(t => favoriteNodeIds[t.id]);
        }
        if (filterDomainId !== "all") {
            if (filterDomainId === "none") {
                result = result.filter(t => !t.domain_id);
            } else {
                result = result.filter(t => t.domain_id === filterDomainId);
            }
        }
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(t => getThingTitle(t).toLowerCase().includes(query));
        }

        // Sorting
        result.sort((a, b) => {
            const nameA = getThingTitle(a).toLowerCase();
            const nameB = getThingTitle(b).toLowerCase();
            if (sortOrder === "asc") return nameA.localeCompare(nameB);
            return nameB.localeCompare(nameA);
        });

        return result;
    }, [things, favoriteNodeIds, filterFavorites, filterDomainId, sortOrder, searchQuery]);

    const allSelected = filteredThings.length > 0 && filteredThings.every(t => selectedGridNodeIds[t.id]);
    const someSelected = filteredThings.some(t => selectedGridNodeIds[t.id]) && !allSelected;

    const handleSelectAll = (checked: boolean) => {
        const newSelected = { ...selectedGridNodeIds };
        filteredThings.forEach(t => {
            if (checked) {
                newSelected[t.id] = true;
            } else {
                delete newSelected[t.id];
            }
        });
        setSelectedGridNodes(newSelected);
    };

    if (leftPanelCollapsed) {
        return (
            <div className="z-[40] transition-all duration-300 relative flex items-center h-full border-r dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md">
                <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-6 rounded-l-none border-l-0 shadow-md bg-white dark:bg-slate-900"
                    onClick={() => setLeftPanelCollapsed(false)}
                    title="Open Nodes Panel"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-72 bg-white dark:bg-slate-900 border-r dark:border-slate-800 shadow-xl z-[40] transition-all duration-300 relative h-full">
            {/* Header */}
            <div className="p-3 border-b dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold text-sm">Canvas Nodes</h3>
                <div className="flex items-center gap-1">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6" 
                        onClick={() => setLeftPanelCollapsed(true)}
                        title="Collapse Panel"
                    >
                        <ChevronLeft className="h-4 w-4 text-slate-500" />
                    </Button>
                </div>
            </div>

            <div className="p-3 border-b space-y-3">
                {/* Grid Mode Switch */}
                <div className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                    <div className="flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Grid Mode</span>
                    </div>
                    <Switch 
                        checked={gridModeActive} 
                        onCheckedChange={setGridModeActive} 
                    />
                </div>

                {gridModeActive && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Layout (2 nodes):</span>
                        <Select value={gridLayoutMode} onValueChange={(val: any) => setGridLayoutMode(val)}>
                            <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue placeholder="Layout" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">Auto</SelectItem>
                                <SelectItem value="horizontal">Side by Side</SelectItem>
                                <SelectItem value="vertical">One Below Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Filters */}
                <div className="flex items-center gap-2">
                    <Input 
                        placeholder="Search nodes..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 text-xs flex-1"
                    />
                    <Button 
                        variant={sortOrder === "asc" ? "secondary" : "ghost"} 
                        size="icon" 
                        className="h-8 w-8 shrink-0"
                        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    >
                        {sortOrder === "asc" ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button 
                        variant={filterFavorites ? "default" : "outline"} 
                        size="sm" 
                        className="h-8 text-xs flex-1"
                        onClick={() => setFilterFavorites(!filterFavorites)}
                    >
                        <Star className={cn("h-3 w-3 mr-1", filterFavorites ? "fill-primary-foreground" : "")} />
                        Favs
                    </Button>
                    <Select value={filterDomainId} onValueChange={setFilterDomainId}>
                        <SelectTrigger className="h-8 text-xs flex-[2]">
                            <SelectValue placeholder="Domain Filter" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Domains</SelectItem>
                            <SelectItem value="none">No Domain</SelectItem>
                            {domains.map(d => (
                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* List Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                    <Checkbox 
                        checked={allSelected}
                        // @ts-ignore
                        ref={ref => { if (ref) ref.indeterminate = someSelected }}
                        onCheckedChange={handleSelectAll}
                    />
                    <span className="text-xs font-medium text-muted-foreground">Select All</span>
                </div>
                <span className="text-xs text-muted-foreground">{filteredThings.length} nodes</span>
            </div>

            {/* Node List */}
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {filteredThings.map(thing => (
                        <div 
                            key={thing.id} 
                            className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md group text-sm"
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <Checkbox 
                                    checked={!!selectedGridNodeIds[thing.id]}
                                    onCheckedChange={() => toggleSelectedGridNode(thing.id)}
                                />
                                <button
                                    className="shrink-0 transition-opacity hover:opacity-100 opacity-100"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavoriteNode(thing.id);
                                    }}
                                    title={favoriteNodeIds[thing.id] ? "Remove from Favorites" : "Add to Favorites"}
                                >
                                    <Star className={cn(
                                        "h-4 w-4 transition-colors", 
                                        favoriteNodeIds[thing.id] 
                                            ? "fill-yellow-400 text-yellow-400" 
                                            : "text-slate-300 hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-500"
                                    )} />
                                </button>
                                <span className="text-sm truncate" title={getThingTitle(thing)}>
                                    {getThingTitle(thing)}
                                </span>
                            </div>
                        </div>
                    ))}
                    {filteredThings.length === 0 && (
                        <div className="text-center p-4 text-xs text-muted-foreground">
                            No nodes match filters.
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
