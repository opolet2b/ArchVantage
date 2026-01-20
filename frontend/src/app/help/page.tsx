"use client"

import { useState, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Book, Settings, Wrench, Bot, GitGraph, FileText, LifeBuoy, RefreshCcw, Layout, ZoomIn, ZoomOut, Maximize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

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
        id: "canvases",
        title: "Canvases",
        icon: Layout,
        pages: [
            { id: "canvas-overview", title: "Overview", path: "canvases/overview" },
            { id: "canvas-things", title: "Things", path: "canvases/things" },
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
        id: "smart-analysis",
        title: "Smart Analysis",
        icon: FileText,
        pages: [
            { id: "sa-overview", title: "Overview", path: "smart-analysis/overview" },
            { id: "sa-modules", title: "Workbench Modules", path: "smart-analysis/workbench_modules" },
            { id: "sa-step-config", title: "Step Configuration", path: "smart-analysis/step_configuration" },
        ]
    },
    {
        id: "settings",
        title: "Settings",
        icon: Settings,
        pages: [
            { id: "config-name", title: "Configuration", path: "settings/config_name" },
            { id: "models", title: "Model Setup", path: "settings/local_model" },
            { id: "mcp-servers", title: "MCP Servers", path: "settings/mcp_server_url" },
        ]
    },
    {
        id: "troubleshooting",
        title: "Troubleshooting",
        icon: LifeBuoy,
        pages: [
            { id: "reset-tours", title: "Reset Guided Tours", path: "special/reset-tours" } // special path prefix
        ]
    }
]

export default function HelpPage() {
    const [activeTopic, setActiveTopic] = useState(HELP_TOPICS[0].id)
    const [activePage, setActivePage] = useState(HELP_TOPICS[0].pages[0])
    const [content, setContent] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    const handleResetTours = () => {
        // Find keys to remove
        const keysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith("trainer_dismissed_")) {
                keysToRemove.push(key)
            }
        }

        if (keysToRemove.length === 0) {
            toast({
                title: "No Hidden Tours",
                description: "All guided tours are already active.",
            })
            return
        }

        // Remove keys
        keysToRemove.forEach(key => localStorage.removeItem(key))

        toast({
            title: "Tours Reset",
            description: `Successfully reactivated ${keysToRemove.length} guided tours.`,
        })

        // Force a small delay then reload to ensure persistence clearing takes effect
        setTimeout(() => {
            window.location.reload()
        }, 1000)
    }

    // Fetch markdown content when page changes
    useEffect(() => {
        // Skip fetch for special pages
        if (activePage.path.startsWith("special/")) return

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
                            {activePage.id === "reset-tours" ? (
                                <div className="space-y-6">
                                    <div className="prose dark:prose-invert max-w-none text-sm text-foreground">
                                        <p>
                                            If you have previously dismissed the interactive guided tours (by checking "Don't show this guide again")
                                            and would like to see them again, you can reset your preferences here.
                                        </p>
                                        <p>
                                            This will reactivate <strong>all</strong> context guides across the application, including:
                                        </p>
                                        <ul>
                                            <li>Canvas Workspace Tour</li>
                                            <li>Tool Builder Walkthrough</li>
                                            <li>Agent Builder Guide</li>
                                        </ul>
                                    </div>
                                    <div className="pt-4 border-t">
                                        <Button onClick={handleResetTours} className="gap-2">
                                            <RefreshCcw className="h-4 w-4" />
                                            Reset All Guided Tours
                                        </Button>
                                    </div>
                                </div>
                            ) : isLoading ? (
                                <div className="space-y-4 animate-pulse">
                                    <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                                    <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                                    <div className="h-32 bg-slate-200 rounded"></div>
                                </div>
                            ) : (
                                <div className="prose dark:prose-invert max-w-none text-sm text-foreground">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        urlTransform={(url) => {
                                            if (url.startsWith("http") || url.startsWith("/") || url.startsWith("#")) return url;
                                            return `/help/${url}`;
                                        }}
                                        components={{
                                            img: ({ src, alt }) => {
                                                if (!src) return null;
                                                // Create a mini-component for state isolation
                                                const PanZoomImage = () => {
                                                    const [scale, setScale] = useState(1);
                                                    const [position, setPosition] = useState({ x: 0, y: 0 });
                                                    const [isDragging, setIsDragging] = useState(false);
                                                    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

                                                    const handleZoomIn = () => setScale(s => Math.min(s + 0.5, 4));
                                                    const handleZoomOut = () => setScale(s => Math.max(s - 0.5, 1));
                                                    const handleReset = () => {
                                                        setScale(1);
                                                        setPosition({ x: 0, y: 0 });
                                                    };

                                                    const handleWheel = (e: React.WheelEvent) => {
                                                        e.stopPropagation();
                                                        if (e.deltaY < 0) handleZoomIn();
                                                        else handleZoomOut();
                                                    };

                                                    const handleMouseDown = (e: React.MouseEvent) => {
                                                        if (scale > 1) {
                                                            setIsDragging(true);
                                                            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
                                                        }
                                                    };

                                                    const handleMouseMove = (e: React.MouseEvent) => {
                                                        if (isDragging && scale > 1) {
                                                            setPosition({
                                                                x: e.clientX - dragStart.x,
                                                                y: e.clientY - dragStart.y
                                                            });
                                                        }
                                                    };

                                                    const handleMouseUp = () => setIsDragging(false);

                                                    return (
                                                        <Dialog>
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <DialogTrigger asChild>
                                                                            <img
                                                                                src={src}
                                                                                alt={alt}
                                                                                className="rounded-md border shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity max-w-full"
                                                                            />
                                                                        </DialogTrigger>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>Click to expand</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                            <DialogContent className="max-w-[90vw] max-h-[90vh] w-[90vw] h-[90vh] p-0 overflow-hidden bg-transparent border-none shadow-none flex items-center justify-center outline-none">
                                                                {/* Controls */}
                                                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/80 p-2 rounded-lg shadow-xl backdrop-blur-sm border border-slate-700">
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-slate-700 hover:text-white" onClick={handleZoomOut}>
                                                                        <ZoomOut className="h-4 w-4" />
                                                                    </Button>
                                                                    <span className="text-xs text-slate-300 min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-slate-700 hover:text-white" onClick={handleZoomIn}>
                                                                        <ZoomIn className="h-4 w-4" />
                                                                    </Button>
                                                                    <div className="w-px h-4 bg-slate-600 mx-1" />
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-slate-700 hover:text-white" onClick={handleReset} title="Reset View">
                                                                        <Maximize2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>

                                                                {/* Image Container */}
                                                                <div
                                                                    className={cn(
                                                                        "w-full h-full flex items-center justify-center overflow-hidden",
                                                                        scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                                                                    )}
                                                                    onWheel={handleWheel}
                                                                    onMouseDown={handleMouseDown}
                                                                    onMouseMove={handleMouseMove}
                                                                    onMouseUp={handleMouseUp}
                                                                    onMouseLeave={handleMouseUp}
                                                                >
                                                                    <img
                                                                        src={src}
                                                                        alt={alt}
                                                                        className="max-w-full max-h-full object-contain transition-transform duration-100 ease-out select-none pointer-events-none"
                                                                        style={{
                                                                            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`
                                                                        }}
                                                                    />
                                                                </div>
                                                            </DialogContent>
                                                        </Dialog>
                                                    );
                                                };
                                                return <PanZoomImage />;
                                            }
                                        }}
                                    >
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
