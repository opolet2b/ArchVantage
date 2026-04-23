"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Pencil, Save, Minimize2, Maximize2, X, Loader2, Layout, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { API_URL } from "@/lib/utils";

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WysiwygEditor } from "./wysiwyg-editor";
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
    const [editorMode, setEditorMode] = React.useState<"wysiwyg" | "markdown">("markdown");
    const [isSaving, setIsSaving] = React.useState(false);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const { toast } = useToast();

    // STT State
    const [isDictating, setIsDictating] = React.useState(false);
    const [isProcessingStt, setIsProcessingStt] = React.useState(false);
    const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
    const audioChunksRef = React.useRef<Blob[]>([]);
    const recognitionRef = React.useRef<any>(null);

    // Initialize content when opened
    React.useEffect(() => {
        if (isOpen) {
            const initialContent = (thing.content.text as string) || (thing.content.content as string) || "";
            setEditedContent(initialContent);
        }
    }, [isOpen, thing.content]);

    // Selection Context
    const setContentSelection = useCanvasStore((state) => state.setContentSelection);
    const clearContentSelection = useCanvasStore((state) => state.clearContentSelection);

    // Handle text selection
    const handleSelection = () => {
        if (editorMode !== "markdown" || !textareaRef.current) return;

        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        if (start !== end) {
            const selectedText = textarea.value.substring(start, end);
            // Calculate screen position for context menu (approximate or use mouse event if available)
            // For now, we rely on the context menu triggering at mouse position, 
            // but we need to set the selection state.

            setContentSelection(thing.id, {
                type: 'text',
                content: selectedText,
                startOffset: start,
                endOffset: end
            });
        } else {
            // Clears selection if nothing is selected (caret only)
            // BUT: We don't want to clear if the user just clicked to place cursor.
            // Only clear if we are explicitly handling a "deselect" action.
            // Usually, keeping the last selection is fine, or clear it on blur.
            // Let's clear it to be safe, so we don't carry over stale fragments.
            // clearSelection(); 
            // Actually, context menu checks if selection.thingId matches.
        }
    };


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

    // -- STT Dictation Logic --
    const stopDictation = React.useCallback(async () => {
        setIsDictating(false);
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
            // processing happens in onstop
        }
    }, []);

    const handleToggleDictation = async () => {
        if (isDictating) {
            stopDictation();
            return;
        }

        const state = useCanvasStore.getState();
        const activeSttId = state.selectedSttModel;
        const activeProfile = state.sttProfiles?.find((p: any) => p.id.toString() === activeSttId);

        if (!activeProfile) {
            toast({ title: "No STT Profile", description: "Select an STT engine from the top panel.", variant: "destructive" });
            return;
        }

        if (activeProfile.provider_type === "BROWSER") {
            // Use Web Speech API
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                toast({ title: "Not Supported", description: "Browser native dictation not supported in this browser.", variant: "destructive" });
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            
            recognition.onresult = (event: any) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript + ' ';
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    setEditedContent(prev => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + finalTranscript);
                }
            };

            recognition.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                if (event.error !== "no-speech") {
                    stopDictation();
                }
            };

            recognition.onend = () => {
                setIsDictating(false);
            };

            recognitionRef.current = recognition;
            recognition.start();
            setIsDictating(true);
            toast({ title: "Dictation Started", description: "Browser native recording active." });

        } else {
            // REMOTE / LOCAL Chunked Streaming
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                mediaRecorderRef.current = mediaRecorder;
                audioChunksRef.current = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunksRef.current.push(event.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    stream.getTracks().forEach(track => track.stop());
                    if (audioChunksRef.current.length === 0) return;

                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    audioChunksRef.current = [];
                    setIsProcessingStt(true);

                    try {
                        const token = localStorage.getItem("token");
                        const formData = new FormData();
                        formData.append("file", audioBlob, "dictation.webm");
                        formData.append("config_id", activeProfile.id.toString());

                        const res = await fetch(`${API_URL}/stt/transcribe`, {
                            method: "POST",
                            headers: token ? { "Authorization": `Bearer ${token}` } : {},
                            body: formData
                        });

                        if (res.ok) {
                            const data = await res.json();
                            if (data.text) {
                                setEditedContent(prev => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + data.text);
                            }
                        } else {
                            toast({ title: "Transcription Failed", description: await res.text(), variant: "destructive" });
                        }
                    } catch (error) {
                        console.error("STT transcribing error", error);
                        toast({ title: "Transcription Error", description: "Failed to reach server.", variant: "destructive" });
                    } finally {
                        setIsProcessingStt(false);
                    }
                };

                mediaRecorder.start(1000); // chunk every 1 second just in case we implement real live streams later, currently we wait for stop
                setIsDictating(true);
                toast({ title: "Recording Started", description: "Speak now. Click stop to transcribe." });

            } catch (err) {
                console.error("Mic access denied", err);
                toast({ title: "Microphone Error", description: "Please allow mic permissions.", variant: "destructive" });
            }
        }
    };

    // Cleanup on unmount
    React.useEffect(() => {
        return () => { stopDictation(); };
    }, [stopDictation]);

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
            {editorMode === "markdown" ? (
                <>
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
                            className="w-full h-full font-mono text-base resize-none bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus-visible:ring-1 p-6 shadow-inner leading-relaxed overflow-y-auto custom-scrollbar"
                            placeholder="Type your content here..."
                            autoFocus
                            onDrop={handleTextareaDrop}
                            onDragOver={(e) => e.preventDefault()}
                            onClick={handleTextareaClick}
                            onSelect={handleSelection}
                            // onMouseUp={handleSelection} // onSelect covers mouse validation usually

                            style={{
                                cursor: useCanvasStore.getState().transclusionGhostId ? "copy" : "text"
                            }}
                        />
                    </div>
                </>
            ) : (
                <div className="flex-1 min-h-0 overflow-hidden bg-slate-50/30 dark:bg-slate-900/10 p-0 border-t border-slate-200 dark:border-slate-800">
                    <WysiwygEditor
                        content={editedContent}
                        onChange={setEditedContent}
                        onSave={handleInternalSave}
                        className="h-full"
                    />
                </div>
            )}
            <div className="p-3 border-t bg-slate-50 dark:bg-slate-900 flex justify-between items-center text-xs text-muted-foreground flex-none">
                <div className="flex gap-4">
                    <span>{editorMode === 'markdown' ? "Markdown" : "Visual"} Editor</span>
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


    const modeToggles = (
        <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as any)} className="w-[180px]">
            <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="wysiwyg" className="text-xs gap-1.5 py-1">
                    <TypeIcon className="h-3 w-3" />
                    Visual
                </TabsTrigger>
                <TabsTrigger value="markdown" className="text-xs gap-1.5 py-1">
                    <FileText className="h-3 w-3" />
                    Markdown
                </TabsTrigger>
            </TabsList>
        </Tabs>
    );

    const commonActions = (
        <div className="flex items-center gap-2 flex-shrink-0">
            <Button
                variant={isDictating || isProcessingStt ? "destructive" : "outline"}
                size="sm"
                onClick={handleToggleDictation}
                disabled={isProcessingStt}
                className="h-8 px-3 gap-2 w-32"
                title="Toggle Dictation"
            >
                {isProcessingStt ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Processing</>
                ) : isDictating ? (
                    <><Square className="h-4 w-4 fill-current" /> Stop</>
                ) : (
                    <><Mic className="h-4 w-4" /> Dictate</>
                )}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 px-3">
                {inline ? "Close" : "Cancel"}
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
                        {modeToggles}
                        <div className="w-px h-5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
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
                    <div className="flex items-center gap-4">
                        {modeToggles}
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
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
                className="max-w-[95vw] w-full h-[90vh] flex flex-col p-0 overflow-hidden bg-white dark:bg-slate-950 border-none shadow-2xl rounded-xl pointer-events-auto"
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
                            {modeToggles}
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />
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
