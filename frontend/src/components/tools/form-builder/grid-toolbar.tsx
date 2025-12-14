"use client"

import { Button } from "@/components/ui/button"
import {
    Plus,
    Minus,
    Combine,
    Split,
    Grid3X3,
    ArrowRightFromLine,
    ArrowDownFromLine
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface GridToolbarProps {
    onAddRow: () => void
    onAddCol: () => void
    onRemoveRow: () => void
    onRemoveCol: () => void
    onMergeCells: () => void
    onSplitCell: () => void
    canMerge: boolean
    canSplit: boolean
}

export function GridToolbar({
    onAddRow,
    onAddCol,
    onRemoveRow,
    onRemoveCol,
    onMergeCells,
    onSplitCell,
    canMerge,
    canSplit
}: GridToolbarProps) {
    return (
        <TooltipProvider>
            <div className="flex items-center gap-2 p-2 px-4 border-b bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={onAddRow} className="h-8 w-8 p-0">
                                <ArrowDownFromLine className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Add Row</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={onRemoveRow} className="h-8 w-8 p-0 text-red-500 hover:text-red-600">
                                <Minus className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove Last Row</TooltipContent>
                    </Tooltip>
                </div>

                <Separator orientation="vertical" className="h-6" />

                <div className="flex items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={onAddCol} className="h-8 w-8 p-0">
                                <ArrowRightFromLine className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Add Column</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={onRemoveCol} className="h-8 w-8 p-0 text-red-500 hover:text-red-600">
                                <Minus className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove Last Column</TooltipContent>
                    </Tooltip>
                </div>

                <Separator orientation="vertical" className="h-6" />

                <div className="flex items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onMergeCells}
                                disabled={!canMerge}
                                className="h-8 w-8 p-0 disabled:opacity-30"
                            >
                                <Combine className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Merge Cells (Select a cell)</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onSplitCell}
                                disabled={!canSplit}
                                className="h-8 w-8 p-0 disabled:opacity-30"
                            >
                                <Split className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Split Cell</TooltipContent>
                    </Tooltip>
                </div>

                <div className="ml-auto text-xs text-muted-foreground mr-2">
                    <span className="hidden sm:inline">Grid Layout Actions</span>
                </div>
            </div>
        </TooltipProvider>
    )
}
