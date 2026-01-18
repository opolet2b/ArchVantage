"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { MCPServerList, MCPServer } from "./mcp-server-list"
import { Server, Trash2, ChevronDown, ChevronRight, Loader2, AlertTriangle, Box, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Interfaces extended from tool-editor.tsx to maintain compatibility
export interface DiscoveredTool {
    name: string
    description?: string
    inputSchema?: Record<string, any>
}

export interface ConnectedServer extends MCPServer {
    discoveredTools: DiscoveredTool[]
    selectedTools: Set<string>
    isLoading: boolean
    error?: string
    isExpanded: boolean
}

interface ToolSelectionSectionProps {
    connectedServers: ConnectedServer[]
    onDrop: (e: React.DragEvent) => void
    onRemoveServer: (serverId: number) => void
    onToggleServerExpansion: (serverId: number) => void
    onToggleToolSelection: (serverId: number, toolName: string) => void
    onDragStart: (server: MCPServer) => void
    description: string
    onSuggestTools: () => void
    isSuggesting: boolean
}

export function ToolSelectionSection({
    connectedServers,
    onDrop,
    onRemoveServer,
    onToggleServerExpansion,
    onToggleToolSelection,
    onDragStart,
    description,
    onSuggestTools,
    isSuggesting
}: ToolSelectionSectionProps) {

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    return (
        <div id="tool-selection-section" className="space-y-4 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-900/10 shadow-sm">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">2 - Select MCP Tools</h3>
                    <p className="text-sm text-muted-foreground">
                        Drag and drop MCP servers here to include their tools in your pipeline.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onSuggestTools}
                    disabled={isSuggesting || !description}
                    title={!description ? "Enter a description first" : "Suggest relevant tools based on description"}
                    className="gap-2"
                    id="suggest-tools-btn"
                >
                    {isSuggesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Wand2 className="h-4 w-4" />
                    )}
                    Suggest Tools
                </Button>
            </div>

            <div className="flex gap-6 h-[500px]">
                {/* Left: Available Servers */}
                <div id="mcp-server-list" className="w-1/3 flex flex-col gap-2 border-r pr-4">
                    <MCPServerList onDragStart={onDragStart} />
                </div>

                {/* Right: Drop Zone & Selected Servers */}
                <div
                    id="tools-drop-zone"
                    className="flex-1 flex flex-col gap-4 overflow-y-auto p-4 border-2 border-dashed rounded-lg bg-slate-50/50 dark:bg-slate-900/50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                    onDrop={onDrop}
                    onDragOver={handleDragOver}
                >
                    {connectedServers.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                            <Box className="h-12 w-12 mb-2 opacity-20" />
                            <p>Drop MCP Servers here</p>
                        </div>
                    ) : (
                        connectedServers.map(server => (
                            <Card key={server.id} className="relative group">
                                <CardContent className="p-0">
                                    {/* Server Header */}
                                    <div className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-t-lg">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => onToggleServerExpansion(server.id)}
                                        >
                                            {server.isExpanded ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </Button>

                                        <Server className="h-4 w-4 text-blue-500" />
                                        <div className="flex-1 font-medium">{server.name}</div>

                                        {server.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

                                        {server.error && (
                                            <div className="text-red-500 flex items-center gap-1 text-xs" title={server.error}>
                                                <AlertTriangle className="h-4 w-4" />
                                                Error
                                            </div>
                                        )}

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-red-500"
                                            onClick={() => onRemoveServer(server.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {/* Tools List (Collapsible) */}
                                    {server.isExpanded && (
                                        <div className="p-3 border-t bg-white dark:bg-slate-950 rounded-b-lg space-y-2">
                                            {server.discoveredTools.length === 0 && !server.isLoading && !server.error && (
                                                <p className="text-xs text-muted-foreground pl-9">No tools found for this server.</p>
                                            )}

                                            {server.discoveredTools.map(tool => (
                                                <div key={tool.name} className="flex items-start gap-3 pl-9">
                                                    <Checkbox
                                                        id={`${server.id}-${tool.name}`}
                                                        checked={server.selectedTools.has(tool.name)}
                                                        onCheckedChange={() => onToggleToolSelection(server.id, tool.name)}
                                                        className="mt-0.5"
                                                    />
                                                    <div className="space-y-1">
                                                        <label
                                                            htmlFor={`${server.id}-${tool.name}`}
                                                            className="text-sm font-medium leading-none cursor-pointer"
                                                        >
                                                            {tool.name}
                                                        </label>
                                                        {tool.description && (
                                                            <p className="text-xs text-muted-foreground">
                                                                {tool.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
