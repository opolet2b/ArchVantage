import { API_URL } from "./utils"

const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    return token ? { "Authorization": `Bearer ${token}` } : {};
};

export interface ScanResult {
    files: Array<{
        path: string
        full_path: string
        size: number
    }>
    embeddings: Array<{
        id: string
        metadata: any
        reason: string
    }>
    stats: {
        files: number
        embeddings: number
        total_size_mb: number
        total_embeddings?: number
        labelled_embeddings?: number
    }
    embeddings_summary?: {
        unlabelled_count: number
        is_huge: boolean
    }
}

export interface CleanupRequest {
    files: string[]
    embeddings: string[]
    purge_unlabelled?: boolean
}

export const maintenanceService = {
    async scanOrphans(): Promise<ScanResult> {
        const res = await fetch(`${API_URL}/maintenance/scan`, {
            headers: getAuthHeaders()
        })
        if (!res.ok) {
            const text = await res.text()
            console.error(`Scan failed: ${res.status} ${res.statusText}`, text)
            throw new Error(`Failed to scan orphans: ${res.status} ${text}`)
        }
        return res.json()
    },

    async cleanupOrphans(data: CleanupRequest): Promise<any> {
        const res = await fetch(`${API_URL}/maintenance/cleanup`, {
            method: "POST",
            headers: {
                ...getAuthHeaders(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data)
        })
        if (!res.ok) throw new Error("Failed to cleanup orphans")
        return res.json()
    }
}
