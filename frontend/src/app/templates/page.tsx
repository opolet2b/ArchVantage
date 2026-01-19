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
    Upload
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    ThemeDesigner,
    ThemeSettings,
    parseYamlToSettings,
    settingsToYaml,
} from "@/components/templates/theme-designer";
import { TemplateStructureBuilder } from "@/components/templates/structure-builder";

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

    // Editor View Mode
    // Link the "Visual/Code" view mode state
    const [structureViewMode, setStructureViewMode] = useState<"visual" | "code">("visual");
    const [templateName, setTemplateName] = useState("");

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
                    const models = Object.entries(data.presets || {}).map(([id, preset]: [string, any]) => ({
                        id,
                        name: preset.name || id,
                    }));
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
            const response = await fetch(`${API_URL}/templates/${selectedTemplate.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    name: templateName,
                    content: mergeContent(),
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
                // Parse AI-generated content
                const { yaml, markdown } = parseTemplateContent(data.content);
                setThemeSettings(parseYamlToSettings(yaml));
                setMarkdownContent(markdown);
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
            {/* Left Panel - Tree Explorer */}
            <div className="w-72 border-r bg-slate-50 dark:bg-slate-900/50 flex flex-col">
                {/* Explorer Header */}
                <div className="p-3 border-b flex items-center justify-between">
                    <h2 className="font-semibold text-sm">Templates</h2>
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="New Folder"
                            onClick={() => setIsCreatingFolder(true)}
                        >
                            <FolderPlus className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="New Template"
                            onClick={() => setIsCreatingTemplate(true)}
                        >
                            <FilePlus className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Refresh"
                            onClick={fetchTree}
                        >
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
                        <div className="p-3 border-b flex items-center justify-between bg-white dark:bg-slate-900">
                            <div>
                                <Input
                                    value={templateName}
                                    onChange={(e) => setTemplateName(e.target.value)}
                                    className="font-semibold h-8 text-lg px-2 border-transparent hover:border-slate-200 focus:border-slate-300 w-[300px]"
                                />
                                <p className="text-xs text-muted-foreground px-2">{selectedTemplate.path}</p>
                            </div>
                            <div className="flex gap-2 items-center">
                                {/* LLM Model Selector */}
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
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowGenerateDialog(true)}
                                >
                                    <Sparkles className="h-4 w-4 mr-1" />
                                    AI Generate
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={saveTemplate}
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-1" />
                                    )}
                                    Save
                                </Button>
                            </div>
                        </div>

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
                                            markdown={markdownContent}
                                            onChange={setMarkdownContent}
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
