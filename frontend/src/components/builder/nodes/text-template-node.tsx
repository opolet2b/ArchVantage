"use client";

/**
 * Text Template Node Component (Markdown Generator)
 *
 * Visual node for TEXT_TEMPLATE primitive.
 * Shows configuration status: template, source, and LLM model.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileText, Check, Circle } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";

interface TextTemplateData {
    label: string;
    primitiveType: string;
    params: {
        source_text?: string;
        template_content?: string;
        llm_model?: string;
        output_variable?: string;
        // Legacy support
        template_string?: string;
    };
}

export const TextTemplateNode = memo(function TextTemplateNode({
    id,
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as TextTemplateData;
    const showNodeIds = useBuilderStore((state) => state.showNodeIds);

    // Check configuration status
    const hasTemplate = !!(
        nodeData.params?.template_content ||
        nodeData.params?.template_string
    );
    const hasSource = !!nodeData.params?.source_text;
    const model = nodeData.params?.llm_model || "default";

    // Determine if using new semantic mode or legacy simple mode
    const isSemanticMode = !!(
        nodeData.params?.source_text ||
        nodeData.params?.template_content
    );

    return (
        <div
            className={`
                min-w-[180px] rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md relative
                ${selected ? "border-cyan-500" : "border-slate-200 dark:border-slate-700"}
            `}
        >
            {/* Node ID Badge */}

            {showNodeIds && (

                <div className="absolute -top-6 left-2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded font-mono whitespace-nowrap shadow-md">
                    ID: {id}
                </div>
            )}
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-cyan-50 dark:bg-cyan-900/20 rounded-t-lg">
                <FileText className="h-4 w-4 text-cyan-500" />
                <span className="font-medium text-sm">
                    {isSemanticMode ? "Markdown Generator" : "Text Template"}
                </span>
            </div>

            {/* Body */}
            <div className="px-3 py-2 space-y-1">
                {isSemanticMode ? (
                    <>
                        {/* Semantic mode status */}
                        <div className="flex items-center gap-1.5 text-xs">
                            {hasTemplate ? (
                                <Check className="h-3 w-3 text-green-500" />
                            ) : (
                                <Circle className="h-3 w-3 text-slate-300" />
                            )}
                            <span className={hasTemplate ? "text-foreground" : "text-muted-foreground"}>
                                Template
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                            {hasSource ? (
                                <Check className="h-3 w-3 text-green-500" />
                            ) : (
                                <Circle className="h-3 w-3 text-slate-300" />
                            )}
                            <span className={hasSource ? "text-foreground" : "text-muted-foreground"}>
                                Source
                            </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 pt-1 border-t">
                            LLM: {model}
                        </div>
                    </>
                ) : (
                    /* Legacy mode - show template preview */
                    <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 truncate max-w-[160px]">
                        {"{{ template }}"}
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
                className="!w-3 !h-3 !bg-cyan-500"
            />
        </div>
    );
});
