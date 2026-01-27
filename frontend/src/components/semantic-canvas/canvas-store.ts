/**
 * Semantic Canvas Store
 *
 * Zustand store for managing canvas state including things, links, domains,
 * viewport state, and zoom-level rendering.
 *
 * PEP 8 style comments
 */
import { create } from "zustand";
import { API_URL } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

/**
 * Types of things that can exist on the canvas.
 */
export type ThingType =
    | "text"
    | "conversation"
    | "message"
    | "document"
    | "image"
    | "video"
    | "database"
    | "table"
    | "agent_result"
    | "url"
    | "slideshow"
    | "mcp_tool"
    | "archimate_tool"
    | "archimate_element";

/**
 * Types of relationships between things.
 */
export type LinkType =
    | "related"
    | "references"
    | "derived_from"
    | "contains"
    | "proves"
    | "refutes"
    | "prerequisite"
    | "influences"
    | "triggers"
    | "blocks"
    | "supersedes";

/**
 * Status of RAG vectorization.
 */
export type RAGStatus = "none" | "pending" | "processing" | "completed" | "failed";

/**
 * Viewport state for pan/zoom.
 */
export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

/**
 * A thing on the canvas.
 */
export interface CanvasThing {
    id: string;
    canvas_id: string;
    type: ThingType;
    content: Record<string, unknown>;
    position_x: number;
    position_y: number;
    width: number | null;
    height: number | null;
    domain_id: string | null;
    summaries: Record<string, string>;
    title: string | null;
    color: string | null;
    z_index: number;
    collapsed: boolean;
    rag_status: RAGStatus;
    // Iconify feature fields
    iconified: boolean;
    pre_iconify_size: { width: number; height: number } | null;
    created_at: string;
    updated_at: string | null;
}

/**
 * A link between two things.
 */
export interface CanvasLink {
    id: string;
    canvas_id: string;
    source_id: string;
    target_id: string;
    type: LinkType;
    label: string | null;
    description: string | null;
    // Optional fragment references for linking specific content selections
    source_fragment: Record<string, unknown> | null;
    target_fragment: Record<string, unknown> | null;
    target_canvas_id?: string | null;
    target_thing_title?: string | null;
    target_canvas_name?: string | null;
    created_at: string;
}

/**
 * A domain container for grouping things.
 */
export interface Domain {
    id: string;
    canvas_id: string;
    parent_id: string | null;
    name: string;
    description: string | null;
    color: string;
    z_index: number;
    position_x: number;
    position_y: number;
    width: number;
    height: number;
    created_at: string;
    updated_at: string | null;
}

/**
 * Canvas with all contents.
 */
export interface Canvas {
    id: string;
    owner_id: number;
    name: string;
    description: string | null;
    viewport: Viewport;
    things: CanvasThing[];
    links: CanvasLink[];
    domains: Domain[];
    owner_config: Record<string, any> | null;
    created_at: string;
    updated_at: string | null;
}

/**
 * Zoom level categories for semantic rendering.
 */
export type ZoomLevel = "domain" | "label" | "summary" | "preview" | "paragraph" | "full";

/**
 * Determine zoom level category from zoom value.
 */
export function getZoomLevel(zoom: number): ZoomLevel {
    let level: ZoomLevel;
    if (zoom < 0.20) level = "domain";      // Icon
    else if (zoom < 0.35) level = "label";       // 3-5 words
    else if (zoom < 0.55) level = "summary";     // Headline (one_line)
    else if (zoom < 0.80) level = "preview";     // Sentence
    else if (zoom < 1.15) level = "paragraph";   // Short details (2-3 sentences)
    else level = "full";                         // Full Content

    return level;
}

// =============================================================================
// Store State
// =============================================================================

interface CanvasState {
    // Canvas data
    canvasId: string | null;
    canvasName: string;
    things: CanvasThing[];
    links: CanvasLink[];
    domains: Domain[];
    canvasSettings: Record<string, any> | null;

    // Viewport
    viewport: Viewport;
    zoomLevel: ZoomLevel;

    // Selection
    selectedThingIds: string[];
    selectedDomainIds: string[];
    selectionMode: "hand" | "selection";
    setSelectionMode: (mode: "hand" | "selection") => void;

    // Loading states
    isLoading: boolean;
    error: string | null;

    // Selected model for canvas operations
    selectedModel: string | null;
    setSelectedModel: (model: string | null) => void;

    // Selected model for vision operations
    visionModel: string | null;
    setVisionModel: (model: string | null) => void;

    setViewport: (viewport: Viewport) => void;

    // Selection Highlight State
    highlightedFragment: { thingId: string; fragment: any } | null;
    setHighlightedFragment: (highlight: { thingId: string; fragment: any } | null) => void;

    // Actions
    loadCanvas: (canvasId: string) => Promise<void>;
    createCanvas: (name: string) => Promise<string | null>;
    updateViewport: (viewport: Viewport) => void;
    saveViewport: () => Promise<void>;
    updateCanvasSettings: (settings: Record<string, any>) => Promise<void>;

    // Refresh data silently
    refreshThings: () => Promise<void>;

    // Thing actions
    addThing: (
        type: ThingType,
        content: Record<string, unknown>,
        position: { x: number; y: number },
        title?: string,
        width?: number,
        height?: number,
        domainId?: string,
        color?: string,
        scrapeOptions?: Record<string, any>
    ) => Promise<CanvasThing | null>;
    updateThing: (
        thingId: string,
        updates: Partial<CanvasThing>
    ) => Promise<void>;
    syncThing: (thingId: string, serverThing: Partial<CanvasThing>) => void;
    addServerThing: (thing: CanvasThing) => void;
    deleteThing: (thingId: string) => Promise<void>;
    moveThing: (thingId: string, x: number, y: number, width?: number, height?: number) => void;
    moveThings: (updates: { id: string; x: number; y: number; width?: number; height?: number }[]) => void;

    // Link actions
    addLink: (
        sourceId: string,
        targetId: string,
        type: LinkType,
        label?: string,
        description?: string,
        sourceFragment?: Record<string, unknown>,
        targetFragment?: Record<string, unknown>,
        targetCanvasId?: string
    ) => Promise<CanvasLink | null>;
    updateLink: (
        linkId: string,
        updates: Partial<CanvasLink>
    ) => Promise<void>;
    updateThings: (updates: { id: string; updates: Partial<CanvasThing> }[]) => Promise<void>;
    deleteLink: (linkId: string) => Promise<void>;

    // Selection actions
    deleteSelectedNodes: () => Promise<void>;

    // Domain actions
    addDomain: (
        name: string,
        description: string,
        position: { x: number; y: number },
        color?: string,
        parentId?: string | null
    ) => Promise<Domain | null>;
    updateDomain: (
        domainId: string,
        updates: Partial<Domain>
    ) => Promise<void>;
    moveDomain: (
        domainId: string,
        x: number,
        y: number,
        width?: number,
        height?: number
    ) => void;
    deleteDomain: (domainId: string) => Promise<void>;
    getHierarchyDepth: (domainId: string) => number;
    addThingToDomain: (thingId: string, domainId: string) => Promise<void>;
    removeThingFromDomain: (thingId: string) => Promise<void>;
    checkThingInDomain: (thingId: string, x: number, y: number) => string | null;
    checkDomainInDomain: (domainId: string, x: number, y: number) => string | null;

    // Selection
    selectThing: (thingId: string, multi?: boolean) => void;
    selectDomain: (domainId: string, multi?: boolean, recursive?: boolean) => void;
    setSelectedItems: (thingIds: string[], domainIds: string[]) => void;
    clearSelection: () => void;

    // Iconify feature
    toggleIconify: (thingId: string) => Promise<void>;

    // Batch Analysis Action
    analyzeBatch: (thingIds: string[], action: "summarize" | "identify_purpose", model?: string) => Promise<string | null>;

    // Semantic Discovery
    discoverLinks: (thingIds: string[], domainIds: string[]) => Promise<{ links_created: number; domains_updated: number; details: any[] } | null>;

    // Z-Order Management
    reorderItem: (id: string, action: "front" | "back" | "forward" | "backward") => Promise<void>;

    // Smart Analysis Template Execution
    executeAnalysisTemplate: (templateId: string, thingIds: string[], domainIds: string[]) => Promise<any>;

    // Sync Features
    checkSyncStatus: (thingId: string) => Promise<{ status: "synced" | "changed" | "missing_source" | "no_path" | "error"; current_hash?: string; reason?: string }>;
    performSyncUpdate: (thingId: string, file?: File | null, useSourcePath?: boolean) => Promise<boolean | string>;
    syncAllThings: () => Promise<any[]>;

    // Automatic Assignment Helpers
    isContained: (inner: { x: number, y: number, width: number, height: number }, outer: Domain) => boolean;
    findEnclosingDomain: (x: number, y: number, width: number, height: number) => string | null;
    recalculateDomainAssignments: () => Promise<void>;

    // Link Visibility Management
    showLinks: boolean;
    hiddenNodeLinks: string[]; // List of node IDs with hidden links
    toggleShowLinks: () => void;
    toggleNodeLinks: (nodeId: string) => void;


    // External / Cross-Canvas Linking
    // Unified addLink handles this now

    // Transclusion Ghost Mode
    transclusionGhostId: string | null;
    setTransclusionGhostId: (id: string | null) => void;

    // Semantic Zoom Toggle
    semanticZoomEnabled: boolean;
    setSemanticZoomEnabled: (enabled: boolean) => void;

    // Docking / Split View
    dockedThingId: string | null;
    dockPosition: 'left' | 'right' | 'top' | 'bottom' | null;
    setDockedThing: (id: string | null, position: 'left' | 'right' | 'top' | 'bottom' | null) => void;

    // Sidebar / Palette Management
    sidebarCollapsed: boolean;
    toggleSidebarCollapse: () => void;
}

/**
 * Get auth token from localStorage.
 */
function getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useCanvasStore = create<CanvasState>((set, get) => ({
    // Initial state
    canvasId: null,
    canvasName: "My Canvas",
    things: [],
    links: [],
    domains: [],
    canvasSettings: null,
    viewport: { x: 0, y: 0, zoom: 1.0 },
    zoomLevel: "full",
    selectedThingIds: [],
    selectedDomainIds: [],
    selectionMode: "hand", // Default to hand (pan) for better touch/trackpad experience
    setSelectionMode: (mode) => set({ selectionMode: mode }),
    isLoading: false,
    error: null,

    // Transclusion Ghost Mode
    transclusionGhostId: null,
    setTransclusionGhostId: (id) => set({ transclusionGhostId: id }),

    // Semantic Zoom Toggle
    semanticZoomEnabled: false,
    setSemanticZoomEnabled: (enabled) => set({ semanticZoomEnabled: enabled }),

    // Docking / Split View
    dockedThingId: null,
    dockPosition: null,
    setDockedThing: (id, position) => set({ dockedThingId: id, dockPosition: position }),

    // Link Visibility
    showLinks: true,
    hiddenNodeLinks: [],
    toggleShowLinks: () => set(state => ({ showLinks: !state.showLinks })),
    toggleNodeLinks: (nodeId) => set(state => {
        const isHidden = state.hiddenNodeLinks.includes(nodeId);
        return {
            hiddenNodeLinks: isHidden
                ? state.hiddenNodeLinks.filter(id => id !== nodeId)
                : [...state.hiddenNodeLinks, nodeId]
        };
    }),

    // Sidebar / Palette Management
    sidebarCollapsed: false,
    toggleSidebarCollapse: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),

    // Selected model for canvas operations
    selectedModel: null,
    setSelectedModel: (model) => set({ selectedModel: model }),

    // Selected model for vision operations
    visionModel: null,
    setVisionModel: (model) => set({ visionModel: model }),

    setViewport: (viewport) => set({ viewport }),

    // Selection Highlight
    highlightedFragment: null,
    setHighlightedFragment: (highlight) => set({ highlightedFragment: highlight }),

    // Load canvas from backend
    loadCanvas: async (canvasId: string) => {
        const token = getAuthToken();
        if (!token) return;

        set({ isLoading: true, error: null });

        try {
            const res = await fetch(`${API_URL}/canvases/${canvasId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
                throw new Error("Failed to load canvas");
            }

            const canvas: Canvas = await res.json();

            const config = canvas.owner_config || {};

            set({
                canvasId: canvas.id,
                canvasName: canvas.name,
                things: canvas.things,
                links: canvas.links,
                domains: canvas.domains,
                canvasSettings: config,
                selectedModel: config.model || null,
                visionModel: config.vision_model || null,
                viewport: canvas.viewport,
                zoomLevel: getZoomLevel(canvas.viewport.zoom),
                isLoading: false,
            });
        } catch (err) {
            set({
                error: err instanceof Error ? err.message : "Unknown error",
                isLoading: false,
            });
        }
    },

    // Silent refresh for polling
    refreshThings: async () => {
        const { canvasId } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        try {
            const res = await fetch(`${API_URL}/canvases/${canvasId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const canvas: Canvas = await res.json();
                // Only update things and links, keep viewport/selection
                set({
                    things: canvas.things,
                    links: canvas.links,
                    domains: canvas.domains, // sync domains too just in case
                });
            }
        } catch (err) {
            console.error("Failed to refresh canvas:", err);
        }
    },

    // Create new canvas
    createCanvas: async (name: string) => {
        const token = getAuthToken();
        if (!token) return null;

        try {
            const res = await fetch(`${API_URL}/canvases`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name }),
            });

            if (!res.ok) throw new Error("Failed to create canvas");

            const canvas = await res.json();
            set({
                canvasId: canvas.id,
                canvasName: canvas.name,
                things: [],
                links: [],
                domains: [],
                viewport: { x: 0, y: 0, zoom: 1.0 },
                zoomLevel: "full",
            });

            return canvas.id;
        } catch (err) {
            set({ error: err instanceof Error ? err.message : "Unknown error" });
            return null;
        }
    },

    // Update viewport (local + debounced save)
    updateViewport: (viewport: Viewport) => {
        set({
            viewport,
            zoomLevel: getZoomLevel(viewport.zoom),
        });
    },

    // Save viewport to backend
    saveViewport: async () => {
        const { canvasId, viewport } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        try {
            await fetch(`${API_URL}/canvases/${canvasId}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ viewport }),
            });
        } catch (err) {
            console.error("Failed to save viewport:", err);
        }
    },

    // Update canvas settings
    updateCanvasSettings: async (settings) => {
        const { canvasId, canvasSettings } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        // Merge with existing settings for local optimistic update
        const newSettings = { ...(canvasSettings || {}), ...settings };
        set({ canvasSettings: newSettings });

        try {
            await fetch(`${API_URL}/canvases/${canvasId}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ owner_config: settings }), // Backend handles merging too, but we could send newSettings to be safe
            });
        } catch (err) {
            console.error("Failed to save canvas settings:", err);
            // Revert on error? Complex to revert partial merge, skipping for now.
        }
    },

    // Check if a box is contained in another box
    isContained: (inner: { x: number, y: number, width: number, height: number }, outer: Domain) => {
        const outerRight = outer.position_x + outer.width;
        const outerBottom = outer.position_y + outer.height;
        const innerRight = inner.x + inner.width;
        const innerBottom = inner.y + inner.height;

        return (
            inner.x >= outer.position_x &&
            inner.y >= outer.position_y &&
            innerRight <= outerRight &&
            innerBottom <= outerBottom
        );
    },

    // Find the best matching domain for a thing (Top-most Z-index that fully contains it)
    findEnclosingDomain: (x: number, y: number, width: number, height: number): string | null => {
        const { domains } = get();
        // Filter to only fully containing domains
        const candidates = domains.filter(d =>
            get().isContained({ x, y, width, height }, d)
        );

        if (candidates.length === 0) return null;

        // Sort by Z-Index descending (Top Most first)
        // Note: Domains usually have negative Z, but logic holds: higher is closer to 0 (top)
        candidates.sort((a, b) => b.z_index - a.z_index);

        return candidates[0].id;
    },

    // Recalculate domain assignments for ALL things (triggered on domain changes)
    recalculateDomainAssignments: async () => {
        const { things } = get();
        const updates: { id: string; updates: { domain_id: string | null } }[] = [];

        for (const thing of things) {
            const w = thing.width || 400;
            const h = thing.height || 300;

            const newDomainId = get().findEnclosingDomain(thing.position_x, thing.position_y, w, h);
            const current = thing.domain_id || null;
            const next = newDomainId || null;

            if (current !== next) {
                updates.push({ id: thing.id, updates: { domain_id: next } });
            }
        }

        if (updates.length > 0) {
            await get().updateThings(updates);
        }
    },

    // Add thing to canvas
    addThing: async (type, content, position, title, width, height, domainId, color, scrapeOptions) => {
        const { canvasId } = get();
        const token = getAuthToken();
        if (!token || !canvasId) {
            console.error("[Store] Missing token or canvasId");
            return null;
        }

        // Automatic Domain Assignment if not specified
        let finalDomainId = domainId;
        if (!finalDomainId) {
            const w = width ?? 400;
            const h = height ?? 400;
            finalDomainId = get().findEnclosingDomain(position.x, position.y, w, h) || undefined;
            if (finalDomainId) {
            }
        }

        try {
            const payload = {
                type,
                content: typeof content === 'object' ? {
                    ...content,
                    page_number: content.pageNumber,
                    start_offset: content.startOffset,
                    end_offset: content.endOffset,
                    message_id: content.messageId
                } : content,
                position: { x: position.x, y: position.y },
                size: { width: width ?? 400, height: height ?? 400 },
                title,
                color,
                domain_id: finalDomainId,
                scrape_options: scrapeOptions,
            };
            const res = await fetch(`${API_URL}/canvases/${canvasId}/things`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const errorText = await res.text();
                console.error(`[Store] Failed to add thing: ${res.status} ${errorText}`);
                throw new Error("Failed to add thing");
            }

            const thing: CanvasThing = await res.json();
            set({ things: [...get().things, thing] });
            return thing;
        } catch (err) {
            console.error("Failed to add thing:", err);
            return null;
        }
    },

    updateThing: async (thingId, updates) => {
        const { canvasId } = get();
        const token = localStorage.getItem("token"); // Direct access to be sure

        if (!token) {
            console.error("[Store] No auth token found in localStorage for updateThing");
            return;
        }
        if (!canvasId) {
            console.error("[Store] No canvasId for updateThing");
            return;
        }

        // Optimistic update
        const currentThings = get().things;
        // Check for domain re-assignment if position/size changed
        let newDomainId: string | undefined | null = updates.domain_id;

        // If position/size are being updated, we must re-evaluate domain containment automatically
        // UNLESS domain_id is explicitly being set (e.g. manual drop)
        if (updates.domain_id === undefined &&
            (updates.position_x !== undefined || updates.position_y !== undefined || updates.width !== undefined || updates.height !== undefined)) {

            const target = currentThings.find(t => t.id === thingId);
            if (target) {
                const x = updates.position_x ?? target.position_x;
                const y = updates.position_y ?? target.position_y;
                const w = updates.width ?? target.width ?? 400;
                const h = updates.height ?? target.height ?? 300; // Use reasonable default if null

                const autoDomain = get().findEnclosingDomain(x, y, w, h);

                // If assignment changed, include it in updates (null means removed from domain)
                if (autoDomain !== target.domain_id) {
                    newDomainId = autoDomain;
                }
            }
        }

        const optimisticThings = currentThings.map((t) => {
            if (t.id === thingId) {
                return {
                    ...t,
                    ...updates,
                    domain_id: newDomainId !== undefined ? newDomainId : t.domain_id,
                    // Preserve existing values if not updated
                    content: updates.content || t.content,
                    position_x: updates.position_x ?? t.position_x,
                    position_y: updates.position_y ?? t.position_y,
                    width: updates.width ?? t.width,
                    height: updates.height ?? t.height,
                    title: updates.title ?? t.title,
                    color: updates.color ?? t.color,
                    collapsed: updates.collapsed ?? t.collapsed,
                    iconified: updates.iconified ?? t.iconified,
                    pre_iconify_size: updates.pre_iconify_size ?? t.pre_iconify_size,
                };
            }
            return t;
        });
        set({ things: optimisticThings });

        try {
            const res = await fetch(
                `${API_URL}/canvases/${canvasId}/things/${thingId}`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        content: updates.content,
                        position: updates.position_x !== undefined
                            ? { x: updates.position_x, y: updates.position_y }
                            : undefined,
                        size: updates.width !== undefined
                            ? { width: updates.width, height: updates.height }
                            : undefined,
                        title: updates.title,
                        color: updates.color,
                        collapsed: updates.collapsed,
                        iconified: updates.iconified,
                        pre_iconify_size: updates.pre_iconify_size,
                        domain_id: newDomainId // Include auto-calculated domain
                    }),
                }
            );

            if (!res.ok) {
                const errText = await res.text();
                console.error("Update failed:", res.status, errText);
                // Revert on failure
                set({ things: currentThings });
                throw new Error(`Failed to update thing: ${res.status} ${errText}`);
            }

            const serverUpdated: CanvasThing = await res.json();

            // confirm update with server response (handles side effects)
            const oldThings = get().things;
            const newThings = oldThings.map((t) => {
                if (t.id === thingId) {
                    return { ...t, ...serverUpdated };
                }
                return t;
            });
            set({ things: newThings });

            // Dispatch potential conversation update event for UI sync
            if (updates.title && serverUpdated.type === "conversation") {
                // We dispatch the event with the THING ID. The listener should resolve the Conversation ID if needed, 
                // but usually for our app the thing ID effectively maps or we can just refresh the list.
                // However, the side-bar list uses CONVERSATION IDs.
                // The thing content contains { conversation_id: "..." }.
                const convId = serverUpdated.content?.conversation_id;
                if (convId) {
                    window.dispatchEvent(new CustomEvent("conversation-updated", { detail: { id: convId } }));
                }
            }
        } catch (err) {
            console.error("Failed to update thing:", err);
            // Revert on error
            set({ things: currentThings });
        }
    },

    // Sync thing from server (local update only, no patch)
    syncThing: (thingId: string, serverThing: Partial<CanvasThing>) => {
        set({
            things: get().things.map((t) =>
                t.id === thingId ? { ...t, ...serverThing } : t
            ),
        });
    },

    // Add thing from server (already created)
    addServerThing: (thing: CanvasThing) => {
        set({
            things: [...get().things, thing]
        });
    },

    // Delete thing
    deleteThing: async (thingId) => {
        const { canvasId, things, links } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        try {
            await fetch(`${API_URL}/canvases/${canvasId}/things/${thingId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            // Remove thing and its links
            set({
                things: things.filter((t) => t.id !== thingId),
                links: links.filter(
                    (l) => l.source_id !== thingId && l.target_id !== thingId
                ),
            });
        } catch (err) {
            console.error("Failed to delete thing:", err);
        }
    },

    // Move thing (local update, batch save on drag end)
    moveThing: (thingId, x, y, width, height) => {
        set({
            things: get().things.map((t) =>
                t.id === thingId
                    ? {
                        ...t,
                        position_x: x,
                        position_y: y,
                        width: width ?? t.width,
                        height: height ?? t.height,
                    }
                    : t
            ),
        });
    },
    // Batch move things (atomic local update)
    moveThings: (updates) => {
        const updateMap = new Map(updates.map(u => [u.id, u]));
        set({
            things: get().things.map((t) => {
                const update = updateMap.get(t.id);
                if (update) {
                    return {
                        ...t,
                        position_x: update.x,
                        position_y: update.y,
                        width: update.width ?? t.width,
                        height: update.height ?? t.height,
                    };
                }
                return t;
            }),
        });
    },

    // Batch update things (Atomic Optimistic + Parallel API)
    updateThings: async (updates) => {
        const { canvasId, things } = get();
        const token = localStorage.getItem("token");
        if (!token || !canvasId) return;

        // 1. Atomic Optimistic Update
        const updatesMap = new Map(updates.map(u => [u.id, u.updates]));

        const newThings = things.map(t => {
            const update = updatesMap.get(t.id);
            if (update) {
                return {
                    ...t,
                    ...update,
                    // Ensure nested objects if any are merged correctly? 
                    // for now simple shallow merge of properties matches updateThing logic
                };
            }
            return t;
        });

        set({ things: newThings });

        // 2. Parallel API Calls
        // We do not await individual updateThing calls to avoid N sets.
        // We construct fetches manually.
        try {
            await Promise.all(updates.map(async ({ id, updates }) => {
                const res = await fetch(
                    `${API_URL}/canvases/${canvasId}/things/${id}`,
                    {
                        method: "PATCH",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            // Map internal keys to API keys if needed
                            content: updates.content,
                            position: (updates.position_x !== undefined || updates.position_y !== undefined)
                                ? {
                                    x: updates.position_x,
                                    y: updates.position_y
                                }
                                : undefined,
                            size: (updates.width !== undefined || updates.height !== undefined)
                                ? {
                                    width: updates.width,
                                    height: updates.height
                                }
                                : undefined,
                            title: updates.title,
                            color: updates.color,
                            collapsed: updates.collapsed,
                            iconified: updates.iconified,
                            domain_id: updates.domain_id // Allow domain_id update
                        }),
                    }
                );

                if (!res.ok) {
                    console.error(`Failed to update thing ${id}:`, await res.text());
                    // We rely on refreshThings() or subsequent updates to fix sync if this fails.
                    // Doing a partial revert for batch is complex.
                }
            }));
        } catch (error) {
            console.error("Batch update failed:", error);
            // Verify state with server?
            get().refreshThings();
        }
    },

    // Add link between things
    addLink: async (sourceId, targetId, type, label, description, sourceFragment, targetFragment, targetCanvasId) => {
        const { canvasId } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return null;

        try {
            const res = await fetch(`${API_URL}/canvases/${canvasId}/links`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    source_id: sourceId,
                    target_id: targetId,
                    type,
                    label,
                    description,
                    source_fragment: sourceFragment,
                    target_fragment: targetFragment,
                    target_canvas_id: targetCanvasId,
                }),
            });

            if (!res.ok) throw new Error("Failed to add link");

            const link: CanvasLink = await res.json();
            set({ links: [...get().links, link] });
            return link;
        } catch (err) {
            console.error("Failed to add link:", err);
            return null;
        }
    },

    // Delete link
    deleteLink: async (linkId) => {
        const { canvasId, links } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        try {
            await fetch(`${API_URL}/canvases/${canvasId}/links/${linkId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            set({ links: links.filter((l) => l.id !== linkId) });
        } catch (err) {
            console.error("Failed to delete link:", err);
        }
    },

    // Update link
    updateLink: async (linkId, updates) => {
        const { canvasId, links } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        try {
            const res = await fetch(`${API_URL}/canvases/${canvasId}/links/${linkId}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    type: updates.type,
                    label: updates.label,
                    description: updates.description,
                    source_fragment: updates.source_fragment,
                    target_fragment: updates.target_fragment
                }),
            });

            if (!res.ok) throw new Error("Failed to update link");
            const updatedLink: CanvasLink = await res.json();

            set({
                links: links.map((l) => (l.id === linkId ? updatedLink : l)),
            });
        } catch (err) {
            console.error("Failed to update link:", err);
        }
    },

    // Add domain
    addDomain: async (name, description, position, color = "#6366f1", parentId = null) => {
        const { canvasId } = get();
        const token = getAuthToken();
        if (!token) {
            console.error("[addDomain] No auth token available");
            return null;
        }
        if (!canvasId) {
            console.error("[addDomain] No canvasId available");
            return null;
        }

        try {
            const url = `${API_URL}/canvases/${canvasId}/domains`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, description, position, color, parent_id: parentId }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                console.error("[addDomain] Error response:", errorText);
                throw new Error(`Failed to add domain: ${res.status} ${errorText}`);
            }

            const domain: Domain = await res.json();
            set({ domains: [...get().domains, domain] });

            // Trigger batch update for things inside this new domain
            get().recalculateDomainAssignments();

            return domain;
        } catch (err) {
            console.error("[addDomain] Failed:", err);
            return null;
        }
    },



    // Update domain (persist to backend)
    updateDomain: async (domainId, updates) => {
        const { canvasId, domains } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        // 1. Optimistic Update
        const previousDomains = domains;
        const optimisticDomains = domains.map((d) =>
            d.id === domainId
                ? {
                    ...d,
                    ...updates,
                    // ... (rest properties) ...
                    position_x: updates.position_x !== undefined ? updates.position_x : d.position_x,
                    position_y: updates.position_y !== undefined ? updates.position_y : d.position_y,
                    width: updates.width !== undefined ? updates.width : d.width,
                    height: updates.height !== undefined ? updates.height : d.height,
                    name: updates.name !== undefined ? updates.name : d.name,
                    description: updates.description !== undefined ? updates.description : d.description,
                    color: updates.color !== undefined ? updates.color : d.color,
                    // FIX: Include parent_id in optimistic update for hierarchy support
                    parent_id: updates.parent_id !== undefined ? updates.parent_id : d.parent_id,
                }
                : d
        );
        set({ domains: optimisticDomains });

        // Trigger batch update (Spatial changes might affect assignments)
        if (updates.position_x !== undefined || updates.position_y !== undefined || updates.width !== undefined || updates.height !== undefined) {
            get().recalculateDomainAssignments();
        }

        try {
            const res = await fetch(
                `${API_URL}/canvases/${canvasId}/domains/${domainId}`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        position: updates.position_x !== undefined
                            ? { x: updates.position_x, y: updates.position_y }
                            : undefined,
                        name: updates.name,
                        description: updates.description,
                        color: updates.color,
                        width: updates.width,
                        height: updates.height,
                        // FIX: Include parent_id in API call for hierarchy persistence
                        parent_id: updates.parent_id,
                    }),
                }
            );

            if (!res.ok) throw new Error("Failed to update domain");

            const updated: Domain = await res.json();
            // 2. Confirm Update (Replace with server version)
            set({
                domains: get().domains.map((d) => (d.id === domainId ? updated : d)),
            });
        } catch (err) {
            console.error("Failed to update domain:", err);
            // 3. Revert on Error
            set({ domains: previousDomains });
        }
    },

    // Move domain (local update - call updateDomain after drag ends)
    moveDomain: (domainId, x, y, width, height) => {
        set({
            domains: get().domains.map((d) =>
                d.id === domainId
                    ? {
                        ...d,
                        position_x: x,
                        position_y: y,
                        width: width ?? d.width,
                        height: height ?? d.height,
                    }
                    : d
            ),
        });
    },

    // Check if a position is inside any domain, return domain ID or null
    checkThingInDomain: (thingId, x, y) => {
        const { domains } = get();
        for (const domain of domains) {
            if (
                x >= domain.position_x &&
                x <= domain.position_x + (domain.width || 300) &&
                y >= domain.position_y - 40 &&
                y <= domain.position_y + (domain.height || 200)
            ) {
                return domain.id;
            }
        }
        return null;
    },

    // Check if a domain is inside another domain, return parent domain ID or null
    // Excludes self, current parent, and descendants to prevent circular references
    // Returns the INNERMOST (deepest) domain that contains the point
    checkDomainInDomain: (domainId: string, x: number, y: number) => {
        const { domains } = get();
        const draggedDomain = domains.find(d => d.id === domainId);
        if (!draggedDomain) return null;

        // Get all descendant IDs to prevent circular nesting
        const getDescendantIds = (parentId: string): string[] => {
            const children = domains.filter(d => d.parent_id === parentId);
            return children.flatMap(c => [c.id, ...getDescendantIds(c.id)]);
        };
        const descendantIds = getDescendantIds(domainId);

        // Helper to get depth of a domain
        const getDepth = (dId: string): number => {
            let depth = 0;
            let current = domains.find(d => d.id === dId);
            while (current && current.parent_id) {
                depth++;
                current = domains.find(d => d.id === current!.parent_id);
                if (depth > 100) break;
            }
            return depth;
        };

        // Find ALL containing domains (not just first)
        const containingDomains: Array<{ id: string; depth: number }> = [];

        for (const domain of domains) {
            // Skip self, descendants, and current parent
            if (domain.id === domainId) continue;
            if (descendantIds.includes(domain.id)) continue;
            if (domain.id === draggedDomain.parent_id) continue;

            // Check if center of dragged domain is inside this domain
            if (
                x >= domain.position_x &&
                x <= domain.position_x + (domain.width || 300) &&
                y >= domain.position_y - 40 &&
                y <= domain.position_y + (domain.height || 200)
            ) {
                containingDomains.push({ id: domain.id, depth: getDepth(domain.id) });
            }
        }

        // Return the innermost (deepest) domain
        if (containingDomains.length === 0) return null;
        containingDomains.sort((a, b) => b.depth - a.depth);
        return containingDomains[0].id;
    },

    // Delete domain
    deleteDomain: async (domainId) => {
        const { canvasId, domains, things } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        try {
            await fetch(`${API_URL}/canvases/${canvasId}/domains/${domainId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            // Remove domain locally
            set({
                domains: domains.filter((d) => d.id !== domainId),
                // Don't manually un-group; let recalculate handle it (finding parent or null)
            });

            // Re-calculate assignments (Things in deleted domain fall to parent or nothing)
            get().recalculateDomainAssignments();

        } catch (err) {
            console.error("Failed to delete domain:", err);
        }
    },

    // Get hierarchy depth for a domain (0 = root, 1 = child of root, etc.)
    getHierarchyDepth: (domainId: string) => {
        const { domains } = get();
        let depth = 0;
        let current = domains.find(d => d.id === domainId);

        // Walk up the parent chain
        while (current && current.parent_id) {
            depth++;
            current = domains.find(d => d.id === current!.parent_id);
            // Safety: prevent infinite loops
            if (depth > 100) break;
        }

        return depth;
    },

    // Add thing to domain
    addThingToDomain: async (thingId, domainId) => {
        const { canvasId, things } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        try {
            await fetch(`${API_URL}/canvases/${canvasId}/things/${thingId}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ domain_id: domainId }),
            });

            set({
                things: things.map((t) =>
                    t.id === thingId ? { ...t, domain_id: domainId } : t
                ),
            });
        } catch (err) {
            console.error("Failed to add thing to domain:", err);
        }
    },

    // Remove thing from domain
    removeThingFromDomain: async (thingId) => {
        get().updateThing(thingId, { domain_id: null });
    },

    // Selection Handling
    selectThing: (thingId, multi = false) => {
        const { selectedThingIds } = get();
        if (multi) {
            // Toggle
            if (selectedThingIds.includes(thingId)) {
                set({ selectedThingIds: selectedThingIds.filter((id) => id !== thingId) });
            } else {
                set({ selectedThingIds: [...selectedThingIds, thingId] });
            }
        } else {
            // Exclusive
            set({ selectedThingIds: [thingId], selectedDomainIds: [] });
        }
    },

    selectDomain: (domainId, multi = false, recursive = true) => {
        const { selectedDomainIds, things, selectedThingIds } = get();
        let newSelectedDomainIds = [];
        let newSelectedThingIds = multi ? [...selectedThingIds] : [];

        if (multi) {
            if (selectedDomainIds.includes(domainId)) {
                newSelectedDomainIds = selectedDomainIds.filter(id => id !== domainId);
            } else {
                newSelectedDomainIds = [...selectedDomainIds, domainId];
            }
        } else {
            newSelectedDomainIds = [domainId];
        }

        // Recursive selection
        if (recursive && (multi ? !selectedDomainIds.includes(domainId) : true)) {
            const thingsInDomain = things.filter((t) => t.domain_id === domainId);
            const thingsIds = thingsInDomain.map((t) => t.id);
            // Add unique things
            newSelectedThingIds = [...new Set([...newSelectedThingIds, ...thingsIds])];
        }

        set({
            selectedDomainIds: newSelectedDomainIds,
            selectedThingIds: newSelectedThingIds,
        });
    },

    setSelectedItems: (thingIds, domainIds) => {
        set({ selectedThingIds: thingIds, selectedDomainIds: domainIds });
    },

    // Clear selection
    clearSelection: () => {
        set({ selectedThingIds: [], selectedDomainIds: [] });
    },

    // Delete selected nodes
    deleteSelectedNodes: async () => {
        const { canvasId, selectedThingIds, selectedDomainIds } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        if (selectedThingIds.length === 0 && selectedDomainIds.length === 0) return;

        // Optimistic update: Remove from local state immediately
        const { things, domains } = get();

        set({
            things: things.filter(t => !selectedThingIds.includes(t.id)),
            domains: domains.filter(d => !selectedDomainIds.includes(d.id)),
            // Also need to clean up links connected to deleted things? 
            // The backend handles cascade, but frontend might have stale links.
            // Let's filter links too.
            links: get().links.filter(l =>
                !selectedThingIds.includes(l.source_id) &&
                !selectedThingIds.includes(l.target_id)
            ),
            selectedThingIds: [],
            selectedDomainIds: [],
            isLoading: true
        });

        try {
            const res = await fetch(`${API_URL}/canvases/${canvasId}/bulk-delete`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    thing_ids: selectedThingIds,
                    domain_ids: selectedDomainIds
                }),
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err);
            }

            // Success - maybe refresh to ensure sync? 
            // Or trust optimistic update.
            // Let's trust optimistic for smoothness, but set loading false.
            set({ isLoading: false });

        } catch (e) {
            console.error("Bulk delete failed", e);
            // Revert state? Ideally yes, but for now just show error and refresh
            set({ error: "Failed to delete items", isLoading: false });
            get().loadCanvas(canvasId); // Reload to restore state
        }
    },

    // Batch Analysis
    analyzeBatch: async (thingIds: string[], action: "summarize" | "identify_purpose", model?: string) => {
        const { canvasId } = get();
        const token = getAuthToken();
        if (!token || !canvasId || thingIds.length === 0) return null;

        try {
            const response = await fetch(`${API_URL}/canvases/${canvasId}/analyze-batch`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    thing_ids: thingIds,
                    action: action,
                    model: model
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error("Batch analysis failed:", errText);
                return null;
            }

            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error("Batch analysis error:", error);
            return null;
        }
    },

    // Iconify feature - toggle thing between full and icon mode
    toggleIconify: async (thingId) => {
        const { canvasId, things } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        const thing = things.find((t) => t.id === thingId);
        if (!thing) return;

        const newIconified = !thing.iconified;
        let updates: Partial<CanvasThing> = { iconified: newIconified };

        if (newIconified) {
            updates = {
                ...updates,
                pre_iconify_size: { width: thing.width || 400, height: thing.height || 300 },
                width: 100,
                height: 100,
            };
        } else {
            if (thing.pre_iconify_size) {
                updates = {
                    ...updates,
                    width: thing.pre_iconify_size.width,
                    height: thing.pre_iconify_size.height,
                };
            } else {
                updates = { ...updates, width: 400, height: 300 };
            }
        }

        await get().updateThing(thingId, updates);
    },

    // Semantic Discovery
    discoverLinks: async (thingIds: string[], domainIds: string[]) => {
        const { canvasId } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return;

        set({ isLoading: true });

        try {
            const res = await fetch(
                `${API_URL}/canvases/${canvasId}/discover-links`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        thing_ids: thingIds,
                        domain_ids: domainIds,
                        model: get().selectedModel
                    }),
                }
            );

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err);
            }

            const data = await res.json(); // DiscoverLinksResponse

            // Refresh links from server if any created
            if (data.links_created > 0) {
                get().loadCanvas(canvasId);
            }

            set({ isLoading: false });
            return data;
        } catch (e) {
            console.error("Discover Links failed", e);
            set({ isLoading: false, error: e instanceof Error ? e.message : String(e) });
            return null;
        }
    },

    // Execute Smart Analysis Template
    executeAnalysisTemplate: async (templateId: string, thingIds: string[], domainIds: string[]) => {
        const { canvasId, things, selectedModel, visionModel } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return null;

        set({ isLoading: true });

        // Determine Model (LLM vs VLM)
        const targetThings = things.filter(t => thingIds.includes(t.id));
        const hasVisual = targetThings.some(t => t.type === "image" || t.type === "video" || t.type === "slideshow");
        const activeModel = hasVisual ? (visionModel || selectedModel) : selectedModel;
        try {
            const res = await fetch(
                `${API_URL}/canvases/${canvasId}/execute-template`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        template_id: templateId,
                        canvas_id: canvasId,
                        thing_ids: thingIds,
                        domain_ids: domainIds,
                        model: activeModel || undefined
                    }),
                }
            );

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Failed to execute template: ${err}`);
            }

            const result = await res.json();
            get().refreshThings();

            set({ isLoading: false });
            return result;

        } catch (e) {
            console.error("Template execution failed", e);
            set({ isLoading: false, error: e instanceof Error ? e.message : String(e) });
            return null;
        }
    },

    // =========================================================================
    // Sync Features
    // =========================================================================

    checkSyncStatus: async (thingId: string) => {
        const { canvasId } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return { status: "error", reason: "No auth/canvas" };

        try {
            const res = await fetch(
                `${API_URL}/canvases/${canvasId}/things/${thingId}/sync/check`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt);
            }
            return await res.json();
        } catch (e) {
            console.error("Sync Check failed", e);
            return { status: "error", reason: e instanceof Error ? e.message : String(e) };
        }
    },

    performSyncUpdate: async (thingId: string, file?: File | null, useSourcePath?: boolean) => {
        const { canvasId } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return false;

        const formData = new FormData();
        if (useSourcePath) {
            formData.append("use_source_path", "true");
        } else if (file) {
            formData.append("file", file);
        } else {
            return false;
        }

        try {
            const res = await fetch(
                `${API_URL}/canvases/${canvasId}/things/${thingId}/sync/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        // Content-Type is auto-set for FormData
                    },
                    body: formData
                }
            );

            if (!res.ok) throw new Error(await res.text());

            const data = await res.json();

            // Optimistic update of status
            if (data.status === "sync_same_content") {
                get().updateThing(thingId, { rag_status: "completed" });
            } else {
                get().updateThing(thingId, { rag_status: "processing" });
            }

            return data.status || true;
        } catch (e) {
            console.error("Sync Update failed", e);
            get().updateThing(thingId, { rag_status: "failed" });
            return false;
        }
    },

    syncAllThings: async () => {
        const { canvasId } = get();
        const token = getAuthToken();
        if (!token || !canvasId) return [];

        try {
            const res = await fetch(
                `${API_URL}/canvases/${canvasId}/sync_all`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            return await res.json();
        } catch (e) {
            console.error("Sync All failed", e);
            return [];
        }
    },

    // Z-Order Management Implementation
    reorderItem: async (id: string, action: "front" | "back" | "forward" | "backward") => {
        const state = get();
        const things = state.things;
        const domains = state.domains;

        let isThing = true;
        let item: CanvasThing | Domain | undefined = things.find((t) => t.id === id);

        if (!item) {
            item = domains.find((d) => d.id === id);
            isThing = false;
        }

        if (!item) return; // Item not found

        const currentZ = item.z_index;
        let newZ = currentZ;

        if (isThing) {
            // Logic for Things (z >= 0)
            const allZ = things.map(t => t.z_index).sort((a, b) => a - b);
            const maxZ = allZ.length > 0 ? allZ[allZ.length - 1] : 0;
            const minZ = allZ.length > 0 ? allZ[0] : 0; // But strictly >= 0

            if (action === "front") {
                newZ = maxZ + 1;
            } else if (action === "back") {
                // Send to back of stack, but >= 0.
                // We shift everything else up? Or just set to 0 and shift others?
                // Simplest strategy: Set to 0. If collision, we might need to re-normalize all things?
                // Or: Set to minZ - 1. But clamp at 0?
                // If minZ is 5, we can use 4.
                // If minZ is 0, we can use -1 INVALID.
                // Correction: Z-Index for things can be anything >= 0.
                // If strictly >= 0, then "Send to Back" sets to 0.
                // And we must ensure no other thing is < 1?
                // Efficient approach: Set to `minZ - 1`. If `minZ - 1 < 0`, we shift ALL items up by `abs(minZ - 1)`.
                // Or simply float logic: `minZ / 2`.

                if (minZ <= 0) {
                    // Need to shift everyone up to make room at 0?
                    // Or use a very small epsilon? No, floats.
                    // minZ - 1 might be negative.
                    // Let's settle on: Things Z is arbitrary, but conceptually "above domains".
                    // User said "minimum index will always be 0 for things".
                    // So we CANNOT go below 0.
                    // If we are already at 0, we can't go lower.
                    // Unless we re-index everything else to +1.

                    // Implementation: Set newZ = 0.
                    // Then, find all things with z <= 0, and increment them.
                    newZ = 0;
                    // But this requires batch updating others.
                    // Let's stick to simple change first:
                    newZ = 0.0;
                    // Then we trigger a normalization pass if many collisions?
                    // Let's implement simpler: `minZ - 1`. If < 0, set to 0, AND shift all others +1.

                    // Actually, if we just shift all others up, it works.
                } else {
                    newZ = minZ - 1;
                }
            } else if (action === "forward") {
                // Find next neighbor
                const above = allZ.find(z => z > currentZ);
                if (above !== undefined) {
                    newZ = above + 0.1; // Naive insert
                    // Better: average
                    // But easier: `current + 1`. If collision, it renders on top by array order?
                    // Let's swap with neighbor?
                    // Finding the specific item above is better.
                    // For now, `currentZ + 1` is safe enough for sparse usage.
                    newZ = currentZ + 1;
                } else {
                    newZ = currentZ + 1;
                }
            } else if (action === "backward") {
                newZ = Math.max(0, currentZ - 1);
            }

            // Apply Update
            if (newZ !== currentZ) {
                // Check Bounds
                if (newZ < 0) {
                    // Must shift world up
                    const shift = Math.abs(newZ);
                    // Batch update all things z + shift + 1?
                    // For MVP: JUST UPDATE THIS THING. If it collides at 0, that's life.
                    newZ = 0;
                }

                await get().updateThing(item.id, { z_index: newZ });
            }

        } else {
            // Logic for Domains (z <= -1)
            const allZ = domains.map(d => d.z_index).sort((a, b) => a - b);
            const maxZ = allZ.length > 0 ? allZ[allZ.length - 1] : -1;
            const minZ = allZ.length > 0 ? allZ[0] : -1;

            if (action === "front") {
                newZ = -1.0;
            } else if (action === "back") {
                newZ = minZ - 1.0;
            } else if (action === "forward") {
                newZ = Math.min(-1, currentZ + 1);
            } else if (action === "backward") {
                newZ = currentZ - 1;
            }

            // Apply Update
            if (newZ !== currentZ) {
                await get().updateDomain(item.id, { z_index: newZ });
            }
        }
    }
}));
