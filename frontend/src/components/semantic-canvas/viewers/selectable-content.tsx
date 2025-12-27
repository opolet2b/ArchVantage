/**
 * Selectable Content Wrapper
 *
 * Wraps document viewers and handles selection + toolbar display.
 * Integrates with the analyze API for LLM actions.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { SelectionToolbar, LLMAction } from "./selection-toolbar";
import { useAnalyze } from "./use-analyze";
import type { Fragment } from "./types";
import { useCanvasStore } from "../canvas-store";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// =============================================================================
// Types
// =============================================================================

interface SelectableContentProps {
    /** Thing ID for the content */
    thingId: string;
    /** Children to render (the actual viewer) */
    children: React.ReactNode;
    /** Callback when selection state changes */
    onSelectionChange?: (hasSelection: boolean) => void;
}

// =============================================================================
// Selectable Content Component
// =============================================================================

export function SelectableContent({
    thingId,
    children,
    onSelectionChange,
}: SelectableContentProps) {
    const canvasId = useCanvasStore((state) => state.canvasId);
    const addThing = useCanvasStore((state) => state.addThing);
    const addLink = useCanvasStore((state) => state.addLink);
    const selectedModel = useCanvasStore((state) => state.selectedModel);
    const visionModel = useCanvasStore((state) => state.visionModel);
    // Remove direct subscription to prevent infinite render loops
    // const things = useCanvasStore((state) => state.things);
    const { analyze, isLoading } = useAnalyze();

    // Helper to fetch image as base64
    const fetchImageAsBase64 = React.useCallback(async (url: string): Promise<string | null> => {
        try {
            const token = localStorage.getItem("token");
            let fetchUrl = url;
            if (url.startsWith("/api/")) {
                const protocol = window.location.protocol;
                const hostname = window.location.hostname;
                // Assuming standard dev port 8000 for backend if on localhost, otherwise relative
                const port = hostname === "localhost" ? ":8000" : "";
                fetchUrl = `${protocol}//${hostname}${port}${url}`;
                console.log("[SelectableContent] Fetching full image from:", fetchUrl);
            }

            const res = await fetch(fetchUrl, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) return null;
            const blob = await res.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to fetch image", e);
            return null;
        }
    }, []);

    // Helper to prepare fragment (handling image cropping)
    const prepareFragmentForAnalysis = React.useCallback(async (fragment: Fragment): Promise<Fragment> => {
        let finalFragment = fragment;
        console.log("[SelectableContent] Preparing fragment. Type:", fragment.type);

        if (fragment.type === "region") {
            const store = useCanvasStore.getState();
            const thing = store.things.find(t => t.id === thingId);
            const regionFrag = fragment as any;

            console.log("[SelectableContent] Debugging thing:", {
                found: !!thing,
                id: thing?.id,
                type: thing?.type,
                contentType: typeof thing?.content,
                filePath: thing?.content?.file_path,
                isImage: thing?.type === "image"
            });

            if (thing && thing.type === "image" && thing.content.file_path) {
                console.log("[SelectableContent] Fetching full image for cropping...");
                const base64Full = await fetchImageAsBase64(thing.content.file_path as string);

                if (base64Full) {
                    try {
                        const croppedBase64 = await new Promise<string>((resolve, reject) => {
                            const img = document.createElement("img");
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const x = (regionFrag.x / 100) * img.naturalWidth;
                                const y = (regionFrag.y / 100) * img.naturalHeight;
                                const w = (regionFrag.width / 100) * img.naturalWidth;
                                const h = (regionFrag.height / 100) * img.naturalHeight;

                                console.log(`[SelectableContent] Cropping to: x=${x}, y=${y}, w=${w}, h=${h}`);

                                if (w <= 0 || h <= 0) {
                                    console.warn("[SelectableContent] Invalid crop dimensions. Using original fragment content.");
                                    resolve(fragment.content || "");
                                    return;
                                }

                                canvas.width = w;
                                canvas.height = h;
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
                                    resolve(canvas.toDataURL('image/png'));
                                } else {
                                    console.warn("[SelectableContent] Failed to get canvas context. Using original fragment content.");
                                    resolve(fragment.content || "");
                                }
                            };
                            img.onerror = reject;
                            img.src = base64Full;
                        });

                        finalFragment = { ...fragment, content: croppedBase64 };
                        console.log("[SelectableContent] Image cropped. Content length:", finalFragment.content?.length);
                    } catch (e) {
                        console.error("[SelectableContent] Cropping failed", e);
                    }
                }
            }
        }
        return finalFragment;
    }, [thingId, fetchImageAsBase64]);

    // Selection state
    const [selection, setSelection] = React.useState<{
        fragment: Fragment;
        position: { x: number; y: number };
    } | null>(null);

    // Ask dialog state
    const [askDialogOpen, setAskDialogOpen] = React.useState(false);
    const [customPrompt, setCustomPrompt] = React.useState("");

    // Result dialog state
    const [resultDialogOpen, setResultDialogOpen] = React.useState(false);
    const [analysisResult, setAnalysisResult] = React.useState<string>("");
    const [analysisSourceFragment, setAnalysisSourceFragment] = React.useState<Fragment | null>(null);

    // Link dialog state
    const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
    const [pendingFragment, setPendingFragment] = React.useState<Fragment | null>(null);
    // Local state for link targets to avoid subscribing to global things list
    const [availableTargets, setAvailableTargets] = React.useState<any[]>([]);

    // Handle selection from child viewer
    const handleSelection = React.useCallback(
        (fragment: Fragment, position: { x: number; y: number }) => {
            setSelection({ fragment, position });
            onSelectionChange?.(true);
        },
        [onSelectionChange]
    );

    // Clear selection
    const clearSelection = React.useCallback(() => {
        setSelection(null);
        onSelectionChange?.(false);
        // Clear browser selection
        window.getSelection()?.removeAllRanges();
    }, [onSelectionChange]);

    // Helper: Create fragment data for API
    const getFragmentData = (fragment: Fragment) => ({
        type: fragment.type,
        content: fragment.content,
        ...("id" in fragment && { id: fragment.id }),
        ...("startOffset" in fragment && { start_offset: fragment.startOffset }),
        ...("endOffset" in fragment && { end_offset: fragment.endOffset }),
        ...("pageNumber" in fragment && { page_number: fragment.pageNumber }),
    });

    // Helper: Generate label for fragment
    const getFragmentLabel = (fragment: Fragment) => {
        let label = `Fragment: ${fragment.content?.slice(0, 30)}...`;

        if (fragment.type === "cell" && (fragment as any).selectionType) {
            const cellFrag = fragment as any;
            if (cellFrag.selectionType === "row") {
                const rowNum = cellFrag.range.split(":")[0];
                label = `Row ${rowNum}`;
            } else if (cellFrag.selectionType === "column") {
                const colLetter = cellFrag.range.split(":")[0];
                label = `Column ${colLetter}`;
            } else if (cellFrag.selectionType === "range") {
                if (cellFrag.range.match(/^\d+:\d+$/)) {
                    const [start, end] = cellFrag.range.split(":");
                    label = `Rows ${start}-${end}`;
                } else if (cellFrag.range.match(/^[A-Z]+:[A-Z]+$/)) {
                    const [start, end] = cellFrag.range.split(":");
                    label = `Columns ${start}-${end}`;
                } else {
                    label = `Cells ${cellFrag.range}`;
                }
            } else {
                label = `Cell ${cellFrag.range}`;
            }
        }
        return label;
    };

    // Helper: Create new node from result and link it
    const createNodeAndLink = React.useCallback(async (text: string, sourceFragment: Fragment) => {
        const store = useCanvasStore.getState();
        const currentThing = store.things.find(t => t.id === thingId);

        // Calculate position: right of the current node
        const position = currentThing
            ? { x: currentThing.position_x + 500, y: currentThing.position_y }
            : { x: 100, y: 100 };

        // Create new text thing
        const title = sourceFragment.id || "Analysis Result";
        console.log("[SelectableContent] Creating new thing. ID:", sourceFragment.id, "Title:", title, "Fragment:", sourceFragment);
        const newThing = await addThing("text", { text }, position, title);

        if (newThing) {
            // Create link
            await addLink(
                thingId,
                newThing.id,
                "related", // User requested "related" type (and fixes 'generated' type error)
                getFragmentLabel(sourceFragment), // Use smart label
                getFragmentData(sourceFragment),
                undefined
            );
        }
    }, [thingId, addThing, addLink]);

    // Handle LLM action
    const handleAction = React.useCallback(
        async (action: LLMAction, fragment: Fragment) => {
            if (action === "ask") {
                setAskDialogOpen(true);
                return;
            }

            if (!canvasId) return;

            // Prepare fragment (crop if needed)
            const fragmentToAnalyze = await prepareFragmentForAnalysis(fragment);

            const isRegion = fragmentToAnalyze.type === "region";
            const modelToUse = isRegion ? (visionModel || selectedModel) : selectedModel;

            const result = await analyze({
                canvasId,
                thingId,
                fragment: fragmentToAnalyze,
                action,
                model: modelToUse || undefined,
            });

            if (result && result.result) {
                await createNodeAndLink(result.result, fragmentToAnalyze);
            }

            clearSelection();
        },
        [canvasId, thingId, analyze, clearSelection, createNodeAndLink, visionModel, selectedModel, prepareFragmentForAnalysis]
    );

    // Handle ask with custom prompt
    // FIX: Ensure dialog closes immediately and we show feedback
    const handleAskSubmit = React.useCallback(async (e?: React.SyntheticEvent) => {
        if (e) e.preventDefault();

        console.log("[SelectableContent] handleAskSubmit called");

        if (!selection || !canvasId || !customPrompt.trim()) {
            console.warn("[SelectableContent] Ask submit aborted: missing selection or prompt");
            return;
        }

        // Note: Dialog stays OPEN with loading state now

        // 2. Start analysis (Selection remains for toolbar loading state)
        try {
            const fragmentToAnalyze = await prepareFragmentForAnalysis(selection.fragment);
            setAnalysisSourceFragment(selection.fragment);

            console.log("[SelectableContent] Calling analyze...");
            const result = await analyze({
                canvasId,
                thingId,
                fragment: fragmentToAnalyze,
                action: "ask",
                customPrompt: customPrompt.trim(),
                model: (fragmentToAnalyze.type === "region" ? (visionModel || selectedModel) : selectedModel) || undefined,
            });

            console.log("[SelectableContent] Analyze result:", !!result);

            if (result && result.result) {
                await createNodeAndLink(result.result, selection.fragment);
            }

            // Only close on success/completion
            setAskDialogOpen(false);
            setCustomPrompt("");
        } catch (err) {
            console.error("[SelectableContent] Ask failed:", err);
        } finally {
            // 3. Cleanup
            console.log("[SelectableContent] Clearing selection");
            clearSelection();
        }
    }, [canvasId, thingId, selection, customPrompt, analyze, clearSelection, createNodeAndLink, visionModel, selectedModel, prepareFragmentForAnalysis]);

    // Handle link action - open target selection dialog
    const handleLink = React.useCallback((fragment: Fragment) => {
        setPendingFragment(fragment);

        // Lazy load things to avoid subscription overhead
        const allThings = useCanvasStore.getState().things;
        setAvailableTargets(allThings.filter(t => t.id !== thingId));

        setLinkDialogOpen(true);
        clearSelection();
    }, [clearSelection, thingId]);

    // Handle selecting a target for the link
    const handleLinkToTarget = React.useCallback(async (targetId: string) => {
        if (!pendingFragment) return;

        // Create fragment data for the API
        const fragmentData = {
            type: pendingFragment.type,
            content: pendingFragment.content,
            ...("startOffset" in pendingFragment && { start_offset: pendingFragment.startOffset }),
            ...("endOffset" in pendingFragment && { end_offset: pendingFragment.endOffset }),
            ...("pageNumber" in pendingFragment && { page_number: pendingFragment.pageNumber }),
        };

        let label = `Fragment: ${pendingFragment.content?.slice(0, 30)}...`;

        // Custom label for spreadsheet fragments
        if (pendingFragment.type === "cell" && (pendingFragment as any).selectionType) {
            const cellFrag = pendingFragment as any;
            if (cellFrag.selectionType === "row") {
                const rowNum = cellFrag.range.split(":")[0];
                label = `Row ${rowNum}`;
            } else if (cellFrag.selectionType === "column") {
                const colLetter = cellFrag.range.split(":")[0];
                label = `Column ${colLetter}`;
            } else if (cellFrag.selectionType === "range") {
                // Determine if row or column range
                if (cellFrag.range.match(/^\d+:\d+$/)) {
                    const [start, end] = cellFrag.range.split(":");
                    label = `Rows ${start}-${end}`;
                } else if (cellFrag.range.match(/^[A-Z]+:[A-Z]+$/)) {
                    const [start, end] = cellFrag.range.split(":");
                    label = `Columns ${start}-${end}`;
                } else {
                    label = `Cells ${cellFrag.range}`;
                }
            } else {
                label = `Cell ${cellFrag.range}`;
            }
        }

        await addLink(
            thingId,
            targetId,
            "references",
            label,
            fragmentData,
            undefined
        );

        setLinkDialogOpen(false);
        setPendingFragment(null);
    }, [thingId, pendingFragment, addLink]);

    // Handle creating result as new thing
    const handleCreateThing = React.useCallback(async () => {
        if (!analysisResult) return;

        // Use stored source fragment ID for title if available
        const title = analysisSourceFragment?.id || "Analysis Result";
        await addThing("text", { text: analysisResult }, { x: 100, y: 100 }, title);

        if (analysisSourceFragment) {
            // Link back to source? createNodeAndLink does this.
            // But handleCreateThing duplicates logic?
            // Ideally handleCreateThing should call createNodeAndLink?
            // createNodeAndLink expects 'sourceFragment'.
            // Let's refactor handleCreateThing to use createNodeAndLink!
            await createNodeAndLink(analysisResult, analysisSourceFragment);
        } else {
            // Fallback if no source (shouldn't happen in this flow)
            await addThing("text", { text: analysisResult }, { x: 100, y: 100 }, title);
        }

        setResultDialogOpen(false);
        setAnalysisResult("");
        setAnalysisSourceFragment(null);
    }, [analysisResult, addThing, analysisSourceFragment, createNodeAndLink]);

    // Clone children and inject onSelect handler
    const childrenWithProps = React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
            // TypeScript workaround to access props on generic ReactElement
            const childProps = child.props as any;
            const originalOnSelect = childProps.onSelect;

            return React.cloneElement(child, {
                onSelect: (fragment: Fragment, position: { x: number; y: number }) => {
                    // Call our handler for the toolbar
                    handleSelection(fragment, position);
                    // Call the original handler (e.g., for creating persistent regions in ThingNode)
                    if (originalOnSelect) {
                        originalOnSelect(fragment, position);
                    }
                },
            } as any);
        }
        return child;
    });

    return (
        <div className="nodrag w-full h-full relative group">
            {childrenWithProps}

            {/* Selection Toolbar */}
            {/* Selection Toolbar (Portaled to body to avoid transform issues) */}
            {selection && typeof document !== "undefined" &&
                createPortal(
                    <SelectionToolbar
                        fragment={selection.fragment}
                        thingId={thingId}
                        position={selection.position}
                        onAction={handleAction}
                        onLink={handleLink}
                        onClose={clearSelection}
                        isLoading={isLoading}
                    />,
                    document.body
                )
            }


            {/* Custom Prompt Dialog */}
            <Dialog open={askDialogOpen} onOpenChange={(open) => !isLoading && setAskDialogOpen(open)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Ask about selection</DialogTitle>
                        <DialogDescription>
                            Enter a question or prompt about the selected content.
                        </DialogDescription>
                    </DialogHeader>

                    {isLoading ? (
                        <div className="py-8 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in-95">
                            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                            <p className="text-sm text-muted-foreground">Thinking...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="prompt">Your question</Label>
                                <Input
                                    id="prompt"
                                    value={customPrompt}
                                    onChange={(e) => setCustomPrompt(e.target.value)}
                                    placeholder="e.g., What are the implications of this?"
                                    onKeyDown={(e) => e.key === "Enter" && handleAskSubmit()}
                                    autoFocus
                                />
                            </div>
                            {selection?.fragment.content && (
                                <div className="space-y-2">
                                    <Label>Selected text</Label>
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded text-sm max-h-20 overflow-auto">
                                        {selection.fragment.content.slice(0, 200)}
                                        {selection.fragment.content.length > 200 && "..."}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {!isLoading && (
                            <Button variant="outline" onClick={() => setAskDialogOpen(false)}>
                                Cancel
                            </Button>
                        )}
                        <Button
                            onClick={handleAskSubmit}
                            disabled={!customPrompt.trim() || isLoading}
                        >
                            {isLoading ? "Processing..." : "Ask AI"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Result Dialog */}
            <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Analysis Result</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded whitespace-pre-wrap max-h-[300px] overflow-auto">
                            {analysisResult}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResultDialogOpen(false)}>
                            Close
                        </Button>
                        <Button onClick={handleCreateThing}>
                            Add as New Thing
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Link Target Selection Dialog */}
            <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Link to another node</DialogTitle>
                        <DialogDescription>
                            Select a node to link this selection to.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {pendingFragment?.content && (
                            <div className="mb-4 space-y-2">
                                <Label>Selected content</Label>
                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded text-sm max-h-16 overflow-auto">
                                    {pendingFragment.content.slice(0, 100)}
                                    {pendingFragment.content.length > 100 && "..."}
                                </div>
                            </div>
                        )}
                        <Label>Select target node</Label>
                        <div className="mt-2 space-y-2 max-h-[200px] overflow-auto">
                            {availableTargets.length === 0 ? (
                                <div className="text-sm text-muted-foreground text-center py-4">
                                    No other nodes on canvas to link to
                                </div>
                            ) : (
                                availableTargets.map((target) => (
                                    <Button
                                        key={target.id}
                                        variant="outline"
                                        className="w-full justify-start text-left h-auto py-2"
                                        onClick={() => handleLinkToTarget(target.id)}
                                    >
                                        <div className="truncate">
                                            <span className="font-medium">
                                                {target.title || target.type}
                                            </span>
                                            {target.content && (
                                                <span className="text-muted-foreground ml-2 text-xs">
                                                    {typeof target.content === "object" && "text" in target.content
                                                        ? String(target.content.text).slice(0, 30)
                                                        : ""}
                                                </span>
                                            )}
                                        </div>
                                    </Button>
                                ))
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setLinkDialogOpen(false);
                            setPendingFragment(null);
                        }}>
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
