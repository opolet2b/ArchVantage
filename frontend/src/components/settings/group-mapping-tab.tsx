"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Trash2, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { API_URL } from "@/lib/utils"

interface GroupMapping {
    id: number
    ad_group_dn: string
    role: {
        id: number
        name: string
    }
}

interface Role {
    id: number
    name: string
}

interface KnownADGroup {
    id: number
    name: string
}

export function GroupMappingTab() {
    const [mappings, setMappings] = useState<GroupMapping[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [adGroups, setAdGroups] = useState<KnownADGroup[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [isManualGroupDialogOpen, setIsManualGroupDialogOpen] = useState(false)

    // New mapping form state
    const [newMapping, setNewMapping] = useState({
        ad_group_dn: "",
        role_id: 0
    })

    // Manual AD group form state
    const [manualGroup, setManualGroup] = useState("")

    useEffect(() => {
        fetchMappings()
        fetchRoles()
        fetchAdGroups()
    }, [])

    const fetchMappings = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/group-mappings`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setMappings(data)
            }
        } catch (error) {
            console.error("Failed to fetch mappings", error)
        }
    }

    const fetchRoles = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/roles`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setRoles(data)
            }
        } catch (error) {
            console.error("Failed to fetch roles", error)
        }
    }

    const fetchAdGroups = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/ad-groups`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setAdGroups(data)
            }
        } catch (error) {
            console.error("Failed to fetch AD groups", error)
        }
    }

    const handleCreateMapping = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/group-mappings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(newMapping)
            })

            if (res.ok) {
                setIsCreateDialogOpen(false)
                fetchMappings()
                setNewMapping({ ad_group_dn: "", role_id: 0 })
            } else {
                alert("Failed to create mapping")
            }
        } catch (error) {
            console.error("Error creating mapping", error)
        }
    }

    const handleAddManualGroup = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/ad-groups/manual`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: manualGroup })
            })

            if (res.ok) {
                setIsManualGroupDialogOpen(false)
                fetchAdGroups()
                setManualGroup("")
                // Pre-select the new group in the mapping dialog
                setNewMapping({ ...newMapping, ad_group_dn: manualGroup })
            } else {
                alert("Failed to add manual group")
            }
        } catch (error) {
            console.error("Error adding manual group", error)
        }
    }

    const handleDeleteMapping = async (mappingId: number) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/group-mappings/${mappingId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            })

            if (res.ok) {
                fetchMappings()
            } else {
                alert("Failed to delete mapping")
            }
        } catch (error) {
            console.error("Error deleting mapping", error)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-medium">AD Group Mappings</h2>
                    <p className="text-sm text-muted-foreground">
                        Map Active Directory groups to roles.
                    </p>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>Add Mapping</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create Group Mapping</DialogTitle>
                            <DialogDescription>
                                Map an AD group to a role.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>AD Group</Label>
                                <div className="flex gap-2">
                                    <Select
                                        value={newMapping.ad_group_dn}
                                        onValueChange={(value) => setNewMapping({ ...newMapping, ad_group_dn: value })}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select AD Group" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {adGroups.map((group) => (
                                                <SelectItem key={group.id} value={group.name}>
                                                    {group.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Dialog open={isManualGroupDialogOpen} onOpenChange={setIsManualGroupDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="icon" title="Add Manual Group">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Add Manual AD Group</DialogTitle>
                                                <DialogDescription>
                                                    Enter the exact DN or name of the AD group.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="grid gap-4 py-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="manual-group">Group Name / DN</Label>
                                                    <Input
                                                        id="manual-group"
                                                        value={manualGroup}
                                                        onChange={(e) => setManualGroup(e.target.value)}
                                                        placeholder="CN=Developers,OU=Groups,DC=example,DC=com"
                                                    />
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button onClick={handleAddManualGroup}>Add Group</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label>Role</Label>
                                <Select
                                    value={newMapping.role_id.toString()}
                                    onValueChange={(value) => setNewMapping({ ...newMapping, role_id: parseInt(value) })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roles.map((role) => (
                                            <SelectItem key={role.id} value={role.id.toString()}>
                                                {role.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreateMapping} disabled={!newMapping.ad_group_dn || !newMapping.role_id}>
                                Create Mapping
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>AD Group</TableHead>
                            <TableHead>Mapped Role</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {mappings.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                                    No mappings found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            mappings.map((mapping) => (
                                <TableRow key={mapping.id}>
                                    <TableCell className="font-mono text-sm">{mapping.ad_group_dn}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary">{mapping.role.name}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteMapping(mapping.id)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
