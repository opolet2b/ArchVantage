"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Save, Loader2, RotateCcw } from "lucide-react"
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

    const [availableModels, setAvailableModels] = useState<string[]>([])
    const [presets, setPresets] = useState<Preset[]>([])
    const [selectedPreset, setSelectedPreset] = useState("")

    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchPresets()
        fetchActivePreset()
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
            // Reset form or keep current? Let's keep current but clear name if it matches
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

    const handleSetActive = async () => {
        if (!name) {
            alert("Please select or save a configuration first")
            return
        }
        try {
            const res = await fetch(`${API_URL}/config/active`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            })
            if (res.ok) {
                alert(`Configuration '${name}' set as active!`)
            } else {
                alert("Failed to set active configuration")
            }
        } catch (error) {
            console.error("Failed to set active", error)
        }
    }

    const fetchActivePreset = async () => {
        try {
            const res = await fetch(`${API_URL}/config/active`)
            const data = await res.json()
            if (data.active_preset) {
                const preset = data.active_preset
                setName(preset.name)
                setType(preset.type)
                setSelectedPreset(preset.name)
                if (preset.type === "local") {
                    setLocalModel(preset.model_name || "")
                } else {
                    setRemoteUrl(preset.api_url || "")
                    setServiceKey(preset.service_api_key || "")
                    setModelKey(preset.model_api_key || "")
                }
                setIsVision(!!preset.is_vision)
            }
        } catch (error) {
            console.error("Failed to fetch active preset", error)
        }
    }

    return (
        <Card className="w-full max-w-2xl">
            <CardHeader>
                <CardTitle>Model Configuration</CardTitle>
                <CardDescription>Configure your LLM settings for local or remote inference.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {presets.length > 0 && (
                    <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border">
                        <label className="text-sm font-medium flex items-center gap-2">
                            <RotateCcw className="h-4 w-4" /> Load Saved Configuration
                        </label>
                        <select
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={selectedPreset}
                            onChange={handlePresetChange}
                        >
                            <option value="">Select a preset...</option>
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
                    <Button onClick={handleSetActive} variant="secondary" className="flex-1">
                        Set as Active
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
