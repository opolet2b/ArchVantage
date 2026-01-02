"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { FlaskConical, Save, Database, AlertCircle, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"

export function DatabaseSettingsTab() {
    const [dbUrl, setDbUrl] = useState("")
    const [loading, setLoading] = useState(false)
    const [testing, setTesting] = useState(false)
    const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null)

    useEffect(() => {
        fetchConfig()
    }, [])

    const fetchConfig = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/config/database`)
            if (res.ok) {
                const data = await res.json()
                setDbUrl(data.url || "")
            }
        } catch (error) {
            console.error("Failed to fetch database config:", error)
        }
    }

    const handleTestConnection = async () => {
        setTesting(true)
        setStatus(null)
        try {
            const res = await fetch(`${API_BASE_URL}/config/database/test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: dbUrl }),
            })
            const data = await res.json()
            if (data.status === "success") {
                setStatus({ type: "success", message: "Connection successful!" })
            } else {
                setStatus({ type: "error", message: `Connection failed: ${data.message}` })
            }
        } catch (error) {
            setStatus({ type: "error", message: `Network error: ${error}` })
        } finally {
            setTesting(false)
        }
    }

    const handleSave = async () => {
        setLoading(true)
        setStatus(null)
        try {
            const res = await fetch(`${API_BASE_URL}/config/database`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: dbUrl }),
            })
            const data = await res.json()
            if (data.status === "success") {
                setStatus({
                    type: "success",
                    message: data.message || "Saved successfully. Please restart the backend."
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
                        <Database className="h-5 w-5" />
                        Database Connection
                    </CardTitle>
                    <CardDescription>
                        Configure the database connection string. Changes require a backend restart.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="db-url">Connection String (DATABASE_URL)</Label>
                        <Input
                            id="db-url"
                            value={dbUrl}
                            onChange={(e) => setDbUrl(e.target.value)}
                            placeholder="sqlite:///./db/sql_app.db"
                        />
                        <p className="text-xs text-muted-foreground">
                            Examples:
                            <br />
                            SQLite: <code>sqlite:///./db/my_dev_db.db</code>
                            <br />
                            PostgreSQL: <code>postgresql://user:pass@localhost:5432/dbname</code>
                        </p>
                    </div>

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
                <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={handleTestConnection} disabled={testing || !dbUrl}>
                        {testing ? "Testing..." : (
                            <>
                                <FlaskConical className="mr-2 h-4 w-4" />
                                Test Connection
                            </>
                        )}
                    </Button>
                    <Button onClick={handleSave} disabled={loading || !dbUrl}>
                        {loading ? "Saving..." : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save & Apply
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
