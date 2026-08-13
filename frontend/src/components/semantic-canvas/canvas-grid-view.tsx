"use client";

import * as React from "react";
import { useCanvasStore } from "./canvas-store";
import { ThingNode } from "./nodes/thing-node";
import { ScrollArea } from "@/components/ui/scroll-area";

export function CanvasGridView() {
    const { things, selectedGridNodeIds, gridLayoutMode } = useCanvasStore();

    const selectedThings = things.filter(t => selectedGridNodeIds[t.id]);

    if (selectedThings.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-950/50">
                <p className="text-muted-foreground text-lg">No nodes selected for Grid Mode.</p>
                <p className="text-muted-foreground text-sm">Select nodes from the left panel.</p>
            </div>
        );
    }

    // Determine grid columns
    let gridCols = 1;
    let gridStyle: React.CSSProperties = { 
        display: "grid", 
        gap: "16px",
        padding: "16px",
        height: "100%",
        width: "100%"
    };

    if (selectedThings.length === 1) {
        gridStyle.gridTemplateColumns = "1fr";
        gridStyle.gridTemplateRows = "minmax(300px, 1fr)";
    } else if (selectedThings.length === 2) {
        if (gridLayoutMode === "vertical") {
            gridStyle.gridTemplateColumns = "1fr";
            gridStyle.gridTemplateRows = "minmax(300px, 1fr) minmax(300px, 1fr)";
        } else {
            // horizontal or auto
            gridStyle.gridTemplateColumns = "1fr 1fr";
            gridStyle.gridTemplateRows = "minmax(300px, 1fr)";
        }
    } else {
        // 3 or more: calculate a grid
        const cols = Math.ceil(Math.sqrt(selectedThings.length));
        gridStyle.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
        // gridTemplateRows can be auto
        gridStyle.gridAutoRows = "minmax(300px, 1fr)";
    }

    return (
        <div className="w-full h-full bg-slate-50 dark:bg-slate-950 overflow-auto">
            <div style={gridStyle} className="min-h-full">
                {selectedThings.map(thing => {
                    // Create mock node data matching what ReactFlow passes
                    const nodeData = {
                        thing,
                        accessLevel: "write", // mock
                        onEdit: () => {},
                        onIconify: () => {},
                        isIconified: thing.iconified,
                        forceExpanded: true,
                    };

                    return (
                        <div key={thing.id} className="relative bg-white dark:bg-slate-900 rounded-xl shadow-md border overflow-hidden">
                            {/* We wrap ThingNode and scale it to fit or just let it render. 
                                ThingNode is absolutely positioned by ReactFlow normally, 
                                but here we rely on its internal styles. 
                                ThingNode uses w-full h-full internally if resizing is disabled. 
                            */}
                            <div className="absolute inset-0 overflow-auto pointer-events-auto">
                                <ThingNode 
                                    id={thing.id} 
                                    data={nodeData} 
                                    selected={false} 
                                    isConnectable={false}
                                    xPos={0}
                                    yPos={0}
                                    zIndex={1}
                                    dragging={false}
                                    type="thing"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
