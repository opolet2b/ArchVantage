"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Pencil, Trash2, Server, X } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { HelpTooltip } from "@/components/ui/help-tooltip"

interface MCPServerPermission {
    id?: number
    user_id?: number
    ad_group_id?: number
}

interface MCPServer {
    id: number
    name: string
    base_url: string
    description: string | null
    auth_type: "NONE" | "OAUTH2" | "API_KEY"
    auth_config: Record<string, any>
    is_active: boolean
    permissions: MCPServerPermission[]
}

interface User {
    id: number
    email: string
    first_name: string
    last_name: string
}

interface ADGroup {
    id: number
    display_name: string
}

export function MCPServersTab() {
    const [servers, setServers] = useState<MCPServer[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [adGroups, setADGroups] = useState<ADGroup[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingServer, setEditingServer] = useState<MCPServer | null>(null)
    const [formData, setFormData] = useState<Partial<MCPServer>>({
        name: "",
        base_url: "",
        description: "",
        auth_type: "NONE",
        auth_config: {},
        is_active: true,
        permissions: []
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            console.log("API_URL:", API_URL)
            console.log("Fetching from:", `${API_URL}/mcp-servers`)
            const token = localStorage.getItem("token")
            const [serversRes, usersRes, groupsRes] = await Promise.all([
                fetch(`${API_URL}/mcp-servers`, {
                    headers: { "Authorization": `Bearer ${token}` }
                }),
                fetch(`${API_URL}/users`, {
                    headers: { "Authorization": `Bearer ${token}` }
                }),
                fetch(`${API_URL}/ad-groups`, {
                    headers: { "Authorization": `Bearer ${token}` }
                })
            ])

            if (serversRes.ok) setServers(await serversRes.json())
            if (usersRes.ok) setUsers(await usersRes.json())
            if (groupsRes.ok) setADGroups(await groupsRes.json())
        } catch (error) {
            console.error("Failed to fetch data", error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreate = () => {
        setEditingServer(null)
        setFormData({
            name: "",
            base_url: "",
            description: "",
            auth_type: "NONE",
            auth_config: {},
            is_active: true,
            permissions: []
        })
        setIsDialogOpen(true)
    }

    const handleEdit = (server: MCPServer) => {
        setEditingServer(server)
        setFormData(server)
        setIsDialogOpen(true)
    }

    const handleSave = async () => {
        try {
            console.log("Saving MCP Server:", formData)
            const token = localStorage.getItem("token")
            const url = editingServer
                ? `${API_URL}/mcp-servers/${editingServer.id}`
                : `${API_URL}/mcp-servers`

            const method = editingServer ? "PUT" : "POST"

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })

            console.log("Response status:", response.status)

            if (response.ok) {
                await fetchData()
                setIsDialogOpen(false)
            } else {
                const errorData = await response.text()
                console.error("Server error:", errorData)
                alert(`Failed to save: ${response.status} ${response.statusText}`)
            }
        } catch (error) {
            console.error("Failed to save server", error)
            alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
    }

    const handleDelete = async (serverId: number) => {
        if (!confirm("Are you sure you want to delete this MCP server?")) return

        try {
            const token = localStorage.getItem("token")
            const response = await fetch(`${API_URL}/mcp-servers/${serverId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            })

            if (response.ok) {
                await fetchData()
            }
        } catch (error) {
            console.error("Failed to delete server", error)
        }
    }

    const handleTestConnection = async (serverId: number) => {
        try {
            const token = localStorage.getItem("token")
            const response = await fetch(`${API_URL}/mcp-servers/${serverId}/test-connection`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            })

            if (response.ok) {
                const data = await response.json()
                const serverName = data.serverInfo?.name || "Unknown"
                const protocolVersion = data.protocolVersion || "Unknown"
                const toolsList = data.tools.map((t: any) => `- ${t.name}`).slice(0, 10).join('\n')
                const moreTools = data.count > 10 ? `\n... and ${data.count - 10} more` : ''

                alert(
                    `✅ Connection successful!\n\n` +
                    `Server: ${serverName}\n` +
                    `Protocol: ${protocolVersion}\n\n` +
                    `Found ${data.count} tool(s):\n${toolsList}${moreTools}`
                )
            } else {
                const errorData = await response.json()
                alert(`❌ Connection failed:\n${errorData.detail || response.statusText}`)
            }
        } catch (error) {
            console.error("Failed to test connection", error)
            alert(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
    }

    if (isLoading) {
        return <div className="p-6">Loading...</div>
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">MCP Servers</h2>
                    <p className="text-muted-foreground">Manage Model Context Protocol servers</p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add MCP Server
                </Button>
            </div>

            <div className="grid gap-4">
                {servers.length === 0 ? (
                    <Card>
                        <CardContent className="p-6 text-center text-muted-foreground">
                            No MCP servers configured yet
                        </CardContent>
                    </Card>
                ) : (
                    servers.map(server => (
                        <Card key={server.id}>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <Server className="h-5 w-5 text-muted-foreground" />
                                        <div>
                                            <CardTitle>{server.name}</CardTitle>
                                            <CardDescription>{server.base_url}</CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleTestConnection(server.id)}
                                        >
                                            Test Connection
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(server)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(server.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            {server.description && (
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">{server.description}</p>
                                    <div className="mt-2 flex gap-4 text-xs">
                                        <span>Auth: {server.auth_type}</span>
                                        <span>Status: {server.is_active ? "Active" : "Inactive"}</span>
                                        <span>Permissions: {server.permissions?.length || 0}</span>
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingServer ? "Edit MCP Server" : "Add MCP Server"}</DialogTitle>
                        <DialogDescription>Configure MCP server details and access permissions</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Name *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="My MCP Server"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="base_url" className="flex items-center gap-2">
                                Server URL *
                                <HelpTooltip contentPath="settings/mcp_server_url" />
                            </Label>
                            <Input
                                id="base_url"
                                value={formData.base_url}
                                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                                placeholder="http://localhost:9000"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description || ""}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describe what this server provides"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="auth_type" className="flex items-center gap-2">
                                Authentication Type
                                <HelpTooltip contentPath="settings/mcp_auth_type" />
                            </Label>
                            <Select
                                value={formData.auth_type}
                                onValueChange={(val) => setFormData({ ...formData, auth_type: val as any, auth_config: {} })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="NONE">None</SelectItem>
                                    <SelectItem value="API_KEY">API Key</SelectItem>
                                    <SelectItem value="OAUTH2">OAuth 2.0</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {formData.auth_type === "API_KEY" && (
                            <div className="grid gap-2">
                                <Label htmlFor="api_key">API Key</Label>
                                <Input
                                    id="api_key"
                                    type="password"
                                    value={formData.auth_config?.api_key || ""}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        auth_config: { api_key: e.target.value }
                                    })}
                                />
                            </div>
                        )}

                        {formData.auth_type === "OAUTH2" && (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="client_id">Client ID</Label>
                                    <Input
                                        id="client_id"
                                        value={formData.auth_config?.client_id || ""}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            auth_config: { ...formData.auth_config, client_id: e.target.value }
                                        })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="client_secret">Client Secret</Label>
                                    <Input
                                        id="client_secret"
                                        type="password"
                                        value={formData.auth_config?.client_secret || ""}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            auth_config: { ...formData.auth_config, client_secret: e.target.value }
                                        })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="token_url">Token URL</Label>
                                    <Input
                                        id="token_url"
                                        value={formData.auth_config?.token_url || ""}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            auth_config: { ...formData.auth_config, token_url: e.target.value }
                                        })}
                                    />
                                </div>
                            </>
                        )}

                        <div className="border rounded-md p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Access Permissions</Label>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const newPerm = { user_id: users[0]?.id }
                                            setFormData({ ...formData, permissions: [...(formData.permissions || []), newPerm] })
                                        }}
                                        disabled={users.length === 0}
                                    >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add User
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const newPerm = { ad_group_id: adGroups[0]?.id }
                                            setFormData({ ...formData, permissions: [...(formData.permissions || []), newPerm] })
                                        }}
                                        disabled={adGroups.length === 0}
                                    >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add Group
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {formData.permissions?.map((perm, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        {perm.user_id ? (
                                            <Select
                                                value={perm.user_id?.toString()}
                                                onValueChange={(val) => {
                                                    const newPerms = [...(formData.permissions || [])]
                                                    newPerms[index] = { user_id: parseInt(val), ad_group_id: undefined }
                                                    setFormData({ ...formData, permissions: newPerms })
                                                }}
                                            >
                                                <SelectTrigger className="flex-1">
                                                    <SelectValue placeholder="Select User" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {users.map(user => (
                                                        <SelectItem key={user.id} value={user.id.toString()}>
                                                            {user.email}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Select
                                                value={perm.ad_group_id?.toString()}
                                                onValueChange={(val) => {
                                                    const newPerms = [...(formData.permissions || [])]
                                                    newPerms[index] = { ad_group_id: parseInt(val), user_id: undefined }
                                                    setFormData({ ...formData, permissions: newPerms })
                                                }}
                                            >
                                                <SelectTrigger className="flex-1">
                                                    <SelectValue placeholder="Select Group" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {adGroups.map(group => (
                                                        <SelectItem key={group.id} value={group.id.toString()}>
                                                            {group.display_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                const newPerms = formData.permissions?.filter((_, i) => i !== index)
                                                setFormData({ ...formData, permissions: newPerms })
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                {(!formData.permissions || formData.permissions.length === 0) && (
                                    <p className="text-sm text-muted-foreground italic">
                                        No permissions assigned. Only admins can access this server.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    )
}
