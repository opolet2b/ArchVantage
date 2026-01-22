"use client"

/**
 * Agent Selector Dialog
 * 
 * A modal dialog that allows users to browse and select agents to launch
 * from within a chat conversation. Displays available agents with their
 * descriptions and provides search functionality.
 */
import * as React from "react"
import { Bot, Search, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { API_URL } from "@/lib/utils"

/**
 * Blueprint list item interface matching backend schema.
 */
interface BlueprintListItem {
    id: string
    name: string
    description: string | null
    version: string
    is_published: boolean
    inputs_schema: Record<string, unknown>
}

interface AgentSelectorDialogProps {
    /**
     * Whether the dialog is open.
     */
    open: boolean
    /**
     * Callback when the dialog open state changes.
     */
    onOpenChange: (open: boolean) => void
    /**
     * Callback when an agent is selected.
     */
    onSelectAgent: (agent: BlueprintListItem) => void
}

export function AgentSelectorDialog({
    open,
    onOpenChange,
    onSelectAgent
}: AgentSelectorDialogProps) {
    const [agents, setAgents] = React.useState<BlueprintListItem[]>([])
    const [isLoading, setIsLoading] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState("")
    const [error, setError] = React.useState<string | null>(null)

    /**
     * Fetch available agents when dialog opens.
     */
    React.useEffect(() => {
        if (!open) return

        const fetchAgents = async () => {
            setIsLoading(true)
            setError(null)

            try {
                const token = localStorage.getItem("token")
                if (!token) {
                    setError("Authentication required")
                    return
                }

                const res = await fetch(`${API_URL}/agent-blueprints`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                })

                if (!res.ok) {
                    throw new Error("Failed to fetch agents")
                }

                const data = await res.json()
                setAgents(data)
            } catch (err) {
                setError(err instanceof Error ? err.message : "An error occurred")
            } finally {
                setIsLoading(false)
            }
        }

        fetchAgents()
    }, [open])

    /**
     * Filter agents by search query.
     */
    const filteredAgents = React.useMemo(() => {
        if (!searchQuery.trim()) return agents

        const query = searchQuery.toLowerCase()
        return agents.filter(
            (agent) =>
                agent.name.toLowerCase().includes(query) ||
                agent.description?.toLowerCase().includes(query)
        )
    }, [agents, searchQuery])

    /**
     * Handle agent selection.
     */
    const handleSelectAgent = (agent: BlueprintListItem) => {
        onSelectAgent(agent)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-purple-500" />
                        Launch an Agent
                    </DialogTitle>
                    <DialogDescription>
                        Select an agent to run in your conversation
                    </DialogDescription>
                </DialogHeader>

                {/* Search Input */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search agents..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Agent List */}
                <ScrollArea className="h-[300px] pr-4">
                    {isLoading && (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-8 text-red-500 text-sm">
                            {error}
                        </div>
                    )}

                    {!isLoading && !error && filteredAgents.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            {searchQuery ? "No agents match your search" : "No agents available"}
                        </div>
                    )}

                    {!isLoading && !error && filteredAgents.length > 0 && (
                        <div className="space-y-2">
                            {filteredAgents.map((agent) => (
                                <button
                                    key={agent.id}
                                    onClick={() => handleSelectAgent(agent)}
                                    className={cn(
                                        "w-full text-left p-3 rounded-lg border border-transparent",
                                        "hover:bg-muted/50",
                                        "hover:border-primary/20",
                                        "transition-all duration-150 group"
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                            <Bot className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">
                                                {agent.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                                {agent.description || "No description"}
                                            </div>
                                            {agent.is_published && (
                                                <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                                    Published
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
