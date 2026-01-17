"use client";

import React, { useState, useEffect } from "react";
import DeckGL from "@deck.gl/react";
import { OrbitView } from "@deck.gl/core";
import { PolygonLayer, TextLayer, BitmapLayer, IconLayer, SimpleMeshLayer } from "deck.gl";
// import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { spacesService, AnalysisSpace } from "@/lib/spaces-service";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { CanvasThumbnailGenerator } from "./canvas-thumbnail-generator";
import { ArcLayer } from "@deck.gl/layers";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Canvas } from "../semantic-canvas/canvas-store";
import { API_URL } from "@/lib/utils";

interface SpaceViewerProps {
    spaceId: string;
}

const INITIAL_VIEW_STATE: any = {
    target: [0, 0, 0],
    rotationX: 30,
    rotationOrbit: -30,
    orbitAxis: 'Z',
    fov: 50,
    minZoom: -10,
    maxZoom: 10,
    zoom: 1
};




// Define Cone/Pyramid Mesh manually
// Define Cone/Pyramid Mesh manually


// Helper to generate 3D Arrow Faces (Pyramid)
// Helper to generate 3D Arrow Faces (Cone Approximation)
// Helper to generate 3D Arrow Faces (Cone Approximation)
const generateArrowFaces = (arcs: any[]) => {
    const faces: any[] = [];
    const HEAD_LEN = 10; // Length of arrow head
    const HEAD_WIDTH = 4;  // Width of arrow base
    const SEGMENTS = 12; // Number of segments for cone approximation

    arcs.forEach((arc) => {
        // NOTE: arc.source and arc.target in the 'arcs' array might have been offset for the line drawing.
        // We need the *original* target for the arrow tip.
        // But in our logic below, we will pass explicit 'tip' property in the arc data if needed,
        // or assume arc.target is the LINK END and we need to extrapolate?
        // Actually, the requirement is: Link stops at Base. Arrow starts at Base, ends at Tip.
        // So arc.target IS the Base (where blue line ends).
        // And the Arrow Tip is 'Base + Vector * HEAD_LEN'.

        // Let's assume 'arcs' data has 'source' and 'target' which are the endpoints of the BLUE LINE.
        // So 'target' is the Arrow Base.

        const s = arc.source;
        const t = arc.target; // This is the Base of the arrow

        // Vector V from Source to Base
        let vx = t[0] - s[0];
        let vy = t[1] - s[1];
        let vz = t[2] - s[2];

        // Normalize
        const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
        vx /= len; vy /= len; vz /= len;

        // Tip Position: Base + V * HEAD_LEN
        const tip = [t[0] + vx * HEAD_LEN, t[1] + vy * HEAD_LEN, t[2] + vz * HEAD_LEN];

        // Base Center is 't'
        const bx = t[0];
        const by = t[1];
        const bz = t[2];

        // Coordinate Basis for Circle generation (Perpendicular to V)
        let ux = 0, uy = 0, uz = 1;
        if (Math.abs(vz) > 0.99) { ux = 0; uy = 1; uz = 0; }

        let rx = vy * uz - vz * uy;
        let ry = vz * ux - vx * uz;
        let rz = vx * uy - vy * ux;
        const rlen = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
        rx /= rlen; ry /= rlen; rz /= rlen;

        ux = ry * vz - rz * vy;
        uy = rz * vx - rx * vz;
        uz = rx * vy - ry * vx;

        const w = HEAD_WIDTH / 2;

        // Generate Circle Points
        const circlePoints = [];
        for (let i = 0; i < SEGMENTS; i++) {
            const angle = (i / SEGMENTS) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            // Point = Base + (R * cos * w) + (U * sin * w)
            circlePoints.push([
                bx + (rx * cos + ux * sin) * w,
                by + (ry * cos + uy * sin) * w,
                bz + (rz * cos + uz * sin) * w
            ]);
        }

        const color = arc.type;

        // Cone Faces (Tip -> Base Circle Segments)
        for (let i = 0; i < SEGMENTS; i++) {
            const p1 = circlePoints[i];
            const p2 = circlePoints[(i + 1) % SEGMENTS];
            faces.push({ polygon: [p1, p2, tip], type: color });
        }

        // Base Cap (Circle Fan)
        // Simple approach: Center to Edge
        // Or just one big polygon if convex? PolygonLayer handles convex polygons.
        // A circle is convex.
        faces.push({ polygon: circlePoints, type: color });
    });
    return faces;
};

// Helper to generate 3D Tube Faces (Cylinder)
const generateTubeFaces = (arcs: any[]) => {
    const faces: any[] = [];
    const RADIUS = 0.5; // Tube thickness (half width)
    const SEGMENTS = 6; // Hexagonal Tube is enough for thin lines

    arcs.forEach((arc) => {
        const s = arc.source;
        const t = arc.target; // Arrow Base (Link End)

        let vx = t[0] - s[0];
        let vy = t[1] - s[1];
        let vz = t[2] - s[2];
        const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;

        // Coordinate Basis (same as arrow)
        let ux = 0, uy = 0, uz = 1;
        if (Math.abs(vz / len) > 0.99) { ux = 0; uy = 1; uz = 0; }

        let rx = vy * uz - vz * uy;
        let ry = vz * ux - vx * uz;
        let rz = vx * uy - vy * ux;
        const rlen = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
        rx /= rlen; ry /= rlen; rz /= rlen;

        ux = ry * vz - rz * vy;
        uy = rz * vx - rx * vz;
        uz = rx * vy - ry * vx;
        // Normalize U? (Cross product of unit vectors is unit if perp, but V is not unit)
        // V is not unit here! V is full vector.
        // Let's normalize U correctly.
        const ulen = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
        ux /= ulen; uy /= ulen; uz /= ulen;

        // Generate Circle Points at Source (S) and Target (T)
        // We really just need the offsets.
        const offsets = [];
        for (let i = 0; i < SEGMENTS; i++) {
            const angle = (i / SEGMENTS) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            offsets.push({
                x: (rx * cos + ux * sin) * RADIUS,
                y: (ry * cos + uy * sin) * RADIUS,
                z: (rz * cos + uz * sin) * RADIUS
            });
        }

        const color = arc.type;

        // Side Faces (Quads)
        for (let i = 0; i < SEGMENTS; i++) {
            const next = (i + 1) % SEGMENTS;

            const p1 = [s[0] + offsets[i].x, s[1] + offsets[i].y, s[2] + offsets[i].z];
            const p2 = [s[0] + offsets[next].x, s[1] + offsets[next].y, s[2] + offsets[next].z];
            const p3 = [t[0] + offsets[next].x, t[1] + offsets[next].y, t[2] + offsets[next].z];
            const p4 = [t[0] + offsets[i].x, t[1] + offsets[i].y, t[2] + offsets[i].z];

            faces.push({
                polygon: [p1, p2, p3, p4],
                type: color,
                sourceName: arc.sourceName,
                targetName: arc.targetName,
                sourceCanvasName: arc.sourceCanvasName,
                targetCanvasName: arc.targetCanvasName
            });
        }

        // Caps? Not strictly needed if they connect to nodes/arrows, but good for completeness.
        // Can skip for optimization.
    });
    return faces;
};

export function SpaceViewer({ spaceId }: SpaceViewerProps) {
    const [space, setSpace] = useState<AnalysisSpace | null>(null);
    const router = useRouter();
    const { toast } = useToast();

    // Data State
    const [fullCanvasData, setFullCanvasData] = useState<Record<string, Canvas>>({});
    const [linkData, setLinkData] = useState<any[]>([]);

    // Processing State
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingQueue, setProcessingQueue] = useState<string[]>([]);
    const [processedCount, setProcessedCount] = useState(0);
    const [totalToProcess, setTotalToProcess] = useState(0);

    // Dialog State
    const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
    const [pendingSpaceData, setPendingSpaceData] = useState<AnalysisSpace | null>(null);



    // Use text-based or generated icon for arrows to avoid complex mesh imports
    const arrowIconUrl = React.useMemo(() => {
        if (typeof document === 'undefined') return '';
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Draw Triangle (pointing UP, standard for IconLayer 0 rotation)
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.moveTo(32, 10);
            ctx.lineTo(54, 54);
            ctx.lineTo(10, 54);
            ctx.closePath();
            ctx.fill();
        }
        return canvas.toDataURL();
    }, []);

    useEffect(() => {
        loadSpace();
    }, [spaceId]);

    const loadSpace = async () => {
        try {
            const data = await spacesService.getById(spaceId);

            // Check if we have thumbnails for all
            const missingThumbnails = data.canvases?.some((c: any) => !c.owner_config?.thumbnail);

            if (missingThumbnails) {
                // If thumbnails are missing, valid flow is to auto-generate or prompt. 
                // For now, let's just proceed to set space and let the user decide via prompt if they want fresh ones.
                // Actually, if missing, we should probably force generate or at least queue them.
            }

            setSpace(data);
            setPendingSpaceData(data);

            // Only show dialog if we have data
            if (data.canvases && data.canvases.length > 0) {
                setRegenerateDialogOpen(true);
                // Trigger background fetch for links immediately
                fetchFullDetails(data.canvases.map((c: any) => c.id));
            }

        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "Failed to load space",
                variant: "destructive"
            });
        }
    };

    const handleConfirmRegenerate = () => {
        if (!pendingSpaceData) return;
        setSpace(pendingSpaceData);
        setRegenerateDialogOpen(false);

        // Start processing all
        if (pendingSpaceData.canvases && pendingSpaceData.canvases.length > 0) {
            const ids = pendingSpaceData.canvases.map((c: any) => c.id);
            setProcessingQueue(ids);
            setTotalToProcess(ids.length);
            setProcessedCount(0);
            setIsProcessing(true);
        }
    };

    const handleSkipRegenerate = () => {
        if (!pendingSpaceData) return;
        setSpace(pendingSpaceData);
        setRegenerateDialogOpen(false);
    };

    const fetchFullDetails = async (canvasIds: string[]) => {
        const token = localStorage.getItem("token");
        const results: Record<string, Canvas> = {};

        await Promise.all(canvasIds.map(async (id) => {
            try {
                const res = await fetch(`${API_URL}/canvases/${id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const canvas = await res.json();
                    results[id] = canvas;
                }
            } catch (e) {
                console.error(`Failed to fetch canvas ${id}`, e);
            }
        }));

        setFullCanvasData(results);
    };

    const handleThumbnailComplete = () => {
        setProcessedCount(prev => prev + 1);
        setProcessingQueue(prev => prev.slice(1));

        // Refresh space data silently to update the current thumbnail in view
        spacesService.getById(spaceId).then(data => {
            setSpace(prev => prev ? ({ ...prev, canvases: data.canvases }) : data);
        });
    };

    const handleThumbnailError = (err: string) => {
        console.error("Thumbnail generation error:", err);
        // Skip on error
        setProcessedCount(prev => prev + 1);
        setProcessingQueue(prev => prev.slice(1));
    };

    useEffect(() => {
        if (isProcessing && processingQueue.length === 0) {
            // Done
            setIsProcessing(false);
            // Refresh space data to get new thumbnails
            spacesService.getById(spaceId).then(setSpace);
        }
    }, [isProcessing, processingQueue, spaceId]);

    const handleMoveUp = async (index: number) => {
        if (!space || index >= space.canvases.length - 1) return; // Already at top
        const newCanvases = [...space.canvases];
        // Swap with next one (higher index = higher elevation)
        [newCanvases[index], newCanvases[index + 1]] = [newCanvases[index + 1], newCanvases[index]];

        // Optimistic update
        setSpace({ ...space, canvases: newCanvases });

        try {
            await spacesService.reorderCanvases(space.id, newCanvases.map(c => c.id));
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to reorder", variant: "destructive" });
            loadSpace(); // Revert
        }
    };

    const handleMoveDown = async (index: number) => {
        if (!space || index <= 0) return; // Already at bottom
        const newCanvases = [...space.canvases];
        // Swap with previous one
        [newCanvases[index], newCanvases[index - 1]] = [newCanvases[index - 1], newCanvases[index]];

        setSpace({ ...space, canvases: newCanvases });

        try {
            await spacesService.reorderCanvases(space.id, newCanvases.map(c => c.id));
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to reorder", variant: "destructive" });
            loadSpace();
        }
    };

    if (!space) return <div className="p-8">Loading Space...</div>;

    if (isProcessing) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                <div className="space-y-4 text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                    <h2 className="text-xl font-semibold">Processing Space...</h2>
                    <p className="text-muted-foreground">
                        Updating canvas thumbnails ({processedCount} / {totalToProcess})
                    </p>
                    {/* Render the current generator off-screen/hidden via component implementation */}
                    {processingQueue.length > 0 && (
                        <CanvasThumbnailGenerator
                            key={processingQueue[0]}
                            canvasId={processingQueue[0]}
                            onComplete={handleThumbnailComplete}
                            onError={handleThumbnailError}
                        />
                    )}
                </div>
            </div>
        );
    }

    // Calculate 3D positions for canvases (Grid Layout)
    const layers = [];
    const CANVAS_WIDTH = 400;
    const CANVAS_HEIGHT = 225; // 16:9 Aspect Ratio to match stored thumbnails
    const GAP = 100;
    const COLS = 3;

    // Generate gradient image for fallback
    const generateGradientImage = (id: string) => {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Deterministic gradient
        const gradient = ctx.createLinearGradient(0, 0, 400, 300);
        gradient.addColorStop(0, `#${id.slice(0, 6)}`);
        gradient.addColorStop(1, `#${id.slice(-6)}`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 300);

        // Add "Untitled" placeholder text style
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CANVAS', 200, 150);

        return canvas.toDataURL();
    };

    if (space.canvases && space.canvases.length > 0) {
        const canvasData = space.canvases.map((canvas: any, index: number) => {
            // Stacked Layout: All at (0,0) but different Z
            const x = - (CANVAS_WIDTH / 2); // Center X
            const y = - (CANVAS_HEIGHT / 2); // Center Y (mapped to Z in deckGL bounds if we treat it as ground plane)
            // Wait, OrbitView Z is "up".
            // Let's place them on standard XY plane and move up in Z.

            // X and Y coordinates (Ground plane)
            // We want them centered.
            // Bounds: [minX, minY, maxX, maxY]
            const bounds = [-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2];

            const thumbnail = canvas.owner_config?.thumbnail || generateGradientImage(canvas.id);

            // Stacked Z-Elevation
            const elevation = index * 200; // 200 unit gap between layers

            return {
                id: canvas.id,
                name: canvas.name,
                image: thumbnail,
                bounds: bounds as any,
                elevation: elevation,
                // Model matrix for BitmapLayer to handle elevation
                modelMatrix: [
                    1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    0, 0, elevation, 1
                ] as any,
                position: [bounds[0], bounds[3], elevation], // Anchor for TextLayer
                // Polygon for frame/highlight with Z elevation
                polygon: [
                    [bounds[0], bounds[1], elevation], // bl
                    [bounds[2], bounds[1], elevation], // br
                    [bounds[2], bounds[3], elevation], // tr
                    [bounds[0], bounds[3], elevation]  // tl
                ]
            };
        });

        // Layer 1: Bitmaps (Images)
        // Note: BitmapLayer bounds are [left, bottom, right, top].
        // In OrbitView, this maps to [x_min, y_min, x_max, y_max] at Z=0.
        // To move to Z=elevation, we use modelMatrix translation.
        canvasData.forEach(d => {
            if (d.image) {
                layers.push(
                    new BitmapLayer({
                        id: `bitmap-${d.id}`,
                        bounds: d.bounds,
                        image: d.image,
                        pickable: true,
                        modelMatrix: d.modelMatrix,
                        onClick: (info: any) => {
                            router.push(`/canvas/${d.id}`);
                        }
                    })
                );
            }
        });

        // Layer 2: Frame/Outline (PolygonLayer)
        // PolygonLayer handles 3D coordinates natively.
        const frameData = canvasData.map(d => ({
            polygon: d.polygon,
            id: d.id,
            elevation: d.elevation
        }));

        layers.push(
            new PolygonLayer({
                id: 'canvas-frames',
                data: frameData,
                pickable: false,
                stroked: true,
                filled: false,
                wireframe: true,
                lineWidthMinPixels: 2,
                getPolygon: (d: any) => d.polygon,
                getLineColor: [200, 200, 200],
                getLineWidth: 2,
                autoHighlight: false
            })
        );

        // Layer 3: Titles
        layers.push(
            new TextLayer({
                id: 'canvas-titles',
                data: canvasData,
                pickable: false,
                // Position text at the top-left of the board, slightly above in Z + slight Y offset for label
                // d.bounds is [minX, minY, maxX, maxY]
                // d.elevation is Z
                getPosition: (d: any) => [d.bounds[0], d.bounds[3] - 20, d.elevation],
                getText: (d: any) => d.name,
                getSize: 32,
                getAngle: 0,
                getTextAnchor: 'start',
                getAlignmentBaseline: 'top',
                getColor: [0, 0, 0],
                // Add Font Styling
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                background: true,
                backgroundColor: [255, 255, 255, 200]
            })
        );



        // Layer 4: Links (ArcLayer)
        const arcs: any[] = [];
        console.log("[SpaceViewer] Calculating Arcs. FullCanvasData keys:", Object.keys(fullCanvasData).length);

        Object.values(fullCanvasData).forEach(sourceCanvas => {
            const sourceIndex = space.canvases.findIndex((c: any) => c.id === sourceCanvas.id);
            if (sourceIndex === -1) return;
            const sourceElevation = sourceIndex * 200;

            // Helper to project node to World Coordinates matching the 16:9 Thumbnail
            const getProjectedPos = (canvas: Canvas, cx: number, cy: number, elevation: number) => {
                const things = canvas.things || [];
                const domains = canvas.domains || [];
                // If both empty, return center
                if (things.length === 0 && domains.length === 0) return [0, 0, elevation];

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                things.forEach(t => {
                    minX = Math.min(minX, t.position_x);
                    minY = Math.min(minY, t.position_y);
                    maxX = Math.max(maxX, (t.position_x + (t.width || 400)));
                    maxY = Math.max(maxY, (t.position_y + (t.height || 200)));
                });

                domains.forEach(d => {
                    minX = Math.min(minX, d.position_x);
                    minY = Math.min(minY, d.position_y);
                    maxX = Math.max(maxX, (d.position_x + (d.width || 300)));
                    maxY = Math.max(maxY, (d.position_y + (d.height || 200)));
                });

                const w = maxX - minX || 1;
                const h = maxY - minY || 1;

                // Target is 16:9 Image Frame
                const targetAspect = 16 / 9;
                const contentAspect = w / h;

                // FitView Logic: Scale content to fit in frame with padding
                // Generator uses 0.2 padding
                const pad = 0.2;

                let viewW, viewH;

                if (contentAspect > targetAspect) {
                    // Width constrained
                    viewW = w * (1 + pad * 2);
                    viewH = viewW / targetAspect;
                } else {
                    // Height constrained
                    viewH = h * (1 + pad * 2);
                    viewW = viewH * targetAspect;
                }

                const viewMinX = minX + w / 2 - viewW / 2;
                const viewMinY = minY + h / 2 - viewH / 2;

                const u = (cx - viewMinX) / viewW;
                const v = (cy - viewMinY) / viewH;

                // Map U,V (0..1) to World Quad (-200..200, 112.5..-112.5)
                // Y is flipped (Texture starts top-left, World Y up)
                const wx = -200 + (u * 400);
                const wy = 112.5 - (v * 225); // 225 height / 2 = 112.5

                return [wx, wy, elevation];
            };

            sourceCanvas.things.forEach(thing => {
                // Check external links
                if (thing.content && Array.isArray((thing.content as any).external_links)) {
                    (thing.content as any).external_links.forEach((link: any) => {
                        console.log("[SpaceViewer] Found external link:", link);
                        const targetCanvas = fullCanvasData[link.targetCanvasId];
                        if (!targetCanvas) return;

                        const targetIndex = space.canvases.findIndex((c: any) => c.id === link.targetCanvasId);
                        if (targetIndex === -1) return;
                        const targetElevation = targetIndex * 200;

                        const targetNode = targetCanvas.things.find(t => t.id === link.targetNodeId);
                        if (!targetNode) return;

                        // Center of nodes (using same defaults as getProjectedPos: 400x200)
                        const sx = thing.position_x + (thing.width || 400) / 2;
                        const sy = thing.position_y + (thing.height || 200) / 2;
                        const tx = targetNode.position_x + (targetNode.width || 400) / 2;
                        const ty = targetNode.position_y + (targetNode.height || 200) / 2;

                        const start = getProjectedPos(sourceCanvas, sx, sy, sourceElevation);
                        const rawEnd = getProjectedPos(targetCanvas, tx, ty, targetElevation);

                        // Shorten Link for Arrow (10 units)
                        let vx = rawEnd[0] - start[0];
                        let vy = rawEnd[1] - start[1];
                        let vz = rawEnd[2] - start[2];
                        const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
                        // Avoid over-shortening if link is tiny
                        // Avoid over-shortening if link is tiny
                        const shortenBy = Math.min(len - 1, 10);

                        const end = [
                            rawEnd[0] - (vx / len) * shortenBy,
                            rawEnd[1] - (vy / len) * shortenBy,
                            rawEnd[2] - (vz / len) * shortenBy
                        ];

                        arcs.push({
                            source: start,
                            target: end,
                            type: link.type || 'related',
                            label: link.label,
                            sourceName: (thing.content as any)?.title || (thing.content as any)?.text || "Source Node",
                            targetName: (targetNode.content as any)?.title || (targetNode.content as any)?.text || "Target Node",
                            sourceCanvasName: sourceCanvas.name,
                            targetCanvasName: targetCanvas.name
                        });
                    });
                }
            });
        });

        console.log("[SpaceViewer] Final Arcs count:", arcs.length);

        // Helper for Link Colors
        const getLinkColorRgb = (type: string): [number, number, number] => {
            switch (type) {
                case "related": return [59, 130, 246]; // blue
                case "references": return [34, 197, 94]; // green
                case "derived_from": return [168, 85, 247]; // purple
                case "contains": return [20, 184, 166]; // teal
                case "proves": return [14, 165, 233]; // sky blue
                case "refutes": return [239, 68, 68]; // red
                case "prerequisite": return [249, 115, 22]; // orange
                case "influences": return [6, 182, 212]; // cyan
                case "triggers": return [234, 179, 8]; // yellow
                case "blocks": return [168, 85, 247]; // violet
                case "supersedes": return [100, 116, 139]; // slate
                default: return [99, 102, 241]; // indigo
            }
        };

        // Layer 4: Links (3D Tubes)
        const tubeFaces = generateTubeFaces(arcs);
        layers.push(
            new PolygonLayer({
                id: 'link-tubes',
                data: tubeFaces,
                pickable: true,
                stroked: false,
                filled: true,
                extruded: false,
                wireframe: false,
                getPolygon: (d: any) => d.polygon,
                getFillColor: (d: any) => [...getLinkColorRgb(d.type), 255],
                onClick: (info: any) => {
                    const d = info.object;
                    if (d) {
                        toast({
                            title: "Link Details",
                            description: `${d.sourceName} (${d.sourceCanvasName}) ➝ ${d.targetName} (${d.targetCanvasName})`,
                        });
                    }
                },
                parameters: {
                    depthTest: true,
                    cull: false
                }
            })
        );



        // Layer 5: Link Labels (Elegant Thin Font)
        layers.push(
            new TextLayer({
                id: 'link-labels',
                data: arcs,
                pickable: false,
                getPosition: (d: any) => [
                    (d.source[0] + d.target[0]) / 2,
                    (d.source[1] + d.target[1]) / 2,
                    (d.source[2] + d.target[2]) / 2 + 5 // +5 Z offset
                ],
                getText: (d: any) => d.label || '',
                getSize: 12,
                getSizeScale: 1,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 300, // Thin
                getColor: (d: any) => getLinkColorRgb(d.type),
                billboard: true
            })
        );

        // Layer 6: Arrows (Generated Polygons)
        const arrowFaces = generateArrowFaces(arcs);

        layers.push(
            new PolygonLayer({
                id: 'arrow-faces-3d',
                data: arrowFaces,
                pickable: false,
                stroked: false,
                filled: true,
                extruded: false, // Just 3D planes
                wireframe: false,
                getPolygon: (d: any) => d.polygon,
                getFillColor: (d: any) => [...getLinkColorRgb(d.type), 255],
                // Ensure depth sorting
                parameters: {
                    depthTest: true,
                    cull: false
                }
            })
        );

    }

    return (
        <div className="w-full h-screen relative bg-slate-100 overflow-hidden">
            <div className="absolute top-4 left-4 z-10 bg-white/90 p-4 rounded-lg shadow-md backdrop-blur-md w-80 max-h-[calc(100vh-2rem)] overflow-y-auto">
                <h1 className="text-xl font-bold mb-1">{space.name}</h1>
                <p className="text-sm text-slate-500 mb-4">Analysis Multiverse View</p>

                <div className="mb-6">
                    <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2">Layers (Z-Order)</h3>
                    <div className="space-y-1">
                        {[...space.canvases].reverse().map((canvas, i) => {
                            // Reverse for display so top layer (highest Z) is at top of list
                            const originalIndex = space.canvases.length - 1 - i;
                            return (
                                <div key={canvas.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-100 hover:border-indigo-200 transition-colors group">
                                    <div className="flex-1 truncate text-sm font-medium">{canvas.name}</div>
                                    <div className="flex gap-1 opacity-50 group-hover:opacity-100">
                                        <button
                                            onClick={() => handleMoveUp(originalIndex)}
                                            disabled={originalIndex === space.canvases.length - 1}
                                            className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                                            title="Move Up (Higher Z)"
                                        >
                                            <ArrowUp className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => handleMoveDown(originalIndex)}
                                            disabled={originalIndex === 0}
                                            className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                                            title="Move Down (Lower Z)"
                                        >
                                            <ArrowDown className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="text-xs text-slate-400 border-t pt-4">
                    Left Click + Drag to Rotate <br />
                    Right Click + Drag to Pan <br />
                    Scroll to Zoom <br />
                    Click a Canvas to Drill Down
                </div>
            </div>



            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true}
                views={new OrbitView({ controller: true })}
                layers={layers}
                getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
                pickingRadius={5}
            />

            <AlertDialog open={regenerateDialogOpen} onOpenChange={setRegenerateDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate Thumbnails?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Would you like to regenerate proper thumbnails for all canvases?
                            This takes some time but ensures the 3D view is accurate.
                            If you skip, we will use existing thumbnails (which might be outdated).
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleSkipRegenerate}>Use Existing</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmRegenerate}>Regenerate</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}