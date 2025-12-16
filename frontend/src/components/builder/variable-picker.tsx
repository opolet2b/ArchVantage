import * as React from "react";
import { Wand2, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBuilderStore } from "@/lib/builder-store";
import { cn } from "@/lib/utils";

interface VariablePickerProps {
    onSelect: (variablePath: string) => void;
}

export function VariablePicker({ onSelect }: VariablePickerProps) {
    const { lastExecutionState, nodes } = useBuilderStore();
    const [open, setOpen] = React.useState(false);

    if (!lastExecutionState || Object.keys(lastExecutionState).length === 0) {
        return (
            <Button variant="outline" size="icon" disabled title="Run Dry Run first to pick variables">
                <Wand2 className="h-4 w-4 text-muted-foreground" />
            </Button>
        );
    }

    // Organize variables by node
    // lastExecutionState has both top-level keys (variables) and node-scoped keys (node_id)
    // We prefer looking for node-scoped keys that match existing nodes.
    const nodeVariables = nodes.map(node => {
        const output = lastExecutionState[node.id];
        return {
            node,
            output: output as Record<string, any> | undefined
        };
    }).filter(item => item.output && Object.keys(item.output).length > 0);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="icon" title="Pick variable from last run">
                    <Wand2 className="h-4 w-4 text-blue-500" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="p-2 bg-muted/50 border-b">
                    <h4 className="font-medium text-xs">Available Variables</h4>
                </div>
                <ScrollArea className="h-[300px]">
                    <div className="p-2 space-y-1">
                        {nodeVariables.length === 0 && (
                            <div className="text-xs text-muted-foreground p-2">
                                No node outputs found in last execution.
                            </div>
                        )}
                        {nodeVariables.map(({ node, output }) => (
                            <NodeVariableGroup
                                key={node.id}
                                nodeLabel={node.data.label as string || node.id}
                                nodeId={node.id}
                                output={output!}
                                onSelect={(path) => {
                                    onSelect(path);
                                    setOpen(false);
                                }}
                            />
                        ))}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}

function NodeVariableGroup({
    nodeLabel,
    nodeId,
    output,
    onSelect
}: {
    nodeLabel: string,
    nodeId: string,
    output: Record<string, any>,
    onSelect: (path: string) => void
}) {
    const [expanded, setExpanded] = React.useState(false);

    // Flatten keys for display? Or recursive? 
    // Let's do 1 level deep for now, or recursive if simple json
    // For simplicity, we just list top level keys of the output
    const keys = Object.keys(output).filter(k => !k.startsWith('_'));

    return (
        <div className="border rounded-md overflow-hidden bg-background">
            <button
                className="w-full flex items-center gap-2 p-2 text-xs hover:bg-muted text-left"
                onClick={() => setExpanded(!expanded)}
            >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span className="font-medium truncate flex-1">{nodeLabel}</span>
                <span className="text-[10px] text-muted-foreground mono">{nodeId}</span>
            </button>

            {expanded && (
                <div className="border-t bg-slate-50 dark:bg-slate-900/50 p-1 space-y-0.5">
                    {keys.map(key => (
                        <button
                            key={key}
                            className="w-full text-left text-xs p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded flex justify-between group"
                            onClick={() => onSelect(`${nodeId}.${key}`)}
                        >
                            <span className="font-mono text-blue-600 dark:text-blue-400">{key}</span>
                            <span className="text-muted-foreground truncate max-w-[100px] opacity-70 group-hover:opacity-100">
                                {JSON.stringify(output[key])}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
