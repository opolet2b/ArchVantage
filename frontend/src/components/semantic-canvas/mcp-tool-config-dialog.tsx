"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Loader2, Server, Wrench, ArrowRight, Lightbulb } from "lucide-react"
import { API_URL } from "@/lib/utils"

interface MCPToolConfigDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: (config: MCPToolConfig) => void
    mode?: "create" | "run" | "mapping"
    existingConfig?: Partial<MCPToolConfig>
    inputSchema?: any
    sourceNodes?: any[] // Simplified for now
}

export interface MCPToolConfig {
    server_id: number
    server_name: string
    tool_name: string
    tool_description?: string
    arguments: Record<string, any>
    argument_mappings?: Record<string, {
        source_id: string;
        field_selector?: string | null;
        confidence?: number;
    }>
    inputSchema?: any // Store schema for re-run
}

interface MCPServer {
    id: number
    name: string
    is_active: boolean
}

interface MCPTool {
    name: string
    description?: string
    inputSchema: {
        type: string
        properties?: Record<string, any>
        required?: string[]
    }
}

export function MCPToolConfigDialog({
    open,
    onOpenChange,
    onConfirm,
    mode = "create",
    existingConfig,
    inputSchema,
    sourceNodes = []
}: MCPToolConfigDialogProps) {


    const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
    const [servers, setServers] = useState<MCPServer[]>([])
    const [isLoadingServers, setIsLoadingServers] = useState(false)

    // Selection state
    const [selectedServerId, setSelectedServerId] = useState<string>("")
    const [tools, setTools] = useState<MCPTool[]>([])
    const [isLoadingTools, setIsLoadingTools] = useState(false)
    const [selectedToolName, setSelectedToolName] = useState<string>("")
    const [formValues, setFormValues] = useState<Record<string, any>>({})

    // Mapping State
    const [mappings, setMappings] = useState<Record<string, any>>({})
    const [isAnalyzing, setIsAnalyzing] = useState(false)

    // Reset state when closing or opening fresh
    useEffect(() => {
        if (open) {
            if (mode === "run" && existingConfig) {
                setStep(3)
                setSelectedServerId(existingConfig.server_id?.toString() || "")
                setSelectedToolName(existingConfig.tool_name || "")
                setFormValues(existingConfig.arguments || {})
                setMappings(existingConfig.argument_mappings || {})

                if (inputSchema) {
                    setTools([{ name: existingConfig.tool_name!, inputSchema } as any])
                } else if (existingConfig.server_id) {
                    // Try to fetch tools if we know server but no schema
                    fetchTools(existingConfig.server_id)
                }
            } else if (mode === "mapping" && existingConfig && inputSchema) {
                // Formatting for mapping mode
                setStep(4) // New step for mapping
                setSelectedServerId(existingConfig.server_id?.toString() || "")
                setSelectedToolName(existingConfig.tool_name || "")
                setFormValues(existingConfig.arguments || {})
                // If we don't have mappings yet, fetch predictions
                if (!existingConfig.argument_mappings || Object.keys(existingConfig.argument_mappings).length === 0) {
                    fetchMappingSuggestions(inputSchema)
                } else {
                    setMappings(existingConfig.argument_mappings)
                }
                if (inputSchema) {
                    setTools([{ name: existingConfig.tool_name!, inputSchema } as any])
                }
            } else {
                setStep(1)
                setSelectedServerId("")
                setSelectedToolName("")
                setFormValues({})
                setMappings({})
                fetchServers()
            }
        }
    }, [open, mode, existingConfig, inputSchema])

    const fetchMappingSuggestions = async (schema: any) => {
        if (!localSourceNodes || localSourceNodes.length === 0) return

        setIsAnalyzing(true)
        try {
            const token = localStorage.getItem("token")
            // Prepare payload
            const payload = {
                tool_name: selectedToolName || existingConfig?.tool_name,
                tool_schema: schema,
                source_nodes: localSourceNodes.map(n => ({
                    id: n.id,
                    type: n.type,
                    title: n.title,
                    content_summary: n.summaries?.["0.5"] || (n.content && JSON.stringify(n.content).substring(0, 200)),
                    schema_info: (n.type === "table" || n.type === "database") ? n.content : null
                }))
            }

            const res = await fetch(`${API_URL}/mcp-servers/suggest-mappings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            })

            if (res.ok) {
                const data = await res.json()
                setMappings(data.mappings || {})
            }
        } catch (e) {
            console.error("Mapping suggestion failed", e)
        } finally {
            setIsAnalyzing(false)
        }
    }

    const fetchServers = async () => {
        setIsLoadingServers(true)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/mcp-servers`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setServers(data.filter((s: MCPServer) => s.is_active))
            }
        } catch (error) {
            console.error("Failed to fetch MCP servers", error)
        } finally {
            setIsLoadingServers(false)
        }
    }

    const fetchTools = async (serverId: number) => {
        setIsLoadingTools(true)
        setTools([])
        try {
            const token = localStorage.getItem("token")
            // Use the test-connection endpoint to discover tools
            const res = await fetch(`${API_URL}/mcp-servers/${serverId}/test-connection`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            })

            if (res.ok) {
                const data = await res.json()
                if (data.tools) {
                    setTools(data.tools)
                }
            }
        } catch (error) {
            console.error("Failed to fetch tools", error)
        } finally {
            setIsLoadingTools(false)
        }
    }

    const handleServerSelect = (value: string) => {
        setSelectedServerId(value)
        fetchTools(parseInt(value))
        setStep(2)
    }

    const handleToolSelect = (value: string) => {
        setSelectedToolName(value)
        // Initialize form values?
        setFormValues({})
        setStep(3)
    }

    const getSelectedTool = () => tools.find(t => t.name === selectedToolName)
    const getSelectedServer = () => servers.find(s => s.id === parseInt(selectedServerId))

    const handleConfirm = () => {
        const server = getSelectedServer() || (existingConfig?.server_id ? { id: existingConfig.server_id, name: existingConfig.server_name || "Unknown Server" } as MCPServer : undefined)
        const tool = getSelectedTool()
        if (server && tool) {
            onConfirm({
                server_id: server.id,
                server_name: server.name,
                tool_name: tool.name,
                tool_description: tool.description,
                arguments: formValues,
                argument_mappings: mappings,
                inputSchema: tool.inputSchema
            })
            onOpenChange(false)
        }
    }

    // Dynamic Form Renderer
    const renderForm = () => {
        const tool = getSelectedTool()
        if (!tool || !tool.inputSchema || !tool.inputSchema.properties) {
            // Try to use provided inputSchema if available (Run mode)
            if (inputSchema && inputSchema.properties) {
                // Use passed schema
            } else {
                return <div className="text-sm text-muted-foreground italic">No arguments required or schema unavailable.</div>
            }
        }

        const effectiveSchema = tool?.inputSchema || inputSchema

        const props = effectiveSchema.properties
        const required = effectiveSchema.required || []

        return (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {Object.entries(props).map(([key, schema]: [string, any]) => {
                    const isRequired = required.includes(key)
                    const label = (
                        <Label htmlFor={key} className="flex items-center gap-1">
                            {key}
                            {isRequired && <span className="text-red-500">*</span>}
                        </Label>
                    )
                    const desc = schema.description && (
                        <p className="text-[11px] text-muted-foreground mt-1">{schema.description}</p>
                    )

                    if (schema.type === "string") {
                        if (schema.enum) {
                            return (
                                <div key={key} className="grid gap-2">
                                    {label}
                                    <Select
                                        value={formValues[key] || ""}
                                        onValueChange={(val) => setFormValues({ ...formValues, [key]: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select option" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {schema.enum.map((opt: string) => (
                                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {desc}
                                </div>
                            )
                        }
                        // Default string input
                        return (
                            <div key={key} className="grid gap-2">
                                {label}
                                <Input
                                    id={key}
                                    value={formValues[key] || ""}
                                    onChange={(e) => setFormValues({ ...formValues, [key]: e.target.value })}
                                    placeholder={schema.description || `Enter ${key}`}
                                />
                                {desc}
                            </div>
                        )
                    }

                    if (schema.type === "boolean") {
                        return (
                            <div key={key} className="flex items-center justify-between border p-3 rounded-md">
                                <div className="space-y-0.5">
                                    {label}
                                    {desc}
                                </div>
                                <Switch
                                    checked={formValues[key] || false}
                                    onCheckedChange={(checked) => setFormValues({ ...formValues, [key]: checked })}
                                />
                            </div>
                        )
                    }

                    if (schema.type === "integer" || schema.type === "number") {
                        return (
                            <div key={key} className="grid gap-2">
                                {label}
                                <Input
                                    id={key}
                                    type="number"
                                    value={formValues[key] || ""}
                                    onChange={(e) => setFormValues({ ...formValues, [key]: schema.type === "integer" ? parseInt(e.target.value) : parseFloat(e.target.value) })}
                                />
                                {desc}
                            </div>
                        )
                    }

                    // Fallback for object/array/unknown -> JSON Textarea
                    return (
                        <div key={key} className="grid gap-2">
                            {label}
                            <Textarea
                                id={key}
                                value={typeof formValues[key] === 'object' ? JSON.stringify(formValues[key], null, 2) : formValues[key] || ""}
                                onChange={(e) => {
                                    try {
                                        const parsed = JSON.parse(e.target.value)
                                        setFormValues({ ...formValues, [key]: parsed })
                                    } catch {
                                        // Keep as string if parsing fails, or handle better
                                        setFormValues({ ...formValues, [key]: e.target.value })
                                    }
                                }}
                                className="font-mono text-xs"
                                placeholder="{ ...json input }"
                            />
                            {desc}
                            <p className="text-[10px] text-yellow-600">Complex type: enter valid JSON</p>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {mode === "create" && step === 1 && "Select MCP Server"}
                        {mode === "create" && step === 2 && "Select Tool"}
                        {(mode === "run" || step === 3) && `Configure ${selectedToolName}`}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === "create" && step === 1 && "Choose an available MCP server to connect to."}
                        {mode === "create" && step === 2 && "Choose a tool to instantiate on the canvas."}
                        {(mode === "run" || step === 3) && "Provide initial arguments for the tool."}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {step === 1 && (
                        isLoadingServers ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {servers.length === 0 ? (
                                    <div className="text-center text-muted-foreground p-4">
                                        No active MCP servers found.
                                    </div>
                                ) : (
                                    servers.map(server => (
                                        <Button
                                            key={server.id}
                                            variant="outline"
                                            className="justify-start h-auto py-3 px-4"
                                            onClick={() => handleServerSelect(server.id.toString())}
                                        >
                                            <Server className="h-5 w-5 mr-3 text-muted-foreground" />
                                            <div className="flex flex-col items-start">
                                                <span className="font-medium">{server.name}</span>
                                            </div>
                                            <ArrowRight className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    ))
                                )}
                            </div>
                        )
                    )}

                    {step === 2 && (
                        isLoadingTools ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="grid gap-2 max-h-[60vh] overflow-y-auto pr-1">
                                {tools.length === 0 ? (
                                    <div className="text-center text-muted-foreground p-4">
                                        No tools found on this server.
                                    </div>
                                ) : (
                                    tools.map(tool => (
                                        <Button
                                            key={tool.name}
                                            variant="outline"
                                            className="justify-start h-auto py-3 px-4"
                                            onClick={() => handleToolSelect(tool.name)}
                                        >
                                            <Wrench className="h-4 w-4 mr-3 text-muted-foreground" />
                                            <div className="flex flex-col items-start overflow-hidden w-full">
                                                <span className="font-medium">{tool.name}</span>
                                                {tool.description && (
                                                    <span className="text-xs text-muted-foreground truncate w-full text-left">
                                                        {tool.description}
                                                    </span>
                                                )}
                                            </div>
                                            <ArrowRight className="ml-auto h-4 w-4 opacity-50 shrink-0" />
                                        </Button>
                                    ))
                                )}
                            </div>
                        )
                    )}

                    {step === 3 && renderForm()}

                    {step === 4 && (
                        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md mb-4 text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                                <Lightbulb className="h-4 w-4" />
                                {isAnalyzing ? "AI is analyzing connections..." : "Review how connected nodes map to tool arguments."}
                            </div>

                            {isAnalyzing ? (
                                <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                            ) : (
                                // Safely handle schema access
                                getSelectedTool()?.inputSchema?.properties &&
                                Object.entries(getSelectedTool()?.inputSchema?.properties || {}).map(([key, prop]: [string, any]) => {
                                    const mapping = mappings[key]
                                    const isMapped = !!mapping
                                    const required = getSelectedTool()?.inputSchema?.required || []
                                    return (
                                        <div key={key} className="border p-3 rounded-md space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="font-semibold flex items-center gap-2">
                                                    {key}
                                                    {required.includes(key) && <span className="text-red-500">*</span>}
                                                </Label>
                                                <span className="text-xs text-muted-foreground">{prop.type}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-2">{prop.description}</p>

                                            <div className="flex items-center gap-2">
                                                <div className="flex-1">
                                                    <Select
                                                        value={mapping?.source_id || "manual"}
                                                        onValueChange={(val) => {
                                                            if (val === "manual") {
                                                                const newMappings = { ...mappings }
                                                                delete newMappings[key]
                                                                setMappings(newMappings)
                                                            } else {
                                                                setMappings({
                                                                    ...mappings,
                                                                    [key]: { source_id: val, confidence: 1.0 }
                                                                })
                                                            }
                                                        }}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select Input Source" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="manual">Manual Input (Use Static Value)</SelectItem>
                                                            {sourceNodes.map((node: any) => (
                                                                <SelectItem key={node.id} value={node.id}>
                                                                    {node.title || node.content?.filepath || "Untitled Thing"} ({node.type})
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            {/* If mapped, show confidence or details */}
                                            {isMapped && mapping.reasoning && (
                                                <div className="text-xs italic text-green-600 dark:text-green-400 mt-1">
                                                    AI Reasoning: {mapping.reasoning}
                                                </div>
                                            )}

                                            {/* Fallback to Manual Input if not mapped */}
                                            {!isMapped && (
                                                <div className="mt-2">
                                                    {prop.type === "boolean" ? (
                                                        <div className="flex items-center space-x-2">
                                                            <Switch
                                                                checked={formValues[key] || false}
                                                                onCheckedChange={(c) => setFormValues({ ...formValues, [key]: c })}
                                                            />
                                                            <Label>Enabled</Label>
                                                        </div>
                                                    ) : (
                                                        <Input
                                                            value={formValues[key] || ""}
                                                            onChange={(e) => setFormValues({ ...formValues, [key]: e.target.value })}
                                                            placeholder={`Enter static value for ${key}`}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
                    {step > 1 && (
                        <Button variant="ghost" onClick={() => setStep(prev => (prev - 1) as any)}>
                            Back
                        </Button>
                    )}
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        {(step === 3 || step === 4) && <Button onClick={handleConfirm}>{mode === "create" ? "Create Tool" : "Save Changes"}</Button>}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
