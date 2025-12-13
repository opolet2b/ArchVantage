import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot, Settings2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default memo(({ data }: { data: { label: string, model?: string } }) => {
    return (
        <Card className="min-w-[200px] shadow-md border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900">
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-500" />
            <CardHeader className="p-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-blue-500" />
                    <CardTitle className="text-sm font-bold">{data.label}</CardTitle>
                </div>
                <Settings2 className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground" />
            </CardHeader>
            <CardContent className="p-3 text-xs text-muted-foreground">
                Model: {data.model || "gpt-3.5-turbo"}
            </CardContent>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-500" />
        </Card>
    );
});
