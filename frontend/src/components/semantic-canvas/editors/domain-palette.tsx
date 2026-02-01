"use client";

import * as React from "react";
import { DomainDefinition, DomainGroup } from "../canvas-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, FolderOpen, File, Search, Plus, ListFilter, Settings, Edit, Trash2 } from "lucide-react";
import { DomainGroupEditor } from "./domain-group-editor";
import { DomainDefinitionEditor } from "./domain-definition-editor";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface DomainPaletteProps {
    groups: DomainGroup[];
    domains: DomainDefinition[];
    onChangeGroups: (groups: DomainGroup[]) => void;
    onChangeDomains: (domains: DomainDefinition[]) => void;
}

export function DomainPalette({ groups, domains, onChangeGroups, onChangeDomains }: DomainPaletteProps) {
    const [search, setSearch] = React.useState("");
    const [editingGroup, setEditingGroup] = React.useState<DomainGroup | null>(null);
    const [editingDomain, setEditingDomain] = React.useState<DomainDefinition | null>(null);
    const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});

    const toggleGroup = (id: string) => {
        setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const filteredDomains = React.useMemo(() => {
        if (!search) return domains;
        const lower = search.toLowerCase();
        return domains.filter(d =>
            d.name.toLowerCase().includes(lower) ||
            d.tags?.some(t => t.toLowerCase().includes(lower))
        );
    }, [domains, search]);

    const domainsByGroup = React.useMemo(() => {
        const grouped: Record<string, DomainDefinition[]> = { "ungrouped": [] };
        groups.forEach(g => grouped[g.id] = []);

        filteredDomains.forEach(d => {
            if (d.group_id && grouped[d.group_id]) {
                grouped[d.group_id].push(d);
            } else {
                grouped["ungrouped"].push(d);
            }
        });
        return grouped;
    }, [filteredDomains, groups]);

    const handleCreateGroup = () => {
        const newGroup: DomainGroup = { id: `group_${Date.now()}`, name: "New Group" };
        onChangeGroups([...groups, newGroup]);
        setEditingGroup(newGroup);
    };

    const handleCreateDomain = (groupId?: string) => {
        const newDomain: DomainDefinition = {
            id: `domain_${Date.now()}`,
            name: "New Domain",
            group_id: groupId,
            visual_config: { color: "#10b981", icon: "box", corner_radius: 8 },
            metadata_schema: [],
            drop_zones: [],
            tags: []
        };
        onChangeDomains([...domains, newDomain]);
        setEditingDomain(newDomain);
    };

    const handleDeleteDomain = (id: string) => {
        onChangeDomains(domains.filter(d => d.id !== id));
    };

    const handleDeleteGroup = (id: string) => {
        // Move children to ungrouped maybe? Or just delete?
        // For simplicity, just delete group definition, children become orphan (ungrouped) automatically if group_id relies on existence?
        // Type definition says group_id is string. We should clear it.
        const newDomains = domains.map(d => d.group_id === id ? { ...d, group_id: undefined } : d);
        onChangeDomains(newDomains);
        onChangeGroups(groups.filter(g => g.id !== id));
    };

    return (
        <div className="flex h-full gap-4">
            {/* Left Pane: Palette List */}
            <div className="w-[350px] flex flex-col gap-4 border-r pr-4">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search domains..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </div>

                <div className="flex gap-2 justify-between">
                    <Button type="button" variant="outline" size="sm" onClick={handleCreateGroup}>
                        <Folder className="w-4 h-4 mr-2" /> New Group
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleCreateDomain()}>
                        <File className="w-4 h-4 mr-2" /> New Domain
                    </Button>
                </div>

                <ScrollArea className="flex-1">
                    <div className="space-y-4">
                        {/* Render Groups */}
                        {groups.map(group => (
                            <div key={group.id} className="border rounded-lg bg-card overflow-hidden">
                                <div className="flex items-center justify-between p-2 hover:bg-muted/50">
                                    <div className="flex items-center gap-2 cursor-pointer flex-1" onClick={() => toggleGroup(group.id)}>
                                        {expandedGroups[group.id] ? <FolderOpen className="w-4 h-4 text-blue-500" /> : <Folder className="w-4 h-4 text-blue-500" />}
                                        <span className="text-sm font-medium">{group.name}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingGroup(group)}>
                                            <Edit className="w-3 h-3" />
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteGroup(group.id)}>
                                            <Trash2 className="w-3 h-3 text-destructive" />
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCreateDomain(group.id)}>
                                            <Plus className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                                {expandedGroups[group.id] && (
                                    <div className="pl-4 pr-2 pb-2 space-y-1">
                                        {domainsByGroup[group.id].map(domain => (
                                            <div key={domain.id} className="flex items-center justify-between p-1.5 rounded-md hover:bg-muted text-sm border">
                                                <div className="flex items-center gap-2" onClick={() => setEditingDomain(domain)}>
                                                    <div className="w-3 h-3 rounded-full border" style={{ background: domain.visual_config.color }}></div>
                                                    <span className="cursor-pointer">{domain.name}</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingDomain(domain)}>
                                                        <Edit className="w-3 h-3" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteDomain(domain.id)}>
                                                        <Trash2 className="w-3 h-3 text-destructive" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                        {domainsByGroup[group.id].length === 0 && <div className="text-xs text-muted-foreground p-2">Empty group</div>}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Ungrouped Domains */}
                        {domainsByGroup["ungrouped"].length > 0 && (
                            <div className="space-y-1 pt-2">
                                <h4 className="text-xs font-semibold text-muted-foreground px-2 uppercase tracking-wider">Ungrouped</h4>
                                {domainsByGroup["ungrouped"].map(domain => (
                                    <div key={domain.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted text-sm border bg-card">
                                        <div className="flex items-center gap-2 cursor-pointer flex-1" onClick={() => setEditingDomain(domain)}>
                                            <div className="w-3 h-3 rounded-full border" style={{ background: domain.visual_config.color }}></div>
                                            <span>{domain.name}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingDomain(domain)}>
                                                <Edit className="w-3 h-3" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteDomain(domain.id)}>
                                                <Trash2 className="w-3 h-3 text-destructive" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Right Pane: Editor Area */}
            <div className="flex-1 border rounded-lg p-6 bg-card">
                {!editingGroup && !editingDomain && (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                        <ListFilter className="w-12 h-12 mb-4 opacity-20" />
                        <p>Select a group or domain to edit details.</p>
                    </div>
                )}

                {editingGroup && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b pb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2"><Folder className="w-4 h-4" /> Edit Group</h3>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingGroup(null)}><Settings className="w-4 h-4 mr-2" />Close</Button>
                        </div>
                        <DomainGroupEditor
                            group={editingGroup}
                            onChange={(updated) => {
                                onChangeGroups(groups.map(g => g.id === updated.id ? updated : g));
                                setEditingGroup(updated);
                            }}
                        />
                    </div>
                )}

                {editingDomain && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b pb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2"><File className="w-4 h-4" /> Edit Domain</h3>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingDomain(null)}><Settings className="w-4 h-4 mr-2" />Close</Button>
                        </div>
                        <DomainDefinitionEditor
                            domain={editingDomain}
                            onChange={(updated) => {
                                onChangeDomains(domains.map(d => d.id === updated.id ? updated : d));
                                setEditingDomain(updated);
                            }}
                        />

                        {/* Parent Group Selector */}
                        <div className="mt-6 border-t pt-4">
                            <label className="text-sm font-medium mb-2 block">Part of Group</label>
                            <select
                                className="w-full p-2 border rounded-md bg-background"
                                value={editingDomain.group_id || ""}
                                onChange={(e) => {
                                    const val = e.target.value || undefined;
                                    const updated = { ...editingDomain, group_id: val };
                                    onChangeDomains(domains.map(d => d.id === updated.id ? updated : d));
                                    setEditingDomain(updated);
                                }}
                            >
                                <option value="">(None - Top Level)</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
