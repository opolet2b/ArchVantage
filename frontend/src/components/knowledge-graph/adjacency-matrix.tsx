import React, { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AdjacencyMatrixProps {
    elements: any[];
}

export function AdjacencyMatrix({ elements }: AdjacencyMatrixProps) {
    const { nodes, edges, nodeMap, legendItems } = useMemo(() => {
        const nodes = elements.filter(e => e.group === 'nodes').map(e => e.data);
        const edges = elements.filter(e => e.group === 'edges').map(e => e.data);
        
        // Sort nodes by type, then label
        nodes.sort((a, b) => {
            if (a.type !== b.type) return (a.type || '').localeCompare(b.type || '');
            return (a.label || '').localeCompare(b.label || '');
        });

        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        
        const typeColorMap = new Map<string, string>();
        nodes.forEach(n => {
            if (n.type && n.color && !typeColorMap.has(n.type)) {
                typeColorMap.set(n.type, n.color);
            }
        });
        const legendItems = Array.from(typeColorMap.entries()).map(([type, color]) => ({ type, color }));

        return { nodes, edges, nodeMap, legendItems };
    }, [elements]);

    const cellMap = useMemo(() => {
        const map = new Map<string, any[]>();
        edges.forEach(edge => {
            const key = `${edge.source}-${edge.target}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(edge);
        });
        return map;
    }, [edges]);

    if (nodes.length === 0) {
        return <div className="flex-1 flex items-center justify-center text-muted-foreground">No nodes to display in matrix.</div>;
    }

    // Limit maximum rendering size for pure HTML table to avoid crashing
    const displayNodes = nodes.slice(0, 300);
    const isTruncated = nodes.length > 300;

    const [zoom, setZoom] = useState(1);

    const CELL_SIZE = 20 * zoom;
    const HEADER_WIDTH = 150 * zoom;
    const HEADER_HEIGHT = 150 * zoom;

    return (
        <div className="w-full h-full flex flex-col bg-white">
            {/* Legend Area */}
            <div className="flex flex-col gap-3 p-4 border-b border-slate-200 bg-slate-50 shrink-0 shadow-[inset_0_-1px_3px_rgba(0,0,0,0.02)]">
                {/* How to Read Legend */}
                <div className="flex items-center gap-6 text-xs text-slate-600 font-medium">
                    <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-md border border-slate-200 shadow-sm">
                        <strong className="text-slate-800">Axes:</strong>
                        <span>Rows = Source Nodes</span>
                        <span className="text-slate-300">|</span>
                        <span>Columns = Target Nodes</span>
                    </div>
                    
                    <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-md border border-slate-200 shadow-sm">
                        <strong className="text-slate-800">Cells:</strong>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-indigo-500 opacity-50"></div>
                            <span>Color = Source Node Type</span>
                        </div>
                        <span className="text-slate-300">|</span>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-indigo-600"></div>
                            <span>Darker = Multiple Relations</span>
                        </div>
                    </div>
                </div>

                {/* Node Types Legend */}
                {legendItems.length > 0 && (
                    <details className="group mt-1">
                        <summary className="text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer flex items-center gap-1 select-none w-max hover:text-indigo-600 transition-colors">
                            Node Types ({legendItems.length})
                            <span className="text-slate-400 group-open:rotate-180 transition-transform text-xs leading-none">▼</span>
                        </summary>
                        <div className="flex flex-wrap gap-2 items-center mt-2 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-md bg-white shadow-sm">
                            {legendItems.map(item => (
                                <div key={item.type} className="flex items-center text-[10px] text-slate-600 font-medium bg-slate-50 px-1.5 py-0.5 rounded shadow-sm border border-slate-100">
                                    <span className="w-2 h-2 rounded-full mr-1.5 shadow-sm shrink-0" style={{ backgroundColor: item.color }}></span>
                                    <span className="truncate max-w-[150px]" title={item.type}>{item.type}</span>
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </div>
            
            <div className="flex-1 flex flex-col p-4 bg-slate-50 overflow-hidden relative">
                
                {/* Floating Zoom Controls */}
                <div className="absolute bottom-8 right-8 z-40 flex items-center gap-1 bg-white border border-slate-200 shadow-lg rounded-md p-1.5">
                    <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Zoom Out">
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold w-12 text-center text-slate-600">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(1)} className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Reset Zoom">
                        <Maximize className="w-4 h-4" />
                    </button>
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Zoom In">
                        <ZoomIn className="w-4 h-4" />
                    </button>
                </div>
            {isTruncated && (
                <div className="mb-4 shrink-0 text-xs bg-amber-50 text-amber-800 p-2 rounded border border-amber-200">
                    Matrix is truncated to 300 nodes for performance. Please use filters to narrow down the dataset.
                </div>
            )}
            
            <div className="flex-1 overflow-auto bg-white border border-slate-200 shadow-sm relative rounded-sm">
            
            <TooltipProvider>
                <div 
                    className="relative bg-white min-w-max" 
                    style={{ 
                        width: HEADER_WIDTH + displayNodes.length * CELL_SIZE, 
                        height: HEADER_HEIGHT + displayNodes.length * CELL_SIZE 
                    }}
                >
                    {/* Background Grid and Cells */}
                    <div 
                        className="absolute z-0" 
                        style={{ 
                            top: HEADER_HEIGHT, 
                            left: HEADER_WIDTH, 
                            width: displayNodes.length * CELL_SIZE, 
                            height: displayNodes.length * CELL_SIZE,
                            backgroundImage: `linear-gradient(to right, #f1f5f9 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)`,
                            backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`
                        }}
                    >
                        {displayNodes.map((rowNode, rIndex) => 
                            displayNodes.map((colNode, cIndex) => {
                                const key = `${rowNode.id}-${colNode.id}`;
                                const cellEdges = cellMap.get(key) || [];
                                
                                if (cellEdges.length === 0) return null;

                                const edgeLabel = cellEdges.map(e => e.label).join(', ');
                                const bgColor = rowNode.color || '#6366f1';

                                return (
                                    <Tooltip key={key} delayDuration={100}>
                                        <TooltipTrigger asChild>
                                            <div 
                                                className="absolute border-r border-b border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
                                                style={{ 
                                                    top: rIndex * CELL_SIZE,
                                                    left: cIndex * CELL_SIZE, 
                                                    width: CELL_SIZE, 
                                                    height: CELL_SIZE,
                                                    backgroundColor: bgColor,
                                                    opacity: Math.min(0.4 + cellEdges.length * 0.2, 1),
                                                    zIndex: 10
                                                }}
                                            />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs max-w-[200px] break-words">
                                            <p><strong>Source:</strong> {rowNode.label}</p>
                                            <p><strong>Target:</strong> {colNode.label}</p>
                                            <p><strong>Relations:</strong> {edgeLabel}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                );
                            })
                        )}
                    </div>

                    {/* Top Headers Wrapper */}
                    <div className="sticky top-0 z-20 h-0 w-0">
                        <div className="absolute bg-white border-b border-slate-200" style={{ left: HEADER_WIDTH, width: displayNodes.length * CELL_SIZE, height: HEADER_HEIGHT }}>
                            {displayNodes.map((n, i) => (
                                <Tooltip key={`col-${n.id}`} delayDuration={100}>
                                    <TooltipTrigger asChild>
                                        <div 
                                            className="absolute flex justify-center whitespace-nowrap overflow-hidden text-[10px] text-slate-500 border-l border-slate-100 pt-2 bg-white hover:bg-slate-50 transition-colors"
                                            style={{ top: 0, left: i * CELL_SIZE, width: CELL_SIZE, height: HEADER_HEIGHT }}
                                        >
                                            <span 
                                                className="truncate text-slate-600 hover:text-slate-900 cursor-default"
                                                style={{ writingMode: 'vertical-rl', maxHeight: HEADER_HEIGHT - 10 }}
                                            >
                                                {n.label}
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                        <p>{n.label}</p>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </div>
                    </div>

                    {/* Left Headers Wrapper */}
                    <div className="sticky left-0 z-20 h-0 w-0">
                        <div className="absolute bg-white border-r border-slate-200" style={{ top: HEADER_HEIGHT, left: 0, width: HEADER_WIDTH, height: displayNodes.length * CELL_SIZE }}>
                            {displayNodes.map((n, i) => (
                                <Tooltip key={`row-${n.id}`} delayDuration={100}>
                                    <TooltipTrigger asChild>
                                        <div 
                                            className="absolute flex items-center justify-end text-[10px] text-slate-600 border-b border-slate-100 pr-2 truncate bg-white hover:bg-slate-50 transition-colors"
                                            style={{ top: i * CELL_SIZE, left: 0, width: HEADER_WIDTH, height: CELL_SIZE }}
                                        >
                                            <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: n.color || '#ccc' }}></span>
                                            <span className="truncate">{n.label}</span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        <p>{n.label}</p>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </div>
                    </div>

                    {/* Top-Left Corner Wrapper */}
                    <div className="sticky top-0 left-0 z-30 h-0 w-0">
                        <div className="absolute bg-white border-b border-r border-slate-200" style={{ top: 0, left: 0, width: HEADER_WIDTH, height: HEADER_HEIGHT }}></div>
                    </div>

                </div>
            </TooltipProvider>
            </div>
            </div>
        </div>
    );
}
