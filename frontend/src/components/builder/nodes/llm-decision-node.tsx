"use client";

/**
 * LLM Decision Node Component
 *
 * Visual node for LLM_DECISION primitive.
 * Uses AI for reasoning and routing decisions.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Brain } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";

interface LlmDecisionData {
    label: string;
    primitiveType: string;
    params: {
        model?: string;
        instruction?: string;
    };
}

export const LlmDecisionNode = memo(function LlmDecisionNode({
    id,
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as LlmDecisionData;
    const showNodeIds = useBuilderStore((state) => state.showNodeIds);

    const safeString = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return val;
        return JSON.stringify(val);
    };

    const model = safeString(nodeData.params?.model) || "default";
    const instruction = safeString(nodeData.params?.instruction) || "AI decision";

    return (
        <div
            className={`
                min-w-[200px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md relative
                ${selected ? "border-pink-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Node ID Badge */}

            {showNodeIds && (

                <div className="absolute -top-6 left-2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded font-mono whitespace-nowrap shadow-md">
                    ID: {id}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 rounded-t-lg">
                <Brain className="h-4 w-4 text-pink-500" />
                <span className="font-medium text-sm">LLM Decision</span>
                <span className="ml-auto text-xs text-muted-foreground">{model}</span>
            </div>

            {/* Body */}
            <div className="px-3 py-3">
                <div className="text-xs bg-slate-100 dark:bg-slate-800 rounded px-2 py-1.5 line-clamp-2">
                    {instruction}
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
                className="!w-3 !h-3 !bg-pink-500"
            />
        </div>
    );
});
