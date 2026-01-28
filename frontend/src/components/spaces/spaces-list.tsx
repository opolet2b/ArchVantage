"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, Box, Layers, GripVertical, Layout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { spacesService, AnalysisSpace } from "@/lib/spaces-service";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { API_URL } from "@/lib/utils";

interface CanvasSummary {
    id: string;
    name: string;
}

export function SpacesList() {
    const [spaces, setSpaces] = useState<AnalysisSpace[]>([]);
    const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
    const [newSpaceName, setNewSpaceName] = useState("");
    const { toast } = useToast();

    useEffect(() => {
        loadSpaces();
        loadCanvases();
    }, []);

    const loadSpaces = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            const data = await spacesService.getAll();
            setSpaces(data);
        } catch (error) {
            console.error(error);
            // Only show toast if it's not a generic auth error
            if (error instanceof Error && !error.message.includes("Authentication required")) {
                toast({
                    title: "Error",
                    description: "Failed to load spaces",
                    variant: "destructive"
                });
            }
        }
    };

    const loadCanvases = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/canvases`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCanvases(data);
            }
        } catch (error) {
            console.error("Failed to load canvases", error);
        }
    };

    const handleCreateSpace = async () => {
        if (!newSpaceName.trim()) return;
        try {
            await spacesService.create(newSpaceName);
            setNewSpaceName("");
            loadSpaces();
            toast({ title: "Success", description: "Space created" });
        } catch (error) {
            toast({ title: "Error", description: "Failed to create space", variant: "destructive" });
        }
    };

    const handleDeleteSpace = async (id: string) => {
        try {
            await spacesService.delete(id);
            loadSpaces();
            toast({ title: "Success", description: "Space deleted" });
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete space", variant: "destructive" });
        }
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, canvas: CanvasSummary) => {
        e.dataTransfer.setData("canvasId", canvas.id);
        e.dataTransfer.setData("canvasName", canvas.name);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent, spaceId: string) => {
        e.preventDefault();
        const canvasId = e.dataTransfer.getData("canvasId");
        if (!canvasId) return;

        try {
            await spacesService.addCanvas(spaceId, canvasId);
            loadSpaces(); // Refresh to show updated count/canvases
            toast({ title: "Success", description: "Canvas added to space" });
        } catch (error) {
            toast({ title: "Error", description: "Failed to add canvas to space", variant: "destructive" });
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* Main Content: Spaces Grid */}
            <div className="flex-1 p-8 overflow-y-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Analysis Spaces</h2>
                        <p className="text-muted-foreground">Manage your 3D workspaces and group canvases.</p>
                    </div>
                </div>

                <div className="flex gap-4 items-end mb-8">
                    <div className="w-[300px] space-y-2">
                        <Input
                            placeholder="New Space Name..."
                            value={newSpaceName}
                            onChange={(e) => setNewSpaceName(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleCreateSpace}>
                        <Plus className="mr-2 h-4 w-4" /> Create Space
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {spaces.map((space) => (
                        <div
                            key={space.id}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, space.id)}
                        >
                            <Card className="group hover:shadow-lg transition-all border-slate-200 cursor-default">
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex justify-between items-start">
                                        <span className="truncate">{space.name}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleDeleteSpace(space.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </CardTitle>
                                    <CardDescription>Created {new Date(space.created_at).toLocaleDateString()}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-2 mb-4 text-sm text-slate-500">
                                        <Layers className="h-4 w-4" />
                                        <span className={space.canvases && space.canvases.length > 0 ? "text-indigo-600 font-medium" : ""}>
                                            {space.canvases ? space.canvases.length : 0} Canvases
                                        </span>
                                    </div>
                                    <Link href={`/spaces/${space.id}`}>
                                        <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                                            <Box className="mr-2 h-4 w-4" /> Open 3D View
                                        </Button>
                                    </Link>
                                    {/* List canvases in the card for visibility */}
                                    {space.canvases && space.canvases.length > 0 && (
                                        <div className="mt-4 pt-4 border-t text-xs text-slate-500 space-y-1">
                                            {space.canvases.slice(0, 3).map((c: any) => (
                                                <div key={c.id} className="truncate">• {c.name}</div>
                                            ))}
                                            {space.canvases.length > 3 && <div>+ {space.canvases.length - 3} more</div>}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sidebar: Draggable Canvases */}
            <div className="w-80 border-l bg-slate-100 p-6 overflow-y-auto hidden lg:block shadow-inner">
                <h3 className="font-semibold mb-4 text-sm text-slate-900 uppercase tracking-wider flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Box className="h-4 w-4" /> Available Canvases
                    </div>
                </h3>
                <p className="text-xs text-slate-500 mb-6">Drag a card to a space to add it.</p>

                <div className="space-y-3">
                    {canvases.map(canvas => {
                        return (
                            <div
                                key={canvas.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, canvas)}
                                className="group flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all"
                            >
                                {/* Icon / Avatar */}
                                <div
                                    className="h-10 w-10 flex-shrink-0 rounded bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors"
                                >
                                    <Layout className="h-5 w-5" />
                                </div>

                                {/* Name */}
                                <div className="min-w-0 flex-1">
                                    <h4 className="text-sm font-medium text-slate-700 truncate group-hover:text-indigo-700 transition-colors">
                                        {canvas.name}
                                    </h4>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Canvas</p>
                                </div>

                                <GripVertical className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
