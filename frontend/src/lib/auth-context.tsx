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
                try {
                    const res = await fetch(`${API_URL}/auth/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
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
                    console.error("Failed to validate token", error)
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
        router.push("/")
    }

    const logout = () => {
        localStorage.removeItem("token")
        localStorage.removeItem("user")
        setUser(null)
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
