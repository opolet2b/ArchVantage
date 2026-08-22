import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
    FileText, Play, Settings, Activity, MessageSquare, Send, Save, BarChart2, 
    GitBranch, Workflow, Calendar, Users, DollarSign, Layers, Plus, 
    AlertTriangle, ArrowRight, CheckCircle2, Zap, Edit2, Download, Wand2, HelpCircle, RefreshCw
} from 'lucide-react';
import { LinkedDocumentSelector } from './linked-document-selector';
import { useCanvasStore, CanvasThing, CanvasLink } from '../canvas-store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import ReactFlow, { 
    ReactFlowProvider,
    Background, 
    Controls, 
    MiniMap, 
    useNodesState, 
    useEdgesState, 
    MarkerType, 
    Node, 
    Edge,
    ConnectionMode
} from 'reactflow';
import 'reactflow/dist/style.css';

interface ProjectImpactSimulatorViewerProps {
    thing: CanvasThing;
    links?: CanvasLink[];
}

function generateNodes(components: any[] = [], targetCompIds: string[] = [], pattern?: string) {
    return components.map((comp, index) => {
        const isTarget = targetCompIds.includes(comp.id);
        const patternLabel = isTarget && pattern ? (
            <div className="mt-2 pt-2 border-t border-slate-300/50 text-[9px] font-bold tracking-wider text-slate-600 uppercase flex items-center justify-center gap-1">
                <Zap className="w-3 h-3 text-amber-500" />
                {pattern.replace(/_/g, ' ')}
            </div>
        ) : null;

        return {
            id: comp.id,
            position: { x: 50 + (index % 3) * 200, y: 50 + Math.floor(index / 3) * 100 },
            data: { 
                label: (
                    <div className="flex flex-col h-full justify-between">
                        <div className="font-semibold text-xs leading-tight">{comp.name}</div>
                        {patternLabel}
                    </div>
                )
            },
            style: { 
                background: isTarget ? (pattern === 'strangler_fig' ? '#e0e7ff' : '#dcfce7') : '#f8fafc',
                border: isTarget ? (pattern === 'strangler_fig' ? '2px solid #6366f1' : '2px solid #22c55e') : '1px solid #cbd5e1',
                borderRadius: 8, 
                padding: 10, 
                width: 150,
                textAlign: 'center' as const
            }
        };
    });
}

function generateEdges(dependencies: any[] = [], components: any[] = []) {
    return dependencies.map((dep, index) => {
        // Fallback fuzzy match if the LLM output IDs don't perfectly match component IDs
        let source = dep.source_id;
        let target = dep.target_id;
        
        if (!components.find(c => c.id === source)) {
            const match = components.find(c => c.name === source || c.name.includes(source) || source.includes(c.name));
            if (match) source = match.id;
        }
        if (!components.find(c => c.id === target)) {
            const match = components.find(c => c.name === target || c.name.includes(target) || target.includes(c.name));
            if (match) target = match.id;
        }

        return {
            id: `e-${source}-${target}-${index}`,
            source: source,
            target: target,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
            style: { stroke: '#94a3b8' }
        };
    });
}

function renderAssumptions(assumptions: any[] = []) {
    if (!assumptions.length) return null;
    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {assumptions.map((assum, i) => (
                <TooltipProvider key={i}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800 cursor-help border border-indigo-200">
                                {assum.document_name} ({assum.page_number})
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm text-xs z-[3000]">
                            <div className="font-bold mb-1">{assum.description}</div>
                            <div className="italic text-slate-500">&quot;{assum.exact_extract}&quot;</div>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ))}
        </div>
    );
}

function IsolatedImpactView({ impact }: { impact: any }) {
    if (!impact) {
        return (
            <div className="h-full flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                <p className="text-xs text-slate-500 italic">Run a simulation to generate isolated impact analysis.</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="grid grid-cols-4 gap-4 shrink-0">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Time</div>
                    <div className="flex items-end gap-2">
                        <span className="text-xl font-bold">{impact.total_weeks} wks</span>
                    </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Budget</div>
                    <div className="flex items-end gap-2">
                        <span className="text-xl font-bold">${impact.total_cost >= 1000 ? (impact.total_cost/1000).toFixed(1) + 'k' : impact.total_cost}</span>
                    </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Risk Index</div>
                    <div className="flex items-end gap-2">
                        <span className="text-xl font-bold">{impact.risk_index?.toFixed(2) || '0.00'}</span>
                    </div>
                </div>
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg">
                    <div className="text-[10px] text-rose-500 uppercase font-bold tracking-wider">Critical Bottleneck</div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-end gap-2 mt-1 cursor-help">
                                    <span className="text-sm font-bold text-rose-700 truncate block max-w-full">{impact.bottleneck_analysis}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs z-[3000]">
                                {impact.bottleneck_analysis}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
            
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 shrink-0 mt-2">
                <div className="flex items-center gap-2 mb-2">
                    <Wand2 className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-xs text-indigo-900 uppercase tracking-wide">Metric Justification</span>
                </div>
                <div className="text-xs text-slate-700 bg-white p-2 border border-indigo-100 rounded">
                    <div>{impact.justification_of_metrics || 'No justification available.'}</div>
                    {renderAssumptions(impact.assumptions)}
                </div>
            </div>
        </div>
    );
}

const MIGRATION_PATTERNS = [
    { value: "do_nothing", label: "Do Nothing (As-Is)", help: "Maintain the current architectural pattern without changes." },
    { value: "strangler_fig", label: "Strangler Fig (ACL)", help: "Gradually replace pieces of functionality with new applications and services." },
    { value: "branch_by_abstraction", label: "Branch by Abstraction", help: "Create an abstraction layer over the component to allow new and old implementations to coexist." },
    { value: "parallel_run", label: "Parallel Run (Shadowing)", help: "Run the new system alongside the old to verify correctness before cutover." },
    { value: "cdc", label: "Change Data Capture (CDC)", help: "Synchronize data from a legacy database to a modern datastore in real-time." },
    { value: "facade", label: "Retain & Wrap (Façade)", help: "Wrap the legacy system in a modern API to isolate downstream services." },
    { value: "lift_shift", label: "Lift and Shift (Replatform)", help: "Move the application to modern infrastructure without changing code." },
    { value: "point_to_point", label: "Direct Point-to-Point", help: "Directly modernize integrations bypassing enterprise buses." },
    { value: "big_bang", label: "Big Bang Rewrite", help: "Completely rewrite and replace the component all at once (High Risk)." },
];

const INTERFACE_PROTOCOLS = [
    { value: "do_nothing", label: "Do Nothing (As-Is)", help: "Maintain the current integration protocols without changes." },
    { value: "event_hub", label: "Sync -> Async Event Hub (Kafka)", help: "Shift from synchronous calls to asynchronous event streaming." },
    { value: "grpc", label: "gRPC / Protocol Buffers", help: "High-performance, strongly-typed synchronous RPC." },
    { value: "graphql", label: "GraphQL API Gateway", help: "Unified, flexible graph API layer over underlying endpoints." },
    { value: "outbox", label: "Transactional Outbox", help: "Guarantee message delivery by saving events to a database table before publishing." },
    { value: "direct_rpc", label: "Direct Synch RPC (REST)", help: "Standard synchronous HTTP/REST communication." },
    { value: "service_mesh", label: "Service Mesh Proxy (Sidecar)", help: "Offload routing and security to a dedicated infrastructure layer." },
    { value: "message_queue", label: "Asynchronous Message Queue", help: "Point-to-point asynchronous queuing (e.g. RabbitMQ)." },
    { value: "batch", label: "File-based Batch Transfer", help: "Legacy integration pattern using scheduled file drops." },
];

const ASSIGNEE_TEAMS = [
    { value: "do_nothing", label: "Do Nothing (As-Is)", help: "Maintain current team assignments." },
    { value: "platform_squad", label: "Platform Engineering Squad", help: "Internal core platform team specializing in cloud-native microservices." },
    { value: "legacy_domain", label: "Legacy Domain Squad", help: "Internal legacy team with deep domain knowledge of the core business system." },
    { value: "external_contractor", label: "External Contractor Squad", help: "Outsourced team for rapid integration, but lacks deep domain context." },
    { value: "devops_sre", label: "DevOps / SRE Team", help: "Specialized in automation, deployment pipelines, and system reliability." },
    { value: "tiger_team", label: "Tiger Team (Cross-functional)", help: "Elite temporary task force composed of experts across different domains." },
    { value: "offshore_team", label: "Offshore Development Center", help: "Cost-effective remote team, requires significant coordination overhead." }
];

export function ProjectImpactSimulatorViewer({ thing, links = [] }: ProjectImpactSimulatorViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    const accessLevel = useCanvasStore(state => state.accessLevel);
    const things = useCanvasStore(state => state.things);
    const isReadOnly = accessLevel === "read";
    
    const [viewMode, setViewMode] = useState<'topology' | 'gantt'>('topology');

    // Extract topology from thing content or use fallback
    const topologyReport = thing.content?.report || {
        components: [],
        dependencies: [],
        overall_risk_score: 0.0,
        estimated_effort_weeks: 0,
        effort_citation: "",
        extracted_variables: [],
        extracted_teams: []
    };

    const computeSummaryStats = () => {
        const data: any = topologyReport || {};
        const components: any[] = data.components || [];
        const dependencies: any[] = data.dependencies || [];
        const criticalCount = components.filter((c: any) => c.status === 'Critical' || c.status === 'Legacy').length;
        const totalDeps = dependencies.length;
        const highRiskDeps = dependencies.filter((d: any) => {
            const sourceComp = components.find((c: any) => c.id === d.source);
            const targetComp = components.find((c: any) => c.id === d.target);
            return sourceComp?.status === 'Legacy' || targetComp?.status === 'Legacy';
        }).length;

        const healthScore = Math.max(0, 100 - (criticalCount * 15) - (highRiskDeps * 5));
        return { criticalCount, totalDeps, highRiskDeps, healthScore };
    };

    const defaultSimDelta = {
        weeks: topologyReport.estimated_effort_weeks || 0,
        cost: 0,
        risk: `${(topologyReport.overall_risk_score || 0).toFixed(2)} (Baseline)`,
        bottleneck: 'Awaiting Simulation',
        bottleneck_citation: 'Run a simulation to generate AI recommendations.',
        justification_of_metrics: 'Run a simulation to generate justification for these metrics.',
        assumptions: [],
        schedule: [],
        isolated_impacts: {}
    };

    const initialActiveId = thing.content?.activeScenarioId || 's1';
    
    // Helper to safely access simulation data
    const getSimData = () => {
        const data: any = thing.content?.last_simulation || {};
        return {
            migrationPattern: data.migrationPattern || 'Strangler Fig',
            interfaceProtocols: data.interfaceProtocols || 'REST/GraphQL',
            teamAssignee: data.teamAssignee || 'Team Alpha',
            dualRun: data.dualRun || 'Yes (90 days)',
            zeroDowntime: data.zeroDowntime || 'Yes',
            canaryRollout: data.canaryRollout || '20% steps',
            dataBackfill: data.dataBackfill || 'Async Background',
            maxBudget: data.maxBudget || '$150k',
            maxTimeline: data.maxTimeline || '6 Months',
            maxStaff: data.maxStaff || '4 FTEs',
            simDelta: data.simDelta || '+2 Weeks',
        };
    };

    const simData = getSimData();
    
    // Safely access extracted teams
    const extractedTeams: any[] = (thing.content as any)?.extracted_teams || [];
    const availableTeams = extractedTeams.length > 0 
        ? extractedTeams.map((t: any) => typeof t === 'string' ? t : t.name).filter(Boolean)
        : ["Core Platform Team", "Payment Gateway Pod", "Legacy Mainframe Team", "Frontend Guild"];

    // Migrate legacy `last_simulation` to a scenario if scenarios don't exist
    const defaultScenario = {
        id: 's1',
        name: 'Baseline Simulation',
        baseline: true,
        targetComponents: thing.content?.last_simulation?.targetComponents || [],
        migrationPattern: thing.content?.last_simulation?.migrationPattern || 'strangler_fig',
        interfaceProtocols: thing.content?.last_simulation?.interfaceProtocols || {},
        teamAssignee: thing.content?.last_simulation?.teamAssignee || 'platform_squad',
        dualRun: thing.content?.last_simulation?.dualRun ?? true,
        zeroDowntime: thing.content?.last_simulation?.zeroDowntime ?? false,
        canaryRollout: thing.content?.last_simulation?.canaryRollout ?? false,
        dataBackfill: thing.content?.last_simulation?.dataBackfill ?? false,
        maxBudget: thing.content?.last_simulation?.maxBudget || "1000000",
        maxTimeline: thing.content?.last_simulation?.maxTimeline || "52",
        maxStaff: thing.content?.last_simulation?.maxStaff || "20",
        simDelta: thing.content?.last_simulation?.simDelta || defaultSimDelta
    };

    const initialScenarios = thing.content?.scenarios || [defaultScenario];
    const [scenarios, setScenarios] = useState<any[]>(initialScenarios);
    const [activeScenarioId, setActiveScenarioId] = useState<string>(initialActiveId);
    
    const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];

    const [targetComponents, setTargetComponents] = useState<string[]>(activeScenario.targetComponents || []);
    const [migrationPattern, setMigrationPattern] = useState(activeScenario.migrationPattern || 'strangler_fig');
    const [interfaceProtocols, setInterfaceProtocols] = useState<Record<string, string>>(activeScenario.interfaceProtocols || {});
    const [teamAssignee, setTeamAssignee] = useState(activeScenario.teamAssignee || 'platform_squad');
    const [dualRun, setDualRun] = useState(activeScenario.dualRun ?? true);
    const [zeroDowntime, setZeroDowntime] = useState(activeScenario.zeroDowntime ?? false);
    const [canaryRollout, setCanaryRollout] = useState(activeScenario.canaryRollout ?? false);
    const [dataBackfill, setDataBackfill] = useState(activeScenario.dataBackfill ?? false);
    const [maxBudget, setMaxBudget] = useState(activeScenario.maxBudget || "1000000");
    const [maxTimeline, setMaxTimeline] = useState(activeScenario.maxTimeline || "52");
    const [maxStaff, setMaxStaff] = useState(activeScenario.maxStaff || "20");

    // Simulation outcome 
    const [simDelta, setSimDelta] = useState<any>(activeScenario.simDelta || defaultSimDelta);

    const [editedTopology, setEditedTopology] = useState(topologyReport);

    useEffect(() => {
        setEditedTopology(topologyReport);
    }, [topologyReport]);

    const [status, setStatus] = useState<'idle' | 'simulating' | 'completed'>('idle');
    const selectedModel = useCanvasStore(state => state.selectedModel);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    useEffect(() => {
        setNodes(generateNodes(topologyReport.components, targetComponents, migrationPattern));
        setEdges(generateEdges(topologyReport.dependencies, topologyReport.components));
    }, [topologyReport.components, topologyReport.dependencies, targetComponents, migrationPattern, setNodes, setEdges]);

    useEffect(() => {
        if (topologyReport && topologyReport.components.length > 0 && targetComponents.length === 0) {
            setTargetComponents([topologyReport.components[0].id]);
        }
    }, [topologyReport]);

    useEffect(() => {
        setNodes(generateNodes(topologyReport.components, targetComponents, migrationPattern));
        setEdges(generateEdges(topologyReport.dependencies, topologyReport.components));
    }, [targetComponents, migrationPattern, topologyReport.components, topologyReport.dependencies, setNodes, setEdges]);
    const [syncState, setSyncState] = useState<'idle' | 'checking' | 'completed' | 'running' | 'error'>('idle');
    const [elapsedTime, setElapsedTime] = useState<number | null>(null);
    const [progressMessage, setProgressMessage] = useState<string>(
        status === 'simulating' ? 'Running safely in the background...' : ''
    );
    const [simProgressPercent, setSimProgressPercent] = useState(0);
    const abortControllerRef = React.useRef<AbortController | null>(null);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (status === 'simulating') {
            setElapsedTime(0);
            timer = setInterval(() => setElapsedTime(prev => (prev || 0) + 1), 1000);
        } else {
            setElapsedTime(null);
        }
        return () => clearInterval(timer);
    }, [status]);

    const checkStatus = useCallback(async () => {
        setSyncState('checking');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/project_impact_simulator/status/${thing.id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.step === 'SIMULATING') {
                    if (status !== 'simulating') setStatus('simulating');
                    if (!abortControllerRef.current) {
                        setProgressMessage('Backend process is still running...');
                    }
                    setSyncState('running');
                } else if (data.step === 'DONE' || data.step === 'WAITING') {
                    if (status === 'simulating') setStatus('completed');
                    setSyncState(data.step === 'DONE' ? 'completed' : 'idle');
                }
            } else {
                setSyncState('error');
            }
        } catch (err) {
            console.error("Failed to check sim status", err);
            setSyncState('error');
        }
        setTimeout(() => setSyncState('idle'), 3000);
    }, [thing.id, status]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'simulating') {
            interval = setInterval(() => {
                if (syncState !== 'checking') {
                    checkStatus();
                }
            }, 15000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [status, checkStatus, syncState]);

    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        } else {
            setStatus('idle');
            setProgressMessage('Cancelled');
            setElapsedTime(null);
            setSimProgressPercent(0);
        }
    };

    const handleAutoSolve = async () => {
        setStatus('simulating');
        setSimProgressPercent(5);
        setProgressMessage('Initiating Auto-Solve...');

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/project_impact_simulator/auto_solve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    thing_id: thing.id,
                    target_components: targetComponents,
                    max_budget: Number(maxBudget) || 1000000,
                    max_timeline_weeks: Number(maxTimeline) || 52,
                    max_staff: Number(maxStaff) || 20,
                    llm_preset: selectedModel || 'default'
                }),
                signal: abortController.signal
            });
            if (!res.ok) throw new Error("AutoSolve failed");
            if (!res.body) throw new Error("No response body");

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let done = false;
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
                                setSimProgressPercent(prev => Math.min(prev + 5, 95));
                                if (data.node === 'evaluate') setProgressMessage("Evaluating constraints...");
                                if (data.node === 'simulate') setProgressMessage("Running impact simulations...");
                                if (data.node === 'optimize') setProgressMessage("Finding optimal path...");
                                console.log(data.node);
                            } else if (data.type === "completed") {
                                setSimProgressPercent(100);
                                const optimalConstraints = data.result.optimal_constraints;
                                const optimalSim = data.result.optimal_simulation;
                                
                                setMigrationPattern(optimalConstraints.migration_pattern);
                                setTeamAssignee(optimalConstraints.team_assignee);
                                setDualRun(optimalConstraints.dual_run);
                                setZeroDowntime(optimalConstraints.zero_downtime);
                                setCanaryRollout(optimalConstraints.canary_rollout);
                                setDataBackfill(optimalConstraints.data_backfill);
                                
                                const newSimDelta = {
                                    weeks: optimalSim.total_weeks,
                                    cost: optimalSim.total_cost,
                                    risk: `${optimalSim.monthly_risk_indices?.[0]?.toFixed(2) || '0.00'} (Avg)`,
                                    bottleneck: optimalSim.bottleneck_analysis?.substring(0, 50) + '...',
                                    bottleneck_citation: optimalSim.bottleneck_citation,
                                    justification_of_metrics: optimalSim.justification_of_metrics,
                                    assumptions: optimalSim.assumptions || [],
                                    schedule: optimalSim.schedule || [],
                                    isolated_impacts: optimalSim.isolated_impacts || {}
                                };
                                setSimDelta(newSimDelta);
                                
                                let updatedScenarios = [...scenarios];
                                const activeIndex = updatedScenarios.findIndex(s => s.id === activeScenarioId);
                                if (activeIndex >= 0) {
                                    updatedScenarios[activeIndex] = {
                                        ...updatedScenarios[activeIndex],
                                        migrationPattern: optimalConstraints.migration_pattern,
                                        teamAssignee: optimalConstraints.team_assignee,
                                        dualRun: optimalConstraints.dual_run,
                                        zeroDowntime: optimalConstraints.zero_downtime,
                                        canaryRollout: optimalConstraints.canary_rollout,
                                        dataBackfill: optimalConstraints.data_backfill,
                                        simDelta: newSimDelta
                                    };
                                    setScenarios(updatedScenarios);
                                    updateThing(thing.id, {
                                        content: {
                                            ...thing.content,
                                            scenarios: updatedScenarios
                                        }
                                    });
                                }
                                setStatus('completed');
                            } else if (data.type === "error") {
                                throw new Error(data.message);
                            }
                        } catch (e) {
                            console.error("Failed to parse SSE event:", e);
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error("AutoSolve Failed:", error);
            if (error.name === 'AbortError') {
                console.log("AutoSolve aborted.");
            } else {
                setStatus('idle');
                alert("AutoSolve failed. Ensure backend is running and LLM is configured.");
            }
        } finally {
            abortControllerRef.current = null;
        }
    };

    const handleRunSimulation = async () => {
        setStatus('simulating');
        setSimProgressPercent(5);
        setProgressMessage('Reading architecture context and constraint logic...');

        const currentConstraints = {
            max_budget: Number(maxBudget) || 1000000,
            max_timeline_weeks: Number(maxTimeline) || 52,
            max_staff: Number(maxStaff) || 20,
            target_components: targetComponents,
            migration_pattern: migrationPattern,
            interface_protocols: interfaceProtocols,
            team_assignee: teamAssignee,
            dual_run: dualRun,
            zero_downtime: zeroDowntime,
            canary_rollout: canaryRollout,
            data_backfill: dataBackfill,
            dynamic_rules: {}
        };

        const mockTopology = editedTopology;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/project_impact_simulator/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    thing_id: thing.id,
                    topology: mockTopology,
                    constraints: currentConstraints,
                    llm_preset: selectedModel || 'default'
                }),
                signal: abortController.signal
            });
            if (!res.ok) throw new Error("Simulation Request Failed");
            if (!res.body) throw new Error("No response body");

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let done = false;
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
                                setSimProgressPercent(prev => Math.min(prev + 5, 95));
                                if (data.node === 'evaluate') setProgressMessage("Evaluating constraints...");
                                if (data.node === 'simulate') setProgressMessage("Running impact simulations...");
                                if (data.node === 'optimize') setProgressMessage("Finding optimal path...");
                                console.log(data.node);
                            } else if (data.type === "completed") {
                                setSimProgressPercent(100);
                                const newSimDelta = {
                                    weeks: data.result.total_weeks,
                                    min_weeks: data.result.min_weeks_confidence,
                                    max_weeks: data.result.max_weeks_confidence,
                                    cost: data.result.total_cost,
                                    min_cost: data.result.min_cost_confidence,
                                    max_cost: data.result.max_cost_confidence,
                                    risk: `${(data.result.monthly_risk_indices?.[0] || 0.5).toFixed(2)} (${data.result.is_viable ? 'Viable' : 'Risk'})`,
                                    bottleneck: data.result.bottleneck_analysis,
                                    bottleneck_citation: data.result.bottleneck_citation || '',
                                    justification_of_metrics: data.result.justification_of_metrics || '',
                                    assumptions: data.result.assumptions || [],
                                    schedule: data.result.schedule || [],
                                    isolated_impacts: data.result.isolated_impacts || {}
                                };
                                
                                setSimDelta(newSimDelta);
                                
                                if (!isReadOnly) {
                                    const updatedScenarios = scenarios.map(s => {
                                        if (s.id === activeScenarioId) {
                                            return {
                                                ...s,
                                                simDelta: newSimDelta,
                                                targetComponents,
                                                migrationPattern,
                                                interfaceProtocols,
                                                teamAssignee,
                                                dualRun,
                                                zeroDowntime,
                                                canaryRollout,
                                                dataBackfill,
                                                maxBudget,
                                                maxTimeline,
                                                maxStaff
                                            };
                                        }
                                        return s;
                                    });
                                    
                                    setScenarios(updatedScenarios);
                                    updateThing(thing.id, {
                                        content: {
                                            ...thing.content,
                                            activeScenarioId,
                                            scenarios: updatedScenarios
                                        }
                                    });
                                }
                                setStatus('completed');
                            } else if (data.type === "error") {
                                throw new Error(data.message);
                            }
                        } catch (e) {
                            console.error("Failed to parse SSE event:", e);
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error("Simulation Request Failed:", error);
            if (error.name === 'AbortError') {
                console.log("Simulation aborted.");
            } else {
                setStatus('idle');
                alert("Simulation failed.");
            }
        } finally {
            abortControllerRef.current = null;
        }
    };

    // Helper to package up the current state of UI for saving
    const getCurrentScenarioState = () => ({
        targetComponents,
        migrationPattern,
        interfaceProtocols,
        teamAssignee,
        dualRun,
        zeroDowntime,
        canaryRollout,
        dataBackfill,
        maxBudget,
        maxTimeline,
        maxStaff,
        simDelta
    });

    const handleScenarioChange = (id: string) => {
        setActiveScenarioId(id);
        const scenario = scenarios.find(s => s.id === id);
        if (scenario) {
            setTargetComponents(scenario.targetComponents || []);
            setMigrationPattern(scenario.migrationPattern || 'strangler_fig');
            setInterfaceProtocols(scenario.interfaceProtocols || {});
            setTeamAssignee(scenario.teamAssignee || 'platform_squad');
            setDualRun(scenario.dualRun ?? true);
            setZeroDowntime(scenario.zeroDowntime ?? false);
            setCanaryRollout(scenario.canaryRollout ?? false);
            setDataBackfill(scenario.dataBackfill ?? false);
            setMaxBudget(scenario.maxBudget || "1000000");
            setMaxTimeline(scenario.maxTimeline || "52");
            setMaxStaff(scenario.maxStaff || "20");
            setSimDelta(scenario.simDelta || defaultSimDelta);
            if (!isReadOnly) {
                updateThing(thing.id, {
                    content: {
                        ...thing.content,
                        activeScenarioId: id
                    }
                });
            }
        }
    };

    const handleBranchScenario = () => {
        const currentScenario = scenarios.find(s => s.id === activeScenarioId);
        if (!currentScenario) return;
        
        const newId = `s${Date.now()}`;
        const branchedScenario = {
            ...currentScenario,
            id: newId,
            name: `${currentScenario.name} (Copy)`,
            baseline: false
        };
        
        const updatedScenarios = [...scenarios, branchedScenario];
        setScenarios(updatedScenarios);
        setActiveScenarioId(newId);
        
        if (!isReadOnly) {
            updateThing(thing.id, {
                content: {
                    ...thing.content,
                    activeScenarioId: newId,
                    scenarios: updatedScenarios
                }
            });
        }
    };

    const handleRenameScenario = () => {
        const scenario = scenarios.find(s => s.id === activeScenarioId);
        if (!scenario) return;
        
        const newName = window.prompt("Rename scenario:", scenario.name);
        if (!newName || newName === scenario.name) return;
        
        const updatedScenarios = scenarios.map(s => s.id === activeScenarioId ? { ...s, name: newName } : s);
        setScenarios(updatedScenarios);
        
        if (!isReadOnly) {
            updateThing(thing.id, {
                content: {
                    ...thing.content,
                    scenarios: updatedScenarios
                }
            });
        }
    };

    const allLinkedThings = links.filter(l => l.target_id === thing.id || l.source_id === thing.id)
        .map(l => {
            const docId = l.target_id === thing.id ? l.source_id : l.target_id;
            return things.find(t => t.id === docId);
        })
        .filter((t): t is CanvasThing => t !== undefined);

    const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set());
    const seenDocsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        setSelectedLinkIds(prev => {
            const next = new Set(prev);
            let changed = false;
            allLinkedThings.forEach(doc => {
                if (!seenDocsRef.current.has(doc.id)) {
                    next.add(doc.id);
                    seenDocsRef.current.add(doc.id);
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [allLinkedThings]);

    const [isExtracting, setIsExtracting] = useState(false);
    
    const handleExtractFromDocs = async () => {
        setIsExtracting(true);
        try {
            const connectedIds = Array.from(selectedLinkIds);
            
            if (connectedIds.length === 0) {
                alert("Please select at least one document to sync context.");
                setIsExtracting(false);
                return;
            }

            const response = await fetch('/api/v1/project_impact_simulator/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_ids: connectedIds,
                    llm_preset: selectedModel
                })
            });
            
            if (!response.ok) throw new Error('Extraction failed');
            
            const data = await response.json();
            if (data.report) {
                // Persist the new report to the canvas
                updateThing(thing.id, { content: { ...thing.content, report: data.report } });
                alert("Document extraction complete! The latest architectural components and org teams have been loaded.");
            } else {
                throw new Error('No report returned');
            }
        } catch (error: any) {
            console.error("Extraction error:", error);
            alert(`Extraction Failed: ${error.message || 'Server error'}`);
        } finally {
            setIsExtracting(false);
        }
    };

    if (!thing.content?.report && status !== 'simulating') {
        return (
            <div className="flex flex-col w-full h-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative justify-center border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
                <div className="text-center flex flex-col items-center w-full max-w-md mx-auto">
                    <Activity className="w-16 h-16 text-indigo-300 dark:text-indigo-700 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-6">Project Impact Simulator</h3>
                    
                    <LinkedDocumentSelector 
                        linkedThings={allLinkedThings}
                        selectedIds={selectedLinkIds}
                        onSelectionChange={setSelectedLinkIds}
                    />
                    
                    <Button 
                        onClick={handleExtractFromDocs} 
                        disabled={isExtracting || allLinkedThings.length === 0 || selectedLinkIds.size === 0}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-6 h-12 text-base font-medium transition-transform hover:scale-105 shadow-md"
                    >
                        {isExtracting ? (
                            <span className="flex items-center gap-2">
                                <Activity className="w-5 h-5 animate-spin" /> Extracting Components...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Layers className="w-5 h-5" /> Initialize Configuration
                            </span>
                        )}
                    </Button>
                </div>
            </div>
        );
    }

    if (status === 'simulating') {
        return (
            <div className="flex flex-col w-full h-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative justify-center border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0 pointer-events-none">
                    <div className="flex items-center gap-4">
                        <div className="font-bold text-sm bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-md flex items-center gap-2 border border-slate-200 dark:border-slate-700">
                            <Layers className="w-4 h-4 text-indigo-500" />
                            Project: {thing.content?.name || 'Architecture Modernization'}
                        </div>
                    </div>
                </div>

                <div className="p-8 max-w-3xl mx-auto flex flex-col items-center gap-6 pb-20">
                    <div className="mt-20 text-center flex flex-col items-center">
                        <div className="w-16 h-16 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-6" />
                        <h3 className="text-xl font-medium text-slate-700 dark:text-slate-200 mb-2">Simulating Project Impact</h3>
                        
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-md mb-6 max-w-md text-sm">
                            ⚠️ <strong>Do not refresh this page.</strong> If you do, the generation will continue in the background but this screen will lose connection and stop updating automatically.
                        </div>

                        {(progressMessage === 'Running safely in the background...' || progressMessage === 'Backend process is still running...') ? (
                            <div className="text-slate-500 dark:text-slate-400 mb-4 max-w-md space-y-2">
                                <p className="font-semibold text-amber-600 dark:text-amber-500">
                                    Background process is still running.
                                </p>
                                <p className="text-sm">
                                    We cannot estimate the remaining time because the page was refreshed, but the AI is actively processing in the background. Please wait for completion or click "Refresh Status" to check.
                                </p>
                            </div>
                        ) : (
                            <p className="text-slate-500 dark:text-slate-400 mb-4 max-w-md">
                                {progressMessage || 'Running LangGraph simulator...'}
                            </p>
                        )}
                        
                        {elapsedTime !== null ? (
                            <div className="w-64 mb-8">
                                <div className="bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-2 overflow-hidden w-full">
                                    <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300" style={{ width: `${simProgressPercent}%` }} />
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
                            <Button variant="outline" className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:border-indigo-900/50 dark:hover:bg-indigo-900/20 pointer-events-auto" onClick={checkStatus}>
                                Refresh Status
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
            {/* Top Toolbar */}
            <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="font-bold text-sm bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-md flex items-center gap-2 border border-slate-200 dark:border-slate-700">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        Project: {thing.content?.name || 'Architecture Modernization'}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <Label className="text-xs text-slate-500 font-semibold uppercase">Active Scenario:</Label>
                        <Select value={activeScenarioId} onValueChange={handleScenarioChange}>
                            <SelectTrigger className="h-8 w-64 text-xs font-semibold bg-indigo-50 border-indigo-200 text-indigo-900">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[2000]">
                                {scenarios.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name} {s.baseline && '(Baseline)'}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:bg-slate-200 rounded shrink-0" onClick={handleRenameScenario} title="Rename Scenario">
                            <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs font-semibold shrink-0" onClick={handleBranchScenario}>
                            <GitBranch className="w-4 h-4 mr-2" />
                            Branch
                        </Button>
                    </div>
                    
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 hover:bg-slate-100 ml-2">
                                <HelpCircle className="w-5 h-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                            <SheetHeader>
                                <SheetTitle className="text-xl text-indigo-900 font-bold">Scenario Simulator Guide</SheetTitle>
                                <SheetDescription>
                                    Learn how to use ArchVantage to simulate modernization scenarios.
                                </SheetDescription>
                            </SheetHeader>
                            <div className="mt-6 space-y-6 text-sm text-slate-700">
                                <div>
                                    <h3 className="font-bold text-slate-900 mb-2 border-b pb-1">1. Step-by-Step Workflow</h3>
                                    <ol className="list-decimal pl-5 space-y-2">
                                        <li><strong className="text-slate-900">Sync with Documents:</strong> Click the "Sync" button at the top to have AI read your architecture documents and map out the current Topology.</li>
                                        <li><strong className="text-slate-900">Select Target Components:</strong> Check the boxes next to the components you intend to modernize.</li>
                                        <li><strong className="text-slate-900">Adapt Parameters:</strong> Use the Tabs (Topology, Org, Strategy, etc.) to set migration patterns and assign teams.</li>
                                        <li><strong className="text-slate-900">Run Simulation:</strong> Click "Recalculate Simulation" to manually test your parameters, OR set maximum limits in the Params tab and click "Auto-Solve Constraints" to let AI find the optimal setup for you.</li>
                                        <li><strong className="text-slate-900">Export PPTX:</strong> Click "Export PPTX" to generate a native PowerPoint pitch deck of your results.</li>
                                    </ol>
                                </div>
                                
                                <div>
                                    <h3 className="font-bold text-slate-900 mb-2 border-b pb-1">2. Understanding the Controls</h3>
                                    <div className="space-y-3">
                                        <p><strong>Migration Pattern:</strong> The architectural approach for the selected components. (e.g. <em>Strangler Fig</em> replaces pieces gradually behind a facade, while <em>Big Bang</em> replaces everything overnight at high risk).</p>
                                        <p><strong>Granular Protocols:</strong> Allows you to specifically change how two dependent systems communicate (e.g. changing from Sync RPC to Async Event Hub).</p>
                                        <p><strong>Assignee Team:</strong> Select which team executes the project. Some teams have high domain context but low modern tech skills (Legacy Domain), while others are fast but require ramp-up (Contractors).</p>
                                        <p><strong>Dual-Run / Zero-Downtime:</strong> These strategic toggles dramatically lower execution risk but significantly increase the cost and timeline due to the engineering complexity of running two systems simultaneously.</p>
                                        <p><strong>Auto-Solve Limits:</strong> The Max Budget, Timeline, and Staff parameters in the Params tab are strict ceilings used exclusively by the Auto-Solve agent to find a winning configuration.</p>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-bold text-slate-900 mb-2 border-b pb-1">3. The Dashboards</h3>
                                    <ul className="list-disc pl-5 space-y-2">
                                        <li><strong>Impact Dashboard:</strong> Displays the calculated total Time, Budget, and execution Risk of your current parameters.</li>
                                        <li><strong>Critical Bottleneck:</strong> The specific phase causing the most delay/risk.</li>
                                        <li><strong>Metric Justification:</strong> The AI's plain-English explanation of exactly <em>why</em> it assigned the given metrics.</li>
                                    </ul>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
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
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-xs font-semibold text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100" 
                        onClick={async () => {
                            try {
                                const res = await fetch('http://localhost:8000/api/v1/project_impact_simulator/export/pptx', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        scenario_name: activeScenario.name,
                                        target_components: targetComponents,
                                        migration_pattern: migrationPattern,
                                        sim_delta: simDelta,
                                        constraints: {
                                            dual_run: dualRun,
                                            canary_rollout: canaryRollout,
                                            zero_downtime: zeroDowntime,
                                            data_backfill: dataBackfill,
                                            team_assignee: teamAssignee,
                                            max_budget: parseFloat(maxBudget),
                                            max_timeline: parseInt(maxTimeline),
                                            max_staff: parseInt(maxStaff)
                                        },
                                        interface_protocols: interfaceProtocols
                                    })
                                });
                                if (!res.ok) throw new Error("Failed to export PPTX");
                                const blob = await res.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `archvantage_${activeScenario.name.replace(/\s+/g, '_')}.pptx`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                            } catch (error) {
                                console.error("Export Error:", error);
                                alert("Failed to export PPTX.");
                            }
                        }} 
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Export PPTX
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-xs font-semibold text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100" 
                        onClick={handleExtractFromDocs} 
                        disabled={isExtracting}
                    >
                        {isExtracting ? <Activity className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                        {isExtracting ? 'Analyzing...' : 'Sync with Docs'}
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden nodrag" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {/* Left Panel: Scenario Builder Tabs */}
                <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 pointer-events-auto z-10 shadow-sm relative" onWheelCapture={(e) => e.stopPropagation()}>
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <h3 className="font-bold text-sm tracking-wide text-slate-700 dark:text-slate-300">SCENARIO BUILDER</h3>
                    </div>
                    
                    {/* Target Components Selector - Applies to all tabs */}
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                        <Label className="text-xs text-slate-500 font-bold mb-2 block">Target Components</Label>
                        <div className="max-h-32 overflow-y-auto bg-slate-50 border border-slate-200 rounded p-2 space-y-2">
                            {topologyReport.components.length === 0 ? (
                                <div className="text-xs text-slate-500 italic p-2 text-center">
                                    No components loaded. Click "Sync with Documents" to extract topology.
                                </div>
                            ) : (
                                topologyReport.components.map((c: any) => (
                                    <div key={c.id} className="flex items-start space-x-2">
                                        <Checkbox 
                                            id={`tc-${c.id}`} 
                                            checked={targetComponents.includes(c.id)} 
                                            onCheckedChange={(checked) => {
                                                if (checked) setTargetComponents([...targetComponents, c.id]);
                                                else setTargetComponents(targetComponents.filter((id: string) => id !== c.id));
                                            }} 
                                            className="mt-0.5"
                                        />
                                        <label htmlFor={`tc-${c.id}`} className="text-xs leading-tight cursor-pointer">{c.name}</label>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <Tabs defaultValue="topology" className="flex-1 flex flex-col h-full overflow-hidden">
                        <TabsList className="h-10 w-full rounded-none border-b border-slate-200 bg-transparent p-0">
                            <TabsTrigger value="topology" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent text-xs font-bold text-slate-500 transition-none">Topology</TabsTrigger>
                            <TabsTrigger value="org" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent text-xs font-bold text-slate-500 transition-none">Org</TabsTrigger>
                            <TabsTrigger value="strategy" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent text-xs font-bold text-slate-500 transition-none">Strategy</TabsTrigger>
                            <TabsTrigger value="pnl" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent text-xs font-bold text-slate-500 transition-none">P&L</TabsTrigger>
                            <TabsTrigger value="params" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent text-xs font-bold text-slate-500 transition-none">Params</TabsTrigger>
                        </TabsList>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                            <TabsContent value="topology" className="mt-0 space-y-4">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">1</div>
                                        <h4 className="font-bold text-sm">Component Mutation</h4>
                                    </div>
                                    
                                    <div className="space-y-3 pl-8">
                                        <div>
                                            <Label className="text-xs text-slate-500">Migration Pattern</Label>
                                            <Select value={migrationPattern} onValueChange={setMigrationPattern}>
                                                <SelectTrigger className="h-8 mt-1 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="z-[2000]">
                                                    {MIGRATION_PATTERNS.map(p => (
                                                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-[10px] text-slate-500 mt-1.5 italic leading-tight">
                                                {MIGRATION_PATTERNS.find(p => p.value === migrationPattern)?.help}
                                            </p>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500 mb-2 block">Granular Interface Protocols</Label>
                                            
                                            {(() => {
                                                const targetedDependencies = topologyReport.dependencies?.filter((dep: any) => 
                                                    targetComponents.includes(dep.source_id) || targetComponents.includes(dep.target_id)
                                                ) || [];
                                                
                                                if (targetedDependencies.length === 0) {
                                                    return <div className="text-xs text-slate-500 italic p-3 bg-slate-50 border border-slate-200 rounded">No interfaces connected to selected components.</div>;
                                                }

                                                return (
                                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                                        {targetedDependencies.map((dep: any) => {
                                                            const edgeId = `${dep.source_id}->${dep.target_id}`;
                                                            const currentVal = interfaceProtocols[edgeId] || 'do_nothing';
                                                            const sourceName = topologyReport.components.find((c: any) => c.id === dep.source_id)?.name || dep.source_id;
                                                            const targetName = topologyReport.components.find((c: any) => c.id === dep.target_id)?.name || dep.target_id;
                                                            
                                                            return (
                                                                <div key={edgeId} className="p-2 border border-slate-200 rounded-md bg-slate-50/50 flex flex-col gap-1.5">
                                                                    <div className="flex items-center text-[10px] font-semibold text-slate-700 truncate" title={`${sourceName} → ${targetName}`}>
                                                                        <span className="truncate max-w-[110px] text-right">{sourceName}</span>
                                                                        <ArrowRight className="w-3 h-3 mx-1 shrink-0 text-slate-400" />
                                                                        <span className="truncate max-w-[110px]">{targetName}</span>
                                                                    </div>
                                                                    <Select 
                                                                        value={currentVal} 
                                                                        onValueChange={(val) => setInterfaceProtocols({...interfaceProtocols, [edgeId]: val})}
                                                                    >
                                                                        <SelectTrigger className="h-7 text-[10px] bg-white border-slate-200">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent className="z-[2000]">
                                                                            {INTERFACE_PROTOCOLS.map(p => (
                                                                                <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="org" className="mt-0 space-y-4">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">2</div>
                                        <h4 className="font-bold text-sm">Org / Team Assignment</h4>
                                    </div>
                                    
                                    <div className="space-y-3 pl-8">
                                        <div>
                                            <Label className="text-xs text-slate-500">Assignee Team</Label>
                                            <Select value={teamAssignee} onValueChange={setTeamAssignee}>
                                                <SelectTrigger className="h-8 mt-1 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="z-[2000] max-h-80">
                                                    <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Common Archetypes</div>
                                                    {ASSIGNEE_TEAMS.map(team => (
                                                        <SelectItem key={team.value} value={team.value}>{team.label}</SelectItem>
                                                    ))}
                                                    {topologyReport.extracted_teams && topologyReport.extracted_teams.length > 0 && (
                                                        <>
                                                            <div className="px-2 py-1.5 mt-2 text-[10px] font-bold text-indigo-400 flex items-center gap-1 uppercase tracking-wider border-t border-slate-100">
                                                                <FileText className="w-3 h-3" />
                                                                Extracted from Documents
                                                            </div>
                                                            {topologyReport.extracted_teams.map((team: any) => (
                                                                <SelectItem key={team.id} value={team.id}>
                                                                    <div className="flex flex-col">
                                                                        <span>{team.name}</span>
                                                                        <span className="text-[9px] text-slate-400 italic">Src: {team.source}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-[10px] text-slate-500 mt-1.5 italic leading-tight">
                                                {ASSIGNEE_TEAMS.find(t => t.value === teamAssignee)?.help || 
                                                 topologyReport.extracted_teams?.find((t: any) => t.id === teamAssignee)?.description}
                                            </p>
                                        </div>
                                                                                {(() => {
                                            const getSkillMatch = (teamId: string) => {
                                                switch (teamId) {
                                                    case 'do_nothing':
                                                        return { percentage: 100, text: "Current team retains full domain knowledge and context.", color: "text-emerald-600", bg: "bg-emerald-500" };
                                                    case 'platform_squad':
                                                        return { percentage: 85, text: "Team possesses strong Cloud-Native/Kafka skills, but lacks deep legacy domain knowledge.", color: "text-emerald-600", bg: "bg-emerald-500" };
                                                    case 'legacy_domain':
                                                    case 'core_cbs':
                                                        return { percentage: 40, text: "Team has deep domain knowledge but lacks modern API/Cloud skills.", color: "text-amber-600", bg: "bg-amber-500" };
                                                    case 'external_contractor':
                                                    case 'external':
                                                        return { percentage: 60, text: "Team is highly skilled in modern tech but lacks enterprise context, requiring steep ramp-up.", color: "text-amber-600", bg: "bg-amber-500" };
                                                    case 'devops_sre':
                                                        return { percentage: 75, text: "Strong operational skills but may require domain bridging.", color: "text-emerald-600", bg: "bg-emerald-500" };
                                                    case 'tiger_team':
                                                        return { percentage: 95, text: "Cross-functional team covers all necessary skill areas effectively.", color: "text-emerald-600", bg: "bg-emerald-500" };
                                                    default:
                                                        const extracted = topologyReport.extracted_teams?.find((t: any) => t.id === teamId);
                                                        if (extracted) {
                                                            const match = extracted.technical_capability_score !== undefined 
                                                                ? extracted.technical_capability_score 
                                                                : 50; // Fallback if score wasn't generated
                                                            
                                                            let colorClass = "text-indigo-600";
                                                            let bgClass = "bg-indigo-500";
                                                            if (match < 30) { colorClass = "text-red-600"; bgClass = "bg-red-500"; }
                                                            else if (match < 60) { colorClass = "text-amber-600"; bgClass = "bg-amber-500"; }
                                                            else if (match >= 80) { colorClass = "text-emerald-600"; bgClass = "bg-emerald-500"; }
                                                            
                                                            return { 
                                                                percentage: match, 
                                                                text: extracted.description ? `Extracted Profile: ${extracted.description}` : `Extracted team "${extracted.name}" evaluated dynamically against Target Component skills.`, 
                                                                color: colorClass, 
                                                                bg: bgClass 
                                                            };
                                                        }
                                                        return { percentage: 50, text: "Unknown team.", color: "text-slate-600", bg: "bg-slate-500" };
                                                }
                                            };
                                            const match = getSkillMatch(teamAssignee);
                                            return (
                                                <div className="bg-slate-50 p-3 rounded-md border border-slate-200 mt-2">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <div className="flex items-center gap-1 cursor-help">
                                                            <span className="text-xs font-semibold">Skill Match Validation</span>
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="text-[10px] bg-slate-200 text-slate-500 rounded-full w-3.5 h-3.5 flex items-center justify-center">?</span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top" className="max-w-xs text-xs z-[3000]">
                                                                        Validates the Assignee Team&apos;s capabilities against the required technical skills of the selected Target Component and Interface Protocol. A low match significantly increases simulated timeline risk and budget.
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        </div>
                                                        <span className={`text-xs font-bold ${match.color}`}>{match.percentage}% Match</span>
                                                    </div>
                                                    <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                                                        <div className={`${match.bg} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${match.percentage}%` }}></div>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 mt-2">{match.text}</p>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="strategy" className="mt-0 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
                                <div className="mb-4">
                                    <div className="flex items-center gap-2 mb-3 bg-indigo-50/50 p-2 rounded border border-indigo-100">
                                        <div className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                                        <h4 className="font-bold text-sm text-slate-700">Sequence Overrides</h4>
                                    </div>
                                    <div className="space-y-4 pl-2">
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <Checkbox id="dual-run" checked={dualRun} onCheckedChange={(c: boolean) => setDualRun(c)} />
                                                <label htmlFor="dual-run" className="text-xs font-bold leading-none cursor-pointer">Enable Dual-Run Replication</label>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-1 pl-6 leading-tight">
                                                Runs old and new systems simultaneously in production, synchronizing data between them. Increases initial cost/time but unblocks parallel downstream modernization and lowers risk.
                                            </p>
                                        </div>
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <Checkbox id="zero-downtime" checked={zeroDowntime} onCheckedChange={(c: boolean) => setZeroDowntime(c)} />
                                                <label htmlFor="zero-downtime" className="text-xs font-bold leading-none cursor-pointer">Require Zero-Downtime Cutover</label>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-1 pl-6 leading-tight">
                                                Enforces flawless switchover with zero disruption to users (via Blue-Green or traffic shadowing). Exponentially increases required engineering effort and budget.
                                            </p>
                                        </div>
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <Checkbox id="canary-rollout" checked={canaryRollout} onCheckedChange={(c: boolean) => setCanaryRollout(c)} />
                                                <label htmlFor="canary-rollout" className="text-xs font-bold leading-none cursor-pointer">Enforce Canary Rollout</label>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-1 pl-6 leading-tight">
                                                Gradually shifts traffic to the new component (e.g., 5% -&gt; 20% -&gt; 100%). Lowers blast-radius risk but elongates the total deployment timeline.
                                            </p>
                                        </div>
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <Checkbox id="data-backfill" checked={dataBackfill} onCheckedChange={(c: boolean) => setDataBackfill(c)} />
                                                <label htmlFor="data-backfill" className="text-xs font-bold leading-none cursor-pointer">Asynchronous Data Backfill</label>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-1 pl-6 leading-tight">
                                                Migrates historical payload data in the background after the cutover. Reduces immediate cutover downtime but introduces data consistency risks during the backfill window.
                                            </p>
                                        </div>
                                    </div>
                                    {dualRun && (
                                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                            <span className="text-[10px] text-amber-800 leading-tight">
                                                Enabling Dual-Run adds 4-week overhead upfront but frees {topologyReport.dependencies?.length || 3} downstream components to be built in parallel.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="pnl" className="mt-0 space-y-4">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">4</div>
                                        <h4 className="font-bold text-sm">Financial Constraints</h4>
                                    </div>
                                    
                                    <div className="space-y-3 pl-2">
                                        <div>
                                            <Label className="text-xs text-slate-500 font-bold">CapEx Budget Cap ($)</Label>
                                            <Input type="number" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} className="h-8 text-xs mt-1" />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500 font-bold">Max Timeline (Weeks)</Label>
                                            <Input type="number" value={maxTimeline} onChange={e => setMaxTimeline(e.target.value)} className="h-8 text-xs mt-1" />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500 font-bold">Max Staff Available</Label>
                                            <Input type="number" value={maxStaff} onChange={e => setMaxStaff(e.target.value)} className="h-8 text-xs mt-1" />
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="params" className="mt-0 space-y-4">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">5</div>
                                        <h4 className="font-bold text-sm">Extracted Parameters</h4>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-2">Manually override AI-extracted component complexity scores (0.0 to 1.0).</p>
                                    <div className="space-y-6 pr-2">
                                        {editedTopology.components?.map(c => (
                                            <div key={c.id} className="flex flex-col gap-2 p-2 bg-slate-50 border border-slate-100 rounded-md">
                                                <div className="font-bold text-slate-700 text-[11px] border-b border-slate-200 pb-1 mb-1 truncate" title={c.name}>{c.name}</div>
                                                
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[9px] text-slate-500 uppercase">Technical (Code)</span>
                                                        <span className="text-[10px] text-slate-700 font-semibold">{c.technical_complexity?.toFixed(2) || '0.50'}</span>
                                                    </div>
                                                    <input 
                                                        type="range" min="0" max="1" step="0.05" 
                                                        value={c.technical_complexity ?? 0.5}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value);
                                                            setEditedTopology(prev => ({
                                                                ...prev,
                                                                components: prev.components.map(comp => comp.id === c.id ? { ...comp, technical_complexity: val } : comp)
                                                            }));
                                                        }}
                                                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[9px] text-slate-500 uppercase">Operational (Deploy)</span>
                                                        <span className="text-[10px] text-slate-700 font-semibold">{c.operational_complexity?.toFixed(2) || '0.50'}</span>
                                                    </div>
                                                    <input 
                                                        type="range" min="0" max="1" step="0.05" 
                                                        value={c.operational_complexity ?? 0.5}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value);
                                                            setEditedTopology(prev => ({
                                                                ...prev,
                                                                components: prev.components.map(comp => comp.id === c.id ? { ...comp, operational_complexity: val } : comp)
                                                            }));
                                                        }}
                                                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[9px] text-slate-500 uppercase">Compliance (PII)</span>
                                                        <span className="text-[10px] text-slate-700 font-semibold">{c.compliance_risk?.toFixed(2) || '0.50'}</span>
                                                    </div>
                                                    <input 
                                                        type="range" min="0" max="1" step="0.05" 
                                                        value={c.compliance_risk ?? 0.5}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value);
                                                            setEditedTopology(prev => ({
                                                                ...prev,
                                                                components: prev.components.map(comp => comp.id === c.id ? { ...comp, compliance_risk: val } : comp)
                                                            }));
                                                        }}
                                                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                        
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white shrink-0 flex gap-2 flex-col">
                            <Button 
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold" 
                                onClick={handleRunSimulation}
                                disabled={status === 'simulating'}
                            >
                                {status === 'simulating' ? (
                                    <span className="flex items-center gap-2">
                                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                        Simulating...
                                    </span>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4 mr-2" />
                                        Recalculate Simulation
                                    </>
                                )}
                            </Button>
                            <Button 
                                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold" 
                                onClick={handleAutoSolve}
                                disabled={status === 'simulating'}
                            >
                                {status === 'simulating' ? (
                                    <span className="flex items-center gap-2">
                                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                        Solving...
                                    </span>
                                ) : (
                                    <>
                                        <Wand2 className="w-4 h-4 mr-2" />
                                        Auto-Solve Constraints
                                    </>
                                )}
                            </Button>
                        </div>
                    </Tabs>
                </div>

                {/* Right Panel: Main View & Dashboards */}
                <div className="flex-1 flex flex-col overflow-hidden pointer-events-auto bg-slate-50 dark:bg-slate-900">
                    
                    {/* Main Topology View */}
                    <div className="flex-1 flex flex-col border-b border-slate-200 dark:border-slate-800 relative">
                        <div className="absolute top-4 right-4 z-[2000] flex gap-2">
                            <Button 
                                variant={viewMode === 'topology' ? 'default' : 'outline'} 
                                size="sm" className="h-8 text-xs shadow-sm"
                                onClick={() => setViewMode('topology')}
                            >
                                <Workflow className="w-3 h-3 mr-2" /> Topology
                            </Button>
                            <Button 
                                variant={viewMode === 'gantt' ? 'default' : 'outline'} 
                                size="sm" className="h-8 text-xs shadow-sm bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                                onClick={() => setViewMode('gantt')}
                            >
                                <Calendar className="w-3 h-3 mr-2" /> Gantt Chart
                            </Button>
                        </div>
                        
                        {viewMode === 'topology' ? (
                            <ReactFlowProvider>
                                <ReactFlow
                                    nodes={nodes}
                                    edges={edges}
                                    onNodesChange={onNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    connectionMode={ConnectionMode.Loose}
                                    fitView
                                    fitViewOptions={{ padding: 0.2, duration: 800 }}
                                    className="bg-slate-50 nodrag nopan"
                                    preventScrolling={false}
                                    zoomOnScroll={false}
                                    panOnScroll={false}
                                >
                                    <Background color="#e2e8f0" gap={16} />
                                    <Controls className="bg-white shadow-md border-slate-200" />
                                </ReactFlow>
                            </ReactFlowProvider>
                        ) : (
                            <div className="w-full h-full p-8 flex flex-col overflow-y-auto bg-slate-50">
                                <h3 className="font-bold mb-4">Gantt & Parallel Execution Trace</h3>
                                <div className="relative h-8 mb-2 shrink-0 border-b border-slate-200">
                                    <div className="absolute left-[200px] w-[60%] flex justify-between text-xs text-slate-500 font-semibold">
                                        <span>W01</span><span>W12</span><span>W24</span><span>W36</span><span>W48</span>
                                    </div>
                                </div>
                                <div className="space-y-4 pt-2">
                                    {simDelta.schedule && simDelta.schedule.length > 0 ? (
                                        simDelta.schedule.map((task: any, i: number) => {
                                            const startPercent = (task.start_week / (simDelta.weeks || 48)) * 100;
                                            const widthPercent = ((task.end_week - task.start_week) / (simDelta.weeks || 48)) * 100;
                                            
                                            // Make sure we use the friendly component name
                                            const friendlyName = topologyReport.components.find((c: any) => 
                                                c.id.toLowerCase() === task.component_id?.toLowerCase() ||
                                                c.name.toLowerCase() === task.component_id?.toLowerCase() ||
                                                c.id.toLowerCase().includes(task.component_id?.toLowerCase())
                                            )?.name || task.component_id;

                                            return (
                                                <div key={i} className="flex items-center text-sm">
                                                    <div className="w-[200px] font-semibold text-slate-700 truncate pr-4 text-xs">{friendlyName}</div>
                                                    <div className="w-[60%] relative h-6 bg-slate-200/50 rounded-md overflow-hidden">
                                                        <div 
                                                            className={`absolute top-0 bottom-0 rounded-md text-white text-[10px] font-bold flex items-center px-2 shadow-sm ${task.is_bottleneck ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                                                            style={{ width: `${Math.max(widthPercent, 5)}%`, left: `${startPercent}%` }}
                                                        >
                                                            {task.is_bottleneck && <AlertTriangle className="w-3 h-3 mr-1" />}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-sm text-slate-500 italic mt-4">Run simulation to generate execution schedule...</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Impact Simulation & Comparison */}
                    <div className="h-72 shrink-0 bg-white dark:bg-slate-950 p-4 overflow-y-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-20">
                        <Tabs defaultValue="cumulative" className="w-full h-full flex flex-col">
                            <div className="flex justify-between items-start mb-4 shrink-0">
                                <div>
                                    <h3 className="font-bold text-sm tracking-wide text-slate-700 dark:text-slate-300 uppercase">Impact Simulation</h3>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Showing the simulated impact of your changes.</p>
                                </div>
                                <TabsList className="h-8">
                                    <TabsTrigger value="cumulative" className="text-[10px] h-6 px-2">All Tabs (Cumulative)</TabsTrigger>
                                    <TabsTrigger value="topology" className="text-[10px] h-6 px-2">Topology Only</TabsTrigger>
                                    <TabsTrigger value="org" className="text-[10px] h-6 px-2">Org Only</TabsTrigger>
                                    <TabsTrigger value="strategy" className="text-[10px] h-6 px-2">Strategy Only</TabsTrigger>
                                    <TabsTrigger value="pnl" className="text-[10px] h-6 px-2">P&L Only</TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="cumulative" className="mt-0 flex-1 flex flex-col overflow-y-auto custom-scrollbar pr-2">
                                <div className="grid grid-cols-4 gap-4 mb-4 shrink-0">
                                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Time</div>
                                        <div className="flex flex-col gap-1 mt-1">
                                            <span className="text-xl font-bold leading-none">
                                                {simDelta.min_weeks && simDelta.max_weeks ? `${simDelta.min_weeks} - ${simDelta.max_weeks} wks` : `${simDelta.weeks} wks`}
                                            </span>
                                            {simDelta.min_weeks && <span className="text-[9px] text-slate-400 font-medium">85% Confidence Interval</span>}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Budget</div>
                                        <div className="flex flex-col gap-1 mt-1">
                                            <span className="text-xl font-bold leading-none">
                                                {simDelta.min_cost && simDelta.max_cost ? 
                                                    `$${simDelta.min_cost >= 1000 ? (simDelta.min_cost/1000).toFixed(0) : simDelta.min_cost}k - $${simDelta.max_cost >= 1000 ? (simDelta.max_cost/1000).toFixed(0) : simDelta.max_cost}k` : 
                                                    `$${simDelta.cost >= 1000 ? (simDelta.cost/1000).toFixed(1) + 'k' : simDelta.cost}`
                                                }
                                            </span>
                                            {simDelta.min_cost && <span className="text-[9px] text-slate-400 font-medium">85% Confidence Interval</span>}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Risk Index</div>
                                        <div className="flex items-end gap-2">
                                            <span className="text-xl font-bold">{simDelta.risk.split(' ')[0]}</span>
                                            <span className="text-xs text-slate-500 mb-1">{simDelta.risk.split(' ')[1]}</span>
                                        </div>
                                    </div>
                                    <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg">
                                        <div className="text-[10px] text-rose-500 uppercase font-bold tracking-wider">Critical Bottleneck</div>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="flex items-end gap-2 mt-1 cursor-help">
                                                        <span className="text-sm font-bold text-rose-700 truncate block max-w-full">{simDelta.bottleneck}</span>
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="max-w-xs text-xs z-[3000]">
                                                    {simDelta.bottleneck}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                </div>

                                {/* Actionable Recommendations AI Copilot */}
                                <div className="flex gap-4 shrink-0 mt-2">
                                    <div className="flex-1 bg-indigo-50/50 border border-indigo-100 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Wand2 className="w-4 h-4 text-indigo-600" />
                                            <span className="font-bold text-xs text-indigo-900 uppercase tracking-wide">Metric Justification</span>
                                        </div>
                                        <div className="text-xs text-slate-700 bg-white p-2 border border-indigo-100 rounded">
                                            <div>{simDelta.justification_of_metrics || 'No justification available.'}</div>
                                            {renderAssumptions(simDelta.assumptions)}
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-indigo-50/50 border border-indigo-100 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Wand2 className="w-4 h-4 text-indigo-600" />
                                            <span className="font-bold text-xs text-indigo-900 uppercase tracking-wide">Bottleneck Analysis</span>
                                        </div>
                                        <div className="text-xs text-slate-700 bg-white p-2 border border-indigo-100 rounded">
                                            {simDelta.bottleneck_citation || 'No AI insights available yet.'}
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                            
                            <TabsContent value="topology" className="mt-0 flex-1">
                                <IsolatedImpactView impact={simDelta.isolated_impacts?.topology} />
                            </TabsContent>
                            <TabsContent value="org" className="mt-0 flex-1">
                                <IsolatedImpactView impact={simDelta.isolated_impacts?.org} />
                            </TabsContent>
                            <TabsContent value="strategy" className="mt-0 flex-1">
                                <IsolatedImpactView impact={simDelta.isolated_impacts?.strategy} />
                            </TabsContent>
                            <TabsContent value="pnl" className="mt-0 flex-1">
                                <IsolatedImpactView impact={simDelta.isolated_impacts?.pnl} />
                            </TabsContent>
                        </Tabs>
                    </div>

                </div>
            </div>
        </div>
    );
}

// Dummy icon to fulfill the visual reference from mock
function Wand2(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M15 4V2" />
            <path d="M15 16v-2" />
            <path d="M8 9h2" />
            <path d="M20 9h2" />
            <path d="M17.8 11.8L19 13" />
            <path d="M15 9h.01" />
            <path d="M17.8 6.2L19 5" />
            <path d="M3 21l9-9" />
            <path d="M12.2 6.2L11 5" />
        </svg>
    )
}
