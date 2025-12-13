"use client";

/**
 * Text Template Node Component
 *
 * Visual node for TEXT_TEMPLATE primitive.
 * Shows template preview.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";

interface TextTemplateData {
    label: string;
    primitiveType: string;
    params: {
        template_string?: string;
    };
}

export const TextTemplateNode = memo(function TextTemplateNode({
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as TextTemplateData;

    // Safely convert values to strings (handles objects from LLM)
    const safeString = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return val;
        return JSON.stringify(val);
    };

    const template = safeString(nodeData.params?.template_string) || "{{ template }}";

    return (
        <div
            className={`
                min-w-[180px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md
                ${selected ? "border-cyan-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-cyan-50 dark:bg-cyan-900/20 rounded-t-lg">
                <FileText className="h-4 w-4 text-cyan-500" />
                <span className="font-medium text-sm">Text Template</span>
            </div>

            {/* Body */}
            <div className="px-3 py-3">
                <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 truncate max-w-[160px]">
                    {template.slice(0, 50)}
                    {template.length > 50 ? "..." : ""}
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
                className="!w-3 !h-3 !bg-cyan-500"
            />
        </div>
    );
});
