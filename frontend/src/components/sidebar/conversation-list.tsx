"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useConversation } from "@/lib/conversation-context"
import { MessageSquare, MoreVertical, Trash2, Edit2, Download, FileText, CheckSquare, X, ListChecks, Archive, Upload, RotateCcw, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Plus } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog"
import { DocumentManager } from "./document-manager"

export function ConversationList() {
    const router = useRouter()
    const {
        conversations,
        activeConversationId,
        setActiveConversationId,
        deleteConversation,
        updateConversationTitle,
        viewMode,
        setViewMode,
        archiveConversation,
        restoreConversation,
        importConversations,
        reorderConversations,
        createNewConversation
    } = useConversation()

    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState("")
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [manageDocsId, setManageDocsId] = useState<string | null>(null)
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus()
        }
    }, [editingId])

    const handleRename = (id: string, currentTitle: string) => {
        setEditingId(id)
        setEditTitle(currentTitle)
    }

    const submitRename = async () => {
        if (editingId && editTitle.trim()) {
            await updateConversationTitle(editingId, editTitle)
            setEditingId(null)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            submitRename()
        } else if (e.key === "Escape") {
            setEditingId(null)
        }
    }

    const handleExport = (conv: any) => {
        const text = conv.messages.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")
        const blob = new Blob([text], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${conv.title}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode)
        setSelectedIds(new Set())
    }

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) {
            next.delete(id)
        } else {
            next.add(id)
        }
        setSelectedIds(next)
    }

    const handleSelectAll = () => {
        if (selectedIds.size === conversations.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(conversations.map(c => c.id)))
        }
    }

    const confirmDelete = async () => {
        if (showBatchDeleteConfirm) {
            const ids = Array.from(selectedIds)
            await Promise.all(ids.map(id => deleteConversation(id)))
            setSelectedIds(new Set())
            setIsSelectionMode(false)
            setShowBatchDeleteConfirm(false)
        } else if (deleteId) {
            await deleteConversation(deleteId)
            setDeleteId(null)
        }
    }

    const handleBatchExport = () => {
        const selectedConvs = conversations.filter(c => selectedIds.has(c.id))
        if (selectedConvs.length === 0) return

        const dataStr = JSON.stringify(selectedConvs, null, 2)
        const blob = new Blob([dataStr], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `conversations_export_${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setIsSelectionMode(false)
        setSelectedIds(new Set())
    }

    const handleBatchArchive = async () => {
        const ids = Array.from(selectedIds)
        await Promise.all(ids.map(id => archiveConversation(id)))
        setIsSelectionMode(false)
        setSelectedIds(new Set())
    }

    const handleBatchRestore = async () => {
        const ids = Array.from(selectedIds)
        await Promise.all(ids.map(id => restoreConversation(id)))
        setIsSelectionMode(false)
        setSelectedIds(new Set())
    }

    const handleImportClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target?.result as string)
                if (Array.isArray(data)) {
                    await importConversations(data)
                } else {
                    // Handle single conversation object
                    await importConversations([data])
                }
            } catch (err) {
                console.error("Failed to parse import file", err)
            }
        }
        reader.readAsText(file)
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const handleReorder = async (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
        const currentIndex = conversations.findIndex(c => c.id === id)
        if (currentIndex === -1) return

        const newConversations = [...conversations]
        const item = newConversations[currentIndex]

        // Remove item from current position
        newConversations.splice(currentIndex, 1)

        // Insert at new position
        if (direction === 'top') {
            newConversations.unshift(item)
        } else if (direction === 'bottom') {
            newConversations.push(item)
        } else if (direction === 'up') {
            const newIndex = Math.max(0, currentIndex - 1)
            newConversations.splice(newIndex, 0, item)
        } else if (direction === 'down') {
            const newIndex = Math.min(newConversations.length, currentIndex + 1)
            newConversations.splice(newIndex, 0, item)
        }

        // Generate updates: assign index 0..N
        const updates = newConversations.map((c, index) => ({
            id: c.id,
            position: index
        }))

        await reorderConversations(updates)
    }

    return (
        <>
            <div className="flex flex-col h-full w-full">

                <div className="flex items-center justify-between px-2 mb-2 pt-4 shrink-0">
                    <div className="text-xs font-semibold text-muted-foreground">History</div>
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
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => createNewConversation()}
                            title="New Conversation"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                        {!isSelectionMode ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={handleImportClick}
                                    title="Import Conversations"
                                >
                                    <Upload className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={toggleSelectionMode}
                                    title="Select conversations"
                                >
                                    <ListChecks className="h-3.5 w-3.5" />
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
                                    onClick={() => selectedIds.size > 0 && setShowBatchDeleteConfirm(true)}
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
                {isSelectionMode && conversations.length > 0 && (
                    <div className="px-2 mb-2 flex items-center gap-2">
                        <Checkbox
                            checked={selectedIds.size === conversations.length && conversations.length > 0}
                            onCheckedChange={handleSelectAll}
                        />
                        <span className="text-xs text-muted-foreground">Select All ({selectedIds.size}/{conversations.length})</span>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto min-h-0 px-2 flex flex-col gap-1 pb-2">
                    {conversations.map((conv) => (
                        <div
                            key={conv.id}
                            className={cn(
                                "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
                                activeConversationId === conv.id && "bg-accent text-accent-foreground"
                            )}
                            onClick={() => {
                                setActiveConversationId(conv.id)
                                router.push("/")
                            }}
                        >
                            {isSelectionMode && (
                                <Checkbox
                                    checked={selectedIds.has(conv.id)}
                                    onCheckedChange={() => toggleSelection(conv.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mr-2"
                                />
                            )}
                            <MessageSquare className="h-4 w-4 shrink-0" />
                            {editingId === conv.id ? (
                                <Input
                                    ref={inputRef}
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    onBlur={submitRename}
                                    onKeyDown={handleKeyDown}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-6 text-xs px-1 py-0"
                                />
                            ) : (
                                <span className="truncate flex-1 text-left">{conv.title}</span>
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
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRename(conv.id, conv.title) }}>
                                        <Edit2 className="mr-2 h-3 w-3" /> Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setManageDocsId(conv.id) }}>
                                        <FileText className="mr-2 h-3 w-3" /> Manage Documents
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExport(conv) }}>
                                        <Download className="mr-2 h-3 w-3" /> Export
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setDeleteId(conv.id)
                                        }}
                                    >
                                        <Trash2 className="mr-2 h-3 w-3" /> Delete
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
                                            onClick={(e) => { e.stopPropagation(); handleReorder(conv.id, 'top') }}
                                            title="Move to Top"
                                        >
                                            <ChevronsUp className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-full"
                                            onClick={(e) => { e.stopPropagation(); handleReorder(conv.id, 'up') }}
                                            title="Move Up"
                                        >
                                            <ArrowUp className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-full"
                                            onClick={(e) => { e.stopPropagation(); handleReorder(conv.id, 'down') }}
                                            title="Move Down"
                                        >
                                            <ArrowDown className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-full"
                                            onClick={(e) => { e.stopPropagation(); handleReorder(conv.id, 'bottom') }}
                                            title="Move to Bottom"
                                        >
                                            <ChevronsDown className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ))}
                </div>
            </div>

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {showBatchDeleteConfirm
                                ? `This action cannot be undone. This will permanently delete ${selectedIds.size} conversations.`
                                : "This action cannot be undone. This will permanently delete the conversation."
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showBatchDeleteConfirm} onOpenChange={(open) => !open && setShowBatchDeleteConfirm(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedIds.size} conversations?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. These conversations will be permanently deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete All</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {
                manageDocsId && (
                    <DocumentManager
                        isOpen={!!manageDocsId}
                        onClose={() => setManageDocsId(null)}
                        conversationId={manageDocsId}
                    />
                )
            }
        </>
    )
}
