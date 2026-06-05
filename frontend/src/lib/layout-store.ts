import { create } from "zustand";

interface LayoutState {
    leftPanelPinned: boolean;
    rightPanelPinned: boolean;
    topPanelPinned: boolean;
    
    toggleLeftPanelPin: () => void;
    toggleRightPanelPin: () => void;
    toggleTopPanelPin: () => void;
    
    setLeftPanelPin: (pinned: boolean) => void;
    setRightPanelPin: (pinned: boolean) => void;
    setTopPanelPin: (pinned: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
    leftPanelPinned: true,
    rightPanelPinned: true,
    topPanelPinned: true,
    
    toggleLeftPanelPin: () => set((state) => ({ leftPanelPinned: !state.leftPanelPinned })),
    toggleRightPanelPin: () => set((state) => ({ rightPanelPinned: !state.rightPanelPinned })),
    toggleTopPanelPin: () => set((state) => ({ topPanelPinned: !state.topPanelPinned })),
    
    setLeftPanelPin: (pinned) => set({ leftPanelPinned: pinned }),
    setRightPanelPin: (pinned) => set({ rightPanelPinned: pinned }),
    setTopPanelPin: (pinned) => set({ topPanelPinned: pinned }),
}));
