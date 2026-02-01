"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Plus, X, Code } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Condition Builder Component
 *
 * Provides a user-friendly dropdown-based UI for building IF conditions
 * in the template structure editor.
 */

// Available operators for conditions
const OPERATORS = [
    { value: "exists", label: "exists", needsValue: false },
    { value: "not_exists", label: "does not exist", needsValue: false },
    { value: "equals", label: "equals", needsValue: true },
    { value: "not_equals", label: "not equals", needsValue: true },
    { value: "contains", label: "contains", needsValue: true },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: "is not empty", needsValue: false },
    { value: "greater_than", label: ">", needsValue: true },
    { value: "less_than", label: "<", needsValue: true },
    { value: "has_items", label: "has items", needsValue: false },
];

// Common template variables with descriptions grouped by context
const VARIABLE_GROUPS = [
    {
        label: "📄 Source Document",
        description: "The document(s) being analyzed",
        variables: [
            { value: "source", label: "source", description: "The source document" },
            { value: "source.title", label: "source.title", description: "Title of source document" },
            { value: "source.type", label: "source.type", description: "Type of source (text, document, image...)" },
            { value: "source.content", label: "source.content", description: "Content of source document" },
        ],
    },
    {
        label: "📚 All Things",
        description: "All selected items",
        variables: [
            { value: "things", label: "things", description: "List of all selected things" },
            { value: "Data", label: "Data", description: "Extracted data from sources" },
        ],
    },
    {
        label: "🔄 Loop Item (inside loops)",
        description: "Current item when inside a LOOP block",
        variables: [
            { value: "item", label: "item", description: "Current loop item" },
            { value: "item.type", label: "item.type", description: "Type of current item" },
            { value: "item.title", label: "item.title", description: "Title of current item" },
            { value: "item.content", label: "item.content", description: "Content of current item" },
        ],
    },
];

interface Condition {
    id: string;
    variable: string;
    operator: string;
    value: string;
}

interface ConditionBuilderProps {
    /** The raw condition string (e.g., "Data Available" or "item.type == 'chart'") */
    value: string;
    /** Callback when condition changes */
    onChange: (condition: string) => void;
    /** Optional list of available variables from template context */
    availableVariables?: string[];
    /** Whether to show in compact mode */
    compact?: boolean;
}

/**
 * Parses a condition string into structured condition object
 */
function parseCondition(conditionStr: string): Condition {
    const id = Math.random().toString(36).substr(2, 9);

    if (!conditionStr || conditionStr.trim() === "") {
        return { id, variable: "", operator: "exists", value: "" };
    }

    // Try to parse equality: variable == 'value' or variable == "value"
    const eqMatch = conditionStr.match(
        /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*==\s*['"](.*?)['"]$/
    );
    if (eqMatch) {
        return { id, variable: eqMatch[1], operator: "equals", value: eqMatch[2] };
    }

    // Try to parse inequality: variable != 'value'
    const neqMatch = conditionStr.match(
        /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*!=\s*['"](.*?)['"]$/
    );
    if (neqMatch) {
        return { id, variable: neqMatch[1], operator: "not_equals", value: neqMatch[2] };
    }

    // Try to parse comparison: variable > value or variable < value
    const gtMatch = conditionStr.match(
        /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*>\s*(\d+)$/
    );
    if (gtMatch) {
        return { id, variable: gtMatch[1], operator: "greater_than", value: gtMatch[2] };
    }

    const ltMatch = conditionStr.match(
        /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*<\s*(\d+)$/
    );
    if (ltMatch) {
        return { id, variable: ltMatch[1], operator: "less_than", value: ltMatch[2] };
    }

    // Try to parse length check: variable|length > 0
    const lengthMatch = conditionStr.match(
        /^([a-zA-Z_][a-zA-Z0-9_.]*)\|length\s*>\s*0$/
    );
    if (lengthMatch) {
        return { id, variable: lengthMatch[1], operator: "has_items", value: "" };
    }

    // Try to parse "in" check for contains: 'value' in variable
    const inMatch = conditionStr.match(
        /^['"](.*?)['"]\s+in\s+([a-zA-Z_][a-zA-Z0-9_.]*)$/
    );
    if (inMatch) {
        return { id, variable: inMatch[2], operator: "contains", value: inMatch[1] };
    }

    // Try to parse "not" prefix: not variable
    const notMatch = conditionStr.match(/^not\s+([a-zA-Z_][a-zA-Z0-9_.]*)$/);
    if (notMatch) {
        return { id, variable: notMatch[1], operator: "not_exists", value: "" };
    }

    // Default: treat as simple existence check (truthy)
    // The whole string is the variable name
    return { id, variable: conditionStr.trim(), operator: "exists", value: "" };
}

/**
 * Serializes a condition object back to a string for the backend
 */
function serializeCondition(condition: Condition): string {
    const { variable, operator, value } = condition;

    if (!variable.trim()) {
        return "";
    }

    switch (operator) {
        case "exists":
            return variable;
        case "not_exists":
            return `not ${variable}`;
        case "equals":
            return `${variable} == '${value}'`;
        case "not_equals":
            return `${variable} != '${value}'`;
        case "contains":
            return `'${value}' in ${variable}`;
        case "is_empty":
            return `${variable}|length == 0`;
        case "is_not_empty":
            return `${variable}|length > 0`;
        case "greater_than":
            return `${variable} > ${value}`;
        case "less_than":
            return `${variable} < ${value}`;
        case "has_items":
            return `${variable}|length > 0`;
        default:
            return variable;
    }
}

export function ConditionBuilder({
    value,
    onChange,
    availableVariables = [],
    compact = false,
}: ConditionBuilderProps) {
    const [condition, setCondition] = useState<Condition>(() =>
        parseCondition(value)
    );
    const [isRawMode, setIsRawMode] = useState(false);
    const [rawValue, setRawValue] = useState(value);

    // Flatten all variables from groups for lookup
    const allKnownVariables = VARIABLE_GROUPS.flatMap(g => g.variables.map(v => v.value));

    // Update condition when value prop changes externally
    useEffect(() => {
        const parsed = parseCondition(value);
        setCondition(parsed);
        setRawValue(value);
    }, [value]);

    // Handle condition change
    const handleConditionChange = (updates: Partial<Condition>) => {
        const newCondition = { ...condition, ...updates };
        setCondition(newCondition);

        // Serialize and emit
        const serialized = serializeCondition(newCondition);
        onChange(serialized);
    };

    // Handle raw mode change
    const handleRawChange = (newRaw: string) => {
        setRawValue(newRaw);
        onChange(newRaw);
    };

    // Get current operator config
    const currentOperator = OPERATORS.find((op) => op.value === condition.operator);
    const needsValue = currentOperator?.needsValue ?? false;

    // Find description for current variable
    const currentVarInfo = VARIABLE_GROUPS.flatMap(g => g.variables).find(v => v.value === condition.variable);

    // Toggle between builder and raw mode
    if (isRawMode) {
        return (
            <div className="flex items-center gap-2 flex-1">
                <Input
                    value={rawValue}
                    className="h-8 flex-1 font-mono text-sm"
                    onChange={(e) => handleRawChange(e.target.value)}
                    placeholder="e.g. item.type == 'chart'"
                />
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => {
                        setIsRawMode(false);
                        setCondition(parseCondition(rawValue));
                    }}
                    title="Switch to visual builder"
                >
                    Builder
                </Button>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "flex items-center gap-2 flex-1 flex-wrap",
                compact && "gap-1"
            )}
        >
            {/* Variable Select with Grouped Options */}
            <Select
                value={condition.variable}
                onValueChange={(v) => handleConditionChange({ variable: v })}
            >
                <SelectTrigger
                    className={cn("h-8 w-44", compact && "w-36")}
                    title={currentVarInfo?.description || "Select a variable"}
                >
                    <SelectValue placeholder="Select variable..." />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                    {VARIABLE_GROUPS.map((group) => (
                        <div key={group.label} className="mb-2">
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                                {group.label}
                            </div>
                            {group.variables.map((v) => (
                                <SelectItem
                                    key={v.value}
                                    value={v.value}
                                    className="pl-4"
                                >
                                    <div className="flex flex-col">
                                        <span className="font-mono text-sm">{v.label}</span>
                                        <span className="text-xs text-muted-foreground">{v.description}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </div>
                    ))}
                    {/* Show custom variable if not in known list */}
                    {condition.variable &&
                        !allKnownVariables.includes(condition.variable) && (
                            <div className="border-t mt-2 pt-2">
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                    ✏️ Custom
                                </div>
                                <SelectItem value={condition.variable} className="pl-4">
                                    <span className="font-mono">{condition.variable}</span>
                                </SelectItem>
                            </div>
                        )}
                </SelectContent>
            </Select>

            {/* Operator Select */}
            <Select
                value={condition.operator}
                onValueChange={(v) => handleConditionChange({ operator: v })}
            >
                <SelectTrigger className={cn("h-8 w-32", compact && "w-24")}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                            {op.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Value Input (conditional) */}
            {needsValue && (
                <Input
                    value={condition.value}
                    className={cn("h-8 w-32", compact && "w-24")}
                    onChange={(e) => handleConditionChange({ value: e.target.value })}
                    placeholder="Value..."
                />
            )}

            {/* Raw Mode Toggle */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-slate-600"
                onClick={() => {
                    setIsRawMode(true);
                    setRawValue(serializeCondition(condition));
                }}
                title="Switch to raw expression mode"
            >
                <Code className="h-4 w-4" />
            </Button>
        </div>
    );
}

export default ConditionBuilder;
