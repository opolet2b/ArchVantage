"use client";

/**
 * Condition Node Component
 *
 * Visual node for CONDITION primitive (If/Else branching).
 * Diamond-shaped visual with True/False outputs.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";

interface ConditionData {
    label: string;
    primitiveType: string;
    params: {
        expression?: string;
    };
}

export const ConditionNode = memo(function ConditionNode({
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as ConditionData;

    const safeString = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return val;
        return JSON.stringify(val);
    };

    const expression = safeString(nodeData.params?.expression) || "condition";

    return (
        <div
            className={`
                min-w-[180px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md
                ${selected ? "border-amber-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-amber-50 dark:bg-amber-900/20 rounded-t-lg">
                <GitBranch className="h-4 w-4 text-amber-500" />
                <span className="font-medium text-sm">Condition</span>
            </div>

            {/* Body */}
            <div className="px-3 py-3">
                <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 truncate">
                    {expression}
                </div>
                <div className="flex justify-between mt-3 text-xs">
                    <span className="text-green-600 font-medium">✓ True</span>
                    <span className="text-red-600 font-medium">✗ False</span>
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
                id="true"
                style={{ left: "30%" }}
                className="!w-3 !h-3 !bg-green-500"
            />
            <Handle
                type="source"
                position={Position.Bottom}
                id="false"
                style={{ left: "70%" }}
                className="!w-3 !h-3 !bg-red-500"
            />
        </div>
    );
});
