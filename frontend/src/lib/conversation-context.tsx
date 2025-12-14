"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import { API_URL } from "@/lib/utils"

interface Conversation {
    id: string
    title: string
    created_at: string
    updated_at: string
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
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined)

export function ConversationProvider({ children }: { children: React.ReactNode }) {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

    const refreshConversations = useCallback(async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/conversations`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setConversations(data)
            }
        } catch (error) {
            console.error("Failed to fetch conversations", error)
        }
    }, [])

    useEffect(() => {
        refreshConversations()
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
