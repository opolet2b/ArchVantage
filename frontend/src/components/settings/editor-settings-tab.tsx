"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Save, Edit, AlertCircle, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { API_URL } from "@/lib/utils"

const API_BASE_URL = API_URL

export function EditorSettingsTab() {
    const [useCollabora, setUseCollabora] = useState(false)
    const [collaboraServerUrl, setCollaboraServerUrl] = useState("")
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null)

    useEffect(() => {
        fetchConfig()
    }, [])

    const fetchConfig = async () => {
        const token = localStorage.getItem("token")
        try {
            const res = await fetch(`${API_BASE_URL}/config/editor`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setUseCollabora(data.config?.use_collabora || false)
                setCollaboraServerUrl(data.config?.collabora_server_url || "")
            }
        } catch (error) {
            console.error("Failed to fetch editor config:", error)
        }
    }

    const handleSave = async () => {
        setLoading(true)
        setStatus(null)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_BASE_URL}/config/editor`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    use_collabora: useCollabora,
                    collabora_server_url: collaboraServerUrl
                }),
            })
            const data = await res.json()
            if (data.status === "success") {
                setStatus({
                    type: "success",
                    message: "Saved successfully."
                })
            } else {
                setStatus({ type: "error", message: "Failed to save configuration." })
            }
        } catch (error) {
            setStatus({ type: "error", message: `Save failed: ${error}` })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Edit className="h-5 w-5" />
                        Editor Configuration
                    </CardTitle>
                    <CardDescription>
                        Configure settings related to the document editor and Collabora integration.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="use-collabora">Activate Collabora Usage</Label>
                            <p className="text-sm text-muted-foreground">
                                Enable this to use the Collabora server for document editing.
                            </p>
                        </div>
                        <Switch
                            id="use-collabora"
                            checked={useCollabora}
                            onCheckedChange={setUseCollabora}
                        />
                    </div>
                    {useCollabora && (
                        <div className="grid gap-2 pt-4">
                            <Label htmlFor="collabora-url">Collabora Server URL</Label>
                            <Input
                                id="collabora-url"
                                value={collaboraServerUrl}
                                onChange={(e) => setCollaboraServerUrl(e.target.value)}
                                placeholder="https://collabora.example.com"
                            />
                            <p className="text-xs text-muted-foreground">
                                Provide the full URL to your Collabora Online server instance.
                            </p>
                        </div>
                    )}

                    {status && (
                        <Alert variant={status.type === "error" ? "destructive" : "default"} className={status.type === "success" ? "border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20" : ""}>
                            {status.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                            <AlertTitle>{status.type === "success" ? "Success" : status.type === "error" ? "Error" : "Info"}</AlertTitle>
                            <AlertDescription>
                                {status.message}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end">
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? "Saving..." : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Config
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
