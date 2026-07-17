import * as React from "react";
import { FormRenderer } from "@/components/tools/form-builder/form-renderer";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Thing, useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface FormToolViewerProps {
    thing: Thing;
}

export function FormToolViewer({ thing }: FormToolViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    let guiSchema = thing.content.gui_schema;
    if (typeof guiSchema === "string") {
        try {
            guiSchema = JSON.parse(guiSchema);
        } catch (e) {
            console.error("Failed to parse guiSchema string", e);
        }
    }
    
    const [values, setValues] = React.useState<Record<string, any>>(thing.content.values || {});
    const [status, setStatus] = React.useState<"idle" | "error" | "success">("idle");
    const [errorMessage, setErrorMessage] = React.useState<string>("");

    const onChange = (key: string, val: any) => {
        setValues(prev => ({ ...prev, [key]: val }));
        setStatus("idle");
    };

    const handleValidateAndExpose = () => {
        // Validation logic
        if (guiSchema?.properties) {
            const requiredFields: string[] = guiSchema.required || [];
            const missingFields = requiredFields.filter(field => {
                const val = values[field];
                return val === undefined || val === null || val === "";
            });

            if (missingFields.length > 0) {
                setStatus("error");
                setErrorMessage(`Missing required fields: ${missingFields.join(", ")}`);
                return;
            }
        } else if (guiSchema?.components) {
            const missingFields = guiSchema.components.filter((c: any) => {
                const fieldKey = c.id || c.key;
                const val = values[fieldKey];
                return c.required && (val === undefined || val === null || val === "");
            }).map((c: any) => c.label || c.id || c.key);
            if (missingFields.length > 0) {
                setStatus("error");
                setErrorMessage(`Missing required fields: ${missingFields.join(", ")}`);
                return;
            }
        }

        // Bundle populated schema
        const populatedSchema = {
            schema: guiSchema,
            data: values
        };

        // Update the Thing globally
        updateThing(thing.id, {
            content: {
                ...thing.content,
                values: values,
                populatedSchema: populatedSchema
            }
        });

        // Actively push to target nodes
        const state = useCanvasStore.getState();
        const outgoingLinks = state.links.filter(l => l.source_id === thing.id);
        outgoingLinks.forEach(l => {
            const targetNode = state.things.find(t => t.id === l.target_id);
            if (targetNode && targetNode.content?.input_mapping?.enabled) {
                const mapping = targetNode.content.input_mapping;
                const isAppend = mapping.behavior === "append";
                
                if (targetNode.type === "spreadsheet") {
                    const selectedKeys = mapping.selectedKeys || Object.keys(values);
                    const format = mapping.spreadsheet_format || "columns";
                    const currentData = targetNode.content.data || [];
                    const newColumnsConfig = { ...(targetNode.content.columnsConfig || {}) };
                    
                    let newRows: string[][] = [];

                    if (format === "columns") {
                        const newRow = selectedKeys.map((k: string) => String(values[k] ?? ""));
                        newRows = [newRow];
                        selectedKeys.forEach((k: string, i: number) => {
                            newColumnsConfig[i] = { ...newColumnsConfig[i], name: k };
                        });
                    } else if (format === "rows") {
                        newRows = selectedKeys.map((k: string) => [k, String(values[k] ?? "")]);
                        newColumnsConfig[0] = { ...newColumnsConfig[0], name: "Key" };
                        newColumnsConfig[1] = { ...newColumnsConfig[1], name: "Value" };
                    } else if (format === "raw") {
                        const outObj: any = {};
                        selectedKeys.forEach((k: string) => outObj[k] = values[k]);
                        newRows = [[JSON.stringify(outObj)]];
                        newColumnsConfig[0] = { ...newColumnsConfig[0], name: "Raw Data" };
                    }

                    updateThing(targetNode.id, {
                        content: {
                            ...targetNode.content,
                            data: isAppend ? [...currentData, ...newRows] : newRows,
                            columnsConfig: newColumnsConfig
                        }
                    });
                } else if (isAppend) {
                    const existingData = targetNode.content.ingested_data || [];
                    updateThing(targetNode.id, {
                        content: {
                            ...targetNode.content,
                            ingested_data: [...existingData, values]
                        }
                    });
                }
            }
        });

        setStatus("success");
        setErrorMessage("");
        
        // Log to console so external devs can see it
        console.log("Exposed Populated Schema for Form Tool:", populatedSchema);
    };

    const handleClear = () => {
        setValues({});
        setStatus("idle");
        setErrorMessage("");
        
        updateThing(thing.id, {
            content: {
                ...thing.content,
                values: {},
                populatedSchema: {
                    schema: guiSchema,
                    data: {}
                }
            }
        });
    };

    if (!guiSchema) {
        return (
            <div className="p-4 text-sm text-muted-foreground">
                No Form Schema configured for {thing.title || "this form tool"}.
            </div>
        );
    }

    const ActionFooter = () => (
        <div className="mt-4 pt-4 border-t flex items-center justify-between gap-2">
            <Button onClick={handleClear} variant="outline" size="sm" className="w-1/3">
                Clear
            </Button>
            <Button onClick={handleValidateAndExpose} size="sm" className="w-2/3">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Submit
            </Button>
            {status === "success" && (
                <div className="absolute bottom-16 right-4 text-xs text-green-600 bg-green-100 px-2 py-1 rounded shadow flex items-center gap-1 animate-in fade-in zoom-in duration-300">
                    <CheckCircle2 className="w-3 h-3" /> Data exposed successfully!
                </div>
            )}
            {status === "error" && (
                <div className="absolute bottom-16 right-4 text-xs text-rose-600 bg-rose-100 px-2 py-1 rounded shadow flex items-center gap-1 animate-in fade-in zoom-in duration-300">
                    <AlertCircle className="w-3 h-3" /> {errorMessage}
                </div>
            )}
        </div>
    );

    // 1. Components List Format (from GUI tool configuration)
    if (Array.isArray(guiSchema.components)) {
        return (
            <div className="p-4 bg-background h-full overflow-y-auto custom-scrollbar flex flex-col relative">
                <div className="flex-1">
                    <FormRenderer
                        widgets={guiSchema.components}
                        layout={guiSchema.layout}
                        value={values}
                        onChange={onChange}
                    />
                </div>
                <ActionFooter />
            </div>
        );
    }

    // 2. Standard JSON Schema Format
    if (guiSchema.properties) {
        return (
            <div className="p-4 bg-background h-full overflow-y-auto custom-scrollbar flex flex-col relative">
                <div className="flex-1 flex flex-col gap-3">
                    {Object.entries(guiSchema.properties).map(([key, valObj]) => {
                        const prop = valObj as any;
                        const label = prop.title || key;
                        const required = Array.isArray(guiSchema.required) && guiSchema.required.includes(key);
                        const propType = prop.type;
                        const val = values[key] !== undefined ? values[key] : "";

                        return (
                            <div key={key} className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    {label} {required && <span className="text-rose-500">*</span>}
                                </Label>
                                {prop.enum ? (
                                    <Select
                                        value={val}
                                        onValueChange={(v) => onChange(key, v)}
                                    >
                                        <SelectTrigger className="bg-popover border-border h-8 text-xs rounded">
                                            <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {prop.enum.map((opt: string) => (
                                                <SelectItem key={opt} value={opt} className="text-xs">
                                                    {opt}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : propType === "boolean" ? (
                                    <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={!!val}
                                            onChange={(e) => onChange(key, e.target.checked)}
                                            className="rounded bg-card border-border w-3.5 h-3.5"
                                        />
                                        {label}
                                    </label>
                                ) : propType === "string" && (key.includes("comment") || key.includes("note") || key.includes("desc")) ? (
                                    <Textarea
                                        value={val}
                                        onChange={(e) => onChange(key, e.target.value)}
                                        className="bg-card border-border text-xs min-h-[60px] rounded"
                                        rows={2}
                                    />
                                ) : (
                                    <Input
                                        type={propType === "number" || propType === "integer" ? "number" : "text"}
                                        value={val}
                                        onChange={(e) => onChange(key, propType === "number" || propType === "integer" ? Number(e.target.value) : e.target.value)}
                                        className="bg-card border-border text-xs h-8 rounded"
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
                <ActionFooter />
            </div>
        );
    }

    return (
        <div className="p-4 text-sm text-muted-foreground">
            Invalid form schema.
        </div>
    );
}
