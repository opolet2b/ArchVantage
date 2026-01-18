"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import { ToolPermission } from "./tool-list"
import { ToolPermissionsPanel } from "./tool-permissions-panel"

interface ToolMetadataSectionProps {
    name: string
    setName: (name: string) => void
    description: string
    setDescription: (desc: string) => void
    categories: { id: number, name: string }[]
    categoryId: number | null
    setCategoryId: (id: number | null) => void
    permissions: ToolPermission[]
    setPermissions: (perms: ToolPermission[]) => void
}

export function ToolMetadataSection({
    name,
    setName,
    description,
    setDescription,
    categories,
    categoryId,
    setCategoryId,
    permissions,
    setPermissions
}: ToolMetadataSectionProps) {
    const [showPermissions, setShowPermissions] = useState(false)

    return (
        <div id="tool-metadata-section" className="space-y-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900 shadow-sm">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">1 - Purpose</h3>
            </div>

            <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="tool-name">Name</Label>
                        <Input
                            id="tool-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Weather Assistant"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <select
                            id="category"
                            value={categoryId || ""}
                            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">Uncategorized</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">
                        Description <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What does this tool do?"
                    />
                </div>

                <div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPermissions(!showPermissions)}
                        className="flex items-center gap-2"
                    >
                        {showPermissions ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                        Manage Permissions
                        {permissions.length > 0 && (
                            <span className="ml-1 text-xs bg-primary/20 px-1.5 rounded-full">
                                {permissions.length}
                            </span>
                        )}
                    </Button>

                    {showPermissions && (
                        <div className="mt-4 p-4 border rounded-md bg-slate-50 dark:bg-slate-900/50">
                            <ToolPermissionsPanel
                                permissions={permissions}
                                onChange={setPermissions}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
