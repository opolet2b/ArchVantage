"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Underline } from "@tiptap/extension-underline";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Markdown } from "tiptap-markdown";
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Code,
    Table as TableIcon,
    Link as LinkIcon,
    Image as ImageIcon,
    Quote,
    CheckSquare,
    Highlighter,
    Scissors,
    Copy,
    Clipboard,
    FileText,
    Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WysiwygEditorProps {
    content: string;
    onChange: (content: string) => void;
    className?: string;
}

export function WysiwygEditor({ content, onChange, className }: WysiwygEditorProps) {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                codeBlock: false, // We'll use a better code block later if needed
            }),
            Markdown.configure({
                html: true,
                tightLists: true,
                tightListClass: 'tight',
                bulletListMarker: '-',
                linkify: true,
                breaks: true,
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: 'text-blue-600 dark:text-blue-400 underline',
                },
            }),
            Image.configure({
                HTMLAttributes: {
                    class: 'rounded-lg max-w-full h-auto my-4',
                },
            }),
            Underline,
            Highlight,
            TaskList,
            TaskItem.configure({
                nested: true,
            }),
            Placeholder.configure({
                placeholder: 'Write something amazing...',
            }),
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: content,
        onUpdate: ({ editor }) => {
            // Get markdown from editor
            const markdown = (editor.storage as any).markdown.getMarkdown();
            onChange(markdown);
        },
        editorProps: {
            attributes: {
                class: cn(
                    "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] h-full p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-inner leading-relaxed",
                    className
                ),
            },
        },
    });

    // Content sync if needed (e.g. when switching modes back to WYSIWYG)
    React.useEffect(() => {
        if (editor && content !== (editor.storage as any).markdown.getMarkdown()) {
            editor.commands.setContent(content, { emitUpdate: false });
        }
    }, [content, editor]);

    if (!editor) return null;

    return (
        <div className="flex flex-col h-full border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900/50">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 p-1 border-b bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        // Trigger save from parent
                        const saveBtn = document.querySelector('button[title="Save"]');
                        if (saveBtn) (saveBtn as HTMLButtonElement).click();
                    }}
                    className="h-8 w-8 text-green-600 font-bold hover:bg-green-50 dark:hover:bg-green-900/20"
                    title="Save Changes (Ctrl+S)"
                >
                    <Save className="h-4 w-4" />
                </Button>

                <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1" />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    disabled={!editor.can().chain().focus().toggleBold().run()}
                    className={cn("h-8 w-8", editor.isActive('bold') && "bg-slate-200 dark:bg-slate-800")}
                    title="Bold"
                >
                    <Bold className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    disabled={!editor.can().chain().focus().toggleItalic().run()}
                    className={cn("h-8 w-8", editor.isActive('italic') && "bg-slate-200 dark:bg-slate-800")}
                    title="Italic"
                >
                    <Italic className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={cn("h-8 w-8", editor.isActive('underline') && "bg-slate-200 dark:bg-slate-800")}
                    title="Underline"
                >
                    <UnderlineIcon className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleHighlight().run()}
                    className={cn("h-8 w-8", editor.isActive('highlight') && "bg-slate-200 dark:bg-slate-800")}
                    title="Highlight"
                >
                    <Highlighter className="h-4 w-4" />
                </Button>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={cn("h-8 w-8", editor.isActive('heading', { level: 1 }) && "bg-slate-200 dark:bg-slate-800")}
                    title="Heading 1"
                >
                    <Heading1 className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={cn("h-8 w-8", editor.isActive('heading', { level: 2 }) && "bg-slate-200 dark:bg-slate-800")}
                    title="Heading 2"
                >
                    <Heading2 className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    className={cn("h-8 w-8", editor.isActive('heading', { level: 3 }) && "bg-slate-200 dark:bg-slate-800")}
                    title="Heading 3"
                >
                    <Heading3 className="h-4 w-4" />
                </Button>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={cn("h-8 w-8", editor.isActive('bulletList') && "bg-slate-200 dark:bg-slate-800")}
                    title="Bullet List"
                >
                    <List className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={cn("h-8 w-8", editor.isActive('orderedList') && "bg-slate-200 dark:bg-slate-800")}
                    title="Numbered List"
                >
                    <ListOrdered className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleTaskList().run()}
                    className={cn("h-8 w-8", editor.isActive('taskList') && "bg-slate-200 dark:bg-slate-800")}
                    title="Task List"
                >
                    <CheckSquare className="h-4 w-4" />
                </Button>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    className={cn("h-8 w-8", editor.isActive('blockquote') && "bg-slate-200 dark:bg-slate-800")}
                    title="Blockquote"
                >
                    <Quote className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    className={cn("h-8 w-8", editor.isActive('code') && "bg-slate-200 dark:bg-slate-800")}
                    title="Code Inline"
                >
                    <Code className="h-4 w-4" />
                </Button>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        const url = window.prompt('URL');
                        if (url) editor.chain().focus().setLink({ href: url }).run();
                    }}
                    className={cn("h-8 w-8", editor.isActive('link') && "bg-slate-200 dark:bg-slate-800")}
                    title="Link"
                >
                    <LinkIcon className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        const url = window.prompt('Image URL');
                        if (url) editor.chain().focus().setImage({ src: url }).run();
                    }}
                    className={cn("h-8 w-8", editor.isActive('image') && "bg-slate-200 dark:bg-slate-800")}
                    title="Insert Image"
                >
                    <ImageIcon className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                    }}
                    className="h-8 w-8"
                    title="Insert Table"
                >
                    <TableIcon className="h-4 w-4" />
                </Button>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        editor.chain().focus().selectAll().run();
                        document.execCommand('cut');
                    }}
                    className="h-8 w-8"
                    title="Cut Selection"
                >
                    <Scissors className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        editor.chain().focus().selectAll().run();
                        document.execCommand('copy');
                    }}
                    className="h-8 w-8"
                    title="Copy Selection"
                >
                    <Copy className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                        try {
                            const text = await navigator.clipboard.readText();
                            editor.chain().focus().insertContent(text).run();
                        } catch (err) {
                            console.error("Paste failed", err);
                        }
                    }}
                    className="h-8 w-8"
                    title="Paste from Clipboard"
                >
                    <Clipboard className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        // Insert horizontal rule as a representative for "Page Break" in WYSIWYG
                        editor.chain().focus().setHorizontalRule().run();
                    }}
                    className="h-8 w-8 text-blue-500"
                    title="Page Break (PDF)"
                >
                    <FileText className="h-4 w-4" />
                </Button>
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 shadow-inner">
                <EditorContent editor={editor} className="h-full" />
            </div>
        </div>
    );
}
