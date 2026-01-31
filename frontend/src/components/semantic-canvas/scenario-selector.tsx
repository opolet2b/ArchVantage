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
            setLoading(true);
            const token = localStorage.getItem("token");
            fetch(`${API_URL}/scenarios/`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => res.json())
                .then(data => {
                    setScenarios(data);
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
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        Select a Scenario
                    </DialogTitle>
                    <DialogDescription>
                        Choose a specialized mode for your canvas. Scenarios configure the interface,
                        tools, and automations for specific use cases.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex gap-6 py-4">
                    {/* List */}
                    <div className="w-1/3 border-r pr-4">
                        <ScrollArea className="h-full">
                            <div className="flex flex-col gap-2">
                                {loading && (
                                    <div className="flex justify-center p-4">
                                        <Loader2 className="animate-spin text-muted-foreground" />
                                    </div>
                                )}
                                {!loading && scenarios.map(scenario => (
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
                                                <div className="font-semibold truncate">{scenario.name}</div>
                                                <div className="text-xs text-muted-foreground truncate">{scenario.description}</div>
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
                    <div className="flex-1 pl-2">
                        {selectedId ? (
                            (() => {
                                const selected = scenarios.find(s => s.id === selectedId);
                                if (!selected) return null;
                                return (
                                    <div className="h-full flex flex-col gap-4">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="w-16 h-16 rounded-lg flex items-center justify-center text-white text-3xl shadow-md"
                                                style={{ backgroundColor: selected.theme_color || "#3b82f6" }}
                                            >
                                                {selected.name[0]}
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-bold">{selected.name}</h2>
                                                <p className="text-muted-foreground">{selected.description}</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mt-4">
                                            <Card>
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm font-medium">Domain Definitions</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selected.configuration.domain_definitions?.map((d: any) => (
                                                            <Badge key={d.id} variant="outline" style={{ borderColor: d.visual_config?.primary_color }}>
                                                                {d.label}
                                                            </Badge>
                                                        )) || <span className="text-muted-foreground text-sm">None</span>}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm font-medium">Specialized Tools</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selected.configuration.ui_overrides?.toolbox_macros?.map((m: any) => (
                                                            <Badge key={m.id} variant="secondary">
                                                                {m.label}
                                                            </Badge>
                                                        )) || <span className="text-muted-foreground text-sm">None</span>}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        <Card className="flex-1 mt-4 bg-muted/20">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm font-medium">Scenario Preview</CardTitle>
                                            </CardHeader>
                                            <CardContent className="h-full flex items-center justify-center text-muted-foreground text-sm italic">
                                                Active Automation Rules: {selected.configuration.automations?.length || 0}
                                            </CardContent>
                                        </Card>
                                    </div>
                                );
                            })()
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                Select a scenario to view details
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={!selectedId}>
                        Use This Scenario <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
