import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { maintenanceService, ScanResult } from "@/lib/maintenance-service"
import { Loader2, Trash2, AlertTriangle, File, Database } from "lucide-react"

export function MaintenanceTab() {
    const [scanning, setScanning] = useState(false)
    const [result, setResult] = useState<ScanResult | null>(null)
    const [cleaning, setCleaning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)

    const handleScan = async () => {
        setScanning(true)
        setError(null)
        setStatus("Scanning system for orphans...")
        try {
            const data = await maintenanceService.scanOrphans()
            setResult(data)
            setStatus(null)
        } catch (e: any) {
            console.error(e)
            setError(e.message || "Failed to scan orphans. Please try again.")
            setStatus(null)
        } finally {
            setScanning(false)
        }
    }

    const handleCleanup = async (type: 'all' | 'files' | 'embeddings' | 'deep') => {
        if (!result) return
        setCleaning(true)
        setError(null)
        setStatus("Performing cleanup... This may take a moment for large datasets.")
        try {
            const payload = {
                files: type === 'all' || type === 'files' ? result.files.map(f => f.full_path) : [],
                embeddings: type === 'all' || type === 'embeddings' ? result.embeddings.map(e => e.id) : [],
                purge_unlabelled: type === 'deep'
            }

            await maintenanceService.cleanupOrphans(payload)
            setStatus("Cleanup finished! Re-scanning...")
            // Re-scan after cleanup
            await handleScan()
        } catch (e: any) {
            console.error(e)
            setError(e.message || "Cleanup failed. The database might be currently locked.")
            setStatus(null)
        } finally {
            setCleaning(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">System Maintenance</h3>
                    <p className="text-sm text-muted-foreground">Scan and clean up orphaned files and database entries.</p>
                </div>
                <Button onClick={handleScan} disabled={scanning || cleaning}>
                    {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {scanning ? "Scanning..." : "Scan for Orphans"}
                </Button>
            </div>

            {status && (
                <div className="flex items-center gap-2 p-3 text-sm bg-blue-500/10 text-blue-600 rounded-lg animate-pulse">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {status}
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 text-sm bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                </div>
            )}

            {result && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg border p-4 bg-muted/20">
                            <div className="flex items-center gap-2 mb-2">
                                <File className="h-4 w-4 text-primary" />
                                <span className="font-semibold">Orphaned Files</span>
                            </div>
                            <div className="text-2xl font-bold">{result.stats.files}</div>
                            <div className="text-xs text-muted-foreground">Total Size: {result.stats.total_size_mb.toFixed(2)} MB</div>
                        </div>
                        <div className="rounded-lg border p-4 bg-muted/20">
                            <div className="flex items-center gap-2 mb-2">
                                <Database className="h-4 w-4 text-primary" />
                                <span className="font-semibold">Orphaned Embeddings</span>
                            </div>
                            <div className="text-2xl font-bold">{result.stats.embeddings.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">
                                {result.stats.total_embeddings ?
                                    `${((result.stats.embeddings / result.stats.total_embeddings) * 100).toFixed(1)}% of Vector DB`
                                    : "Vector Database Entries"}
                            </div>
                        </div>
                    </div>

                    {(result.files.length > 0 || result.stats.embeddings > 0) ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {result.stats.embeddings > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/5"
                                    onClick={() => handleCleanup('deep')}
                                    disabled={cleaning || scanning}
                                >
                                    <AlertTriangle className="mr-2 h-4 w-4" />
                                    Deep Purge All Unlabelled
                                </Button>
                            )}
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleCleanup('all')}
                                disabled={cleaning || scanning}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {result.stats.embeddings > 10000 ? "Clean Files & Specific Orphans" : "Clean All Orphans"}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center p-8 border rounded-lg bg-green-500/5 text-green-600">
                            Everything is clean! No orphans found.
                        </div>
                    )}

                    <ScrollArea className="h-[300px] rounded-md border p-4">
                        <div className="space-y-4">
                            {result.files.length > 0 && (
                                <div>
                                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                                        Files ({result.files.length})
                                    </h4>
                                    <ul className="space-y-2 text-sm">
                                        {result.files.slice(0, 100).map((f, i) => (
                                            <li key={i} className="flex items-center justify-between p-2 rounded bg-muted/40 font-mono text-xs">
                                                <span className="truncate">{f.path}</span>
                                                <span className="shrink-0 text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                                            </li>
                                        ))}
                                        {result.files.length > 100 && (
                                            <li className="text-center text-xs text-muted-foreground py-2">
                                                ... and {result.files.length - 100} more files
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}

                            {result.embeddings.length > 0 ? (
                                <div className="mt-4">
                                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                                        Specific Orphaned Embeddings ({result.embeddings.length})
                                    </h4>
                                    <ul className="space-y-2 text-sm">
                                        {result.embeddings.slice(0, 50).map((e, i) => (
                                            <li key={i} className="flex items-center justify-between p-2 rounded bg-muted/40 font-mono text-xs">
                                                <span className="truncate">{e.id}</span>
                                                <span className="bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full text-[10px] uppercase">{e.reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : result.stats.embeddings > 0 ? (
                                <div className="mt-4 p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="font-semibold text-sm text-yellow-700">Massive Orphan Detected</h4>
                                            <p className="text-xs text-yellow-600 mt-1">
                                                There are {result.stats.embeddings.toLocaleString()} unlabelled embeddings in the database.
                                                These are likely legacy records from accidental ingestions (e.g., `sql_app.db`).
                                            </p>
                                            <p className="text-xs text-yellow-600 mt-2 font-medium">
                                                Use "Deep Purge" to safely remove these without affecting your active canvases.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    )
}
