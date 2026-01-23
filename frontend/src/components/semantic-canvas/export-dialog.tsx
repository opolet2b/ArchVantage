
"use client";

import * as React from "react";
import { createPortal } from "react-dom"; // Import Portal
import { Download, FileDown, Loader2, FileType } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CanvasThing, useCanvasStore } from "./canvas-store";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import domToImage from "dom-to-image-more";
import { MarkdownViewer } from "./viewers/markdown-viewer"; // Import MarkdownViewer
import { SpreadsheetViewer } from "./viewers/spreadsheet-viewer";
import { ImageViewer } from "./viewers/image-viewer";
import { PDFViewer } from "./viewers/pdf-viewer";


interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    thing: CanvasThing;
}

type ExportFormat = "pdf" | "png" | "jpeg" | "json" | "csv" | "xlsx" | "txt" | "md" | "html";

export function ExportDialog({ open, onOpenChange, thing }: ExportDialogProps) {
    const [filename, setFilename] = React.useState("");
    const [format, setFormat] = React.useState<ExportFormat | "">("");
    const [isExporting, setIsExporting] = React.useState(false);

    // Preview state for visual PDF generation
    const [previewContent, setPreviewContent] = React.useState<any | null>(null);
    const previewRef = React.useRef<HTMLDivElement>(null);

    // Determine available formats based on thing type
    const availableFormats = React.useMemo<ExportFormat[]>(() => {
        switch (thing.type) {
            case "image":
                return ["png", "jpeg"];
            case "table":
                return ["xlsx", "csv", "json"];
            case "text":
            case "document":
            case "message":
            case "conversation":
                return ["pdf", "txt", "md", "json"];
            case "slideshow":
                return ["pdf", "json"];
            case "agent_result":
                // Check if it's a visualizer component
                const vis = (thing.content as any)?.visualizer_output;
                if (vis?.visual_payload?.structure_type) {
                    return ["png", "jpeg", "pdf", "html", "json", "txt"];
                }
                return ["json", "txt", "md", "pdf"];
            default:
                return ["json", "txt"];
        }
    }, [thing.type]);

    // Initialize defaults when dialog opens
    React.useEffect(() => {
        if (open) {
            setFilename(thing.title || thing.id || "export");
            setFormat(availableFormats[0]);
        }
    }, [open, thing, availableFormats]);

    // Transclusion Resolver
    const resolveTranscludedContent = (rawContent: any): any => {
        // Deep copy to avoid mutating original
        let content = JSON.parse(JSON.stringify(rawContent));

        let text = "";
        let textField = "";

        if (typeof content.text === "string") { text = content.text; textField = "text"; }
        else if (typeof content.content === "string") { text = content.content; textField = "content"; }
        else if (typeof content.text_content === "string") { text = content.text_content; textField = "text_content"; }
        else if (typeof content.full_text === "string") { text = content.full_text; textField = "full_text"; }
        else if (typeof content.markdown === "string") { text = content.markdown; textField = "markdown"; }

        if (!text || !textField) return content; // No text field found to resolve

        const regex = /\{\{node:\s*([a-f0-9-]+)\s*\}\}/gi;

        // Use replace with callback
        const resolvedText = text.replace(regex, (match: string, uuid: string) => {
            // 1. Check Snapshot (Locked)
            const transclusionState = (thing.content as any).transclusions?.[uuid];
            if (transclusionState?.locked && transclusionState?.snapshot) {
                const snap = transclusionState.snapshot;
                const snapBody = snap.content?.text || snap.content?.content || JSON.stringify(snap.content);
                return `\n\n${snapBody}\n\n`;
            }

            // 2. Check Live Store
            const liveThing = useCanvasStore.getState().things.find(t => t.id === uuid);
            if (liveThing) {
                const c = liveThing.content as any;
                const body = c.markdown || c.text || c.content || c.full_text || c.text_content || JSON.stringify(c);
                return `\n\n${body}\n\n`;
            }

            return match; // Not found, keep tag
        });

        // Update the specific field
        content[textField] = resolvedText;
        return content;
    };

    const handleExport = async () => {
        if (!format) return;
        setIsExporting(true);

        try {
            const safeFilename = filename.replace(/[^a-z0-9_\-\s]/gi, '_');
            // Resolve transclusions for text-based formats ONLY
            // For PDF (Visual), we want to keep tags so MarkdownViewer renders TransclusionBlock components
            let content = thing.content;
            if (["txt", "md", "html"].includes(format)) {
                content = resolveTranscludedContent(content);
            }

            switch (format) {
                case "json":
                    exportJSON(content, safeFilename);
                    break;
                case "txt":
                    exportText(content, safeFilename, "txt");
                    break;
                case "md":
                    exportText(content, safeFilename, "md");
                    break;
                case "html":
                    exportHTML(content, safeFilename);
                    break;
                case "csv":
                case "xlsx":
                    exportSpreadsheet(content, safeFilename, format);
                    break;
                case "png":
                case "jpeg":
                    await exportImage(content, safeFilename, format);
                    break;
                case "pdf":
                    if (thing.type === "slideshow") {
                        await exportSlideshowPDF(content, safeFilename);
                    } else if (thing.type === "agent_result" && (content as any)?.visualizer_output?.visual_payload) {
                        await exportVisualizerPDF(thing.id, content, safeFilename);
                    } else {
                        // Use Visual Export for Text/MD to preserve formatting
                        // 1. Resolve Transclusions (Already done in 'content' var)

                        // Determine content payload based on type
                        let payload: any = content;

                        // Detect Spreadsheet/Table (including CSV files uploaded as documents)
                        const isSpreadsheet =
                            thing.type === 'table' ||
                            thing.title?.toLowerCase().match(/\.(csv|xlsx?)$/) ||
                            (typeof content === 'object' && (content.csv || content.data));

                        if (isSpreadsheet) {
                            payload = content; // Pass full object including 'data' or 'csv'
                        } else if (thing.type === 'image') {
                            payload = content;
                        } else if (thing.type === 'text' || thing.type === 'document' || thing.type === 'conversation' || thing.type === 'message') {
                            // Extract text
                            let textToRender = "";
                            if (typeof content.text === "string") textToRender = content.text;
                            else if (typeof content.content === "string") textToRender = content.content;
                            else if (typeof content.markdown === "string") textToRender = content.markdown;
                            else textToRender = JSON.stringify(content, null, 2);
                            payload = textToRender;
                        } else {
                            // Default fallback
                            payload = JSON.stringify(content, null, 2);
                        }

                        // 2. Set Preview State to trigger render
                        setPreviewContent(payload);

                        // 3. Wait for render (Next Tick + Image Load Buffer)
                        await new Promise(r => setTimeout(r, 1000)); // Wait for React render

                        // 4. Capture
                        if (previewRef.current) {
                            await exportVisualPDF(previewRef.current, safeFilename);
                        } else {
                            // Fallback if ref missing
                            exportTextPDF(content, safeFilename);
                        }

                        setPreviewContent(null);
                    }
                    break;
            }
            onOpenChange(false);
        } catch (error) {
            console.error("Export failed", error);
            // Ideally show a toast here
        } finally {
            setIsExporting(false);
        }
    };

    // --- Export Implementations ---

    const exportJSON = (content: any, filename: string) => {
        const dataStr = JSON.stringify(content, null, 2);
        downloadFile(dataStr, `${filename}.json`, "application/json");
    };

    const exportText = (content: any, filename: string, ext: "txt" | "md") => {
        let text = "";
        if (typeof content.text === "string") text = content.text;
        else if (typeof content.content === "string") text = content.content;
        else if (typeof content.text_content === "string") text = content.text_content;
        else if (typeof content.full_text === "string") text = content.full_text;
        else if (typeof content.markdown === "string") text = content.markdown;
        else text = JSON.stringify(content, null, 2);

        downloadFile(text, `${filename}.${ext}`, "text/plain");
    };

    const exportSpreadsheet = (content: any, filename: string, format: "csv" | "xlsx") => {
        // Assume content is array of arrays or array of objects, or has a 'data' field
        let data = content.data || content;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { data = [[data]]; }
        }

        const ws = XLSX.utils.json_to_sheet(Array.isArray(data) ? data : [data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

        if (format === "csv") {
            const csv = XLSX.utils.sheet_to_csv(ws);
            downloadFile(csv, `${filename}.csv`, "text/csv");
        } else {
            XLSX.writeFile(wb, `${filename}.xlsx`);
        }
    };

    const exportImage = async (content: any, filename: string, format: "png" | "jpeg") => {
        // Check if this is a Visualizer result (Chart)
        if (thing.type === 'agent_result' && (content as any)?.visualizer_output?.visual_payload) {
            const element = document.querySelector(`[data-thing-id="${thing.id}"]`);
            if (element) {
                // Use dom-to-image-more which supports modern CSS (oklch) via foreignObject
                const dataUrl = await domToImage.toPng(element as HTMLElement, {
                    bgcolor: '#ffffff', // Ensure white background for transparent charts
                    scale: 2 // High resolution
                });

                const link = document.createElement('a');
                link.download = `${filename}.${format}`;
                link.href = dataUrl; // format is ignored by domToImage, it produces PNG. We can try toJpeg if needed but PNG is safer.

                // If user wanted JPEG, convert:
                if (format === 'jpeg') {
                    // Simple canvas conversion if strict jpeg needed, or just teach domToImage
                    const jpegUrl = await domToImage.toJpeg(element as HTMLElement, {
                        bgcolor: '#ffffff',
                        quality: 0.95,
                        scale: 2
                    });
                    link.href = jpegUrl;
                }

                link.click();
                return;
            } else {
                throw new Error("Element not found");
            }
        }

        const url = content.file_path || content.url || (content.image_asset_id ? `/api/v1/assets/${content.image_asset_id}` : null);

        if (!url) throw new Error("No image URL found");

        // Fetch blob
        const res = await fetch(url);
        const blob = await res.blob();

        // Create an anchor to download
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `${filename}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
    };

    const exportHTML = (content: any, filename: string) => {
        // Extract content if wrapped in visualizer output
        let rawContent = content;
        if (content?.visualizer_output?.visual_payload?.content) {
            rawContent = content.visualizer_output.visual_payload.content;
        }

        // If it looks like JSON data (e.g. chart data), stringify it
        if (typeof rawContent !== 'string') {
            rawContent = JSON.stringify(rawContent, null, 2);
        }

        // Basic HTML structure - note: this doesn't render markdown to HTML tags unless we parse it.
        // But the user requested PDF rendering mainly. HTML export is text-based usually.
        // If we wanted rendered HTML, we'd need a parser. For now, wrap in pre.

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${filename}</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.5; }
        pre { background: #f4f4f5; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; white-space: pre-wrap; }
        code { font-family: monospace; }
        .metadata { color: #666; font-size: 0.875rem; marginBottom: 1rem; }
    </style>
</head>
<body>
    <h1>${filename}</h1>
    <div class="metadata">Exported from Intelligent Document Analysis</div>
    <hr/>
    <pre><code>${rawContent}</code></pre>
</body>
</html>`;

        downloadFile(html, `${filename}.html`, "text/html");
    };

    const exportVisualPDF = async (element: HTMLElement, filename: string) => {
        const doc = new jsPDF({
            orientation: "portrait",
            unit: "pt",
            format: "a4"
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - (margin * 2);

        try {
            // DEBUG: Log HTML structure to identify grey frame sources
            console.log("[ExportDialog] Pre-capture HTML:", element.innerHTML.substring(0, 2000));

            // DEBUG: Find all elements with non-transparent backgrounds
            const allElements = element.querySelectorAll('*');
            allElements.forEach((el) => {
                const style = window.getComputedStyle(el);
                const bg = style.backgroundColor;
                if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)') {
                    console.log("[ExportDialog] Element with background:", el.tagName, el.className, "bg:", bg);
                }
            });

            // High DPI Capture
            // Note: We need to ensure the element is visible. Portal placement helps.
            const imgData = await domToImage.toPng(element, {
                bgcolor: '#ffffff',
                width: 760, // A4 width logic matches our fixed width container
                scale: 2 // High resolution
            });

            // --- Smart Slicing Logic ---

            // 1. Load Image for processing
            const img = new Image();
            img.src = imgData;
            await new Promise((resolve) => { img.onload = resolve; });

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) throw new Error("Canvas context failed");

            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            // Calculate ratios
            const imgAspectRatio = img.width / img.height;
            // PDF: We fit width to availableWidth.
            // Height in PDF points = (img.height * availableWidth) / img.width
            // But we work in Pixel Space for slicing.

            const pdfToPxRatio = img.width / availableWidth;
            const pageHeightInPx = availableHeight * pdfToPxRatio;

            let currentY = 0;
            let remainingHeight = img.height;

            // Loop to create pages
            while (remainingHeight > 0) {
                if (currentY > 0) doc.addPage();

                let sliceHeight = Math.min(remainingHeight, pageHeightInPx);

                // If we are cutting midway, try to find a white gap
                if (remainingHeight > pageHeightInPx) {
                    // Check standard cut line
                    const cutY = currentY + pageHeightInPx;

                    // Backtrack to find whitespace (up to 20% of page height)
                    // We check a horizontal line for "all white" (or close to white)
                    // Pixel check: 4 bytes per pixel (R,G,B,A)
                    const searchRange = Math.floor(pageHeightInPx * 0.2);
                    const data = ctx.getImageData(0, Math.floor(cutY - searchRange), canvas.width, searchRange);
                    const pixels = data.data;
                    const width = canvas.width;
                    const height = searchRange;

                    // Scan from bottom (cutY) upwards
                    let foundBreak = false;
                    for (let row = height - 1; row >= 0; row--) {
                        let isRowWhite = true;
                        // Sample checks for performance (every 5th pixel)
                        // Ignore left/right margins (50px) to avoid borders/scrollbars blocking the break
                        for (let col = 50; col < width - 50; col += 5) {
                            const i = (row * width + col) * 4;
                            const r = pixels[i];
                            const g = pixels[i + 1];
                            const b = pixels[i + 2];
                            // Check for darkness (text is dark, white bg is 255)
                            // Threshold: if any pixel is < 240, it's not white
                            if (r < 240 || g < 240 || b < 240) {
                                isRowWhite = false;
                                break;
                            }
                        }

                        if (isRowWhite) {
                            // Found a break!
                            // Actual Y relative to currentY is: (cutY - searchRange) + row
                            // But `row` is local to the imageData block.
                            // The block starts at `cutY - searchRange`.
                            // So BreakY = (cutY - searchRange) + row
                            sliceHeight = (cutY - searchRange) + row - currentY;
                            foundBreak = true;
                            // Add a small padding buffer so we don't cut right on the edge of next line
                            sliceHeight -= 5;
                            break;
                        }
                    }

                    if (!foundBreak) {
                        console.warn("No suitable page break found, cutting strictly.");
                        // sliceHeight remains pageHeightInPx
                    }
                }

                // Create a canvas for the slice
                const sliceCanvas = document.createElement("canvas");
                sliceCanvas.width = canvas.width;
                sliceCanvas.height = sliceHeight;
                const sliceCtx = sliceCanvas.getContext("2d");
                if (sliceCtx) {
                    sliceCtx.drawImage(canvas, 0, currentY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
                    const sliceData = sliceCanvas.toDataURL("image/png");

                    // Add to PDF
                    // Calculate final PDF height for this slice
                    const slicePdfHeight = (sliceHeight * availableWidth) / canvas.width;
                    doc.addImage(sliceData, 'PNG', margin, margin, availableWidth, slicePdfHeight);
                }

                currentY += sliceHeight;
                remainingHeight -= sliceHeight;
            }

            doc.save(`${filename}.pdf`);

        } catch (e) {
            console.error("Visual PDF generation failed", e);
            exportTextPDF(element.innerText, filename); // Fallback
        }
    }

    const exportVisualizerPDF = async (thingId: string, content: any, filename: string) => {
        const doc = new jsPDF({
            orientation: "landscape",
            unit: "pt",
            format: "a4"
        });

        const width = doc.internal.pageSize.getWidth();
        const height = doc.internal.pageSize.getHeight();

        // 1. Capture Visual
        try {
            const element = document.querySelector(`[data-thing-id="${thingId}"] .recharts-responsive-container, [data-thing-id="${thingId}"] .min-h-\\[300px\\]`); // Try identifying chart container
            // Fallback to thing-content if specific chart container undefined
            const target = element || document.querySelector(`[data-thing-id="${thingId}"]`);

            if (target) {
                // Capture image using dom-to-image-more
                const imgData = await domToImage.toPng(target as HTMLElement, {
                    bgcolor: '#ffffff',
                    scale: 2
                });

                const imgProps = doc.getImageProperties(imgData);
                const pdfWidth = width - 40;
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                doc.setFontSize(16);
                doc.text(filename, 20, 30);
                doc.addImage(imgData, 'PNG', 20, 50, pdfWidth, pdfHeight);

                // Add new page for data
                doc.addPage();
            } else {
                // Fallback text if capture failed
                doc.text("[Visual Capture Failed]", 20, 30);
                doc.addPage();
            }
        } catch (e) {
            console.error("Visual capture error", e);
            doc.text("[Visual Capture Failed]", 20, 50);
            doc.addPage(); // Ensure a new page for data even if visual capture fails
        }

        // 2. Add Code/Data on next page
        doc.setFontSize(12);
        doc.text("Source Data / Code:", 20, 30);

        let rawContent = content;
        if (content?.visualizer_output?.visual_payload?.content) {
            rawContent = content.visualizer_output.visual_payload.content;
        }
        const text = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2);

        const splitText = doc.splitTextToSize(text, width - 40);
        let cursorY = 50;
        const pageHeight = height;

        splitText.forEach((line: string) => {
            if (cursorY > pageHeight - 20) {
                doc.addPage();
                cursorY = 30;
            }
            doc.text(line, 20, cursorY);
            cursorY += 14; // Line height
        });

        doc.save(`${filename}.pdf`);
    };

    const exportTextPDF = (content: any, filename: string) => {
        const doc = new jsPDF();
        let text = "";

        // Robust text extraction
        if (typeof content.text === "string") text = content.text;
        else if (typeof content.content === "string") text = content.content;
        else if (typeof content.text_content === "string") text = content.text_content;
        else if (typeof content.full_text === "string") text = content.full_text;
        else if (typeof content.markdown === "string") text = content.markdown;
        else if (content?.visualizer_output?.visual_payload?.content) {
            const raw = content.visualizer_output.visual_payload.content;
            text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
        }
        else text = JSON.stringify(content, null, 2);

        const pageHeight = doc.internal.pageSize.height;
        const margin = 10;
        const maxLineWidth = 180;
        const lineHeight = 7; // Approx line height for 16pt? Default is usually ~1.15*fontSize

        doc.setFontSize(12);
        const splitText = doc.splitTextToSize(text, maxLineWidth);

        let cursorY = margin + 5; // Start slightly lower

        splitText.forEach((line: string) => {
            if (cursorY + lineHeight > pageHeight - margin) {
                doc.addPage();
                cursorY = margin + 5;
            }
            doc.text(line, margin, cursorY);
            cursorY += lineHeight;
        });

        doc.save(`${filename}.pdf`);
    };

    const exportSlideshowPDF = async (content: any, filename: string) => {
        const doc = new jsPDF({
            orientation: "landscape",
            unit: "pt",
            format: "a4" // 595.28 x 841.89 (landscape: 841 x 595)
        });

        const width = doc.internal.pageSize.getWidth();
        const height = doc.internal.pageSize.getHeight();
        const slides = content.slides || [];

        for (let i = 0; i < slides.length; i++) {
            if (i > 0) doc.addPage();
            const slide = slides[i];

            // Render Slide
            // 1. Image Slide
            if (slide.url || slide.image || slide.image_asset_id) {
                const imgUrl = slide.url || slide.image || (slide.image_asset_id ? `/api/v1/assets/${slide.image_asset_id}` : "");
                if (imgUrl) {
                    try {
                        // Need base64 for jsPDF
                        const res = await fetch(imgUrl);
                        const blob = await res.blob();
                        const base64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });
                        doc.addImage(base64, "JPEG", 0, 0, width, height, undefined, "FAST");
                    } catch (e) {
                        doc.text(`[Image Load Failed: ${imgUrl}]`, 20, 20);
                    }
                }
            } else if (slide.elements) {
                // 2. Structured Slide
                // Map elements to PDF commands
                slide.elements.forEach((el: any) => {
                    const elX = el.x * width;
                    const elY = el.y * height;
                    const elW = el.w * width;
                    const elH = el.h * height;

                    if (el.type === "SHAPE") {
                        const fill = normalizeColor(el.fill_color);
                        const stroke = normalizeColor(el.line_color);

                        if (fill) doc.setFillColor(fill);
                        if (stroke) doc.setDrawColor(stroke);

                        // Map shapes
                        if (el.shape_kind?.includes("OVAL")) {
                            doc.ellipse(elX + elW / 2, elY + elH / 2, elW / 2, elH / 2, fill ? "F" : "S");
                        } else {
                            doc.rect(elX, elY, elW, elH, fill ? "F" : "S");
                        }
                    } else if (el.type === "TEXT" && el.text) {
                        doc.setFontSize(12); // Approximate
                        doc.setTextColor(0, 0, 0);
                        // Text box wrapping
                        // TODO: Better font mapping
                        doc.text(el.text, elX, elY + 12);
                    } else if (el.type === "IMAGE" && el.src) {
                        // TODO: Nested images in structured slides
                        doc.rect(elX, elY, elW, elH); // Placeholder
                        doc.text("[Image]", elX + 5, elY + 10);
                    }
                });
            }

            // Footer
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text(`${i + 1} / ${slides.length}`, width - 50, height - 10);
        }

        doc.save(`${filename}.pdf`);
    };

    const normalizeColor = (color?: string) => {
        if (!color) return undefined;
        // Basic normalization, jsPDF wants hex or rgb
        if (color.startsWith("(")) return undefined; // Tuple not supported easily
        return color;
    };

    const downloadFile = (data: string, filename: string, mimeType: string) => {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(val) => !isExporting && onOpenChange(val)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Export {thing.type === 'slideshow' ? 'Slideshow' : 'Thing'}</DialogTitle>
                        <DialogDescription>
                            Choose a format to download this content.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="filename" className="text-right">
                                Filename
                            </Label>
                            <Input
                                id="filename"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="format" className="text-right">
                                Format
                            </Label>
                            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select format" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableFormats.map(fmt => (
                                        <SelectItem key={fmt} value={fmt} className="uppercase">
                                            {fmt}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
                            Cancel
                        </Button>
                        <Button onClick={handleExport} disabled={!format || isExporting}>
                            {isExporting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Hidden Preview Container for Visual Export */}
            {previewContent && createPortal(
                <div
                    ref={previewRef}
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "750px", // Approx A4 text width (leaving margins)
                        backgroundColor: "white",
                        padding: "40px",
                        zIndex: -9999,
                        visibility: "visible",
                    }}
                    className="prose prose-sm dark:prose-invert max-w-none text-black bg-white export-preview-container"
                    id="export-preview-container"
                >
                    <style>{`
                        #export-preview-container > div {
                            border: none !important;
                            box-shadow: none !important;
                        }

                        /* Transclusion Card: Remove "Ugly" borders/shadows */
                        #export-preview-container .transclusion-container {
                            border: none !important;
                            box-shadow: none !important;
                            background: transparent !important;
                            margin: 1rem 0 !important;
                        }
                        #export-preview-container .transclusion-container > span:first-child {
                            /* Header of transclusion card */
                            display: none !important;
                        }
                        #export-preview-container .transclusion-container > span:last-child {
                            /* Footer of transclusion card */
                            display: none !important;
                        }

                        /* Table Wrapper: EXPAND full height (remove scroll) */
                        #export-preview-container .transclusion-table-wrapper {
                            height: auto !important;
                            max-height: none !important;
                            border: none !important;
                        }

                        /* Tables: Force nice grid borders */
                        #export-preview-container table {
                            border-collapse: collapse !important;
                            width: 100% !important;
                            margin: 0.5rem 0 !important;
                            font-size: 10px !important; /* Smaller text for spreadsheet data */
                        }
                        #export-preview-container th {
                            background-color: #f9fafb !important;
                            font-weight: 600 !important;
                            text-align: left !important;
                        }
                        #export-preview-container th,
                        #export-preview-container td {
                            border: 1px solid #d1d5db !important; /* Tailwind gray-300 */
                            padding: 4px 8px !important;
                        }

                        /* Markdown Elements */
                        #export-preview-container h1 {
                            border-bottom: 2px solid #e5e7eb !important;
                            padding-bottom: 0.5rem !important;
                            margin-bottom: 1rem !important;
                        }
                        /* Make code blocks transparent in export to remove grey frames */
                        #export-preview-container pre {
                            background-color: transparent !important;
                            border-radius: 0 !important;
                            padding: 0 !important;
                        }
                        #export-preview-container :not(pre) > code {
                            background-color: transparent !important;
                            padding: 0 !important;
                            border-radius: 0 !important;
                        }
                        /* AGGRESSIVE: Force ALL inline text elements to have transparent background */
                        #export-preview-container mark,
                        #export-preview-container code,
                        #export-preview-container span,
                        #export-preview-container em,
                        #export-preview-container strong,
                        #export-preview-container a,
                        #export-preview-container u,
                        #export-preview-container s,
                        #export-preview-container del,
                        #export-preview-container ins,
                        #export-preview-container sub,
                        #export-preview-container sup,
                        #export-preview-container abbr,
                        #export-preview-container .highlight,
                        #export-preview-container [class*="highlight"],
                        #export-preview-container [class*="bg-"],
                        #export-preview-container [style*="background"] {
                            background-color: transparent !important;
                            background: transparent !important;
                            padding: 0 !important;
                            border-radius: 0 !important;
                            border: none !important;
                            box-shadow: none !important;
                            outline: none !important;
                        }
                        /* NUCLEAR: Remove ALL backgrounds and borders from ANY element with inline style */
                        #export-preview-container *[style] {
                            background-color: transparent !important;
                            background: transparent !important;
                            border: none !important;
                            outline: none !important;
                            box-shadow: none !important;
                        }
                    `}</style>
                    <h1 className="text-2xl font-bold mb-4">{thing.title || "Export"}</h1>

                    {/* Render appropriate viewer based on thing type */}
                    {(
                        thing.type === "table" ||
                        thing.title?.toLowerCase().match(/\.(csv|xlsx?)$/) ||
                        (previewContent && typeof previewContent === 'object' && (previewContent.csv || previewContent.data))
                    ) && previewContent ? (
                        <div className="transclusion-table-wrapper w-full relative border rounded overflow-hidden">
                            <SpreadsheetViewer
                                content={
                                    typeof previewContent === "string" ? previewContent :
                                        (previewContent.csv || previewContent.markdown || previewContent.url || previewContent.file_path || previewContent.content || "")
                                }
                                initialData={previewContent.data as any[][]}
                                selectionEnabled={false}
                                className="w-full h-full bg-white dark:bg-slate-900"
                                exportMode={true}
                            />
                        </div>
                    ) : (thing.type === "image") && previewContent ? (
                        <div className="w-full relative flex justify-center">
                            <ImageViewer
                                src={previewContent.url || previewContent.file_path || (previewContent.image_asset_id ? `/api/v1/assets/${previewContent.image_asset_id}` : "")}
                                alt={thing.title || "Image"}
                                selectionEnabled={false}
                                className="max-w-full"
                            />
                        </div>
                    ) : ((thing.type === "document" || thing.type === "text") &&
                        (previewContent && typeof previewContent !== "string" && (previewContent.file_path || previewContent.url || "").toLowerCase().endsWith(".pdf"))) ? (
                        /* PDF Document Export - Render Visual PDF */
                        <MarkdownViewer content={previewContent || ""} selectionEnabled={false} className="w-full" exportMode={true} />
                    ) : (
                        <MarkdownViewer content={previewContent || ""} selectionEnabled={false} className="w-full" exportMode={true} />
                    )}
                </div>,
                document.body
            )}
        </>
    );
}
