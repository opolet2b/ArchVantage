"use client";

/**
 * JSON Mapping Node Component
 *
 * Visual node for JSON_MAPPING primitive.
 * Extracts and transforms JSON data.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileJson } from "lucide-react";

interface JsonMappingData {
    label: string;
    primitiveType: string;
    params: {
        source?: string;
        template?: string;
    };
}

export const JsonMappingNode = memo(function JsonMappingNode({
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as JsonMappingData;

    // Safely convert values to strings (handles objects from LLM)
    const safeString = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return val;
        return JSON.stringify(val);
    };

    const source = safeString(nodeData.params?.source) || "source";
    const template = safeString(nodeData.params?.template) || "$.path";

    return (
        <div
            className={`
                min-w-[180px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md
                ${selected ? "border-orange-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-orange-50 dark:bg-orange-900/20 rounded-t-lg">
                <FileJson className="h-4 w-4 text-orange-500" />
                <span className="font-medium text-sm">JSON Mapping</span>
            </div>

            {/* Body */}
            <div className="px-3 py-3 space-y-2">
                <div className="text-xs">
                    <span className="text-muted-foreground">Source: </span>
                    <span className="font-mono">{source}</span>
                </div>
                <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 truncate">
                    {template}
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
                className="!w-3 !h-3 !bg-orange-500"
            />
        </div>
    );
});
