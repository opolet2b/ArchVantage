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
    | "slideshow";

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
    // Optional fragment references for linking specific content selections
    source_fragment: Record<string, unknown> | null;
    target_fragment: Record<string, unknown> | null;
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
    color: string;
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
    created_at: string;
    updated_at: string | null;
}

/**
 * Zoom level categories for semantic rendering.
 */
export type ZoomLevel = "domain" | "summary" | "preview" | "full";

/**
 * Determine zoom level category from zoom value.
 */
export function getZoomLevel(zoom: number): ZoomLevel {
    if (zoom < 0.3) return "domain";
    if (zoom < 0.5) return "summary";
    if (zoom < 0.7) return "preview";
    return "full";
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

    // Viewport
    viewport: Viewport;
    zoomLevel: ZoomLevel;

    // Selection
    selectedThingIds: string[];
    selectedDomainIds: string[];

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

    // Thing actions
    addThing: (
        type: ThingType,
        content: Record<string, unknown>,
        position: { x: number; y: number },
        title?: string
    ) => Promise<CanvasThing | null>;
    updateThing: (
        thingId: string,
        updates: Partial<CanvasThing>
    ) => Promise<void>;
    syncThing: (thingId: string, serverThing: Partial<CanvasThing>) => void;
    deleteThing: (thingId: string) => Promise<void>;
    moveThing: (thingId: string, x: number, y: number, width?: number, height?: number) => void;

    // Link actions
    addLink: (
        sourceId: string,
        targetId: string,
        type: LinkType,
        label?: string,
        sourceFragment?: Record<string, unknown>,
        targetFragment?: Record<string, unknown>
    ) => Promise<CanvasLink | null>;
    updateLink: (
        linkId: string,
        updates: Partial<CanvasLink>
    ) => Promise<void>;
    deleteLink: (linkId: string) => Promise<void>;

    // Domain actions
    addDomain: (
        name: string,
        position: { x: number; y: number },
        color?: string
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
    addThingToDomain: (thingId: string, domainId: string) => Promise<void>;
    removeThingFromDomain: (thingId: string) => Promise<void>;
    checkThingInDomain: (thingId: string, x: number, y: number) => string | null;

    // Selection
    selectThing: (thingId: string, multi?: boolean) => void;
    selectDomain: (domainId: string, multi?: boolean, recursive?: boolean) => void;
    setSelectedItems: (thingIds: string[], domainIds: string[]) => void;
    clearSelection: () => void;

    // Iconify feature
    toggleIconify: (thingId: string) => Promise<void>;

    // Semantic Discovery
    discoverLinks: (thingIds: string[], domainIds: string[]) => Promise<{ links_created: number; domains_updated: number; details: any[] } | null>;
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
    viewport: { x: 0, y: 0, zoom: 1.0 },
    zoomLevel: "full",
    selectedThingIds: [],
    selectedDomainIds: [],
    isLoading: false,
    error: null,

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

            set({
                canvasId: canvas.id,
                canvasName: canvas.name,
                things: canvas.things,
                links: canvas.links,
                domains: canvas.domains,
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

    // Add thing to canvas
    addThing: async (type, content, position, title) => {
        const { canvasId } = get();
        const token = getAuthToken();
        console.log(`[Store] addThing called. Type: ${type}, CanvasId: ${canvasId}`);
        if (!token || !canvasId) {
            console.error("[Store] Missing token or canvasId");
            return null;
        }

        try {
            console.log(`[Store] Sending POST to /canvases/${canvasId}/things`);
            const res = await fetch(`${API_URL}/canvases/${canvasId}/things`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    type,
                    content,
                    position: { x: position.x, y: position.y },
                    size: { width: 400, height: 400 }, // Correctly nested size object
                    title,
                }),
            });

            console.log(`[Store] POST response status: ${res.status}`);

            if (!res.ok) {
                const errorText = await res.text();
                console.error(`[Store] Failed to add thing: ${res.status} ${errorText}`);
                throw new Error("Failed to add thing");
            }

            const thing: CanvasThing = await res.json();
            console.log(`[Store] Thing added successfully: ${thing.id}`);
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
        const optimisticThings = currentThings.map((t) => {
            if (t.id === thingId) {
                return {
                    ...t,
                    ...updates,
                    // Preserve existing values if not updated
                    content: updates.content || t.content,
                    position_x: updates.position_x ?? t.position_x,
                    position_y: updates.position_y ?? t.position_y,
                    width: updates.width ?? t.width,
                    height: updates.height ?? t.height,
                    title: updates.title ?? t.title,
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
                        collapsed: updates.collapsed,
                        iconified: updates.iconified,
                        pre_iconify_size: updates.pre_iconify_size,
                    }),
                }
            );

            if (!res.ok) {
                // Revert on failure
                set({ things: currentThings });
                throw new Error("Failed to update thing");
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

    // Add link between things
    addLink: async (sourceId, targetId, type, label, sourceFragment, targetFragment) => {
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
                    source_fragment: sourceFragment,
                    target_fragment: targetFragment,
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
    addDomain: async (name, position, color = "#6366f1") => {
        const { canvasId } = get();
        const token = getAuthToken();

        console.log("[addDomain] Creating domain:", { name, position, color });
        console.log("[addDomain] canvasId:", canvasId, "token:", !!token);

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
            console.log("[addDomain] POST to:", url);

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, position, color }),
            });

            console.log("[addDomain] Response status:", res.status);

            if (!res.ok) {
                const errorText = await res.text();
                console.error("[addDomain] Error response:", errorText);
                throw new Error(`Failed to add domain: ${res.status} ${errorText}`);
            }

            const domain: Domain = await res.json();
            console.log("[addDomain] Domain created:", domain);
            set({ domains: [...get().domains, domain] });
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
                        color: updates.color,
                        width: updates.width,
                        height: updates.height,
                    }),
                }
            );

            if (!res.ok) throw new Error("Failed to update domain");

            const updated: Domain = await res.json();
            set({
                domains: domains.map((d) => (d.id === domainId ? updated : d)),
            });
        } catch (err) {
            console.error("Failed to update domain:", err);
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
                x <= domain.position_x + domain.width &&
                y >= domain.position_y &&
                y <= domain.position_y + domain.height
            ) {
                return domain.id;
            }
        }
        return null;
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

            // Remove domain and un-group its things
            set({
                domains: domains.filter((d) => d.id !== domainId),
                things: things.map((t) =>
                    t.domain_id === domainId ? { ...t, domain_id: null } : t
                ),
            });
        } catch (err) {
            console.error("Failed to delete domain:", err);
        }
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

    clearSelection: () => {
        set({ selectedThingIds: [], selectedDomainIds: [] });
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
                        domain_ids: domainIds
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
    }
}));
