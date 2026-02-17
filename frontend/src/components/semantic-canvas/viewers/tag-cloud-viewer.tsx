"use client";

import React, { useMemo, useState, useEffect } from "react";
// import ReactWordcloud from "react-wordcloud"; // Reverted due to D3 conflict with ReactFlow
import randomColor from "randomcolor";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface TagCloudViewerProps {
    data: any; // String (text content) or Array<{ text: string, value: number }>
    className?: string;
    onTagClick?: (tag: string) => void;
}

interface TagData {
    text: string;
    value: number;
}

// Simple stop words list
const STOP_WORDS = new Set([
    "the", "and", "a", "to", "of", "in", "is", "it", "you", "that", "he", "was", "for", "on", "are", "with", "as", "i", "his", "they", "be", "at", "one", "have", "this", "from", "or", "had", "by", "not", "word", "but", "what", "some", "we", "can", "out", "other", "were", "all", "there", "when", "up", "use", "your", "how", "said", "an", "each", "she", "which", "do", "their", "time", "if", "will", "way", "about", "many", "then", "them", "write", "would", "like", "so", "these", "her", "long", "make", "thing", "see", "him", "two", "has", "look", "more", "day", "could", "go", "come", "did", "number", "sound", "no", "most", "people", "my", "over", "know", "water", "than", "call", "first", "who", "may", "down", "side", "been", "now", "find",
    "analysis", "result", "based", "content", "prominent", "terms"
]);

export function TagCloudViewer({ data, className, onTagClick }: TagCloudViewerProps) {
    const [tags, setTags] = useState<TagData[]>([]);
    const [loading, setLoading] = useState(true);

    // Process data into tags
    useEffect(() => {
        const processData = async () => {
            setLoading(true);
            try {
                let processedTags: TagData[] = [];
                console.log("[TagCloudViewer] Process Data:", data);

                if (typeof data === "string") {
                    // Check if data is pre-rendered HTML (e.g. from backend analysis)
                    if (data.trim().startsWith("<span")) {
                        // 1. HTML parsing mode
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(data, "text/html");
                        const spans = Array.from(doc.querySelectorAll("span"));

                        processedTags = spans.map(span => {
                            const fontSize = span.style.fontSize;
                            const size = fontSize ? parseInt(fontSize) : 12;
                            return {
                                text: span.textContent || "",
                                value: size // Use font-size as proxy for weight/count
                            };
                        }).filter(t => t.text.trim().length > 0);

                    } else {
                        // 2. Raw Text Analysis Mode
                        const words = data.toLowerCase()
                            .replace(/[^\w\s]/g, '') // Remove punctuation
                            .split(/\s+/)
                            .filter(w => w.length > 3 && !STOP_WORDS.has(w));

                        const counts: Record<string, number> = {};
                        words.forEach(w => {
                            counts[w] = (counts[w] || 0) + 1;
                        });

                        processedTags = Object.entries(counts)
                            .map(([text, value]) => ({ text, value }))
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 50); // Top 50
                    }

                } else if (typeof data === "object" && data !== null) {
                    // 2. Structured Data Mode
                    let arrayData = Array.isArray(data) ? data : [];

                    // Heuristic: Check for common wrappers if not an array
                    if (!Array.isArray(data)) {
                        if (Array.isArray(data.extracted_elements)) {
                            arrayData = data.extracted_elements;
                        } else if (Array.isArray(data.data)) {
                            arrayData = data.data;
                        } else if (Array.isArray(data.results)) {
                            arrayData = data.results;
                        }
                    }

                    // Expecting { text: string, value: number } or { name: string, value: number } from Recharts style
                    // Flatten if items contain 'data' array (recursively? no, just 1 level)
                    const flatData: any[] = [];
                    arrayData.forEach((item: any) => {
                        if (item && Array.isArray(item.data)) {
                            flatData.push(...item.data);
                        } else {
                            flatData.push(item);
                        }
                    });

                    processedTags = flatData.map((item: any) => ({
                        text: item.text || item.name || item.value || "unknown",
                        value: typeof item.value === 'number' ? item.value : (item.count || 1)
                    })).filter((t) => t.text !== "unknown" && t.value > 0)
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 50);
                }

                console.log("[TagCloudViewer] Processed Tags:", processedTags);
                setTags(processedTags);
            } catch (e) {
                console.error("Failed to process tag cloud data", e);
            } finally {
                setLoading(false);
            }
        };

        processData();
    }, [data]);

    // Flexbox Renderer (Fallback for library conflict)
    const cloudContent = useMemo(() => {
        if (!tags.length) return <div className="text-muted-foreground text-sm">No significant terms found.</div>;

        // Normalization for font sizes
        // Handle empty array safely (though we check length above)
        const counts = tags.map(t => t.value);
        const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
        const minCount = counts.length > 0 ? Math.min(...counts) : 0;

        const minFontSize = 12;
        const maxFontSize = 48;

        return (
            <div className="w-full h-full p-4 overflow-y-auto">
                <div className="flex flex-wrap gap-2 items-center justify-center content-center min-h-full">
                    {tags.map((tag, i) => {
                        const normalized = maxCount === minCount ? 0.5 : (tag.value - minCount) / (maxCount - minCount);
                        const fontSize = minFontSize + (normalized * (maxFontSize - minFontSize));

                        // Color mapping based on weight
                        const color = randomColor({
                            luminosity: 'dark',
                            hue: normalized > 0.7 ? 'blue' : (normalized > 0.4 ? 'purple' : 'monochrome')
                        });

                        return (
                            <div
                                key={`${tag.text}-${i}`}
                                style={{
                                    fontSize: `${fontSize}px`,
                                    fontWeight: 'bold',
                                    color: color,
                                    padding: '4px 8px',
                                    lineHeight: 1,
                                    cursor: onTagClick ? 'pointer' : 'default',
                                }}
                                className="hover:opacity-80 transition-opacity bg-slate-100/50 dark:bg-slate-800/50 rounded-md border border-transparent hover:border-slate-300 dark:hover:border-slate-600"
                                onClick={() => onTagClick?.(tag.text)}
                                title={`${tag.text}: ${tag.value}`}
                            >
                                {tag.text}
                                <span className="ml-1 text-[0.6em] opacity-50 font-normal">{tag.value}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }, [tags, onTagClick]);

    if (loading) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className={cn("w-full h-full min-h-[300px] overflow-hidden bg-white dark:bg-slate-900 rounded-lg shadow-sm border", className)}>
            <div className="w-full h-full relative">
                {cloudContent}
            </div>
        </div>
    );
}
