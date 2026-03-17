/**
 * Scenario Selector Component
 *
 * Allows users to browse and activate scenarios (Vertical Modes).
 *
 * PEP 8 style comments
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Layers, ArrowRight, Check, Plus, Loader2 } from "lucide-react";
import { API_URL } from "@/lib/utils";
import { useCanvasStore, Scenario } from "./canvas-store";

interface ScenarioSelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect?: (scenario: Scenario) => void;
}

export function ScenarioSelector({ open, onOpenChange, onSelect }: ScenarioSelectorProps) {
    const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [createMode, setCreateMode] = React.useState(false); // If true, selection creates new canvas

    // Fetch scenarios on open
    React.useEffect(() => {
        if (open) {
            // Check auth
            const token = localStorage.getItem("token");
            if (!token) {
                // Optionally redirect or show error state
                setLoading(false);
                return;
            }

            setLoading(true);
            fetch(`${API_URL}/scenarios/`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(async res => {
                    if (res.status === 401) throw new Error("Unauthorized");
                    if (!res.ok) throw new Error("Failed to load");
                    return res.json();
                })
                .then(data => {
                    if (Array.isArray(data)) {
                        setScenarios(data);
                    } else {
                        console.error("Scenarios API returned non-array:", data);
                        setScenarios([]);
                    }
                    setLoading(false);
                })
                .catch(err => {
                    console.error("Failed to fetch scenarios", err);
                    setLoading(false);
                });
        }
    }, [open]);

    const handleConfirm = async () => {
        if (!selectedId) return;
        const scenario = scenarios.find(s => s.id === selectedId);
        if (!scenario) return;

        if (onSelect) {
            onSelect(scenario);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl min-w-[900px] w-[95vw] h-fit max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl border-slate-200 dark:border-slate-800">
                <DialogHeader className="p-6 pb-4 shrink-0 border-b bg-white dark:bg-slate-900">
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
                        <Layers className="w-5 h-5 text-primary" />
                        Select a Scenario
                    </DialogTitle>
                    <DialogDescription className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Choose a specialized mode for your canvas. Scenarios configure the interface,
                        tools, and automations for specific use cases.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-row p-0 bg-slate-50/30 dark:bg-slate-900/10">
                    {/* List */}
                    <div className="w-80 shrink-0 border-r bg-white dark:bg-slate-900/50 flex flex-col">
                        <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border-b flex justify-between items-center shrink-0">
                            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500">Available Scenarios</span>
                            <Badge variant="outline" className="text-[10px] font-bold bg-white dark:bg-slate-700 shadow-sm border-slate-200 dark:border-slate-800">
                                {scenarios.length} Found
                            </Badge>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-3 gap-2 flex flex-col h-full">
                                {loading && (
                                    <div className="flex justify-center p-4">
                                        <Loader2 className="animate-spin text-muted-foreground" />
                                    </div>
                                )}
                                {!loading && Array.isArray(scenarios) && scenarios.map(scenario => (
                                    <div
                                        key={scenario.id}
                                        className={`
                                            p-3 rounded-lg border cursor-pointer transition-all
                                            ${selectedId === scenario.id
                                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                : "border-border hover:border-primary/50 hover:bg-muted/50"}
                                        `}
                                        onClick={() => setSelectedId(scenario.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-10 h-10 rounded-md flex items-center justify-center text-white font-bold text-lg"
                                                style={{ backgroundColor: scenario.theme_color || "#3b82f6" }}
                                            >
                                                {scenario.icon ? (
                                                    // Placeholder for icon rendering
                                                    <span>{scenario.icon[0].toUpperCase()}</span>
                                                ) : (
                                                    <span>{scenario.name[0].toUpperCase()}</span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{scenario.name}</div>
                                                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 line-clamp-1">{scenario.description}</div>
                                            </div>
                                            {selectedId === scenario.id && (
                                                <Check className="w-4 h-4 text-primary" />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Preview / Details */}
                    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-y-auto overflow-x-hidden border-l">
                        <div className="p-8">
                        {selectedId ? (
                            (() => {
                                const selected = scenarios.find(s => s.id === selectedId);
                                if (!selected) return null;
                                return (
                                    <div className="h-full flex flex-col gap-4">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="w-16 h-16 rounded-lg flex items-center justify-center text-white text-3xl shadow-md shrink-0"
                                                style={{ backgroundColor: selected.theme_color || "#3b82f6" }}
                                            >
                                                {selected.name[0]}
                                            </div>
                                            <div className="min-w-0">
                                                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{selected.name}</h2>
                                                <p className="text-slate-500 dark:text-slate-400 font-medium">{selected.description}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-4 mt-8 items-start">
                                            <Card className="min-w-[300px] flex-1 shadow-sm border-slate-200 dark:border-slate-800">
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm font-medium">Content Types (Domains)</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selected.configuration.domain_definitions?.map((d: any) => (
                                                            <Badge key={d.id} variant="outline" style={{ borderColor: d.visual_config?.color }}>
                                                                {d.name}
                                                            </Badge>
                                                        )) || <span className="text-muted-foreground text-sm">None</span>}
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            {selected.configuration.ui_overrides?.toolbar_config?.tools && selected.configuration.ui_overrides.toolbar_config.tools.length > 0 && (
                                                <Card className="min-w-[300px] flex-1 shadow-sm border-slate-200 dark:border-slate-800">
                                                    <CardHeader className="pb-2">
                                                        <CardTitle className="text-sm font-medium">Scenario Toolbox</CardTitle>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <div className="flex flex-wrap gap-2">
                                                            {selected.configuration.ui_overrides.toolbar_config.tools.map((t: any) => (
                                                                <Badge key={t.id} variant="secondary">
                                                                    {t.label}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            )}
                                        </div>

                                    </div>
                                );
                            })()
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-50">
                                <Layers className="w-12 h-12 stroke-[1px]" />
                                <span className="text-sm font-medium">Select a scenario to view details</span>
                            </div>
                        )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={!selectedId}>
                        Use This Scenario <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
