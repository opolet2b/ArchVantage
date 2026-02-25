"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, ArrowRight, ShieldAlert } from "lucide-react"

export default function ReconciliationCenter() {
    // Mock quarantine data
    const quarantineItems = [
        { uid: "ent-492", raw_label: "Unknown API Endpoint", suggested_type: "REST_Service", reason: "Type not in current ontology" },
        { uid: "ent-811", raw_label: "Legacy Database Record", suggested_type: "SQL_Table", reason: "Orphaned relation" }
    ]

    return (
        <div className="space-y-6">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4 flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                    <h3 className="font-semibold text-amber-900 dark:text-amber-400">Semantic Quarantine Active</h3>
                    <p className="text-sm text-amber-700 dark:text-amber-500/80 mt-1">
                        The following JIT-fetched entities do not match your current Ontology.
                        Please align them with existing Industry Standard classes or add new classes to your Ontology.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {quarantineItems.map((item, idx) => (
                    <Card key={idx} className="border-amber-200 dark:border-amber-900/50">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                                    Quarantined
                                </Badge>
                                <span className="text-xs text-muted-foreground">{item.uid}</span>
                            </div>
                            <CardTitle className="text-lg mt-2">{item.raw_label}</CardTitle>
                            <CardDescription className="flex items-center gap-1 text-red-500">
                                <AlertCircle className="h-3 w-3" />
                                {item.reason}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pb-3">
                            <div className="text-sm bg-muted p-2 rounded-md">
                                <span className="text-muted-foreground">LLM Suggested Type: </span>
                                <span className="font-mono text-xs bg-background px-1 py-0.5 rounded border">{item.suggested_type}</span>
                            </div>
                        </CardContent>
                        <CardFooter className="flex gap-2 pt-0">
                            <Button variant="outline" size="sm" className="w-full">Ignore</Button>
                            <Button size="sm" className="w-full gap-1">
                                Align <ArrowRight className="h-3 w-3" />
                            </Button>
                        </CardFooter>
                    </Card>
                ))}

                {quarantineItems.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                        No items currently in quarantine.
                    </div>
                )}
            </div>
        </div>
    )
}
