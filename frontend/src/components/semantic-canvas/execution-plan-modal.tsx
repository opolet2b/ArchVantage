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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExecutionNode {
    id: string;
    label: string;
    type: string;
    status: "pending" | "active" | "completed" | "failed";
    details?: string;
    params?: any;
    output?: any;
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
                        Deep Analysis Execution Plan
                    </DialogTitle>
                    <DialogDescription>
                        Tracking execution of <strong>{plan.templateName || "Smart Analysis"}</strong>
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 p-6 bg-slate-100/50 dark:bg-slate-950/50">
                    <div className="space-y-6 max-w-2xl mx-auto">
                        {plan.nodes.map((node, index) => {
                            const isLast = index === plan.nodes.length - 1;
                            const isActive = node.status === 'active';
                            const isCompleted = node.status === 'completed';
                            const isFailed = node.status === 'failed';

                            return (
                                <div key={node.id} className="relative">
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
                                        <CardHeader className="py-3 px-4 flex flex-row items-center gap-4 space-y-0">
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
                                                    <CardTitle className="text-sm font-bold uppercase tracking-wide">
                                                        {node.type.replace(/_/g, " ")}
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

                                        {/* Expandable Details (Always show if active/failed, or if it has interesting details) */}
                                        {(isActive || isFailed || node.details) && (
                                            <CardContent className="px-4 pb-3 pt-0 pl-[3.5rem]">
                                                {node.details && (
                                                    <div className="text-xs font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded border text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                                                        {node.details}
                                                    </div>
                                                )}

                                                {/* Constraint Checking Visuals (Mockup) */}
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
                        })}
                    </div>
                </ScrollArea>

                <DialogFooter className="border-t p-4 bg-slate-50 dark:bg-slate-900/50">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
