/**
 * Canvas List Component
 *
 * Displays a list of canvases in the sidebar when in canvas mode.
 * Similar to ConversationList but for canvases.
 *
 * PEP 8 style comments
 */
"use client";

import { useState, useRef, useEffect } from "react";
import { Map, MoreVertical, Trash2, Edit2, Plus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CanvasPermissionsDialog } from "../semantic-canvas/canvas-permissions-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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
import { API_URL } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface CanvasSummary {
    id: string;
    name: string;
    created_at: string;
    updated_at: string | null;
    owner_id: number;
    allowed_user_ids: number[];
    allowed_role_ids: number[];
}

// =============================================================================
// Canvas List Component
// =============================================================================

export function CanvasList() {
    const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
    const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);

    // Permissions dialog state
    const [permissionsOpen, setPermissionsOpen] = useState(false);
    const [permissionTarget, setPermissionTarget] = useState<CanvasSummary | null>(null);

    // Get auth token
    const getToken = () => {
        if (typeof window !== "undefined") {
            const token = localStorage.getItem("token");
            try {
                // simple hack to get current user id from token payload if we needed it to check ownership
                // but relying on backend to enforce ownership for delete/permissions is better
                return token;
            } catch (e) { return null; }
        }
        return null;
    };

    // Fetch canvases on mount
    useEffect(() => {
        fetchCanvases();
    }, []);

    // Focus input when editing
    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingId]);

    // Fetch list of canvases from backend
    const fetchCanvases = async () => {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/canvases`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                setCanvases(data);
                // Set first canvas as active if none selected
                if (data.length > 0 && !activeCanvasId) {
                    setActiveCanvasId(data[0].id);
                    // Dispatch event so CanvasView loads this canvas
                    window.dispatchEvent(
                        new CustomEvent("canvas-select", { detail: { canvasId: data[0].id } })
                    );
                }
            }
        } catch (err) {
            console.error("Failed to fetch canvases:", err);
        } finally {
            setIsLoading(false);
        }
    };

    // Create new canvas
    const handleNewCanvas = async () => {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/canvases`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: "Untitled Canvas" }),
            });

            if (res.ok) {
                const newCanvas = await res.json();
                setCanvases((prev) => [newCanvas, ...prev]);
                setActiveCanvasId(newCanvas.id);
            }
        } catch (err) {
            console.error("Failed to create canvas:", err);
        }
    };

    // Start editing canvas name
    const handleRename = (id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    };

    // Submit rename
    const submitRename = async () => {
        if (!editingId || !editName.trim()) {
            setEditingId(null);
            return;
        }

        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/canvases/${editingId}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: editName }),
            });

            if (res.ok) {
                setCanvases((prev) =>
                    prev.map((c) =>
                        c.id === editingId ? { ...c, name: editName } : c
                    )
                );
            }
        } catch (err) {
            console.error("Failed to rename canvas:", err);
        } finally {
            setEditingId(null);
        }
    };

    // Handle keyboard events in rename input
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            submitRename();
        } else if (e.key === "Escape") {
            setEditingId(null);
        }
    };

    // Confirm delete canvas
    const confirmDelete = async () => {
        if (!deleteId) return;

        const token = getToken();
        if (!token) return;

        try {
            await fetch(`${API_URL}/canvases/${deleteId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            setCanvases((prev) => prev.filter((c) => c.id !== deleteId));
            if (activeCanvasId === deleteId) {
                setActiveCanvasId(canvases[0]?.id || null);
            }
        } catch (err) {
            console.error("Failed to delete canvas:", err);
        } finally {
            setDeleteId(null);
        }
    };

    // Open permissions dialog
    const handlePermissions = (canvas: CanvasSummary) => {
        setPermissionTarget(canvas);
        setPermissionsOpen(true);
    };

    // Save permissions
    const savePermissions = async (allowedUserIds: number[], allowedRoleIds: number[]) => {
        if (!permissionTarget) return;

        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/canvases/${permissionTarget.id}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    allowed_user_ids: allowedUserIds,
                    allowed_role_ids: allowedRoleIds
                }),
            });

            if (res.ok) {
                // Update local state
                setCanvases((prev) =>
                    prev.map((c) =>
                        c.id === permissionTarget.id
                            ? { ...c, allowed_user_ids: allowedUserIds, allowed_role_ids: allowedRoleIds }
                            : c
                    )
                );
            }
        } catch (err) {
            console.error("Failed to update permissions:", err);
        }
    };

    // Select a canvas
    const handleSelectCanvas = (id: string) => {
        setActiveCanvasId(id);
        // Dispatch custom event so CanvasView can react
        window.dispatchEvent(
            new CustomEvent("canvas-select", { detail: { canvasId: id } })
        );
    };

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2 px-2 py-4 w-full">
                <div className="text-xs font-semibold text-muted-foreground px-2 mb-2">
                    Canvases
                </div>
                <div className="text-sm text-muted-foreground px-2">
                    Loading...
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-2 px-2 py-4 w-full">
                <div className="flex items-center justify-between px-2 mb-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                        Canvases
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={handleNewCanvas}
                        title="New Canvas"
                    >
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>

                <div className="flex flex-col gap-1">
                    {canvases.length === 0 ? (
                        <div className="text-sm text-muted-foreground px-2">
                            No canvases yet.{" "}
                            <button
                                className="text-blue-600 hover:underline"
                                onClick={handleNewCanvas}
                            >
                                Create one
                            </button>
                        </div>
                    ) : (
                        canvases.map((canvas) => (
                            <div
                                key={canvas.id}
                                className={cn(
                                    "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
                                    activeCanvasId === canvas.id &&
                                    "bg-accent text-accent-foreground"
                                )}
                                onClick={() => handleSelectCanvas(canvas.id)}
                            >
                                <Map className="h-4 w-4 shrink-0" />
                                {editingId === canvas.id ? (
                                    <Input
                                        ref={inputRef}
                                        value={editName}
                                        onChange={(e) =>
                                            setEditName(e.target.value)
                                        }
                                        onBlur={submitRename}
                                        onKeyDown={handleKeyDown}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-6 text-xs px-1 py-0"
                                    />
                                ) : (
                                    <span className="truncate flex-1 text-left">
                                        {canvas.name}
                                    </span>
                                )}

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <MoreVertical className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRename(
                                                    canvas.id,
                                                    canvas.name
                                                );
                                            }}
                                        >
                                            <Edit2 className="mr-2 h-3 w-3" />{" "}
                                            Rename
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePermissions(canvas);
                                            }}
                                        >
                                            <Lock className="mr-2 h-3 w-3" />{" "}
                                            Permissions
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="text-red-600 focus:text-red-600"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteId(canvas.id);
                                            }}
                                        >
                                            <Trash2 className="mr-2 h-3 w-3" />{" "}
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <AlertDialog
                open={!!deleteId}
                onOpenChange={(open) => !open && setDeleteId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete the canvas and all its contents.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {permissionTarget && (
                <CanvasPermissionsDialog
                    open={permissionsOpen}
                    onOpenChange={setPermissionsOpen}
                    canvasId={permissionTarget.id}
                    canvasName={permissionTarget.name}
                    initialAllowedUserIds={permissionTarget.allowed_user_ids || []}
                    initialAllowedRoleIds={permissionTarget.allowed_role_ids || []}
                    onSave={savePermissions}
                />
            )}
        </>
    );
}
