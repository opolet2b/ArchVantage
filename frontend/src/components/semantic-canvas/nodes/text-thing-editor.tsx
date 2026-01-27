"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Pencil, Save, Minimize2, Maximize2, X, Loader2, Layout } from "lucide-react";
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
import { FileText, Type as TypeIcon } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TextThingEditorProps {
    thing: CanvasThing;
    isOpen?: boolean; // Optional for inline use
    onClose: () => void;
    onSave: (newContent: string) => Promise<void>;
    isTrulyFullscreen?: boolean;
    setIsTrulyFullscreen?: (val: boolean) => void;
    inline?: boolean;
}

/**
 * Text Editor component that can be used as a Dialog, Fullscreen Portal, or Inline.
 */
export function TextThingEditor({
    thing,
    isOpen = true,
    onClose,
    onSave,
    isTrulyFullscreen = false,
    setIsTrulyFullscreen,
    inline = false
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
        if (!isOpen || !isTrulyFullscreen || !setIsTrulyFullscreen) return;

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
        <div className="flex flex-col flex-1 min-h-0">
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
                    <span>Markdown Enabled</span>
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

    const dockingControls = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-blue-500"
                    title="Split View (Dock to side)"
                >
                    <Layout className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Dock Position</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { useCanvasStore.getState().setDockedThing(thing.id, 'left'); if (setIsTrulyFullscreen) setIsTrulyFullscreen(false); onClose(); }}>
                    Left Side
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { useCanvasStore.getState().setDockedThing(thing.id, 'right'); if (setIsTrulyFullscreen) setIsTrulyFullscreen(false); onClose(); }}>
                    Right Side
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { useCanvasStore.getState().setDockedThing(thing.id, 'top'); if (setIsTrulyFullscreen) setIsTrulyFullscreen(false); onClose(); }}>
                    Top
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { useCanvasStore.getState().setDockedThing(thing.id, 'bottom'); if (setIsTrulyFullscreen) setIsTrulyFullscreen(false); onClose(); }}>
                    Bottom
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );


    const commonActions = (
        <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 px-3">
                {inline ? "Close" : "Cancel"}
            </Button>
            <Button
                size="sm"
                onClick={handleInternalSave}
                disabled={isSaving}
                className="h-8 px-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all"
            >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 fill-current" />}
                <span>Save</span>
            </Button>
        </div>
    );

    // If rendered inline (e.g. in a dock)
    // If rendered inline (e.g. in a dock)
    if (inline) {
        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-950 overflow-hidden animate-in fade-in duration-300">
                <div className="flex items-center justify-between p-2 border-b bg-slate-50/80 dark:bg-slate-900/80 flex-none gap-2 overflow-hidden">
                    <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <Pencil className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <h3 className="text-sm font-semibold truncate leading-tight">
                                Editing: {thing.title || "Text Thing"}
                            </h3>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate opacity-70 mt-0.5">
                            Visual/Markdown Editor • Transclude via Drag & Drop
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {dockingControls}
                        <div className="w-px h-5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
                        {commonActions}
                    </div>
                </div>
                {editorBody}
            </div>
        );
    }

    if (isTrulyFullscreen) {
        return typeof document !== "undefined" ? createPortal(
            <div className="fixed inset-0 z-[110] bg-white dark:bg-slate-950 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-8 py-4 border-b bg-slate-50 dark:bg-slate-900 flex-none shadow-sm gap-8 transition-colors">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                            <Pencil className="h-6 w-6 text-blue-500 flex-shrink-0" />
                            <h2 className="text-2xl font-bold truncate">
                                Editing: {thing.title || "Text Thing"}
                            </h2>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 ml-9">
                            High-focus editing mode. Visual/Markdown toggle available.
                        </p>
                    </div>
                    <div className="flex items-center gap-6">
                    </div>
                    <div className="flex items-center gap-6">
                        {dockingControls}
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsTrulyFullscreen?.(false)}
                            title="Exit Truly Fullscreen"
                            className="h-10 gap-2 border border-slate-200 dark:border-slate-800 px-4 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <Minimize2 className="h-4 w-4" />
                            <span className="font-medium">Exit Full Screen</span>
                        </Button>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
                        {commonActions}
                    </div>
                </div>
                <div className="flex-1 overflow-hidden relative">
                    {editorBody}
                </div>
            </div>,
            document.body
        ) : null;
    }

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            modal={false}
        >
            <DialogContent
                onInteractOutside={(e) => e.preventDefault()}
                className="max-w-[85vw] w-full h-[85vh] flex flex-col p-0 overflow-hidden bg-white dark:bg-slate-950 border-none shadow-2xl rounded-xl pointer-events-auto"
            >
                <DialogHeader className="p-5 border-b bg-slate-50/80 dark:bg-slate-900/80 flex-none">
                    <div className="flex items-center justify-between gap-6">
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="flex items-center gap-2 text-2xl font-bold truncate">
                                <Pencil className="h-6 w-6 text-blue-500 flex-shrink-0" />
                                <span>Editing: {thing.title || "Text Thing"}</span>
                            </DialogTitle>
                            <DialogDescription className="mt-1 text-sm opacity-80 truncate ml-8">
                                Visual/Markdown Editor • Transclude other nodes via Drag & Drop.
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
                            {dockingControls}
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsTrulyFullscreen && setIsTrulyFullscreen(true)}
                                title="Maximize to Truly Fullscreen"
                                className="h-8 w-8 text-slate-500 hover:text-blue-500 border border-slate-200 dark:border-slate-800"
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />
                            {commonActions}
                        </div>
                    </div>
                </DialogHeader>
                <div className="flex-1 overflow-hidden relative min-h-0">
                    {editorBody}
                </div>
            </DialogContent>
        </Dialog>
    );
}
