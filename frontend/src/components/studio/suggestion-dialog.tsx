"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";

interface SuggestionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (intent: string) => void;
    title: string;
    description: string;
    placeholder?: string;
    isLoading: boolean;
    initialValue?: string;
}

export function SuggestionDialog({
    isOpen,
    onClose,
    onSubmit,
    title,
    description,
    placeholder = "Describe what you want to achieve...",
    isLoading,
    initialValue = ""
}: SuggestionDialogProps) {
    const [intent, setIntent] = useState(initialValue);

    // Update intent when opened with new initialValue
    React.useEffect(() => {
        if (isOpen) {
            setIntent(initialValue);
        }
    }, [isOpen, initialValue]);

    const handleSubmit = () => {
        onSubmit(intent);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-blue-500" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea
                        placeholder={placeholder}
                        value={intent}
                        onChange={(e) => setIntent(e.target.value)}
                        className="min-h-[100px] max-h-[60vh] overflow-y-auto"
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isLoading || !intent.trim()}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Generate
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
