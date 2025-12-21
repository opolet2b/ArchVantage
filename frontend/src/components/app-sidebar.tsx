"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { MessageSquare, GitGraph, Database, Search, Settings, Plus, Bot, LogOut, Wrench, HelpCircle, FileText, Map } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ConversationList } from "@/components/sidebar/conversation-list"
import { CanvasList } from "@/components/sidebar/canvas-list"
import { useConversation } from "@/lib/conversation-context"
import { useViewMode } from "@/lib/view-mode-context"
import { useAuth } from "@/lib/auth-context"

const navItems = [
    { href: "/workflow", icon: GitGraph, label: "Workflows" },
    { href: "/agents", icon: Bot, label: "My Agents" },
    { href: "/agents/builder/new", icon: Plus, label: "Agent Builder" },
    { href: "/tools", icon: Wrench, label: "Tools" },
    { href: "/templates", icon: FileText, label: "Templates" },
    { href: "/rag", icon: Database, label: "RAG" },
    { href: "/search", icon: Search, label: "Research" },
    { href: "/settings", icon: Settings, label: "Settings" },
    { href: "/help", icon: HelpCircle, label: "Help" },
]


export function AppSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const { createNewConversation, setActiveConversationId } = useConversation()
    const { viewMode, setViewMode } = useViewMode()
    const { user, logout } = useAuth()

    const handleNewChat = async () => {
        await createNewConversation()
    }

    // Show canvas mode when on home page
    const isHomePage = pathname === "/"

    const handleSwitchToChat = () => {
        setViewMode("chat")
        if (!isHomePage) {
            router.push("/")
        }
    }

    const handleSwitchToCanvas = () => {
        setViewMode("canvas")
        if (!isHomePage) {
            router.push("/")
        }
    }

    return (
        <div className="flex flex-col h-screen w-64 border-r bg-slate-50/50 dark:bg-slate-900/50 py-4 gap-4 overflow-y-auto">
            <div className="px-4 flex items-center justify-between">
                <div className="font-bold text-xl">AI Chat</div>
                {viewMode === "chat" && (
                    <Button variant="ghost" size="icon" onClick={handleNewChat} title="New Chat">
                        <Plus className="h-5 w-5" />
                    </Button>
                )}
            </div>

            {/* View Mode Toggle - Always Visible */}
            <div className="px-2">
                <div className="flex gap-1 bg-slate-200 dark:bg-slate-800 rounded-lg p-1">
                    <Button
                        variant={viewMode === "chat" ? "default" : "ghost"}
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={handleSwitchToChat}
                    >
                        <MessageSquare className="h-4 w-4" />
                        Chat
                    </Button>
                    <Button
                        variant={viewMode === "canvas" ? "default" : "ghost"}
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={handleSwitchToCanvas}
                    >
                        <Map className="h-4 w-4" />
                        Canvas
                    </Button>
                </div>
            </div>

            {/* Current Mode Button */}
            {isHomePage && viewMode === "chat" && (
                <div className="px-2">
                    <Link href="/">
                        <Button
                            variant={pathname === "/" ? "secondary" : "ghost"}
                            className="w-full justify-start gap-2"
                            onClick={() => setActiveConversationId(null)}
                        >
                            <MessageSquare className="h-4 w-4" />
                            Current Chat
                        </Button>
                    </Link>
                </div>
            )}

            {/* Conversation or Canvas List */}
            {viewMode === "chat" ? <ConversationList /> : <CanvasList />}

            <div className="mt-auto px-2 flex flex-col gap-1">
                {navItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant={pathname === item.href ? "secondary" : "ghost"}
                            className={cn("w-full justify-start gap-2", pathname === item.href && "bg-slate-200 dark:bg-slate-800")}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Button>
                    </Link>
                ))}

                {user?.auth_type !== "SSO" && (
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                        onClick={logout}
                    >
                        <LogOut className="h-4 w-4" />
                        Log out
                    </Button>
                )}
            </div>
        </div>
    )
}

