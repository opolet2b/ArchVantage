import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Save, Loader2, Trash2, Mic } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { HelpTooltip } from "@/components/ui/help-tooltip"

interface SttConfig {
    id?: number
    name: string
    provider_type: "LOCAL" | "REMOTE" | "BROWSER"
    model_id?: string
    api_url?: string
    api_key?: string
    api_protocol: "OPENAI" | "RAW"
    language_code: string
    is_default: boolean
}

export function SttSettingsTab() {
    const [configs, setConfigs] = useState<SttConfig[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    
    // Form state
    const [id, setId] = useState<number | undefined>(undefined)
    const [name, setName] = useState("")
    const [providerType, setProviderType] = useState<"LOCAL" | "REMOTE" | "BROWSER">("REMOTE")
    const [modelId, setModelId] = useState("")
    const [apiUrl, setApiUrl] = useState("")
    const [apiKey, setApiKey] = useState("")
    const [apiProtocol, setApiProtocol] = useState<"OPENAI" | "RAW">("OPENAI")
    const [languageCode, setLanguageCode] = useState("en")
    const [isDefault, setIsDefault] = useState(false)

    useEffect(() => {
        fetchConfigs()
    }, [])

    const fetchConfigs = async () => {
        try {
            setLoading(true)
            const token = localStorage.getItem("token")
            const headers: HeadersInit = token ? { "Authorization": `Bearer ${token}` } : {}
            const res = await fetch(`${API_URL}/stt/configs`, { headers })
            if (res.ok) {
                const data = await res.json()
                setConfigs(data)
            }
        } catch (error) {
            console.error("Failed to fetch STT configs", error)
        } finally {
            setLoading(false)
        }
    }

    const resetForm = () => {
        setId(undefined)
        setName("")
        setProviderType("REMOTE")
        setModelId("")
        setApiUrl("")
        setApiKey("")
        setApiProtocol("OPENAI")
        setLanguageCode("en")
        setIsDefault(false)
    }

    const handleSelectConfig = (config: SttConfig) => {
        setId(config.id)
        setName(config.name)
        setProviderType(config.provider_type)
        setModelId(config.model_id || "")
        setApiUrl(config.api_url || "")
        setApiKey(config.api_key || "")
        setApiProtocol(config.api_protocol || "OPENAI")
        setLanguageCode(config.language_code || "en")
        setIsDefault(config.is_default)
    }

    const handleSave = async () => {
        if (!name) {
            alert("Please provide a configuration name")
            return
        }

        setSaving(true)
        try {
            const payload: any = {
                name,
                provider_type: providerType,
                model_id: modelId || undefined,
                api_url: apiUrl || undefined,
                api_key: apiKey || undefined,
                api_protocol: apiProtocol,
                language_code: languageCode,
                is_default: isDefault
            }

            const token = localStorage.getItem("token")
            const headers: HeadersInit = {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            }

            let res
            if (id) {
                res = await fetch(`${API_URL}/stt/configs/${id}`, {
                    method: "PUT",
                    headers,
                    body: JSON.stringify(payload)
                })
            } else {
                res = await fetch(`${API_URL}/stt/configs`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload)
                })
            }

            if (res.ok) {
                fetchConfigs()
                resetForm()
            } else {
                alert("Failed to save configuration")
            }
        } catch (error) {
            console.error("Failed to save STT config", error)
            alert("Error saving configuration")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (configId: number) => {
        if (!confirm("Are you sure you want to delete this STT configuration?")) return

        try {
            const token = localStorage.getItem("token")
            const headers: HeadersInit = token ? { "Authorization": `Bearer ${token}` } : {}
            const res = await fetch(`${API_URL}/stt/configs/${configId}`, {
                method: "DELETE",
                headers
            })

            if (res.ok) {
                if (id === configId) resetForm()
                fetchConfigs()
            } else {
                alert("Failed to delete configuration")
            }
        } catch (error) {
            console.error("Failed to delete STT config", error)
            alert("Error deleting configuration")
        }
    }

    const [testing, setTesting] = useState(false)
    const handleTestConnection = async () => {
        if (!apiUrl && providerType !== "BROWSER") {
            alert("Please provide an API URL to test")
            return
        }
        
        setTesting(true)
        try {
            const token = localStorage.getItem("token")
            const headers: HeadersInit = {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            }
            
            const res = await fetch(`${API_URL}/stt/test-connection`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    api_url: apiUrl,
                    api_protocol: apiProtocol,
                    api_key: apiKey
                })
            })
            
            const data = await res.json()
            if (data.status === "success") {
                alert(`Connection Success: ${data.message}`)
            } else {
                alert(`Connection Failed: ${data.message}`)
            }
        } catch (error) {
            console.error("Test connection error", error)
            alert("Error testing connection")
        } finally {
            setTesting(false)
        }
    }

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Mic className="h-5 w-5 text-blue-500" />
                    Speech-to-Text Profiles
                    <HelpTooltip contentPath="settings/stt_config" />
                </h3>
                <p className="text-sm text-muted-foreground">Configure dictation engines (Browser, Local Whisper, Remote API).</p>
            </div>
            
            <div className="space-y-6">
                    {/* Existing Configs List */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium">Saved STT Profiles</label>
                        {loading && configs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Loading...</p>
                        ) : configs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No STT profiles created yet.</p>
                        ) : (
                            <div className="grid gap-3">
                                {configs.map(config => (
                                    <div key={config.id} className="flex items-center justify-between p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50 shadow-sm transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-800/50">
                                        <div>
                                            <p className="font-semibold text-sm flex items-center gap-2">
                                                {config.name}
                                                {config.is_default && <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">Default</span>}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1 tabular-nums transition-opacity">Provider: {config.provider_type}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className="h-8" onClick={() => handleSelectConfig(config)}>Edit</Button>
                                            <Button variant="ghost" size="sm" className="h-8 px-2 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => config.id && handleDelete(config.id)}>
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest">
                            <span className="bg-background px-3 text-muted-foreground/60 shadow-sm border rounded-full py-0.5">
                                {id ? "Edit Profile" : "Create Profile"}
                            </span>
                        </div>
                    </div>

                    {/* Form */}
                    <div className="space-y-4 p-4 border rounded-lg bg-slate-50/30 dark:bg-slate-900/30">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Profile Name</label>
                            <Input placeholder="e.g. Browser Default, OpenRouter Whisper" value={name} onChange={e => setName(e.target.value)} />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                Provider Type
                                <HelpTooltip contentPath="settings/model_type" />
                            </label>
                            <select
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                value={providerType}
                                onChange={e => setProviderType(e.target.value as any)}
                            >
                                <option value="BROWSER">Browser Native (Free, Fast)</option>
                                <option value="REMOTE">Remote API (Whisper format)</option>
                                <option value="LOCAL">Local (Ollama/Local Whisper)</option>
                            </select>
                        </div>

                        {providerType !== "BROWSER" && (
                            <>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">API Protocol</label>
                                    <select
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                        value={apiProtocol}
                                        onChange={e => setApiProtocol(e.target.value as any)}
                                    >
                                        <option value="OPENAI">OpenAI Compatible (Most common)</option>
                                        <option value="RAW">Raw / Legacy (Direct URL)</option>
                                    </select>
                                    <p className="text-[10px] text-muted-foreground italic">
                                        Choose "OpenAI Compatible" for OpenRouter, Ollama, and modern Whisper servers.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Model ID</label>
                                    <Input placeholder="e.g. whisper-1" value={modelId} onChange={e => setModelId(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">API URL (Optional)</label>
                                    <Input placeholder="e.g. https://api.openai.com/v1/audio/transcriptions" value={apiUrl} onChange={e => setApiUrl(e.target.value)} />
                                    <p className="text-xs text-muted-foreground">Leave blank to use default.</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">API Key (Optional)</label>
                                    <Input type="password" placeholder="Leave empty to use main service key" value={apiKey} onChange={e => setApiKey(e.target.value)} />
                                </div>
                            </>
                        )}
 
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                Recognition Language
                                <HelpTooltip contentPath="settings/stt_language" />
                            </label>
                            <select
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                value={languageCode}
                                onChange={e => setLanguageCode(e.target.value)}
                            >
                                <option value="en">English (en)</option>
                                <option value="fr">French (fr)</option>
                                <option value="de">German (de)</option>
                                <option value="es">Spanish (es)</option>
                                <option value="it">Italian (it)</option>
                                <option value="pt">Portuguese (pt)</option>
                                <option value="nl">Dutch (nl)</option>
                                <option value="ru">Russian (ru)</option>
                                <option value="zh">Chinese (zh)</option>
                                <option value="ja">Japanese (ja)</option>
                                <option value="ko">Korean (ko)</option>
                                {providerType !== "BROWSER" && <option value="Auto-detect">Auto-detect (Whisper only)</option>}
                            </select>
                        </div>

                        <div className="flex items-center space-x-2 pt-2 pb-2">
                            <Checkbox id="isDefault" checked={isDefault} onCheckedChange={c => setIsDefault(!!c)} />
                            <label htmlFor="isDefault" className="text-sm font-medium leading-none cursor-pointer">
                                Set as Default Profile
                            </label>
                        </div>

                        <div className="flex gap-2">
                            <Button onClick={handleSave} disabled={saving} className="flex-1 h-9">
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {id ? "Update Profile" : "Add Profile"}
                            </Button>
                            
                            {providerType !== "BROWSER" && (
                                <Button 
                                    variant="outline" 
                                    onClick={handleTestConnection} 
                                    disabled={testing} 
                                    className="h-9 border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                                >
                                    {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Test Connection"}
                                </Button>
                            )}
                            
                            {id && (
                                <Button variant="outline" onClick={resetForm} disabled={saving} className="h-9">
                                    Cancel
                                </Button>
                            )}
                        </div>
                    </div>
            </div>
        </div>
    )
}
