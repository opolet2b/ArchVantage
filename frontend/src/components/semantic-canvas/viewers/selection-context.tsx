/**
 * Selection Context
 *
 * React context for managing content selections across viewers.
 * Provides a unified way to track what content is selected
 * and expose actions that can be performed on selections.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import type { Fragment } from "./types";

// =============================================================================
// Types
// =============================================================================

interface SelectionState {
    /** ID of the thing containing the selection */
    thingId: string | null;
    /** The fragment data representing the selection */
    fragment: Fragment | null;
    /** Whether selection is currently in progress */
    isSelecting: boolean;
    /** Position for floating toolbar */
    position: { x: number; y: number } | null;
}

interface SelectionContextValue {
    /** Current selection state */
    selection: SelectionState;
    /** Set a new selection */
    setSelection: (thingId: string, fragment: Fragment, position?: { x: number; y: number }) => void;
    /** Clear the current selection */
    clearSelection: () => void;
    /** Whether there is an active selection */
    hasSelection: boolean;
}

// =============================================================================
// Context
// =============================================================================

const SelectionContext = React.createContext<SelectionContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

interface SelectionProviderProps {
    children: React.ReactNode;
}

export function SelectionProvider({ children }: SelectionProviderProps) {
    const [selection, setSelectionState] = React.useState<SelectionState>({
        thingId: null,
        fragment: null,
        isSelecting: false,
        position: null,
    });

    // Set a new selection
    const setSelection = React.useCallback(
        (thingId: string, fragment: Fragment, position?: { x: number; y: number }) => {
            setSelectionState({
                thingId,
                fragment,
                isSelecting: false,
                position: position || null,
            });
        },
        []
    );

    // Clear the current selection
    const clearSelection = React.useCallback(() => {
        setSelectionState({
            thingId: null,
            fragment: null,
            isSelecting: false,
            position: null,
        });
    }, []);

    // Check if there's an active selection
    const hasSelection = selection.thingId !== null && selection.fragment !== null;

    const value = React.useMemo(
        () => ({
            selection,
            setSelection,
            clearSelection,
            hasSelection,
        }),
        [selection, setSelection, clearSelection, hasSelection]
    );

    return (
        <SelectionContext.Provider value={value}>
            {children}
        </SelectionContext.Provider>
    );
}

// =============================================================================
// Hook
// =============================================================================

export function useSelection() {
    const context = React.useContext(SelectionContext);
    if (context === undefined) {
        throw new Error("useSelection must be used within a SelectionProvider");
    }
    return context;
}
