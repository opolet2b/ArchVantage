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
import { Label } from "@/components/ui/label";
import { LinkType } from "./canvas-store";
import { cn } from "@/lib/utils";
import { ArrowRight, Link2, GitBranch, Box, Trash2, Check, X, ArrowLeftRight, Zap, Ban, RefreshCw, ArrowUpRight } from "lucide-react";

// =============================================================================
// Link Type Configuration
// =============================================================================

interface LinkTypeConfig {
    type: LinkType;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
}

const LINK_TYPES: LinkTypeConfig[] = [
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
    onConfirm: (type: LinkType, label?: string) => void;
    onDelete?: () => void;
    initialType?: LinkType;
    initialLabel?: string;
    mode: "create" | "edit";
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
    mode,
}: LinkTypeDialogProps) {
    const [selectedType, setSelectedType] = React.useState<LinkType>(initialType);
    const [label, setLabel] = React.useState(initialLabel);

    // Reset state when dialog opens
    React.useEffect(() => {
        if (isOpen) {
            setSelectedType(initialType);
            setLabel(initialLabel);
        }
    }, [isOpen, initialType, initialLabel]);

    const handleConfirm = () => {
        onConfirm(selectedType, label || undefined);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {mode === "create" ? "Create Link" : "Edit Link"}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === "create"
                            ? "Choose the type of relationship between these items."
                            : "Update the type or label of this link."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Link Type Selection */}
                    <div className="space-y-2">
                        <Label>Link Type</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {LINK_TYPES.map((config) => {
                                const Icon = config.icon;
                                return (
                                    <button
                                        key={config.type}
                                        type="button"
                                        onClick={() => setSelectedType(config.type)}
                                        className={cn(
                                            "flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all",
                                            "hover:shadow-sm",
                                            selectedType === config.type
                                                ? config.color + " ring-2 ring-offset-1"
                                                : "bg-white border-slate-200 hover:border-slate-300"
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

                    {/* Optional Label */}
                    <div className="space-y-2">
                        <Label>Label (optional)</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g., 'supports', 'answers', 'summarizes'..."
                        />
                        <p className="text-xs text-muted-foreground">
                            Add a custom label to describe this specific relationship.
                        </p>
                    </div>
                </div>

                <DialogFooter className="flex justify-between">
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
                        <Button onClick={handleConfirm}>
                            {mode === "create" ? "Create Link" : "Update Link"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
