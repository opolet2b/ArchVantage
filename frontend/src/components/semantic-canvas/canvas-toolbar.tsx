/**
 * Canvas Toolbar
 *
 * Floating toolbar for adding things to the canvas.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import {
    Plus,
    Type,
    MessageSquare,
    FileText,
    Image,
    Link,
    FolderOpen,
    Import,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCanvasStore, ThingType } from "./canvas-store";
import { useConversation } from "@/lib/conversation-context";
import { useViewMode } from "@/lib/view-mode-context";
import { cn } from "@/lib/utils";

// =============================================================================
// Canvas Toolbar Component
// =============================================================================

export function CanvasToolbar() {
    const { addThing, addDomain, viewport } = useCanvasStore();
    const { conversations, createNewConversation, setActiveConversationId } = useConversation();
    const { setViewMode } = useViewMode();

    // Dialog states
    const [showTextDialog, setShowTextDialog] = React.useState(false);
    const [showDomainDialog, setShowDomainDialog] = React.useState(false);
    const [showUrlDialog, setShowUrlDialog] = React.useState(false);
    const [showConversationDialog, setShowConversationDialog] = React.useState(false);

    // Form states
    const [textContent, setTextContent] = React.useState("");
    const [domainName, setDomainName] = React.useState("");
    const [urlContent, setUrlContent] = React.useState("");
    const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(null);

    // File input refs
    const imageInputRef = React.useRef<HTMLInputElement>(null);
    const documentInputRef = React.useRef<HTMLInputElement>(null);

    // Calculate center position for new items
    const getCenterPosition = () => ({
        x: -viewport.x + 400,
        y: -viewport.y + 300,
    });

    // Add text note
    const handleAddText = async () => {
        if (!textContent.trim()) return;

        await addThing(
            "text",
            { text: textContent },
            getCenterPosition(),
            textContent.slice(0, 30)
        );

        setTextContent("");
        setShowTextDialog(false);
    };

    // Add URL
    const handleAddUrl = async () => {
        if (!urlContent.trim()) return;

        await addThing(
            "url",
            { url: urlContent },
            getCenterPosition(),
            urlContent.slice(0, 50)
        );

        setUrlContent("");
        setShowUrlDialog(false);
    };

    // Add domain
    const handleAddDomain = async () => {
        if (!domainName.trim()) return;

        await addDomain(
            domainName,
            getCenterPosition()
        );

        setDomainName("");
        setShowDomainDialog(false);
    };

    // Create new conversation and add to canvas
    const handleNewConversation = async () => {
        // Create new conversation
        const newConvId = await createNewConversation();

        if (newConvId) {
            // Add to canvas as a conversation thing
            await addThing(
                "conversation",
                {
                    conversation_id: newConvId,
                    messages: [],
                },
                getCenterPosition(),
                "New Conversation"
            );

            // Switch to chat mode with the new conversation active
            setActiveConversationId(newConvId);
            setViewMode("chat");
        }
    };

    // Add existing conversation to canvas
    const handleAddExistingConversation = async () => {
        if (!selectedConversationId) return;

        const conversation = conversations.find(c => c.id === selectedConversationId);
        if (!conversation) return;

        await addThing(
            "conversation",
            {
                conversation_id: conversation.id,
                messages: conversation.messages || [],
            },
            getCenterPosition(),
            conversation.title || "Conversation"
        );

        setSelectedConversationId(null);
        setShowConversationDialog(false);
    };

    // Handle file drop
    const handleFileDrop = React.useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);

            for (const file of files) {
                const position = {
                    x: e.clientX - viewport.x,
                    y: e.clientY - viewport.y,
                };

                if (file.type.startsWith("image/")) {
                    // TODO: Upload to backend and get URL
                    await addThing(
                        "image",
                        {
                            filename: file.name,
                            file_path: URL.createObjectURL(file),
                        },
                        position,
                        file.name
                    );
                } else {
                    // Read text content for documents
                    const text = await file.text();
                    await addThing(
                        "document",
                        {
                            filename: file.name,
                            content: text,
                        },
                        position,
                        file.name
                    );
                }
            }
        },
        [addThing, viewport]
    );

    // Handle file selection from file picker
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
            if (file.type.startsWith("image/")) {
                await addThing(
                    "image",
                    {
                        filename: file.name,
                        file_path: URL.createObjectURL(file),
                    },
                    getCenterPosition(),
                    file.name
                );
            }
        }
        // Reset input so same file can be selected again
        if (e.target) e.target.value = "";
    };

    const handleDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
            // Determine if file is text-based or binary
            const textExtensions = ['.txt', '.md', '.json', '.csv', '.xml', '.html', '.htm', '.yaml', '.yml', '.log'];
            const isTextFile = textExtensions.some(ext => file.name.toLowerCase().endsWith(ext)) ||
                file.type.startsWith('text/') ||
                file.type === 'application/json';

            if (isTextFile) {
                // Read text content for text-based documents
                try {
                    const text = await file.text();
                    await addThing(
                        "document",
                        {
                            filename: file.name,
                            content: text,
                        },
                        getCenterPosition(),
                        file.name
                    );
                } catch (err) {
                    console.error("Failed to read file as text:", file.name, err);
                }
            } else {
                // For binary files (PDF, Excel, Word), store as blob URL
                await addThing(
                    "document",
                    {
                        filename: file.name,
                        file_path: URL.createObjectURL(file),
                        file_type: file.type,
                        file_size: file.size,
                    },
                    getCenterPosition(),
                    file.name
                );
            }
        }
        // Reset input so same file can be selected again
        if (e.target) e.target.value = "";
    };

    return (
        <>
            {/* Floating Add Button */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="lg"
                            className="rounded-full shadow-lg h-14 w-14"
                        >
                            <Plus className="h-6 w-6" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-56">
                        <DropdownMenuLabel>Add to Canvas</DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        {/* Conversation options */}
                        <DropdownMenuItem onClick={handleNewConversation}>
                            <MessageSquare className="mr-2 h-4 w-4" />
                            New Conversation
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => setShowConversationDialog(true)}>
                            <Import className="mr-2 h-4 w-4" />
                            Import Conversation
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={() => setShowTextDialog(true)}>
                            <Type className="mr-2 h-4 w-4" />
                            Text Note
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => setShowUrlDialog(true)}>
                            <Link className="mr-2 h-4 w-4" />
                            URL / Bookmark
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
                            <FileText className="mr-2 h-4 w-4" />
                            Document
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                            <Image className="mr-2 h-4 w-4" />
                            Image
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={() => setShowDomainDialog(true)}>
                            <FolderOpen className="mr-2 h-4 w-4" />
                            New Domain
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Hidden file inputs */}
                <input
                    type="file"
                    ref={imageInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                    multiple
                />
                <input
                    type="file"
                    ref={documentInputRef}
                    accept=".txt,.md,.json,.csv,.xml,.html,.pdf,.doc,.docx"
                    className="hidden"
                    onChange={handleDocumentSelect}
                    multiple
                />
            </div>

            {/* Text Dialog */}
            <Dialog open={showTextDialog} onOpenChange={setShowTextDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Text Note</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Textarea
                            value={textContent}
                            onChange={(e) => setTextContent(e.target.value)}
                            placeholder="Enter your text..."
                            rows={5}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowTextDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleAddText}>Add</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* URL Dialog */}
            <Dialog open={showUrlDialog} onOpenChange={setShowUrlDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add URL</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>URL</Label>
                            <Input
                                value={urlContent}
                                onChange={(e) => setUrlContent(e.target.value)}
                                placeholder="https://..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowUrlDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleAddUrl}>Add</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Domain Dialog */}
            <Dialog open={showDomainDialog} onOpenChange={setShowDomainDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Domain</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Domain Name</Label>
                            <Input
                                value={domainName}
                                onChange={(e) => setDomainName(e.target.value)}
                                placeholder="Research, Projects, Ideas..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowDomainDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleAddDomain}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import Conversation Dialog */}
            <Dialog open={showConversationDialog} onOpenChange={setShowConversationDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Import Conversation</DialogTitle>
                        <DialogDescription>
                            Select a conversation to add to your canvas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4 max-h-[300px] overflow-y-auto">
                        {conversations.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                No conversations yet. Start chatting first!
                            </div>
                        ) : (
                            conversations.map((conv) => (
                                <div
                                    key={conv.id}
                                    className={cn(
                                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                                        "hover:bg-slate-100 dark:hover:bg-slate-800",
                                        selectedConversationId === conv.id && "bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500"
                                    )}
                                    onClick={() => setSelectedConversationId(conv.id)}
                                >
                                    <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{conv.title}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {conv.messages?.length || 0} messages
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSelectedConversationId(null);
                                setShowConversationDialog(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAddExistingConversation}
                            disabled={!selectedConversationId}
                        >
                            Add to Canvas
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

