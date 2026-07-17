"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, FormInput } from "lucide-react"
import { API_URL } from "@/lib/utils"

export interface FormToolConfig {
    tool_id: number;
    tool_name: string;
    gui_schema?: any;
}

interface FormToolConfigDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: (config: FormToolConfig) => void
}

export function FormToolConfigDialog({
    open,
    onOpenChange,
    onConfirm,
}: FormToolConfigDialogProps) {

    const [tools, setTools] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [selectedToolId, setSelectedToolId] = useState<string>("")

    useEffect(() => {
        if (open) {
            fetchTools()
            setSelectedToolId("")
        }
    }, [open])

    const fetchTools = async () => {
        setIsLoading(true)
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/tools`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                const guiTools = data.filter((t: any) => t.tool_type === "gui" || t.tool_type === "GUI")
                setTools(guiTools)
            }
        } catch (e) {
            console.error("Failed to fetch GUI tools:", e)
        } finally {
            setIsLoading(false)
        }
    }

    const handleConfirm = () => {
        const selected = tools.find(t => t.id.toString() === selectedToolId)
        if (selected) {
            onConfirm({
                tool_id: selected.id,
                tool_name: selected.name,
                gui_schema: selected.configuration
            })
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FormInput className="h-5 w-5" />
                        Select Form Tool
                    </DialogTitle>
                    <DialogDescription>
                        Choose a GUI Form tool to place on the canvas.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {isLoading ? (
                        <div className="flex justify-center p-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Available Forms</Label>
                                <Select value={selectedToolId} onValueChange={setSelectedToolId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a form..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {tools.map(tool => (
                                            <SelectItem key={tool.id} value={tool.id.toString()}>
                                                {tool.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={!selectedToolId || isLoading}>
                        Add to Canvas
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
