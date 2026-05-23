"use client";

import * as React from "react";
import { NodeProps, NodeResizer, useReactFlow, Handle, Position } from "reactflow";
import { 
    GitBranch, 
    Play, 
    Square, 
    Pause, 
    CheckCircle2, 
    XCircle, 
    AlertCircle, 
    ChevronDown, 
    ChevronUp, 
    FileText, 
    User, 
    Bot, 
    Lock, 
    Send,
    Loader2,
    Calendar,
    Settings,
    Activity
} from "lucide-react";
import { cn, API_URL } from "@/lib/utils";
import { useCanvasStore } from "../canvas-store";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormRenderer } from "@/components/tools/form-builder/form-renderer";

// =============================================================================
// Helper Component: Dynamic Form Renderer
// =============================================================================
function renderDynamicForm(
    guiSchema: any, 
    values: Record<string, any>, 
    onChange: (key: string, val: any) => void,
    disabled: boolean = false
) {
    if (!guiSchema) return null;

    // 1. Components List Format (from Form Tools builder configuration)
    if (Array.isArray(guiSchema.components)) {
        return (
            <FormRenderer
                widgets={guiSchema.components}
                layout={guiSchema.layout}
                value={values}
                onChange={onChange}
                readOnly={disabled}
            />
        );
    }

    // 2. Standard JSON Schema Format
    if (guiSchema.properties) {
        return (
            <div className="flex flex-col gap-3">
                {Object.entries(guiSchema.properties).map(([key, valObj]) => {
                    const prop = valObj as any;
                    const label = prop.title || key;
                    const required = Array.isArray(guiSchema.required) && guiSchema.required.includes(key);
                    const propType = prop.type;
                    const val = values[key] !== undefined ? values[key] : "";

                    return (
                        <div key={key} className="flex flex-col gap-1.5">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                {label} {required && <span className="text-rose-500">*</span>}
                            </Label>
                            {prop.enum ? (
                                <Select
                                    disabled={disabled}
                                    value={val}
                                    onValueChange={(v) => onChange(key, v)}
                                >
                                    <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 h-9 rounded-lg text-xs">
                                        <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">
                                        {prop.enum.map((opt: string) => (
                                            <SelectItem key={opt} value={opt} className="text-xs hover:bg-slate-100 dark:hover:bg-slate-800">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : propType === "boolean" ? (
                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer py-1">
                                    <input
                                        type="checkbox"
                                        disabled={disabled}
                                        checked={!!val}
                                        onChange={(e) => onChange(key, e.target.checked)}
                                        className="rounded border-slate-350 dark:border-slate-850 bg-white dark:bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    {label}
                                </label>
                            ) : propType === "string" && (key.includes("comment") || key.includes("note") || key.includes("desc")) ? (
                                <Textarea
                                    disabled={disabled}
                                    value={val}
                                    onChange={(e) => onChange(key, e.target.value)}
                                    className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-lg text-xs leading-normal resize-none min-h-[60px]"
                                    rows={2}
                                />
                            ) : (
                                <Input
                                    disabled={disabled}
                                    type={propType === "number" || propType === "integer" ? "number" : "text"}
                                    value={val}
                                    onChange={(e) => onChange(key, propType === "number" || propType === "integer" ? parseFloat(e.target.value) || 0 : e.target.value)}
                                    className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9 rounded-lg"
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    return null;
}

interface LogEntry {
    id: number;
    node_id: string;
    action_type: string;
    executed_by: string | null;
    timestamp: string;
    result_data: any;
}

export function WorkflowInstanceNode({ id, data, selected }: NodeProps) {
    const { thing, onDelete, onResizeEnd } = data;
    const { updateThing, accessLevel } = useCanvasStore();
    const { getEdges, getNodes } = useReactFlow();

    const isReadOnly = accessLevel === "VIEWER";
    const hasWritePermission = accessLevel === "OWNER" || accessLevel === "EDITOR";
    const { user } = useAuth();

    // Workflow parameters stored in thing content
    const templateId = thing.content?.template_id as string;
    const templateName = thing.content?.template_name as string || "Workflow";
    const templateDescription = thing.content?.template_description as string || "";
    const instanceId = thing.content?.instance_id as string | undefined;
    const status = (thing.content?.status as string) || "IDLE";
    const currentNodeIds = (thing.content?.current_node_ids as string[]) || [];

    // UI state
    const [logs, setLogs] = React.useState<LogEntry[]>([]);
    const [logsExpanded, setLogsExpanded] = React.useState(false);
    const [isStarting, setIsStarting] = React.useState(false);
    const [isResuming, setIsResuming] = React.useState(false);
    const [isAborting, setIsAborting] = React.useState(false);
    
    // User task form state
    const [activeUserTask, setActiveUserTask] = React.useState<any | null>(null);
    const [userFormValues, setUserFormValues] = React.useState<Record<string, any>>({});

    // SSE connection ref
    const eventSourceRef = React.useRef<EventSource | null>(null);

    // Load initial logs and active task if instance exists
    React.useEffect(() => {
        if (instanceId) {
            fetchInstanceStatus();
            setupSSE();
        }
        return () => {
            disconnectSSE();
        };
    }, [instanceId]);

    // Fetch full instance details (status, active tasks, audit logs)
    const fetchInstanceStatus = async () => {
        if (!instanceId) return;
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/workflows/instances/${instanceId}/status`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs || []);
                
                // If waiting on user, try to extract node details
                if (data.status === "WAITING") {
                    resolveActiveUserTask(data);
                } else {
                    setActiveUserTask(null);
                }

                // Update canvas thing status if different
                if (data.status !== status || JSON.stringify(data.current_node_ids) !== JSON.stringify(currentNodeIds)) {
                    updateThing(id, {
                        content: {
                            ...thing.content,
                            status: data.status,
                            current_node_ids: data.current_node_ids,
                            state_payload: data.state_payload
                        }
                    });
                }
            }
        } catch (err) {
            console.error("Failed to fetch workflow instance status:", err);
        }
    };

    // Determine target User Task details from current breakpoints and topology
    const resolveActiveUserTask = (instanceData: any) => {
        const activeNodeId = instanceData.current_node_ids?.[0];
        if (!activeNodeId) return;

        let guiSchema = instanceData.gui_schema || {
            type: "object",
            title: "Human Approval Required",
            properties: {
                approved: { type: "boolean", title: "Approve Progression" },
                comments: { type: "string", title: "Review Comments" }
            }
        };

        if (typeof guiSchema === "string") {
            try {
                guiSchema = JSON.parse(guiSchema);
            } catch (e) {
                console.error("Failed to parse gui_schema string", e);
            }
        }

        const laneAuth = instanceData.lane_authorization || {};

        setActiveUserTask({
            node_id: activeNodeId,
            label: guiSchema.title || "Verification Task",
            description: guiSchema.description || "Review automated analysis findings and approve progression.",
            gui_schema: guiSchema,
            lane_name: laneAuth.lane_name || "Reviewer Lane",
            allowed_roles: laneAuth.roles || ["Editor", "Admin"],
            allowed_users: laneAuth.users || []
        });
    };

    // Establishes a real-time SSE stream for tracing paths and logging actions
    const setupSSE = () => {
        if (!instanceId) return;
        disconnectSSE();

        try {
            const token = localStorage.getItem("token");
            // Standard SSE doesn't support custom headers, but we pass token as query or let browser use session
            // We use EventSource and the server routes authenticate using token query parameters or defaults
            const sseUrl = `${API_URL}/workflows/instances/${instanceId}/stream?token=${token}`;
            const es = new EventSource(sseUrl);
            eventSourceRef.current = es;

            es.onmessage = (event) => {
                try {
                    const eventData = JSON.parse(event.data);
                    console.log("[WorkflowNode] SSE Event:", eventData);
                    
                    const isLog = eventData.event === "log" || eventData.type === "log";
                    const isStatus = eventData.event === "status_change" || eventData.type === "status";

                    if (isLog) {
                        const logObj = eventData.data || eventData.log;
                        if (logObj) {
                            setLogs(prev => {
                                // Deduplicate
                                if (prev.some(l => l.id === logObj.id)) return prev;
                                return [...prev, logObj];
                            });
                        }
                    } else if (isStatus) {
                        const statusObj = eventData.data || eventData;
                        const newStatus = statusObj.status;
                        const activeNodes = statusObj.current_node_ids;
                        
                        updateThing(id, {
                            content: {
                                ...thing.content,
                                status: newStatus,
                                current_node_ids: activeNodes
                            }
                        });

                        if (newStatus === "WAITING") {
                            fetchInstanceStatus(); // refresh active user task fields
                        } else {
                            setActiveUserTask(null);
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse SSE payload:", e);
                }
            };

            es.onerror = (err) => {
                console.warn("[WorkflowNode] SSE disconnected or encountered error:", err);
                // Retry is handled automatically by EventSource
            };
        } catch (err) {
            console.error("Error creating EventSource:", err);
        }
    };

    const disconnectSSE = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
    };

    // Handle Starting from a connected Thing
    const handleStartFromLink = async () => {
        if (isReadOnly || isStarting || status === "RUNNING" || status === "WAITING") return;
        
        const edges = getEdges();
        const incomingEdges = edges.filter(e => e.target === id);
        
        if (incomingEdges.length === 0) {
            alert("Please connect a Thing (e.g. Document or Text) to the left handle of this workflow node first.");
            return;
        }
        
        const sourceNodeId = incomingEdges[0].source;
        const nodes = getNodes();
        const sourceNode = nodes.find(n => n.id === sourceNodeId);
        
        if (!sourceNode || !sourceNode.data?.thing?.id) {
            alert("Could not identify the connected Thing.");
            return;
        }
        
        const documentId = sourceNode.data.thing.id;
        
        // Initialize execution on backend
        await startWorkflowInstance(documentId);
    };

    const startWorkflowInstance = async (documentId: string) => {
        setIsStarting(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/workflows/instances/start`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    template_id: templateId,
                    canvas_id: thing.canvas_id,
                    initial_payload: {
                        document_id: documentId
                    }
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || "Failed to start workflow");
            }

            const data = await res.json();
            
            // Persist the started instance to the canvas thing content
            await updateThing(id, {
                content: {
                    ...thing.content,
                    instance_id: data.id,
                    status: data.status,
                    current_node_ids: data.current_node_ids
                }
            });

            // The useEffect will pick up the template id change and configure SSE
        } catch (err: any) {
            console.error("Error starting workflow instance:", err);
            alert(err.message || "Failed to start execution.");
        } finally {
            setIsStarting(false);
        }
    };

    // Resume a human-in-the-loop task breakpoint with Lane RBAC checks
    const handleResume = async (overrideFormValues?: Record<string, any>) => {
        if (!instanceId || isReadOnly) return;
        setIsResuming(true);
        try {
            const token = localStorage.getItem("token");
            const valuesToSubmit = overrideFormValues || userFormValues;
            const res = await fetch(`${API_URL}/workflows/instances/${instanceId}/resume`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    form_data: valuesToSubmit
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Verification failed or forbidden.");
            }

            const data = await res.json();
            
            // Success: update state
            updateThing(id, {
                content: {
                    ...thing.content,
                    status: data.status,
                    current_node_ids: data.current_node_ids
                }
            });
            
            setActiveUserTask(null);
            setUserFormValues({});
        } catch (err: any) {
            console.error("Error resuming workflow:", err);
            alert(err.message || "Verification submitted unsuccessfully.");
        } finally {
            setIsResuming(false);
        }
    };

    // Prematurely abort execution
    const handleAbort = async () => {
        if (!instanceId || isReadOnly) return;
        setIsAborting(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/workflows/instances/${instanceId}/abort`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error("Failed to abort workflow");
            }

            const data = await res.json();

            updateThing(id, {
                content: {
                    ...thing.content,
                    status: data.status,
                    current_node_ids: []
                }
            });
            setActiveUserTask(null);
        } catch (err: any) {
            console.error("Error aborting workflow:", err);
            alert(err.message);
        } finally {
            setIsAborting(false);
        }
    };

    // Identity Lane RBAC Verification Checks
    const checkLaneRBAC = () => {
        if (!user || !activeUserTask) return false;
        
        // 1. Check allowed user email boundaries
        if (activeUserTask.allowed_users && activeUserTask.allowed_users.length > 0) {
            if (activeUserTask.allowed_users.includes(user.email)) return true;
        }

        // 2. Check allowed roles
        if (activeUserTask.allowed_roles && activeUserTask.allowed_roles.length > 0 && user.roles) {
            const hasRole = user.roles.some((role: string) => activeUserTask.allowed_roles.includes(role));
            if (hasRole) return true;
        }

        // Default fallback: If empty arrays, let anyone write, else restrict
        const hasSpecificRestrictions = 
            (activeUserTask.allowed_users && activeUserTask.allowed_users.length > 0) ||
            (activeUserTask.allowed_roles && activeUserTask.allowed_roles.length > 0);

        return !hasSpecificRestrictions;
    };

    const hasTaskPermission = hasWritePermission && checkLaneRBAC();

    // Map current status to premium color schemes and icons
    const getStatusConfig = () => {
        switch (status) {
            case "IDLE":
                return {
                    color: "border-slate-200 dark:border-slate-800 bg-slate-50 text-slate-600 dark:text-slate-400",
                    glow: "",
                    label: "Idle Blueprint",
                    icon: <GitBranch className="h-4 w-4" />
                };
            case "RUNNING":
                return {
                    color: "border-purple-300 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400",
                    glow: "shadow-[0_0_15px_rgba(168,85,247,0.15)] animate-pulse",
                    label: "Executing",
                    icon: <Activity className="h-4 w-4 animate-spin" />
                };
            case "WAITING":
                return {
                    color: "border-amber-300 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400",
                    glow: "shadow-[0_0_15px_rgba(245,158,11,0.15)]",
                    label: "Awaiting Action",
                    icon: <Pause className="h-4 w-4" />
                };
            case "COMPLETED":
                return {
                    color: "border-emerald-300 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400",
                    glow: "shadow-[0_0_15px_rgba(16,185,129,0.1)]",
                    label: "Completed",
                    icon: <CheckCircle2 className="h-4 w-4" />
                };
            case "FAILED":
                return {
                    color: "border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400",
                    glow: "",
                    label: "Failed / Aborted",
                    icon: <XCircle className="h-4 w-4" />
                };
            default:
                return {
                    color: "border-slate-200 dark:border-slate-800 bg-slate-50 text-slate-600",
                    glow: "",
                    label: "Unknown",
                    icon: <AlertCircle className="h-4 w-4" />
                };
        }
    };

    const statusConfig = getStatusConfig();

    return (
        <div 
            className={cn(
                "rounded-2xl border-2 flex flex-col h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-xl transition-all duration-300 relative select-none",
                selected ? "border-purple-500 ring-2 ring-purple-200 dark:ring-purple-900/40" : "border-slate-200 dark:border-slate-800",
                statusConfig.glow
            )}
            style={{ width: "100%", height: "100%" }}
        >
            {/* Input Handle */}
            <Handle 
                type="target" 
                position={Position.Left} 
                className="w-3.5 h-3.5 bg-purple-500 border-2 border-white dark:border-slate-900 z-10" 
            />

            {/* Output Handle */}
            <Handle 
                type="source" 
                position={Position.Right} 
                className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 z-10" 
            />
            <NodeResizer 
                minWidth={420} 
                minHeight={360} 
                isVisible={selected && !isReadOnly} 
                onResizeEnd={onResizeEnd}
            />

            {/* Glowing top line accent for high aesthetics */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-t-2xl" />

            {/* Header section */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between shrink-0 mt-1">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 bg-purple-100 dark:bg-purple-950/40 rounded-lg text-purple-600 dark:text-purple-400 shrink-0">
                        <GitBranch className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate leading-snug">
                            {thing.title || templateName}
                        </h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-normal">
                            {templateDescription || "visual BPMN workflow engine"}
                        </p>
                    </div>
                </div>

                <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold leading-none shrink-0",
                    statusConfig.color
                )}>
                    {statusConfig.icon}
                    <span>{statusConfig.label}</span>
                </div>
            </div>

            {/* Main content body */}
            <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4 min-h-0">
                {status === "IDLE" && (
                    <div className="flex-1 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl transition-all duration-300 relative overflow-hidden group bg-slate-50/50 dark:bg-slate-950/50">
                        {isStarting ? (
                            <div className="flex flex-col items-center justify-center h-full space-y-3">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-500 mx-auto" />
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Initializing Graph Saver...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full p-4 gap-3 text-center">
                                <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                    <GitBranch className="h-6 w-6" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Link Input Thing</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[220px] leading-relaxed mb-3 mx-auto">
                                        Connect a <span className="text-purple-600 dark:text-purple-400 font-medium">Thing</span> to the left handle to inject parameters and begin automation.
                                    </p>
                                    <Button 
                                        onClick={handleStartFromLink}
                                        disabled={isStarting || isReadOnly}
                                        className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold gap-2"
                                    >
                                        <Play className="h-3.5 w-3.5" />
                                        Start Workflow
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {status !== "IDLE" && (
                    <div className="flex-1 flex flex-col min-h-0 gap-4">
                        {/* Process Step Timeline Mini-Map (LOD Horizontal Roadmap) */}
                        <div className="bg-slate-50/50 dark:bg-slate-950/30 border border-slate-100 dark:border-slate-800/80 rounded-xl p-3.5 shrink-0 flex items-center justify-between gap-2 overflow-x-auto">
                            {["Document Ingestion", "Agent Extraction", "Human Verification", "Complete"].map((stepLabel, idx, arr) => {
                                const isActive = 
                                    (idx === 0 && (status === "RUNNING" && currentNodeIds.includes("document_node"))) ||
                                    (idx === 1 && (status === "RUNNING" && currentNodeIds.some(n => n.includes("agent") || n.includes("service")))) ||
                                    (idx === 2 && status === "WAITING") ||
                                    (idx === 3 && status === "COMPLETED");

                                const isDone = 
                                    (idx === 0 && (status !== "IDLE" && !currentNodeIds.includes("document_node"))) ||
                                    (idx === 1 && (status === "WAITING" || status === "COMPLETED")) ||
                                    (idx === 2 && status === "COMPLETED");

                                return (
                                    <React.Fragment key={stepLabel}>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className={cn(
                                                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
                                                isActive && "bg-purple-600 text-white shadow-[0_0_8px_rgba(168,85,247,0.4)] scale-110",
                                                isDone && "bg-emerald-500 text-white",
                                                !isActive && !isDone && "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700"
                                            )}>
                                                {isDone ? <CheckCircle2 className="h-4.5 w-4.5" /> : idx + 1}
                                            </div>
                                            <span className={cn(
                                                "text-[10px] font-medium hidden sm:inline",
                                                isActive && "text-purple-600 dark:text-purple-400 font-bold",
                                                isDone && "text-emerald-600 dark:text-emerald-500",
                                                !isActive && !isDone && "text-slate-400 dark:text-slate-500"
                                            )}>
                                                {stepLabel}
                                            </span>
                                        </div>
                                        {idx < arr.length - 1 && (
                                            <div className={cn(
                                                "h-0.5 flex-1 min-w-[16px] transition-all duration-300",
                                                isDone ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                                            )} />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        {/* Interactive Human in the loop User Tasks panel */}
                        {status === "WAITING" && activeUserTask && (
                            <div className="border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 bg-amber-50/10 dark:bg-amber-950/10 flex flex-col gap-3 shrink-0 animate-in slide-in-from-top-2">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <h5 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5" /> {activeUserTask.label || "Human Verification Required"}
                                        </h5>
                                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal">
                                            {activeUserTask.description || "Provide inputs to resume execution."}
                                        </p>
                                    </div>
                                    {!hasTaskPermission && (
                                        <div className="flex items-center gap-1 text-[10px] font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 border border-rose-100 dark:border-rose-900 rounded-full shrink-0">
                                            <Lock className="h-3 w-3" /> Locked
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    {/* Render the dynamic form */}
                                    {renderDynamicForm(
                                        activeUserTask.gui_schema,
                                        userFormValues,
                                        (key, val) => setUserFormValues(prev => ({ ...prev, [key]: val })),
                                        !hasTaskPermission || isReadOnly || isResuming
                                    )}

                                    {hasTaskPermission && (
                                        <div className="flex items-center gap-2 pt-1.5">
                                            {/* If it's a default schema (has approved and comments), render custom Approve/Reject buttons */}
                                            {activeUserTask.gui_schema?.properties?.approved ? (
                                                <>
                                                    <Button
                                                        onClick={() => {
                                                            const updated = { ...userFormValues, approved: true };
                                                            setUserFormValues(updated);
                                                            handleResume(updated);
                                                        }}
                                                        disabled={isResuming || isReadOnly}
                                                        className="flex-1 h-9 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white"
                                                    >
                                                        {isResuming ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve & Resume"}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => {
                                                            const updated = { ...userFormValues, approved: false };
                                                            setUserFormValues(updated);
                                                            handleResume(updated);
                                                        }}
                                                        disabled={isResuming || isReadOnly}
                                                        className="flex-1 h-9 rounded-lg font-bold text-xs border-slate-200 text-rose-600 dark:text-rose-400 hover:bg-rose-50/50"
                                                    >
                                                        Reject / Revise
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    onClick={() => handleResume()}
                                                    disabled={isResuming || isReadOnly}
                                                    className="w-full h-9 rounded-lg font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
                                                >
                                                    {isResuming ? <Loader2 className="h-3 w-3 animate-spin" /> : activeUserTask.gui_schema?.submit_label || "Submit & Resume"}
                                                </Button>
                                            )}
                                        </div>
                                    )}

                                    {!hasWritePermission && (
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 italic leading-normal text-center bg-slate-50/50 dark:bg-slate-950/20 py-1.5 rounded-lg border border-slate-100/50 dark:border-slate-850">
                                            Awaiting review by allowed Lane members: <span className="font-bold">{activeUserTask.allowed_roles?.join(", ")}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Collapsible Audit Logs timeline */}
                        <div className="flex-1 min-h-0 flex flex-col border border-slate-100 dark:border-slate-800/80 rounded-xl bg-slate-50/20 dark:bg-slate-950/10 overflow-hidden">
                            <button 
                                onClick={() => setLogsExpanded(!logsExpanded)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-850 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                                <span className="flex items-center gap-2">
                                    <Activity className="h-3.5 w-3.5 text-purple-500" />
                                    <span>Real-Time Execution Log ({logs.length})</span>
                                </span>
                                {logsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>

                            <ScrollArea className="flex-1">
                                <div className="p-4 space-y-3.5">
                                    {logs.map((log, idx) => (
                                        <div key={log.id || idx} className="flex gap-3 text-xs leading-relaxed animate-in fade-in duration-300">
                                            {/* Log connector bar */}
                                            <div className="flex flex-col items-center shrink-0">
                                                <div className={cn(
                                                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm",
                                                    log.action_type === "ENTER_NODE" && "bg-indigo-500",
                                                    log.action_type === "EXIT_NODE" && "bg-emerald-500",
                                                    log.action_type === "PAUSE_BREAKPOINT" && "bg-amber-500",
                                                    log.action_type === "ERROR" && "bg-rose-500",
                                                    !["ENTER_NODE", "EXIT_NODE", "PAUSE_BREAKPOINT", "ERROR"].includes(log.action_type) && "bg-slate-400"
                                                )}>
                                                    {log.executed_by === "system" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                                                </div>
                                                {idx < logs.length - 1 && (
                                                    <div className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-850 my-1" />
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0 pt-0.5 space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                                        {log.node_id.replace(/_/g, ' ')}
                                                    </span>
                                                    <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                                                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="text-slate-500 dark:text-slate-400 text-[11px] leading-normal break-words">
                                                    {log.action_type === "ENTER_NODE" && "Step execution started."}
                                                    {log.action_type === "EXIT_NODE" && "Step completed successfully."}
                                                    {log.action_type === "PAUSE_BREAKPOINT" && "Breakpoint reached. Pausing for human authorization."}
                                                    {log.action_type === "RESUME_NODE" && "Verification approved. Resuming stream..."}
                                                    {log.action_type === "ERROR" && `Encountered execution failure: ${log.result_data?.detail || log.result_data?.error || "Unknown error"}`}
                                                    
                                                    {/* Custom decisions summary */}
                                                    {log.result_data?.decision && (
                                                        <div className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-500">
                                                            Decision: {log.result_data.decision}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {logs.length === 0 && (
                                        <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-xs italic">
                                            Awaiting events... Drop a document to inject parameters.
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer controls section */}
            {status !== "IDLE" && (
                <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 shrink-0 bg-slate-50/30 dark:bg-slate-950/20 flex items-center justify-between gap-3">
                    <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 truncate">
                        ID: {instanceId?.slice(0, 8) || "unregistered"}
                    </span>

                    <div className="flex items-center gap-2">
                        {(status === "COMPLETED" || status === "FAILED") && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleStartFromLink}
                                disabled={isStarting || isReadOnly}
                                className="h-8 text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/30 border border-transparent hover:border-purple-100 dark:hover:border-purple-900 rounded-lg gap-1.5 px-3"
                            >
                                {isStarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
                                <span>Restart</span>
                            </Button>
                        )}
                        {status !== "COMPLETED" && status !== "FAILED" && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleAbort}
                                disabled={isAborting || isReadOnly}
                                className="h-8 text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-transparent hover:border-rose-100 dark:hover:border-rose-900 rounded-lg gap-1.5 px-3"
                            >
                                {isAborting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 fill-current" />}
                                <span>Abort Process</span>
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
