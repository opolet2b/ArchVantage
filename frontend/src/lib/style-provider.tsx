"use client"

import * as React from "react"

export type VisualStyle = "default" | "glass" | "material" | "fluent"

interface StyleContextType {
    style: VisualStyle
    setStyle: (style: VisualStyle) => void
}

const StyleContext = React.createContext<StyleContextType | undefined>(undefined)

export function StyleProvider({ children }: { children: React.ReactNode }) {
    const [style, setStyle] = React.useState<VisualStyle>("default")
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        const savedStyle = localStorage.getItem("visual-style") as VisualStyle
        if (savedStyle) {
            setStyle(savedStyle)
        }
        setMounted(true)
    }, [])

    React.useEffect(() => {
        if (!mounted) return
        console.log("Setting style to:", style)
        localStorage.setItem("visual-style", style)
        document.documentElement.setAttribute("data-style", style)
    }, [style, mounted])

    // Prevent hydration mismatch by returning null until mounted, 
    // OR just render children to avoid flash, but style might jump.
    // For attributes, it's safer to wait for mount or use script injection (too complex for now).
    // We will let it flicker the default style briefly if needed, or use layout effect.

    return (
        <StyleContext.Provider value={{ style, setStyle }}>
            {children}
            {/* Script to avoid FOUC (Flash of Unstyled Content) if possible - optional */}
        </StyleContext.Provider>
    )
}

export function useStyle() {
    const context = React.useContext(StyleContext)
    if (context === undefined) {
        throw new Error("useStyle must be used within a StyleProvider")
    }
    return context
}
