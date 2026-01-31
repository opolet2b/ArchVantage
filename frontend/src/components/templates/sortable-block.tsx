"use client";

import React, { useState, useMemo } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { TemplateBlock } from "./template-parser-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PromptOptimizerDialog } from "./prompt-optimizer-dialog";
import { cn } from "@/lib/utils";
import {
    GripVertical,
    Trash2,
    LayoutList,
    Repeat,
    MessageSquare,
    FileText,
    Plus,
    GitBranch, // For IF
    ArrowLeftFromLine, // For End/Else?
    ChevronUp,
    ChevronDown,
    ChevronRight,
    Sparkles,
    Code // For Frontmatter
} from "lucide-react";

interface SortableBlockProps {
    block: TemplateBlock;
    depth?: number;
    onUpdate: (id: string, updates: Partial<TemplateBlock>) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string, type: TemplateBlock["type"]) => void;
    onMove: (id: string, direction: 'up' | 'down') => void;
}

// Helper component for the container body drop zone
function ContainerBodyDroppable({ parentId, children }: { parentId: string, children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `container-body-${parentId}`,
        data: { isContainerBody: true, parentId }
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "pl-4 mt-2 border-l-2 ml-2 min-h-[40px] transition-colors rounded-sm",
                isOver ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-800"
            )}
        >
            {children}
        </div>
    );
}

// Gap Droppable for precise insertion
export function InsertGap({ parentId, index, isRoot = false }: { parentId: string, index: number, isRoot?: boolean }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `gap:${parentId}:${index}`,
        data: { isGap: true, parentId, index }
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "h-2 -my-1 transition-all relative z-10",
                isOver ? "h-8 bg-blue-500/20 my-1 ring-2 ring-blue-500 ring-inset rounded" : "hover:bg-slate-200/50"
            )}
        >
            {isOver && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-0.5 w-full bg-blue-500 animate-pulse" />
                </div>
            )}
        </div>
    );
}

// Visual Component (exported for Overlay)
export function BlockCard({ block, depth = 0, onUpdate, onDelete, onAddChild, onMove }: SortableBlockProps) {
    const getStyles = (type: string) => {
        switch (type) {
            case "section": return "border-l-blue-500 bg-slate-50 dark:bg-slate-900";
            case "loop": return "border-l-purple-500 bg-purple-50/10";
            case "instruction": return "border-l-emerald-400 bg-white dark:bg-slate-950";
            case "if": return "border-l-orange-500 bg-orange-50/10";
            case "else": return "border-l-orange-300 bg-orange-50/5";
            case "frontmatter": return "border-l-gray-500 bg-gray-100 dark:bg-gray-900";
            default: return "border-l-slate-400 bg-white dark:bg-slate-950";
        }
    };

    // NOTE: In BlockCard (Overlay), we don't have drag listeners or refs.
    // We just render the content. The DragOverlay wrapper handles position.

    const isContainer = block.type === "section" || block.type === "loop" || block.type === "if" || block.type === "else";

    return (
        <Card className={cn("p-3 border-l-4", getStyles(block.type))}>
            {/* Header Controls */}
            <div className="flex items-center gap-2 mb-2">
                <div className="cursor-grabbing text-slate-600">
                    <GripVertical className="h-4 w-4" />
                </div>

                {/* Icon & Label */}
                {block.type === "section" && <LayoutList className="h-4 w-4 text-blue-500" />}
                {block.type === "loop" && <Repeat className="h-4 w-4 text-purple-500" />}
                {block.type === "instruction" && <MessageSquare className="h-4 w-4 text-emerald-500" />}
                {block.type === "text" && <FileText className="h-4 w-4 text-slate-500" />}
                {block.type === "if" && <GitBranch className="h-4 w-4 text-orange-500" />}
                {block.type === "else" && <GitBranch className="h-4 w-4 text-orange-300 rotate-180" />}
                {block.type === "frontmatter" && <Code className="h-4 w-4 text-gray-500" />}

                <span className="text-xs font-bold uppercase text-muted-foreground mr-2">{block.type}</span>

                {/* Inline Editor (ReadOnly in Overlay generally, or static) */}
                <div className="flex-1 font-semibold text-sm">
                    {block.title || block.loopSource || block.content || block.type}
                </div>

                <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400">
                        <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400">
                        <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50">
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            </div>
            {/* Content Area */}
            {(block.type === "instruction" || block.type === "text") && (
                <div className="text-xs text-slate-500 line-clamp-2">
                    {block.content}
                </div>
            )}
            {block.type === "frontmatter" && (
                <div className="text-xs font-mono text-gray-600 bg-gray-50 dark:bg-gray-800 p-2 rounded mt-1 line-clamp-3">
                    {block.content}
                </div>
            )}
        </Card>
    )
}

export function SortableBlock({ block, depth = 0, onUpdate, onDelete, onAddChild, onMove }: SortableBlockProps) {
    const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: block.id, data: { block } });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        marginLeft: `${depth * 20}px`
    };

    const getStyles = (type: string) => {
        switch (type) {
            case "section": return "border-l-blue-500 bg-slate-50 dark:bg-slate-900";
            case "loop": return "border-l-purple-500 bg-purple-50/10";
            case "instruction": return "border-l-emerald-400 bg-white dark:bg-slate-950";
            case "if": return "border-l-orange-500 bg-orange-50/10";
            case "else": return "border-l-orange-300 bg-orange-50/5";
            default: return "border-l-slate-400 bg-white dark:bg-slate-950";
        }
    };

    const isContainer = block.type === "section" || block.type === "loop" || block.type === "if" || block.type === "else";

    // Memoize the child IDs to prevent SortableContext from triggering infinite updates
    const childIdString = block.children?.map(b => b.id).join(',') || "";
    const childIds = useMemo(() => block.children?.map(b => b.id) || [], [childIdString]);

    return (
        <div ref={setNodeRef} style={style} className={cn("mb-3", isDragging && "opacity-30")}>
            <Card className={cn("p-3 border-l-4", getStyles(block.type))}>
                {/* Header Controls */}
                <div className="flex items-center gap-2 mb-2">
                    <div {...attributes} {...listeners} className="cursor-move text-slate-400 hover:text-slate-600">
                        <GripVertical className="h-4 w-4" />
                    </div>

                    {/* Collapse Toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 -ml-1 text-slate-400 hover:text-slate-600"
                        onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
                    >
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>

                    {/* Icon & Label */}
                    {block.type === "section" && <LayoutList className="h-4 w-4 text-blue-500" />}
                    {block.type === "loop" && <Repeat className="h-4 w-4 text-purple-500" />}
                    {block.type === "instruction" && <MessageSquare className="h-4 w-4 text-emerald-500" />}
                    {block.type === "text" && <FileText className="h-4 w-4 text-slate-500" />}
                    {block.type === "if" && <GitBranch className="h-4 w-4 text-orange-500" />}
                    {block.type === "else" && <GitBranch className="h-4 w-4 text-orange-300 rotate-180" />}

                    <span className="text-xs font-bold uppercase text-muted-foreground mr-2">{block.type}</span>

                    {/* Suggest Button for Instruction */}
                    {block.type === "instruction" && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={(e) => { e.stopPropagation(); setIsOptimizerOpen(true); }}
                            title="Refine with AI"
                        >
                            <Sparkles className="h-3 w-3 mr-1" />
                            Suggest
                        </Button>
                    )}

                    {/* Inline Editor */}
                    <div className="flex-1">
                        {block.type === "section" && (
                            <Input
                                value={block.title}
                                className="h-8 font-semibold"
                                onChange={(e) => onUpdate(block.id, { title: e.target.value })}
                                placeholder="Section Title"
                            />
                        )}
                        {block.type === "loop" && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm px-2">Source:</span>
                                <Input
                                    value={block.loopSource}
                                    className="h-8 w-48 font-mono"
                                    onChange={(e) => onUpdate(block.id, { loopSource: e.target.value })}
                                    placeholder="e.g. DataSource"
                                />
                            </div>
                        )}
                        {block.type === "if" && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm px-2">Condition:</span>
                                <Input
                                    value={block.content}
                                    className="h-8 flex-1 font-mono"
                                    onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                                    placeholder="e.g. Data Available"
                                />
                            </div>
                        )}
                        {block.type === "text" && (
                            <span className="text-xs text-muted-foreground italic">Raw Text</span>
                        )}
                        {block.type === "else" && (
                            <span className="text-xs text-muted-foreground italic">Otherwise</span>
                        )}
                        {(block.type === "instruction" && isCollapsed) && (
                            <span className="text-xs text-slate-500 line-clamp-1 ml-2">{block.content}</span>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            onClick={(e) => { e.stopPropagation(); onMove(block.id, 'up'); }}
                        >
                            <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            onClick={(e) => { e.stopPropagation(); onMove(block.id, 'down'); }}
                        >
                            <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-500 hover:bg-red-50"
                            onClick={() => onDelete(block.id)}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                </div>

                {!isCollapsed && (
                    <>
                        {/* Content Area */}
                        {(block.type === "instruction" || block.type === "text") && (
                            <Textarea
                                value={block.content || ""}
                                className={cn("min-h-[60px] text-sm", block.type === "text" && "font-mono")}
                                onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                                placeholder={block.type === "text" ? "Enter markdown text..." : "Enter instruction..."}
                            />
                        )}

                        {/* Children Container (Recursive) */}
                        {isContainer && (
                            <ContainerBodyDroppable parentId={block.id}>
                                <SortableContext
                                    items={childIds}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {block.children && block.children.length > 0 ? (
                                        <>
                                            {block.children.map((child, idx) => (
                                                <React.Fragment key={child.id}>
                                                    <InsertGap parentId={block.id} index={idx} />
                                                    <SortableBlock
                                                        block={child}
                                                        depth={depth + 1}
                                                        onUpdate={onUpdate}
                                                        onDelete={onDelete}
                                                        onAddChild={onAddChild}
                                                        onMove={onMove}
                                                    />
                                                </React.Fragment>
                                            ))}
                                            <InsertGap parentId={block.id} index={block.children.length} />
                                        </>
                                    ) : (
                                        <div className="h-10 border border-dashed rounded flex items-center justify-center text-xs text-slate-400">
                                            Drop here to nest
                                        </div>
                                    )}
                                </SortableContext>
                            </ContainerBodyDroppable>
                        )}

                        {/* Add Child Actions (Only for containers) */}
                        {isContainer && (
                            <div className="flex gap-2 mt-2 ml-6 flex-wrap">
                                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1 dashed" onPointerDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAddChild(block.id, "instruction"); }}>
                                    <Plus className="h-3 w-3" /> Instr
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1 dashed" onPointerDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAddChild(block.id, "text"); }}>
                                    <FileText className="h-3 w-3" /> Text
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1 dashed" onPointerDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAddChild(block.id, "subsection"); }}>
                                    <LayoutList className="h-3 w-3" /> Section
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1 dashed" onPointerDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAddChild(block.id, "loop"); }}>
                                    <Repeat className="h-3 w-3" /> Loop
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1 dashed" onPointerDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAddChild(block.id, "if"); }}>
                                    <GitBranch className="h-3 w-3" /> IF
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1 dashed" onPointerDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAddChild(block.id, "else"); }}>
                                    <ArrowLeftFromLine className="h-3 w-3 rotate-180" /> Else
                                </Button>
                            </div>
                        )}
                    </>
                )}

                {/* Optimizer Dialog */}
                {isOptimizerOpen && (
                    <PromptOptimizerDialog
                        open={isOptimizerOpen}
                        onOpenChange={setIsOptimizerOpen}
                        onAccept={(text) => onUpdate(block.id, { content: text })}
                        initialText={block.content || ""}
                        contextType="instruction"
                        title="Refine Instruction"
                    />
                )}
            </Card>
        </div>
    );
}
