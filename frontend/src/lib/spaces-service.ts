import { API_URL } from "./utils";

export interface AnalysisSpace {
    id: string;
    owner_id: number;
    name: string;
    description?: string;
    canvases: any[]; // CanvasResponse[]
    created_at: string;
    updated_at?: string;
}

const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    return token ? { "Authorization": `Bearer ${token}` } : {};
};

export const spacesService = {
    getAll: async (): Promise<AnalysisSpace[]> => {
        const headers = getAuthHeaders();
        if (!headers.Authorization) throw new Error("Authentication required");

        const res = await fetch(`${API_URL}/spaces`, {
            headers
        });
        if (!res.ok) throw new Error(`Failed to fetch spaces: ${res.status}`);
        return res.json();
    },

    getById: async (id: string): Promise<AnalysisSpace> => {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_URL}/spaces/${id}`, {
            headers
        });
        if (!res.ok) throw new Error("Failed to fetch space");
        return res.json();
    },

    create: async (name: string, description?: string): Promise<AnalysisSpace> => {
        const headers = getAuthHeaders();
        const url = `${API_URL}/spaces`;
        console.log(`[DEBUG-SPACES] Creating space at ${url} with headers:`, {
            hasAuth: !!headers.Authorization,
            authPrefix: headers.Authorization?.substring(0, 15)
        });
        const res = await fetch(url, {
            method: "POST",
            headers: {
                ...headers,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ name, description })
        });
        if (!res.ok) {
            console.error(`[DEBUG-SPACES] Create space failed: ${res.status}`, await res.text().catch(() => "no-body"));
            throw new Error("Failed to create space");
        }
        return res.json();
    },

    delete: async (id: string): Promise<void> => {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_URL}/spaces/${id}`, {
            method: "DELETE",
            headers
        });
        if (!res.ok) throw new Error("Failed to delete space");
    },

    addCanvas: async (spaceId: string, canvasId: string): Promise<AnalysisSpace> => {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_URL}/spaces/${spaceId}/canvases/${canvasId}`, {
            method: "POST",
            headers
        });
        if (!res.ok) throw new Error("Failed to add canvas to space");
        return res.json();
    },

    removeCanvas: async (spaceId: string, canvasId: string): Promise<AnalysisSpace> => {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_URL}/spaces/${spaceId}/canvases/${canvasId}`, {
            method: "DELETE",
            headers
        });
        if (!res.ok) throw new Error("Failed to remove canvas from space");
        return res.json();
    },

    reorderCanvases: async (spaceId: string, canvasIds: string[]): Promise<AnalysisSpace> => {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_URL}/spaces/${spaceId}/reorder`, {
            method: "PUT",
            headers: {
                ...headers,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(canvasIds)
        });
        if (!res.ok) throw new Error("Failed to reorder canvases");
        return res.json();
    }
};
