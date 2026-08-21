import React, { useState, useEffect } from 'react';
import { UploadCloud, FileDiff, Play, FileText, CheckCircle2, ArrowRight, RefreshCw, X } from 'lucide-react';
import { useCanvasStore, CanvasThing, CanvasLink } from '../canvas-store';
import { ArchiMateToolViewer } from './archimate-tool-viewer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface GapAnalysisToolViewerProps {
    thing: CanvasThing;
    links?: CanvasLink[];
}

type DocumentRole = 'baseline' | 'target' | 'both' | 'none';

export function GapAnalysisToolViewer({ thing, links = [] }: GapAnalysisToolViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    const accessLevel = useCanvasStore(state => state.accessLevel);
    const things = useCanvasStore(state => state.things);
    const isReadOnly = accessLevel === "read";
    const selectedModel = useCanvasStore(state => state.selectedModel);

    const [status, setStatus] = useState<'idle' | 'generating' | 'completed'>(thing.content?.status || 'idle');
    const [report, setReport] = useState<any>(thing.content?.report || null);
    
    // Progress state
    const [progressPercent, setProgressPercent] = useState<number>(thing.content?.status === 'generating' ? 50 : 0);
    const [progressMessage, setProgressMessage] = useState<string>(
        thing.content?.status === 'generating' ? 'Running safely in the background...' : ''
    );
    const [elapsedTime, setElapsedTime] = useState<number | null>(null);
    const [syncState, setSyncState] = useState<'idle' | 'checking' | 'completed' | 'running' | 'error'>('idle');

    const abortControllerRef = React.useRef<AbortController | null>(null);

    const checkStatus = async () => {
        setSyncState('checking');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/gap_analysis/status/${thing.id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'completed') {
                    setReport(data.report);
                    setStatus('completed');
                    setSyncState('completed');
                    updateThing(thing.id, {
                        content: {
                            ...thing.content,
                            status: 'completed',
                            report: data.report
                        }
                    });
                } else if (data.status === 'idle') {
                    setStatus('idle');
                    setSyncState('idle');
                    updateThing(thing.id, { content: { ...thing.content, status: 'idle' } });
                } else {
                    setProgressMessage('Backend process is still running...');
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
    };

    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        } else {
            setStatus('idle');
            setProgressMessage('Cancelled');
            setElapsedTime(null);
            updateThing(thing.id, { content: { ...thing.content, status: 'idle' } });
        }
    };

    useEffect(() => {
        if (thing.content?.status === 'completed' && status !== 'completed') {
            setStatus('completed');
            setReport(thing.content.report || null);
        } else if (thing.content?.status === 'generating' && status !== 'generating') {
            setStatus('generating');
        } else if (thing.content?.status === 'idle' && status !== 'idle') {
            setStatus('idle');
        }
    }, [thing.content?.status, thing.content?.report]);

    // Auto-poll status every 15 seconds while generating
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'generating') {
            interval = setInterval(() => {
                if (syncState !== 'checking') {
                    checkStatus();
                }
            }, 15000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [status, syncState]);

    const linkedThings = links
        .filter(link => link.source_id === thing.id || link.target_id === thing.id)
        .map(link => {
            const linkedId = link.source_id === thing.id ? link.target_id : link.source_id;
            return things.find(t => t.id === linkedId);
        })
        .filter((t): t is CanvasThing => t !== undefined);

    const documentRoles = thing.custom_metadata?.document_roles || {};

    const documents = linkedThings.map(t => {
        const textContent = typeof t.content?.text === 'string' ? t.content.text : 
                            typeof t.content?.content === 'string' ? t.content.content : 
                            JSON.stringify(t.content);
        return {
            id: t.id,
            name: t.title || t.id,
            role: (documentRoles[t.id] as DocumentRole) || 'none',
            content: textContent
        };
    });

    const toggleRole = (id: string, type: 'baseline' | 'target', checked: boolean) => {
        const currentRole = (documentRoles[id] as DocumentRole) || 'none';
        let newRole = currentRole;
        if (type === 'baseline') {
            if (checked) newRole = currentRole === 'target' ? 'both' : 'baseline';
            else newRole = currentRole === 'both' ? 'target' : 'none';
        } else {
            if (checked) newRole = currentRole === 'baseline' ? 'both' : 'target';
            else newRole = currentRole === 'both' ? 'baseline' : 'none';
        }
        
        updateThing(thing.id, {
            custom_metadata: {
                ...thing.custom_metadata,
                document_roles: {
                    ...documentRoles,
                    [id]: newRole
                }
            }
        });
    };

    const runAnalysis = async () => {
        setStatus('generating');
        updateThing(thing.id, { content: { ...thing.content, status: 'generating' } });
        
        const baselineDocs = documents.filter(d => d.role === 'baseline' || d.role === 'both').map(d => d.content || d.name);
        const targetDocs = documents.filter(d => d.role === 'target' || d.role === 'both').map(d => d.content || d.name);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/gap_analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    thing_id: thing.id,
                    baseline_docs: baselineDocs,
                    target_docs: targetDocs,
                    llm_preset: selectedModel || 'default'
                })
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
                                setProgressMessage(`Running step: ${data.node}...`);
                                setProgressPercent((prev: number) => prev < 90 ? prev + 10 : prev);
                            } else if (data.type === "chunk_progress") {
                                const fraction = data.completed / Math.max(1, data.total);
                                setProgressMessage(`Map-Reduce Analysis (Chunk ${data.completed} of ${data.total})...`);
                                setProgressPercent(10 + fraction * 60);
                            } else if (data.type === "completed") {
                                setProgressPercent(100);
                                setProgressMessage("Complete!");
                                
                                setReport(data.report);
                                setStatus('completed');
                                
                                updateThing(thing.id, {
                                    content: {
                                        ...thing.content,
                                        status: 'completed',
                                        report: data.report
                                    }
                                });
                            } else if (data.type === "error") {
                                throw new Error(data.message);
                            }
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
                console.error("Analysis Failed:", error);
                setProgressMessage(`Network connection dropped or error: ${error.message}`);
                setStatus('idle');
                // CRITICAL FIX: We do NOT send an updateThing here!
            }
        } finally {
            abortControllerRef.current = null;
        }
    };

    return (
        <div className="flex w-full h-full bg-slate-100 dark:bg-slate-950 relative overflow-hidden">
            {/* Left Panel: Configuration */}
            <div className="w-80 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col pointer-events-auto">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FileDiff className="w-5 h-5 text-blue-500" />
                        <h3 className="font-bold text-slate-900 dark:text-slate-100">Gap Analysis Tool</h3>
                    </div>
                    {/* Sync Button */}
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs h-7 gap-1"
                        onClick={checkStatus}
                        disabled={syncState === 'checking'}
                    >
                        <RefreshCw className={cn("w-3 h-3", syncState === 'checking' && "animate-spin")} />
                        {syncState === 'checking' && "Checking..."}
                        {syncState === 'idle' && "Sync Status"}
                        {syncState === 'completed' && "Finished!"}
                        {syncState === 'error' && "Sync Failed"}
                        {syncState === 'running' && "Still running..."}
                    </Button>
                </div>
                
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                    <div className="mb-6">
                        <Label className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide block">
                            Linked Documents
                        </Label>
                        <p className="text-xs text-slate-500 mb-3">
                            Assign roles to linked documents for analysis.
                        </p>
                        
                        <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-950">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="p-2 font-semibold">Document</th>
                                        <th className="p-2 font-semibold text-center w-16">Base</th>
                                        <th className="p-2 font-semibold text-center w-16">Target</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {documents.map(doc => (
                                        <tr key={doc.id} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                                            <td className="p-2 font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title={doc.name}>
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span className="truncate">{doc.name}</span>
                                                </div>
                                            </td>
                                            <td className="p-2 text-center align-middle">
                                                <Checkbox 
                                                    id={`baseline-${doc.id}`} 
                                                    checked={doc.role === 'baseline' || doc.role === 'both'}
                                                    onCheckedChange={(c) => toggleRole(doc.id, 'baseline', !!c)}
                                                    disabled={isReadOnly || status === 'generating'}
                                                />
                                            </td>
                                            <td className="p-2 text-center align-middle">
                                                <Checkbox 
                                                    id={`target-${doc.id}`} 
                                                    checked={doc.role === 'target' || doc.role === 'both'}
                                                    onCheckedChange={(c) => toggleRole(doc.id, 'target', !!c)}
                                                    disabled={isReadOnly || status === 'generating'}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                    {status === 'generating' ? (
                        <Button 
                            className="flex-1 bg-red-500 hover:bg-red-600 text-white gap-2"
                            onClick={cancelGeneration}
                        >
                            <X className="w-4 h-4" /> Cancel
                        </Button>
                    ) : (
                        <Button 
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={isReadOnly || status === 'generating'}
                            onClick={runAnalysis}
                        >
                            <span className="flex items-center gap-2">
                                <Play className="w-4 h-4" />
                                Run Analysis
                            </span>
                        </Button>
                    )}
                </div>
            </div>

            {/* Right Panel: Results Viewer */}
            <div className="flex-1 h-full flex flex-col relative p-8 bg-slate-50 dark:bg-slate-900 overflow-y-auto">
                {status === 'idle' && (
                    <div className="text-center max-w-md m-auto">
                        <FileDiff className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h2 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">Ready to Analyze</h2>
                        <p className="text-sm text-slate-500">
                            Configure your baseline and target documents on the left, then click "Run Analysis" to generate the semantic gap report.
                        </p>
                    </div>
                )}
                
                {status === 'generating' && (
                    <div className="m-auto text-center w-full max-w-md">
                        <div className="mb-6 flex justify-center">
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 border-l-4 border-l-transparent border-r-4 border-r-transparent relative z-10"></div>
                            </div>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
                            Analyzing gaps...
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 h-5">
                            {progressMessage}
                        </p>
                        
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-3 shadow-inner">
                            <div 
                                className="h-full bg-blue-500 transition-all duration-300 ease-out relative"
                                style={{ width: `${Math.max(5, progressPercent)}%` }}
                            >
                                <div className="absolute top-0 right-0 bottom-0 left-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
                            </div>
                        </div>
                        
                        <div className="flex justify-between items-center text-xs font-medium text-slate-400">
                            <span>{Math.round(progressPercent)}%</span>
                            {elapsedTime !== null && (
                                <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                    {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {status === 'completed' && (
                    <div className="w-full h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Gap Analysis Report</h2>
                            <div className="flex gap-2">
                                <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span> {report?.added_count || 0} Added
                                </span>
                                <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span> {report?.removed_count || 0} Removed
                                </span>
                                <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-100 px-2 py-1 rounded">
                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span> {report?.modified_count || 0} Modified
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm p-6 overflow-y-auto custom-scrollbar pointer-events-auto">
                            <h3 className="font-semibold text-slate-700 border-b pb-2 mb-4">Migration Steps</h3>
                            <ul className="space-y-4">
                                {report?.migration_steps?.map((step: any) => (
                                    <li key={step.order} className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">{step.order}</div>
                                        <div>
                                            <p className="font-medium text-sm text-slate-800">{step.title}</p>
                                            <p className="text-xs text-slate-500 mt-1">{step.layer_impact} • {step.description}</p>
                                        </div>
                                    </li>
                                ))}
                                {(!report?.migration_steps || report.migration_steps.length === 0) && (
                                    <li className="text-sm text-slate-500">No migration steps found.</li>
                                )}
                            </ul>
                            
                            <div className="mt-8 pb-8">
                                <h3 className="font-semibold text-slate-700 border-b pb-2 mb-4">Visual Diff</h3>
                                {report?.archimate_diff_json ? (
                                    <div className="h-[500px] w-full border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden relative">
                                        <ArchiMateToolViewer 
                                            thing={{
                                                ...thing,
                                                id: thing.id + "_diagram",
                                                content: { archimateData: report.archimate_diff_json }
                                            } as any} 
                                            links={[]} 
                                        />
                                    </div>
                                ) : (
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-lg flex items-center justify-center border border-dashed border-slate-300">
                                        <p className="text-sm text-slate-400 text-center">
                                            No diagram data available.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
