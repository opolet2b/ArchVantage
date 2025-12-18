"use client";

/**
 * Start Node Component
 *
 * Visual entry point node for agent workflows.
 * Features green circular design indicating the workflow start.
 */
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";

/**
 * Start node data interface.
 */
interface StartNodeData {
    label: string;
    primitiveType: string;
    params: Record<string, unknown>;
}

/**
 * Start node component - entry point for agent workflows.
 */
export const StartNode = memo(function StartNode({
    id,
    data,
    selected,
}: NodeProps) {
    const nodeData = data as unknown as StartNodeData;
    const activeNodeId = useBuilderStore((state) => state.activeNodeId);
    const showNodeIds = useBuilderStore((state) => state.showNodeIds);
    const isActive = activeNodeId === id;

    return (
        <div
            className={`
                w-24 h-24 rounded-full border-2 bg-gradient-to-br from-green-400 to-green-600 
                shadow-lg flex flex-col items-center justify-center transition-all relative
                ${isActive ? "ring-4 ring-orange-400 animate-pulse border-orange-500" : ""}
                ${selected && !isActive ? "border-green-300 ring-2 ring-green-300" : ""}
                ${!selected && !isActive ? "border-green-700" : ""}
            `}
        >
            {/* Node ID Badge */}
            {showNodeIds && (
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded font-mono whitespace-nowrap shadow-md">
                    ID: {id}
                </div>
            )}
            {/* Icon */}
            <Play className="h-8 w-8 text-white fill-white" />

            {/* Label */}
            <span className="text-white font-semibold text-sm mt-1">
                {nodeData.label || "Start"}
            </span>

            {/* Output Handle (bottom) */}
            <Handle
                type="source"
                position={Position.Bottom}
                className={`!w-4 !h-4 !bg-white !border-2 ${isActive ? "!border-orange-500" : "!border-green-600"}`}
            />
        </div>
    );
});

