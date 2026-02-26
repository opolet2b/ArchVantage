"use client";

/**
 * Templates Page
 *
 * Main page for template management with explorer tree and editor.
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    FolderPlus,
    FilePlus,
    HelpCircle,
    RefreshCw,
    ChevronRight,
    ChevronDown,
    Folder,
    FileText,
    Trash2,
    Save,
    Sparkles,
    Loader2,
    Palette,
    Code,
    Upload,
    Sidebar,
    SidebarClose,
    SidebarOpen
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { PromptOptimizerDialog } from "@/components/templates/prompt-optimizer-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    ThemeDesigner,
    ThemeSettings,
    parseYamlToSettings,
    settingsToYaml,
} from "@/components/templates/theme-designer";
import { TemplateStructureBuilder } from "@/components/templates/structure-builder";
import { TemplateParserClient, TemplateBlock } from "@/components/templates/template-parser-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Tree node types
interface TreeNode {
    id: string;
    name: string;
    path: string;
    type: "folder" | "template";
    children?: TreeNode[];
    templates?: TreeNode[];
    permission?: string;
    last_modified?: string;
}

// Template content interface
interface TemplateContent {
    id: string;
    name: string;
    path: string;
    content: string;
    folder_id: string | null;
}

export default function TemplatesPage() {
    const { user } = useAuth();
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateContent | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<TreeNode | null>(null);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    // Split editor state - separate theme (YAML) and content (Markdown)
    const [themeSettings, setThemeSettings] = useState<ThemeSettings>({});
    const [markdownContent, setMarkdownContent] = useState("");

    const [isSaving, setIsSaving] = useState(false);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
    const [newItemName, setNewItemName] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateDescription, setGenerateDescription] = useState("");
    const [showGenerateDialog, setShowGenerateDialog] = useState(false);

    // LLM models state
    const [llmModels, setLlmModels] = useState<{ name: string, id: string }[]>([]);
    const [selectedLlm, setSelectedLlm] = useState<string>("default");

    const [structureViewMode, setStructureViewMode] = useState<"visual" | "code">("visual");
    const [templateName, setTemplateName] = useState("");
    const [templatePurpose, setTemplatePurpose] = useState(""); // New Purpose Field
    const [isPurposeExpanded, setIsPurposeExpanded] = useState(true); // Collapsible Purpose State
    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Collapsible Sidebar State
    const [isOptimizerOpen, setIsOptimizerOpen] = useState(false); // Optimizer Dialog State

    const [minQuality, setMinQuality] = useState(80);

    const [maxIterations, setMaxIterations] = useState(3);
    const [levelOfDetail, setLevelOfDetail] = useState("standard");

    // Lifted State for Template Blocks (JSON Structure)
    const [blocks, setBlocks] = useState<any[]>([]);

    // Sync blocks to markdown for preview/legacy support
    useEffect(() => {
        // Only sync if in visual mode to avoid overwriting manual markdown edits?
    }, [blocks]);

    // Fetch template tree
    const fetchTree = useCallback(async () => {
        setLoading(true);
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
    }, []);

    useEffect(() => {
        fetchTree();
    }, [fetchTree]);

    // Fetch LLM models
    useEffect(() => {
        const fetchLlmModels = async () => {
            try {
                const response = await fetch(`${API_URL}/config/presets`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });
                if (response.ok) {
                    const data = await response.json();
                    let models: { name: string, id: string }[] = [];
                    if (Array.isArray(data.presets)) {
                        models = data.presets.map((preset: any) => ({
                            id: preset.model_name || preset.name,
                            name: preset.name || preset.model_name,
                        }));
                    } else {
                        models = Object.entries(data.presets || {}).map(([id, preset]: [string, any]) => ({
                            id: preset.model_name || preset.name || id,
                            name: preset.name || id,
                        }));
                    }
                    setLlmModels(models);
                    if (models.length > 0 && selectedLlm === "default") {
                        setSelectedLlm(models[0].id);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch LLM models:", error);
            }
        };
        fetchLlmModels();
    }, []);

    // Toggle folder expansion and select it
    const toggleFolder = (folder: TreeNode) => {
        setSelectedFolder(folder);
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folder.id)) {
                next.delete(folder.id);
            } else {
                next.add(folder.id);
            }
            return next;
        });
    };
    // Helper to parse template content into YAML and Markdown
    const parseTemplateContent = (content: string) => {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (frontmatterMatch) {
            return {
                yaml: frontmatterMatch[1],
                markdown: frontmatterMatch[2]
            };
        }
        return { yaml: "", markdown: content };
    };

    // Helper to merge theme settings and markdown into full content
    const mergeContent = () => {
        const yaml = settingsToYaml(themeSettings);
        if (yaml.trim()) {
            return `---\n${yaml}\n---\n${markdownContent}`;
        }
        return markdownContent;
    };


    // Select and load a template
    const selectTemplate = async (templateId: string) => {
        try {
            const response = await fetch(`${API_URL}/templates/${templateId}`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            if (response.ok) {
                const data = await response.json();
                setSelectedTemplate(data);
                setTemplateName(data.name);

                // Handle Structure & Purpose (JSON Source of Truth)
                if (data.structure) {
                    let struct = data.structure;
                    if (data.level_of_detail) {
                        // Fallback for legacy templates where it might be top-level (if any exist during migration)
                        // But we prioritize structure.execution_config
                    }    // Handle potential double-stringification or legacy format
                    if (typeof struct === 'string') {
                        try { struct = JSON.parse(struct); } catch (e) { }
                    }

                    if (Array.isArray(struct)) {
                        // Legacy: Structure is just the blocks array
                        setBlocks(struct);
                        setTemplatePurpose("");
                        setMinQuality(80);
                        setMaxIterations(3);
                    } else if (typeof struct === 'object') {
                        // New Format: { purpose: string, blocks: array, execution_config: ... }
                        setBlocks(struct.blocks || []);
                        setTemplatePurpose(struct.purpose || "");
                        if (struct.execution_config) {
                            setMinQuality(struct.execution_config.min_quality || 80);
                            setMaxIterations(struct.execution_config.max_iterations || 3);
                            setLevelOfDetail(struct.execution_config.level_of_detail || "standard");
                        } else {
                            setMinQuality(80);
                            setMaxIterations(3);
                            setLevelOfDetail("standard");
                        }
                    }
                } else {
                    setBlocks([]);
                    setTemplatePurpose("");
                    setMinQuality(80);
                    setMaxIterations(3);
                }



                // ...


                // Parse content into theme and markdown
                const { yaml, markdown } = parseTemplateContent(data.content || "");
                setThemeSettings(parseYamlToSettings(yaml));
                setMarkdownContent(markdown);
            }
        } catch (error) {
            console.error("Failed to load template:", error);
        }
    };

    // Save template
    const saveTemplate = async () => {
        if (!selectedTemplate) return;
        setIsSaving(true);
        try {
            // Ensure structure is synced with content
            const blocksToSave = structureViewMode === 'code'
                ? TemplateParserClient.parse(markdownContent)
                : blocks;

            // If in code mode, also update the blocks state to match
            if (structureViewMode === 'code') {
                setBlocks(blocksToSave);
            }

            // Construct new JSON structure with Purpose
            // Construct new JSON structure with Purpose
            const fullStructure = {
                purpose: templatePurpose,
                blocks: blocksToSave,
                execution_config: {
                    min_quality: minQuality,
                    max_iterations: maxIterations,
                    level_of_detail: levelOfDetail
                }
            };

            const response = await fetch(`${API_URL}/templates/${selectedTemplate.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    name: templateName,
                    content: mergeContent(),

                    structure: fullStructure, // Save the synced JSON structure with purpose
                }),
            });
            if (response.ok) {
                await fetchTree();
            }
        } catch (error) {
            console.error("Failed to save template:", error);
        } finally {
            setIsSaving(false);
        }
    };

    // Create folder
    const createFolder = async () => {
        if (!newItemName.trim()) return;
        try {
            const response = await fetch(`${API_URL}/templates/folders`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    name: newItemName,
                    parent_id: selectedFolder?.id || null,
                }),
            });
            if (response.ok) {
                setIsCreatingFolder(false);
                setNewItemName("");
                await fetchTree();
            } else {
                const data = await response.json();
                alert(data.detail || "Failed to create folder");
            }
        } catch (error) {
            console.error("Failed to create folder:", error);
            alert("Failed to create folder. Please try again.");
        }
    };

    // Create template
    const createTemplate = async () => {
        if (!newItemName.trim()) return;
        try {
            const response = await fetch(`${API_URL}/templates`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    name: newItemName,
                    folder_id: selectedFolder?.id || null,
                    content: "---\n# Add your YAML styles here\n---\n\n# Template Title\n<!-- INSTRUCTION: Describe what content goes here. -->\n",
                }),
            });
            if (response.ok) {
                const data = await response.json();
                setIsCreatingTemplate(false);
                setNewItemName("");
                await fetchTree();
                selectTemplate(data.id);
            }
        } catch (error) {
            console.error("Failed to create template:", error);
        }
    };

    // Delete template
    const deleteTemplate = async (templateId: string) => {
        if (!confirm("Are you sure you want to delete this template?")) return;
        try {
            const response = await fetch(`${API_URL}/templates/${templateId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            if (response.ok) {
                if (selectedTemplate?.id === templateId) {
                    setSelectedTemplate(null);
                    setThemeSettings({});
                    setMarkdownContent("");
                    setBlocks([]);
                }
                await fetchTree();
            }
        } catch (error) {
            console.error("Failed to delete template:", error);
        }
    };

    // Delete folder
    const deleteFolder = async (folderId: string) => {
        if (!confirm("Are you sure you want to delete this folder?")) return;
        try {
            const response = await fetch(`${API_URL}/templates/folders/${folderId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            if (response.ok) {
                if (selectedFolder?.id === folderId) {
                    setSelectedFolder(null);
                }
                await fetchTree();
            } else {
                const data = await response.json();
                alert(data.detail || "Failed to delete folder");
            }
        } catch (error) {
            console.error("Failed to delete folder:", error);
            alert("Failed to delete folder. Please try again.");
        }
    };

    // Generate template with AI
    const generateTemplate = async () => {
        if (!generateDescription.trim()) return;
        setIsGenerating(true);
        try {
            const response = await fetch(`${API_URL}/templates/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    description: generateDescription,
                    llm_model: selectedLlm,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                console.log("[Generate] Raw response data:", data);

                // Parse AI-generated content
                const { yaml, markdown } = parseTemplateContent(data.content);
                console.log("[Generate] Parsed Markdown length:", markdown.length);
                console.log("[Generate] Parsed YAML:", yaml);

                setThemeSettings(parseYamlToSettings(yaml));
                setMarkdownContent(markdown);

                // Parse into visual blocks immediately
                const newBlocks = TemplateParserClient.parse(markdown);
                console.log("[Generate] Parsed Blocks:", newBlocks);
                setBlocks(newBlocks);

                setShowGenerateDialog(false);
                setGenerateDescription("");
            }
        } catch (error) {
            console.error("Failed to generate template:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    // Render tree node recursively
    const renderTreeNode = (node: TreeNode, depth: number = 0) => {
        const isExpanded = expandedFolders.has(node.id);
        const isSelected = selectedTemplate?.id === node.id;
        const paddingLeft = depth * 16 + 8;

        if (node.type === "folder") {
            const isFolderSelected = selectedFolder?.id === node.id;
            return (
                <div key={node.id}>
                    <div
                        className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded group ${isFolderSelected ? "bg-amber-50 dark:bg-amber-900/20" : ""}`}
                        style={{ paddingLeft }}
                        onClick={() => toggleFolder(node)}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        <Folder className={`h-4 w-4 ${isFolderSelected ? "text-amber-600" : "text-amber-500"}`} />
                        <span className="text-sm truncate flex-1">{node.name}</span>
                        {node.permission === "WRITE" && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteFolder(node.id);
                                }}
                                title="Delete folder"
                            >
                                <Trash2 className="h-3 w-3 text-red-500" />
                            </Button>
                        )}
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
                className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded group
                    ${isSelected ? "bg-blue-50 dark:bg-blue-900/30" : ""}`}
                style={{ paddingLeft }}
                onClick={() => selectTemplate(node.id)}
            >
                <FileText className="h-4 w-4 text-cyan-500" />
                <span className="text-sm truncate flex-1">{node.name}</span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                        e.stopPropagation();
                        deleteTemplate(node.id);
                    }}
                >
                    <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
            </div>
        );
    };

    return (
        <div className="flex h-screen">
            {/* Left Panel ... */}
            <div className={`border-r bg-slate-50 dark:bg-slate-900/50 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${isSidebarOpen ? "w-72 translate-x-0 opacity-100" : "w-0 -translate-x-full opacity-0"}`}>
                {/* ... Explorer Header & Tree ... */}
                <div className="p-3 border-b flex items-center justify-between min-w-[288px]">
                    <h2 className="font-semibold text-sm">Templates</h2>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="New Folder" onClick={() => setIsCreatingFolder(true)}>
                            <FolderPlus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="New Template" onClick={() => setIsCreatingTemplate(true)}>
                            <FilePlus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Refresh" onClick={fetchTree}>
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                {/* Tree View */}
                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            Loading...
                        </div>
                    ) : tree.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            No templates yet.<br />
                            Create your first template or folder.
                        </div>
                    ) : (
                        tree.map((node) => renderTreeNode(node))
                    )}
                </div>
            </div>

            {/* Right Panel - Editor */}
            <div className="flex-1 flex flex-col">
                {selectedTemplate ? (
                    <>
                        {/* Editor Header */}
                        <div className="p-3 border-b bg-white dark:bg-slate-900 space-y-3">
                            {/* Top Row: Name and Actions */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-slate-500"
                                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                        title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                                    >
                                        {isSidebarOpen ? <SidebarClose className="h-4 w-4" /> : <SidebarOpen className="h-4 w-4" />}
                                    </Button>
                                    <div>
                                        <Input
                                            value={templateName}
                                            onChange={(e) => setTemplateName(e.target.value)}
                                            className="font-semibold h-8 text-lg px-2 border-transparent hover:border-slate-200 focus:border-slate-300 w-[300px]"
                                        />
                                        <p className="text-xs text-muted-foreground px-2">{selectedTemplate.path}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <Select value={selectedLlm} onValueChange={setSelectedLlm}>
                                        <SelectTrigger className="w-[180px] h-9">
                                            <SelectValue placeholder="Select LLM" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {llmModels.map((model) => (
                                                <SelectItem key={model.id} value={model.id}>
                                                    {model.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button variant="outline" size="sm" onClick={() => setShowGenerateDialog(true)}>
                                        <Sparkles className="h-4 w-4 mr-1" />
                                        AI Generate
                                    </Button>
                                    <Button size="sm" onClick={saveTemplate} disabled={isSaving}>
                                        {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                                        Save
                                    </Button>
                                </div>
                            </div>

                            {/* Template Purpose Field (Highlighted) */}
                            <div className="px-3 pb-2">
                                <Card className="bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 transition-all">
                                    <div
                                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/20 rounded-t transition-colors"
                                        onClick={() => setIsPurposeExpanded(!isPurposeExpanded)}
                                    >
                                        <div className="flex items-center gap-2">
                                            {isPurposeExpanded ? (
                                                <ChevronDown className="h-4 w-4 text-amber-600 transition-transform" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4 text-amber-600 transition-transform" />
                                            )}
                                            <Sparkles className="h-4 w-4 text-amber-600" />
                                            <label className="text-sm font-semibold text-amber-900 dark:text-amber-100 cursor-pointer">
                                                Template Purpose & AI Settings
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {!isPurposeExpanded && (
                                                <span className="text-xs text-muted-foreground hidden sm:inline-block truncate max-w-[200px]">
                                                    {templatePurpose || "No purpose defined"}
                                                </span>
                                            )}
                                            {isPurposeExpanded && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsOptimizerOpen(true);
                                                    }}
                                                >
                                                    <Sparkles className="h-3 w-3 mr-1" />
                                                    Suggest
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {isPurposeExpanded && (
                                        <div className="p-3 pt-0 animate-in slide-in-from-top-2 duration-200">
                                            <Textarea
                                                value={templatePurpose}
                                                onChange={(e) => setTemplatePurpose(e.target.value)}
                                                placeholder="Describe what this template is for (e.g., 'A technical audit report focusing on security vulnerabilities'). This guides the AI."
                                                className="h-20 text-sm resize-none bg-white dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-950 transition-colors border-amber-100 dark:border-amber-900"
                                            />

                                            <div className="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/50 flex flex-col gap-4">

                                                {/* 1. Level of Detail */}
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-medium text-amber-900 dark:text-amber-100">Level of Detail</span>
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <HelpCircle className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                                                                    </TooltipTrigger>
                                                                    <TooltipContent className="max-w-xs">
                                                                        <p>Impacts document length and depth:</p>
                                                                        <ul className="list-disc ml-4 mt-1 space-y-0.5">
                                                                            <li><strong>Low:</strong> Bullet points / Concise.</li>
                                                                            <li><strong>Medium:</strong> Several paragraphs / Standard.</li>
                                                                            <li><strong>High:</strong> Detailed sections / Potential multi-page.</li>
                                                                        </ul>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        </div>
                                                    </div>
                                                    <Select value={levelOfDetail} onValueChange={setLevelOfDetail}>
                                                        <SelectTrigger className="h-8 text-xs bg-white/50 dark:bg-slate-900/50 border-amber-200 dark:border-amber-800">
                                                            <SelectValue placeholder="Select detail..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="low">Low (Concise)</SelectItem>
                                                            <SelectItem value="standard">Standard</SelectItem>
                                                            <SelectItem value="high">High (Comprehensive)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="flex gap-6">
                                                    {/* 2. Target Quality */}
                                                    <div className="flex-1 space-y-2">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-medium text-amber-900 dark:text-amber-100">Target Quality</span>
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <HelpCircle className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                                                                        </TooltipTrigger>
                                                                        <TooltipContent className="max-w-xs">
                                                                            <p>Synthesized quality indicator (0-100%). Analysis continues until this score is met or max cycles are reached.</p>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            </div>
                                                            <span className="font-mono text-amber-700 bg-amber-100/50 dark:bg-amber-900/30 px-1.5 rounded">{minQuality}%</span>
                                                        </div>
                                                        <Slider
                                                            value={[minQuality]}
                                                            max={100}
                                                            step={5}
                                                            onValueChange={([val]) => setMinQuality(val)}
                                                            className="cursor-pointer"
                                                        />
                                                    </div>

                                                    {/* 3. Review Cycles */}
                                                    <div className="flex-1 space-y-2">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-medium text-amber-900 dark:text-amber-100">Max Cycles</span>
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <HelpCircle className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                                                                        </TooltipTrigger>
                                                                        <TooltipContent className="max-w-xs">
                                                                            <p>Number of review + refactoring loops. Process stops when this limit is reached or Quality Target is met.</p>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            </div>
                                                            <span className="font-mono text-amber-700 bg-amber-100/50 dark:bg-amber-900/30 px-1.5 rounded">{maxIterations}</span>
                                                        </div>
                                                        <Slider
                                                            value={[maxIterations]}
                                                            max={10}
                                                            step={1}
                                                            onValueChange={([val]) => setMaxIterations(val)}
                                                            className="cursor-pointer"
                                                        />
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    )}
                                </Card>
                            </div>
                        </div>

                        {/* Prompt Optimizer Dialog */}
                        <PromptOptimizerDialog
                            open={isOptimizerOpen}
                            onOpenChange={setIsOptimizerOpen}
                            onAccept={setTemplatePurpose}
                            initialText={templatePurpose}
                            contextType="purpose"
                            title="Refine Template Purpose"
                            llmModel={selectedLlm}
                        />

                        {/* Editor Content - Tabbed View */}
                        <div className="flex-1 overflow-hidden">
                            <Tabs defaultValue="markdown" className="h-full flex flex-col">

                                <TabsList className="mx-4 mt-2">
                                    <TabsTrigger value="theme" className="gap-2">
                                        <Palette className="h-4 w-4" />
                                        Theme Designer
                                    </TabsTrigger>
                                    <TabsTrigger value="markdown" className="gap-2">
                                        <Code className="h-4 w-4" />
                                        Structure Editor
                                    </TabsTrigger>
                                </TabsList>
                                <TabsContent value="theme" className="flex-1 mt-0 overflow-hidden">
                                    <ThemeDesigner
                                        settings={themeSettings}
                                        onChange={setThemeSettings}
                                    />
                                </TabsContent>
                                <TabsContent value="markdown" className="flex-1 p-4 mt-0 overflow-auto">
                                    {/* Sub-toolbar for Visual vs Code */}
                                    <div className="flex items-center justify-end mb-4 gap-2">
                                        {structureViewMode === "code" && (
                                            <>
                                                <input
                                                    type="file"
                                                    accept=".md,.markdown,.txt"
                                                    className="hidden"
                                                    id="import-markdown-input"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onload = (event) => {
                                                                const content = event.target?.result as string;
                                                                setMarkdownContent(content);
                                                            };
                                                            reader.readAsText(file);
                                                        }
                                                        // Reset value to allow re-importing same file
                                                        e.target.value = "";
                                                    }}
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={() => document.getElementById("import-markdown-input")?.click()}
                                                >
                                                    <Upload className="h-3 w-3 mr-1" />
                                                    Import Markdown
                                                </Button>
                                                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
                                            </>
                                        )}
                                        <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex text-xs font-medium">
                                            <button
                                                className={`px-3 py-1 rounded-md transition-colors ${structureViewMode === "visual" ? "bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                                                onClick={() => setStructureViewMode("visual")}
                                            >
                                                Visual Builder
                                            </button>
                                            <button
                                                className={`px-3 py-1 rounded-md transition-colors ${structureViewMode === "code" ? "bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                                                onClick={() => setStructureViewMode("code")}
                                            >
                                                Raw Markdown
                                            </button>
                                        </div>
                                    </div>

                                    {structureViewMode === "visual" ? (
                                        <TemplateStructureBuilder
                                            blocks={blocks}
                                            onChange={setBlocks}
                                            markdown={markdownContent}
                                            llmModel={selectedLlm}
                                        />
                                    ) : (
                                        <Textarea
                                            className="w-full h-full min-h-[500px] font-mono text-sm resize-none"
                                            style={{ fontVariantLigatures: "none" }}
                                            value={markdownContent}
                                            onChange={(e) => setMarkdownContent(e.target.value)}
                                            placeholder={`# {{Title}}
<!-- INSTRUCTION: Write a title based on the input. -->

## Section
<!-- INSTRUCTION: Describe what goes in this section. -->`}
                                        />
                                    )}
                                </TabsContent>
                            </Tabs>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                            <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p>Select a template to edit</p>
                            <p className="text-sm mt-1">Or create a new one from the sidebar</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Folder Dialog */}
            <Dialog open={isCreatingFolder} onOpenChange={setIsCreatingFolder}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Folder</DialogTitle>
                        <DialogDescription>
                            {selectedFolder
                                ? `Create a subfolder in "${selectedFolder.name}"`
                                : "Create a new root folder"
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder="Folder name"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreatingFolder(false)}>
                            Cancel
                        </Button>
                        <Button onClick={createFolder}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Template Dialog */}
            <Dialog open={isCreatingTemplate} onOpenChange={setIsCreatingTemplate}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Template</DialogTitle>
                        <DialogDescription>
                            {selectedFolder
                                ? `Create a template in "${selectedFolder.name}"`
                                : "Create a template at root level"
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder="Template name"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreatingTemplate(false)}>
                            Cancel
                        </Button>
                        <Button onClick={createTemplate}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* AI Generate Dialog */}
            <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Generate Template with AI</DialogTitle>
                        <DialogDescription>
                            Describe the template you want to create.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        placeholder="E.g., A project status report with blue/orange theme, focusing on budget, timeline, and risks"
                        value={generateDescription}
                        onChange={(e) => setGenerateDescription(e.target.value)}
                        className="min-h-[100px]"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={generateTemplate} disabled={isGenerating}>
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-1" />
                                    Generate
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
