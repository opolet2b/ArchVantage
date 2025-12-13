"use client"

/**
 * Tool Permissions Panel Component
 * 
 * Reusable component for managing user and group authorizations for tools.
 * Used by both MCP and GUI tool editors.
 */
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trash2, Plus, Users, User, Shield } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { ToolPermission } from "./tool-list"

interface User {
    id: number
    email: string
    first_name: string
    last_name: string
}

interface ADGroup {
    id: number
    display_name: string
    ad_group_oid: string
}

interface ToolPermissionsPanelProps {
    permissions: ToolPermission[]
    onChange: (permissions: ToolPermission[]) => void
}

export function ToolPermissionsPanel({
    permissions,
    onChange
}: ToolPermissionsPanelProps) {
    const [users, setUsers] = useState<User[]>([])
    const [adGroups, setAdGroups] = useState<ADGroup[]>([])
    const [selectedUserId, setSelectedUserId] = useState<string>("")
    const [selectedGroupId, setSelectedGroupId] = useState<string>("")
    const [selectedPermissionLevel, setSelectedPermissionLevel] = useState<string>("READ")

    // Fetch users and AD groups
    useEffect(() => {
        const fetchData = async () => {
            try {
                const token = localStorage.getItem("token")
                const headers = { "Authorization": `Bearer ${token}` }

                const [usersRes, groupsRes] = await Promise.all([
                    fetch(`${API_URL}/users`, { headers }),
                    fetch(`${API_URL}/known-ad-groups`, { headers })
                ])

                if (usersRes.ok) {
                    setUsers(await usersRes.json())
                }
                if (groupsRes.ok) {
                    setAdGroups(await groupsRes.json())
                }
            } catch (error) {
                console.error("Error fetching users/groups:", error)
            }
        }
        fetchData()
    }, [])

    // Add user permission
    const handleAddUserPermission = () => {
        if (!selectedUserId) return

        const userId = parseInt(selectedUserId)
        // Check if already exists
        if (permissions.some(p => p.user_id === userId)) return

        const newPermission: ToolPermission = {
            id: 0,  // Will be set by backend
            tool_id: 0,  // Will be set by backend
            user_id: userId,
            permission_level: selectedPermissionLevel as "READ" | "READ_WRITE"
        }
        onChange([...permissions, newPermission])
        setSelectedUserId("")
    }

    // Add group permission
    const handleAddGroupPermission = () => {
        if (!selectedGroupId) return

        const groupId = parseInt(selectedGroupId)
        // Check if already exists
        if (permissions.some(p => p.ad_group_id === groupId)) return

        const newPermission: ToolPermission = {
            id: 0,
            tool_id: 0,
            ad_group_id: groupId,
            permission_level: selectedPermissionLevel as "READ" | "READ_WRITE"
        }
        onChange([...permissions, newPermission])
        setSelectedGroupId("")
    }

    // Remove permission
    const handleRemovePermission = (index: number) => {
        const newPermissions = permissions.filter((_, i) => i !== index)
        onChange(newPermissions)
    }

    // Get display name for user
    const getUserName = (userId: number) => {
        const user = users.find(u => u.id === userId)
        return user ? `${user.first_name} ${user.last_name}` : `User #${userId}`
    }

    // Get display name for group
    const getGroupName = (groupId: number) => {
        const group = adGroups.find(g => g.id === groupId)
        return group ? group.display_name : `Group #${groupId}`
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Access Permissions
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Add User Permission */}
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> Add User
                    </Label>
                    <div className="flex gap-2">
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger className="flex-1 h-8">
                                <SelectValue placeholder="Select user..." />
                            </SelectTrigger>
                            <SelectContent>
                                {users.map(user => (
                                    <SelectItem key={user.id} value={user.id.toString()}>
                                        {user.first_name} {user.last_name} ({user.email})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={selectedPermissionLevel} onValueChange={setSelectedPermissionLevel}>
                            <SelectTrigger className="w-28 h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="READ">Read</SelectItem>
                                <SelectItem value="READ_WRITE">Read/Write</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={handleAddUserPermission} className="h-8">
                            <Plus className="h-3 w-3" />
                        </Button>
                    </div>
                </div>

                {/* Add Group Permission */}
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" /> Add AD Group
                    </Label>
                    <div className="flex gap-2">
                        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                            <SelectTrigger className="flex-1 h-8">
                                <SelectValue placeholder="Select group..." />
                            </SelectTrigger>
                            <SelectContent>
                                {adGroups.map(group => (
                                    <SelectItem key={group.id} value={group.id.toString()}>
                                        {group.display_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={selectedPermissionLevel} onValueChange={setSelectedPermissionLevel}>
                            <SelectTrigger className="w-28 h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="READ">Read</SelectItem>
                                <SelectItem value="READ_WRITE">Read/Write</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={handleAddGroupPermission} className="h-8">
                            <Plus className="h-3 w-3" />
                        </Button>
                    </div>
                </div>

                {/* Current Permissions */}
                {permissions.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                        <Label className="text-xs text-muted-foreground">Current Permissions</Label>
                        <div className="space-y-1">
                            {permissions.map((perm, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50"
                                >
                                    <div className="flex items-center gap-2">
                                        {perm.user_id ? (
                                            <>
                                                <User className="h-3 w-3 text-blue-500" />
                                                <span className="text-sm">{getUserName(perm.user_id)}</span>
                                            </>
                                        ) : perm.ad_group_id ? (
                                            <>
                                                <Users className="h-3 w-3 text-green-500" />
                                                <span className="text-sm">{getGroupName(perm.ad_group_id)}</span>
                                            </>
                                        ) : null}
                                        <Badge variant="outline" className="text-[10px] h-4">
                                            {perm.permission_level}
                                        </Badge>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleRemovePermission(index)}
                                    >
                                        <Trash2 className="h-3 w-3 text-red-500" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {permissions.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                        No permissions set. Tool is accessible to owner only.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
