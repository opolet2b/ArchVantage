"use client";

/**
 * Call Tool Node Component
 *
 * Visual node for CALL_TOOL primitive.
 * Shows tool icon and name.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Wrench } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";

interface CallToolData {
    label: string;
    primitiveType: string;
    params: {
        tool_id?: number;
        tool_name?: string;
        tool_description?: string;
    };
}

export const CallToolNode = memo(function CallToolNode({
    id,
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as CallToolData;
    const activeNodeId = useBuilderStore((state) => state.activeNodeId);
    const isActive = activeNodeId === id;

    const safeString = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return val;
        return JSON.stringify(val);
    };

    const toolName = safeString(nodeData.params?.tool_name) || "Select Tool";
    const toolDescription = safeString(nodeData.params?.tool_description);

    return (
        <div
            className={`
                min-w-[180px] max-w-[220px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md transition-all
                ${isActive ? "border-orange-500 ring-2 ring-orange-300 animate-pulse" : ""}
                ${selected && !isActive ? "border-purple-500" : ""}
                ${!selected && !isActive ? "border-slate-200 dark:border-slate-700" : ""}
            `}
        >
            {/* Header */}
            <div className={`flex items-center gap-2 px-3 py-2 border-b rounded-t-lg ${isActive ? "bg-orange-50 dark:bg-orange-900/20" : "bg-purple-50 dark:bg-purple-900/20"}`}>
                <Wrench className={`h-4 w-4 ${isActive ? "text-orange-500" : "text-purple-500"}`} />
                <span className="font-medium text-sm">Call Tool</span>
                {isActive && <span className="text-xs text-orange-600 ml-auto">Running...</span>}
            </div>

            {/* Body */}
            <div className="px-3 py-3">
                <div className="text-sm font-medium">{toolName}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {toolDescription || "Invokes registered tool"}
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
                className={`!w-3 !h-3 ${isActive ? "!bg-orange-500" : "!bg-purple-500"}`}
            />
        </div>
    );
});

