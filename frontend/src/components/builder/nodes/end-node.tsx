"use client";

/**
 * End Node Component
 *
 * Visual exit point node for agent workflows.
 * Features red/dark circular design indicating the workflow end.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Square } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";

/**
 * End node data interface.
 */
interface EndNodeData {
    label: string;
    primitiveType: string;
    params: Record<string, unknown>;
}

/**
 * End node component - exit point for agent workflows.
 */
export const EndNode = memo(function EndNode({
    id,
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as EndNodeData;
    const showNodeIds = useBuilderStore((state) => state.showNodeIds);

    return (
        <div
            className={`
                w-24 h-24 rounded-full border-2 bg-gradient-to-br from-red-500 to-red-700 
                shadow-lg flex flex-col items-center justify-center relative
                ${selected ? "border-red-300 ring-2 ring-red-300" : "border-red-800"}
            `}
        >
            {/* Node ID Badge */}

            {showNodeIds && (

                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded font-mono whitespace-nowrap shadow-md">
                    ID: {id}
                </div>
            )}
            {/* Input Handle (top) */}
            <Handle
                type="target"
                position={Position.Top}
                className="!w-4 !h-4 !bg-white !border-2 !border-red-600"
            />

            {/* Icon */}
            <Square className="h-8 w-8 text-white fill-white" />

            {/* Label */}
            <span className="text-white font-semibold text-sm mt-1">
                {nodeData.label || "End"}
            </span>
        </div>
    );
});
