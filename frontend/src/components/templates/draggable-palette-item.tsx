"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface DraggablePaletteItemProps {
    type: string;
    label: string;
    icon: LucideIcon;
    colorClass: string;
    collapsed?: boolean;
}

export function DraggablePaletteItem({ type, label, icon: Icon, colorClass, collapsed }: DraggablePaletteItemProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `palette-${type}`,
        data: {
            type,
            isPaletteItem: true
        }
    });

    if (collapsed) {
        return (
            <div ref={setNodeRef} {...listeners} {...attributes} className={cn("w-10 h-10 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing", isDragging && "opacity-50")}>
                <div title={label}>
                    <Icon className={cn("h-5 w-5", colorClass)} />
                </div>
            </div>
        );
    }

    return (
        <Button
            ref={setNodeRef}
            variant="outline"
            className={cn(
                "w-full justify-start gap-2 h-10 cursor-grab active:cursor-grabbing",
                isDragging ? "opacity-50" : ""
            )}
            {...listeners}
            {...attributes}
        >
            <Icon className={cn("h-4 w-4", colorClass)} />
            {label}
        </Button>
    );
}
