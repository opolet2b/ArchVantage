
import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

interface VectorizationPreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    content: string;
    type?: "image_description" | "scanned_pdf" | "text";
}

export function VectorizationPreviewDialog({
    open,
    onOpenChange,
    title,
    content,
    type = "text",
}: VectorizationPreviewDialogProps) {

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {type === "image_description"
                            ? "Generated description used for vector search."
                            : "Transcribed text content from the document."}
                    </DialogDescription>
                </DialogHeader>

                <div className="relative border rounded-md mt-2 group bg-muted/5">
                    <div className="max-h-[60vh] w-full p-4 overflow-auto font-mono text-xs">
                        <pre className="whitespace-pre-wrap">
                            {content || "No content available."}
                        </pre>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background shadow-sm"
                        onClick={handleCopy}
                        title="Copy to clipboard"
                    >
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
