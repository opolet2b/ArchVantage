"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tool item in the tree
 */
interface ToolTreeItem {
    id: number;
    name: string;
    description?: string;
    tool_type: string;
}

/**
 * Category node in the tree
 */
interface CategoryTreeNode {
    id?: number | null;
    name: string;
    description?: string;
    tools: ToolTreeItem[];
}

interface ToolTreeViewProps {
    categories: CategoryTreeNode[];
    selectedToolId?: number;
    onSelectTool: (tool: ToolTreeItem) => void;
}

/**
 * Tree view component for selecting tools organized by category
 */
export function ToolTreeView({ categories, selectedToolId, onSelectTool }: ToolTreeViewProps) {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");

    // Toggle category expansion
    const toggleCategory = (categoryName: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryName)) {
            newExpanded.delete(categoryName);
        } else {
            newExpanded.add(categoryName);
        }
        setExpandedCategories(newExpanded);
    };

    // Filter tools and categories based on search
    const filteredCategories = categories
        .map((category) => ({
            ...category,
            tools: category.tools.filter(
                (tool) =>
                    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (tool.description && tool.description.toLowerCase().includes(searchQuery.toLowerCase()))
            ),
        }))
        .filter((category) => category.tools.length > 0);

    // Auto-expand categories when searching
    if (searchQuery && filteredCategories.length > 0) {
        const allCategoryNames = new Set(filteredCategories.map((c) => c.name));
        if (!Array.from(expandedCategories).some((name) => allCategoryNames.has(name))) {
            setExpandedCategories(allCategoryNames);
        }
    }

    return (
        <div className="space-y-2">
            {/* Search box */}
            <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search tools..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Tree view */}
            <div className="space-y-1">
                {filteredCategories.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-3 text-center">
                        {searchQuery ? "No tools found matching your search" : "No tools available"}
                    </div>
                ) : (
                    filteredCategories.map((category) => {
                        const isExpanded = expandedCategories.has(category.name);
                        const categoryKey = category.id?.toString() || `uncategorized-${category.name}`;

                        return (
                            <div key={categoryKey} className="border rounded-md overflow-hidden">
                                {/* Category header */}
                                <button
                                    onClick={() => toggleCategory(category.name)}
                                    className={cn(
                                        "w-full flex items-center gap-2 p-2 text-sm font-medium",
                                        "hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
                                        "bg-slate-50 dark:bg-slate-900"
                                    )}
                                >
                                    {isExpanded ? (
                                        <ChevronDown className="h-4 w-4 shrink-0" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4 shrink-0" />
                                    )}
                                    <span className="flex-1 text-left truncate">{category.name}</span>
                                    <Badge variant="secondary" className="text-xs">
                                        {category.tools.length}
                                    </Badge>
                                </button>

                                {/* Tools list */}
                                {isExpanded && (
                                    <div className="border-t">
                                        {category.tools.map((tool) => {
                                            const isSelected = tool.id === selectedToolId;
                                            return (
                                                <button
                                                    key={tool.id}
                                                    onClick={() => onSelectTool(tool)}
                                                    className={cn(
                                                        "w-full flex items-start gap-3 p-2 text-sm",
                                                        "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
                                                        "border-b last:border-b-0",
                                                        isSelected && "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500"
                                                    )}
                                                >
                                                    <div className="shrink-0 mt-0.5">
                                                        <Wrench className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-left">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={cn("font-medium", isSelected && "text-blue-700 dark:text-blue-300")}>
                                                                {tool.name}
                                                            </span>
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    "text-[10px] h-4 px-1",
                                                                    tool.tool_type === "gui"
                                                                        ? "bg-purple-50 dark:bg-purple-900/20 border-purple-300"
                                                                        : "bg-blue-50 dark:bg-blue-900/20 border-blue-300"
                                                                )}
                                                            >
                                                                {tool.tool_type === "gui" ? "GUI" : "MCP"}
                                                            </Badge>
                                                        </div>
                                                        {tool.description && (
                                                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                                {tool.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
