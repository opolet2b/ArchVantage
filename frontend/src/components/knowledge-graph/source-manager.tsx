import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Globe, HardDrive, Network, Plus, Trash2, Edit2 } from "lucide-react"

export interface KnowledgeSource {
    id: string
    type: "mcp" | "local" | "url"
    name: string
    config: Record<string, string>
}

export function SourceManager({ sources, setSources }: { sources: KnowledgeSource[], setSources: React.Dispatch<React.SetStateAction<KnowledgeSource[]>> }) {
    const [isAdding, setIsAdding] = useState(false)
    const [newSource, setNewSource] = useState<Partial<KnowledgeSource>>({ type: "mcp" })

    const handleAddSource = () => {
        if (!newSource.name || !newSource.type) return

        const source: KnowledgeSource = {
            id: `source-${Date.now()}`,
            type: newSource.type,
            name: newSource.name,
            config: newSource.config || {}
        }

        setSources([...sources, source])
        setIsAdding(false)
        setNewSource({ type: "mcp" })
    }

    const handleDeleteSource = (id: string) => {
        setSources(sources.filter((s) => s.id !== id))
    }

    const getIconForType = (type: string) => {
        switch (type) {
            case "mcp": return <Network className="h-5 w-5 text-indigo-500" />
            case "local": return <HardDrive className="h-5 w-5 text-emerald-500" />
            case "url": return <Globe className="h-5 w-5 text-blue-500" />
            default: return <Database className="h-5 w-5" />
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-lg font-medium">Configured Sources ({sources.length})</h3>
                    <p className="text-sm text-muted-foreground">These sources will be used to populate this Knowledge Base.</p>
                </div>
                {!isAdding && (
                    <Button onClick={() => setIsAdding(true)} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="h-4 w-4 mr-2" /> Add Source
                    </Button>
                )}
            </div>

            {isAdding && (
                <Card className="border-indigo-200 shadow-md mb-6 bg-indigo-50/30">
                    <CardHeader>
                        <CardTitle className="text-base text-indigo-900">Add New Source</CardTitle>
                        <CardDescription>Select a source type and define its connection parameters.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label>Source Type</Label>
                            <Select
                                value={newSource.type}
                                onValueChange={(val: any) => setNewSource({ ...newSource, type: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mcp">MCP Server / API</SelectItem>
                                    <SelectItem value="url">Web URL / Confluence</SelectItem>
                                    <SelectItem value="local">Local Directory</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Source Name</Label>
                            <Input
                                placeholder="e.g. Jira Confluence IT Space"
                                value={newSource.name || ""}
                                onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                            />
                        </div>

                        {newSource.type === "url" && (
                            <div className="grid gap-2">
                                <Label>Base URL</Label>
                                <Input
                                    placeholder="https://"
                                    value={newSource.config?.url || ""}
                                    onChange={(e) => setNewSource({ ...newSource, config: { ...newSource.config, url: e.target.value } })}
                                />
                            </div>
                        )}

                        {newSource.type === "local" && (
                            <div className="grid gap-2">
                                <Label>Directory Path</Label>
                                <Input
                                    placeholder="/path/to/documents"
                                    value={newSource.config?.path || ""}
                                    onChange={(e) => setNewSource({ ...newSource, config: { ...newSource.config, path: e.target.value } })}
                                />
                            </div>
                        )}

                        {newSource.type === "mcp" && (
                            <div className="grid gap-4 bg-white p-4 rounded-md border mt-2">
                                <p className="text-sm text-muted-foreground">
                                    When the backend is fully connected, this area will allow you to select from active MCP servers (e.g., PostgreSQL, Jira, custom endpoints) and map specific queries or tools to this knowledge graph.
                                </p>
                            </div>
                        )}

                    </CardContent>
                    <CardFooter className="flex justify-end gap-2 border-t pt-4 bg-white/50">
                        <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                        <Button onClick={handleAddSource} disabled={!newSource.name} className="bg-indigo-600 hover:bg-indigo-700">
                            Save Source
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {sources.length === 0 && !isAdding ? (
                <div className="border border-dashed rounded-xl p-8 bg-card flex flex-col items-center justify-center text-center">
                    <div className="bg-slate-100 text-slate-400 p-4 rounded-full mb-4">
                        <Database className="h-8 w-8" />
                    </div>
                    <p className="text-muted-foreground max-w-sm mb-4">
                        No sources configured yet. The Knowledge Graph needs at least one data source to extract entities and relations.
                    </p>
                    <Button variant="outline" onClick={() => setIsAdding(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Add First Source
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sources.map((source) => (
                        <Card key={source.id} className="relative group overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-slate-100 to-transparent -mr-8 -mt-8 rounded-full z-0 pointer-events-none" />
                            <CardHeader className="pb-2 relative z-10 flex flex-row items-start justify-between">
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                        {getIconForType(source.type)}
                                        <Badge variant="outline" className="uppercase text-[10px] tracking-wider font-bold">
                                            {source.type}
                                        </Badge>
                                    </div>
                                    <CardTitle className="text-base mt-2">{source.name}</CardTitle>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                                        <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => handleDeleteSource(source.id)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="pb-4 relative z-10">
                                {source.type === "url" && (
                                    <div className="text-xs text-muted-foreground font-mono truncate bg-slate-50 p-1.5 rounded border">
                                        {source.config.url || "No URL specified"}
                                    </div>
                                )}
                                {source.type === "local" && (
                                    <div className="text-xs text-muted-foreground font-mono truncate bg-slate-50 p-1.5 rounded border">
                                        {source.config.path || "No path specified"}
                                    </div>
                                )}
                                {source.type === "mcp" && (
                                    <div className="text-xs text-muted-foreground font-mono truncate bg-slate-50 p-1.5 rounded border">
                                        MCP Configuration
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

function Database(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5V19A9 3 0 0 0 21 19V5" />
            <path d="M3 12A9 3 0 0 0 21 12" />
        </svg>
    )
}
