"use client";

import React, { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Database, ArrowRight, Trash2, Download } from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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

export default function KnowledgeLibraryPage() {
    // For now, these are dummy KBs. Later they will be fetched from ArcadeDB or PostgreSQL.
    const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const fetchKBs = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/knowledge/kb`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
            });
            if (res.ok) {
                const data = await res.json();
                setKnowledgeBases(data || []);
            }
        } catch (error) {
            console.error("Failed to fetch KBs", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchKBs();
    }, []);

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            const res = await fetch(`${API_URL}/knowledge/kb/${deleteId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
            });
            if (res.ok) {
                setKnowledgeBases(knowledgeBases.filter((kb) => kb.id !== deleteId));
            }
        } catch (error) {
            console.error("Failed to delete KB", error);
        } finally {
            setDeleteId(null);
        }
    };

    const handleDownload = (kb: any) => {
        // Mock download
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(kb, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `${kb.name.replace(/\s+/g, '_').toLowerCase()}_export.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } catch (e) {
            console.error("Download failed", e);
        }
    };

    return (
        <div className="h-full w-full p-6 flex flex-col space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Knowledge Library</h1>
                    <p className="text-muted-foreground">Manage and explore your Knowledge Graphs.</p>
                </div>
            </div>
            <Separator />

            {isLoading ? (
                <div className="flex justify-center p-12 text-muted-foreground">Loading knowledge bases...</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {/* Create New Card */}
                        <Link href="/knowledge/workbench/new" className="block h-full">
                            <div className="h-full border border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 hover:border-primary/50 transition-colors cursor-pointer min-h-[220px]">
                                <Plus className="h-10 w-10 mb-2 opacity-50" />
                                <span className="font-semibold text-center">Create New<br />Knowledge Base</span>
                            </div>
                        </Link>

                        {/* KB Cards */}
                        {knowledgeBases.map((kb) => (
                            <Card key={kb.id} className="flex flex-col hover:shadow-md transition-shadow relative group">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-2">
                                            <Badge variant="outline" className="mb-2 font-mono text-xs text-muted-foreground">
                                                {kb.sources ? kb.sources.length : 0} Sources
                                            </Badge>
                                            <Badge variant="secondary" className="mb-2 text-[10px] uppercase font-bold tracking-wider">
                                                {kb.status || "draft"}
                                            </Badge>
                                        </div>
                                        <div className="flex gap-1 absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                title="Export JSON"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    handleDownload(kb);
                                                }}
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                title="Delete KB"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setDeleteId(kb.id);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <CardTitle className="leading-tight pr-12">{kb.name}</CardTitle>
                                    <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                                        {kb.description || "No description provided."}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1 pb-4">
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                                        <div className="flex items-center gap-1">
                                            <Database className="h-3 w-3" />
                                            <span>{kb.node_count} Nodes</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Database className="h-3 w-3" />
                                            <span>{kb.edge_count} Edges</span>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="pt-0">
                                    <Link href={`/knowledge/workbench/${kb.id}`} className="w-full">
                                        <Button variant="outline" className="w-full justify-between group/btn">
                                            Open Workbench
                                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover/btn:translate-x-1 transition-transform" />
                                        </Button>
                                    </Link>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>

                    <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the Knowledge Base and all its stored entities.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
        </div>
    );
}
