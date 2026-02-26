"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, ArrowRight, ShieldAlert, Loader2, Check } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { API_URL } from "@/lib/utils"

export default function ReconciliationCenter({ kbId, approvedClasses }: { kbId?: string, approvedClasses?: string[] }) {
    const [quarantineItems, setQuarantineItems] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [aligningId, setAligningId] = useState<string | null>(null)
    const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>({})
    const { toast } = useToast()

    const fetchQuarantineItems = useCallback(async () => {
        if (!kbId) return;
        setIsLoading(true)
        try {
            const res = await fetch(`${API_URL}/knowledge/kb/${kbId}/reconciliation/quarantine`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
            })
            if (res.ok) {
                const data = await res.json()
                setQuarantineItems(data.quarantine_items || [])
            }
        } catch (error) {
            console.error("Failed to fetch quarantine items", error)
        } finally {
            setIsLoading(false)
        }
    }, [kbId])

    useEffect(() => {
        fetchQuarantineItems()
    }, [fetchQuarantineItems])

    const handleAlign = async (uid: string, rid: string) => {
        const targetClass = selectedTargets[rid]
        if (!targetClass) {
            toast({ title: "Select a class", description: "Please select an approved class to align this entity to.", variant: "destructive" })
            return
        }

        setAligningId(rid)
        try {
            const res = await fetch(`${API_URL}/knowledge/kb/${kbId}/reconciliation/align`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({ node_id: rid, target_class: targetClass })
            })

            if (res.ok) {
                toast({ title: "Alignment Successful", description: `Node aligned to ${targetClass}` })
                setQuarantineItems(prev => prev.filter(i => i.rid !== rid))
            } else {
                toast({ title: "Alignment Failed", description: "Failed to align the entity.", variant: "destructive" })
            }
        } catch (error) {
            console.error("Align error", error)
            toast({ title: "Alignment Failed", description: "Network error occurred.", variant: "destructive" })
        } finally {
            setAligningId(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4 flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                    <h3 className="font-semibold text-amber-900 dark:text-amber-400">Semantic Quarantine Active</h3>
                    <p className="text-sm text-amber-700 dark:text-amber-500/80 mt-1 mb-3">
                        The following JIT-fetched entities do not match your current Ontology.
                        Please align them with existing Industry Standard classes or add new classes to your Ontology.
                    </p>
                    <Button variant="outline" size="sm" onClick={fetchQuarantineItems} className="bg-white border-amber-200 hover:bg-amber-50 text-amber-900" disabled={isLoading}>
                        {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                        Scan for Quarantined Entities
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {isLoading && quarantineItems.length === 0 ? (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <p>Loading quarantined items...</p>
                    </div>
                ) : quarantineItems.length === 0 ? (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
                        <Check className="h-12 w-12 text-emerald-500 mb-2 p-2 bg-emerald-100 rounded-full" />
                        <h3 className="text-lg font-medium text-foreground">No items currently in quarantine.</h3>
                        <p className="text-sm mt-1">Your knowledge graph is fully aligned with the ontology.</p>
                    </div>
                ) : (
                    quarantineItems.map((item, idx) => (
                        <Card key={idx} className="border-amber-200 dark:border-amber-900/50 flex flex-col">
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start mb-2">
                                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                                        Quarantined
                                    </Badge>
                                    <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={item.uid}>{item.uid}</span>
                                </div>
                                <CardTitle className="text-base line-clamp-1" title={item.raw_label}>{item.raw_label}</CardTitle>
                                <CardDescription className="flex items-center gap-1 text-amber-600 dark:text-amber-500 text-xs">
                                    <AlertCircle className="h-3 w-3 shrink-0" />
                                    {item.reason}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pb-3 flex-1 flex flex-col gap-3">
                                {item.summary && (
                                    <div className="text-xs text-muted-foreground line-clamp-2" title={item.summary}>
                                        {item.summary}
                                    </div>
                                )}
                                <div className="text-sm bg-muted/50 p-2 rounded-md mt-auto">
                                    <span className="text-muted-foreground text-xs block mb-1">LLM Extracted Type: </span>
                                    <span className="font-mono text-xs bg-background px-1.5 py-0.5 rounded border">{item.suggested_type}</span>
                                </div>

                                <div className="space-y-1.5 mt-2">
                                    <label className="text-xs font-medium">Align to Class:</label>
                                    <Select
                                        value={selectedTargets[item.rid] || ""}
                                        onValueChange={(val) => setSelectedTargets(prev => ({ ...prev, [item.rid]: val }))}
                                    >
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Select target..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {approvedClasses?.map(cls => (
                                                <SelectItem key={cls} value={cls} className="text-xs">{cls}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                            <CardFooter className="flex gap-2 pt-0 mt-auto">
                                <Button
                                    size="sm"
                                    className="w-full gap-1"
                                    onClick={() => handleAlign(item.uid, item.rid)}
                                    disabled={aligningId === item.rid || !selectedTargets[item.rid]}
                                >
                                    {aligningId === item.rid ? (
                                        <><Loader2 className="h-3 w-3 animate-spin" /> {item.rid} Aligning...</>
                                    ) : (
                                        <>Align <ArrowRight className="h-3 w-3" /></>
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
