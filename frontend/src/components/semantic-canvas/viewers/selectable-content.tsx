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
}

// =============================================================================
// Selectable Content Component
// =============================================================================

export function SelectableContent({
    thingId,
    children,
}: SelectableContentProps) {
    const canvasId = useCanvasStore((state) => state.canvasId);
    const addThing = useCanvasStore((state) => state.addThing);
    const addLink = useCanvasStore((state) => state.addLink);
    // Remove direct subscription to prevent infinite render loops
    // const things = useCanvasStore((state) => state.things);
    const { analyze, isLoading } = useAnalyze();

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

    // Link dialog state
    const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
    const [pendingFragment, setPendingFragment] = React.useState<Fragment | null>(null);
    // Local state for link targets to avoid subscribing to global things list
    const [availableTargets, setAvailableTargets] = React.useState<any[]>([]);

    // Handle selection from child viewer
    const handleSelection = React.useCallback(
        (fragment: Fragment, position: { x: number; y: number }) => {
            setSelection({ fragment, position });
        },
        []
    );

    // Clear selection
    const clearSelection = React.useCallback(() => {
        setSelection(null);
        // Clear browser selection
        window.getSelection()?.removeAllRanges();
    }, []);

    // Helper: Create fragment data for API
    const getFragmentData = (fragment: Fragment) => ({
        type: fragment.type,
        content: fragment.content,
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
        const newThing = await addThing("text", { text }, position);

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
                // Open custom prompt dialog
                setAskDialogOpen(true);
                return;
            }

            if (!canvasId) return;

            const result = await analyze({
                canvasId,
                thingId,
                fragment,
                action,
            });

            if (result && result.result) {
                // Automatically create node and link
                await createNodeAndLink(result.result, fragment);
            }

            clearSelection();
        },
        [canvasId, thingId, analyze, clearSelection, createNodeAndLink]
    );

    // Handle ask with custom prompt
    const handleAskSubmit = React.useCallback(async () => {
        if (!selection || !canvasId || !customPrompt.trim()) return;

        const result = await analyze({
            canvasId,
            thingId,
            fragment: selection.fragment,
            action: "ask",
            customPrompt: customPrompt.trim(),
        });

        if (result && result.result) {
            await createNodeAndLink(result.result, selection.fragment);
        }

        setAskDialogOpen(false);
        setCustomPrompt("");
        clearSelection();
    }, [canvasId, thingId, selection, customPrompt, analyze, clearSelection, createNodeAndLink]);

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

        await addThing("text", { text: analysisResult }, { x: 100, y: 100 });
        setResultDialogOpen(false);
        setAnalysisResult("");
    }, [analysisResult, addThing]);

    // Clone children and inject onSelect handler
    const childrenWithProps = React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
                onSelect: handleSelection,
            });
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
            <Dialog open={askDialogOpen} onOpenChange={setAskDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Ask about selection</DialogTitle>
                        <DialogDescription>
                            Enter a question or prompt about the selected content.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="prompt">Your question</Label>
                            <Input
                                id="prompt"
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                placeholder="e.g., What are the implications of this?"
                                onKeyDown={(e) => e.key === "Enter" && handleAskSubmit()}
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
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAskDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleAskSubmit} disabled={!customPrompt.trim()}>
                            Ask
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
