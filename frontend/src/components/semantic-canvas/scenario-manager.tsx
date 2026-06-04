/**
 * Scenario Manager Component
 *
 * Full-page component for managing scenarios (Vertical Modes).
 * Allows creating, editing, and deleting scenarios.
 */
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Layers, Plus, Loader2, Trash2, Pencil, Palette, MoreVertical } from "lucide-react";
import { API_URL } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/use-toast";
import { Scenario } from "./canvas-store";
import { ScenarioEditor } from "./scenario-editor";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function ScenarioManager() {
    const { toast } = useToast();
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [deleteId, setDeleteId] = React.useState<string | null>(null);

    // Editor State
    const [viewMode, setViewMode] = React.useState<"list" | "create" | "edit">("list");

    const fetchScenarios = React.useCallback(() => {
        if (authLoading || !isAuthenticated) return;

        setLoading(true);
        const token = localStorage.getItem("token");
        if (!token) {
            setLoading(false);
            return;
        }

        fetch(`${API_URL}/scenarios/`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(async res => {
                // If 401, just throw, don't auto-logout yet to avoid loops
                if (res.status === 401) throw new Error("Unauthorized");
                if (!res.ok) throw new Error("Failed to load");
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    setScenarios(data);
                } else {
                    setScenarios([]);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch scenarios", err);
                // Show toast for feedback
                if (err.message === "Unauthorized") {
                    toast({ title: "Session Error", description: "Use the 'Log out' button in sidebar to refresh your session.", variant: "destructive" });
                } else {
                    toast({ title: "Error", description: "Failed to load scenarios", variant: "destructive" });
                }
                setLoading(false);
            });
    }, [toast, authLoading, isAuthenticated]);

    React.useEffect(() => {
        fetchScenarios();
    }, [fetchScenarios]);

    const handleDelete = async () => {
        if (!deleteId) return;

        try {
            const token = localStorage.getItem("token");
            if (!token) throw new Error("Not authenticated");

            const res = await fetch(`${API_URL}/scenarios/${deleteId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.status === 401) throw new Error("Unauthorized");
            if (res.ok) {
                toast({ title: "Scenario Deleted" });
                setDeleteId(null);
                if (selectedId === deleteId) setSelectedId(null);
                fetchScenarios();
            } else {
                throw new Error("Failed to delete");
            }
        } catch (error: any) {
            toast({ title: "Error", description: error.message === "Unauthorized" ? "Session invalid" : "Could not delete scenario", variant: "destructive" });
        }
    };

    const handleStartCreate = () => {
        setViewMode("create");
        setSelectedId(null); // Clear selection when creating
    };

    const handleStartEdit = (scenarioId: string) => {
        setSelectedId(scenarioId);
        setViewMode("edit");
    };

    const handleSaveScenario = async (data: Partial<Scenario>) => {
        const token = localStorage.getItem("token");
        if (!token) {
            toast({ title: "Error", description: "Not authenticated.", variant: "destructive" });
            return;
        }

        try {
            let res;
            if (viewMode === "create") {
                // Initial defaults for required fields if missing
                const payload = {
                    ...data,
                    icon: data.icon || "layers"
                };

                res = await fetch(`${API_URL}/scenarios/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });
            } else if (viewMode === "edit" && selectedId) {
                res = await fetch(`${API_URL}/scenarios/${selectedId}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify(data)
                });
            } else {
                return;
            }

            if (res.status === 401) throw new Error("Unauthorized");

            if (res.ok) {
                const savedScenario = await res.json();
                toast({ title: "Success", description: `Scenario ${viewMode === "create" ? "created" : "updated"} successfully.` });

                // If we created a new one, transition to edit mode for it
                if (viewMode === "create") {
                    setSelectedId(savedScenario.id);
                    setViewMode("edit");
                }

                // Refresh list in background
                fetchScenarios();
            } else {
                const err = await res.json();
                throw new Error(err.detail || "Failed to save");
            }
        } catch (error: any) {
            console.error(error);
            const msg = error.message === "Unauthorized" ? "Session invalid. Please log out." : error.message;
            toast({ title: "Error", description: msg, variant: "destructive" });
            throw error; // Re-throw to stop spinner in editor
        }
    };

    const handleInstantiate = async (scenario: Scenario) => {
        const token = localStorage.getItem("token");
        if (!token) {
            toast({ title: "Error", description: "Not authenticated.", variant: "destructive" });
            return;
        }

        try {
            toast({ title: "Creating Scenario Canvas", description: `Setting up ${scenario.name}...` });
            const res = await fetch(`${API_URL}/scenarios/${scenario.id}/instantiate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    scenario_id: scenario.id,
                    canvas_name: `${scenario.name} Workspace`
                })
            });

            if (res.status === 401) throw new Error("Unauthorized");
            if (res.ok) {
                const newCanvas = await res.json();
                window.location.href = `/canvas/${newCanvas.id}`;
            } else {
                throw new Error("Failed to instantiate");
            }
        } catch (e: any) {
            console.error(e);
            const msg = e.message === "Unauthorized" ? "Session invalid" : "Failed to create scenario canvas.";
            toast({ title: "Error", description: msg, variant: "destructive" });
        }
    };

    const selectedScenario = scenarios.find(s => s.id === selectedId);

    // Render Editor Mode
    if (viewMode === "create" || (viewMode === "edit" && selectedScenario)) {
        return (
            <div className="h-full w-full max-w-[95vw] mx-auto p-6 pt-2">
                <ScenarioEditor
                    initialData={viewMode === "edit" ? selectedScenario : undefined}
                    onSave={handleSaveScenario}
                    onCancel={() => setViewMode("list")}
                />
            </div>
        );
    }

    // Render List Mode
    return (
        <div className="h-full flex flex-col gap-6 p-6 w-full">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Scenarios</h1>
                    <p className="text-muted-foreground">Manage specialized vertical modes and configurations.</p>
                </div>
                <Button onClick={handleStartCreate}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Scenario
                </Button>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden border rounded-xl bg-card shadow-sm">
                {/* List Sidebar */}
                <div className="w-1/3 border-r flex flex-col bg-muted/10">
                    <div className="p-4 border-b bg-muted/20">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            Available Scenarios
                        </h2>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="flex flex-col gap-1 p-2">
                            {loading && (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="animate-spin text-muted-foreground" />
                                </div>
                            )}
                            {!loading && Array.isArray(scenarios) && scenarios.map(scenario => (
                                <div
                                    key={scenario.id}
                                    className={`
                                        p-3 rounded-lg border cursor-pointer transition-all hover:shadow-xs
                                        ${selectedId === scenario.id
                                            ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                                            : "border-transparent hover:bg-white dark:hover:bg-slate-800 hover:border-border"}
                                    `}
                                    onClick={() => setSelectedId(scenario.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-md flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm"
                                            style={{ backgroundColor: scenario.theme_color || "#3b82f6" }}
                                        >
                                            {scenario.name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold truncate text-sm">{scenario.name}</div>
                                            <div className="text-xs text-muted-foreground truncate">{scenario.description}</div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                                    <MoreVertical className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStartEdit(scenario.id); }}>
                                                    <Pencil className="w-4 h-4 mr-2" /> Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onClick={(e) => { e.stopPropagation(); setDeleteId(scenario.id); }}
                                                >
                                                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))}
                            {!loading && scenarios.length === 0 && (
                                <div className="p-8 text-center text-muted-foreground text-sm">
                                    No scenarios found. Create one to get started.
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* Detail View */}
                <div className="flex-1 bg-white dark:bg-slate-950 overflow-hidden flex flex-col">
                    {selectedScenario ? (
                        <div className="h-full flex flex-col p-6 overflow-y-auto">
                            <div className="flex items-start gap-6 mb-8">
                                <div
                                    className="w-24 h-24 rounded-xl flex items-center justify-center text-white text-5xl shadow-lg shrink-0"
                                    style={{ backgroundColor: selectedScenario.theme_color || "#3b82f6" }}
                                >
                                    {selectedScenario.name[0]}
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-3xl font-bold mb-2">{selectedScenario.name}</h2>
                                    <p className="text-lg text-muted-foreground leading-relaxed">{selectedScenario.description}</p>

                                    <div className="flex gap-3 mt-6">
                                        <Button size="lg" onClick={() => handleInstantiate(selectedScenario)}>
                                            Launch Workspace
                                        </Button>
                                        <Button variant="outline" size="lg" onClick={() => handleStartEdit(selectedScenario.id)}>
                                            <Pencil className="w-4 h-4 mr-2" />
                                            Edit Configuration
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Content Types (Domains)</CardTitle>
                                        <CardDescription>Visual categories and specialized structures available in this scenario.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedScenario.configuration.domain_definitions?.map((d: any) => (
                                                <Badge key={d.id} variant="outline" className="px-3 py-1 text-sm border-2" style={{ borderColor: d.visual_config?.color }}>
                                                    {d.name}
                                                </Badge>
                                            )) || <span className="text-muted-foreground italic">No domains configured</span>}
                                        </div>
                                    </CardContent>
                                </Card>

                                {selectedScenario.configuration.ui_overrides?.toolbar_config?.tools && selectedScenario.configuration.ui_overrides.toolbar_config.tools.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Scenario Toolbox</CardTitle>
                                            <CardDescription>Custom interface actions and specialized tools.</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedScenario.configuration.ui_overrides.toolbar_config.tools.map((t: any) => (
                                                    <Badge key={t.id} variant="secondary" className="px-3 py-1 text-sm">
                                                        {t.label}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>

                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                            <Layers className="w-16 h-16 mb-4 opacity-20" />
                            <h3 className="text-lg font-medium text-foreground">No Scenario Selected</h3>
                            <p className="max-w-sm mt-2">Select a scenario from the list to view its details, configuration, and launch options.</p>
                        </div>
                    )}
                </div>
            </div>

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the scenario definition.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
