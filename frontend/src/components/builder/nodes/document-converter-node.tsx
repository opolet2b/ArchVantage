"use client";

/**
 * Document Converter Node Component
 *
 * Visual node for DOCUMENT_CONVERTER primitive.
 * Shows input format, output format, and configuration status.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileStack } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";

interface DocumentConverterData {
    label: string;
    primitiveType: string;
    params: {
        input_file?: string;
        input_format?: string;
        output_format?: string;
        output_path?: string;
    };
}

export const DocumentConverterNode = memo(function DocumentConverterNode({
    id,
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as DocumentConverterData;
    const showNodeIds = useBuilderStore((state) => state.showNodeIds);

    // Safely convert values to strings
    const safeString = (val: unknown): string => {
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return val;
        return JSON.stringify(val);
    };

    const inputFormat = safeString(nodeData.params?.input_format) || "auto";
    const outputFormat = safeString(nodeData.params?.output_format) || "pdf";
    const hasInputFile = !!nodeData.params?.input_file;

    // Normalize format display
    const formatDisplay = (fmt: string) => {
        const upper = fmt.toUpperCase();
        if (upper === "MD") return "Markdown";
        if (upper === "AUTO") return "Auto-detect";
        return upper;
    };

    return (
        <div
            className={`
                min-w-[180px] max-w-[220px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md relative
                ${selected ? "border-teal-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Node ID Badge */}

            {showNodeIds && (

                <div className="absolute -top-6 left-2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded font-mono whitespace-nowrap shadow-md">
                    ID: {id}
                </div>
            )}
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-teal-50 dark:bg-teal-900/20 rounded-t-lg">
                <FileStack className="h-4 w-4 text-teal-500" />
                <span className="font-medium text-sm">Document Converter</span>
            </div>

            {/* Body */}
            <div className="px-3 py-3 space-y-2">
                <div className="text-xs space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Input:</span>
                        <span className="font-medium">{formatDisplay(inputFormat)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Output:</span>
                        <span className="font-medium">{formatDisplay(outputFormat)}</span>
                    </div>
                </div>
                {hasInputFile && (
                    <div className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                        Configured
                    </div>
                )}
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
                className="!w-3 !h-3 !bg-teal-500"
            />
        </div>
    );
});
