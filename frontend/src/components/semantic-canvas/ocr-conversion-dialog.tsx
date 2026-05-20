"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, Loader2, Download, AlertCircle, Clock, Wand2, Brain } from "lucide-react";
import { API_URL } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useCanvasStore } from "./canvas-store";

interface OCRConversionDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export function OCRConversionDialog({ isOpen, onClose }: OCRConversionDialogProps) {
    const [file, setFile] = React.useState<File | null>(null);
    const [jobId, setJobId] = React.useState<string | null>(null);
    const [status, setStatus] = React.useState<"idle" | "uploading" | "processing" | "completed" | "error">("idle");
    const [progress, setProgress] = React.useState(0);
    const [error, setError] = React.useState<string | null>(null);
    const [estimatedTime, setEstimatedTime] = React.useState<string | null>(null);
    const visionModel = useCanvasStore((state) => state.visionModel);
    const selectedModel = useCanvasStore((state) => state.selectedModel);
    const { toast } = useToast();

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    
    // Poll for status
    React.useEffect(() => {
        let interval: NodeJS.Timeout;

        if (status === "processing" && jobId) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(`${API_URL}/tools/ocr/status/${jobId}`);
                    if (!res.ok) throw new Error("Failed to fetch status");
                    
                    const data = await res.json();
                    
                    if (data.status === "completed") {
                        setStatus("completed");
                        setProgress(100);
                        clearInterval(interval);
                    } else if (data.status === "error") {
                        setStatus("error");
                        setError(data.error || "Unknown processing error");
                        clearInterval(interval);
                    } else {
                        setProgress(data.progress || 0);
                        
                        if (data.total_pages && data.current_page && data.start_time) {
                            const elapsed = (Date.now() / 1000) - data.start_time;
                            const avgTimePerPage = elapsed / data.current_page;
                            const remainingPages = data.total_pages - data.current_page;
                            const estimatedSeconds = Math.ceil(remainingPages * avgTimePerPage);
                            
                            if (estimatedSeconds > 0) {
                                if (estimatedSeconds > 60) {
                                    setEstimatedTime(`${Math.floor(estimatedSeconds / 60)}m ${estimatedSeconds % 60}s`);
                                } else {
                                    setEstimatedTime(`${estimatedSeconds} seconds`);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Polling error:", err);
                }
            }, 2000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [status, jobId]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            setFile(selected);
            setStatus("idle");
            setError(null);
        }
    };

    const handleStartConversion = async () => {
        if (!file) return;

        setStatus("uploading");
        setError(null);

        try {
            const formData = new FormData();
            formData.append("file", file);
            // Use specific vision model selection, fallback to main model selection
            const activeVlm = visionModel || selectedModel;
            if (activeVlm) {
                formData.append("vlm_config", activeVlm);
            }

            const res = await fetch(`${API_URL}/tools/ocr/start`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Upload failed");
            }

            const data = await res.json();
            setJobId(data.job_id);
            setStatus("processing");
            setProgress(0);
        } catch (err: any) {
            setStatus("error");
            setError(err.message);
            toast({
                title: "Conversion Failed",
                description: err.message,
                variant: "destructive"
            });
        }
    };

    const handleDownload = () => {
        if (!jobId) return;
        window.open(`${API_URL}/tools/ocr/download/${jobId}`, "_blank");
    };

    const reset = () => {
        setFile(null);
        setJobId(null);
        setStatus("idle");
        setProgress(0);
        setError(null);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) {
                if (status === "processing") {
                    if (confirm("Conversion is still in progress. Closing this window will not stop it, but you'll lose the progress view. Close?")) {
                        onClose();
                        reset();
                    }
                } else {
                    onClose();
                    reset();
                }
            }
        }}>
            <DialogContent className="sm:max-width-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wand2 className="h-5 w-5 text-blue-500" />
                        AI OCR & Document Conversion
                    </DialogTitle>
                    <DialogDescription>
                        Convert images or scanned PDFs into readable HTML. 
                        This tool uses AI to extract text and tables while preserving layout images.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Model Info Banner */}
                    <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900 border rounded-lg text-sm">
                        <Brain className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground font-medium">Using Vision Model:</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {visionModel || selectedModel || "Default System Model"}
                        </span>
                    </div>

                    <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded text-amber-700 dark:text-amber-400 text-[10px]">
                        <strong>Note:</strong> This tool extracts structured text and crops images. It does not vectorize the document.
                    </div>
                </div>

                <div className="py-6 space-y-4">
                    {status === "idle" && (
                        <div 
                            className="border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input 
                                type="file" 
                                className="hidden" 
                                ref={fileInputRef} 
                                onChange={handleFileSelect}
                                accept=".pdf,image/*"
                            />
                            {file ? (
                                <div className="text-center">
                                    <div className="font-medium text-sm mb-1">{file.name}</div>
                                    <div className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                    <Button variant="ghost" size="sm" className="mt-4 text-xs h-7" onClick={(e) => { e.stopPropagation(); setFile(null); }}>Change File</Button>
                                </div>
                            ) : (
                                <>
                                    <div className="p-4 bg-blue-100 dark:bg-blue-900 rounded-full">
                                        <Download className="w-6 h-6 text-blue-600 dark:text-blue-400 rotate-180" />
                                    </div>
                                    <div className="text-center">
                                        <div className="font-medium">Click to upload</div>
                                        <div className="text-xs text-muted-foreground mt-1">PDF or Image (JPG, PNG)</div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {(status === "uploading" || status === "processing") && (
                        <div className="space-y-6 py-4">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 font-medium">
                                    {status === "uploading" ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Uploading File...
                                        </>
                                    ) : (
                                        <>
                                            <div className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                            </div>
                                            AI Processing...
                                        </>
                                    )}
                                </div>
                                <span className="font-mono text-blue-600 dark:text-blue-400">{progress}%</span>
                            </div>
                            
                            <div className="space-y-2">
                                <Progress value={progress} className="h-2" />
                                <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest">
                                    <span>Transcribing Text</span>
                                    <span>Cropping Images</span>
                                    <span>Generating HTML</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-muted-foreground">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Estimated time left: {estimatedTime || "Calculating..."}</span>
                            </div>
                        </div>
                    )}

                    {status === "completed" && (
                        <div className="flex flex-col items-center justify-center gap-4 py-6">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                                <Download className="w-8 h-8 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="text-center">
                                <h3 className="font-bold text-lg">Conversion Complete!</h3>
                                <p className="text-sm text-muted-foreground">Your document is ready with all text and images preserved.</p>
                            </div>
                            <Button onClick={handleDownload} className="w-full mt-2 gap-2 bg-green-600 hover:bg-green-700">
                                <Download className="w-4 h-4" />
                                Download HTML Result
                            </Button>
                        </div>
                    )}

                    {status === "error" && (
                        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <div className="font-bold text-sm text-destructive">Error Occurred</div>
                                <p className="text-xs text-destructive/80">{error || "An unknown error occurred during conversion."}</p>
                                <Button variant="outline" size="sm" onClick={reset} className="mt-2 text-xs h-7 border-destructive/30 hover:bg-destructive/5 text-destructive">Try Again</Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {status === "idle" && (
                        <>
                            <Button variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button disabled={!file} onClick={handleStartConversion}>Start Conversion</Button>
                        </>
                    )}
                    {status === "completed" && (
                        <Button variant="outline" onClick={reset}>Convert Another</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
