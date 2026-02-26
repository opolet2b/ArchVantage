"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Check, ArrowRight } from "lucide-react";
import { API_URL } from "@/lib/utils";

interface PromptOptimizerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAccept: (text: string) => void;
    initialText?: string;
    contextType?: "instruction" | "purpose";
    title?: string;
    llmModel?: string;
}

export function PromptOptimizerDialog({
    open,
    onOpenChange,
    onAccept,
    initialText = "",
    contextType = "instruction",
    title = "AI Prompt improver",
    llmModel = "default"
}: PromptOptimizerDialogProps) {
    const [inputText, setInputText] = useState(initialText);
    const [optimizedText, setOptimizedText] = useState("");
    const [isOptimizing, setIsOptimizing] = useState(false);

    // Reset state when opened
    // (We rely on initialText logic or user typing)

    const handleOptimize = async () => {
        if (!inputText.trim()) return;
        setIsOptimizing(true);
        try {
            const response = await fetch(`${API_URL}/templates/optimize-prompt`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    text: inputText,
                    context_type: contextType,
                    llm_model: llmModel
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setOptimizedText(data.content);
            } else {
                console.error("Failed to optimize prompt");
            }
        } catch (error) {
            console.error("Error optimizing prompt:", error);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleUseSuggestion = () => {
        onAccept(optimizedText);
        onOpenChange(false);
        setOptimizedText("");
    };

    const handleUseDraft = () => {
        onAccept(inputText);
        onOpenChange(false);
        setOptimizedText("");
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                {/* ... existing header ... */}
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-amber-500" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        Draft your {contextType} below and let AI refine it for better results.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-500">Your Draft</label>
                        <Textarea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder={`e.g., Check if the document has ...`}
                            className="h-24 resize-none"
                        />
                    </div>

                    <div className="flex justify-center">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleOptimize}
                            disabled={isOptimizing || !inputText.trim()}
                            className="w-full"
                        >
                            {isOptimizing ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Optimizing...</>
                            ) : (
                                <><Sparkles className="mr-2 h-4 w-4 text-amber-500" /> Improve with AI</>
                            )}
                        </Button>
                    </div>

                    {optimizedText && (
                        <div className="grid gap-2 animate-in fade-in zoom-in-95 duration-200">
                            <label className="text-sm font-medium text-emerald-600 flex items-center gap-2">
                                <Sparkles className="h-3 w-3" /> AI Suggestion
                            </label>
                            <div className="p-3 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900 rounded-md text-sm">
                                {optimizedText}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="sm:justify-between flex-col sm:flex-row gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleUseDraft} disabled={!inputText.trim()}>
                            Use My Draft
                        </Button>
                        <Button onClick={handleUseSuggestion} disabled={!optimizedText}>
                            <Check className="mr-2 h-4 w-4" /> Use AI Suggestion
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
