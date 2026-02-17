"use client";

/**
 * ForEach Start Node
 * 
 * Entry point for a loop.
 * Outputs:
 * - Body: The path to take for each item
 * - Done: The path to take when loop is finished
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";

interface ForEachStartData {
    label: string;
    primitiveType: string;
    params: {
        items?: string;
        iterator_var?: string;
    };
}

export const ForEachStartNode = memo(function ForEachStartNode({
    id,
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as ForEachStartData;
    const showNodeIds = useBuilderStore((state) => state.showNodeIds);

    const safeString = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return val;
        return JSON.stringify(val);
    };

    const items = safeString(nodeData.params?.items) || "{{inputs.list}}";
    const iterator = safeString(nodeData.params?.iterator_var) || "item";

    return (
        <div
            className={`
                min-w-[180px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md relative
                ${selected ? "border-blue-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Node ID Badge */}
            {showNodeIds && (
                <div className="absolute -top-6 left-2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded font-mono whitespace-nowrap shadow-md">
                    ID: {id}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-blue-50 dark:bg-blue-900/20 rounded-t-lg">
                <Repeat className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-sm">Loop Start</span>
            </div>

            {/* Body */}
            <div className="px-3 py-3">
                <div className="text-xs text-muted-foreground mb-1">Variable:</div>
                <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 mb-2">
                    {iterator}
                </div>
                <div className="text-xs text-muted-foreground mb-1">Source List:</div>
                <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 truncate" title={items}>
                    {items}
                </div>
            </div>

            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Top}
                className="!w-3 !h-3 !bg-slate-400"
            />

            {/* Output Handles */}
            {/* We position them at bottom, maybe spread out? */}

            <div className="absolute bottom-0 left-1/4 transform -translate-x-1/2 translate-y-1/2 flex flex-col items-center">
                <Handle
                    type="source"
                    position={Position.Bottom}
                    id="body"
                    className="!w-3 !h-3 !bg-blue-500 !relative !transform-none"
                    style={{ left: 0 }}
                />
                <span className="text-[9px] font-bold text-blue-600 mt-1">Body</span>
            </div>

            <div className="absolute bottom-0 left-3/4 transform -translate-x-1/2 translate-y-1/2 flex flex-col items-center">
                <Handle
                    type="source"
                    position={Position.Bottom}
                    id="done"
                    className="!w-3 !h-3 !bg-slate-500 !relative !transform-none"
                    style={{ left: 0 }}
                />
                <span className="text-[9px] font-bold text-slate-500 mt-1">Done</span>
            </div>
        </div>
    );
});
