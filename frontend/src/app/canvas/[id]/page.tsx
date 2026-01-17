"use client";

import * as React from 'react';
import { CanvasView } from "@/components/semantic-canvas/canvas-view";
import { useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { useViewMode } from '@/lib/view-mode-context';

export default function CanvasPage({ params }: { params: Promise<{ id: string }> }) {
    // React.use() to unwrap the params Promise (Next.js 15+)
    const { id } = React.use(params);

    const loadCanvas = useCanvasStore(state => state.loadCanvas);
    const canvasId = useCanvasStore(state => state.canvasId);
    const { setViewMode } = useViewMode();

    React.useEffect(() => {
        if (id) {
            setViewMode('canvas');
            loadCanvas(id);
        }
    }, [id, loadCanvas, setViewMode]);

    // Show loading state until the store reflects the requested canvas
    if (canvasId !== id) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <div className="flex flex-col items-center space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 dark:border-slate-100" />
                    <div className="text-lg font-medium text-slate-600 dark:text-slate-400">
                        Loading canvas...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full">
            <CanvasView />
        </div>
    );
}
