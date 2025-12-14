"use client"

import React, { useCallback } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    BackgroundVariant,
    Connection,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { Card } from '@/components/ui/card';
import AgentNode from './nodes/agent-node';
import { HelpTooltip } from '@/components/ui/help-tooltip';

const nodeTypes = {
    agent: AgentNode,
};

const initialNodes = [
    { id: '1', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Start Agent', model: 'gpt-3.5-turbo' } },
    { id: '2', type: 'agent', position: { x: 0, y: 150 }, data: { label: 'Research Agent', model: 'gpt-4' } },
];
const initialEdges = [{ id: 'e1-2', source: '1', target: '2' }];

export function WorkflowEditor() {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    );

    return (
        <div className="h-[calc(100vh-4rem)] w-full p-4">
            <Card className="h-full w-full shadow-xl border-slate-200 dark:border-slate-800 overflow-hidden relative">
                <div className="absolute top-4 right-4 z-10">
                    <HelpTooltip contentPath="workflow/editor_overview" />
                </div>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                >
                    <Controls />
                    <MiniMap />
                    <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                </ReactFlow>
            </Card>
        </div>
    );
}
