import { CanvasThing, DropZone } from "@/components/semantic-canvas/canvas-store";

/**
 * Result of a layout calculation.
 * Map of thing ID to new {x, y} position.
 */
export type LayoutResult = Record<string, { x: number; y: number }>;

/**
 * Calculates the new positions for things within a drop zone based on the layout mode.
 * 
 * @param zone The target drop zone definition.
 * @param zoneRect The bounding box of the zone relative to the domain {x, y, width, height}.
 * @param things The list of things currently inside this zone.
 * @returns A map of updates for the things.
 */
export function recalculateZoneLayout(
    zone: DropZone,
    zoneRect: { width: number; height: number; x: number; y: number },
    things: CanvasThing[]
): LayoutResult {
    const mode = zone.layout_mode || "tiled";
    const updates: LayoutResult = {};

    // Filter things (sanity check) and sort by current position to maintain stability?
    // Or sort by index if available? For now, sort by Y then X to keep visual order.
    const sortedThings = [...things].sort((a, b) => {
        const rowDiff = Math.abs(a.position_y - b.position_y);
        if (rowDiff > 50) return a.position_y - b.position_y; // Distinct rows
        return a.position_x - b.position_x;
    });

    if (mode === "tiled") {
        return calculateTiledLayout(zoneRect, sortedThings);
    } else if (mode === "stacked") {
        return calculateStackedLayout(zoneRect, sortedThings);
    }

    return updates;
}

/**
 * Checks if the things fit within the zone boundaries given the current settings.
 */
export function checkZoneLayoutFit(
    zone: DropZone,
    zoneRect: { width: number; height: number; x: number; y: number },
    things: CanvasThing[]
): boolean {
    const layout = recalculateZoneLayout(zone, zoneRect, things);
    const pos = Object.values(layout);

    // Check if any item goes out of bounds
    // We assume item size is roughly ITEM_WIDTH/HEIGHT
    const ITEM_WIDTH = 120; // Correct component width
    const ITEM_HEIGHT = 80; // Standardized height

    for (const p of pos) {
        if (p.x + ITEM_WIDTH > zoneRect.x + zoneRect.width + 10) return false; // Tolerance
        if (p.y + ITEM_HEIGHT > zoneRect.y + zoneRect.height + 10) return false;
    }
    return true;
}

function calculateTiledLayout(
    zoneRect: { width: number; height: number; x: number; y: number },
    things: CanvasThing[]
): LayoutResult {
    const updates: LayoutResult = {};

    // Constants (Tuned for Iconified Items)
    // ThingNode.tsx uses w-[120px] h-[80px].
    const ITEM_WIDTH = 120;
    const ITEM_HEIGHT = 80;
    const GAP = 8;
    const PADDING = 16;

    // Calculate columns
    const availableWidth = zoneRect.width - (PADDING * 2);
    const cols = Math.max(1, Math.floor(availableWidth / (ITEM_WIDTH + GAP)));

    things.forEach((thing, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        const x = zoneRect.x + PADDING + (col * (ITEM_WIDTH + GAP));
        const y = zoneRect.y + PADDING + (row * (ITEM_HEIGHT + GAP));

        updates[thing.id] = { x, y };
    });

    return updates;
}

function calculateStackedLayout(
    zoneRect: { width: number; height: number; x: number; y: number },
    things: CanvasThing[]
): LayoutResult {
    const updates: LayoutResult = {};

    // Stacking Constants
    const OFFSET_X = 15;
    const OFFSET_Y = 15;
    const START_X = zoneRect.x + 20;
    const START_Y = zoneRect.y + 20;
    const MAX_STACK = 5; // Start new stack after 5 items

    // We can have multiple stacks if too many items
    // arranged in a grid of stacks
    const STACK_WIDTH = 140; // Approx width of a stack pile
    const STACK_HEIGHT = 140;

    const availableWidth = zoneRect.width - 40;
    const stacksPerRow = Math.max(1, Math.floor(availableWidth / STACK_WIDTH));

    things.forEach((thing, index) => {
        // which stack pile?
        const stackIndex = Math.floor(index / MAX_STACK);
        const itemInStack = index % MAX_STACK;

        const stackCol = stackIndex % stacksPerRow;
        const stackRow = Math.floor(stackIndex / stacksPerRow);

        const stackBaseX = START_X + (stackCol * STACK_WIDTH);
        const stackBaseY = START_Y + (stackRow * STACK_HEIGHT);

        const x = stackBaseX + (itemInStack * OFFSET_X);
        const y = stackBaseY + (itemInStack * OFFSET_Y);

        updates[thing.id] = { x, y };
    });

    return updates;
}
