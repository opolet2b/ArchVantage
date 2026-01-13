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
import { useAuth } from "@/lib/auth-context";

import { useRouter, usePathname } from "next/navigation";
import { Map, MoreVertical, Trash2, Edit2, Plus, Lock, CheckSquare, X, ListChecks, Archive, Upload, Download, RotateCcw, Sparkles, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CanvasPermissionsDialog } from "../semantic-canvas/canvas-permissions-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
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
    const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
    const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
    const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const pathname = usePathname();

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

    // Fetch list of canvases from backend
    const fetchCanvases = async () => {
        // Wait for auth to initialize
        if (isAuthLoading) return;

        if (!isAuthenticated) {
            setCanvases([]);
            setIsLoading(false);
            return;
        }

        const token = getToken();
        if (!token) {
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_URL}/canvases?archived=${viewMode === 'archived'}`, {
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

    // Re-fetch when auth state or view mode changes
    useEffect(() => {
        fetchCanvases();
    }, [viewMode, isAuthLoading, isAuthenticated]);

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

    const handleAutoRename = async (id: string, currentName: string) => {
        const token = getToken();
        if (!token) return;

        // Optimistic / Loading feedback
        // We could set a "renaming" state, but for now let's just use a toast or simple rename flow
        // Or set the name to "Generating name..." temporarily?
        // Let's just do it silently and update when done, maybe show a toast if we had one.

        try {
            const res = await fetch(`${API_URL}/canvases/${id}/auto-rename`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.status === "success" && data.name) {
                    setCanvases((prev) =>
                        prev.map((c) =>
                            c.id === id ? { ...c, name: data.name } : c
                        )
                    );
                } else if (data.status === "skipped") {
                    console.log("Auto-rename skipped:", data.message);
                    alert("Could not generate a better name. Please add more content to the canvas first.");
                }
            }
        } catch (err) {
            console.error("Failed to auto-rename:", err);
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

    // Selection helpers
    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIds(new Set());
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === canvases.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(canvases.map((c) => c.id)));
        }
    };

    // Confirm delete canvas
    const confirmDelete = async () => {
        if (showBatchDeleteConfirm) {
            // Batch delete
            const token = getToken();
            if (!token) return;

            try {
                const ids = Array.from(selectedIds);
                await Promise.all(
                    ids.map((id) =>
                        fetch(`${API_URL}/canvases/${id}`, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${token}` },
                        })
                    )
                );

                setCanvases((prev) => prev.filter((c) => !selectedIds.has(c.id)));

                // If the active canvas was deleted, switch to another or null
                if (activeCanvasId && selectedIds.has(activeCanvasId)) {
                    const remaining = canvases.filter(c => !selectedIds.has(c.id));
                    setActiveCanvasId(remaining.length > 0 ? remaining[0].id : null);
                }

                setIsSelectionMode(false);
                setSelectedIds(new Set());
            } catch (err) {
                console.error("Failed to batch delete canvases:", err);
            } finally {
                setShowBatchDeleteConfirm(false);
            }
            return;
        }

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

    const handleBatchArchive = async () => {
        const token = getToken();
        if (!token) return;

        const ids = Array.from(selectedIds);
        await Promise.all(
            ids.map((id) =>
                fetch(`${API_URL}/canvases/${id}/archive`, {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${token}` },
                })
            )
        );
        fetchCanvases();
        setIsSelectionMode(false);
        setSelectedIds(new Set());
    };

    const handleBatchRestore = async () => {
        const token = getToken();
        if (!token) return;

        const ids = Array.from(selectedIds);
        await Promise.all(
            ids.map((id) =>
                fetch(`${API_URL}/canvases/${id}/restore`, {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${token}` },
                })
            )
        );
        fetchCanvases();
        setIsSelectionMode(false);
        setSelectedIds(new Set());
    };

    const handleBatchExport = async () => {
        const token = getToken();
        if (!token) return;

        const ids = Array.from(selectedIds);

        // Export individually for now as implementing bulk zip is complex on client without lib
        for (const id of ids) {
            try {
                const res = await fetch(`${API_URL}/canvases/${id}/export`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `canvas_export_${data.canvas.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            } catch (err) {
                console.error(`Failed to export canvas ${id}`, err);
            }
        }

        setIsSelectionMode(false);
        setSelectedIds(new Set());
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const token = getToken();
        if (!token) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                const res = await fetch(`${API_URL}/canvases/import`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(data)
                });

                if (res.ok) {
                    fetchCanvases();
                }
            } catch (err) {
                console.error("Failed to parse import file", err);
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleReorder = async (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
        const currentIndex = canvases.findIndex(c => c.id === id);
        if (currentIndex === -1) return;

        const newCanvases = [...canvases];
        const item = newCanvases[currentIndex];

        // Remove item from current position
        newCanvases.splice(currentIndex, 1);

        // Insert at new position
        if (direction === 'top') {
            newCanvases.unshift(item);
        } else if (direction === 'bottom') {
            newCanvases.push(item);
        } else if (direction === 'up') {
            const newIndex = Math.max(0, currentIndex - 1);
            newCanvases.splice(newIndex, 0, item);
        } else if (direction === 'down') {
            const newIndex = Math.min(newCanvases.length, currentIndex + 1);
            newCanvases.splice(newIndex, 0, item);
        }

        // Optimistic update
        setCanvases(newCanvases);

        // Generate updates: assign index 0..N
        const updates = newCanvases.map((c, index) => ({
            id: c.id,
            position: index
        }));

        try {
            const token = getToken();
            if (!token) return;

            const res = await fetch(`${API_URL}/canvases/reorder`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(updates)
            });

            if (!res.ok) {
                // Revert on failure? Or just re-fetch
                fetchCanvases();
            }
        } catch (err) {
            console.error("Failed to reorder canvases:", err);
            fetchCanvases();
        }
    };

    // Select a canvas
    const handleSelectCanvas = (id: string) => {
        setActiveCanvasId(id);

        // Dispatch custom event so CanvasView can react
        window.dispatchEvent(
            new CustomEvent("canvas-select", { detail: { canvasId: id } })
        );

        // If not on home page, navigate there
        if (pathname !== "/") {
            router.push("/");
        }
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
                    <div className="flex gap-1 items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-6 w-6", viewMode === 'archived' && "bg-accent text-accent-foreground")}
                            onClick={() => setViewMode(viewMode === 'active' ? 'archived' : 'active')}
                            title={viewMode === 'active' ? "Show Archived" : "Show Active"}
                        >
                            <Archive className="h-3.5 w-3.5" />
                        </Button>
                        {!isSelectionMode ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={handleImportClick}
                                    title="Import Canvas"
                                >
                                    <Upload className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={toggleSelectionMode}
                                    title="Select canvases"
                                >
                                    <ListChecks className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={handleNewCanvas}
                                    title="New Canvas"
                                >
                                    <Plus className="h-3 w-3" />
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </>
                        ) : (
                            <div className="flex items-center gap-1">
                                {viewMode === 'active' ? (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={handleBatchExport}
                                            disabled={selectedIds.size === 0}
                                            title="Export selected"
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={handleBatchArchive}
                                            disabled={selectedIds.size === 0}
                                            title="Archive selected"
                                        >
                                            <Archive className="h-3.5 w-3.5" />
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={handleBatchRestore}
                                        disabled={selectedIds.size === 0}
                                        title="Restore selected"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() =>
                                        selectedIds.size > 0 &&
                                        setShowBatchDeleteConfirm(true)
                                    }
                                    disabled={selectedIds.size === 0}
                                    title="Delete selected"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={toggleSelectionMode}
                                    title="Cancel selection"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
                {isSelectionMode && canvases.length > 0 && (
                    <div className="px-2 mb-2 flex items-center gap-2">
                        <Checkbox
                            checked={
                                selectedIds.size === canvases.length &&
                                canvases.length > 0
                            }
                            onCheckedChange={handleSelectAll}
                        />
                        <span className="text-xs text-muted-foreground">
                            Select All ({selectedIds.size}/{canvases.length})
                        </span>
                    </div>
                )}

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
                                {isSelectionMode && (
                                    <Checkbox
                                        checked={selectedIds.has(canvas.id)}
                                        onCheckedChange={() =>
                                            toggleSelection(canvas.id)
                                        }
                                        onClick={(e) => e.stopPropagation()}
                                        className="mr-2"
                                    />
                                )}
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
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAutoRename(canvas.id, canvas.name);
                                            }}
                                        >
                                            <Sparkles className="mr-2 h-3 w-3 text-purple-500" />{" "}
                                            Auto-Rename
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
                                        <DropdownMenuSeparator />
                                        <div className="flex items-center justify-between px-2 py-1.5">
                                            <span className="text-xs text-muted-foreground w-full text-center">Move</span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-1 p-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-full"
                                                onClick={(e) => { e.stopPropagation(); handleReorder(canvas.id, 'top') }}
                                                title="Move to Top"
                                            >
                                                <ChevronsUp className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-full"
                                                onClick={(e) => { e.stopPropagation(); handleReorder(canvas.id, 'up') }}
                                                title="Move Up"
                                            >
                                                <ArrowUp className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-full"
                                                onClick={(e) => { e.stopPropagation(); handleReorder(canvas.id, 'down') }}
                                                title="Move Down"
                                            >
                                                <ArrowDown className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-full"
                                                onClick={(e) => { e.stopPropagation(); handleReorder(canvas.id, 'bottom') }}
                                                title="Move to Bottom"
                                            >
                                                <ChevronsDown className="h-3 w-3" />
                                            </Button>
                                        </div>
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

            <AlertDialog
                open={showBatchDeleteConfirm}
                onOpenChange={(open) =>
                    !open && setShowBatchDeleteConfirm(false)
                }
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {selectedIds.size} canvases?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. These canvases and all their contents will be permanently deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Delete All
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
