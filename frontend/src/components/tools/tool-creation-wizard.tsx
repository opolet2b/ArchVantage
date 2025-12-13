"use client"

/**
 * Tool Creation Wizard Modal
 * 
 * Allows users to choose between creating an MCP (backend) tool
 * or a GUI (form-based) tool.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Wrench, FormInput, ArrowRight } from "lucide-react"

interface ToolCreationWizardProps {
    open: boolean
    onClose: () => void
    onSelectMCP: () => void
    onSelectGUI: () => void
}

export function ToolCreationWizard({
    open,
    onClose,
    onSelectMCP,
    onSelectGUI
}: ToolCreationWizardProps) {
    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create New Tool</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <p className="text-sm text-muted-foreground">
                        Choose the type of tool you want to create:
                    </p>

                    {/* MCP Server Option */}
                    <button
                        onClick={onSelectMCP}
                        className="flex items-start gap-4 p-4 rounded-lg border-2 border-transparent hover:border-blue-500 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left group"
                    >
                        <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/40">
                            <Wrench className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold flex items-center gap-2">
                                Connect MCP Server
                                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Connect to an MCP (Model Context Protocol) server to provide
                                backend tools for agents. Ideal for API integrations,
                                calculations, and data processing.
                            </p>
                        </div>
                    </button>

                    {/* GUI Form Option */}
                    <button
                        onClick={onSelectGUI}
                        className="flex items-start gap-4 p-4 rounded-lg border-2 border-transparent hover:border-pink-500 bg-slate-50 dark:bg-slate-800/50 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-all text-left group"
                    >
                        <div className="p-3 rounded-lg bg-pink-100 dark:bg-pink-900/40">
                            <FormInput className="h-6 w-6 text-pink-600 dark:text-pink-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold flex items-center gap-2">
                                Create GUI Form
                                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Build a form that agents can use to collect structured
                                information from users. Perfect for gathering customer
                                details, preferences, or any input data.
                            </p>
                        </div>
                    </button>
                </div>

                <div className="flex justify-end">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
