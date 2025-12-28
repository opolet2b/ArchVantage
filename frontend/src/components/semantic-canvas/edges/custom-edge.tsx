import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from 'reactflow';

import { cn } from '@/lib/utils';

export const CustomEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    label,
    data,
}: EdgeProps) => {
    // data.offset is the "index" of this edge in the group of parallel edges
    // 0 = straight (default)
    // Positive = curve one way
    // Negative = curve the other way
    const offset = data?.offset || 0;

    // Calculate curvature based on offset
    // ReactFlow's standard curvature is usually ~0.25
    // We want to amplify it for outer edges.
    // However, getBezierPath doesn't take 'curvature' for the path shape directly in a way that shifts the center significantly for parallel edges without changing control points manually.

    // Actually, simply changing the path options implies we are recalculating the path.
    // To achieve the "rainbow" effect (parallel curves), we need to modify the control points.
    // getBezierPath returns [path, labelX, labelY]

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        // We can't easily "offset" the standard bezier with just parameters.
        // But we can trick it by modifying curvature if valid, or we implement a custom path function.
        // A simple trick for A->B parallel edges is to use 'curvature' param effectively if the source/target handles are compatible.
        // But often the best way is to calculate a Quadratic Bezier or just offset the middle.
    });

    // Custom Path Logic for Parallel Edges
    // We'll use a quadratic-like offset or manipulate the cubic bezier control points.
    // If offset is 0, use standard path.
    // If offset != 0, we need to calculate a path that arcs.

    // Let's try a simplified approach:
    // If we simply use getBezierPath, overlapping is inevitable.
    // We need to construct a custom path string.

    // Reuse getBezierPath but maybe we can't clean shift it.
    // Alternative: Self-made path generator.

    // Let's implement a custom getPath function that adds an offset to the control points perpendicular to the direction.
    const getCustomPath = () => {
        const centerX = (sourceX + targetX) / 2;
        const centerY = (sourceY + targetY) / 2;

        // Direction vector
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len === 0) return edgePath; // fallback

        // Normal vector (perpendicular)
        // (-dy, dx)
        const nx = -dy / len;
        const ny = dx / len;

        // Offset magnitude (e.g. 20px per index)
        const magnitude = offset * 25;

        // Control point shifted by magnitude
        // For a simple Quadratic curve: M start Q control end
        const controlX = centerX + nx * magnitude;
        const controlY = centerY + ny * magnitude;

        // However, React Flow uses Cubic Bezier (C) usually.
        // M start C c1 c2 end
        // We can shift both control points of a standard bezier?
        // Standard vertical handles:
        // c1 is (sourceX, sourceY + curvature)
        // c2 is (targetX, targetY - curvature)
        // This logic is complex to get strictly "parallel".

        // Simple approach: Use a Quadratic curve for the distinct styling.
        // It's robust and easy to calculate "arc height".
        return `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;
    };

    const isOffset = offset !== 0;
    const finalPath = isOffset ? getCustomPath() : edgePath;

    // Recalculate label position for custom path (approximate at Quadratic peak (t=0.5))
    // Quad(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
    // At t=0.5: 0.25 P0 + 0.5 P1 + 0.25 P2
    // = (P0 + 2P1 + P2) / 4
    let finalLabelX = labelX;
    let finalLabelY = labelY;

    if (isOffset) {
        const centerX = (sourceX + targetX) / 2;
        const centerY = (sourceY + targetY) / 2;
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len;
        const ny = dx / len;
        const magnitude = offset * 25;
        const controlX = centerX + nx * magnitude;
        const controlY = centerY + ny * magnitude;

        finalLabelX = 0.25 * sourceX + 0.5 * controlX + 0.25 * targetX;
        finalLabelY = 0.25 * sourceY + 0.5 * controlY + 0.25 * targetY;
    }

    return (
        <>
            <BaseEdge path={finalPath} markerEnd={markerEnd} style={style} />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${finalLabelX}px,${finalLabelY}px)`,
                        fontSize: 12,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan"
                >
                    {label && (
                        <div className={cn(
                            "px-2 py-1 rounded shadow-sm border text-[10px] font-medium",
                            "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800",
                            // Add hover effect or active state styles here
                            "hover:scale-105 transition-transform cursor-pointer"
                        )}
                            onClick={(event) => {
                                // Propagate click? The BaseEdge usually handles selection.
                                // But label click might need to trigger selection too explicitly if intercepted.
                                // For now keeping it simple.
                            }}
                        >
                            {label}
                        </div>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
