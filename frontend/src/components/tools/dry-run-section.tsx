"use client"

import { Button } from "@/components/ui/button"
import { Play, AlertCircle, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface DryRunSectionProps {
    isVerified: boolean
    onExecutePipeline: () => void
    onDebugPipeline: () => void
}

export function DryRunSection({ isVerified, onExecutePipeline, onDebugPipeline }: DryRunSectionProps) {
    return (
        <div id="dry-run-section" className="space-y-4 p-4 border rounded-lg bg-green-50/50 dark:bg-green-900/10 shadow-sm transition-all">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">4 - Dry-run & Execution</h3>
                {isVerified && (
                    <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        Ready to Execute
                    </span>
                )}
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-lg border flex flex-col items-center justify-center text-center space-y-4">
                {!isVerified ? (
                    <div className="max-w-md space-y-2 opacity-80">
                        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                        <h4 className="font-medium text-muted-foreground">Verification Required</h4>
                        <p className="text-sm text-muted-foreground">
                            You must verify the pipeline in step 3 before you can execute a dry run.
                            This ensures all steps are valid and correctly configured.
                        </p>
                    </div>
                ) : (
                    <div className="max-w-md space-y-4 w-full">
                        <div className="text-sm text-muted-foreground">
                            The pipeline has been successfully verified. You can now execute it fully or debug step-by-step.
                        </div>

                        <div className="flex flex-col gap-3 w-full sm:w-auto sm:min-w-[200px] mx-auto">
                            <Button onClick={onExecutePipeline} size="lg" className="w-full flex items-center gap-2">
                                <Play className="h-4 w-4" />
                                Execute Pipeline
                            </Button>

                            <Button variant="outline" onClick={onDebugPipeline} className="w-full flex items-center gap-2">
                                <Play className="h-3 w-3" />
                                Debug Step-by-Step
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
