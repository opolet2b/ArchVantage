"use client";

import * as React from "react";
import { useCanvasStore, DomainDefinition, DomainGroup } from "./canvas-store";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Folder, Box, Plus, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DomainSelectorProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (definition: DomainDefinition | null) => void;
}

export function DomainSelector({ isOpen, onOpenChange, onSelect }: DomainSelectorProps) {
    const activeScenario = useCanvasStore(state => state.activeScenario);
    const [search, setSearch] = React.useState("");
    const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});

    const definitions = React.useMemo(() =>
        activeScenario?.configuration.domain_definitions || [],
        [activeScenario]);

    const groups = React.useMemo(() =>
        activeScenario?.configuration.domain_groups || [],
        [activeScenario]);

    const toggleGroup = (id: string) => {
        setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Initialize all groups as expanded by default
    React.useEffect(() => {
        if (groups.length > 0) {
            const initial: Record<string, boolean> = {};
            groups.forEach(g => initial[g.id] = true);
            setExpandedGroups(initial);
        }
    }, [groups]);

    const filteredDefinitions = React.useMemo(() => {
        if (!search) return definitions;
        const lower = search.toLowerCase();
        return definitions.filter(d =>
            d.name.toLowerCase().includes(lower) ||
            d.tags?.some(t => t.toLowerCase().includes(lower))
        );
    }, [definitions, search]);

    const groupedDefinitions = React.useMemo(() => {
        const grouped: Record<string, DomainDefinition[]> = { "ungrouped": [] };
        groups.forEach(g => grouped[g.id] = []);

        filteredDefinitions.forEach(d => {
            if (d.group_id && grouped[d.group_id]) {
                grouped[d.group_id].push(d);
            } else {
                grouped["ungrouped"].push(d);
            }
        });
        return grouped;
    }, [filteredDefinitions, groups]);

    const handleSelect = (def: DomainDefinition | null) => {
        onSelect(def);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md h-[600px] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-4 border-b bg-muted/40">
                    <DialogTitle>Select Domain Type</DialogTitle>
                    <div className="relative mt-2">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search domain types..."
                            className="pl-9 bg-background"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                        {/* Custom Domain Option */}
                        <div
                            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors group"
                            onClick={() => handleSelect(null)}
                        >
                            <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center group-hover:bg-background transition-colors border">
                                <Plus className="h-5 w-5 text-foreground" />
                            </div>
                            <div>
                                <h3 className="font-medium text-sm">Custom Domain</h3>
                                <p className="text-xs text-muted-foreground">Create an empty domain</p>
                            </div>
                        </div>

                        {/* Groups */}
                        {groups.map(group => {
                            const groupDefs = groupedDefinitions[group.id];
                            if (groupDefs.length === 0) return null;

                            return (
                                <div key={group.id} className="space-y-1">
                                    <div
                                        className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 cursor-pointer hover:text-foreground"
                                        onClick={() => toggleGroup(group.id)}
                                    >
                                        {expandedGroups[group.id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                        {group.name}
                                    </div>

                                    {expandedGroups[group.id] && (
                                        <div className="grid grid-cols-1 gap-2 pl-2 border-l ml-1.5 my-1">
                                            {groupDefs.map(def => (
                                                <div
                                                    key={def.id}
                                                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/80 cursor-pointer text-sm"
                                                    onClick={() => handleSelect(def)}
                                                >
                                                    <div
                                                        className="h-8 w-8 rounded-md flex items-center justify-center border shrink-0"
                                                        style={{
                                                            backgroundColor: def.visual_config.bg_color || "#f4f4f5",
                                                            borderColor: def.visual_config.color
                                                        }}
                                                    >
                                                        {/* We could render an icon here if visual_config.icon exists, simplistic for now */}
                                                        <Box className="h-4 w-4" style={{ color: def.visual_config.color }} />
                                                    </div>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="font-medium truncate">{def.name}</span>
                                                        {def.description && (
                                                            <span className="text-xs text-muted-foreground truncate">{def.description}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Ungrouped Definitions */}
                        {groupedDefinitions["ungrouped"].length > 0 && (
                            <div className="space-y-2">
                                {groups.length > 0 && (
                                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mt-4">
                                        Other
                                    </div>
                                )}
                                <div className="grid grid-cols-1 gap-2">
                                    {groupedDefinitions["ungrouped"].map(def => (
                                        <div
                                            key={def.id}
                                            className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/80 cursor-pointer text-sm border-transparent border hover:border-border"
                                            onClick={() => handleSelect(def)}
                                        >
                                            <div
                                                className="h-8 w-8 rounded-md flex items-center justify-center border shrink-0"
                                                style={{
                                                    backgroundColor: def.visual_config.bg_color || "#f4f4f5",
                                                    borderColor: def.visual_config.color
                                                }}
                                            >
                                                <Box className="h-4 w-4" style={{ color: def.visual_config.color }} />
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="font-medium truncate">{def.name}</span>
                                                {def.description && (
                                                    <span className="text-xs text-muted-foreground truncate">{def.description}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {definitions.length === 0 && (
                            <div className="text-center text-xs text-muted-foreground py-10">
                                No specific domain types defined for this scenario.
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
