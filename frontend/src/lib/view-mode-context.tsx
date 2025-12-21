/**
 * View Mode Context
 *
 * Provides shared state for the current view mode (chat or canvas)
 * so that the sidebar can show appropriate content.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";

// =============================================================================
// Types
// =============================================================================

export type ViewMode = "chat" | "canvas";

interface ViewModeContextType {
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;
}

// =============================================================================
// Context
// =============================================================================

const ViewModeContext = React.createContext<ViewModeContextType | undefined>(
    undefined
);

// =============================================================================
// Provider
// =============================================================================

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
    const [viewMode, setViewMode] = React.useState<ViewMode>("chat");

    return (
        <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
            {children}
        </ViewModeContext.Provider>
    );
}

// =============================================================================
// Hook
// =============================================================================

export function useViewMode(): ViewModeContextType {
    const context = React.useContext(ViewModeContext);
    if (!context) {
        throw new Error("useViewMode must be used within a ViewModeProvider");
    }
    return context;
}
