"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Copy, Eye, EyeOff, Save } from "lucide-react"
import { API_URL } from "@/lib/utils"

interface OAuthConfig {
    client_id: string
    client_secret: string
    tenant_url: string
    redirect_uri: string
}

export function OAuthConfigTab() {
    const [config, setConfig] = useState<OAuthConfig>({
        client_id: "",
        client_secret: "",
        tenant_url: "",
        redirect_uri: ""
    })
    const [isLoading, setIsLoading] = useState(true)
    const [showSecret, setShowSecret] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        fetchConfig()
    }, [])

    const fetchConfig = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/oauth/config`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setConfig(data)
            }
        } catch (error) {
            console.error("Failed to fetch OAuth config", error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/oauth/config`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    client_id: config.client_id,
                    client_secret: config.client_secret,
                    tenant_url: config.tenant_url
                })
            })

            if (res.ok) {
                alert("Configuration saved successfully")
                fetchConfig() // Refresh to get masked secret back if needed
            } else {
                alert("Failed to save configuration")
            }
        } catch (error) {
            console.error("Error saving config", error)
        } finally {
            setIsSaving(false)
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        alert("Copied to clipboard")
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h2 className="text-lg font-medium">OAuth Configuration</h2>
                <p className="text-sm text-muted-foreground">
                    Configure Single Sign-On (SSO) settings.
                </p>
            </div>

            <div className="space-y-4">
                <div className="grid gap-2">
                    <Label htmlFor="client-id">Client ID</Label>
                    <Input
                        id="client-id"
                        value={config.client_id}
                        onChange={(e) => setConfig({ ...config, client_id: e.target.value })}
                        placeholder="e.g. 12345678-1234-1234-1234-1234567890ab"
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="client-secret">Client Secret</Label>
                    <div className="relative">
                        <Input
                            id="client-secret"
                            type={showSecret ? "text" : "password"}
                            value={config.client_secret}
                            onChange={(e) => setConfig({ ...config, client_secret: e.target.value })}
                            placeholder="Enter client secret"
                            className="pr-10"
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowSecret(!showSecret)}
                        >
                            {showSecret ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                        </Button>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="tenant-url">Tenant URL / Authority</Label>
                    <Input
                        id="tenant-url"
                        value={config.tenant_url}
                        onChange={(e) => setConfig({ ...config, tenant_url: e.target.value })}
                        placeholder="e.g. https://login.microsoftonline.com/your-tenant-id"
                    />
                </div>

                <div className="grid gap-2 pt-4">
                    <Label htmlFor="redirect-uri">Redirect URI</Label>
                    <div className="flex gap-2">
                        <Input
                            id="redirect-uri"
                            value={config.redirect_uri}
                            readOnly
                            className="bg-muted text-muted-foreground"
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(config.redirect_uri)}
                            title="Copy to clipboard"
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Register this URI in your identity provider's application settings.
                    </p>
                </div>

                <div className="pt-4">
                    <Button onClick={handleSave} disabled={isSaving}>
                        <Save className="mr-2 h-4 w-4" />
                        {isSaving ? "Saving..." : "Save Configuration"}
                    </Button>
                </div>
            </div>
        </div>
    )
}
