"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, ChevronDown, CheckCircle2, FileText, Bot, Activity, FileJson } from "lucide-react";
import { ModuleItem } from "./studio-sidebar";

export interface PipelineStep {
    id: string;
    moduleId: string;
    type: "extractor" | "agent" | "formatter" | "visualizer";
    name: string;
    config: any; // Dynamic config based on type
}

interface StudioCanvasProps {
    steps: PipelineStep[];
    selectedStepId: string | null;
    onSelectStep: (id: string) => void;
    onDeleteStep: (id: string) => void;
    onAddModule?: (module: ModuleItem) => void;
}

export function StudioCanvas({ steps, selectedStepId, onSelectStep, onDeleteStep, onAddModule }: StudioCanvasProps) {
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const data = e.dataTransfer.getData("application/reactflow");
        if (data && onAddModule) {
            try {
                const module = JSON.parse(data);
                onAddModule(module);
            } catch (err) {
                console.error("Failed to parse drop data", err);
            }
        }
    };

    return (
        <div
            className="flex-1 bg-muted/5 h-full p-8 overflow-y-auto flex flex-col items-center gap-4 transition-colors"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {steps.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4 opacity-50 border-2 border-dashed border-slate-300 rounded-3xl w-full max-w-sm p-12 bg-slate-50/50">
                    <div className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center">
                        <span className="text-2xl">+</span>
                    </div>
                    <p className="uppercase text-xs font-semibold tracking-wider">Add modules from the sidebar</p>
                </div>
            )}

            {steps.map((step, index) => (
                <React.Fragment key={step.id}>
                    {/* Step Card */}
                    <div
                        className={`relative w-[320px] bg-white rounded-3xl p-6 transition-all duration-300 cursor-pointer group flex flex-col items-center
                            ${selectedStepId === step.id
                                ? 'shadow-2xl ring-2 ring-indigo-500 scale-105 z-10'
                                : 'shadow-lg hover:shadow-xl border border-slate-100'
                            }
                        `}
                        onClick={() => onSelectStep(step.id)}
                    >
                        {/* Header / Badges */}
                        <div className="w-full flex justify-between items-center mb-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Step {index + 1}
                            </span>
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
                        <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">{step.type}</div>

                        {/* Delete Action */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-all text-slate-300 hover:text-red-500 hover:bg-red-50"
                            onClick={(e) => { e.stopPropagation(); onDeleteStep(step.id); }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
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
    );
}
