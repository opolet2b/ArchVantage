
"use client";

import * as React from "react";
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
import { CanvasThing } from "./canvas-store";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    thing: CanvasThing;
}

type ExportFormat = "pdf" | "png" | "jpeg" | "json" | "csv" | "xlsx" | "txt" | "md";

export function ExportDialog({ open, onOpenChange, thing }: ExportDialogProps) {
    const [filename, setFilename] = React.useState("");
    const [format, setFormat] = React.useState<ExportFormat | "">("");
    const [isExporting, setIsExporting] = React.useState(false);

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

    const handleExport = async () => {
        if (!format) return;
        setIsExporting(true);

        try {
            const safeFilename = filename.replace(/[^a-z0-9_\-\s]/gi, '_');
            const content = thing.content;

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
                    } else {
                        exportTextPDF(content, safeFilename);
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

    const exportTextPDF = (content: any, filename: string) => {
        const doc = new jsPDF();
        let text = "";

        // Robust text extraction
        if (typeof content.text === "string") text = content.text;
        else if (typeof content.content === "string") text = content.content;
        else if (typeof content.text_content === "string") text = content.text_content;
        else if (typeof content.full_text === "string") text = content.full_text;
        else if (typeof content.markdown === "string") text = content.markdown;
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
    );
}
