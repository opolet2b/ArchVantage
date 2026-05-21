"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, GitBranch, Sparkles, AlertCircle, Search, HelpCircle, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { API_URL, cn } from "@/lib/utils";
import { useCanvasStore } from "./canvas-store";

interface WorkflowTemplate {
    id: string;
    name: string;
    description?: string;
    bpmn_json: Record<string, any>;
    created_at: string;
}

interface WorkflowTemplateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (template: WorkflowTemplate, name: string, description: string) => void;
}

export function WorkflowTemplateDialog({
    open,
    onOpenChange,
    onConfirm
}: WorkflowTemplateDialogProps) {
    const [templates, setTemplates] = React.useState<WorkflowTemplate[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);

    // State for configuration step
    const [step, setStep] = React.useState<"select" | "config">("select");
    const [selectedTemplate, setSelectedTemplate] = React.useState<WorkflowTemplate | null>(null);
    const [customName, setCustomName] = React.useState("");
    const [customDescription, setCustomDescription] = React.useState("");

    React.useEffect(() => {
        if (open) {
            fetchTemplates();
            setStep("select");
            setSelectedTemplate(null);
            setCustomName("");
            setCustomDescription("");
            setError(null);
        }
    }, [open]);

    const fetchTemplates = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/workflows/templates`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (!res.ok) {
                throw new Error("Failed to load templates");
            }
            const data = await res.json();
            setTemplates(data);
        } catch (err: any) {
            console.error("Error fetching workflow templates:", err);
            setError(err.message || "Failed to load workflow blueprints.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectTemplate = (template: WorkflowTemplate) => {
        setSelectedTemplate(template);
        setCustomName(template.name);
        setCustomDescription(template.description || "");
        setStep("config");
    };

    const handleBack = () => {
        setStep("select");
        setSelectedTemplate(null);
    };

    const handleConfirm = () => {
        if (!selectedTemplate) return;
        onConfirm(selectedTemplate, customName, customDescription);
    };

    const filteredTemplates = templates.filter(t => 
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col p-0 border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <div className="p-2.5 bg-purple-100 dark:bg-purple-950/40 rounded-xl text-purple-600 dark:text-purple-400">
                                <GitBranch className="h-5 w-5 animate-pulse" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                                    {step === "select" ? "Select Workflow Blueprint" : "Configure Workflow Instance"}
                                </DialogTitle>
                                <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    {step === "select"
                                        ? "Choose a structured automation template to instantiate on the canvas."
                                        : "Assign custom parameters to configure this visual workflow workspace card."}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <div className="flex-1 overflow-y-auto p-6 min-h-0">
                    {error && (
                        <div className="mb-4 p-4 border border-rose-100 dark:border-rose-950 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl text-sm flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {step === "select" && (
                        <div className="space-y-4 h-full flex flex-col min-h-0">
                            {/* Search bar */}
                            <div className="relative shrink-0">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search blueprint templates by name or description..."
                                    className="pl-10 h-11 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 rounded-xl"
                                />
                            </div>

                            {isLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4">
                                    <Loader2 className="h-10 w-10 animate-spin text-purple-500" />
                                    <p className="text-slate-500 dark:text-slate-400 font-medium animate-pulse text-sm">Querying available BPMN templates...</p>
                                </div>
                            ) : (
                                <ScrollArea className="flex-1 -mx-2 px-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2">
                                        {filteredTemplates.map((template) => (
                                            <div
                                                key={template.id}
                                                onClick={() => handleSelectTemplate(template)}
                                                className="group border border-slate-100 dark:border-slate-800/80 hover:border-purple-200 dark:hover:border-purple-900 rounded-xl p-5 cursor-pointer bg-slate-50/30 dark:bg-slate-900/30 hover:bg-purple-50/10 dark:hover:bg-purple-950/10 transition-all duration-300 flex flex-col hover:shadow-md hover:scale-[1.01]"
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="p-2 bg-white dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 group-hover:border-purple-100 dark:group-hover:border-purple-900/50 transition-colors">
                                                        <GitBranch className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                                                    </div>
                                                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 px-2 py-0.5 rounded-full">
                                                        Blueprint
                                                    </span>
                                                </div>
                                                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors mb-1.5">
                                                    {template.name}
                                                </h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed flex-1">
                                                    {template.description || "No description provided."}
                                                </p>
                                                <div className="mt-4 pt-3 border-t border-slate-100/50 dark:border-slate-800/50 text-[10px] text-slate-400 flex items-center gap-1.5">
                                                    <ClockIcon className="h-3 w-3" />
                                                    <span>Created {new Date(template.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        ))}

                                        {filteredTemplates.length === 0 && (
                                            <div className="col-span-full py-16 flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/20 dark:bg-slate-950/10 text-center">
                                                <div className="p-3 bg-white dark:bg-slate-900 rounded-full shadow-sm mb-4 border border-slate-100 dark:border-slate-800">
                                                    <GitBranch className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                                                </div>
                                                <p className="text-slate-600 dark:text-slate-300 font-semibold text-sm">No templates matched search</p>
                                                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-normal">Try searching with a different keyword or create templates in the sidebar visual editor.</p>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            )}
                        </div>
                    )}

                    {step === "config" && selectedTemplate && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-3 duration-300">
                            <div className="p-4 rounded-xl border border-purple-100/80 dark:border-purple-950 bg-purple-50/10 dark:bg-purple-950/10 space-y-2">
                                <div className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5" /> Selected Blueprint
                                </div>
                                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                                    {selectedTemplate.name}
                                </h4>
                                {selectedTemplate.description && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                        {selectedTemplate.description}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="customName" className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        Workflow Card Display Name
                                    </Label>
                                    <Input
                                        id="customName"
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                        placeholder="Enter display name..."
                                        className="h-10 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 rounded-xl"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="customDesc" className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        Instance Description / Instruction Notes
                                    </Label>
                                    <Textarea
                                        id="customDesc"
                                        value={customDescription}
                                        onChange={(e) => setCustomDescription(e.target.value)}
                                        placeholder="Add notes about this automation instance..."
                                        rows={4}
                                        className="bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 rounded-xl leading-relaxed resize-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-slate-800/80 shrink-0 bg-slate-50/50 dark:bg-slate-950/20 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span>Interactive visual BPMN automation card</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            onClick={step === "config" ? handleBack : () => onOpenChange(false)}
                            className="h-10 px-4 rounded-xl font-medium border border-transparent hover:bg-slate-100 dark:hover:bg-slate-850"
                        >
                            {step === "config" ? "Change Template" : "Cancel"}
                        </Button>
                        {step === "config" && (
                            <Button
                                onClick={handleConfirm}
                                disabled={!customName.trim()}
                                className="h-10 px-5 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 dark:bg-purple-600 dark:hover:bg-purple-500 text-white gap-2 shadow-lg shadow-purple-500/20 dark:shadow-none hover:scale-[1.02] transition-transform"
                            >
                                <Check className="h-4 w-4" /> Add Workflow Card
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    );
}
