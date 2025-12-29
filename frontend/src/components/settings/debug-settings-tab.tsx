"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { API_URL } from "@/lib/utils"
import { Loader2, RefreshCw, Trash2, Bug } from "lucide-react"

interface LogEntry {
    timestamp: string
    level: string
    module: string
    message: string
    metadata?: Record<string, any>
}

export function DebugSettingsTab() {
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [expandedLog, setExpandedLog] = useState<number | null>(null)

    const fetchLogs = async () => {
        setLoading(true)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/debug/logs?limit=100`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {

                const data = await res.json()
                setLogs(data)
            }
        } catch (error) {
            console.error("Failed to fetch logs", error)
        } finally {
            setLoading(false)
        }
    }

    const clearLogs = async () => {
        if (!confirm("Are you sure you want to clear all debug logs?")) return
        try {
            const token = localStorage.getItem("token")
            await fetch(`${API_URL}/debug/clear`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            })
            setLogs([])

        } catch (error) {
            console.error("Failed to clear logs", error)
        }
    }

    useEffect(() => {
        fetchLogs()
        const interval = setInterval(fetchLogs, 5000) // Auto-refresh every 5s
        return () => clearInterval(interval)
    }, [])

    const toggleExpand = (index: number) => {
        setExpandedLog(expandedLog === index ? null : index)
    }

    return (
        <Card className="w-full h-full flex flex-col">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Bug className="h-5 w-5" />
                            Debug Logs
                        </CardTitle>
                        <CardDescription>
                            View internal system logs for debugging purposes.
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                        <Button variant="destructive" size="sm" onClick={clearLogs}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Clear
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden min-h-[500px] flex flex-col">
                <div className="border rounded-md flex-1 overflow-y-auto bg-slate-950 text-slate-200 font-mono text-sm">
                    {logs.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            No logs found. Perform actions to generate logs.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {logs.map((log, index) => (
                                <div key={index} className="hover:bg-slate-900">
                                    <div
                                        className="p-3 flex gap-4 cursor-pointer"
                                        onClick={() => toggleExpand(index)}
                                    >
                                        <div className="whitespace-nowrap text-slate-500 text-xs">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </div>
                                        <div className={`whitespace-nowrap font-bold text-xs w-16 text-center rounded px-1 py-0.5 ${log.level === "ERROR" ? "bg-red-900 text-red-200" :
                                            log.level === "WARN" ? "bg-yellow-900 text-yellow-200" :
                                                log.level === "DEBUG" ? "bg-blue-900 text-blue-200" :
                                                    "bg-green-900 text-green-200"
                                            }`}>
                                            {log.level}
                                        </div>
                                        <div className="whitespace-nowrap text-slate-400 font-semibold w-24 truncate" title={log.module}>
                                            {log.module}
                                        </div>
                                        <div className="flex-1 truncate" title={log.message}>
                                            {log.message}
                                        </div>
                                    </div>
                                    {expandedLog === index && log.metadata && (
                                        <div className="p-3 bg-slate-900 border-t border-slate-800 pl-24">
                                            <pre className="text-xs text-slate-300 overflow-x-auto">
                                                {JSON.stringify(log.metadata, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
