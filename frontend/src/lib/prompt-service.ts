import { API_URL } from "./utils"

export interface PromptDefinition {
    key: string
    group: string
    description?: string
    default_content: string
    variables_schema: Record<string, string>
    access_level: "read_only" | "admin_only" | "user_overridable"
    last_synced_at?: string
    active_override?: string
    is_overridden: boolean
}

export interface PromptOverrideCreate {
    content: string
    explanation?: string
}

export const promptService = {
    async listPrompts(): Promise<PromptDefinition[]> {
        const res = await fetch(`${API_URL}/prompts`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        })
        if (!res.ok) throw new Error("Failed to fetch prompts")
        return res.json()
    },

    async createOverride(key: string, data: PromptOverrideCreate): Promise<PromptDefinition> {
        const res = await fetch(`${API_URL}/prompts/${key}/override`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify(data)
        })
        if (!res.ok) throw new Error("Failed to save override")
        return res.json()
    },

    async deleteOverride(key: string): Promise<void> {
        const res = await fetch(`${API_URL}/prompts/${key}/override`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        })
        if (!res.ok) throw new Error("Failed to reset override")
    }
}
