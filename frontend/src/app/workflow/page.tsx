"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Activity, MoreHorizontal, Pencil, Trash2, ExternalLink, Search } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { API_URL } from "@/lib/utils"
import { WorkflowEditor } from "@/components/workflow-editor"

export interface TemplateItem {
    id: string
    name: string
    description: string | null
    bpmn_json: any
    created_at?: string // Assuming there might be a created_at field, if not we ignore it
}

export default function WorkflowPage() {
    const [workflows, setWorkflows] = useState<TemplateItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // Editor State
    const [isEditing, setIsEditing] = useState(false)
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    // Delete dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [workflowToDelete, setWorkflowToDelete] = useState<TemplateItem | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Rename dialog state
    const [renameDialogOpen, setRenameDialogOpen] = useState(false)
    const [workflowToRename, setWorkflowToRename] = useState<TemplateItem | null>(null)
    const [newName, setNewName] = useState("")
    const [isRenaming, setIsRenaming] = useState(false)

    const fetchWorkflows = useCallback(async () => {
        setIsLoading(true)
        const token = localStorage.getItem("token")
        if (!token) return

        try {
            const res = await fetch(`${API_URL}/workflows/templates`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })
            if (res.ok) {
                const data = await res.json()
                setWorkflows(data)
            }
        } catch (error) {
            console.error("Failed to fetch workflows", error)
        } finally {
            setIsLoading(false)
        }
    }, [refreshKey])

    useEffect(() => {
        fetchWorkflows()
    }, [fetchWorkflows])

    const filteredWorkflows = workflows.filter(wf =>
        wf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (wf.description && wf.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    const handleCreateWorkflow = () => {
        setSelectedWorkflowId(null) // null means new
        setIsEditing(true)
    }

    const handleEditWorkflow = (workflow: TemplateItem) => {
        setSelectedWorkflowId(workflow.id)
        setIsEditing(true)
    }

    const handleBackToGrid = () => {
        setIsEditing(false)
        setSelectedWorkflowId(null)
        setRefreshKey(prev => prev + 1) // Refresh in case they saved
    }

    const handleDeleteConfirm = async () => {
        if (!workflowToDelete) return
        setIsDeleting(true)
        try {
            const token = localStorage.getItem("token")
            const response = await fetch(`${API_URL}/workflows/templates/${workflowToDelete.id}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            })

            if (response.ok) {
                setRefreshKey(prev => prev + 1)
                setDeleteDialogOpen(false)
                setWorkflowToDelete(null)
            } else {
                console.error("Failed to delete workflow")
            }
        } catch (error) {
            console.error("Error deleting workflow:", error)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleRename = async () => {
        if (!workflowToRename || !newName.trim()) return

        setIsRenaming(true)
        try {
            const token = localStorage.getItem("token")
            // Fetch the existing data to preserve bpmn_json etc
            const getRes = await fetch(`${API_URL}/workflows/templates/${workflowToRename.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (!getRes.ok) throw new Error("Could not fetch workflow data for rename")
            const workflowData = await getRes.json()
            
            // Put updated name
            const putRes = await fetch(`${API_URL}/workflows/templates/${workflowToRename.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ ...workflowData, name: newName.trim() }),
            })

            if (putRes.ok) {
                setRefreshKey(prev => prev + 1)
                setRenameDialogOpen(false)
                setWorkflowToRename(null)
                setNewName("")
            } else {
                console.error("Failed to rename workflow")
            }
        } catch (err) {
            console.error("Rename error:", err)
        } finally {
            setIsRenaming(false)
        }
    }

    if (isEditing) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
                <WorkflowEditor initialWorkflowId={selectedWorkflowId} onBack={handleBackToGrid} />
            </main>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 w-full overflow-y-auto">
            <div className="container mx-auto py-8 px-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            My Workflows
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Manage and deploy your automated processes
                        </p>
                    </div>
                    <Button
                        onClick={handleCreateWorkflow}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shrink-0"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Workflow
                    </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search workflows..."
                            className="pl-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : filteredWorkflows.length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                            <Activity className="h-8 w-8 text-slate-500" />
                        </div>
                        <h3 className="text-lg font-medium mb-2">No workflows found</h3>
                        <p className="text-muted-foreground mb-6">
                            {searchQuery ? "Try adjusting your search" : "Create your first workflow to get started"}
                        </p>
                        {!searchQuery && (
                            <Button onClick={handleCreateWorkflow} variant="outline">
                                <Plus className="h-4 w-4 mr-2" />
                                Create Workflow
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredWorkflows.map(wf => (
                            <Card
                                key={wf.id}
                                className="group hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer flex flex-col"
                                onClick={() => handleEditWorkflow(wf)}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                                <Activity className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{wf.name}</CardTitle>
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenuItem onClick={() => handleEditWorkflow(wf)}>
                                                    <ExternalLink className="h-4 w-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { setWorkflowToRename(wf); setNewName(wf.name); setRenameDialogOpen(true); }}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { setWorkflowToDelete(wf); setDeleteDialogOpen(true); }} className="text-red-600 focus:text-red-600">
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1">
                                    <CardDescription className="line-clamp-2">
                                        {wf.description || "No description"}
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{workflowToDelete?.name}"?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Workflow</DialogTitle>
                        <DialogDescription>
                            Enter a new name for your workflow.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Workflow name"
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
    )
}
