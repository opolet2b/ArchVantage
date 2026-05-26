"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { FlaskConical, Save, Database, AlertCircle, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { API_URL } from "@/lib/utils"

const API_BASE_URL = API_URL

export function DatabaseSettingsTab() {
    const [dbUrl, setDbUrl] = useState("")
    const [arcadeHost, setArcadeHost] = useState("http://localhost:2480")
    const [arcadeUser, setArcadeUser] = useState("root")
    const [arcadePassword, setArcadePassword] = useState("playwithdata")
    const [arcadeDb, setArcadeDb] = useState("knowledge_graph")
    const [sqlLoading, setSqlLoading] = useState(false)
    const [sqlTesting, setSqlTesting] = useState(false)
    const [sqlStatus, setSqlStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null)

    const [arcadeLoading, setArcadeLoading] = useState(false)
    const [arcadeTesting, setArcadeTesting] = useState(false)
    const [arcadeStatus, setArcadeStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null)
    useEffect(() => {
        fetchConfig()
    }, [])

    const fetchConfig = async () => {
        const token = localStorage.getItem("token")
        try {
            const res = await fetch(`${API_BASE_URL}/config/database`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setDbUrl(data.url || "")
                setArcadeHost(data.arcadedb_host || "http://localhost:2480")
                setArcadeUser(data.arcadedb_user || "root")
                setArcadePassword(data.arcadedb_password || "playwithdata")
                setArcadeDb(data.arcadedb_database || "knowledge_graph")
            }
        } catch (error) {
            console.error("Failed to fetch database config:", error)
        }
    }

    const handleTestSqlConnection = async () => {
        setSqlTesting(true)
        setSqlStatus(null)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_BASE_URL}/config/database/test`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ url: dbUrl, target: "sql" }),
            })
            const data = await res.json()
            if (data.status === "success" || data.status === "partial") {
                setSqlStatus({ type: "success", message: "SQL Connection successful!" })
            } else {
                setSqlStatus({ type: "error", message: `Connection failed: ${data.message}` })
            }
        } catch (error) {
            setSqlStatus({ type: "error", message: `Network error: ${error}` })
        } finally {
            setSqlTesting(false)
        }
    }

    const handleSaveSql = async () => {
        setSqlLoading(true)
        setSqlStatus(null)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_BASE_URL}/config/database`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    url: dbUrl
                }),
            })
            const data = await res.json()
            if (data.status === "success") {
                setSqlStatus({
                    type: "success",
                    message: data.message || "Saved successfully. Please restart the backend."
                })
            } else {
                setSqlStatus({ type: "error", message: "Failed to save configuration." })
            }
        } catch (error) {
            setSqlStatus({ type: "error", message: `Save failed: ${error}` })
        } finally {
            setSqlLoading(false)
        }
    }

    const handleTestArcadeConnection = async () => {
        setArcadeTesting(true)
        setArcadeStatus(null)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_BASE_URL}/config/database/test`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    arcadedb_host: arcadeHost,
                    arcadedb_user: arcadeUser,
                    arcadedb_password: arcadePassword,
                    arcadedb_database: arcadeDb,
                    target: "arcadedb"
                }),
            })
            const data = await res.json()
            if (data.status === "success" || data.status === "partial") {
                setArcadeStatus({ type: "success", message: "ArcadeDB Connection successful!" })
            } else {
                setArcadeStatus({ type: "error", message: `Connection failed: ${data.message}` })
            }
        } catch (error) {
            setArcadeStatus({ type: "error", message: `Network error: ${error}` })
        } finally {
            setArcadeTesting(false)
        }
    }

    const handleSaveArcade = async () => {
        setArcadeLoading(true)
        setArcadeStatus(null)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_BASE_URL}/config/database`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    arcadedb_host: arcadeHost,
                    arcadedb_user: arcadeUser,
                    arcadedb_password: arcadePassword,
                    arcadedb_database: arcadeDb
                }),
            })
            const data = await res.json()
            if (data.status === "success") {
                setArcadeStatus({
                    type: "success",
                    message: data.message || "Saved successfully. Please restart the backend."
                })
            } else {
                setArcadeStatus({ type: "error", message: "Failed to save configuration." })
            }
        } catch (error) {
            setArcadeStatus({ type: "error", message: `Save failed: ${error}` })
        } finally {
            setArcadeLoading(false)
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

                    {sqlStatus && (
                        <Alert variant={sqlStatus.type === "error" ? "destructive" : "default"} className={sqlStatus.type === "success" ? "border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20" : ""}>
                            {sqlStatus.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                            <AlertTitle>{sqlStatus.type === "success" ? "Success" : sqlStatus.type === "error" ? "Error" : "Info"}</AlertTitle>
                            <AlertDescription>
                                {sqlStatus.message}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
                <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={handleTestSqlConnection} disabled={sqlTesting || !dbUrl}>
                        {sqlTesting ? "Testing..." : (
                            <>
                                <FlaskConical className="mr-2 h-4 w-4" />
                                Test SQL Connection
                            </>
                        )}
                    </Button>
                    <Button onClick={handleSaveSql} disabled={sqlLoading || !dbUrl}>
                        {sqlLoading ? "Saving..." : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save SQL Config
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Knowledge Graph (ArcadeDB) Configuration
                    </CardTitle>
                    <CardDescription>
                        Configure the ArcadeDB connection. You must run a local Docker instance of ArcadeDB to use the Knowledge Graph feature.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="arcade-host">Host URL</Label>
                            <Input
                                id="arcade-host"
                                value={arcadeHost}
                                onChange={(e) => setArcadeHost(e.target.value)}
                                placeholder="http://localhost:2480"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="arcade-db">Database Name</Label>
                            <Input
                                id="arcade-db"
                                value={arcadeDb}
                                onChange={(e) => setArcadeDb(e.target.value)}
                                placeholder="knowledge_graph"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="arcade-user">Username</Label>
                            <Input
                                id="arcade-user"
                                value={arcadeUser}
                                onChange={(e) => setArcadeUser(e.target.value)}
                                placeholder="root"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="arcade-password">Password</Label>
                            <Input
                                id="arcade-password"
                                type="password"
                                value={arcadePassword}
                                onChange={(e) => setArcadePassword(e.target.value)}
                                placeholder="playwithdata"
                            />
                        </div>
                    </div>

                    {arcadeStatus && (
                        <Alert variant={arcadeStatus.type === "error" ? "destructive" : "default"} className={arcadeStatus.type === "success" ? "border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20" : ""}>
                            {arcadeStatus.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                            <AlertTitle>{arcadeStatus.type === "success" ? "Success" : arcadeStatus.type === "error" ? "Error" : "Info"}</AlertTitle>
                            <AlertDescription>
                                {arcadeStatus.message}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
                <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={handleTestArcadeConnection} disabled={arcadeTesting || !arcadeHost}>
                        {arcadeTesting ? "Testing..." : (
                            <>
                                <FlaskConical className="mr-2 h-4 w-4" />
                                Test ArcadeDB Connection
                            </>
                        )}
                    </Button>
                    <Button onClick={handleSaveArcade} disabled={arcadeLoading || !arcadeHost}>
                        {arcadeLoading ? "Saving..." : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save ArcadeDB Config
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
