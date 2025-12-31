"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Bot, FileJson, GripVertical, Activity } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";

export interface ModuleItem {
    id: string;
    type: "extractor" | "agent" | "formatter" | "visualizer";
    name: string;
    icon: React.ElementType;
    description: string;
}

const modules: ModuleItem[] = [
    { id: "mod_extractor", type: "extractor", name: "Data Extractor", icon: FileText, description: "Extract specific sections or data points." },
    { id: "mod_agent", type: "agent", name: "AI Agent", icon: Bot, description: "Analyze content using a Persona and Framework." },
    { id: "mod_visualizer", type: "visualizer", name: "Visualizer", icon: Activity, description: "Generate structural visualizations (Graphs, Tables)." },
    { id: "mod_formatter", type: "formatter", name: "Output Fmt", icon: FileJson, description: "Format the analysis results (JSON, Markdown)." },
];

interface StudioSidebarProps {
    onAddModule: (module: ModuleItem) => void;
}

export function StudioSidebar({ onAddModule }: StudioSidebarProps) {
    return (
        <div className="w-72 border-r bg-white h-full flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
                <div>
                    <h2 className="font-bold text-lg text-slate-800 leading-none">Logic Library</h2>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">Drag or click to add</p>
                </div>
                <HelpTooltip contentPath="smart-analysis/workbench_modules" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {modules.map((mod) => (
                    <div
                        key={mod.id}
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData("application/reactflow", JSON.stringify(mod));
                            e.dataTransfer.effectAllowed = "copy";
                        }}
                        className="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-indigo-500 hover:shadow-md cursor-grab active:cursor-grabbing"
                        onClick={() => onAddModule(mod)}
                    >
                        <GripVertical className="h-4 w-4 text-slate-300 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <div className={`p-1.5 rounded-md ${mod.type === 'extractor' ? 'bg-blue-100 text-blue-600' : mod.type === 'agent' ? 'bg-purple-100 text-purple-600' : 'bg-rose-100 text-rose-600'}`}>
                                    <mod.icon className="h-4 w-4" />
                                </div>
                                <span className="text-sm font-bold text-slate-700">{mod.name}</span>
                            </div>
                            <p className="text-xs text-slate-500 leading-tight">{mod.description}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
