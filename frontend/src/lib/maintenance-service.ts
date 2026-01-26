import { API_URL } from "./utils"

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
    }
}

export interface CleanupRequest {
    files: string[]
    embeddings: string[]
}

export const maintenanceService = {
    async scanOrphans(): Promise<ScanResult> {
        const res = await fetch(`${API_URL}/maintenance/scan`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
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
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify(data)
        })
        if (!res.ok) throw new Error("Failed to cleanup orphans")
        return res.json()
    }
}
