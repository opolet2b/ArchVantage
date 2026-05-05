"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Bot, ArrowRight, Lightbulb, Sparkles, X, Wrench, Code2, PlaySquare, Link } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { API_URL, cn } from "@/lib/utils"

interface AgentToolConfigDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: (config: AgentToolConfig) => void
    mode?: "create" | "run" | "mapping"
    existingConfig?: Partial<AgentToolConfig>
    sourceNodes?: any[] 
    links?: any[]
    showMapping?: boolean
}

export interface AgentToolConfig {
    id?: string
    blueprint_id: string
    blueprint_name: string
    arguments: Record<string, any>
    argument_mappings?: Record<string, {
        source_id: string;
        field_selector?: string | null;
        confidence?: number;
        reasoning?: string;
    }>
    inputSchema?: any 
    is_batch?: boolean
    batch_source_id?: string
}

interface AgentBlueprint {
    id: string
    name: string
    description?: string
    inputs_schema: any
}

export function AgentToolConfigDialog({
    open,
    onOpenChange,
    onConfirm,
    mode = "create",
    existingConfig,
    sourceNodes = [],
    links = [],
    showMapping = true
}: AgentToolConfigDialogProps) {

    const [step, setStep] = useState<1 | 2>(1)
    const [blueprints, setBlueprints] = useState<AgentBlueprint[]>([])
    const [isLoadingBlueprints, setIsLoadingBlueprints] = useState(false)

    // Selection state
    const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>("")
    const [formValues, setFormValues] = useState<Record<string, any>>({})
    const [mappings, setMappings] = useState<Record<string, any>>({})
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [isBatch, setIsBatch] = useState(false)
    const [batchSourceId, setBatchSourceId] = useState<string>("")
    const [customSchema, setCustomSchema] = useState<string>("")
    const [activeTab, setActiveTab] = useState("mapping")
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null)

    // Helper to extract columns from any node type (table, document with rows, schema_info)
    const getColumnsForNode = (node: any) => {
        if (!node) return []
        const c = node.content as any
        
        // 1. Explicit columns in content
        if (c?.columns && Array.isArray(c.columns) && c.columns.length > 0) {
            return c.columns.map((col: any) => typeof col === 'string' ? { name: col, label: col } : col)
        }
        
        // 2. Schema info fields
        if (node.schema_info?.fields && Array.isArray(node.schema_info.fields)) {
            return node.schema_info.fields
        }

        // 3. Infer from data (array of arrays)
        const data = c?.data || c?.rows
        if (Array.isArray(data) && data.length > 0) {
            const firstRow = data[0]
            if (Array.isArray(firstRow)) {
                // If it's a table node, first row is likely headers
                return firstRow.map((col: any, idx: number) => {
                    const name = typeof col === 'string' ? col : String(col)
                    return { name: name || `Column ${idx}`, label: name || `Column ${idx}` }
                })
            } else if (typeof firstRow === 'object' && firstRow !== null) {
                // If it's an array of objects
                return Object.keys(firstRow).map(key => ({ name: key, label: key }))
            }
        }

        // 4. Fallback: Try parsing from text_content (e.g. for existing nodes)
        const text = c?.text_content || c?.text || ""
        if (text && typeof text === 'string') {
            const lines = text.split('\n').map(l => l.trim()).filter(l => l)
            
            // Scan first 10 lines for headers
            for (let i = 0; i < Math.min(lines.length, 10); i++) {
                const line = lines[i]
                if (line.startsWith('--- Sheet:') || line.startsWith('Table Data') || line.startsWith('Spreadsheet found')) continue;
                
                // Strategy A: Markdown Table (contains | and a separator line below)
                if (i + 1 < lines.length && lines[i+1].includes('|') && lines[i+1].includes('---')) {
                    const headers = line.split('|').map(h => h.trim()).filter(h => h)
                    if (headers.length > 1) return headers.map(h => ({ name: h, label: h }))
                }
                
                // Strategy B: Space-aligned Table (Pandas to_string default)
                // Look for lines with multiple spaces between words
                const spacesHeaders = line.split(/\s{2,}/).map(h => h.trim()).filter(h => h)
                if (spacesHeaders.length > 1) {
                    return spacesHeaders.map(h => ({ name: h, label: h }))
                }

                // Strategy C: Comma/Pipe separated line that looks like a header
                if (line.includes('|') || line.includes(',')) {
                    const separator = line.includes('|') ? '|' : ','
                    const parts = line.split(separator).map(h => h.trim()).filter(h => h)
                    if (parts.length > 1) return parts.map(h => ({ name: h, label: h }))
                }
            }
        }
        
        return []
    }

    const selectedBlueprint = blueprints.find(b => b.id === selectedBlueprintId)

    useEffect(() => {
        if (open) {
            fetchBlueprints()
            if (mode === "mapping" || (mode === "run" && existingConfig)) {
                setStep(2)
                setSelectedBlueprintId(existingConfig?.blueprint_id || "")
                setFormValues(existingConfig?.arguments || {})
                setMappings(existingConfig?.argument_mappings || {})
                setIsBatch(existingConfig?.is_batch || false)
                setBatchSourceId(existingConfig?.batch_source_id || "")
                setCustomSchema(JSON.stringify(existingConfig?.inputSchema || {}, null, 2))
            } else {
                setStep(1)
                setSelectedBlueprintId("")
                setFormValues({})
                setMappings({})
                setIsBatch(false)
                setBatchSourceId("")
                setCustomSchema("")
            }
        }
    }, [open, mode, existingConfig])

    useEffect(() => {
        if (selectedBlueprint) {
            // If the blueprint schema is different from what we have locally, 
            // or if we don't have a local one, update it.
            const bpSchema = JSON.stringify(selectedBlueprint.inputs_schema || {}, null, 2)
            if (!customSchema || customSchema === "{}" || mode === "mapping") {
                setCustomSchema(bpSchema)
            }
        }
    }, [selectedBlueprint, mode])

    const fetchBlueprints = async () => {
        setIsLoadingBlueprints(true)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/agent-blueprints`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await res.json()
            setBlueprints(data)
        } catch (err) {
            console.error("Failed to fetch blueprints", err)
        } finally {
            setIsLoadingBlueprints(false)
        }
    }

    const handleSuggestMappings = async (overrideSources?: any[]) => {
        const targetSources = overrideSources || sourceNodes;
        if (!selectedBlueprint || targetSources.length === 0) return

        setIsAnalyzing(true)
        const requestBody = {
            tool_schema: selectedBlueprint.inputs_schema,
            source_nodes: targetSources.map(n => {
                const c = n.content as any
                let contentInfo = ""
                if (n.type === "text") {
                    contentInfo = c?.text || ""
                } else if (n.type === "document") {
                    contentInfo = c?.text_content?.slice(0, 1000) || c?.generated_description?.slice(0, 1000) || c?.text?.slice(0, 1000) || c?.content?.slice(0, 1000) || ""
                    if (c?.rows || c?.data) contentInfo += ` (Spreadsheet: ${(c.rows || c.data).length} rows)`
                } else if (n.type === "table") {
                    const tableData = c?.data || c?.rows || []
                    contentInfo = `Table with ${tableData.length} rows. `
                    if (tableData.length > 0) {
                        contentInfo += `Sample Data: ${JSON.stringify(tableData.slice(0, 2))}`
                    }
                } else if (n.type === "message") {
                    contentInfo = c?.text || c?.content || ""
                } else if (n.type === "conversation") {
                    contentInfo = (c?.messages || []).map((m: any) => m.content).join("\n").slice(0, 1000)
                } else if (n.type === "image" || n.type === "video") {
                    contentInfo = `Media file: ${c?.name || c?.filename || n.title || "unnamed"}. Caption: ${c?.caption || ""}`
                } else {
                    // Fallback: try to get any text or stringify
                    contentInfo = c?.text || c?.content || JSON.stringify(c || {}).slice(0, 500)
                }

                // Resolve columns for schema_info
                let columns = c?.columns || []
                if (columns.length === 0 && (n.type === "table" || (n.type === "document" && c?.data))) {
                    const data = c?.data || c?.rows
                    if (Array.isArray(data) && data.length > 0) {
                        const firstRow = data[0]
                        if (Array.isArray(firstRow)) {
                            columns = firstRow.map((col: any) => typeof col === 'string' ? col : String(col))
                        }
                    }
                }

                return {
                    id: n.id,
                    type: n.type,
                    title: n.title || n.label,
                    content_summary: contentInfo.slice(0, 1000),
                    schema_info: n.schema_info || {
                        columns: columns,
                        type: n.type
                    }
                }
            }),
            tool_name: selectedBlueprint.name
        }

        console.log("[MAPPING] Requesting AI suggestions with context:", requestBody);

        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/agent-blueprints/suggest-mappings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
            })
            const data = await res.json()
            console.log("[MAPPING] AI Response:", data);
            if (data.mappings) {
                setMappings(data.mappings)
            }
        } catch (err) {
            console.error("Mapping failed", err)
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleConfirm = () => {
        if (!selectedBlueprint) return

        onConfirm({
            id: (existingConfig as any)?.id,
            blueprint_id: selectedBlueprint.id,
            blueprint_name: selectedBlueprint.name,
            arguments: formValues,
            argument_mappings: mappings,
            inputSchema: customSchema ? JSON.parse(customSchema) : selectedBlueprint.inputs_schema,
            is_batch: isBatch,
            batch_source_id: batchSourceId
        })
    }

    const properties = (customSchema ? JSON.parse(customSchema).properties : selectedBlueprint?.inputs_schema?.properties) || {}
    const required = (customSchema ? JSON.parse(customSchema).required : selectedBlueprint?.inputs_schema?.required) || []

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[1400px] h-[95vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl shadow-2xl border-none ring-1 ring-slate-200 dark:ring-slate-800">
                <div className="p-6 border-b">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-indigo-100 rounded-lg">
                                    <Bot className="h-5 w-5 text-indigo-600" />
                                </div>
                                <DialogTitle className="text-xl">
                                    {step === 1 ? "Select Agent Blueprint" : `Configure ${selectedBlueprint?.name}`}
                                </DialogTitle>
                            </div>
                        </div>
                        <DialogDescription className="mt-2">
                            {step === 1 
                                ? "Choose an agent blueprint to add to your canvas." 
                                : "Map data from your canvas to the agent's inputs."}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {step === 1 && (
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Available Blueprints</Label>
                            {isLoadingBlueprints ? (
                                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                    <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
                                    <p className="text-slate-500 animate-pulse">Loading blueprints...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {blueprints.map(bp => (
                                        <div 
                                            key={bp.id}
                                            onClick={() => setSelectedBlueprintId(bp.id)}
                                            className={`p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 group relative ${selectedBlueprintId === bp.id ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50/50'}`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{bp.name}</div>
                                                    {bp.description && <div className="text-sm text-slate-500 line-clamp-2">{bp.description}</div>}
                                                </div>
                                                {selectedBlueprintId === bp.id && (
                                                    <div className="h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center">
                                                        <ArrowRight className="h-3.5 w-3.5 text-white" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {blueprints.length === 0 && (
                                        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                            <div className="p-3 bg-white rounded-full shadow-sm mb-4">
                                                <Bot className="h-6 w-6 text-slate-300" />
                                            </div>
                                            <p className="text-slate-600 font-medium">No blueprints found</p>
                                            <p className="text-sm text-slate-400 mt-1">Create your first agent in the Agent Builder.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && selectedBlueprint && (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                                <TabsTrigger value="mapping" className="rounded-lg gap-2 text-xs font-bold">
                                    <Sparkles className="h-3.5 w-3.5" /> Mappings
                                </TabsTrigger>
                                <TabsTrigger value="batch" className="rounded-lg gap-2 text-xs font-bold">
                                    <PlaySquare className="h-3.5 w-3.5" /> Batch Run
                                </TabsTrigger>
                                <TabsTrigger value="schema" className="rounded-lg gap-2 text-xs font-bold">
                                    <Code2 className="h-3.5 w-3.5" /> Input Schema
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="mapping" className="space-y-6 animate-in fade-in slide-in-from-right-2">
                                {(() => {
                                    const linkedSourceNodes = sourceNodes.filter(n => 
                                        links.some(l => l.source_id === n.id && (l.target_id === (existingConfig as any)?.id || l.target_id === (existingConfig as any)?.blueprint_id))
                                    );
                                    const displayNodes = linkedSourceNodes.length > 0 ? linkedSourceNodes : sourceNodes;
                                    const previewNode = displayNodes.find(n => n.id === previewNodeId) || displayNodes[0];

                                    return (
                                        <div className="flex gap-0 flex-1 min-h-[600px] border rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                                            {/* LEFT: SOURCE DATA EXPLORER */}
                                            <div className="w-[45%] flex flex-col border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                                                <div className="p-4 border-b bg-white dark:bg-slate-900 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-md">
                                                            <Code2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-tight">Source Data Explorer</span>
                                                    </div>
                                                    
                                                    <Select 
                                                        value={previewNode?.id} 
                                                        onValueChange={setPreviewNodeId}
                                                    >
                                                        <SelectTrigger className="w-[180px] h-8 text-[11px] bg-slate-50 dark:bg-slate-800">
                                                            <SelectValue placeholder="Select Source" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {displayNodes.map(node => (
                                                                <SelectItem key={node.id} value={node.id} className="text-[11px]">
                                                                    {node.title || node.label || node.id.slice(0, 8)}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <ScrollArea className="flex-1 p-0">
                                                    {previewNode ? (
                                                        <div className="p-6 space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                                                            <div className="flex items-center justify-between">
                                                                <div className="space-y-1">
                                                                    <h5 className="text-sm font-bold text-slate-900 dark:text-white truncate">{previewNode.title || previewNode.label}</h5>
                                                                    <div className="flex items-center gap-2">
                                                                        <Badge variant="secondary" className="text-[9px] h-4 px-1">{previewNode.type}</Badge>
                                                                        <span className="text-[10px] text-slate-400 font-mono">ID: {previewNode.id.slice(0, 8)}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3 flex-1 flex flex-col min-h-0">
                                                                <div className="flex items-center justify-between">
                                                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Parsed Content Preview</Label>
                                                                    <span className="text-[9px] text-indigo-500 font-medium">Read-Only</span>
                                                                </div>
                                                                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-inner flex-1 min-h-0">
                                                                    <div className="p-5 font-mono text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap h-full overflow-y-auto custom-scrollbar bg-slate-50/20">
                                                                        {(() => {
                                                                            const content = previewNode.content || {};
                                                                            if (previewNode.type === "text") return content.text || "Empty text content";
                                                                            if (previewNode.type === "document") {
                                                                                const text = content.text_content || content.generated_description || content.text || content.content || content.markdown || content.csv;
                                                                                const data = content.data || content.rows || content.table_data;
                                                                                
                                                                                if (data && Array.isArray(data) && data.length > 0) {
                                                                                    return `Spreadsheet found (${data.length} rows)\n\nSAMPLE DATA:\n` + 
                                                                                        data.slice(0, 5).map((row: any) => Array.isArray(row) ? row.join(" | ") : JSON.stringify(row)).join("\n");
                                                                                }
                                                                                return text || "Empty document content (Parsing may still be in progress...)";
                                                                            }
                                                                            if (previewNode.type === "table") {
                                                                                const data = content.data || content.rows || content.table_data;
                                                                                if (data && Array.isArray(data)) {
                                                                                    return `Table Data (${data.length} rows):\n\n` + 
                                                                                        data.slice(0, 10).map((row: any) => Array.isArray(row) ? row.join(" | ") : JSON.stringify(row)).join("\n");
                                                                                }
                                                                                return content.csv || content.markdown || content.text || "Empty table content";
                                                                            }
                                                                            if (previewNode.type === "agent_result") return JSON.stringify(content.result || content || {}, null, 2);
                                                                            return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Fields / Columns list */}
                                                            {(() => {
                                                                const columns = getColumnsForNode(previewNode);
                                                                
                                                                if (columns.length > 0) {
                                                                    return (
                                                                        <div className="space-y-3">
                                                                            <Label className="text-[10px] font-bold text-slate-400 uppercase">Available Fields</Label>
                                                                            <div className="grid grid-cols-2 gap-2">
                                                                                {columns.map((col: any, idx: number) => {
                                                                                    const colName = typeof col === 'string' ? col : (col.name || col.label || `Field ${idx}`);
                                                                                    return (
                                                                                        <div key={`${colName}-${idx}`} className="px-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between group hover:border-indigo-200 transition-colors">
                                                                                            <span className="truncate">{colName}</span>
                                                                                            <span className="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">Available</span>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                }
                                                                return null;
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-3 opacity-40">
                                                            <Sparkles className="h-8 w-8 text-slate-400" />
                                                            <p className="text-xs font-medium text-slate-500">Select a source node<br/>to explore its data.</p>
                                                        </div>
                                                    )}
                                                </ScrollArea>
                                            </div>

                                            {/* RIGHT: TARGET AGENT MAPPING */}
                                            <div className="flex-1 flex flex-col bg-white dark:bg-slate-900">
                                                <div className="p-4 border-b flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-md">
                                                            <PlaySquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-tight">Agent Target Inputs</span>
                                                    </div>
                                                    
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => handleSuggestMappings(displayNodes)}
                                                        disabled={isAnalyzing || displayNodes.length === 0}
                                                        className="h-10 px-4 gap-1.5 text-xs font-bold bg-white dark:bg-slate-900 text-indigo-600 border-indigo-100 hover:bg-indigo-50"
                                                    >
                                                        {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                                        AI Auto-Fill
                                                    </Button>
                                                </div>

                                                <ScrollArea className="flex-1">
                                                    <div className="p-6 space-y-4">
                                                        {Object.entries(properties).map(([key, prop]: [string, any]) => (
                                                            <div key={key} className="p-6 border border-slate-100 dark:border-slate-800 rounded-xl hover:border-indigo-100 dark:hover:border-indigo-900 transition-all bg-slate-50/30 dark:bg-slate-900/50 space-y-4">
                                                                <div className="flex items-start justify-between">
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-1.5">
                                                                            {key.replace(/_/g, ' ')}
                                                                            {required.includes(key) && <span className="text-rose-500 text-sm">*</span>}
                                                                        </Label>
                                                                        {prop.description && <p className="text-xs text-slate-400 line-clamp-1">{prop.description}</p>}
                                                                    </div>

                                                                    <Select 
                                                                        value={mappings[key]?.source_id || "manual"}
                                                                        onValueChange={(val) => {
                                                                            if (val === "manual") {
                                                                                const newMappings = { ...mappings }
                                                                                delete newMappings[key]
                                                                                setMappings(newMappings)
                                                                            } else {
                                                                                setMappings({
                                                                                    ...mappings,
                                                                                    [key]: { source_id: val }
                                                                                })
                                                                                setPreviewNodeId(val)
                                                                            }
                                                                        }}
                                                                    >
                                                                        <SelectTrigger className="w-[200px] h-10 text-xs bg-white dark:bg-slate-900">
                                                                            <SelectValue placeholder="Manual" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="manual" className="text-xs">Manual Input</SelectItem>
                                                                            {displayNodes.map(node => (
                                                                                <SelectItem key={node.id} value={node.id} className="text-xs">
                                                                                    {node.title || node.label}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>

                                                                {!mappings[key] ? (
                                                                    <Input 
                                                                        value={formValues[key] || ""}
                                                                        onChange={(e) => setFormValues({ ...formValues, [key]: e.target.value })}
                                                                        placeholder={`Enter value for ${key}...`}
                                                                        className="h-10 text-sm bg-white dark:bg-slate-900"
                                                                    />
                                                                ) : (
                                                                    <div className="space-y-2">
                                                                        {/* Advanced Field Picker for Tables/Documents */}
                                                                        {(() => {
                                                                            const sourceNode = displayNodes.find(n => n.id === mappings[key].source_id);
                                                                            const columns = getColumnsForNode(sourceNode);
                                                                            
                                                                            if (columns.length > 0) {
                                                                                return (
                                                                                    <div className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-800 shadow-sm animate-in slide-in-from-right-1">
                                                                                        <span className="text-[9px] font-bold text-slate-400 uppercase shrink-0">Field:</span>
                                                                                        <Select 
                                                                                            value={mappings[key].field_selector || "full"}
                                                                                            onValueChange={(val) => {
                                                                                                setMappings({
                                                                                                    ...mappings,
                                                                                                    [key]: { 
                                                                                                        ...mappings[key], 
                                                                                                        field_selector: val === "full" ? null : val 
                                                                                                    }
                                                                                                })
                                                                                            }}
                                                                                        >
                                                                                            <SelectTrigger className="flex-1 h-6 text-[10px] border-none shadow-none focus:ring-0">
                                                                                                <SelectValue placeholder="Full Content" />
                                                                                            </SelectTrigger>
                                                                                            <SelectContent>
                                                                                                <SelectItem value="full" className="text-[10px]">Full Content</SelectItem>
                                                                                                {columns.map((col: any) => (
                                                                                                    <SelectItem key={col.name || col} value={col.name || col} className="text-[10px]">
                                                                                                        {col.label || col.name || col}
                                                                                                    </SelectItem>
                                                                                                ))}
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </div>
                                                                                )
                                                                            }
                                                                            return (
                                                                                <div className="px-2 py-1.5 bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] flex items-center gap-2 border border-indigo-100/50">
                                                                                    <Link className="h-3 w-3" />
                                                                                    <span className="truncate">Mapped to entire {sourceNode?.type}</span>
                                                                                </div>
                                                                            )
                                                                        })()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </TabsContent>

                            <TabsContent value="batch" className="space-y-6 animate-in fade-in slide-in-from-left-2">
                                <div className="p-6 bg-amber-50/30 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                                            <PlaySquare className="h-5 w-5 text-amber-600" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-400">Batch Processing</h4>
                                            <p className="text-xs text-amber-700/70 dark:text-amber-500/70">Execute this agent for every row in a table.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-2">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="batch-mode-toggle" className="text-sm font-medium">Enable Batch Mode</Label>
                                            <input 
                                                type="checkbox" 
                                                id="batch-mode-toggle" 
                                                checked={isBatch}
                                                onChange={(e) => setIsBatch(e.target.checked)}
                                                className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                        </div>

                                        {isBatch && (
                                            <div className="space-y-2 animate-in zoom-in-95 duration-200">
                                                <Label className="text-xs font-bold text-slate-500 uppercase">Source Table</Label>
                                                <Select value={batchSourceId} onValueChange={setBatchSourceId}>
                                                    <SelectTrigger className="w-full h-11 bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900">
                                                        <SelectValue placeholder="Select Table Source" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {sourceNodes.filter(n => n.type === "table" || n.type === "database").map(node => (
                                                            <SelectItem key={node.id} value={node.id}>
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="font-semibold">{node.title || node.label || "Table"}</span>
                                                                    <span className="text-[10px] opacity-50">{node.id.slice(0, 8)}</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-[10px] text-amber-600 italic">
                                                    * Make sure to map parameters to specific columns in the Mappings tab.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="schema" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-sm font-semibold">Blueprint Input Schema</Label>
                                            <p className="text-xs text-slate-500">Define the expected JSON structure for this agent.</p>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => setCustomSchema(JSON.stringify(selectedBlueprint.inputs_schema, null, 2))} className="text-[10px] h-7 gap-1">
                                            <X className="h-3 w-3" /> Reset
                                        </Button>
                                    </div>
                                    <Textarea 
                                        className="font-mono text-[11px] min-h-[300px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 leading-relaxed"
                                        value={customSchema}
                                        onChange={(e) => setCustomSchema(e.target.value)}
                                        placeholder="{ ... }"
                                    />
                                    <div className="p-3 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                                        <p className="text-[10px] text-indigo-700 dark:text-indigo-400 leading-relaxed">
                                            <strong className="block mb-1">💡 Developer Note</strong>
                                            Changing the schema here only affects the canvas tool's mapping interface. 
                                            Ensure the blueprint's graph nodes (START node variable references) match the keys you define here.
                                        </p>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>

                <div className="p-6 border-t bg-slate-50/30">
                    <DialogFooter>
                        <div className="flex items-center justify-between w-full">
                            <Button 
                                variant="ghost" 
                                onClick={() => onOpenChange(false)}
                                className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                            >
                                Cancel
                            </Button>
                            
                            <div className="flex items-center gap-3">
                                {step === 1 ? (
                                    <Button 
                                        disabled={!selectedBlueprintId} 
                                        onClick={() => showMapping ? setStep(2) : handleConfirm()}
                                        className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 shadow-md shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-95"
                                    >
                                        {showMapping ? "Next" : "Add to Canvas"}
                                        {showMapping ? <ArrowRight className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                    </Button>
                                ) : (
                                    <>
                                        {mode !== "mapping" && (
                                            <Button 
                                                variant="outline" 
                                                onClick={() => setStep(1)}
                                                className="border-slate-200 hover:bg-white"
                                            >
                                                Back
                                            </Button>
                                        )}
                                        <Button 
                                            onClick={handleConfirm} 
                                            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 shadow-md shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-95"
                                        >
                                            {mode === "mapping" ? "Update Mappings" : "Add to Canvas"}
                                            <Bot className="h-4 w-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
