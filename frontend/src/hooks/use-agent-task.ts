import { useState, useEffect, useRef, useCallback } from 'react';
import { useCanvasStore } from "@/components/semantic-canvas/canvas-store";

export type AgentStep = "WAITING" | "GENERATING" | "DONE";
export type SyncState = 'idle' | 'checking' | 'completed' | 'running' | 'error';

export interface UseAgentTaskOptions {
    thingId: string;
    endpointPath: string; // e.g. "architecture_memo"
    stateKey: string;     // e.g. "memoState"
    onCompleted?: (data: any) => void;
}

export function useAgentTask({ thingId, endpointPath, stateKey, onCompleted }: UseAgentTaskOptions) {
    const updateThing = useCanvasStore((state) => state.updateThing);
    const things = useCanvasStore((state) => state.things);
    const thing = things.find(t => t.id === thingId);

    const stateContent: Record<string, any> = (thing?.content?.[stateKey] as Record<string, any>) || {};
    const [step, setStep] = useState<AgentStep>((stateContent.step as AgentStep) || "WAITING");
    const [progressPercent, setProgressPercent] = useState<number>(step === "GENERATING" ? 50 : 0);
    const [progressMessage, setProgressMessage] = useState<string>(
        step === "GENERATING" ? 'Running safely in the background...' : ''
    );
    const [elapsedTime, setElapsedTime] = useState<number | null>(null);
    const [syncState, setSyncState] = useState<SyncState>('idle');
    const abortControllerRef = useRef<AbortController | null>(null);

    // Sync step from DB
    useEffect(() => {
        const dbStep = (thing?.content?.[stateKey] as Record<string, any>)?.step as AgentStep || "WAITING";
        if (dbStep !== step && (dbStep === 'DONE' || dbStep === 'WAITING' || dbStep === 'GENERATING')) {
            setStep(dbStep);
        }
    }, [(thing?.content?.[stateKey] as Record<string, any>)?.step]);

    const updateState = useCallback((updates: Record<string, any>, extra?: Record<string, any>) => {
        if (!thing) return;
        updateThing(thingId, {
            content: {
                ...thing.content,
                [stateKey]: { ...(thing.content?.[stateKey] as any), ...updates },
                ...extra
            }
        });
    }, [thingId, thing, updateThing, stateKey]);

    const checkStatus = useCallback(async () => {
        setSyncState('checking');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/${endpointPath}/status/${thingId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.step === 'DONE') {
                    setStep('DONE');
                    setSyncState('completed');
                    if (onCompleted) onCompleted(data);
                } else if (data.step === 'WAITING') {
                    setStep('WAITING');
                    setSyncState('idle');
                    updateState({ step: "WAITING" });
                } else {
                    if (!abortControllerRef.current) {
                        setProgressMessage('Backend process is still running...');
                    }
                    setSyncState('running');
                }
            } else {
                setSyncState('error');
            }
        } catch (err) {
            console.error("Failed to check status", err);
            setSyncState('error');
        }
        
        setTimeout(() => setSyncState('idle'), 3000);
    }, [endpointPath, thingId, onCompleted, updateState]);

    // Auto-poll status every 15 seconds while generating
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (step === 'GENERATING') {
            interval = setInterval(() => {
                if (syncState !== 'checking') {
                    checkStatus();
                }
            }, 15000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [step, syncState, checkStatus]);

    // Ensure elapsed time starts if we refresh while generating
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (step === 'GENERATING') {
            setElapsedTime(0);
            timer = setInterval(() => setElapsedTime(prev => (prev || 0) + 1), 1000);
        } else {
            setElapsedTime(null);
        }
        return () => clearInterval(timer);
    }, [step]);

    const cancelGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        } else {
            setStep('WAITING');
            setProgressMessage('Cancelled');
            setElapsedTime(null);
            updateState({ step: "WAITING" });
        }
    }, [updateState]);

    const handleGenerateStream = useCallback(async (body: any, customEndpoint?: string, onData?: (data: any) => void) => {
        setStep("GENERATING");
        setProgressPercent(5);
        setProgressMessage("Initiating analysis...");
        updateState({ step: "GENERATING" });

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const urlPath = customEndpoint || `${endpointPath}/generate`;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/${urlPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify(body)
            });
            
            if (!res.ok) throw new Error("API Request Failed");
            if (!res.body) throw new Error("No response body");

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let done = false;

            const startTime = Date.now();
            const timerInterval = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);

            let accumulatedData = "";

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                if (readerDone) {
                    done = true;
                    break;
                }
                
                const chunk = decoder.decode(value, { stream: true });
                accumulatedData += chunk;
                
                const parts = accumulatedData.split("\n\n");
                accumulatedData = parts.pop() || "";
                
                for (const part of parts) {
                    if (part.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(part.slice(6));
                            
                            if (data.type === "step") {
                                setProgressMessage(`Running step: ${data.node || data.step}...`);
                                setProgressPercent((prev) => prev < 90 ? prev + 10 : prev);
                            } else if (data.type === "chunk_progress") {
                                const fraction = data.completed / Math.max(1, data.total);
                                setProgressMessage(`${data.message || 'Processing'} (Chunk ${data.completed} of ${data.total})...`);
                                setProgressPercent(10 + fraction * 60);
                            } else if (data.type === "progress") {
                                setProgressMessage(data.message || 'Processing...');
                                if (data.percent) setProgressPercent(data.percent);
                            } else if (data.type === "completed") {
                                setProgressPercent(100);
                                setProgressMessage("Complete!");
                                setStep("DONE");
                                if (onCompleted) onCompleted(data);
                            } else if (data.type === "error") {
                                throw new Error(data.message);
                            }

                            if (onData) onData(data);
                        } catch (e) {
                            console.error("Failed to parse SSE event:", e);
                        }
                    }
                }
            }
            
            clearInterval(timerInterval);
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('Generation aborted by user');
            } else {
                console.error("Generation failed:", error);
                setProgressMessage(`Network connection dropped or error: ${error.message}`);
                setStep('WAITING');
            }
        } finally {
            abortControllerRef.current = null;
        }
    }, [endpointPath, updateState, onCompleted]);

    return {
        step,
        setStep,
        progressPercent,
        progressMessage,
        elapsedTime,
        syncState,
        checkStatus,
        cancelGeneration,
        handleGenerateStream,
        updateState
    };
}
