/**
 * Conversation Viewer Component
 *
 * Renders conversation messages with text selection support.
 * Allows selecting individual messages or text within messages.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageFragment } from "./types";

// =============================================================================
// Types
// =============================================================================

interface Message {
    id?: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp?: string;
}

// =============================================================================
// Props
// =============================================================================

interface ConversationViewerProps {
    /** Array of messages to display */
    messages: Message[];
    /** Callback when a message or text is selected */
    onSelect?: (fragment: MessageFragment) => void;
    /** Optional className for styling */
    className?: string;
    /** Whether selection is enabled */
    selectionEnabled?: boolean;
}

// =============================================================================
// Conversation Viewer Component
// =============================================================================

export function ConversationViewer({
    messages,
    onSelect,
    className,
    selectionEnabled = true,
}: ConversationViewerProps) {
    const [selectedMessageId, setSelectedMessageId] = React.useState<string | null>(null);

    // Handle message click (select entire message)
    const handleMessageClick = (message: Message, index: number) => {
        if (!selectionEnabled || !onSelect) return;

        const messageId = message.id || `msg-${index}`;
        setSelectedMessageId(messageId);

        const fragment: MessageFragment = {
            type: "message",
            messageId: messageId,
            content: message.content,
        };

        onSelect(fragment);
    };

    // Handle text selection within a message
    const handleMouseUp = (message: Message, index: number) => {
        if (!selectionEnabled || !onSelect) return;

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const selectedText = selection.toString().trim();
        if (!selectedText) return;

        const messageId = message.id || `msg-${index}`;
        const range = selection.getRangeAt(0);

        const fragment: MessageFragment = {
            type: "message",
            messageId: messageId,
            content: selectedText,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
        };

        setSelectedMessageId(messageId);
        onSelect(fragment);
    };

    if (!messages || messages.length === 0) {
        return (
            <div className={cn("flex items-center justify-center p-4", className)}>
                <span className="text-sm text-muted-foreground">No messages</span>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col gap-3 p-2", className)}>
            {messages.map((message, index) => {
                const messageId = message.id || `msg-${index}`;
                const isSelected = selectedMessageId === messageId;
                const isUser = message.role === "user";

                return (
                    <div
                        key={messageId}
                        onClick={() => handleMessageClick(message, index)}
                        onMouseUp={() => handleMouseUp(message, index)}
                        className={cn(
                            "flex gap-2 p-2 rounded-lg transition-colors",
                            isUser
                                ? "bg-blue-50 dark:bg-blue-900/20"
                                : "bg-slate-50 dark:bg-slate-800/50",
                            selectionEnabled && "cursor-pointer hover:ring-2 hover:ring-blue-300",
                            isSelected && "ring-2 ring-blue-500"
                        )}
                    >
                        {/* Avatar */}
                        <div
                            className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                                isUser
                                    ? "bg-blue-500 text-white"
                                    : "bg-slate-500 text-white"
                            )}
                        >
                            {isUser ? (
                                <User className="h-3 w-3" />
                            ) : (
                                <Bot className="h-3 w-3" />
                            )}
                        </div>

                        {/* Message content */}
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                                {isUser ? "You" : "Assistant"}
                            </div>
                            <div className="text-sm whitespace-pre-wrap break-words select-text">
                                {message.content}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
