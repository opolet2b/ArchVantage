"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Wrench, Filter, FormInput } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { API_URL } from "@/lib/utils"

// Interface for tool permissions
export interface ToolPermission {
    id?: number
    tool_id?: number
    user_id?: number
    ad_group_id?: number
    permission_level: "READ" | "READ_WRITE"
}

// Interface for tool categories
export interface Category {
    id: number
    name: string
    description?: string
}

// Interface for tools
export interface Tool {
    id: number
    name: string
    description: string
    tool_type?: "mcp" | "gui"  // Tool type (MCP backend or GUI form)
    category_id: number
    is_public: boolean
    configuration: any
    system_prompt: string
    permissions?: ToolPermission[]
    category?: Category
}

interface ToolListProps {
    onSelectTool: (tool: Tool) => void
    onCreateTool: () => void
    refreshTrigger?: number
}

/**
 * Tool List Component
 * 
 * Displays a list of tools with search and category filtering capabilities.
 * Users can click on a tool to edit it or click the + button to create a new one.
 */
export function ToolList({ onSelectTool, onCreateTool, refreshTrigger = 0 }: ToolListProps) {
    const [tools, setTools] = useState<Tool[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all")

    useEffect(() => {
        // Fetch tools from API
        const fetchTools = async () => {
            try {
                // Build URL with category filter if selected
                let url = `${API_URL}/tools`
                if (selectedCategoryId && selectedCategoryId !== "all") {
                    url += `?category_id=${selectedCategoryId}`
                }

                const response = await fetch(url, {
                    headers: {
                        "Authorization": `Bearer ${localStorage.getItem("token")}`
                    }
                })
                if (response.ok) {
                    const data = await response.json()
                    setTools(data)
                }
            } catch (error) {
                console.error("Failed to fetch tools", error)
            }
        }
        fetchTools()
    }, [refreshTrigger, selectedCategoryId])

    useEffect(() => {
        // Fetch categories for the filter dropdown
        const fetchCategories = async () => {
            try {
                const response = await fetch(`${API_URL}/categories`, {
                    headers: {
                        "Authorization": `Bearer ${localStorage.getItem("token")}`
                    }
                })
                if (response.ok) {
                    const data = await response.json()
                    setCategories(data)
                }
            } catch (error) {
                console.error("Failed to fetch categories", error)
            }
        }
        fetchCategories()
    }, [])

    // Filter tools by search query (client-side filtering)
    const filteredTools = tools.filter(tool =>
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Get category name for a tool
    const getCategoryName = (tool: Tool): string | null => {
        if (tool.category) {
            return tool.category.name
        }
        if (tool.category_id) {
            const category = categories.find(c => c.id === tool.category_id)
            return category?.name || null
        }
        return null
    }

    return (
        <div className="flex flex-col h-full gap-4 p-4 border-r w-80 bg-slate-50/50 dark:bg-slate-900/50">
            {/* Search and Create */}
            <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search tools..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Button onClick={onCreateTool} size="icon" title="Create Tool">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select
                    value={selectedCategoryId}
                    onValueChange={setSelectedCategoryId}
                >
                    <SelectTrigger className="flex-1">
                        <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(category => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                                {category.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Tool List */}
            <div className="flex-1 overflow-y-auto space-y-2">
                {filteredTools.map(tool => (
                    <Card
                        key={tool.id}
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => onSelectTool(tool)}
                    >
                        <CardContent className="p-4 flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${tool.tool_type === "gui" ? "bg-pink-100 dark:bg-pink-900/30" : "bg-primary/10"}`}>
                                {tool.tool_type === "gui" ? (
                                    <FormInput className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                                ) : (
                                    <Wrench className="h-5 w-5 text-primary" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                    <h3 className="font-semibold truncate text-sm">{tool.name}</h3>
                                    <div className="flex gap-1">
                                        <Badge
                                            variant="outline"
                                            className={`text-[10px] px-1 h-5 ${tool.tool_type === "gui"
                                                    ? "border-pink-300 text-pink-600 dark:border-pink-700 dark:text-pink-400"
                                                    : "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
                                                }`}
                                        >
                                            {tool.tool_type === "gui" ? "GUI" : "MCP"}
                                        </Badge>
                                        {getCategoryName(tool) && (
                                            <Badge variant="outline" className="text-[10px] px-1 h-5">
                                                {getCategoryName(tool)}
                                            </Badge>
                                        )}
                                        {tool.is_public && (
                                            <Badge variant="secondary" className="text-[10px] px-1 h-5">
                                                Public
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                    {tool.description}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {filteredTools.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-8">
                        No tools found
                    </div>
                )}
            </div>
        </div>
    )
}
