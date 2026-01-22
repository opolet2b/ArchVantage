
import { API_URL } from "@/lib/utils";

export interface ArrangeRequest {
    canvas_id: string;
    thing_ids?: string[];
}

export const layoutService = {
    arrange: async (request: ArrangeRequest): Promise<void> => {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/layout/arrange`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(request)
        });
        if (!response.ok) {
            throw new Error(`Failed to arrange layout: ${response.statusText}`);
        }
    }
};
