import React, { useState } from 'react';
import { useCanvasStore, CanvasThing, CanvasLink } from '../canvas-store';
import { ShieldCheck, FileText, CheckCircle, XCircle, Play, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ComplianceAuditViewerProps {
    thing: CanvasThing;
    links?: CanvasLink[];
}

export function ComplianceAuditViewer({ thing, links = [] }: ComplianceAuditViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    const things = useCanvasStore(state => state.things);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Filter links to find connected documents.
    // A document is connected if this tool is either the source or the target.
    const connectedNodeIds = links
        .filter(l => l.source_id === thing.id || l.target_id === thing.id)
        .map(l => l.source_id === thing.id ? l.target_id : l.source_id);

    const connectedThings = connectedNodeIds
        .map(id => things.find(t => t.id === id))
        .filter((t): t is CanvasThing => t !== undefined);

    const classifiedDocuments = thing.content?.classifiedDocuments || {};

    const handleClassify = (docId: string, role: 'Guardrail' | 'Architecture') => {
        updateThing(thing.id, {
            content: {
                ...thing.content,
                classifiedDocuments: {
                    ...classifiedDocuments,
                    [docId]: role
                }
            }
        });
    };

    const [auditStatus, setAuditStatus] = useState(thing.content?.auditState?.step === 'ANALYZING' ? 'running' : (thing.content?.status || 'idle'));
    const [progressMessage, setProgressMessage] = useState<string>('');

    const [syncState, setSyncState] = useState<'idle' | 'checking' | 'completed' | 'running' | 'error'>('idle');
    const [elapsedTime, setElapsedTime] = useState<number | null>(null);
    const abortControllerRef = React.useRef<AbortController | null>(null);
    const [progressPercent, setProgressPercent] = useState<number>(0);

    React.useEffect(() => {
        let timer: NodeJS.Timeout;
        if (auditStatus === 'running') {
            setElapsedTime(0);
            timer = setInterval(() => setElapsedTime(prev => (prev || 0) + 1), 1000);
        } else {
            setElapsedTime(null);
        }
        return () => clearInterval(timer);
    }, [auditStatus]);

    const checkStatus = React.useCallback(async () => {
        setSyncState('checking');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/governance_audit/status/${thing.id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.step === 'ANALYZING') {
                    if (auditStatus !== 'running') setAuditStatus('running');
                    if (!abortControllerRef.current) {
                        setProgressMessage('Background analysis is still running...');
                    }
                    setSyncState('running');
                } else if (data.step === 'DONE') {
                    if (auditStatus === 'running') setAuditStatus('completed');
                    setSyncState('completed');
                } else if (data.step === 'WAITING') {
                    if (auditStatus === 'running') setAuditStatus('idle');
                    setSyncState('idle');
                } else {
                    setSyncState('idle');
                }
            } else {
                setSyncState('error');
            }
        } catch (err) {
            console.error("Failed to check audit status", err);
            setSyncState('error');
        }
        setTimeout(() => setSyncState('idle'), 3000);
    }, [thing.id, auditStatus]);

    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (auditStatus === 'running') {
            interval = setInterval(() => {
                if (syncState !== 'checking') {
                    checkStatus();
                }
            }, 15000);
        }
        return () => clearInterval(interval);
    }, [auditStatus, checkStatus, syncState]);

    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        } else {
            setAuditStatus('idle');
            setProgressMessage('Cancelled');
            setElapsedTime(null);
            setProgressPercent(0);
        }
    };

    const runAudit = async () => {
        setAuditStatus('running');
        setProgressMessage('Connecting to server...');
        setProgressPercent(0);
        
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        
        // Extract text content and title from the linked document nodes
        const extractDoc = (doc: any) => {
            const title = doc?.title || 'Unknown Document';
            let text = '';
            
            if (doc?.content) {
                text = typeof doc.content.text === 'string' ? doc.content.text :
                       typeof doc.content.parsedText === 'string' ? doc.content.parsedText :
                       typeof doc.content.content === 'string' ? doc.content.content :
                       JSON.stringify(doc.content);
            }
            
            return { title, text };
        };

        const guardrailDocs = connectedThings
            .filter(doc => classifiedDocuments[doc.id] === 'Guardrail')
            .map(extractDoc);
            
        const architectureDocs = connectedThings
            .filter(doc => classifiedDocuments[doc.id] === 'Architecture')
            .map(extractDoc);

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/governance_audit/run-stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    thing_id: thing.id,
                    guardrail_docs: guardrailDocs,
                    architecture_docs: architectureDocs,
                    llm_preset: 'default' // This uses the system default LLM
                }),
                signal: abortController.signal
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }
            
            if (!response.body) throw new Error("No readable stream");

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.type === 'progress') {
                                setProgressMessage(data.message);
                                if (data.percent) setProgressPercent(data.percent);
                            } else if (data.type === 'complete') {
                                setProgressPercent(100);
                                updateThing(thing.id, {
                                    content: {
                                        ...thing.content,
                                        status: 'completed',
                                        results: data.result,
                                        auditState: { step: 'DONE' }
                                    }
                                });
                                setAuditStatus('completed');
                            } else if (data.type === 'error') {
                                throw new Error(data.message);
                            }
                        } catch (e) {
                            console.error("Error parsing stream chunk", e, line);
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error('Audit failed or interrupted:', error);
            if (error.name === 'AbortError') {
                console.log('Audit aborted.');
            }
            // If the error is an abort/network error from page refresh, we DO NOT want to update the DB to WAITING.
            // For now, we will NOT call updateThing to avoid overwriting the DB state if it's still analyzing.
        } finally {
            abortControllerRef.current = null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden rounded-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 mr-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    >
                        {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                    <ShieldCheck className="w-5 h-5 text-blue-500" />
                    <h2 className="font-semibold text-sm">Governance & Compliance Audit</h2>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        size="sm" 
                        variant="ghost"
                        className={`text-slate-600 dark:text-slate-300 transition-colors ${
                            syncState === 'idle' ? "hover:bg-slate-100 dark:hover:bg-slate-800" :
                            syncState === 'completed' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                            syncState === 'running' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                            syncState === 'error' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                            "bg-slate-100 dark:bg-slate-800"
                        }`}
                        onClick={checkStatus}
                        title="Sync Status from Server"
                        disabled={syncState === 'checking'}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 mr-2 ${syncState === 'checking' ? "animate-spin" : ""}`} />
                        {syncState === 'idle' && "Sync Status"}
                        {syncState === 'checking' && "Checking..."}
                        {syncState === 'completed' && "Finished!"}
                        {syncState === 'running' && "Still running..."}
                        {syncState === 'error' && "Failed to sync"}
                    </Button>
                    <Button 
                        size="sm" 
                        onClick={runAudit}
                        disabled={auditStatus === 'running' || connectedThings.length === 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Play className="w-4 h-4 mr-2" />
                        Run Audit
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Left Sidebar - Documents */}
                <div className={cn(
                    "flex flex-col border-r border-slate-200 dark:border-slate-700 transition-all duration-300 ease-in-out bg-slate-50/50 dark:bg-slate-800/20",
                    isSidebarOpen ? "w-[350px] shrink-0" : "w-0 overflow-hidden border-none opacity-0"
                )}>
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/50 shrink-0">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Connected Documents</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 pr-5 custom-scrollbar">
                        {connectedThings.length === 0 ? (
                            <div className="text-sm text-slate-500 italic p-4 bg-white dark:bg-slate-800/50 rounded-md border border-dashed border-slate-200 dark:border-slate-700 text-center">
                                No documents connected. Link existing Canvas documents to this tool to begin.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {connectedThings.map(doc => (
                                    <div key={doc.id} className="flex flex-col gap-3 p-3 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm transition-shadow hover:shadow-md">
                                        <div className="flex items-center gap-2 overflow-hidden pb-1">
                                            <FileText className="w-4 h-4 flex-shrink-0 text-slate-400" />
                                            <span className="text-sm font-medium truncate" title={doc.title}>{doc.title}</span>
                                        </div>
                                        <div className="flex flex-col gap-2 flex-shrink-0 w-full">
                                            <Button 
                                                size="sm" 
                                                variant={classifiedDocuments[doc.id] === 'Guardrail' ? 'default' : 'outline'}
                                                onClick={() => handleClassify(doc.id, 'Guardrail')}
                                                className={cn("h-7 text-xs w-full overflow-hidden text-ellipsis", classifiedDocuments[doc.id] === 'Guardrail' && "bg-amber-600 hover:bg-amber-700")}
                                            >
                                                Guardrail Policy
                                            </Button>
                                            <Button 
                                                size="sm" 
                                                variant={classifiedDocuments[doc.id] === 'Architecture' ? 'default' : 'outline'}
                                                onClick={() => handleClassify(doc.id, 'Architecture')}
                                                className={cn("h-7 text-xs w-full overflow-hidden text-ellipsis", classifiedDocuments[doc.id] === 'Architecture' && "bg-emerald-600 hover:bg-emerald-700")}
                                            >
                                                Target Architecture
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Area - Results */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <div className="max-w-4xl mx-auto space-y-6">
                            {(!auditStatus || auditStatus === 'idle') && (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                    <ShieldCheck className="w-16 h-16 mb-4 opacity-20" />
                                    <p className="text-sm">Configure documents on the left and click "Run Audit"</p>
                                </div>
                            )}

                            {auditStatus === 'running' && (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-6"></div>
                                    <h3 className="text-xl font-medium text-slate-700 dark:text-slate-200 mb-2">Analyzing Architecture</h3>
                                    
                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-md mb-6 max-w-md text-sm text-center">
                                        ⚠️ <strong>Do not refresh this page.</strong> If you do, the generation will continue in the background but this screen will lose connection and stop updating automatically.
                                    </div>
                                    
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4">{progressMessage || 'Analyzing architecture against guardrails...'}</span>
                                    
                                    {elapsedTime !== null ? (
                                        <div className="w-64 mb-8">
                                            <div className="bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-2 overflow-hidden w-full">
                                                <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                                            </div>
                                            <div className="text-xs text-slate-400 dark:text-slate-500 text-right">
                                                {elapsedTime}s elapsed
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mb-8" />
                                    )}
                                    
                                    <div className="flex gap-4">
                                        <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-900/20" onClick={cancelGeneration}>
                                            Cancel Audit
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {auditStatus === 'completed' && thing.content?.results && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm flex items-center justify-between">
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Overall Compliance Score</h3>
                                            <p className="text-sm text-slate-500 mt-1">Based on {thing.content.results.rules?.length || 0} rules evaluated</p>
                                        </div>
                                        <div className={cn(
                                            "text-4xl font-bold tracking-tight",
                                            (thing.content.results.overallScore || thing.content.results.score || 0) >= 80 ? "text-emerald-600" :
                                            (thing.content.results.overallScore || thing.content.results.score || 0) >= 50 ? "text-amber-500" : "text-rose-600"
                                        )}>
                                            {thing.content.results.overallScore || thing.content.results.score || 0}%
                                        </div>
                                    </div>
                                    
                                    {thing.content.results.rules && thing.content.results.rules.length > 0 && (
                                        <>
                                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-2">Detailed Findings</h3>
                                            <div className="space-y-4">
                                                {thing.content.results.rules.map((rule: any) => (
                                                    <div key={rule.id} className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm transition-all hover:shadow-md">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-3">
                                                                {rule.compliant ? (
                                                                    <div className="bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-full">
                                                                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                                                    </div>
                                                                ) : (
                                                                    <div className="bg-rose-100 dark:bg-rose-900/30 p-1.5 rounded-full">
                                                                        <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                                                                    </div>
                                                                )}
                                                                <h4 className="font-semibold text-base text-slate-800 dark:text-slate-100">{rule.name}</h4>
                                                            </div>
                                                            <span className={cn(
                                                                "text-sm font-bold px-3 py-1 rounded-full",
                                                                rule.compliant ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
                                                            )}>
                                                                Score: {rule.score}%
                                                            </span>
                                                        </div>
                                                        
                                                        <div className="space-y-4 mt-4 text-sm">
                                                            <div className={cn("p-4 rounded-md border", rule.compliant ? "bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50" : "bg-rose-50/80 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/50")}>
                                                                <p className={cn("font-bold mb-1.5 text-xs uppercase tracking-wider flex items-center gap-1.5", rule.compliant ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300")}>
                                                                    {rule.compliant ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                                                    {rule.compliant ? "Compliance Explanation" : "Non-Compliant Finding"}
                                                                </p>
                                                                <p className={cn("leading-relaxed", rule.compliant ? "text-emerald-800 dark:text-emerald-200/90" : "text-rose-800 dark:text-rose-200/90")}>{rule.explanation || rule.nonCompliantExplanation}</p>
                                                            </div>
                                                            
                                                            {!rule.compliant && rule.remediation && (
                                                                <div className="bg-blue-50/80 dark:bg-blue-950/20 p-4 rounded-md border border-blue-100 dark:border-blue-900/50">
                                                                    <p className="font-bold text-blue-800 dark:text-blue-300 mb-1.5 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                                        Suggested Remediation
                                                                    </p>
                                                                    <p className="text-blue-800 dark:text-blue-200/90 leading-relaxed">{rule.remediation}</p>
                                                                </div>
                                                            )}
                                                            
                                                            {rule.references && rule.references.length > 0 && (
                                                                <div className="bg-slate-50/80 dark:bg-slate-900/40 p-4 rounded-md border border-slate-200 dark:border-slate-700/50">
                                                                    <p className="font-bold text-slate-600 dark:text-slate-400 mb-2 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                                                        <FileText className="w-3.5 h-3.5" />
                                                                        Document Citations
                                                                    </p>
                                                                    <ul className="list-disc list-outside ml-4 space-y-1.5">
                                                                        {rule.references.map((ref: string, idx: number) => (
                                                                            <li key={idx} className="text-slate-600 dark:text-slate-300 italic text-xs leading-relaxed">"{ref}"</li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
