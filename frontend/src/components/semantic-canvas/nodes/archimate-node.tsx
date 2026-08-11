"use client";

import * as React from "react";
import { NodeProps, NodeResizer } from "reactflow";
import { 
    Import, 
    UploadCloud,
    Maximize2,
    Trash2,
    RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "../canvas-store";
import { Button } from "@/components/ui/button";
import { parseArchimateXml, ParsedArchimate } from "../services/archimate-parser";

// Helper to assign Archimate standard colors based on element type
function getArchimateColor(type: string): { bg: string, border: string } {
    const t = type.toLowerCase();
    // Business Layer (Yellow)
    if (t.includes('business') || t.includes('actor') || t.includes('role') || t.includes('process') || t.includes('function') || t.includes('event')) {
        return { bg: '#ffffcc', border: '#e6e600' };
    }
    // Application Layer (Blue/Cyan)
    if (t.includes('application') || t.includes('component') || t.includes('interface')) {
        return { bg: '#cce6ff', border: '#3399ff' };
    }
    // Technology Layer (Green)
    if (t.includes('technology') || t.includes('node') || t.includes('device') || t.includes('infrastructure') || t.includes('network')) {
        return { bg: '#ccffcc', border: '#33cc33' };
    }
    // Strategy/Motivation (Purple/Lavender)
    if (t.includes('goal') || t.includes('outcome') || t.includes('principle') || t.includes('requirement') || t.includes('capability') || t.includes('courseofaction')) {
        return { bg: '#e6ccff', border: '#9933ff' };
    }
    // Physical (Green)
    if (t.includes('facility') || t.includes('equipment') || t.includes('material')) {
        return { bg: '#ccffcc', border: '#33cc33' };
    }
    // Default/Unknown
    return { bg: '#f1f5f9', border: '#cbd5e1' };
}

/**
 * Archimate Node Component
 * 
 * A container node that renders an Archimate diagram inside it.
 * Uses a nested structure to parse and display the elements.
 */
export function ArchimateNode({ id, data, selected }: NodeProps) {
    const { thing, onResizeEnd, onDelete } = data;
    const updateThing = useCanvasStore(state => state.updateThing);
    const editingThingId = useCanvasStore(state => state.editingThingId);
    const setEditingThingId = useCanvasStore(state => state.setEditingThingId);
    const accessLevel = useCanvasStore(state => state.accessLevel);
    
    const isReadOnly = accessLevel === "read";
    const isEditing = editingThingId === id && !isReadOnly;
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // If there is parsed content, we would read it from thing.content
    const hasData = thing.content && thing.content.archimateData;
    const parsedData = hasData as ParsedArchimate;

    const handleNodeClick = (e: React.MouseEvent) => {
        if (isReadOnly) return;
        if (!isEditing) {
            setEditingThingId(id);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            
            try {
                const parsed = await parseArchimateXml(text);
                updateThing(id, {
                    content: { ...thing.content, archimateData: parsed },
                    title: file.name
                });
            } catch (err) {
                console.error("Failed to parse Archimate XML:", err);
                alert("Failed to parse the file. Please ensure it is a valid Archi export.");
            }
        };
        reader.readAsText(file);
    };

    // Calculate the bounding box of the diagram to set the inner container size properly
    let diagramWidth = 800;
    let diagramHeight = 600;

    if (parsedData?.diagrams && parsedData.diagrams.length > 0) {
        let maxX = 0;
        let maxY = 0;
        parsedData.diagrams[0].nodes.forEach(n => {
            if (n.bounds) {
                const rightEdge = n.bounds.x + n.bounds.width;
                const bottomEdge = n.bounds.y + n.bounds.height;
                if (rightEdge > maxX) maxX = rightEdge;
                if (bottomEdge > maxY) maxY = bottomEdge;
            }
        });
        // Add some padding
        diagramWidth = Math.max(maxX + 100, 400);
        diagramHeight = Math.max(maxY + 100, 300);
    }

    return (
        <div 
            className={cn(
                "group relative flex flex-col bg-white dark:bg-slate-900 border rounded-lg overflow-hidden transition-shadow",
                selected ? "ring-2 ring-blue-500 shadow-xl z-10" : "shadow-md hover:shadow-lg border-slate-200 dark:border-slate-800",
                !isEditing && "cursor-pointer"
            )}
            style={{ 
                width: "100%",
                height: "100%",
                // Prevent inner massive divs from breaking the outer constraints
                contain: 'strict'
            }}
            onClick={handleNodeClick}
        >
            <NodeResizer 
                color="#3b82f6" 
                isVisible={selected && !isReadOnly} 
                minWidth={300} 
                minHeight={200}
                onResizeEnd={onResizeEnd} 
            />

            {/* Header */}
            <div className="flex-none flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 drag-handle cursor-grab active:cursor-grabbing z-20">
                <div className="flex items-center gap-2">
                    <Import className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold text-sm text-slate-700 dark:text-slate-200 truncate">
                        {thing.title || "Archimate Diagram"}
                    </span>
                </div>
                {selected && !isReadOnly && (
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Content Area - Scrollable */}
            <div className="flex-1 relative overflow-auto bg-slate-100 dark:bg-slate-950 nodrag">
                {!hasData ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 p-4">
                        <UploadCloud className="h-10 w-10 text-slate-300" />
                        <div className="text-center">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No Diagram Loaded</p>
                            <p className="text-xs text-slate-500 mt-1">Upload an .xml or .archimate file</p>
                        </div>
                        <input
                            type="file"
                            accept=".xml,.archimate"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                        />
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isReadOnly}
                        >
                            Select File
                        </Button>
                    </div>
                ) : parsedData.diagrams && parsedData.diagrams.length > 0 ? (
                    <div 
                        className="relative" 
                        style={{ 
                            width: `${diagramWidth}px`, 
                            height: `${diagramHeight}px` 
                        }}
                    >
                        <div className="absolute top-2 left-2 text-sm font-semibold text-slate-600 bg-white/80 dark:bg-slate-800/80 px-2 py-1 rounded shadow-sm z-10 backdrop-blur-sm">
                            {(hasData as ParsedArchimate).diagrams[0].name}
                        </div>
                        
                        {/* Render Nodes */}
                        {(hasData as ParsedArchimate).diagrams[0].nodes.map(n => {
                            const colors = getArchimateColor(n.type);
                            return (
                                <div 
                                    key={n.id}
                                    className="absolute flex items-center justify-center p-2 text-xs text-center rounded-sm shadow-sm hover:shadow-md transition-shadow cursor-default"
                                    style={{
                                        left: n.bounds?.x || 0,
                                        top: n.bounds?.y || 0, 
                                        width: n.bounds?.width || 120,
                                        height: n.bounds?.height || 55,
                                        backgroundColor: colors.bg,
                                        borderColor: colors.border,
                                        borderWidth: '1px',
                                        borderStyle: 'solid',
                                        color: '#333333',
                                        fontFamily: 'sans-serif',
                                        lineHeight: 1.2,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                    title={`${n.name}\n[${n.type}]`}
                                >
                                    <div className="w-full break-words line-clamp-3">
                                        {n.name}
                                    </div>
                                    <div className="absolute top-0.5 right-1 text-[8px] opacity-40 italic">
                                        {n.type.replace('archimate:', '')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                        <p className="text-sm">No diagrams found in this file.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
