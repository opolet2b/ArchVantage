/**
 * Unified Agent Execution Hook
 *
 * Single source of truth for executing agents in the chatbot.
 * Handles GUI forms, step tracking, and state management.
 *
 * This hook manages the entire lifecycle of agent execution:
 * 1. Start execution with inputs
 * 2. If GUI form is required, exposes waitingForInput state
 * 3. Submit form data via submitInput()
 * 4. Continue until completion or next form
 *
 * PEP 8 style: While this is TypeScript, we follow consistent
 * naming conventions and code organization.
 */
import { useState, useCallback, useEffect } from "react";
import { API_URL } from "./utils";

// =============================================================================
// Types
// =============================================================================

/**
 * Execution status values matching backend ExecutionState.
 */
export type ExecutionStatus =
    | "idle"
    | "executing"
    | "paused"
    | "waiting_for_input"
    | "completed"
    | "failed";

/**
 * GUI form information when user input is required.
 */
export interface GuiFormInfo {
    schema: {
        components?: Array<{
            id: string;
            type: string;
            label?: string;
            required?: boolean;
            defaultValue?: unknown;
            [key: string]: unknown;
        }>;
        layout?: {
            columns?: number;
            [key: string]: unknown;
        };
    };
    toolName: string;
    description: string;
    initial_values?: Record<string, unknown>;
}

/**
 * Result returned from execution.
 */
export interface ExecutionResult {
    success: boolean;
    status: ExecutionStatus;
    outputs: Record<string, unknown>;
    error?: string;
    executionId?: number;
}

/**
 * Options for the hook.
 */
export interface UseAgentExecutionOptions {
    /** Callback when status changes */
    onStatusChange?: (status: ExecutionStatus) => void;
    /** Callback when execution completes */
    onComplete?: (result: ExecutionResult) => void;
    /** Callback when error occurs */
    onError?: (error: string) => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing agent execution with GUI form support.
 *
 * @param options - Optional callbacks for status changes
 * @returns State and actions for agent execution
 *
 * @example
 * ```tsx
 * const execution = useAgentExecution();
 *
 * // Start execution
 * await execution.execute(agentId, inputs);
 *
 * // If form is needed
 * if (execution.waitingForInput) {
 *     // Render form using execution.waitingForInput.schema
 *     // On submit:
 *     await execution.submitInput(formData);
 * }
 * ```
 */
export function useAgentExecution(options: UseAgentExecutionOptions = {}) {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    const [status, setStatus] = useState<ExecutionStatus>("idle");
    const [outputs, setOutputs] = useState<Record<string, unknown>>({});
    const [error, setError] = useState<string | null>(null);
    const [waitingForInput, setWaitingForInput] = useState<GuiFormInfo | null>(
        null
    );
    const [executionId, setExecutionId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Get authentication token from storage.
     */
    const getToken = (): string | null => {
        return localStorage.getItem("token");
    };

    /**
     * Update status and fire callback.
     */
    const updateStatus = useCallback(
        (newStatus: ExecutionStatus) => {
            setStatus(newStatus);
            options.onStatusChange?.(newStatus);
        },
        [options]
    );

    // -------------------------------------------------------------------------
    // Response Handler
    // -------------------------------------------------------------------------

    /**
     * Process API response and update state accordingly.
     */
    const handleResponse = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data: any): ExecutionResult => {
            const newStatus = (data.status as ExecutionStatus) || "failed";
            updateStatus(newStatus);
            setExecutionId(data.execution_id || null);

            // Handle waiting for input state
            if (newStatus === "waiting_for_input" && data.gui_schema) {
                setWaitingForInput({
                    schema: data.gui_schema,
                    toolName: data.tool_name || "Form Input Required",
                    description: data.description || "",
                    initial_values: data.initial_values || {},
                });
            } else {
                setWaitingForInput(null);
            }

            // Handle completion
            if (newStatus === "completed") {
                const resultOutputs = data.outputs || {};
                setOutputs(resultOutputs);
                const result: ExecutionResult = {
                    success: true,
                    status: newStatus,
                    outputs: resultOutputs,
                    executionId: data.execution_id,
                };
                options.onComplete?.(result);
                return result;
            }

            // Handle failure
            if (newStatus === "failed") {
                const errorMsg = data.error || "Execution failed";
                setError(errorMsg);
                options.onError?.(errorMsg);
                return {
                    success: false,
                    status: newStatus,
                    outputs: {},
                    error: errorMsg,
                };
            }

            // Waiting for input or other state
            return {
                success: false,
                status: newStatus,
                outputs: data.outputs || {},
                executionId: data.execution_id,
            };
        },
        [updateStatus, options]
    );

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    /**
     * Start agent execution with provided inputs.
     *
     * @param agentId - The ID of the agent blueprint to execute
     * @param inputs - Input values for the agent
     * @returns Execution result
     */
    const execute = useCallback(
        async (
            agentId: string,
            inputs: Record<string, unknown>
        ): Promise<ExecutionResult> => {
            const token = getToken();
            if (!token) {
                const errorResult: ExecutionResult = {
                    success: false,
                    status: "failed",
                    outputs: {},
                    error: "Not authenticated",
                };
                setError("Not authenticated");
                updateStatus("failed");
                return errorResult;
            }

            // Reset state for new execution
            setIsLoading(true);
            setError(null);
            setOutputs({});
            setWaitingForInput(null);
            updateStatus("executing");

            try {
                const res = await fetch(`${API_URL}/chat/execute-agent`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ agent_id: agentId, inputs }),
                });

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(
                        errorData.detail || `Request failed: ${res.status}`
                    );
                }

                const data = await res.json();
                return handleResponse(data);
            } catch (e: unknown) {
                const errorMsg =
                    e instanceof Error ? e.message : "Unknown error";
                setError(errorMsg);
                updateStatus("failed");
                options.onError?.(errorMsg);
                return {
                    success: false,
                    status: "failed",
                    outputs: {},
                    error: errorMsg,
                };
            } finally {
                setIsLoading(false);
            }
        },
        [handleResponse, updateStatus, options]
    );

    /**
     * Submit GUI form data and resume execution.
     *
     * @param formData - Form values collected from user
     * @returns Execution result after resumption
     */
    const submitInput = useCallback(
        async (
            formData: Record<string, unknown>
        ): Promise<ExecutionResult | null> => {
            const token = getToken();
            if (!token || !executionId) {
                const errorMsg = "Cannot submit: no active execution";
                setError(errorMsg);
                options.onError?.(errorMsg);
                return null;
            }

            setIsLoading(true);
            setWaitingForInput(null);
            updateStatus("executing");

            try {
                const res = await fetch(
                    `${API_URL}/executions/${executionId}/input`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        // mode: 'production' ensures execution continues to completion
                        // (not pausing after each step like dry-run)
                        body: JSON.stringify({ inputs: formData, mode: "production" }),
                    }
                );

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(
                        errorData.detail || `Submit failed: ${res.status}`
                    );
                }

                const data = await res.json();
                return handleResponse(data);
            } catch (e: unknown) {
                const errorMsg =
                    e instanceof Error ? e.message : "Submit failed";
                setError(errorMsg);
                updateStatus("failed");
                options.onError?.(errorMsg);
                return {
                    success: false,
                    status: "failed",
                    outputs: {},
                    error: errorMsg,
                };
            } finally {
                setIsLoading(false);
            }
        },
        [executionId, handleResponse, updateStatus, options]
    );

    /**
     * Reset hook to initial state.
     * Call this when canceling execution or starting fresh.
     */
    const reset = useCallback(() => {
        setStatus("idle");
        setOutputs({});
        setError(null);
        setWaitingForInput(null);
        setExecutionId(null);
        setIsLoading(false);
    }, []);

    // -------------------------------------------------------------------------
    // Return
    // -------------------------------------------------------------------------

    return {
        // State
        status,
        outputs,
        error,
        waitingForInput,
        executionId,
        isLoading,

        // Computed
        isExecuting: status === "executing",
        isComplete: status === "completed",
        isFailed: status === "failed",
        needsInput: status === "waiting_for_input",

        // Actions
        execute,
        submitInput,
        reset,
    };
}
