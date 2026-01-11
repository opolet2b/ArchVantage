export interface UploadProgress {
    loaded: number
    total: number
    percentage: number
    status: 'uploading' | 'processing' | 'done' | 'error'
}

export type ProgressCallback = (progress: UploadProgress) => void

export function uploadFile(
    url: string,
    file: File,
    onProgress: ProgressCallback
): Promise<any> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const formData = new FormData()
        formData.append("file", file)

        xhr.open("POST", url, true)

        const token = localStorage.getItem("token")
        if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`)
        }

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percentage = Math.round((e.loaded / e.total) * 100)
                onProgress({
                    loaded: e.loaded,
                    total: e.total,
                    percentage,
                    status: 'uploading'
                })
            }
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress({
                    loaded: file.size,
                    total: file.size,
                    percentage: 100,
                    status: 'done'
                })
                try {
                    const response = JSON.parse(xhr.responseText)
                    resolve(response)
                } catch (e) {
                    resolve(xhr.responseText)
                }
            } else {
                onProgress({
                    loaded: 0,
                    total: 0,
                    percentage: 0,
                    status: 'error'
                })
                try {
                    const errorData = JSON.parse(xhr.responseText)
                    reject(new Error(errorData.detail || "Upload failed"))
                } catch (e) {
                    reject(new Error("Upload failed"))
                }
            }
        }

        xhr.onerror = () => {
            onProgress({
                loaded: 0,
                total: 0,
                percentage: 0,
                status: 'error'
            })
            reject(new Error("Network error"))
        }

        // When upload is complete but we are waiting for response (processing/ingestion)
        xhr.upload.onload = () => {
            onProgress({
                loaded: file.size,
                total: file.size,
                percentage: 100,
                status: 'processing'
            })
        }

        xhr.send(formData)
    })
}
