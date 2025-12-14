"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tool, ToolPermission } from "./tool-list"
import { MCPServerList, MCPServer } from "./mcp-server-list"
import { ToolTester } from "./tool-tester"
import { DryRunWizard } from "./dry-run-wizard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Save, Play, Trash2, Plus, X, Loader2, ChevronDown, ChevronRight, AlertTriangle, Code2, Sparkles } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { API_URL } from "@/lib/utils"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { HelpTooltip } from "@/components/ui/help-tooltip"

interface ToolEditorProps {
    tool: Tool | null
    onSave: (tool: Partial<Tool>) => void
    onDelete: (toolId: number) => void
}

interface User {
    id: number
    email: string
    first_name: string
    last_name: string
}

interface ADGroup {
    id: number
    display_name: string
    ad_group_oid: string
}

// Interface for discovered MCP tools
interface DiscoveredTool {
    name: string
    description?: string
    inputSchema?: Record<string, any>
}

// Extended MCP server with discovered tools
interface ConnectedServer extends MCPServer {
    discoveredTools: DiscoveredTool[]
    selectedTools: Set<string>
    isLoading: boolean
    error?: string
    isExpanded: boolean
}

export function ToolEditor({ tool, onSave, onDelete }: ToolEditorProps) {
    const [formData, setFormData] = useState<Partial<Tool>>({})
    const [connectedServers, setConnectedServers] = useState<ConnectedServer[]>([])
    const [draggedServer, setDraggedServer] = useState<MCPServer | null>(null)
    const [showSystemPrompt, setShowSystemPrompt] = useState(false)
    const [showInputSchema, setShowInputSchema] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isGeneratingSchema, setIsGeneratingSchema] = useState(false)
    const [users, setUsers] = useState<User[]>([])
    const [adGroups, setADGroups] = useState<ADGroup[]>([])
    const [categories, setCategories] = useState<{ id: number, name: string }[]>([])
    const [inputSchema, setInputSchema] = useState<string>("")
    const [outputSchema, setOutputSchema] = useState<string>("")
    const [showOutputSchema, setShowOutputSchema] = useState(false)
    const [isSchemaManuallyEdited, setIsSchemaManuallyEdited] = useState(false)
    const [showSchemaWarning, setShowSchemaWarning] = useState(false)
    const [pendingSchemaUpdate, setPendingSchemaUpdate] = useState<string | null>(null)
    const [isSavingPrompt, setIsSavingPrompt] = useState(false)
    const [pipeline, setPipeline] = useState<any[]>([])  // Pipeline steps
    const [showPipeline, setShowPipeline] = useState(false)
    const [showDryRunWizard, setShowDryRunWizard] = useState(false)
    const [isToolVerified, setIsToolVerified] = useState(false)
    const [outputMappings, setOutputMappings] = useState<Record<string, string>>({})  // Output schema mappings from dry-run
    const [isDirty, setIsDirty] = useState(false)
    const lastGeneratedSchema = useRef<string>("")

    useEffect(() => {
        const fetchUsersAndGroups = async () => {
            try {
                const [usersResponse, groupsResponse] = await Promise.all([
                    fetch(`${API_URL}/users`, {
                        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
                    }),
                    fetch(`${API_URL}/ad-groups`, {
                        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
                    })
                ])

                if (usersResponse.ok) {
                    const usersData = await usersResponse.json()
                    setUsers(usersData)
                }

                if (groupsResponse.ok) {
                    const groupsData = await groupsResponse.json()
                    setADGroups(groupsData)
                }
            } catch (error) {
                console.error("Failed to fetch users/groups", error)
            }
        }
        fetchUsersAndGroups()
    }, [])

    // Fetch categories for the dropdown
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const response = await fetch(`${API_URL}/categories`, {
                    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
                })
                if (response.ok) {
                    const data = await response.json()
                    setCategories(data)
                }
            } catch (error) {
                console.error("Failed to fetch categories", error)
            }
        }
        fetchCategories()
    }, [])

    useEffect(() => {
        if (tool) {
            setFormData(tool)
            // Restore connected servers from saved configuration
            restoreConnectedServers(
                tool.configuration?.connected_servers || [],
                tool.configuration?.selected_functions || []
            )
            // Restore pipeline from saved configuration
            if (tool.configuration?.pipeline && Array.isArray(tool.configuration.pipeline)) {
                setPipeline(tool.configuration.pipeline)
            } else {
                setPipeline([])
            }
            // Load input schema from configuration
            if (tool.configuration?.input_schema) {
                const schemaStr = JSON.stringify(tool.configuration.input_schema, null, 2)
                setInputSchema(schemaStr)
                lastGeneratedSchema.current = schemaStr
            }
            // Load output schema from configuration
            if (tool.configuration?.output_schema) {
                const outputSchemaStr = JSON.stringify(tool.configuration.output_schema, null, 2)
                setOutputSchema(outputSchemaStr)
            } else {
                const selectedFunctions = tool.configuration?.selected_functions || []
                if (selectedFunctions.length > 0) {
                    // Merge all inputSchemas from selected functions
                    const mergedSchema: any = {
                        type: "object",
                        properties: {},
                        required: []
                    }
                    selectedFunctions.forEach((func: any) => {
                        if (func.inputSchema?.properties) {
                            Object.assign(mergedSchema.properties, func.inputSchema.properties)
                        }
                        if (func.inputSchema?.required) {
                            mergedSchema.required = [...new Set([...mergedSchema.required, ...func.inputSchema.required])]
                        }
                    })
                    const schemaStr = JSON.stringify(mergedSchema, null, 2)
                    setInputSchema(schemaStr)
                    lastGeneratedSchema.current = schemaStr
                } else {
                    setInputSchema("")
                    lastGeneratedSchema.current = ""
                }
            }
            // Load output mappings from configuration
            if (tool.configuration?.output_mappings) {
                setOutputMappings(tool.configuration.output_mappings)
            } else {
                setOutputMappings({})
            }
            setIsSchemaManuallyEdited(false)
        } else {
            setFormData({
                name: "",
                description: "",
                is_public: false,
                configuration: {},
                system_prompt: ""
            })
            setConnectedServers([])
            setPipeline([])
            setInputSchema("")
            lastGeneratedSchema.current = ""
            setIsSchemaManuallyEdited(false)
        }
        setIsDirty(false)
    }, [tool])

    // Restore connected servers from saved configuration
    const restoreConnectedServers = async (
        serverIds: number[],
        selectedFunctions: Array<{ name: string; serverId: number; description?: string; inputSchema?: any }>
    ) => {
        if (!serverIds || serverIds.length === 0) {
            setConnectedServers([])
            return
        }

        const restored: ConnectedServer[] = []

        for (const serverId of serverIds) {
            try {
                // Fetch server details
                const response = await fetch(`${API_URL}/mcp-servers/${serverId}`, {
                    headers: {
                        "Authorization": `Bearer ${localStorage.getItem("token")}`
                    }
                })

                if (response.ok) {
                    const server = await response.json()

                    // Get the functions that were selected for this server
                    const serverFuncs = selectedFunctions.filter(f => f.serverId === serverId)

                    // Create connected server with cached function data
                    const connectedServer: ConnectedServer = {
                        ...server,
                        discoveredTools: serverFuncs.map(f => ({
                            name: f.name,
                            description: f.description,
                            inputSchema: f.inputSchema
                        })),
                        selectedTools: new Set(serverFuncs.map(f => f.name)),
                        isLoading: false,
                        isExpanded: true
                    }
                    restored.push(connectedServer)
                }
            } catch (error) {
                console.error(`Failed to restore server ${serverId}:`, error)
            }
        }


        // Initial set of servers with cached data
        setConnectedServers(restored)

        // Trigger background discovery for all restored servers to get full tool list
        restored.forEach(async (server) => {
            const preservedSelection = server.selectedTools
            const fallbackTools = server.discoveredTools

            // Re-discover tools
            const updatedServer = await discoverServerTools(server, preservedSelection, fallbackTools)

            // Update state with discovered data
            setConnectedServers(prev =>
                prev.map(s => s.id === server.id ? updatedServer : s)
            )
        })
    }

    // Discover tools from an MCP server
    const discoverServerTools = async (
        server: MCPServer,
        preservedSelection?: Set<string>,
        fallbackTools?: DiscoveredTool[]
    ): Promise<ConnectedServer> => {
        const connectedServer: ConnectedServer = {
            ...server,
            discoveredTools: fallbackTools || [],
            selectedTools: preservedSelection || new Set(), // Preserve selection or empty
            isLoading: true,
            isExpanded: true
        }

        try {
            const response = await fetch(`${API_URL}/mcp-servers/${server.id}/test-connection`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                }
            })

            if (response.ok) {
                const data = await response.json()
                connectedServer.discoveredTools = data.tools || []
                connectedServer.isLoading = false

                if (preservedSelection) {
                    // Keep preserved selection
                    connectedServer.selectedTools = preservedSelection
                } else {
                    // Auto-select all tools ONLY if no selection was preserved (i.e., new drop)
                    connectedServer.selectedTools = new Set(
                        connectedServer.discoveredTools.map(t => t.name)
                    )
                }
            } else {
                const errorData = await response.json()
                connectedServer.error = errorData.detail || "Failed to discover tools"
                connectedServer.isLoading = false
                // On error, keep using fallback methods (already set in init)
            }
        } catch (error) {
            connectedServer.error = error instanceof Error ? error.message : "Connection failed"
            connectedServer.isLoading = false
            // On error, keep using fallback methods (already set in init)
        }

        return connectedServer
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        if (draggedServer && !connectedServers.find(s => s.id === draggedServer.id)) {
            // Add server with loading state
            const loadingServer: ConnectedServer = {
                ...draggedServer,
                discoveredTools: [],
                selectedTools: new Set(),
                isLoading: true,
                isExpanded: true
            }
            setConnectedServers(prev => [...prev, loadingServer])

            // Discover tools
            const discoveredServer = await discoverServerTools(draggedServer)
            setConnectedServers(prev =>
                prev.map(s => s.id === draggedServer.id ? discoveredServer : s)
            )
            setIsDirty(true)
        }
        setDraggedServer(null)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    // Build the configuration object from connected servers and selected tools
    const buildConfiguration = () => {
        // Build selected functions with their schemas
        const selectedFunctions: Array<{ name: string, description?: string, inputSchema?: any, serverId: number }> = []

        // Build server-to-functions mapping
        const serverFunctions: Record<string, string[]> = {}

        // List of connected server IDs
        const connectedServerIds: number[] = []

        connectedServers.forEach(server => {
            connectedServerIds.push(server.id)
            const functionsForServer: string[] = []

            server.discoveredTools
                .filter(t => server.selectedTools.has(t.name))
                .forEach(tool => {
                    functionsForServer.push(tool.name)
                    selectedFunctions.push({
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                        serverId: server.id
                    })
                })

            if (functionsForServer.length > 0) {
                serverFunctions[server.id.toString()] = functionsForServer
            }
        })

        return {
            connected_servers: connectedServerIds,
            server_functions: serverFunctions,
            selected_functions: selectedFunctions
        }
    }

    const handleSave = async () => {
        // Build configuration with selected functions and schemas
        const configuration: Record<string, unknown> = buildConfiguration()

        // Include the input_schema from the editor if it exists
        if (inputSchema) {
            try {
                configuration.input_schema = JSON.parse(inputSchema)
            } catch {
                // Invalid JSON, skip adding input_schema
            }
        }

        // Include the output_schema from the editor if it exists
        if (outputSchema) {
            try {
                configuration.output_schema = JSON.parse(outputSchema)
            } catch {
                // Invalid JSON, skip adding output_schema
            }
        }

        // Include the pipeline if it exists
        if (pipeline.length > 0) {
            configuration.pipeline = pipeline
        }

        // Include output mappings from dry-run verification
        if (Object.keys(outputMappings).length > 0) {
            configuration.output_mappings = outputMappings
        }

        const dataToSave = {
            ...formData,
            configuration
        }
        onSave(dataToSave)
    }

    // Toggle tool selection
    const toggleToolSelection = (serverId: number, toolName: string) => {
        setConnectedServers(prev =>
            prev.map(server => {
                if (server.id === serverId) {
                    const newSelected = new Set(server.selectedTools)
                    if (newSelected.has(toolName)) {
                        newSelected.delete(toolName)
                    } else {
                        newSelected.add(toolName)
                    }
                    return { ...server, selectedTools: newSelected }
                }
                return server
            })
        )
        setIsDirty(true)
    }

    // Toggle server expansion
    const toggleServerExpansion = (serverId: number) => {
        setConnectedServers(prev =>
            prev.map(server => {
                if (server.id === serverId) {
                    return { ...server, isExpanded: !server.isExpanded }
                }
                return server
            })
        )
    }

    // Remove server from canvas
    const removeServer = (serverId: number) => {
        setConnectedServers(prev => prev.filter(s => s.id !== serverId))
        setIsDirty(true)
    }

    // Get all selected tools for prompt generation (legacy)
    const getSelectedToolsInfo = () => {
        const toolsInfo: string[] = []
        connectedServers.forEach(server => {
            server.discoveredTools
                .filter(t => server.selectedTools.has(t.name))
                .forEach(tool => {
                    toolsInfo.push(`- ${tool.name}: ${tool.description || "No description"}`)
                })
        })
        return toolsInfo
    }

    // Get selected functions with full info for pipeline generation
    const getSelectedFunctionsForPipeline = () => {
        const functions: any[] = []
        const serverFunctions: Record<string, string[]> = {}

        connectedServers.forEach(server => {
            const funcsForServer: string[] = []
            server.discoveredTools
                .filter(t => server.selectedTools.has(t.name))
                .forEach(tool => {
                    functions.push({
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                        serverId: server.id
                    })
                    funcsForServer.push(tool.name)
                })
            if (funcsForServer.length > 0) {
                serverFunctions[server.id.toString()] = funcsForServer
            }
        })

        return { functions, serverFunctions }
    }

    // Generate pipeline from description (implements Section 2.3)
    // If input schema already exists, use it; only generate schema if none exists
    const handleGeneratePipeline = async () => {
        if (!formData.description) {
            alert("Please provide a description first.")
            return
        }

        setIsGenerating(true)
        setIsToolVerified(false)  // Reset verification when pipeline changes
        try {
            const { functions, serverFunctions } = getSelectedFunctionsForPipeline()

            // Check if we already have schemas
            let existingInputSchema = null
            let existingOutputSchema = null
            if (inputSchema) {
                try {
                    existingInputSchema = JSON.parse(inputSchema)
                } catch {
                    // Invalid JSON, ignore
                }
            }
            if (outputSchema) {
                try {
                    existingOutputSchema = JSON.parse(outputSchema)
                } catch {
                    // Invalid JSON, ignore
                }
            }

            const response = await fetch(`${API_URL}/generate-pipeline`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    description: formData.description,
                    functions: functions,
                    server_functions: serverFunctions,
                    input_schema: existingInputSchema,  // Pass existing schema if available
                    output_schema: existingOutputSchema  // Pass existing output schema if available
                })
            })

            if (response.ok) {
                const data = await response.json()
                setPipeline(data.pipeline || [])
                setShowPipeline(true)
                setIsDirty(true)

                // Only update input schema if there was NO existing schema
                if (!existingInputSchema && data.input_schema) {
                    const schemaStr = JSON.stringify(data.input_schema, null, 2)
                    setInputSchema(schemaStr)
                    lastGeneratedSchema.current = schemaStr
                    setIsSchemaManuallyEdited(false)
                    setShowInputSchema(true)
                }

                // Only update output schema if there was NO existing schema
                if (!existingOutputSchema && data.output_schema) {
                    const outputSchemaStr = JSON.stringify(data.output_schema, null, 2)
                    setOutputSchema(outputSchemaStr)
                    setShowOutputSchema(true)
                }
            } else {
                console.error("Failed to generate pipeline")
                alert("Failed to generate pipeline. Please try again.")
            }
        } catch (error) {
            console.error("Error generating pipeline:", error)
            alert("Error generating pipeline.")
        } finally {
            setIsGenerating(false)
        }
    }

    // Legacy: Generate system prompt (kept for backward compatibility)
    const handleGeneratePrompt = async () => {
        if (!formData.description) {
            alert("Please provide a description first.")
            return
        }

        setIsGenerating(true)
        try {
            const selectedTools = getSelectedToolsInfo()

            const response = await fetch(`${API_URL}/generate-prompt`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    description: formData.description,
                    functions: selectedTools,
                    server_info: connectedServers.map(s => `${s.name}: ${s.description}`).join("; ")
                })
            })

            if (response.ok) {
                const data = await response.json()
                setFormData(prev => ({ ...prev, system_prompt: data.system_prompt }))
                setShowSystemPrompt(true)
                // Auto-generate input schema after prompt generation
                handleGenerateSchema(data.system_prompt)
            } else {
                console.error("Failed to generate prompt")
            }
        } catch (error) {
            console.error("Error generating prompt:", error)
        } finally {
            setIsGenerating(false)
        }
    }

    // Generate input schema from system prompt
    const handleGenerateSchema = async (promptText?: string) => {
        const prompt = promptText || formData.system_prompt
        if (!prompt) {
            alert("Please generate or enter a system prompt first.")
            return
        }

        // Check if schema was manually edited and warn user
        if (isSchemaManuallyEdited && inputSchema !== lastGeneratedSchema.current) {
            setPendingSchemaUpdate(prompt)
            setShowSchemaWarning(true)
            return
        }

        await doGenerateSchema(prompt)
    }

    // Actually perform schema generation
    const doGenerateSchema = async (prompt: string) => {
        setIsGeneratingSchema(true)
        try {
            // Get function info from connected servers for better schema generation
            const functionsInfo: any[] = []
            connectedServers.forEach(server => {
                server.discoveredTools
                    .filter(t => server.selectedTools.has(t.name))
                    .forEach(tool => {
                        functionsInfo.push({
                            name: tool.name,
                            description: tool.description,
                            inputSchema: tool.inputSchema
                        })
                    })
            })

            const response = await fetch(`${API_URL}/generate-input-schema`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    system_prompt: prompt,
                    functions_info: functionsInfo.length > 0 ? functionsInfo : null
                })
            })

            if (response.ok) {
                const data = await response.json()
                const schemaStr = JSON.stringify(data.input_schema, null, 2)
                setInputSchema(schemaStr)
                lastGeneratedSchema.current = schemaStr
                setIsSchemaManuallyEdited(false)
                setShowInputSchema(true)
            } else {
                console.error("Failed to generate input schema")
            }
        } catch (error) {
            console.error("Error generating schema:", error)
        } finally {
            setIsGeneratingSchema(false)
        }
    }

    // Regenerate just the output schema using the pipeline generation endpoint
    const handleRegenerateOutputSchema = async () => {
        if (!formData.description) {
            alert("Please provide a description first.")
            return
        }

        setIsGenerating(true)
        try {
            const { functions, serverFunctions } = getSelectedFunctionsForPipeline()

            // Pass existing input schema but null for output schema to force regeneration
            let existingInputSchema = null
            if (inputSchema) {
                try {
                    existingInputSchema = JSON.parse(inputSchema)
                } catch {
                    // Invalid JSON, ignore
                }
            }

            const response = await fetch(`${API_URL}/generate-pipeline`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    description: formData.description,
                    functions: functions,
                    server_functions: serverFunctions,
                    input_schema: existingInputSchema,
                    output_schema: null  // Force regeneration
                })
            })

            if (response.ok) {
                const data = await response.json()
                // Only update output schema
                if (data.output_schema) {
                    const outputSchemaStr = JSON.stringify(data.output_schema, null, 2)
                    setOutputSchema(outputSchemaStr)
                    setShowOutputSchema(true)
                    setIsDirty(true)
                }
            } else {
                console.error("Failed to generate output schema")
                alert("Failed to regenerate output schema.")
            }
        } catch (error) {
            console.error("Error regenerating output schema:", error)
            alert("Error regenerating output schema.")
        } finally {
            setIsGenerating(false)
        }
    }

    // Handle manual schema editing
    const handleSchemaChange = (newSchema: string) => {
        setInputSchema(newSchema)
        setIsSchemaManuallyEdited(true)
        setIsDirty(true)
    }

    // Handle confirmation of schema overwrite
    const handleConfirmSchemaOverwrite = () => {
        if (pendingSchemaUpdate) {
            doGenerateSchema(pendingSchemaUpdate)
        }
        setShowSchemaWarning(false)
        setPendingSchemaUpdate(null)
    }

    // Save just the system prompt
    const handleSavePrompt = async () => {
        if (!tool?.id) return

        setIsSavingPrompt(true)
        try {
            // Update the configuration with the input_schema at the top level
            let updatedConfig = { ...formData.configuration }
            if (inputSchema) {
                try {
                    const parsedSchema = JSON.parse(inputSchema)
                    // Save as input_schema for Call Tool to discover
                    updatedConfig.input_schema = parsedSchema
                } catch {
                    // Invalid JSON, ignore
                }
            }
            // Also save output schema if present
            if (outputSchema) {
                try {
                    const parsedOutputSchema = JSON.parse(outputSchema)
                    updatedConfig.output_schema = parsedOutputSchema
                } catch {
                    // Invalid JSON, ignore
                }
            }

            const response = await fetch(`${API_URL}/tools/${tool.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    system_prompt: formData.system_prompt,
                    configuration: updatedConfig
                })
            })

            if (response.ok) {
                alert("System prompt and schema saved successfully!")
            } else {
                alert("Failed to save. Please try again.")
            }
        } catch (error) {
            console.error("Error saving prompt:", error)
            alert("Error saving prompt.")
        } finally {
            setIsSavingPrompt(false)
        }
    }

    if (!tool && !formData.name && Object.keys(formData).length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a tool to edit or create a new one
            </div>
        )
    }

    return (
        <div className="flex-1 flex h-full overflow-hidden">
            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">{tool ? "Edit Tool" : "Create New Tool"}</h2>
                    <div className="flex items-center gap-2">
                        <HelpTooltip contentPath="tools/builder" className="h-9 w-9 border" displayMode="dialog" />
                        {tool && (
                            <Button variant="destructive" size="icon" onClick={() => onDelete(tool.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                        <Button onClick={handleSave} className={isDirty ? "relative" : ""}>
                            <Save className="h-4 w-4 mr-2" />
                            Save Tool
                            {isDirty && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                </span>
                            )}
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name" className="flex items-center gap-2">
                            Name
                            <HelpTooltip contentPath="tool-editor/name" />
                        </Label>
                        <Input
                            id="name"
                            value={formData.name || ""}
                            onChange={e => {
                                setFormData({ ...formData, name: e.target.value })
                                setIsDirty(true)
                            }}
                            placeholder="e.g., VAT Calculator"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="description" className="flex items-center gap-2">
                            Description
                            <HelpTooltip contentPath="tool-editor/description" />
                        </Label>
                        <Textarea
                            id="description"
                            value={formData.description || ""}
                            onChange={e => {
                                setFormData({ ...formData, description: e.target.value })
                                setIsDirty(true)
                            }}
                            placeholder="Describe what this tool does..."
                        />
                    </div>

                    {/* Category Selection */}
                    <div className="grid gap-2">
                        <Label htmlFor="category">Category</Label>
                        <Select
                            value={formData.category_id?.toString() || ""}
                            onValueChange={(val) => {
                                setFormData({
                                    ...formData,
                                    category_id: val ? parseInt(val) : undefined
                                })
                                setIsDirty(true)
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select a category (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id.toString()}>
                                        {cat.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2 border rounded-md p-4">
                        <div className="flex items-center justify-between">
                            <Label>Permissions</Label>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const newPerm: ToolPermission = { user_id: users[0]?.id, permission_level: "READ" }
                                        setFormData({ ...formData, permissions: [...(formData.permissions || []), newPerm] })
                                        setIsDirty(true)
                                    }}
                                    disabled={users.length === 0}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add User
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const newPerm: ToolPermission = { ad_group_id: adGroups[0]?.id, permission_level: "READ" }
                                        setFormData({ ...formData, permissions: [...(formData.permissions || []), newPerm] })
                                        setIsDirty(true)
                                    }}
                                    disabled={adGroups.length === 0}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Group
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {formData.permissions?.map((perm, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    {perm.user_id ? (
                                        <Select
                                            value={perm.user_id?.toString()}
                                            onValueChange={(val) => {
                                                const newPerms = [...(formData.permissions || [])]
                                                newPerms[index] = { ...newPerms[index], user_id: parseInt(val), ad_group_id: undefined }
                                                setFormData({ ...formData, permissions: newPerms })
                                                setIsDirty(true)
                                            }}
                                        >
                                            <SelectTrigger className="w-[220px]">
                                                <SelectValue placeholder="Select User" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {users.map(user => (
                                                    <SelectItem key={user.id} value={user.id.toString()}>
                                                        {user.email}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Select
                                            value={perm.ad_group_id?.toString()}
                                            onValueChange={(val) => {
                                                const newPerms = [...(formData.permissions || [])]
                                                newPerms[index] = { ...newPerms[index], ad_group_id: parseInt(val), user_id: undefined }
                                                setFormData({ ...formData, permissions: newPerms })
                                                setIsDirty(true)
                                            }}
                                        >
                                            <SelectTrigger className="w-[220px]">
                                                <SelectValue placeholder="Select AD Group" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {adGroups.map(group => (
                                                    <SelectItem key={group.id} value={group.id.toString()}>
                                                        {group.display_name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}

                                    <Select
                                        value={perm.permission_level}
                                        onValueChange={(val: "READ" | "READ_WRITE") => {
                                            const newPerms = [...(formData.permissions || [])]
                                            newPerms[index] = { ...newPerms[index], permission_level: val }
                                            setFormData({ ...formData, permissions: newPerms })
                                            setIsDirty(true)
                                        }}
                                    >
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="READ">Read Only</SelectItem>
                                            <SelectItem value="READ_WRITE">Read & Write</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            const newPerms = formData.permissions?.filter((_, i) => i !== index)
                                            setFormData({ ...formData, permissions: newPerms })
                                            setIsDirty(true)
                                        }}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            {(!formData.permissions || formData.permissions.length === 0) && (
                                <p className="text-sm text-muted-foreground italic">
                                    No permissions assigned. Tool is private to owner.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Execution Pipeline Section (Section 2.3 & 3 of ToolBuilder.md) */}
                    <div className="grid gap-2 border rounded-lg p-4 border-purple-200 dark:border-purple-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Play className="h-4 w-4 text-purple-500" />
                                <Label className="font-semibold">Execution Pipeline</Label>
                                {pipeline.length > 0 && (
                                    <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-0.5 rounded">
                                        {pipeline.length} step{pipeline.length !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleGeneratePipeline}
                                    disabled={isGenerating || connectedServers.length === 0}
                                >
                                    {isGenerating ? (
                                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
                                    ) : (
                                        <><Sparkles className="h-4 w-4 mr-1" /> Generate Pipeline</>
                                    )}
                                </Button>
                                {pipeline.length > 0 && (
                                    <Button
                                        variant={isToolVerified ? "secondary" : "default"}
                                        size="sm"
                                        onClick={() => setShowDryRunWizard(true)}
                                        className={isToolVerified ? "bg-green-100 text-green-700 hover:bg-green-200" : ""}
                                    >
                                        {isToolVerified ? (
                                            <>✓ Verified</>
                                        ) : (
                                            <><Play className="h-4 w-4 mr-1" /> Verify Pipeline</>
                                        )}
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowPipeline(!showPipeline)}
                                >
                                    {showPipeline ? "Hide" : "Show"}
                                </Button>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Declarative JSON pipeline describing execution steps. Enter a description and click "Generate Pipeline" to create it from your selected functions.
                        </p>
                        {showPipeline && (
                            <div className="space-y-3">
                                {pipeline.length > 0 ? (
                                    <>
                                        {/* Visual Pipeline Preview */}
                                        <div className="space-y-2">
                                            {pipeline.map((step, index) => (
                                                <div key={step.step_id || index} className="flex items-start gap-2">
                                                    <div className="flex flex-col items-center">
                                                        <div className="w-6 h-6 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center">
                                                            {index + 1}
                                                        </div>
                                                        {index < pipeline.length - 1 && (
                                                            <div className="w-0.5 h-4 bg-purple-300 dark:bg-purple-700"></div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded p-2 text-sm">
                                                        <div className="font-medium text-purple-600 dark:text-purple-400">
                                                            {step.step_id}: {step.function_ref}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-1">
                                                            {Object.entries(step.arguments || {}).map(([key, value]) => (
                                                                <div key={key}>
                                                                    <span className="font-mono">{key}</span>: {String(value)}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Raw JSON Editor */}
                                        <Textarea
                                            value={JSON.stringify({ pipeline }, null, 2)}
                                            onChange={e => {
                                                try {
                                                    const parsed = JSON.parse(e.target.value)
                                                    if (parsed.pipeline) {
                                                        setPipeline(parsed.pipeline)
                                                    }
                                                } catch {
                                                    // Invalid JSON, ignore
                                                }
                                            }}
                                            className="min-h-[200px] font-mono text-xs"
                                        />
                                    </>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p>No pipeline configured.</p>
                                        <p className="text-xs">Add a description and click "Generate Pipeline" to create one.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Input Schema Section */}
                    <div className="grid gap-2 border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Code2 className="h-4 w-4 text-cyan-500" />
                                <Label className="font-semibold flex items-center gap-2">
                                    Input Schema
                                    <HelpTooltip contentPath="tool-editor/input_schema" />
                                </Label>
                                {isSchemaManuallyEdited && (
                                    <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded">
                                        Modified
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateSchema()}
                                    disabled={isGeneratingSchema || !formData.system_prompt}
                                >
                                    {isGeneratingSchema ? (
                                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
                                    ) : (
                                        "Regenerate Schema"
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowInputSchema(!showInputSchema)}
                                >
                                    {showInputSchema ? "Hide" : "Show"}
                                </Button>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Defines input parameters for Agent Builder integration. Auto-generated from system prompt.
                        </p>
                        {showInputSchema && (
                            <div className="space-y-2">
                                <Textarea
                                    value={inputSchema}
                                    onChange={e => handleSchemaChange(e.target.value)}
                                    placeholder='{"type": "object", "properties": {...}, "required": [...]}'
                                    className="min-h-[200px] font-mono text-xs"
                                />
                                {isSchemaManuallyEdited && (
                                    <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-700 dark:text-amber-400">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <span>
                                            Schema has been manually edited. Regenerating will overwrite your changes.
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Output Schema Section */}
                    <div className="grid gap-2 border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Code2 className="h-4 w-4 text-purple-500" />
                                <Label className="font-semibold">Output Schema</Label>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRegenerateOutputSchema()}
                                    disabled={isGenerating || connectedServers.length === 0}
                                >
                                    {isGenerating ? (
                                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
                                    ) : (
                                        "Regenerate Schema"
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowOutputSchema(!showOutputSchema)}
                                >
                                    {showOutputSchema ? "Hide" : "Show"}
                                </Button>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Defines the expected output structure from this tool for downstream nodes.
                        </p>
                        {showOutputSchema && (
                            <div className="space-y-2">
                                <Textarea
                                    value={outputSchema}
                                    onChange={e => {
                                        setOutputSchema(e.target.value)
                                        setIsDirty(true)
                                    }}
                                    placeholder='{"type": "object", "properties": {...}}'
                                    className="min-h-[200px] font-mono text-xs"
                                />
                            </div>
                        )}
                    </div>

                    {/* Tool Tester Section */}
                    {tool?.id && (
                        <ToolTester
                            toolId={tool.id}
                            selectedFunctions={
                                tool.configuration?.selected_functions || []
                            }
                            toolName={tool.name}
                            toolInputSchema={
                                inputSchema ? JSON.parse(inputSchema) : tool.configuration?.input_schema
                            }
                        />
                    )}
                </div>

                {/* Schema Overwrite Warning Dialog */}
                <AlertDialog open={showSchemaWarning} onOpenChange={setShowSchemaWarning}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Overwrite Schema?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You have manually modified the input schema. Regenerating will overwrite your changes.
                                Do you want to continue?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setPendingSchemaUpdate(null)}>
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={handleConfirmSchemaOverwrite}>
                                Overwrite
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Tool Canvas */}
                <div className="flex-1 border-2 border-dashed rounded-lg p-6 flex flex-col gap-4 min-h-[300px]"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                >
                    <h3 className="font-semibold">Tool Canvas</h3>
                    <p className="text-sm text-muted-foreground">
                        Drag and drop MCP Servers here to discover their tools.
                    </p>

                    <div className="grid grid-cols-1 gap-4">
                        {connectedServers.map(server => (
                            <Card key={server.id} className="overflow-hidden">
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => toggleServerExpansion(server.id)}
                                            >
                                                {server.isExpanded ? (
                                                    <ChevronDown className="h-4 w-4" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4" />
                                                )}
                                            </Button>
                                            <CardTitle className="text-sm font-medium">{server.name}</CardTitle>
                                            {server.isLoading && (
                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            )}
                                            {!server.isLoading && !server.error && (
                                                <span className="text-xs text-muted-foreground">
                                                    ({server.selectedTools.size}/{server.discoveredTools.length} selected)
                                                </span>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => removeServer(server.id)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                {server.isExpanded && (
                                    <CardContent className="p-4 pt-0">
                                        <div className="text-xs text-muted-foreground mb-3">
                                            {server.description || "No description"}
                                        </div>

                                        {server.isLoading && (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Discovering tools...
                                            </div>
                                        )}

                                        {server.error && (
                                            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                                                {server.error}
                                            </div>
                                        )}

                                        {!server.isLoading && !server.error && (
                                            <div className="space-y-2">
                                                {server.discoveredTools.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground italic">
                                                        No tools found on this server.
                                                    </p>
                                                ) : (
                                                    server.discoveredTools.map(tool => (
                                                        <div
                                                            key={tool.name}
                                                            className="flex items-start gap-3 p-2 rounded hover:bg-accent/50 transition-colors"
                                                        >
                                                            <Checkbox
                                                                id={`${server.id}-${tool.name}`}
                                                                checked={server.selectedTools.has(tool.name)}
                                                                onCheckedChange={() => toggleToolSelection(server.id, tool.name)}
                                                            />
                                                            <div className="flex-1">
                                                                <label
                                                                    htmlFor={`${server.id}-${tool.name}`}
                                                                    className="text-sm font-medium cursor-pointer"
                                                                >
                                                                    {tool.name}
                                                                </label>
                                                                {tool.description && (
                                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                                        {tool.description}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                )}
                            </Card>
                        ))}

                        {connectedServers.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                <p>Drop MCP servers here to discover their tools</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sidebar Resources */}
            <div className="w-64 border-l bg-slate-50/50 dark:bg-slate-900/50 p-4 overflow-y-auto">
                <MCPServerList onDragStart={setDraggedServer} />
            </div>

            {/* Dry-Run Verification Wizard */}
            {
                tool?.id && (
                    <DryRunWizard
                        toolId={tool.id}
                        pipeline={pipeline}
                        outputSchema={outputSchema ? JSON.parse(outputSchema) : undefined}
                        open={showDryRunWizard}
                        onCancel={() => setShowDryRunWizard(false)}
                        onComplete={(verifiedPipeline, capturedSchemas, newOutputMappings) => {
                            // Update pipeline with refined mappings
                            setPipeline(verifiedPipeline);
                            setIsToolVerified(true);
                            setShowDryRunWizard(false);

                            // Store output mappings in tool configuration
                            if (Object.keys(newOutputMappings).length > 0) {
                                console.log("Output schema mappings:", newOutputMappings);
                                // Save mappings to state - they will be included in configuration on save
                                setOutputMappings(newOutputMappings);
                            }
                            setIsDirty(true);
                        }}
                    />
                )
            }
        </div >
    )
}

