"use client"

import * as React from "react"
import { Send, Bot, User, Paperclip, Mic, Square, Pencil, Copy, Check, X, Sparkles, Zap } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useConversation } from "@/lib/conversation-context"
import { uploadFile, UploadProgress } from "@/lib/upload-service"
import { API_URL } from "@/lib/utils"
import { AgentSelectorDialog } from "@/components/agent-selector-dialog"
import { AgentInputForm } from "@/components/agent-input-form"
import { AgentInputModeSelector, AgentInputMode } from "@/components/agent-input-mode-selector"
import { useAgentExecution } from "@/lib/use-agent-execution"
import { FormRenderer } from "@/components/tools/form-builder/form-renderer"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"

/**
 * Chat message type.
 */
interface Message {
    role: "user" | "assistant" | "agent"
    content: string
    agentName?: string
    agentId?: string
}

/**
 * Agent match result from backend.
 */
interface AgentMatch {
    agent_id: string
    agent_name: string
    agent_description: string
    confidence: number
    reason: string
    inputs_schema: Record<string, unknown>
}

/**
 * Blueprint list item for agent selection.
 */
interface BlueprintListItem {
    id: string
    name: string
    description: string | null
    version: string
    is_published: boolean
    inputs_schema: Record<string, unknown>
}

export function ChatInterface() {
    const { activeConversationId, createNewConversation, refreshConversations } = useConversation()
    const [messages, setMessages] = React.useState<Message[]>([])
    const [input, setInput] = React.useState("")
    const [isLoading, setIsLoading] = React.useState(false)
    const scrollAreaRef = React.useRef<HTMLDivElement>(null)
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [isUploading, setIsUploading] = React.useState(false)
    const [uploadProgress, setUploadProgress] = React.useState<UploadProgress | null>(null)

    // Cancel conversation state
    const abortControllerRef = React.useRef<AbortController | null>(null)

    // Edit message state
    const [editingMessageIndex, setEditingMessageIndex] = React.useState<number | null>(null)
    const [editValue, setEditValue] = React.useState("")

    // Copy to clipboard state
    const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null)

    // Agentic mode state
    const [isAgenticMode, setIsAgenticMode] = React.useState(false)
    const [matchedAgents, setMatchedAgents] = React.useState<AgentMatch[]>([])
    const [showAgentMatches, setShowAgentMatches] = React.useState(false)

    // Agent selection state
    const [showAgentSelector, setShowAgentSelector] = React.useState(false)
    const [selectedAgent, setSelectedAgent] = React.useState<BlueprintListItem | null>(null)
    const [showAgentInputForm, setShowAgentInputForm] = React.useState(false)
    const [isExecutingAgent, setIsExecutingAgent] = React.useState(false)

    // Agent input mode state
    const [showInputModeSelector, setShowInputModeSelector] = React.useState(false)
    const [agentInputMode, setAgentInputMode] = React.useState<AgentInputMode | null>(null)
    const [isGatheringParams, setIsGatheringParams] = React.useState(false)
    const [pendingAgentInputs, setPendingAgentInputs] = React.useState<Record<string, unknown>>({})
    const [pendingParamKeys, setPendingParamKeys] = React.useState<string[]>([])
    const [currentParamIndex, setCurrentParamIndex] = React.useState(0)

    // Hook for agent execution
    const execution = useAgentExecution({
        onStatusChange: (status) => {
            console.log("[Chat] Agent execution status:", status)
        },

        onComplete: async (result) => {
            // Add agent response message when execution completes
            if (selectedAgent) {
                const agentMsg: Message = {
                    role: "agent",
                    content: formatAgentOutput(result.outputs),
                    agentName: selectedAgent.name,
                    agentId: selectedAgent.id
                }
                setMessages(prev => [...prev, agentMsg])

                // Persist to backend
                if (activeConversationId) {
                    try {
                        await fetch(`${API_URL}/conversations/${activeConversationId}/messages`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(agentMsg)
                        })
                    } catch (err) {
                        console.error("Failed to save agent message:", err)
                    }
                }
            }
            // Reset agent state
            setSelectedAgent(null)
            setShowAgentInputForm(false)
            setIsExecutingAgent(false)
        },
        onError: async (error) => {
            // Add error message
            if (selectedAgent) {
                const agentMsg: Message = {
                    role: "agent",
                    content: `Error executing agent: ${(error as any).message || String(error)}`,
                    agentName: selectedAgent.name,
                    agentId: selectedAgent.id
                }
                setMessages(prev => [...prev, agentMsg])
            }
            setIsExecutingAgent(false)
        }
    })

    // Voice Recognition Hook
    const { isListening, isSupported, toggleListening } = useSpeechRecognition({
        onResult: (transcript) => {
            // Append result to current input with a space if needed
            setInput(prev => {
                const trimmed = prev.trimEnd();
                return trimmed ? `${trimmed} ${transcript}` : transcript;
            });
        },
        onError: (err) => {
            console.error("Voice input error:", err);
        }
    });
    const [guiFormValues, setGuiFormValues] = React.useState<Record<string, unknown>>({})


    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        setUploadProgress({ loaded: 0, total: file.size, percentage: 0, status: 'uploading' })

        try {
            let currentConversationId = activeConversationId
            if (!currentConversationId) {
                currentConversationId = await createNewConversation()
            }

            if (!currentConversationId) throw new Error("Failed to create conversation")

            const data = await uploadFile(
                `${API_URL}/rag/upload/${currentConversationId}`,
                file,
                (progress) => {
                    setUploadProgress(progress)
                }
            )

            // Add system message about upload
            const systemMsg: Message = {
                role: "assistant",
                content: `ðŸ“„ **File Uploaded**: ${file.name}\n\nI have analyzed this file and added it to my knowledge base. You can now ask questions about it.`
            }

            setMessages(prev => [...prev, systemMsg])

            // Save system message to backend so it persists
            await fetch(`${API_URL}/conversations/${currentConversationId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(systemMsg)
            })

        } catch (error) {
            console.error("Upload error:", error)
            const errorMessage = error instanceof Error ? error.message : "Failed to upload file. Please try again."
            setMessages(prev => [...prev, { role: "assistant", content: `âŒ ${errorMessage}` }])
        } finally {
            setIsUploading(false)
            setUploadProgress(null)
            if (fileInputRef.current) {
                fileInputRef.current.value = ""
            }
        }
    }

    // Load conversation history when active ID changes
    React.useEffect(() => {
        const loadConversation = async () => {
            if (activeConversationId) {
                try {
                    const res = await fetch(`${API_URL}/conversations/${activeConversationId}`)
                    if (res.ok) {
                        const data = await res.json()
                        setMessages(data.messages || [])
                    }
                } catch (error) {
                    console.error("Failed to load conversation", error)
                }
            } else {
                setMessages([{ role: "assistant", content: "Hello! How can I help you today?" }])
            }
        }
        loadConversation()
    }, [activeConversationId])

    const scrollToBottom = () => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }

    React.useEffect(() => {
        scrollToBottom()
    }, [messages])

    /**
     * Cancel the current LLM generation.
     */
    const handleCancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
            setIsLoading(false)
        }
    }

    /**
     * Start editing a user message.
     */
    const handleEditMessage = (index: number) => {
        setEditingMessageIndex(index)
        setEditValue(messages[index].content)
    }

    /**
     * Cancel editing a message.
     */
    const handleCancelEdit = () => {
        setEditingMessageIndex(null)
        setEditValue("")
    }

    /**
     * Copy message content to clipboard.
     */
    const handleCopyMessage = async (index: number, content: string) => {
        try {
            await navigator.clipboard.writeText(content)
            setCopiedIndex(index)
            setTimeout(() => setCopiedIndex(null), 2000)
        } catch (error) {
            console.error("Failed to copy:", error)
        }
    }

    /**
     * Send a message to the LLM.
     * Optionally accepts a list of messages to send (for relaunch).
     */
    const handleSendMessage = async (overrideMessages?: Message[]) => {
        // Use override messages if provided, otherwise use input
        const messagesToSend = overrideMessages || messages
        const userContent = overrideMessages ? null : input.trim()

        if (!overrideMessages && (!userContent || isLoading)) return

        // Cancel any ongoing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        // Create new abort controller
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        let userMessage: Message | null = null
        if (userContent) {
            userMessage = { role: "user", content: userContent }
            setMessages((prev) => [...prev, userMessage!])
            setInput("")
        }
        setIsLoading(true)

        try {
            let currentConversationId = activeConversationId

            // If no active conversation, create one first
            if (!currentConversationId) {
                currentConversationId = await createNewConversation()
            }

            if (!currentConversationId) throw new Error("Failed to create conversation")

            // Save user message to backend (only for new messages)
            if (userMessage) {
                await fetch(`${API_URL}/conversations/${currentConversationId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(userMessage)
                })
            }

            // Determine which messages to send to the LLM
            const allMessages = userMessage
                ? [...messages, userMessage]
                : messagesToSend

            // Get AI response
            const token = localStorage.getItem("token")
            const response = await fetch(`${API_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    messages: allMessages,
                    model: "default",
                    conversation_id: currentConversationId
                }),
                signal: abortController.signal
            })

            if (!response.ok) {
                throw new Error("Failed to send message")
            }

            const data = await response.json()
            const assistantMessage: Message = { role: "assistant", content: data.content }

            // Save assistant message to backend
            await fetch(`${API_URL}/conversations/${currentConversationId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(assistantMessage)
            })

            setMessages((prev) => [...prev, assistantMessage])

            // Refresh list to update title if it changed (auto-title)
            refreshConversations()

        } catch (error) {
            // Don't show error for aborted requests
            if (error instanceof Error && error.name === 'AbortError') {
                console.log("Request was cancelled")
                return
            }
            console.error("Error sending message:", error)
            setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I encountered an error." }])
        } finally {
            abortControllerRef.current = null
            setIsLoading(false)
        }
    }

    /**
     * Relaunch the conversation with an edited message.
     * Keeps all message history and appends the new LLM response.
     */
    const handleRelaunchMessage = async () => {
        if (editingMessageIndex === null) return

        // Cancel any ongoing LLM request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }

        // Update the message at the edited index (keep all history)
        const updatedMessages = [...messages]
        updatedMessages[editingMessageIndex] = { role: "user", content: editValue }

        setMessages(updatedMessages)
        setEditingMessageIndex(null)
        setEditValue("")

        // Send entire conversation to LLM and append new response
        await handleSendMessage(updatedMessages)
    }

    /**
     * Match user message against available agents (for agentic mode).
     */
    const matchAgents = async (message: string) => {
        try {
            const token = localStorage.getItem("token")
            if (!token) return

            const res = await fetch(`${API_URL}/chat/match-agent`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    message,
                    top_k: 3,
                    min_confidence: 0.5
                }),
            })

            if (res.ok) {
                const data = await res.json()
                if (data.matches && data.matches.length > 0) {
                    setMatchedAgents(data.matches)
                    setShowAgentMatches(true)
                }
            }
        } catch (error) {
            console.error("Agent matching error:", error)
        }
    }

    /**
     * Handle agent selection from selector dialog.
     */
    const handleAgentSelected = (agent: BlueprintListItem) => {
        setSelectedAgent(agent)
        // Show mode selector instead of going directly to form
        setShowInputModeSelector(true)
    }

    /**
     * Handle agent selection from match suggestions.
     */
    const handleUseMatchedAgent = (match: AgentMatch) => {
        setSelectedAgent({
            id: match.agent_id,
            name: match.agent_name,
            description: match.agent_description,
            version: "1.0",
            is_published: true,
            inputs_schema: match.inputs_schema
        })
        // Show mode selector instead of going directly to form
        setShowInputModeSelector(true)
        setShowAgentMatches(false)
    }

    /**
     * Handle input mode selection (Conversation or Form).
     */
    const handleInputModeSelected = (mode: AgentInputMode) => {
        setAgentInputMode(mode)
        setShowInputModeSelector(false)

        if (mode === "form") {
            // Show the form directly
            setShowAgentInputForm(true)
        } else {
            // Start conversational parameter gathering
            startConversationalGathering()
        }
    }

    /**
     * Start conversational parameter gathering.
     */
    const startConversationalGathering = () => {
        if (!selectedAgent) return

        // Get the list of parameters to gather
        const schema = selectedAgent.inputs_schema as { properties?: Record<string, { description?: string }> } | undefined
        const properties = schema?.properties || {}
        const paramKeys = Object.keys(properties)

        if (paramKeys.length === 0) {
            // No params needed, execute directly
            executeAgent({})
            return
        }

        // Set up conversational gathering
        setPendingParamKeys(paramKeys)
        setCurrentParamIndex(0)
        setPendingAgentInputs({})
        setIsGatheringParams(true)

        // Add agent message asking for first parameter
        const firstParam = paramKeys[0]
        const firstParamSchema = properties[firstParam]
        const paramDescription = firstParamSchema?.description || firstParam

        setMessages(prev => [...prev, {
            role: "agent",
            content: `I'll help you run the **${selectedAgent.name}** agent. Let me gather the required inputs.\n\nPlease provide: **${firstParam}**${firstParamSchema?.description ? `\n_${firstParamSchema.description}_` : ""}`,
            agentName: selectedAgent.name,
            agentId: selectedAgent.id
        }])
    }

    /**
     * Handle user input during conversational parameter gathering.
     */
    const handleConversationalInput = async (userInput: string) => {
        if (!selectedAgent || !isGatheringParams) return

        const currentKey = pendingParamKeys[currentParamIndex]
        const newInputs = { ...pendingAgentInputs, [currentKey]: userInput }
        setPendingAgentInputs(newInputs)

        // Add user message
        setMessages(prev => [...prev, { role: "user", content: userInput }])

        const nextIndex = currentParamIndex + 1

        if (nextIndex >= pendingParamKeys.length) {
            // All params gathered, execute agent
            setIsGatheringParams(false)
            setPendingParamKeys([])
            setCurrentParamIndex(0)
            await executeAgent(newInputs)
        } else {
            // Ask for next parameter
            setCurrentParamIndex(nextIndex)
            const nextParam = pendingParamKeys[nextIndex]
            const schema = selectedAgent.inputs_schema as { properties?: Record<string, { description?: string }> } | undefined
            const nextParamSchema = schema?.properties?.[nextParam]

            setMessages(prev => [...prev, {
                role: "agent",
                content: `Thanks! Now please provide: **${nextParam}**${nextParamSchema?.description ? `\n_${nextParamSchema.description}_` : ""}`,
                agentName: selectedAgent.name,
                agentId: selectedAgent.id
            }])
        }
    }

    /**
     * Execute the selected agent with provided inputs.
     * Uses the unified execution hook which handles GUI forms.
     */
    const executeAgent = async (inputs: Record<string, unknown>) => {
        if (!selectedAgent) return

        setIsExecutingAgent(true)

        // Add user message about agent execution
        const userMsg: Message = {
            role: "user",
            content: `Execute agent: ${selectedAgent.name}`
        }
        setMessages(prev => [...prev, userMsg])

        // Persist user message to backend
        let currentConversationId = activeConversationId
        if (!currentConversationId) {
            currentConversationId = await createNewConversation()
        }
        if (currentConversationId) {
            try {
                await fetch(`${API_URL}/conversations/${currentConversationId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(userMsg)
                })
            } catch (err) {
                console.error("Failed to save user message:", err)
            }
        }

        // Use the unified execution hook
        // The hook's callbacks handle success/error/waiting_for_input
        await execution.execute(selectedAgent.id, inputs)

        // Note: If execution returns waiting_for_input, the GUI form dialog
        // will be shown. If completed/failed, the callbacks update messages.
    }

    /**
     * Format agent output for display.
     */
    const formatAgentOutput = (outputs: Record<string, unknown>): string => {
        // If there's a single "result" key, show it directly
        if (outputs.result && Object.keys(outputs).length === 1) {
            return String(outputs.result)
        }
        // Otherwise format as key-value pairs
        return Object.entries(outputs)
            .filter(([key]) => !key.startsWith("_"))
            .map(([key, value]) => `**${key}**: ${JSON.stringify(value)}`)
            .join("\n\n")
    }

    /**
     * Cancel agent input form.
     */
    const handleCancelAgentInput = () => {
        setSelectedAgent(null)
        setShowAgentInputForm(false)
        setShowInputModeSelector(false)
        setAgentInputMode(null)
        setIsGatheringParams(false)
        setPendingAgentInputs({})
        setPendingParamKeys([])
        setCurrentParamIndex(0)
    }

    /**
     * Dismiss agent match suggestions.
     */
    const dismissAgentMatches = () => {
        setShowAgentMatches(false)
        setMatchedAgents([])
    }

    // Initialize form values when waiting for input
    React.useEffect(() => {
        if (execution.waitingForInput?.initial_values) {
            setGuiFormValues(execution.waitingForInput.initial_values as Record<string, unknown>)
        }
    }, [execution.waitingForInput])

    return (
        <>
            <div className="flex h-[calc(100vh-2rem)] w-full max-w-5xl mx-auto p-4">
                <Card className="flex flex-col w-full h-full shadow-xl border-border bg-card">
                    <CardHeader className="px-6 py-4 border-b bg-muted/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border-2 border-primary/10">
                                    <AvatarFallback className="bg-primary text-primary-foreground"><Bot className="h-6 w-6" /></AvatarFallback>
                                </Avatar>
                                <div>
                                    <CardTitle className="text-lg font-semibold">AI Assistant</CardTitle>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                        Online
                                    </p>
                                </div>
                            </div>

                            {/* Agentic Mode Toggle */}
                            <div className="flex items-center gap-2">
                                <label
                                    htmlFor="agentic-mode"
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all",
                                        isAgenticMode
                                            ? "bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700"
                                            : "bg-slate-100 dark:bg-slate-800 text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
                                    )}
                                >
                                    <Sparkles className={cn("h-3.5 w-3.5", isAgenticMode && "text-purple-500")} />
                                    Agentic Mode
                                    <Switch
                                        id="agentic-mode"
                                        checked={isAgenticMode}
                                        onCheckedChange={setIsAgenticMode}
                                        className="h-4 w-7 data-[state=checked]:bg-purple-600"
                                    />
                                </label>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="flex-1 p-0 overflow-hidden relative bg-muted/10">
                        <ScrollArea ref={scrollAreaRef} className="h-full p-6">
                            <div className="flex flex-col gap-6 pb-4">
                                {messages.map((message, index) => (
                                    <div
                                        key={index}
                                        className={cn(
                                            "group flex flex-col max-w-[85%]",
                                            message.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "flex gap-3",
                                                message.role === "user" ? "flex-row-reverse" : ""
                                            )}
                                        >
                                            <Avatar className={cn("h-8 w-8 mt-1",
                                                message.role === "user" ? "bg-primary" :
                                                    message.role === "agent" ? "bg-purple-600" : "bg-muted-foreground"
                                            )}>
                                                <AvatarFallback className="text-white">
                                                    {message.role === "user" ? <User className="h-4 w-4" /> :
                                                        message.role === "agent" ? <Sparkles className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                                </AvatarFallback>
                                            </Avatar>

                                            {/* Show edit input if editing this message */}
                                            {editingMessageIndex === index ? (
                                                <div className="flex flex-col gap-2 w-full">
                                                    <textarea
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        className="w-full min-w-[300px] p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        rows={3}
                                                        autoFocus
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={handleCancelEdit}
                                                            className="h-8"
                                                        >
                                                            <X className="h-4 w-4 mr-1" />
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={handleRelaunchMessage}
                                                            className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                                                        >
                                                            <Send className="h-4 w-4 mr-1" />
                                                            Relaunch
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div
                                                    className={cn(
                                                        "rounded-2xl px-4 py-3 text-sm shadow-sm",
                                                        message.role === "user"
                                                            ? "bg-primary text-primary-foreground rounded-tr-none"
                                                            : "bg-card border border-border rounded-tl-none"
                                                    )}
                                                >
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {message.content}
                                                    </ReactMarkdown>
                                                </div>
                                            )}
                                        </div>

                                        {/* Message action buttons (Edit, Copy) */}
                                        {editingMessageIndex !== index && (
                                            <div
                                                className={cn(
                                                    "flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity",
                                                    message.role === "user" ? "mr-11" : "ml-11"
                                                )}
                                            >
                                                {message.role === "user" && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                        onClick={() => handleEditMessage(index)}
                                                        title="Edit message"
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                    onClick={() => handleCopyMessage(index, message.content)}
                                                    title="Copy to clipboard"
                                                >
                                                    {copiedIndex === index ? (
                                                        <Check className="h-3 w-3 text-green-500" />
                                                    ) : (
                                                        <Copy className="h-3 w-3" />
                                                    )}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex flex-col gap-2 mr-auto max-w-[85%]">
                                        <div className="flex gap-3">
                                            <Avatar className="h-8 w-8 mt-1 bg-slate-600">
                                                <AvatarFallback className="text-white"><Bot className="h-4 w-4" /></AvatarFallback>
                                            </Avatar>
                                            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                                                <div className="flex gap-1 items-center h-5">
                                                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Stop Generating button */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleCancelGeneration}
                                            className="ml-11 w-fit h-7 text-xs text-muted-foreground hover:text-foreground border-slate-300 dark:border-slate-600"
                                        >
                                            <Square className="h-3 w-3 mr-1 fill-current" />
                                            Stop Generating
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>

                    <CardFooter className="p-4 bg-white dark:bg-slate-900 border-t">
                        <div className="flex flex-col w-full gap-2">
                            {isUploading && uploadProgress && (
                                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg p-2 flex items-center gap-3 text-xs">
                                    <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                        {uploadProgress.status === 'processing' ? (
                                            <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <span className="font-bold text-blue-600">{uploadProgress.percentage}%</span>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>{uploadProgress.status === 'processing' ? 'Ingesting document...' : 'Uploading...'}</span>
                                            <span>{uploadProgress.percentage}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full bg-blue-600 transition-all duration-300",
                                                    uploadProgress.status === 'processing' && "animate-pulse"
                                                )}
                                                style={{ width: `${uploadProgress.percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="flex w-full items-end gap-2 bg-slate-100 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                                <input
                                    type="file"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                >
                                    <Paperclip className={cn("h-5 w-5", isUploading && "animate-pulse text-blue-500")} />
                                </Button>

                                {/* Launch Agent Button */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 rounded-lg text-muted-foreground hover:text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                                    onClick={() => setShowAgentSelector(true)}
                                    title="Launch an Agent"
                                >
                                    <Zap className="h-5 w-5" />
                                </Button>

                                <Input
                                    placeholder="Type your message..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault()
                                            handleSendMessage()
                                        }
                                    }}
                                    className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-3 h-auto min-h-[44px] max-h-32"
                                />

                                {input.trim() ? (
                                    <Button
                                        onClick={() => handleSendMessage()}
                                        size="icon"
                                        className="h-10 w-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all duration-200 ease-in-out"
                                    >
                                        <Send className="h-5 w-5" />
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-10 w-10 rounded-lg transition-all duration-300",
                                            isListening
                                                ? "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                                                : "text-muted-foreground hover:text-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
                                        )}
                                        onClick={toggleListening}
                                        disabled={!isSupported}
                                        title={isListening ? "Stop listening" : "Voice input"}
                                    >
                                        <Mic className={cn(
                                            "h-5 w-5",
                                            isListening && "animate-pulse"
                                        )} />
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardFooter>
                </Card>
            </div>

            {/* Agent Selector Dialog */}
            <AgentSelectorDialog
                open={showAgentSelector}
                onOpenChange={setShowAgentSelector}
                onSelectAgent={handleAgentSelected}
            />

            {/* Agent Input Mode Selector Modal */}
            {showInputModeSelector && selectedAgent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 w-full max-w-sm">
                        <AgentInputModeSelector
                            agentName={selectedAgent.name}
                            agentDescription={selectedAgent.description}
                            onSelectMode={handleInputModeSelected}
                            onCancel={handleCancelAgentInput}
                        />
                    </div>
                </div>
            )}

            {/* Agent Match Suggestions Panel */}
            {showAgentMatches && matchedAgents.length > 0 && (
                <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg">
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-purple-200 dark:border-purple-800 shadow-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300">
                                <Sparkles className="h-4 w-4" />
                                Matching Agents Found
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={dismissAgentMatches}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {matchedAgents.map((match) => (
                                <button
                                    key={match.agent_id}
                                    onClick={() => handleUseMatchedAgent(match)}
                                    className="w-full text-left p-3 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-medium text-sm">{match.agent_name}</div>
                                            <div className="text-xs text-muted-foreground">{match.reason}</div>
                                        </div>
                                        <div className="text-xs font-medium text-purple-600 dark:text-purple-400">
                                            {Math.round(match.confidence * 100)}% match
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Agent Input Form Modal */}
            {showAgentInputForm && selectedAgent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 w-full max-w-md">
                        <AgentInputForm
                            agentName={selectedAgent.name}
                            inputsSchema={selectedAgent.inputs_schema as any}
                            isSubmitting={isExecutingAgent}
                            onSubmit={executeAgent}
                            onCancel={handleCancelAgentInput}
                        />
                    </div>
                </div>
            )}

            {/* Mid-Workflow GUI Form Dialog */}
            {/* Displayed when agent execution hits a GUI tool that requires user input */}
            <Dialog
                open={execution.needsInput && !!execution.waitingForInput}
                onOpenChange={(open) => {
                    if (!open) {
                        execution.reset()
                        setGuiFormValues({})
                        setIsExecutingAgent(false)
                    }
                }}
            >
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {execution.waitingForInput?.toolName || "Input Required"}
                        </DialogTitle>
                        {execution.waitingForInput?.description && (
                            <DialogDescription>
                                {execution.waitingForInput.description}
                            </DialogDescription>
                        )}
                    </DialogHeader>

                    <div className="py-4">
                        <FormRenderer
                            widgets={(execution.waitingForInput?.schema?.components || []) as any}
                            layout={(execution.waitingForInput?.schema?.layout) as any}
                            value={guiFormValues}
                            context={execution.waitingForInput?.initial_values as Record<string, any>}
                            onChange={(id, val) => setGuiFormValues(prev => ({ ...prev, [id]: val }))}
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                execution.reset()
                                setGuiFormValues({})
                                setIsExecutingAgent(false)
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={async () => {
                                await execution.submitInput(guiFormValues)
                                setGuiFormValues({})
                            }}
                            disabled={execution.isLoading}
                        >
                            {execution.isLoading ? "Submitting..." : "Submit"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
