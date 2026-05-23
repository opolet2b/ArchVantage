"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ToolEditor } from "@/components/tools/tool-editor"
import { GUIToolEditor } from "@/components/tools/gui-tool-editor"
import { ToolCreationWizard } from "@/components/tools/tool-creation-wizard"
import { API_URL } from "@/lib/utils"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { FormBuilder } from "@/components/tools/form-builder"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Wrench, Filter, FormInput, MoreHorizontal, Pencil, Trash2, ChevronLeft, ExternalLink } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
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
import { Label } from "@/components/ui/label"
import { HelpTooltip } from "@/components/ui/help-tooltip"

// Interfaces
export interface ToolPermission {
    id?: number
    tool_id?: number
    user_id?: number
    ad_group_id?: number
    permission_level: "READ" | "READ_WRITE"
}

export interface Category {
    id: number
    name: string
    description?: string
}

export interface Tool {
    id: number
    name: string
    description: string
    tool_type?: "mcp" | "gui"
    category_id: number
    is_public: boolean
    configuration: any
    system_prompt: string
    permissions?: ToolPermission[]
    category?: Category
}

export default function ToolsPage() {
    const [tools, setTools] = useState<Tool[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all")
    const [isLoading, setIsLoading] = useState(true)

    // Dirty state management
    const [isDirty, setIsDirty] = useState(false)
    const [pendingTool, setPendingTool] = useState<Tool | null>(null)
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
    const [triggerSave, setTriggerSave] = useState(false)

    // Original State
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [showWizard, setShowWizard] = useState(false)
    const [newToolType, setNewToolType] = useState<"mcp" | "gui">("mcp")
    const [refreshKey, setRefreshKey] = useState(0)

    // Delete dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [toolToDelete, setToolToDelete] = useState<Tool | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Rename dialog state
    const [renameDialogOpen, setRenameDialogOpen] = useState(false)
    const [toolToRename, setToolToRename] = useState<Tool | null>(null)
    const [newName, setNewName] = useState("")
    const [isRenaming, setIsRenaming] = useState(false)

    const fetchTools = useCallback(async () => {
        setIsLoading(true)
        try {
            let url = `${API_URL}/tools`
            if (selectedCategoryId && selectedCategoryId !== "all") {
                url += `?category_id=${selectedCategoryId}`
            }

            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                }
            })
            if (response.ok) {
                const data = await response.json()
                setTools(data)
            }
        } catch (error) {
            console.error("Failed to fetch tools", error)
        } finally {
            setIsLoading(false)
        }
    }, [refreshKey, selectedCategoryId])

    const fetchCategories = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/categories`, {
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                }
            })
            if (response.ok) {
                const data = await response.json()
                setCategories(data)
            }
        } catch (error) {
            console.error("Failed to fetch categories", error)
        }
    }, [])

    useEffect(() => {
        fetchTools()
    }, [fetchTools])

    useEffect(() => {
        fetchCategories()
    }, [fetchCategories])

    const filteredTools = tools.filter(tool =>
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const getCategoryName = (tool: Tool): string | null => {
        if (tool.category) {
            return tool.category.name
        }
        if (tool.category_id) {
            const category = categories.find(c => c.id === tool.category_id)
            return category?.name || null
        }
        return null
    }

    const handleSelectTool = (tool: Tool) => {
        if (isDirty) {
            setPendingTool(tool)
            setShowUnsavedDialog(true)
        } else {
            setSelectedTool(tool)
            setIsCreating(false)
        }
    }

    const handleCreateTool = () => {
        if (isDirty) {
            if (!confirm("You have unsaved changes. Discard them?")) return
            setIsDirty(false)
        }
        setShowWizard(true)
    }

    const handleBack = () => {
        if (isDirty) {
            if (!confirm("You have unsaved changes. Discard them?")) return
            setIsDirty(false)
        }
        setSelectedTool(null)
        setIsCreating(false)
    }

    const handleDiscardChanges = () => {
        setIsDirty(false)
        setShowUnsavedDialog(false)
        if (pendingTool) {
            setSelectedTool(pendingTool)
            setPendingTool(null)
            setIsCreating(false)
        } else {
            setSelectedTool(null)
            setIsCreating(false)
        }
    }

    const handleSelectMCP = () => {
        setShowWizard(false)
        setSelectedTool(null)
        setNewToolType("mcp")
        setIsCreating(true)
    }

    const handleSelectGUI = () => {
        setShowWizard(false)
        setSelectedTool(null)
        setNewToolType("gui")
        setIsCreating(true)
    }

    const handleSaveTool = async (toolData: Partial<Tool>) => {
        try {
            const dataWithType = selectedTool
                ? toolData
                : { tool_type: newToolType, ...toolData }

            const url = selectedTool
                ? `${API_URL}/tools/${selectedTool.id}`
                : `${API_URL}/tools`

            const method = selectedTool ? "PUT" : "POST"

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(dataWithType)
            })

            if (response.ok) {
                const savedTool = await response.json()
                setRefreshKey(prev => prev + 1)
                if (isCreating) {
                    setIsCreating(false)
                    setSelectedTool(savedTool)
                }
                setIsDirty(false)

                if (pendingTool && triggerSave) {
                    setSelectedTool(pendingTool)
                    setPendingTool(null)
                    setTriggerSave(false)
                }
            } else {
                console.error("Failed to save tool")
                setTriggerSave(false)
            }
        } catch (error) {
            console.error("Error saving tool:", error)
            setTriggerSave(false)
        }
    }

    const handleDeleteToolConfirm = async () => {
        if (!toolToDelete) return
        setIsDeleting(true)
        try {
            const response = await fetch(`${API_URL}/tools/${toolToDelete.id}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                }
            })

            if (response.ok) {
                setRefreshKey(prev => prev + 1)
                setDeleteDialogOpen(false)
                setToolToDelete(null)
                if (selectedTool?.id === toolToDelete.id) {
                    setSelectedTool(null)
                }
            } else {
                console.error("Failed to delete tool")
            }
        } catch (error) {
            console.error("Error deleting tool:", error)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleRename = async () => {
        if (!toolToRename || !newName.trim()) return

        setIsRenaming(true)

        try {
            const res = await fetch(`${API_URL}/tools/${toolToRename.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({ ...toolToRename, name: newName.trim() }),
            })

            if (res.ok) {
                setRefreshKey(prev => prev + 1)
                setRenameDialogOpen(false)
                
                // If we're renaming the currently selected tool, update it locally
                if (selectedTool?.id === toolToRename.id) {
                    setSelectedTool(prev => prev ? { ...prev, name: newName.trim() } : prev)
                }
                
                setToolToRename(null)
                setNewName("")
            } else {
                console.error("Failed to rename tool")
            }
        } catch (err) {
            console.error("Rename error:", err)
        } finally {
            setIsRenaming(false)
        }
    }

    const isGUITool = selectedTool?.tool_type === "gui" || (!selectedTool && newToolType === "gui")

    const handleSaveForm = (config: any) => {
        const toolData: Partial<Tool> = {
            name: config.title,
            description: selectedTool?.description || `GUI Form: ${config.title}`,
            tool_type: "gui",
            configuration: config
        }
        handleSaveTool(toolData)
    }

    const renderEditor = () => {
        if (isGUITool) {
            return (
                <FormBuilder
                    key={selectedTool?.id || "new-gui"}
                    initialConfig={selectedTool?.configuration ? {
                        ...selectedTool.configuration,
                        title: selectedTool.name
                    } : undefined}
                    onSave={handleSaveForm}
                    onDirtyChange={setIsDirty}
                />
            )
        }

        return (
            <GUIToolEditor
                key={selectedTool?.id || "new"}
                tool={selectedTool}
                onSave={handleSaveTool}
                onDelete={(id) => {
                    const tool = tools.find(t => t.id === id)
                    if (tool) {
                        setToolToDelete(tool)
                        setDeleteDialogOpen(true)
                    }
                }}
                onDirtyChange={setIsDirty}
            />
        )
    }

    const renderGrid = () => (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 w-full overflow-y-auto">
            <div className="container mx-auto py-8 px-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            My Tools
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Manage and create tools for your agents
                        </p>
                    </div>
                    <Button
                        onClick={handleCreateTool}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shrink-0"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Tool
                    </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search tools..."
                            className="pl-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
                        <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {categories.map(category => (
                                    <SelectItem key={category.id} value={category.id.toString()}>
                                        {category.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : filteredTools.length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                            <Wrench className="h-8 w-8 text-slate-500" />
                        </div>
                        <h3 className="text-lg font-medium mb-2">No tools found</h3>
                        <p className="text-muted-foreground mb-6">
                            {searchQuery ? "Try adjusting your search or filters" : "Create your first tool to get started"}
                        </p>
                        {!searchQuery && (
                            <Button onClick={handleCreateTool} variant="outline">
                                <Plus className="h-4 w-4 mr-2" />
                                Create Tool
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredTools.map(tool => (
                            <Card
                                key={tool.id}
                                className="group hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer flex flex-col"
                                onClick={() => handleSelectTool(tool)}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${tool.tool_type === "gui" ? "bg-pink-100 dark:bg-pink-900/30" : "bg-primary/10"}`}>
                                                {tool.tool_type === "gui" ? (
                                                    <FormInput className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                                                ) : (
                                                    <Wrench className="h-5 w-5 text-primary" />
                                                )}
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{tool.name}</CardTitle>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    <Badge variant="outline" className={`text-[10px] px-1 h-5 ${tool.tool_type === "gui" ? "border-pink-300 text-pink-600 dark:border-pink-700 dark:text-pink-400" : "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"}`}>
                                                        {tool.tool_type === "gui" ? "GUI" : "MCP"}
                                                    </Badge>
                                                    {getCategoryName(tool) && (
                                                        <Badge variant="outline" className="text-[10px] px-1 h-5">
                                                            {getCategoryName(tool)}
                                                        </Badge>
                                                    )}
                                                    {tool.is_public && (
                                                        <Badge variant="secondary" className="text-[10px] px-1 h-5">
                                                            Public
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenuItem onClick={() => handleSelectTool(tool)}>
                                                    <ExternalLink className="h-4 w-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { setToolToRename(tool); setNewName(tool.name); setRenameDialogOpen(true); }}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { setToolToDelete(tool); setDeleteDialogOpen(true); }} className="text-red-600 focus:text-red-600">
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1">
                                    <CardDescription className="line-clamp-2">
                                        {tool.description || "No description"}
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )

    const renderEditorView = () => (
        <div className="flex flex-col h-full bg-background w-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center bg-white dark:bg-slate-950 shrink-0">
                <Button variant="ghost" onClick={handleBack} className="mr-4 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back to Tools
                </Button>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isGUITool ? "bg-pink-100 dark:bg-pink-900/30" : "bg-primary/10"}`}>
                        {isGUITool ? (
                            <FormInput className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                        ) : (
                            <Wrench className="h-4 w-4 text-primary" />
                        )}
                    </div>
                    <h2 className="text-xl font-semibold">
                        {isCreating ? 'Create Tool' : `Editing: ${selectedTool?.name}`}
                    </h2>
                </div>
            </div>
            <div className="flex-1 overflow-auto relative">
                {renderEditor()}
            </div>
        </div>
    )

    return (
        <div className="flex h-full w-full bg-background relative overflow-hidden">
            {(!selectedTool && !isCreating) ? renderGrid() : renderEditorView()}

            <ToolCreationWizard
                open={showWizard}
                onClose={() => setShowWizard(false)}
                onSelectMCP={handleSelectMCP}
                onSelectGUI={handleSelectGUI}
            />

            <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unsaved Changes</DialogTitle>
                        <DialogDescription>
                            You have unsaved changes. Do you want to save them before switching?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowUnsavedDialog(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDiscardChanges}>Discard</Button>
                        <Button onClick={() => {
                            const saveBtn = document.querySelector('button .lucide-save')?.closest('button') as HTMLButtonElement
                            if (saveBtn) {
                                setTriggerSave(true)
                                setShowUnsavedDialog(false)
                                saveBtn.click()
                            } else {
                                alert("Could not find save button. Please save manually.")
                                setShowUnsavedDialog(false)
                            }
                        }}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Tool</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{toolToDelete?.name}"?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteToolConfirm}
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
                        <DialogTitle>Rename Tool</DialogTitle>
                        <DialogDescription>
                            Enter a new name for your tool.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Tool name"
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
