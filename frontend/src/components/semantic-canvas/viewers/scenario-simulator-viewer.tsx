import React, { useState } from 'react';
import { FileText, Play, Settings, Activity, MessageSquare, Send, Save, BarChart2 } from 'lucide-react';
import { useCanvasStore, CanvasThing, CanvasLink } from '../canvas-store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ScenarioSimulatorViewerProps {
    thing: CanvasThing;
    links?: CanvasLink[];
}

export function ScenarioSimulatorViewer({ thing, links = [] }: ScenarioSimulatorViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    const accessLevel = useCanvasStore(state => state.accessLevel);
    const things = useCanvasStore(state => state.things);
    const isReadOnly = accessLevel === "read";
    const selectedModel = useCanvasStore(state => state.selectedModel);

    const [status, setStatus] = useState<'idle' | 'ingesting' | 'simulating' | 'completed' | 'copilot_thinking'>(thing.content?.status || 'idle');
    const [report, setReport] = useState<any>(thing.content?.report || null);
    const [simResult, setSimResult] = useState<any>(thing.content?.simResult || null);
    
    const [constraints, setConstraints] = useState({
        max_budget: 1000000,
        max_timeline_weeks: 52,
        max_staff: 10,
        dynamic_rules: {} as Record<string, number>
    });

    const [chatInput, setChatInput] = useState("");
    const [chatHistory, setChatHistory] = useState<{role: 'user' | 'assistant', text: string}[]>(thing.content?.chatHistory || []);
    
    const [savedScenarios, setSavedScenarios] = useState<any[]>(thing.content?.savedScenarios || []);

    React.useEffect(() => {
        if (thing.content?.report !== undefined) {
            setReport(thing.content.report);
        }
        if (thing.content?.simResult !== undefined) {
            setSimResult(thing.content.simResult);
        }
        if (thing.content?.status !== undefined) {
            setStatus(thing.content.status);
        }
        if (thing.content?.savedScenarios !== undefined) {
            setSavedScenarios(thing.content.savedScenarios);
        }
    }, [thing.content?.report, thing.content?.simResult, thing.content?.status, thing.content?.savedScenarios]);

    // Compute linked documents dynamically from links pointing to/from this tool
    const linkedThings = links
        .filter(link => link.source_id === thing.id || link.target_id === thing.id)
        .map(link => {
            const linkedId = link.source_id === thing.id ? link.target_id : link.source_id;
            return things.find(t => t.id === linkedId);
        })
        .filter((t): t is CanvasThing => t !== undefined && t.type === 'document');

    const runIngestion = async () => {
        setStatus('ingesting');
        updateThing(thing.id, { content: { ...thing.content, status: 'ingesting' } });
        
        const docIds = linkedThings.map(d => d.id);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/scenario_simulator/ingest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_ids: docIds,
                    llm_preset: selectedModel || 'default'
                })
            });
            if (!res.ok) throw new Error("API Request Failed");
            const data = await res.json();
            setReport(data.report);
            setStatus('completed');
            // Auto-populate dynamic rules if not already present
            const updatedConstraints = { ...constraints };
            if (data.report?.extracted_variables?.length > 0) {
                data.report.extracted_variables.forEach((v: any) => {
                    if (updatedConstraints.dynamic_rules[v.name] === undefined) {
                        updatedConstraints.dynamic_rules[v.name] = v.value;
                    }
                });
            }
            setConstraints(updatedConstraints);
            
            updateThing(thing.id, {
                content: {
                    ...thing.content,
                    report: data.report,
                    status: 'completed'
                }
            });
        } catch (error) {
            console.error("Ingestion Failed:", error);
            setStatus('idle');
            updateThing(thing.id, { content: { ...thing.content, status: 'idle' } });
            alert("Ingestion failed. See console for details.");
        }
    };

    const runSimulation = async (customConstraints?: any) => {
        if (!report) return;
        setStatus('simulating');
        updateThing(thing.id, { content: { ...thing.content, status: 'simulating' } });
        
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/scenario_simulator/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topology: report,
                    constraints: customConstraints || constraints,
                    llm_preset: selectedModel || 'default'
                })
            });
            if (!res.ok) throw new Error("Simulation Request Failed");
            const data = await res.json();
            setSimResult(data.result);
            setStatus('completed');
            
            updateThing(thing.id, {
                content: {
                    ...thing.content,
                    simResult: data.result,
                    status: 'completed'
                }
            });
        } catch (error) {
            console.error("Simulation Failed:", error);
            setStatus('completed');
            updateThing(thing.id, { content: { ...thing.content, status: 'completed' } });
            alert("Simulation failed. See console for details.");
        }
    };

    const runCopilot = async () => {
        if (!chatInput.trim()) return;
        
        const userText = chatInput;
        setChatInput("");
        const newHistory = [...chatHistory, { role: 'user' as const, text: userText }];
        setChatHistory(newHistory);
        setStatus('copilot_thinking');

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/scenario_simulator/copilot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_message: userText,
                    current_constraints: constraints,
                    llm_preset: selectedModel || 'default'
                })
            });
            if (!res.ok) throw new Error("Copilot Request Failed");
            const data = await res.json();
            
            const copilotRes = data.result;
            const updatedConstraints = copilotRes.updated_constraints;
            setConstraints(updatedConstraints);
            
            const updatedHistory = [...newHistory, { role: 'assistant' as const, text: copilotRes.assistant_reply }];
            setChatHistory(updatedHistory);
            
            updateThing(thing.id, {
                content: {
                    ...thing.content,
                    chatHistory: updatedHistory,
                    status: 'idle'
                }
            });

            // Automatically run simulation with new constraints
            await runSimulation(updatedConstraints);
            
        } catch (error) {
            console.error("Copilot Failed:", error);
            setStatus('completed');
            setChatHistory([...newHistory, { role: 'assistant' as const, text: "Sorry, I couldn't process that request right now." }]);
        }
    };

    const saveScenario = () => {
        if (!simResult) return;
        const newScenarios = [...savedScenarios, {
            id: Date.now().toString(),
            name: `Scenario ${savedScenarios.length + 1}`,
            constraints: { ...constraints },
            result: simResult
        }];
        setSavedScenarios(newScenarios);
        updateThing(thing.id, {
            content: {
                ...thing.content,
                savedScenarios: newScenarios
            }
        });
    };

    return (
        <div className="flex w-full h-full bg-slate-100 dark:bg-slate-950 relative overflow-hidden text-slate-900 dark:text-slate-100">
            {/* Left Panel: Configuration & Variables */}
            <div className="w-80 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col pointer-events-auto">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-bold">Scenario Simulator</h3>
                </div>
                
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                    {/* Linked Documents Section */}
                    <div className="mb-6">
                        <Label className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide block">
                            Architecture Documents
                        </Label>
                        <p className="text-xs text-slate-500 mb-3">
                            Connect ADRs and specs to this tool on the canvas.
                        </p>
                        
                        <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-950">
                            {linkedThings.length === 0 ? (
                                <div className="p-3 text-xs text-slate-400 text-center">No documents linked</div>
                            ) : (
                                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {linkedThings.map(doc => (
                                        <li key={doc.id} className="p-2 flex items-center gap-2 text-xs">
                                            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span className="truncate">{doc.title || doc.id}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Extracted Variables Context */}
                    {report?.extracted_variables?.length > 0 && (
                        <div className="mb-6">
                            <Label className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide block">
                                Document Variables
                            </Label>
                            <div className="space-y-3">
                                {report.extracted_variables.map((v: any, i: number) => (
                                    <div key={i} className="bg-slate-50 dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                                        <Label className="text-xs">{v.name} ({v.unit})</Label>
                                        <Input 
                                            type="number" 
                                            value={constraints.dynamic_rules[v.name] ?? v.value}
                                            onChange={(e) => setConstraints({
                                                ...constraints, 
                                                dynamic_rules: {
                                                    ...constraints.dynamic_rules, 
                                                    [v.name]: Number(e.target.value)
                                                }
                                            })}
                                            className="h-8 text-sm mt-1 mb-2"
                                        />
                                        <div className="text-[10px] text-slate-500 italic border-l-2 border-indigo-200 pl-1 mt-1">
                                            "{v.source_citation}"
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Variable Controls */}
                    <div className="mb-6">
                        <Label className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide block">
                            Parameters (What-If)
                        </Label>
                        
                        <div className="space-y-4 mt-4">
                            <div>
                                <Label className="text-xs">Max Budget ($)</Label>
                                <Input 
                                    type="number" 
                                    value={constraints.max_budget}
                                    onChange={(e) => setConstraints({...constraints, max_budget: Number(e.target.value)})}
                                    className="h-8 text-sm mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Max Timeline (Weeks)</Label>
                                <Input 
                                    type="number" 
                                    value={constraints.max_timeline_weeks}
                                    onChange={(e) => setConstraints({...constraints, max_timeline_weeks: Number(e.target.value)})}
                                    className="h-8 text-sm mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Max Concurrent Staff</Label>
                                <Input 
                                    type="number" 
                                    value={constraints.max_staff}
                                    onChange={(e) => setConstraints({...constraints, max_staff: Number(e.target.value)})}
                                    className="h-8 text-sm mt-1"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Copilot Chat Interface */}
                    {simResult && (
                        <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
                            <div className="flex items-center gap-2 mb-4">
                                <MessageSquare className="w-4 h-4 text-indigo-500" />
                                <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                                    AI Copilot
                                </Label>
                            </div>
                            
                            <div className="space-y-3 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                                {chatHistory.length === 0 ? (
                                    <div className="text-xs text-slate-400 italic">Ask me to modify constraints, e.g., "What if we double the security FTEs?"</div>
                                ) : (
                                    chatHistory.map((msg, i) => (
                                        <div key={i} className={`text-xs p-2 rounded ${msg.role === 'user' ? 'bg-indigo-50 text-indigo-900 ml-4' : 'bg-slate-50 text-slate-700 mr-4'} border border-slate-200 dark:border-slate-700`}>
                                            <span className="font-bold opacity-50 mr-1">{msg.role === 'user' ? 'You:' : 'AI:'}</span>
                                            {msg.text}
                                        </div>
                                    ))
                                )}
                                {status === 'copilot_thinking' && (
                                    <div className="text-xs p-2 bg-slate-50 text-slate-500 rounded border border-slate-200 mr-4 animate-pulse">
                                        Thinking...
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Input 
                                    className="h-8 text-xs" 
                                    placeholder="Try: Cut budget by 25%..."
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && runCopilot()}
                                    disabled={status === 'copilot_thinking' || status === 'simulating'}
                                />
                                <Button size="sm" className="h-8 w-8 p-0" onClick={runCopilot} disabled={status === 'copilot_thinking' || status === 'simulating' || !chatInput.trim()}>
                                    <Send className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    {report && (
                        <Button 
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={isReadOnly || status === 'simulating'}
                            onClick={() => runSimulation()}
                        >
                            {status === 'simulating' ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                    Simulating...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Play className="w-4 h-4" />
                                    Run Simulation
                                </span>
                            )}
                        </Button>
                    )}
                    <Button 
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                        disabled={isReadOnly || status === 'ingesting' || linkedThings.length === 0}
                        onClick={runIngestion}
                    >
                        {status === 'ingesting' ? (
                            <span className="flex items-center gap-2">
                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                Parsing Documents...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Play className="w-4 h-4" />
                                Run Ingestion
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            {/* Right Panel: Visualization Dashboard */}
            <div className="flex-1 h-full flex items-center justify-center relative p-8">
                {status === 'idle' && (
                    <div className="text-center max-w-md">
                        <Activity className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h2 className="text-lg font-medium mb-2">Ready to Simulate</h2>
                        <p className="text-sm text-slate-500">
                            Link architecture documents to this tool and run ingestion to parse components and dependencies.
                        </p>
                    </div>
                )}
                
                {status === 'ingesting' && (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-500 mx-auto mb-4"></div>
                        <p className="text-slate-600 font-medium">Extracting components and topology via LangGraph...</p>
                    </div>
                )}

                {status === 'simulating' && (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-emerald-500 mx-auto mb-4"></div>
                        <p className="text-slate-600 font-medium">Constraint Solver is evaluating pathways...</p>
                    </div>
                )}

                {status === 'completed' && (
                    <div className="w-full h-full flex flex-col pointer-events-auto overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-4 shrink-0">
                            <h2 className="text-xl font-bold">Simulation Results</h2>
                            <div className="flex gap-2">
                                {simResult && (
                                    <>
                                        <div className={`px-3 py-1 rounded-md text-sm font-bold ${simResult.is_viable ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                            {simResult.is_viable ? 'VIABLE' : 'NOT VIABLE'}
                                        </div>
                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveScenario}>
                                            <Save className="w-3 h-3 mr-1" /> Save
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                        
                        {!simResult ? (
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm p-6 mb-4">
                                <h3 className="text-sm font-bold text-slate-500 mb-2">EXTRACTED TOPOLOGY RAW</h3>
                                <pre className="text-xs overflow-auto max-h-60">
                                    {JSON.stringify(report, null, 2)}
                                </pre>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 p-4 rounded-lg">
                                        <div className="text-xs text-slate-500 uppercase">Total Weeks</div>
                                        <div className="text-2xl font-bold">{simResult.total_weeks}</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 p-4 rounded-lg">
                                        <div className="text-xs text-slate-500 uppercase">Total Cost</div>
                                        <div className="text-2xl font-bold">${simResult.total_cost?.toLocaleString()}</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 border border-rose-200 p-4 rounded-lg">
                                        <div className="text-xs text-rose-500 uppercase">Bottleneck Analysis</div>
                                        <div className="text-sm font-medium text-slate-700">{simResult.bottleneck_analysis}</div>
                                        {simResult.bottleneck_citation && (
                                            <div className="text-[10px] text-slate-500 italic mt-2 border-t pt-2 border-rose-100">
                                                Source: {simResult.bottleneck_citation}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-slate-900 border border-slate-200 rounded-lg p-6 h-[400px] flex flex-col shrink-0">
                                    <h3 className="text-md font-bold mb-4 border-b pb-2 shrink-0">Schedule (Gantt) & Heatmap</h3>
                                    
                                    <div className="relative h-6 mb-2 shrink-0">
                                        <div className="absolute left-[130px] w-[70%] flex justify-between text-[10px] text-slate-400 font-semibold border-b pb-1">
                                            <span>W1</span>
                                            <span>W{Math.max(Math.floor(simResult.total_weeks / 4), 1)}</span>
                                            <span>W{Math.max(Math.floor(simResult.total_weeks / 2), 1)}</span>
                                            <span>W{Math.max(Math.floor((simResult.total_weeks / 4) * 3), 1)}</span>
                                            <span>W{simResult.total_weeks}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-3 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                                        {simResult.schedule?.map((item: any) => {
                                            const width = ((item.end_week - item.start_week + 1) / Math.max(simResult.total_weeks, 1)) * 100;
                                            const left = (item.start_week / Math.max(simResult.total_weeks, 1)) * 100;
                                            
                                            // Heatmap color based on bottleneck and staff
                                            const bgColor = item.is_bottleneck ? 'bg-rose-500' : 'bg-indigo-500';
                                            
                                            return (
                                                <div key={item.component_id} className="relative h-10 bg-slate-50 rounded-md border flex items-center group/item">
                                                    <div className="absolute left-2 text-xs font-semibold z-10 text-slate-700 w-32 truncate cursor-help">
                                                        {item.component_id}
                                                    </div>
                                                    
                                                    {/* Custom Tooltip */}
                                                    <div className="absolute left-2 top-8 z-50 hidden group-hover/item:block bg-slate-800 text-white text-xs p-1.5 rounded shadow-lg whitespace-nowrap">
                                                        {item.component_id}
                                                    </div>

                                                    <div className="absolute inset-y-1 rounded-md opacity-80 transition-all duration-300 group-hover/item:opacity-100" style={{ left: `calc(130px + ${left * 0.7}%)`, width: `${width * 0.7}%` }}>
                                                        <div className={`h-full w-full ${bgColor} rounded flex items-center px-2 shadow-sm`}>
                                                            <span className="text-[10px] text-white font-bold">{item.assigned_staff} staff</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                
                                {/* Advanced Analytics & Pathway Comparison */}
                                <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 rounded-lg p-6 shrink-0">
                                    <div className="flex items-center gap-2 mb-4 border-b pb-2">
                                        <BarChart2 className="w-5 h-5 text-indigo-500" />
                                        <h3 className="text-md font-bold">Analytics & Pathway Comparison</h3>
                                    </div>
                                    
                                    {savedScenarios.length > 0 && (
                                        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
                                            {savedScenarios.map(s => (
                                                <div key={s.id} className="min-w-[200px] border border-slate-200 rounded-md p-3 bg-slate-50">
                                                    <div className="font-bold text-sm mb-1">{s.name}</div>
                                                    <div className="text-xs text-slate-500">{s.result.total_weeks} weeks, ${s.result.total_cost.toLocaleString()}</div>
                                                    <div className="text-[10px] mt-1 text-slate-400">Budget: ${s.constraints.max_budget.toLocaleString()}</div>
                                                </div>
                                            ))}
                                            <div className="min-w-[200px] border-2 border-indigo-500 rounded-md p-3 bg-indigo-50">
                                                <div className="font-bold text-sm mb-1 text-indigo-900">Current Pathway</div>
                                                <div className="text-xs text-indigo-700">{simResult.total_weeks} weeks, ${simResult.total_cost.toLocaleString()}</div>
                                                <div className="text-[10px] mt-1 text-indigo-400">Budget: ${constraints.max_budget.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <h4 className="text-xs font-semibold text-slate-500 mb-3 uppercase">Cumulative Risk Profile</h4>
                                            <div className="h-32 flex items-end gap-1">
                                                {simResult.monthly_risk_indices?.map((risk: number, i: number) => (
                                                    <div key={i} className="flex-1 h-full flex flex-col justify-end group relative">
                                                        <div className="text-[8px] absolute -top-4 opacity-0 group-hover:opacity-100 transition-opacity w-full text-center">{risk.toFixed(2)}</div>
                                                        <div className={`w-full rounded-t-sm transition-all ${risk > 0.7 ? 'bg-rose-500' : risk > 0.4 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{height: `${Math.max(risk * 100, 5)}%`}}></div>
                                                        <div className="text-[8px] text-center mt-1">M{i+1}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-semibold text-slate-500 mb-3 uppercase">Temporal Burn Rate ($)</h4>
                                            <div className="h-32 flex items-end gap-1">
                                                {simResult.monthly_burn_rate?.map((burn: number, i: number) => {
                                                    const maxBurn = Math.max(...(simResult.monthly_burn_rate || [1]));
                                                    const height = (burn / maxBurn) * 100;
                                                    return (
                                                        <div key={i} className="flex-1 h-full flex flex-col justify-end group relative">
                                                            <div className="text-[8px] absolute -top-4 opacity-0 group-hover:opacity-100 transition-opacity w-full text-center">${(burn/1000).toFixed(0)}k</div>
                                                            <div className="w-full bg-indigo-400 rounded-t-sm transition-all" style={{height: `${Math.max(height, 5)}%`}}></div>
                                                            <div className="text-[8px] text-center mt-1">M{i+1}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
