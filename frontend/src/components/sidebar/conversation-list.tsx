"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useConversation } from "@/lib/conversation-context"
import { MessageSquare, MoreVertical, Trash2, Edit2, Download, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
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
        updateConversationTitle
    } = useConversation()

    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState("")
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [manageDocsId, setManageDocsId] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

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

    const confirmDelete = async () => {
        if (deleteId) {
            await deleteConversation(deleteId)
            setDeleteId(null)
        }
    }

    return (
        <>
            <div className="flex flex-col gap-2 px-2 py-4 w-full">
                <div className="text-xs font-semibold text-muted-foreground px-2 mb-2">History</div>
                <div className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-200px)]">
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
                            This action cannot be undone. This will permanently delete the conversation.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {manageDocsId && (
                <DocumentManager
                    isOpen={!!manageDocsId}
                    onClose={() => setManageDocsId(null)}
                    conversationId={manageDocsId}
                />
            )}
        </>
    )
}
