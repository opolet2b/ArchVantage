"use client"

/**
 * GUI Tool Editor Component (Refactored)
 * 
 * Replaces the old FormBuilder-based editor with a 4-section pipeline builder.
 * Integrates ToolMetadataSection, ToolSelectionSection, PipelineBuilderSection, and DryRunSection.
 */
import { useState, useEffect, useCallback } from "react"
import { Tool, ToolPermission } from "./tool-list"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Save, Trash2 } from "lucide-react"
import { API_URL } from "@/lib/utils"
// Sections
import { ToolMetadataSection } from "./tool-metadata-section"
import { ToolSelectionSection, ConnectedServer, DiscoveredTool } from "./tool-selection-section"
import { PipelineBuilderSection } from "./pipeline-builder-section"
import { DryRunSection } from "./dry-run-section"
import { MCPServer } from "./mcp-server-list"
import { DryRunWizard } from "./dry-run-wizard"
import { RunPipelineDialog } from "./run-pipeline-dialog"
import { Settings, ChevronDown } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ContextualTrainer, TrainerStep } from "@/components/ui/contextual-trainer"

interface GUIToolEditorProps {
    tool: Tool | null
    onSave: (tool: Partial<Tool>) => void
    onDelete: (toolId: number) => void
    onBack?: () => void
    onDirtyChange?: (isDirty: boolean) => void
}

interface ModelPreset {
    name: string;
    type: "local" | "remote";
    model_name?: string;
}

export function GUIToolEditor({ tool, onSave, onDelete, onBack, onDirtyChange }: GUIToolEditorProps) {
    // --- Section 1: Metadata ---
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [categories, setCategories] = useState<{ id: number, name: string }[]>([])
    const [categoryId, setCategoryId] = useState<number | null>(null)
    const [permissions, setPermissions] = useState<ToolPermission[]>([])

    // --- Section 2: MCP Tools ---
    const [connectedServers, setConnectedServers] = useState<ConnectedServer[]>([])
    const [draggedServer, setDraggedServer] = useState<MCPServer | null>(null)

    // --- Section 3: Pipeline ---
    const [pipeline, setPipeline] = useState<any[]>([])
    const [inputSchema, setInputSchema] = useState<string>("")
    const [outputSchema, setOutputSchema] = useState<string>("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [isToolVerified, setIsToolVerified] = useState(false)

    // --- Section 4: Dry Run ---
    const [showDryRunWizard, setShowDryRunWizard] = useState(false)
    const [showRunDialog, setShowRunDialog] = useState(false)
    const [isSuggesting, setIsSuggesting] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [outputMappings, setOutputMappings] = useState<Record<string, string>>({})
    const [typeTransformations, setTypeTransformations] = useState<Record<string, string>>({})
    const [reasoning, setReasoning] = useState<string>("")

    // --- General State ---
    const [isDirty, setIsDirty] = useState(false)

    // --- LLM Selection ---
    const [models, setModels] = useState<ModelPreset[]>([])
    const [selectedModel, setSelectedModel] = useState<string>("")
    const [isLoadingModels, setIsLoadingModels] = useState(true)

    // Fetch Models and Defaults
    useEffect(() => {
        const fetchModelsAndDefaults = async () => {
            try {
                // Parallel fetch
                const [presetsRes, defaultsRes] = await Promise.all([
                    fetch(`${API_URL}/config/presets`),
                    fetch(`${API_URL}/config/defaults`)
                ])

                let presetsFromApi: ModelPreset[] = []
                let defaultLLM = ""

                if (presetsRes.ok) {
                    const data = await presetsRes.json()
                    presetsFromApi = data.presets || []
                    setModels(presetsFromApi)
                }

                if (defaultsRes.ok) {
                    const data = await defaultsRes.json()
                    defaultLLM = data.default_llm || ""
                }

                // Initial Selection Logic
                if (tool && tool.configuration?.model) {
                    // Case 1: Existing tool has saved model preference
                    setSelectedModel(tool.configuration.model)
                } else if (defaultLLM && presetsFromApi.some(p => p.name === defaultLLM)) {
                    // Case 2: Use global default if it exists in presets
                    setSelectedModel(defaultLLM)
                } else if (presetsFromApi.length > 0) {
                    // Case 3: Fallback to first available
                    setSelectedModel(presetsFromApi[0].name)
                }

            } catch (error) {
                console.error("Failed to fetch model presets or defaults", error)
            } finally {
                setIsLoadingModels(false)
            }
        }
        fetchModelsAndDefaults()
    }, [tool]) // Re-run when tool changes (loaded or reset)

    const getModelDisplayName = (preset: ModelPreset) => {
        if (preset.type === "local" && preset.model_name) {
            return preset.model_name
        }
        return preset.name
    }

    const selectedModelName = models.find((m) => m.name === selectedModel)?.name
        || (isLoadingModels ? "Loading..." : "Select Model")

    // Notify parent of dirty state
    useEffect(() => {
        onDirtyChange?.(isDirty)
    }, [isDirty, onDirtyChange])

    // Load Categories
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

    // Initialize from tool prop
    useEffect(() => {
        if (tool) {
            setName(tool.name)
            setDescription(tool.description || "")
            setCategoryId(tool.category_id || null)
            setPermissions(tool.permissions || [])

            // Restore pipeline
            if (tool.configuration?.pipeline) {
                setPipeline(tool.configuration.pipeline)
                setIsToolVerified(true) // Assume saved pipeline is verified? Or force re-verify? Let's assume re-verify needed if edited.
            } else {
                setPipeline([])
                setIsToolVerified(false)
            }

            // Restore Schemas
            if (tool.configuration?.input_schema) {
                setInputSchema(JSON.stringify(tool.configuration.input_schema, null, 2))
            } else {
                setInputSchema("")
            }
            if (tool.configuration?.output_schema) {
                setOutputSchema(JSON.stringify(tool.configuration.output_schema, null, 2))
            } else {
                setOutputSchema("")
            }

            // Restore Connected Servers
            if (tool.configuration?.connected_servers) {
                restoreConnectedServers(
                    tool.configuration.connected_servers,
                    tool.configuration.selected_functions || []
                )
            } else {
                setConnectedServers([])
            }

            // Restore Mappings
            if (tool.configuration?.output_mappings) {
                setOutputMappings(tool.configuration.output_mappings)
            }
            if (tool.configuration?.type_transformations) {
                setTypeTransformations(tool.configuration.type_transformations)
            }
            if (tool.configuration?.reasoning) {
                setReasoning(tool.configuration.reasoning)
            }

            // NOTE: Model restoration is handled in the main fetchModelsAndDefaults effect 
            // because it depends on having the model list available to validate.
        } else {
            // Reset for new tool
            setName("")
            setDescription("")
            setCategoryId(null)
            setPermissions([])
            setConnectedServers([])
            setPipeline([])
            setInputSchema("")
            setInputSchema("")
            setOutputSchema("")
            setIsToolVerified(false)
            setOutputMappings({})
            setTypeTransformations({})
            setReasoning("")

            // Resetting model to default is also handled in fetchModelsAndDefaults re-run
            // or we can manually trigger a check here if needed, but the effect dependency on [tool] handles it.
        }
        setIsDirty(false)
    }, [tool])

    // --- Logic for Section 2 (MCP Tools) ---

    // Discover tools from an MCP server
    const discoverServerTools = async (
        server: MCPServer,
        preservedSelection?: Set<string>,
        fallbackTools?: DiscoveredTool[]
    ): Promise<ConnectedServer> => {
        const connectedServer: ConnectedServer = {
            ...server,
            discoveredTools: fallbackTools || [],
            selectedTools: preservedSelection || new Set(),
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
                    connectedServer.selectedTools = preservedSelection
                } else {
                    // Auto-select all if new
                    connectedServer.selectedTools = new Set(
                        connectedServer.discoveredTools.map(t => t.name)
                    )
                }
            } else {
                const errorData = await response.json()
                connectedServer.error = errorData.detail || "Failed to discover tools"
                connectedServer.isLoading = false
            }
        } catch (error) {
            connectedServer.error = error instanceof Error ? error.message : "Connection failed"
            connectedServer.isLoading = false
        }

        return connectedServer
    }

    const restoreConnectedServers = async (
        serverIds: number[],
        selectedFunctions: any[]
    ) => {
        if (!serverIds || serverIds.length === 0) {
            setConnectedServers([])
            return
        }

        const restored: ConnectedServer[] = []

        for (const serverId of serverIds) {
            try {
                const response = await fetch(`${API_URL}/mcp-servers/${serverId}`, {
                    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
                })

                if (response.ok) {
                    const server = await response.json()
                    const serverFuncs = selectedFunctions.filter(f => f.serverId === serverId)

                    const connectedServer: ConnectedServer = {
                        ...server,
                        discoveredTools: serverFuncs.map((f: any) => ({
                            name: f.name,
                            description: f.description,
                            inputSchema: f.inputSchema
                        })),
                        selectedTools: new Set(serverFuncs.map((f: any) => f.name)),
                        isLoading: false,
                        isExpanded: true
                    }
                    restored.push(connectedServer)
                }
            } catch (error) {
                console.error(`Failed to restore server ${serverId}`, error)
            }
        }

        setConnectedServers(restored)

        // Background re-discovery
        restored.forEach(async (server) => {
            const updated = await discoverServerTools(server, server.selectedTools, server.discoveredTools)
            setConnectedServers(prev => prev.map(s => s.id === server.id ? updated : s))
        })
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        if (draggedServer && !connectedServers.find(s => s.id === draggedServer.id)) {
            const loadingServer: ConnectedServer = {
                ...draggedServer,
                discoveredTools: [],
                selectedTools: new Set(),
                isLoading: true,
                isExpanded: true
            }
            setConnectedServers(prev => [...prev, loadingServer])
            setIsDirty(true)

            const discovered = await discoverServerTools(draggedServer)
            setConnectedServers(prev => prev.map(s => s.id === draggedServer.id ? discovered : s))
        }
        setDraggedServer(null)
    }

    const handleRemoveServer = (serverId: number) => {
        setConnectedServers(prev => prev.filter(s => s.id !== serverId))
        setIsDirty(true)
    }

    const handleToggleToolSelection = (serverId: number, toolName: string) => {
        setConnectedServers(prev => prev.map(s => {
            if (s.id === serverId) {
                const newSet = new Set(s.selectedTools)
                if (newSet.has(toolName)) newSet.delete(toolName)
                else newSet.add(toolName)
                return { ...s, selectedTools: newSet }
            }
            return s
        }))
        setIsDirty(true)
    }

    const handleSuggestTools = async () => {
        console.log("handleSuggestTools called. Description:", description)
        if (!description) {
            alert("Please enter a description first.")
            return
        }
        setIsSuggesting(true)
        try {
            // 1. Fetch ALL registered MCP servers
            console.log("Fetching all MCP servers...")
            const serversRes = await fetch(`${API_URL}/mcp-servers`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
            })
            if (!serversRes.ok) throw new Error("Failed to fetch MCP servers")
            const allServers: MCPServer[] = await serversRes.json()
            console.log(`Found ${allServers.length} total MCP servers`)

            // 2. Discover tools for ALL servers (if not already connected/discovered)
            const allServerData: ConnectedServer[] = []

            await Promise.all(allServers.map(async (server) => {
                // Check if already connected
                const existing = connectedServers.find(s => s.id === server.id)
                if (existing) {
                    allServerData.push(existing)
                } else {
                    // Discover tools for new server
                    try {
                        const discovered = await discoverServerTools(server)
                        if (!discovered.error) {
                            allServerData.push(discovered)
                        }
                    } catch (e) {
                        console.error(`Failed to discover tools for server ${server.name}`, e)
                    }
                }
            }))

            // 3. Prepare candidates
            const candidates = allServerData.flatMap(server =>
                server.discoveredTools.map(tool => ({
                    serverId: server.id,
                    name: tool.name,
                    description: tool.description
                }))
            )
            console.log(`Prepared ${candidates.length} candidates from ${allServerData.length} servers`)

            if (candidates.length === 0) {
                console.warn("No tools available to suggest from.")
                alert("No tools discovered yet. Please ensure MCP servers are running.")
                return
            }

            console.log(`Sending request to /tools/suggest-tools with model: ${selectedModel}...`)
            const response = await fetch(`${API_URL}/tools/suggest-tools`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({ description, candidates, model_name: selectedModel })
            })

            console.log("Response status:", response.status)

            if (response.ok) {
                const data = await response.json()
                console.log("Suggestion response data:", data)
                const suggestions: string[] = data.suggestions || []

                // 4. Auto-select suggested tools
                // We need to construct a new list of connected servers based on allServerData
                // taking into account what was already connected AND what is now suggested

                const newConnectedServersMap = new Map<number, ConnectedServer>()

                // Initialize with currently connected servers
                connectedServers.forEach(s => newConnectedServersMap.set(s.id, s))

                let changed = false

                suggestions.forEach(suggestedToolName => {
                    // Find which server has this tool
                    const server = allServerData.find(s => s.discoveredTools.some(t => t.name === suggestedToolName))

                    if (server) {
                        // Get or add server to our new map
                        let targetServer = newConnectedServersMap.get(server.id)
                        if (!targetServer) {
                            // This is a new server to connect!
                            targetServer = {
                                ...server,
                                selectedTools: new Set() // Start empty, will add below
                            }
                            newConnectedServersMap.set(server.id, targetServer)
                            changed = true
                            console.log(`Adding new server to pipeline: ${server.name}`)
                        }

                        // Select the tool
                        if (!targetServer.selectedTools.has(suggestedToolName)) {
                            targetServer.selectedTools.add(suggestedToolName)
                            changed = true
                            console.log(`Auto-selecting tool: ${suggestedToolName} on server ${server.id}`)
                        }
                    } else {
                        console.warn(`Suggested tool ${suggestedToolName} not found in any server`)
                    }
                })

                if (changed) {
                    console.log("Updating connectedServers with new selections")
                    setConnectedServers(Array.from(newConnectedServersMap.values()))
                    setIsDirty(true)
                } else {
                    console.log("No new tools selected from suggestions.")
                }

                if (suggestions.length === 0) {
                    alert("No relevant tools found based on your description.")
                }
            } else {
                console.error("Suggestion failed with status:", response.status)
                const errText = await response.text()
                console.error("Error response:", errText)
            }
        } catch (error) {
            console.error("Failed to suggest tools", error)
        } finally {
            setIsSuggesting(false)
        }
    }

    // --- Logic for Section 3 (Pipeline) ---

    const handleGeneratePipeline = async () => {
        if (!description) {
            alert("Please provide a description first.")
            return
        }

        setIsGenerating(true)
        setIsToolVerified(false)

        try {
            // Prepare functions info
            const functions: any[] = []
            const serverFunctions: Record<string, string[]> = {}

            connectedServers.forEach(server => {
                const funcs: string[] = []
                server.discoveredTools
                    .filter(t => server.selectedTools.has(t.name))
                    .forEach(tool => {
                        funcs.push(tool.name)
                        functions.push({
                            name: tool.name,
                            description: tool.description,
                            inputSchema: tool.inputSchema,
                            serverId: server.id
                        })
                    })
                if (funcs.length > 0) serverFunctions[server.id] = funcs
            })

            let existingInput = null
            try { existingInput = JSON.parse(inputSchema) } catch { }

            let existingOutput = null
            try { existingOutput = JSON.parse(outputSchema) } catch { }

            const response = await fetch(`${API_URL}/generate-pipeline`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    description,
                    functions,
                    server_functions: serverFunctions,
                    input_schema: existingInput,
                    output_schema: existingOutput
                })
            })

            if (response.ok) {
                const data = await response.json()
                setPipeline(data.pipeline || [])
                if (data.reasoning) {
                    setReasoning(data.reasoning)
                }

                if (!existingInput && data.input_schema) {
                    setInputSchema(JSON.stringify(data.input_schema, null, 2))
                }
                if (!existingOutput && data.output_schema) {
                    setOutputSchema(JSON.stringify(data.output_schema, null, 2))
                }
                setIsDirty(true)
            } else {
                alert("Failed to generate pipeline")
            }
        } catch (error) {
            console.error("Error generating pipeline", error)
            alert("Error generating pipeline")
        } finally {
            setIsGenerating(false)
        }
    }

    // --- Logic for Save ---
    const handleSaveTool = () => {
        if (!name) {
            alert("Tool name is required")
            return
        }
        if (!description) {
            alert("Description is required")
            return
        }

        setIsSaving(true)


        // Build config
        const selectedFunctions: any[] = []
        const serverFunctions: Record<string, string[]> = {}
        const connectedServerIds: number[] = []

        connectedServers.forEach(server => {
            connectedServerIds.push(server.id)
            const funcs: string[] = []
            server.discoveredTools
                .filter(t => server.selectedTools.has(t.name))
                .forEach(tool => {
                    funcs.push(tool.name)
                    selectedFunctions.push({
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                        serverId: server.id
                    })
                })
            if (funcs.length > 0) serverFunctions[server.id] = funcs
        })

        let parsedInput = {}
        try { parsedInput = JSON.parse(inputSchema) } catch { }

        let parsedOutput = {}
        try { parsedOutput = JSON.parse(outputSchema) } catch { }

        const toolData: Partial<Tool> = {
            name,
            description,
            category_id: categoryId || undefined,
            permissions,
            tool_type: "gui", // or "pipeline"? Keeping "gui" for now or allowing "mcp" if purely wrapping. User said "Tool Builder".
            configuration: {
                connected_servers: connectedServerIds,
                server_functions: serverFunctions,
                selected_functions: selectedFunctions,
                pipeline,
                input_schema: parsedInput,
                output_schema: parsedOutput,
                output_mappings: outputMappings,
                type_transformations: typeTransformations,
                reasoning: reasoning,
                model: selectedModel // Save selected model
            }
        }

        // SMART SAVE LOGIC:
        // Deep compare the new configuration with the existing tool.configuration.
        // If they are identical, OMIT the configuration property from the payload.
        // This ensures we don't overwrite the backend state (which might have been just updated by Dry Run)
        // with the same data, or partial data.

        // Use JSON.stringify for simple deep comparison (canonicalization isn't perfect but sufficient for strict equivalence)
        const currentConfigString = JSON.stringify(tool?.configuration || {})
        // Ensure new config matches structure (handling undefined vs missing if needed via stringify behavior)
        const newConfigString = JSON.stringify(toolData.configuration)

        if (currentConfigString === newConfigString) {
            console.log("[Smart Save] Configuration is identical to DB. Skipping overwrite.")
            // Don't include configuration in the payload
            delete toolData.configuration
        } else {
            console.log("[Smart Save] Configuration changed. Overwriting DB.")
        }

        onSave(toolData)
    }

    // --- Verification Callback ---
    const handleDryRunComplete = (
        verifiedPipeline: any[],
        capturedSchemas: any,
        mappings: Record<string, string>,
        transformations: Record<string, string>
    ) => {
        setPipeline(verifiedPipeline)
        setOutputMappings(mappings)
        setTypeTransformations(transformations)
        setIsToolVerified(true)
        setShowDryRunWizard(false)
        setIsDirty(true)
    }


    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/30 dark:bg-black/10">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 border-b bg-white dark:bg-slate-900 sticky top-0 z-10">
                {onBack && (
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                )}
                <div className="flex-1">
                    <h2 className="text-lg font-semibold">{tool ? `Edit ${tool.name}` : "Create New Tool"}</h2>
                </div>

                {tool && (
                    <Button variant="destructive" size="icon" onClick={() => onDelete(tool.id)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}

                <Button id="save-tool-btn" onClick={handleSaveTool} className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Save Tool
                </Button>

                {/* LLM Selector */}
                <div className="flex items-center gap-2 border-l pl-4 ml-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                                <Settings className="h-4 w-4" />
                                {selectedModelName}
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {isLoadingModels ? (
                                <DropdownMenuItem disabled>Loading models...</DropdownMenuItem>
                            ) : models.length === 0 ? (
                                <DropdownMenuItem disabled>No models configured</DropdownMenuItem>
                            ) : (
                                models.map((model) => (
                                    <DropdownMenuItem
                                        key={model.name}
                                        onClick={() => setSelectedModel(model.name)}
                                        className={selectedModel === model.name ? "bg-slate-100 dark:bg-slate-800" : ""}
                                    >
                                        {getModelDisplayName(model)}
                                    </DropdownMenuItem>
                                ))
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* 1. Metadata */}
                <ToolMetadataSection
                    name={name} setName={(n) => { setName(n); setIsDirty(true) }}
                    description={description} setDescription={(d) => { setDescription(d); setIsDirty(true) }}
                    categories={categories} categoryId={categoryId} setCategoryId={(c) => { setCategoryId(c); setIsDirty(true) }}
                    permissions={permissions} setPermissions={(p) => { setPermissions(p); setIsDirty(true) }}
                />

                {/* 2. MCP Tools */}
                <ToolSelectionSection
                    connectedServers={connectedServers}
                    onDragStart={setDraggedServer}
                    onDrop={handleDrop}
                    onRemoveServer={handleRemoveServer}
                    onToggleServerExpansion={(id) => setConnectedServers(prev => prev.map(s => s.id === id ? { ...s, isExpanded: !s.isExpanded } : s))}
                    onToggleToolSelection={handleToggleToolSelection}
                    description={description}
                    onSuggestTools={handleSuggestTools}
                    isSuggesting={isSuggesting}
                />

                {/* 3. Pipeline */}
                <PipelineBuilderSection
                    pipeline={pipeline} setPipeline={(p) => { setPipeline(p); setIsDirty(true); setIsToolVerified(false) }}
                    inputSchema={inputSchema} setInputSchema={(s) => { setInputSchema(s); setIsDirty(true) }}
                    outputSchema={outputSchema} setOutputSchema={(s) => { setOutputSchema(s); setIsDirty(true) }}
                    reasoning={reasoning}
                    onGenerate={handleGeneratePipeline}
                    onVerify={() => {
                        if (!tool?.id) {
                            alert("Please save the tool first to run verification.")
                            return
                        }
                        setShowDryRunWizard(true)
                    }}
                    isGenerating={isGenerating}
                    isVerified={isToolVerified}
                />

                {/* 4. Dry Run */}
                <DryRunSection
                    isVerified={isToolVerified}
                    onExecutePipeline={() => {
                        if (!tool?.id) {
                            alert("Please save the tool first to execute.")
                            return
                        }
                        setShowRunDialog(true)
                    }}
                    onDebugPipeline={() => {
                        if (!tool?.id) {
                            alert("Please save the tool first to debug.")
                            return
                        }
                        setShowDryRunWizard(true)
                    }}
                />
            </div>

            {/* Dry Run Wizard Modal */}
            <DryRunWizard
                open={showDryRunWizard}
                toolId={tool?.id || 0}
                pipeline={pipeline}
                inputSchema={inputSchema ? JSON.parse(inputSchema) : undefined}
                outputSchema={outputSchema ? JSON.parse(outputSchema) : undefined}
                description={description}
                onComplete={handleDryRunComplete}
                onCancel={() => setShowDryRunWizard(false)}
                selectedModel={selectedModel}
            />

            {/* Run Pipeline Dialog */}
            <RunPipelineDialog
                open={showRunDialog}
                onCancel={() => setShowRunDialog(false)}
                toolId={tool?.id || 0}
                inputSchema={inputSchema ? JSON.parse(inputSchema) : undefined}
            />

            <ContextualTrainer
                workflowId="tool_builder_walkthrough_refixed"
                steps={TOOL_BUILDER_STEPS}
            />
        </div>
    )
}

const TOOL_BUILDER_STEPS: TrainerStep[] = [
    {
        targetId: "tool-metadata-section",
        title: "Tool Metadata",
        content: <p>Start by giving your tool a name, description, and assigning it to a category.</p>,
        position: "bottom"
    },
    {
        targetId: "tool-selection-section",
        title: "Select Tools",
        content: <p>Discover and select functions from your connected MCP servers. You can drag servers from the list or use the Suggest button.</p>,
        position: "bottom"
    },
    {
        targetId: "pipeline-builder-section",
        title: "Build Pipeline",
        content: <p>Describe what you want the tool to do, and the AI will generate a pipeline of steps using the selected functions.</p>,
        position: "bottom"
    },
    {
        targetId: "dry-run-section",
        title: "Verify & Text",
        content: <p>Run a dry run to verify the pipeline works as expected before saving.</p>,
        position: "top"
    },
    {
        targetId: "save-tool-btn",
        title: "Save Tool",
        content: <p>Once verified, save your tool to make it available to agents.</p>,
        position: "bottom"
    }
]
