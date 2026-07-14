import React, { useEffect, useState } from "react";
import { API_URL } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface CollaboraViewerProps {
    fileUrl: string;
    className?: string;
    fallback?: React.ReactNode;
}

export function CollaboraViewer({ fileUrl, className, fallback }: CollaboraViewerProps) {
    const [config, setConfig] = useState<{ use_collabora: boolean; collabora_server_url: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem("token");
        fetch(`${API_URL}/config/editor`, {
            headers: { "Authorization": `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.config) {
                setConfig(data.config);
            } else {
                setError("Failed to load editor configuration.");
            }
            setLoading(false);
        })
        .catch(err => {
            console.error("Failed to fetch editor config", err);
            setError("Failed to load editor configuration.");
            setLoading(false);
        });
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-sm text-slate-500">Loading editor settings...</p>
            </div>
        );
    }

    if (error || !config || !config.use_collabora || !config.collabora_server_url) {
        return (
            <div className="flex flex-col h-full">
                <div className="bg-red-100 text-red-800 text-xs p-1 font-mono">
                    [Debug] Fallback active. Error: {error || 'None'} | Config: {JSON.stringify(config)}
                </div>
                <div className="flex-1 min-h-0">
                    {fallback}
                </div>
            </div>
        );
    }

    // If fileUrl is an asset URL, convert it to a WOPI file URL
    let wopiUrl = fileUrl;
    if (fileUrl.includes('/api/v1/assets/')) {
        const assetId = fileUrl.split('/').pop();
        wopiUrl = `${API_URL}/wopi/files/${assetId}`;
    } else if (fileUrl.includes('/api/v1/things/')) {
        const thingId = fileUrl.split('/').pop();
        wopiUrl = `${API_URL}/wopi/things/${thingId}`;
    }

    // Ensure API_URL is absolute if it's relative
    let fullFileUrl = wopiUrl;
    if (!fullFileUrl.startsWith('http')) {
        fullFileUrl = `${window.location.origin}${fullFileUrl}`;
    }

    // Rewrite localhost/127.0.0.1 to host.docker.internal so Collabora running in Docker can reach the backend
    if (fullFileUrl.includes('localhost') || fullFileUrl.includes('127.0.0.1')) {
        fullFileUrl = fullFileUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
    }
    
    const serverUrl = config.collabora_server_url.endsWith('/') 
        ? config.collabora_server_url.slice(0, -1) 
        : config.collabora_server_url;
    const viewerUrl = `${serverUrl}/browser/dist/cool.html?WOPISrc=${encodeURIComponent(fullFileUrl)}`;

    return (
        <iframe
            src={viewerUrl}
            className={className || "w-full h-full border-0"}
            title="Collabora Editor"
            allowFullScreen
        />
    );
}
