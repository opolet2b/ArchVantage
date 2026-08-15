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
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "reactflow";
import { canvasPluginRegistry } from "@/plugins/registry";
import "@/plugins";
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
    Cloud,
    Info,
    Volume2,
    Mic,
    Import,
    FileDiff,
    TableProperties
} from "lucide-react";

import { cn, API_URL } from "@/lib/utils";
import { CanvasThing, ZoomLevel, useCanvasStore, LinkType, CanvasLink } from "../canvas-store";
import {
    MarkdownViewer,
    MemoizedMarkdownViewer,
    SpreadsheetViewer,
    ImageViewer,
    MCPToolViewer,
    PDFViewer,
    ConversationViewer,
    TextViewer,
    MemoizedTextViewer,
    ChartViewer,
    ArchiMateToolViewer,
    ArchiMateElementViewer,
    TagCloudViewer,
    SelectableContent,
    SelectionToolbar,
    useAnalyze,
    LLMAction,
    Fragment,
    RegionFragment,
    VectorizationPreviewDialog,
    MarkdownToolbar,
    AgentToolViewer,
    CollaboraViewer,
    InboundDataMapper,
    GapAnalysisToolViewer,
    ScenarioSimulatorViewer
} from "../viewers";
import { DocumentViewer } from "../viewers/document-viewer";
import { ImageSlidesViewer } from "../viewers/image-slides-viewer";
import { FormToolViewer } from "../viewers/form-tool-viewer";
import { SpreadsheetToolViewer } from "../viewers/spreadsheet-tool-viewer";

// Registry for Dynamic Component Rendering
const COMPONENT_REGISTRY: Record<string, React.ComponentType<any>> = {
    "ChartViewer": ChartViewer,
    "TagCloudViewer": TagCloudViewer,
    "SpreadsheetViewer": SpreadsheetViewer,
    "MarkdownViewer": MarkdownViewer,
    "ImageViewer": ImageViewer,
    "PDFViewer": PDFViewer,
    "ConversationViewer": ConversationViewer,
    "TextViewer": TextViewer,
    "recharts": ChartViewer,
    "AgentToolViewer": AgentToolViewer,
};
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
import { speechService } from "@/lib/speech-service";

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
    archimate: Layout,
    archimate_tool: Import,
    gap_analysis_tool: FileDiff,
    scenario_simulator_tool: FileDiff,
    trade_off_matrix: TableProperties,
    architecture_memo: FileText,
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
    archimate: {
        headerBg: "bg-gradient-to-r from-indigo-50 to-purple-50",
        headerBgDark: "dark:from-indigo-900/20 dark:to-purple-900/20",
        iconColor: "text-indigo-600",
        borderSelected: "border-indigo-500",
        handleColor: "!bg-indigo-500",
    },
    archimate_tool: {
        headerBg: "bg-gradient-to-r from-slate-50 to-slate-100",
        headerBgDark: "dark:from-slate-800/20 dark:to-slate-700/20",
        iconColor: "text-slate-600",
        borderSelected: "border-slate-500",
        handleColor: "!bg-slate-500",
    },
    gap_analysis_tool: {
        headerBg: "bg-gradient-to-r from-slate-50 to-slate-100",
        headerBgDark: "dark:from-slate-800/20 dark:to-slate-700/20",
        iconColor: "text-slate-600",
        borderSelected: "border-slate-500",
        handleColor: "!bg-slate-500",
    },
    scenario_simulator_tool: {
        headerBg: "bg-gradient-to-r from-indigo-50 to-indigo-100",
        headerBgDark: "dark:from-indigo-900/20 dark:to-indigo-800/20",
        iconColor: "text-indigo-600",
        borderSelected: "border-indigo-500",
        handleColor: "!bg-indigo-500",
    },
    trade_off_matrix: {
        headerBg: "bg-gradient-to-r from-amber-50 to-yellow-50",
        headerBgDark: "dark:from-amber-900/20 dark:to-yellow-900/20",
        iconColor: "text-amber-600",
        borderSelected: "border-amber-500",
        handleColor: "!bg-amber-500",
    },
    architecture_memo: {
        headerBg: "bg-gradient-to-r from-amber-50 to-yellow-50",
        headerBgDark: "dark:from-amber-900/20 dark:to-yellow-900/20",
        iconColor: "text-amber-600",
        borderSelected: "border-amber-500",
        handleColor: "!bg-amber-500",
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

// Helper component for citations
const CitationList = ({ citations, onSelectThing, onHighlight }: {
    citations?: any[];
    onSelectThing: (id: string) => void;
    onHighlight: (matches: any) => void;
}) => {
    if (!citations || citations.length === 0) return null;
    const { fitView } = useReactFlow();

    return (
        <div className="flex-none pt-2 border-t border-slate-200 dark:border-slate-700 px-2 pb-2 bg-slate-50 dark:bg-slate-900 z-10">
            <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <BrainCircuit className="w-3 h-3 opacity-70" />
                Sources
            </p>
            <div className="flex flex-wrap gap-2">
                {citations.map((cit, i) => (
                    <div
                        key={i}
                        className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 transition-colors shadow-sm pointer-events-auto"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault(); // Prevent text selection
                            onHighlight(cit.matches || null);
                            onSelectThing(cit.id);
                            fitView({ nodes: [{ id: cit.id }], duration: 800, padding: 0.2 });
                        }}
                        title={cit.title}
                    >
                        <ExternalLink className="h-3 w-3 text-blue-500" />
                        <span className="truncate max-w-[150px]">{cit.title}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const CollaboraIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <polygon points="10,2 22,12 10,22 4,17 11,12 4,7" fill="#612b88" />
        <polygon points="4,17 11,12 11,16" fill="#381155" />
        <polygon points="4,7 11,12 4,17" fill="#d1d3d4" />
    </svg>
);

let cachedCollaboraConfig: { use_collabora: boolean; collabora_server_url: string } | null = null;
let collaboraConfigPromise: Promise<any> | null = null;
const getCollaboraConfig = () => {
    if (cachedCollaboraConfig) return Promise.resolve(cachedCollaboraConfig);
    if (!collaboraConfigPromise) {
        collaboraConfigPromise = fetch(`${API_URL}/config/editor`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
        }).then(res => res.json()).then(data => {
            cachedCollaboraConfig = data.config;
            return data.config;
        }).catch(() => null);
    }
    return collaboraConfigPromise;
};

export const ThingNode = React.memo(function ThingNode(props: NodeProps<ThingNodeData>) {
    const { id, data, selected: isSelected } = props;
    console.log(`[ThingNode] Rendering ${id}`, { type: data.thing?.type, zoomLevel: data.zoomLevel });

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

    const [useCollaboraMode, setUseCollaboraMode] = React.useState(false);
    const [collaboraEnabled, setCollaboraEnabled] = React.useState(false);

    React.useEffect(() => {
        getCollaboraConfig().then(config => {
            if (config && config.use_collabora) {
                setCollaboraEnabled(true);
            }
        });
    }, []);

    // If not in store yet (initial render race), use prop.
    const zoomLevel = useCanvasStore((state) => state.zoomLevel);
    const things = useCanvasStore((state) => state.things);
    const updateThing = useCanvasStore((state) => state.updateThing);
    const deleteThing = useCanvasStore((state) => state.deleteThing);
    const selectThing = useCanvasStore((state) => state.selectThing);
    const setHighlightTarget = useCanvasStore((state) => state.setHighlightTarget);
    const setContentSelection = useCanvasStore((state) => state.setContentSelection);
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
    const storeProcessingMessage = processingThings?.[thing.id];
    const automationProgress = thing.content?.automation_progress;
    
    const processingMessage = React.useMemo(() => {
        if (automationProgress && automationProgress.status === "running") {
            return `Automation: ${automationProgress.current_step} (${automationProgress.step_index + 1}/${automationProgress.total_steps})`;
        }
        return storeProcessingMessage;
    }, [automationProgress, storeProcessingMessage]);
    const activeScenario = useCanvasStore((state) => state.activeScenario);
    const accessLevel = useCanvasStore((state) => state.accessLevel);
    const isReadOnly = accessLevel === "read";

    const [selected, setSelected] = React.useState(isSelected);

    // Full Screen State
    const [isFullScreen, setIsFullScreen] = React.useState(false);

    // Content Editing State
    const [isEditingContent, setIsEditingContent] = React.useState(false);
    const [isTrulyFullscreen, setIsTrulyFullscreen] = React.useState(false);

    // View Mode State for toggling visualizations (Cloud, etc.)
    const [viewMode, setViewMode] = React.useState<"content" | "cloud">(
        ((currentThing.content as any)?.visualizer_output?.visual_payload) ? "cloud" : "content"
    );

    // Auto-switch to cloud/chart view when visualizer output becomes available
    React.useEffect(() => {
        if ((currentThing.content as any)?.visualizer_output?.visual_payload) {
            setViewMode("cloud");
        }
    }, [(currentThing.content as any)?.visualizer_output?.visual_payload]);

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
    const [showDependencies, setShowDependencies] = React.useState(false);
    
    // Transclusion resolution state
    const [transclusionResolveDialogOpen, setTransclusionResolveDialogOpen] = React.useState(false);
    const [syncStatus, setSyncStatus] = React.useState<'idle' | 'checking' | 'ready' | 'syncing' | 'complete' | 'error'>('idle');
    const [syncCheckResult, setSyncCheckResult] = React.useState<{ status: string, message?: string, diff?: string } | null>(null);
    const [syncSourcePath, setSyncSourcePath] = React.useState<string>("");

    // Ref for textarea to use with toolbar
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Local Browser State
    const [browsingUrl, setBrowsingUrl] = React.useState<string | null>(null);
    const [offlineMode, setOfflineMode] = React.useState<boolean>(true);

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
    const [isDictating, setIsDictating] = React.useState(false);
    const [isProcessingStt, setIsProcessingStt] = React.useState(false);
    const editorRef = React.useRef<any>(null);
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
    const [isSpeaking, setIsSpeaking] = React.useState(false);

    const handleSpeak = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isSpeaking) return;

        const textToSpeak = typeof currentThing.content.text === "string" ? currentThing.content.text :
            typeof currentThing.content.content === "string" ? currentThing.content.content :
                currentThing.title || "Nothing to speak";

        setIsSpeaking(true);
        try {
            await speechService.speak(textToSpeak);
        } catch (error) {
            console.error("TTS error", error);
        } finally {
            setIsSpeaking(false);
        }
    };

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
                    // FIX: Use currentThing.canvas_id instead of global canvasId to ensure we are querying the right context
                    const res = await fetch(`${API_URL}/canvases/${currentThing.canvas_id}/things/${currentThing.id}`, {
                        headers: {
                            "Authorization": `Bearer ${token}`,
                        },
                    });

                    if (res.ok) {
                        const updatedThing = await res.json();
                        if (updatedThing) {
                            if (updatedThing.rag_status !== localStatus) {
                                setLocalStatus(updatedThing.rag_status);
                            }
                            
                            const updatedTime = updatedThing.updated_at ? Date.parse(updatedThing.updated_at) : 0;
                            const currentTime = currentThing.updated_at ? Date.parse(currentThing.updated_at) : 0;
                            const timeChanged = (isNaN(updatedTime) ? 0 : updatedTime) !== (isNaN(currentTime) ? 0 : currentTime);

                            // Always sync if position, domain, or status changed, to catch backend automations
                            if (
                                updatedThing.rag_status !== localStatus ||
                                updatedThing.position_x !== currentThing.position_x ||
                                updatedThing.position_y !== currentThing.position_y ||
                                updatedThing.domain_id !== currentThing.domain_id ||
                                timeChanged
                            ) {
                                console.log(`[ThingNode RAG Polling Sync] Triggered for thing ${currentThing.id} (${currentThing.title || "No Title"}):`, {
                                    ragStatus: { before: localStatus, after: updatedThing.rag_status, changed: updatedThing.rag_status !== localStatus },
                                    posX: { before: currentThing.position_x, after: updatedThing.position_x, changed: updatedThing.position_x !== currentThing.position_x },
                                    posY: { before: currentThing.position_y, after: updatedThing.position_y, changed: updatedThing.position_y !== currentThing.position_y },
                                    domainId: { before: currentThing.domain_id, after: updatedThing.domain_id, changed: updatedThing.domain_id !== currentThing.domain_id },
                                    updatedAt: { before: currentThing.updated_at, after: updatedThing.updated_at, changed: timeChanged }
                                });
                                // Use refreshThings() instead of syncThing to catch ALL automation side effects 
                                // (e.g. links created, domain updates) and ensure React Flow properly animates.
                                useCanvasStore.getState().refreshThings();
                            }
                        }
                    } else {
                        console.warn(`[ThingNode] Failed to poll status for thing ${currentThing.id}: ${res.status} ${res.statusText}`);
                    }
                } catch (e) {
                    console.error("Failed to poll thing status", e);
                }
            }, 3000); // Poll every 3s

            return () => clearInterval(intervalId);
        }
    }, [localStatus, canvasId, currentThing.id, currentThing.canvas_id]);

    // Ask dialog state
    const [askDialogOpen, setAskDialogOpen] = React.useState(false);
    const [customPrompt, setCustomPrompt] = React.useState("");

    // Export Dialog State
    const [exportDialogOpen, setExportDialogOpen] = React.useState(false);

    // Thinking Visibility State
    const [isThinkingVisible, setIsThinkingVisible] = React.useState(false);
    const thinkingScrollRef = React.useRef<HTMLDivElement>(null);

    // Parse content for <think> tags (Memoized)
    const { thinkingContent, cleanContent, hasThinking } = React.useMemo(() => {
        const c = thing.content;
        // Check text content sources
        const rawText = (typeof c.text === "string" ? c.text : "") ||
            (typeof c.content === "string" ? c.content : "") ||
            (typeof c.text_content === "string" ? c.text_content : ""); // Support extracted text too

        if (!rawText) return { thinkingContent: null, cleanContent: rawText, hasThinking: false };

        // Check for standard thinking tags (case-insensitive)
        const patterns = [
            { start: /<think\b[^>]*>/i, end: /<\/think>/gi },
            { start: /<thinking\b[^>]*>/i, end: /<\/thinking>/gi },
            { start: /<thought\b[^>]*>/i, end: /<\/thought>/gi }
        ]

        for (const pat of patterns) {
            const startMatch = rawText.match(pat.start)
            if (startMatch && startMatch.index !== undefined) {
                const startIdx = startMatch.index
                const startTagLen = startMatch[0].length
                
                // Find the LAST occurrence of the closing tag to handle nested/multiple blocks robustly
                const endMatches = Array.from(rawText.matchAll(pat.end))
                if (endMatches.length > 0) {
                    const lastEndMatch = endMatches[endMatches.length - 1]
                    if (lastEndMatch.index !== undefined && lastEndMatch.index > startIdx) {
                        const endIdx = lastEndMatch.index
                        const endTagLen = lastEndMatch[0].length
                        
                        const thinking = rawText.substring(startIdx + startTagLen, endIdx).trim()
                        const clean = (rawText.substring(0, startIdx) + rawText.substring(endIdx + endTagLen)).trim()
                        return {
                            thinkingContent: thinking,
                            cleanContent: clean,
                            hasThinking: true
                        }
                    }
                }
                
                // Incomplete block
                const thinking = rawText.substring(startIdx + startTagLen).trim()
                const clean = rawText.substring(0, startIdx).trim()
                return {
                    thinkingContent: thinking,
                    cleanContent: clean,
                    hasThinking: true
                }
            }
        }

        // Check for a loose closing tag due to partial upstream stripping (e.g. </think>)
        const loosePatterns = [
            { end: /<\/think>/gi, tagLen: 8 },
            { end: /<\/thinking>/gi, tagLen: 11 },
            { end: /<\/thought>/gi, tagLen: 10 }
        ]
        for (const pat of loosePatterns) {
            const matches = Array.from(rawText.matchAll(pat.end))
            if (matches.length > 0) {
                const lastMatch = matches[matches.length - 1]
                if (lastMatch.index !== undefined) {
                    const endIdx = lastMatch.index
                    const thinking = rawText.substring(0, endIdx).trim()
                    const clean = rawText.substring(endIdx + pat.tagLen).trim()
                    return {
                        thinkingContent: thinking,
                        cleanContent: clean,
                        hasThinking: true
                    }
                }
            }
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

    // Transclusion Resolution Logic
    const handleCollaboraToggle = async () => {
        if (useCollaboraMode) {
            setUseCollaboraMode(false);
            // Refresh to pull any auto-saves made by Collabora directly into the DB
            useCanvasStore.getState().refreshThings();
            return;
        }

        const textContent = (thing.content.content || thing.content.text_content || thing.content.text || "") as string;
        
        if (textContent.includes("{{node:")) {
            setTransclusionResolveDialogOpen(true);
        } else {
            setUseCollaboraMode(true);
        }
    };

    const handleResolveTransclusions = async () => {
        let textContent = (thing.content.content || thing.content.text_content || thing.content.text || "") as string;
        
        const regex = /{{node:([a-zA-Z0-9-]+)(?:#([a-zA-Z0-9-]+))?}}/g;
        let match;
        
        let newText = textContent;
        // Use a Set to avoid infinite loops if replacement goes wrong
        const processedMatches = new Set<string>();
        
        while ((match = regex.exec(textContent)) !== null) {
            const fullMatch = match[0];
            if (processedMatches.has(fullMatch)) continue;
            processedMatches.add(fullMatch);
            
            const targetNodeId = match[1];
            const fragmentId = match[2];
            
            // We can get the canvas things directly from the store state
            const allThings = useCanvasStore.getState().things;
            const targetNode = allThings.find(t => t.id === targetNodeId);
            
            if (targetNode) {
                let resolvedText = "";
                const tContent = targetNode.content as any;
                
                if (fragmentId && tContent.saved_fragments) {
                    const fragment = tContent.saved_fragments.find((f: any) => f.id === fragmentId);
                    if (fragment) resolvedText = typeof fragment.content === 'string' ? fragment.content : JSON.stringify(fragment.content);
                } 
                if (!resolvedText && fragmentId && tContent.regions) {
                     const region = tContent.regions.find((r: any) => r.id === fragmentId);
                     if (region) resolvedText = typeof region.content === 'string' ? region.content : JSON.stringify(region.content);
                }
                if (!resolvedText) {
                    resolvedText = (tContent.content || tContent.text_content || tContent.text || "") as string;
                }
                
                if (resolvedText) {
                    // Add blockquotes to visually indicate it was a transclusion
                    const formattedReplacement = `\n> ${resolvedText.split('\n').join('\n> ')}\n`;
                    // Replace all instances of this exact match
                    newText = newText.split(fullMatch).join(formattedReplacement);
                }
            }
        }
        
        const updatedContent = { ...thing.content } as any;
        if (updatedContent.text_content !== undefined) updatedContent.text_content = newText;
        if (updatedContent.text !== undefined) updatedContent.text = newText;
        if (updatedContent.content !== undefined) updatedContent.content = newText;
        
        // Optimistically update local state first
        useCanvasStore.getState().updateThing(thing.id, { content: updatedContent });
        
        setTransclusionResolveDialogOpen(false);
        // Wait a tiny bit for React state to flush
        setTimeout(() => {
            setUseCollaboraMode(true);
        }, 100);
    };

    const handleOpenExternalCanvas = (targetCanvasId: string, targetNodeId: string) => {
        window.location.href = `/canvas/${targetCanvasId}?node=${targetNodeId}`;
    };



    // Ref for positioning toolbar (Header)
    const nodeRef = React.useRef<HTMLDivElement>(null);
    // const [toolbarPosition, setToolbarPosition] = React.useState<{ x: number, y: number } | null>(null);

    // --- Progress Bar Logic (for documents/slideshows) ---
    const [progressThing, setProgressThing] = React.useState<CanvasThing>(currentThing);

    // Poll for progress updates if status is processing or pending
    React.useEffect(() => {
        let intervalId: NodeJS.Timeout;
        const shouldPoll = progressThing.rag_status === "processing" || progressThing.rag_status === "pending";

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
                            // Sync the ENTIRE updatedThing so that backend position changes
                            // (e.g. from Automations) are caught and animated on the canvas!
                            useCanvasStore.getState().syncThing(currentThing.id, updatedThing);
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

    // Update toolbar position when selected - REMOVED (Handled via CSS in parent)
    /*
    React.useEffect(() => {
       ...
    }, [selected]);
    */

    // Construct fragment for full content
    const fullThingFragment = React.useMemo<Fragment>(() => {
        let contentStr = "";
        const c = thing.content;

        if (typeof c.text === "string") contentStr = c.text;
        else if (typeof c.text_content === "string") contentStr = c.text_content;
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
        const savedFragments = (thing.content.saved_fragments as any[]) || [];

        // Combine regions and saved_fragments (deduplicated by ID)
        const allRegions = [...currentRegions];
        savedFragments.forEach(sf => {
            if (sf.type === 'region' && !allRegions.some(r => r.id === sf.id)) {
                allRegions.push(sf);
            }
        });

        const regionOverlays = allRegions.map((r: any, idx: number) => ({
            id: r.id || `region-${idx}`, // Ensure ID
            label: r.label,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            type: "region" as const,
            content: r.content, // Keep content for reference
            slideIndex: r.slideIndex, // Preserve slideIndex for slideshows
            pageNumber: r.pageNumber // Preserve pageNumber for PDFs
        }));

        return [...linkOverlays, ...regionOverlays];
    }, [links, thing.id, thing.type, thing.content]);

    // Stable handler for text selection to avoid re-rendering TextViewer
    const handleTextSelection = React.useCallback((fragment: Fragment, position: { x: number; y: number }) => {
        console.log("[ThingNode] handleTextSelection", { thingId: thing.id, fragment });
        setContentSelection(thing.id, fragment, position);
    }, [thing.id, setContentSelection]);

    // Handle create new region (persist to content)
    const handleRegionCreate = React.useCallback(async (fragment: Fragment, _position?: { x: number; y: number }) => {
        console.log("[ThingNode] handleRegionCreate START", { thingId: thing.id, fragment });
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
    // Helper: Create fragment data for API
    const getFragmentData = (fragment: Fragment) => ({
        type: fragment.type,
        content: fragment.content,
        ...("id" in fragment && { id: fragment.id }),
        ...("startOffset" in fragment && { start_offset: fragment.startOffset }),
        ...("endOffset" in fragment && { end_offset: fragment.endOffset }),
        ...("pageNumber" in fragment && { page_number: fragment.pageNumber }),
        ...("nodeId" in fragment && { nodeId: (fragment as any).nodeId }),
        ...("nodeName" in fragment && { nodeName: (fragment as any).nodeName }),
        ...("nodeType" in fragment && { nodeType: (fragment as any).nodeType }),
    });

    // Helper: Create new node from result and link it
    const createNodeAndLink = React.useCallback(async (text: string, sourceFragment: Fragment, targetCanvasId?: string) => {
        // Use provided canvasId or fall back to current prop
        const cId = targetCanvasId || canvasId;
        if (!cId) return;

        // Calculate position: right of the current node
        const position = { x: thing.position_x + (thing.width || 200) + 50, y: thing.position_y };

        // Create new text thing with title derived from source fragment ID
        const newThingTitle = (sourceFragment as any).tool_label || sourceFragment.id || "Analysis Result";
        // CRITICAL FIX: Pass cId explicitly to addThing
        const newThing = await addThing("text", { text }, position, 400, 300, newThingTitle, undefined, undefined);

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
        return newThing;
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

            // Handle custom tool mapping
            const isCustomTool = action === "custom_tool";
            const apiAction = isCustomTool ? "ask" : action;
            const apiCustomPrompt = isCustomTool ? (fragment as any).tool_prompt : undefined;

            // 1. Create a placeholder node and link it immediately
            const placeholderText = "Thinking...";
            const newThing = await createNodeAndLink(placeholderText, fragment, canvasId);

            if (newThing) {
                // 2. Stream tokens directly into the placeholder node
                let accumulatedText = "";
                await analyze({
                    canvasId,
                    thingId: thing.id,
                    fragment: finalFragment,
                    action: apiAction as any,
                    customPrompt: apiCustomPrompt,
                    model: modelToUse || undefined,
                    onChunk: (chunk) => {
                        accumulatedText += chunk;
                        updateThing(newThing.id, {
                            content: { text: accumulatedText }
                        });
                    }
                });
            }
        },
        [canvasId, thing, analyze, createNodeAndLink, selectedModel, visionModel, fetchImageAsBase64, updateThing]
    );

    // Handle ask with custom prompt
    const handleAskSubmit = React.useCallback(async (e?: React.SyntheticEvent) => {
        if (e) e.preventDefault();

        if (!canvasId || !customPrompt.trim()) return;

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

            // 1. Create a placeholder node and link it immediately
            const placeholderText = "Thinking...";
            const newThing = await createNodeAndLink(placeholderText, fullThingFragment, canvasId);

            if (newThing) {
                // 2. Stream tokens directly into the placeholder node
                let accumulatedText = "";
                const result = await analyze({
                    canvasId,
                    thingId: thing.id,
                    fragment: finalFragment,
                    action: "ask",
                    customPrompt: customPrompt.trim(),
                    model: modelToUse || undefined,
                    onChunk: (chunk) => {
                        accumulatedText += chunk;
                        updateThing(newThing.id, {
                            content: { text: accumulatedText }
                        });
                    }
                });
                
                if (result && result.result) {
                    // Only close and clear on success/completion
                    setAskDialogOpen(false);
                    setCustomPrompt("");
                }
            }
        } catch (err) {
            console.error("[ThingNode] Ask failed:", err);
            setAskDialogOpen(false);
        }
    }, [canvasId, thing, fullThingFragment, customPrompt, analyze, createNodeAndLink, selectedModel, visionModel, fetchImageAsBase64, updateThing]);

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
    const handleConfirmLink = React.useCallback(async (type: LinkType, label: string, description: string, reverseDirection: boolean = false) => {
        // Allow creating links even if pendingFragment is null (linking the whole node)
        if (!selectedTargetId) return;

        const fragmentData = pendingFragment ? getFragmentData(pendingFragment) : undefined;

        if (reverseDirection) {
            await addLink(
                selectedTargetId,
                thing.id,
                type,
                label,
                description,
                undefined,
                fragmentData,
                pendingTargetCanvasId || undefined
            );
        } else {
            await addLink(
                thing.id,
                selectedTargetId,
                type,
                label,
                description,
                fragmentData,
                undefined,
                pendingTargetCanvasId || undefined
            );
        }

        setLinkTypeDialogOpen(false);
        setPendingFragment(null);
        setSelectedTargetId(null);
        setPendingTargetCanvasId(null);
    }, [thing.id, pendingFragment, selectedTargetId, pendingTargetCanvasId, addLink]);

    // Handle creating result as new thing (from result dialog if we used that)
    const handleCreateThing = React.useCallback(async () => {
        if (!analysisResult) return;
        await addThing("text", { text: analysisResult }, { x: thing.position_x + 50, y: thing.position_y + 50 }, 400, 300);
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
        
        // 1. Check Plugin Registry First
        const CustomViewer = canvasPluginRegistry.getViewer(type);
        if (CustomViewer) {
            return <CustomViewer thing={thing} links={links} />;
        }

        // 2. Fall back to core switch
        switch (type) {
            case "mcp_tool":
                return <MCPToolViewer thing={thing} />;

            case "form_tool":
                return <FormToolViewer thing={thing} />;

            case "spreadsheet":
                return (
                    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden relative group/spreadsheet">
                        <InboundDataMapper thing={thing} />
                        <SpreadsheetToolViewer thing={thing} />
                    </div>
                );

            case "agent_tool":
                return <AgentToolViewer thing={thing} />;

            case "archimate_tool":
                return (
                    <SelectableContent thingId={thing.id}>
                        <ArchiMateToolViewer thing={thing} links={links} />
                    </SelectableContent>
                );

            case "gap_analysis_tool":
                return <GapAnalysisToolViewer thing={thing} links={links} />;

            case "scenario_simulator_tool":
                return <ScenarioSimulatorViewer thing={thing} links={links} />;

            case "archimate_element":
                return <ArchiMateElementViewer thing={thing} />;

            case "text":
            case "agent_result": // Treat agent results as text, utilizing markdown viewer if applicable
                let rawVal = cleanContent || content.result || content.outputs || content.text || content.content;
                if (!rawVal && type === "agent_result") rawVal = content;
                if (!rawVal) rawVal = "";
                
                // Smart extraction for agent results that might use generic keys like "final result" or "output"
                if (type === "agent_result") {
                    // 1. Initial key extraction if it's a wrapper object
                    if (typeof rawVal === 'object' && rawVal !== null && !Array.isArray(rawVal)) {
                        const resultKeys = Object.keys(rawVal).filter(k => 
                            !k.startsWith('_') && k !== 'status' && k !== 'agent_id' && k !== 'execution_id'
                        );
                        if (resultKeys.length === 1) {
                            rawVal = rawVal[resultKeys[0]];
                        } else if (resultKeys.length > 1) {
                            const primary = resultKeys.find(k => k.toLowerCase().includes('result')) || 
                                          resultKeys.find(k => k.toLowerCase().includes('output'));
                            if (primary) rawVal = rawVal[primary];
                        }
                    }

                    // 2. Smart string parsing (handling JSON or Python-style single quotes)
                    if (typeof rawVal === 'string' && (rawVal.trim().startsWith('[') || rawVal.trim().startsWith('{'))) {
                        const trimmed = rawVal.trim();
                        try {
                            rawVal = JSON.parse(trimmed);
                        } catch (e) {
                            try {
                                // Structural parse: ONLY replace quotes that are part of JSON syntax
                                let cleaned = trimmed
                                    .replace(/{\s*'/g, '{"')
                                    .replace(/'\s*:/g, '":')
                                    .replace(/:\s*'/g, ':"')
                                    .replace(/'\s*,/g, '",')
                                    .replace(/,\s*'/g, ',"')
                                    .replace(/\[\s*'/g, '["')
                                    .replace(/'\s*\]/g, '"]')
                                    .replace(/'\s*}/g, '"}')
                                    .replace(/None/g, 'null')
                                    .replace(/True/g, 'true')
                                    .replace(/False/g, 'false');
                                    
                                rawVal = JSON.parse(cleaned);
                            } catch (e2) {
                                // Fallback: just use the raw string
                            }
                        }
                    }

                    // 3. Final Table Detection & Extraction (Recursive)
                    const findTable = (obj: any): any => {
                        if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object') return obj;
                        if (typeof obj === 'object' && obj !== null) {
                            for (const k of Object.keys(obj)) {
                                if (k.startsWith('_')) continue;
                                const found = findTable(obj[k]);
                                if (found) return found;
                            }
                        }
                        return null;
                    };

                    const tableCandidate = findTable(rawVal);
                    if (tableCandidate) {
                        rawVal = tableCandidate;
                    }
                }

                // Table Detection & Interactive Rendering
                if (Array.isArray(rawVal) && rawVal.length > 0 && typeof rawVal[0] === 'object' && rawVal[0] !== null) {
                    const keys = Object.keys(rawVal[0]);
                    const tableData = [
                        keys,
                        ...rawVal.map((row: any) => keys.map(k => row[k]))
                    ];

                    return (
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="flex-1 min-h-[300px] border rounded-xl bg-white dark:bg-slate-900 shadow-inner overflow-hidden">
                                <SelectableContent thingId={thing.id}>
                                    <SpreadsheetViewer 
                                        content="" 
                                        initialData={tableData}
                                        className="h-full"
                                        selectionEnabled={true}
                                        onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
                                    />
                                </SelectableContent>
                            </div>
                        </div>
                    );
                }

                if (typeof rawVal === 'object' && rawVal !== null) {
                    rawVal = JSON.stringify(rawVal, null, 2);
                }
                let textVal = String(rawVal);

                const inputMapping = (thing.content as any)?.input_mapping;
                if (thing.type === "text" && inputMapping?.enabled) {
                    if (inputMapping.behavior === "append") {
                        const ingestedArray = thing.content.ingested_data || [];
                        if (ingestedArray.length > 0) {
                            const selectedKeys = inputMapping.selectedKeys || Object.keys(ingestedArray[0] || {});
                            if (inputMapping.format === "table") {
                                const header = `| ${selectedKeys.join(" | ")} |\n|${selectedKeys.map(() => "---").join("|")}|\n`;
                                const rows = ingestedArray.map((row: any) => `| ${selectedKeys.map((k: string) => row[k]).join(" | ")} |`).join("\n");
                                textVal = header + rows;
                            } else if (inputMapping.format === "bullets") {
                                textVal = ingestedArray.map((row: any, i: number) => `**Submission ${i+1}:**\n` + selectedKeys.map((k: string) => `  - **${k}:** ${row[k]}`).join("\n")).join("\n\n");
                            } else if (inputMapping.format === "raw") {
                                const outArr = ingestedArray.map((row: any) => {
                                    const outObj: any = {};
                                    selectedKeys.forEach((k: string) => outObj[k] = row[k]);
                                    return outObj;
                                });
                                textVal = "```json\n" + JSON.stringify(outArr, null, 2) + "\n```";
                            }
                        } else {
                            textVal = "*No data ingested yet.*";
                        }
                    } else {
                        const incomingLinks = links.filter(l => l.target_id === thing.id);
                        const sourceNodes = incomingLinks.map(l => things.find(t => t.id === l.source_id)).filter(Boolean);
                        if (sourceNodes.length > 0) {
                            let incomingData: Record<string, any> = {};
                            sourceNodes.forEach(node => {
                                if (node?.type === "form_tool") {
                                    const values = node.content.values || node.content.populatedSchema?.data || {};
                                    incomingData = { ...incomingData, ...values };
                                } else if (node?.type === "agent_result") {
                                    const res = node.content.result || node.content.outputs || {};
                                    if (typeof res === "object") incomingData = { ...incomingData, ...res };
                                } else if (typeof node?.content === "object" && node?.type !== "text") {
                                    incomingData = { ...incomingData, ...(node.content.data || node.content.values || node.content) };
                                }
                            });
                            
                            const selectedKeys = inputMapping.selectedKeys || Object.keys(incomingData);
                            if (inputMapping.format === "table") {
                                textVal = `| Field | Value |\n|---|---|\n` + selectedKeys.map((k: string) => `| **${k}** | ${incomingData[k]} |`).join("\n");
                            } else if (inputMapping.format === "bullets") {
                                textVal = selectedKeys.map((k: string) => `- **${k}:** ${incomingData[k]}`).join("\n");
                            } else if (inputMapping.format === "raw") {
                                const outObj: any = {};
                                selectedKeys.forEach((k: string) => outObj[k] = incomingData[k]);
                                textVal = "```json\n" + JSON.stringify(outObj, null, 2) + "\n```";
                            }
                        }
                    }
                }

                if (isEditingContent && thing.type === "text") {
                    // We now handle editing in a fullscreen Dialog to avoid React Flow conflicts
                    // The main content will render normally in the background
                }

                // Check for Visualizer Output (Charts)
                const visOutput = (thing.content as any)?.visualizer_output;
                if (visOutput?.visual_payload && viewMode !== 'content') {
                    const st = visOutput.visual_payload.structure_type?.toLowerCase() || "";
                    const componentName = visOutput.visual_payload.react_component;
                    const category = visOutput.visual_payload.visual_category?.toLowerCase() || "";

                    console.log("[ThingNode] Visualizer Output Debug:", {
                        id: thing.id,
                        title: thing.title,
                        structure_type: st,
                        react_component: componentName,
                        visual_category: category,
                        payload_keys: Object.keys(visOutput.visual_payload)
                    });

                    // 0. Dynamic Registry Lookup (Highest Priority)
                    if (componentName && COMPONENT_REGISTRY[componentName]) {
                        const Component = COMPONENT_REGISTRY[componentName];

                        let props: any = {
                            data: visOutput.visual_payload.content,
                            className: "w-full h-full"
                        };

                        // Special handling for ChartViewer
                        if (componentName === "ChartViewer" || componentName === "recharts") {
                            const cType = (st === 'chart' || st === 'react_component' || st === '') ? 'linechart' : st;
                            props.type = cType;
                            props.isAnimationActive = true;
                        }

                        return (
                            <div className="flex flex-col h-full overflow-hidden p-2">
                                <div className="font-medium text-sm mb-2 px-1">
                                    {thing.title || "Visual Analysis"}
                                </div>
                                <div className="flex-1 min-h-0 border rounded-md bg-slate-50 dark:bg-slate-900/50">
                                    <Component {...props} />
                                </div>
                            </div>
                        );
                    }

                    // 1. Strict Fallback: Logic Removed per User Request
                    // The system must rely on correct `react_component` configuration.
                    // If misconfigured, it may fall through to generic handling or display incorrectly,
                    // which is the intended behavior to signal configuration error.

                    // 2. Check for Charts / Generic Components (Legacy Fallback)
                    // We keep this for backward compatibility with existing non-component-based charts
                    // 2. Strict Error Handling (No Fallback)
                    // If a component name was specified but not found in registry (and wasn't handled above),
                    // we display an error. We do NOT fallback to ChartViewer unless explicitly requested via registry.
                    if (componentName && !COMPONENT_REGISTRY[componentName]) {
                        return (
                            <div className="flex flex-col h-full overflow-hidden p-2">
                                <div className="font-medium text-sm mb-2 px-1 text-red-500 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    Component Config Error
                                </div>
                                <div className="flex-1 min-h-0 border rounded-md bg-red-50 dark:bg-red-900/10 p-4 flex flex-col items-center justify-center text-center">
                                    <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">
                                        Component "{componentName}" not found.
                                    </p>
                                    <p className="text-xs text-red-500/80">
                                        Please check the `react_component` configuration.
                                    </p>
                                </div>
                            </div>
                        );
                    }
                }

                // Check for manual view mode override
                if (viewMode === 'cloud') {
                    return (
                        <div className="flex flex-col h-full overflow-hidden p-2">
                            <div className="font-medium text-sm mb-2 px-1">
                                {thing.title || "Word Cloud View"}
                            </div>
                            <div className="flex-1 min-h-0 border rounded-md bg-slate-50 dark:bg-slate-900/50">
                                <TagCloudViewer
                                    data={textVal}
                                />
                            </div>
                        </div>
                    );
                }

                const showAsMarkdown = thing.type === "agent_result" || ((isMarkdown(textVal) || textVal.includes("{{node:")) && !highlight);

                if (useCollaboraMode) {
                    const fileUrl = `/api/v1/things/${thing.id}`;
                    return (
                        <div className={cn("flex flex-col overflow-hidden", thing.height ? "h-full" : "max-h-[600px]")}>
                            <div className="flex-1 min-h-0 overflow-hidden px-1">
                                <SelectableContent thingId={thing.id}>
                                    <CollaboraViewer 
                                        fileUrl={fileUrl} 
                                        className="w-full h-full min-h-[400px] border-0"
                                        fallback={
                                            showAsMarkdown ? (
                                                <MemoizedMarkdownViewer
                                                    content={textVal}
                                                    className="h-full prose-sm dark:prose-invert"
                                                    ancestorIds={[thing.id]}
                                                    onSelect={handleTextSelection}
                                                    transclusionStates={(thing.content as any).transclusions}
                                                    onTransclusionStateChange={handleTransclusionStateChange}
                                                    highlight={highlight}
                                                />
                                            ) : (
                                                <MemoizedTextViewer
                                                    content={textVal}
                                                    className="h-full"
                                                    highlight={highlight}
                                                    onSelect={handleTextSelection}
                                                />
                                            )
                                        }
                                    />
                                </SelectableContent>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className={cn("flex flex-col overflow-hidden relative group/textnode", thing.height ? "h-full" : "max-h-[600px]")}>
                        {(thing.type === "text" || thing.type === "spreadsheet") && <InboundDataMapper thing={thing} />}
                        {/* Thinking Block */}
                        {hasThinking && isThinkingVisible && (
                            <div ref={thinkingScrollRef} className="flex-none mb-3 p-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-md border border-amber-100 dark:border-amber-900/30 text-sm text-slate-600 dark:text-slate-400 italic overflow-y-auto max-h-[150px]">
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
                                    <MemoizedMarkdownViewer
                                        content={textVal}
                                        className="h-full prose-sm dark:prose-invert"
                                        ancestorIds={[thing.id]}
                                        onSelect={handleTextSelection}
                                        transclusionStates={(thing.content as any).transclusions}
                                        onTransclusionStateChange={handleTransclusionStateChange}
                                        highlight={highlight}
                                    />
                                ) : (
                                    <MemoizedTextViewer
                                        content={textVal}
                                        className="h-full"
                                        highlight={highlight}
                                        onSelect={handleTextSelection}
                                    />
                                )}
                            </SelectableContent>
                        </div>
                        <CitationList
                            citations={(thing.content as any).citations}
                            onSelectThing={selectThing}
                            onHighlight={setHighlightTarget}
                        />
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
                    (fileType?.includes("pdf") || filename?.toLowerCase().endsWith(".pdf") || filePath?.toLowerCase().endsWith(".pdf")) &&
                    !filename?.toLowerCase().endsWith(".docx") &&
                    !filename?.toLowerCase().endsWith(".doc")
                ) {
                    // Check for asset_id first (Generated PDFs etc)
                    const assetId = content.asset_id;
                    let pdfSrc = assetId ? `/api/v1/assets/${assetId}` : filePath;
                    
                    if (pdfSrc && (pdfSrc.includes(":\\") || pdfSrc.startsWith("/") && !pdfSrc.startsWith("/api"))) {
                        pdfSrc = `/api/v1/knowledge/kb/local-file?path=${encodeURIComponent(pdfSrc)}`;
                    }

                    if (pdfSrc) {
                        return (
                            <SelectableContent thingId={thing.id}>
                                <PDFViewer
                                    src={pdfSrc}
                                    className="h-full"
                                    overlays={imageOverlays}
                                    onOverlayResize={handleOverlayResize}
                                    onSelect={(fragment, position) => {
                                        if (fragment.type === "region") {
                                            handleRegionCreate(fragment, position);
                                            // Force toolbar show for re-selection
                                            setContentSelection(thing.id, fragment, position);
                                        } else {
                                            // Text selection - show toolbar immediately
                                            setContentSelection(thing.id, fragment, position);
                                        }
                                    }}
                                    onOverlayDelete={handleOverlayDelete}
                                    highlight={highlight}
                                />
                            </SelectableContent>
                        );
                    }
                }

                // Markdown files or Explicit Markdown Content (Smart Analysis)
                if (filename?.toLowerCase().endsWith(".md") || content.format === 'markdown' || (textContent && !filename)) {
                    const assetId = content.asset_id;
                    const fileUrl = assetId ? `/api/v1/assets/${assetId}` : `/api/v1/things/${thing.id}`;
                    
                    if (useCollaboraMode) {
                        return (
                            <div className="flex flex-col h-full">
                                <div className="flex-1 min-h-0 overflow-y-auto">
                                    <SelectableContent thingId={thing.id}>
                                        <CollaboraViewer 
                                            fileUrl={fileUrl} 
                                            className={cn("w-full border-0", thing.height ? "h-full" : "min-h-[500px]")}
                                            fallback={
                                                <MarkdownViewer
                                                    content={textContent || ""}
                                                    className="h-full flex-1"
                                                    ancestorIds={[thing.id]}
                                                    onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
                                                    highlight={highlight}
                                                />
                                            } 
                                        />
                                    </SelectableContent>
                                </div>
                                <CitationList
                                    citations={(thing.content as any).citations}
                                    onSelectThing={selectThing}
                                    onHighlight={setHighlightTarget}
                                />
                            </div>
                        );
                    } else {
                        return (
                            <div className="flex flex-col h-full">
                                <div className="flex-1 min-h-0 overflow-y-auto">
                                    <SelectableContent thingId={thing.id}>
                                        <MarkdownViewer
                                            content={textContent || ""}
                                            className="h-full flex-1"
                                            ancestorIds={[thing.id]}
                                            onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
                                            highlight={highlight}
                                        />
                                    </SelectableContent>
                                </div>
                                <CitationList
                                    citations={(thing.content as any).citations}
                                    onSelectThing={selectThing}
                                    onHighlight={setHighlightTarget}
                                />
                            </div>
                        );
                    }
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

                    if (useCollaboraMode) {
                        return (
                            <SelectableContent thingId={thing.id}>
                                <CollaboraViewer 
                                    fileUrl={fileUrl} 
                                    className={cn("w-full border-0", thing.height ? "h-full" : "min-h-[500px]")}
                                    fallback={
                                        <SpreadsheetViewer
                                            content={fileUrl}
                                            filename={filename}
                                            className={cn(thing.height ? "h-full" : "max-h-[200px]")}
                                            highlight={highlight}
                                            onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
                                        />
                                    } 
                                />
                            </SelectableContent>
                        );
                    } else {
                        return (
                            <SelectableContent thingId={thing.id}>
                                <SpreadsheetViewer
                                    content={fileUrl}
                                    filename={filename}
                                    className={cn(thing.height ? "h-full" : "max-h-[200px]")}
                                    highlight={highlight}
                                    onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
                                />
                            </SelectableContent>
                        );
                    }
                }

                // Word Documents (or others with extracted text)
                if (content.text_content) {
                    const assetId = content.asset_id;
                    const fileUrl = assetId ? `/api/v1/assets/${assetId}` : (filePath || "");
                    
                    if (useCollaboraMode) {
                        return (
                            <div className="flex flex-col h-full">
                                <div className="flex-1 min-h-0 overflow-y-auto">
                                    <SelectableContent thingId={thing.id}>
                                        <CollaboraViewer 
                                            fileUrl={fileUrl} 
                                            className={cn("w-full border-0", thing.height ? "h-full" : "min-h-[500px]")}
                                            fallback={
                                                <MarkdownViewer
                                                    content={content.text_content as string}
                                                    className="h-full px-4 flex-1"
                                                    ancestorIds={[thing.id]}
                                                    onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
                                                    highlight={highlight}
                                                />
                                            } 
                                        />
                                    </SelectableContent>
                                </div>
                                <CitationList
                                    citations={(thing.content as any).citations}
                                    onSelectThing={selectThing}
                                    onHighlight={setHighlightTarget}
                                />
                            </div>
                        );
                    } else {
                        return (
                            <div className="flex flex-col h-full">
                                <div className="flex-1 min-h-0 overflow-y-auto">
                                    <SelectableContent thingId={thing.id}>
                                        <MarkdownViewer
                                            content={content.text_content as string}
                                            className="h-full px-4 flex-1"
                                            ancestorIds={[thing.id]}
                                            onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
                                            highlight={highlight}
                                        />
                                    </SelectableContent>
                                </div>
                                <CitationList
                                    citations={(thing.content as any).citations}
                                    onSelectThing={selectThing}
                                    onHighlight={setHighlightTarget}
                                />
                            </div>
                        );
                    }
                }

                // Generated markdown documents (from Document Templates)
                if (content.format === "markdown" && textContent) {
                    return (
                        <SelectableContent thingId={thing.id}>
                            <MarkdownViewer
                                content={textContent}
                                className="h-full overflow-y-auto px-4 prose prose-sm dark:prose-invert max-w-none"
                                ancestorIds={[thing.id]}
                                onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
                                selectionEnabled={true}
                                highlight={highlight}
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
                            onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
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
                                setContentSelection(thing.id, fragment, position);
                            }}
                            onOverlayDelete={handleOverlayDelete}
                            highlight={highlight}
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
                            onSelect={(fragment, position) => setContentSelection(thing.id, fragment, position)}
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
                                setContentSelection(thing.id, fragment, position);
                            }}
                            onOverlayResize={handleOverlayResize}
                            onOverlayDelete={handleOverlayDelete}
                            onOverlayClick={(fragment, position) => {
                                setContentSelection(thing.id, fragment, position);
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

                const renderBrowserContent = (() => {
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
                                    <PDFViewer src={`/api/v1/assets/${assetId}`} highlight={highlight} />
                                </div>
                            );
                        }
                    }

                    return (
                        <MemoizedMarkdownViewer
                            content={pageContent}
                            className="prose prose-sm dark:prose-invert max-w-none h-full overflow-y-auto p-4"
                            onSelect={handleTextSelection}
                            transclusionStates={(thing.content as any).transclusions}
                            onTransclusionStateChange={handleTransclusionStateChange}
                            ancestorIds={[thing.id]}
                            highlight={highlight}
                            onLinkClick={offlineMode ? handleNavigate : undefined}
                        />
                    );
                })();

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
                            <Button
                                variant={offlineMode ? "default" : "outline"}
                                size="sm"
                                className="h-6 text-[10px] px-2 ml-1"
                                onClick={() => setOfflineMode(!offlineMode)}
                                title={offlineMode ? "Offline Mode: Links open locally" : "Online Mode: Links open in new tab"}
                            >
                                {offlineMode ? "Offline" : "Online"}
                            </Button>
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
                                {renderBrowserContent}
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
                        <div className="text-base flex-1 min-h-0 w-full relative" style={{ height: '100%', width: '100%' }}>
                            <div className="absolute inset-0 flex flex-col" style={{ height: '100%', width: '100%' }}>
                                {renderFullContent()}
                            </div>
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
    if (thing.iconified && !(data as any).forceExpanded) {
        const isGhost = thing.content?.is_ghost;
        return (
            <div
                className={cn(
                    "group relative flex flex-col items-center justify-center p-2 gap-1 transition-all duration-200",
                    "bg-white dark:bg-slate-900",
                    "rounded-xl shadow-sm border",
                    // Ghost Node Styling
                    isGhost ? "opacity-70 border-dashed border-slate-400 bg-slate-50/50" : selected ? "ring-2 ring-primary border-primary shadow-md z-10" : "border-slate-200 dark:border-slate-800 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700",
                    "overflow-visible",
                    // Standard width/height for consistency
                    "w-[120px] h-[80px]"
                )}
                title={thing.title || getDefaultTitle()}
                style={{
                    backgroundColor: thing.color || canvasSettings?.tool_colors?.[thing.type],
                    borderColor: (thing.color || canvasSettings?.tool_colors?.[thing.type]) ? 'rgba(0,0,0,0.1)' : undefined
                }}
                onDoubleClick={handleDoubleClick}
            >
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

                {/* Inner wrapper for Icon and Handles to constrain handle placement */}
                <div className="relative flex items-center justify-center">
                    {/* Main type icon - colored by type */}
                    <Icon className={cn("h-8 w-8", colorTheme.iconColor)} />

                    {/* Connection handles - colored by type */}
                    <Handle
                        id="target"
                        type="target"
                        position={Position.Left}
                        className={cn("!w-4 !h-4", colorTheme.handleColor)}
                    />
                    <Handle
                        id="source"
                        type="source"
                        position={Position.Right}
                        className={cn("!w-4 !h-4", colorTheme.handleColor)}
                    />
                    {/* Dynamic invisible source handles for region-based fragment links when iconified */}
                    {(thing.type === "image" || thing.type === "document" || thing.type === "slideshow") &&
                        links
                            .filter(l => l.source_id === thing.id && l.source_fragment?.type === "region")
                            .map(l => (
                                <Handle
                                    key={l.id}
                                    id={`fragment-handle-${l.id}`}
                                    type="source"
                                    position={Position.Right}
                                    style={{
                                        top: "50%",
                                        left: "100%",
                                        position: 'absolute',
                                        transform: 'translate(-50%, -50%)',
                                        opacity: 0,
                                        pointerEvents: 'none',
                                    }}
                                />
                            ))}
                </div>

                {/* Title Label - Static below icon */}
                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 text-center leading-tight line-clamp-2 w-full px-1">
                    {thing.title || getDefaultTitle()}
                </span>

                {/* Automation Floating Badge (Iconified) */}
                {processingMessage && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-[100] pointer-events-none flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-500/20 whitespace-nowrap animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-[10px] font-semibold">
                            {processingMessage}
                        </span>
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
            <div className="flex flex-col items-center gap-10 p-12 whitespace-nowrap group">
                <div
                    className={cn(
                        "relative w-80 h-80 rounded-3xl flex items-center justify-center",
                        "bg-white dark:bg-slate-800 border-8 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] transition-transform duration-300",
                        isSelected
                            ? `${colorTheme.borderSelected} ring-8 ring-offset-8 ring-blue-500 scale-105`
                            : "border-slate-200 dark:border-slate-700"
                    )}
                    style={{
                        backgroundColor: thing.color || canvasSettings?.tool_colors?.[thing.type],
                    }}
                >
                    {/* Massive 320px Icon (20x 16px) */}
                    <Icon className={cn("h-60 w-60", colorTheme.iconColor)} />
                    <Handle
                        id="target"
                        type="target"
                        position={Position.Left}
                        className={cn(
                            "!w-4 !h-4 !bg-orange-500 border-2 border-white dark:border-slate-950 transition-opacity",
                            isSelected ? "opacity-100" : "opacity-30 group-hover:opacity-100"
                        )}
                    />
                    <Handle
                        id="source"
                        type="source"
                        position={Position.Right}
                        className={cn(
                            "!w-4 !h-4 !bg-orange-500 border-2 border-white dark:border-slate-950 transition-opacity",
                            isSelected ? "opacity-100" : "opacity-30 group-hover:opacity-100"
                        )}
                    />

                    {/* Dynamic invisible source handles for region-based fragment links in domain view */}
                    {(thing.type === "image" || thing.type === "document" || thing.type === "slideshow") &&
                        links
                            .filter(l => l.source_id === thing.id && l.source_fragment?.type === "region")
                            .map(l => (
                                <Handle
                                    key={l.id}
                                    id={`fragment-handle-${l.id}`}
                                    type="source"
                                    position={Position.Right}
                                    style={{
                                        top: "50%",
                                        left: "100%",
                                        position: 'absolute',
                                        transform: 'translate(-50%, -50%)',
                                        opacity: 0,
                                        pointerEvents: 'none',
                                    }}
                                />
                            ))}
                </div>

                {/* Massive Title for visibility at extreme distances - Refined 3rem Non-Bold */}
                <div className="text-center">
                    <div className="text-[3rem] font-normal text-slate-900 dark:text-white leading-none drop-shadow-2xl">
                        {thing.title || getDefaultTitle()}
                    </div>
                </div>

            </div>
        );
    }

    // Compute default label and description for the popup
    const getDefaultLinkDetails = () => {
        let label = `Link from ${thing.title || thing.type}`;
        let description = `Reference to ${thing.title || thing.type}`;

        if (pendingFragment) {
            label = `Fragment: ${pendingFragment.content?.slice(0, 30) ?? 'unknown'}...`;
            description = "Reference to selected content";

            if (pendingFragment.type === "archimate_node") {
                const nodeFrag = pendingFragment as any;
                label = `${nodeFrag.nodeType}: ${nodeFrag.nodeName || 'Unnamed'}`;
                description = `Link to ${nodeFrag.nodeName || 'Unnamed'} (${nodeFrag.nodeType})`;
            } else if (pendingFragment.type === "cell" && (pendingFragment as any).selectionType) {
                const cellFrag = pendingFragment as any;
                if (cellFrag.selectionType === "row") {
                    const rowNum = cellFrag.range.split(":")[0];
                    label = `Row ${rowNum}`;
                    description = `Link to row ${rowNum}`;
                } else if (cellFrag.selectionType === "column") {
                    const colLetter = cellFrag.range.split(":")[0];
                    label = `Column ${colLetter}`;
                    description = `Link to column ${colLetter}`;
                } else if (cellFrag.selectionType === "range") {
                    if (cellFrag.range.match(/^\d+:\d+$/)) {
                        const [start, end] = cellFrag.range.split(":");
                        label = `Rows ${start}-${end}`;
                        description = `Link to rows ${start}-${end}`;
                    } else if (cellFrag.range.match(/^[A-Z]+:[A-Z]+$/)) {
                        const [start, end] = cellFrag.range.split(":");
                        label = `Columns ${start}-${end}`;
                        description = `Link to columns ${start}-${end}`;
                    } else {
                        label = `Cells ${cellFrag.range}`;
                        description = `Link to cells ${cellFrag.range}`;
                    }
                } else {
                    label = `Cell ${cellFrag.range}`;
                    description = `Link to cell ${cellFrag.range}`;
                }
            }
        }
        
        return { label, description };
    };

    const { label: defaultLabel, description: defaultDescription } = getDefaultLinkDetails();

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
                    isVisible={selected && !isReadOnly}
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
                {selected && !hasInnerSelection && !isReadOnly &&
                    <SelectionToolbar
                        fragment={fullThingFragment}
                        thingId={thing.id}
                        positionMode="absolute"
                        position={{ x: "50%", y: -50 }}
                        onAction={handleAction}
                        onLink={handleLink}
                        onClose={() => { }} // No-op as it's controlled by selection
                        isLoading={isLoading}
                        isThingContext={true}
                        disableHighlight={true}
                    />
                }

                {/* Inner Content Wrapper - Clips content but leaves Handles outside */}
                <div className="flex-1 w-full min-h-0 flex flex-col overflow-hidden rounded-lg relative">
                    <div ref={nodeRef} className="absolute inset-0 pointer-events-none" />
                    {/* Gradient header - Pure Drag Handle */}
                    {/* Document and Text headers */}
                    <div className={cn(
                        "flex items-center gap-2 px-3 py-2 border-b rounded-t-lg",
                        colorTheme.headerBg,
                        colorTheme.headerBgDark,
                        "select-none"
                    )}
                        style={{
                            backgroundColor: thing.color || canvasSettings?.tool_colors?.[thing.type],
                            backgroundImage: (thing.color || canvasSettings?.tool_colors?.[thing.type]) ? 'none' : undefined
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
                                        if (isReadOnly) return;
                                        e.stopPropagation();
                                        setTitleInputValue(thing.title || getDefaultTitle());
                                        setIsEditingTitle(true);
                                    }}
                                    title={isReadOnly ? undefined : "Double-click to rename"}
                                >
                                    {thing.title || getDefaultTitle()}
                                </span>
                            )
                        )}
                    </div>

                    {/* Action Bar - Dedicated Interaction Area */}
                    {/* Only show in full view (not summary/domain) */}
                    {zoomLevel !== "summary" && (
                        <div className="nodrag flex-none w-full flex items-center gap-1 px-2 py-1 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 z-[20] pointer-events-auto min-h-[32px]">

                            {/* Link/Ghost Mode Button */}
                            {!isReadOnly && (
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
                            )}

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
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="p-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex-shrink-0 mr-1"
                                    title="Open Chat"
                                >
                                    <MessageSquare className="h-3.5 w-3.5" />
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

                            {/* Cloud Toggle Button */}
                            {(thing.type === 'text' || thing.type === 'agent_result') && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setViewMode(prev => prev === 'cloud' ? 'content' : 'cloud');
                                    }}
                                    className={cn(
                                        "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0 mr-1",
                                        viewMode === 'cloud' ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20" : "text-slate-400 hover:text-blue-500"
                                    )}
                                    title={viewMode === 'cloud' ? "Show Text Content" : "Show Word Cloud"}
                                >
                                    <Cloud className="h-4 w-4" />
                                </button>
                            )}

                            {/* Edit Content Button (Text Only) */}
                            {(thing.type === "text" || thing.type === "agent_result") && !isReadOnly && (
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

                            {/* Loudspeaker (TTS) Button */}
                            <button
                                onClick={handleSpeak}
                                onPointerDown={(e) => e.stopPropagation()}
                                className={cn(
                                    "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0",
                                    isSpeaking ? "text-blue-500 animate-pulse" : "text-slate-400 hover:text-blue-500"
                                )}
                                title="Read aloud (TTS)"
                                disabled={isSpeaking}
                            >
                                {isSpeaking ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Volume2 className="h-4 w-4" />
                                )}
                            </button>
                            
                            {/* Dictation (STT) Button - Only visible in Edit Mode */}
                            {(thing.type === "text" || thing.type === "agent_result") && isEditingContent && !isReadOnly && (
                                <button
                                    tabIndex={-1}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!editorRef.current) {
                                            console.error("[STT] Editor reference not found for node:", thing.id);
                                            toast({ title: "Editor Error", description: "Editor reference not found. Is the editor open?", variant: "destructive" });
                                            return;
                                        }
                                        console.log("[STT] Dictation button clicked on node:", thing.id);
                                        editorRef.current.handleToggleDictation();
                                    }}
                                    className={cn(
                                        "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0",
                                        isDictating ? "text-red-500 animate-pulse" : "text-slate-400 hover:text-red-500"
                                    )}
                                    title={isDictating ? "Stop Dictating" : "Dictate into node"}
                                >
                                    {isProcessingStt ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Mic className="h-4 w-4" />
                                    )}
                                </button>
                            )}

                            {/* Refresh Transclusions Button (Text Node) */}
                            {(thing.type === "text" || thing.type === "agent_result") && !isReadOnly && (
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
                            {(thing.content?.asset_id || thing.technical_metadata?.source_path || thing.content?.source_type === 'image_folder') && !isReadOnly && (
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
                            {((thing.type === 'text' || thing.type === 'document' || thing.type === 'slideshow' || thing.type === 'agent_result') &&
                                (localStatus !== 'completed' && localStatus !== 'processing' && localStatus !== 'pending') && !isReadOnly) && (
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
                                                            className={cn(
                                                                "opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 text-blue-500 rounded mr-1",
                                                                isReadOnly && "hidden"
                                                            )}
                                                            title="Edit Link"
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteLink(link.id);
                                                            }}
                                                            className={cn(
                                                                "opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 text-red-500 rounded",
                                                                isReadOnly && "hidden"
                                                            )}
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
                                    <DropdownMenuItem 
                                        disabled={isReadOnly}
                                        onSelect={() => {
                                        setPendingFragment(fullThingFragment);
                                        setCrossCanvasLinkDialogOpen(true);
                                    }}>
                                        <LinkIcon className="h-4 w-4 mr-2" />
                                        Add Link...
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Collabora Toggle Button */}
                            {(thing.type === 'document' || thing.type === 'text') && !isReadOnly && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleCollaboraToggle();
                                    }}
                                    className={cn(
                                        "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0",
                                        useCollaboraMode ? "text-purple-600 bg-purple-50 dark:bg-purple-900/20" : "text-slate-400 hover:text-purple-500"
                                    )}
                                    title={useCollaboraMode ? "Switch to Native Viewer" : "Edit in Collabora Online"}
                                >
                                    <CollaboraIcon className="h-4 w-4" />
                                </button>
                            )}

            {/* Transclusion Resolve Dialog */}
            <Dialog open={transclusionResolveDialogOpen} onOpenChange={setTransclusionResolveDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Live Transclusions Detected</DialogTitle>
                        <DialogDescription className="pt-2">
                            This node contains dynamic transclusions (live links to other documents). 
                            Collabora Online does not support rendering live transclusions.
                            <br/><br/>
                            Would you like to permanently convert these transclusions into plain text so they can be edited inside Collabora?
                            <br/><br/>
                            <strong className="text-red-500">Warning:</strong> Converting to text cannot be undone. The live connection to the source document will be permanently broken.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
                        <Button variant="outline" onClick={() => setTransclusionResolveDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="secondary" onClick={() => {
                            setTransclusionResolveDialogOpen(false);
                            setUseCollaboraMode(true);
                        }}>
                            Edit with Raw Tags
                        </Button>
                        <Button variant="destructive" onClick={handleResolveTransclusions}>
                            Convert to Text & Edit
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

                            {/* Export Dialog */}
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
                            {!isReadOnly && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleIconify(e);
                                    }}
                                    className={cn(
                                        "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-all flex-shrink-0 duration-200 opacity-100"
                                    )}
                                    title="Reduce to icon"
                                    tabIndex={(isSelected || selected) ? 0 : -1}
                                >
                                    <Minimize2 className="h-4 w-4 text-slate-500" />
                                </button>
                            )}

                            {/* Delete button - Always rendered to reserve space */}
                            {!isReadOnly && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(thing.id);
                                    }}
                                    className={cn(
                                        "p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50 transition-all flex-shrink-0 duration-200 opacity-100"
                                    )}
                                    title="Delete"
                                    tabIndex={(isSelected || selected) ? 0 : -1}
                                >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Body content */}
                    {getDisplayContent() && (
                        <div className={cn("px-3 py-3 flex-1 min-h-0 flex flex-col", (thing.type === "spreadsheet" || thing.type === "trade_off_matrix") ? "overflow-hidden" : "overflow-auto")} style={{ height: '100%', width: '100%' }}>
                            <div className="h-full relative flex-1 min-h-0 flex flex-col w-full" style={{ height: '100%', width: '100%' }}>
                                {getDisplayContent()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Connection handles - colored by type */}
                <Handle
                    id="target"
                    type="target"
                    position={Position.Left}
                    className={cn("!w-4 !h-4 z-50", colorTheme.handleColor, isReadOnly && "opacity-0 pointer-events-none")}
                />
                <Handle
                    id="source"
                    type="source"
                    position={Position.Right}
                    className={cn("!w-4 !h-4 z-50", colorTheme.handleColor, isReadOnly && "opacity-0 pointer-events-none")}
                />

                {/* Dynamic invisible source handles for region-based fragment links in full card view */}
                {imageOverlays.filter(o => o.type === "link").map(overlay => {
                    const top = `${overlay.y + overlay.height / 2}%`;
                    const left = `${overlay.x + overlay.width}%`;
                    return (
                        <Handle
                            key={overlay.id}
                            id={`fragment-handle-${overlay.id}`}
                            type="source"
                            position={Position.Right}
                            style={{
                                top,
                                left,
                                position: 'absolute',
                                transform: 'translate(-50%, -50%)',
                                opacity: 0,
                                pointerEvents: 'none',
                            }}
                        />
                    );
                })}

                {/* Automation Floating Badge */}
                {processingMessage && (
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-[100] pointer-events-none flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-[0_0_20px_rgba(59,130,246,0.5)] whitespace-nowrap animate-in slide-in-from-bottom-2 fade-in duration-300 border border-blue-400/30">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs font-bold tracking-wide">
                            {processingMessage}
                        </span>
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
            <VectorizationPreviewDialog
                open={previewDialogOpen}
                onOpenChange={setPreviewDialogOpen}
                title={previewContent.title}
                content={previewContent.content}
                type={previewContent.type}
                onRetry={previewContent.title === "Ingestion Error" ? async () => {
                    setPreviewDialogOpen(false);
                    try {
                        await useCanvasStore.getState().retryIngestion(thing.id);
                        toast({
                            title: "Retry Started",
                            description: "Vectorization has been restarted.",
                            duration: 3000,
                        });
                    } catch (e: any) {
                        toast({
                            title: "Retry Failed",
                            description: e.message || String(e),
                            variant: "destructive",
                        });
                    }
                } : undefined}
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
                initialLabel={defaultLabel}
                initialDescription={defaultDescription}
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
                ref={editorRef}
                thing={thing}
                isOpen={isEditingContent && dockedThingId !== thing.id}
                isTrulyFullscreen={isTrulyFullscreen}
                setIsTrulyFullscreen={setIsTrulyFullscreen}
                onClose={() => {
                    setEditingThingId(null);
                    setIsTrulyFullscreen(false);
                }}
                onSave={handleContentSave}
                onDictationStateChange={(state) => {
                    setIsDictating(state.isDictating);
                    setIsProcessingStt(state.isProcessingStt);
                }}
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


