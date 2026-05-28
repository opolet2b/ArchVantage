import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { Save, Loader2, RotateCcw, Sparkles, Trash2, AlertTriangle } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { Checkbox } from "@/components/ui/checkbox"

interface ModelConfigProps {
    onSave?: () => void
}

interface Preset {
    name: string
    type: "local" | "remote"
    model_name?: string
    api_url?: string
    service_api_key?: string
    model_api_key?: string
    is_vision?: boolean
    is_embedding?: boolean
    context_window?: number
    sort?: "price" | "throughput" | "latency"
}

export function ModelConfig({ onSave }: ModelConfigProps) {
    const [type, setType] = useState<"local" | "remote">("local")
    const [name, setName] = useState("")
    const [localModel, setLocalModel] = useState("")
    const [remoteUrl, setRemoteUrl] = useState("")
    const [remoteModelName, setRemoteModelName] = useState("")
    const [remoteSort, setRemoteSort] = useState<"price" | "throughput" | "latency">("price")
    const [serviceKey, setServiceKey] = useState("")
    const [modelKey, setModelKey] = useState("")
    const [isVision, setIsVision] = useState(false)
    const [isEmbedding, setIsEmbedding] = useState(false)
    const [isSequential, setIsSequential] = useState(false)
    const [contextWindow, setContextWindow] = useState(4096)

    const [defaultLLM, setDefaultLLM] = useState("")
    const [defaultVision, setDefaultVision] = useState("")
    const [defaultEmbedding, setDefaultEmbedding] = useState("")

    // Reset DB Logic
    const [showResetDialog, setShowResetDialog] = useState(false)
    const [resetDbChecked, setResetDbChecked] = useState(true)
    const [pendingEmbeddingVal, setPendingEmbeddingVal] = useState("")

    const [availableModels, setAvailableModels] = useState<string[]>([])
    const [presets, setPresets] = useState<Preset[]>([])
    const [selectedPreset, setSelectedPreset] = useState("")
    const [defaultsLoaded, setDefaultsLoaded] = useState(false)


    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)

    useEffect(() => {
        const init = async () => {
            await fetchPresets()
            await fetchDefaults()
            setDefaultsLoaded(true)
        }
        init()
    }, [])

    useEffect(() => {
        if (type === "local") {
            fetchLocalModels()
        }
    }, [type])

    const fetchPresets = async () => {
        const token = localStorage.getItem("token")
        try {
            const res = await fetch(`${API_URL}/config/presets`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            const data = await res.json()
            setPresets(data.presets || [])
        } catch (error) {
            console.error("Failed to fetch presets", error)
        }
    }

    const fetchDefaults = async () => {
        const token = localStorage.getItem("token")
        try {
            const res = await fetch(`${API_URL}/config/defaults`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            const data = await res.json()
            setDefaultLLM(data.default_llm || "")
            setDefaultVision(data.default_vision || "")
            setDefaultEmbedding(data.default_embedding || "")
        } catch (error) {
            console.error("Failed to fetch defaults", error)
        }
    }

    const fetchLocalModels = async () => {
        const token = localStorage.getItem("token")
        setLoading(true)
        try {
            const res = await fetch(`${API_URL}/config/models`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            const data = await res.json()
            setAvailableModels(data.models || [])
            if (data.models && data.models.length > 0 && !localModel) {
                setLocalModel(data.models[0])
            }
        } catch (error) {
            console.error("Failed to fetch models", error)
        } finally {
            setLoading(false)
        }
    }

    const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const presetName = e.target.value
        setSelectedPreset(presetName)

        if (!presetName) {
            return
        }

        const preset = presets.find(p => p.name === presetName)
        if (preset) {
            setName(preset.name)
            setType(preset.type)
            if (preset.type === "local") {
                setLocalModel(preset.model_name || "")
            } else {
                setRemoteUrl(preset.api_url || "")
                setRemoteModelName(preset.model_name || "")
                setRemoteSort(preset.sort || "price")
                setModelKey(preset.model_api_key || "")
            }
            setIsVision(!!preset.is_vision)
            setIsEmbedding(!!preset.is_embedding)
            setIsSequential(!!(preset as any).is_sequential)
            setContextWindow(preset.context_window || 4096)
        }
    }

    const handleSave = async () => {
        if (!name) {
            alert("Please provide a configuration name")
            return
        }

        setSaving(true)
        try {
            const payload = {
                name,
                type,
                model_name: type === "local" ? localModel : remoteModelName,
                api_url: type === "remote" ? remoteUrl : undefined,
                sort: type === "remote" ? remoteSort : undefined,
                service_api_key: type === "remote" ? serviceKey : undefined,
                model_api_key: type === "remote" ? modelKey : undefined,
                is_vision: isVision,
                is_embedding: isEmbedding,
                is_sequential: type === "local" ? isSequential : false,
                context_window: contextWindow
            }

            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/config/presets`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            })

            if (res.ok) {
                alert("Configuration saved!")
                fetchPresets() // Refresh list
                if (onSave) onSave()
            } else {
                alert("Failed to save configuration")
            }
        } catch (error) {
            console.error("Failed to save", error)
            alert("Error saving configuration")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!name || !presets.find(p => p.name === name)) {
            return
        }

        if (!confirm(`Are you sure you want to delete the configuration "${name}"? This cannot be undone.`)) {
            return
        }

        setSaving(true)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/config/presets/${encodeURIComponent(name)}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            })

            if (res.ok) {
                alert("Configuration deleted.")
                // Reset form
                setName("")
                setSelectedPreset("")
                setLocalModel("")
                fetchPresets()
                fetchDefaults() // Defaults might have changed if we deleted the default
            } else {
                alert("Failed to delete configuration")
            }
        } catch (error) {
            console.error("Failed to delete", error)
            alert("Error deleting configuration")
        } finally {
            setSaving(false)
        }
    }

    const handleTestConnection = async () => {
        setTesting(true)
        try {
            const token = localStorage.getItem("token")
            if (type === "local") {
                const payload = {
                    embedding_provider: "ollama",
                    embedding_model: localModel || "nomic-embed-text"
                }
                const res = await fetch(`${API_URL}/config/rag/test`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify(payload),
                })
                const data = await res.json()
                if (data.status === "success" || data.status === "warning") {
                    alert(data.message)
                } else {
                    alert("Connection Failed: " + data.message)
                }
            } else {
                try {
                    const cleanUrl = remoteUrl.endsWith('/') ? remoteUrl.slice(0, -1) : remoteUrl;
                    // Standard OpenAI compatibility test endpoint
                    const testUrl = `${cleanUrl}/models`;
                    const apiRes = await fetch(testUrl, {
                        method: "GET",
                        headers: {
                            "Authorization": `Bearer ${serviceKey || "dummy"}`
                        }
                    });
                    if (apiRes.ok) {
                        const data = await apiRes.json();
                        const models = data.data?.map((m: any) => m.id) || [];
                        if (models.includes(remoteModelName)) {
                            alert(`Success! Connected to Remote API and model '${remoteModelName}' is available.`);
                        } else if (models.length > 0) {
                            alert(`Connected to API, but model '${remoteModelName}' was not found. Available models: ${models.slice(0, 5).join(', ')}...`);
                        } else {
                            alert("Connected to API successfully, but no models were returned.");
                        }
                    } else {
                        alert(`Remote API Error: Received status ${apiRes.status} from ${testUrl}`);
                    }
                } catch (e) {
                    alert(`Connection Failed: Could not reach ${remoteUrl}. Please check your network and URL.`);
                }
            }
        } catch (error) {
            alert("Error: Could not reach the backend test endpoint.")
        } finally {
            setTesting(false)
        }
    }

    const handleSetDefault = async (type: "llm" | "vision", value: string) => {
        try {
            // Optimistic update
            if (type === "llm") setDefaultLLM(value)
            else if (type === "vision") setDefaultVision(value)
 
            const payload = {
                default_llm: type === "llm" ? value : defaultLLM,
                default_vision: type === "vision" ? value : defaultVision,
                default_embedding: defaultEmbedding
            }

            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/config/defaults`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                alert("Failed to update default setting")
                fetchDefaults()
            }
        } catch (error) {
            console.error("Failed to set default", error)
            fetchDefaults()
        }
    }

    const handleSetDefaultEmbedding = (value: string) => {
        // Changing embedding model triggers confirmation
        setPendingEmbeddingVal(value)
        setResetDbChecked(true)
        setShowResetDialog(true)
    }

    const executeSaveDefaultEmbedding = async (resetDb: boolean) => {
        try {
            const value = pendingEmbeddingVal
            setDefaultEmbedding(value) // Optimistic

            const payload = {
                default_llm: defaultLLM,
                default_vision: defaultVision,
                default_embedding: value,
                reset_db: resetDb
            }

            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/config/defaults`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                alert("Failed to update default embedding")
                fetchDefaults()
            } else {
                // May return success message if DB reset was triggered
                const data = await res.json()
                if (resetDb && data.status === "success") {
                    alert("Default Embedding Updated and Database Reset.")
                }
            }
        } catch (error) {
            console.error("Failed to set default embedding", error)
            fetchDefaults()
        } finally {
            setShowResetDialog(false)
        }
    }

    return (
        <div className="w-full max-w-2xl space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Model Configuration</CardTitle>
                    <CardDescription>Configure your default models and presets.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                    {/* Global Defaults Section */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border space-y-4">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-purple-500" />
                            Global Defaults
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Default LLM (Chat)</label>
                                {defaultsLoaded && (
                                    <select
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={defaultLLM}
                                        onChange={(e) => handleSetDefault("llm", e.target.value)}
                                    >
                                        <option value="">Select a default...</option>
                                        {presets.filter(p => !p.is_embedding).map((p) => (
                                            <option key={p.name} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Default Vision Model</label>
                                {defaultsLoaded && (
                                    <select
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={defaultVision}
                                        onChange={(e) => handleSetDefault("vision", e.target.value)}
                                    >
                                        <option value="">Select a default...</option>
                                        {presets.filter(p => p.is_vision).map((p) => (
                                            <option key={p.name} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Default Embedding Model</label>
                                {defaultsLoaded && (
                                    <select
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={defaultEmbedding}
                                        onChange={(e) => handleSetDefaultEmbedding(e.target.value)}
                                    >
                                        <option value="">Select a default...</option>
                                        {presets.filter(p => p.is_embedding).map((p) => (
                                            <option key={p.name} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">Preset Editor</span>
                        </div>
                    </div>

                    {presets.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <RotateCcw className="h-4 w-4" /> Load Preset to Edit
                            </label>
                            <select
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={selectedPreset}
                                onChange={handlePresetChange}
                            >
                                <option value="">Create new preset...</option>
                                {presets.map((p) => (
                                    <option key={p.name} value={p.name}>{p.name} ({p.type})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            Configuration Name
                            <HelpTooltip contentPath="settings/config_name" />
                        </label>
                        <Input
                            placeholder="e.g., My Local Setup"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex items-center space-x-2 border p-4 rounded-md flex-1">
                            <Checkbox
                                id="isVision"
                                checked={isVision}
                                onCheckedChange={(c) => setIsVision(!!c)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="isVision"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Vision Model
                                </label>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 border p-4 rounded-md flex-1">
                            <Checkbox
                                id="isEmbedding"
                                checked={isEmbedding}
                                onCheckedChange={(c) => setIsEmbedding(!!c)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="isEmbedding"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Embedding Model
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            Model Type
                            <HelpTooltip contentPath="settings/model_type" />
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <Button
                                variant={type === "local" ? "default" : "outline"}
                                onClick={() => setType("local")}
                                className="w-full"
                            >
                                Local (Ollama)
                            </Button>
                            <Button
                                variant={type === "remote" ? "default" : "outline"}
                                onClick={() => setType("remote")}
                                className="w-full"
                            >
                                Remote API
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            Context Window Limit (Tokens)
                            <HelpTooltip contentPath="settings/context_window" />
                        </label>
                        <Input
                            type="number"
                            placeholder="e.g., 4096"
                            value={contextWindow}
                            onChange={(e) => setContextWindow(parseInt(e.target.value) || 0)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Defines the token limit before auto-chunking triggers. Default: 4096 (approx 16k chars).
                        </p>
                    </div>

                    {type === "local" && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                Select Model
                                <HelpTooltip contentPath="settings/local_model" />
                            </label>
                            {loading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading models...
                                </div>
                            ) : (
                                <select
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={localModel}
                                    onChange={(e) => setLocalModel(e.target.value)}
                                >
                                    {availableModels.length === 0 && <option value="">No models found</option>}
                                    {availableModels.map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Ensure Ollama is running at http://localhost:11434
                            </p>

                            <div className="flex items-center space-x-2 pt-2">
                                <Checkbox
                                    id="isSequential"
                                    checked={isSequential}
                                    onCheckedChange={(c) => setIsSequential(!!c)}
                                />
                                <label
                                    htmlFor="isSequential"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Run sequentially - generally faster/safer for local LLMs
                                </label>
                            </div>
                        </div>
                    )}

                    {type === "remote" && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    API URL
                                    <HelpTooltip contentPath="settings/remote_api_url" />
                                </label>
                                <Input
                                    placeholder="https://api.openai.com/v1"
                                    value={remoteUrl}
                                    onChange={(e) => setRemoteUrl(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    Model Name
                                    <HelpTooltip contentPath="settings/remote_model_name" />
                                </label>
                                <Input
                                    placeholder="e.g. gpt-4, anthropic/claude-3-opus"
                                    value={remoteModelName}
                                    onChange={(e) => setRemoteModelName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    Sort Strategy
                                    <HelpTooltip contentPath="settings/remote_sort" />
                                </label>
                                <select
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={remoteSort}
                                    onChange={(e) => setRemoteSort(e.target.value as any)}
                                >
                                    <option value="price">Price (Cheapest)</option>
                                    <option value="throughput">Throughput (Fastest)</option>
                                    <option value="latency">Latency (Lowest Ping)</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    Service API Key
                                    <HelpTooltip contentPath="settings/service_api_key" />
                                </label>
                                <Input
                                    type="password"
                                    placeholder="sk-..."
                                    value={serviceKey}
                                    onChange={(e) => setServiceKey(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Model API Key (Optional)</label>
                                <Input
                                    type="password"
                                    placeholder="If different from service key"
                                    value={modelKey}
                                    onChange={(e) => setModelKey(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex gap-4">
                        <Button onClick={handleTestConnection} disabled={testing || saving} variant="outline" className="flex-1">
                            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            Test Connection
                        </Button>
                        <Button onClick={handleSave} disabled={saving || testing} className="flex-1">
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Configuration
                        </Button>

                        {presets.some(p => p.name === name) && (
                            <Button
                                onClick={handleDelete}
                                disabled={saving}
                                variant="destructive"
                                className="flex-none"
                                title="Delete this configuration"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {showResetDialog && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex gap-4 mb-4">
                            <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-full h-10 w-10 flex-shrink-0 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold">Embedding Model Changed</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Changing the embedding model usually requires re-indexing your entire database to ensure search results are accurate.
                                </p>
                            </div>
                        </div>

                        <div className="my-4 p-4 border rounded-md bg-slate-50 dark:bg-slate-950">
                            <div className="flex items-start space-x-3">
                                <Checkbox
                                    id="resetDb"
                                    checked={resetDbChecked}
                                    onCheckedChange={(c) => setResetDbChecked(!!c)}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label
                                        htmlFor="resetDb"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Reset & Re-index Database
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Uncheck ONLY if you are certain the new model is compatible with existing vectors.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
                            <Button onClick={() => executeSaveDefaultEmbedding(resetDbChecked)}>Confirm & Save</Button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}
