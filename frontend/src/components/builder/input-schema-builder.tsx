
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useSchemaDiscovery } from "@/hooks/use-schema-discovery";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputSchemaBuilderProps {
    value: string; // The JSON string
    onChange: (value: string) => void;
    nodeId?: string; // For schema discovery (current node ID)
}

const MAPPING_TYPES = [
    { label: "Any (No Cast)", value: "any", wrap: (s: string) => s },
    { label: "String", value: "str", wrap: (s: string) => `str(${s})` },
    { label: "Integer", value: "int", wrap: (s: string) => `int(${s})` },
    { label: "Float", value: "float", wrap: (s: string) => `float(${s})` },
    { label: "Boolean", value: "bool", wrap: (s: string) => `bool(${s})` },
    { label: "List", value: "list", wrap: (s: string) => `list(${s})` },
    { label: "Dict", value: "dict", wrap: (s: string) => `dict(${s})` },
    { label: "Date", value: "date", wrap: (s: string) => `date(${s})` },
    { label: "DateTime", value: "datetime", wrap: (s: string) => `datetime(${s})` },
    { label: "Time", value: "time", wrap: (s: string) => `time(${s})` },
];

export function InputSchemaBuilder({ value, onChange, nodeId }: InputSchemaBuilderProps) {
    const { incoming, isLoading } = useSchemaDiscovery(nodeId);

    // Builder State
    const [selectedSourceNode, setSelectedSourceNode] = useState<string>("");
    const [selectedSourceField, setSelectedSourceField] = useState<string>("");
    const [selectedType, setSelectedType] = useState<string>("any");
    const [keyName, setKeyName] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Derived list of fields for the dropdown
    const sourceOptions = incoming.flatMap(schema =>
        schema.fields.map(field => ({
            value: field.name,
            label: field.label || field.name,
            nodeId: schema.node_id,
            nodeLabel: schema.label
        }))
    );

    // Filter options based on selected node if one is selected, but we want a global list grouped by node
    // Actually, distinct groupings are better. Let's group by node ID/Label.
    const uniqueNodes = Array.from(new Set(incoming.map(s => s.node_id)))
        .map(id => incoming.find(s => s.node_id === id)!);

    const handleAdd = () => {
        if (!keyName) {
            setError("Key name is required");
            return;
        }
        if (!selectedSourceNode || !selectedSourceField) {
            setError("Source field is required");
            return;
        }

        setError(null);

        // Construct the value expression
        // Handle safe node ID (underscores instead of dashes for Python)
        const safeNodeId = selectedSourceNode.replace(/-/g, "_");
        // Handle safe field access (bracket notation if special chars)
        const isIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(selectedSourceField);
        const fieldAccess = isIdentifier
            ? `${safeNodeId}.${selectedSourceField}`
            : `${safeNodeId}['${selectedSourceField}']`;

        const typeDef = MAPPING_TYPES.find(t => t.value === selectedType);
        const wrappedValue = typeDef ? typeDef.wrap(`{{${fieldAccess}}}`) : `{{${fieldAccess}}}`;

        // Update the JSON
        try {
            let currentJson: Record<string, any> = {};
            if (value && value.trim()) {
                // Try to parse existing JSON. If fails, we can't safely add structurally.
                // But we can try to be lenient or reset?
                if (value.trim().startsWith("{")) {
                    currentJson = JSON.parse(value);
                } else {
                    // It's a string or invalid JSON. We will overwrite or error?
                    // User said "Input Schema... editing manually". 
                    // Let's assume we treat it as an object if possible.
                    setError("Current content is not valid JSON. Clear it or fix syntax to add variables.");
                    return;
                }
            }

            // Add/Update key
            // Note: We are injecting the literal string "{{expression}}" which will be serialized as value
            currentJson[keyName] = wrappedValue;

            onChange(JSON.stringify(currentJson, null, 2));
            setKeyName(""); // specific reset
        } catch (e) {
            setError("Invalid JSON in editor. Fix syntax before adding.");
        }
    };

    const handleRemove = (keyToRemove: string) => {
        try {
            if (!value || !value.trim()) return;
            const currentJson = JSON.parse(value);
            delete currentJson[keyToRemove];
            onChange(JSON.stringify(currentJson, null, 2));
        } catch (e) {
            setError("Invalid JSON. Cannot remove key.");
        }
    };

    // Get current keys for "Remove" functionality
    let currentKeys: string[] = [];
    try {
        if (value && value.trim().startsWith("{")) {
            const parsed = JSON.parse(value);
            currentKeys = Object.keys(parsed);
        }
    } catch { }

    return (
        <div className="space-y-3 border rounded-md p-3 bg-slate-50 dark:bg-slate-900/50">
            <Label className="text-xs font-semibold">Input Schema Builder</Label>

            {/* 1. Source Selection */}
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Source Node</Label>
                    <select
                        className="w-full h-8 text-xs rounded-md border bg-background px-2"
                        value={selectedSourceNode}
                        onChange={(e) => {
                            setSelectedSourceNode(e.target.value);
                            setSelectedSourceField(""); // Reset field when node changes
                        }}
                    >
                        <option value="">Select Node...</option>
                        {uniqueNodes.map(node => (
                            <option key={node.node_id} value={node.node_id}>{node.label}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Source Field</Label>
                    <select
                        className="w-full h-8 text-xs rounded-md border bg-background px-2"
                        value={selectedSourceField}
                        onChange={(e) => setSelectedSourceField(e.target.value)}
                        disabled={!selectedSourceNode}
                    >
                        <option value="">Select Field...</option>
                        {sourceOptions
                            .filter(opt => opt.nodeId === selectedSourceNode)
                            .map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))
                        }
                    </select>
                </div>
            </div>

            {/* 2. Type & Key */}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Type Cast</Label>
                    <select
                        className="w-full h-8 text-xs rounded-md border bg-background px-2"
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                    >
                        {MAPPING_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">JSON Key Name</Label>
                    <Input
                        className="h-8 text-xs"
                        placeholder="e.g. user_name"
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                    />
                </div>
                <Button size="sm" className="h-8 px-3" onClick={handleAdd} disabled={!selectedSourceField || !keyName}>
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            {error && <p className="text-[10px] text-red-500">{error}</p>}

            {/* 3. Helper to Remove Keys */}
            {currentKeys.length > 0 && (
                <div className="pt-2 border-t">
                    <Label className="text-[10px] text-muted-foreground mb-1 block">Current Keys (Click to Remove)</Label>
                    <div className="flex flex-wrap gap-1">
                        {currentKeys.map(key => (
                            <button
                                key={key}
                                onClick={() => handleRemove(key)}
                                className="flex items-center gap-1 text-[10px] bg-white dark:bg-slate-800 border rounded px-1.5 py-0.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                                title="Remove field"
                            >
                                {key} <Trash2 className="h-3 w-3" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 4. Manual Editor */}
            <div className="space-y-1 pt-2">
                <Label className="text-[10px] text-muted-foreground">Preview / Manual Edit (JSON)</Label>
                <Textarea
                    className="font-mono text-xs min-h-[100px] leading-tight"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="{ ... }"
                />
            </div>
        </div>
    );
}
