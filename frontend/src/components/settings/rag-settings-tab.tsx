"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Database, Loader2, Play } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { HelpTooltip } from "@/components/ui/help-tooltip"

export function RagSettingsTab() {
    const [strategy, setStrategy] = useState("recursive")
    const [chunkSize, setChunkSize] = useState("1000")
    const [chunkOverlap, setChunkOverlap] = useState("200")
    const [ingesting, setIngesting] = useState(false)
    const [status, setStatus] = useState<string | null>(null)

    const handleVectorize = async () => {
        setIngesting(true)
        setStatus("Ingesting...")
        try {
            const res = await fetch(`${API_URL}/rag/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    folder_path: "data",
                    chunk_size: parseInt(chunkSize),
                    chunk_overlap: parseInt(chunkOverlap)
                }),
            })

            if (res.ok) {
                const data = await res.json()
                setStatus(`Success! Processed ${data.count} documents.`)
            } else {
                const err = await res.json()
                setStatus(`Error: ${err.detail || "Failed to ingest"}`)
            }
        } catch (error) {
            console.error("Vectorization failed", error)
            setStatus("Error: Connection failed")
        } finally {
            setIngesting(false)
        }
    }

    return (
        <Card className="w-full max-w-2xl">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    RAG Knowledge Base
                </CardTitle>
                <CardDescription>
                    Configure how documents in the 'data' folder are vectorized for the Knowledge Base.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                <div className="space-y-4 border rounded-md p-4 bg-slate-50 dark:bg-slate-900">
                    <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            Ingestion Strategy
                            <HelpTooltip contentPath="settings/rag_strategy" />
                        </label>
                        <select
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={strategy}
                            onChange={(e) => setStrategy(e.target.value)}
                        >
                            <option value="recursive">Recursive Directory (Standard)</option>
                            {/* Future strategies can be added here */}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Standard strategy recursively reads all files in the data directory.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                Chunk Size
                                <HelpTooltip contentPath="settings/rag_chunk_size" />
                            </label>
                            <Input
                                type="number"
                                value={chunkSize}
                                onChange={(e) => setChunkSize(e.target.value)}
                                placeholder="1000"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                Chunk Overlap
                                <HelpTooltip contentPath="settings/rag_overlap" />
                            </label>
                            <Input
                                type="number"
                                value={chunkOverlap}
                                onChange={(e) => setChunkOverlap(e.target.value)}
                                placeholder="200"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <Button
                        onClick={handleVectorize}
                        disabled={ingesting}
                        size="lg"
                        className="w-full"
                    >
                        {ingesting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Vectorizing...
                            </>
                        ) : (
                            <>
                                <Play className="mr-2 h-4 w-4" />
                                Vectorize Knowledge Base
                            </>
                        )}
                    </Button>

                    {status && (
                        <div className={`text-sm p-2 rounded-md ${status.startsWith("Error") ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"}`}>
                            {status}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
