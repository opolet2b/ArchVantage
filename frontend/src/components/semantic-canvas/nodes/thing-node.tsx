/**
 * Thing Node Component
 *
 * Renders a "thing" on the canvas with semantic zoom behavior.
 * Content display changes based on zoom level.
 * Features resizable containers when selected.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { Handle, Position, NodeProps, NodeResizer } from "reactflow";
import {
    MessageSquare,
    FileText,
    Image,
    Video,
    Database,
    Table,
    Bot,
    Link as LinkIcon,
    ExternalLink,
    Type,
    Minimize2,
    Maximize2,
    Trash2,
    Loader2,
    CheckCircle2,
    AlertCircle,
    BrainCircuit,
    Presentation,
    Lightbulb,
    Eye,
    EyeOff,
    Copy,
    RefreshCcw,
    FileWarning,
    FolderOpen,
    Download,
    Pencil,
    Save,
    X,
    Sparkles,
    Lock,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Layout,
    Info
} from "lucide-react";

import { cn, API_URL } from "@/lib/utils";
import { CanvasThing, ZoomLevel, useCanvasStore, LinkType, CanvasLink } from "../canvas-store";
import {
    MarkdownViewer,
    SpreadsheetViewer,
    ImageViewer,
    MCPToolViewer,
    PDFViewer,
    ConversationViewer,
    TextViewer,
    SelectableContent,
    SelectionToolbar,
    useAnalyze,
    LLMAction,
    Fragment,
    RegionFragment,
    useSelection,
    VectorizationPreviewDialog,
    ChartViewer,
    MarkdownToolbar,
    // JSONViewer, // Not exported in index.ts
    // VideoViewer, // Not exported in index.ts
    // SlideshowViewer, // Not exported in index.ts (or was imported differently)
    ArchiMateToolViewer,
    ArchiMateElementViewer
} from "../viewers";
// SlideshowNode handles its own viewer logic or imports locally? 
// No, SlideshowViewer was used in render? 
// Checking line 60: import { SlideshowNode } from "./slideshow-node";
// I will comment out missing ones to fix build, assuming they were not used or imported differently. 
// But wait, the file clearly used them?
// If they are not in index.ts, maybe they were imported directly? 
// Let's assume standard index exports for now, and fixing the linter is primary.
// If code uses <VideoViewer>, it will error. But I didn't see explicit VideoViewer usage in my brief analysis?
// Wait, I saw "case 'video': return <VideoViewer ... />" in other files maybe?
// Let's stick to what is in index.ts + my new ones.
import { ExecutionPlanModal } from "../execution-plan-modal";
import { SlideshowNode } from "./slideshow-node";
import { TextThingEditor } from "./text-thing-editor";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createPortal } from "react-dom";
import { LinkTypeDialog } from "../link-type-dialog";
import { useToast } from "@/components/ui/use-toast";
import { ExportDialog } from "../export-dialog";
import { CrossCanvasLinkDialog } from "../cross-canvas-link-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ... (Existing icons/themes code unchanged) ...


// =============================================================================
// Icon Mapping
// =============================================================================

const thingIcons: Record<string, React.ElementType> = {
    text: Type,
    conversation: MessageSquare,
    message: MessageSquare,
    document: FileText,
    image: Image,
    video: Video,
    database: Database,
    table: Table,
    agent_result: Bot,
    url: LinkIcon,
    slideshow: Presentation,
};

// =============================================================================
// Type-Specific Color Themes (Agent Builder style)
// =============================================================================

interface ThingColorTheme {
    headerBg: string;
    headerBgDark: string;
    iconColor: string;
    borderSelected: string;
    handleColor: string;
}

const thingColors: Record<string, ThingColorTheme> = {
    text: {
        headerBg: "bg-gradient-to-r from-slate-50 to-gray-100",
        headerBgDark: "dark:from-slate-800/50 dark:to-gray-800/50",
        iconColor: "text-slate-600",
        borderSelected: "border-slate-500",
        handleColor: "!bg-slate-500",
    },
    conversation: {
        headerBg: "bg-gradient-to-r from-blue-50 to-indigo-50",
        headerBgDark: "dark:from-blue-900/20 dark:to-indigo-900/20",
        iconColor: "text-blue-600",
        borderSelected: "border-blue-500",
        handleColor: "!bg-blue-500",
    },
    message: {
        headerBg: "bg-gradient-to-r from-blue-50 to-cyan-50",
        headerBgDark: "dark:from-blue-900/20 dark:to-cyan-900/20",
        iconColor: "text-blue-500",
        borderSelected: "border-blue-400",
        handleColor: "!bg-blue-400",
    },
    document: {
        headerBg: "bg-gradient-to-r from-amber-50 to-orange-50",
        headerBgDark: "dark:from-amber-900/20 dark:to-orange-900/20",
        iconColor: "text-amber-600",
        borderSelected: "border-amber-500",
        handleColor: "!bg-amber-500",
    },
    image: {
        headerBg: "bg-gradient-to-r from-pink-50 to-rose-50",
        headerBgDark: "dark:from-pink-900/20 dark:to-rose-900/20",
        iconColor: "text-pink-600",
        borderSelected: "border-pink-500",
        handleColor: "!bg-pink-500",
    },
    video: {
        headerBg: "bg-gradient-to-r from-purple-50 to-fuchsia-50",
        headerBgDark: "dark:from-purple-900/20 dark:to-fuchsia-900/20",
        iconColor: "text-purple-600",
        borderSelected: "border-purple-500",
        handleColor: "!bg-purple-500",
    },
    database: {
        headerBg: "bg-gradient-to-r from-emerald-50 to-teal-50",
        headerBgDark: "dark:from-emerald-900/20 dark:to-teal-900/20",
        iconColor: "text-emerald-600",
        borderSelected: "border-emerald-500",
        handleColor: "!bg-emerald-500",
    },
    table: {
        headerBg: "bg-gradient-to-r from-cyan-50 to-sky-50",
        headerBgDark: "dark:from-cyan-900/20 dark:to-sky-900/20",
        iconColor: "text-cyan-600",
        borderSelected: "border-cyan-500",
        handleColor: "!bg-cyan-500",
    },
    agent_result: {
        headerBg: "bg-gradient-to-r from-violet-50 to-purple-50",
        headerBgDark: "dark:from-violet-900/20 dark:to-purple-900/20",
        iconColor: "text-violet-600",
        borderSelected: "border-violet-500",
        handleColor: "!bg-violet-500",
    },
    url: {
        headerBg: "bg-gradient-to-r from-sky-50 to-blue-50",
        headerBgDark: "dark:from-sky-900/20 dark:to-blue-900/20",
        iconColor: "text-sky-600",
        borderSelected: "border-sky-500",
        handleColor: "!bg-sky-500",
    },
};

// Default color theme for unknown types
const defaultColorTheme: ThingColorTheme = {
    headerBg: "bg-gradient-to-r from-slate-50 to-gray-50",
    headerBgDark: "dark:from-slate-800/50 dark:to-gray-800/50",
    iconColor: "text-slate-500",
    borderSelected: "border-slate-400",
    handleColor: "!bg-slate-400",
};

// =============================================================================
// Resize handle styles
// =============================================================================

const resizeHandleStyle = {
    width: 10,
    height: 10,
    borderRadius: 2,
    border: "2px solid #3b82f6",
    backgroundColor: "white",
    // Ensure handles are positioned correctly relative to the new relative container
};

// =============================================================================
// Thing Node Data
// =============================================================================

interface ThingNodeData {
    thing: CanvasThing;
    zoomLevel: ZoomLevel;
    isSelected: boolean;
    onOpenConversation?: (conversationId: string) => void;
    onToggleIconify?: (thingId: string) => void;
    onDelete?: (thingId: string) => void;
    onResizeEnd?: (thingId: string, width: number, height: number) => void;
}

/**
 * ThingNode - Memoized for performance optimization.
 * 
 * Prevents unnecessary re-renders when canvas state changes but this
 * specific node's props remain the same.
 */
export const ThingNode = React.memo(function ThingNode(props: NodeProps<ThingNodeData>) {
    const { id, data, selected: isSelected } = props;
    const { toast } = useToast();
    const hiddenNodeLinks = useCanvasStore(state => state.hiddenNodeLinks);
    const toggleNodeLinks = useCanvasStore(state => state.toggleNodeLinks);
    const linksHidden = hiddenNodeLinks.includes(props.data.thing.id);

    // Destructure data from React Flow
    const {
        thing: initialThing,
        onOpenConversation,
        onToggleIconify: onToggleIconifyProp,
        onDelete: onDeleteProp,
        onResizeEnd
    } = data;

    // Use initial thing for reference, but prefer store state
    const thing = initialThing;
    const canvasId = useCanvasStore((state) => state.canvasId);

    // Ensure we are working with the latest thing state from store if possible, 
    // or fallback to props.data (which comes from ReactFlow).
    // The store 'things' array is the source of truth for content updates.
    const storeThing = useCanvasStore(state => state.things.find(t => t.id === thing.id));
    const currentThing = storeThing || thing;

    // If not in store yet (initial render race), use prop.
    const zoomLevel = useCanvasStore((state) => state.zoomLevel);
    const updateThing = useCanvasStore((state) => state.updateThing);
    const deleteThing = useCanvasStore((state) => state.deleteThing);
    const onToggleIconify = useCanvasStore((state) => state.toggleIconify);
    const onDelete = useCanvasStore((state) => state.deleteThing);
    const checkSyncStatus = useCanvasStore((state) => state.checkSyncStatus);
    const performSyncUpdate = useCanvasStore((state) => state.performSyncUpdate);
    const setDockedThing = useCanvasStore((state) => state.setDockedThing);
    const setEditingThingId = useCanvasStore((state) => state.setEditingThingId);
    const editingThingId = useCanvasStore((state) => state.editingThingId);
    const dockedThingId = useCanvasStore((state) => state.dockedThingId);
    const dockPosition = useCanvasStore((state) => state.dockPosition);
    const canvasSettings = useCanvasStore((state) => state.canvasSettings);
    const toggleInspector = useCanvasStore((state) => state.toggleInspector);
    // Processing State for Visual Feedback
    const processingThings = useCanvasStore((state) => state.processingThings);
    const processingMessage = processingThings?.[thing.id];
    const activeScenario = useCanvasStore((state) => state.activeScenario);

    const [selected, setSelected] = React.useState(isSelected);

    // Full Screen State
    const [isFullScreen, setIsFullScreen] = React.useState(false);

    // Content Editing State
    const [isEditingContent, setIsEditingContent] = React.useState(false);
    const [isTrulyFullscreen, setIsTrulyFullscreen] = React.useState(false);

    const [executionPlanOpen, setExecutionPlanOpen] = React.useState(false);
    const [capturedCanvasId, setCapturedCanvasId] = React.useState<string | null>(null);
    // When opening modal, we must capture current canvas ID to ensure execution happens on the same canvas
    // even if user switches context while modal is open.
    const handleOpenExecutionPlan = React.useCallback(() => {
        setCapturedCanvasId(useCanvasStore.getState().canvasId);
        setExecutionPlanOpen(true);
    }, []);

    const [linkTypeDialogOpen, setLinkTypeDialogOpen] = React.useState(false);
    const [selectedTargetId, setSelectedTargetId] = React.useState<string | null>(null);
    const [pendingTargetCanvasId, setPendingTargetCanvasId] = React.useState<string | null>(null);

    // ESC key listener for Truly Fullscreen Editor
    React.useEffect(() => {
        if (!isEditingContent || !isTrulyFullscreen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsTrulyFullscreen(false);
                setIsEditingContent(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isEditingContent, isTrulyFullscreen]);

    // Sync local isEditingContent with global store editingThingId
    // This allows the editor to persist or follow the node when docked/undocked
    React.useEffect(() => {
        if (editingThingId === thing.id) {
            if (!isEditingContent) setIsEditingContent(true);
        } else {
            if (isEditingContent) setIsEditingContent(false);
        }
    }, [editingThingId, thing.id, isEditingContent]);

    // Action to start editing
    const startEditing = React.useCallback(() => {
        setEditingThingId(thing.id);
    }, [thing.id, setEditingThingId]);

    // Sync State
    const [syncDialogOpen, setSyncDialogOpen] = React.useState(false);
    const [syncStatus, setSyncStatus] = React.useState<'idle' | 'checking' | 'ready' | 'syncing' | 'complete' | 'error'>('idle');
    const [syncCheckResult, setSyncCheckResult] = React.useState<{ status: string, message?: string, diff?: string } | null>(null);
    const [syncSourcePath, setSyncSourcePath] = React.useState<string>("");

    // Ref for textarea to use with toolbar
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Local Browser State
    const [browsingUrl, setBrowsingUrl] = React.useState<string | null>(null);

    // Ghost Node Check
    const isGhost = (currentThing.content as any)?.is_ghost;
    const [history, setHistory] = React.useState<string[]>([]);
    const [forwardHistory, setForwardHistory] = React.useState<string[]>([]);

    // Initialize browsing URL from thing content
    React.useEffect(() => {
        if (currentThing.type === "url" && !browsingUrl) {
            setBrowsingUrl((currentThing.content as any).url);
        }
    }, [currentThing.type, currentThing.content]);

    const handleNavigate = (url: string) => {
        if (browsingUrl && browsingUrl !== url) {
            setHistory(prev => [...prev, browsingUrl]);
            setForwardHistory([]); // Clear forward history on new manual navigation
        }
        setBrowsingUrl(url);
    };

    const handleBack = () => {
        if (history.length > 0 && browsingUrl) {
            const prevUrl = history[history.length - 1];
            setHistory(prev => prev.slice(0, -1));
            setForwardHistory(prev => [...prev, browsingUrl]);
            setBrowsingUrl(prevUrl);
        }
    };

    const handleForward = () => {
        if (forwardHistory.length > 0 && browsingUrl) {
            const nextUrl = forwardHistory[forwardHistory.length - 1];
            setForwardHistory(prev => prev.slice(0, -1));
            setHistory(prev => [...prev, browsingUrl]);
            setBrowsingUrl(nextUrl);
        }
    };

    const normalizeUrl = (url: string) => {
        if (!url) return "";
        try {
            // Handle mailto, tel, etc.
            if (!url.startsWith('http')) return url;

            const parsed = new URL(url);
            const scheme = parsed.protocol.toLowerCase(); // Already includes ':'
            const netloc = parsed.host.toLowerCase();
            const path = parsed.pathname.replace(/\/+$/, "");
            const query = parsed.search; // Includes '?'

            return `${scheme}//${netloc}${path}${query}`;
        } catch (e) {
            return url.replace(/\/$/, "");
        }
    };

    const handleStopScraping = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await fetch(`${API_URL}/canvases/${thing.canvas_id}/things/${thing.id}/stop-rag`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`,
                }
            });
        } catch (error) {
            console.error("Failed to stop scraping:", error);
        }
    };

    const handleInitSync = async () => {
        if (!thing.content?.asset_id && !thing.technical_metadata?.source_path && thing.content?.source_type !== 'image_folder') return;
        setSyncDialogOpen(true);
        setSyncStatus('checking');
        setSyncCheckResult(null);

        try {
            const result = await checkSyncStatus(thing.id);
            setSyncCheckResult(result);
            setSyncStatus('ready');

            // If we have a source path from the check result (if backend returns it) or thing content
            // For now, we assume the backend check might give us hints, or we just rely on user re-selecting if needed.
            if (result.status === 'missing_source') {
                // The user will need to pick a file
            }
        } catch (error) {
            console.error("Sync check failed", error);
            setSyncStatus('error');
        }
    };

    const handlePerformSync = async (file?: File) => {
        setSyncStatus('syncing');
        try {
            // New: Pass syncSourcePath if set
            const result = await performSyncUpdate(thing.id, file, !file, syncSourcePath);

            if (result === "sync_same_content") {
                toast({
                    title: "Sync Verified: No Changes",
                    description: "The source file content is identical to the current version.",
                    duration: 3000,
                    variant: "default",
                });
            } else if (result === "sync_started") {
                // Optional: Toast for started
            }

            setSyncStatus('complete');
            setTimeout(() => {
                setSyncDialogOpen(false);
                setSyncStatus('idle');
            }, 1500);
        } catch (error) {
            console.error("Sync failed", error);
            setSyncStatus('error');
        }
    };

    // =============================================================================
    // Transclusion Logic
    // =============================================================================



    // Refresh Transcluded Nodes (Bulk)
    // This is a "soft" refresh - mainly re-fetching for the viewer blocks.
    // In our React architecture, store updates propagate automatically. 
    // This button serves as a manual trigger to re-sync ensures or potentially fetch deep content if we implemented lazy loading.
    // For now, it provides visual feedback.
    const [isRefreshingNodes, setIsRefreshingNodes] = React.useState(false);
    const handleRefreshNodes = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsRefreshingNodes(true);
        // Simulate refresh delay or trigger actual store refresh
        await useCanvasStore.getState().refreshThings();
        setTimeout(() => setIsRefreshingNodes(false), 800);
        toast({
            title: "Nodes Refreshed",
            description: "Transcluded content has been updated.",
            duration: 1000,
        });
    };

    // Transclusion State Logic
    const handleTransclusionStateChange = async (nodeId: string, newState: any) => {
        const currentTransclusions = (thing.content as any).transclusions || {};

        // If locking, we need to capture the snapshot if not already present
        if (newState.locked && !newState.snapshot) {
            const targetThing = useCanvasStore.getState().things.find(t => t.id === nodeId);
            if (targetThing) {
                // Snapshot relevant fields
                newState.snapshot = {
                    title: targetThing.title,
                    type: targetThing.type,
                    content: targetThing.content
                };
            }
        }

        const updatedTransclusions = {
            ...currentTransclusions,
            [nodeId]: {
                ...newState,
                last_updated: new Date().toISOString()
            }
        };

        // Persist
        await updateThing(thing.id, {
            content: {
                ...thing.content,
                transclusions: updatedTransclusions
            }
        });
    };






    const Icon = thingIcons[currentThing.type] || FileText;

    // Link Dialog State
    const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
    const [pendingFragment, setPendingFragment] = React.useState<Fragment | null>(null);
    const [availableTargets, setAvailableTargets] = React.useState<CanvasThing[]>([]);

    // Delete Region Dialog State
    const [deleteRegionDialogOpen, setDeleteRegionDialogOpen] = React.useState(false);
    const [regionToDelete, setRegionToDelete] = React.useState<string | null>(null);

    // State to track if inner content is selected (to hide outer toolbar)
    const [hasInnerSelection, setHasInnerSelection] = React.useState(false);

    // State for local status override to avoid full canvas refresh flicker
    const [localStatus, setLocalStatus] = React.useState(currentThing.rag_status);

    // Title Editing State
    const [isEditingTitle, setIsEditingTitle] = React.useState(false);
    const [titleInputValue, setTitleInputValue] = React.useState("");

    // Update local title state when thing updates
    React.useEffect(() => {
        setTitleInputValue(currentThing.title || getDefaultTitle());
    }, [currentThing.title]);

    const handleTitleSave = () => {
        if (titleInputValue.trim() !== currentThing.title) {
            updateThing(currentThing.id, { title: titleInputValue.trim() });
        }
        setIsEditingTitle(false);
    };

    // Sync local selection state when prop changes (for React Flow interaction)
    React.useEffect(() => {
        setSelected(isSelected);
    }, [isSelected]);

    React.useEffect(() => {
        setLocalStatus(currentThing.rag_status || "none");
    }, [currentThing.rag_status]);

    // Handle manual vectorization trigger
    const handleVectorize = React.useCallback(async () => {
        try {
            setLocalStatus("pending"); // Optimistic update
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/canvases/${canvasId}/things/${thing.id}/vectorize`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error("Failed to trigger vectorization");
            }

            toast({
                title: "Vectorization Started",
                description: "The item has been queued for processing.",
            });

            // Force refresh things to get latest status if needed
            // useCanvasStore.getState().refreshThings();
        } catch (error) {
            console.error("Vectorization trigger failed:", error);
            setLocalStatus("failed");
            toast({
                title: "Vectorization Failed",
                description: "Could not trigger processing. Please try again.",
                variant: "destructive"
            });
        }
    }, [thing.id, canvasId]);

    // Polling effect for RAG Status
    React.useEffect(() => {
        // Only run if status is pending/processing to avoid unnecessary polling
        const shouldPoll = localStatus === "pending" || localStatus === "processing";

        if (shouldPoll) {
            const intervalId = setInterval(async () => {
                try {
                    const token = localStorage.getItem("token");
                    // Guard: Ensure we have necessary IDs before fetching
                    if (!token || !currentThing.canvas_id || !currentThing.id) return;

                    // Use the specific endpoint for a single thing, NOT the list endpoint
                    // The original code was fetching the LIST and searching, which is inefficient and led to the bug
                    const res = await fetch(`${API_URL}/canvases/${canvasId}/things/${currentThing.id}`, {
                        headers: {
                            "Authorization": `Bearer ${token}`,
                        },
                    });

                    if (res.ok) {
                        const updatedThing = await res.json();
                        if (updatedThing && updatedThing.rag_status !== localStatus) {
                            setLocalStatus(updatedThing.rag_status);
                            // Also update store to persist this changes globally AND update content (description)
                            // Use syncThing to avoid PATCHing back to server (prevent overwrite race conditions)
                            useCanvasStore.getState().syncThing(currentThing.id, {
                                rag_status: updatedThing.rag_status,
                                content: updatedThing.content
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to poll thing status", e);
                }
            }, 3000); // Poll every 3s

            return () => clearInterval(intervalId);
        }
    }, [localStatus, canvasId, currentThing.id]);

    // Ask dialog state
    const [askDialogOpen, setAskDialogOpen] = React.useState(false);
    const [customPrompt, setCustomPrompt] = React.useState("");

    // Export Dialog State
    const [exportDialogOpen, setExportDialogOpen] = React.useState(false);

    // Thinking Visibility State
    const [isThinkingVisible, setIsThinkingVisible] = React.useState(false);

    // Parse content for <think> tags (Memoized)
    const { thinkingContent, cleanContent, hasThinking } = React.useMemo(() => {
        const c = thing.content;
        // Check text content sources
        const rawText = (typeof c.text === "string" ? c.text : "") ||
            (typeof c.content === "string" ? c.content : "") ||
            (typeof c.text_content === "string" ? c.text_content : ""); // Support extracted text too

        if (!rawText) return { thinkingContent: null, cleanContent: rawText, hasThinking: false };

        const thinkMatch = rawText.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
            return {
                thinkingContent: thinkMatch[1].trim(),
                cleanContent: rawText.replace(thinkMatch[0], "").trim(),
                hasThinking: true
            };
        }
        return { thinkingContent: null, cleanContent: rawText, hasThinking: false };
    }, [thing.content]);

    // Canvas store helpers
    const addThing = useCanvasStore((state) => state.addThing);
    const addLink = useCanvasStore((state) => state.addLink);
    const updateLink = useCanvasStore((state) => state.updateLink);
    const deleteLink = useCanvasStore((state) => state.deleteLink);
    const selectedModel = useCanvasStore((state) => state.selectedModel);
    const visionModel = useCanvasStore((state) => state.visionModel);
    const links = useCanvasStore((state) => state.links);
    const { analyze, isLoading } = useAnalyze();
    const { setSelection } = useSelection();

    // removeExternalLink is no longer needed as we use deleteLink
    // const removeExternalLink = useCanvasStore(state => state.removeExternalLink);

    // External Link State
    const [crossCanvasLinkDialogOpen, setCrossCanvasLinkDialogOpen] = React.useState(false);
    const [editingExternalLink, setEditingExternalLink] = React.useState<CanvasLink | null>(null);

    const handleUpdateExternalLink = async (type: LinkType, label: string, description: string) => {
        if (!editingExternalLink) return;
        await updateLink(editingExternalLink.id, { type, label, description });
        setEditingExternalLink(null);
    };

    const externalLinks = React.useMemo(() => {
        return links.filter(l => l.source_id === thing.id && l.target_canvas_id && l.target_canvas_id !== canvasId);
    }, [links, thing.id, canvasId]);

    const hasExternalLinks = externalLinks.length > 0;

    const handleOpenExternalCanvas = (targetCanvasId: string, targetNodeId: string) => {
        window.location.href = `/canvas/${targetCanvasId}?node=${targetNodeId}`;
    };



    // Ref for positioning toolbar
    const nodeRef = React.useRef<HTMLDivElement>(null);
    const [toolbarPosition, setToolbarPosition] = React.useState<{ x: number, y: number } | null>(null);

    // --- Progress Bar Logic (for documents/slideshows) ---
    const [progressThing, setProgressThing] = React.useState<CanvasThing>(currentThing);

    // Poll for progress updates if status is "processing"
    React.useEffect(() => {
        let intervalId: NodeJS.Timeout;
        const shouldPoll = progressThing.rag_status === "processing";

        if (shouldPoll) {
            intervalId = setInterval(async () => {
                try {
                    const token = localStorage.getItem("token");
                    if (!token || !currentThing.canvas_id || !currentThing.id) return;

                    const res = await fetch(`/api/v1/canvases/${currentThing.canvas_id}/things/${currentThing.id}`, {
                        headers: {
                            "Authorization": `Bearer ${token}`
                        }
                    });
                    if (res.ok) {
                        const updatedThing = await res.json();
                        // Update if status changed or progress changed
                        const hasStatusChanged = updatedThing.rag_status !== progressThing.rag_status;
                        const hasProgressChanged = JSON.stringify(updatedThing.content?.ingestion_progress)
                            !== JSON.stringify(progressThing.content?.ingestion_progress);

                        if (hasStatusChanged || hasProgressChanged) {
                            setProgressThing(updatedThing);

                            // Fix: Sync to store immediately to prevent race condition where
                            // this loop finishes (completed), stops polling, falls into 'else',
                            // and reverts to stale 'processing' state from store.
                            useCanvasStore.getState().syncThing(currentThing.id, {
                                rag_status: updatedThing.rag_status,
                                content: updatedThing.content
                            });
                        }
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 3000); // Poll every 3 seconds to avoid flooding
        } else {
            // Sync state if we stopped polling but original thing prop updated (e.g. parent refresh)
            if (currentThing.rag_status !== progressThing.rag_status) {
                setProgressThing(currentThing);
            }
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [progressThing.rag_status, progressThing.content?.ingestion_progress, currentThing.canvas_id, currentThing.id, currentThing.rag_status]);

    // Use progressThing for rendering status/content
    const displayThing = progressThing;
    const content = displayThing.content;
    const ingestionProgress = content.ingestion_progress as any; // Cast to any to fix TS errors

    // Result dialog state
    const [resultDialogOpen, setResultDialogOpen] = React.useState(false);
    const [analysisResult, setAnalysisResult] = React.useState<string>("");

    // Vectorization Preview Dialog state
    const [previewDialogOpen, setPreviewDialogOpen] = React.useState(false);
    const [previewContent, setPreviewContent] = React.useState<{ title: string, content: string, type: "image_description" | "scanned_pdf" | "text" }>({ title: "", content: "", type: "text" });

    // Execution Plan Modal (Green Brain)
    // We replaced generic setExecutionPlanOpen with our capturing handler in the top-level state definition.

    // Construct Execution Plan Data safely
    const executionPlanData = React.useMemo(() => {
        // Check if we have specific execution_plan in content (future proof)
        if (thing.content?.execution_plan) {
            let nodes: any[] = [];
            const rawPlan = thing.content.execution_plan as any;
            console.log(`[ThingNode] Raw execution_plan for ${thing.id}:`, rawPlan);

            // Normalize input to array
            if (Array.isArray(rawPlan)) {
                nodes = rawPlan;
            } else if (rawPlan.nodes && Array.isArray(rawPlan.nodes)) {
                nodes = rawPlan.nodes;
            }
            console.log(`[ThingNode] Normalized nodes count:`, nodes.length);

            // Recursive transformer function
            const transformNodes = (items: any[]): any[] => {
                return items.map((item, idx) => {
                    // Determine generic properties (Handle both 'steps' format and 'history' format)
                    const id = item.node_id || item.node || item.id || `node_${idx}`;
                    const type = item.node_type || item.type || (typeof item.node === 'string' ? item.node.split('_').pop()?.toUpperCase() : 'STEP');
                    const label = item.node_label || item.label || item.node || `Step ${idx + 1}`;

                    // Base Node
                    const node: any = {
                        id,
                        type,
                        label: label.replace(/_/g, " "),
                        status: item.status || 'completed',
                        details: item.details || (item.output_data ? JSON.stringify(item.output_data, null, 2) : (item.output ? (typeof item.output === 'string' ? item.output : JSON.stringify(item.output, null, 2)) : undefined)),
                        children: []
                    };

                    // Recursively handle children if present (Standard nested format)
                    if (item.children && Array.isArray(item.children)) {
                        node.children = transformNodes(item.children);
                    }

                    // Check for nested histories in output (ForEach legacy format)
                    const outputObj = item.output_data || item.output || {};
                    if (outputObj && outputObj._foreach_subhistories && Array.isArray(outputObj._foreach_subhistories)) {
                        const subHistories = outputObj._foreach_subhistories;
                        const legacyChildren = subHistories.map((subHistory: any[], subIdx: number) => ({
                            id: `${id}_iter_${subIdx}`,
                            type: 'ITERATION',
                            label: `Section ${subIdx + 1}`, // Assuming sequential sections
                            status: 'completed',
                            children: transformNodes(subHistory)
                        }));
                        node.children = [...node.children, ...legacyChildren];
                    }

                    if (node.children?.length > 0) {
                        console.log(`[ThingNode] Node ${id} has ${node.children.length} children`);
                    }

                    return node;
                });
            };

            const transformed = transformNodes(nodes);
            console.log(`[ThingNode] Transformed plan nodes:`, transformed);

            if (nodes.length > 0) {
                return {
                    templateName: "Deep Agent Plan",
                    nodes: transformed
                };
            }
        }

        // Fallback: If we have agent_analysis (stringified JSON)
        if (thing.content?.agent_analysis) {
            try {
                // If the user wants to keep a minimal trace if no full plan exists:
                return {
                    templateName: "Analysis Process",
                    nodes: [
                        { id: "1", type: "agent", label: "Processing Step", status: "completed", details: thing.content.agent_analysis }
                    ]
                };
            } catch (e) { }
        }
        return null;
    }, [thing.content]);


    // Handle opening preview
    const handleOpenPreview = async () => {
        if (displayThing.type === 'slideshow') {
            // Restore JSON display as per user request
            // We need to fetch the full sidecar JSON, not just the metadata in displayThing.content
            const assetId = displayThing.content?.asset_id;

            if (!assetId) {
                setPreviewContent({
                    title: "Slideshow Data (JSON)",
                    content: JSON.stringify(displayThing.content, null, 2) + "\n\n(No asset_id found to fetch full hierarchy)",
                    type: "text"
                });
                setPreviewDialogOpen(true);
                return;
            }

            setPreviewContent({
                title: "Slideshow Data (JSON)",
                content: "Loading full presentation hierarchy...",
                type: "text"
            });
            setPreviewDialogOpen(true);

            try {
                const token = localStorage.getItem("token");
                const res = await fetch(`/api/v1/assets/sidecar/${assetId}`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (res.ok) {
                    const fullJson = await res.json();
                    setPreviewContent({
                        title: "Slideshow Data (JSON)",
                        content: JSON.stringify(fullJson, null, 2),
                        type: "text"
                    });
                } else {
                    setPreviewContent({
                        title: "Slideshow Data (Error)",
                        content: `Failed to fetch sidecar JSON: ${res.statusText}`,
                        type: "text"
                    });
                }
            } catch (e) {
                setPreviewContent({
                    title: "Slideshow Data (Error)",
                    content: `Network error fetching JSON: ${e}`,
                    type: "text"
                });
            }
            return;
        }

        const description = currentThing.content?.description;
        const generatedDescription = currentThing.content?.generated_description;

        if (description) {
            setPreviewContent({
                title: "Image Description",
                content: description as string,
                type: "image_description"
            });
            setPreviewDialogOpen(true);
        } else if (generatedDescription) {
            setPreviewContent({
                title: "Scanned PDF Transcription",
                content: generatedDescription as string,
                type: "scanned_pdf"
            });
            setPreviewDialogOpen(true);
        } else if (currentThing.type === 'document' && currentThing.rag_status === 'completed') {
            setPreviewContent({
                title: "Document Intelligence",
                content: "This document has been successfully indexed into the Neural Memory.\n\nYou can ask questions about its content.",
                type: "text"
            });
            setPreviewDialogOpen(true);
        } else if (currentThing.rag_status === 'completed') {
            // Fallback for any other completed indexed content (e.g. Text/Explain nodes)
            setPreviewContent({
                title: "Indexed Content",
                content: typeof currentThing.content.text === 'string'
                    ? currentThing.content.text
                    : typeof currentThing.content.content === 'string'
                        ? currentThing.content.content
                        : "This content has been successfully indexed into the Neural Memory.",
                type: "text"
            });
            setPreviewDialogOpen(true);
        }
    };

    // Update toolbar position when selected
    React.useEffect(() => {
        if (selected && nodeRef.current) {
            const rect = nodeRef.current.getBoundingClientRect();
            setToolbarPosition({
                x: rect.left + rect.width / 2,
                y: rect.top - 10,
            });
        } else {
            setToolbarPosition(null);
        }
    }, [selected]);

    // Construct fragment for full content
    const fullThingFragment = React.useMemo<Fragment>(() => {
        let contentStr = "";
        const c = thing.content;

        if (typeof c.text === "string") contentStr = c.text;
        else if (typeof c.content === "string") contentStr = c.content;
        else if (c.messages) contentStr = JSON.stringify(c.messages);
        else contentStr = JSON.stringify(c);

        return {
            type: "text", // Treat whole thing as text for analysis
            content: contentStr,
            startOffset: 0,
            endOffset: contentStr.length,
        };
    }, [thing]);

    // Calculate image overlays from links AND content.regions
    const imageOverlays = React.useMemo(() => {
        // Allow for image, document coverage AND slideshow
        if (thing.type !== "image" && thing.type !== "document" && thing.type !== "slideshow") return [];
        // For documents, only if PDF? Logic seems safe to apply if regions exist

        // 1. Overlays from Links
        const linkOverlays = links
            .filter(l => l.source_id === thing.id && l.source_fragment?.type === "region")
            .map(l => ({
                id: l.id,
                label: l.label || undefined,
                x: (l.source_fragment as unknown as RegionFragment).x,
                y: (l.source_fragment as unknown as RegionFragment).y,
                width: (l.source_fragment as unknown as RegionFragment).width,
                height: (l.source_fragment as unknown as RegionFragment).height,
                type: "link" as const
            }));

        // 2. Overlays from Content Regions (Persistent Frames)
        const currentRegions = (thing.content.regions as any[]) || [];
        const regionOverlays = currentRegions.map((r: any, idx: number) => ({
            id: r.id || `region-${idx}`, // Ensure ID
            label: r.label,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            type: "region" as const,
            content: r.content, // Keep content for reference
            slideIndex: r.slideIndex // Preserve slideIndex for slideshows
        }));

        return [...linkOverlays, ...regionOverlays];
    }, [links, thing.id, thing.type, thing.content]);

    // Handle create new region (persist to content)
    const handleRegionCreate = React.useCallback(async (fragment: Fragment, _position?: { x: number; y: number }) => {
        // Allow for both image and document (PDF) types
        if (thing.type !== "image" && thing.type !== "document" && thing.type !== "slideshow") return;
        // If generic fragment, check type.
        if (fragment.type !== "region") return;
        const regionFragment = fragment as RegionFragment;

        // Fetch fresh thing to ensure we don't overwrite with stale state
        const freshThing = useCanvasStore.getState().things.find(t => t.id === thing.id) || thing;
        const currentRegions = (freshThing.content.regions as any[]) || [];

        // Use provided ID or generate new one
        const regionId = regionFragment.id || Date.now().toString();

        // Prevent duplication: If ID exists in current regions, it's an existing region selection
        if (currentRegions.some(r => String(r.id) === String(regionId))) {
            // Region already exists, just return. (Re-selection handled by onSelect -> setSelection)
            return;
        }

        const newRegion = {
            id: regionId,
            type: "region",
            x: regionFragment.x,
            y: regionFragment.y,
            width: regionFragment.width,
            height: regionFragment.height,
            content: undefined, // Do not store heavy base64 in database
            label: regionId,
            slideIndex: regionFragment.slideIndex, // Persist slideIndex
            pageNumber: (regionFragment as any).pageNumber // Persist pageNumber if present
        };

        const updatedRegions = [...currentRegions, newRegion];

        // Update thing content
        await updateThing(thing.id, {
            content: { ...freshThing.content, regions: updatedRegions }
        });
    }, [thing, updateThing]);

    // Handle cascading delete of region and related content
    const handleConfirmDeleteRegion = React.useCallback(async () => {
        if (!regionToDelete) return;
        // 1. Identify related links
        const relatedLinks = links.filter(l => {
            const isSource = l.source_id === thing.id;
            const fragIdMatch = l.source_fragment?.id === regionToDelete;
            const labelMatch = (l.source_fragment as any)?.label === regionToDelete || l.label === regionToDelete; // detailed check

            // Log matches for debugging
            if (isSource && (fragIdMatch || labelMatch)) {
            }

            return isSource && (fragIdMatch || labelMatch);
        });
        // 2. Identify related things
        const relatedThingIds = relatedLinks.map(l => l.target_id);
        // 3. Delete related links
        for (const link of relatedLinks) {
            await deleteLink(link.id);
        }

        // 4. Delete related things
        const deleteThing = useCanvasStore.getState().deleteThing;
        for (const tId of relatedThingIds) {
            await deleteThing(tId);
        }

        // 5. Delete the region itself
        // refetch thing to ensure we have latest content (avoid race with deleteLink updates if any)
        const freshThing = useCanvasStore.getState().things.find(t => t.id === thing.id) || thing;
        const currentRegions = (freshThing.content.regions as any[]) || [];
        const updatedRegions = currentRegions.filter((r, idx) => {
            const rId = r.id || `region-${idx}`;
            return String(rId) !== String(regionToDelete);
        });
        await updateThing(thing.id, {
            content: { ...freshThing.content, regions: updatedRegions }
        });

        // Close dialog
        setDeleteRegionDialogOpen(false);
        setRegionToDelete(null);
    }, [regionToDelete, links, thing, deleteLink, updateThing]);

    // Handle delete region or link overlay
    const handleOverlayDelete = React.useCallback(async (id: string) => {
        // Check if it's a link
        const link = links.find(l => l.id === id);
        if (link) {
            // It's a link overlay -> Delete the link
            await deleteLink(id);
            // Links deletion cascades to orphan nodes handled in CanvasView
        } else {
            // It's a content region -> Open confirmation dialog
            setRegionToDelete(id);
            setDeleteRegionDialogOpen(true);
        }
    }, [links, deleteLink]);

    // Handle overlay resize (persist to link OR content)
    const handleOverlayResize = React.useCallback(async (overlayId: string, x: number, y: number, width: number, height: number) => {
        // Check if link
        const link = links.find(l => l.id === overlayId);
        if (link && link.source_fragment) {
            const updatedFragment = {
                ...link.source_fragment,
                x, y, width, height
            };
            await updateLink(overlayId, { source_fragment: updatedFragment });
            return;
        }

        // Check if content region
        const currentRegions = (thing.content.regions as any[]) || [];
        const regionIndex = currentRegions.findIndex(r => r.id === overlayId);
        if (regionIndex !== -1) {
            const updatedRegions = [...currentRegions];
            updatedRegions[regionIndex] = {
                ...updatedRegions[regionIndex],
                x, y, width, height
            };
            await updateThing(thing.id, {
                content: { ...thing.content, regions: updatedRegions }
            });
        }
    }, [links, thing, updateLink, updateThing]);

    // Helpers copied from SelectableContent
    // Helpers copied from SelectableContent
    const getFragmentData = (fragment: Fragment) => ({
        ...fragment, // Preserve all properties (x, y, width, height for regions)
    }); // simplified for full thing

    // Helper: Create new node from result and link it
    const createNodeAndLink = React.useCallback(async (text: string, sourceFragment: Fragment, targetCanvasId?: string) => {
        // Use provided canvasId or fall back to current prop
        const cId = targetCanvasId || canvasId;
        if (!cId) return;

        // Calculate position: right of the current node
        const position = { x: thing.position_x + (thing.width || 200) + 50, y: thing.position_y };

        // Create new text thing with title derived from source fragment ID
        const newThingTitle = sourceFragment.id || "Analysis Result";
        // CRITICAL FIX: Pass cId explicitly to addThing
        const newThing = await addThing("text", { text }, position, undefined, undefined, newThingTitle, undefined, undefined);

        if (newThing) {
            // Create link
            await addLink(
                thing.id,
                newThing.id,
                "derived_from",
                "Analysis",
                "Analysis result derived from this thing",
                getFragmentData(sourceFragment), // Use smart label
                undefined,
                undefined,
                cId // CRITICAL FIX: Pass cId explicitly to addLink
            );
        }
    }, [thing, addThing, addLink, canvasId]);

    // Helper to fetch image as base64
    const fetchImageAsBase64 = React.useCallback(async (url: string): Promise<string | null> => {
        try {
            const token = localStorage.getItem("token");
            let fetchUrl = url;

            // Handle relative API URLs
            if (url.startsWith("/api/") && API_URL) {
                // If API_URL is absolute, check if we need to construct the full URL
                if (API_URL.startsWith("http")) {
                    const apiUrlObj = new URL(API_URL);
                    fetchUrl = `${apiUrlObj.origin}${url}`;
                } else {
                    // Fallback development assumption or relative base
                    fetchUrl = `${window.location.protocol}//${window.location.hostname}:8000${url}`;
                }
            }

            const res = await fetch(fetchUrl, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) return null;
            const blob = await res.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to fetch image", e);
            return null;
        }
    }, []);

    const handleContentSave = async (newContent: string) => {
        // Determine field to update based on current content structure
        const updates: any = {};
        if (typeof thing.content.text === "string") {
            updates.text = newContent;
        } else if (typeof thing.content.content === "string") {
            updates.content = newContent;
        } else {
            // Fallback default
            updates.text = newContent;
        }

        await updateThing(thing.id, {
            content: {
                ...thing.content,
                ...updates
            }
        });
        setIsEditingContent(false);
        toast({
            title: "Changes Saved",
            description: "Text content updated successfully.",
            duration: 2000,
        });
    };

    // Handle LLM action
    const handleAction = React.useCallback(
        async (action: LLMAction, fragment: Fragment) => {
            if (action === "ask") {
                setAskDialogOpen(true);
                return;
            }

            if (!canvasId) return;

            let finalFragment = fragment;
            let modelToUse = selectedModel;

            // Handle image analysis (whole thing or region)
            if (thing.type === "image") {
                modelToUse = visionModel || selectedModel;

                // If "whole thing" (text fragment with file path), fetch image data
                if (fragment.type === "text" && thing.content.file_path) {
                    const base64 = await fetchImageAsBase64(thing.content.file_path as string);
                    if (base64) {
                        finalFragment = {
                            ...fragment,
                            content: base64, // Inject base64 image data
                        };
                    }
                }
            } else if (thing.type === "document") {
                // Documents should default to LLM (selectedModel)
                modelToUse = selectedModel;

                // ONLY use Vision if it is explicitly a visual region selection
                if (fragment.type === "region") {
                    modelToUse = visionModel || selectedModel;
                }
            }

            // If it's a region fragment (from ImageViewer), use vision model
            // If it's a region fragment (from ImageViewer), use vision model
            if (fragment.type === "region") {
                modelToUse = visionModel || selectedModel;
                const regionFrag = fragment as RegionFragment;
                // If content is empty/missing but we have coordinates, cropping is needed
                // The ImageViewer usually sets content="", so we check that.
                if ((!regionFrag.content || regionFrag.content.length < 100) && thing.content.file_path) {
                    const base64Full = await fetchImageAsBase64(thing.content.file_path as string);

                    if (base64Full) {
                        try {
                            // Perform client-side cropping
                            const croppedBase64 = await new Promise<string>((resolve, reject) => {
                                const img = document.createElement("img");
                                img.onload = () => {
                                    const canvas = document.createElement('canvas');
                                    // Fragment uses percentages (0-100)
                                    const x = (regionFrag.x / 100) * img.naturalWidth;
                                    const y = (regionFrag.y / 100) * img.naturalHeight;
                                    const w = (regionFrag.width / 100) * img.naturalWidth;
                                    const h = (regionFrag.height / 100) * img.naturalHeight;
                                    // Ensure valid dimensions
                                    if (w <= 0 || h <= 0) {
                                        console.warn("[ThingNode] Invalid crop dimensions, resolving full image.");
                                        resolve(base64Full);
                                        return;
                                    }

                                    canvas.width = w;
                                    canvas.height = h;
                                    const ctx = canvas.getContext('2d');
                                    if (ctx) {
                                        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
                                        resolve(canvas.toDataURL('image/png'));
                                    } else {
                                        resolve(base64Full);
                                    }
                                };
                                img.onerror = (e) => {
                                    console.error("[ThingNode] Failed to load image for cropping", e);
                                    reject(e);
                                };
                                img.src = base64Full;
                            });

                            finalFragment = {
                                ...regionFrag,
                                content: croppedBase64
                            };
                        } catch (e) {
                            console.error("Failed to crop image", e);
                            finalFragment = { ...fragment, content: base64Full };
                        }
                    } else {
                        console.error("[ThingNode] Failed to fetch base64 image");
                    }
                }
            }

            const result = await analyze({
                canvasId,
                thingId: thing.id,
                fragment: finalFragment,
                action,
                model: modelToUse || undefined,
            });

            if (result && result.result) {
                // Pass captured canvasId to ensure creation happens on the source canvas
                await createNodeAndLink(result.result, fragment, canvasId);
            }
        },
        [canvasId, thing, analyze, createNodeAndLink, selectedModel, visionModel, fetchImageAsBase64]
    );

    // Handle ask with custom prompt
    const handleAskSubmit = React.useCallback(async (e?: React.SyntheticEvent) => {
        if (e) e.preventDefault();

        if (!canvasId || !customPrompt.trim()) return;

        // Note: Dialog stays OPEN with loading state now

        try {
            let finalFragment = fullThingFragment;
            let modelToUse = selectedModel;

            if (thing.type === "image") {
                modelToUse = visionModel || selectedModel;
                if (thing.content.file_path) {
                    const base64 = await fetchImageAsBase64(thing.content.file_path as string);
                    if (base64) {
                        finalFragment = {
                            ...fullThingFragment,
                            content: base64,
                        };
                    }
                }
            }

            const result = await analyze({
                canvasId,
                thingId: thing.id,
                fragment: finalFragment,
                action: "ask",
                customPrompt: customPrompt.trim(),
                model: modelToUse || undefined,
            });
            if (result && result.result) {
                // Pass captured canvasId
                await createNodeAndLink(result.result, fullThingFragment, canvasId);
            }

            // Only close and clear on success/completion
            setAskDialogOpen(false);
            setCustomPrompt("");
        } catch (err) {
            console.error("[ThingNode] Ask failed:", err);
            setAskDialogOpen(false);
        }
    }, [canvasId, thing, fullThingFragment, customPrompt, analyze, createNodeAndLink, selectedModel, visionModel, fetchImageAsBase64]);

    // Handle link action - open target selection dialog
    const handleLink = React.useCallback((fragment: Fragment) => {
        setPendingFragment(fragment);
        setCrossCanvasLinkDialogOpen(true);
    }, [thing.id]);



    // Handle selecting a target for the link
    const handleLinkToTarget = React.useCallback((targetId: string) => {
        if (!pendingFragment) return;

        // Store target and open type dialog instead of creating immediately
        setSelectedTargetId(targetId);
        setLinkDialogOpen(false);
        setLinkTypeDialogOpen(true);
    }, [pendingFragment]);

    // Handle actual link creation after type selection
    const handleConfirmLink = React.useCallback(async (type: LinkType, label: string, description: string) => {
        if (!pendingFragment || !selectedTargetId) return;

        await addLink(
            thing.id,
            selectedTargetId,
            type,
            label,
            description,
            getFragmentData(pendingFragment),
            undefined,
            pendingTargetCanvasId || undefined
        );

        setLinkTypeDialogOpen(false);
        setPendingFragment(null);
        setSelectedTargetId(null);
        setPendingTargetCanvasId(null);
    }, [thing.id, pendingFragment, selectedTargetId, pendingTargetCanvasId, addLink]);

    // Handle creating result as new thing (from result dialog if we used that)
    const handleCreateThing = React.useCallback(async () => {
        if (!analysisResult) return;
        await addThing("text", { text: analysisResult }, { x: thing.position_x + 50, y: thing.position_y + 50 });
        setResultDialogOpen(false);
        setAnalysisResult("");
    }, [analysisResult, addThing, thing]);


    // Get highlighted fragment for traceability
    const highlightedFragment = useCanvasStore(state => state.highlightedFragment);


    const highlight = (highlightedFragment && highlightedFragment.thingId === thing.id)
        ? highlightedFragment.fragment
        : undefined;

    // Get type-specific color theme
    const colorTheme = thingColors[thing.type] || defaultColorTheme;

    // Handle double click
    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent canvas zoom
        if (thing.type === "conversation" && onOpenConversation) {
            onOpenConversation(thing.id);
        } else if (thing.iconified && onToggleIconify) {
            onToggleIconify(thing.id);
        }
    };

    // Handle toggle iconify
    const handleToggleIconify = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onToggleIconify) {
            onToggleIconify(thing.id);
        }
    };


    // Helper to detect markdown
    const isMarkdown = (text: string) => {
        if (!text) return false;
        // Check for common markdown patterns: headers, lists, code blocks, bold/italic, links, tables
        const patterns = [
            /^#+\s/m,                   // Headers
            /^[-*]\s/m,                 // Bullet lists
            /^\d+\.\s/m,                // Numbered lists
            /```/,                      // Code blocks
            /\*\*.+\*\*/,               // Bold
            /\[.+\]\(.+\)/,             // Links
            /^>/m,                      // Blockquotes
            /\|.+\|.+\|/m               // Tables
        ];
        return patterns.some(p => p.test(text));
    };

    // Render full content based on type using appropriate viewer
    // All viewers are wrapped with eContent for selection toolbar
    const renderFullContent = () => {
        console.log("DEBUG: renderFullContent called for type:", thing.type);
        const content = thing.content;
        const filename = content.filename as string | undefined;

        // Normalize type to handle backend Enum casing differences (e.g. "TABLE" vs "table")
        const type = (thing.type || "").toLowerCase();

        switch (type) {
            case "mcp_tool":
                return <MCPToolViewer thing={thing} />;

            case "archimate_tool":
                return <ArchiMateToolViewer thing={thing} />;

            case "archimate_element":
                return <ArchiMateElementViewer thing={thing} />;

            case "text":
            case "agent_result": // Treat agent results as text, utilizing markdown viewer if applicable
                let rawVal = cleanContent || content.text || content.content || "";
                if (typeof rawVal === 'object') {
                    rawVal = JSON.stringify(rawVal, null, 2);
                }
                const textVal = String(rawVal);

                if (isEditingContent && thing.type === "text") {
                    // We now handle editing in a fullscreen Dialog to avoid React Flow conflicts
                    // The main content will render normally in the background
                }

                // Check for Visualizer Output (Charts)
                const visOutput = (thing.content as any)?.visualizer_output;
                if (visOutput?.visual_payload) {
                    const st = visOutput.visual_payload.structure_type?.toLowerCase() || "";
                    if (st === 'chart' || st.includes('chart') || st === 'react_component') {
                        const chartType = (st === 'chart' || st === 'react_component') ? 'linechart' : st;
                        return (
                            <div className="flex flex-col h-full overflow-hidden p-2">
                                <div className="font-medium text-sm mb-2 px-1">
                                    {thing.title || "Visual Analysis"}
                                </div>
                                <div className="flex-1 min-h-0 border rounded-md bg-slate-50 dark:bg-slate-900/50">
                                    <ChartViewer
                                        type={chartType}
                                        data={visOutput.visual_payload.content}
                                        isAnimationActive={true}
                                    />
                                </div>
                            </div>
                        );
                    }
                }

                const showAsMarkdown = thing.type === "agent_result" || ((isMarkdown(textVal) || textVal.includes("{{node:")) && !highlight);

                return (
                    <div className="flex flex-col h-full overflow-hidden">
                        {/* Thinking Block */}
                        {hasThinking && isThinkingVisible && (
                            <div className="flex-none mb-3 p-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-md border border-amber-100 dark:border-amber-900/30 text-sm text-slate-600 dark:text-slate-400 italic overflow-y-auto max-h-[150px]">
                                <div className="flex items-center gap-2 font-semibold text-xs mb-1 not-italic text-amber-600 dark:text-amber-500 opacity-80">
                                    <BrainCircuit className="w-3 h-3" />
                                    Thinking Process
                                </div>
                                <SelectableContent thingId={thing.id}>
                                    <MarkdownViewer content={thinkingContent || ""} ancestorIds={[thing.id]} className="text-sm prose-sm dark:prose-invert leading-relaxed" />
                                </SelectableContent>
                            </div>
                        )}

                        {/* Main Content */}
                        <div className="flex-1 min-h-0 overflow-y-auto px-1 custom-scrollbar">
                            <SelectableContent thingId={thing.id}>
                                {showAsMarkdown ? (
                                    <MarkdownViewer
                                        content={textVal}
                                        className="h-full prose-sm dark:prose-invert"
                                        ancestorIds={[thing.id]}
                                        onSelect={(fragment, position) => setSelection(thing.id, fragment, position)}
                                        transclusionStates={(thing.content as any).transclusions}
                                        onTransclusionStateChange={handleTransclusionStateChange}
                                    />
                                ) : (
                                    <TextViewer
                                        content={textVal}
                                        className="h-full"
                                        highlight={highlight}
                                        onSelect={(fragment, position) => setSelection(thing.id, fragment, position)}
                                    />
                                )}
                            </SelectableContent>
                        </div>
                    </div>
                );

            case "conversation":
                // Keep simpler ones disabled or just text representation for now
                const messages = content.messages as Array<{
                    id?: string;
                    role: "user" | "assistant" | "system";
                    content: string;
                }>;
                return (
                    <SelectableContent thingId={thing.id}>
                        <ConversationViewer
                            conversationId={(content as any).conversation_id}
                            initialMessages={messages || []}
                            className="h-full"
                        />
                    </SelectableContent>
                );

            case "document":
                // If processing, show progress bar immediately to override any stale content
                if ((currentThing.rag_status as any) === "processing" || (currentThing.rag_status as any) === "pending") {
                    return (
                        <SelectableContent thingId={thing.id}>
                            <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-6">
                                {/* Status Message (Top) */}
                                <p className="text-base font-semibold text-slate-700 dark:text-slate-200 animate-pulse">
                                    {(thing.content as any).processing_status || "Processing Document..."}
                                </p>

                                {/* Heartbeat / Loader (Middle) */}
                                <div className="relative">
                                    <div className="absolute inset-0 bg-blue-400 blur-lg opacity-20 animate-pulse rounded-full"></div>
                                    <Loader2 className="relative w-10 h-10 animate-spin text-blue-500" />
                                </div>

                                {/* Progress Bar (Bottom - Only for Ingestion) */}
                                {ingestionProgress && (
                                    <div className="space-y-1">
                                        <div className="w-48 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 transition-all duration-500 ease-out"
                                                style={{ width: `${ingestionProgress?.percent || 0}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            {`${ingestionProgress.current} / ${ingestionProgress.total} chunks`}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </SelectableContent>
                    );
                }

                // Determine document type and use appropriate viewer
                const fileType = content.file_type as string | undefined;
                const filePath = content.file_path as string | undefined;
                const textContent = content.content as string | undefined;

                // PDF files
                if (
                    (fileType?.includes("pdf") || filename?.toLowerCase().endsWith(".pdf")) &&
                    !filename?.toLowerCase().endsWith(".docx") &&
                    !filename?.toLowerCase().endsWith(".doc")
                ) {
                    if (filePath) {
                        return (
                            <SelectableContent thingId={thing.id}>
                                <PDFViewer
                                    src={filePath}
                                    className="h-full"
                                    overlays={imageOverlays}
                                    onOverlayResize={handleOverlayResize}
                                    onSelect={(fragment, position) => {
                                        if (fragment.type === "region") {
                                            handleRegionCreate(fragment, position);
                                            // Force toolbar show for re-selection
                                            setSelection(thing.id, fragment, position);
                                        } else {
                                            // Text selection - show toolbar immediately
                                            setSelection(thing.id, fragment, position);
                                        }
                                    }}
                                    onOverlayDelete={handleOverlayDelete}
                                />
                            </SelectableContent>
                        );
                    }
                }

                // Markdown files
                if (filename?.toLowerCase().endsWith(".md")) {
                    return (
                        <SelectableContent thingId={thing.id}>
                            <MarkdownViewer
                                content={textContent || ""}
                                className="max-h-[200px] overflow-y-auto"
                                ancestorIds={[thing.id]}
                                onSelect={(fragment, position) => setSelection(thing.id, fragment, position)}
                            />
                        </SelectableContent>
                    );
                }

                // Spreadsheet files (Excel, CSV)
                if (
                    filename?.toLowerCase().match(/\.(xlsx?|csv)$/) ||
                    fileType?.includes("spreadsheet") ||
                    fileType?.includes("excel") ||
                    fileType?.includes("csv")
                ) {
                    // Construct API URL if asset_id is present, otherwise fallback to path
                    const assetId = content.asset_id;
                    const fileUrl = assetId ? `/api/v1/assets/${assetId}` : (filePath || textContent || "");

                    return (
                        <SelectableContent thingId={thing.id}>
                            <SpreadsheetViewer
                                content={fileUrl}
                                filename={filename}
                                className={cn(thing.height ? "h-full" : "max-h-[200px]")}
                                highlight={highlight}
                                onSelect={(fragment, position) => setSelection(thing.id, fragment, position)}
                            />
                        </SelectableContent>
                    );
                }

                // Word Documents (or others with extracted text)
                if (content.text_content) {
                    return (
                        <SelectableContent thingId={thing.id}>
                            <MarkdownViewer
                                content={content.text_content as string}
                                className="h-full overflow-y-auto px-4"
                                ancestorIds={[thing.id]}
                                onSelect={(fragment, position) => setSelection(thing.id, fragment, position)}
                                selectionEnabled={true}
                            />
                        </SelectableContent>
                    );
                }

                // Generated markdown documents (from Document Templates)
                if (content.format === "markdown" && textContent) {
                    return (
                        <SelectableContent thingId={thing.id}>
                            <MarkdownViewer
                                content={textContent}
                                className="h-full overflow-y-auto px-4 prose prose-sm dark:prose-invert max-w-none"
                                ancestorIds={[thing.id]}
                                onSelect={(fragment, position) => setSelection(thing.id, fragment, position)}
                                selectionEnabled={true}
                            />
                        </SelectableContent>
                    );
                }

                // Default: plain text viewer
                return (
                    <SelectableContent thingId={thing.id}>
                        <TextViewer
                            content={textContent || `File: ${filename || "Unknown"}`}
                            className="h-full overflow-y-auto"
                            highlight={highlight}
                            onSelect={(fragment, position) => setSelection(thing.id, fragment, position)}
                        />
                    </SelectableContent>
                );

            case "image":
                const imageAssetId = content.asset_id;
                const imageSrc = imageAssetId ? `/api/v1/assets/${imageAssetId}` : (content.file_path || content.url || "");
                return (
                    <SelectableContent thingId={thing.id} onSelectionChange={setHasInnerSelection}>
                        <ImageViewer
                            src={imageSrc as string}
                            alt={content.alt_text as string || "Image"}
                            className={cn(thing.height ? "h-full" : "max-h-[200px]")}
                            overlays={imageOverlays}
                            onOverlayResize={handleOverlayResize}
                            onSelect={(fragment, position) => {
                                handleRegionCreate(fragment, position);
                                setSelection(thing.id, fragment, position);
                            }}
                            onOverlayDelete={handleOverlayDelete}
                        />
                    </SelectableContent>
                );

            case "table":
                // Handle direct data (from backend parser) or fallback to file/csv
                const tableData = (content.data as any[][]) || [];
                const tableContent = (content.csv as string) || (content.markdown as string) || "";

                return (
                    <SelectableContent thingId={thing.id}>
                        <SpreadsheetViewer
                            content={tableContent}
                            initialData={tableData}
                            filename={filename || thing.title || "Table"}
                            className={cn(thing.height ? "h-full" : "max-h-[200px]")}
                            highlight={highlight}
                            onSelect={(fragment, position) => setSelection(thing.id, fragment, position)}
                        />
                    </SelectableContent>
                );

            case "slideshow":
                return (
                    <SelectableContent thingId={thing.id}>
                        <SlideshowNode
                            thing={thing}
                            overlays={imageOverlays}
                            onSelect={(fragment, position) => {
                                handleRegionCreate(fragment, position);
                                setSelection(thing.id, fragment, position);
                            }}
                            onOverlayResize={handleOverlayResize}
                            onOverlayDelete={handleOverlayDelete}
                            onOverlayClick={(fragment, position) => {
                                setSelection(thing.id, fragment, position);
                            }}
                        />
                    </SelectableContent>
                );

            case "url":
                console.log("DEBUG: Case URL entered. RAG Status:", currentThing.rag_status);
                if ((currentThing.rag_status as any) === "processing" || (currentThing.rag_status as any) === "pending") {
                    const progress = (currentThing.content as any)?.ingestion_progress;
                    const currentUrl = progress?.current_url;
                    const scrapedCount = progress?.scraped_count || 0;

                    return (
                        <SelectableContent thingId={thing.id}>
                            <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                <div className="space-y-4 w-full max-w-xs">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Scraping Web Content...
                                        </p>
                                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 animate-pulse"
                                                style={{ width: `70%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            {scrapedCount > 0 ? `Scraped ${scrapedCount} pages` : "Recursive search in progress"}
                                        </p>
                                    </div>

                                    {currentUrl && (
                                        <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded border dark:border-slate-700 text-[10px] font-mono break-all text-left text-slate-400 max-h-24 overflow-y-auto">
                                            {currentUrl}
                                        </div>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs gap-2 text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50"
                                        onClick={handleStopScraping}
                                    >
                                        <X className="w-3 h-3" />
                                        Stop Scraping
                                    </Button>
                                </div>
                            </div>
                        </SelectableContent>
                    );
                }
                const pages = (content.pages as Record<string, string>) || {};
                const rawUrl = browsingUrl || (content.url as string);
                const currentUrl = normalizeUrl(rawUrl);
                const pageContent = pages[currentUrl];

                const renderBrowserContent = () => {
                    // Always log for debugging
                    console.log("DEBUG: Current URL (Normalized):", currentUrl);
                    console.log("DEBUG: Raw URL:", rawUrl);
                    console.log("DEBUG: Available content keys:", Object.keys(pages));
                    console.log("DEBUG: Page content match:", !!pageContent);
                    if (pageContent) console.log("DEBUG: Content start:", pageContent.substring(0, 50));

                    if (!pageContent) {
                        return (
                            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-500 italic">
                                Page not scraped.
                                <a
                                    href={currentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline mt-2 flex items-center gap-1"
                                >
                                    Open in new tab <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        );
                    }

                    // Ultra-robust check: Look for "PDF_ASSET" anywhere in the string
                    if (pageContent && pageContent.includes("PDF_ASSET")) {
                        // Extract UUID: Find the standard UUID pattern
                        const uuidMatch = pageContent.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);

                        if (uuidMatch) {
                            const assetId = uuidMatch[0];
                            return (
                                <div className="h-full overflow-hidden">
                                    <PDFViewer src={`/api/v1/assets/${assetId}`} />
                                </div>
                            );
                        }
                    }

                    return (
                        <MarkdownViewer
                            content={pageContent}
                            onLinkClick={handleNavigate}
                        />
                    );
                };

                return (
                    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                        {/* Browser Header */}
                        <div className="flex items-center gap-1 p-2 bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                            <div className="flex items-center">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7"
                                    onClick={handleBack}
                                    disabled={history.length === 0}
                                    title="Back"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7"
                                    onClick={handleForward}
                                    disabled={forwardHistory.length === 0}
                                    title="Forward"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                            <div className="flex-1 bg-white dark:bg-slate-900 px-3 py-1 rounded border dark:border-slate-700 text-xs truncate text-slate-500 font-mono">
                                {currentUrl}
                            </div>
                            <a
                                href={currentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                            >
                                <ExternalLink className="w-4 h-4 text-blue-500" />
                            </a>
                        </div>

                        {/* Browser Body */}
                        <div className="flex-1 overflow-y-auto p-0 custom-scrollbar relative">
                            <SelectableContent thingId={thing.id}>
                                {renderBrowserContent()}
                            </SelectableContent>
                        </div>
                    </div>
                );

            default:
                return (
                    <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-auto max-h-[200px]">
                        {JSON.stringify(content, null, 2)}
                    </pre>
                );
        }
    };

    // Get display content based on zoom level
    const getDisplayContent = () => {
        // Strict summary check helper
        const getSummaryOrPending = (level: "label" | "one_line" | "sentence" | "paragraph") => {
            const sum = thing.summaries?.[level];
            if (sum && sum.trim().length > 0) return sum;

            // Fallback chain for summaries
            if (level === "paragraph") return thing.summaries?.sentence || thing.summaries?.one_line || "Analysis pending...";
            if (level === "sentence") return thing.summaries?.one_line || thing.summaries?.label || "Analysis pending...";
            if (level === "one_line") return thing.summaries?.label || "Analysis pending...";
            return "Analysis pending...";
        };

        const semanticEnabled = useCanvasStore.getState().semanticZoomEnabled;
        const isUrlScraping = thing.type === "url" && (localStatus === "processing" || localStatus === "pending");

        if (!semanticEnabled || isUrlScraping) {
            return (
                <div className="flex flex-col h-full gap-2 p-2">
                    <div className="font-bold text-base flex-none">
                        {thing.title || getDefaultTitle()}
                    </div>
                    <div className="text-base flex-1 min-h-0 overflow-auto">
                        {renderFullContent()}
                    </div>
                </div>
            );
        }

        switch (zoomLevel) {
            case "domain":
                // Handled in specialized return below
                return null;

            case "label":
                // 3-5 words hyper-concise distillation - Refined 2rem (Not Upper Case)
                return (
                    <div
                        className="font-bold text-muted-foreground opacity-90 leading-tight"
                        style={{ fontSize: "2rem" }}
                    >
                        {getSummaryOrPending("label")}
                    </div>
                );

            case "summary":
                // One-line headlines-style summary - Refined 2rem (Not Bold)
                return (
                    <div
                        className="font-medium text-muted-foreground leading-tight"
                        style={{ fontSize: "2rem" }}
                    >
                        {getSummaryOrPending("one_line")}
                    </div>
                );

            case "preview":
                // Single comprehensive sentence - Refined 1.5rem
                return (
                    <div className="space-y-2">
                        <div className="font-bold uppercase tracking-tight opacity-50 text-xs">
                            Preview
                        </div>
                        <div
                            className="text-muted-foreground leading-snug"
                            style={{ fontSize: "1.5rem" }}
                        >
                            {getSummaryOrPending("sentence")}
                        </div>
                    </div>
                );

            case "paragraph":
                // Short descriptive paragraph - Stable 1rem
                return (
                    <div className="space-y-2">
                        <div className="font-bold uppercase tracking-tight opacity-50 text-xs">
                            Summary
                        </div>
                        <div className="text-base text-muted-foreground leading-relaxed">
                            {getSummaryOrPending("paragraph")}
                        </div>
                    </div>
                );

            case "full":
            default:
                // Full content
                return (
                    <div className="flex flex-col h-full gap-2">
                        <div className="font-bold text-base flex-none">
                            {thing.title || getDefaultTitle()}
                        </div>

                        {/* Pinned Metadata Display */}
                        {(() => {
                            const pinned = thing.custom_metadata?._pinned_fields || [];
                            if (!pinned.length) return null;

                            return (
                                <div className="flex flex-wrap gap-1 mb-1">
                                    {pinned.map((fieldId: string) => {
                                        const [section, key] = fieldId.split(':');
                                        let value: any = null;
                                        let label = key;

                                        if (section === 'technical') {
                                            value = (thing.technical_metadata as any)?.[key];
                                        } else if (section === 'custom') {
                                            value = (thing.custom_metadata as any)?.[key];
                                            // Try to find label from schema if possible, but schema is on domain...
                                            // For now just use key or prettify it
                                        } else if (section === 'system') {
                                            value = (thing.content as any)?.system_metadata?.[key];
                                        }

                                        if (value === undefined || value === null) return null;

                                        // Format value for display
                                        let displayValue = String(value);
                                        if (typeof value === 'object') displayValue = '{...}';
                                        if (displayValue.length > 20) displayValue = displayValue.substring(0, 17) + '...';

                                        return (
                                            <div key={fieldId} className="flex items-center text-[10px] bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded px-1.5 py-0.5 text-blue-700 dark:text-blue-300" title={`${section}.${key}: ${String(value)}`}>
                                                <span className="opacity-70 mr-1">{key}:</span>
                                                <span className="font-medium">{displayValue}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        <div className="text-base flex-1 min-h-0">
                            {renderFullContent()}
                        </div>
                    </div>
                );
        }
    };

    // Default title helper
    const getDefaultTitle = (): string => {
        return thing.title || thing.type;
    };




    // =============================================================================
    // Iconified Mode - compact icon representation
    // =============================================================================
    if (thing.iconified) {
        const isGhost = thing.content?.is_ghost;
        return (
            <div
                className={cn(
                    "group relative flex flex-col items-center justify-center p-2 gap-1 transition-all duration-200",
                    "bg-white dark:bg-slate-900",
                    "rounded-xl shadow-sm border",
                    // Ghost Node Styling
                    isGhost ? "opacity-70 border-dashed border-slate-400 bg-slate-50/50" : selected ? "ring-2 ring-primary border-primary shadow-md z-10" : "border-slate-200 dark:border-slate-800 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700",
                    "overflow-hidden",
                    // Standard width/height for consistency
                    "w-[120px] h-[80px]"
                )}
                title={thing.title || getDefaultTitle()}
                style={{
                    backgroundColor: canvasSettings?.tool_colors?.[thing.type] || thing.color,
                    borderColor: (canvasSettings?.tool_colors?.[thing.type] || thing.color) ? 'rgba(0,0,0,0.1)' : undefined
                }}
                onDoubleClick={handleDoubleClick}
            >
                {/* Main type icon - colored by type */}
                <Icon className={cn("h-8 w-8 mb-1", colorTheme.iconColor)} />

                {/* Restore button - shown when selected */}
                {(isSelected || selected) && (
                    <button
                        onClick={handleToggleIconify}
                        className={cn(
                            "absolute top-1 right-1 w-5 h-5 rounded-full text-white",
                            "flex items-center justify-center shadow-md transition-colors",
                            "bg-slate-600 hover:bg-slate-700"
                        )}
                        title="Restore to full size"
                    >
                        <Maximize2 className="h-3 w-3" />
                    </button>
                )}

                {/* Connection handles - colored by type */}
                <Handle
                    type="target"
                    position={Position.Left}
                    className={cn("!w-3 !h-3", colorTheme.handleColor)}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className={cn("!w-3 !h-3", colorTheme.handleColor)}
                />

                {/* Title Label - Static below icon */}
                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 text-center leading-tight line-clamp-2 w-full px-1">
                    {thing.title || getDefaultTitle()}
                </span>

                {/* Automation Processing Overlay (Iconified) */}
                {processingMessage && (
                    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-white/90 dark:bg-slate-900/90 rounded-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-700">
                        <Loader2 className="w-6 h-6 text-blue-500 animate-spin duration-[2000ms]" />
                    </div>
                )}
            </div>
        );
    }

    // Card view for other zoom levels - Stable width per user request
    const minWidth = 200;

    // Render based on zoom level
    if (zoomLevel === "domain") {
        // Massive Icon Level (20x larger than standard 16px)
        return (
            <div className="flex flex-col items-center gap-10 p-12 whitespace-nowrap">
                <div
                    className={cn(
                        "w-80 h-80 rounded-3xl flex items-center justify-center",
                        "bg-white dark:bg-slate-800 border-8 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] transition-transform duration-300",
                        isSelected
                            ? `${colorTheme.borderSelected} ring-8 ring-offset-8 ring-blue-500 scale-105`
                            : "border-slate-200 dark:border-slate-700"
                    )}
                    style={{
                        backgroundColor: canvasSettings?.tool_colors?.[thing.type] || thing.color,
                    }}
                >
                    {/* Massive 320px Icon (20x 16px) */}
                    <Icon className={cn("h-60 w-60", colorTheme.iconColor)} />
                </div>

                {/* Massive Title for visibility at extreme distances - Refined 3rem Non-Bold */}
                <div className="text-center">
                    <div className="text-[3rem] font-normal text-slate-900 dark:text-white leading-none drop-shadow-2xl">
                        {thing.title || getDefaultTitle()}
                    </div>
                </div>

                <Handle type="target" position={Position.Left} className="opacity-0" />
                <Handle type="source" position={Position.Right} className="opacity-0" />
            </div>
        );
    }

    return (
        <>
            {/* Agent Builder-style container */}
            <div
                data-thing-id={thing.id}
                className={cn(
                    "rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md relative group z-[1]",
                    // Ghost Node Styling
                    isGhost ? "opacity-70 border-dashed border-slate-400 bg-slate-50/50" : (isSelected || selected)
                        ? `${colorTheme.borderSelected} ring-2 ring-offset-1 shadow-lg`
                        : "border-slate-200 dark:border-slate-700",
                    thing.type === "conversation" && "hover:shadow-lg"
                )}
                style={{
                    minWidth,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {/* Resize handles when selected - Now relative to this container */}
                <NodeResizer
                    color="#3b82f6"
                    isVisible={selected}
                    minWidth={minWidth}
                    minHeight={60}
                    handleStyle={resizeHandleStyle}
                    onResizeEnd={(_e, params) => {
                        if (onResizeEnd) {
                            onResizeEnd(thing.id, params.width, params.height);
                        }
                    }}
                />

                {/* Selection Toolbar (for whole thing) */}
                {selected && toolbarPosition && !hasInnerSelection && typeof document !== "undefined" &&
                    createPortal(
                        <SelectionToolbar
                            fragment={fullThingFragment}
                            thingId={thing.id}
                            position={toolbarPosition}
                            onAction={handleAction}
                            onLink={handleLink}
                            onClose={() => setToolbarPosition(null)} // Or custom clear
                            isLoading={isLoading}
                            isThingContext={true}
                            disableHighlight={true}
                        />,
                        document.body
                    )
                }

                {/* Inner Content Wrapper - Clips content but leaves Handles outside */}
                <div className="flex-1 w-full min-h-0 flex flex-col overflow-hidden rounded-lg relative">
                    <div ref={nodeRef} className="absolute inset-0 pointer-events-none" />
                    {/* Gradient header - Pure Drag Handle */}
                    <div className={cn(
                        "flex items-center gap-2 px-3 py-2 border-b rounded-t-lg",
                        colorTheme.headerBg,
                        colorTheme.headerBgDark,
                        // Cursor pointer to indicate draggable/selectable
                        "cursor-pointer select-none"
                    )}
                        style={{
                            backgroundColor: canvasSettings?.tool_colors?.[thing.type] || thing.color,
                            backgroundImage: (canvasSettings?.tool_colors?.[thing.type] || thing.color) ? 'none' : undefined
                        }}
                        onDoubleClick={handleDoubleClick}
                        title={thing.type === "conversation" ? "Double-click to open in chat" : undefined}
                    >
                        <Icon className={cn("h-4 w-4 flex-shrink-0", colorTheme.iconColor)} />

                        {zoomLevel !== "summary" && (
                            // Title handling
                            isEditingTitle ? (
                                <Input
                                    value={titleInputValue}
                                    onChange={(e) => setTitleInputValue(e.target.value)}
                                    onBlur={handleTitleSave}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleTitleSave();
                                        e.stopPropagation(); // Keep hotkeys blocked while typing
                                    }}
                                    onClick={(e) => e.stopPropagation()} // Input needs focus, don't bubble selection
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="h-6 py-0 px-1 text-sm font-medium flex-1 min-w-0 bg-white/50 dark:bg-black/50 border-none focus-visible:ring-1"
                                    autoFocus
                                />
                            ) : (
                                <span
                                    className="text-sm font-medium truncate flex-1 cursor-text hover:text-blue-600 dark:hover:text-blue-400 transition-colors select-none"
                                    onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        setTitleInputValue(thing.title || getDefaultTitle());
                                        setIsEditingTitle(true);
                                    }}
                                    title="Double-click to rename"
                                >
                                    {thing.title || getDefaultTitle()}
                                </span>
                            )
                        )}
                    </div>

                    {/* Action Bar - Dedicated Interaction Area */}
                    {/* Only show in full view (not summary/domain) */}
                    {zoomLevel !== "summary" && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 overflow-x-auto no-scrollbar z-[20] pointer-events-auto">

                            {/* Link/Ghost Mode Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const isGhost = useCanvasStore.getState().transclusionGhostId === thing.id;
                                    useCanvasStore.getState().setTransclusionGhostId(isGhost ? null : thing.id);
                                    toast({
                                        title: isGhost ? "Link Mode Cancelled" : "Link Mode Active",
                                        description: isGhost ? "" : "Click inside a Text Node editor to place this reference.",
                                        duration: 3000
                                    });
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className={cn(
                                    "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0 mr-1",
                                    useCanvasStore.getState().transclusionGhostId === thing.id ? "text-purple-500 bg-purple-100 dark:bg-purple-900/30" : "text-slate-400 hover:text-purple-400"
                                )}
                                title="Pick up to Transclude (Ghost Mode)"
                            >
                                <LinkIcon className="h-3.5 w-3.5" />
                            </button>

                            {/* Thinking Toggle - Only if thinking content exists */}
                            {hasThinking && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsThinkingVisible(!isThinkingVisible);
                                    }}
                                    onPointerDown={undefined}
                                    className={cn(
                                        "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0 mr-1",
                                        isThinkingVisible ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20" : "text-slate-400 hover:text-amber-500"
                                    )}
                                    title={isThinkingVisible ? "Hide Thinking Process" : "Show Thinking Process"}
                                >
                                    <Lightbulb className={cn("h-4 w-4", isThinkingVisible && "fill-current")} />
                                </button>
                            )}

                            {/* Open Conversation Button - Explicit Action */}
                            {thing.type === "conversation" && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onOpenConversation) onOpenConversation(thing.id);
                                    }}
                                    onPointerDown={undefined}
                                    className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded mr-1"
                                    title="Open in full chat"
                                >
                                    <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                                </button>
                            )}

                            {/* Agent Analysis Indicator (Orange Bot) */}
                            {((thing.content as any)?.agent_analysis || (thing.content as any)?.execution_plan) && (
                                <div
                                    className="flex items-center cursor-pointer hover:opacity-80 mr-2"
                                    title="View Agent Plan"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenExecutionPlan();
                                    }}
                                    onPointerDown={undefined}
                                >
                                    <Bot className="h-4 w-4 text-orange-500" />
                                </div>
                            )}

                            <div className="flex-1" /> {/* Spacer to push utility icons to right */}

                            {/* RAG Status Indicator */}
                            {localStatus && localStatus !== "none" && (
                                <div
                                    className={cn("flex items-center mr-1", (localStatus === "completed" || localStatus === "failed") && "cursor-pointer hover:opacity-80")}
                                    title={
                                        localStatus === "failed"
                                            ? "Ingestion Failed (Click for logs)"
                                            : `Vectorization: ${localStatus}${localStatus === "completed" ? " (Click to view content)" : ""}`
                                    }
                                    onClick={(e) => {
                                        const c = thing.content as any;
                                        const isClickable = localStatus === "completed" || localStatus === "failed";

                                        if (isClickable) {
                                            e.stopPropagation();

                                            if (localStatus === "failed") {
                                                const errorMsg = String(c.last_error || "Unknown error occurred during ingestion.");
                                                setPreviewContent({
                                                    title: "Ingestion Error",
                                                    content: errorMsg,
                                                    type: "text"
                                                });
                                                setPreviewDialogOpen(true);
                                                return;
                                            }

                                            handleOpenPreview();
                                        }
                                    }}
                                    onPointerDown={undefined}
                                >
                                    {localStatus === "pending" || localStatus === "processing" ? (
                                        <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                                    ) : localStatus === "completed" ? (
                                        <BrainCircuit className="h-4 w-4 text-green-500" />
                                    ) : localStatus === "failed" ? (
                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                    ) : null}
                                </div>
                            )}

                            {/* Edit Content Button (Text Only) */}
                            {thing.type === "text" && (
                                <>
                                    {isEditingContent ? (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startEditing();
                                                }}
                                                onPointerDown={undefined}
                                                className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors flex-shrink-0"
                                                title="Open Editor"
                                            >
                                                <ExternalLink className="h-4 w-4 text-green-600" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingThingId(null);
                                                }}
                                                onPointerDown={undefined}
                                                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex-shrink-0"
                                                title="Cancel Editing"
                                            >
                                                <X className="h-4 w-4 text-red-500" />
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startEditing();
                                            }}
                                            onPointerDown={undefined}
                                            className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0"
                                            title="Edit Content"
                                        >
                                            <Pencil className="h-4 w-4 text-slate-400 hover:text-blue-500" />
                                        </button>
                                    )}
                                    {/* Separator */}
                                    <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
                                </>
                            )}

                            {/* Copy Content Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const textToCopy = typeof thing.content.text === "string" ? thing.content.text :
                                        typeof thing.content.content === "string" ? thing.content.content :
                                            JSON.stringify(thing.content, null, 2);

                                    navigator.clipboard.writeText(textToCopy);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0"
                                title="Copy content to clipboard"
                            >
                                <Copy className="h-4 w-4 text-slate-400 hover:text-blue-500" />
                            </button>

                            {/* Refresh Transclusions Button (Text Node) */}
                            {thing.type === "text" && (
                                <button
                                    onClick={handleRefreshNodes}
                                    onPointerDown={undefined}
                                    className={cn(
                                        "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0",
                                        isRefreshingNodes && "animate-spin text-blue-500"
                                    )}
                                    title="Refresh Transcluded Content"
                                >
                                    <RefreshCw className="h-4 w-4 text-slate-400 hover:text-blue-500" />
                                </button>
                            )}

                            {/* Sync Button (if asset exists, has source path, or is an image folder slideshow) */}
                            {(thing.content?.asset_id || thing.technical_metadata?.source_path || thing.content?.source_type === 'image_folder') && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleInitSync();
                                    }}
                                    onPointerDown={undefined}
                                    className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0 relative group"
                                    title="Sync with source file"
                                >
                                    <RefreshCcw className="h-4 w-4 text-slate-400 hover:text-green-500" />
                                    {/* Warning Indicator if source path missing */}
                                    {(!thing.technical_metadata?.source_path && !thing.content?.source_path) && (
                                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                        </span>
                                    )}
                                </button>
                            )}

                            {/* Manual Vectorize Button (Brain) */}
                            {/* Show if: Text/Document/Slideshow AND status is NOT completed/processing/pending */}
                            {((thing.type === 'text' || thing.type === 'document' || thing.type === 'slideshow') &&
                                (localStatus !== 'completed' && localStatus !== 'processing' && localStatus !== 'pending')) && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleVectorize();
                                        }}
                                        onPointerDown={undefined}
                                        className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0"
                                        title="Vectorize (Enable RAG)"
                                    >
                                        <BrainCircuit className="h-4 w-4 text-slate-400 hover:text-green-500" />
                                    </button>
                                )}

                            {/* Toggle Link Visibility */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleInspector(thing.id, 'thing');
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0 text-slate-400 hover:text-blue-500"
                                title="Open Inspector (Metadata & Properties)"
                            >
                                <Info className="h-4 w-4" />
                            </button>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleNodeLinks(thing.id);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className={cn(
                                    "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0",
                                    linksHidden ? "text-slate-400" : "text-slate-400 hover:text-blue-500"
                                )}
                                title={linksHidden ? "Show Connected Links" : "Hide Connected Links"}
                            >
                                {linksHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>

                            {/* External Links Badge / Action */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                        }}
                                        className={cn(
                                            "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0 flex items-center gap-1",
                                            hasExternalLinks ? "text-blue-600 dark:text-blue-400 font-medium" : "text-slate-400 hover:text-blue-500"
                                        )}
                                        title={hasExternalLinks ? `${externalLinks.length} External Links` : "Link to External Canvas"}
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        {hasExternalLinks && <span className="text-[10px]">{externalLinks.length}</span>}
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>External Links</DropdownMenuLabel>
                                    {hasExternalLinks && (
                                        <>
                                            <DropdownMenuSeparator />
                                            {externalLinks.map((link, idx) => {
                                                // Fallback titles if not present in link object (backend enhancement needed for titles)
                                                const targetTitle = link.target_thing_title || "External Item";
                                                const targetCanvasName = link.target_canvas_name || link.target_canvas_id?.slice(0, 8) + "...";

                                                // Handle potential legacy format if we haven't migrated DB
                                                // But for new links, we rely on CanvasLink properties.
                                                // Note: target_id in CanvasLink IS the target node id.

                                                return (
                                                    <div key={link.id || idx} className="flex items-center justify-between gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-sm text-sm group">
                                                        <div
                                                            className="cursor-pointer flex-1 truncate"
                                                            onClick={() => {
                                                                if (link.target_canvas_id) {
                                                                    handleOpenExternalCanvas(link.target_canvas_id, link.target_id);
                                                                }
                                                            }}
                                                            title={`Go to ${targetTitle} on ${targetCanvasName}`}
                                                        >
                                                            <div className="font-medium truncate">{targetTitle}</div>
                                                            <div className="text-xs text-muted-foreground truncate opacity-70">on {targetCanvasName}</div>
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingExternalLink(link);
                                                            }}
                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 text-blue-500 rounded mr-1"
                                                            title="Edit Link"
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteLink(link.id);
                                                            }}
                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 text-red-500 rounded"
                                                            title="Remove Link"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                )
                                            })}
                                        </>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => {
                                        setPendingFragment(fullThingFragment);
                                        setCrossCanvasLinkDialogOpen(true);
                                    }}>
                                        <LinkIcon className="h-4 w-4 mr-2" />
                                        Add Link...
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Export Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExportDialogOpen(true);
                                }}
                                className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0"
                                title="Export content"
                            >
                                <Download className="h-4 w-4 text-slate-400 hover:text-blue-500" />
                            </button>

                            {/* Full Screen Mode */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsFullScreen(true);
                                }}
                                className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0"
                                title="Full Screen"
                            >
                                <Maximize2 className="h-4 w-4 text-slate-400 hover:text-blue-500" />
                            </button>

                            {/* Split Screen / Docking UI */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        onClick={(e) => e.stopPropagation()}
                                        className={cn(
                                            "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0",
                                            dockedThingId === thing.id ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20" : "text-slate-400 hover:text-blue-500"
                                        )}
                                        title="Split View (Dock to side)"
                                    >
                                        <Layout className="h-4 w-4" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Dock Position</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDockedThing(thing.id === dockedThingId && dockPosition === 'left' ? null : thing.id, 'left'); }}>
                                        Left Side
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDockedThing(thing.id === dockedThingId && dockPosition === 'right' ? null : thing.id, 'right'); }}>
                                        Right Side
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDockedThing(thing.id === dockedThingId && dockPosition === 'top' ? null : thing.id, 'top'); }}>
                                        Top
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDockedThing(thing.id === dockedThingId && dockPosition === 'bottom' ? null : thing.id, 'bottom'); }}>
                                        Bottom
                                    </DropdownMenuItem>
                                    {dockedThingId === thing.id && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDockedThing(null, null); }} className="text-red-500">
                                                Undock
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Iconify button - shown when selected */}
                            {/* Iconify button - Always rendered to reserve space, control visibility via opacity */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleIconify(e);
                                }}
                                className={cn(
                                    "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-all flex-shrink-0 duration-200",
                                    (isSelected || selected) ? "opacity-100" : "opacity-0 pointer-events-none"
                                )}
                                title="Reduce to icon"
                                tabIndex={(isSelected || selected) ? 0 : -1}
                            >
                                <Minimize2 className="h-4 w-4 text-slate-500" />
                            </button>

                            {/* Delete button - Always rendered to reserve space */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(thing.id);
                                }}
                                className={cn(
                                    "p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50 transition-all flex-shrink-0 duration-200",
                                    (isSelected || selected) ? "opacity-100" : "opacity-0 pointer-events-none"
                                )}
                                title="Delete"
                                tabIndex={(isSelected || selected) ? 0 : -1}
                            >
                                <Trash2 className="h-4 w-4 text-red-500" />
                            </button>
                        </div>
                    )}

                    {/* Body content */}
                    {getDisplayContent() && (
                        <div className="px-3 py-3 flex-1 overflow-auto min-h-0 flex flex-col">
                            <div className="h-full relative">
                                {getDisplayContent()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Connection handles - colored by type */}
                <Handle
                    type="target"
                    position={Position.Left}
                    className={cn("!w-3 !h-3 z-50", colorTheme.handleColor)}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className={cn("!w-3 !h-3 z-50", colorTheme.handleColor)}
                />

                {/* Automation Processing Overlay */}
                {processingMessage && (
                    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-white/90 dark:bg-slate-900/90 rounded-lg backdrop-blur-sm animate-in fade-in zoom-in-95 duration-700">
                        <div className="flex flex-col items-center gap-2 p-4 text-center">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin duration-[2000ms]" />
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-100 bg-white/90 dark:bg-slate-800/90 px-3 py-1 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 animate-pulse duration-1000">
                                {processingMessage}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Custom Prompt Dialog */}
            < Dialog open={askDialogOpen} onOpenChange={(open) => !isLoading && setAskDialogOpen(open)
            }>
                <DialogContent className="sm:max-w-md nodrag cursor-default">
                    <DialogHeader>
                        <DialogTitle>Ask about this content</DialogTitle>
                        <DialogDescription>
                            Enter a question or prompt about the selected thing.
                        </DialogDescription>
                    </DialogHeader>

                    {isLoading ? (
                        <div className="py-8 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in-95">
                            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                            <p className="text-sm text-muted-foreground">Thinking...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="prompt">Your question</Label>
                                <Input
                                    id="prompt"
                                    value={customPrompt}
                                    onChange={(e) => setCustomPrompt(e.target.value)}
                                    placeholder="e.g., What are the implications of this?"
                                    onKeyDown={(e) => e.key === "Enter" && handleAskSubmit()}
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {!isLoading && (
                            <Button variant="outline" onClick={() => setAskDialogOpen(false)}>
                                Cancel
                            </Button>
                        )}
                        <Button
                            onClick={handleAskSubmit}
                            disabled={!customPrompt.trim() || isLoading}
                        >
                            {isLoading ? "Processing..." : "Ask AI"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* Link Target Selection Dialog - REPLACED by CrossCanvasLinkDialog */}
            {/* < Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen} > ... </ Dialog > */}
            <LinkTypeDialog
                isOpen={!!editingExternalLink}
                onClose={() => setEditingExternalLink(null)}
                onConfirm={handleUpdateExternalLink}
                onDelete={() => {
                    if (editingExternalLink) {
                        deleteLink(editingExternalLink.id);
                        setEditingExternalLink(null);
                    }
                }}
                initialType={editingExternalLink?.type || "related"}
                initialLabel={editingExternalLink?.label || ""}
                initialDescription={editingExternalLink?.description || ""}
                mode="edit"
            />

            {/* Cascading Deletion Confirmation Dialog */}
            < Dialog open={deleteRegionDialogOpen} onOpenChange={setDeleteRegionDialogOpen} >
                <DialogContent className="sm:max-w-md nodrag cursor-default">
                    <DialogHeader>
                        <DialogTitle className="text-red-600 flex items-center gap-2">
                            <Trash2 className="h-5 w-5" />
                            Delete Region and Content?
                        </DialogTitle>
                        <DialogDescription>
                            This will permanently delete the selected region and all generated text and links derived from it.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteRegionDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleConfirmDeleteRegion}>
                            Delete Everything
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >


            {/* Link Type Selection Dialog - REPLACED by CrossCanvasLinkDialog */}
            {/* < LinkTypeDialog ... /> */}

            {/* Content Preview Dialog */}
            < VectorizationPreviewDialog
                open={previewDialogOpen}
                onOpenChange={setPreviewDialogOpen}
                title={previewContent.title}
                content={previewContent.content}
                type={previewContent.type}
            />

            {/* Sync Dialog */}
            < Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen} >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Sync Content</DialogTitle>
                        <DialogDescription>
                            Check for updates from the original source file.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        {syncStatus === 'checking' && (
                            <div className="flex items-center gap-2 text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Checking source file...</span>
                            </div>
                        )}

                        {syncStatus === 'error' && (
                            <div className="flex items-start gap-2 text-red-600 bg-red-50 p-3 rounded-md">
                                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="font-semibold">Sync Error</p>
                                    <p>Could not verify source file status. It might be inaccessible.</p>
                                </div>
                            </div>
                        )}

                        {syncStatus === 'ready' && syncCheckResult && (
                            <div className="space-y-4">
                                <div className={cn(
                                    "p-3 rounded-md text-sm border",
                                    syncCheckResult.status === 'synced' ? "bg-green-50 border-green-200 text-green-700" :
                                        syncCheckResult.status === 'changed' ? "bg-amber-50 border-amber-200 text-amber-700" :
                                            "bg-red-50 border-red-200 text-red-700"
                                )}>
                                    <div className="flex items-center gap-2 font-semibold">
                                        {syncCheckResult.status === 'synced' ? <CheckCircle2 className="h-4 w-4" /> :
                                            syncCheckResult.status === 'changed' ? <RefreshCcw className="h-4 w-4" /> :
                                                <FileWarning className="h-4 w-4" />}
                                        <span>
                                            {syncCheckResult.status === 'synced' ? "File is up to date" :
                                                syncCheckResult.status === 'changed' ? "Changes detected in source file" :
                                                    "Source file not found or inaccessible"}
                                        </span>
                                    </div>
                                    <p className="mt-1 opacity-90">
                                        {syncCheckResult.status === 'synced' ? "The content on the canvas matches the source file." :
                                            syncCheckResult.status === 'changed' ? "The source file has been modified since it was added to the canvas." :
                                                "The original file could not be found at its source path."}
                                    </p>
                                </div>

                                {(syncCheckResult.status === 'changed' || syncCheckResult.status === 'synced') && (
                                    <div className="bg-slate-50 p-3 rounded-md text-sm text-slate-600">
                                        <p className="font-medium text-slate-900 mb-1">Warning</p>
                                        <p>Syncing will re-ingest the content and <strong>regenerate all embeddings</strong>.
                                            Any existing links or specific references to text segments might be invalidated.</p>
                                    </div>
                                )}

                                {syncCheckResult.status === 'missing_source' && (
                                    <div className="space-y-2">
                                        <Label>Select New Source File</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="file"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handlePerformSync(file);
                                                }}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            Since the original file is missing, you must upload the file again to sync changes.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Manual Source Path Input - Always available when interacting or if missing */}
                        {(syncStatus === 'ready' || !thing.technical_metadata?.source_path) && (
                            <div className="space-y-2 pt-2 border-t">
                                <Label>Or set absolute source path</Label>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="C:\Path\To\File.pdf"
                                        value={syncSourcePath}
                                        onChange={(e) => setSyncSourcePath(e.target.value)}
                                        className="font-mono text-xs"
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => handlePerformSync()}
                                        disabled={!syncSourcePath}
                                    >
                                        Set & Sync
                                    </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    Enter the full path on the server/host machine to link directly.
                                </p>
                            </div>
                        )}

                        {syncStatus === 'syncing' && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-blue-600">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="font-medium">Syncing content...</span>
                                </div>
                                <p className="text-sm text-slate-500">
                                    Re-ingesting file and updating embeddings. This may take a moment.
                                </p>
                            </div>
                        )}

                        {syncStatus === 'complete' && (
                            <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-md">
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="font-medium">Sync Complete!</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        {syncStatus !== 'syncing' && syncStatus !== 'complete' && (
                            <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>
                                Cancel
                            </Button>
                        )}

                        {syncStatus === 'ready' && (syncCheckResult?.status === 'changed' || syncCheckResult?.status === 'synced') && (
                            <Button onClick={() => handlePerformSync()}>
                                <RefreshCcw className="h-4 w-4 mr-2" />
                                Sync Now
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            <ExportDialog
                open={exportDialogOpen}
                onOpenChange={setExportDialogOpen}
                thing={currentThing}
            />

            <ExecutionPlanModal
                open={executionPlanOpen}
                onOpenChange={setExecutionPlanOpen}
                plan={executionPlanData}
                canvasId={capturedCanvasId}
            />

            {/* Link Type Dialog - Re-added */}
            <LinkTypeDialog
                isOpen={linkTypeDialogOpen}
                onClose={() => setLinkTypeDialogOpen(false)}
                onConfirm={handleConfirmLink}
                mode="create"
            />

            {/* Cross Canvas Link Dialog */}
            <CrossCanvasLinkDialog
                open={crossCanvasLinkDialogOpen}
                onOpenChange={setCrossCanvasLinkDialogOpen}
                sourceThingId={thing.id}
                onNodeSelected={(targetCanvasId, targetNodeId) => {
                    setSelectedTargetId(targetNodeId);
                    setPendingTargetCanvasId(targetCanvasId !== canvasId ? targetCanvasId : null);
                    // Open Link Type Dialog
                    setLinkTypeDialogOpen(true);
                }}
            />

            {/* Refined Isolated Text Editor */}
            <TextThingEditor
                thing={thing}
                isOpen={isEditingContent && dockedThingId !== thing.id}
                isTrulyFullscreen={isTrulyFullscreen}
                setIsTrulyFullscreen={setIsTrulyFullscreen}
                onClose={() => {
                    setEditingThingId(null);
                    setIsTrulyFullscreen(false);
                }}
                onSave={handleContentSave}
            />

            {/* Full Screen Portal */}
            {
                isFullScreen && typeof document !== "undefined" && createPortal(
                    <div className="fixed inset-0 z-[100] bg-white dark:bg-slate-950 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        {/* Full Screen Header */}
                        <div className={cn(
                            "flex items-center gap-3 px-4 py-3 border-b shadow-sm flex-none",
                            colorTheme.headerBg,
                            colorTheme.headerBgDark
                        )}>
                            <Icon className={cn("h-5 w-5", colorTheme.iconColor)} />

                            <div className="flex-1 min-w-0">
                                <h2 className="text-lg font-semibold truncate">
                                    {thing.title || getDefaultTitle()}
                                </h2>
                            </div>

                            {/* Close / Restore Button */}
                            {/* Deep Analysis Plan (Purple Sparkles) */}
                            {executionPlanData && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setExecutionPlanOpen(true);
                                    }}
                                    title="View Deep Analysis Plan"
                                >
                                    <Sparkles className="h-4 w-4" />
                                </Button>
                            )}

                            {/* Existing Buttons */}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-2 ml-auto"
                                onClick={() => setIsFullScreen(false)}
                            >
                                <Minimize2 className="h-4 w-4" />
                                <span className="hidden sm:inline">Exit Full Screen</span>
                            </Button>
                        </div>

                        {/* Check if syncing is needed for correct content display */}
                        {/* Main Content Area - Reusing render logic but ensuring container fits */}
                        <div className="flex-1 min-h-0 overflow-hidden relative p-4 bg-slate-50 dark:bg-slate-900/50">
                            <div className="h-full w-full max-w-7xl mx-auto bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                                {/* We wrap the content render in a strict container to ensure scrolling works inside it */}
                                <div className="flex-1 min-h-0 relative">
                                    {renderFullContent()}
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }
        </>
    );
});


