/**
 * Canvas Context Menu
 *
 * Right-click context menu for canvas and domain operations.
 * Provides AI-powered analysis options for things in scope.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import {
    Link2,
    FileText,
    Target,
    MoreHorizontal,
    TrendingUp,
    Grid3X3,
    GitCompare,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useCanvasStore } from "./canvas-store";

// =============================================================================
// Types
// =============================================================================

export type AnalysisAction =
    | "discover_links"
    | "summary_analysis"
    | "identify_purpose"
    | "benchmark"
    | "swot"
    | "comparison";

interface CanvasContextMenuProps {
    /** Whether the menu is open */
    isOpen: boolean;
    /** Position to display the menu */
    position: { x: number; y: number };
    /** Context: "canvas" applies to all things, "domain" to things in domain */
    context: "canvas" | "domain";
    /** Domain ID when context is "domain" */
    domainId?: string;
    /** Called when menu is closed */
    onClose: () => void;
    /** Called when an action is selected */
    onAction?: (action: AnalysisAction, context: "canvas" | "domain", domainId?: string) => void;
}

// =============================================================================
// Canvas Context Menu Component
// =============================================================================

export function CanvasContextMenu({
    isOpen,
    position,
    context,
    domainId,
    onClose,
    onAction,
}: CanvasContextMenuProps) {
    const things = useCanvasStore((state) => state.things);
    const domains = useCanvasStore((state) => state.domains);
    const selectedModel = useCanvasStore((state) => state.selectedModel);

    // Calculate item count based on context:
    // - Canvas: things NOT in any domain + domains count
    // - Domain: things in that specific domain
    const itemCount = React.useMemo(() => {
        if (context === "domain" && domainId) {
            // Count things in the specific domain
            return things.filter((t) => t.domain_id === domainId).length;
        }
        // Canvas: things without domain + domain count
        const thingsNotInDomain = things.filter((t) => t.domain_id === null || t.domain_id === undefined);
        return thingsNotInDomain.length + domains.length;
    }, [context, domainId, things, domains]);

    // Get things in scope for the action (for logging/future use)
    const thingsInScope = React.useMemo(() => {
        if (context === "domain" && domainId) {
            return things.filter((t) => t.domain_id === domainId);
        }
        // All things for canvas context (domains handled separately)
        return things.filter((t) => !t.domain_id);
    }, [context, domainId, things]);

    // Handle action selection
    const handleAction = (action: AnalysisAction) => {
        console.log(
            `[ContextMenu] Action: ${action}, Context: ${context}, ` +
            `DomainId: ${domainId || "N/A"}, Items in scope: ${itemCount}, ` +
            `Model: ${selectedModel || "default"}`
        );

        if (onAction) {
            onAction(action, context, domainId);
        }

        onClose();
    };

    // Context label for menu header
    const contextLabel = context === "domain" ? "Domain" : "Canvas";

    if (!isOpen) return null;

    return (
        <DropdownMenu open={isOpen} onOpenChange={(open) => !open && onClose()}>
            {/* Invisible trigger positioned at click location */}
            <div
                style={{
                    position: "fixed",
                    left: position.x,
                    top: position.y,
                    width: 1,
                    height: 1,
                }}
            />
            <DropdownMenuContent
                className="w-56"
                style={{
                    position: "fixed",
                    left: position.x,
                    top: position.y,
                }}
                onEscapeKeyDown={onClose}
                onInteractOutside={onClose}
            >
                {/* Header showing context */}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b mb-1">
                    {contextLabel} Analysis ({itemCount} items)
                </div>

                {/* Main actions */}
                <DropdownMenuItem onClick={() => handleAction("discover_links")}>
                    <Link2 className="mr-2 h-4 w-4" />
                    <span>Discover Links</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => handleAction("summary_analysis")}>
                    <FileText className="mr-2 h-4 w-4" />
                    <span>Summary Analysis</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => handleAction("identify_purpose")}>
                    <Target className="mr-2 h-4 w-4" />
                    <span>Identify Purpose</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Sub-menu for other analyses */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <MoreHorizontal className="mr-2 h-4 w-4" />
                        <span>Other Analyses</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => handleAction("benchmark")}>
                            <TrendingUp className="mr-2 h-4 w-4" />
                            <span>Benchmark</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAction("swot")}>
                            <Grid3X3 className="mr-2 h-4 w-4" />
                            <span>SWOT</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAction("comparison")}>
                            <GitCompare className="mr-2 h-4 w-4" />
                            <span>Comparison</span>
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
