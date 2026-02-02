"use client";

import React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, CheckCircle2, Circle, Clock, AlertCircle, ChevronDown, ChevronRight, Code, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownViewer } from "./viewers/markdown-viewer";

interface ExecutionNode {
    id: string;
    label: string;
    type: string;
    status: "pending" | "active" | "completed" | "failed";
    details?: string;
    params?: any;
    output?: any;
    children?: ExecutionNode[]; // Nested nodes support
}

interface ExecutionPlanModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    plan: {
        templateName?: string;
        currentStepId?: string;
        nodes: ExecutionNode[];
        executionId?: string;
    } | null;
}

const FormattedJson = ({ data }: { data: any }) => {
    if (!data) return <span className="text-slate-400 italic">No data</span>;

    const metricKeys = [
        "Quality Score", "Purpose Match", "Structure Match", "Instruction Match", "Overall Consistency",
        "quality_score", "purpose_match", "structure_match", "instruction_match", "overall_consistency",
        "accuracy", "clarity", "completeness", "score"
    ];

    // Check if this is a "metrics object" - either direct scores or nested under 'metrics'
    const isMetricsObject = data && typeof data === 'object' && (
        "metrics" in data || "score" in data ||
        Object.keys(data).some(k => metricKeys.some(m => m.toLowerCase() === k.toLowerCase()))
    );

    if (isMetricsObject) {
        return <MetricsDisplay details={data} />;
    }

    // Sort keys: metrics first, then others
    const entries = typeof data === 'object' ? Object.entries(data) : [];
    const metrics = entries.filter(([k]) => metricKeys.includes(k) || k.toLowerCase().includes("score"));
    const others = entries.filter(([k]) => !metricKeys.includes(k) && !k.toLowerCase().includes("score"));

    // Helper for recursion
    const renderValue = (val: any): React.ReactNode => {
        if (typeof val === 'object' && val !== null) {
            return (
                <div className="pl-2 border-l border-slate-200 dark:border-slate-800 mt-1">
                    <FormattedJson data={val} />
                </div>
            );
        }
        return <span className="font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{String(val)}</span>;
    };

    if (typeof data !== 'object') return <span>{String(data)}</span>;

    return (
        <div className="space-y-3 p-1">
            {metrics.length > 0 && <MetricsDisplay details={Object.fromEntries(metrics)} />}

            {others.map(([k, v]) => (
                <div key={k} className="text-xs mt-2">
                    <span className="font-bold block text-slate-700 dark:text-slate-300 mb-0.5 capitalize">{k.replace(/_/g, " ")}:</span>
                    <div className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{renderValue(v)}</div>
                </div>
            ))}
        </div>
    );
};

const MetricsDisplay = ({ details }: { details: any }) => {
    const parseScore = (val: any) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const match = val.match(/(\d+)/);
            return match ? parseInt(match[1]) : 0;
        }
        return 0;
    };

    // Flatten if wrapped in "metrics"
    const actualDetails = details.metrics ? { ...details, ...details.metrics } : details;

    // Diagnostic logging
    console.log("[PlanModal] Metrics Details:", {
        raw: details,
        flattened: actualDetails,
        keys: Object.keys(actualDetails)
    });

    const metricKeys = [
        "Quality Score", "Purpose Match", "Structure Match", "Instruction Match", "Overall Consistency",
        "quality_score", "purpose_match", "structure_match", "instruction_match", "overall_consistency",
        "accuracy", "clarity", "completeness", "score"
    ];

    // Split into metrics (numeric) and descriptions (text)
    const metrics = Object.entries(actualDetails).filter(([k]) =>
        (metricKeys.some(m => m.toLowerCase() === k.toLowerCase()) || k.toLowerCase().includes("score") || k.toLowerCase().endsWith("match")) && k !== "metrics"
    );

    const descriptions = Object.entries(actualDetails).filter(([k]) =>
        !(metricKeys.some(m => m.toLowerCase() === k.toLowerCase()) || k.toLowerCase().includes("score") || k.toLowerCase().endsWith("match")) && k !== "metrics"
    );

    return (
        <div className="space-y-3 mb-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded border border-slate-100 dark:border-slate-800">
            {metrics.length === 0 && descriptions.length === 0 && <div className="text-xs text-slate-400 italic">No details found</div>}

            {/* Numeric Metrics with Progress Bars */}
            <div className="space-y-2">
                {metrics.map(([k, v]) => {
                    const score = parseScore(v);
                    const isMain = k === "Quality Score" || k === "score" || k === "overall_score";
                    return (
                        <div key={k} className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className={cn("font-medium capitalize", isMain ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-600 dark:text-slate-400")}>{k.replace(/_/g, " ")}</span>
                                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{score}%</span>
                            </div>
                            <Progress value={score} className={cn("h-1.5", isMain ? "h-2 bg-blue-100 dark:bg-blue-900/30" : "")} />
                        </div>
                    );
                })}
            </div>

            {/* Textual Feedback / Issues */}
            {descriptions.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    {descriptions.map(([k, v]) => (
                        <div key={k} className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{k.replace(/_/g, " ")}</div>
                            <div className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-slate-900 shadow-sm">
                                {typeof v === 'string' ? (
                                    <MarkdownViewer content={v} className="prose-xs dark:prose-invert" />
                                ) : (
                                    <pre className="whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ExecutionNodeItem = ({ node, isLast, depth = 0 }: { node: ExecutionNode, isLast: boolean, depth?: number }) => {
    const isActive = node.status === 'active';
    const isCompleted = node.status === 'completed';
    const isFailed = node.status === 'failed';
    const [expanded, setExpanded] = React.useState(isActive || isFailed || !!node.children?.length);
    const [showRaw, setShowRaw] = React.useState(false);

    // Auto-expand if active or has children
    React.useEffect(() => {
        if (isActive || isFailed || (node.children && node.children.length > 0)) {
            setExpanded(true);
        }
    }, [isActive, isFailed, node.children?.length]);

    // Toggle expansion if children exist
    const hasChildren = node.children && node.children.length > 0;

    // Parse details if JSON string
    const parsedDetails = React.useMemo(() => {
        if (!node.details) return null;
        if (typeof node.details === 'string') {
            try {
                const parsed = JSON.parse(node.details);
                return parsed;
            } catch (e) {
                return node.details; // Not JSON
            }
        }
        return node.details;
    }, [node.details]);

    const isJsonDetails = typeof parsedDetails === 'object' && parsedDetails !== null;

    return (
        <div className="relative">
            {/* Connectivity Line */}
            {!isLast && (
                <div className={cn(
                    "absolute left-6 top-10 w-0.5 -z-10",
                    isCompleted ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700",
                    // Adjust height to reach next node roughly
                    "h-[calc(100%+16px)]"
                )} />
            )}

            <Card className={cn(
                "relative z-10 border-2 transition-all duration-300",
                node.type === 'CYCLE' ? "border-blue-400/50 bg-blue-50/10 dark:bg-blue-900/10 shadow-sm" :
                    isActive ? "border-blue-500 shadow-md ring-4 ring-blue-500/10" :
                        isCompleted ? "border-emerald-500/50" :
                            isFailed ? "border-red-500" :
                                "border-slate-200 dark:border-slate-700 opacity-70"
            )}>
                <CardHeader className="py-3 px-4 flex flex-row items-center gap-4 space-y-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors rounded-t-lg" onClick={() => setExpanded(!expanded)}>
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-xs",
                        node.type === 'CYCLE' ? "bg-blue-400" :
                            isCompleted ? "bg-emerald-500" :
                                isActive ? "bg-blue-500 animate-pulse" :
                                    isFailed ? "bg-red-500" :
                                        "bg-slate-300 dark:bg-slate-700 text-slate-500"
                    )}>
                        {node.type === 'CYCLE' ? <RefreshCcw className="h-5 w-5" /> :
                            isCompleted ? <CheckCircle2 className="h-5 w-5" /> :
                                isFailed ? <AlertCircle className="h-5 w-5" /> :
                                    isActive ? <Clock className="h-5 w-5 animate-spin" /> :
                                        <Circle className="h-5 w-5" />}
                    </div>

                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
                                {node.type.replace(/_/g, " ")}
                                {hasChildren && (
                                    expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                            </CardTitle>
                            <Badge variant={
                                isCompleted ? "default" :
                                    isActive ? "secondary" :
                                        isFailed ? "destructive" : "outline"
                            } className={cn("text-[10px] h-5", isCompleted && "bg-emerald-500 hover:bg-emerald-600 border-transparent")}>
                                {node.status}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{node.label}</p>
                    </div>
                </CardHeader>

                {/* Content Area */}
                {expanded && (
                    <CardContent className="px-4 pb-3 pt-0 pl-[3.5rem]">
                        {/* Details Block */}
                        {node.details && (
                            <div className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Output / Details</span>
                                    {isJsonDetails && (
                                        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2 text-slate-500" onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}>
                                            {showRaw ? "Show Formatted" : "Show JSON"}
                                        </Button>
                                    )}
                                </div>
                                <div className={cn(
                                    "text-xs font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded border text-slate-600 dark:text-slate-400 max-h-[300px] overflow-auto",
                                    "scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800"
                                )}>
                                    {!showRaw && isJsonDetails ? (
                                        <FormattedJson data={parsedDetails} />
                                    ) : (
                                        <div className="p-1">
                                            {typeof node.details === 'string' && !showRaw ? (
                                                <MarkdownViewer
                                                    content={node.details}
                                                    className="text-xs prose-sm dark:prose-invert"
                                                />
                                            ) : (
                                                <div className="whitespace-pre-wrap">{typeof node.details === 'string' ? node.details : JSON.stringify(node.details, null, 2)}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Nested Children */}
                        {hasChildren && (
                            <div className="pl-2 border-l-2 border-slate-100 dark:border-slate-800 space-y-4 mt-2">
                                {node.children!.map((child, idx) => (
                                    <ExecutionNodeItem
                                        key={child.id || idx}
                                        node={child}
                                        isLast={idx === node.children!.length - 1}
                                        depth={depth + 1}
                                    />
                                ))}
                            </div>
                        )}

                        {node.type === 'analyzer' && isActive && (
                            <div className="mt-2 text-xs text-blue-600 animate-pulse flex items-center gap-2">
                                <Clock className="w-3 h-3" /> Verifying Constraints...
                            </div>
                        )}
                    </CardContent>
                )}
            </Card>
        </div>
    );
};

export function ExecutionPlanModal({ open, onOpenChange, plan }: ExecutionPlanModalProps) {
    if (!plan) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b bg-slate-50 dark:bg-slate-900/50">
                    <DialogTitle className="flex items-center gap-2">
                        <span className="text-emerald-600">
                            <CheckCircle2 className="h-5 w-5" />
                        </span>
                        Deep Agent Plan
                    </DialogTitle>
                    <DialogDescription>
                        Tracking execution of <strong>{plan.templateName || "Smart Analysis"}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-100/50 dark:bg-slate-950/50">
                    <div className="space-y-6 max-w-2xl mx-auto">
                        {plan.nodes.map((node, index) => (
                            <ExecutionNodeItem
                                key={node.id}
                                node={node}
                                isLast={index === plan.nodes.length - 1}
                            />
                        ))}
                    </div>
                </div>

                <DialogFooter className="border-t p-4 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center sm:justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground flex items-center gap-2"
                        onClick={() => {
                            const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `execution_plan_${Date.now()}.json`;
                            a.click();
                        }}
                    >
                        <Code className="h-3 w-3" />
                        Download Raw Plan JSON
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
