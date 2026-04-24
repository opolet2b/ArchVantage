"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Bold,
    Italic,
    Underline,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Code,
    Table as TableIcon,
    Link as LinkIcon,
    Image as ImageIcon,
    Scissors,
    Copy,
    Clipboard,
    Save,
    Quote,
    Minus,
    FileText as FileIcon,
    Undo,
    Redo
} from "lucide-react";
import React from 'react';

// Tiptap Extensions
import UnderlineExtension from '@tiptap/extension-underline';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';

interface WysiwygEditorProps {
    content: string;
    onChange: (content: string) => void;
    className?: string;
    onSave?: () => void;
}

export const WysiwygEditor = React.forwardRef<any, WysiwygEditorProps>(({ content, onChange, className, onSave }, ref) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            UnderlineExtension,
            LinkExtension.configure({
                openOnClick: false,
            }),
            ImageExtension,
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableHeader,
            TableCell,
            Markdown.configure({
                html: false,
                transformPastedText: true,
                transformCopiedText: true,
                breaks: true, // Convert hard breaks to <br> or \  
            }),
        ],
        immediatelyRender: false,
        // content: content, // We will set content via useEffect to ensure markdown parsing
        editorProps: {
            attributes: {
                class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[150px]',
            },
        },
        onUpdate: ({ editor }) => {
            const markdownStorage = (editor.storage as any).markdown;
            onChange(markdownStorage.getMarkdown());
        },
    });

    // Expose methods to parent
    React.useImperativeHandle(ref, () => ({
        insertContent: (text: string) => {
            if (editor) {
                editor.chain().focus().insertContent(text).run();
            }
        },
        focus: () => {
            if (editor) {
                editor.commands.focus();
            }
        }
    }), [editor]);

    // Set initial content as markdown
    React.useEffect(() => {
        if (editor && content) {
            // Only set if editor is empty to avoid overwriting or loops if this logic expands.
            // Since we remount on toggles, this is fine for initialization.
            if (editor.isEmpty) {
                editor.commands.setContent(content);
            }
        }
    }, [editor, content]);


    if (!editor) {
        return null;
    }


    const addImage = () => {
        const url = window.prompt('URL');
        if (url) {
            editor.chain().focus().setImage({ src: url }).run();
        }
    };

    const addLink = () => {
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('URL', previousUrl);
        if (url === null) {
            return;
        }
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    // Toolbar mirroring MarkdownToolbar.tsx EXACTLY
    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Toolbar */}
            <div className="flex items-center gap-1 p-1 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-hide flex-none">

                {/* Save */}
                {onSave && (
                    <Button variant="ghost" size="icon" onClick={onSave} title="Save Changes (Ctrl+S)" className="h-8 w-8 text-green-600 font-bold hover:bg-green-50 dark:hover:bg-green-900/20 shrink-0">
                        <Save className="h-4 w-4" />
                    </Button>
                )}

                <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

                {/* Bold/Italic/Underline */}
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    disabled={!editor.can().chain().focus().toggleBold().run()}
                    className={cn("h-8 w-8 font-bold shrink-0", editor.isActive('bold') ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Bold"
                >
                    <Bold className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    disabled={!editor.can().chain().focus().toggleItalic().run()}
                    className={cn("h-8 w-8 italic shrink-0", editor.isActive('italic') ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Italic"
                >
                    <Italic className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={cn("h-8 w-8 underline shrink-0", editor.isActive('underline') ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Underline"
                >
                    <Underline className="h-4 w-4" />
                </Button>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

                {/* Headings */}
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={cn("h-8 w-8 shrink-0", editor.isActive('heading', { level: 1 }) ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Heading 1"
                >
                    <Heading1 className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={cn("h-8 w-8 shrink-0", editor.isActive('heading', { level: 2 }) ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Heading 2"
                >
                    <Heading2 className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    className={cn("h-8 w-8 shrink-0", editor.isActive('heading', { level: 3 }) ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Heading 3"
                >
                    <Heading3 className="h-4 w-4" />
                </Button>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

                {/* Lists */}
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={cn("h-8 w-8 shrink-0", editor.isActive('bulletList') ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Bullet List"
                >
                    <List className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={cn("h-8 w-8 shrink-0", editor.isActive('orderedList') ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Numbered List"
                >
                    <ListOrdered className="h-4 w-4" />
                </Button>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

                {/* Special Items */}
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().setHardBreak().run()}
                    className="h-8 w-8 shrink-0"
                    title="Line Break (<br>)"
                >
                    <Minus className="h-4 w-4 transform rotate-90" /> {/* Approximate visualization */}
                </Button>
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().insertContent("\n\n---page-break---\n\n").run()}
                    className="h-8 w-8 text-blue-500 shrink-0"
                    title="Page Break (PDF)"
                >
                    <FileIcon className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    className={cn("h-8 w-8 shrink-0", editor.isActive('codeBlock') ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Code Block"
                >
                    <Code className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    className={cn("h-8 w-8 shrink-0", editor.isActive('blockquote') ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Blockquote"
                >
                    <Quote className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost" size="icon"
                    onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                    className="h-8 w-8 shrink-0"
                    title="Insert Table"
                >
                    <TableIcon className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost" size="icon"
                    onClick={addLink}
                    className={cn("h-8 w-8 shrink-0", editor.isActive('link') ? 'bg-slate-200 dark:bg-slate-800' : '')}
                    title="Link"
                >
                    <LinkIcon className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost" size="icon"
                    onClick={addImage}
                    className="h-8 w-8 shrink-0"
                    title="Image"
                >
                    <ImageIcon className="h-4 w-4" />
                </Button>


                <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

                {/* Clipboard (Browser limitations usually prevent direct access, but we can try basic or tell user) */}
                <Button variant="ghost" size="icon" onClick={() => {
                    const sel = window.getSelection();
                    if (sel && sel.toString()) navigator.clipboard.writeText(sel.toString());
                }} title="Cut Selection (Native)" className="h-8 w-8 shrink-0">
                    <Scissors className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => {
                    const sel = window.getSelection();
                    if (sel && sel.toString()) navigator.clipboard.writeText(sel.toString());
                }} title="Copy Selection (Native)" className="h-8 w-8 shrink-0">
                    <Copy className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => {
                    navigator.clipboard.readText().then(text => editor.chain().focus().insertContent(text).run());
                }} title="Paste from Clipboard" className="h-8 w-8 shrink-0">
                    <Clipboard className="h-4 w-4" />
                </Button>

            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-y-auto p-4 cursor-text" onClick={() => editor.chain().focus().run()}>
                <EditorContent editor={editor} className="min-h-full" />
            </div>
        </div>
    );
});

