"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { X, ChevronRight, ChevronLeft, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TrainerStep {
    targetId: string
    title: string
    content: React.ReactNode
    position?: "top" | "bottom" | "left" | "right"
}

interface ContextualTrainerProps {
    steps: TrainerStep[]
    workflowId: string
    onComplete?: () => void
    defaultOpen?: boolean
}

export function ContextualTrainer({
    steps,
    workflowId,
    onComplete,
    defaultOpen = true
}: ContextualTrainerProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    const [dontShowAgain, setDontShowAgain] = useState(false)

    // Refs for direct DOM manipulation
    const containerRef = useRef<HTMLDivElement>(null)
    const highlightRef = useRef<HTMLDivElement>(null)

    // Track if we have a valid target to show/hide elements without layout trash
    const [hasTarget, setHasTarget] = useState(false)

    // Load state from local storage
    useEffect(() => {
        const stored = localStorage.getItem(`trainer_dismissed_${workflowId}`)
        if (!stored) {
            setIsOpen(defaultOpen)
        }
    }, [workflowId, defaultOpen])

    const handleClose = () => {
        setIsOpen(false)
        if (dontShowAgain) {
            localStorage.setItem(`trainer_dismissed_${workflowId}`, "true")
        }
    }

    const currentStep = steps[currentStepIndex]

    // Find target and calculate position directly
    const updatePosition = useCallback(() => {
        if (!isOpen || !currentStep) return

        const targetEl = document.getElementById(currentStep.targetId)

        if (targetEl) {
            // Ensure we mark as having target
            if (highlightRef.current && containerRef.current) {
                highlightRef.current.style.display = "block"
                containerRef.current.style.display = "block"
            }
            // setHasTarget(true) // Avoid causing re-render loop if possible

            const rect = targetEl.getBoundingClientRect()

            // Update highlight position
            if (highlightRef.current) {
                highlightRef.current.style.top = `${rect.top}px`
                highlightRef.current.style.left = `${rect.left}px`
                highlightRef.current.style.width = `${rect.width}px`
                highlightRef.current.style.height = `${rect.height}px`
            }

            // Calculate tooltip position
            const tooltipWidth = 320
            const tooltipHeight = containerRef.current?.offsetHeight || 200 // Use actual height if available
            const gap = 12

            let top = 0
            let left = 0
            const pos = currentStep.position || "bottom"

            // Basic positioning logic
            if (pos === "top") {
                top = rect.top - tooltipHeight - gap
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2)
            } else if (pos === "bottom") {
                top = rect.bottom + gap
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2)
            } else if (pos === "left") {
                top = rect.top + (rect.height / 2) - (tooltipHeight / 2)
                left = rect.left - tooltipWidth - gap
            } else if (pos === "right") {
                top = rect.top + (rect.height / 2) - (tooltipHeight / 2)
                left = rect.right + gap
            }

            // Boundary checks
            const padding = 20
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight

            // Initial clamp
            if (left < padding) left = padding
            if (left + tooltipWidth > viewportWidth - padding) left = viewportWidth - tooltipWidth - padding
            if (top < padding) top = padding
            if (top + tooltipHeight > viewportHeight - padding) top = viewportHeight - tooltipHeight - padding

            // Smart flip if clamping forced overlap or bad position?
            // For now, sticking to the simple clamp + direct update is usually enough.

            if (containerRef.current) {
                containerRef.current.style.top = `${top}px`
                containerRef.current.style.left = `${left}px`
                containerRef.current.style.position = "fixed"
                containerRef.current.style.zIndex = "50"
            }

        } else {
            // Hide if target not found (scrolled away or unmounted)
            if (highlightRef.current) highlightRef.current.style.display = "none"

            // Fallback for tooltip: Center it? Or hide?
            // If the element is strictly tied to context, hiding/fading might be better.
            // But let's center it so user can still interact (e.g. Next/Close)
            if (containerRef.current) {
                containerRef.current.style.top = "50%"
                containerRef.current.style.left = "50%"
                containerRef.current.style.transform = "translate(-50%, -50%)"
            }
        }
    }, [isOpen, currentStep])

    // Update position on step change, resize, scroll
    useEffect(() => {
        // Initial update
        updatePosition()

        // Use requestAnimationFrame for smoother scroll tracking? 
        // Or just direct listener. Direct listener is usually fine for simple transforms.

        const handleScroll = () => {
            requestAnimationFrame(updatePosition)
        }

        window.addEventListener("resize", handleScroll)
        window.addEventListener("scroll", handleScroll, true) // Capture

        return () => {
            window.removeEventListener("resize", handleScroll)
            window.removeEventListener("scroll", handleScroll, true)
        }
    }, [updatePosition])

    // Polling for dynamic content
    useEffect(() => {
        if (!isOpen) return
        const interval = setInterval(updatePosition, 500)
        return () => clearInterval(interval)
    }, [isOpen, updatePosition])

    // Auto-scroll to target on step change
    useEffect(() => {
        if (!isOpen || !currentStep) return

        // Small timeout to allow render/layout to settle if needed, or just immediate.
        // Immediate is usually fine, but if the element is inside a modal that is just opening, 
        // a small delay might be safer. Let's try immediate first.
        const targetEl = document.getElementById(currentStep.targetId)
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" })
        }
    }, [isOpen, currentStep])



    const handleNext = () => {
        if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex(prev => prev + 1)
        } else {
            handleClose()
            onComplete?.()
        }
    }

    const handlePrev = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1)
        }
    }

    if (!isOpen) return null

    return (
        <>
            {/* Highlight Box - Direct DOM control */}
            <div
                ref={highlightRef}
                className="fixed pointer-events-none z-40 transition-all duration-75 ease-out border-2 border-primary/50 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                style={{ display: "none" }} // Hidden by default until positioned
            />

            {/* Tooltip Card - Direct DOM control */}
            <div
                ref={containerRef}
                className="w-[320px] fixed z-50" // Removed transition for instant tracking
                style={{ display: "block" }} // or whatever initial
            >
                <Card className="shadow-xl border-blue-500/30 backdrop-blur-sm bg-blue-50/95 dark:bg-blue-950/95">
                    <CardHeader className="pb-2 relative">
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-md font-bold text-primary">
                                {currentStep.title}
                            </CardTitle>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 -mr-2 -mt-2 text-muted-foreground hover:text-foreground"
                                onClick={handleClose}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground pb-4">
                        {currentStep.content}
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3 pt-0">
                        <div className="flex justify-between w-full items-center">
                            <div className="text-xs text-muted-foreground">
                                Step {currentStepIndex + 1} of {steps.length}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handlePrev}
                                    disabled={currentStepIndex === 0}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleNext}
                                    className="h-8 px-3 text-xs gap-1"
                                >
                                    {currentStepIndex === steps.length - 1 ? "Finish" : "Next"}
                                    {currentStepIndex === steps.length - 1 ? (
                                        <CheckCircle className="h-3 w-3" />
                                    ) : (
                                        <ChevronRight className="h-3 w-3" />
                                    )}
                                </Button>
                            </div>
                        </div>
                        <div className="w-full flex items-center gap-2 pt-2 border-t">
                            <input
                                type="checkbox"
                                id="dont-show-again"
                                className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                checked={dontShowAgain}
                                onChange={(e) => setDontShowAgain(e.target.checked)}
                            />
                            <label htmlFor="dont-show-again" className="text-xs text-muted-foreground cursor-pointer select-none">
                                Don't show this guide again
                            </label>
                        </div>
                    </CardFooter>
                </Card>
            </div>
        </>
    )
}
