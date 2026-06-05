"use client"
import * as React from "react";

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { MessageSquare, GitGraph, Database, Search, Settings, Bot, LogOut, Wrench, HelpCircle, FileText, Map, Brain, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ConversationList } from "@/components/sidebar/conversation-list"
import { CanvasList } from "@/components/sidebar/canvas-list"
import { useConversation } from "@/lib/conversation-context"
import { useViewMode } from "@/lib/view-mode-context"
import { useAuth } from "@/lib/auth-context"
import { useLayoutStore } from "@/lib/layout-store"
import { Pin, PinOff, ChevronRight } from "lucide-react"

const navItems = [
    { href: "/workflow", icon: GitGraph, label: "Workflow Builder" },
    { href: "/agents-tools", icon: Bot, label: "Agents and Tools" },
    { href: "/smart-analysis", icon: Brain, label: "Smart Analysis" },
    { href: "/scenarios", icon: Layers, label: "Scenarios" },

    { href: "/templates", icon: FileText, label: "Templates" },

    { href: "/knowledge", icon: Search, label: "Knowledge" },
    { href: "/settings", icon: Settings, label: "Settings" },
    { href: "/help", icon: HelpCircle, label: "Help" },
]


export function AppSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const { createNewConversation, setActiveConversationId } = useConversation()
    const { viewMode, setViewMode } = useViewMode()
    const { user, logout } = useAuth()
    const { leftPanelPinned, toggleLeftPanelPin } = useLayoutStore()
    const [isHovered, setIsHovered] = React.useState(false)

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
        <div 
            className={cn(
                "h-screen flex-shrink-0 transition-all duration-300 ease-in-out relative z-[60]",
                leftPanelPinned ? "w-64" : "w-1"
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {!leftPanelPinned && !isHovered && (
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-4 h-16 bg-white dark:bg-slate-800 border-r border-y border-slate-200 dark:border-slate-700 rounded-r-md shadow-md flex items-center justify-center cursor-pointer opacity-70 hover:opacity-100 transition-opacity z-50">
                    <ChevronRight className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                </div>
            )}
            <div className={cn(
                "flex flex-col h-screen w-64 border-r bg-sidebar border-sidebar-border py-4 gap-4 overflow-hidden text-sidebar-foreground shadow-xl transition-transform duration-300",
                leftPanelPinned ? "relative translate-x-0" : `absolute top-0 left-0 ${isHovered ? "translate-x-0" : "-translate-x-[calc(100%-4px)]"}`
            )}>
                <div className="px-4 flex items-center justify-between shrink-0">
                    <div className="font-bold text-xl flex items-center overflow-hidden whitespace-nowrap">
                        <img src="/t2blogo.png" alt="Logo" className="h-8 w-auto mr-2" />
                        <span className="truncate">Semantic Workbench</span>
                    </div>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={toggleLeftPanelPin} 
                        className="h-6 w-6 ml-1 flex-shrink-0 text-muted-foreground hover:text-foreground"
                    >
                        {leftPanelPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </Button>
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
        </div>
    )
}

