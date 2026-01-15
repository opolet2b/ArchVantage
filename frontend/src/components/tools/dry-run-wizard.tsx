"use client";

/**
 * Dry-Run Wizard Component
 *
 * Provides step-by-step interactive pipeline verification UI.
 * Guides users through input injection, safety checks, execution,
 * and mapping confirmation for each pipeline step.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Play,
    Loader2,
    CheckCircle,
    XCircle,
    AlertTriangle,
    ChevronRight,
    Zap,
} from "lucide-react";
import { cn, API_URL } from "@/lib/utils";


// Types for dry-run workflow
interface PipelineStep {
    step_id: string;
    function_ref: string;
    arguments: Record<string, string>;
}

interface RequiredInput {
    name: string;
    description: string;
    argument: string;
    default_value?: string;
}

interface MappingSuggestion {
    source_path: string;
    target_param: string;
    confidence: number;
    reason: string;
    target_type?: string;
}

interface SafetyWarning {
    step_id: string;
    function_name: string;
    warning_type: string;
    message: string;
}

interface DryRunWizardProps {
    toolId: number;
    pipeline: PipelineStep[];
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    onComplete: (
        verifiedPipeline: PipelineStep[],
        schemas: Record<string, unknown>,
        outputMappings: Record<string, string>
    ) => void;
    onCancel: () => void;
    open: boolean;
    description: string;
    selectedModel?: string;
}

type WizardState =
    | "idle"
    | "input_required"
    | "safety_warning"
    | "executing"
    | "mapping_review"
    | "completed"
    | "failed";


/**
 * Extract all available field paths from an object for mapping selection.
 * Handles MCP format and JSON strings.
 */
function extractFieldPaths(data: unknown, stepId: string, prefix: string = ""): string[] {
    const paths: string[] = [];
    // Note: Paths should match backend context structure which stores step output directly
    // e.g., step1.content[0].text NOT step1.result.content[0].text
    const basePath = prefix || stepId;

    if (data === null || data === undefined) {
        return paths;
    }

    // Check MCP response format
    if (typeof data === "object" && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj.content) && obj.content.length > 0) {
            const firstContent = obj.content[0] as Record<string, unknown>;
            if (firstContent?.type === "text" && typeof firstContent.text === "string") {
                const textContent = firstContent.text as string;
                const trimmed = textContent.trim();
                if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        paths.push(`${basePath}.content[0].text`);
                        paths.push(...extractParsedPaths(parsed, `${basePath}.content[0].text`));
                        return paths;
                    } catch {
                        // Not valid JSON
                    }
                }
            }
        }
    }

    // Check JSON string
    if (typeof data === "string") {
        const trimmed = data.trim();
        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
                const parsed = JSON.parse(trimmed);
                paths.push(basePath);
                paths.push(...extractParsedPaths(parsed, basePath));
                return paths;
            } catch {
                // Not valid JSON
            }
        }
        return [basePath];
    }

    if (typeof data !== "object") {
        return [basePath];
    }

    if (Array.isArray(data)) {
        if (data.length > 0) {
            // Always recurse into the first item to support primitives like ["Paris"] -> path[0]
            paths.push(...extractFieldPaths(data[0], stepId, `${basePath}[0]`));
        }
        paths.push(basePath);
        return paths;
    }

    // Object
    const obj = data as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        const fieldPath = `${basePath}.${key}`;

        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            paths.push(...extractFieldPaths(value, stepId, fieldPath));
        } else if (Array.isArray(value)) {
            paths.push(fieldPath);
            if (value.length > 0) {
                // Always recurse into array items
                paths.push(...extractFieldPaths(value[0], stepId, `${fieldPath}[0]`));
            }
        } else {
            paths.push(fieldPath);
        }
    }

    if (!prefix) {
        // Fallback path if no fields extracted
        paths.unshift(stepId);
    }

    return paths;
}

function extractParsedPaths(data: unknown, basePath: string): string[] {
    const paths: string[] = [];
    if (data === null || data === undefined || typeof data !== "object") return paths;

    if (Array.isArray(data)) {
        if (data.length > 0 && typeof data[0] === "object") {
            paths.push(...extractParsedPaths(data[0], `${basePath}[0]`));
        }
        return paths;
    }

    const obj = data as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        const fieldPath = `${basePath}.${key}`;

        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            paths.push(...extractParsedPaths(value, fieldPath));
        } else if (Array.isArray(value) && value.length > 0) {
            paths.push(fieldPath);
            if (typeof value[0] === "object") {
                paths.push(...extractParsedPaths(value[0], `${fieldPath}[0]`));
            }
        } else {
            paths.push(fieldPath);
        }
    }
    return paths;
}

/**
 * Get the type selector value from a JSON Schema property definition.
 * Maps JSON Schema types to dropdown option values.
 */
function getSchemaType(propDef: Record<string, unknown>): string {
    const schemaType = propDef?.type as string;
    if (!schemaType) return "auto";

    // Map JSON Schema types to our dropdown options
    switch (schemaType.toLowerCase()) {
        case "string":
            return "string";
        case "number":
            return "number";
        case "integer":
            return "integer";
        case "boolean":
            return "boolean";
        case "object":
        case "array":
            return "json";
        default:
            return "auto";
    }
}

/**
 * Recursively flatten a JSON Schema to find all leaf mappable nodes.
 * Returns an array of field descriptors { path, schema }.
 */
function flattenSchema(
    schema: any,
    prefix: string = ""
): Array<{ path: string, schema: any }> {
    let fields: Array<{ path: string, schema: any }> = [];

    if (!schema || !schema.properties) return fields;

    Object.entries(schema.properties).forEach(([key, def]: [string, any]) => {
        const fullPath = prefix ? `${prefix}.${key}` : key;

        if (def.type === 'object' && def.properties) {
            // Recurse into object
            fields = fields.concat(flattenSchema(def, fullPath));
        } else if (def.type === 'array' && def.items && def.items.type === 'object') {
            // For arrays of objects, we map the array root and keep recursing if needed? 
            // In a mapping UI, usually you map the array itself or objects into it.
            // Let's expose the array itself as a mappable target.
            // AND the recursive properties? 
            // If we have weather_report (array), we map it to "stepX.result.list".
            // If we have weather_report.date, that implies we are mapping INTO each item?
            // For now, let's just show the array root and primitive leaves.
            // But user screenshot showed "weather_report" (array) and wanted "weather_report.date".
            // So we MUST return properties of items for arrays-of-objects if we want to support that granularity.
            // If we assume the tool builder constructs objects via mapping...
            fields.push({ path: fullPath, schema: def });

            // Recurse into array items to support "weather_report[].date" if needed?
            // Or simpler: just treat it as object for mapping visibility
            fields = fields.concat(flattenSchema(def.items, fullPath));
        } else {
            // Leaf node (string, number, boolean, or array of primitives)
            fields.push({ path: fullPath, schema: def });
        }
    });

    return fields;
}

export function DryRunWizard({
    toolId,
    pipeline,
    inputSchema,
    outputSchema,
    onComplete,
    onCancel,
    open,
    description,
    selectedModel
}: DryRunWizardProps) {
    // Session state
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [totalSteps, setTotalSteps] = useState(0);
    const [wizardState, setWizardState] = useState<WizardState>("idle");

    // Input state
    const [requiredInputs, setRequiredInputs] = useState<RequiredInput[]>([]);
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [inputTypes, setInputTypes] = useState<Record<string, string>>({});  // Input type definitions

    // Safety warning state
    const [safetyWarning, setSafetyWarning] = useState<SafetyWarning | null>(null);

    // Execution result state
    const [stepOutput, setStepOutput] = useState<unknown>(null);
    const [mappingSuggestions, setMappingSuggestions] = useState<MappingSuggestion[]>([]);
    const [acceptedMappings, setAcceptedMappings] = useState<Record<string, string>>({});
    const [typeTransformations, setTypeTransformations] = useState<Record<string, string>>({});

    // Output schema mapping state
    const [outputMappings, setOutputMappings] = useState<Record<string, string>>({});
    const [allAvailablePaths, setAllAvailablePaths] = useState<string[]>([]);  // Accumulated paths from all steps

    // Error state
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Verified results
    const [verifiedPipeline, setVerifiedPipeline] = useState<PipelineStep[] | null>(null);
    const [capturedSchemas, setCapturedSchemas] = useState<Record<string, unknown>>({});
    const [finalOutput, setFinalOutput] = useState<unknown>(null);
    const [showFullOutput, setShowFullOutput] = useState(false);


    // Start the dry-run session
    const startSession = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setWizardState("executing");

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(
                `${API_URL}/tools/${toolId}/dry-run/start`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        pipeline: pipeline,
                        model_name: selectedModel
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Failed to start dry-run");
            }

            setSessionId(data.session_id);
            setTotalSteps(data.total_steps);
            setCurrentStep(data.current_step);
            setStepOutput(data.current_step_info || null);

            // Merge requirements: Backend detected + Input Schema defined
            const backendReqs = data.required_inputs || [];

            // Convert inputSchema into RequiredInput format
            const schemaReqs: RequiredInput[] = [];
            if (inputSchema && inputSchema.properties) {
                const props = inputSchema.properties as Record<string, any>;

                Object.entries(props).forEach(([name, def]) => {
                    // Check if already in backendReqs to avoid duplicates
                    if (!backendReqs.some((r: any) => r.name === name)) {
                        schemaReqs.push({
                            name,
                            argument: name, // Default to name mapping
                            description: def.description || `Input parameter: ${name}`
                        });
                    }
                });
            }

            const allRequirements = [...backendReqs, ...schemaReqs];

            if (allRequirements.length > 0) {
                setRequiredInputs(allRequirements);

                // Initialize input types and values from schema/backend defaults
                const newValues = { ...inputValues };
                const newTypes = { ...inputTypes };

                allRequirements.forEach(req => {
                    // Pre-fill value if suggested by backend
                    if (req.default_value && !newValues[req.name]) {
                        // Strip quotes if LLM returned JSON string "value"
                        let val = req.default_value;
                        if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) {
                            val = val.slice(1, -1);
                        }
                        newValues[req.name] = val;
                    }
                });

                if (inputSchema && inputSchema.properties) {
                    const props = inputSchema.properties as Record<string, any>;
                    Object.entries(props).forEach(([name, def]) => {
                        newTypes[name] = getSchemaType(def);
                    });
                }

                setInputValues(newValues);
                setInputTypes(newTypes);

                setWizardState("input_required");
            } else {
                await executeStep(data.session_id);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start");
            setWizardState("failed");
        } finally {
            setIsLoading(false);
        }
    }, [toolId, pipeline, inputSchema, selectedModel]);

    // Reset all state when dialog opens
    useEffect(() => {
        if (open) {
            // Reset to initial state for fresh verification
            setSessionId(null);
            setCurrentStep(0);
            setTotalSteps(0);
            setWizardState("idle");
            setRequiredInputs([]);
            setInputValues({});
            setInputTypes({});
            setSafetyWarning(null);
            setStepOutput(null);
            setMappingSuggestions([]);
            setAcceptedMappings({});
            setTypeTransformations({});
            setOutputMappings({});
            setAllAvailablePaths([]);  // Reset accumulated paths
            setError(null);
            setIsLoading(false);
            setVerifiedPipeline(null);
            setCapturedSchemas({});
            // Auto-start the session
            startSession();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, startSession]);  // Trigger when open changes

    // AI Suggestion Logic
    const suggestMappingsForInputs = useCallback(async (reqs: RequiredInput[]) => {
        console.log("suggestMappingsForInputs called. Description present:", !!description, "Inputs needed:", reqs.length);
        if (!description || reqs.length === 0) return;

        try {
            // Build simple context map from available paths
            const context: Record<string, string> = {};
            allAvailablePaths.forEach(path => {
                context[path] = path;
            });
            // Also include input schema fields if available
            if (inputSchema) {
                const fields = flattenSchema(inputSchema, "input");
                fields.forEach(f => {
                    context[f.path] = f.path;
                });
            }

            const targetSchema: Record<string, any> = {};
            reqs.forEach(r => {
                targetSchema[r.name] = r.description;
            });

            console.log("Suggesting mappings for:", {
                step: `step${currentStep}`,
                targetSchema,
                avaliableContextKeys: Object.keys(context),
                model: selectedModel
            })

            const response = await fetch(`${API_URL}/tools/suggest-mapping`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    description,
                    target_step_id: `step${currentStep}`,
                    target_input_schema: targetSchema,
                    available_context: context,
                    model_name: selectedModel
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const mapping = data.mapping || {};

                // Pre-fill inputs
                if (Object.keys(mapping).length > 0) {
                    console.log("Applying suggested mappings:", mapping)
                    setInputValues(prev => ({
                        ...prev,
                        ...mapping
                    }));
                } else {
                    console.log("No mappings returned from AI suggestion.")
                }
            } else {
                console.error("Suggest mapping API failed:", response.status, await response.text())
            }
        } catch (e) {
            console.error("Failed to suggest mappings", e);
        }
    }, [description, allAvailablePaths, inputSchema, currentStep, selectedModel]);

    // Trigger suggestion when entering input_required state
    useEffect(() => {
        console.log("Effect triggered. State:", wizardState, "Required Inputs:", requiredInputs.length);
        if (wizardState === "input_required" && requiredInputs.length > 0) {
            console.log("Triggering auto-mapping suggestion... SKIPPED to prevent overwrite.");
            // suggestMappingsForInputs(requiredInputs);
        }
    }, [wizardState, requiredInputs, suggestMappingsForInputs]);

    const submitInput = async () => {
        if (!sessionId) return;
        setIsLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(
                `${API_URL}/tools/${toolId}/dry-run/${sessionId}/input`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        input_data: inputValues,
                        input_types: inputTypes  // Send type definitions to backend
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Failed to submit input");
            }

            if (data.status === "pending_confirm" && data.safety_warning) {
                setSafetyWarning(data.safety_warning);
                setWizardState("safety_warning");
            } else {
                await executeStep(sessionId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit");
        } finally {
            setIsLoading(false);
        }
    };

    const executeStep = async (sid: string, confirmed: boolean = false) => {
        setIsLoading(true);
        setError(null);
        setWizardState("executing");

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(
                `${API_URL}/tools/${toolId}/dry-run/${sid}/execute`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ confirmed }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Execution failed");
            }

            if (!data.success) {
                throw new Error(data.error || "Step execution failed");
            }

            setStepOutput(data.output);
            setCapturedSchemas((prev) => ({
                ...prev,
                [data.step_id]: data.captured_schema,
            }));

            // Accumulate paths from this step for output schema mapping
            const stepPaths = extractFieldPaths(data.output, data.step_id);
            setAllAvailablePaths((prev) => {
                // Merge new paths, avoiding duplicates
                const merged = [...prev];
                stepPaths.forEach((path) => {
                    if (!merged.includes(path)) {
                        merged.push(path);
                    }
                });
                return merged;
            });

            // Always show mapping review after each step
            // This allows mapping to output schema for ALL steps (including last step)
            if (data.mapping_suggestions?.length > 0) {
                setMappingSuggestions(data.mapping_suggestions);
                const autoMappings: Record<string, string> = {};
                const autoTransforms: Record<string, string> = {};

                data.mapping_suggestions.forEach((s: MappingSuggestion) => {
                    console.log(`[DryRunWizard] Checking suggestion for ${s.target_param}:`, s);
                    if (s.confidence >= 0.7) {
                        autoMappings[s.target_param] = s.source_path;
                        // NEW: Set type transformation automatically
                        // If backend provides target_type, use it.
                        // Translate backend type (integer, number, etc.) to transformation value
                        if (s.target_type) {
                            console.log(`[DryRunWizard] Processing target_type for ${s.target_param}:`, s.target_type);
                            // Map schema types to transformation values
                            const typeMap: Record<string, string> = {
                                "string": "string",
                                "integer": "integer",
                                "number": "number",
                                "boolean": "boolean",
                                "object": "json",
                                "json": "json",
                                "array": "json"
                            };
                            const transform = typeMap[s.target_type.toLowerCase()];
                            console.log(`[DryRunWizard] Mapped transform:`, transform);

                            if (transform) {
                                autoTransforms[s.target_param] = transform;
                            }
                        }
                    }
                });
                setAcceptedMappings(autoMappings);
                setTypeTransformations(autoTransforms);
            } else {
                // No suggestions for next step, clear any previous ones
                setMappingSuggestions([]);
                setAcceptedMappings({});
            }
            // Always go to mapping_review to allow output schema mapping
            setWizardState("mapping_review");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Execution failed");
            setWizardState("failed");
        } finally {
            setIsLoading(false);
        }
    };

    const acceptMapping = async (
        sid: string,
        mapping: Record<string, string>,
        transformations: Record<string, string>
    ) => {
        setIsLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(
                `${API_URL}/tools/${toolId}/dry-run/${sid}/accept`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        mapping,
                        type_transformations: transformations,
                        output_mapping: outputMappings,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Failed to accept mapping");
            }

            if (data.status === "completed") {
                setVerifiedPipeline(data.verified_pipeline);
                setFinalOutput(data.final_output);
                setWizardState("completed");
            } else {
                setCurrentStep(data.current_step);
                setRequiredInputs(data.required_inputs || []);
                setStepOutput(null);
                setMappingSuggestions([]);
                setAcceptedMappings({});
                // Only reset next-step transformations, preserve output schema transformations
                setTypeTransformations((prev) => {
                    const preserved: Record<string, string> = {};
                    Object.entries(prev).forEach(([key, value]) => {
                        if (key.startsWith("output.")) {
                            preserved[key] = value;
                        }
                    });
                    return preserved;
                });
                setSafetyWarning(null);

                if (data.required_inputs?.length > 0) {
                    setWizardState("input_required");
                } else {
                    await executeStep(sid);
                }
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleComplete = () => {
        if (verifiedPipeline) {
            onComplete(verifiedPipeline, capturedSchemas, outputMappings);
        }
    };

    const renderProgress = () => (
        <div className="flex items-center gap-2 mb-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} className={cn("flex items-center gap-1", i < totalSteps - 1 && "flex-1")}>
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                        i < currentStep && "bg-green-500 text-white",
                        i === currentStep && "bg-blue-500 text-white",
                        i > currentStep && "bg-gray-200 text-gray-500"
                    )}>
                        {i < currentStep ? <CheckCircle className="h-4 w-4" /> : i + 1}
                    </div>
                    {i < totalSteps - 1 && (
                        <div className={cn("flex-1 h-1 rounded", i < currentStep ? "bg-green-500" : "bg-gray-200")} />
                    )}
                </div>
            ))}
        </div>
    );

    const stepId = pipeline[currentStep]?.step_id || `step${currentStep}`;
    const availablePaths = extractFieldPaths(stepOutput, stepId);

    // For output schema mapping: Show current step paths + any previously selected values
    // This allows seeing the current mapping while being able to change to current step values
    const outputSchemaDropdownPaths = React.useMemo(() => {
        const paths = new Set<string>(availablePaths);
        // Add any previously selected values that might be from earlier steps
        Object.values(outputMappings).forEach((selectedPath) => {
            if (selectedPath && !paths.has(selectedPath)) {
                paths.add(selectedPath);
            }
        });
        return Array.from(paths).sort();
    }, [availablePaths, outputMappings]);

    // Truncate helper for large outputs
    const renderOutput = (data: any) => {
        const str = JSON.stringify(data, null, 2);
        if (str.length > 2000 && !showFullOutput) {
            return (
                <div>
                    <pre className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded whitespace-pre-wrap break-all min-w-0">
                        {str.slice(0, 2000)}...
                    </pre>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-xs w-full"
                        onClick={() => setShowFullOutput(true)}
                    >
                        Show Full Output ({Math.round(str.length / 1024)} KB)
                    </Button>
                </div>
            );
        }
        return (
            <div>
                <pre className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded whitespace-pre-wrap break-all min-w-0">
                    {str}
                </pre>
                {str.length > 2000 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-xs w-full"
                        onClick={() => setShowFullOutput(false)}
                    >
                        Collapse Output
                    </Button>
                )}
            </div>
        );
    };


    return (
        <>
            <Dialog open={open && wizardState !== "safety_warning"} onOpenChange={() => onCancel()}>
                <DialogContent
                    className="sm:max-w-4xl sm:w-[90vw] max-h-[85vh] overflow-hidden flex flex-col"
                    style={{ maxWidth: '900px', width: '90vw' }}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-yellow-500" />
                            Pipeline Verification
                        </DialogTitle>
                        <DialogDescription>
                            Step-by-step verification to ensure correct data flow
                        </DialogDescription>
                    </DialogHeader>

                    {totalSteps > 0 && renderProgress()}

                    <div className="flex-1 max-h-[55vh] overflow-auto pr-4">
                        {wizardState === "input_required" && (
                            <div className="space-y-4">
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                                    <h4 className="font-medium text-blue-700 dark:text-blue-300 mb-2">
                                        Step {currentStep + 1}: Provide Test Input
                                    </h4>
                                </div>
                                <div className="space-y-3">
                                    {requiredInputs.map((input) => (
                                        <div key={input.name} className="space-y-1">
                                            <Label htmlFor={input.name}>{input.name}<span className="text-red-500 ml-1">*</span></Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id={input.name}
                                                    placeholder={input.description}
                                                    value={inputValues[input.name] || ""}
                                                    onChange={(e) => setInputValues((prev) => ({ ...prev, [input.name]: e.target.value }))}
                                                    className="flex-1"
                                                    disabled={isLoading}
                                                />
                                                <select
                                                    value={inputTypes[input.name] || "string"}
                                                    onChange={(e) => setInputTypes((prev) => ({ ...prev, [input.name]: e.target.value }))}
                                                    className="w-28 h-9 px-2 rounded-md border border-input bg-background text-xs"
                                                    title="Input type"
                                                    disabled={isLoading}
                                                >
                                                    <option value="string">String</option>
                                                    <option value="number">Number</option>
                                                    <option value="integer">Integer</option>
                                                    <option value="boolean">Boolean</option>
                                                    <option value="date">Date</option>
                                                    <option value="json">JSON</option>
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {((wizardState === "idle") || (wizardState === "executing")) && (
                            <div className="flex flex-col items-center justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                                <p className="text-muted-foreground">
                                    {wizardState === "idle" ? "Initializing session..." : `Executing step ${currentStep + 1}...`}
                                </p>
                            </div>
                        )}

                        {wizardState === "mapping_review" && (
                            <div className="space-y-4">
                                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                                    <h4 className="font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                                        <CheckCircle className="h-4 w-4" />
                                        Step {currentStep + 1} Executed Successfully
                                    </h4>
                                </div>

                                <div className="border rounded-lg p-3">
                                    <h5 className="text-sm font-medium mb-2">Output:</h5>
                                    <div className="overflow-auto max-h-96 w-full">
                                        {renderOutput(stepOutput)}
                                    </div>
                                </div>

                                {/* Debug View for LLM Instruction */}
                                {(stepOutput as Record<string, any>)?._debug_instruction && (
                                    <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                                        <h5 className="text-sm font-medium mb-2 flex items-center gap-2 text-blue-700 dark:text-blue-300">
                                            <Zap className="h-3 w-3" />
                                            Actual Instruction sent to LLM:
                                        </h5>
                                        <div className="overflow-auto max-h-48 max-w-full">
                                            <pre className="text-xs bg-white dark:bg-slate-900 p-2 rounded whitespace-pre-wrap font-sans text-muted-foreground border">
                                                {(stepOutput as Record<string, any>)._debug_instruction}
                                            </pre>
                                        </div>
                                    </div>
                                )}

                                {mappingSuggestions.length > 0 && (
                                    <div className="space-y-3">
                                        <h5 className="text-sm font-medium">Variable Mapping for Next Step:</h5>
                                        {mappingSuggestions.map((suggestion) => (
                                            <div key={suggestion.target_param} className="p-3 rounded border bg-slate-50 dark:bg-slate-900/50 space-y-2">
                                                <Label className="text-sm font-medium">{suggestion.target_param}</Label>
                                                <div className="flex gap-2">
                                                    <select
                                                        value={acceptedMappings[suggestion.target_param] || ""}
                                                        onChange={(e) => {
                                                            if (e.target.value === "") {
                                                                setAcceptedMappings((prev) => {
                                                                    const next = { ...prev };
                                                                    delete next[suggestion.target_param];
                                                                    return next;
                                                                });
                                                            } else {
                                                                setAcceptedMappings((prev) => ({ ...prev, [suggestion.target_param]: e.target.value }));
                                                            }
                                                        }}
                                                        className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm"
                                                    >
                                                        <option value="">-- Don't map --</option>

                                                        <optgroup label="Previous Step Output">
                                                            {availablePaths.map((path) => (
                                                                <option key={path} value={path}>{path}</option>
                                                            ))}
                                                        </optgroup>

                                                        {inputSchema && Object.keys(inputSchema.properties || {}).length > 0 && (
                                                            <optgroup label="Pipeline Input">
                                                                {Object.keys(inputSchema.properties || {}).map((key) => (
                                                                    <option key={`input.${key}`} value={`input.${key}`}>input.{key}</option>
                                                                ))}
                                                            </optgroup>
                                                        )}
                                                    </select>
                                                    {acceptedMappings[suggestion.target_param] && (
                                                        <select
                                                            value={typeTransformations[suggestion.target_param] || "auto"}
                                                            onChange={(e) => setTypeTransformations((prev) => ({ ...prev, [suggestion.target_param]: e.target.value }))}
                                                            className="w-28 h-9 px-2 rounded-md border border-input bg-background text-xs"
                                                        >
                                                            <option value="auto">Auto</option>
                                                            <option value="string">→ String</option>
                                                            <option value="number">→ Number</option>
                                                            <option value="integer">→ Integer</option>
                                                            <option value="boolean">→ Boolean</option>
                                                            <option value="json">→ JSON</option>
                                                        </select>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* DEBUG: Temporary helper to diagnose schema issues */}
                                {false && (
                                    <div className="mt-4 p-2 bg-slate-100 dark:bg-slate-800 text-xs font-mono rounded overflow-auto max-h-32">
                                        <p className="font-bold text-muted-foreground mb-1">Debug Output Schema:</p>
                                        {JSON.stringify(outputSchema || "No Output Schema Passed", null, 2)}
                                    </div>
                                )}

                                {(() => {
                                    if (!outputSchema) return null;

                                    const fieldsToMap = flattenSchema(outputSchema);
                                    // Allow mapping the root if it is an array
                                    const isArrayRoot = outputSchema.type === "array";

                                    if (fieldsToMap.length === 0 && !isArrayRoot) return null;

                                    return (
                                        <div className="space-y-3 mt-4 pt-4 border-t">
                                            <h5 className="text-sm font-medium text-purple-600 dark:text-purple-400">
                                                Map to Pipeline Output Schema:
                                            </h5>

                                            {/* Root List Mapping for Arrays */}
                                            {isArrayRoot && (
                                                <div className="p-3 rounded border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20 space-y-2">
                                                    <Label className="text-sm font-medium">Output List Source <span className="text-muted-foreground">(Array)</span></Label>
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={outputMappings["__root__"] || ""}
                                                            onChange={(e) => {
                                                                if (e.target.value === "") {
                                                                    setOutputMappings((prev) => {
                                                                        const next = { ...prev };
                                                                        delete next["__root__"];
                                                                        return next;
                                                                    });
                                                                } else {
                                                                    setOutputMappings((prev) => ({ ...prev, "__root__": e.target.value }));
                                                                }
                                                            }}
                                                            className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm"
                                                        >
                                                            <option value="">-- Auto-detect (Heuristic) --</option>
                                                            {outputSchemaDropdownPaths.map((path) => (
                                                                <option key={path} value={path}>{path}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Select the field from the tool output that contains the list.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Recursive Property Mapping */}
                                            {fieldsToMap.map(({ path, schema: def }) => (
                                                <div key={path} className="p-3 rounded border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20 space-y-2">
                                                    <Label className="text-sm font-medium">
                                                        {path}
                                                        <span className="text-muted-foreground ml-1">
                                                            ({def.description || def.type || "output"})
                                                        </span>
                                                    </Label>
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={outputMappings[path] || ""}
                                                            onChange={(e) => {
                                                                if (e.target.value === "") {
                                                                    setOutputMappings((prev) => {
                                                                        const next = { ...prev };
                                                                        delete next[path];
                                                                        return next;
                                                                    });
                                                                } else {
                                                                    setOutputMappings((prev) => ({ ...prev, [path]: e.target.value }));
                                                                }
                                                            }}
                                                            className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm"
                                                        >
                                                            <option value="">-- Don't map --</option>
                                                            {outputSchemaDropdownPaths.map((optionPath) => (
                                                                <option key={optionPath} value={optionPath}>
                                                                    {optionPath}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {outputMappings[path] && (
                                                            <select
                                                                value={typeTransformations[`output.${path}`] || getSchemaType(def)}
                                                                onChange={(e) => setTypeTransformations((prev) => ({ ...prev, [`output.${path}`]: e.target.value }))}
                                                                className="w-28 h-9 px-2 rounded-md border border-input bg-background text-xs"
                                                                title={`Output schema type: ${def.type || 'auto'}`}
                                                            >
                                                                <option value="auto">Auto</option>
                                                                <option value="string">→ String</option>
                                                                <option value="number">→ Number</option>
                                                                <option value="integer">→ Integer</option>
                                                                <option value="boolean">→ Boolean</option>
                                                                <option value="json">→ JSON</option>
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        )
                        }

                        {wizardState === "completed" && (
                            <div className="flex flex-col items-center justify-center py-8 space-y-6">
                                <div className="flex flex-col items-center justify-center">
                                    <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                                    <h4 className="text-lg font-medium mb-2">Pipeline Verified Successfully!</h4>
                                    <p className="text-muted-foreground text-center">All {totalSteps} steps verified.</p>
                                </div>

                                {!!finalOutput && (
                                    <div className="w-full border rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
                                        <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                                            <Zap className="h-4 w-4 text-purple-500" />
                                            Pipeline Final Output
                                        </h5>
                                        <div className="overflow-auto max-h-96 w-full rounded border bg-background">
                                            {renderOutput(finalOutput)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {wizardState === "failed" && (
                            <div className="flex flex-col items-center justify-center py-8">
                                <XCircle className="h-12 w-12 text-red-500 mb-4" />
                                <h4 className="text-lg font-medium mb-2">Verification Failed</h4>
                                <p className="text-red-600 dark:text-red-400 text-center">{error}</p>
                            </div>
                        )}
                    </div>

                    {error && wizardState !== "failed" && (
                        <div className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={onCancel} disabled={isLoading}>Cancel</Button>

                        {wizardState === "input_required" && (
                            <Button
                                onClick={submitInput}
                                disabled={isLoading || requiredInputs.some((i) => !inputValues[i.name])}
                            >
                                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                                Execute Step
                            </Button>
                        )}

                        {wizardState === "mapping_review" && (
                            <Button onClick={() => sessionId && acceptMapping(sessionId, acceptedMappings, typeTransformations)} disabled={isLoading}>
                                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ChevronRight className="h-4 w-4 mr-2" />}
                                Accept & Continue
                            </Button>
                        )}

                        {wizardState === "completed" && (
                            <Button onClick={handleComplete}><CheckCircle className="h-4 w-4 mr-2" />Complete Verification</Button>
                        )}

                        {wizardState === "failed" && (
                            <Button onClick={startSession}>Retry</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={wizardState === "safety_warning"} onOpenChange={() => setWizardState("input_required")}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-yellow-600">
                            <AlertTriangle className="h-5 w-5" />
                            Destructive Operation Warning
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {safetyWarning?.message}<br /><br />
                            <strong>Function:</strong> {safetyWarning?.function_name}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-yellow-600 hover:bg-yellow-700" onClick={() => sessionId && executeStep(sessionId, true)}>
                            I Understand, Proceed
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
