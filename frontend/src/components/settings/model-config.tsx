"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Save, Loader2, RotateCcw, Sparkles } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { HelpTooltip } from "@/components/ui/help-tooltip"

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
}

export function ModelConfig({ onSave }: ModelConfigProps) {
    const [type, setType] = useState<"local" | "remote">("local")
    const [name, setName] = useState("")
    const [localModel, setLocalModel] = useState("")
    const [remoteUrl, setRemoteUrl] = useState("")
    const [serviceKey, setServiceKey] = useState("")
    const [modelKey, setModelKey] = useState("")
    const [isVision, setIsVision] = useState(false)
    const [isSequential, setIsSequential] = useState(false)

    const [defaultLLM, setDefaultLLM] = useState("")
    const [defaultVision, setDefaultVision] = useState("")

    const [availableModels, setAvailableModels] = useState<string[]>([])
    const [presets, setPresets] = useState<Preset[]>([])
    const [selectedPreset, setSelectedPreset] = useState("")

    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchPresets()
        fetchDefaults()
    }, [])

    useEffect(() => {
        if (type === "local") {
            fetchLocalModels()
        }
    }, [type])

    const fetchPresets = async () => {
        try {
            const res = await fetch(`${API_URL}/config/presets`)
            const data = await res.json()
            setPresets(data.presets || [])
        } catch (error) {
            console.error("Failed to fetch presets", error)
        }
    }

    const fetchLocalModels = async () => {
        setLoading(true)
        try {
            const res = await fetch(`${API_URL}/config/models`)
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
                setModelKey(preset.model_api_key || "")
            }
            setIsVision(!!preset.is_vision)
            setIsSequential(!!(preset as any).is_sequential)
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
                model_name: type === "local" ? localModel : undefined,
                api_url: type === "remote" ? remoteUrl : undefined,
                service_api_key: type === "remote" ? serviceKey : undefined,
                model_api_key: type === "remote" ? modelKey : undefined,
                is_vision: isVision,
                is_sequential: type === "local" ? isSequential : false,
            }

            const res = await fetch(`${API_URL}/config/presets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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

    const fetchDefaults = async () => {
        try {
            const res = await fetch(`${API_URL}/config/defaults`)
            const data = await res.json()
            setDefaultLLM(data.default_llm || "")
            setDefaultVision(data.default_vision || "")
        } catch (error) {
            console.error("Failed to fetch defaults", error)
        }
    }

    const handleSetDefault = async (type: "llm" | "vision", value: string) => {
        try {
            // Optimistic update
            if (type === "llm") setDefaultLLM(value)
            else setDefaultVision(value)

            const payload = {
                default_llm: type === "llm" ? value : defaultLLM,
                default_vision: type === "vision" ? value : defaultVision
            }

            const res = await fetch(`${API_URL}/config/defaults`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                // Revert on failure? For now just alert
                alert("Failed to update default setting")
                fetchDefaults()
            }
        } catch (error) {
            console.error("Failed to set default", error)
            fetchDefaults()
        }
    }

    return (
        <Card className="w-full max-w-2xl">
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
                            <select
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={defaultLLM}
                                onChange={(e) => handleSetDefault("llm", e.target.value)}
                            >
                                <option value="">Select a default...</option>
                                {presets.map((p) => (
                                    <option key={p.name} value={p.name}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Default Vision Model</label>
                            <select
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={defaultVision}
                                onChange={(e) => handleSetDefault("vision", e.target.value)}
                            >
                                <option value="">Select a default...</option>
                                {/* Filter only vision capable models? Or allow all? 
                                    Plan says "Vision dropdown only shows presets with is_vision=true" 
                                    Let's stick to that for better UX.
                                */}
                                {presets.filter(p => p.is_vision).map((p) => (
                                    <option key={p.name} value={p.name}>{p.name}</option>
                                ))}
                            </select>
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

                <div className="flex items-center space-x-2 border p-4 rounded-md">
                    <input
                        type="checkbox"
                        id="isVision"
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        checked={isVision}
                        onChange={(e) => setIsVision(e.target.checked)}
                    />
                    <label
                        htmlFor="isVision"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        Vision Model
                    </label>
                    <span className="text-xs text-muted-foreground ml-2">
                        (Check this if the model supports image analysis)
                    </span>
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
                            <input
                                type="checkbox"
                                id="isSequential"
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                checked={isSequential}
                                onChange={(e) => setIsSequential(e.target.checked)}
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
                    <Button onClick={handleSave} disabled={saving} className="flex-1">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Configuration
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
