"use client";

import React from "react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Trash2, ChevronDown, CheckCircle2, FileText, Bot, Activity, FileJson } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export interface PipelineStep {
    id: string;
    moduleId: string;
    type: "extractor" | "agent" | "formatter" | "visualizer";
    name: string;
    config: any; // Dynamic config based on type
    description?: string;
    enabled?: boolean;
}

interface StudioCanvasProps {
    steps: PipelineStep[];
    selectedStepId: string | null;
    onSelectStep: (id: string) => void;
    onToggleStep: (id: string, enabled: boolean) => void;
}

export function StudioCanvas({ steps, selectedStepId, onSelectStep, onToggleStep }: StudioCanvasProps) {
    return (
        <div className="flex-1 bg-muted/5 h-full flex flex-col items-center gap-4 transition-colors relative overflow-hidden">
            {/* Tooltip Header Area */}
            <div className="absolute top-4 right-4 z-20">
                <HelpTooltip contentPath="smart-analysis/workbench_modules" />
            </div>

            <div className="flex-1 w-full overflow-y-auto p-8 flex flex-col items-center gap-4">
                {steps.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4 opacity-50 border-2 border-dashed border-slate-300 rounded-3xl w-full max-w-sm p-12 bg-slate-50/50">
                        <div className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center">
                            <span className="text-2xl">!</span>
                        </div>
                        <p className="uppercase text-xs font-semibold tracking-wider">No module pipeline defined</p>
                    </div>
                )}

                {steps.map((step, index) => (
                    <React.Fragment key={step.id}>
                        {/* Step Card */}
                        <div
                            className={`relative w-[340px] bg-white rounded-3xl p-6 transition-all duration-300 cursor-pointer group flex flex-col items-center
                                ${selectedStepId === step.id
                                    ? 'shadow-2xl ring-2 ring-indigo-500 scale-105 z-10'
                                    : 'shadow-lg hover:shadow-xl border border-slate-100'
                                }
                                ${step.enabled === false ? 'opacity-50 grayscale' : ''}
                            `}
                            onClick={() => onSelectStep(step.id)}
                        >
                            {/* Header / Badges */}
                            <div className="w-full flex justify-between items-center mb-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Step {index + 1}
                                </span>
                                <div onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                        checked={step.enabled !== false}
                                        onCheckedChange={(checked) => onToggleStep(step.id, checked)}
                                        className="data-[state=checked]:bg-blue-600"
                                    />
                                </div>
                            </div>

                            {/* Centered Icon */}
                            <div className={`mb-4 p-4 rounded-2xl ${step.type === 'extractor' ? 'bg-blue-50 text-blue-600' :
                                step.type === 'agent' ? 'bg-purple-50 text-purple-600' :
                                    step.type === 'visualizer' ? 'bg-pink-50 text-pink-600' : 'bg-rose-50 text-rose-600'
                                }`}>
                                {step.type === 'extractor' && <FileText className="h-8 w-8" />}
                                {step.type === 'agent' && <Bot className="h-8 w-8" />}
                                {step.type === 'visualizer' && <Activity className="h-8 w-8" />}
                                {step.type === 'formatter' && <FileJson className="h-8 w-8" />}
                            </div>

                            {/* Title */}
                            <div className="font-bold text-lg text-slate-800 text-center mb-1">{step.name}</div>
                            {/* Description - Added per requirements */}
                            {step.description && (
                                <div className="text-xs text-slate-500 text-center mt-1 px-2 leading-tight">
                                    {step.description}
                                </div>
                            )}

                            {/* Removed Delete Button */}
                        </div>

                        {/* Connector Arrow */}
                        {index < steps.length - 1 && (
                            <div className="text-muted-foreground/30">
                                <ChevronDown className="h-6 w-6" />
                            </div>
                        )}
                    </React.Fragment>
                ))}

                {steps.length > 0 && (
                    <div className="flex flex-col items-center gap-2 mt-2 opacity-50">
                        <ChevronDown className="h-6 w-6 text-muted-foreground/30" />
                        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <CheckCircle2 className="h-4 w-4" />
                            End of Pipeline
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
