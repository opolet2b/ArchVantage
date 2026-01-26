"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { MessageSquare, GitGraph, Database, Search, Settings, Plus, Bot, LogOut, Wrench, HelpCircle, FileText, Map, Brain, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ConversationList } from "@/components/sidebar/conversation-list"
import { CanvasList } from "@/components/sidebar/canvas-list"
import { useConversation } from "@/lib/conversation-context"
import { useViewMode } from "@/lib/view-mode-context"
import { useAuth } from "@/lib/auth-context"

const navItems = [
    { href: "/workflow", icon: GitGraph, label: "Workflows" },
    { href: "/agents-tools", icon: Bot, label: "Agents and Tools" },
    { href: "/smart-analysis", icon: Brain, label: "Smart Analysis" },

    { href: "/templates", icon: FileText, label: "Templates" },

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
        <div className="flex flex-col h-screen w-64 border-r bg-sidebar border-sidebar-border py-4 gap-4 overflow-hidden text-sidebar-foreground">
            <div className="px-4 flex items-center justify-between shrink-0">
                <div className="font-bold text-xl flex items-center">
                    <img src="/t2blogo.png" alt="Logo" className="h-8 w-auto mr-2" />
                    Semantic Workbench
                </div>
                {viewMode === "chat" && (
                    <Button variant="ghost" size="icon" onClick={handleNewChat} title="New Chat" className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                        <Plus className="h-5 w-5" />
                    </Button>
                )}
            </div>

            {/* View Mode Toggle - Always Visible */}
            <div className="px-2 shrink-0">
                <div className="flex gap-1 bg-sidebar-accent/50 rounded-lg p-1">
                    <Button
                        variant={viewMode === "canvas" ? "default" : "ghost"}
                        size="sm"
                        className="flex-1 gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground"
                        onClick={handleSwitchToCanvas}
                    >
                        <Map className="h-4 w-4" />
                        Canvas
                    </Button>
                    <Button
                        variant={viewMode === "chat" ? "default" : "ghost"}
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={handleSwitchToChat}
                    >
                        <MessageSquare className="h-4 w-4" />
                        Chat
                    </Button>
                </div>
            </div>

            {/* Current Mode Button */}
            {isHomePage && viewMode === "chat" && (
                <div className="px-2 shrink-0">
                    <Link href="/">
                        <Button
                            variant={pathname === "/" ? "secondary" : "ghost"}
                            className="w-full justify-start gap-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            onClick={() => setActiveConversationId(null)}
                        >
                            <MessageSquare className="h-4 w-4" />
                            Current Chat
                        </Button>
                    </Link>
                </div>
            )}

            {/* Content Area - Flex Column to allow children to handle scroll */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {viewMode === "chat" ? <ConversationList /> : <CanvasList />}
            </div>

            {/* Static Bottom Menu */}
            <div className="px-2 flex flex-col gap-1 shrink-0 mt-auto pt-2">
                {navItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant="ghost"
                            className={cn(
                                "w-full justify-start gap-2 transition-colors",
                                pathname === item.href
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Button>
                    </Link>
                ))}

                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={logout}
                >
                    <LogOut className="h-4 w-4" />
                    Log out
                </Button>
            </div>
        </div>
    )
}

