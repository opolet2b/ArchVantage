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
import { User, Bot, Send, Loader2, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { API_URL } from "@/lib/utils";
import type { MessageFragment } from "./types";

// =============================================================================
// Types
// =============================================================================

interface Message {
    id?: string;
    role: "user" | "assistant" | "system" | "agent";
    content: string;
    timestamp?: string;
    agentName?: string;
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
    onSelect?: (fragment: MessageFragment) => void;
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
                    model: "default", // Or passed prop
                    conversation_id: conversationId // Pass ID for potential RAG context lookup
                }),
            });

            if (!response.ok) throw new Error("Failed to get response");

            const data = await response.json();
            const assistantMessage: Message = { role: "assistant", content: data.content };

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

    // Handle message selection logic (existing)
    const handleMessageClick = (message: Message, index: number) => {
        if (!selectionEnabled || !onSelect) return;
        const messageId = message.id || `msg-${index}`;
        setSelectedMessageId(messageId);
        onSelect({
            type: "message",
            messageId: messageId,
            content: message.content,
        });
    };

    const handleMouseUp = (message: Message, index: number) => {
        if (!selectionEnabled || !onSelect) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;
        const text = selection.toString().trim();
        if (!text) return;

        const messageId = message.id || `msg-${index}`;
        const range = selection.getRangeAt(0);
        setSelectedMessageId(messageId);
        onSelect({
            type: "message",
            messageId: messageId,
            content: text,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
        });
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
                                onClick={() => handleMessageClick(message, index)}
                                onMouseUp={() => handleMouseUp(message, index)}
                                className={cn(
                                    "flex gap-2 max-w-[90%]",
                                    isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                                )}
                            >
                                <Avatar className={cn("h-6 w-6 mt-1 flex-shrink-0", isUser ? "bg-blue-600" : "bg-slate-600")}>
                                    <AvatarFallback className="text-[10px] text-white">
                                        {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                                    </AvatarFallback>
                                </Avatar>

                                <div
                                    className={cn(
                                        "rounded-lg px-3 py-2 text-sm shadow-sm",
                                        isUser
                                            ? "bg-blue-600 text-white rounded-tr-none"
                                            : "bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-tl-none",
                                        isSelected && "ring-2 ring-yellow-400",
                                        selectionEnabled && "cursor-pointer"
                                    )}
                                >
                                    <div className="break-words prose-sm dark:prose-invert">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {message.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {isLoading && (
                        <div className="flex gap-2 mr-auto max-w-[90%]">
                            <Avatar className="h-6 w-6 mt-1 bg-slate-600">
                                <AvatarFallback><Bot className="h-3 w-3 text-white" /></AvatarFallback>
                            </Avatar>
                            <div className="bg-white dark:bg-slate-800 border px-3 py-2 rounded-lg rounded-tl-none">
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
                    </div>
                </div>
            )}
        </div>
    );
}
