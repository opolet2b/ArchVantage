"use client";

/**
 * Template Selector Component
 *
 * Tree view for selecting templates with permission filtering.
 * Used in the Agent Builder's TEXT_TEMPLATE node.
 */
import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Folder, FileText, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

import { API_URL } from "@/lib/utils"

interface TreeNode {
    id: string;
    name: string;
    path: string;
    type: "folder" | "template";
    children?: TreeNode[];
    templates?: TreeNode[];
    permission?: string;
}

interface TemplateSelectorProps {
    selectedId: string | null;
    onSelect: (templateId: string, templateName: string) => void;
}

export function TemplateSelector({ selectedId, onSelect }: TemplateSelectorProps) {
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    // Fetch template tree
    useEffect(() => {
        const fetchTree = async () => {
            try {
                const response = await fetch(`${API_URL}/templates/tree`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });
                if (response.ok) {
                    const data = await response.json();
                    setTree(data.tree || []);
                }
            } catch (error) {
                console.error("Failed to fetch template tree:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchTree();
    }, []);

    // Toggle folder expansion
    const toggleFolder = (folderId: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) {
                next.delete(folderId);
            } else {
                next.add(folderId);
            }
            return next;
        });
    };

    // Render tree node recursively
    const renderTreeNode = (node: TreeNode, depth: number = 0) => {
        const isExpanded = expandedFolders.has(node.id);
        const isSelected = selectedId === node.id;
        const paddingLeft = depth * 12 + 4;

        if (node.type === "folder") {
            return (
                <div key={node.id}>
                    <div
                        className="flex items-center gap-1 py-1 px-1 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-xs"
                        style={{ paddingLeft }}
                        onClick={() => toggleFolder(node.id)}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                        ) : (
                            <ChevronRight className="h-3 w-3 text-slate-400" />
                        )}
                        <Folder className="h-3 w-3 text-amber-500" />
                        <span className="truncate">{node.name}</span>
                    </div>
                    {isExpanded && (
                        <>
                            {node.children?.map((child) => renderTreeNode(child, depth + 1))}
                            {node.templates?.map((template) => renderTreeNode(template, depth + 1))}
                        </>
                    )}
                </div>
            );
        }

        return (
            <div
                key={node.id}
                className={`flex items-center gap-1 py-1 px-1 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-xs ${isSelected ? "bg-blue-50 dark:bg-blue-900/30" : ""
                    }`}
                style={{ paddingLeft }}
                onClick={() => {
                    console.log('[TemplateSelector] Selected template:', { id: node.id, name: node.name });
                    onSelect(node.id, node.name);
                }}
            >
                <div className="w-3" /> {/* Spacer for alignment */}
                <FileText className="h-3 w-3 text-cyan-500" />
                <span className="truncate">{node.name}</span>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading templates...
            </div>
        );
    }

    if (tree.length === 0) {
        return (
            <div className="text-center py-4 text-xs text-muted-foreground">
                No templates available.
                <br />
                Create templates in the Templates menu.
            </div>
        );
    }

    return (
        <ScrollArea className="h-[200px] border rounded-md p-2">
            {tree.map((node) => renderTreeNode(node))}
        </ScrollArea>
    );
}
