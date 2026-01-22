"use client";

/**
 * Architect Sidebar Component
 *
 * Left sidebar with chat interface for NL → Blueprint generation.
 * Includes tool discovery card and streaming indicator.
 */
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, ChevronLeft, ChevronRight, Wrench, ChevronDown, ChevronUp, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBuilderStore } from "@/lib/builder-store";
import { cn } from "@/lib/utils";

export function ArchitectSidebar() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);

    // Edit mode state
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    const architectMessages = useBuilderStore((state) => state.architectMessages);
    const isGenerating = useBuilderStore((state) => state.isGenerating);
    const discoveredTools = useBuilderStore((state) => state.discoveredTools);
    const sendArchitectMessage = useBuilderStore((state) => state.sendArchitectMessage);
    const clearArchitectChat = useBuilderStore((state) => state.clearArchitectChat);

    // Tool selection state
    const availableTools = useBuilderStore((state) => state.availableTools);
    const selectedToolIds = useBuilderStore((state) => state.selectedToolIds);
    const isLoadingTools = useBuilderStore((state) => state.isLoadingTools);
    const fetchAvailableTools = useBuilderStore((state) => state.fetchAvailableTools);
    const toggleToolSelection = useBuilderStore((state) => state.toggleToolSelection);
    const [showToolSelector, setShowToolSelector] = useState(false);

    // Fetch available tools on mount
    useEffect(() => {
        fetchAvailableTools();
    }, [fetchAvailableTools]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [architectMessages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isGenerating) return;
        sendArchitectMessage(inputValue);
        setInputValue("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    // Start editing a user message
    const handleStartEdit = (messageId: string, content: string) => {
        setEditingMessageId(messageId);
        setEditValue(content);
    };

    // Cancel editing
    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setEditValue("");
    };

    // Submit edited message and relaunch generation
    const handleSubmitEdit = () => {
        if (!editValue.trim() || isGenerating) return;
        setEditingMessageId(null);
        sendArchitectMessage(editValue);
        setEditValue("");
    };

    // Handle key down in edit mode
    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmitEdit();
        } else if (e.key === "Escape") {
            handleCancelEdit();
        }
    };

    if (isCollapsed) {
        return (
            <div className="w-12 border-r bg-sidebar flex flex-col items-center py-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsCollapsed(false)}
                    className="mb-4"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="writing-vertical-lr rotate-180 text-sm font-medium text-muted-foreground">
                    Architect
                </div>
            </div>
        );
    }

    return (
        <div className="w-80 border-r bg-sidebar flex flex-col shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm">The Architect</h3>
                        <p className="text-xs text-muted-foreground">AI Assistant</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {architectMessages.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearArchitectChat}
                            className="text-xs"
                        >
                            Clear
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsCollapsed(true)}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Tool Selector */}
            <div className="border-b">
                <button
                    onClick={() => setShowToolSelector(!showToolSelector)}
                    className="flex items-center justify-between w-full p-3 hover:bg-sidebar-accent transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium">Selected Tools</span>
                        {selectedToolIds.length > 0 && (
                            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 text-xs px-1.5 py-0.5 rounded-full">
                                {selectedToolIds.length}
                            </span>
                        )}
                    </div>
                    {showToolSelector ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                </button>

                {showToolSelector && (
                    <div className="px-3 pb-3">
                        {isLoadingTools ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading tools...
                            </div>
                        ) : availableTools.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">
                                No tools available. Create tools in the Tools section first.
                            </p>
                        ) : (
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                {availableTools.map((tool) => (
                                    <label
                                        key={tool.id}
                                        className="flex items-start gap-2 p-2 rounded hover:bg-sidebar-accent cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedToolIds.includes(tool.id)}
                                            onChange={() => toggleToolSelection(tool.id)}
                                            className="mt-0.5 h-4 w-4 rounded border-gray-300"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{tool.name}</div>
                                            {tool.description && (
                                                <div className="text-xs text-muted-foreground line-clamp-1">
                                                    {tool.description}
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                        {selectedToolIds.length > 0 && (
                            <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                                ✨ Agent will use these {selectedToolIds.length} tool(s)
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-3" ref={scrollRef}>
                {architectMessages.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 flex items-center justify-center">
                            <Bot className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                        </div>
                        <h4 className="font-medium mb-2">Describe Your Agent</h4>
                        <p className="text-sm text-muted-foreground">
                            Tell me what you want to build and I&apos;ll create the workflow for you.
                        </p>
                        <div className="mt-4 space-y-2 text-left">
                            <button
                                onClick={() => setInputValue("Create an agent that fetches weather data and sends email alerts when temperature exceeds 30°C")}
                                className="w-full p-2 text-xs text-left bg-background rounded border hover:border-primary transition-colors"
                            >
                                🌡️ Weather alert agent
                            </button>
                            <button
                                onClick={() => setInputValue("Build a customer support agent that can search a knowledge base and escalate to humans when needed")}
                                className="w-full p-2 text-xs text-left bg-background rounded border hover:border-primary transition-colors"
                            >
                                🎧 Customer support agent
                            </button>
                            <button
                                onClick={() => setInputValue("Create an agent that monitors an API endpoint and logs changes to a database")}
                                className="w-full p-2 text-xs text-left bg-background rounded border hover:border-primary transition-colors"
                            >
                                📊 API monitoring agent
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {architectMessages.map((msg) => (
                            <div
                                key={msg.id}
                                className={cn(
                                    "flex gap-2 group",
                                    msg.role === "user" ? "justify-end" : "justify-start"
                                )}
                            >
                                {msg.role === "assistant" && (
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0">
                                        <Bot className="h-3.5 w-3.5 text-white" />
                                    </div>
                                )}

                                {/* User message with edit capability */}
                                {msg.role === "user" ? (
                                    editingMessageId === msg.id ? (
                                        // Edit mode
                                        <div className="flex-1 max-w-[85%] space-y-2">
                                            <Textarea
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={handleEditKeyDown}
                                                className="w-full min-h-[60px] text-sm"
                                                autoFocus
                                            />
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={handleCancelEdit}
                                                    className="h-7 px-2"
                                                >
                                                    <X className="h-3.5 w-3.5 mr-1" />
                                                    Cancel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={handleSubmitEdit}
                                                    disabled={!editValue.trim() || isGenerating}
                                                    className="h-7 px-2 bg-purple-600 hover:bg-purple-700"
                                                >
                                                    <Check className="h-3.5 w-3.5 mr-1" />
                                                    Regenerate
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        // Display mode with edit button
                                        <>
                                            <button
                                                onClick={() => handleStartEdit(msg.id, msg.content)}
                                                className="opacity-0 group-hover:opacity-100 self-center p-1 rounded hover:bg-muted transition-opacity"
                                                title="Edit and regenerate"
                                                disabled={isGenerating}
                                            >
                                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                            </button>
                                            <div
                                                className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-blue-600 text-white"
                                            >
                                                {msg.content}
                                            </div>
                                        </>
                                    )
                                ) : (
                                    // Assistant message
                                    <div
                                        className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-background border"
                                    >
                                        {msg.content}
                                    </div>
                                )}

                                {msg.role === "user" && editingMessageId !== msg.id && (
                                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <User className="h-3.5 w-3.5" />
                                    </div>
                                )}
                            </div>
                        ))}

                        {isGenerating && (
                            <div className="flex gap-2 items-center">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                                    <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                                </div>
                                <div className="bg-background border rounded-lg px-3 py-2 text-sm">
                                    <span className="text-muted-foreground">Generating blueprint...</span>
                                </div>
                            </div>
                        )}

                        {/* Tool Discovery Card */}
                        {discoveredTools.length > 0 && (
                            <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                                <h5 className="font-medium text-sm flex items-center gap-2 mb-2">
                                    <Sparkles className="h-4 w-4 text-purple-600" />
                                    Found {discoveredTools.length} relevant tools
                                </h5>
                                <div className="space-y-1">
                                    {discoveredTools.map((tool, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs">
                                            <input type="checkbox" defaultChecked className="rounded" />
                                            <span>{tool}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </ScrollArea>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t">
                <div className="relative">
                    <Textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe the agent you want to build..."
                        className="min-h-[80px] pr-12 resize-none"
                        disabled={isGenerating}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!inputValue.trim() || isGenerating}
                        className="absolute bottom-2 right-2 h-8 w-8 bg-purple-600 hover:bg-purple-700"
                    >
                        {isGenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
