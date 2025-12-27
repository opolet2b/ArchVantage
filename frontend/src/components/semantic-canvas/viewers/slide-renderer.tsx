
import React from 'react';
import { cn } from "@/lib/utils";

interface SlideElement {
    id: number | string;
    type: "TEXT" | "SHAPE" | "IMAGE" | "GROUP" | "TABLE" | "UNKNOWN";
    x: number;
    y: number;
    w: number;
    h: number;
    text?: string;
    fill_color?: string;
    line_color?: string;
    raw_type?: string;
    shape_kind?: string;
}

interface Slide {
    index: number;
    elements: SlideElement[];
    notes?: string;
    ai_description?: string;
}

interface SlideRendererProps {
    slide: Slide;
    className?: string;
    onElementClick?: (element: SlideElement) => void;
}

export function SlideRenderer({ slide, className, onElementClick }: SlideRendererProps) {
    if (!slide || !slide.elements) return null;

    // Convert decimal color to hex if needed, or handle RGB tuple strings
    const getColor = (colorStr?: string) => {
        if (!colorStr) return undefined;
        // Check if it's a tuple string like "(255, 0, 0)"
        if (colorStr.startsWith("(") && colorStr.endsWith(")")) {
            return `rgb${colorStr}`;
        }
        // If it's pure hex without # (common in PPTX extraction sometimes)
        if (colorStr.match(/^[0-9A-Fa-f]{6}$/)) {
            return `#${colorStr}`;
        }
        return colorStr;
    };

    return (
        <div className={cn("relative w-full h-full bg-white dark:bg-slate-100 overflow-hidden select-none", className)}>
            <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="w-full h-full"
            >
                {slide.elements.map((el, i) => {
                    // Skip if invalid dimensions
                    if (el.w <= 0 || el.h <= 0) return null;

                    const fill = getColor(el.fill_color) || (el.type === "SHAPE" ? "#e2e8f0" : "transparent");
                    const stroke = getColor(el.line_color) || (el.type === "SHAPE" ? "#94a3b8" : "transparent");

                    const isInteractable = !!onElementClick;

                    return (
                        <g
                            key={`${el.id}-${i}`}
                            onClick={(e) => {
                                if (onElementClick) {
                                    e.stopPropagation();
                                    onElementClick(el);
                                }
                            }}
                            className={cn(isInteractable && "cursor-pointer hover:opacity-80")}
                        >
                            {/* Shape / Background */}
                            <rect
                                x={el.x * 100}
                                y={el.y * 100}
                                width={el.w * 100}
                                height={el.h * 100}
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={0.2}
                                rx={0.5} // Slight rounding
                            />

                            {/* Text Content */}
                            {el.text && (
                                <foreignObject
                                    x={el.x * 100}
                                    y={el.y * 100}
                                    width={el.w * 100}
                                    height={el.h * 100}
                                    className="overflow-hidden"
                                >
                                    <div
                                        className="w-full h-full flex items-center justify-center p-[1px] text-[2px] leading-tight text-slate-800 break-words text-center"
                                        style={{ fontSize: '2px' }} // Scale text roughly
                                    >
                                        {el.text}
                                    </div>
                                </foreignObject>
                            )}

                            {/* Image Placeholder */}
                            {el.type === "IMAGE" && (
                                <foreignObject
                                    x={el.x * 100}
                                    y={el.y * 100}
                                    width={el.w * 100}
                                    height={el.h * 100}
                                >
                                    <div className="w-full h-full flex items-center justify-center bg-slate-200 text-[2px] text-slate-500">
                                        Using Image
                                    </div>
                                </foreignObject>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
