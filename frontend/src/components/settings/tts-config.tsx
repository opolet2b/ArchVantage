"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Save, Loader2, Volume2, Trash2, Plus, Globe } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

interface TTSPreset {
    name: string
    type: "local" | "remote"
    model_name?: string
    api_url?: string
    service_api_key?: string
    model_api_key?: string
    is_tts: boolean
    is_browser_native: boolean
    voice_name?: string
    pitch?: number
    speed?: number
    response_format?: string
}

const GEMINI_VOICES = [
    { id: "Puck", name: "Puck (Male, Energetic)" },
    { id: "Charon", name: "Charon (Male, Calm)" },
    { id: "Kore", name: "Kore (Female, Warm)" },
    { id: "Fenrir", name: "Fenrir (Male, Deep)" },
    { id: "Aoide", name: "Aoide (Female, Musical)" },
]

const OPENAI_VOICES = [
    { id: "alloy", name: "Alloy" },
    { id: "echo", name: "Echo" },
    { id: "fable", name: "Fable" },
    { id: "onyx", name: "Onyx" },
    { id: "nova", name: "Nova" },
    { id: "shimmer", name: "Shimmer" },
    { id: "custom", name: "Custom / Manual Entry" },
]

const TEST_PHRASES: Record<string, string> = {
    en: "This is a test of the Text-to-Speech system in English.",
    de: "Dies ist ein Test des Text-zu-Sprache-Systems in Deutsch.",
    it: "Questo è un test del sistema di sintesi vocale in italiano.",
    fr: "Ceci est un test du système de synthèse vocale en français.",
    es: "Esta es una prueba del sistema de texto a voz en español.",
};

const LANGUAGES = [
    { code: "en", name: "English" },
    { code: "de", name: "German" },
    { code: "it", name: "Italian" },
    { code: "fr", name: "French" },
    { code: "es", name: "Spanish" },
];

export function TtsConfigTab() {
    const [presets, setPresets] = useState<TTSPreset[]>([])
    const [selectedName, setSelectedName] = useState<string | null>(null)
    const [defaultPresetName, setDefaultPresetName] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([])
    const [testLang, setTestLang] = useState<string>("en")
    const { toast } = useToast()

    const [form, setForm] = useState<TTSPreset>({
        name: "",
        type: "remote",
        model_name: "gemini-3.1-flash-tts-preview",
        api_url: "https://generativelanguage.googleapis.com",
        service_api_key: "",
        is_tts: true,
        is_browser_native: false,
        voice_name: "Puck",
        pitch: 1.0,
        speed: 1.0,
        response_format: "mp3"
    })

    useEffect(() => {
        fetchPresets()
        loadBrowserVoices()
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = loadBrowserVoices
        }
    }, [])

    const loadBrowserVoices = () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            setBrowserVoices(window.speechSynthesis.getVoices())
        }
    }

    const fetchPresets = async () => {
        setLoading(true)
        try {
            const [presetsRes, defaultRes] = await Promise.all([
                fetch(`${API_URL}/config/presets`),
                fetch(`${API_URL}/config/defaults`)
            ])

            if (presetsRes.ok) {
                const data = await presetsRes.json()
                const ttsPresets = data.presets.filter((p: any) => p.is_tts)
                setPresets(ttsPresets)

                if (ttsPresets.length > 0 && !selectedName) {
                    handleSelect(ttsPresets[0])
                }
            }

            if (defaultRes.ok) {
                const defaults = await defaultRes.json()
                setDefaultPresetName(defaults.default_tts || "")
            }
        } catch (error) {
            console.error("Failed to fetch TTS presets", error)
        } finally {
            setLoading(false)
        }
    }

    const handleSelect = (preset: TTSPreset) => {
        setSelectedName(preset.name)
        setForm({ ...preset })
    }

    const handleNew = () => {
        setSelectedName(null)
        setForm({
            name: "New TTS Preset",
            type: "remote",
            model_name: "gemini-3.1-flash-tts-preview",
            api_url: "https://generativelanguage.googleapis.com",
            service_api_key: "",
            is_tts: true,
            is_browser_native: false,
            voice_name: "Puck",
            pitch: 1.0,
            speed: 1.0,
            response_format: "mp3"
        })
    }

    const handleSave = async () => {
        if (!form.name) {
            toast({ title: "Name required", variant: "destructive" })
            return
        }

        setSaving(true)
        try {
            const res = await fetch(`${API_URL}/config/presets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form)
            })

            if (res.ok) {
                toast({ title: "Preset saved" })
                fetchPresets()
                setSelectedName(form.name)
            } else {
                toast({ title: "Failed to save", variant: "destructive" })
            }
        } catch (error) {
            console.error("Save error", error)
            toast({ title: "Save failed", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const handleSetDefault = async (name: string) => {
        try {
            const res = await fetch(`${API_URL}/config/defaults`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ default_tts: name })
            })
            if (res.ok) {
                setDefaultPresetName(name)
                toast({ title: "Default TTS updated" })
            }
        } catch (error) {
            toast({ title: "Failed to set default", variant: "destructive" })
        }
    }

    const handleDelete = async (name: string) => {
        if (!confirm(`Delete preset "${name}"?`)) return
        try {
            const res = await fetch(`${API_URL}/config/presets/${encodeURIComponent(name)}`, { method: "DELETE" })
            if (res.ok) {
                toast({ title: "Deleted" })
                fetchPresets()
                if (selectedName === name) handleNew()
            }
        } catch (error) {
            toast({ title: "Delete failed", variant: "destructive" })
        }
    }

    const handleTest = async () => {
        if (form.is_browser_native) {
            const ut = new SpeechSynthesisUtterance("This is a test of the Browser Native Text-To-Speech system.")
            if (form.voice_name) {
                const voice = browserVoices.find(v => v.name === form.voice_name)
                if (voice) ut.voice = voice
            }
            ut.pitch = form.pitch || 1.0
            ut.rate = form.speed || 1.0
            window.speechSynthesis.speak(ut)
            return
        }

        try {
            toast({ title: "Generating test audio..." })
            const res = await fetch(`${API_URL}/tts/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: TEST_PHRASES[testLang] || TEST_PHRASES.en,
                    config_name: selectedName,
                    config: form
                })
            })

            if (res.ok) {
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const audio = new Audio(url)
                audio.play()
            } else {
                const err = await res.json()
                toast({ title: "Test failed", description: err.detail, variant: "destructive" })
            }
        } catch (error) {
            toast({ title: "Connection failed", variant: "destructive" })
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Text-To-Speech</h2>
                    <p className="text-muted-foreground">Configure AI voices for Canvas and Chat.</p>
                </div>
                <Button onClick={handleNew} size="sm" className="gap-2">
                    <Plus className="h-4 w-4" /> New Preset
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-sm">Presets</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 space-y-1">
                        {presets.map((p) => (
                            <div
                                key={p.name}
                                onClick={() => handleSelect(p)}
                                className={`group flex items-center justify-between p-2 rounded-md cursor-pointer text-sm transition-colors ${selectedName === p.name ? 'bg-secondary' : 'hover:bg-muted'}`}
                            >
                                <span className="truncate flex-1">{p.name} {defaultPresetName === p.name && "★"}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(p.name); }}
                                >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle>Configuration: {form.name || "New Preset"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Preset Name</Label>
                                <Input
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g. My Gemini Voice"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Provider Mode</Label>
                                <div className="flex items-center gap-4 pt-2">
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            checked={form.is_browser_native}
                                            onCheckedChange={(v) => setForm({
                                                ...form,
                                                is_browser_native: v,
                                                type: v ? "local" : "remote",
                                                model_name: v ? "browser" : "gemini-3.1-flash-tts-preview",
                                                api_url: v ? "" : "https://generativelanguage.googleapis.com"
                                            })}
                                        />
                                        <Label className="flex items-center gap-1 cursor-pointer">
                                            <Globe className="h-3 w-3" /> Browser Native
                                        </Label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {!form.is_browser_native && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Remote Engine</Label>
                                        <Select
                                            value={form.api_url?.includes("generativelanguage.googleapis.com") ? "gemini" : "openai"}
                                            onValueChange={(v) => setForm({
                                                ...form,
                                                model_name: v === "gemini" ? "gemini-3.1-flash-tts-preview" : "tts-1",
                                                api_url: v === "gemini" ? "https://generativelanguage.googleapis.com" : "https://api.openai.com/v1",
                                                voice_name: v === "gemini" ? "Puck" : "alloy"
                                            })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="gemini">Gemini 3.1 Flash (Multimodal)</SelectItem>
                                                <SelectItem value="openai">OpenAI / Compatible</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>API Endpoint URL</Label>
                                        <Input
                                            value={form.api_url}
                                            onChange={(e) => setForm({ ...form, api_url: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>API Key</Label>
                                    <Input
                                        type="password"
                                        value={form.service_api_key}
                                        onChange={(e) => setForm({ ...form, service_api_key: e.target.value })}
                                        placeholder="Paste your API Key"
                                    />
                                </div>

                                {!form.api_url?.includes("generativelanguage.googleapis.com") && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Model Name (e.g. tts-1, openai/whisper-1)</Label>
                                            <Input
                                                value={form.model_name}
                                                onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Audio Format</Label>
                                            <Select
                                                value={form.response_format || "mp3"}
                                                onValueChange={(v) => setForm({ ...form, response_format: v })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="mp3">MP3</SelectItem>
                                                    <SelectItem value="wav">WAV</SelectItem>
                                                    <SelectItem value="pcm">PCM</SelectItem>
                                                    <SelectItem value="opus">Opus</SelectItem>
                                                    <SelectItem value="aac">AAC</SelectItem>
                                                    <SelectItem value="flac">FLAC</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        <div className="grid grid-cols-2 gap-8 pt-4 border-t">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Voice Selection</Label>
                                    <Select
                                        value={form.voice_name}
                                        onValueChange={(v) => setForm({ ...form, voice_name: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {form.is_browser_native ? (
                                                browserVoices.map(v => (
                                                    <SelectItem key={v.name} value={v.name}>{v.name} ({v.lang})</SelectItem>
                                                ))
                                            ) : form.model_name?.includes("gemini") ? (
                                                GEMINI_VOICES.map(v => (
                                                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                ))
                                            ) : (
                                                OPENAI_VOICES.map(v => (
                                                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                    {(form.voice_name === "custom" || (!GEMINI_VOICES.find(v => v.id === form.voice_name) && !OPENAI_VOICES.find(v => v.id === form.voice_name) && !browserVoices.find(v => v.name === form.voice_name))) && (
                                        <div className="pt-2">
                                            <Label className="text-xs">Custom Voice ID</Label>
                                            <Input
                                                value={form.voice_name === "custom" ? "" : form.voice_name}
                                                onChange={(e) => setForm({ ...form, voice_name: e.target.value })}
                                                placeholder="Enter voice ID"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-4">
                                    <div className="space-y-0.5">
                                        <Label>Global Default</Label>
                                        <CardDescription>Use this for all "Read Aloud" actions</CardDescription>
                                    </div>
                                    <Switch
                                        checked={defaultPresetName === form.name}
                                        onCheckedChange={(v) => v && handleSetDefault(form.name)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <Label>Pitch ({form.pitch})</Label>
                                    </div>
                                    <Slider
                                        value={[form.pitch || 1.0]}
                                        min={0.5}
                                        max={2.0}
                                        step={0.1}
                                        onValueChange={([v]) => setForm({ ...form, pitch: v })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <Label>Speed ({form.speed}x)</Label>
                                    </div>
                                    <Slider
                                        value={[form.speed || 1.0]}
                                        min={0.5}
                                        max={3.0}
                                        step={0.1}
                                        onValueChange={([v]) => setForm({ ...form, speed: v })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 items-center">
                            <Button onClick={handleSave} disabled={saving} className="gap-2">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save Preset
                            </Button>
                            
                            <div className="flex items-center gap-1 border rounded-md p-1 bg-muted/50">
                                <Select value={testLang} onValueChange={setTestLang}>
                                    <SelectTrigger className="w-[110px] h-8 text-xs border-none bg-transparent focus:ring-0">
                                        <SelectValue placeholder="Lang" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {LANGUAGES.map(l => (
                                            <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="secondary" size="sm" onClick={handleTest} className="h-8 gap-2">
                                    <Volume2 className="h-3.5 w-3.5" />
                                    Test Voice
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
