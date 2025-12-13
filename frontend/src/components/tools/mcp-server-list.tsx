"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Server } from "lucide-react"
import { API_URL } from "@/lib/utils"

export interface MCPServer {
    id: number
    name: string
    base_url: string
    description: string | null
    is_active: boolean
    functions?: string[]
}

interface MCPServerListProps {
    onDragStart: (server: MCPServer) => void
}

export function MCPServerList({ onDragStart }: MCPServerListProps) {
    const [servers, setServers] = useState<MCPServer[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchServers = async () => {
            try {
                const response = await fetch(`${API_URL}/mcp-servers?for_tool_builder=true`, {
                    headers: {
                        "Authorization": `Bearer ${localStorage.getItem("token")}`
                    }
                })

                if (response.ok) {
                    const data = await response.json()
                    setServers(data)
                } else {
                    setError("Failed to load MCP servers")
                }
            } catch (err) {
                console.error("Error fetching MCP servers:", err)
                setError("Failed to load MCP servers")
            } finally {
                setIsLoading(false)
            }
        }

        fetchServers()
    }, [])

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                <h3 className="font-semibold text-sm mb-2">Available MCP Servers</h3>
                <p className="text-xs text-muted-foreground">Loading...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col gap-2">
                <h3 className="font-semibold text-sm mb-2">Available MCP Servers</h3>
                <p className="text-xs text-red-500">{error}</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-sm mb-2">Available MCP Servers</h3>
            {servers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No MCP servers available</p>
            ) : (
                servers.map(server => (
                    <div
                        key={server.id}
                        draggable={server.is_active}
                        onDragStart={() => onDragStart(server)}
                        className={server.is_active ? "cursor-move" : "opacity-50 cursor-not-allowed"}
                    >
                        <Card className={server.is_active ? "hover:bg-accent/50 transition-colors" : ""}>
                            <CardContent className="p-3 flex items-center gap-3">
                                <Server className="h-4 w-4 text-muted-foreground" />
                                <div>
                                    <div className="font-medium text-sm">{server.name}</div>
                                    <div className="text-xs text-muted-foreground">{server.description || "No description"}</div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ))
            )}
        </div>
    )
}
