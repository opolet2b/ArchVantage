"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Search, User as UserIcon, Shield, PenLine, Eye } from "lucide-react";
import { API_URL } from "@/lib/utils";

interface User {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
}

interface Role {
    id: number;
    name: string;
    description?: string;
}

interface UserPermission {
    user_id: number;
    level: "read" | "write";
}

interface RolePermission {
    role_id: number;
    level: "read" | "write";
}

interface CanvasPermissionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    canvasId: string;
    canvasName: string;
    initialUserPermissions: UserPermission[];
    initialRolePermissions: RolePermission[];
    onSave: (userPermissions: UserPermission[], rolePermissions: RolePermission[]) => Promise<void>;
}

export function CanvasPermissionsDialog({
    open,
    onOpenChange,
    canvasId,
    canvasName,
    initialUserPermissions,
    initialRolePermissions,
    onSave,
}: CanvasPermissionsDialogProps) {
    const [userPermissions, setUserPermissions] = useState<UserPermission[]>(initialUserPermissions);
    const [rolePermissions, setRolePermissions] = useState<RolePermission[]>(initialRolePermissions);

    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [userSearch, setUserSearch] = useState("");
    const [roleSearch, setRoleSearch] = useState("");

    useEffect(() => {
        if (open) {
            setUserPermissions(initialUserPermissions || []);
            setRolePermissions(initialRolePermissions || []);
            fetchData();
        }
    }, [open, canvasId, initialUserPermissions, initialRolePermissions]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            const headers = { Authorization: `Bearer ${token}` };

            const [usersRes, rolesRes] = await Promise.all([
                fetch(`${API_URL}/users?active_only=true`, { headers }),
                fetch(`${API_URL}/roles`, { headers }),
            ]);

            if (usersRes.ok) {
                setUsers(await usersRes.json());
            }
            if (rolesRes.ok) {
                setRoles(await rolesRes.json());
            }
        } catch (error) {
            console.error("Failed to fetch users/roles:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(userPermissions, rolePermissions);
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save permissions:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleUser = (userId: number) => {
        setUserPermissions((prev) => {
            const existing = prev.find((p) => p.user_id === userId);
            if (existing) {
                return prev.filter((p) => p.user_id !== userId);
            } else {
                return [...prev, { user_id: userId, level: "read" }];
            }
        });
    };

    const updateUserLevel = (userId: number, level: "read" | "write") => {
        setUserPermissions((prev) =>
            prev.map((p) => (p.user_id === userId ? { ...p, level } : p))
        );
    };

    const toggleRole = (roleId: number) => {
        setRolePermissions((prev) => {
            const existing = prev.find((p) => p.role_id === roleId);
            if (existing) {
                return prev.filter((p) => p.role_id !== roleId);
            } else {
                return [...prev, { role_id: roleId, level: "read" }];
            }
        });
    };

    const updateRoleLevel = (roleId: number, level: "read" | "write") => {
        setRolePermissions((prev) =>
            prev.map((p) => (p.role_id === roleId ? { ...p, level } : p))
        );
    };

    const filteredUsers = users.filter((u) =>
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.first_name + " " + u.last_name).toLowerCase().includes(userSearch.toLowerCase())
    );

    const filteredRoles = roles.filter((r) =>
        r.name.toLowerCase().includes(roleSearch.toLowerCase())
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                    <DialogTitle>Manage Permissions</DialogTitle>
                    <DialogDescription>
                        Control who can access <strong>{canvasName}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="users" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="users">Users</TabsTrigger>
                        <TabsTrigger value="roles">Roles & Groups</TabsTrigger>
                    </TabsList>

                    <TabsContent value="users" className="space-y-4 py-4">
                        <div className="flex items-center space-x-2">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search users..."
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                className="flex-1"
                            />
                        </div>
                        <ScrollArea className="h-[250px] rounded-md border p-2">
                            {isLoading ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">Loading users...</div>
                            ) : filteredUsers.length === 0 ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">No users found</div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredUsers.map((user) => {
                                        const permission = userPermissions.find(p => p.user_id === user.id);
                                        return (
                                            <div key={user.id} className="flex items-center space-x-3 p-1 rounded hover:bg-muted/50">
                                                <Checkbox
                                                    id={`user-${user.id}`}
                                                    checked={!!permission}
                                                    onCheckedChange={() => toggleUser(user.id)}
                                                />
                                                <div className="flex-1 space-y-0.5">
                                                    <Label htmlFor={`user-${user.id}`} className="text-sm font-medium cursor-pointer">
                                                        {user.first_name} {user.last_name}
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                                </div>
                                                
                                                {permission && (
                                                    <Select 
                                                        value={permission.level} 
                                                        onValueChange={(val) => updateUserLevel(user.id, val as any)}
                                                    >
                                                        <SelectTrigger className="h-8 w-[110px] text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="read">
                                                                <div className="flex items-center">
                                                                    <Eye className="mr-2 h-3 w-3" />
                                                                    Read
                                                                </div>
                                                            </SelectItem>
                                                            <SelectItem value="write">
                                                                <div className="flex items-center">
                                                                    <PenLine className="mr-2 h-3 w-3" />
                                                                    Write
                                                                </div>
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                                {!permission && <UserIcon className="h-4 w-4 text-muted-foreground opacity-50" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </ScrollArea>
                        <div className="text-xs text-muted-foreground">
                            Selected: {userPermissions.length} users
                        </div>
                    </TabsContent>

                    <TabsContent value="roles" className="space-y-4 py-4">
                        <div className="flex items-center space-x-2">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search roles..."
                                value={roleSearch}
                                onChange={(e) => setRoleSearch(e.target.value)}
                                className="flex-1"
                            />
                        </div>
                        <ScrollArea className="h-[250px] rounded-md border p-2">
                            {isLoading ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">Loading roles...</div>
                            ) : filteredRoles.length === 0 ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">No roles found</div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredRoles.map((role) => {
                                        const permission = rolePermissions.find(p => p.role_id === role.id);
                                        return (
                                            <div key={role.id} className="flex items-center space-x-3 p-1 rounded hover:bg-muted/50">
                                                <Checkbox
                                                    id={`role-${role.id}`}
                                                    checked={!!permission}
                                                    onCheckedChange={() => toggleRole(role.id)}
                                                />
                                                <div className="flex-1 space-y-0.5">
                                                    <Label htmlFor={`role-${role.id}`} className="text-sm font-medium cursor-pointer">
                                                        {role.name}
                                                    </Label>
                                                    {role.description && (
                                                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{role.description}</p>
                                                    )}
                                                </div>
                                                
                                                {permission && (
                                                    <Select 
                                                        value={permission.level} 
                                                        onValueChange={(val) => updateRoleLevel(role.id, val as any)}
                                                    >
                                                        <SelectTrigger className="h-8 w-[110px] text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="read">
                                                                <div className="flex items-center">
                                                                    <Eye className="mr-2 h-3 w-3" />
                                                                    Read
                                                                </div>
                                                            </SelectItem>
                                                            <SelectItem value="write">
                                                                <div className="flex items-center">
                                                                    <PenLine className="mr-2 h-3 w-3" />
                                                                    Write
                                                                </div>
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                                {!permission && <Shield className="h-4 w-4 text-muted-foreground opacity-50" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </ScrollArea>
                        <div className="text-xs text-muted-foreground">
                            Users with these roles will have access with the chosen level.
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save Permissions"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

