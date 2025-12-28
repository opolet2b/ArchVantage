
import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, SplitSquareHorizontal } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SlideRenderer } from "./slide-renderer";
import { ImageViewer } from "./image-viewer";
import { InteractiveOverlayLayer } from "./interactive-overlay-layer";
import { RegionFragment, OverlayFragment } from "./types";

interface SlideshowViewerProps {
    content: {
        total_slides: number;
        slides: any[];
        regions?: OverlayFragment[]; // Shared regions for the whole slideshow thing
        meta?: any;
    };
    className?: string;
    onSelect?: (fragment: RegionFragment, position?: { x: number; y: number }) => void;
    onOverlayResize?: (id: string, x: number, y: number, width: number, height: number) => void;
    onOverlayDelete?: (id: string) => void;
    onOverlayClick?: (fragment: RegionFragment, position?: { x: number; y: number }) => void;
}

export function SlideshowViewer({
    content,
    className,
    onSelect,
    onOverlayResize,
    onOverlayDelete,
    onOverlayClick
}: SlideshowViewerProps) {
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [showSidebar, setShowSidebar] = useState(true);

    const slides = content.slides || [];
    const totalSlides = content.total_slides || slides.length;
    const currentSlide = slides[currentSlideIndex];

    const hasNext = currentSlideIndex < totalSlides - 1;
    const hasPrev = currentSlideIndex > 0;

    const handleNext = () => {
        if (hasNext) setCurrentSlideIndex(prev => prev + 1);
    };

    const handlePrev = () => {
        if (hasPrev) setCurrentSlideIndex(prev => prev - 1);
    };

    // Filter overlays for the current slide
    const currentSlideOverlays = useMemo(() => {
        if (!content.regions) return [];
        const filtered = content.regions.filter((r: any) => {
            // Loose equality check for safety (string vs number)
            return Number(r.slideIndex) === Number(currentSlideIndex);
        }) as RegionFragment[];
        return filtered;
    }, [content.regions, currentSlideIndex]);

    // Handle selection on an image slide (ImageViewer does the heavy lifting)
    const handleImageSlideSelect = (fragment: RegionFragment, position?: { x: number; y: number }) => {
        const enhancedFragment = {
            ...fragment,
            slideIndex: currentSlideIndex
        };
        onSelect?.(enhancedFragment, position);
    };

    // Handle selection on a structural slide (We manually handle the rect from InteractiveOverlayLayer)
    const handleStructuralSlideSelection = (rect: { x: number; y: number; width: number; height: number; pctX: number; pctY: number; pctW: number; pctH: number }) => {
        // Create a RegionFragment without image content (since it's SVG)
        // Ideally we would rasterize it, but for now we just support the region.
        const newFragment: RegionFragment = {
            id: crypto.randomUUID(),
            type: "region",
            x: rect.pctX,
            y: rect.pctY,
            width: rect.pctW,
            height: rect.pctH,
            slideIndex: currentSlideIndex
        };

        // Pass to parent. We don't have mouse event here easily for toolbar position,
        // but we can estimate or pass null. The parent might center it.
        // Actually InteractiveOverlayLayer wraps the mouse event in the callback? 
        // No, it passes rect.
        // We can pass a dummy position or improve InteractiveOverlayLayer to pass event.
        // For now, let's just pass {x: 0, y: 0} or undefined and let ThingNode handle it.
        onSelect?.(newFragment, undefined);
    };

    // Keyboard navigation
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
        };
        // window.addEventListener('keydown', handleKeyDown);
        // return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentSlideIndex]);

    if (!currentSlide) {
        return <div className="p-4 text-center text-muted-foreground">No slides available</div>;
    }

    const isImageSlide = !!(currentSlide.url || currentSlide.image || currentSlide.image_asset_id);
    const imageUrl = currentSlide.url || currentSlide.image || (currentSlide.image_asset_id ? `/api/v1/assets/${currentSlide.image_asset_id}` : "");

    return (
        <div className={cn("flex flex-col h-full border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900", className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-2 py-1 border-b bg-white dark:bg-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">
                        Slide {currentSlideIndex + 1} / {totalSlides}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setShowSidebar(!showSidebar)}
                        title="Toggle Description"
                    >
                        {showSidebar ? <Maximize2 className="h-3 w-3" /> : <SplitSquareHorizontal className="h-3 w-3" />}
                    </Button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex min-h-0 relative">

                {/* Visual Slide Area */}
                <div className="flex-1 flex flex-col relative bg-slate-200 dark:bg-slate-950">
                    <div className="flex-1 p-4 flex items-center justify-center overflow-hidden">
                        {/* Aspect Ratio Container 16:9 */}
                        <div className="relative w-full aspect-video shadow-lg bg-white">

                            {isImageSlide ? (
                                <ImageViewer
                                    src={imageUrl}
                                    alt={`Slide ${currentSlideIndex + 1}`}
                                    className="w-full h-full"
                                    selectionEnabled={true}
                                    onSelect={handleImageSlideSelect}
                                    overlays={currentSlideOverlays}
                                    onOverlayResize={onOverlayResize}
                                    onOverlayDelete={onOverlayDelete}
                                    onOverlayClick={(overlay) => onOverlayClick?.(overlay as RegionFragment, undefined)} // Wrap to match signature
                                />
                            ) : (
                                <InteractiveOverlayLayer
                                    overlays={currentSlideOverlays}
                                    selectionEnabled={true}
                                    onSelectionComplete={handleStructuralSlideSelection}
                                    onOverlayAction={(action, id, data) => {
                                        if (action === 'resize' && onOverlayResize) {
                                            onOverlayResize(id, data.x, data.y, data.width, data.height);
                                        } else if (action === 'delete' && onOverlayDelete) {
                                            onOverlayDelete(id);
                                        } else if (action === 'click' && onOverlayClick) {
                                            // Find the fragment
                                            const fragment = currentSlideOverlays.find(o => o.id === id);
                                            if (fragment) {
                                                // data is the event from InteractiveOverlayLayer (if we passed it? checking IOL)
                                                // IOL passes 'data' which is `e` for click
                                                const e = data as React.MouseEvent | undefined;
                                                const position = e ? { x: e.clientX, y: e.clientY } : undefined;
                                                onOverlayClick(fragment, position);
                                            }
                                        }
                                    }}
                                    className="w-full h-full"
                                >
                                    <SlideRenderer slide={currentSlide} />
                                </InteractiveOverlayLayer>
                            )}

                        </div>
                    </div>

                    {/* Navigation Overlay/Bar */}
                    <div className="absolute inset-x-0 bottom-4 flex justify-center gap-4 pointer-events-none z-10">
                        <Button
                            variant="secondary"
                            size="icon"
                            className="pointer-events-auto rounded-full shadow-md bg-white/80 hover:bg-white dark:bg-slate-800/80"
                            onClick={handlePrev}
                            disabled={!hasPrev}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="secondary"
                            size="icon"
                            className="pointer-events-auto rounded-full shadow-md bg-white/80 hover:bg-white dark:bg-slate-800/80"
                            onClick={handleNext}
                            disabled={!hasNext}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Sidebar (AI Description) */}
                {showSidebar && (
                    <div className="w-1/3 min-w-[250px] border-l bg-white dark:bg-slate-900 flex flex-col">
                        <div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            AI Analysis
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {(() => {
                                    if (!currentSlide.ai_description) {
                                        return (
                                            <span className="text-muted-foreground italic">
                                                No specific analysis available for this slide.
                                            </span>
                                        );
                                    }
                                    // Strip <think> tags
                                    const raw = currentSlide.ai_description;
                                    const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
                                    return clean || raw; // Fallback to raw if dry (unlikely)
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
