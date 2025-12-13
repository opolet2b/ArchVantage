"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Trash2, Eye, Upload, Loader2 } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { uploadFile, UploadProgress } from "@/lib/upload-service"
import { cn, API_URL } from "@/lib/utils"

interface DocumentManagerProps {
    isOpen: boolean
    onClose: () => void
    conversationId: string
}

export function DocumentManager({ isOpen, onClose, conversationId }: DocumentManagerProps) {
    const [documents, setDocuments] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [viewContent, setViewContent] = useState<string | null>(null)
    const [viewFilename, setViewFilename] = useState<string | null>(null)
    const [deleteFilename, setDeleteFilename] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const fetchDocuments = async () => {
        setIsLoading(true)
        try {
            const res = await fetch(`${API_URL}/rag/documents/${conversationId}`)
            if (res.ok) {
                const data = await res.json()
                setDocuments(data.documents || [])
            }
        } catch (error) {
            console.error("Failed to fetch documents", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (isOpen && conversationId) {
            fetchDocuments()
        }
    }, [isOpen, conversationId])

    const handleView = async (filename: string) => {
        try {
            const res = await fetch(`${API_URL}/rag/documents/${conversationId}/${filename}`)
            if (res.ok) {
                const data = await res.json()
                setViewContent(data.content)
                setViewFilename(filename)
            }
        } catch (error) {
            console.error("Failed to fetch document content", error)
        }
    }

    const handleDelete = async () => {
        if (!deleteFilename) return

        try {
            const res = await fetch(`${API_URL}/rag/documents/${conversationId}/${deleteFilename}`, {
                method: "DELETE"
            })
            if (res.ok) {
                await fetchDocuments()
                setDeleteFilename(null)
                if (viewFilename === deleteFilename) {
                    setViewContent(null)
                    setViewFilename(null)
                }
            }
        } catch (error) {
            console.error("Failed to delete document", error)
        }
    }

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        setUploadProgress({ loaded: 0, total: file.size, percentage: 0, status: 'uploading' })

        try {
            await uploadFile(
                `${API_URL}/rag/upload/${conversationId}`,
                file,
                (progress) => {
                    setUploadProgress(progress)
                }
            )

            await fetchDocuments()
        } catch (error) {
            console.error("Upload error:", error)
            alert(error instanceof Error ? error.message : "Upload failed")
        } finally {
            setIsUploading(false)
            setUploadProgress(null)
            if (fileInputRef.current) {
                fileInputRef.current.value = ""
            }
        }
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Manage Documents</DialogTitle>
                        <DialogDescription>
                            View and manage documents attached to this conversation.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex gap-4 flex-1 overflow-hidden">
                        <div className="w-1/3 flex flex-col gap-2 border-r pr-4">
                            <div className="flex flex-col gap-2 mb-2">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-semibold text-sm">Files</h3>
                                    <input
                                        type="file"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleUpload}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-2"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                    >
                                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    </Button>
                                </div>

                                {isUploading && uploadProgress && (
                                    <div className="bg-slate-100 dark:bg-slate-800 rounded-md p-2 text-xs space-y-1">
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>{uploadProgress.status === 'processing' ? 'Ingesting...' : 'Uploading...'}</span>
                                            <span>{uploadProgress.percentage}%</span>
                                        </div>
                                        <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full bg-blue-600 transition-all duration-300",
                                                    uploadProgress.status === 'processing' && "animate-pulse"
                                                )}
                                                style={{ width: `${uploadProgress.percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <ScrollArea className="flex-1">
                                {isLoading ? (
                                    <div className="flex justify-center p-4">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : documents.length === 0 ? (
                                    <div className="text-sm text-muted-foreground text-center p-4">
                                        No documents found.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {documents.map((doc) => (
                                            <div
                                                key={doc}
                                                className={`flex items-center justify-between p-2 rounded-md text-sm hover:bg-accent cursor-pointer ${viewFilename === doc ? "bg-accent" : ""}`}
                                                onClick={() => handleView(doc)}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <FileText className="h-4 w-4 shrink-0" />
                                                    <span className="truncate">{doc}</span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-red-600"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setDeleteFilename(doc)
                                                    }}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>

                        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 rounded-md p-4">
                            {viewContent ? (
                                <>
                                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                                        <h3 className="font-semibold">{viewFilename}</h3>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-muted-foreground hover:text-red-600"
                                            onClick={() => viewFilename && setDeleteFilename(viewFilename)}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete
                                        </Button>
                                    </div>
                                    <ScrollArea className="flex-1">
                                        <pre className="text-sm whitespace-pre-wrap font-mono">{viewContent}</pre>
                                    </ScrollArea>
                                </>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                    <div className="text-center">
                                        <Eye className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                        <p>Select a document to view content</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteFilename} onOpenChange={(open) => !open && setDeleteFilename(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Document?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{deleteFilename}"? This will remove the file and its embeddings from the knowledge base.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
