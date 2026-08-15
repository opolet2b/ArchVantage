import React, { useState, useCallback, useEffect } from 'react';
import { 
    FileText, Play, Settings, Activity, MessageSquare, Send, Save, BarChart2, 
    GitBranch, Workflow, Calendar, Users, DollarSign, Layers, Plus, 
    AlertTriangle, ArrowRight, CheckCircle2, Zap
} from 'lucide-react';
import { useCanvasStore, CanvasThing, CanvasLink } from '../canvas-store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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

interface ScenarioSimulatorViewerProps {
    thing: CanvasThing;
    links?: CanvasLink[];
}

const initialNodes: Node[] = [
    { id: 'sis', position: { x: 50, y: 50 }, data: { label: 'SIS II' }, style: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, width: 120 } },
    { id: 'vis', position: { x: 50, y: 120 }, data: { label: 'VIS' }, style: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, width: 120 } },
    { id: 'eurodac', position: { x: 50, y: 190 }, data: { label: 'Eurodac' }, style: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, width: 120 } },
    { id: 'integration', position: { x: 250, y: 120 }, data: { label: 'Integration Layer\n(Strangler Fig)' }, style: { background: '#e0e7ff', border: '2px solid #6366f1', borderRadius: 8, padding: 10, width: 150, textAlign: 'center' } },
    { id: 'esp', position: { x: 500, y: 80 }, data: { label: 'ESP' }, style: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, width: 120 } },
    { id: 'sbms', position: { x: 500, y: 160 }, data: { label: 'sBMS' }, style: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, width: 120 } },
];

const initialEdges: Edge[] = [
    { id: 'e1', source: 'sis', target: 'integration', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8' } },
    { id: 'e2', source: 'vis', target: 'integration', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8' } },
    { id: 'e3', source: 'eurodac', target: 'integration', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8' } },
    { id: 'e4', source: 'integration', target: 'esp', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }, style: { stroke: '#6366f1' } },
    { id: 'e5', source: 'integration', target: 'sbms', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }, style: { stroke: '#6366f1' } },
];

export function ScenarioSimulatorViewer({ thing, links = [] }: ScenarioSimulatorViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    const accessLevel = useCanvasStore(state => state.accessLevel);
    const things = useCanvasStore(state => state.things);
    const isReadOnly = accessLevel === "read";
    
    // Core states
    const [scenarios, setScenarios] = useState<any[]>(thing.content?.scenarios || [
        { id: 's1', name: 'Hybrid ACL Decoupled', baseline: true, result: { total_weeks: 86, total_cost: 920000, risk_index: 0.62 } },
    ]);
    const [activeScenarioId, setActiveScenarioId] = useState<string>('s1');
    const [viewMode, setViewMode] = useState<'topology' | 'gantt'>('topology');

    // Builder states
    const [targetComponent, setTargetComponent] = useState('integration');
    const [migrationPattern, setMigrationPattern] = useState('strangler_fig');
    const [protocol, setProtocol] = useState('event_hub');
    const [teamAssignee, setTeamAssignee] = useState('platform_a');
    const [dualRun, setDualRun] = useState(true);
    const [zeroDowntime, setZeroDowntime] = useState(false);
    const [maxBudget, setMaxBudget] = useState("1000000");

    // Simulation outcome (mocked delta)
    const [simDelta, setSimDelta] = useState<any>({
        weeks: -38,
        cost: -240000,
        risk: '0.38 (Medium)',
        bottleneck: 'ESP Validation (W24)'
    });

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    const handleRunSimulation = () => {
        // Trigger simulated recalculation
        setSimDelta({
            weeks: Math.floor(Math.random() * -40),
            cost: Math.floor(Math.random() * -300000),
            risk: '0.25 (Low)',
            bottleneck: 'Downstream Consumers (W18)'
        });
        
        // Example: dynamically update node style based on pattern selection
        setNodes((nds) => nds.map((node) => {
            if (node.id === 'integration') {
                return {
                    ...node,
                    data: { ...node.data, label: `Integration Layer\n(${migrationPattern.replace('_', ' ').toUpperCase()})` },
                    style: { ...node.style, background: migrationPattern === 'strangler_fig' ? '#e0e7ff' : '#dcfce7', borderColor: migrationPattern === 'strangler_fig' ? '#6366f1' : '#22c55e' }
                };
            }
            return node;
        }));
    };

    const handleBranchScenario = () => {
        const newId = `s${scenarios.length + 1}`;
        setScenarios([...scenarios, {
            id: newId,
            name: `Scenario ${scenarios.length + 1}`,
            baseline: false,
            result: { total_weeks: 48, total_cost: 680000, risk_index: 0.38 }
        }]);
        setActiveScenarioId(newId);
    };

    return (
        <div className="flex flex-col w-full h-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
            {/* Top Toolbar */}
            <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="font-bold text-sm bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-md flex items-center gap-2 border border-slate-200 dark:border-slate-700">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        Project: eu-LISA Core Modernization
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <Label className="text-xs text-slate-500 font-semibold uppercase">Active Scenario:</Label>
                        <Select value={activeScenarioId} onValueChange={setActiveScenarioId}>
                            <SelectTrigger className="h-8 w-64 text-xs font-semibold bg-indigo-50 border-indigo-200 text-indigo-900">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {scenarios.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name} {s.baseline && '(Baseline)'}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                
                <Button variant="outline" size="sm" className="h-8 text-xs font-semibold" onClick={handleBranchScenario}>
                    <GitBranch className="w-4 h-4 mr-2" />
                    Branch Scenario
                </Button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel: Scenario Builder Tabs */}
                <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 pointer-events-auto z-10 shadow-sm relative">
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <h3 className="font-bold text-sm tracking-wide text-slate-700 dark:text-slate-300">SCENARIO BUILDER</h3>
                    </div>
                    
                    <Tabs defaultValue="topology" className="flex-1 flex flex-col h-full overflow-hidden">
                        <TabsList className="w-full justify-start rounded-none border-b border-slate-100 dark:border-slate-800 bg-transparent p-0 h-10 shrink-0">
                            <TabsTrigger value="topology" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:shadow-none text-xs h-full">Topology</TabsTrigger>
                            <TabsTrigger value="org" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:shadow-none text-xs h-full">Org</TabsTrigger>
                            <TabsTrigger value="strategy" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:shadow-none text-xs h-full">Strategy</TabsTrigger>
                            <TabsTrigger value="pnl" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:shadow-none text-xs h-full">P&L</TabsTrigger>
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
                                            <Label className="text-xs text-slate-500">Target Component</Label>
                                            <Select value={targetComponent} onValueChange={setTargetComponent}>
                                                <SelectTrigger className="h-8 mt-1 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="integration">Integration Layer</SelectItem>
                                                    <SelectItem value="eurodac">Eurodac Core</SelectItem>
                                                    <SelectItem value="esp">ESP Engine</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Migration Pattern</Label>
                                            <Select value={migrationPattern} onValueChange={setMigrationPattern}>
                                                <SelectTrigger className="h-8 mt-1 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="strangler_fig">Strangler Fig (ACL)</SelectItem>
                                                    <SelectItem value="point_to_point">Direct Point-to-Point Modernization</SelectItem>
                                                    <SelectItem value="facade">Retain & Wrap (Façade)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Interface Protocols</Label>
                                            <Select value={protocol} onValueChange={setProtocol}>
                                                <SelectTrigger className="h-8 mt-1 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="event_hub">Sync -&gt; Async Event Hub (Kafka)</SelectItem>
                                                    <SelectItem value="direct_rpc">Direct Synch RPC</SelectItem>
                                                    <SelectItem value="outbox">Transactional Outbox</SelectItem>
                                                </SelectContent>
                                            </Select>
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
                                                <SelectContent>
                                                    <SelectItem value="platform_a">Platform Squad A</SelectItem>
                                                    <SelectItem value="core_cbs">Core CBS Squad</SelectItem>
                                                    <SelectItem value="external">External Contractor Squad</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        
                                        <div className="bg-slate-50 p-3 rounded-md border border-slate-200 mt-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-xs font-semibold">Skill Match Validation</span>
                                                <span className="text-xs font-bold text-emerald-600">85% Match</span>
                                            </div>
                                            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                                                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '85%' }}></div>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-2">Team possesses strong Cloud-Native/Kafka skills, mitigating Integration Layer debt.</p>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="strategy" className="mt-0 space-y-4">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">3</div>
                                        <h4 className="font-bold text-sm">Sequence Overrides</h4>
                                    </div>
                                    
                                    <div className="space-y-4 pl-8">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox id="dual-run" checked={dualRun} onCheckedChange={(checked) => setDualRun(!!checked)} />
                                            <label htmlFor="dual-run" className="text-xs font-medium leading-none">Enable Dual-Run Replication</label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox id="zero-downtime" checked={zeroDowntime} onCheckedChange={(checked) => setZeroDowntime(!!checked)} />
                                            <label htmlFor="zero-downtime" className="text-xs font-medium leading-none">Require Zero-Downtime Cutover</label>
                                        </div>
                                        
                                        <div className="bg-amber-50 p-3 rounded-md border border-amber-200 mt-4">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                                <p className="text-[10px] text-amber-800">Enabling Dual-Run adds 4-week overhead upfront but frees 3 downstream components to be built in parallel.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="pnl" className="mt-0 space-y-4">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">4</div>
                                        <h4 className="font-bold text-sm">Financial Constraints</h4>
                                    </div>
                                    
                                    <div className="space-y-3 pl-8">
                                        <div>
                                            <Label className="text-xs text-slate-500">CapEx Cap ($)</Label>
                                            <Input type="number" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} className="h-8 text-xs mt-1" />
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                        
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white shrink-0">
                            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold" onClick={handleRunSimulation}>
                                <Zap className="w-4 h-4 mr-2" />
                                Recalculate Simulation
                            </Button>
                        </div>
                    </Tabs>
                </div>

                {/* Right Panel: Main View & Dashboards */}
                <div className="flex-1 flex flex-col overflow-hidden pointer-events-auto bg-slate-50 dark:bg-slate-900">
                    
                    {/* Main Topology View */}
                    <div className="flex-1 flex flex-col border-b border-slate-200 dark:border-slate-800 relative">
                        <div className="absolute top-4 right-4 z-10 flex gap-2">
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
                                <Calendar className="w-3 h-3 mr-2" /> Exec DAG
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
                            <div className="w-full h-full p-8 flex flex-col overflow-y-auto">
                                <h3 className="font-bold mb-4">Gantt & Parallel Execution Trace</h3>
                                <div className="relative h-8 mb-2 shrink-0 border-b border-slate-200">
                                    <div className="absolute left-[150px] w-[70%] flex justify-between text-xs text-slate-500 font-semibold">
                                        <span>W01</span><span>W12</span><span>W24</span><span>W36</span><span>W48</span>
                                    </div>
                                </div>
                                <div className="space-y-4 pt-2">
                                    <div className="flex items-center text-sm">
                                        <div className="w-[150px] font-semibold text-slate-700">ACL Setup</div>
                                        <div className="h-6 bg-indigo-500 rounded-md text-white text-[10px] font-bold flex items-center px-2" style={{ width: '25%', marginLeft: '0%' }}>====&gt;</div>
                                    </div>
                                    <div className="flex items-center text-sm">
                                        <div className="w-[150px] font-semibold text-slate-700">Core Ingestion</div>
                                        <div className="h-6 bg-emerald-500 rounded-md text-white text-[10px] font-bold flex items-center px-2" style={{ width: '40%', marginLeft: '15%' }}>========&gt;</div>
                                    </div>
                                    <div className="flex items-center text-sm">
                                        <div className="w-[150px] font-semibold text-slate-700">Downstream Cons.</div>
                                        <div className="h-6 bg-sky-500 rounded-md text-white text-[10px] font-bold flex items-center px-2" style={{ width: '30%', marginLeft: '45%' }}>======&gt;</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Impact Simulation & Comparison */}
                    <div className="h-64 shrink-0 bg-white dark:bg-slate-950 p-4 overflow-y-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-20">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-sm tracking-wide text-slate-700 dark:text-slate-300 uppercase">Impact Simulation (Active vs. Baseline)</h3>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-4 mb-4">
                            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Time</div>
                                <div className="flex items-end gap-2">
                                    <span className="text-xl font-bold">48 wks</span>
                                    <span className="text-xs font-bold text-emerald-600 mb-1">({simDelta.weeks} wks)</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Budget</div>
                                <div className="flex items-end gap-2">
                                    <span className="text-xl font-bold">$680k</span>
                                    <span className="text-xs font-bold text-emerald-600 mb-1">({simDelta.cost < 0 ? '-' : '+'}${Math.abs(simDelta.cost/1000)}k)</span>
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
                                <div className="flex items-end gap-2 mt-1">
                                    <span className="text-sm font-bold text-rose-700 truncate">{simDelta.bottleneck}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actionable Recommendations AI Copilot */}
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Wand2 className="w-4 h-4 text-indigo-600" />
                                <span className="font-bold text-xs text-indigo-900 uppercase tracking-wide">AI Recommendations</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Button variant="outline" className="h-auto py-2 px-3 justify-start bg-white hover:bg-indigo-50 border-indigo-200 flex-col items-start text-left" onClick={() => {setMigrationPattern('strangler_fig'); handleRunSimulation();}}>
                                    <span className="text-xs font-bold text-indigo-700 flex items-center gap-1 mb-1">
                                        Apply Strangler Fig pattern to decouple downstream services <ArrowRight className="w-3 h-3" />
                                    </span>
                                    <span className="text-[10px] text-slate-500">(-22 weeks, +$60k initial CapEx)</span>
                                </Button>
                                <Button variant="outline" className="h-auto py-2 px-3 justify-start bg-white hover:bg-indigo-50 border-indigo-200 flex-col items-start text-left" onClick={() => {setTeamAssignee('external'); handleRunSimulation();}}>
                                    <span className="text-xs font-bold text-indigo-700 flex items-center gap-1 mb-1">
                                        Add 2 senior engineers to Integration Team in Phase 1 <ArrowRight className="w-3 h-3" />
                                    </span>
                                    <span className="text-[10px] text-slate-500">(unlock consumer tasks 6 weeks earlier)</span>
                                </Button>
                            </div>
                        </div>
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
