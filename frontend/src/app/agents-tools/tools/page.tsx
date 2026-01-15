"use client"

import { useState } from "react"
import { ToolList, Tool } from "@/components/tools/tool-list"
import { Button } from "@/components/ui/button"
import { ToolEditor } from "@/components/tools/tool-editor"
import { GUIToolEditor } from "@/components/tools/gui-tool-editor"
import { ToolCreationWizard } from "@/components/tools/tool-creation-wizard"
import { API_URL } from "@/lib/utils"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

export default function ToolsPage() {
    // Dirty state management
    const [isDirty, setIsDirty] = useState(false)
    const [pendingTool, setPendingTool] = useState<Tool | null>(null)
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

    // Original State
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [showWizard, setShowWizard] = useState(false)
    const [newToolType, setNewToolType] = useState<"mcp" | "gui">("mcp")
    const [refreshKey, setRefreshKey] = useState(0)

    // Handle selection with dirty check
    const handleSelectTool = (tool: Tool) => {
        if (isDirty) {
            setPendingTool(tool)
            setShowUnsavedDialog(true)
        } else {
            setSelectedTool(tool)
            setIsCreating(false)
        }
    }

    const handleCreateTool = () => {
        if (isDirty) {
            // Pending 'null' means we intend to create new, but we need to track that specifically
            // For simplicity, we just block create if dirty and ask user to save/discard first manually,
            // OR we treat it same as tool switch. 
            // Let's implement full flow if we have time, or just alert.
            // The request was specifically about clicking *another tool*.
            // Let's stick to tool selection first.
            if (!confirm("You have unsaved changes. Discard them?")) return
            setIsDirty(false)
        }
        setShowWizard(true)
    }

    // Handlers for unsaved dialog
    const handleDiscardChanges = () => {
        setIsDirty(false)
        setShowUnsavedDialog(false)
        if (pendingTool) {
            setSelectedTool(pendingTool)
            setPendingTool(null)
            setIsCreating(false)
        }
    }

    const handleSaveAndContinue = () => {
        // Trigger save in child?
        // This is tricky because the state is in the child.
        // We'd need a ref or event bus.
        // For MVP, simplest is to ask user to go back and save.
        // OR we just provide "Discard" and "Cancel" for now if "Save" is too complex without ref.
        // But requirements said "if yes, GUI tool is saved". 
        // We can expose a save handler via ref, or move save logic up. state is in child though.
        // Alternative: Use a context or event.
        // Let's use a simple event dispatch for now: window.dispatchEvent(new Event('trigger-save-tool'))?
        // No, that's messy.
        // Better: Pass a `saveRef` to editor? 
        // Actually, let's just use "Discard" and "Cancel" for now, updating the requirement slightly or
        // implement "Save" by clicking the button programmatically?
        // Let's try to locate the save button and click it? Hacky but works.
        // Or better: Just implement Discard/Cancel first.
        // Wait, user specifically asked "if yes, the GUI tool is saved".
        // I'll try to use a DOM trigger for the save button for now as it's least invasive.
        const saveButton = document.querySelector('button[aria-label="Save Form"] , button:has(span:contains("Save Form"))') as HTMLButtonElement
        // Our save button has text "Save Form" inside.
        // Let's use a custom event or ref.
        // Ref is cleaner. Use a ref for the editor.

        // Actually, since I can't easily change the Editor interface to expose a ref without more boilerplate...
        // I will implement "Discard" and "Cancel" primarily, and "Save" via a dispatched event that FormBuilder listens to?
        // No, let's just use the `confirm` approach which is synchronous and simpler for now, 
        // but the prompt asked for "popup". A custom dialog is better.

        // Let's implement Discard/Cancel. If user wants to save, they Cancel then Save.
        // But the prompt said: "request if he wants to save changes. if yes, save... if not, discard..."
        // I'll use a `triggerSave` state.
        setTriggerSave(true)
        setShowUnsavedDialog(false)
        // We need to wait for save to complete before switching.
        // This requires `handleSaveTool` to acknowledge completion.
    }

    // We'll use a simpler approach: 
    // Just a standard `confirm` for "Discard changes?". 
    // For "Save changes?", we really need the child state.
    // Let's try to stick to the plan: "Save, Discard, Cancel".
    // I'll add a `triggerSave` flow.

    const [triggerSave, setTriggerSave] = useState(false)

    // Modification to renderEditor to pass triggerSave
    // But TriggerSave needs to be reset after save.

    const handleSelectMCP = () => {
        setShowWizard(false)
        setSelectedTool(null)
        setNewToolType("mcp")
        setIsCreating(true)
    }

    const handleSelectGUI = () => {
        setShowWizard(false)
        setSelectedTool(null)
        setNewToolType("gui")
        setIsCreating(true)
    }

    const handleSaveTool = async (toolData: Partial<Tool>) => {
        try {
            // For new tools, use tool_type from toolData (set by editor) or fall back to newToolType
            const dataWithType = selectedTool
                ? toolData
                : { tool_type: newToolType, ...toolData }  // toolData.tool_type takes precedence

            const url = selectedTool
                ? `${API_URL}/tools/${selectedTool.id}`
                : `${API_URL}/tools`

            const method = selectedTool ? "PUT" : "POST"

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(dataWithType)
            })

            if (response.ok) {
                const savedTool = await response.json()
                setRefreshKey(prev => prev + 1)
                // If we were creating, switching to select mode
                if (isCreating) {
                    setIsCreating(false)
                    setSelectedTool(savedTool)
                }
                // Update dirty state
                setIsDirty(false)

                // If we had a pending tool switch waiting for save
                if (pendingTool && triggerSave) {
                    setSelectedTool(pendingTool)
                    setPendingTool(null)
                    setTriggerSave(false)
                }
            } else {
                console.error("Failed to save tool")
                setTriggerSave(false)
            }
        } catch (error) {
            console.error("Error saving tool:", error)
            setTriggerSave(false)
        }
    }

    const handleDeleteTool = async (toolId: number) => {
        try {
            const response = await fetch(`${API_URL}/tools/${toolId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                }
            })

            if (response.ok) {
                setRefreshKey(prev => prev + 1)
                setSelectedTool(null)
            } else {
                console.error("Failed to delete tool")
            }
        } catch (error) {
            console.error("Error deleting tool:", error)
        }
    }

    // Determine if we should show GUI editor
    const isGUITool = selectedTool?.tool_type === "gui" || (!selectedTool && newToolType === "gui")

    // Render the appropriate editor
    const renderEditor = () => {
        if (!selectedTool && !isCreating) {
            return (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    Select a tool to view details or create a new one
                </div>
            )
        }

        // UNIFIED EDITOR: Always use the new GUIToolEditor which now supports MCP+Pipeline
        return (
            <GUIToolEditor
                key={selectedTool?.id || "new"} // Force re-mount on tool switch
                tool={selectedTool}
                onSave={handleSaveTool}
                onDelete={handleDeleteTool}
                onDirtyChange={setIsDirty}
            />
        )
    }

    return (
        <div className="flex h-full bg-background relative">
            <ToolList
                onSelectTool={handleSelectTool}
                onCreateTool={handleCreateTool}
                refreshTrigger={refreshKey}
            />

            {renderEditor()}

            {/* Tool Creation Wizard Modal */}
            <ToolCreationWizard
                open={showWizard}
                onClose={() => setShowWizard(false)}
                onSelectMCP={handleSelectMCP}
                onSelectGUI={handleSelectGUI}
            />

            {/* Unsaved Changes Dialog */}
            <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unsaved Changes</DialogTitle>
                        <DialogDescription>
                            You have unsaved changes. Do you want to save them before switching?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowUnsavedDialog(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDiscardChanges}>Discard</Button>
                        <Button onClick={() => {
                            // This is the hard part - implementing "Save" from outside.
                            // For now, let's ask user to Cancel and Save manually, or we assume
                            // we can't trigger it easily without refactoring.
                            // But wait, the user specifically asked for it. 
                            // I will use a simple hack: Click the internal save button.
                            // It's brittle but works for now without heavy refactor.
                            const saveBtn = document.querySelector('button .lucide-save')?.closest('button') as HTMLButtonElement
                            if (saveBtn) {
                                setTriggerSave(true) // Mark that we are saving-to-switch
                                setShowUnsavedDialog(false)
                                saveBtn.click()
                            } else {
                                alert("Could not find save button. Please save manually.")
                                setShowUnsavedDialog(false)
                            }
                        }}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
