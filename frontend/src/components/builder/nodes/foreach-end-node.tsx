"use client";

/**
 * ForEach End Node
 * 
 * marks the end of a loop iteration.
 * Connects back to Start.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ArrowUpCircle } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";

interface ForEachEndData {
    label: string;
    primitiveType: string;
    params: {
        start_node_id?: string;
    };
}

export const ForEachEndNode = memo(function ForEachEndNode({
    id,
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as ForEachEndData;
    const showNodeIds = useBuilderStore((state) => state.showNodeIds);

    // We could try to resolve the label of the start node if we had access to the full graph
    // For now just show ID
    const startNodeId = nodeData.params?.start_node_id || "Unlinked";

    return (
        <div
            className={`
                min-w-[150px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md relative
                ${selected ? "border-orange-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Node ID Badge */}
            {showNodeIds && (
                <div className="absolute -top-6 left-2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded font-mono whitespace-nowrap shadow-md">
                    ID: {id}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-orange-50 dark:bg-orange-900/20 rounded-t-lg">
                <ArrowUpCircle className="h-4 w-4 text-orange-500" />
                <span className="font-medium text-sm">Loop End</span>
            </div>

            {/* Body */}
            <div className="px-3 py-3">
                <div className="text-xs text-muted-foreground mb-1">Loops back to:</div>
                <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 truncate">
                    {startNodeId}
                </div>
            </div>

            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Top}
                className="!w-3 !h-3 !bg-slate-400"
            />

            {/* Explicit Output Handle (Hidden?) 
                Actually we probably don't need an output handle if the backend handles the jump.
                But visually we might want to show a line going back? 
                React Flow doesn't easily support "jump" lines that aren't rendered.
                
                If we want to allow users to draw the line back to Start, we need a Source Handle.
                If we rely on `next_node` ID in params, we don't need a visual edge, 
                but it might look confusing.
                
                Let's add a source handle so users can connect it visually if they want,
                OR (better) the backend param `start_node_id` is sufficient and we 
                don't strictly require an edge, but good practice is to have one.
            */}
            <Handle
                type="source"
                position={Position.Bottom}
                className="!w-3 !h-3 !bg-orange-500"
            />
        </div>
    );
});
