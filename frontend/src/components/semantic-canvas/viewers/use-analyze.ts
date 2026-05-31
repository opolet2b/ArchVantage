/**
 * Use Analyze Hook
 *
 * Hook for calling the canvas analyze API endpoint.
 * Handles LLM analysis of selected content.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { API_URL } from "@/lib/utils";
import type { Fragment } from "./types";
import type { LLMAction } from "./selection-toolbar";
import { useToast } from "@/components/ui/use-toast";

// =============================================================================
// Types
// =============================================================================

interface AnalyzeParams {
    canvasId: string;
    thingId: string;
    fragment: Fragment;
    action: LLMAction;
    model?: string;
    customPrompt?: string;
    onChunk?: (chunk: string) => void;
}

interface AnalyzeResult {
    thingId: string;
    action: string;
    result: string;
    createdThingId?: string;
}

interface UseAnalyzeReturn {
    analyze: (params: AnalyzeParams) => Promise<AnalyzeResult | null>;
    isLoading: boolean;
    error: string | null;
    result: AnalyzeResult | null;
}

// =============================================================================
// Hook
// =============================================================================

export function useAnalyze(): UseAnalyzeReturn {
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [result, setResult] = React.useState<AnalyzeResult | null>(null);
    const { toast } = useToast();

    const analyze = React.useCallback(
        async (params: AnalyzeParams): Promise<AnalyzeResult | null> => {
            const { canvasId, thingId, fragment, action, model, customPrompt } = params;

            setIsLoading(true);
            setError(null);
            try {
                const token = localStorage.getItem("token");
                if (!token) {
                    throw new Error("Not authenticated");
                }

                const requestPayload = {
                    thing_id: thingId,
                    fragment: {
                        type: fragment.type,
                        content: fragment.content,
                        // Pass through fragment-specific fields
                        ...("startOffset" in fragment && { start_offset: fragment.startOffset }),
                        ...("endOffset" in fragment && { end_offset: fragment.endOffset }),
                        ...("pageNumber" in fragment && { page_number: fragment.pageNumber }),
                        ...("sheet" in fragment && { sheet: fragment.sheet }),
                        ...("range" in fragment && { range: fragment.range }),
                        ...("x" in fragment && { x: fragment.x }),
                        ...("y" in fragment && { y: fragment.y }),
                        ...("width" in fragment && { width: fragment.width }),
                        ...("height" in fragment && { height: fragment.height }),
                        ...("messageId" in fragment && { message_id: fragment.messageId }),
                    },
                    action,
                    model,
                    custom_prompt: customPrompt,
                };

                if (params.onChunk) {
                    // Streaming flow
                    const response = await fetch(
                        `${API_URL}/canvases/${canvasId}/analyze/stream`,
                        {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${token}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify(requestPayload),
                        }
                    );

                    if (!response.ok) {
                        console.error(`[useAnalyze] Request failed with status: ${response.status} ${response.statusText}`);
                        const errorText = await response.text();
                        let detail = `Request failed with status ${response.status}`;
                        if (response.status === 504) {
                            detail = "504 Gateway Timeout: The LLM took too long to respond. Please increase the proxy timeout or use a faster model.";
                        }
                        try {
                            const json = JSON.parse(errorText);
                            if (json.detail) detail = json.detail;
                        } catch (e) {}
                        throw new Error(detail);
                    }

                    if (!response.body) {
                        throw new Error("No response body returned from server");
                    }

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    let finalResult = "";

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                const event = JSON.parse(line);
                                if (event.type === "chunk" && event.content) {
                                    params.onChunk(event.content);
                                    finalResult += event.content;
                                } else if (event.type === "complete") {
                                    finalResult = event.result || finalResult;
                                } else if (event.type === "error") {
                                    throw new Error(event.content);
                                }
                            } catch (e) {
                                console.error("Error parsing analysis event:", e);
                            }
                        }
                    }

                    const analyzeResult: AnalyzeResult = {
                        thingId,
                        action,
                        result: finalResult,
                    };
                    setResult(analyzeResult);
                    return analyzeResult;

                } else {
                    // Synchronous Flow (fallback)
                    const response = await fetch(
                        `${API_URL}/canvases/${canvasId}/analyze`,
                        {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${token}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify(requestPayload),
                        }
                    );

                    if (!response.ok) {
                        console.error(`[useAnalyze] Request failed with status: ${response.status} ${response.statusText}`);
                        const errorText = await response.text();
                        console.error(`[useAnalyze] Error body: ${errorText}`);
                        let detail = `Request failed with status ${response.status}`;
                        if (response.status === 504) {
                            detail = "504 Gateway Timeout: The LLM took too long to respond. Please increase the proxy timeout (e.g. Nginx proxy_read_timeout) or use a faster model.";
                        }
                        try {
                            const json = JSON.parse(errorText);
                            if (json.detail) detail = json.detail;
                        } catch (e) { /* ignore json parse error */ }

                        throw new Error(detail);
                    }

                    const data = await response.json();
                    const analyzeResult: AnalyzeResult = {
                        thingId: data.thing_id,
                        action: data.action,
                        result: data.result,
                        createdThingId: data.created_thing_id,
                    };

                    setResult(analyzeResult);
                    return analyzeResult;
                }
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                setError(errorMessage);
                console.error("[useAnalyze] Error:", errorMessage);
                
                toast({
                    title: "Analysis Failed",
                    description: errorMessage,
                    variant: "destructive"
                });
                
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        []
    );

    return { analyze, isLoading, error, result };
}

