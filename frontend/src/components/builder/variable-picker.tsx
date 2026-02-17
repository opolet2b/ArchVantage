import * as React from "react";
import { Wand2, ChevronRight, ChevronDown, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBuilderStore } from "@/lib/builder-store";
import { cn } from "@/lib/utils";
import { getNodeOutputSchema, SchemaField } from "@/lib/builder-utils";
import { PrimitiveType } from "@/lib/builder-types";

interface VariablePickerProps {
    onSelect: (variablePath: string) => void;
    nodeId?: string;
}

interface VariableGroup {
    nodeId: string;
    nodeLabel: string;
    variables: Array<{
        name: string;
        value?: any;
        type?: string;
        label?: string;
    }>;
}

export function VariablePicker({ onSelect, nodeId }: VariablePickerProps) {
    const { lastExecutionState, nodes, inputsSchema } = useBuilderStore();
    const [open, setOpen] = React.useState(false);

    // Calculate available variables from both Schema and Runtime state
    const variableGroups: VariableGroup[] = React.useMemo(() => {
        const groups: VariableGroup[] = [];

        // Scope: All nodes except current one (if provided)
        const candidateNodes = nodeId
            ? nodes.filter(n => n.id !== nodeId)
            : nodes;

        for (const node of candidateNodes) {
            const nodeData = node.data as { label?: string; primitiveType?: PrimitiveType; params: Record<string, unknown> };
            const nodeLabel = nodeData.label || node.id;
            const nodeType = nodeData.primitiveType || "START";

            // 1. Get Schema Variables
            const schemaFields = getNodeOutputSchema(
                nodeType,
                nodeData.params || {},
                inputsSchema
            );

            // 2. Get Runtime Variables
            const runtimeOutput = lastExecutionState?.[node.id] as Record<string, any> | undefined;
            const runtimeKeys = runtimeOutput ? Object.keys(runtimeOutput).filter(k => !k.startsWith('_')) : [];

            // 3. Merge
            const variablesMap = new Map<string, { name: string; value?: any; type?: string; label?: string }>();

            // Add schema fields first
            schemaFields.forEach(field => {
                variablesMap.set(field.name, {
                    name: field.name,
                    type: field.type,
                    label: field.label,
                    value: runtimeOutput?.[field.name]
                });
            });

            // Add extra runtime keys that weren't in schema
            runtimeKeys.forEach(key => {
                if (!variablesMap.has(key)) {
                    variablesMap.set(key, {
                        name: key,
                        value: runtimeOutput?.[key],
                        type: typeof runtimeOutput?.[key],
                        label: key
                    });
                }
            });

            if (variablesMap.size > 0) {
                groups.push({
                    nodeId: node.id,
                    nodeLabel,
                    variables: Array.from(variablesMap.values())
                });
            }
        }
        return groups;
    }, [nodes, lastExecutionState, nodeId]);

    const hasVariables = variableGroups.length > 0;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Insert Variable"
                    disabled={!hasVariables}
                >
                    <Wand2 className={cn("h-3.5 w-3.5", hasVariables ? "text-blue-500" : "text-muted-foreground")} />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="p-2 bg-muted/50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <h4 className="font-medium text-xs">Available Variables</h4>
                    </div>
                    {lastExecutionState && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                            Live Data
                        </span>
                    )}
                </div>
                <ScrollArea className="h-[350px]">
                    <div className="p-2 space-y-1">
                        {!hasVariables && (
                            <div className="text-xs text-muted-foreground p-2 text-center">
                                No variables found from other nodes.
                            </div>
                        )}
                        {variableGroups.map((group) => (
                            <NodeVariableGroup
                                key={group.nodeId}
                                group={group}
                                onSelect={(path) => {
                                    onSelect(path);
                                    setOpen(false);
                                }}
                            />
                        ))}
                    </div>
                </ScrollArea>
                <div className="p-2 border-t bg-slate-50 dark:bg-slate-900/50">
                    <p className="text-[10px] text-muted-foreground italic">
                        Tip: Expand objects to find nested lists for For-Each loops.
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    );
}

interface VariableItemProps {
    name: string;
    path: string;
    value: any;
    type?: string;
    label?: string;
    onSelect: (path: string) => void;
    level?: number;
}

function VariableItem({ name, path, value, type, label, onSelect, level = 0 }: VariableItemProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);

    // --- SMART JSON PARSING ---
    // Try to parse string values as JSON to allow drill-down
    const { traversableValue, isJsonString } = React.useMemo(() => {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
                try {
                    return { traversableValue: JSON.parse(trimmed), isJsonString: true };
                } catch (e) {
                    // Not valid JSON
                }
            }
        }
        return { traversableValue: value, isJsonString: false };
    }, [value]);

    // Check if value is traversable (object or array)
    const isTraversable = traversableValue !== null && typeof traversableValue === 'object';
    const isArray = Array.isArray(traversableValue);
    const hasItems = isTraversable && (isArray ? traversableValue.length > 0 : Object.keys(traversableValue).length > 0);

    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(path);
    };

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    };

    return (
        <div className="flex flex-col">
            <div
                className={cn(
                    "flex items-center gap-1 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded cursor-pointer group",
                    level > 0 && "ml-3 border-l pl-2"
                )}
                onClick={hasItems ? toggleExpand : handleSelect}
            >
                {hasItems ? (
                    <button onClick={toggleExpand} className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                ) : (
                    <div className="w-4" />
                )}

                <div className="flex flex-col flex-1 min-w-0" onClick={handleSelect}>
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 font-medium truncate">
                            {name}
                        </span>
                        {isArray && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded">List</span>}
                        {isTraversable && !isArray && <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded">Obj</span>}
                        {isJsonString && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded" title="Stringified JSON">JSON</span>}
                    </div>
                    {label && label !== name && (
                        <span className="text-[9px] text-muted-foreground truncate opacity-70">
                            {label}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100">
                    {value !== undefined && (
                        <span className="text-[9px] text-muted-foreground bg-white dark:bg-black px-1 rounded border shadow-sm">
                            {isArray ? `${traversableValue.length} items` : isJsonString ? 'JSON String' : typeof value === 'object' && value !== null ? 'Object' : String(value).substring(0, 20) + (String(value).length > 20 ? '...' : '')}
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                        onClick={handleSelect}
                        title="Select this path"
                    >
                        <Wand2 className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {isExpanded && isTraversable && (
                <div className="flex flex-col mt-0.5">
                    {isArray ? (
                        traversableValue.slice(0, 50).map((item: any, idx: number) => (
                            <VariableItem
                                key={idx}
                                name={`[${idx}]`}
                                path={`${path}.${idx}`}
                                value={item}
                                onSelect={onSelect}
                                level={level + 1}
                            />
                        ))
                    ) : (
                        Object.entries(traversableValue).map(([key, val]) => (
                            <VariableItem
                                key={key}
                                name={key}
                                path={`${path}.${key}`}
                                value={val}
                                onSelect={onSelect}
                                level={level + 1}
                            />
                        ))
                    )}
                    {isArray && traversableValue.length > 50 && (
                        <div className="text-[10px] text-muted-foreground italic ml-6 p-1">
                            ... {traversableValue.length - 50} more items
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function NodeVariableGroup({
    group,
    onSelect
}: {
    group: VariableGroup,
    onSelect: (path: string) => void
}) {
    const [expanded, setExpanded] = React.useState(false);

    return (
        <div className="border rounded-md overflow-hidden bg-background mb-1 shadow-sm">
            <button
                className="w-full flex items-center gap-2 p-2 text-xs hover:bg-muted text-left"
                onClick={() => setExpanded(!expanded)}
            >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span className="font-bold truncate flex-1">{group.nodeLabel}</span>
                <span className="text-[9px] text-muted-foreground font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded border">
                    {group.nodeId}
                </span>
            </button>

            {expanded && (
                <div className="border-t bg-white dark:bg-slate-950 p-1 space-y-0.5">
                    {group.variables.map(variable => (
                        <VariableItem
                            key={variable.name}
                            name={variable.name}
                            path={`${group.nodeId}.${variable.name}`}
                            value={variable.value}
                            type={variable.type}
                            label={variable.label}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

