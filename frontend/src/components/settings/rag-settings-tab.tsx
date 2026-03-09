"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Database, Loader2, Play, Save, RefreshCw, AlertTriangle } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { useToast } from "@/components/ui/use-toast"

interface RagConfig {
    embedding_provider: string
    embedding_model: string
    embedding_api_key?: string
    parsing_strategy: string
    chunk_size: number
    chunk_overlap: number
    enable_metadata: boolean
}

export function RagSettingsTab() {
    const { toast } = useToast()
    const [config, setConfig] = useState<RagConfig>({
        embedding_provider: "ollama",
        embedding_model: "nomic-embed-text",
        parsing_strategy: "recursive",
        chunk_size: 1000,
        chunk_overlap: 200,
        enable_metadata: false
    })
    const [savedConfig, setSavedConfig] = useState<RagConfig | null>(null)

    const [isLoadingConfig, setIsLoadingConfig] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isResetting, setIsResetting] = useState(false)
    const [ingesting, setIngesting] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    const [availableModels, setAvailableModels] = useState<string[]>([])

    // Load config on mount
    useEffect(() => {
        fetchConfig()
        fetchLocalModels()
    }, [])

    const fetchLocalModels = async () => {
        try {
            const res = await fetch(`${API_URL}/config/models`)
            const data = await res.json()
            setAvailableModels(data.models || [])
        } catch (error) {
            console.error("Failed to fetch models", error)
        }
    }

    const fetchConfig = async () => {
        try {
            const ragRes = await fetch(`${API_URL}/config/rag`)
            if (ragRes.ok) {
                const data = await ragRes.json()
                if (data.config) {
                    setConfig(data.config)
                    setSavedConfig(data.config)
                }
            }
        } catch (error) {
            console.error("Failed to load RAG config", error)
        } finally {
            setIsLoadingConfig(false)
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const ragRes = await fetch(`${API_URL}/config/rag`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            })

            if (ragRes.ok) {
                const data = await ragRes.json()
                toast({
                    title: "Configuration Saved",
                    description: data.warning || "Settings updated successfully.",
                })
                setSavedConfig(config)
            } else {
                throw new Error("Failed to save")
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to save configuration.",
                variant: "destructive"
            })
        } finally {
            setIsSaving(false)
        }
    }

    const handleResetAndReindex = async () => {
        if (!confirm("This will DELETE the current vector database and rebuild it with the new settings. Are you sure?")) {
            return
        }

        setIsResetting(true)
        setStatus("Resetting database...")

        try {
            // 1. Reset DB (Triggers re-init with new config)
            const resetRes = await fetch(`${API_URL}/rag/reset`, { method: "POST" })
            if (!resetRes.ok) throw new Error("Failed to reset database")

            setStatus("Database reset. Starting ingestion...")

            // 2. Trigger Ingestion of 'data' folder
            await handleVectorize(true)

        } catch (error) {
            console.error("Reset failed", error)
            setStatus("Error: Reset failed")
            setIsResetting(false)
        }
    }

    const handleVectorize = async (isChained = false) => {
        if (!isChained) setIngesting(true)
        setStatus("Ingesting documents...")

        try {
            const res = await fetch(`${API_URL}/rag/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    folder_path: "data",
                    chunk_size: config.chunk_size,
                    chunk_overlap: config.chunk_overlap
                }),
            })

            if (res.ok) {
                const data = await res.json()
                setStatus(`Success! Processed ${data.count} documents.`)
                toast({
                    title: "Ingestion Complete",
                    description: `Processed ${data.count} documents using ${config.embedding_provider} (${config.parsing_strategy}).`
                })
            } else {
                const err = await res.json()
                setStatus(`Error: ${err.detail || "Failed to ingest"}`)
            }
        } catch (error) {
            console.error("Vectorization failed", error)
            setStatus("Error: Connection failed")
        } finally {
            setIngesting(false)
            setIsResetting(false)
        }
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        RAG Knowledge Base Settings
                    </CardTitle>
                    <CardDescription>
                        Configure the Knowledge Base embedding models and parsing strategies.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                    <Alert variant="destructive" className="bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Re-indexing Required</AlertTitle>
                        <AlertDescription>
                            Changing Embedding Provider, Model, or Parsing Strategy requires a full database reset and re-indexing to take effect.
                        </AlertDescription>
                    </Alert>

                    {/* Current Configuration Display */}
                    {savedConfig && (
                        <div className="bg-muted/50 p-4 rounded-md border border-border text-sm space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                                    Active Configuration
                                </h3>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4 pt-2">
                                <div>
                                    <span className="text-muted-foreground block text-xs">Provider</span>
                                    <span className="font-medium">{savedConfig.embedding_provider}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-xs">Model</span>
                                    <span className="font-medium truncate" title={savedConfig.embedding_model}>{savedConfig.embedding_model}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-xs">Strategy</span>
                                    <span className="font-medium">{savedConfig.parsing_strategy}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-xs">Effective Chunk Size</span>
                                    <span className="font-medium">{savedConfig.chunk_size} tokens</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-xs">Chunk Overlap</span>
                                    <span className="font-medium">{savedConfig.chunk_overlap} tokens</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {isLoadingConfig ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            {/* Embedding Configuration */}
                            <div className="space-y-4 border rounded-md p-4 bg-slate-50 dark:bg-slate-900/50">
                                <h3 className="font-semibold text-sm uppercase text-muted-foreground mb-2">Embeddings & Model</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Provider</Label>
                                        <Select
                                            value={config.embedding_provider}
                                            onValueChange={(v) => setConfig({ ...config, embedding_provider: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select provider" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ollama">Ollama (Local)</SelectItem>
                                                <SelectItem value="openai">OpenAI (Cloud)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Model Name</Label>
                                        <Select
                                            value={config.embedding_model}
                                            onValueChange={(v) => setConfig({ ...config, embedding_model: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select model" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {config.embedding_provider === 'ollama' ? (
                                                    availableModels.length > 0 ? (
                                                        availableModels.map((m) => (
                                                            <SelectItem key={m} value={m}>{m}</SelectItem>
                                                        ))
                                                    ) : (
                                                        <SelectItem value="nomic-embed-text" disabled>No models found (ensure Ollama is running)</SelectItem>
                                                    )
                                                ) : (
                                                    // OpenAI Presets
                                                    <>
                                                        <SelectItem value="text-embedding-3-small">text-embedding-3-small</SelectItem>
                                                        <SelectItem value="text-embedding-3-large">text-embedding-3-large</SelectItem>
                                                        <SelectItem value="text-embedding-ada-002">text-embedding-ada-002</SelectItem>
                                                    </>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            {config.embedding_provider === 'ollama' ?
                                                "Select an installed Ollama model." :
                                                "Select an OpenAI embedding model."}
                                        </p>
                                    </div>
                                </div>

                                {config.embedding_provider === 'openai' && (
                                    <div className="space-y-2">
                                        <Label>API Key</Label>
                                        <Input
                                            type="password"
                                            value={config.embedding_api_key || ''}
                                            onChange={(e) => setConfig({ ...config, embedding_api_key: e.target.value })}
                                            placeholder="sk-..."
                                        />
                                    </div>
                                )}

                                <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                                    <Button
                                        onClick={handleResetAndReindex}
                                        disabled={isResetting || ingesting || isSaving}
                                        variant="default"
                                    >
                                        {isResetting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Rebuilding Database...
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="mr-2 h-4 w-4" />
                                                Save & Re-index Knowledge Base
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Parsing Configuration */}
                            <div className="space-y-4 border rounded-md p-4 bg-slate-50 dark:bg-slate-900/50">
                                <h3 className="font-semibold text-sm uppercase text-muted-foreground mb-2">Parsing & Chunking</h3>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        Strategy
                                        <HelpTooltip contentPath="settings/rag_strategy" />
                                    </Label>
                                    <Select
                                        value={config.parsing_strategy}
                                        onValueChange={(v) => setConfig({ ...config, parsing_strategy: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select strategy" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="recursive">Recursive (Standard) - Good for general text</SelectItem>
                                            <SelectItem value="token">Token Splitter - Precise token limits</SelectItem>
                                            <SelectItem value="window">Sentence Window - Better context retrieval</SelectItem>
                                            <SelectItem value="semantic">Semantic Splitter - AI-driven context aware (Slower)</SelectItem>
                                            <SelectItem value="markdown">Markdown - Structure-aware for .md files</SelectItem>
                                            <SelectItem value="hierarchical">Hierarchical - Auto-merging parent/child nodes</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Chunk Size</Label>
                                        <Input
                                            type="number"
                                            value={config.chunk_size}
                                            onChange={(e) => setConfig({ ...config, chunk_size: parseInt(e.target.value) || 1000 })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Chunk Overlap</Label>
                                        <Input
                                            type="number"
                                            value={config.chunk_overlap}
                                            onChange={(e) => setConfig({ ...config, chunk_overlap: parseInt(e.target.value) || 200 })}
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                    <Label className="flex flex-col gap-1">
                                        <span>Enable Metadata Extraction</span>
                                        <span className="font-normal text-xs text-muted-foreground">Automatically extract titles and summaries (Slower ingestion)</span>
                                    </Label>
                                    <Switch
                                        checked={config.enable_metadata}
                                        onCheckedChange={(c) => setConfig({ ...config, enable_metadata: c })}
                                    />
                                </div>

                                <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                                    <Button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        variant="outline"
                                    >
                                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Save Configuration
                                    </Button>
                                </div>
                            </div>

                            {status && (
                                <div className={`text-sm p-3 rounded-md flex items-center gap-2 ${status.startsWith("Error") ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" : "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"}`}>
                                    {(isResetting || ingesting) && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {status}
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
