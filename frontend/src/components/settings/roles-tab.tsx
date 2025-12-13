"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { Label } from "@/components/ui/label"
import { Pencil, Trash2, ShieldAlert } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { PERMISSIONS, PERMISSION_LABELS } from "@/lib/permissions"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { API_URL } from "@/lib/utils"

interface Role {
    id: number
    name: string
    description: string
    permissions: string[]
}

export function RolesTab() {
    const [roles, setRoles] = useState<Role[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [selectedRole, setSelectedRole] = useState<Role | null>(null)

    // New role form state
    const [newRole, setNewRole] = useState({
        name: "",
        description: "",
        permissions: [] as string[]
    })

    // Edit role form state
    const [editRole, setEditRole] = useState({
        name: "",
        description: "",
        permissions: [] as string[]
    })

    useEffect(() => {
        fetchRoles()
    }, [])

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
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateRole = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/roles`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(newRole)
            })

            if (res.ok) {
                setIsCreateDialogOpen(false)
                fetchRoles()
                setNewRole({ name: "", description: "", permissions: [] })
            } else {
                alert("Failed to create role")
            }
        } catch (error) {
            console.error("Error creating role", error)
        }
    }

    const handleUpdateRole = async () => {
        if (!selectedRole) return

        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/roles/${selectedRole.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(editRole)
            })

            if (res.ok) {
                setIsEditDialogOpen(false)
                fetchRoles()
                setSelectedRole(null)
            } else {
                alert("Failed to update role")
            }
        } catch (error) {
            console.error("Error updating role", error)
        }
    }

    const handleDeleteRole = async (roleId: number) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/roles/${roleId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            })

            if (res.ok) {
                fetchRoles()
            } else {
                const data = await res.json()
                alert(data.detail || "Failed to delete role")
            }
        } catch (error) {
            console.error("Error deleting role", error)
        }
    }

    const openEditDialog = (role: Role) => {
        setSelectedRole(role)
        setEditRole({
            name: role.name,
            description: role.description || "",
            permissions: role.permissions || []
        })
        setIsEditDialogOpen(true)
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-medium">Roles</h2>
                    <p className="text-sm text-muted-foreground">
                        Manage user roles and permissions.
                    </p>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>Create Role</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Role</DialogTitle>
                            <DialogDescription>
                                Add a new role to the system.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    value={newRole.name}
                                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                                    placeholder="e.g. Editor"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={newRole.description}
                                    onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                                    placeholder="Role description..."
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Permissions</Label>
                                <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                                    <div className="space-y-2">
                                        {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                                            <div key={key} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`new-perm-${key}`}
                                                    checked={newRole.permissions.includes(key)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setNewRole({ ...newRole, permissions: [...newRole.permissions, key] })
                                                        } else {
                                                            setNewRole({ ...newRole, permissions: newRole.permissions.filter(p => p !== key) })
                                                        }
                                                    }}
                                                />
                                                <label htmlFor={`new-perm-${key}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                    {label}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreateRole}>Create Role</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Permissions</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {roles.map((role) => (
                            <TableRow key={role.id}>
                                <TableCell className="font-medium">{role.name}</TableCell>
                                <TableCell>{role.description}</TableCell>
                                <TableCell>
                                    <div className="flex gap-1 flex-wrap">
                                        {role.permissions?.map(p => (
                                            <span key={p} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                                {PERMISSION_LABELS[p as keyof typeof PERMISSION_LABELS] || p}
                                            </span>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex gap-2 justify-end">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEditDialog(role)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>

                                        {role.name !== "User" && role.name !== "Admin" ? (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete Role?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This action cannot be undone. Users with this role will be reassigned to the default "User" role if they have no other roles.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteRole(role.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        ) : (
                                            <Button variant="ghost" size="sm" disabled title="System role cannot be deleted">
                                                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Role</DialogTitle>
                        <DialogDescription>
                            Update role details.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">Name</Label>
                            <Input
                                id="edit-name"
                                value={editRole.name}
                                onChange={(e) => setEditRole({ ...editRole, name: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-description">Description</Label>
                            <Textarea
                                id="edit-description"
                                value={editRole.description}
                                onChange={(e) => setEditRole({ ...editRole, description: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Permissions</Label>
                            <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                                <div className="space-y-2">
                                    {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                                        <div key={key} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`edit-perm-${key}`}
                                                checked={editRole.permissions.includes(key)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setEditRole({ ...editRole, permissions: [...editRole.permissions, key] })
                                                    } else {
                                                        setEditRole({ ...editRole, permissions: editRole.permissions.filter(p => p !== key) })
                                                    }
                                                }}
                                            />
                                            <label htmlFor={`edit-perm-${key}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                {label}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUpdateRole}>Update Role</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
