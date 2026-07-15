"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Pencil, Save, Minimize2, Maximize2, X, Loader2, Layout, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { API_URL, cn } from "@/lib/utils";

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
    onDictationStateChange?: (state: { isDictating: boolean; isProcessingStt: boolean }) => void;
}

/**
 * Text Editor component that can be used as a Dialog, Fullscreen Portal, or Inline.
 */
export const TextThingEditor = React.forwardRef<any, TextThingEditorProps>(({
    thing,
    isOpen = true,
    onClose,
    onSave,
    isTrulyFullscreen = false,
    setIsTrulyFullscreen,
    inline = false,
    onDictationStateChange
}, ref) => {
    const [editedContent, setEditedContent] = React.useState("");
    const [editorMode, setEditorMode] = React.useState<"wysiwyg" | "markdown">("markdown");
    const [isSaving, setIsSaving] = React.useState(false);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const wysiwygRef = React.useRef<any>(null);
    const { toast } = useToast();

    // STT State
    const [isDictating, setIsDictating] = React.useState(false);
    const [isProcessingStt, setIsProcessingStt] = React.useState(false);
    const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
    const audioChunksRef = React.useRef<Blob[]>([]);
    const recognitionRef = React.useRef<any>(null);

    // Notify parent of dictation state
    React.useEffect(() => {
        onDictationStateChange?.({ isDictating, isProcessingStt });
    }, [isDictating, isProcessingStt, onDictationStateChange]);

    // Expose methods to parent
    React.useImperativeHandle(ref, () => ({
        handleToggleDictation: () => {
            // Ensure focus before starting
            if (editorMode === 'markdown') {
                textareaRef.current?.focus();
            } else {
                wysiwygRef.current?.focus();
            }
            handleToggleDictation();
        },
        isDictating,
        isProcessingStt
    }), [isDictating, isProcessingStt, editorMode]);

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

    const savedSelectionRef = React.useRef<{ start: number, end: number } | null>(null);

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

    const insertTextAtCursor = React.useCallback((text: string) => {
        console.log("[STT] insertTextAtCursor called with text:", text);
        console.log("[STT] current editorMode:", editorMode);
        
        if (editorMode === 'markdown') {
            const textarea = textareaRef.current;
            if (!textarea) {
                console.warn("[STT] textareaRef is null, appending to content");
                setEditedContent(prev => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + text);
                return;
            }

            // Capture selection. If focus was lost, selection usually stays at last position.
            let start = textarea.selectionStart;
            let end = textarea.selectionEnd;
            console.log(`[STT] Markdown selection: ${start} to ${end}`);
            
            // Fallback to saved selection if current is at 0 and we have a saved one
            if (start === 0 && end === 0 && savedSelectionRef.current) {
                start = savedSelectionRef.current.start;
                end = savedSelectionRef.current.end;
                console.log(`[STT] Using fallback saved selection: ${start} to ${end}`);
            }

            const currentValue = textarea.value;
            
            // Check if we should add a leading space
            const prefix = currentValue.substring(0, start);
            const needsSpace = prefix.length > 0 && !prefix.endsWith(' ') && !prefix.endsWith('\n') && !text.startsWith(' ');
            const space = needsSpace ? ' ' : '';
            
            const newValue = currentValue.substring(0, start) + space + text + currentValue.substring(end);

            console.log("[STT] Updating editedContent...");
            setEditedContent(newValue);

            // Restore focus and move cursor to end of inserted text
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    const newPos = start + space.length + text.length;
                    textareaRef.current.setSelectionRange(newPos, newPos);
                    // Update saved selection for next chunk
                    savedSelectionRef.current = { start: newPos, end: newPos };
                    console.log("[STT] Focus restored and selection updated to:", newPos);
                }
            }, 10);
        } else {
            // WYSIWYG
            console.log("[STT] Attempting WYSIWYG insertion via ref...");
            if (wysiwygRef.current?.insertContent) {
                wysiwygRef.current.insertContent(text);
                console.log("[STT] WYSIWYG insertion command sent.");
            } else {
                console.error("[STT] wysiwygRef.current.insertContent is not defined!");
            }
        }
    }, [editorMode]);

    const handleRemoteDictation = async (activeProfile: any) => {
        try {
            console.log(`[STT] Starting remote dictation with profile: ${activeProfile.name}`, activeProfile);
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
                    // Ensure config_id is passed as string, handle missing id by falling back to name
                    const configId = activeProfile.id?.toString() || activeProfile.name || "default";
                    formData.append("config_id", configId);

                    const res = await fetch(`${API_URL}/stt/transcribe`, {
                        method: "POST",
                        headers: token ? { "Authorization": `Bearer ${token}` } : {},
                        body: formData
                    });

                    if (res.ok) {
                        const data = await res.json();
                        console.log("[STT] Remote transcription response received:", data);
                        if (data.text) {
                            toast({ title: "Dictation Result", description: `Transcribed: "${data.text}"` });
                            insertTextAtCursor(data.text);
                        }
                    } else {
                        const errorText = await res.text();
                        console.error("[STT] Remote transcription failed:", errorText);
                        toast({ title: "Transcription Failed", description: errorText, variant: "destructive" });
                    }
                } catch (error) {
                    console.error("[STT] Remote transcribing error", error);
                    toast({ title: "Transcription Error", description: "Failed to reach server.", variant: "destructive" });
                } finally {
                    setIsProcessingStt(false);
                }
            };

            mediaRecorder.start();
            setIsDictating(true);
            toast({ 
                title: "Recording Started", 
                description: `Remote engine active (${activeProfile.name}). Speak now, then click stop.` 
            });
        } catch (err: any) {
            console.error("[STT] Mic access denied", err);
            toast({ title: "Microphone Error", description: `Please allow mic permissions. ${err.message}`, variant: "destructive" });
        }
    };

    const isProcessingToggleRef = React.useRef(false);

    const handleToggleDictation = () => {
        if (isProcessingToggleRef.current) return;
        isProcessingToggleRef.current = true;
        
        try {
            if (isDictating) {
                stopDictation(); // Removed await to keep it synchronous
                return;
            }

        // Capture selection before starting
        if (editorMode === 'markdown' && textareaRef.current) {
            savedSelectionRef.current = {
                start: textareaRef.current.selectionStart,
                end: textareaRef.current.selectionEnd
            };
        }

        const state = useCanvasStore.getState();
        const activeSttId = state.selectedSttModel;
        const activeProfile = state.sttProfiles?.find((p: any) => p.id?.toString() === activeSttId || p.name === activeSttId);

        console.log(`[STT] handleToggleDictation. Engine: ${activeSttId || "None"}. Profiles count: ${state.sttProfiles?.length || 0}`);

        if (!activeProfile) {
            toast({ title: "No STT Profile", description: "Select an STT engine from the Canvas Settings (gear icon in the top panel).", variant: "destructive" });
            return;
        }

        if ((activeProfile as any).provider_type === "BROWSER" || (activeProfile as any).is_browser_native) {
            // Use Web Speech API
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                toast({ title: "Not Supported", description: "Browser native dictation not supported in this browser.", variant: "destructive" });
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.lang = (activeProfile as any).language_code || 'en-US';
            recognition.continuous = true; // Back to true for stability
            recognition.interimResults = true;
            
            recognition.onstart = () => console.log("[STT] Recognition started");
            recognition.onend = () => {
                console.log("[STT] Recognition ended");
                setIsDictating(false);
            };
            recognition.onaudiostart = () => console.log("[STT] Audio capture started");
            recognition.onaudioend = () => console.log("[STT] Audio capture ended");
            recognition.onsoundstart = () => console.log("[STT] Sound detected");
            recognition.onsoundend = () => console.log("[STT] Sound ended");
            recognition.onspeechstart = () => console.log("[STT] Speech started");
            recognition.onspeechend = () => console.log("[STT] Speech ended");
            recognition.onnomatch = () => console.warn("[STT] No match found");
            
            recognition.onresult = (event: any) => {
                console.log("[STT] Native onresult event received. results length:", event.results.length);
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (interimTranscript) {
                    console.log("[STT] Native interim transcript:", interimTranscript);
                }

                if (finalTranscript) {
                    console.log("[STT] Native final transcript:", finalTranscript);
                    toast({ title: "Dictation Result", description: `Transcribed: "${finalTranscript}"` });
                    insertTextAtCursor(finalTranscript);
                }
            };

            recognition.onerror = (event: any) => {
                console.error("[STT] Speech recognition error", event.error);
                if (event.error !== "no-speech") {
                    toast({ title: "Dictation Error", description: `Error: ${event.error}`, variant: "destructive" });
                    stopDictation();
                }
            };

            recognitionRef.current = recognition;
            recognition.start();
            setIsDictating(true);
            toast({ 
                title: "Dictation Started", 
                description: `Browser native recording active (${activeProfile.name}). Speak now.` 
            });

        } else {
            // REMOTE - this part still needs to be async but it's handled via a separate function
            handleRemoteDictation(activeProfile);
        }
    } finally {
        isProcessingToggleRef.current = false;
    }
};

    // Cleanup on unmount
    React.useEffect(() => {
        return () => { 
            console.log("[STT] TextThingEditor unmounting, stopping dictation...");
            stopDictation(); 
        };
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
        <div className="flex flex-col flex-1 min-h-0 w-full">
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
                        ref={wysiwygRef}
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
        <div className="flex items-center gap-1.5">
            <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                    e.stopPropagation();
                    handleToggleDictation();
                }}
                className={cn(
                    "h-8 w-8 transition-all duration-300",
                    isDictating ? "text-red-500 bg-red-50 dark:bg-red-950/30 animate-pulse scale-110" : "text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                )}
                title={isDictating ? "Stop Dictation" : "Start Dictation"}
            >
                {isProcessingStt ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Mic className={cn("h-4 w-4", isDictating && "fill-current")} />
                )}
            </Button>

            {!inline && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleInternalSave}
                    disabled={isSaving}
                    className="h-8 w-8 text-slate-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
                    title="Save & Close"
                >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
            )}
            
            <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                title={inline ? "Close" : "Cancel & Close"}
            >
                <X className="h-4 w-4" />
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
                <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
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
                <div className="flex-1 overflow-hidden relative min-h-0 flex flex-col">
                    {editorBody}
                </div>
            </DialogContent>
        </Dialog>
    );
});

