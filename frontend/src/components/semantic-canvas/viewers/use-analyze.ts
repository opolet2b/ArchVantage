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

    const analyze = React.useCallback(
        async (params: AnalyzeParams): Promise<AnalyzeResult | null> => {
            const { canvasId, thingId, fragment, action, model, customPrompt } = params;

            setIsLoading(true);
            setError(null);
            console.log(`[useAnalyze] Starting analysis for thing: ${thingId}, action: ${action}`);

            try {
                const token = localStorage.getItem("token");
                if (!token) {
                    throw new Error("Not authenticated");
                }

                const response = await fetch(
                    `${API_URL}/canvases/${canvasId}/analyze`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            thing_id: thingId,
                            fragment: {
                                type: fragment.type,
                                content: fragment.content,
                                id: "id" in fragment ? fragment.id : undefined,
                                // Pass through fragment-specific fields using camelCase (matches Backend Schema Aliases)
                                ...("startOffset" in fragment && { startOffset: fragment.startOffset }),
                                ...("endOffset" in fragment && { endOffset: fragment.endOffset }),
                                ...("pageNumber" in fragment && { pageNumber: fragment.pageNumber }),
                                ...("sheet" in fragment && { sheet: fragment.sheet }),
                                ...("range" in fragment && { range: fragment.range }),
                                ...("x" in fragment && { x: fragment.x }),
                                ...("y" in fragment && { y: fragment.y }),
                                ...("width" in fragment && { width: fragment.width }),
                                ...("height" in fragment && { height: fragment.height }),
                                ...("messageId" in fragment && { messageId: fragment.messageId }),
                            },
                            action,
                            model,
                            custom_prompt: customPrompt,
                        }),
                    }
                );

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || "Analysis failed");
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
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                setError(errorMessage);
                console.error("[useAnalyze] Error:", errorMessage);
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        []
    );

    return { analyze, isLoading, error, result };
}
