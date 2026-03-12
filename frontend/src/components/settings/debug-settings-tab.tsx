"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { API_URL } from "@/lib/utils"
import { Loader2, RefreshCw, Trash2, Bug } from "lucide-react"

interface LogEntry {
    timestamp: string
    level: string
    feature: string
    module: string
    message: string
    metadata?: Record<string, any>
}

export function DebugSettingsTab() {
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [features, setFeatures] = useState<string[]>([])
    const [selectedFeature, setSelectedFeature] = useState<string>("")
    const [selectedLevel, setSelectedLevel] = useState<string>("")
    const [keyword, setKeyword] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const [expandedLog, setExpandedLog] = useState<number | null>(null)

    const fetchFeatures = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/debug/features`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setFeatures(data)

                // Only auto-select if nothing is selected AND we haven't fetched features yet
                // or if the current selected feature is no longer in the list (unless it's "All Features")
                if (data.length > 0) {
                    if (selectedFeature === "" && features.length === 0) {
                        setSelectedFeature(data[0])
                    } else if (selectedFeature !== "" && !data.includes(selectedFeature)) {
                        setSelectedFeature(data[0])
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch features", error)
        }
    }

    const fetchLogs = async () => {
        setLoading(true)
        try {
            const token = localStorage.getItem("token")
            let url = `${API_URL}/debug/logs?limit=200`
            if (selectedFeature) url += `&feature=${selectedFeature}`
            if (selectedLevel) url += `&level=${selectedLevel}`
            if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`

            const res = await fetch(url, {
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
        const target = selectedFeature ? `logs for feature "${selectedFeature}"` : "all debug logs"
        if (!confirm(`Are you sure you want to clear ${target}?`)) return
        try {
            const token = localStorage.getItem("token")
            let url = `${API_URL}/debug/clear`
            if (selectedFeature) url += `?feature=${selectedFeature}`

            await fetch(url, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            })
            setLogs([])
            fetchFeatures()
        } catch (error) {
            console.error("Failed to clear logs", error)
        }
    }

    const downloadLogs = () => {
        if (!selectedFeature) return
        const token = localStorage.getItem("token")
        const url = `${API_URL}/debug/logs/download?feature=${selectedFeature}&token=${token}`
        // Simple download trigger
        window.open(url, "_blank")
    }

    useEffect(() => {
        fetchFeatures()
    }, [])

    useEffect(() => {
        fetchLogs()
        const interval = setInterval(fetchLogs, 5000)
        return () => clearInterval(interval)
    }, [selectedFeature, selectedLevel, keyword])

    const toggleExpand = (index: number) => {
        setExpandedLog(expandedLog === index ? null : index)
    }

    return (
        <Card className="w-full h-full flex flex-col">
            <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Bug className="h-5 w-5" />
                            Debug Logs
                        </CardTitle>
                        <CardDescription>
                            Browse and manage internal system logs by feature.
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={downloadLogs} disabled={!selectedFeature}>
                            Download .log
                        </Button>
                        <Button variant="destructive" size="sm" onClick={clearLogs}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Clear
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 mt-4 items-end">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground uppercase">Feature</label>
                        <select
                            className="bg-background border rounded px-2 py-1 text-sm h-9 min-w-[150px]"
                            value={selectedFeature}
                            onChange={(e) => setSelectedFeature(e.target.value)}
                        >
                            <option value="">All Features</option>
                            {features.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground uppercase">Level</label>
                        <select
                            className="bg-background border rounded px-2 py-1 text-sm h-9 min-w-[100px]"
                            value={selectedLevel}
                            onChange={(e) => setSelectedLevel(e.target.value)}
                        >
                            <option value="">All Levels</option>
                            <option value="INFO">INFO</option>
                            <option value="DEBUG">DEBUG</option>
                            <option value="WARNING">WARNING</option>
                            <option value="ERROR">ERROR</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                        <label className="text-xs font-medium text-muted-foreground uppercase">Keyword Search</label>
                        <input
                            type="text"
                            placeholder="Search in messages..."
                            className="bg-background border rounded px-3 py-1 text-sm h-9 w-full"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden min-h-[500px] flex flex-col">
                <div className="border rounded-md flex-1 overflow-y-auto bg-slate-950 text-slate-200 font-mono text-sm shadow-inner">
                    {logs.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground italic">
                            No logs found for the selected criteria.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {logs.map((log, index) => (
                                <div key={index} className="hover:bg-slate-900 transition-colors">
                                    <div
                                        className="p-3 flex gap-4 cursor-pointer items-center"
                                        onClick={() => toggleExpand(index)}
                                    >
                                        <div className="whitespace-nowrap text-slate-500 text-[10px] w-20">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </div>
                                        <div className={`whitespace-nowrap font-bold text-[10px] w-16 text-center rounded px-1 py-0.5 ${log.level === "ERROR" ? "bg-red-900/50 text-red-200 border border-red-700" :
                                            log.level === "WARNING" ? "bg-yellow-900/50 text-yellow-200 border border-yellow-700" :
                                                log.level === "DEBUG" ? "bg-blue-900/50 text-blue-200 border border-blue-700" :
                                                    "bg-green-900/50 text-green-200 border border-green-700"
                                            }`}>
                                            {log.level}
                                        </div>
                                        <div className="whitespace-nowrap text-cyan-400 font-bold text-xs w-28 truncate" title={log.feature}>
                                            [{log.feature}]
                                        </div>
                                        <div className="whitespace-nowrap text-slate-400 font-semibold w-24 truncate text-xs" title={log.module}>
                                            {log.module}
                                        </div>
                                        <div className="flex-1 truncate text-slate-300" title={log.message}>
                                            {log.message}
                                        </div>
                                    </div>
                                    {expandedLog === index && (
                                        <div className="p-4 bg-slate-900/80 border-t border-slate-800 ml-4 mb-2 mr-4 rounded shadow-lg animate-in slide-in-from-top-1">
                                            <div className="mb-2 text-xs text-slate-400 flex justify-between">
                                                <span>Full Timestamp: {log.timestamp}</span>
                                                <span>Feature: {log.feature} | Module: {log.module}</span>
                                            </div>
                                            <div className="text-slate-200 mb-4 whitespace-pre-wrap break-words">
                                                {log.message}
                                            </div>
                                            {log.metadata && (
                                                <div className="mt-2">
                                                    <div className="text-[10px] text-slate-500 uppercase mb-1 font-bold">Metadata</div>
                                                    <pre className="text-xs text-blue-300 bg-slate-950 p-3 rounded border border-slate-800 overflow-x-auto">
                                                        {JSON.stringify(log.metadata, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
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
