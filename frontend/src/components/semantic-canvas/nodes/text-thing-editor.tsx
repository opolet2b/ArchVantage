"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Pencil, Save, Minimize2, Maximize2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownToolbar } from "../viewers/markdown-toolbar";
import { CanvasThing, useCanvasStore } from "../canvas-store";
import { useToast } from "@/components/ui/use-toast";

interface TextThingEditorProps {
    thing: CanvasThing;
    isOpen: boolean;
    onClose: () => void;
    onSave: (newContent: string) => Promise<void>;
    isTrulyFullscreen: boolean;
    setIsTrulyFullscreen: (val: boolean) => void;
}

/**
 * Isolated Text Editor component to prevent ThingNode re-renders on every keystroke.
 */
export function TextThingEditor({
    thing,
    isOpen,
    onClose,
    onSave,
    isTrulyFullscreen,
    setIsTrulyFullscreen
}: TextThingEditorProps) {
    const [editedContent, setEditedContent] = React.useState("");
    const [isSaving, setIsSaving] = React.useState(false);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const { toast } = useToast();

    // Initialize content when opened
    React.useEffect(() => {
        if (isOpen) {
            const initialContent = (thing.content.text as string) || (thing.content.content as string) || "";
            setEditedContent(initialContent);
        }
    }, [isOpen, thing.content]);

    // ESC key listener for Truly Fullscreen Editor
    React.useEffect(() => {
        if (!isOpen || !isTrulyFullscreen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsTrulyFullscreen(false);
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, isTrulyFullscreen, setIsTrulyFullscreen, onClose]);

    const handleInternalSave = async () => {
        setIsSaving(true);
        try {
            await onSave(editedContent);
            onClose();
        } catch (error) {
            console.error("Failed to save content", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTextareaDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const data = e.dataTransfer.getData("application/reactflow/node");
        if (!data) return;

        try {
            const nodeData = JSON.parse(data);
            const droppedNodeId = nodeData.id;

            if (droppedNodeId === thing.id) {
                toast({ title: "Cannot transclude self", variant: "destructive" });
                return;
            }

            const textarea = e.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;

            const transclusionTag = `{{node:${droppedNodeId}}}`;
            const newText = text.substring(0, start) + transclusionTag + text.substring(end);

            setEditedContent(newText);

            setTimeout(() => {
                textarea.focus();
                const newCursorPos = start + transclusionTag.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);

            toast({
                title: "Node Transcluded",
                description: "Reference inserted at cursor.",
            });
        } catch (err) {
            console.error("Failed to parse dropped node data", err);
        }
    };

    const handleTextareaClick = () => {
        const ghostId = useCanvasStore.getState().transclusionGhostId;
        if (ghostId) {
            if (ghostId === thing.id) {
                toast({ title: "Cannot transclude self", variant: "destructive", duration: 2000 });
                useCanvasStore.getState().setTransclusionGhostId(null);
                return;
            }

            setTimeout(() => {
                const active = textareaRef.current;
                if (active) {
                    const start = active.selectionStart;
                    const end = active.selectionEnd;
                    const tag = `{{node:${ghostId}}}`;
                    const newText = editedContent.substring(0, start) + tag + editedContent.substring(end);

                    setEditedContent(newText);
                    useCanvasStore.getState().setTransclusionGhostId(null);
                    toast({ title: "Transclusion Inserted", description: "Linked content placed at cursor." });
                }
            }, 10);
        }
    };

    if (!isOpen) return null;

    const editorBody = (
        <div className="flex flex-col h-full">
            <MarkdownToolbar
                textareaRef={textareaRef}
                onSave={handleInternalSave}
                className="flex-none shadow-sm"
            />
            <div className="flex-1 min-h-0 p-6 bg-slate-50/30 dark:bg-slate-900/10 overflow-hidden">
                <Textarea
                    ref={textareaRef}
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full h-full font-mono text-base resize-none bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus-visible:ring-1 p-6 shadow-inner leading-relaxed"
                    placeholder="Type your content here..."
                    autoFocus
                    onDrop={handleTextareaDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={handleTextareaClick}
                    style={{
                        cursor: useCanvasStore.getState().transclusionGhostId ? "copy" : "text"
                    }}
                />
            </div>
            <div className="p-3 border-t bg-slate-50 dark:bg-slate-900 flex justify-between items-center text-xs text-muted-foreground flex-none">
                <div className="flex gap-4">
                    <span>Markdown Supported</span>
                    <span>•</span>
                    <span>{editedContent.length} characters</span>
                </div>
                <div className="flex gap-2 items-center">
                    <kbd className="px-1.5 py-0.5 rounded border bg-white dark:bg-slate-800 text-[10px]">ESC</kbd>
                    <span>to close</span>
                </div>
            </div>
        </div>
    );

    if (isTrulyFullscreen) {
        return typeof document !== "undefined" ? createPortal(
            <div className="fixed inset-0 z-[110] bg-white dark:bg-slate-950 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b bg-slate-50 dark:bg-slate-900 flex-none px-6 shadow-sm">
                    <div className="flex items-center gap-3">
                        <Pencil className="h-5 w-5 text-blue-500" />
                        <h2 className="text-xl font-bold truncate">
                            Editing: {thing.title || "Text Thing"}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsTrulyFullscreen(false)}
                            title="Exit Truly Fullscreen"
                            className="h-8 gap-2 mr-2"
                        >
                            <Minimize2 className="h-4 w-4" />
                            <span>Exit Full Screen</span>
                        </Button>
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-2" />
                        <Button variant="outline" size="sm" onClick={onClose} className="h-8">
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleInternalSave}
                            disabled={isSaving}
                            className="h-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save
                        </Button>
                    </div>
                </div>
                {editorBody}
            </div>,
            document.body
        ) : null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) onClose();
        }}>
            <DialogContent className="max-w-[80vw] w-full h-[85vh] flex flex-col p-0 overflow-hidden bg-white dark:bg-slate-950 border-none shadow-2xl rounded-lg">
                <DialogHeader className="p-4 border-b bg-slate-50 dark:bg-slate-900 flex-none">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                <Pencil className="h-5 w-5 text-blue-500" />
                                Editing: {thing.title || "Text Thing"}
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                Edit content with markdown. Transclude other nodes.
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsTrulyFullscreen(true)}
                                title="Maximize to Truly Fullscreen"
                                className="h-8 w-8 text-slate-500 hover:text-blue-500"
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />
                            <Button variant="outline" size="sm" onClick={onClose} className="h-8">
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleInternalSave}
                                disabled={isSaving}
                                className="h-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save
                            </Button>
                        </div>
                    </div>
                </DialogHeader>
                {editorBody}
            </DialogContent>
        </Dialog>
    );
}
