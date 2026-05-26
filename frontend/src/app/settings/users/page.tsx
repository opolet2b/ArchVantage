"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
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
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Pencil, Lock, HelpCircle } from "lucide-react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { RolesTab } from "@/components/settings/roles-tab"
import { GroupMappingTab } from "@/components/settings/group-mapping-tab"
import { OAuthConfigTab } from "@/components/settings/oauth-config-tab"
import { RequirePermission } from "@/components/require-permission"
import { usePermission } from "@/lib/use-permission"
import { API_URL } from "@/lib/utils"

interface User {
    id: number
    email: string
    first_name: string
    last_name: string
    is_active: boolean
    auth_type: string
    roles: { id: number; name: string; source?: string }[]
}

interface Role {
    id: number
    name: string
    description?: string
}

export default function UserManagementPage() {
    const [users, setUsers] = useState<User[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { user: currentUser } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const { hasPermission } = usePermission()

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>("all")
    const [authTypeFilter, setAuthTypeFilter] = useState<string>("all")
    const [noRolesFilter, setNoRolesFilter] = useState(false)

    const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "users")

    const handleTabChange = (value: string) => {
        setActiveTab(value)
        const params = new URLSearchParams(searchParams)
        params.set("tab", value)
        router.push(`${pathname}?${params.toString()}`)
    }

    // New user form state
    const [newUser, setNewUser] = useState({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        role_ids: [] as number[],
        is_active: true
    })

    // Edit user form state
    const [editUser, setEditUser] = useState({
        first_name: "",
        last_name: "",
        email: "",
        role_ids: [] as number[],
    })

    const [roleSearch, setRoleSearch] = useState("")

    useEffect(() => {
        if (isCreateDialogOpen || isEditDialogOpen) {
            fetchRoles()
            setRoleSearch("")
        }
    }, [isCreateDialogOpen, isEditDialogOpen])

    useEffect(() => {
        fetchUsers()
        fetchRoles()
    }, [statusFilter, authTypeFilter, noRolesFilter])

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem("token")
            const params = new URLSearchParams()

            if (statusFilter === "active") params.append("active_only", "true")
            if (statusFilter === "inactive") params.append("inactive_only", "true")
            if (authTypeFilter !== "all") params.append("auth_type", authTypeFilter)
            if (noRolesFilter) params.append("no_roles_only", "true")

            const url = `${API_URL}/users?${params.toString()}`
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setUsers(data)
            }
        } catch (error) {
            console.error("Failed to fetch users", error)
        } finally {
            setIsLoading(false)
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

    const fetchUserDetails = async (userId: number) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/users/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setSelectedUser(data)
                setEditUser({
                    first_name: data.first_name,
                    last_name: data.last_name,
                    email: data.email,
                    role_ids: data.roles.filter((r: any) => r.source === "MANUAL").map((r: any) => r.id)
                })
                setIsEditDialogOpen(true)
            }
        } catch (error) {
            console.error("Failed to fetch user details", error)
        }
    }

    const handleCreateUser = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/users`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(newUser)
            })

            if (res.ok) {
                setIsCreateDialogOpen(false)
                fetchUsers()
                setNewUser({
                    email: "",
                    password: "",
                    first_name: "",
                    last_name: "",
                    role_ids: [],
                    is_active: true
                })
            } else {
                alert("Failed to create user")
            }
        } catch (error) {
            console.error("Error creating user", error)
        }
    }

    const handleUpdateUser = async () => {
        if (!selectedUser) return

        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/users/${selectedUser.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(editUser)
            })

            if (res.ok) {
                setIsEditDialogOpen(false)
                fetchUsers()
                setSelectedUser(null)
            } else {
                alert("Failed to update user")
            }
        } catch (error) {
            console.error("Error updating user", error)
        }
    }

    const toggleUserStatus = async (userId: number) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/users/${userId}/toggle-active`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                fetchUsers()
            }
        } catch (error) {
            console.error("Error toggling user status", error)
        }
    }

    const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        const formData = new FormData()
        formData.append("file", file)

        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/users/bulk-upload`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            })

            if (res.ok) {
                const blob = await res.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = "users_created.csv"
                a.click()
                window.URL.revokeObjectURL(url)
                fetchUsers()
            } else {
                alert("Failed to upload users")
            }
        } catch (error) {
            console.error("Bulk upload failed", error)
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    return (
        <div className="container mx-auto py-10">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">User Management</h1>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
                <TabsList>
                    {hasPermission("user:manage") && (
                        <TabsTrigger value="users">Users</TabsTrigger>
                    )}
                    {hasPermission("role:manage") && (
                        <TabsTrigger value="roles">Roles</TabsTrigger>
                    )}
                    {hasPermission("role:manage") && (
                        <TabsTrigger value="group-mappings">Group Mappings</TabsTrigger>
                    )}
                    {hasPermission("user:manage") && (
                        <TabsTrigger value="oauth">OAuth Config</TabsTrigger>
                    )}
                </TabsList>

                {hasPermission("user:manage") && (
                    <TabsContent value="users" className="space-y-4">
                        <div className="flex justify-end mb-4 gap-2">
                            <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleBulkUpload}
                            />
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                                            {isUploading ? "Uploading..." : "Bulk Upload (CSV)"}
                                            <HelpCircle className="ml-2 h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p>Upload a CSV file to mass-create users.</p>
                                        <p className="mt-1">Required column: <strong>Email</strong></p>
                                        <p>Optional column: <strong>Role</strong> (assigns an existing role by name)</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button>Add User</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add New User</DialogTitle>
                                        <DialogDescription>
                                            Create a new internal user account.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="email" className="text-right">Email</Label>
                                            <Input
                                                id="email"
                                                value={newUser.email}
                                                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                                className="col-span-3"
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="password" className="text-right">Password</Label>
                                            <Input
                                                id="password"
                                                type="password"
                                                value={newUser.password}
                                                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                                className="col-span-3"
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="first_name" className="text-right">First Name</Label>
                                            <Input
                                                id="first_name"
                                                value={newUser.first_name}
                                                onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                                                className="col-span-3"
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="last_name" className="text-right">Last Name</Label>
                                            <Input
                                                id="last_name"
                                                value={newUser.last_name}
                                                onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                                                className="col-span-3"
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 items-start gap-4">
                                            <Label className="text-right pt-2">Roles</Label>
                                            <div className="col-span-3 space-y-2">
                                                <Input
                                                    placeholder="Search roles..."
                                                    value={roleSearch}
                                                    onChange={(e) => setRoleSearch(e.target.value)}
                                                    className="mb-2"
                                                />
                                                <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                                                    <div className="space-y-2">
                                                        {roles
                                                            .filter(role => role.name.toLowerCase().includes(roleSearch.toLowerCase()))
                                                            .map((role) => (
                                                                <div key={role.id} className="flex items-center space-x-2">
                                                                    <Checkbox
                                                                        id={`role-${role.id}`}
                                                                        checked={newUser.role_ids.includes(role.id)}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) {
                                                                                setNewUser({ ...newUser, role_ids: [...newUser.role_ids, role.id] })
                                                                            } else {
                                                                                setNewUser({ ...newUser, role_ids: newUser.role_ids.filter(id => id !== role.id) })
                                                                            }
                                                                        }}
                                                                    />
                                                                    <label htmlFor={`role-${role.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                                        {role.name}
                                                                    </label>
                                                                </div>
                                                            ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleCreateUser}>Create User</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {/* Filters */}
                        <div className="flex gap-4 mb-6">
                            <div className="flex items-center gap-2">
                                <Label>Status:</Label>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[150px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="active">Active Only</SelectItem>
                                        <SelectItem value="inactive">Inactive Only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label>Auth Type:</Label>
                                <Select value={authTypeFilter} onValueChange={setAuthTypeFilter}>
                                    <SelectTrigger className="w-[150px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="internal">Internal</SelectItem>
                                        <SelectItem value="sso">SSO</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="no-roles"
                                    checked={noRolesFilter}
                                    onCheckedChange={(checked) => setNoRolesFilter(!!checked)}
                                />
                                <label htmlFor="no-roles" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    No Roles Only
                                </label>
                            </div>
                        </div>

                        {/* Edit User Dialog */}
                        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Edit User</DialogTitle>
                                    <DialogDescription>
                                        Update user information and roles.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-email" className="text-right">Email</Label>
                                        <Input
                                            id="edit-email"
                                            value={editUser.email}
                                            onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                                            className="col-span-3"
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-first-name" className="text-right">First Name</Label>
                                        <Input
                                            id="edit-first-name"
                                            value={editUser.first_name}
                                            onChange={(e) => setEditUser({ ...editUser, first_name: e.target.value })}
                                            className="col-span-3"
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="edit-last-name" className="text-right">Last Name</Label>
                                        <Input
                                            id="edit-last-name"
                                            value={editUser.last_name}
                                            onChange={(e) => setEditUser({ ...editUser, last_name: e.target.value })}
                                            className="col-span-3"
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-start gap-4">
                                        <Label className="text-right pt-2">Roles</Label>
                                        <div className="col-span-3 space-y-2">
                                            <Input
                                                placeholder="Search roles..."
                                                value={roleSearch}
                                                onChange={(e) => setRoleSearch(e.target.value)}
                                                className="mb-2"
                                            />
                                            <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                                                <div className="space-y-2">
                                                    {(selectedUser?.roles ?? []).filter(r => r.source === "MAPPED").length > 0 && (
                                                        <div className="mb-2 p-2 bg-muted rounded text-sm">
                                                            <Lock className="inline h-3 w-3 mr-1" />
                                                            Roles from AD groups are read-only
                                                        </div>
                                                    )}
                                                    {roles
                                                        .filter(role => role.name.toLowerCase().includes(roleSearch.toLowerCase()))
                                                        .map((role) => {
                                                            const isMapped = selectedUser?.roles.find(r => r.id === role.id && r.source === "MAPPED")
                                                            const isChecked = editUser.role_ids.includes(role.id) || !!isMapped

                                                            return (
                                                                <div key={role.id} className="flex items-center space-x-2">
                                                                    <Checkbox
                                                                        id={`edit-role-${role.id}`}
                                                                        checked={isChecked}
                                                                        disabled={!!isMapped}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) {
                                                                                setEditUser({ ...editUser, role_ids: [...editUser.role_ids, role.id] })
                                                                            } else {
                                                                                setEditUser({ ...editUser, role_ids: editUser.role_ids.filter(id => id !== role.id) })
                                                                            }
                                                                        }}
                                                                    />
                                                                    <label htmlFor={`edit-role-${role.id}`} className={`text-sm font-medium leading-none ${isMapped ? 'opacity-50' : ''}`}>
                                                                        {role.name}
                                                                        {isMapped && <Lock className="inline h-3 w-3 ml-1" />}
                                                                    </label>
                                                                </div>
                                                            )
                                                        })}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleUpdateUser}>Update User</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Auth Type</TableHead>
                                        <TableHead>Roles</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell>{user.id}</TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>{user.first_name} {user.last_name}</TableCell>
                                            <TableCell>
                                                <Badge variant={user.auth_type === "INTERNAL" ? "outline" : "secondary"}>
                                                    {user.auth_type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1 flex-wrap">
                                                    {user.roles.length === 0 ? (
                                                        <Badge variant="destructive">No Roles</Badge>
                                                    ) : (
                                                        user.roles.map(role => (
                                                            <Badge key={role.id} variant="secondary">
                                                                {role.name}
                                                            </Badge>
                                                        ))
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={user.is_active ? "default" : "destructive"}>
                                                    {user.is_active ? "Active" : "Inactive"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => fetchUserDetails(user.id)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => toggleUserStatus(user.id)}
                                                    >
                                                        {user.is_active ? "Deactivate" : "Activate"}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                )}

                {hasPermission("role:manage") && (
                    <TabsContent value="roles">
                        <RolesTab />
                    </TabsContent>
                )}

                {hasPermission("role:manage") && (
                    <TabsContent value="group-mappings">
                        <GroupMappingTab />
                    </TabsContent>
                )}

                {hasPermission("user:manage") && (
                    <TabsContent value="oauth">
                        <OAuthConfigTab />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    )
}
