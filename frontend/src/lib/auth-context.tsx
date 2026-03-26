"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { API_URL } from "@/lib/utils"

interface User {
    email: string
    roles?: string[]
    permissions?: string[]
    auth_type?: string
}

interface AuthContextType {
    user: User | null
    login: (token: string, user: User) => void
    logout: () => void
    isLoading: boolean
    isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        const validateToken = async () => {
            const token = localStorage.getItem("token")
            if (token) {
                // Create abort controller with 60 second timeout to handle slow backend (e.g. during heavy AI ops)
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort("Request timed out"), 60000)

                try {
                    const res = await fetch(`${API_URL}/auth/me`, {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal
                    })
                    clearTimeout(timeoutId)

                    if (res.ok) {
                        const userData = await res.json()
                        setUser(userData)
                    } else {
                        // Token invalid or expired
                        localStorage.removeItem("token")
                        localStorage.removeItem("user")
                        setUser(null)
                    }
                } catch (error) {
                    clearTimeout(timeoutId)
                    console.error("Failed to validate token", error)
                    // On timeout or network error, clear invalid token
                    if (error instanceof Error && error.name === 'AbortError') {
                        console.warn("Auth validation timed out, backend may be unavailable")
                    }
                }
            }
            setIsLoading(false)
        }
        validateToken()
    }, [])

    const login = (token: string, userData: User) => {
        localStorage.setItem("token", token)
        localStorage.setItem("user", JSON.stringify(userData))
        setUser(userData)
        setIsLoading(false)
        router.push("/")
    }

    const logout = () => {
        localStorage.removeItem("token")
        localStorage.removeItem("user")
        setUser(null)
        setIsLoading(false)
        router.push("/login")
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                login,
                logout,
                isLoading,
                isAuthenticated: !!user
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider")
    }
    return context
}
