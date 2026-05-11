"use client"

import { useState, useEffect } from "react"
import { HelpCircle, Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

import {
    Dialog,
    DialogContent,
    DialogTrigger,
    DialogTitle,
} from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

interface HelpTooltipProps {
    contentPath: string
    className?: string
    displayMode?: "popover" | "dialog"
}

export function HelpTooltip({ contentPath, className, displayMode = "popover" }: HelpTooltipProps) {
    const [content, setContent] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
    const [isOpen, setIsOpen] = useState(false)

    // Fetch content only when opened
    useEffect(() => {
        if (isOpen && !content && !loading) {
            setLoading(true)
            fetch(`/help/${contentPath}.md`)
                .then((res) => {
                    if (!res.ok) throw new Error("Content not found")
                    return res.text()
                })
                .then((text) => {
                    setContent(text)
                    setLoading(false)
                })
                .catch((err) => {
                    console.error("Failed to load help content:", err)
                    setError(true)
                    setLoading(false)
                })
        }
    }, [isOpen, contentPath, content, loading])

    const ContentBody = () => (
        <>
            {loading ? (
                <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : error ? (
                <div className="text-sm text-red-500">
                    Failed to load help content. Please ensure <code>public/help/{contentPath}.md</code> exists.
                </div>
            ) : (
                <div className={`text-sm prose dark:prose-invert max-w-none rich-text ${displayMode === 'dialog' ? 'prose-headings:mt-4 first:prose-headings:mt-0' : ''}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                    </ReactMarkdown>
                </div>
            )}
        </>
    )

    if (displayMode === "dialog") {
        return (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => e.stopPropagation()}
                        className={`h-5 w-5 rounded-full text-muted-foreground hover:text-primary ${className}`}
                    >
                        <HelpCircle className="h-4 w-4" />
                        <span className="sr-only">Help</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <VisuallyHidden>
                        <DialogTitle>Help Content</DialogTitle>
                    </VisuallyHidden>
                    <ContentBody />
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => e.stopPropagation()}
                    className={`h-5 w-5 rounded-full text-muted-foreground hover:text-primary ${className}`}
                >
                    <HelpCircle className="h-4 w-4" />
                    <span className="sr-only">Help</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-[400px] overflow-y-auto rich-text" onClick={(e) => e.stopPropagation()}>
                <ContentBody />
            </PopoverContent>
        </Popover>
    )
}
