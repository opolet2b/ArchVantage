"use client";

import React, { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, LayoutTemplate, ArrowRight, Trash2, Download } from "lucide-react";
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

export default function TemplateLibraryPage() {
    const [templates, setTemplates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const res = await fetch(`${API_URL}/smart-templates/templates`);
                if (res.ok) {
                    const data = await res.json();
                    setTemplates(data || []);
                }
            } catch (error) {
                console.error("Failed to fetch templates", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTemplates();
    }, []);

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            const res = await fetch(`${API_URL}/smart-templates/templates/${deleteId}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setTemplates(templates.filter((t) => t.id !== deleteId));
                setDeleteId(null);
            }
        } catch (error) {
            console.error("Failed to delete template", error);
        }
    };

    const handleDownload = (template: any) => {
        if (!template.pipeline_config) return;

        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template.pipeline_config, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `${template.name.replace(/\s+/g, '_').toLowerCase()}_config.json`);
            document.body.appendChild(downloadAnchorNode); // required for firefox
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
                    <h1 className="text-2xl font-bold tracking-tight">Template Library</h1>
                    <p className="text-muted-foreground">Manage and run your smart analysis templates.</p>
                </div>
            </div>
            <Separator />

            {isLoading ? (
                <div className="flex justify-center p-12 text-muted-foreground">Loading templates...</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {/* Create New Card */}
                        <Link href="/smart-analysis/workbench" className="block h-full">
                            <div className="h-full border border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 hover:border-primary/50 transition-colors cursor-pointer min-h-[220px]">
                                <Plus className="h-10 w-10 mb-2 opacity-50" />
                                <span className="font-semibold">Create New Template</span>
                            </div>
                        </Link>

                        {/* Template Cards */}
                        {templates.map((template) => (
                            <Card key={template.id} className="flex flex-col hover:shadow-md transition-shadow relative group">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-2">
                                            <Badge variant="outline" className="mb-2 font-mono text-xs text-muted-foreground">
                                                {template.category_name}
                                            </Badge>
                                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none text-[10px]">
                                                {template.activity_type || "Analysis"}
                                            </Badge>
                                        </div>
                                        <div className="flex gap-1 absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                title="Download JSON"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    handleDownload(template);
                                                }}
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                title="Delete Template"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setDeleteId(template.id);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <CardTitle className="leading-tight pr-12">{template.name}</CardTitle>
                                    <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                                        {template.description || "No description provided."}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1 pb-4">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                                        <LayoutTemplate className="h-3 w-3" />
                                        <span>{template.steps_count} Steps</span>
                                    </div>
                                </CardContent>
                                <CardFooter className="pt-0">
                                    <Link href={`/smart-analysis/workbench?templateId=${template.id}`} className="w-full">
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
                                    This action cannot be undone. This will permanently delete the analysis template.
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
