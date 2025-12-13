"use client"

/**
 * Agent Input Mode Selector
 * 
 * A component that lets users choose how they want to provide inputs
 * for an agent: through a conversational flow or via a form.
 */
import * as React from "react"
import { MessageCircle, FormInput, Bot, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Input mode options for agent parameter collection.
 */
export type AgentInputMode = "conversation" | "form"

interface AgentInputModeSelectorProps {
    /**
     * The agent's name for display.
     */
    agentName: string
    /**
     * The agent's description.
     */
    agentDescription?: string | null
    /**
     * Callback when a mode is selected.
     */
    onSelectMode: (mode: AgentInputMode) => void
    /**
     * Callback when cancelled.
     */
    onCancel: () => void
}

export function AgentInputModeSelector({
    agentName,
    agentDescription,
    onSelectMode,
    onCancel
}: AgentInputModeSelectorProps) {
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                    <Bot className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                    <h3 className="font-semibold text-lg">{agentName}</h3>
                    {agentDescription && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                            {agentDescription}
                        </p>
                    )}
                </div>
            </div>

            {/* Mode Selection */}
            <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                    How would you like to provide inputs?
                </p>

                <div className="grid grid-cols-2 gap-3">
                    {/* Conversation Mode */}
                    <button
                        onClick={() => onSelectMode("conversation")}
                        className={cn(
                            "flex flex-col items-center gap-3 p-4 rounded-xl border-2",
                            "border-slate-200 dark:border-slate-700",
                            "hover:border-purple-300 dark:hover:border-purple-700",
                            "hover:bg-purple-50 dark:hover:bg-purple-900/20",
                            "transition-all duration-200 group"
                        )}
                    >
                        <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30 group-hover:bg-purple-200 dark:group-hover:bg-purple-800/40 transition-colors">
                            <MessageCircle className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="text-center">
                            <div className="font-medium text-sm">Conversation</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                I'll ask you for each input
                            </div>
                        </div>
                    </button>

                    {/* Form Mode */}
                    <button
                        onClick={() => onSelectMode("form")}
                        className={cn(
                            "flex flex-col items-center gap-3 p-4 rounded-xl border-2",
                            "border-slate-200 dark:border-slate-700",
                            "hover:border-blue-300 dark:hover:border-blue-700",
                            "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                            "transition-all duration-200 group"
                        )}
                    >
                        <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                            <FormInput className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="text-center">
                            <div className="font-medium text-sm">Form</div>
                            <div className="text-xs text-muted-foreground mt-1">
                                Fill all inputs at once
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Cancel Button */}
            <div className="pt-2">
                <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
            </div>
        </div>
    )
}
