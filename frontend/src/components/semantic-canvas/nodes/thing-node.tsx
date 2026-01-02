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
    Link,
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
    Copy
} from "lucide-react";

import { cn, API_URL } from "@/lib/utils";
import { CanvasThing, ZoomLevel, useCanvasStore, LinkType } from "../canvas-store";
import {
    MarkdownViewer,
    SpreadsheetViewer,
    ImageViewer,
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
} from "../viewers";
import { SlideshowNode } from "./slideshow-node";
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
import { Label } from "@/components/ui/label";
import { createPortal } from "react-dom";
import { LinkTypeDialog } from "../link-type-dialog"; // Import LinkTypeDialog

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
    url: Link,
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

// =============================================================================
// Thing Node Component
// =============================================================================

export const ThingNode = React.memo(({ data, selected }: NodeProps<ThingNodeData>) => {
    // Canvas context
    // Canvas context
    const canvasId = useCanvasStore(state => state.canvasId);
    const updateThing = useCanvasStore(state => state.updateThing);

    // Get props from data
    const {
        thing: initialThing,
        zoomLevel,
        isSelected,
        onOpenConversation,
        onToggleIconify,
        onDelete,
        onResizeEnd
    } = data;

    // Get latest thing state from store to ensure reactivity (bypass potential ReactFlow prop lag)
    const freshThing = useCanvasStore(state => state.things.find(t => t.id === initialThing.id));
    // Fallback to initialThing if freshThing not found (though unexpected)
    const thing = freshThing || initialThing;
    const currentThing = thing; // Alias

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

    // Sync local status when prop changes
    React.useEffect(() => {
        setLocalStatus(currentThing.rag_status);
    }, [currentThing.rag_status]);

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
            console.log("[ThingNode] Region already exists, skipping creation:", regionId);
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
        console.log(`[ThingNode] Creating region:`, newRegion);
        await updateThing(thing.id, {
            content: { ...freshThing.content, regions: updatedRegions }
        });
        console.log(`[ThingNode] Region creation update sent.`);
    }, [thing, updateThing]);

    // Handle cascading delete of region and related content
    const handleConfirmDeleteRegion = React.useCallback(async () => {
        console.log("[ThingNode] handleConfirmDeleteRegion called. RegionToDelete:", regionToDelete);
        if (!regionToDelete) return;

        console.log("[ThingNode] Current links:", links);

        // 1. Identify related links
        const relatedLinks = links.filter(l => {
            const isSource = l.source_id === thing.id;
            const fragIdMatch = l.source_fragment?.id === regionToDelete;
            const labelMatch = (l.source_fragment as any)?.label === regionToDelete || l.label === regionToDelete; // detailed check

            // Log matches for debugging
            if (isSource && (fragIdMatch || labelMatch)) {
                console.log("[ThingNode] Found related link:", l);
            }

            return isSource && (fragIdMatch || labelMatch);
        });

        console.log("[ThingNode] Related links to delete:", relatedLinks.length);

        // 2. Identify related things
        const relatedThingIds = relatedLinks.map(l => l.target_id);
        console.log("[ThingNode] Related things to delete:", relatedThingIds);

        // 3. Delete related links
        for (const link of relatedLinks) {
            console.log("[ThingNode] Deleting link:", link.id);
            await deleteLink(link.id);
        }

        // 4. Delete related things
        const deleteThing = useCanvasStore.getState().deleteThing;
        for (const tId of relatedThingIds) {
            console.log("[ThingNode] Deleting thing:", tId);
            await deleteThing(tId);
        }

        // 5. Delete the region itself
        // refetch thing to ensure we have latest content (avoid race with deleteLink updates if any)
        const freshThing = useCanvasStore.getState().things.find(t => t.id === thing.id) || thing;
        const currentRegions = (freshThing.content.regions as any[]) || [];

        console.log("[ThingNode] Current regions before delete:", currentRegions);
        const updatedRegions = currentRegions.filter((r, idx) => {
            const rId = r.id || `region-${idx}`;
            return String(rId) !== String(regionToDelete);
        });

        console.log("[ThingNode] Updated regions count:", updatedRegions.length);

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
    const createNodeAndLink = React.useCallback(async (text: string, sourceFragment: Fragment) => {
        // Calculate position: right of the current node
        const position = { x: thing.position_x + (thing.width || 200) + 50, y: thing.position_y };

        // Create new text thing with title derived from source fragment ID
        const newThingTitle = sourceFragment.id || "Analysis Result";
        const newThing = await addThing("text", { text }, position, newThingTitle);

        if (newThing) {
            // Create link
            await addLink(
                thing.id,
                newThing.id,
                "derived_from",
                "Analysis",
                getFragmentData(sourceFragment), // Use smart label
                undefined
            );
        }
    }, [thing, addThing, addLink]);

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
                            // We might want to change type to "image" or "region" but backend logic
                            // primarily looks for image_data in AnalyzeRequest.
                            // However, analyze_selection endpoint checks:
                            // image_data = request.image_data or request.fragment.content
                            // So just putting it in content works.
                        };
                    }
                }
                // If it is already a region, it has content.
            }

            // If it's a region fragment (from ImageViewer), use vision model
            // If it's a region fragment (from ImageViewer), use vision model
            if (fragment.type === "region") {
                modelToUse = visionModel || selectedModel;
                const regionFrag = fragment as RegionFragment;

                console.log("[ThingNode] Processing region fragment for analysis:", regionFrag);

                // If content is empty/missing but we have coordinates, cropping is needed
                // The ImageViewer usually sets content="", so we check that.
                if ((!regionFrag.content || regionFrag.content.length < 100) && thing.content.file_path) {
                    console.log("[ThingNode] Content missing. Fetching full image for cropping...");
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

                                    console.log(`[ThingNode] Cropping image. Nat: ${img.naturalWidth}x${img.naturalHeight}. Region: ${x},${y},${w},${h}`);

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
                            console.log("[ThingNode] Cropping successful. Content length:", finalFragment.content?.length);
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
                await createNodeAndLink(result.result, fragment);
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
            console.log("[ThingNode] Starting analysis...");
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

            console.log("[ThingNode] Analysis result:", !!result);

            if (result && result.result) {
                await createNodeAndLink(result.result, fullThingFragment);
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
        // Lazy load things
        const allThings = useCanvasStore.getState().things;
        setAvailableTargets(allThings.filter(t => t.id !== thing.id));
        setLinkDialogOpen(true);
    }, [thing.id]);

    // Link Type Dialog State
    const [linkTypeDialogOpen, setLinkTypeDialogOpen] = React.useState(false);
    const [selectedTargetId, setSelectedTargetId] = React.useState<string | null>(null);

    // Handle selecting a target for the link
    const handleLinkToTarget = React.useCallback((targetId: string) => {
        if (!pendingFragment) return;

        // Store target and open type dialog instead of creating immediately
        setSelectedTargetId(targetId);
        setLinkDialogOpen(false);
        setLinkTypeDialogOpen(true);
    }, [pendingFragment]);

    // Handle actual link creation after type selection
    const handleConfirmLink = React.useCallback(async (type: LinkType, label?: string) => {
        if (!pendingFragment || !selectedTargetId) return;

        await addLink(
            thing.id,
            selectedTargetId,
            type,
            label, // Pass selected label (may be empty/undefined)
            getFragmentData(pendingFragment),
            undefined
        );

        setLinkTypeDialogOpen(false);
        setPendingFragment(null);
        setSelectedTargetId(null);
    }, [thing.id, pendingFragment, selectedTargetId, addLink]);

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

    // Helper to get default summary from content
    const getDefaultSummary = () => {
        const c = thing.content;
        if (typeof c.summary === "string") return c.summary;
        if (typeof c.text === "string") return c.text.slice(0, 50) + "...";
        if (typeof c.content === "string") return c.content.slice(0, 50) + "...";
        return thing.type;
    };

    // Helper to get content preview
    const getContentPreview = () => {
        const c = thing.content;
        if (typeof c.text === "string") return c.text.slice(0, 150) + "...";
        if (typeof c.content === "string") return c.content.slice(0, 150) + "...";
        return "";
    };

    // Render full content based on type using appropriate viewer
    // All viewers are wrapped with SelectableContent for selection toolbar
    const renderFullContent = () => {
        const content = thing.content;
        const filename = content.filename as string | undefined;

        switch (thing.type) {
            case "text":
                return (
                    <SelectableContent thingId={thing.id}>
                        <div className="flex flex-col h-full overflow-hidden">
                            {/* Thinking Block */}
                            {hasThinking && isThinkingVisible && (
                                <div className="flex-none mb-3 p-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-md border border-amber-100 dark:border-amber-900/30 text-sm text-slate-600 dark:text-slate-400 italic overflow-y-auto max-h-[150px]">
                                    <div className="flex items-center gap-2 font-semibold text-xs mb-1 not-italic text-amber-600 dark:text-amber-500 opacity-80">
                                        <BrainCircuit className="w-3 h-3" />
                                        Thinking Process
                                    </div>
                                    <MarkdownViewer content={thinkingContent || ""} className="text-sm prose-sm dark:prose-invert leading-relaxed" />
                                </div>
                            )}

                            {/* Main Content */}
                            <div className="flex-1 min-h-0 overflow-y-auto">
                                <TextViewer
                                    content={cleanContent || (content.text as string) || ""} // Fallback
                                    className="h-full"
                                    highlight={highlight}
                                />
                            </div>
                        </div>
                    </SelectableContent>
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
                            <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Processing Document...
                                    </p>
                                    <div className="w-48 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 transition-all duration-500 ease-out"
                                            style={{ width: `${ingestionProgress?.percent || 0}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {ingestionProgress ? `${ingestionProgress.current} / ${ingestionProgress.total} chunks` : "Initializing..."}
                                    </p>
                                </div>
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
                                    onSelect={handleRegionCreate}
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
                                onSelect={() => { }} // Optional: Can implement selection if needed
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
                        />
                    </SelectableContent>
                );

            case "image":
                return (
                    <SelectableContent thingId={thing.id} onSelectionChange={setHasInnerSelection}>
                        <ImageViewer
                            src={content.file_path as string}
                            alt={content.alt_text as string || "Image"}
                            className={cn(thing.height ? "h-full" : "max-h-[200px]")}
                            overlays={imageOverlays}
                            onOverlayResize={handleOverlayResize}
                            onSelect={handleRegionCreate} // Drawing creates a region
                            onOverlayDelete={handleOverlayDelete}
                            onOverlayClick={(overlay, e?: React.MouseEvent) => {
                                // When a region/overlay is clicked, we might want to open the toolbox
                                // The ImageViewer manages visual selection ("active" state)
                                // We need to tell the global SelectionContext about it
                                // Construct a fragment from the overlay
                                const fragment: RegionFragment = {
                                    id: overlay.id,
                                    type: "region",
                                    x: overlay.x,
                                    y: overlay.y,
                                    width: overlay.width,
                                    height: overlay.height,
                                    // If we stored content in the region, use it, otherwise might need to fetch/crop again?
                                    // For now, assume it's attached or we don't strictly need base64 for just showing toolbox options unless action taken.
                                    content: (overlay as any).content || ""
                                };

                                // Calculate position for toolbar (absolute screen coords or relative?)
                                // SelectionContext usually expects clientX/Y for fixed positioning or canvas coords?
                                // Let's pass the mouse event coordinates if available.
                                const position = e ? { x: e.clientX, y: e.clientY } : undefined;

                                setSelection(thing.id, fragment, position);
                            }}
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
                                console.log("[ThingNode] Slideshow Overlay Clicked", fragment.id);
                                setSelection(thing.id, fragment, position);
                            }}
                        />
                    </SelectableContent>
                );

            case "url":
                return (
                    <a
                        href={content.url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                    >
                        {content.url as string}
                    </a>
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
        switch (zoomLevel) {
            case "domain":
                // Just icon
                return null;

            case "summary":
                // Icon + one-line summary
                return (
                    <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {thing.summaries?.["0.3"] ||
                            thing.title ||
                            getDefaultSummary()}
                    </div>
                );

            case "preview":
                // Title + preview
                return (
                    <div className="space-y-1">
                        <div className="font-medium text-sm truncate">
                            {thing.title || getDefaultTitle()}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                            {thing.summaries?.["0.5"] ||
                                getContentPreview()}
                        </div>
                    </div>
                );

            case "full":
            default:
                // Full content
                // Full content
                return (
                    <div className="flex flex-col h-full gap-2">
                        <div className="font-medium text-sm flex-none">
                            {thing.title || getDefaultTitle()}
                        </div>
                        <div className="text-sm flex-1 min-h-0">
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
        return (
            <div
                className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center relative",
                    "bg-white dark:bg-slate-800 border-2 shadow-md",
                    "transition-all duration-200 cursor-pointer",
                    (isSelected || selected)
                        ? `${colorTheme.borderSelected} ring-2 ring-offset-1 shadow-lg`
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                )}
                title={thing.title || getDefaultTitle()}
                onDoubleClick={handleDoubleClick}
            >
                {/* Main type icon - colored by type */}
                <Icon className={cn("h-6 w-6", colorTheme.iconColor)} />

                {/* Restore button - shown when selected */}
                {(isSelected || selected) && onToggleIconify && (
                    <button
                        onClick={handleToggleIconify}
                        className={cn(
                            "absolute -top-2 -right-2 w-5 h-5 rounded-full text-white",
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
            </div>
        );
    }

    // Render based on zoom level
    if (zoomLevel === "domain") {
        // Minimal: just colored circle with icon
        return (
            <div
                className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    "bg-white dark:bg-slate-800 border-2",
                    isSelected
                        ? `${colorTheme.borderSelected} shadow-lg`
                        : "border-slate-200 dark:border-slate-700"
                )}
            >
                <Icon className={cn("h-4 w-4", colorTheme.iconColor)} />
                <Handle type="target" position={Position.Left} className="opacity-0" />
                <Handle type="source" position={Position.Right} className="opacity-0" />
            </div>
        );
    }

    // Card view for other zoom levels
    const minWidth = zoomLevel === "summary" ? 150 : zoomLevel === "preview" ? 200 : 280;

    return (
        <>
            {/* Resize handles when selected */}
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
            {/* Agent Builder-style container */}
            <div
                className={cn(
                    "rounded-lg border-2 bg-white dark:bg-slate-900 shadow-md",
                    "transition-all duration-200 overflow-hidden",
                    (isSelected || selected)
                        ? `${colorTheme.borderSelected} ring-2 ring-offset-1 shadow-lg`
                        : "border-slate-200 dark:border-slate-700",
                    thing.type === "conversation" && "cursor-pointer hover:shadow-lg"
                )}
                onDoubleClick={handleDoubleClick}
                title={thing.type === "conversation" ? "Double-click to open in chat" : undefined}
                style={{
                    minWidth,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
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
                            disableHighlight={true}
                        />,
                        document.body
                    )
                }

                <div ref={nodeRef} className="absolute inset-0 pointer-events-none" />
                {/* Gradient header - Agent Builder style */}
                <div className={cn(
                    "flex items-center gap-2 px-3 py-2 border-b rounded-t-lg",
                    colorTheme.headerBg,
                    colorTheme.headerBgDark
                )}>
                    <Icon className={cn("h-4 w-4 flex-shrink-0", colorTheme.iconColor)} />
                    {zoomLevel !== "summary" && (
                        isEditingTitle ? (
                            <Input
                                value={titleInputValue}
                                onChange={(e) => setTitleInputValue(e.target.value)}
                                onBlur={handleTitleSave}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleTitleSave();
                                    e.stopPropagation(); // Prevent canvas hotkeys
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="h-6 py-0 px-1 text-sm font-medium flex-1 min-w-0 bg-white/50 dark:bg-black/50 border-none focus-visible:ring-1"
                                autoFocus
                            />
                        ) : (
                            <span
                                className="text-sm font-medium truncate flex-1 cursor-text hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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

                    {/* Thinking Toggle - Only if thinking content exists */}
                    {hasThinking && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsThinkingVisible(!isThinkingVisible);
                            }}
                            className={cn(
                                "p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0 mr-1",
                                isThinkingVisible ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20" : "text-slate-400 hover:text-amber-500"
                            )}
                            title={isThinkingVisible ? "Hide Thinking Process" : "Show Thinking Process"}
                        >
                            <Lightbulb className={cn("h-4 w-4", isThinkingVisible && "fill-current")} />
                        </button>
                    )}

                    {/* RAG Status Indicator */}
                    {localStatus && localStatus !== "none" && (() => {
                        // Cast content to any to avoid strict type checks if fields are missing in type def
                        const c = thing.content as any;
                        const hasDesc = !!c.description;
                        const hasGenDesc = !!c.generated_description;
                        const isCompleted = localStatus === "completed";
                        const isSlideshow = thing.type === 'slideshow';
                        const isDocument = thing.type === 'document';
                        const isFailed = localStatus === "failed";
                        const isClickable = ((hasDesc || hasGenDesc) || isSlideshow || isDocument) && isCompleted || isFailed;

                        return (
                            <div
                                className={cn("flex items-center", isClickable && "cursor-pointer hover:opacity-80")}
                                title={isFailed ? "Ingestion Failed (Click for logs)" : `Vectorization: ${localStatus}${isClickable ? " (Click to view content)" : ""}`}
                                onClick={(e) => {
                                    if (isClickable) {
                                        e.stopPropagation();

                                        if (isFailed) {
                                            const errorMsg = c.last_error || "Unknown error occurred during ingestion.";
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
                            >
                                {localStatus === "pending" || localStatus === "processing" ? (
                                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                                ) : localStatus === "completed" ? (
                                    <BrainCircuit className="h-4 w-4 text-green-500" />
                                ) : localStatus === "failed" ? (
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                ) : null}
                            </div>
                        );
                    })()}

                    {/* Copy Content Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const textToCopy = typeof thing.content.text === "string" ? thing.content.text :
                                typeof thing.content.content === "string" ? thing.content.content :
                                    JSON.stringify(thing.content, null, 2);

                            navigator.clipboard.writeText(textToCopy);

                            // Visual feedback (temporary checkmark) could be added here with state
                            // For now, simpler consistent button style
                        }}
                        className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0"
                        title="Copy content to clipboard"
                    >
                        <Copy className="h-4 w-4 text-slate-400 hover:text-blue-500" />
                    </button>

                    {/* Iconify button - shown when selected */}
                    {(isSelected || selected) && onToggleIconify && (
                        <button
                            onClick={handleToggleIconify}
                            className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0"
                            title="Reduce to icon"
                        >
                            <Minimize2 className="h-4 w-4 text-slate-500" />
                        </button>
                    )}
                    {/* Delete button - shown when selected */}
                    {(isSelected || selected) && onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(thing.id);
                            }}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex-shrink-0"
                            title="Delete"
                        >
                            <Trash2 className="h-4 w-4 text-red-500" />
                        </button>
                    )}
                </div>

                {/* Body content */}
                {getDisplayContent() && (
                    <div className="px-3 py-3 flex-1 overflow-auto min-h-0 flex flex-col">
                        <div className="h-full relative">
                            {getDisplayContent()}
                        </div>
                    </div>
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
            </div>

            {/* Custom Prompt Dialog */}
            <Dialog open={askDialogOpen} onOpenChange={(open) => !isLoading && setAskDialogOpen(open)}>
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
            </Dialog>

            {/* Link Target Selection Dialog */}
            <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                <DialogContent className="sm:max-w-lg nodrag cursor-default">
                    <DialogHeader>
                        <DialogTitle>Link to another node</DialogTitle>
                        <DialogDescription>
                            Select a node to link this thing to.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>Select target node</Label>
                        <div className="mt-2 space-y-2 max-h-[300px] overflow-auto px-1">
                            {availableTargets.length === 0 ? (
                                <div className="text-sm text-muted-foreground text-center py-4">
                                    No other nodes on canvas to link to
                                </div>
                            ) : (
                                availableTargets.map((target) => (
                                    <Button
                                        key={target.id}
                                        variant="outline"
                                        className="w-full justify-start text-left h-auto py-2 px-3 overflow-hidden"
                                        onClick={() => handleLinkToTarget(target.id)}
                                        title={target.title || target.type} // Tooltip for full name
                                    >
                                        <div className="truncate w-full">
                                            <span className="font-medium">
                                                {target.title || target.type}
                                            </span>
                                        </div>
                                    </Button>
                                ))
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setLinkDialogOpen(false);
                            setPendingFragment(null);
                        }}>
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Cascading Deletion Confirmation Dialog */}
            <Dialog open={deleteRegionDialogOpen} onOpenChange={setDeleteRegionDialogOpen}>
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
            </Dialog>


            {/* Link Type Selection Dialog - Interjected before actual creation */}
            <LinkTypeDialog
                isOpen={linkTypeDialogOpen}
                onClose={() => {
                    setLinkTypeDialogOpen(false);
                    setPendingFragment(null);
                    setSelectedTargetId(null);
                }}
                onConfirm={handleConfirmLink}
                mode="create"
            />

            {/* Content Preview Dialog */}
            <VectorizationPreviewDialog
                open={previewDialogOpen}
                onOpenChange={setPreviewDialogOpen}
                title={previewContent.title}
                content={previewContent.content}
                type={previewContent.type}
            />
        </>
    );
});


