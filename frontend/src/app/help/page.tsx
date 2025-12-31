"use client"

import { useState, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Book, Settings, Wrench, Bot, GitGraph, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

// Define available help topics and their markdown paths
const HELP_TOPICS = [
    {
        id: "getting-started",
        title: "Getting Started",
        icon: Book,
        pages: [
            { id: "overview", title: "Overview", path: "overview" },
        ]
    },
    {
        id: "tools",
        title: "Tools & Integrations",
        icon: Wrench,
        pages: [
            { id: "create-tool", title: "Creating Tools", path: "tools/create_tool" },
            { id: "tool-editor-name", title: "Tool Naming", path: "tool-editor/name" },
            { id: "tool-editor-desc", title: "Tool Descriptions", path: "tool-editor/description" },
            { id: "tool-editor-schema", title: "Input Schema", path: "tool-editor/input_schema" },
        ]
    },
    {
        id: "agents",
        title: "Agent Builder",
        icon: Bot,
        pages: [
            { id: "agent-name", title: "Agent Identity", path: "agent-builder/agent_name" },
            { id: "model-selector", title: "Model Selection", path: "agent-builder/model_selector" },
            { id: "call-tool", title: "Tool Invocation", path: "agent-builder/call_tool_description" },
            { id: "llm-decision", title: "Decision Logic", path: "agent-builder/llm_decision_instruction" },
            { id: "json-mapping", title: "Data Mapping", path: "agent-builder/json_mapping_template" },
        ]
    },
    {
        id: "workflow",
        title: "Workflows",
        icon: GitGraph,
        pages: [
            { id: "workflow-editor", title: "Editor Overview", path: "workflow/editor_overview" },
        ]
    },
    {
        id: "settings",
        title: "Settings & Config",
        icon: Settings,
        pages: [
            { id: "config-name", title: "Configuration", path: "settings/config_name" },
            { id: "models", title: "Model Setup", path: "settings/local_model" },
            { id: "mcp-servers", title: "MCP Servers", path: "settings/mcp_server_url" },
        ]
    },
    {
        id: "smart-analysis",
        title: "Smart Analysis",
        icon: FileText,
        pages: [
            { id: "sa-overview", title: "Overview", path: "smart-analysis/overview" },
            { id: "sa-modules", title: "Workbench Modules", path: "smart-analysis/workbench_modules" },
            { id: "sa-step-config", title: "Step Configuration", path: "smart-analysis/step_configuration" },
        ]
    }
]

export default function HelpPage() {
    const [activeTopic, setActiveTopic] = useState(HELP_TOPICS[0].id)
    const [activePage, setActivePage] = useState(HELP_TOPICS[0].pages[0])
    const [content, setContent] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    // Fetch markdown content when page changes
    useEffect(() => {
        const fetchContent = async () => {
            setIsLoading(true)
            try {
                // Determine path: support both relative paths (for existing tooltips) and new direct overview paths
                // If path doesn't contain '/', assume it's a top-level overview (we might need to create these)
                const fullPath = activePage.path.includes("/")
                    ? `/help/${activePage.path}.md`
                    : `/help/${activePage.path}.md`

                const res = await fetch(fullPath)
                if (res.ok) {
                    setContent(await res.text())
                } else {
                    setContent(`# Error\n\nCould not load help content for **${activePage.title}**.`)
                }
            } catch (error) {
                console.error("Failed to load help", error)
                setContent("# Error\n\nFailed to load content.")
            } finally {
                setIsLoading(false)
            }
        }

        fetchContent()
    }, [activePage])

    return (
        <div className="flex h-screen bg-background">
            {/* Sidebar */}
            <div className="w-64 border-r bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
                <div className="p-4 border-b">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Book className="h-5 w-5 text-blue-600" />
                        Documentation
                    </h1>
                </div>
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-6">
                        {HELP_TOPICS.map(topic => (
                            <div key={topic.id}>
                                <h3 className="mb-2 px-2 text-sm font-semibold tracking-tight flex items-center gap-2 text-muted-foreground">
                                    <topic.icon className="h-4 w-4" />
                                    {topic.title}
                                </h3>
                                <div className="space-y-1">
                                    {topic.pages.map(page => (
                                        <Button
                                            key={page.id}
                                            variant={activePage.id === page.id ? "secondary" : "ghost"}
                                            size="sm"
                                            className={cn(
                                                "w-full justify-start",
                                                activePage.id === page.id && "bg-white dark:bg-slate-800 shadow-sm"
                                            )}
                                            onClick={() => {
                                                setActiveTopic(topic.id)
                                                setActivePage(page)
                                            }}
                                        >
                                            {page.title}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <ScrollArea className="flex-1 p-8">
                    <Card className="max-w-3xl mx-auto shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl">{activePage.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-4 animate-pulse">
                                    <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                                    <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                                    <div className="h-32 bg-slate-200 rounded"></div>
                                </div>
                            ) : (
                                <div className="prose dark:prose-invert max-w-none text-sm text-foreground">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </ScrollArea>
            </div>
        </div>
    )
}
