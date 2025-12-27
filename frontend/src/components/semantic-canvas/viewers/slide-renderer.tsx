
import React from 'react';
import { cn, API_URL } from "@/lib/utils";

interface SlideElement {
    id: number | string;
    type: "TEXT" | "SHAPE" | "IMAGE" | "GROUP" | "TABLE" | "LINE" | "UNKNOWN";
    x: number;
    y: number;
    w: number;
    h: number;
    text?: string;
    fill_color?: string;
    line_color?: string;
    raw_type?: string;
    shape_kind?: string;
    rotation?: number;
    begin_x?: number;
    begin_y?: number;
    end_x?: number;
    end_y?: number;
    src?: string; // URL for images
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

// -----------------------------------------------------------------------------
// Secure Image Loading
// -----------------------------------------------------------------------------

function useSecureImage(src?: string) {
    const [imageSrc, setImageSrc] = React.useState<string | undefined>(undefined);
    const objectUrlRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!src) {
            setImageSrc(undefined);
            return;
        }

        // Cleanup
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }

        if (src.startsWith("blob:") || src.startsWith("http")) {
            setImageSrc(src);
            return;
        }

        // Secure fetch for relative API paths
        if (src.startsWith("/api/")) {
            const token = localStorage.getItem("token");
            const fetchImage = async () => {
                try {
                    let urlToFetch = src;
                    // Determine URL with proxy logic
                    if (API_URL && !src.startsWith("http")) {
                        try {
                            const apiUrlObj = new URL(API_URL);
                            urlToFetch = `${apiUrlObj.origin}${src}`;
                        } catch {
                            // Fallback for dev proxy
                            if (src.startsWith("/api/") && typeof window !== 'undefined') {
                                urlToFetch = src; // rely on proxy
                            }
                        }
                    }

                    const headers: HeadersInit = {};
                    if (token) headers["Authorization"] = `Bearer ${token}`;

                    const res = await fetch(urlToFetch, { headers });
                    if (!res.ok) throw new Error("Failed");

                    const blob = await res.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    objectUrlRef.current = objectUrl;
                    setImageSrc(objectUrl);
                } catch (e) {
                    console.error("Secure image load failed", e);
                    // Fallback to src (maybe it doesn't need auth?)
                    setImageSrc(src);
                }
            };
            fetchImage();
        } else {
            setImageSrc(src);
        }

        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
        };
    }, [src]);

    return imageSrc;
}

const SecureImageElement = ({ el }: { el: SlideElement }) => {
    const secureSrc = useSecureImage(el.src);

    if (!secureSrc) {
        // Loading or failed
        return (
            <foreignObject x={el.x * 100} y={el.y * 100} width={el.w * 100} height={el.h * 100}>
                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-[2px] text-slate-400">
                    Loading...
                </div>
            </foreignObject>
        );
    }

    return (
        <image
            href={secureSrc}
            x={el.x * 100}
            y={el.y * 100}
            width={el.w * 100}
            height={el.h * 100}
            preserveAspectRatio="none"
        />
    );
};

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

    const renderShape = (el: SlideElement, fill: string, stroke: string) => {
        const x = el.x * 100;
        const y = el.y * 100;
        const w = el.w * 100;
        const h = el.h * 100;
        const kind = el.shape_kind || "";

        // Standard props for most shapes
        const commonProps = {
            fill,
            stroke,
            strokeWidth: 0.2, // relative to 100x100 viewBox
        };

        // 1. Ovals / Ellipses
        if (kind.includes("OVAL") || kind.includes("ELLIPSE") || kind.includes("CIRCLE")) {
            return (
                <ellipse
                    cx={x + w / 2}
                    cy={y + h / 2}
                    rx={w / 2}
                    ry={h / 2}
                    {...commonProps}
                />
            );
        }

        // 2. Rounded Rectangles
        if (kind.includes("ROUNDED_RECT")) {
            return (
                <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={2} // approximation
                    {...commonProps}
                />
            );
        }

        // 3. Triangles (Approximation based on bounding box)
        if (kind.includes("TRIANGLE")) {
            // Isosceles by default
            const points = `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`;
            return (
                <polygon points={points} {...commonProps} />
            );
        }

        // 4. Diamond
        if (kind.includes("DIAMOND")) {
            const points = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
            return (
                <polygon points={points} {...commonProps} />
            );
        }

        // Default: Rectangle
        return (
            <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={0.5}
                {...commonProps}
            />
        );
    };

    const renderLine = (el: SlideElement, stroke: string) => {
        // Use explicit begin/end if available, otherwise fallback to bounding box diagonal
        let x1 = (el.begin_x !== undefined ? el.begin_x : el.x) * 100;
        let y1 = (el.begin_y !== undefined ? el.begin_y : el.y) * 100;
        let x2 = (el.end_x !== undefined ? el.end_x : el.x + el.w) * 100;
        let y2 = (el.end_y !== undefined ? el.end_y : el.y + el.h) * 100;

        return (
            <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={stroke}
                strokeWidth={0.3}
                markerEnd="url(#arrowhead)" // Always assume arrow for now? Or check kind?
            />
        );
    };

    return (
        <div className={cn("relative w-full h-full bg-white dark:bg-slate-100 overflow-hidden select-none", className)}>
            <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="w-full h-full"
            >
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                    </marker>
                </defs>

                {slide.elements.map((el, i) => {
                    // Skip if invalid dimensions AND not a line (lines might have 0 width/height if vertical/horizontal)
                    if (el.type !== 'LINE' && (el.w <= 0 || el.h <= 0)) return null;

                    const fill = getColor(el.fill_color) || (el.type === "SHAPE" ? "#e2e8f0" : "transparent");
                    const stroke = getColor(el.line_color) || (el.type === "SHAPE" || el.type === "LINE" ? "#64748b" : "transparent");
                    const isInteractable = !!onElementClick;

                    // Simple rotation transform
                    const rotation = el.rotation ? `rotate(${el.rotation}, ${el.x * 100 + el.w * 50}, ${el.y * 100 + el.h * 50})` : undefined;

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
                            transform={rotation}
                        >
                            {/* Shape Logic */}
                            {el.type === "LINE" ? renderLine(el, stroke) :
                                el.type === "SHAPE" ? renderShape(el, fill, stroke) :
                                    el.type === "IMAGE" ? (
                                        el.src ? (
                                            <SecureImageElement el={el} />
                                        ) : (
                                            <foreignObject x={el.x * 100} y={el.y * 100} width={el.w * 100} height={el.h * 100}>
                                                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-[2px] text-slate-500 border border-slate-300">
                                                    [Image]
                                                </div>
                                            </foreignObject>
                                        )
                                    ) :
                                        // Default rect for others
                                        <rect
                                            x={el.x * 100}
                                            y={el.y * 100}
                                            width={el.w * 100}
                                            height={el.h * 100}
                                            fill={fill}
                                            stroke={stroke}
                                            strokeWidth={0.2}
                                        />
                            }

                            {/* Text Content */}
                            {el.text && el.text !== "[Image]" && (
                                <foreignObject
                                    x={el.x * 100}
                                    y={el.y * 100}
                                    width={el.w * 100}
                                    height={el.h * 100}
                                    className="overflow-hidden pointer-events-none"
                                >
                                    <div
                                        className="w-full h-full flex items-center justify-center p-[1px] text-[2px] leading-tight text-slate-800 break-words text-center whitespace-pre-wrap"
                                        style={{ fontSize: '2.5px' }} // Slightly larger reading text
                                    >
                                        {el.text}
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
