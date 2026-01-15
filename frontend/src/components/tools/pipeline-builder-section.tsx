"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowRight, Play, Wand2, CheckCircle2, AlertCircle, FileJson } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

interface PipelineStep {
    step_id: string
    function_ref: string
    arguments: Record<string, string>
    description?: string
}

interface PipelineBuilderSectionProps {
    pipeline: PipelineStep[]
    setPipeline: (pipeline: PipelineStep[]) => void
    inputSchema: string
    setInputSchema: (schema: string) => void
    outputSchema: string
    setOutputSchema: (schema: string) => void
    onGenerate: () => void
    onVerify: () => void
    isGenerating: boolean
    isVerified: boolean
}

interface NodeDetail {
    type: "input" | "step" | "output"
    title: string
    data: any
    index?: number
}

export function PipelineBuilderSection({
    pipeline,
    setPipeline,
    inputSchema,
    setInputSchema,
    outputSchema,
    setOutputSchema,
    onGenerate,
    onVerify,
    isGenerating,
    isVerified
}: PipelineBuilderSectionProps) {
    const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null)
    const [jsonContent, setJsonContent] = useState("")
    const [jsonError, setJsonError] = useState<string | null>(null)
    const [isJsonEditorOpen, setIsJsonEditorOpen] = useState(false)

    const handleOpenJsonEditor = () => {
        setJsonContent(JSON.stringify(pipeline, null, 2))
        setJsonError(null)
        setIsJsonEditorOpen(true)
    }

    const handleSaveFullJson = () => {
        try {
            const parsed = JSON.parse(jsonContent)
            if (!Array.isArray(parsed)) throw new Error("Pipeline must be an array")
            setPipeline(parsed)
            setIsJsonEditorOpen(false)
        } catch (e) {
            setJsonError((e as Error).message)
        }
    }

    const handleNodeClick = (node: NodeDetail) => {
        setSelectedNode(node)
        if (node.type === "input") {
            setJsonContent(inputSchema || "{}")
        } else if (node.type === "output") {
            setJsonContent(outputSchema || "{}")
        } else if (node.type === "step") {
            setJsonContent(JSON.stringify(node.data.arguments || {}, null, 2))
        }
        setJsonError(null)
    }

    const handleSaveNode = () => {
        if (!selectedNode) return

        try {
            // Validate JSON
            const parsed = JSON.parse(jsonContent)
            const formatted = JSON.stringify(parsed, null, 2)

            if (selectedNode.type === "input") {
                setInputSchema(formatted)
            } else if (selectedNode.type === "output") {
                setOutputSchema(formatted)
            } else if (selectedNode.type === "step" && selectedNode.index !== undefined) {
                const newPipeline = [...pipeline]
                newPipeline[selectedNode.index] = {
                    ...newPipeline[selectedNode.index],
                    arguments: parsed
                }
                setPipeline(newPipeline)
            }
            setSelectedNode(null)
        } catch (e) {
            setJsonError((e as Error).message)
        }
    }

    return (
        <div className="space-y-4 p-4 border rounded-lg bg-white dark:bg-slate-900 shadow-sm">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">3 - Implement Pipeline</h3>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onGenerate}
                        disabled={isGenerating}
                        className="flex items-center gap-2"
                    >
                        <Wand2 className="h-4 w-4" />
                        {isGenerating ? "Generating..." : "Generate Pipeline"}
                    </Button>
                    <Button
                        size="sm"
                        onClick={onVerify}
                        disabled={pipeline.length === 0}
                        className="flex items-center gap-2"
                    >
                        {isVerified ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        Verify Pipeline
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleOpenJsonEditor}
                        className="flex items-center gap-2"
                        title="Edit Full Pipeline JSON"
                    >
                        <FileJson className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="min-h-[150px] p-6 bg-slate-50 dark:bg-slate-950 rounded-lg border flex items-center gap-2 overflow-x-auto">
                {/* Input Node */}
                <Card
                    className="min-w-[120px] cursor-pointer hover:border-primary transition-colors flex-shrink-0"
                    onClick={() => handleNodeClick({ type: "input", title: "Input", data: null })}
                >
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold text-xs">IN</div>
                        <span className="text-sm font-medium">Input</span>
                        <Badge variant="secondary" className="text-[10px]">JSON</Badge>
                    </CardContent>
                </Card>

                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

                {/* Pipeline Steps */}
                {pipeline.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg h-24 text-muted-foreground text-sm italic px-4">
                        Generate or add steps to build pipeline
                    </div>
                ) : (
                    pipeline.map((step, index) => (
                        <div key={step.step_id} className="flex items-center gap-2 flex-shrink-0">
                            <Card
                                className="min-w-[140px] max-w-[200px] cursor-pointer hover:border-primary transition-colors"
                                onClick={() => handleNodeClick({ type: "step", title: step.step_id, data: step, index })}
                            >
                                <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-600 font-bold text-xs">{index + 1}</div>
                                    <span className="text-sm font-medium truncate w-full" title={step.function_ref}>{step.function_ref}</span>
                                    <Badge variant="outline" className="text-[10px] truncate max-w-full">{step.step_id}</Badge>
                                </CardContent>
                            </Card>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                    ))
                )}

                {pipeline.length > 0 && (
                    <>
                        {/* Output Node */}
                        <Card
                            className="min-w-[120px] cursor-pointer hover:border-primary transition-colors flex-shrink-0"
                            onClick={() => handleNodeClick({ type: "output", title: "Output", data: null })}
                        >
                            <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-600 font-bold text-xs">OUT</div>
                                <span className="text-sm font-medium">Output</span>
                                <Badge variant="secondary" className="text-[10px]">JSON</Badge>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Node Edit Sheet */}
            <Sheet open={!!selectedNode} onOpenChange={(open) => !open && setSelectedNode(null)}>
                <SheetContent className="sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle>Edit {selectedNode?.title}</SheetTitle>
                        <SheetDescription>
                            {selectedNode?.type === "input" && "Define the expected Input Schema (JSON Schema)."}
                            {selectedNode?.type === "output" && "Define the expected Output Schema (JSON Schema)."}
                            {selectedNode?.type === "step" && "Configure arguments for this step. Use {{input.field}} to reference input or previous steps."}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="py-6 space-y-4 h-full flex flex-col">
                        <div className="flex-1">
                            <Textarea
                                className="font-mono text-xs h-[400px] resize-none"
                                value={jsonContent}
                                onChange={(e) => setJsonContent(e.target.value)}
                            />
                            {jsonError && (
                                <div className="flex items-center gap-2 mt-2 text-red-500 text-sm">
                                    <AlertCircle className="h-4 w-4" />
                                    {jsonError}
                                </div>
                            )}
                        </div>
                    </div>

                    <SheetFooter>
                        <Button variant="outline" onClick={() => setSelectedNode(null)}>Cancel</Button>
                        <Button onClick={handleSaveNode}>Save Changes</Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            {/* Full Pipeline JSON Editor Dialog */}
            <Dialog open={isJsonEditorOpen} onOpenChange={setIsJsonEditorOpen}>
                <DialogContent className="sm:max-w-3xl h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Edit Full Pipeline JSON</DialogTitle>
                        <DialogDescription>
                            Directly edit the raw JSON structure of the pipeline. Ensure the format is valid.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 py-4">
                        <Textarea
                            className="font-mono text-xs h-full resize-none"
                            value={jsonContent}
                            onChange={(e) => setJsonContent(e.target.value)}
                        />
                        {jsonError && (
                            <div className="flex items-center gap-2 mt-2 text-red-500 text-sm">
                                <AlertCircle className="h-4 w-4" />
                                {jsonError}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsJsonEditorOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveFullJson}>Save Pipeline</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
