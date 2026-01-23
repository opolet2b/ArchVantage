"use client"

import { useState } from "react"
import { CanvasThing, useCanvasStore } from "../canvas-store"
import { Button } from "@/components/ui/button"
import { Play, Settings2, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { cn, API_URL } from "@/lib/utils"
import { MCPToolConfigDialog, MCPToolConfig } from "../mcp-tool-config-dialog"
import { MarkdownViewer } from "./markdown-viewer"

interface MCPToolViewerProps {
    thing: CanvasThing
    onResize?: () => void
}

export function MCPToolViewer({ thing, onResize }: MCPToolViewerProps) {
    const { things, links, updateThing } = useCanvasStore()
    const content = thing.content as any
    const [isConfigOpen, setIsConfigOpen] = useState(false)
    const [isRunning, setIsRunning] = useState(false)

    // Derived state
    const status = content.status || "ready" // ready, running, completed, error
    const result = content.result
    const error = content.error

    // Config Display
    const serverName = content.server_name || "Unknown Server"
    const toolName = content.tool_name || "Unknown Tool"
    const args = content.arguments || {}
    const mappings = content.argument_mappings || {}

    // Find connected nodes
    const incomingLinks = links.filter(l => l.target_id === thing.id)
    const sourceNodes = incomingLinks.map(l => things.find(t => t.id === l.source_id)).filter(Boolean)

    const resolveMappings = () => {
        const resolvedArgs = { ...args }

        Object.entries(mappings).forEach(([arg, mapping]: [string, any]) => {
            const sourceNode = things.find(t => t.id === mapping.source_id)
            if (!sourceNode) return

            // Simple resolution logic
            let value = null
            if (sourceNode.type === "text" || sourceNode.type === "message") {
                // Text content
                value = (sourceNode.content as any).text || (sourceNode.content as any).content || ""
            } else if (sourceNode.type === "table" || sourceNode.type === "database") {
                // Structured content
                const data = (sourceNode.content as any).data || (sourceNode.content as any).rows || []
                if (mapping.field_selector) {
                    // Try to extract column? For now, we might just pass the whole data if selector is complex
                    // Or if selector is "email", map to array of emails? 
                    // Let's assume simplest case: Pass the JSON of the data for now if complex
                    // Or if specific field implementation is needed later. 
                    // For the demo/prototype, let's grab the whole data structure.
                    value = data
                } else {
                    value = data
                }
            } else {
                // Fallback
                value = sourceNode.content
            }

            // If value found, override
            if (value !== null) {
                resolvedArgs[arg] = value
            }
        })
        return resolvedArgs
    }

    const handleRun = async () => {
        if (!content.server_id || !content.tool_name) return

        setIsRunning(true)
        // Optimistic update to show loading state
        updateThing(thing.id, { content: { ...content, status: "running", error: null } })
            .catch(e => console.error("Failed to set running status:", e));

        try {
            // Resolve inputs
            const finalArgs = resolveMappings()
            const token = localStorage.getItem("token")

            // Setup timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

            try {
                const res = await fetch(`${API_URL}/mcp-servers/${content.server_id}/tools/execute?tool_name=${encodeURIComponent(content.tool_name)}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify(finalArgs),
                    signal: controller.signal
                })

                clearTimeout(timeoutId);

                if (!res.ok) {
                    const errorText = await res.text()
                    console.error("[MCP] Server error:", res.status, errorText);
                    try {
                        const errorJson = JSON.parse(errorText)
                        throw new Error(errorJson.detail || `Server error: ${res.status}`)
                    } catch {
                        throw new Error(errorText || `Server error: ${res.status}`)
                    }
                }

                const data = await res.json()
                await updateThing(thing.id, {
                    content: {
                        ...content,
                        status: "completed",
                        result: data,
                        error: null
                    }
                })

                onResize?.()
            } catch (fetchErr: any) {
                clearTimeout(timeoutId);
                if (fetchErr.name === 'AbortError') {
                    throw new Error("Execution timed out after 30s");
                }
                throw fetchErr;
            }

        } catch (err: any) {
            console.error("MCP Execution Error:", err)
            const errorMessage = err?.message || String(err) || "Unknown error occurred";

            await updateThing(thing.id, {
                content: {
                    ...content,
                    status: "error",
                    error: errorMessage
                }
            }).catch(e => console.error("Failed to update thing with error:", e));

        } finally {
            setIsRunning(false)
        }
    }

    const handleConfigConfirm = (newConfig: MCPToolConfig) => {
        // Update thing config
        updateThing(thing.id, {
            content: {
                ...content,
                ...newConfig,
                status: "ready", // Reset status on config change
                result: null,
                error: null
            }
        })
    }

    // Determine how to render result
    const renderResult = () => {
        if (!result) return null

        // If generic object/array, pretty print JSON
        if (typeof result === "object") {
            // Check for specific MCP Content patterns (e.g. { content: [{ type: "text", text: "..." }] })
            if (Array.isArray(result) && result.length > 0 && result[0].type === "text") {
                // It's a standard MCP Text Content
                const text = result.map((c: any) => c.text).join("\n")
                return <MarkdownViewer content={text} ancestorIds={[thing.id]} />
            }
            if (result.content && Array.isArray(result.content)) {
                // Common wrapper
                const text = result.content.map((c: any) => c.type === 'text' ? c.text : '').join("\n")
                return <MarkdownViewer content={text} ancestorIds={[thing.id]} />
            }

            // Fallback JSON-like
            return (
                <pre className="bg-slate-100 dark:bg-slate-900 p-3 rounded text-xs font-mono overflow-auto max-h-[400px]">
                    {JSON.stringify(result, null, 2)}
                </pre>
            )
        }

        // String
        return <MarkdownViewer content={String(result)} ancestorIds={[thing.id]} />
    }

    return (
        <div className="flex flex-col h-full w-full">
            {/* Header / Meta Info */}
            <div className="bg-slate-50 dark:bg-slate-900 border-b p-3 flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">{serverName}</span>
                    <span className="text-sm font-medium">{toolName}</span>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsConfigOpen(true)}>
                        <Settings2 className="h-4 w-4" />
                    </Button>
                    <Button
                        size="sm"
                        className={cn("h-8 gap-2", status === "running" && "opacity-80")}
                        onClick={handleRun}
                        disabled={status === "running"}
                    >
                        {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        Run
                    </Button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {/* Arguments Summary */}
                {(Object.keys(args).length > 0 || Object.keys(mappings).length > 0) && (
                    <div className="text-xs text-muted-foreground bg-slate-50/50 dark:bg-slate-800/10 p-2 rounded border border-dashed">
                        {Object.keys(args).length > 0 && (
                            <div className="mb-2">
                                <span className="font-semibold block mb-1">Static Arguments:</span>
                                <code className="block whitespace-pre-wrap font-mono">
                                    {JSON.stringify(args, null, 2).replace(/[\{\}"]/g, '').trim()}
                                </code>
                            </div>
                        )}
                        {Object.keys(mappings).length > 0 && (
                            <div>
                                <span className="font-semibold block mb-1">Mapped Arguments:</span>
                                <div className="space-y-1">
                                    {Object.entries(mappings).map(([key, map]: [string, any]) => {
                                        const source = things.find(t => t.id === map.source_id)
                                        return (
                                            <div key={key} className="flex justify-between">
                                                <span>{key}</span>
                                                <span className="font-medium text-blue-600">← {source?.title || "Unknown Tool"}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Status / Result */}
                {status === "error" && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded flex items-start gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-semibold">Execution Failed</p>
                            <p className="opacity-90">{error}</p>
                        </div>
                    </div>
                )}

                {status === "completed" && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-green-600 text-xs font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            Success
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            {renderResult()}
                        </div>
                    </div>
                )}
            </div>

            <MCPToolConfigDialog
                open={isConfigOpen}
                onOpenChange={setIsConfigOpen}
                onConfirm={handleConfigConfirm}
                mode={sourceNodes.length > 0 ? "mapping" : "run"}
                existingConfig={{
                    server_id: content.server_id,
                    server_name: content.server_name,
                    tool_name: content.tool_name,
                    arguments: content.arguments,
                    argument_mappings: content.argument_mappings
                }}
                inputSchema={content.inputSchema}
                sourceNodes={sourceNodes}
            />
        </div>
    )
}
