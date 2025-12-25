"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { promptService, PromptDefinition } from "@/lib/prompt-service"
import { Loader2, RefreshCw, RotateCcw, Save } from "lucide-react"

export default function PromptsPage() {
    const [prompts, setPrompts] = useState<PromptDefinition[]>([])
    const [loading, setLoading] = useState(true)
    const [editingPrompt, setEditingPrompt] = useState<PromptDefinition | null>(null)
    const [overrideContent, setOverrideContent] = useState("")
    const [saving, setSaving] = useState(false)
    const { toast } = useToast()

    const fetchPrompts = async () => {
        setLoading(true)
        try {
            const data = await promptService.listPrompts()
            setPrompts(data)
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load prompts",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchPrompts()
    }, [])

    const handleEdit = (prompt: PromptDefinition) => {
        setEditingPrompt(prompt)
        // If active override exists, use it. Else use default (converted to template if needed)
        // Actually, better to start empty or with default?
        // If override exists, showing it is mandatory.
        // If no override, showing default allows user to copy/paste.
        setOverrideContent(prompt.active_override || prompt.default_content)
    }

    const handleSave = async () => {
        if (!editingPrompt) return
        setSaving(true)
        try {
            await promptService.createOverride(editingPrompt.key, {
                content: overrideContent
            })
            toast({ title: "Success", description: "Prompt override saved" })
            setEditingPrompt(null)
            fetchPrompts()
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to save override",
                variant: "destructive"
            })
        } finally {
            setSaving(false)
        }
    }

    const handleReset = async (key: string) => {
        if (!confirm("Are you sure you want to reset to factory default?")) return
        try {
            await promptService.deleteOverride(key)
            toast({ title: "Success", description: "Reset to default" })
            fetchPrompts()
        } catch (error) {
            toast({ title: "Error", description: "Failed to reset", variant: "destructive" })
        }
    }

    // Helper to insert variable at cursor position
    const insertVariable = (varName: string) => {
        const textarea = document.getElementById("prompt-editor") as HTMLTextAreaElement
        if (!textarea) return

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const text = textarea.value
        const newText = text.substring(0, start) + `{{${varName}}}` + text.substring(end)

        setOverrideContent(newText)

        // Restore focus (timeout needed for React render cycle)
        setTimeout(() => {
            textarea.focus()
            textarea.setSelectionRange(start + varName.length + 4, start + varName.length + 4)
        }, 0)
    }

    return (
        <div className="container py-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Prompt Management</h1>
                    <p className="text-muted-foreground">Manage system prompts and user overrides.</p>
                </div>
                <Button variant="outline" onClick={fetchPrompts} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>System Prompts</CardTitle>
                    <CardDescription>
                        Prompts defined in the codebase. You can override them here.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Group</TableHead>
                                <TableHead>Name (Key)</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Access</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {prompts.map((prompt) => (
                                <TableRow key={prompt.key}>
                                    <TableCell>{prompt.group}</TableCell>
                                    <TableCell>
                                        <div className="font-medium">{prompt.key}</div>
                                        <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                                            {prompt.description}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {prompt.is_overridden ? (
                                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                Overridden
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline">Default</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize">
                                            {prompt.access_level.replace("_", " ")}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        {prompt.is_overridden && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleReset(prompt.key)}
                                                title="Reset to Default"
                                            >
                                                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEdit(prompt)}
                                            disabled={prompt.access_level === "read_only"}
                                        >
                                            Edit
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!loading && prompts.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No prompts found in registry.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={!!editingPrompt} onOpenChange={(open) => !open && setEditingPrompt(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Edit Prompt: {editingPrompt?.key}</DialogTitle>
                        <DialogDescription>
                            {editingPrompt?.description}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-3 gap-6 flex-1 min-h-[400px] overflow-hidden">
                        {/* Left: Editor */}
                        <div className="col-span-2 flex flex-col gap-2">
                            <Label htmlFor="prompt-editor">Prompt Template (Jinja2)</Label>
                            <Textarea
                                id="prompt-editor"
                                className="flex-1 font-mono text-sm resize-none"
                                value={overrideContent}
                                onChange={(e) => setOverrideContent(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Use <code>{`{{ variable }}`}</code> syntax for dynamic values.
                            </p>
                        </div>

                        {/* Right: Variables Helper */}
                        <div className="col-span-1 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md border flex flex-col gap-3 overflow-y-auto">
                            <div className="text-sm font-medium">Available Variables</div>
                            <div className="flex flex-col gap-2">
                                {editingPrompt && Object.entries(editingPrompt.variables_schema).map(([name, desc]) => (
                                    <div
                                        key={name}
                                        className="p-2 bg-white dark:bg-slate-800 border rounded cursor-pointer hover:border-primary transition-colors group"
                                        onClick={() => insertVariable(name)}
                                    >
                                        <div className="font-mono text-xs font-bold text-primary flex justify-between items-center">
                                            {name}
                                            <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1 leading-tight">
                                            {desc}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingPrompt(null)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Override
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function Plus({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    )
}
