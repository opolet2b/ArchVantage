"use client";

/**
 * Agent Builder Page
 *
 * IDE-like layout for visual agent construction with React Flow canvas,
 * Architect chat sidebar, and Inspector panel.
 */
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { BuilderHeader } from "@/components/builder/builder-header";
import { ArchitectSidebar } from "@/components/builder/architect-sidebar";
import { BuilderCanvas } from "@/components/builder/builder-canvas";
import { InspectorPanel } from "@/components/builder/inspector-panel";
import { useBuilderStore } from "@/lib/builder-store";

export default function AgentBuilderPage() {
    const params = useParams();
    const blueprintId = params.id as string;

    const loadBlueprint = useBuilderStore((state) => state.loadBlueprint);
    const resetBlueprint = useBuilderStore((state) => state.resetBlueprint);

    // Load blueprint on mount if editing existing
    useEffect(() => {
        if (blueprintId && blueprintId !== "new") {
            loadBlueprint(blueprintId);
        } else {
            resetBlueprint();
        }
    }, [blueprintId, loadBlueprint, resetBlueprint]);

    // Warn user about unsaved changes
    const isDirty = useBuilderStore((state) => state.isDirty);
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isDirty]);

    return (
        <ReactFlowProvider>
            <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
                {/* Header Bar */}
                <BuilderHeader />

                {/* Main Content Area */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar: Architect Chat */}
                    <ArchitectSidebar />

                    {/* Center: Visual Canvas */}
                    <div className="flex-1 relative">
                        <BuilderCanvas />
                    </div>

                    {/* Right Sidebar: Inspector & Palette */}
                    <InspectorPanel />
                </div>
            </div>
        </ReactFlowProvider>
    );
}
