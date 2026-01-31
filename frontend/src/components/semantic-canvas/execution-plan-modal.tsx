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
import { ArrowRight, CheckCircle2, Circle, Clock, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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

    // Check for Metrics Pattern
    const isMetricsObject = data && typeof data === 'object' && (
        "Purpose Match" in data || "Quality Score" in data
    );

    if (isMetricsObject) {
        return <MetricsDisplay details={data} />;
    }

    // Recursive renderer for cleaner view
    const renderValue = (val: any): React.ReactNode => {
        if (Array.isArray(val)) {
            return (
                <div className="pl-4 border-l-2 border-slate-200 dark:border-slate-800 my-1">
                    {val.map((item, i) => (
                        <div key={i} className="mb-2">
                            <span className="text-slate-400 text-xs mr-2">[{i}]</span>
                            {renderValue(item)}
                        </div>
                    ))}
                </div>
            );
        }
        if (val && typeof val === 'object') {
            return (
                <div className="pl-2">
                    {Object.entries(val).map(([k, v]) => (
                        <div key={k} className="mb-1">
                            <span className="font-semibold text-slate-600 dark:text-slate-400 text-xs">{k}: </span>
                            <div className="inline-block align-top">{renderValue(v)}</div>
                        </div>
                    ))}
                </div>
            );
        }
        // String value handling - Check for basic types
        let displayVal = String(val);
        // Truncate massive strings
        if (displayVal.length > 500) displayVal = displayVal.substring(0, 500) + "... (truncated)";

        return <span className="text-slate-700 dark:text-slate-300 text-xs whitespace-pre-wrap">{displayVal}</span>;
    };

    return <div className="text-xs font-mono overflow-x-hidden">{renderValue(data)}</div>;
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

    const metricKeys = ["Quality Score", "Purpose Match", "Structure Match", "Instruction Match", "Styling Match"];
    // Sort to put Quality Score first
    const sortedEntries = Object.entries(details)
        .filter(([k]) => metricKeys.includes(k) || k.endsWith("Match") || k.includes("Score"))
        .sort((a, b) => {
            if (a[0] === "Quality Score") return -1;
            if (b[0] === "Quality Score") return 1;
            return a[0].localeCompare(b[0]);
        });

    return (
        <div className="space-y-3 p-2 bg-white dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-800">
            {sortedEntries.map(([k, v]) => {
                const score = parseScore(v);
                const isMain = k === "Quality Score";
                return (
                    <div key={k} className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className={cn("font-medium", isMain ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-600 dark:text-slate-400")}>{k}</span>
                            <span className="font-mono">{String(v)}</span>
                        </div>
                        <Progress value={score} className={cn("h-1.5", isMain ? "h-2.5" : "")} />
                    </div>
                );
            })}

            {/* Show other details (like Feedback) as text */}
            {Object.entries(details).filter(([k]) => !metricKeys.includes(k) && !k.endsWith("Match") && !k.includes("Score")).map(([k, v]) => (
                <div key={k} className="mt-3 text-xs border-t pt-2">
                    <span className="font-bold block text-slate-700 dark:text-slate-300 mb-1">{k}:</span>
                    <div className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{String(v)}</div>
                </div>
            ))}
        </div>
    );
};

const ExecutionNodeItem = ({ node, isLast, depth = 0 }: { node: ExecutionNode, isLast: boolean, depth?: number }) => {
    const isActive = node.status === 'active';
    const isCompleted = node.status === 'completed';
    const isFailed = node.status === 'failed';
    const [expanded, setExpanded] = React.useState(isActive || isFailed || !!node.children?.length);
    const [showRaw, setShowRaw] = React.useState(false);

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
                    "absolute left-6 top-10 bottom-[-24px] w-0.5 z-0",
                    isCompleted ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                )} />
            )}

            <Card className={cn(
                "relative z-10 border-2 transition-all duration-300",
                isActive ? "border-blue-500 shadow-md ring-4 ring-blue-500/10" :
                    isCompleted ? "border-emerald-500/50" :
                        isFailed ? "border-red-500" :
                            "border-slate-200 dark:border-slate-700 opacity-70"
            )}>
                <CardHeader className="py-3 px-4 flex flex-row items-center gap-4 space-y-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors rounded-t-lg" onClick={() => setExpanded(!expanded)}>
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-xs",
                        isCompleted ? "bg-emerald-500" :
                            isActive ? "bg-blue-500 animate-pulse" :
                                isFailed ? "bg-red-500" :
                                    "bg-slate-300 dark:bg-slate-700 text-slate-500"
                    )}>
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> :
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
                                        <div className="whitespace-pre-wrap">{typeof node.details === 'string' ? node.details : JSON.stringify(node.details, null, 2)}</div>
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

                <DialogFooter className="border-t p-4 bg-slate-50 dark:bg-slate-900/50">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
