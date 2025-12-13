"use client";

/**
 * HTTP Request Node Component
 *
 * Visual node for HTTP_REQUEST primitive.
 * Shows method badge, URL preview, and status indicator.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Globe, AlertCircle, CheckCircle } from "lucide-react";

interface HTTPRequestData {
    label: string;
    primitiveType: string;
    params: {
        method?: string;
        url?: string;
        status?: "idle" | "success" | "error";
    };
}

export const HttpRequestNode = memo(function HttpRequestNode({
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as HTTPRequestData;

    // Safely convert values to strings (handles objects from LLM)
    const safeString = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return val;
        return JSON.stringify(val);
    };

    const method = safeString(nodeData.params?.method) || "GET";
    const url = safeString(nodeData.params?.url) || "https://...";
    const status = nodeData.params?.status || "idle";

    const methodColors: Record<string, string> = {
        GET: "bg-green-500",
        POST: "bg-blue-500",
        PUT: "bg-amber-500",
        PATCH: "bg-purple-500",
        DELETE: "bg-red-500",
    };

    return (
        <div
            className={`
                min-w-[200px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md
                ${selected ? "border-blue-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-slate-50 dark:bg-slate-800 rounded-t-lg">
                <Globe className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-sm">HTTP Request</span>
                <span
                    className={`ml-auto px-2 py-0.5 text-xs font-bold text-white rounded ${methodColors[method] || "bg-gray-500"
                        }`}
                >
                    {method}
                </span>
            </div>

            {/* Body */}
            <div className="px-3 py-2">
                <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {url}
                </div>
                <div className="flex items-center gap-1 mt-2">
                    {status === "success" && (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                    )}
                    {status === "error" && (
                        <AlertCircle className="h-3 w-3 text-red-500" />
                    )}
                    <span className="text-xs text-muted-foreground capitalize">
                        {status}
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
                id="output"
                className="!w-3 !h-3 !bg-blue-500"
            />
            <Handle
                type="source"
                position={Position.Right}
                id="error"
                className="!w-3 !h-3 !bg-red-500"
            />
        </div>
    );
});
