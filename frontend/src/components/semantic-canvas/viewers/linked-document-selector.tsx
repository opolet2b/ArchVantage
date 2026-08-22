import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CanvasThing } from "@/components/semantic-canvas/canvas-store";

export interface LinkedDocumentSelectorProps {
    linkedThings: CanvasThing[];
    selectedIds: Set<string>;
    onSelectionChange: (newSelection: Set<string>) => void;
    emptyMessage?: string;
}

export function LinkedDocumentSelector({ 
    linkedThings, 
    selectedIds, 
    onSelectionChange,
    emptyMessage = "No documents linked. Drag a connection from a document node to this tool to add context."
}: LinkedDocumentSelectorProps) {
    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        onSelectionChange(next);
    };

    return (
        <div className="bg-slate-50 dark:bg-slate-950/50 rounded-lg p-5 border border-slate-100 dark:border-slate-800 w-full mb-8">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                Linked Context Documents <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full text-[10px]">{linkedThings.length}</span>
            </h4>
            
            {linkedThings.length === 0 ? (
                <div className="text-sm text-slate-400 italic text-center py-4 bg-white dark:bg-slate-900 rounded border border-dashed border-slate-200 dark:border-slate-700">
                    {emptyMessage}
                </div>
            ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                    {linkedThings.map(actualThing => {
                        const isSelected = selectedIds.has(actualThing.id);
                        const title = actualThing.title || actualThing.id;
                        const type = actualThing.type;

                        return (
                            <div 
                                key={actualThing.id} 
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-md border transition-colors cursor-pointer",
                                    isSelected 
                                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 shadow-sm" 
                                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                                )}
                                onClick={() => toggleSelection(actualThing.id)}
                            >
                                <div className={cn(
                                    "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                                    isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300 dark:border-slate-600"
                                )}>
                                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                                </div>
                                <div className="truncate flex-1">
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{title}</p>
                                    <p className="text-xs text-slate-400 truncate">{type}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
