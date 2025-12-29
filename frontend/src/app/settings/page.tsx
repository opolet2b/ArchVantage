"use client"

import { useState, useEffect } from "react"
import { ModelConfig } from "@/components/settings/model-config"
import UsersPage from "@/app/settings/users/page"
import { MCPServersTab } from "@/components/settings/mcp-servers-tab"
import { CategoriesTab } from "@/components/settings/categories-tab"
import { TemplatesSettingsTab } from "@/components/settings/templates-settings-tab"
import { RagSettingsTab } from "@/components/settings/rag-settings-tab"
import { DebugSettingsTab } from "@/components/settings/debug-settings-tab"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { Users, Server, FolderOpen, FileText, Database, Bug } from "lucide-react"

export default function SettingsPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const [activeTab, setActiveTab] = useState("model")
    const { user } = useAuth()
    const [isAdmin, setIsAdmin] = useState(false)

    useEffect(() => {
        const tab = searchParams.get("tab")
        if (tab) {
            setActiveTab(tab)
        }
    }, [searchParams])

    const handleTabChange = (tab: string) => {
        setActiveTab(tab)
        const params = new URLSearchParams(searchParams)
        params.set("tab", tab)
        router.push(`${pathname}?${params.toString()}`)
    }

    useEffect(() => {
        if (user && user.roles && user.roles.includes("Admin")) {
            setIsAdmin(true)
        }
    }, [user])

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="flex flex-col gap-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground">Manage your application preferences and configurations.</p>
                </div>

                <div className="flex flex-col md:flex-row gap-8">
                    <aside className="w-full md:w-64 flex flex-col gap-2">
                        <Button
                            variant={activeTab === "model" ? "secondary" : "ghost"}
                            className="justify-start"
                            onClick={() => handleTabChange("model")}
                        >
                            Model Configuration
                        </Button>
                        <Button
                            variant={activeTab === "rag" ? "secondary" : "ghost"}
                            className="justify-start"
                            onClick={() => handleTabChange("rag")}
                        >
                            RAG / Knowledge
                        </Button>
                        <Button
                            variant={activeTab === "debug" ? "secondary" : "ghost"}
                            className="justify-start"
                            onClick={() => handleTabChange("debug")}
                        >
                            <Bug className="mr-2 h-4 w-4" />
                            Debug
                        </Button>
                        {isAdmin && (
                            <Button
                                variant={(activeTab === "users" ||
                                    activeTab === "roles" ||
                                    activeTab === "group-mappings" ||
                                    activeTab === "oauth") ? "secondary" : "ghost"}
                                className="justify-start gap-2"
                                onClick={() => handleTabChange("users")}
                            >
                                <Users className="h-4 w-4" />
                                User Management
                            </Button>
                        )}
                        {isAdmin && (
                            <Button
                                variant={activeTab === "mcp-servers" ? "secondary" : "ghost"}
                                className="justify-start gap-2"
                                onClick={() => handleTabChange("mcp-servers")}
                            >
                                <Server className="h-4 w-4" />
                                MCP Servers
                            </Button>
                        )}
                        {isAdmin && (
                            <Button
                                variant={activeTab === "categories" ? "secondary" : "ghost"}
                                className="justify-start gap-2"
                                onClick={() => handleTabChange("categories")}
                            >
                                <FolderOpen className="h-4 w-4" />
                                Tool Categories
                            </Button>
                        )}
                        {isAdmin && (
                            <Button
                                variant={activeTab === "templates" ? "secondary" : "ghost"}
                                className="justify-start gap-2"
                                onClick={() => handleTabChange("templates")}
                            >
                                <FileText className="h-4 w-4" />
                                Templates
                            </Button>
                        )}
                    </aside>

                    <main className="flex-1">
                        {activeTab === "model" && <ModelConfig />}
                        {activeTab === "rag" && <RagSettingsTab />}
                        {activeTab === "debug" && <DebugSettingsTab />}
                        {(activeTab === "users" ||
                            activeTab === "roles" ||
                            activeTab === "group-mappings" ||
                            activeTab === "oauth") && isAdmin && <UsersPage />}
                        {activeTab === "mcp-servers" && isAdmin && <MCPServersTab />}
                        {activeTab === "categories" && isAdmin && <CategoriesTab />}
                        {activeTab === "templates" && isAdmin && <TemplatesSettingsTab />}
                    </main>
                </div>
            </div>
        </div>
    )
}
