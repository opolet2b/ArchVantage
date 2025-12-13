"use client";

/**
 * Agents Listing Page
 *
 * Displays all user agents with options to create, edit, rename, and delete.
 * This page serves as the main hub for agent management.
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Bot, MoreHorizontal, Pencil, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/utils";

/**
 * Blueprint list item interface matching backend schema.
 */
interface BlueprintListItem {
    id: string;
    name: string;
    description: string | null;
    version: string;
    is_published: boolean;
    created_at: string;
}

export default function AgentsPage() {
    const router = useRouter();
    const [agents, setAgents] = useState<BlueprintListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Delete dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [agentToDelete, setAgentToDelete] = useState<BlueprintListItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Rename dialog state
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [agentToRename, setAgentToRename] = useState<BlueprintListItem | null>(null);
    const [newName, setNewName] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);

    /**
     * Get auth token from local storage.
     */
    const getAuthToken = useCallback(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("token");
        }
        return null;
    }, []);

    /**
     * Fetch all agents from the API.
     */
    const fetchAgents = useCallback(async () => {
        const token = getAuthToken();
        if (!token) {
            router.push("/login");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_URL}/agent-blueprints`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!res.ok) {
                if (res.status === 401) {
                    router.push("/login");
                    return;
                }
                throw new Error("Failed to fetch agents");
            }

            const data = await res.json();
            setAgents(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
            setIsLoading(false);
        }
    }, [getAuthToken, router]);

    // Fetch agents on mount
    useEffect(() => {
        fetchAgents();
    }, [fetchAgents]);

    /**
     * Handle agent deletion.
     */
    const handleDelete = async () => {
        if (!agentToDelete) return;

        const token = getAuthToken();
        if (!token) return;

        setIsDeleting(true);

        try {
            const res = await fetch(`${API_URL}/agent-blueprints/${agentToDelete.id}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!res.ok) {
                throw new Error("Failed to delete agent");
            }

            // Remove from local state
            setAgents((prev) => prev.filter((a) => a.id !== agentToDelete.id));
            setDeleteDialogOpen(false);
            setAgentToDelete(null);
        } catch (err) {
            console.error("Delete error:", err);
        } finally {
            setIsDeleting(false);
        }
    };

    /**
     * Handle agent rename.
     */
    const handleRename = async () => {
        if (!agentToRename || !newName.trim()) return;

        const token = getAuthToken();
        if (!token) return;

        setIsRenaming(true);

        try {
            const res = await fetch(`${API_URL}/agent-blueprints/${agentToRename.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ name: newName.trim() }),
            });

            if (!res.ok) {
                throw new Error("Failed to rename agent");
            }

            // Update local state
            setAgents((prev) =>
                prev.map((a) =>
                    a.id === agentToRename.id ? { ...a, name: newName.trim() } : a
                )
            );
            setRenameDialogOpen(false);
            setAgentToRename(null);
            setNewName("");
        } catch (err) {
            console.error("Rename error:", err);
        } finally {
            setIsRenaming(false);
        }
    };

    /**
     * Open rename dialog for an agent.
     */
    const openRenameDialog = (agent: BlueprintListItem) => {
        setAgentToRename(agent);
        setNewName(agent.name);
        setRenameDialogOpen(true);
    };

    /**
     * Open delete dialog for an agent.
     */
    const openDeleteDialog = (agent: BlueprintListItem) => {
        setAgentToDelete(agent);
        setDeleteDialogOpen(true);
    };

    /**
     * Format date for display.
     */
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
            <div className="container mx-auto py-8 px-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            My Agents
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Manage and deploy your AI agents
                        </p>
                    </div>
                    <Button
                        onClick={() => router.push("/agents/builder/new")}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Agent
                    </Button>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && agents.length === 0 && (
                    <div className="text-center py-16">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                            <Bot className="h-8 w-8 text-slate-500" />
                        </div>
                        <h3 className="text-lg font-medium mb-2">No agents yet</h3>
                        <p className="text-muted-foreground mb-6">
                            Create your first AI agent to get started
                        </p>
                        <Button
                            onClick={() => router.push("/agents/builder/new")}
                            variant="outline"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Create Your First Agent
                        </Button>
                    </div>
                )}

                {/* Agents Grid */}
                {!isLoading && !error && agents.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {agents.map((agent) => (
                            <Card
                                key={agent.id}
                                className="group hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10">
                                                <Bot className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{agent.name}</CardTitle>
                                                <p className="text-xs text-muted-foreground">
                                                    v{agent.version}
                                                </p>
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => router.push(`/agents/builder/${agent.id}`)}
                                                >
                                                    <ExternalLink className="h-4 w-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => openRenameDialog(agent)}
                                                >
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => openDeleteDialog(agent)}
                                                    className="text-red-600 focus:text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="line-clamp-2 mb-4">
                                        {agent.description || "No description"}
                                    </CardDescription>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>Created {formatDate(agent.created_at)}</span>
                                        {agent.is_published && (
                                            <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                                                Published
                                            </span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete &quot;{agentToDelete?.name}&quot;?
                                This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                            >
                                {isDeleting ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Rename Dialog */}
                <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Rename Agent</DialogTitle>
                            <DialogDescription>
                                Enter a new name for your agent.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Agent name"
                                className="mt-2"
                                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setRenameDialogOpen(false)}
                                disabled={isRenaming}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleRename}
                                disabled={isRenaming || !newName.trim()}
                            >
                                {isRenaming ? "Saving..." : "Save"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
