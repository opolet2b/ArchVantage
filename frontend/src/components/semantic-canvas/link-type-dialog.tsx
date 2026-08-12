/**
 * Link Type Dialog
 *
 * Dialog for selecting the type of link when connecting things
 * and for editing existing link types.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, Link2, GitBranch, Box, Check, X, ArrowUpRight, ArrowLeftRight, Zap, Ban, RefreshCw, Trash2, ArrowLeft } from "lucide-react";
import { LinkType, CustomLinkType } from "./canvas-store";
import { cn } from "@/lib/utils";
import { getIconComponent } from "./icon-utils";



interface LinkTypeConfig {
    type: LinkType | string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
}

const DEFAULT_LINK_TYPES: LinkTypeConfig[] = [
    {
        type: "related",
        label: "Related",
        description: "General relationship between things",
        icon: Link2,
        color: "text-blue-600 bg-blue-50 border-blue-200",
    },
    {
        type: "references",
        label: "References",
        description: "One thing references or cites another",
        icon: ArrowRight,
        color: "text-green-600 bg-green-50 border-green-200",
    },
    {
        type: "derived_from",
        label: "Derived From",
        description: "One thing is created from or based on another",
        icon: GitBranch,
        color: "text-purple-600 bg-purple-50 border-purple-200",
    },
    {
        type: "contains",
        label: "Contains",
        description: "Parent-child containment relationship",
        icon: Box,
        color: "text-teal-600 bg-teal-50 border-teal-200",
    },
    {
        type: "proves",
        label: "Proves",
        description: "One thing provides evidence for another",
        icon: Check,
        color: "text-sky-600 bg-sky-50 border-sky-200",
    },
    {
        type: "refutes",
        label: "Refutes",
        description: "One thing contradicts or disproves another",
        icon: X,
        color: "text-red-600 bg-red-50 border-red-200",
    },
    {
        type: "prerequisite",
        label: "Prerequisite",
        description: "One thing must be completed before another",
        icon: ArrowUpRight,
        color: "text-orange-600 bg-orange-50 border-orange-200",
    },
    {
        type: "influences",
        label: "Influences",
        description: "One thing affects or impacts another",
        icon: ArrowLeftRight,
        color: "text-cyan-600 bg-cyan-50 border-cyan-200",
    },
    {
        type: "triggers",
        label: "Triggers",
        description: "One thing causes another to happen",
        icon: Zap,
        color: "text-yellow-600 bg-yellow-50 border-yellow-200",
    },
    {
        type: "blocks",
        label: "Blocks",
        description: "One thing prevents or impedes another",
        icon: Ban,
        color: "text-violet-600 bg-violet-50 border-violet-200",
    },
    {
        type: "supersedes",
        label: "Supersedes",
        description: "One thing replaces or obsoletes another",
        icon: RefreshCw,
        color: "text-slate-600 bg-slate-50 border-slate-200",
    },
];

// =============================================================================
// Link Type Dialog Props
// =============================================================================

interface LinkTypeDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (type: LinkType | string, label: string, description: string, reverseDirection?: boolean) => void;
    onDelete?: () => void;
    initialType?: LinkType | string;
    initialLabel?: string;
    initialDescription?: string;
    mode: "create" | "edit";
    availableLinkTypes?: CustomLinkType[];
    keepStandardLinks?: boolean;
}

// =============================================================================
// Link Type Dialog Component
// =============================================================================

export function LinkTypeDialog({
    isOpen,
    onClose,
    onConfirm,
    onDelete,
    initialType = "related",
    initialLabel = "",
    initialDescription = "",
    mode,
    availableLinkTypes,
    keepStandardLinks = false,
}: LinkTypeDialogProps) {
    const [selectedType, setSelectedType] = React.useState<LinkType | string>(initialType);
    const [label, setLabel] = React.useState(initialLabel);
    const [description, setDescription] = React.useState(initialDescription);
    const [reverseDirection, setReverseDirection] = React.useState(false);

    const effectiveLinkTypes = React.useMemo(() => {
        const customTypes = (Array.isArray(availableLinkTypes) && availableLinkTypes.length > 0)
            ? availableLinkTypes.map(ct => ({
                type: ct.id,
                label: ct.label,
                description: ct.description,
                icon: getIconComponent(ct.icon),
                color: ct.color // Pass raw hex color
            }))
            : [];

        if (customTypes.length > 0) {
            if (keepStandardLinks) {
                return [...DEFAULT_LINK_TYPES, ...customTypes];
            }
            return customTypes;
        }

        return DEFAULT_LINK_TYPES;
    }, [availableLinkTypes, keepStandardLinks]);

    // Reset state when dialog opens
    React.useEffect(() => {
        if (isOpen) {
            setSelectedType(initialType);
            setLabel(initialLabel);
            setDescription(initialDescription);
            setReverseDirection(false);
        }
    }, [isOpen, initialType, initialLabel, initialDescription]);

    const isValid = label.trim().length > 0 && description.trim().length > 0;

    const handleConfirm = () => {
        if (isValid) {
            onConfirm(selectedType, label, description, reverseDirection);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b shrink-0">
                    <DialogTitle>
                        {mode === "create" ? "Create Link" : "Edit Link"}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === "create"
                            ? "Choose the type of relationship between these items."
                            : "Update the type or label of this link."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 px-6 py-4 flex-1 overflow-y-auto min-h-0">
                    {/* Link Type Selection */}
                    <div className="space-y-2">
                        <Label>Link Type</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {effectiveLinkTypes.map((config) => {
                                const Icon = config.icon;
                                const isSelected = selectedType === config.type;
                                const isHex = config.color.startsWith("#");

                                return (
                                    <button
                                        key={config.type}
                                        type="button"
                                        onClick={() => setSelectedType(config.type)}
                                        style={
                                            isSelected && isHex
                                                ? {
                                                    borderColor: config.color,
                                                    backgroundColor: `${config.color}15`, // low opacity
                                                    color: config.color,
                                                    boxShadow: `0 0 0 2px ${config.color}`
                                                }
                                                : isHex
                                                    ? { color: config.color, borderColor: `${config.color}40` }
                                                    : undefined
                                        }
                                        className={cn(
                                            "flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all",
                                            "hover:shadow-sm",
                                            isSelected
                                                ? (isHex ? "ring-offset-1" : config.color + " ring-2 ring-offset-1")
                                                : "bg-white hover:border-slate-300",
                                            !isSelected && !isHex && "border-slate-200"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Icon className="h-4 w-4" />
                                            <span className="font-medium text-sm">
                                                {config.label}
                                            </span>
                                        </div>
                                        <span className="text-xs text-muted-foreground text-left">
                                            {config.description}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Label (Mandatory) */}
                    <div className="space-y-2">
                        <Label>Label <span className="text-red-500">*</span></Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g., 'supports', 'answers', 'summarizes'..."
                        />
                        <p className="text-xs text-muted-foreground">
                            A short phrase to describe this relationship.
                        </p>
                    </div>

                    {/* Description (Mandatory) */}
                    <div className="space-y-2">
                        <Label>Description <span className="text-red-500">*</span></Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detailed explanation of why this link exists..."
                            rows={3}
                        />
                        <p className="text-xs text-muted-foreground">
                            Provide context on why these items are related.
                        </p>
                    </div>

                    {/* Reverse Direction Switch */}
                    {mode === "create" && (
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50">
                            <div className="space-y-0.5">
                                <Label className="flex items-center gap-2">
                                    <ArrowLeft className="h-4 w-4" />
                                    Reverse Direction
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Make the target point back to the source instead.
                                </p>
                            </div>
                            <Switch
                                checked={reverseDirection}
                                onCheckedChange={setReverseDirection}
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="flex justify-between px-6 py-4 border-t shrink-0">
                    <div>
                        {mode === "edit" && onDelete && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                    onDelete();
                                    onClose();
                                }}
                            >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete Link
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={handleConfirm} disabled={!isValid}>
                            {mode === "create" ? "Create Link" : "Update Link"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
