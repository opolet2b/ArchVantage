import React, { useState } from 'react';
import { UploadCloud, FileDiff, Play, FileText, CheckCircle2, ArrowRight } from 'lucide-react';
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

    const [status, setStatus] = useState<'idle' | 'analyzing' | 'completed'>(thing.content?.status || 'idle');
    const [report, setReport] = useState<any>(thing.content?.report || null);

    React.useEffect(() => {
        if (thing.content?.report !== undefined) {
            setReport(thing.content.report);
        }
        if (thing.content?.status !== undefined) {
            setStatus(thing.content.status);
        }
    }, [thing.content?.report, thing.content?.status]);

    // Compute linked documents dynamically from links pointing to/from this tool
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
        setStatus('analyzing');
        updateThing(thing.id, { content: { ...thing.content, status: 'analyzing' } });
        
        const baselineDocs = documents.filter(d => d.role === 'baseline' || d.role === 'both').map(d => d.content || d.name);
        const targetDocs = documents.filter(d => d.role === 'target' || d.role === 'both').map(d => d.content || d.name);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/gap_analysis/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseline_docs: baselineDocs,
                    target_docs: targetDocs,
                    llm_preset: selectedModel || 'default'
                })
            });
            if (!res.ok) throw new Error("API Request Failed");
            const data = await res.json();
            setReport(data.report);
            setStatus('completed');
            
            updateThing(thing.id, {
                content: {
                    ...thing.content,
                    report: data.report,
                    status: 'completed'
                }
            });
        } catch (error) {
            console.error("Analysis Failed:", error);
            setStatus('idle');
            updateThing(thing.id, { content: { ...thing.content, status: 'idle' } });
            alert("Analysis failed. See console for details.");
        }
    };

    return (
        <div className="flex w-full h-full bg-slate-100 dark:bg-slate-950 relative overflow-hidden">
            {/* Left Panel: Configuration */}
            <div className="w-80 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col pointer-events-auto">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <FileDiff className="w-5 h-5 text-blue-500" />
                    <h3 className="font-bold text-slate-900 dark:text-slate-100">Gap Analysis Tool</h3>
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
                                                    disabled={isReadOnly || status === 'analyzing'}
                                                />
                                            </td>
                                            <td className="p-2 text-center align-middle">
                                                <Checkbox 
                                                    id={`target-${doc.id}`} 
                                                    checked={doc.role === 'target' || doc.role === 'both'}
                                                    onCheckedChange={(c) => toggleRole(doc.id, 'target', !!c)}
                                                    disabled={isReadOnly || status === 'analyzing'}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                    <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={isReadOnly || status === 'analyzing'}
                        onClick={runAnalysis}
                    >
                        {status === 'analyzing' ? (
                            <span className="flex items-center gap-2">
                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                Analyzing gaps...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Play className="w-4 h-4" />
                                Run Analysis
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            {/* Right Panel: Results Viewer (Mockup) */}
            <div className="flex-1 h-full flex items-center justify-center relative p-8">
                {status === 'idle' && (
                    <div className="text-center max-w-md">
                        <FileDiff className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h2 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">Ready to Analyze</h2>
                        <p className="text-sm text-slate-500">
                            Configure your baseline and target documents on the left, then click "Run Analysis" to generate the semantic gap report.
                        </p>
                    </div>
                )}
                
                {status === 'analyzing' && (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-slate-600 font-medium">Extracting facts with LangGraph...</p>
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
