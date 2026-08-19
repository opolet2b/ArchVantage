import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
    Workflow, Play, Save, Settings, Layers, AlertTriangle, 
    ArrowRight, Activity, GitBranch, Zap, RefreshCw, Download
} from 'lucide-react';
import { CanvasThing, CanvasLink } from '../canvas-store';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import ReactFlow, { 
    Background, 
    Controls, 
    MiniMap,
    MarkerType,
    ReactFlowProvider,
    useNodesState,
    useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';

interface ArchitecturalScenarioViewerProps {
    thing: CanvasThing;
    links?: CanvasLink[];
}

import { useCanvasStore } from '../canvas-store';

const SwimlaneNode = ({ data, style }: any) => {
    return (
        <div style={{ ...style, position: 'relative' }}>
            <div className="absolute top-2 left-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none">
                {data.label}
            </div>
        </div>
    );
};
const nodeTypes = { swimlane: SwimlaneNode };

export function ArchitecturalScenarioViewer({ thing, links = [] }: ArchitecturalScenarioViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    const [viewMode, setViewMode] = useState<'baseline' | 'tobe'>('tobe');
    const [status, setStatus] = useState<'idle' | 'extracting' | 'simulating' | 'complete'>('idle');

    // Form states
    const [action, setAction] = useState(thing.content?.action || 'replace');
    const [targetTech, setTargetTech] = useState(thing.content?.target_technology || '');
    const [customPrompt, setCustomPrompt] = useState(thing.content?.custom_prompt || '');
    const [expandedPhase, setExpandedPhase] = React.useState<string>('A');
    const [targetEntityIds, setTargetEntityIds] = useState<string[]>(thing.content?.target_entity_ids || []);

    // Result states
    const baseline = thing.content?.baseline || null;
    const result = thing.content?.result || null;

    const handleIngest = async () => {
        setStatus('extracting');
        try {
            const documentIds = links
                .filter(l => l.target_id === thing.id && l.source_id !== thing.id)
                .map(l => l.source_id);

            if (documentIds.length === 0) {
                alert("Please link at least one document to this tool before extracting the baseline.");
                setStatus('idle');
                return;
            }

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/architectural_scenario/ingest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({ document_ids: documentIds })
            });

            if (!res.ok) throw new Error('Ingestion failed');
            const data = await res.json();
            
            updateThing(thing.id, {
                content: {
                    ...thing.content,
                    baseline: data.baseline
                }
            });
            setViewMode('baseline');
        } catch (error) {
            console.error(error);
            alert("Extraction failed. See console.");
        } finally {
            setStatus('idle');
        }
    };

    const handleRunSimulation = async () => {
        setStatus('simulating');
        try {
            const documentIds = links
                .filter(l => l.target_id === thing.id && l.source_id !== thing.id)
                .map(l => l.source_id);

            const payload = {
                canvas_id: thing.canvas_id,
                thing_id: thing.id,
                action: action,
                target_technology: targetTech,
                target_entity_ids: targetEntityIds,
                custom_prompt: customPrompt,
                document_ids: documentIds,
                baseline: thing.content?.baseline
            };

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/architectural_scenario/simulate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Simulation failed');
            
            const data = await res.json();
            
            updateThing(thing.id, {
                content: {
                    ...thing.content,
                    action,
                    target_technology: targetTech,
                    custom_prompt: customPrompt,
                    result: data.result
                }
            });
            
            setViewMode('tobe');
        } catch (error) {
            console.error(error);
            alert("Simulation failed. See console.");
        } finally {
            setStatus('complete');
        }
    };

    const exportToWord = () => {
        if (!result) return;
        
        let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Architectural Scenario Impact Analysis</title></head><body>`;
        
        html += `<h1 style="font-family: Arial, sans-serif; color: #4c1d95;">Architectural Scenario Impact Analysis</h1>`;
        
        html += `<h2 style="font-family: Arial, sans-serif; color: #334155;">1. Scenario Configuration</h2>`;
        html += `<ul style="font-family: Arial, sans-serif; color: #475569;">`;
        html += `<li><strong>Action:</strong> ${action}</li>`;
        html += `<li><strong>Target Technology:</strong> ${targetTech || 'N/A'}</li>`;
        html += `<li><strong>Custom Prompt:</strong> ${customPrompt || 'N/A'}</li>`;
        html += `</ul>`;
        
        html += `<h2 style="font-family: Arial, sans-serif; color: #334155;">2. Structural Risk Assessment</h2>`;
        html += `<p style="font-family: Arial, sans-serif; color: #475569;"><strong>Risk Score:</strong> ${result.structural_risk_score} / 100</p>`;
        html += `<p style="font-family: Arial, sans-serif; color: #475569;"><strong>Rationale:</strong> ${result.structural_risk_rationale}</p>`;
        
        html += `<h2 style="font-family: Arial, sans-serif; color: #334155; margin-top: 20px;">3. TOGAF ADM Phase Impacts</h2>`;
        
        const phases = [
            { id: 'A', name: 'Architecture Vision' },
            { id: 'B', name: 'Business Architecture' },
            { id: 'C', name: 'Information Systems Architecture' },
            { id: 'D', name: 'Technology Architecture' },
            { id: 'E', name: 'Opportunities & Solutions' },
            { id: 'F', name: 'Migration Planning' },
            { id: 'G', name: 'Implementation Governance' },
            { id: 'H', name: 'Architecture Change Management' },
            { id: 'R', name: 'Requirements Management' }
        ];
        
        phases.forEach(p => {
            const impact = result.adm_impacts?.find((i: any) => i.phase.startsWith(p.id));
            if (impact) {
                html += `<h3 style="font-family: Arial, sans-serif; color: #6d28d9; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 20px;">Phase ${p.id}: ${p.name}</h3>`;
                html += `<p style="font-family: Arial, sans-serif; color: #475569;"><strong>Risk Level:</strong> ${impact.risk_level}</p>`;
                
                // Convert basic Markdown to HTML
                let formattedDesc = impact.description
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/\n\n/g, '</p><p style="font-family: Arial, sans-serif; color: #475569; line-height: 1.5;">')
                    .replace(/\n/g, '<br/>');
                
                html += `<p style="font-family: Arial, sans-serif; color: #475569; line-height: 1.5;">${formattedDesc}</p>`;
            }
        });
        
        html += `</body></html>`;
        
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ArchVantage_Analysis_${new Date().toISOString().split('T')[0]}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Mapping backend result to ReactFlow Nodes
    const getNodeStyle = (status: string, layer: string) => {
        let bg = '#ffffff';
        let border = '1px solid #cbd5e1';
        
        if (status === 'removed') { bg = '#fef2f2'; border = '2px solid #ef4444'; }
        if (status === 'new') { bg = '#f3e8ff'; border = '2px solid #a855f7'; }
        if (status === 'modified' || status === 'at_risk') { bg = '#fef3c7'; border = '2px solid #f59e0b'; }
        
        return { background: bg, border, borderRadius: 8, width: 150 };
    };

    const initialNodes = React.useMemo(() => {
        const sourceData = viewMode === 'baseline' ? baseline : (result || baseline);
        if (!sourceData) return [];
        
        const preCalculateCounts = { business: 0, information: 0, application: 0, technology: 0 };
        sourceData.nodes.forEach((n: any) => {
            const layerKey = n.layer.toLowerCase();
            if (preCalculateCounts[layerKey as keyof typeof preCalculateCounts] !== undefined) {
                preCalculateCounts[layerKey as keyof typeof preCalculateCounts]++;
            }
        });
        const maxNodesInLayer = Math.max(...Object.values(preCalculateCounts));
        const swimlaneWidth = Math.max(2500, 100 + (maxNodesInLayer * 220) + 500);
        
        const swimlaneHeight = 250;
        
        const swimlanes = [
            { 
                id: 'swimlane-business', position: { x: 0, y: 0 }, type: 'swimlane', draggable: false, selectable: false,
                style: { width: swimlaneWidth, height: swimlaneHeight, backgroundColor: 'rgba(59, 130, 246, 0.05)', border: 'none', borderBottom: '1px solid #e2e8f0', zIndex: -1 },
                data: { label: 'Business Layer' }
            },
            { 
                id: 'swimlane-information', position: { x: 0, y: swimlaneHeight }, type: 'swimlane', draggable: false, selectable: false,
                style: { width: swimlaneWidth, height: swimlaneHeight, backgroundColor: 'rgba(99, 102, 241, 0.05)', border: 'none', borderBottom: '1px solid #e2e8f0', zIndex: -1 },
                data: { label: 'Information Layer' }
            },
            { 
                id: 'swimlane-application', position: { x: 0, y: swimlaneHeight * 2 }, type: 'swimlane', draggable: false, selectable: false,
                style: { width: swimlaneWidth, height: swimlaneHeight, backgroundColor: 'rgba(16, 185, 129, 0.05)', border: 'none', borderBottom: '1px solid #e2e8f0', zIndex: -1 },
                data: { label: 'Application Layer' }
            },
            { 
                id: 'swimlane-technology', position: { x: 0, y: swimlaneHeight * 3 }, type: 'swimlane', draggable: false, selectable: false,
                style: { width: swimlaneWidth, height: swimlaneHeight, backgroundColor: 'rgba(100, 116, 139, 0.05)', border: 'none', zIndex: -1 },
                data: { label: 'Technology Layer' }
            }
        ];

        const layerCounts = { business: 0, information: 0, application: 0, technology: 0 };
        
        let nodes = sourceData.nodes.map((n: any) => {
            const layerKey = n.layer.toLowerCase();
            const y = 80; // Relative to the top of the swimlane parent
            const count = layerCounts[layerKey as keyof typeof layerCounts] || 0;
            const x = 100 + (count * 220);
            
            if (layerCounts[layerKey as keyof typeof layerCounts] !== undefined) {
                layerCounts[layerKey as keyof typeof layerCounts]++;
            }
            
            return {
                id: n.id,
                position: { x, y },
                data: { label: n.label },
                type: 'default',
                style: getNodeStyle(n.status, layerKey),
                parentNode: `swimlane-${layerKey}`,
                extent: 'parent',
                draggable: true
            };
        });

        return [...swimlanes, ...nodes];
    }, [result, baseline, viewMode]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

    React.useEffect(() => {
        setNodes(initialNodes);
    }, [initialNodes, setNodes]);

    const onNodeClick = React.useCallback((event: any, node: any) => {
        if (node.type === 'swimlane') return;
        setTargetEntityIds(prev => 
            prev.includes(node.id) 
                ? prev.filter(id => id !== node.id)
                : [...prev, node.id]
        );
    }, []);

    const targetEntityNodes = React.useMemo(() => {
        if (!baseline) return [];
        return baseline.nodes.filter((n: any) => targetEntityIds.includes(n.id));
    }, [baseline, targetEntityIds]);

    const displayEdges = React.useMemo(() => {
        const sourceData = viewMode === 'baseline' ? baseline : (result || baseline);
        if (!sourceData) return [];
        let edges = sourceData.edges.map((e: any) => {
            let stroke = '#94a3b8';
            let strokeWidth = 1;
            let dash = undefined;
            if (e.status === 'removed') { stroke = '#ef4444'; strokeWidth = 2; }
            if (e.status === 'new') { stroke = '#a855f7'; strokeWidth = 2; dash = '5,5'; }
            
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                animated: true,
                style: { stroke, strokeWidth, strokeDasharray: dash }
            };
        });

        return edges;
    }, [result, baseline, viewMode]);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-950 overflow-hidden">
            {/* HEADER BAR */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                        <Workflow className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Architectural Scenario Builder</h2>
                        <p className="text-xs text-slate-500">Cross-layer impact analysis</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
                        <button 
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'baseline' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                            onClick={() => setViewMode('baseline')}
                        >
                            Baseline (As-Is)
                        </button>
                        <button 
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'tobe' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                            onClick={() => setViewMode('tobe')}
                        >
                            To-Be (Simulation)
                        </button>
                    </div>

                    <Button 
                        variant="outline" 
                        onClick={handleIngest} 
                        disabled={status === 'extracting' || status === 'simulating'}
                        className="gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        title="Re-extract baseline from documents"
                    >
                        <RefreshCw className={`w-4 h-4 ${status === 'extracting' ? 'animate-spin text-blue-500' : 'text-slate-500'}`} />
                        <span className="sr-only sm:not-sr-only text-sm">Re-extract</span>
                    </Button>

                    <Button onClick={handleRunSimulation} disabled={status === 'simulating' || status === 'extracting' || !baseline} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                        <Play className="w-4 h-4" />
                        {status === 'simulating' ? 'Simulating...' : 'Run Simulation'}
                    </Button>
                    
                    {result && (
                        <Button variant="outline" onClick={exportToWord} className="gap-2 text-slate-700 bg-white hover:bg-slate-50 border-slate-200 shadow-sm ml-2">
                            <Download className="w-4 h-4 text-purple-600" />
                            Export to Word
                        </Button>
                    )}

                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" disabled={!result} className="gap-2 border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300 shadow-sm ml-4">
                                <Activity className="w-4 h-4" />
                                Cross-Layer Impact
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="sm:max-w-[900px] w-[90vw] overflow-y-auto">
                            <SheetHeader className="mb-6">
                                <SheetTitle className="flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-purple-600" />
                                    TOGAF ADM Strategic Impact Analysis
                                </SheetTitle>
                            </SheetHeader>
                            
                            {result && (
                                <div className="space-y-8">
                                    <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
                                        
                                        {/* ADM Wheel */}
                                        <div className="relative w-72 h-72 shrink-0">
                                            {/* Edges/Lines connecting nodes to center */}
                                            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                                                {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                                                    const angle = (i * (360 / 8)) - 90;
                                                    const radius = 110;
                                                    const x = 144 + radius * Math.cos(angle * Math.PI / 180);
                                                    const y = 144 + radius * Math.sin(angle * Math.PI / 180);
                                                    return <line key={i} x1="144" y1="144" x2={x} y2={y} stroke="#e2e8f0" strokeWidth="2" />
                                                })}
                                                {/* Outer ring */}
                                                <circle cx="144" cy="144" r="110" fill="none" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="4 4" />
                                            </svg>
                                            
                                            {[
                                                { id: 'A', name: 'Architecture Vision' },
                                                { id: 'B', name: 'Business Architecture' },
                                                { id: 'C', name: 'Information Systems Architecture' },
                                                { id: 'D', name: 'Technology Architecture' },
                                                { id: 'E', name: 'Opportunities & Solutions' },
                                                { id: 'F', name: 'Migration Planning' },
                                                { id: 'G', name: 'Implementation Governance' },
                                                { id: 'H', name: 'Architecture Change Management' }
                                            ].map((phase, i) => {
                                                const angle = (i * (360 / 8)) - 90;
                                                const radius = 110;
                                                const x = radius * Math.cos(angle * Math.PI / 180);
                                                const y = radius * Math.sin(angle * Math.PI / 180);
                                                
                                                const hasImpact = result.adm_impacts?.some((impact: any) => impact.phase.startsWith(phase.id));
                                                const isSelected = expandedPhase === phase.id;
                                                
                                                let bgColor = 'bg-white dark:bg-slate-900';
                                                let textColor = 'text-slate-500';
                                                let borderColor = 'border-slate-200 dark:border-slate-800';
                                                
                                                if (hasImpact) {
                                                    bgColor = 'bg-purple-50 dark:bg-purple-900/30';
                                                    textColor = 'text-purple-700 dark:text-purple-300';
                                                    borderColor = 'border-purple-300 dark:border-purple-700';
                                                }
                                                if (isSelected) {
                                                    bgColor = 'bg-purple-600';
                                                    textColor = 'text-white';
                                                    borderColor = 'border-purple-600 ring-4 ring-purple-100 dark:ring-purple-900';
                                                }

                                                return (
                                                    <button 
                                                        key={phase.id}
                                                        title={phase.name}
                                                        onClick={() => setExpandedPhase(phase.id)}
                                                        className={`absolute w-10 h-10 rounded-full border-2 shadow-sm flex items-center justify-center font-bold text-sm transition-all hover:scale-110 z-10 ${bgColor} ${textColor} ${borderColor}`}
                                                        style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: 'translate(-50%, -50%)' }}
                                                    >
                                                        {phase.id}
                                                    </button>
                                                );
                                            })}
                                            {/* Center Node */}
                                            <button 
                                                title="Requirements Management"
                                                onClick={() => setExpandedPhase('R')}
                                                className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-2 transition-all hover:scale-105 shadow-sm flex items-center justify-center text-center text-[10px] font-bold z-10 ${
                                                    expandedPhase === 'R' 
                                                        ? 'bg-purple-600 text-white border-purple-600 ring-4 ring-purple-100 dark:ring-purple-900'
                                                        : (result.adm_impacts?.some((impact: any) => impact.phase.startsWith('R'))
                                                            ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                                                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500'
                                                        )
                                                }`}
                                            >
                                                Requirements<br/>Management
                                            </button>
                                        </div>

                                        {/* Phase Detail Panel */}
                                        <div className="flex-1 w-full bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-slate-800">
                                            {(() => {
                                                const currentPhaseData = [
                                                    { id: 'A', name: 'Architecture Vision' },
                                                    { id: 'B', name: 'Business Architecture' },
                                                    { id: 'C', name: 'Information Systems Architecture' },
                                                    { id: 'D', name: 'Technology Architecture' },
                                                    { id: 'E', name: 'Opportunities & Solutions' },
                                                    { id: 'F', name: 'Migration Planning' },
                                                    { id: 'G', name: 'Implementation Governance' },
                                                    { id: 'H', name: 'Architecture Change Management' },
                                                    { id: 'R', name: 'Requirements Management' }
                                                ].find(p => p.id === expandedPhase);
                                                
                                                const impact = result.adm_impacts?.find((i: any) => i.phase.startsWith(expandedPhase));
                                                
                                                return (
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-4 border-b border-slate-200 dark:border-slate-800 pb-3">
                                                            <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-lg">
                                                                {expandedPhase}
                                                            </div>
                                                            <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                                                                {currentPhaseData?.name}
                                                            </h4>
                                                        </div>
                                                        
                                                        {impact ? (
                                                            <div className="space-y-4">
                                                                <div className="flex items-center gap-2">
                                                                    {impact.risk_level === 'High' && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">High Risk</span>}
                                                                    {impact.risk_level === 'Medium' && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Medium Risk</span>}
                                                                    {impact.risk_level === 'Low' && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Low Risk</span>}
                                                                </div>
                                                                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                                                                    <ReactMarkdown>{impact.description}</ReactMarkdown>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm text-slate-500 italic py-8 text-center">
                                                                No significant impact recorded for this specific ADM phase during the current simulation scenario.
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    
                                    {/* Summary Stats */}
                                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                                        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-900/30 rounded-xl p-5 flex flex-col md:flex-row md:items-center gap-6 justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Structural Risk Score</div>
                                                    <div className="text-xs text-rose-700/70 dark:text-rose-300/70 hidden sm:block">• Cross-domain vulnerability index</div>
                                                </div>
                                                <p className="text-sm text-rose-800 dark:text-rose-200 leading-relaxed max-w-2xl">
                                                    {result.structural_risk_rationale || "No justification provided by the analysis engine."}
                                                </p>
                                            </div>
                                            <div className="text-5xl font-black text-rose-600 dark:text-rose-500 shrink-0">
                                                {result.structural_risk_score}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            {/* MAIN WORKSPACE (Split View) */}
            <div className="flex flex-1 overflow-hidden relative">
                
                {/* INGESTION OVERLAY */}
                {!baseline && (
                    <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
                            <Layers className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Extract Baseline Architecture</h2>
                        <p className="text-slate-500 max-w-md mb-8 leading-relaxed">
                            Before running a simulation, we need to extract the existing "As-Is" architecture topology from the documents linked to this tool.
                        </p>
                        <Button 
                            onClick={handleIngest} 
                            disabled={status === 'extracting'} 
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 rounded-xl shadow-lg transition-all hover:scale-105"
                        >
                            {status === 'extracting' ? (
                                <span className="flex items-center gap-2"><Workflow className="w-5 h-5 animate-spin" /> Extracting Baseline...</span>
                            ) : (
                                <span className="flex items-center gap-2"><Layers className="w-5 h-5" /> Extract from Linked Documents</span>
                            )}
                        </Button>
                    </div>
                )}
                
                {/* LEFT PANEL: SCENARIO CONFIG */}
                <div className="w-72 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 flex flex-col overflow-y-auto">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            1. Target Entity
                        </h3>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm">
                            <div className="text-xs text-slate-500 mb-2">Selected Nodes</div>
                            <div className="flex flex-wrap gap-2">
                                {targetEntityNodes.length > 0 ? (
                                    targetEntityNodes.map(node => (
                                        <div key={node.id} className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 text-xs font-medium">
                                            <Layers className="w-3 h-3" />
                                            {node.label || node.data?.label}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-slate-400 italic text-xs">Select components on canvas</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex-1">
                        <h3 className="font-semibold text-sm mb-3">2. Transformation</h3>
                        
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-700">Structured Action</label>
                                <select 
                                    value={action} 
                                    onChange={(e) => setAction(e.target.value)}
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                                >
                                    <option value="replace">Replace Component(s)</option>
                                    <option value="rehost">Rehost / Migrate to Cloud</option>
                                    <option value="refactor">Refactor / Re-architect</option>
                                    <option value="consolidate">Merge / Consolidate</option>
                                    <option value="decouple">Decouple / Split</option>
                                    <option value="integrate">Add New Integration</option>
                                    <option value="decommission">Decommission / Retire</option>
                                    <option value="none">None (Custom prompt only)</option>
                                </select>
                            </div>

                            {action !== 'none' && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-700">
                                        {action === 'replace' && 'Target Technology (COTS/SaaS)'}
                                        {action === 'rehost' && 'Target Cloud Provider / Service'}
                                        {action === 'refactor' && 'Target Architecture Pattern'}
                                        {action === 'consolidate' && 'Consolidate Into (Target System)'}
                                        {action === 'decouple' && 'Decouple Target / Sub-components'}
                                        {action === 'integrate' && 'Integration Method / Middleware'}
                                        {action === 'decommission' && 'Decommission Reason / Timeline'}
                                    </label>
                                    <Input 
                                        placeholder={
                                            action === 'replace' ? 'e.g. Salesforce SaaS' :
                                            action === 'rehost' ? 'e.g. AWS EC2, Azure Kubernetes' :
                                            action === 'refactor' ? 'e.g. Event-Driven, Microservices' :
                                            action === 'consolidate' ? 'e.g. Enterprise Data Lake' :
                                            action === 'decouple' ? 'e.g. Separate Auth & Billing Services' :
                                            action === 'integrate' ? 'e.g. Kafka Event Bus, REST API' :
                                            action === 'decommission' ? 'e.g. End of Life (Q4 2026)' : 'Specify details...'
                                        } 
                                        value={targetTech} 
                                        onChange={(e) => setTargetTech(e.target.value)} 
                                    />
                                </div>
                            )}

                            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                                <label className="text-xs font-medium text-slate-700 mb-2 block">
                                    {action === 'none' ? 'Custom Prompt (Required)' : 'Custom Prompt (Optional)'}
                                </label>
                                <textarea 
                                    className="w-full text-sm p-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    rows={3}
                                    placeholder="Explain the custom architectural shift here..."
                                    value={customPrompt}
                                    onChange={(e) => setCustomPrompt(e.target.value)}
                                ></textarea>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-4 bg-slate-100 dark:bg-slate-800/50">
                        <h3 className="font-semibold text-xs text-slate-500 uppercase tracking-wider mb-2">3. Layer Filters</h3>
                        <div className="flex flex-wrap gap-2">
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium cursor-pointer">Business</span>
                            <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium cursor-pointer">Information</span>
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium cursor-pointer">Application</span>
                            <span className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs font-medium cursor-pointer">Technology</span>
                        </div>
                    </div>
                </div>

                {/* CENTER CANVAS */}
                <div className="flex-1 relative bg-slate-50 dark:bg-slate-950">
                    <ReactFlowProvider>
                        <ReactFlow 
                            id={`arch-scenario-flow-${thing.id}`}
                            nodes={nodes} 
                            edges={displayEdges} 
                            onNodesChange={onNodesChange}
                            onNodeClick={onNodeClick}
                            nodeTypes={nodeTypes}
                            fitView
                            minZoom={0.05}
                            className="z-10"
                        >
                            <Background color="#cbd5e1" gap={16} />
                            <Controls />
                        </ReactFlow>
                    </ReactFlowProvider>

                    {/* Legend */}
                    {viewMode === 'tobe' && (
                        <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-slate-900/90 p-3 rounded-lg border border-slate-200 shadow-sm z-20">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Delta Legend</div>
                            <div className="space-y-1 text-xs">
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-500"></div> New Component</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-red-100 border border-red-500"></div> Removed / Broken</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-500"></div> High Risk Impact</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

