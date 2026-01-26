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

    const handleScan = async () => {
        setScanning(true)
        try {
            const data = await maintenanceService.scanOrphans()
            setResult(data)
        } catch (e) {
            console.error(e)
        } finally {
            setScanning(false)
        }
    }

    const handleCleanup = async (type: 'all' | 'files' | 'embeddings') => {
        if (!result) return
        setCleaning(true)
        try {
            const payload = {
                files: type === 'all' || type === 'files' ? result.files.map(f => f.full_path) : [],
                embeddings: type === 'all' || type === 'embeddings' ? result.embeddings.map(e => e.id) : []
            }

            await maintenanceService.cleanupOrphans(payload)
            // Re-scan after cleanup
            await handleScan()
        } catch (e) {
            console.error(e)
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
                            <div className="text-2xl font-bold">{result.stats.embeddings}</div>
                            <div className="text-xs text-muted-foreground">Vector Database Entries</div>
                        </div>
                    </div>

                    {(result.files.length > 0 || result.embeddings.length > 0) ? (
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleCleanup('all')}
                                disabled={cleaning}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Clean All Orphans
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
                                        {result.files.map((f, i) => (
                                            <li key={i} className="flex items-center justify-between p-2 rounded bg-muted/40 font-mono text-xs">
                                                <span className="truncate">{f.path}</span>
                                                <span className="shrink-0 text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {result.embeddings.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                                        Embeddings ({result.embeddings.length})
                                    </h4>
                                    <ul className="space-y-2 text-sm">
                                        {result.embeddings.map((e, i) => (
                                            <li key={i} className="flex items-center justify-between p-2 rounded bg-muted/40 font-mono text-xs">
                                                <span className="truncate">{e.id}</span>
                                                <span className="bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full text-[10px] uppercase">{e.reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    )
}
