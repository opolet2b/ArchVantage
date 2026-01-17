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

export const spacesService = {
    getAll: async (): Promise<AnalysisSpace[]> => {
        const res = await fetch(`${API_URL}/spaces`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });
        if (!res.ok) throw new Error("Failed to fetch spaces");
        return res.json();
    },

    getById: async (id: string): Promise<AnalysisSpace> => {
        const res = await fetch(`${API_URL}/spaces/${id}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });
        if (!res.ok) throw new Error("Failed to fetch space");
        return res.json();
    },

    create: async (name: string, description?: string): Promise<AnalysisSpace> => {
        const res = await fetch(`${API_URL}/spaces`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({ name, description })
        });
        if (!res.ok) throw new Error("Failed to create space");
        return res.json();
    },

    delete: async (id: string): Promise<void> => {
        const res = await fetch(`${API_URL}/spaces/${id}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });
        if (!res.ok) throw new Error("Failed to delete space");
    },

    addCanvas: async (spaceId: string, canvasId: string): Promise<AnalysisSpace> => {
        const res = await fetch(`${API_URL}/spaces/${spaceId}/canvases/${canvasId}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });
        if (!res.ok) throw new Error("Failed to add canvas to space");
        return res.json();
    },

    removeCanvas: async (spaceId: string, canvasId: string): Promise<AnalysisSpace> => {
        const res = await fetch(`${API_URL}/spaces/${spaceId}/canvases/${canvasId}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });
        if (!res.ok) throw new Error("Failed to remove canvas from space");
        return res.json();
    },

    reorderCanvases: async (spaceId: string, canvasIds: string[]): Promise<AnalysisSpace> => {
        const res = await fetch(`${API_URL}/spaces/${spaceId}/reorder`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify(canvasIds)
        });
        if (!res.ok) throw new Error("Failed to reorder canvases");
        return res.json();
    }
};
