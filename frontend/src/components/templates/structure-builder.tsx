"use client";

import React, { useState, useEffect } from "react";
import {
    TemplateBlock,
    TemplateParserClient
} from "./template-parser-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Plus,
    Trash2,
    ArrowUp,
    ArrowDown,
    LayoutList,
    Repeat,
    MessageSquare,
    GripVertical,
    FileText
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StructureBuilderProps {
    markdown: string;
    onChange: (markdown: string) => void;
}

export function TemplateStructureBuilder({ markdown, onChange }: StructureBuilderProps) {
    const [blocks, setBlocks] = useState<TemplateBlock[]>([]);

    // Initial Parse
    useEffect(() => {
        // Only parse if empty (on mount) to avoid overwriting edits 
        if (blocks.length === 0 && markdown) {
            setBlocks(TemplateParserClient.parse(markdown));
        }
    }, []);

    // Serialize on block change
    const updateBlocks = (newBlocks: TemplateBlock[]) => {
        setBlocks(newBlocks);
        onChange(TemplateParserClient.serialize(newBlocks));
    };

    const addBlock = (type: TemplateBlock["type"], parentId?: string) => {
        const newBlock: TemplateBlock = {
            id: crypto.randomUUID(),
            type,
            title: type === "section" ? "New Section" : undefined,
            content: type === "instruction" ? "Describe what to do..." : undefined,
            loopSource: type === "loop" ? "Source Documents" : undefined,
            children: type !== "instruction" ? [] : undefined
        };

        if (parentId) {
            // Nested add (not implemented for root palette, but could be for loop)
            // For now, easy mode: Add to root or into active section?
        } else {
            updateBlocks([...blocks, newBlock]);
        }
    };

    const removeBlock = (id: string, list: TemplateBlock[]): TemplateBlock[] => {
        return list.filter(b => {
            if (b.id === id) return false;
            if (b.children) {
                b.children = removeBlock(id, b.children);
            }
            return true;
        });
    };

    const handleDelete = (id: string) => {
        updateBlocks(removeBlock(id, blocks));
    };

    const moveBlock = (index: number, direction: 'up' | 'down', list: TemplateBlock[]) => {
        const newArray = [...list];
        if (direction === 'up' && index > 0) {
            [newArray[index], newArray[index - 1]] = [newArray[index - 1], newArray[index]];
        } else if (direction === 'down' && index < newArray.length - 1) {
            [newArray[index], newArray[index + 1]] = [newArray[index + 1], newArray[index]];
        }
        return newArray;
    };

    const handleMove = (id: string, direction: 'up' | 'down') => {
        // Find parent list of this id and move it
        // Recursive search for parent array
        const moveInList = (items: TemplateBlock[]): TemplateBlock[] => {
            const index = items.findIndex(b => b.id === id);
            if (index !== -1) {
                return moveBlock(index, direction, items);
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

    // Add child to a container block (Section/Loop)
    const handleAddChild = (parentId: string, type: TemplateBlock["type"]) => {
        const newBlock: TemplateBlock = {
            id: crypto.randomUUID(),
            type,
            title: type === "section" ? "Sub-Section" : undefined,
            content: type === "instruction" ? "New instruction..." : undefined,
            children: type !== "instruction" ? [] : undefined
        };

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
    };

    // Recursive Renderer
    const renderBlock = (block: TemplateBlock, index: number, list: TemplateBlock[]) => {
        return (
            <div key={block.id} className="mb-3">
                <Card className={cn("p-3 border-l-4",
                    block.type === "section" ? "border-l-blue-500 bg-slate-50 dark:bg-slate-900" :
                        block.type === "loop" ? "border-l-purple-500 bg-purple-50/10" :
                            block.type === "instruction" ? "border-l-emerald-400 bg-white dark:bg-slate-950" :
                                "border-l-slate-400 bg-white dark:bg-slate-950" // Text Block
                )}>
                    {/* Header Controls */}
                    <div className="flex items-center gap-2 mb-2">
                        <div className="cursor-move text-slate-400">
                            <GripVertical className="h-4 w-4" />
                        </div>

                        {/* Icon & Label */}
                        {block.type === "section" && <LayoutList className="h-4 w-4 text-blue-500" />}
                        {block.type === "loop" && <Repeat className="h-4 w-4 text-purple-500" />}
                        {block.type === "instruction" && <MessageSquare className="h-4 w-4 text-emerald-500" />}
                        {block.type === "text" && <FileText className="h-4 w-4 text-slate-500" />}

                        <span className="text-xs font-bold uppercase text-muted-foreground mr-2">{block.type}</span>

                        {/* Inline Editor */}
                        <div className="flex-1">
                            {block.type === "section" && (
                                <Input
                                    value={block.title}
                                    className="h-8 font-semibold"
                                    onChange={(e) => handleUpdate(block.id, { title: e.target.value })}
                                />
                            )}
                            {block.type === "loop" && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm px-2">For each item in:</span>
                                    <Input
                                        value={block.loopSource}
                                        className="h-8 w-48 font-mono"
                                        onChange={(e) => handleUpdate(block.id, { loopSource: e.target.value })}
                                    />
                                </div>
                            )}
                            {block.type === "text" && (
                                <span className="text-xs text-muted-foreground italic">Raw Markdown Text</span>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMove(block.id, 'up')} disabled={index === 0}>
                                <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMove(block.id, 'down')} disabled={index === list.length - 1}>
                                <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" onClick={() => handleDelete(block.id)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                    {/* Content Area */}
                    {(block.type === "instruction" || block.type === "text") && (
                        <Textarea
                            value={block.content}
                            className={cn("min-h-[60px] text-sm", block.type === "text" && "font-mono")}
                            onChange={(e) => handleUpdate(block.id, { content: e.target.value })}
                            placeholder={block.type === "text" ? "Enter markdown text..." : "Enter instruction..."}
                        />
                    )}

                    {/* Children Container */}
                    {(block.type === "section" || block.type === "loop") && (
                        <div className="pl-6 mt-4 border-l-2 border-slate-200 dark:border-slate-800 ml-2">
                            {block.children?.map((child, i, arr) => renderBlock(child, i, arr))}

                            {/* Add Child Buttons */}
                            <div className="flex gap-2 mt-2">
                                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 dashed" onClick={() => handleAddChild(block.id, "instruction")}>
                                    <Plus className="h-3 w-3" /> Instruction
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 dashed" onClick={() => handleAddChild(block.id, "text")}>
                                    <Plus className="h-3 w-3" /> Text
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 dashed" onClick={() => handleAddChild(block.id, "loop")}>
                                    <Plus className="h-3 w-3" /> Loop
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        );
    };

    return (
        <div className="grid grid-cols-12 gap-6 h-full">
            {/* Palette */}
            <div className="col-span-3 border-r pr-4 space-y-4">
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Blocks
                </div>

                <Button variant="outline" className="w-full justify-start gap-2 h-10" onClick={() => addBlock("section")}>
                    <LayoutList className="h-4 w-4 text-blue-500" />
                    Section
                </Button>

                <Button variant="outline" className="w-full justify-start gap-2 h-10" onClick={() => addBlock("instruction")}>
                    <MessageSquare className="h-4 w-4 text-emerald-500" />
                    Instruction
                </Button>

                <Button variant="outline" className="w-full justify-start gap-2 h-10" onClick={() => addBlock("loop")}>
                    <Repeat className="h-4 w-4 text-purple-500" />
                    Loop
                </Button>

                <Button variant="outline" className="w-full justify-start gap-2 h-10" onClick={() => addBlock("text")}>
                    <FileText className="h-4 w-4 text-slate-500" />
                    Text
                </Button>

                <div className="mt-8 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md text-xs text-slate-600 dark:text-slate-400">
                    <strong>Tip:</strong> Drag and drop isn't fully enabled yet, but you can use the Up/Down arrows to reorder items.
                </div>
            </div>

            {/* Canvas */}
            <div className="col-span-9 h-full overflow-y-auto pr-2 pb-20">
                {blocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg text-slate-400">
                        <p>Structure is empty.</p>
                        <p className="text-sm">Add a block from the palette to start.</p>
                    </div>
                ) : (
                    blocks.map((block, i, arr) => renderBlock(block, i, arr))
                )}
            </div>
        </div>
    );
}
