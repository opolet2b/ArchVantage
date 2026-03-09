"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings2, Loader2, Save } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { useToast } from "@/components/ui/use-toast"

interface QueryingConfig {
    similarity_top_k: number
    similarity_cutoff: number | null
    retrieval_mode: string
    postprocessor: string
    postprocessor_config: Record<string, any>
    response_mode: string
}

export function QueryingSettingsTab() {
    const { toast } = useToast()
    const [config, setConfig] = useState<QueryingConfig>({
        similarity_top_k: 5,
        similarity_cutoff: null,
        retrieval_mode: "embedding",
        postprocessor: "none",
        postprocessor_config: {},
        response_mode: "simple"
    })

    // UI state for cutoff toggle (since null means disabled)
    const [enableCutoff, setEnableCutoff] = useState(false)
    const [cutoffValue, setCutoffValue] = useState(0.75) // Default UI value

    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        fetchConfig()
    }, [])

    const fetchConfig = async () => {
        try {
            const res = await fetch(`${API_URL}/config/querying`)
            if (res.ok) {
                const data = await res.json()
                const cfg = data.config
                setConfig(cfg)

                // Sync local UI states
                if (cfg.similarity_cutoff !== null) {
                    setEnableCutoff(true)
                    setCutoffValue(cfg.similarity_cutoff)
                } else {
                    setEnableCutoff(false)
                }
            }
        } catch (error) {
            console.error("Failed to load config", error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            // Prepare payload
            const payload = {
                ...config,
                similarity_cutoff: enableCutoff ? cutoffValue : null
            }

            const res = await fetch(`${API_URL}/config/querying`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            if (res.ok) {
                toast({ title: "Settings Saved", description: "Query pipeline updated." })
                // Update local config to match saved state
                setConfig(payload)
            } else {
                throw new Error("Failed to save")
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to save settings.",
                variant: "destructive"
            })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5" />
                        Advanced Querying Settings
                    </CardTitle>
                    <CardDescription>
                        Fine-tune the RAG retrieval pipeline, post-processing filters, and synthesis strategy.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            {/* RETRIEVAL SECTION */}
                            <div className="space-y-4 border-b pb-6">
                                <h3 className="font-semibold text-sm uppercase text-muted-foreground mb-4">Retrieval Strategy</h3>

                                <div className="space-y-4">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <Label className="flex items-center gap-2">
                                                Top K ({config.similarity_top_k})
                                                <HelpTooltip contentPath="querying/top_k" />
                                            </Label>
                                            <span className="text-xs text-muted-foreground">Number of chunks to retrieve</span>
                                        </div>
                                        <Slider
                                            value={[config.similarity_top_k]}
                                            min={1}
                                            max={20}
                                            step={1}
                                            onValueChange={(val: number[]) => setConfig({ ...config, similarity_top_k: val[0] })}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Label className="flex items-center gap-2">
                                                    Similarity Cutoff
                                                    <HelpTooltip contentPath="querying/similarity_cutoff" />
                                                </Label>
                                                <Switch
                                                    checked={enableCutoff}
                                                    onCheckedChange={setEnableCutoff}
                                                />
                                            </div>
                                            <span className="text-xs text-muted-foreground">Filter low-quality matches</span>
                                        </div>
                                        {enableCutoff && (
                                            <div className="pt-2">
                                                <div className="flex justify-between mb-2">
                                                    <span className="text-xs">Lenient (0.5)</span>
                                                    <span className="font-medium text-sm">{cutoffValue}</span>
                                                    <span className="text-xs">Strict (0.9)</span>
                                                </div>
                                                <Slider
                                                    value={[cutoffValue]}
                                                    min={0.5}
                                                    max={0.95}
                                                    step={0.05}
                                                    onValueChange={(val: number[]) => setCutoffValue(val[0])}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            Retrieval Mode
                                            <HelpTooltip contentPath="querying/retrieval_mode" />
                                        </Label>
                                        <Select
                                            value={config.retrieval_mode}
                                            onValueChange={(v) => setConfig({ ...config, retrieval_mode: v })}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="embedding">Dense (Embedding Check)</SelectItem>
                                                {/* <SelectItem value="hybrid" disabled>Hybrid (Keyword + Embedding) - Coming Soon</SelectItem> */}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* POSTPROCESSING SECTION */}
                            <div className="space-y-4 border-b pb-6">
                                <h3 className="font-semibold text-sm uppercase text-muted-foreground mb-4">Node Post-Processing</h3>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            Postprocessor
                                            <HelpTooltip contentPath="querying/postprocessor_general" />
                                        </Label>
                                        <Select
                                            value={config.postprocessor}
                                            onValueChange={(v) => setConfig({ ...config, postprocessor: v, postprocessor_config: {} })}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">None (Fastest)</SelectItem>
                                                <SelectItem value="keyword">Keyword Filter</SelectItem>
                                                <SelectItem value="similarity_cutoff">Similarity Cutoff (Explicit)</SelectItem>
                                                <SelectItem value="metadata_replacement">Metadata Replacement</SelectItem>
                                                <SelectItem value="long_context_reorder">Long Context Reorder</SelectItem>
                                                <SelectItem value="sentence_embedding_optimizer">Sentence Embedding Optimizer</SelectItem>
                                                <SelectItem value="cohere_rerank">Cohere Rerank</SelectItem>
                                                <SelectItem value="sentence_transformer">Sentence Transformer Rerank</SelectItem>
                                                <SelectItem value="llm_rerank">LLM Rerank</SelectItem>
                                                <SelectItem value="jina_rerank">Jina Rerank</SelectItem>
                                                <SelectItem value="colbert_rerank">Colbert Rerank</SelectItem>
                                                <SelectItem value="rankllm_rerank">RankLLM Rerank</SelectItem>
                                                <SelectItem value="fixed_recency">Fixed Recency</SelectItem>
                                                <SelectItem value="embedding_recency">Embedding Recency</SelectItem>
                                                <SelectItem value="time_weighted">Time Weighted</SelectItem>
                                                <SelectItem value="prev_next">Prev/Next Node</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Dynamic Configurations */}
                                    {config.postprocessor === "metadata_replacement" && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>Target Keyword (Window)</Label>
                                                <Input
                                                    placeholder="window"
                                                    value={config.postprocessor_config.target_keyword || "window"}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, target_keyword: e.target.value }
                                                    })}
                                                />
                                                <p className="text-xs text-muted-foreground">Replaces node content with surrounding window context.</p>
                                            </div>
                                        </div>
                                    )}

                                    {config.postprocessor === "sentence_embedding_optimizer" && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>Percentile Cutoff (0.0 - 1.0)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    max="1"
                                                    min="0"
                                                    value={config.postprocessor_config.percentile || 0.5}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, percentile: parseFloat(e.target.value) }
                                                    })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Threshold</Label>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    max="1"
                                                    min="0"
                                                    value={config.postprocessor_config.threshold || 0.7}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, threshold: parseFloat(e.target.value) }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {config.postprocessor === "llm_rerank" && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>Top N</Label>
                                                <Input
                                                    type="number"
                                                    className="w-24"
                                                    value={config.postprocessor_config.top_n || 5}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, top_n: parseInt(e.target.value) }
                                                    })}
                                                />
                                                <p className="text-xs text-muted-foreground">Uses the currently configured LLM to re-rank results.</p>
                                            </div>
                                        </div>
                                    )}

                                    {config.postprocessor === "jina_rerank" && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>Jina API Key</Label>
                                                <Input
                                                    type="password"
                                                    value={config.postprocessor_config.api_key || ""}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, api_key: e.target.value }
                                                    })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Top N</Label>
                                                <Input
                                                    type="number"
                                                    className="w-24"
                                                    value={config.postprocessor_config.top_n || 5}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, top_n: parseInt(e.target.value) }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {(config.postprocessor === "colbert_rerank" || config.postprocessor === "rankllm_rerank") && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>Model Name</Label>
                                                <Input
                                                    placeholder={config.postprocessor === "colbert_rerank" ? "colbert-ir/colbertv2.0" : "rank_zephyr_7b_v1_full"}
                                                    value={config.postprocessor_config.model || ""}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, model: e.target.value }
                                                    })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Top N</Label>
                                                <Input
                                                    type="number"
                                                    className="w-24"
                                                    value={config.postprocessor_config.top_n || 5}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, top_n: parseInt(e.target.value) }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {(config.postprocessor === "fixed_recency" || config.postprocessor === "embedding_recency" || config.postprocessor === "time_weighted") && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>Date Metadata Key</Label>
                                                <Input
                                                    placeholder="last_modified"
                                                    value={config.postprocessor_config.date_key || "last_modified"}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, date_key: e.target.value }
                                                    })}
                                                />
                                            </div>

                                            {config.postprocessor === "time_weighted" && (
                                                <div className="space-y-2">
                                                    <Label>Time Decay (0.0 - 1.0)</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={config.postprocessor_config.time_decay || 0.99}
                                                        onChange={(e) => setConfig({
                                                            ...config,
                                                            postprocessor_config: { ...config.postprocessor_config, time_decay: parseFloat(e.target.value) }
                                                        })}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {config.postprocessor === "prev_next" && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>Number of Nodes (Context)</Label>
                                                <Input
                                                    type="number"
                                                    value={config.postprocessor_config.num_nodes || 1}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, num_nodes: parseInt(e.target.value) }
                                                    })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Mode</Label>
                                                <Select
                                                    value={config.postprocessor_config.mode || "both"}
                                                    onValueChange={(v) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, mode: v }
                                                    })}
                                                >
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="both">Previous & Next</SelectItem>
                                                        <SelectItem value="next">Next Only</SelectItem>
                                                        <SelectItem value="prev">Previous Only</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}
                                    {config.postprocessor === "keyword" && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>Required Keywords (Comma separated)</Label>
                                                <Input
                                                    placeholder="e.g. urgent, important"
                                                    value={config.postprocessor_config.required_keywords || ""}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, required_keywords: e.target.value }
                                                    })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Exclude Keywords</Label>
                                                <Input
                                                    placeholder="e.g. deprecated, draft"
                                                    value={config.postprocessor_config.exclude_keywords || ""}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, exclude_keywords: e.target.value }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {config.postprocessor === "cohere_rerank" && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>Cohere API Key</Label>
                                                <Input
                                                    type="password"
                                                    placeholder="Get from cohere.com"
                                                    value={config.postprocessor_config.api_key || ""}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, api_key: e.target.value }
                                                    })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Top N (Re-ranked Count)</Label>
                                                <Input
                                                    type="number"
                                                    className="w-24"
                                                    value={config.postprocessor_config.top_n || 5}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, top_n: parseInt(e.target.value) }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {config.postprocessor === "sentence_transformer" && (
                                        <div className="space-y-3 p-4 bg-muted/50 rounded-md">
                                            <div className="space-y-2">
                                                <Label>HuggingFace Model Name</Label>
                                                <Input
                                                    placeholder="cross-encoder/ms-marco-MiniLM-L-12-v2"
                                                    value={config.postprocessor_config.model || ""}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, model: e.target.value }
                                                    })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Top N</Label>
                                                <Input
                                                    type="number"
                                                    className="w-24"
                                                    value={config.postprocessor_config.top_n || 5}
                                                    onChange={(e) => setConfig({
                                                        ...config,
                                                        postprocessor_config: { ...config.postprocessor_config, top_n: parseInt(e.target.value) }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* RESPONSE SYNTHESIS SECTION */}
                            <div className="space-y-4 border-b pb-6">
                                <h3 className="font-semibold text-sm uppercase text-muted-foreground mb-4">Response Synthesis</h3>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        Synthesis Mode
                                        <HelpTooltip contentPath="querying/response_synthesizer" />
                                    </Label>
                                    <Select
                                        value={config.response_mode}
                                        onValueChange={(v) => setConfig({ ...config, response_mode: v })}
                                    >
                                        <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="simple">Simple (Fast, Manual Chat Context)</SelectItem>
                                            <SelectItem value="compact">Compact (Concatenate & Refine)</SelectItem>
                                            <SelectItem value="tree_summarize">Tree Summarize (Deep Summary)</SelectItem>
                                            <SelectItem value="refine">Refine (Iterative Improvement)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                                        <p><strong>Note:</strong> This setting <strong>ONLY</strong> applies to <strong>Knowledge Base access</strong> (Linked Assets).</p>
                                        <p>Local document chats (Sidebar uploads) will always use 'Simple' mode for speed.</p>
                                    </div>
                                </div>
                            </div>


                            <Button onClick={handleSave} disabled={isSaving} className="w-full">
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Querying Settings
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div >
    )
}
