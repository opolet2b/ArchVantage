"use client";

import * as React from "react";
import { NodeProps, NodeResizer } from "reactflow";
import { 
    Bold, 
    Italic, 
    Underline, 
    Palette, 
    Type, 
    Type as TypeIcon,
    Trash2,
    ChevronDown,
    Baseline,
    Highlighter
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "../canvas-store";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { HexColorPicker } from "react-colorful";

/**
 * Sticky Note Node Component
 * 
 * A simple text-only note with a customizable toolbar.
 * Supports bold, italic, underline, font selection, size, and colors.
 * No title bar, movable by dragging anywhere.
 */

const FONT_FAMILIES = [
    { name: "Sans", value: "var(--font-sans, ui-sans-serif)" },
    { name: "Serif", value: "ui-serif, Georgia" },
    { name: "Mono", value: "ui-monospace, SFMono-Regular" },
    { name: "Handwritten", value: "'Comic Sans MS', cursive" },
];

const FONT_SIZES = [
    "12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px"
];

export function StickyNoteNode({ id, data, selected }: NodeProps) {
    const { thing, onResizeEnd, onDelete } = data;
    const updateThing = useCanvasStore(state => state.updateThing);
    const editingThingId = useCanvasStore(state => state.editingThingId);
    const setEditingThingId = useCanvasStore(state => state.setEditingThingId);
    const accessLevel = useCanvasStore(state => state.accessLevel);
    const isReadOnly = accessLevel === "read";
    
    const isEditing = editingThingId === id && !isReadOnly;
    const containerRef = React.useRef<HTMLDivElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);
    
    // Internal state for formatting (to keep UI responsive)
    const [content, setContent] = React.useState(thing.content?.text || "");
    const [bgColor, setBgColor] = React.useState(thing.color || "#fef9c3");
    
    // Sync external content changes and manage innerHTML manually
    React.useEffect(() => {
        if (thing.content?.text) {
            const text = thing.content.text as string;
            // Manually update DOM only when not editing to prevent cursor jumps
            if (!isEditing && contentRef.current) {
                contentRef.current.innerHTML = text;
            }
            if (text !== content) {
                setContent(text);
            }
        } else if (!isEditing && contentRef.current) {
            contentRef.current.innerHTML = "";
            setContent("");
        }
    }, [thing.content?.text, isEditing]);

    const [fontFamilyOpen, setFontFamilyOpen] = React.useState(false);
    const [fontSizeOpen, setFontSizeOpen] = React.useState(false);
    const [textColorOpen, setTextColorOpen] = React.useState(false);
    const [textBgColorOpen, setTextBgColorOpen] = React.useState(false);
    const [bgColorOpen, setBgColorOpen] = React.useState(false);

    const handleContentChange = () => {
        if (isReadOnly) return;
        if (contentRef.current) {
            const newText = contentRef.current.innerHTML;
            // We update the store but DON'T update the local content state
            // while editing to avoid React re-rendering the innerHTML.
            updateThing(id, {
                content: { ...thing.content, text: newText }
            });
        }
    };

    const execCommand = (command: string, value?: string) => {
        if (isReadOnly) return;
        if (document.activeElement !== contentRef.current) {
            contentRef.current?.focus();
        }
        document.execCommand(command, false, value);
        handleContentChange();
    };

    const handleBgColorChange = (color: string) => {
        if (isReadOnly) return;
        setBgColor(color);
        updateThing(id, { color });
    };

    const handleNodeClick = (e: React.MouseEvent) => {
        if (isReadOnly) return;
        // We use onClick (which fires after mouseup) to enter edit mode.
        // React Flow handles selection and dragging on pointerdown.
        if (!isEditing) {
            setEditingThingId(id);
        }
    };

    // When clicking outside, stop editing
    React.useEffect(() => {
        if (!isEditing) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            
            // 1. If click is inside the note container, don't stop editing
            if (containerRef.current?.contains(target)) {
                return;
            }

            // 2. If click is inside the toolbar or a Radix portal (Popovers)
            // Radix popovers are rendered in portals outside the container.
            if (target.closest('[data-sticky-toolbar="true"]') || 
                target.closest('[role="dialog"]') || 
                target.closest('[data-radix-popper-content-wrapper]')) {
                return;
            }

            // 3. Otherwise, stop editing
            if (contentRef.current) {
                const newText = contentRef.current.innerHTML;
                updateThing(id, {
                    content: { ...thing.content, text: newText }
                });
            }
            setEditingThingId(null);
        };

        // Use capture: true to ensure we see the event even if propagation is stopped elsewhere
        document.addEventListener("mousedown", handleClickOutside, true);
        return () => document.removeEventListener("mousedown", handleClickOutside, true);
    }, [isEditing, setEditingThingId, id, thing.content, updateThing]);

    // When entering edit mode, focus the content
    React.useEffect(() => {
        if (isEditing && contentRef.current) {
            contentRef.current.focus();
            
            // Move cursor to end
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(contentRef.current);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
    }, [isEditing]);

    return (
        <div 
            ref={containerRef}
            className={cn(
                "group relative min-w-[150px] min-h-[150px] flex flex-col transition-all duration-200",
                selected ? "ring-2 ring-blue-500 shadow-xl scale-[1.02] z-10" : "shadow-md hover:shadow-lg",
                !isEditing && "cursor-pointer"
            )}
            style={{ 
                backgroundColor: bgColor,
                transform: isEditing ? "none" : "rotate(-0.5deg)",
                transition: "transform 0.2s ease-in-out",
                borderRadius: "2px",
                width: "100%",
                height: "100%",
            }}
            onClick={handleNodeClick}
        >


            {/* Toolbar - Only visible in edit mode */}
            {isEditing && (
                <div 
                    data-sticky-toolbar="true"
                    className="absolute -top-12 left-0 right-0 flex items-center gap-1 p-1 bg-white dark:bg-slate-900 border rounded-t-lg shadow-lg z-50 overflow-x-auto scrollbar-hide nodrag"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {/* Basic Formatting */}
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8" 
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => execCommand("bold")}
                        title="Bold"
                    >
                        <Bold className="h-4 w-4" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8" 
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => execCommand("italic")}
                        title="Italic"
                    >
                        <Italic className="h-4 w-4" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8" 
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => execCommand("underline")}
                        title="Underline"
                    >
                        <Underline className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-6 bg-slate-200 mx-1" />

                    {/* Font Family */}
                    <Popover open={fontFamilyOpen} onOpenChange={setFontFamilyOpen} modal={false}>
                        <PopoverTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="px-2 h-8 gap-1" 
                                title="Font Family"
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                <TypeIcon className="h-4 w-4" />
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent 
    onOpenAutoFocus={(e) => e.preventDefault()} 
    onCloseAutoFocus={(e) => e.preventDefault()} className="w-40 p-1">
                            {FONT_FAMILIES.map(font => (
                                <Button 
                                    key={font.name} 
                                    variant="ghost" 
                                    className="w-full justify-start font-normal" 
                                    style={{ fontFamily: font.value }}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        execCommand("fontName", font.value);
                                        setFontFamilyOpen(false);
                                    }}
                                >
                                    {font.name}
                                </Button>
                            ))}
                        </PopoverContent>
                    </Popover>

                    {/* Font Size */}
                    <Popover open={fontSizeOpen} onOpenChange={setFontSizeOpen} modal={false}>
                        <PopoverTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="px-2 h-8 gap-1" 
                                title="Font Size"
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                <Baseline className="h-4 w-4" />
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent 
    onOpenAutoFocus={(e) => e.preventDefault()} 
    onCloseAutoFocus={(e) => e.preventDefault()} className="w-24 p-1">
                            <div className="grid grid-cols-1 gap-1">
                                {FONT_SIZES.map(size => (
                                    <Button 
                                        key={size} 
                                        variant="ghost" 
                                        className="w-full justify-start text-xs h-8"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            contentRef.current?.focus();
                                            const selection = window.getSelection();
                                            if (selection && selection.rangeCount > 0) {
                                                const range = selection.getRangeAt(0);
                                                const span = document.createElement("span");
                                                span.style.fontSize = size;
                                                
                                                if (range.collapsed) {
                                                    span.innerHTML = "&#8203;";
                                                    range.insertNode(span);
                                                    range.setStart(span.firstChild!, 1);
                                                    range.setEnd(span.firstChild!, 1);
                                                } else {
                                                    span.appendChild(range.extractContents());
                                                    range.insertNode(span);
                                                }
                                                handleContentChange();
                                                setFontSizeOpen(false);
                                            }
                                        }}
                                    >
                                        {size}
                                    </Button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    <div className="w-px h-6 bg-slate-200 mx-1" />

                    {/* Text Color */}
                    <Popover open={textColorOpen} onOpenChange={setTextColorOpen} modal={false}>
                        <PopoverTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8" 
                                title="Text Color"
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] font-bold">A</span>
                                    <div className="w-3 h-0.5 bg-current" />
                                </div>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent 
    onOpenAutoFocus={(e) => e.preventDefault()} 
    onCloseAutoFocus={(e) => e.preventDefault()} className="w-auto p-3">
                            <HexColorPicker onChange={(color) => {
                                contentRef.current?.focus();
                                execCommand("foreColor", color);
                                setTextColorOpen(false);
                            }} />
                        </PopoverContent>
                    </Popover>

                    {/* Text Background Color (Highlight) */}
                    <Popover open={textBgColorOpen} onOpenChange={setTextBgColorOpen} modal={false}>
                        <PopoverTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8" 
                                title="Text Highlight Color"
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                <Highlighter className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent 
    onOpenAutoFocus={(e) => e.preventDefault()} 
    onCloseAutoFocus={(e) => e.preventDefault()} className="w-auto p-3 flex flex-col gap-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full text-xs h-8"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    contentRef.current?.focus();
                                    document.execCommand("styleWithCSS", false, "true");
                                    execCommand("hiliteColor", "transparent");
                                    setTextBgColorOpen(false);
                                }}
                            >
                                Transparent
                            </Button>
                            <HexColorPicker onChange={(color) => {
                                contentRef.current?.focus();
                                document.execCommand("styleWithCSS", false, "true");
                                execCommand("hiliteColor", color);
                                setTextBgColorOpen(false);
                            }} />
                        </PopoverContent>
                    </Popover>

                    {/* Background Color */}
                    <Popover open={bgColorOpen} onOpenChange={setBgColorOpen} modal={false}>
                        <PopoverTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8" 
                                title="Note Color"
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                <Palette className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent 
    onOpenAutoFocus={(e) => e.preventDefault()} 
    onCloseAutoFocus={(e) => e.preventDefault()} className="w-auto p-3">
                            <HexColorPicker color={bgColor} onChange={(color) => {
                                handleBgColorChange(color);
                                setBgColorOpen(false);
                            }} />
                        </PopoverContent>
                    </Popover>

                    <div className="flex-1" />

                    {/* Delete */}
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" 
                        onClick={() => onDelete(id)}
                        title="Delete Note"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Note Content */}
            <div 
                ref={contentRef}
                contentEditable={isEditing}
                suppressContentEditableWarning
                onBlur={handleContentChange}
                onPointerDown={(e) => isEditing && e.stopPropagation()}
                className={cn(
                    "flex-1 p-6 outline-none overflow-auto prose prose-sm max-w-none dark:prose-invert",
                    isEditing ? "cursor-text nodrag" : "cursor-default"
                )}
                style={{ 
                    fontFamily: "var(--font-sans, ui-sans-serif)",
                }}
            />

            {/* Resize Handles */}
            {selected && !isReadOnly && (
                <NodeResizer 
                    minWidth={150} 
                    minHeight={150} 
                    isVisible={selected && !isReadOnly} 
                    lineClassName="border-blue-500" 
                    handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded-full"
                    onResizeEnd={(_, { width, height }) => onResizeEnd(id, width, height)}
                />
            )}
        </div>
    );
}
