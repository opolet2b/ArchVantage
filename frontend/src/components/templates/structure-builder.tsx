"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    DragOverEvent,
    useDroppable
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { TemplateBlock, TemplateParserClient } from "./template-parser-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    LayoutList,
    Repeat,
    MessageSquare,
    FileText,
    GitBranch,
    ArrowLeftFromLine,
    PanelLeftClose,
    PanelLeftOpen
} from "lucide-react";
import { DraggablePaletteItem } from "./draggable-palette-item";
import { SortableBlock, BlockCard, InsertGap } from "./sortable-block";
import { Card } from "@/components/ui/card";

interface StructureBuilderProps {
    blocks: TemplateBlock[];
    onChange: (blocks: TemplateBlock[]) => void;
    markdown?: string; // Optional for legacy initialization
}

export function TemplateStructureBuilder({ blocks, onChange, markdown }: StructureBuilderProps) {
    // Removed internal blocks state
    // const [blocks, setBlocks] = useState<TemplateBlock[]>([]);

    // Internal state for UI only
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeBlock, setActiveBlock] = useState<TemplateBlock | null>(null);
    const [activePaletteType, setActivePaletteType] = useState<string | null>(null);
    const [isPaletteOpen, setIsPaletteOpen] = useState(true);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Initial Parse from Legacy Markdown (Only if blocks are empty and markdown exists)
    useEffect(() => {
        if (blocks.length === 0 && markdown) {
            const parsed = TemplateParserClient.parse(markdown);
            if (parsed.length > 0) {
                onChange(parsed);
            }
        }
    }, [markdown]); // Run once when markdown loads

    // Helper to find a block by ID (recursive)
    const findBlock = (id: string, items: TemplateBlock[]): TemplateBlock | undefined => {
        for (const item of items) {
            if (item.id === id) return item;
            if (item.children) {
                const found = findBlock(id, item.children);
                if (found) return found;
            }
        }
        return undefined;
    };

    const updateBlocks = (newBlocks: TemplateBlock[]) => {
        onChange(newBlocks);
        // Removed serialization side-effect
        // onChange(TemplateParserClient.serialize(newBlocks));
    };

    // --- Actions ---

    const addBlock = (parentId: string, type: string) => {
        const newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const actualType = type === "subsection" ? "section" : type;

        const newBlock: TemplateBlock = {
            id: newId,
            type: actualType as any,
            title: actualType === "section" ? "New Section" : undefined,
            content: (actualType === "instruction" || actualType === "if" || actualType === "text") ? "" : undefined,
            loopSource: actualType === "loop" ? "Source Documents" : undefined,
            children: (actualType === "instruction" || actualType === "text") ? undefined : []
        };

        if (actualType === "instruction") newBlock.content = "Describe task...";
        if (actualType === "text") newBlock.content = "Enter markdown text...";

        if (parentId) {
            const addToParent = (items: TemplateBlock[]): TemplateBlock[] => {
                return items.map(b => {
                    if (b.id === parentId) {
                        return { ...b, children: [...(b.children || []), newBlock] };
                    }
                    if (b.children) {
                        return { ...b, children: addToParent(b.children) };
                    }
                    return b;
                });
            };
            updateBlocks(addToParent(blocks));
        } else {
            updateBlocks([...blocks, newBlock]);
        }
    };

    const handleUpdate = (id: string, updates: Partial<TemplateBlock>) => {
        const updateInList = (items: TemplateBlock[]): TemplateBlock[] => {
            return items.map(b => {
                if (b.id === id) {
                    return { ...b, ...updates };
                }
                if (b.children) {
                    return { ...b, children: updateInList(b.children) };
                }
                return b;
            });
        };
        updateBlocks(updateInList(blocks));
    };

    const handleDelete = (id: string) => {
        const removeBlock = (list: TemplateBlock[]): TemplateBlock[] => {
            return list.filter(b => {
                if (b.id === id) return false;
                if (b.children) {
                    b.children = removeBlock(b.children);
                }
                return true;
            });
        };
        updateBlocks(removeBlock(blocks));
    };

    const handleMove = (id: string, direction: 'up' | 'down') => {
        const moveInList = (items: TemplateBlock[]): TemplateBlock[] => {
            const index = items.findIndex(b => b.id === id);
            if (index !== -1) {
                const newIndex = direction === 'up' ? index - 1 : index + 1;
                if (newIndex >= 0 && newIndex < items.length) {
                    return arrayMove(items, index, newIndex);
                }
                return items;
            }
            return items.map(b => {
                if (b.children) {
                    return { ...b, children: moveInList(b.children) };
                }
                return b;
            });
        };
        updateBlocks(moveInList(blocks));
    };

    // --- Drag Handlers ---

    const findParent = (id: string, list: TemplateBlock[], parent: TemplateBlock | null = null): { parent: TemplateBlock | null, index: number, list: TemplateBlock[] } | null => {
        const index = list.findIndex(item => item.id === id);
        if (index !== -1) {
            return { parent, index, list };
        }
        for (const item of list) {
            if (item.children) {
                const found = findParent(id, item.children, item);
                if (found) return found;
            }
        }
        return null;
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        setActiveId(active.id as string);

        if (active.data.current?.isPaletteItem) {
            setActivePaletteType(active.data.current.type);
        } else if (active.data.current?.block) {
            setActiveBlock(active.data.current.block);
        }
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        const overId = over?.id;

        if (!overId || active.id === overId) {
            return;
        }

        const activeId = active.id as string;
        const overIdString = String(overId);

        // Ignore legacy drop-zones if any
        if (overIdString.startsWith("drop-zone-")) {
            return;
        }

        // Only handle reordering of existing blocks
        if (active.data.current?.isPaletteItem) return;

        // Verify active block exists
        const activeInfo = findParent(activeId, blocks);
        if (!activeInfo) return;

        // Determine target info
        let overInfo: { parent: TemplateBlock | null, index: number, list: TemplateBlock[] } | null = null;
        let isContainerDrop = false;

        if (overIdString.startsWith("container-body-")) {
            // We are over a container's body (the drop zone).
            // Treat this as "Move to this container".
            const containerId = overIdString.replace("container-body-", "");

            // Avoid self-nesting loop if dragging a container into its own body (though pointer-events on drag overlay should prevent self-hover)
            if (containerId === activeId) return;

            // FIX: Avoid infinite loop if already in this container
            if (activeInfo.parent && activeInfo.parent.id === containerId) {
                return;
            }

            const containerBlock = findBlock(containerId, blocks);
            if (containerBlock) {
                // Mock an overInfo targeting the END of the container's children
                overInfo = {
                    parent: containerBlock,
                    index: containerBlock.children ? containerBlock.children.length : 0,
                    list: containerBlock.children || [] // This is a read reference, we'll refind in setBlocks
                };
                isContainerDrop = true;
            }
        } else {
            // Regular item
            overInfo = findParent(overIdString, blocks);
        }

        if (!overInfo) return;

        // Prevent moving into self (if over is a child of active) - complex check, omitted for perf or simple cycle check
        // Basic check: if active is parent of over?
        // findParent usually traverses. If active is in the path of over, we stop?
        // Logic: if active.children contains over... but overInfo is just parent/index.

        // Cross-container move or reorder
        if (activeInfo.parent?.id !== overInfo.parent?.id || isContainerDrop) {
            const newItems = JSON.parse(JSON.stringify(blocks));
            const aInfo = findParent(activeId, newItems);

            let oInfo: { parent: TemplateBlock | null, index: number, list: TemplateBlock[] } | null = null;

            if (isContainerDrop && overInfo?.parent) { // overInfo.parent is the container
                const cBlock = findBlock(overInfo.parent.id, newItems);
                if (cBlock) {
                    if (!cBlock.children) cBlock.children = [];
                    oInfo = {
                        parent: cBlock,
                        index: cBlock.children.length, // Append
                        list: cBlock.children
                    };
                }
            } else {
                oInfo = findParent(overIdString, newItems);
            }

            if (aInfo && oInfo) {
                const [moved] = aInfo.list.splice(aInfo.index, 1);
                oInfo.list.splice(oInfo.index, 0, moved);
                onChange(newItems);
            }
        } else {
            // Same container reorder
            if (activeInfo.index !== overInfo.index) {
                const newItems = JSON.parse(JSON.stringify(blocks));
                const aInfo = findParent(activeId, newItems);

                if (aInfo) {
                    if (aInfo.parent) {
                        const p = findBlock(aInfo.parent.id, newItems);
                        if (p && p.children) {
                            p.children = arrayMove(p.children, aInfo.index, overInfo!.index);
                        }
                    } else {
                        // Root reorder
                        const reordered = arrayMove(newItems, aInfo.index, overInfo!.index) as TemplateBlock[];
                        onChange(reordered);
                        return; // Early return as we updated root
                    }
                    onChange(newItems);
                }
            }
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        setActiveId(null);
        setActiveBlock(null);
        setActivePaletteType(null);

        // If 'over' is null, we might still be dropping into the root droppable 
        // if collision detection missed it or if it's the very last item.
        // But dnd-kit usually provides 'over' if a droppable is hit.
        if (!over) return;

        const overId = String(over.id);
        const isDropZone = overId.startsWith("drop-zone-") || overId.startsWith("container-body-");
        const isRootDrop = overId === "root-canvas";
        const isGapDrop = overId.startsWith("gap:");

        // --- Logic for Drop Zone (Nesting), Root Drop, or Gap Insertion ---
        if (isDropZone || isRootDrop || isGapDrop) {
            let targetParentId = "root";
            let targetIndex = -1;

            if (isGapDrop) {
                const parts = overId.split(":");
                targetParentId = parts[1];
                targetIndex = parseInt(parts[2], 10);
            } else if (isDropZone) {
                targetParentId = overId.replace("drop-zone-", "").replace("container-body-", "");
            }

            const newBlocks = JSON.parse(JSON.stringify(blocks));
            let blockToAdd: TemplateBlock | null = null;

            // Palette
            if (active.data.current?.isPaletteItem) {
                const type = active.data.current.type;
                const actualType = type === "subsection" ? "section" : type;
                blockToAdd = {
                    id: crypto.randomUUID(),
                    type: actualType as any,
                    title: actualType === "section" ? "New Section" : undefined,
                    children: (actualType === "instruction" || actualType === "text") ? undefined : []
                };
                if (actualType === "instruction") blockToAdd.content = "Describe...";
                if (actualType === "if") blockToAdd.content = "Condition...";
                if (actualType === "loop") blockToAdd.loopSource = "Source";
            } else {
                // Existing
                const activeInfo = findParent(String(active.id), newBlocks);
                if (activeInfo) {
                    const [moved] = activeInfo.list.splice(activeInfo.index, 1);
                    blockToAdd = moved;
                }
            }

            if (blockToAdd) {
                if (targetParentId === "root") {
                    if (targetIndex !== -1) {
                        newBlocks.splice(targetIndex, 0, blockToAdd);
                    } else {
                        newBlocks.push(blockToAdd);
                    }
                } else {
                    // Find target
                    const findTarget = (list: TemplateBlock[]): TemplateBlock | null => {
                        for (const item of list) {
                            if (item.id === targetParentId) return item;
                            if (item.children) {
                                const f = findTarget(item.children);
                                if (f) return f;
                            }
                        }
                        return null;
                    };
                    const target = findTarget(newBlocks);
                    if (target) {
                        if (!target.children) target.children = [];
                        if (targetIndex !== -1) {
                            target.children.splice(targetIndex, 0, blockToAdd);
                        } else {
                            target.children.push(blockToAdd);
                        }
                    }
                }
            }
            // Trigger change
            onChange(newBlocks);
            return;
        }

        // --- Standard Drop (Palette to List) ---
        if (active.data.current?.isPaletteItem) {
            const type = active.data.current.type;
            const actualType = type === "subsection" ? "section" : type;

            const newBlock: TemplateBlock = {
                id: crypto.randomUUID(),
                type: actualType as any,
                title: actualType === "section" ? "New Section" : undefined,
                content: (actualType === "instruction" || actualType === "if") ? "Describe..." : undefined,
                loopSource: actualType === "loop" ? "Source Documents" : undefined,
                children: (actualType === "instruction" || actualType === "text") ? undefined : []
            };

            // Insert at index of over? 
            const overInfo = findParent(overId, blocks);
            if (overInfo) {
                // Insert before 'over'
                const newItems = JSON.parse(JSON.stringify(blocks));
                const info = findParent(overId, newItems);
                if (info) {
                    info.list.splice(info.index, 0, newBlock);
                    onChange(newItems);
                }
            } else {
                // Append to root if unsure
                onChange([...blocks, newBlock]);
            }
        }

        // Final Sync for Reorder is automatic via state effect -> Removed, handled here logic? 
        // Reordering is handled in handleDragOver. Drop is for new insertions.
    };

    // Sync changes to parent when blocks change
    // REMOVED: Managed by parent via onChange now.
    /*
    useEffect(() => {
        if (blocks.length > 0) {
            onChange(TemplateParserClient.serialize(blocks));
        }
    }, [blocks, onChange]);
    */

    return (
        <TemplateCanvas blocks={blocks} sensors={sensors} activeId={activeId} activeBlock={activeBlock} activePaletteType={activePaletteType} handleDragStart={handleDragStart} handleDragOver={handleDragOver} handleDragEnd={handleDragEnd} handleUpdate={handleUpdate} handleDelete={handleDelete} addBlock={addBlock} handleMove={handleMove} isPaletteOpen={isPaletteOpen} setIsPaletteOpen={setIsPaletteOpen} />
    );
}

interface TemplateCanvasProps {
    blocks: TemplateBlock[];
    sensors: any;
    activeId: string | null;
    activeBlock: TemplateBlock | null;
    activePaletteType: string | null;
    handleDragStart: (event: DragStartEvent) => void;
    handleDragOver: (event: DragOverEvent) => void;
    handleDragEnd: (event: DragEndEvent) => void;
    handleUpdate: (id: string, updates: Partial<TemplateBlock>) => void;
    handleDelete: (id: string) => void;
    addBlock: (parentId: string, type: string) => void;
    handleMove: (id: string, direction: 'up' | 'down') => void;
    isPaletteOpen: boolean;
    setIsPaletteOpen: (open: boolean) => void;
}

function TemplateCanvas({ blocks, sensors, activeId, activeBlock, activePaletteType, handleDragStart, handleDragOver, handleDragEnd, handleUpdate, handleDelete, addBlock, handleMove, isPaletteOpen, setIsPaletteOpen }: TemplateCanvasProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: "root-canvas",
        data: { isRoot: true }
    });

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-full">
                {/* Palette */}
                <div
                    className={cn(
                        "border-r pr-4 space-y-4 transition-all duration-300 ease-in-out shrink-0 overflow-hidden",
                        activePaletteType ? "w-64" : (isPaletteOpen ? "w-64" : "w-12 pr-0 items-center flex flex-col")
                    )}
                >
                    <div className="flex items-center justify-between mb-2">
                        {isPaletteOpen && (
                            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                Blocks
                            </div>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-slate-400"
                            onClick={() => setIsPaletteOpen(!isPaletteOpen)}
                            title={isPaletteOpen ? "Collapse Palette" : "Expand Palette"}
                        >
                            {isPaletteOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                        </Button>
                    </div>

                    <DraggablePaletteItem type="section" label="Section" icon={LayoutList} colorClass="text-blue-500" collapsed={!isPaletteOpen} />
                    <DraggablePaletteItem type="instruction" label="Instruction" icon={MessageSquare} colorClass="text-emerald-500" collapsed={!isPaletteOpen} />
                    <DraggablePaletteItem type="loop" label="Loop" icon={Repeat} colorClass="text-purple-500" collapsed={!isPaletteOpen} />
                    <DraggablePaletteItem type="text" label="Text" icon={FileText} colorClass="text-slate-500" collapsed={!isPaletteOpen} />
                    <DraggablePaletteItem type="if" label="If Condition" icon={GitBranch} colorClass="text-orange-500" collapsed={!isPaletteOpen} />
                    <DraggablePaletteItem type="else" label="Else" icon={ArrowLeftFromLine} colorClass="text-orange-300" collapsed={!isPaletteOpen} />

                    {isPaletteOpen && (
                        <div className="mt-8 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md text-xs text-slate-600 dark:text-slate-400">
                            <strong>Tip:</strong> Drag blocks onto the canvas area.
                        </div>
                    )}
                </div>

                {/* Canvas */}
                <div
                    ref={setNodeRef}
                    className={cn(
                        "flex-1 h-full overflow-y-auto pr-2 pb-20 transition-colors rounded-lg",
                        isOver ? "bg-blue-50/30 dark:bg-blue-900/10" : ""
                    )}
                >
                    <div className="min-h-[200px] border rounded-lg p-4 bg-slate-50/50 dark:bg-slate-900/20">

                        <SortableContext
                            items={useMemo(() => blocks.map(b => b.id), [blocks.map(b => b.id).join(',')])}
                            strategy={verticalListSortingStrategy}
                        >
                            {blocks.length === 0 ? (
                                <div className="text-center text-slate-400 mt-10">
                                    Drag items here to start building.
                                </div>
                            ) : (
                                <>
                                    {blocks.map((block, idx) => (
                                        <React.Fragment key={block.id}>
                                            <InsertGap parentId="root" index={idx} isRoot />
                                            <SortableBlock
                                                block={block}
                                                onUpdate={handleUpdate}
                                                onDelete={handleDelete}
                                                onAddChild={addBlock}
                                                onMove={handleMove}
                                            />
                                        </React.Fragment>
                                    ))}
                                    <InsertGap parentId="root" index={blocks.length} isRoot />
                                </>
                            )}
                        </SortableContext>
                    </div>
                </div>

                <DragOverlay dropAnimation={null}>
                    {activeId ? (
                        activeBlock ? (
                            <div className="opacity-80 w-[500px] pointer-events-none">
                                <BlockCard
                                    block={activeBlock}
                                    onUpdate={() => { }}
                                    onDelete={() => { }}
                                    onAddChild={() => { }}
                                    onMove={() => { }}
                                />
                            </div>
                        ) : activePaletteType ? (
                            <div className="p-2 bg-white border rounded shadow-lg w-48 flex items-center gap-2">
                                <div className="h-4 w-4 bg-slate-200 rounded" />
                                {activePaletteType}
                            </div>
                        ) : null
                    ) : null}
                </DragOverlay>
            </div>
        </DndContext >
    );
}
