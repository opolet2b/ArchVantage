"use client"

import * as React from "react"
import { Play, Settings, Bot, Loader2, CheckCircle2, AlertCircle, Link as LinkIcon, Wand2, Sparkles, BrainCircuit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useCanvasStore, CanvasThing } from "../canvas-store"
import { API_URL, cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import { AgentToolConfigDialog, AgentToolConfig } from "../agent-tool-config-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Maximize2, Terminal } from "lucide-react"

interface AgentToolViewerProps {
    thing: CanvasThing
}

export function AgentToolViewer({ thing }: AgentToolViewerProps) {
    const { toast } = useToast()
    const { updateThing, addThing, addLink, things, links, selectedModel } = useCanvasStore()
    const content = thing.content as any
    const blueprintId = content.blueprint_id
    const blueprintName = content.blueprint_name || "Agent"
    const argMappings = content.argument_mappings || {}
    const status = content.status || "ready"
    const lastResultId = content.last_result_id
    const executionLogs = content.logs || []

    const [isExecuting, setIsExecuting] = React.useState(false)
    const [showConfig, setShowConfig] = React.useState(false)
    const [showLogs, setShowLogs] = React.useState(false)
    const [activeLogs, setActiveLogs] = React.useState<any[]>([])
    const [isLogsExpanded, setIsLogsExpanded] = React.useState(false)
    const logContainerRef = React.useRef<HTMLDivElement>(null)

    // Auto-scroll logs to bottom
    React.useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
        }
    }, [activeLogs, executionLogs, showLogs])

    // --- SCHEMA SYNC LOGIC ---
    // Filter out mappings that are no longer in the inputSchema to avoid "stale" fields showing up
    const inputSchema = content.inputSchema || { properties: {} }
    const schemaProperties = inputSchema.properties || {}
    const activeArgMappings = React.useMemo(() => {
        const filtered: Record<string, any> = {}
        for (const [key, value] of Object.entries(argMappings)) {
            if (schemaProperties[key]) {
                filtered[key] = value
            }
        }
        return filtered
    }, [argMappings, schemaProperties])

    // Helper to parse columns from raw text content (for nodes without structured data)
    const parseTextToTable = (text: string) => {
        if (!text || typeof text !== 'string') return null;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        let headerIdx = -1;
        let headers: string[] = [];
        let strategy: 'markdown' | 'spaces' | null = null;
        
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            const line = lines[i];
            if (line.startsWith('--- Sheet:') || line.startsWith('Table Data')) continue;
            
            if (i + 1 < lines.length && lines[i+1].includes('|') && lines[i+1].includes('---')) {
                headers = line.split('|').map(h => h.trim()).filter(h => h);
                headerIdx = i;
                strategy = 'markdown';
                break;
            }
            const spaces = line.split(/\s{2,}/).map(h => h.trim()).filter(h => h);
            if (spaces.length > 1) {
                headers = spaces;
                headerIdx = i;
                strategy = 'spaces';
                break;
            }
        }
        
        if (headerIdx === -1) return null;
        
        const dataRows = lines.slice(headerIdx + (strategy === 'markdown' ? 2 : 1)).map(line => {
            if (strategy === 'markdown') return line.split('|').map(h => h.trim()).filter(h => h);
            return line.split(/\s{2,}/).map(h => h.trim()).filter(h => h);
        }).filter(r => r.length > 0);
        
        return { headers, rows: dataRows };
    }

    const handleRunAgent = async () => {
        setIsExecuting(true)
        setShowLogs(true)
        setActiveLogs([])
        let localLogs: any[] = []
        
        updateThing(thing.id, { 
            content: { 
                ...content, 
                status: "running",
                logs: [] // Clear previous logs
            } 
        })

        try {
            const token = localStorage.getItem("token")
            const isBatch = content.is_batch
            const batchSourceId = content.batch_source_id
            const batchSourceNode = isBatch ? things.find(t => t.id === batchSourceId) : null
            const rows = (batchSourceNode?.content as any)?.rows || []

            if (isBatch && rows.length === 0) {
                throw new Error("Batch source table has no rows.")
            }

            // --- BATCH MODE ---
            if (isBatch) {
                toast({
                    title: "Starting Batch Execution",
                    description: `Processing ${rows.length} rows...`
                })

                const results = []
                const batchSize = 3 // Concurrency limit
                
                for (let i = 0; i < rows.length; i += batchSize) {
                    const chunk = rows.slice(i, i + batchSize)
                    const promises = chunk.map(async (row: any, index: number) => {
                        const rowIndex = i + index
                        
                        // Resolve inputs for THIS row
                        const resolvedInputs = { ...(content.arguments || {}) }
                        for (const [argName, mapping] of Object.entries(argMappings)) {
                            const map = mapping as any
                            const sourceNode = things.find(t => t.id === map.source_id)
                            
                            if (sourceNode) {
                                let value: any = null
                                const nodeContent = sourceNode.content as any
                                let nodeData = nodeContent?.data || nodeContent?.rows || []
                                
                                // Fallback: parse from text if structured data is missing
                                if (nodeData.length === 0 && (nodeContent?.text_content || nodeContent?.text)) {
                                    const parsed = parseTextToTable(nodeContent.text_content || nodeContent.text);
                                    if (parsed) {
                                        // Construct a header-inclusive nodeData for indexing
                                        nodeData = [parsed.headers, ...parsed.rows];
                                    }
                                }

                                // Special case: mapping is to the batch source table
                                if (sourceNode.id === batchSourceId && map.field_selector) {
                                    if (Array.isArray(row)) {
                                        // Row is from data (array of arrays). Find index of field_selector in header.
                                        const header = nodeData[0]
                                        if (Array.isArray(header)) {
                                            const colIndex = header.findIndex(h => (typeof h === 'string' ? h : String(h)) === map.field_selector)
                                            if (colIndex !== -1) value = row[colIndex]
                                        }
                                    } else if (typeof row === 'object' && row !== null) {
                                        value = row[map.field_selector]
                                    }
                                } else {
                                    // Regular mapping (static for all rows)
                                    if (map.field_selector && Array.isArray(nodeData) && nodeData.length > 0) {
                                        const header = nodeData[0]
                                        if (Array.isArray(header)) {
                                            const colIndex = header.findIndex(h => (typeof h === 'string' ? h : String(h)) === map.field_selector)
                                            if (colIndex !== -1) {
                                                value = nodeData.slice(1).map(r => Array.isArray(r) ? r[colIndex] : null)
                                            }
                                        } else if (typeof header === 'object' && header !== null) {
                                            value = nodeData.map(r => r[map.field_selector])
                                        }
                                    } else {
                                        // Prefer structured data
                                        if (nodeData && Array.isArray(nodeData) && nodeData.length > 0) value = nodeData
                                        else if (sourceNode.type === "text") value = nodeContent?.text
                                        else if (sourceNode.type === "document") value = nodeContent?.text_content || nodeContent?.text || nodeContent?.content
                                        else if (sourceNode.type === "table") value = nodeData
                                        else if (sourceNode.type === "agent_result") value = nodeContent?.result || nodeContent?.output
                                        else if (sourceNode.type === "url") value = nodeContent?.url || nodeContent?.text
                                        else if (sourceNode.type === "form_tool") value = nodeContent?.values || nodeContent?.populatedSchema?.data || null
                                        else value = nodeContent
                                    }
                                }
                                
                                if (value !== null && value !== undefined) {
                                    resolvedInputs[argName] = value
                                }
                            }
                        }

                        // Execute
                        const response = await fetch(`${API_URL}/agent-blueprints/${blueprintId}/execute`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                inputs: resolvedInputs,
                                model: selectedModel || undefined,
                                mode: "production"
                            })
                        })

                        if (!response.ok) return { error: `Row ${rowIndex + 1} failed` }
                        const data = await response.json()
                        return { 
                            row_index: rowIndex, 
                            inputs: resolvedInputs, 
                            outputs: data.outputs,
                            status: data.status
                        }
                    })

                    const chunkResults = await Promise.all(promises)
                    results.push(...chunkResults)
                    
                    // Collect logs from chunk results if any
                    chunkResults.forEach(r => {
                        if (r.logs) newLogs.push(...r.logs)
                    })
                    if (newLogs.length > 0) {
                         updateThing(thing.id, { content: { ...content, status: "running", logs: [...newLogs] } })
                    }
                }

                // Create a Result Table
                const resultRows = results.map((r: any) => ({
                    ...(typeof r.inputs === 'object' ? r.inputs : { input: r.inputs }),
                    ...(typeof r.outputs === 'object' ? r.outputs : { output: r.outputs }),
                    _row_status: r.status || "failed"
                }))

                const columns = Object.keys(resultRows[0] || {}).map(key => ({
                    name: key,
                    label: key.replace(/_/g, ' ').toUpperCase(),
                    type: "string"
                }))

                const resultThing = await addThing(
                    "table",
                    {
                        rows: resultRows,
                        columns: columns,
                        agent_id: thing.id,
                        is_batch_result: true,
                        source_table_id: batchSourceId
                    },
                    { x: thing.position_x + (thing.width || 400) + 50, y: thing.position_y },
                    undefined,
                    undefined,
                    `Batch Result: ${blueprintName}`
                )

                if (resultThing) {
                    await addLink(thing.id, resultThing.id, "related", "Batch Output", "Consolidated output from batch execution")
                    updateThing(thing.id, { 
                        content: { 
                            ...content, 
                            status: "ready",
                            last_result_id: resultThing.id 
                        } 
                    })
                }

            } else {
                // --- SINGLE EXECUTION MODE ---
                // 1. Resolve inputs from linked nodes
                const resolvedInputs = { ...(content.arguments || {}) }
                
                // For each mapping, find the source node and get its content
                for (const [argName, mapping] of Object.entries(argMappings)) {
                    const map = mapping as any
                    const sourceNode = things.find(t => t.id === map.source_id)
                    
                    if (sourceNode) {
                        let value: any = null
                        const nodeContent = sourceNode.content as any
                        let nodeData = nodeContent?.data || nodeContent?.rows || []
                        
                        // Fallback: parse from text if structured data is missing
                        if (nodeData.length === 0 && (nodeContent?.text_content || nodeContent?.text)) {
                            const parsed = parseTextToTable(nodeContent.text_content || nodeContent.text);
                            if (parsed) {
                                nodeData = [parsed.headers, ...parsed.rows];
                            }
                        }

                        if (map.field_selector && Array.isArray(nodeData) && nodeData.length > 0) {
                            const header = nodeData[0]
                            if (Array.isArray(header)) {
                                const colIndex = header.findIndex(h => (typeof h === 'string' ? h : String(h)) === map.field_selector)
                                if (colIndex !== -1) {
                                    // Extract column values (skip header)
                                    value = nodeData.slice(1).map(r => Array.isArray(r) ? r[colIndex] : null)
                                }
                            } else if (typeof header === 'object' && header !== null) {
                                value = nodeData.map(r => r[map.field_selector])
                            }
                        } else {
                            // If no specific field selected, prefer structured data (rows/data) over raw text
                            if (nodeData && Array.isArray(nodeData) && nodeData.length > 0) {
                                value = nodeData
                            } else if (sourceNode.type === "text") {
                                value = nodeContent?.text
                            } else if (sourceNode.type === "document") {
                                value = nodeContent?.text_content || nodeContent?.text || nodeContent?.content
                            } else if (sourceNode.type === "table") {
                                value = nodeData
                            } else if (sourceNode.type === "agent_result") {
                                value = nodeContent?.result || nodeContent?.output
                            } else if (sourceNode.type === "url") {
                                value = nodeContent?.url || nodeContent?.text
                            } else if (sourceNode.type === "message") {
                                value = nodeContent?.text || nodeContent?.content
                            } else if (sourceNode.type === "form_tool") {
                                value = nodeContent?.values || nodeContent?.populatedSchema?.data || null
                            } else {
                                value = nodeContent
                            }
                        }
                        
                        if (value !== null && value !== undefined) {
                            resolvedInputs[argName] = value
                        }
                    }
                }

                // 2. Execute Blueprint (Streaming)
                console.log("[AGENT] Executing with resolved inputs:", resolvedInputs);
                
                const response = await fetch(`${API_URL}/agent-blueprints/${blueprintId}/execute/stream`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        inputs: resolvedInputs,
                        model: selectedModel || undefined,
                        mode: "production"
                    })
                })

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ detail: "Unknown error" }))
                    throw new Error(errData.detail || "Agent execution failed")
                }

                // Handle Stream
                const reader = response.body?.getReader()
                if (!reader) throw new Error("Response body not readable")
                const decoder = new TextDecoder()
                let buffer = ""
                let resultData: any = null

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split("\n")
                    buffer = lines.pop() || ""

                    for (let line of lines) {
                        line = line.trim();
                        if (!line) continue;
                        
                        try {
                            // Support both SSE (data: {json}) and NDJSON ({json})
                            const jsonStr = line.startsWith("data: ") 
                                ? line.substring(6).trim() 
                                : line;
                            
                            if (!jsonStr || !jsonStr.startsWith("{")) continue;
                            
                            const event = JSON.parse(jsonStr);
                            console.log("[AGENT STREAM]", event.type, event);

                            if (event.type === "log") {
                                const log = {
                                    level: event.level || 'info',
                                    message: event.message,
                                    timestamp: new Date().toISOString(),
                                    node_id: event.node_id,
                                    node_label: event.node_label
                                };
                                localLogs.push(log);
                                setActiveLogs([...localLogs]);
                            } else if (event.type === "step" || event.type === "step_start" || event.type === "progress") {
                                // Real-time trace update
                                const message = event.type === "step" 
                                    ? `Completed ${event.node_label || event.node_type}`
                                    : event.type === "progress"
                                        ? event.message
                                        : `Starting ${event.node_label || event.node_type}`;
                                    
                                const log = {
                                    level: 'info',
                                    message: message,
                                    timestamp: new Date().toISOString(),
                                    node_id: event.node_id,
                                    node_label: event.node_label
                                };
                                localLogs.push(log);
                                setActiveLogs([...localLogs]);
                            } else if (event.type === "complete" || event.type === "paused") {
                                resultData = event.data || event;
                            } else if (event.type === "error") {
                                const log = {
                                    level: 'error',
                                    message: event.message || "Streaming error",
                                    timestamp: new Date().toISOString()
                                };
                                localLogs.push(log);
                                setActiveLogs([...localLogs]);
                                throw new Error(event.message || "Streaming error");
                            }
                        } catch (e: any) {
                            console.error("Stream processing error:", e);
                            if (e.message !== "Unexpected token 'd' in JSON at position 0") { // Ignore partial line errors
                                const log = {
                                    level: 'error',
                                    message: e.message,
                                    timestamp: new Date().toISOString()
                                };
                                localLogs.push(log);
                                setActiveLogs([...localLogs]);
                                // Re-throw to stop the while loop
                                throw e;
                            }
                        }
                    }
                }

                if (!resultData) throw new Error("No result returned from stream");
                if (resultData.status === "failed") throw new Error(resultData.error || "Agent execution failed");
                
                // Final result handling...
                console.log("[AGENT] Execution complete. Status:", resultData.status);
                console.log("[AGENT] Final Outputs:", resultData.outputs);
                
                const finalLog = {
                    level: 'info' as const,
                    message: `Execution complete. Status: ${resultData.status}. Outputs found: ${Object.keys(resultData.outputs || {}).join(', ')}`,
                    timestamp: new Date().toISOString()
                };
                localLogs.push(finalLog);
                setActiveLogs([...localLogs]);

                // 3. Create Result Node
                const resultThing = await addThing(
                    "agent_result",
                    {
                        result: resultData.outputs,
                        agent_id: thing.id,
                        execution_id: resultData.execution_id,
                        status: resultData.status
                    },
                    { x: thing.position_x + (thing.width || 400) + 50, y: thing.position_y },
                    undefined,
                    undefined,
                    `Result: ${blueprintName}`
                )

                if (resultThing) {
                    // Link result to agent
                    await addLink(thing.id, resultThing.id, "related", "Output", "Output from agent execution")
                    
                    updateThing(thing.id, { 
                        content: { 
                            ...content, 
                            status: "ready",
                            last_result_id: resultThing.id,
                            logs: localLogs
                        } 
                    })
                }
            }

            toast({
                title: "Execution Complete",
                description: `Agent ${blueprintName} finished successfully.`
            })

        } catch (err: any) {
            console.error("Agent Run Error:", err)
            updateThing(thing.id, { 
                content: { 
                    ...content, 
                    status: "error", 
                    error: err.message,
                    logs: newLogs.length > 0 ? newLogs : executionLogs
                } 
            })
            toast({
                title: "Execution Failed",
                description: err.message,
                variant: "destructive"
            })
        } finally {
            setIsExecuting(false)
        }
    }

    const handleUpdateConfig = (newConfig: AgentToolConfig) => {
        updateThing(thing.id, {
            title: newConfig.blueprint_name,
            content: {
                ...content,
                blueprint_id: newConfig.blueprint_id,
                blueprint_name: newConfig.blueprint_name,
                arguments: newConfig.arguments,
                argument_mappings: newConfig.argument_mappings,
                inputSchema: newConfig.inputSchema,
                is_batch: newConfig.is_batch,
                batch_source_id: newConfig.batch_source_id,
                status: "ready"
            }
        })
        setShowConfig(false)
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
            {/* Premium Header */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                        <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{blueprintName}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                           {status === "running" ? (
                                <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-blue-50 text-blue-600 border-blue-200 animate-pulse">
                                    <Loader2 className="h-2 w-2 animate-spin mr-1" /> RUNNING
                                </Badge>
                           ) : status === "error" ? (
                                <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-rose-50 text-rose-600 border-rose-200">
                                    <AlertCircle className="h-2 w-2 mr-1" /> ERROR
                                </Badge>
                           ) : (
                                <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200">
                                    <CheckCircle2 className="h-2 w-2 mr-1" /> READY
                                </Badge>
                           )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 hover:bg-slate-200 dark:hover:bg-slate-800"
                                    onClick={() => setShowConfig(true)}
                                >
                                    <Settings className="h-4 w-4 text-slate-500" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Configure Mappings</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-5 overflow-y-auto space-y-6">
                {/* Visual Mapping Overview */}
                <div className="space-y-3">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Input Mappings</Label>
                    <div className="grid grid-cols-1 gap-2">
                        {Object.entries(activeArgMappings).length > 0 ? (
                            Object.entries(activeArgMappings).map(([arg, map]: [string, any]) => {
                                const sourceNode = things.find(t => t.id === map.source_id)
                                return (
                                    <div key={arg} className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 group transition-all hover:border-indigo-200 dark:hover:border-indigo-900">
                                        <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-bold text-slate-900 dark:text-slate-200 truncate capitalize">{arg.replace(/_/g, ' ')}</div>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                                                <LinkIcon className="h-2.5 w-2.5" />
                                                {sourceNode?.title || sourceNode?.label || "Unknown Source"}
                                            </div>
                                        </div>
                                        {map.confidence && (
                                            <div className={cn(
                                                "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                                                map.confidence > 0.8 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                            )}>
                                                {Math.round(map.confidence * 100)}%
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center py-6 text-center space-y-2 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                                <Wand2 className="h-5 w-5 text-slate-300" />
                                <p className="text-[10px] text-slate-500 italic">No dynamic mappings configured.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Execution Stats / Info */}
                <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30 space-y-3">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-3 w-3 text-indigo-500" />
                        <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Agent Intelligence</span>
                    </div>
                    <p className="text-[11px] text-indigo-600/80 dark:text-indigo-400/80 leading-relaxed">
                        This agent processes content from {Object.keys(activeArgMappings).length} sources using the {blueprintName} blueprint.
                    </p>
                </div>

                {/* Execution Trace (New) */}
                {(activeLogs.length > 0 || executionLogs.length > 0 || isExecuting) && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Execution Trace</Label>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-5 w-5 p-0 text-slate-400 hover:text-indigo-500"
                                    onClick={() => setIsLogsExpanded(true)}
                                >
                                    <Maximize2 className="h-3 w-3" />
                                </Button>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-[10px] text-slate-500"
                                onClick={() => setShowLogs(!showLogs)}
                            >
                                {showLogs ? "Hide" : "Show"}
                            </Button>
                        </div>
                        
                        {showLogs && (
                            <div 
                                ref={logContainerRef}
                                className="bg-slate-900 rounded-xl p-3 font-mono text-[10px] space-y-2 border border-slate-800 max-h-[200px] overflow-y-auto custom-scrollbar"
                            >
                                {activeLogs.length === 0 && executionLogs.length === 0 && isExecuting && (
                                    <div className="text-slate-500 animate-pulse">Initializing execution engine...</div>
                                )}
                                {(activeLogs.length > 0 ? activeLogs : executionLogs).map((log, i) => (
                                    <div key={i} className={cn(
                                        "flex gap-2",
                                        log.level === "error" ? "text-rose-400" : 
                                        log.level === "warning" ? "text-amber-400" : 
                                        log.level === "debug" ? "text-slate-500" : "text-emerald-400"
                                    )}>
                                        <span className="shrink-0 opacity-40">[{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span>
                                        <span className="flex-1 break-words">
                                            {log.node_label && <span className="font-bold mr-1">[{log.node_label}]</span>}
                                            {log.message}
                                        </span>
                                    </div>
                                ))}
                                {isExecuting && (
                                    <div className="flex items-center gap-2 text-indigo-400 animate-pulse">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        <span>Step in progress...</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer Action */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t dark:border-slate-800 flex items-center gap-2">
                <Button 
                    className={cn(
                        "flex-1 gap-2 font-bold shadow-lg transition-all active:scale-95",
                        status === "running" ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 dark:shadow-none"
                    )}
                    onClick={handleRunAgent}
                    disabled={status === "running"}
                >
                    {status === "running" ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            EXECUTING...
                        </>
                    ) : (
                        <>
                            <Play className="h-3.5 w-3.5 fill-current" />
                            RUN AGENT
                        </>
                    )}
                </Button>
                
                {lastResultId && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-10 w-10 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900"
                                    onClick={() => {
                                        const node = document.querySelector(`[data-id="${lastResultId}"]`) as HTMLElement
                                        node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                    }}
                                >
                                    <BrainCircuit className="h-4 w-4 text-indigo-500" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Last Result</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            {/* Config Dialog */}
            <AgentToolConfigDialog 
                open={showConfig}
                onOpenChange={setShowConfig}
                onConfirm={handleUpdateConfig}
                mode="mapping"
                existingConfig={{
                    id: thing.id,
                    blueprint_id: blueprintId,
                    blueprint_name: blueprintName,
                    arguments: content.arguments,
                    argument_mappings: argMappings,
                    inputSchema: content.inputSchema
                }}
                sourceNodes={things}
                links={links}
            />

            {/* Expanded Logs Dialog */}
            <Dialog open={isLogsExpanded} onOpenChange={setIsLogsExpanded}>
                <DialogContent className="max-w-[80vw] w-[1000px] h-[80vh] flex flex-col p-0 overflow-hidden bg-slate-950 border-slate-800 text-slate-100 ring-1 ring-white/10">
                    <DialogHeader className="p-6 border-b border-white/10 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/20 rounded-lg">
                                <Terminal className="h-5 w-5 text-indigo-400" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold text-white">Execution Engine Trace</DialogTitle>
                                <p className="text-xs text-slate-400 mt-1">Full audit log for {blueprintName}</p>
                            </div>
                        </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto p-6 font-mono text-sm space-y-3 custom-scrollbar bg-black/20">
                        {activeLogs.length === 0 && executionLogs.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                                <Bot className="h-12 w-12 opacity-10 animate-pulse" />
                                <p className="italic">No execution trace available for this session.</p>
                            </div>
                        ) : (
                            (activeLogs.length > 0 ? activeLogs : executionLogs).map((log, i) => (
                                <div key={i} className={cn(
                                    "flex gap-4 p-2 rounded-md transition-colors",
                                    log.level === "error" ? "bg-rose-500/10 text-rose-400" : 
                                    log.level === "warning" ? "bg-amber-500/10 text-amber-400" : 
                                    log.level === "debug" ? "text-slate-500" : "bg-emerald-500/5 text-emerald-400/90"
                                )}>
                                    <span className="shrink-0 opacity-40 select-none w-24">
                                        {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits: 3})}
                                    </span>
                                    <div className="flex-1">
                                        {log.node_label && (
                                            <Badge variant="outline" className="mr-2 h-4 px-1 text-[9px] border-current opacity-70">
                                                {log.node_label}
                                            </Badge>
                                        )}
                                        <span className="break-words leading-relaxed whitespace-pre-wrap">{log.message}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-4 border-t border-white/10 bg-slate-900/50 flex justify-end">
                        <Button variant="ghost" onClick={() => setIsLogsExpanded(false)} className="text-slate-400 hover:text-white">
                            Close Trace
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
