
import * as React from "react";
import { CanvasThing } from "../canvas-store";
import { SlideshowViewer } from "../viewers/slideshow-viewer";
import { Loader2, AlertCircle } from "lucide-react";
import { RegionFragment, OverlayFragment } from "../viewers/types";

interface SlideshowNodeProps {
    thing: CanvasThing;
    overlays?: OverlayFragment[];
    onSelect?: (fragment: RegionFragment, position?: { x: number; y: number }) => void;
    onOverlayResize?: (id: string, x: number, y: number, width: number, height: number) => void;
    onOverlayDelete?: (id: string) => void;
    onOverlayClick?: (fragment: RegionFragment, position?: { x: number; y: number }) => void;
}

export function SlideshowNode({
    thing,
    overlays,
    onSelect,
    onOverlayResize,
    onOverlayDelete,
    onOverlayClick
}: SlideshowNodeProps) {
    const [jsonContent, setJsonContent] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [progressThing, setProgressThing] = React.useState<CanvasThing>(thing);

    // Sync init thing
    React.useEffect(() => {
        setProgressThing(thing);
    }, [thing]);

    // Sync progressThing to jsonContent for embedded slideshows (Image Folder)
    // This ensures that when the poller fetches updated AI descriptions, the viewer updates.
    // Sync progressThing to jsonContent for embedded slideshows (Image Folder)
    // This ensures that when the poller fetches updated AI descriptions, the viewer updates.
    React.useEffect(() => {
        // Condition 1: Embedded slideshow (no asset_id)
        const isEmbedded = !thing.content?.asset_id && progressThing.content;

        // Condition 2: Analysis Completed (update content regardless of type to show new descriptions)
        const isCompleted = thing.rag_status === 'completed' && thing.content?.slides;

        if (isEmbedded || isCompleted) {
            console.log("[SlideshowNode] Syncing content from prop update:", thing.rag_status);
            setJsonContent({
                ...progressThing.content,
                // regions: overlays || progressThing.content.regions // Don't merge here, do it in render
            });
        }
    }, [progressThing, thing.rag_status, thing.content, thing.content?.asset_id]); // Removed overlays dependency

    // Polling for RAG Status
    React.useEffect(() => {
        let intervalId: NodeJS.Timeout;

        // Should we poll?
        const shouldPoll =
            progressThing.rag_status === 'pending' ||
            progressThing.rag_status === 'processing';

        if (shouldPoll) {
            intervalId = setInterval(async () => {
                try {
                    const token = localStorage.getItem("token");
                    if (!token || !thing.canvas_id || !thing.id) return;

                    const res = await fetch(`/api/v1/canvases/${thing.canvas_id}/things/${thing.id}`, {
                        headers: {
                            "Authorization": `Bearer ${token}`
                        }
                    });
                    if (res.ok) {
                        const updatedThing = await res.json();
                        // Merge the updated rag_status and content.ingestion_progress
                        const hasStatusChanged = updatedThing.rag_status !== progressThing.rag_status;

                        // If status changed to completed, force reload of content strictly
                        if (hasStatusChanged && updatedThing.rag_status === 'completed') {
                            // Use DB content directly to update viewer immediately
                            if (updatedThing.content && updatedThing.content.slides) {
                                console.log("[SlideshowNode] Analysis completed, updating content from DB polling...");
                                setJsonContent({ ...updatedThing.content });
                            }
                        }

                        const hasProgressChanged = JSON.stringify(updatedThing.content?.ingestion_progress) !== JSON.stringify(progressThing.content?.ingestion_progress);

                        if (hasStatusChanged || hasProgressChanged) {
                            setProgressThing(updatedThing);
                        }
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 3000); // Poll every 3 seconds to avoid flooding
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [progressThing.rag_status, progressThing.content?.ingestion_progress, thing.canvas_id, thing.id]);


    // Fetch the sidecar JSON on mount
    React.useEffect(() => {
        const loadContent = async () => {
            if (!thing.content?.asset_id) {
                if (thing.content && 'slides' in thing.content) {
                    setJsonContent({
                        ...thing.content,
                        // regions: overlays || thing.content.regions 
                    });
                    return;
                }
                setError("Missing asset_id or slide data.");
                return;
            }

            try {
                setLoading(true);
                const token = localStorage.getItem("token");
                const headers: HeadersInit = {};
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                }

                const response = await fetch(`/api/v1/assets/sidecar/${thing.content.asset_id}`, {
                    headers
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        setError("Slide data not found (processing might be incomplete)");
                    } else {
                        setError(`Failed to load data: ${response.statusText}`);
                    }
                    return;
                }

                const data = await response.json();
                setJsonContent({
                    ...data,
                    // regions: overlays || data.regions
                });
            } catch (e) {
                console.error(e);
                setError("Network error loading slides");
            } finally {
                setLoading(false);
            }
        };

        loadContent();
    }, [thing.content?.asset_id]); // Removed overlays dependency

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground gap-2">
                <AlertCircle className="h-6 w-6 text-red-400" />
                <p className="text-xs">{error}</p>
            </div>
        );
    }

    // Sidecar Loading State
    if (loading || !jsonContent) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 gap-4 text-muted-foreground bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-xs">Loading presentation structure...</p>
            </div>
        );
    }

    // Ingestion Progress (Overlay)
    const progress = progressThing.content?.ingestion_progress as { current: number; total: number; percent: number } | undefined;
    const isProcessing = progressThing.rag_status === 'processing' || progressThing.rag_status === 'pending';

    // Only show if processing and we actually have progress or at least 'pending' status
    // If 'pending' (initializing), we show the initializing message.
    // If 'processing' and we have progress, we show the bar.
    // If 'processing' but NO progress yet (e.g. just started), we show "Initializing".

    return (
        <div className="relative w-full h-full flex flex-col group overflow-hidden">
            {/* Main Viewer */}
            <SlideshowViewer
                content={{
                    ...jsonContent,
                    regions: overlays || jsonContent.regions || []
                }}
                className="w-full h-full border-none rounded-none"
                onSelect={onSelect}
                onOverlayResize={onOverlayResize}
                onOverlayDelete={onOverlayDelete}
                onOverlayClick={onOverlayClick}
            />

            {/* Progress Overlay (Toast style) */}
            {isProcessing && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-72 bg-background/95 backdrop-blur border shadow-xl rounded-lg p-3 z-50 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-3">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                        <div className="flex-1 space-y-1">
                            {progress ? (
                                <>
                                    <div className="flex justify-between text-xs font-medium text-foreground">
                                        <span>Building AI Brain...</span>
                                        <span>{progress.current} / {progress.total} slides</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 transition-all duration-500 ease-out"
                                            style={{ width: `${progress.percent}%` }}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="text-xs font-medium text-foreground">
                                    Initializing AI Model...
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
