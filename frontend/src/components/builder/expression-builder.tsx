"use client";

import { cn, API_URL } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import { useBuilderStore } from "@/lib/builder-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ExpressionBuilderProps {
    value: string;
    onChange: (value: string) => void;
}

type CompareType = "value" | "variable";

const OPERATORS = [
    { label: "Equals (==)", value: "==" },
    { label: "Not Equals (!=)", value: "!=" },
    { label: "Greater Than (>)", value: ">" },
    { label: "Less Than (<)", value: "<" },
    { label: "Greater/Equal (>=)", value: ">=" },
    { label: "Less/Equal (<=)", value: "<=" },
    { label: "Contains (in)", value: "in" },
];

export function ExpressionBuilder({ value, onChange }: ExpressionBuilderProps) {
    const nodes = useBuilderStore((state) => state.nodes);

    // Determine mode: Visual or Text
    // We try to parse the expression to see if it fits our simple model
    // {{node.var}} OP value
    // or {{node.var}} OP {{node.var}}
    const [mode, setMode] = useState<"visual" | "text">("visual");

    // Internal state for visual builder
    const [leftNodeId, setLeftNodeId] = useState<string>("");
    const [leftVar, setLeftVar] = useState<string>("");
    const [operator, setOperator] = useState<string>("==");
    const [rightType, setRightType] = useState<CompareType>("value");
    const [rightValue, setRightValue] = useState<string>("");
    const [rightNodeId, setRightNodeId] = useState<string>("");
    const [rightVar, setRightVar] = useState<string>("");

    // Schema cache: nodeId -> variable list
    const [nodeSchemas, setNodeSchemas] = useState<Record<string, string[]>>({});
    const [loadingSchemas, setLoadingSchemas] = useState<Record<string, boolean>>({});

    // Fetch schema for a node
    const fetchSchema = async (nodeId: string) => {
        if (!nodeId || nodeSchemas[nodeId] || loadingSchemas[nodeId]) return;

        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        setLoadingSchemas(prev => ({ ...prev, [nodeId]: true }));

        const type = node.data.primitiveType;
        let vars: string[] = ["output"]; // Default

        try {
            if (type === "HTTP_REQUEST") {
                vars = ["response", "status", "headers"];
            } else if (type === "CALL_TOOL") {
                const toolId = (node.data.params as any)?.tool_id;
                if (toolId) {
                    const res = await fetch(`${API_URL}/tools/${toolId}`, {
                        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
                    });
                    if (res.ok) {
                        const tool = await res.json();
                        // Try to parse output schema
                        const outputSchema = tool.configuration?.output_schema;
                        if (outputSchema?.properties) {
                            vars = Object.keys(outputSchema.properties);
                        } else if (tool.tool_type === "gui") {
                            // For GUI tools, schema IS the configuration (which is JSON schema)
                            if (tool.configuration?.properties) {
                                vars = Object.keys(tool.configuration.properties);
                            }
                        }
                    }
                }
            } else if (type === "LLM_DECISION") {
                vars = ["decision", "reasoning"];
            } else if (type === "START") {
                // Ideally trigger schema discovery for start input
                vars = ["input_data"];
            }
        } catch (e) {
            console.error("Failed to fetch schema for node", nodeId, e);
        } finally {
            setNodeSchemas(prev => ({ ...prev, [nodeId]: vars }));
            setLoadingSchemas(prev => ({ ...prev, [nodeId]: false }));
        }
    };

    // Trigger fetch on selection
    useEffect(() => {
        if (leftNodeId) fetchSchema(leftNodeId);
    }, [leftNodeId]);

    useEffect(() => {
        if (rightNodeId) fetchSchema(rightNodeId);
    }, [rightNodeId]);

    // Parse effect
    useEffect(() => {
        if (!value) return;

        // Simple regex to parse standard format
        // Matches {{key}} OP value or {{key}} OP {{key}}
        // Note: This is fragile and only works for simple expressions built by this tool
        // Match simple comparison: left op right. 
        // Allow left to be "variable" or "node.variable".
        // Allow right to be "value" or "variable".
        // Removed {{}} requirement.
        const visualRegex = /^\s*([^\s=!<>&|]+)\s+(==|!=|>|<|>=|<=|in)\s+(.+)\s*$/;
        const match = value.match(visualRegex);

        if (match) {
            const [_, leftPath, op, rightPart] = match;
            setOperator(op);

            // Parse Left
            // Parse Left which might look like "node_id.prop" or "prop"
            // We need to be careful not to split if node_id wasn't sanitized, but since we are sanitizing on save,
            // we assume incoming valid python expressions use dot notation.
            // Regex to match "part1.part2" or "part1"
            const leftParts = leftPath.split(".");
            if (leftParts.length >= 2) {
                // If the user manually edited renaming dashes to underscores, we can't easily map back to UUID with dashes unless we search nodes.
                // However, for visual builder to work, we rely on the Select's values.
                // We'll try to find a node that matches the prefix (conceptually).
                // But the Select uses UUIDs.
                // If we sanitized "call_tool_123" but the node ID is "call_tool-123", we need to reverse generic logic or fuzzy match?
                // For now, let's assume the ID in the expression is what we use.
                // Wait, if we change ID generation to replace `-` with `_`, we lose the link to the actual node ID?
                // No, we will sanitize ONLY for the string generation.
                // When PARSING back, we might fail to match the select value if select value has dashes.
                // Fix: Sanitize logic should be strict.
                setLeftNodeId(leftParts[0]);
                setLeftVar(leftParts.slice(1).join("."));
            } else {
                setLeftVar(leftPath);
            }

            // Parse Right
            // Regex for right side variable: matches something like "node_id.prop"
            const rightVarMatch = rightPart.match(/^([a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?)$/);
            // Note: This regex is simplistic. 
            // If rightPart is NOT a string literal (quoted) and NOT a number/bool, treat as variable?
            const isString = /^["'].*["']$/.test(rightPart);
            const isNumber = !isNaN(Number(rightPart)) && rightPart.trim() !== "";
            const isBool = rightPart === "true" || rightPart === "false";

            if (!isString && !isNumber && !isBool && rightVarMatch) {
                setRightType("variable");
                const rightParts = rightPart.split(".");
                if (rightParts.length >= 2) {
                    setRightNodeId(rightParts[0]);
                    setRightVar(rightParts.slice(1).join("."));
                } else {
                    setRightVar(rightPart);
                }
            } else {
                setRightType("value");
                // Remove quotes if string
                const cleanValue = rightPart.replace(/^["']|["']$/g, "");
                setRightValue(cleanValue);
            }
            setMode("visual");
        } else {
            // If doesn't match simple format, default to text mode
            // unless it's empty
            if (value.trim() !== "") {
                setMode("text");
            }
        }
    }, []); // Run once on mount (or when value prop changes externally? No, avoid loops)

    // Build expression string
    useEffect(() => {
        if (mode === "text") return;

        let left = "";
        if (leftNodeId && leftVar) {
            // sanitize: replace dashes with underscores for python compatibility
            const sanitizedId = leftNodeId.replace(/-/g, "_");
            const sanitizedVar = leftVar.replace(/-/g, "_");
            left = `${sanitizedId}.${sanitizedVar}`;
        }

        let right = "";
        if (rightType === "variable") {
            if (rightNodeId && rightVar) {
                const sanitizedId = rightNodeId.replace(/-/g, "_");
                const sanitizedVar = rightVar.replace(/-/g, "_");
                right = `${sanitizedId}.${sanitizedVar}`;
            }
        } else {
            // Auto-quote if it looks like a string (not number, not boolean)
            // AND user hasn't already quoted it.
            const isNumber = !isNaN(Number(rightValue)) && rightValue.trim() !== "";
            const isBool = rightValue === "true" || rightValue === "false";
            const isQuoted = /^["'].*["']$/.test(rightValue);

            if (rightValue === "") {
                right = '""';
            } else if (isNumber || isBool || isQuoted) {
                // Trust the user's input/format
                right = rightValue;
            } else {
                // Add quotes
                right = `"${rightValue}"`;
            }
        }

        if (left && operator && right) {
            const expr = `${left} ${operator} ${right}`;
            if (expr !== value) {
                onChange(expr);
            }
        }
    }, [leftNodeId, leftVar, operator, rightType, rightValue, rightNodeId, rightVar, mode]);

    if (mode === "text") {
        return (
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label>Expression</Label>
                    <Button variant="ghost" size="sm" onClick={() => setMode("visual")} className="h-6 text-xs">
                        Switch to Visual Builder
                    </Button>
                </div>
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="amount > 1000"
                />
            </div>
        );
    }

    return (
        <div className="space-y-3 border rounded-md p-3 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex justify-between items-center mb-2">
                <Label className="text-xs font-semibold">Expression Builder</Label>
                <Button variant="ghost" size="sm" onClick={() => setMode("text")} className="h-6 text-xs text-muted-foreground">
                    Edit as Text
                </Button>
            </div>

            {/* Left Operand */}
            <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase">Left Operand</Label>
                <div className="flex gap-2">
                    <Select value={leftNodeId} onValueChange={setLeftNodeId}>
                        <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue placeholder="Select Node" />
                        </SelectTrigger>
                        <SelectContent>
                            {nodes.map(node => (
                                <SelectItem key={node.id} value={node.id}>
                                    {(node.data.label as string) || node.id}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={leftVar} onValueChange={setLeftVar} disabled={!leftNodeId}>
                        <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue placeholder={loadingSchemas[leftNodeId] ? "Loading..." : "Variable"} />
                        </SelectTrigger>
                        <SelectContent>
                            {(nodeSchemas[leftNodeId] || []).map(v => (
                                <SelectItem key={v} value={v}>{v}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Operator */}
            <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase">Operator</Label>
                <Select value={operator} onValueChange={setOperator}>
                    <SelectTrigger className="w-full h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {OPERATORS.map(op => (
                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Right Operand */}
            <div className="space-y-1">
                <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-muted-foreground uppercase">Right Operand</Label>
                    <div className="flex gap-1 bg-slate-200 dark:bg-slate-800 rounded p-0.5">
                        <button
                            onClick={() => setRightType("value")}
                            className={`px-2 py-0.5 text-[10px] rounded ${rightType === "value" ? "bg-white dark:bg-slate-600 shadow-sm" : "hover:bg-black/5"}`}
                        >
                            Value
                        </button>
                        <button
                            onClick={() => setRightType("variable")}
                            className={`px-2 py-0.5 text-[10px] rounded ${rightType === "variable" ? "bg-white dark:bg-slate-600 shadow-sm" : "hover:bg-black/5"}`}
                        >
                            Variable
                        </button>
                    </div>
                </div>

                {rightType === "variable" ? (
                    <div className="flex gap-2">
                        <Select value={rightNodeId} onValueChange={setRightNodeId}>
                            <SelectTrigger className="flex-1 h-8 text-xs">
                                <SelectValue placeholder="Select Node" />
                            </SelectTrigger>
                            <SelectContent>
                                {nodes.map(node => (
                                    <SelectItem key={node.id} value={node.id}>
                                        {(node.data.label as string) || node.id}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={rightVar} onValueChange={setRightVar} disabled={!rightNodeId}>
                            <SelectTrigger className="flex-1 h-8 text-xs">
                                <SelectValue placeholder={loadingSchemas[rightNodeId] ? "Loading..." : "Variable"} />
                            </SelectTrigger>
                            <SelectContent>
                                {(nodeSchemas[rightNodeId] || []).map(v => (
                                    <SelectItem key={v} value={v}>{v}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : (
                    <Input
                        value={rightValue}
                        onChange={(e) => setRightValue(e.target.value)}
                        className="h-8 text-xs"
                        placeholder="Enter value..."
                    />
                )}
            </div>

            {/* Preview */}
            <div className="pt-2 border-t">
                <div className="text-[10px] text-muted-foreground mb-1">Generated Expression:</div>
                <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded break-all">
                    {value || <span className="text-muted-foreground italic">Incomplete...</span>}
                </div>
            </div>
        </div>
    );
}
