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
}

export function DraggablePaletteItem({ type, label, icon: Icon, colorClass }: DraggablePaletteItemProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `palette-${type}`,
        data: {
            type,
            isPaletteItem: true
        }
    });

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
