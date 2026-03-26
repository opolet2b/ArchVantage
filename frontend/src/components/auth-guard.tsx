"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Loader2 } from "lucide-react"

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth()
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        if (!isLoading && !isAuthenticated && pathname !== "/login") {
            router.push("/login")
        }
    }, [isLoading, isAuthenticated, pathname, router])

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium text-muted-foreground">Authenticating...</p>
                </div>
            </div>
        )
    }

    if (!isAuthenticated && pathname !== "/login") {
        return null // Will redirect
    }

    return <>{children}</>
}
