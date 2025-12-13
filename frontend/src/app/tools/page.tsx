"use client"

import { useState } from "react"
import { ToolList, Tool } from "@/components/tools/tool-list"
import { ToolEditor } from "@/components/tools/tool-editor"
import { GUIToolEditor } from "@/components/tools/gui-tool-editor"
import { ToolCreationWizard } from "@/components/tools/tool-creation-wizard"
import { API_URL } from "@/lib/utils"

export default function ToolsPage() {
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [showWizard, setShowWizard] = useState(false)
    const [newToolType, setNewToolType] = useState<"mcp" | "gui">("mcp")

    const [refreshKey, setRefreshKey] = useState(0)

    const handleSelectTool = (tool: Tool) => {
        setSelectedTool(tool)
        setIsCreating(false)
    }

    const handleCreateTool = () => {
        // Show the wizard to choose tool type
        setShowWizard(true)
    }

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
                setRefreshKey(prev => prev + 1)
                setIsCreating(false)
                setSelectedTool(null)
            } else {
                console.error("Failed to save tool")
            }
        } catch (error) {
            console.error("Error saving tool:", error)
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

        if (isGUITool) {
            return (
                <GUIToolEditor
                    tool={selectedTool}
                    onSave={handleSaveTool}
                    onDelete={handleDeleteTool}
                />
            )
        }

        return (
            <ToolEditor
                tool={selectedTool}
                onSave={handleSaveTool}
                onDelete={handleDeleteTool}
            />
        )
    }

    return (
        <div className="flex h-full bg-background">
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
        </div>
    )
}
