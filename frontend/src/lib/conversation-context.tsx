"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import { API_URL } from "@/lib/utils"

interface Conversation {
    id: string
    title: string
    created_at: string
    updated_at: string
    archived: boolean
    messages: any[]
}

interface ConversationContextType {
    conversations: Conversation[]
    activeConversationId: string | null
    setActiveConversationId: (id: string | null) => void
    refreshConversations: () => Promise<void>
    createNewConversation: () => Promise<string>
    deleteConversation: (id: string) => Promise<void>
    updateConversationTitle: (id: string, title: string) => Promise<void>
    viewMode: 'active' | 'archived'
    setViewMode: (mode: 'active' | 'archived') => void
    archiveConversation: (id: string) => Promise<void>
    restoreConversation: (id: string) => Promise<void>
    importConversations: (data: any[]) => Promise<void>
    reorderConversations: (updates: { id: string; position: number }[]) => Promise<void>
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined)

function cleanTitle(title: string, type: string = "conversation"): string {
    if (!title) return type === "canvas" ? "Document Overview" : "Conversation";
    
    // Strip <think> tags
    let cleaned = title.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    
    // Check if title is corrupted by thinking process or extremely long
    if (cleaned.toLowerCase().includes("thinking process") || cleaned.length > 60) {
        const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
        let foundShort = false;
        
        if (lines.length > 0) {
            const searchLines = lines.slice(-3);
            for (let i = searchLines.length - 1; i >= 0; i--) {
                let line = searchLines[i];
                line = line.replace(/\*\*|__/g, "").trim();
                line = line.replace(/^\d+\.\s*/, "");
                line = line.replace(/^[-*+]\s*/, "");
                line = line.replace(/['"]/g, "").trim();
                
                const words = line.split(/\s+/);
                if (words.length >= 2 && words.length <= 6 && line.length < 40 && !line.toLowerCase().includes("thinking")) {
                    cleaned = line;
                    foundShort = true;
                    break;
                }
            }
        }
        
        if (!foundShort) {
            if (lines.length > 0) {
                let fallback = lines[lines.length - 1];
                fallback = fallback.replace(/\*\*|__/g, "").trim();
                fallback = fallback.replace(/^\d+\.\s*/, "");
                fallback = fallback.replace(/^[-*+]\s*/, "");
                fallback = fallback.replace(/['"]/g, "").trim();
                if (fallback.length > 40 || fallback.toLowerCase().includes("thinking")) {
                    cleaned = type === "canvas" ? "Document Overview" : "Conversation";
                } else {
                    cleaned = fallback;
                }
            } else {
                cleaned = type === "canvas" ? "Document Overview" : "Conversation";
            }
        }
    }
    
    cleaned = cleaned.replace(/\*\*|__/g, "").replace(/['"]/g, "").trim();
    if (cleaned.length > 40) {
        cleaned = cleaned.substring(0, 37) + "...";
    }
    return cleaned;
}

export function ConversationProvider({ children }: { children: React.ReactNode }) {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'active' | 'archived'>('active')

    const refreshConversations = useCallback(async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/conversations?archived=${viewMode === 'archived'}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                const sanitizedData = (data || []).map((c: Conversation) => ({
                    ...c,
                    title: cleanTitle(c.title, "conversation")
                }))
                setConversations(sanitizedData)
            }
        } catch (error) {
            console.error("Failed to fetch conversations", error)
        }
    }, [viewMode])

    useEffect(() => {
        refreshConversations()

        // Listen for external updates (e.g. from Canvas)
        const handleUpdate = () => {
            refreshConversations();
        };
        window.addEventListener("conversation-updated", handleUpdate);
        return () => window.removeEventListener("conversation-updated", handleUpdate);
    }, [refreshConversations])

    const createNewConversation = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/conversations`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const newConv = await res.json()
                await refreshConversations()
                setActiveConversationId(newConv.id)
                return newConv.id
            }
        } catch (error) {
            console.error("Failed to create conversation", error)
        }
        return ""
    }

    const deleteConversation = async (id: string) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/conversations/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                await refreshConversations()
                if (activeConversationId === id) {
                    setActiveConversationId(null)
                }
            }
        } catch (error) {
            console.error("Failed to delete conversation", error)
        }
    }

    const updateConversationTitle = async (id: string, title: string) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/conversations/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ title }),
            })
            if (res.ok) {
                await refreshConversations()
            }

        } catch (error) {
            console.error("Failed to update conversation title", error)
        }
    }
    const archiveConversation = async (id: string) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/conversations/${id}/archive`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                await refreshConversations()
                if (activeConversationId === id) {
                    setActiveConversationId(null)
                }
            }
        } catch (error) {
            console.error("Failed to archive conversation", error)
        }
    }

    const restoreConversation = async (id: string) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/conversations/${id}/restore`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                await refreshConversations()
            }
        } catch (error) {
            console.error("Failed to restore conversation", error)
        }
    }

    const importConversations = async (data: any[]) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/conversations/import`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(data),
            })
            if (res.ok) {
                await refreshConversations()
            }
        } catch (error) {
            console.error("Failed to import conversations", error)
        }
    }

    const reorderConversations = async (updates: { id: string; position: number }[]) => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            // Optimistic update?
            // For now, wait for server
            const res = await fetch(`${API_URL}/conversations/reorder`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(updates)
            });

            if (!res.ok) throw new Error("Failed to reorder conversations");
            await refreshConversations();
        } catch (err) {
            console.error("Failed to reorder conversations:", err);
        }
    };

    return (
        <ConversationContext.Provider
            value={{
                conversations,
                activeConversationId,
                setActiveConversationId,
                refreshConversations,
                createNewConversation,
                deleteConversation,
                updateConversationTitle,
                viewMode,
                setViewMode,
                archiveConversation,
                restoreConversation,
                importConversations,
                reorderConversations,
            }}
        >
            {children}
        </ConversationContext.Provider>
    )
}

export function useConversation() {
    const context = useContext(ConversationContext)
    if (context === undefined) {
        throw new Error("useConversation must be used within a ConversationProvider")
    }
    return context
}
