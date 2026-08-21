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
    const [status, setStatus] = useState<'idle' | 'extracting' | 'simulating' | 'complete' | 'error'>('idle');
    const [progressMessage, setProgressMessage] = useState<string>('');
    const [progressPercent, setProgressPercent] = useState<number>(0);

    // Form states
    const [action, setAction] = useState(thing.content?.action || 'replace');
    const [targetTech, setTargetTech] = useState(thing.content?.target_technology || '');
    const [customPrompt, setCustomPrompt] = useState(thing.content?.custom_prompt || '');
    const [expandedPhase, setExpandedPhase] = React.useState<string>('A');
    const [targetEntityIds, setTargetEntityIds] = useState<string[]>(thing.content?.target_entity_ids || []);

    // Result states
    const baseline = thing.content?.baseline || null;
    const [result, setResult] = useState(thing.content?.result || null);

    const [syncState, setSyncState] = useState<'idle' | 'checking' | 'completed' | 'running' | 'error'>('idle');
    const [elapsedTime, setElapsedTime] = useState<number | null>(null);
    const abortControllerRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
        let timer: NodeJS.Timeout;
        if (status === 'extracting' || status === 'simulating') {
            setElapsedTime(0);
            timer = setInterval(() => setElapsedTime(prev => (prev || 0) + 1), 1000);
        } else {
            setElapsedTime(null);
        }
        return () => clearInterval(timer);
    }, [status]);

    const checkStatus = React.useCallback(async () => {
        setSyncState('checking');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/architectural_scenario/status/${thing.id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.step === 'EXTRACTING') {
                    if (status !== 'extracting') setStatus('extracting');
                    if (!abortControllerRef.current) {
                        setProgressMessage('Background extraction is still running...');
                    }
                    setSyncState('running');
                } else if (data.step === 'SIMULATING') {
                    if (status !== 'simulating') setStatus('simulating');
                    if (!abortControllerRef.current) {
                        setProgressMessage('Background simulation is still running...');
                    }
                    setSyncState('running');
                } else if (data.step === 'DONE') {
                    if (status === 'extracting' || status === 'simulating') setStatus('idle');
                    setSyncState('completed');
                } else {
                    setSyncState('idle');
                }
            } else {
                setSyncState('error');
            }
        } catch (err) {
            console.error("Failed to check arch status", err);
            setSyncState('error');
        }
        setTimeout(() => setSyncState('idle'), 3000);
    }, [thing.id, status]);

    React.useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'extracting' || status === 'simulating') {
            interval = setInterval(() => {
                if (syncState !== 'checking') {
                    checkStatus();
                }
            }, 15000);
        }
        return () => clearInterval(interval);
    }, [status, checkStatus, syncState]);

    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        } else {
            setStatus('idle');
            setProgressMessage('Cancelled');
            setElapsedTime(null);
            setProgressPercent(0);
        }
    };

    const handleIngest = async () => {
        setStatus('extracting');
        setProgressMessage('Connecting to server...');
        setProgressPercent(0);
        
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const documentIds = links
                .filter(l => l.target_id === thing.id && l.source_id !== thing.id)
                .map(l => l.source_id);

            if (documentIds.length === 0) {
                alert("Please link at least one document to this tool before extracting the baseline.");
                setStatus('idle');
                return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/architectural_scenario/ingest-stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({ document_ids: documentIds, thing_id: thing.id }),
                signal: abortController.signal
            });

            if (!response.ok) throw new Error("Ingestion failed");
            if (!response.body) throw new Error("No readable stream");

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                // Keep the last incomplete line in the buffer
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.type === 'progress') {
                                setProgressMessage(data.message);
                                setProgressPercent(data.percent);
                            } else if (data.type === 'complete') {
                                setProgressPercent(100);
                                updateThing(thing.id, {
                                    content: {
                                        ...thing.content,
                                        baseline: data.result
                                    }
                                });
                                setViewMode('baseline');
                                setStatus('idle');
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
            console.error(error);
            if (error.name === 'AbortError') {
                console.log("Extraction aborted.");
            } else {
                alert("Extraction failed. See console.");
                setStatus('error');
            }
        } finally {
            abortControllerRef.current = null;
        }
    };

    const handleRunSimulation = async () => {
        if (!baseline) return;
        setStatus('simulating');
        setResult(null);
        setProgressMessage('Initializing simulation...');
        setProgressPercent(5);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const documentIds = links
                .filter(l => l.target_id === thing.id && l.source_id !== thing.id)
                .map(l => l.source_id);

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/architectural_scenario/simulate-stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({
                    canvas_id: thing.canvas_id,
                    thing_id: thing.id,
                    action: action,
                    target_technology: targetTech,
                    target_entity_ids: targetEntityIds,
                    custom_prompt: customPrompt,
                    document_ids: documentIds,
                    baseline: baseline
                }),
                signal: abortController.signal
            });

            if (!response.ok) throw new Error("Simulation failed");
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
                                const nodeProgress: Record<string, { label: string, percent: number }> = {
                                    'parse_scenario': { label: 'Parsing architectural intent...', percent: 15 },
                                    'traverse_topology': { label: 'Traversing dependency graph...', percent: 25 },
                                    'evaluate_cross_layer_impact': { label: 'Evaluating cross-layer impacts...', percent: 40 },
                                    'synthesize_tobe_graph': { label: 'Synthesizing To-Be Architecture...', percent: 55 },
                                    'analyze_remediation_gaps': { label: 'Analyzing remediation gaps...', percent: 70 },
                                    'determine_impacted_phases': { label: 'Routing to impacted TOGAF phases...', percent: 80 },
                                    'aggregate_json_spec': { label: 'Generating final report...', percent: 95 }
                                };
                                if (data.node.startsWith('analyze_phase_')) {
                                    setProgressMessage(`Analyzing Phase ${data.node.split('_').pop()}...`);
                                    setProgressPercent(85);
                                } else {
                                    const info = nodeProgress[data.node];
                                    if (info) {
                                        setProgressMessage(info.label);
                                        setProgressPercent(info.percent);
                                    } else {
                                        setProgressMessage(`Running ${data.node}...`);
                                        setProgressPercent(prev => Math.min(prev + 5, 90));
                                    }
                                }
                            } else if (data.type === 'complete') {
                                setResult(data.result);
                                setProgressPercent(100);
                                updateThing(thing.id, {
                                    content: {
                                        ...thing.content,
                                        action,
                                        target_technology: targetTech,
                                        custom_prompt: customPrompt,
                                        result: data.result
                                    }
                                });
                                setStatus('complete');
                                setViewMode('tobe');
                            } else if (data.type === 'error') {
                                throw new Error(data.message);
                            }
                        } catch (e) {
                            console.error("Error parsing stream chunk", e, line);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(error);
            setStatus('error');
            setProgressMessage('');
        }
    };

    const generateReactFlowSvg = (graphData: any, isBaseline: boolean = false) => {
        if (!graphData || !graphData.nodes) return '';
        
        const layers = ['Business', 'Information', 'Application', 'Technology'];
        
        // Calculate pre-requisites for layout
        const preCalculateCounts = { business: 0, information: 0, application: 0, technology: 0 };
        graphData.nodes.forEach((n: any) => {
            const layerKey = n.layer.toLowerCase();
            if (preCalculateCounts[layerKey as keyof typeof preCalculateCounts] !== undefined) {
                preCalculateCounts[layerKey as keyof typeof preCalculateCounts]++;
            }
        });
        const maxNodesInLayer = Math.max(...Object.values(preCalculateCounts));
        const swimlaneWidth = Math.max(2500, 100 + (maxNodesInLayer * 220) + 500);
        const swimlaneHeight = 250;
        const totalHeight = swimlaneHeight * 4;
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${swimlaneWidth} ${totalHeight}" width="${swimlaneWidth}" height="${totalHeight}">
            <rect width="100%" height="100%" fill="#ffffff" />
        `;

        // 1. Draw Swimlanes
        const colors = [
            'rgba(59, 130, 246, 0.05)',
            'rgba(99, 102, 241, 0.05)',
            'rgba(16, 185, 129, 0.05)',
            'rgba(100, 116, 139, 0.05)'
        ];

        layers.forEach((layer, i) => {
            const y = i * swimlaneHeight;
            svg += `
                <rect x="0" y="${y}" width="${swimlaneWidth}" height="${swimlaneHeight}" fill="${colors[i]}" stroke="#e2e8f0" stroke-width="1" />
                <text x="10" y="${y + 20}" font-family="Calibri" font-size="16" font-weight="bold" fill="#64748b" text-transform="uppercase">${layer} Layer</text>
            `;
        });

        // Calculate exact positions for edges later
        const layerCounts = { business: 0, information: 0, application: 0, technology: 0 };
        const nodePositions: Record<string, {x: number, y: number, w: number, h: number}> = {};

        // 2. Draw Nodes
        graphData.nodes.forEach((n: any) => {
            const layerKey = n.layer.toLowerCase();
            const count = layerCounts[layerKey as keyof typeof layerCounts] || 0;
            const layerIndex = layers.findIndex(l => l.toLowerCase() === layerKey);
            
            const w = 150;
            const h = 50;
            const x = 100 + (count * 220);
            const y = (layerIndex * swimlaneHeight) + 80;

            if (layerCounts[layerKey as keyof typeof layerCounts] !== undefined) {
                layerCounts[layerKey as keyof typeof layerCounts]++;
            }

            nodePositions[n.id] = { x, y, w, h };

            let bg = '#ffffff';
            let border = '#cbd5e1';
            let strokeWidth = 1;

            if (!isBaseline) {
                if (n.status === 'removed') { bg = '#fef2f2'; border = '#ef4444'; strokeWidth = 2; }
                if (n.status === 'new') { bg = '#f3e8ff'; border = '#a855f7'; strokeWidth = 2; }
                if (n.status === 'modified' || n.status === 'at_risk') { bg = '#fef3c7'; border = '#f59e0b'; strokeWidth = 2; }
            }

            const safeLabel = (n.label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            
            // To handle basic word wrap, we split by space and take first 2 lines
            const words = safeLabel.split(' ');
            let line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
            let line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
            if (words.length <= 2) {
                line1 = safeLabel;
                line2 = '';
            }

            // Manually adjusting Y coordinates so we don't rely on alignment-baseline which Word ignores
            svg += `
                <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${bg}" stroke="${border}" stroke-width="${strokeWidth}" />
                <text x="${x + (w/2)}" y="${y + (h/2) - (line2 ? 4 : -5)}" font-family="Calibri" font-size="14" fill="#0f172a" text-anchor="middle">${line1}</text>
                ${line2 ? `<text x="${x + (w/2)}" y="${y + (h/2) + 12}" font-family="Calibri" font-size="14" fill="#0f172a" text-anchor="middle">${line2}</text>` : ''}
            `;
        });

        // 3. Draw Edges
        graphData.edges.forEach((e: any) => {
            const src = nodePositions[e.source];
            const tgt = nodePositions[e.target];
            if (!src || !tgt) return;

            let stroke = '#94a3b8';
            let strokeWidth = 1;
            let dash = 'none';

            if (!isBaseline) {
                if (e.status === 'removed') { stroke = '#ef4444'; strokeWidth = 2; dash = '5,5'; }
                if (e.status === 'new') { stroke = '#a855f7'; strokeWidth = 2; }
            }

            let startX = src.x + src.w / 2;
            let startY = src.y + src.h;
            let endX = tgt.x + tgt.w / 2;
            let endY = tgt.y;

            // Calculate bezier control points to create a smooth curve
            // For bottom-to-top routing, ctrl1 is always below start, ctrl2 is always above end
            const offset = Math.max(60, Math.abs(endY - startY) / 2);
            
            const ctrlX1 = startX;
            const ctrlY1 = startY + offset;
            const ctrlX2 = endX;
            const ctrlY2 = endY - offset;

            // Since ctrlY2 is always above endY, the curve always enters pointing straight DOWN
            const arrowAngle = 90; 
            const arrowLength = 10;
            const endXLine = endX;
            const endYLine = endY - arrowLength;

            svg += `<path d="M ${startX} ${startY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${endXLine} ${endYLine}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dash !== 'none' ? dash : ''}" />`;
            
            svg += `<polygon points="0,0 -10,-5 -10,5" fill="${stroke}" transform="translate(${endX}, ${endY}) rotate(${arrowAngle})" />`;
        });

        svg += `</svg>`;
        return svg;
    };

    const exportToWord = async () => {
        if (!result || !baseline) return;
        
        setStatus('simulating');
        try {
            const baselineSvg = generateReactFlowSvg(baseline, true);
            const tobeSvg = generateReactFlowSvg(result, false);

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

            const activePhases = phases.filter(p => 
                result.adm_impacts?.some((i: any) => i.phase.startsWith(p.id))
            ).map(p => {
                const impact = result.adm_impacts.find((i: any) => i.phase.startsWith(p.id));
                return {
                    phase: p.id,
                    name: p.name,
                    impact: impact.risk_level,
                    desc: impact.description
                };
            });

            const payload = {
                action: action,
                targetTech: targetTech,
                customPrompt: customPrompt,
                risk_score: result.structural_risk_score,
                risk_rationale: result.structural_risk_rationale,
                baseline_svg: baselineSvg,
                tobe_svg: tobeSvg,
                phases: activePhases
            };

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/architectural_scenario/export-docx`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Failed to generate docx");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Architectural_Scenario_Impact.docx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error("Export failed:", error);
            alert("Export failed.");
        } finally {
            setStatus('complete');
        }
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

    if (status === 'extracting' || status === 'simulating') {
        return (
            <div className="flex flex-col w-full h-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative justify-center border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0 pointer-events-none">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                            <Workflow className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Architectural Scenario Builder</h2>
                        </div>
                    </div>
                </div>

                <div className="p-8 max-w-3xl mx-auto flex flex-col items-center gap-6 pb-20">
                    <div className="mt-20 text-center flex flex-col items-center">
                        <div className="w-16 h-16 border-4 border-slate-200 border-t-purple-500 rounded-full animate-spin mb-6" />
                        <h3 className="text-xl font-medium text-slate-700 dark:text-slate-200 mb-2">
                            {status === 'extracting' ? 'Extracting Architecture Baseline' : 'Simulating Architectural Scenario'}
                        </h3>
                        
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-md mb-6 max-w-md text-sm">
                            ⚠️ <strong>Do not refresh this page.</strong> If you do, the generation will continue in the background but this screen will lose connection and stop updating automatically.
                        </div>

                        <p className="text-slate-500 dark:text-slate-400 mb-4 max-w-md">
                            {elapsedTime === null 
                                ? 'Background process is running. Click Refresh Status to check.' 
                                : (progressMessage || 'Processing...')}
                        </p>
                        
                        {elapsedTime !== null ? (
                            <div className="w-64 mb-8">
                                <div className="bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-2 overflow-hidden w-full">
                                    <div className="bg-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                                </div>
                                <div className="text-xs text-slate-400 dark:text-slate-500 text-right">
                                    {elapsedTime}s elapsed
                                </div>
                            </div>
                        ) : (
                            <div className="mb-8" />
                        )}
                        
                        <div className="flex gap-4">
                            <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-900/20 pointer-events-auto" onClick={cancelGeneration}>
                                Cancel Generation
                            </Button>
                            <Button variant="outline" className="border-purple-200 text-purple-600 hover:bg-purple-50 hover:text-purple-700 dark:border-purple-900/50 dark:hover:bg-purple-900/20 pointer-events-auto" onClick={checkStatus}>
                                Refresh Status
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

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
                        
                        {status === 'extracting' && progressMessage && (
                            <div className="w-full max-w-md flex flex-col items-center mt-6">
                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3 animate-pulse">{progressMessage}</div>
                                <div className="w-full bg-blue-100 dark:bg-blue-900/30 rounded-full h-2 overflow-hidden relative">
                                    <div 
                                        className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out absolute top-0 left-0" 
                                        style={{ width: `${progressPercent}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* SIMULATION OVERLAY */}
                {status === 'simulating' && (
                    <div className="absolute inset-0 bg-white/90 dark:bg-slate-950/90 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                        <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
                            <Workflow className="w-8 h-8 animate-pulse" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Simulating Architectural Impact</h2>
                        <p className="text-slate-500 mb-8 max-w-md">Running distributed AI analysis across architectural layers...</p>
                        
                        {progressMessage && (
                            <div className="w-full max-w-md flex flex-col items-center">
                                <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-3 animate-pulse">{progressMessage}</div>
                                <div className="w-full bg-purple-100 dark:bg-purple-900/30 rounded-full h-2 overflow-hidden relative">
                                    <div 
                                        className="bg-purple-600 h-full rounded-full transition-all duration-500 ease-out absolute top-0 left-0" 
                                        style={{ width: `${progressPercent}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
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

