"use client";

/**
 * ForEach Node Component
 *
 * Container node for FOREACH primitive (loops).
 * Shows iteration variable and sub-graph indicator.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";

interface ForEachData {
    label: string;
    primitiveType: string;
    params: {
        items?: string;
        iterator_var?: string;
    };
}

export const ForEachNode = memo(function ForEachNode({
    id,
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as ForEachData;
    const showNodeIds = useBuilderStore((state) => state.showNodeIds);

    const safeString = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return val;
        return JSON.stringify(val);
    };

    const items = safeString(nodeData.params?.items) || "items";
    const iteratorVar = safeString(nodeData.params?.iterator_var) || "item";

    return (
        <div
            className={`
                min-w-[200px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md relative
                ${selected ? "border-green-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Node ID Badge */}

            {showNodeIds && (

                <div className="absolute -top-6 left-2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded font-mono whitespace-nowrap shadow-md">
                    ID: {id}
                </div>
            )}
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-green-50 dark:bg-green-900/20 rounded-t-lg">
                <Repeat className="h-4 w-4 text-green-500" />
                <span className="font-medium text-sm">For Each</span>
            </div>

            {/* Body */}
            <div className="px-3 py-3">
                <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded px-2 py-1">
                    for {iteratorVar} in {items}
                </div>
                <div className="mt-3 p-2 border-2 border-dashed border-green-200 dark:border-green-800 rounded text-center">
                    <span className="text-xs text-muted-foreground">
                        Double-click to edit sub-graph
                    </span>
                </div>
            </div>

            {/* Handles */}
            <Handle
                type="target"
                position={Position.Top}
                className="!w-3 !h-3 !bg-slate-400"
            />
            <Handle
                type="source"
                position={Position.Bottom}
                className="!w-3 !h-3 !bg-green-500"
            />
        </div>
    );
});
