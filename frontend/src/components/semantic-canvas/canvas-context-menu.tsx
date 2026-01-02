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
import { API_URL } from "@/lib/utils";
import { useCanvasStore } from "./canvas-store";

// =============================================================================
// Types
// =============================================================================

export type AnalysisAction =
    | "discover_links"
    | "summary_analysis"
    | "identify_purpose"
    | string;

interface CanvasContextMenuProps {
    /** Whether the menu is open */
    isOpen: boolean;
    /** Position to display the menu */
    position: { x: number; y: number };
    /** Context: "canvas" applies to all things, "domain" to things in domain, "selection" to current selection */
    context: "canvas" | "domain" | "selection";
    /** Domain ID when context is "domain" */
    domainId?: string;
    /** Called when menu is closed */
    onClose: () => void;
    /** Called when an action is selected */
    onAction?: (action: AnalysisAction, context: "canvas" | "domain" | "selection", domainId?: string) => void;
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
    const selectedThingIds = useCanvasStore((state) => state.selectedThingIds);
    const selectedDomainIds = useCanvasStore((state) => state.selectedDomainIds);

    // Fetch available templates
    const [templates, setTemplates] = React.useState<any[]>([]);

    React.useEffect(() => {
        if (isOpen) {
            fetch(`${API_URL}/smart-templates/templates`)
                .then(res => res.json())
                .then(data => setTemplates(data))
                .catch(err => console.error("Failed to fetch templates", err));
        }
    }, [isOpen]);

    const groupedTemplates = React.useMemo(() => {
        const groups: Record<string, any[]> = {};
        for (const t of templates) {
            const cat = t.category_name || "Uncategorized";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(t);
        }
        return groups;
    }, [templates]);

    // Calculate item count based on context:
    // - Canvas: things NOT in any domain + domains count
    // - Selection: things in selection + things in selected domains.
    // Robust logic: Filter 'things' by the selected IDs to ensure we only count actual Things.
    const itemCount = React.useMemo(() => {
        console.log(`[CanvasContextMenu] Calc itemCount. Context: ${context}. SelectedThings: ${selectedThingIds.length}. SelectedDomains: ${selectedDomainIds.length}.`);

        if (context === "selection") {
            // Get things directly selected
            const selectedThings = things.filter(t => selectedThingIds.includes(t.id));

            // Get things inside selected domains (explicit recursion check in case store didn't sync yet, 
            // though store selectDomain should handle this. Doing it explicitly makes it robust.)
            const thingsInDomains = things.filter(t => t.domain_id && selectedDomainIds.includes(t.domain_id));

            // Combine and unique
            const uniqueThingIds = new Set([
                ...selectedThings.map(t => t.id),
                ...thingsInDomains.map(t => t.id)
            ]);

            // Log for debugging
            console.log(`[CanvasContextMenu] Selection Count Debug: Direct: ${selectedThings.length}, InDomains: ${thingsInDomains.length}, Unique: ${uniqueThingIds.size}`);

            return uniqueThingIds.size;
        }

        if (context === "domain" && domainId) {
            // Rule: All things inside the domain. Domain itself NOT counted.
            return things.filter((t) => t.domain_id === domainId).length;
        }

        // Rule: Canvas context
        // All Root Things (not in domain) AND all Domains.
        // Things inside domains are NOT counted.
        const thingsNotInDomain = things.filter((t) => t.domain_id === null || t.domain_id === undefined);
        return thingsNotInDomain.length + domains.length;
    }, [context, domainId, things, domains, selectedThingIds, selectedDomainIds]);

    // Get things in scope for the action (for logging/future use)
    const thingsInScope = React.useMemo(() => {
        if (context === "selection") {
            // Match itemCount logic:
            const selectedThings = things.filter(t => selectedThingIds.includes(t.id));
            const thingsInDomains = things.filter(t => t.domain_id && selectedDomainIds.includes(t.domain_id));

            const combined = [...selectedThings, ...thingsInDomains];
            const seen = new Set<string>();
            return combined.filter(t => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
        }
        if (context === "domain" && domainId) {
            return things.filter((t) => t.domain_id === domainId);
        }
        // Canvas context: Root things
        return things.filter((t) => !t.domain_id);
    }, [context, domainId, things, selectedThingIds, selectedDomainIds]);

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
    const contextLabel = context === "domain" ? "Domain" : context === "selection" ? "Selection" : "Canvas";

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
                    <DropdownMenuSubContent className="max-h-[300px] overflow-y-auto">
                        {Object.entries(groupedTemplates).map(([category, items], idx) => (
                            <React.Fragment key={category}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                                    {category}
                                </div>
                                {items.map((t: any) => (
                                    <DropdownMenuItem
                                        key={t.id}
                                        onClick={() => handleAction(`execute_template:${t.id}`)}
                                    >
                                        <TrendingUp className="mr-2 h-4 w-4" />
                                        <span>{t.name}</span>
                                    </DropdownMenuItem>
                                ))}
                                {idx < Object.keys(groupedTemplates).length - 1 && <DropdownMenuSeparator />}
                            </React.Fragment>
                        ))}
                        {templates.length === 0 && (
                            <div className="px-2 py-2 text-xs text-muted-foreground text-center">
                                No templates available
                            </div>
                        )}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
