"use client";

import * as React from "react";
import {
    Bold,
    Italic,
    Underline,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Type,
    Code,
    Table,
    Link as LinkIcon,
    Image as ImageIcon,
    Scissors,
    Copy,
    Clipboard,
    Save,
    Quote,
    Minus,
    FileText as FileIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MarkdownToolbarProps {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    onSave?: () => void;
    className?: string;
}

export function MarkdownToolbar({ textareaRef, onSave, className }: MarkdownToolbarProps) {
    const insertMarkdown = (prefix: string, suffix: string = "") => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selection = text.substring(start, end);

        const before = text.substring(0, start);
        const after = text.substring(end);

        const newValue = before + prefix + selection + suffix + after;

        const lastValue = textarea.value;
        textarea.value = newValue;
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
        textarea.focus();

        // Trigger React's onChange
        const event = new Event('input', { bubbles: true });
        // @ts-ignore - hacking React's internal value tracker
        const tracker = (textarea as any)._valueTracker;
        if (tracker) {
            tracker.setValue(lastValue);
        }
        textarea.dispatchEvent(event);
    };

    const insertBlockMarkdown = (prefix: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        const beforeSelection = text.substring(0, start);
        const lastNewline = beforeSelection.lastIndexOf('\n');
        const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;

        const before = text.substring(0, lineStart);
        const after = text.substring(lineStart);

        const newValue = before + prefix + after;

        const lastValue = textarea.value;
        textarea.value = newValue;
        const newPos = start + prefix.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();

        // Trigger React's onChange
        const event = new Event('input', { bubbles: true });
        // @ts-ignore - hacking React's internal value tracker
        const tracker = (textarea as any)._valueTracker;
        if (tracker) {
            tracker.setValue(lastValue);
        }
        textarea.dispatchEvent(event);
    };

    const insertTable = () => {
        const tableTemplate = "\n| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n";
        insertMarkdown(tableTemplate, "");
    };

    const insertLineBreak = () => {
        insertMarkdown("<br>\n", "");
    };

    const insertPageBreak = () => {
        insertMarkdown("\n\n---page-break---\n\n", "");
    };

    const handleCut = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selection = text.substring(start, end);

        if (selection) {
            navigator.clipboard.writeText(selection);
            const newValue = text.substring(0, start) + text.substring(end);
            const lastValue = textarea.value;
            textarea.value = newValue;
            textarea.setSelectionRange(start, start);
            textarea.focus();

            // Trigger React's onChange
            const event = new Event('input', { bubbles: true });
            // @ts-ignore - hacking React's internal value tracker
            const tracker = (textarea as any)._valueTracker;
            if (tracker) {
                tracker.setValue(lastValue);
            }
            textarea.dispatchEvent(event);
        }
    };

    const handlePaste = async () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const currentValue = textarea.value;
                const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);

                const lastValue = textarea.value;
                textarea.value = newValue;
                textarea.setSelectionRange(start + text.length, start + text.length);
                textarea.focus();

                // Trigger React's onChange
                const event = new Event('input', { bubbles: true });
                // @ts-ignore - hacking React's internal value tracker
                const tracker = (textarea as any)._valueTracker;
                if (tracker) {
                    tracker.setValue(lastValue);
                }
                textarea.dispatchEvent(event);
            }
        } catch (err) {
            console.error("Failed to read clipboard:", err);
        }
    };

    return (
        <div className={cn("flex items-center gap-1 p-1 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-hide", className)}>
            {onSave && (
                <Button variant="ghost" size="icon" onClick={onSave} title="Save Changes (Ctrl+S)" className="h-8 w-8 text-green-600 font-bold hover:bg-green-50 dark:hover:bg-green-900/20 shrink-0">
                    <Save className="h-4 w-4" />
                </Button>
            )}

            <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

            {/* Bold/Italic/Underline */}
            <Button variant="ghost" size="icon" onClick={() => insertMarkdown("**", "**")} title="Bold" className="h-8 w-8 font-bold shrink-0">
                <Bold className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => insertMarkdown("*", "*")} title="Italic" className="h-8 w-8 italic shrink-0">
                <Italic className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => insertMarkdown("<u>", "</u>")} title="Underline" className="h-8 w-8 underline shrink-0">
                <Underline className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

            {/* Headings */}
            <Button variant="ghost" size="icon" onClick={() => insertBlockMarkdown("# ")} title="Heading 1" className="h-8 w-8 shrink-0">
                <Heading1 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => insertBlockMarkdown("## ")} title="Heading 2" className="h-8 w-8 shrink-0">
                <Heading2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => insertBlockMarkdown("### ")} title="Heading 3" className="h-8 w-8 shrink-0">
                <Heading3 className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

            {/* Lists */}
            <Button variant="ghost" size="icon" onClick={() => insertBlockMarkdown("- ")} title="Bullet List" className="h-8 w-8 shrink-0">
                <List className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => insertBlockMarkdown("1. ")} title="Numbered List" className="h-8 w-8 shrink-0">
                <ListOrdered className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

            {/* Special */}
            <Button variant="ghost" size="icon" onClick={insertLineBreak} title="Line Break (<br>)" className="h-8 w-8 shrink-0">
                <Minus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={insertPageBreak} title="Page Break (PDF)" className="h-8 w-8 text-blue-500 shrink-0">
                <FileIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => insertMarkdown("```\n", "\n```")} title="Code Block" className="h-8 w-8 shrink-0">
                <Code className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => insertBlockMarkdown("> ")} title="Blockquote" className="h-8 w-8 shrink-0">
                <Quote className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={insertTable} title="Insert Table" className="h-8 w-8 shrink-0">
                <Table className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => insertMarkdown("[", "](url)")} title="Link" className="h-8 w-8 shrink-0">
                <LinkIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => insertMarkdown("![alt](", ")")} title="Image" className="h-8 w-8 shrink-0">
                <ImageIcon className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

            {/* Clipboard Ops */}
            <Button variant="ghost" size="icon" onClick={handleCut} title="Cut Selection" className="h-8 w-8 shrink-0">
                <Scissors className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => {
                const textarea = textareaRef.current;
                if (!textarea) return;
                const selection = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
                if (selection) navigator.clipboard.writeText(selection);
            }} title="Copy Selection" className="h-8 w-8 shrink-0">
                <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handlePaste} title="Paste from Clipboard" className="h-8 w-8 shrink-0">
                <Clipboard className="h-4 w-4" />
            </Button>
        </div>
    );
}
