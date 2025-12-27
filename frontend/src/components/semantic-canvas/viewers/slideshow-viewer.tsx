
import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, SplitSquareHorizontal } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SlideRenderer } from "./slide-renderer";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SlideshowViewerProps {
    content: {
        total_slides: number;
        slides: any[];
        meta?: any;
    };
    className?: string;
}

export function SlideshowViewer({ content, className }: SlideshowViewerProps) {
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

    // Keyboard navigation
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
        };

        // Only attach if actively focused or hovering? 
        // For now, let's just attach to prevent capturing global keys unexpectedly
        // simpler to handle via button focus or if user clicks into component
        // window.addEventListener('keydown', handleKeyDown);
        // return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentSlideIndex]);

    if (!currentSlide) {
        return <div className="p-4 text-center text-muted-foreground">No slides available</div>;
    }

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
                            <SlideRenderer slide={currentSlide} />
                        </div>
                    </div>

                    {/* Navigation Overlay/Bar */}
                    <div className="absolute inset-x-0 bottom-4 flex justify-center gap-4 pointer-events-none">
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
                        <ScrollArea className="flex-1 p-3">
                            <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {currentSlide.ai_description ? (
                                    currentSlide.ai_description
                                ) : (
                                    <span className="text-muted-foreground italic">
                                        No specific analysis available for this slide.
                                    </span>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                )}
            </div>
        </div>
    );
}
