/**
 * Conversation Viewer Component
 *
 * Renders conversation messages with text selection support.
 * Allows selecting individual messages or text within messages.
 * Now supports interactive chat functionalities.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { User, Bot, Send, Loader2, RefreshCw, ExternalLink, Mic, Reply } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReactFlow } from "reactflow"; // For viewport control

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { API_URL } from "@/lib/utils";
import type { MessageFragment } from "./types";
import { useCanvasStore } from "../canvas-store";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

// =============================================================================
// Types
// =============================================================================

interface Message {
    id?: string;
    role: "user" | "assistant" | "system" | "agent";
    content: string;
    timestamp?: string;
    agentName?: string;
    citations?: { id: string; title: string; type: string; matches?: any[] }[];
}

// =============================================================================
// Props
// =============================================================================

interface ConversationViewerProps {
    /** ID of the conversation to load/interact with */
    conversationId?: string;
    /** Initial messages to display (if not fetching) */
    initialMessages?: Message[];
    /** Callback when a message or text is selected */
    onSelect?: (fragment: MessageFragment, position: { x: number; y: number }) => void;
    /** Optional className for styling */
    className?: string;
    /** Whether selection is enabled */
    selectionEnabled?: boolean;
    /** Whether to show input and allow interaction */
    interactive?: boolean;
}

// =============================================================================
// Conversation Viewer Component
// =============================================================================

export function ConversationViewer({
    conversationId,
    initialMessages = [],
    onSelect,
    className,
    selectionEnabled = true,
    interactive = true,
}: ConversationViewerProps) {
    const [messages, setMessages] = React.useState<Message[]>(initialMessages);
    const [inputValue, setInputValue] = React.useState("");
    const [isLoading, setIsLoading] = React.useState(false);
    const [selectedMessageId, setSelectedMessageId] = React.useState<string | null>(null);
    const scrollAreaRef = React.useRef<HTMLDivElement>(null);
    const [isFetchingInfo, setIsFetchingInfo] = React.useState(false);
    const [title, setTitle] = React.useState<string>("");

    // React Flow hooks for camera control
    const { fitView } = useReactFlow();
    const selectThing = useCanvasStore(state => state.selectThing);
    const setHighlightTarget = useCanvasStore(state => state.setHighlightTarget);
    const selectedKbId = useCanvasStore(state => state.selectedKbId);
    const selectedModel = useCanvasStore(state => state.selectedModel);

    // Voice Recognition Hook
    const { isListening, isSupported, toggleListening } = useSpeechRecognition({
        onResult: (transcript) => {
            setInputValue(prev => {
                const trimmed = prev.trimEnd();
                return trimmed ? `${trimmed} ${transcript}` : transcript;
            });
        },
        onError: (err) => {
            console.error("Voice input error:", err);
        }
    });

    // Load conversation history
    React.useEffect(() => {
        if (!conversationId) return;

        const fetchConversation = async () => {
            setIsFetchingInfo(true);
            try {
                const token = localStorage.getItem("token");
                const res = await fetch(`${API_URL}/conversations/${conversationId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.messages || []);
                    setTitle(data.title || "");
                }
            } catch (error) {
                console.error("Failed to load conversation:", error);
            } finally {
                setIsFetchingInfo(false);
            }
        };

        fetchConversation();

        // Listen for live updates (e.g. rename from canvas)
        const handleUpdate = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.id === conversationId) {
                // Determine if we should full refresh or just quick fetch
                // For now, simpler to re-call fetch or just a lightweight title fetch.
                // Let's re-use fetchConversation for simplicity and correctness.
                fetchConversation();
            }
        };

        window.addEventListener("conversation-updated", handleUpdate);
        return () => window.removeEventListener("conversation-updated", handleUpdate);

    }, [conversationId]);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Handle sending a message
    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading || !conversationId) return;

        const userContent = inputValue.trim();
        setInputValue("");
        setIsLoading(true);

        // Optimistic update
        const userMessage: Message = { role: "user", content: userContent };
        setMessages((prev) => [...prev, userMessage]);

        try {
            const token = localStorage.getItem("token");

            // 1. Save User Message
            await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(userMessage),
            });

            // 2. Get AI Response
            // Note: We send the whole history for context
            const response = await fetch(`${API_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    model: selectedModel || "default", // Or passed prop
                    conversation_id: conversationId, // Pass ID for potential RAG context lookup
                    kb_id: selectedKbId
                }),
            });

            if (!response.ok) throw new Error("Failed to get response");

            const data = await response.json();
            const assistantMessage: Message = {
                role: "assistant",
                content: data.content,
                citations: data.citations
            };

            // 3. Save Assistant Message
            await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(assistantMessage),
            });

            setMessages((prev) => [...prev, assistantMessage]);

        } catch (error) {
            console.error("Chat error:", error);
            setMessages((prev) => [...prev, { role: "assistant", content: "Error: Failed to send message." }]);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle key press (Enter to send)
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // Handle quoting a message
    const handleQuote = (message: Message) => {
        setInputValue(prev => {
            const prefix = prev.trim() ? "\n\n" : "";
            return `${prev.trim()}${prefix}${message.content}\n\n`;
        });
    };

    // Handle message selection logic (existing)
    const handleMessageClick = (message: Message, index: number, e: React.MouseEvent) => {
        if (!selectionEnabled || !onSelect) return;
        const messageId = message.id || `msg-${index}`;
        setSelectedMessageId(messageId);

        // Position at the top center of the message bubble
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const position = {
            x: rect.left + rect.width / 2,
            y: rect.top,
        };

        onSelect({
            type: "message",
            messageId: messageId,
            content: message.content,
        } as any, position);
    };

    const handleMouseUp = (message: Message, index: number) => {
        if (!selectionEnabled || !onSelect) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;
        const text = selection.toString().trim();
        if (!text) return;

        const messageId = message.id || `msg-${index}`;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const position = {
            x: rect.left + rect.width / 2,
            y: rect.top,
        };

        setSelectedMessageId(messageId);
        onSelect({
            type: "message",
            messageId: messageId,
            content: text,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
        } as any, position);
    };

    if (isFetchingInfo && messages.length === 0) {
        return (
            <div className={cn("flex items-center justify-center p-8", className)}>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!messages.length && !interactive) {
        return (
            <div className={cn("flex items-center justify-center p-4 text-sm text-muted-foreground", className)}>
                No messages
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col h-full min-h-0 overflow-hidden bg-white/50 dark:bg-slate-900/50", className)}>
            {/* Header if title exists */}
            {title && (
                <div className="px-3 py-2 border-b bg-white/80 dark:bg-slate-900/80 text-xs font-semibold text-muted-foreground truncate shrink-0">
                    {title}
                </div>
            )}

            {/* Messages Area */}
            <div ref={scrollAreaRef} className="flex-1 p-3 overflow-y-auto min-h-0">
                <div className="flex flex-col gap-4">
                    {messages.map((message, index) => {
                        const isUser = message.role === "user";
                        const messageId = message.id || `msg-${index}`;
                        const isSelected = selectedMessageId === messageId;

                        return (
                            <div
                                key={messageId}
                                onClick={(e) => handleMessageClick(message, index, e)}
                                onMouseUp={() => handleMouseUp(message, index)}
                                className={cn(
                                    "flex gap-2 max-w-[90%] group",
                                    isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                                )}
                            >
                                <Avatar className={cn("h-7 w-7 mt-0.5 flex-shrink-0 border shadow-sm", isUser ? "border-blue-700" : "border-slate-950 dark:border-slate-200")}>
                                    <AvatarFallback className={cn(
                                        "text-white dark:text-slate-900",
                                        isUser ? "bg-blue-600" : "bg-slate-900 dark:bg-white"
                                    )}>
                                        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex flex-col gap-1 min-w-0">
                                    <div
                                        className={cn(
                                            "rounded-lg px-3 py-2 text-sm shadow-sm select-text cursor-text",
                                            isUser
                                                ? "bg-blue-600 text-white rounded-tr-none"
                                                : "bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-tl-none",
                                            isSelected && "ring-2 ring-yellow-400",
                                            selectionEnabled && "cursor-pointer"
                                        )}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <div className="break-words prose-sm dark:prose-invert">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {message.content}
                                            </ReactMarkdown>
                                        </div>

                                        {/* Citations / Sources */}
                                        {message.citations && message.citations.length > 0 && (
                                            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                                                <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Sources</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {message.citations.map((cit, i) => (
                                                        <div
                                                            key={i}
                                                            className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                                                            onClick={(e) => {
                                                                e.stopPropagation(); // Prevent message selection
                                                                console.log("ConversationViewer Citation Clicked:", cit);
                                                                setHighlightTarget(cit.matches || null);
                                                                selectThing(cit.id);
                                                                fitView({ nodes: [{ id: cit.id }], duration: 800, padding: 0.2 });
                                                            }}
                                                        >
                                                            <ExternalLink className="h-3 w-3 text-blue-500" />
                                                            <span className="truncate max-w-[150px]">{cit.title}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Quote / Copy Action - Improved Visibility */}
                                    <div className={cn(
                                        "flex gap-1 py-0.5",
                                        isUser ? "flex-row-reverse" : "flex-row"
                                    )}>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-6 w-6 rounded-full bg-white dark:bg-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 opacity-60 group-hover:opacity-100 transition-all shadow-sm border-slate-200 dark:border-slate-700"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleQuote(message);
                                            }}
                                            title="Quote this message"
                                        >
                                            <Reply className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {isLoading && (
                        <div className="flex gap-2 mr-auto max-w-[90%]">
                            <Avatar className="h-7 w-7 mt-0.5 flex-shrink-0 border border-slate-950 dark:border-slate-200 shadow-sm">
                                <AvatarFallback className="bg-slate-900 dark:bg-white text-white dark:text-slate-900">
                                    <Bot className="h-4 w-4" />
                                </AvatarFallback>
                            </Avatar>
                            <div className="bg-white dark:bg-slate-800 border px-3 py-2 rounded-xl rounded-tl-none shadow-sm">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Input Area */}
            {interactive && (
                <div className="p-2 border-t bg-white dark:bg-slate-900 shrink-0">
                    <div className="flex gap-2">
                        <Input
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message..."
                            className="h-8 text-sm"
                            disabled={isLoading}
                        />
                        <Button
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={handleSendMessage}
                            disabled={isLoading || !inputValue.trim()}
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                                "h-8 w-8 shrink-0",
                                isListening && "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400"
                            )}
                            onClick={toggleListening}
                            disabled={!isSupported}
                            title={isListening ? "Stop listening" : "Voice input"}
                        >
                            <Mic className={cn("h-4 w-4", isListening && "animate-pulse")} />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
