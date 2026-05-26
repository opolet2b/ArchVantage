"use client";

/**
 * Templates Settings Tab
 *
 * Admin component for managing template storage and folder permissions.
 * Located in Settings > Templates.
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, FolderPlus, RefreshCw, Save, CheckCircle2 } from "lucide-react";

import { API_URL } from "@/lib/utils"

interface Folder {
    id: string;
    name: string;
    path: string;
}

interface Permission {
    id: number;
    folder_id: string;
    role_id: number | null;
    user_id: number | null;
    permission: string;
}

interface Role {
    id: number;
    name: string;
}

export function TemplatesSettingsTab() {
    // Storage configuration
    const [storageBackend, setStorageBackend] = useState<string>("database");
    const [rootPath, setRootPath] = useState<string>("");
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [configSaved, setConfigSaved] = useState(false);

    const [folders, setFolders] = useState<Folder[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingPermissions, setLoadingPermissions] = useState(false);

    // New folder dialog
    const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");

    // New permission dialog
    const [showAddPermDialog, setShowAddPermDialog] = useState(false);
    const [newPermRoleId, setNewPermRoleId] = useState<string>("");
    const [newPermLevel, setNewPermLevel] = useState<string>("READ");

    // Fetch storage config on load
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await fetch(`${API_URL}/templates/config`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });
                if (response.ok) {
                    const data = await response.json();
                    setStorageBackend(data.storage_backend || "database");
                    setRootPath(data.root_path || "");
                }
            } catch (error) {
                // Config endpoint may not exist yet, use defaults
                console.log("Using default config");
            }
        };
        fetchConfig();
    }, []);

    // Save storage config
    const saveConfig = async () => {
        setIsSavingConfig(true);
        setConfigSaved(false);
        try {
            const response = await fetch(`${API_URL}/templates/config`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    storage_backend: storageBackend,
                    root_path: rootPath,
                }),
            });
            if (response.ok) {
                setConfigSaved(true);
                setTimeout(() => setConfigSaved(false), 3000);
            }
        } catch (error) {
            console.error("Failed to save config:", error);
        } finally {
            setIsSavingConfig(false);
        }
    };

    // Fetch folders from tree
    const fetchFolders = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/templates/tree`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            if (response.ok) {
                const data = await response.json();
                // Extract folders from tree
                const extractFolders = (nodes: any[]): Folder[] => {
                    const result: Folder[] = [];
                    for (const node of nodes) {
                        if (node.type === "folder") {
                            result.push({ id: node.id, name: node.name, path: node.path });
                            if (node.children) {
                                result.push(...extractFolders(node.children));
                            }
                        }
                    }
                    return result;
                };
                setFolders(extractFolders(data.tree || []));
            }
        } catch (error) {
            console.error("Failed to fetch folders:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch roles
    const fetchRoles = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/roles`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            if (response.ok) {
                const data = await response.json();
                setRoles(data);
            }
        } catch (error) {
            console.error("Failed to fetch roles:", error);
        }
    }, []);

    // Fetch permissions for selected folder
    const fetchPermissions = useCallback(async (folderId: string) => {
        setLoadingPermissions(true);
        try {
            const response = await fetch(`${API_URL}/templates/folders/${folderId}/permissions`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            if (response.ok) {
                const data = await response.json();
                setPermissions(data.permissions || []);
            }
        } catch (error) {
            console.error("Failed to fetch permissions:", error);
        } finally {
            setLoadingPermissions(false);
        }
    }, []);

    useEffect(() => {
        fetchFolders();
        fetchRoles();
    }, [fetchFolders, fetchRoles]);

    useEffect(() => {
        if (selectedFolder) {
            fetchPermissions(selectedFolder);
        } else {
            setPermissions([]);
        }
    }, [selectedFolder, fetchPermissions]);

    // Create folder
    const createFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const response = await fetch(`${API_URL}/templates/folders`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    name: newFolderName,
                    parent_id: null,
                }),
            });
            if (response.ok) {
                setShowNewFolderDialog(false);
                setNewFolderName("");
                await fetchFolders();
            } else {
                // Handle error response
                const data = await response.json();
                alert(data.detail || "Failed to create folder");
            }
        } catch (error) {
            console.error("Failed to create folder:", error);
            alert("Failed to create folder. Please try again.");
        }
    };

    // Add permission
    const addPermission = async () => {
        if (!selectedFolder || !newPermRoleId) return;
        try {
            const response = await fetch(`${API_URL}/templates/folders/${selectedFolder}/permissions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    folder_id: selectedFolder,
                    role_id: parseInt(newPermRoleId),
                    user_id: null,
                    permission: newPermLevel,
                }),
            });
            if (response.ok) {
                setShowAddPermDialog(false);
                setNewPermRoleId("");
                setNewPermLevel("READ");
                await fetchPermissions(selectedFolder);
            }
        } catch (error) {
            console.error("Failed to add permission:", error);
        }
    };

    // Delete permission
    const deletePermission = async (permId: number) => {
        if (!confirm("Delete this permission?")) return;
        try {
            const response = await fetch(`${API_URL}/templates/permissions/${permId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            if (response.ok && selectedFolder) {
                await fetchPermissions(selectedFolder);
            }
        } catch (error) {
            console.error("Failed to delete permission:", error);
        }
    };

    // Get role name by ID
    const getRoleName = (roleId: number | null): string => {
        if (!roleId) return "N/A";
        const role = roles.find(r => r.id === roleId);
        return role?.name || `Role #${roleId}`;
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold mb-2">Templates Configuration</h2>
                <p className="text-muted-foreground text-sm">
                    Configure template storage location and folder permissions.
                </p>
            </div>

            {/* Storage Backend Configuration */}
            <div className="space-y-4 border rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
                <h3 className="font-medium">Storage Backend</h3>
                <p className="text-sm text-muted-foreground">
                    Choose where template files are stored.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <Label htmlFor="storage-backend" className="text-sm font-medium">
                            Storage Type
                        </Label>
                        <Select value={storageBackend} onValueChange={setStorageBackend}>
                            <SelectTrigger id="storage-backend" className="mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="database">Database (Default)</SelectItem>
                                <SelectItem value="local">Local File System</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {storageBackend === "local" && (
                        <div>
                            <Label htmlFor="root-path" className="text-sm font-medium">
                                Root Path
                            </Label>
                            <Input
                                id="root-path"
                                placeholder="C:\Templates or /var/templates"
                                value={rootPath}
                                onChange={(e) => setRootPath(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        onClick={saveConfig}
                        disabled={isSavingConfig}
                        size="sm"
                    >
                        {isSavingConfig ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-1" />
                        )}
                        Save Configuration
                    </Button>
                    {configSaved && (
                        <span className="text-sm text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            Saved
                        </span>
                    )}
                </div>
            </div>

            {/* Folder Management */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium">Template Folders</h3>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowNewFolderDialog(true)}
                        >
                            <FolderPlus className="h-4 w-4 mr-1" />
                            New Folder
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={fetchFolders}
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Loading folders...
                    </div>
                ) : folders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                        No folders yet. Create your first folder to get started.
                    </div>
                ) : (
                    <div className="flex gap-2 flex-wrap">
                        {folders.map((folder) => (
                            <Button
                                key={folder.id}
                                variant={selectedFolder === folder.id ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setSelectedFolder(folder.id)}
                            >
                                {folder.path}
                            </Button>
                        ))}
                    </div>
                )}
            </div>

            {/* Permissions Management */}
            {selectedFolder && (
                <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium">
                            Permissions for: {folders.find(f => f.id === selectedFolder)?.path}
                        </h3>
                        <Button
                            size="sm"
                            onClick={() => setShowAddPermDialog(true)}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Permission
                        </Button>
                    </div>

                    {loadingPermissions ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Loading...
                        </div>
                    ) : permissions.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                            No permissions configured. Add a permission to control access.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Permission</TableHead>
                                    <TableHead className="w-[80px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {permissions.map((perm) => (
                                    <TableRow key={perm.id}>
                                        <TableCell>{getRoleName(perm.role_id)}</TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded text-xs ${perm.permission === "WRITE"
                                                ? "bg-blue-100 text-blue-700"
                                                : perm.permission === "READ"
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-red-100 text-red-700"
                                                }`}>
                                                {perm.permission}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => deletePermission(perm.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            )}

            {/* New Folder Dialog */}
            <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Root Folder</DialogTitle>
                        <DialogDescription>
                            Create a new root-level template folder.
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder="Folder name"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={createFolder}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Permission Dialog */}
            <Dialog open={showAddPermDialog} onOpenChange={setShowAddPermDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Permission</DialogTitle>
                        <DialogDescription>
                            Grant access to this folder for a role.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium">Role</label>
                            <Select value={newPermRoleId} onValueChange={setNewPermRoleId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
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
                        <div>
                            <label className="text-sm font-medium">Permission Level</label>
                            <Select value={newPermLevel} onValueChange={setNewPermLevel}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="READ">READ - Can use templates</SelectItem>
                                    <SelectItem value="WRITE">WRITE - Can edit templates</SelectItem>
                                    <SelectItem value="DENY">DENY - No access</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddPermDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={addPermission}>Add</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
