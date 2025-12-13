"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Pencil, Trash2, FolderOpen } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { API_URL } from "@/lib/utils"

// Interface for tool categories
interface Category {
    id: number
    name: string
    description: string | null
}

/**
 * Categories Tab Component
 * 
 * Admin-only component for managing tool categories.
 * Provides CRUD operations for categories used to organize tools.
 */
export function CategoriesTab() {
    const [categories, setCategories] = useState<Category[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)

    // New category form state
    const [newCategory, setNewCategory] = useState({
        name: "",
        description: ""
    })

    // Edit category form state
    const [editCategory, setEditCategory] = useState({
        name: "",
        description: ""
    })

    useEffect(() => {
        fetchCategories()
    }, [])

    // Fetch all categories from the API
    const fetchCategories = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/categories`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setCategories(data)
            }
        } catch (error) {
            console.error("Failed to fetch categories", error)
        } finally {
            setIsLoading(false)
        }
    }

    // Create a new category
    const handleCreateCategory = async () => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/categories`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(newCategory)
            })

            if (res.ok) {
                setIsCreateDialogOpen(false)
                fetchCategories()
                setNewCategory({ name: "", description: "" })
            } else {
                const data = await res.json()
                alert(data.detail || "Failed to create category")
            }
        } catch (error) {
            console.error("Error creating category", error)
        }
    }

    // Update an existing category
    const handleUpdateCategory = async () => {
        if (!selectedCategory) return

        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/categories/${selectedCategory.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(editCategory)
            })

            if (res.ok) {
                setIsEditDialogOpen(false)
                fetchCategories()
                setSelectedCategory(null)
            } else {
                const data = await res.json()
                alert(data.detail || "Failed to update category")
            }
        } catch (error) {
            console.error("Error updating category", error)
        }
    }

    // Delete a category
    const handleDeleteCategory = async (categoryId: number) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/categories/${categoryId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            })

            if (res.ok) {
                fetchCategories()
            } else {
                const data = await res.json()
                alert(data.detail || "Failed to delete category")
            }
        } catch (error) {
            console.error("Error deleting category", error)
        }
    }

    // Open the edit dialog with category data
    const openEditDialog = (category: Category) => {
        setSelectedCategory(category)
        setEditCategory({
            name: category.name,
            description: category.description || ""
        })
        setIsEditDialogOpen(true)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-medium">Tool Categories</h2>
                    <p className="text-sm text-muted-foreground">
                        Manage categories used to organize tools.
                    </p>
                </div>

                {/* Create Category Dialog */}
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>Create Category</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Category</DialogTitle>
                            <DialogDescription>
                                Add a new category to organize tools.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    value={newCategory.name}
                                    onChange={(e) => setNewCategory({
                                        ...newCategory,
                                        name: e.target.value
                                    })}
                                    placeholder="e.g. Finance, IT, Customer Support"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={newCategory.description}
                                    onChange={(e) => setNewCategory({
                                        ...newCategory,
                                        description: e.target.value
                                    })}
                                    placeholder="Describe what tools belong in this category..."
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreateCategory}>Create Category</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Categories Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8">
                                    Loading categories...
                                </TableCell>
                            </TableRow>
                        ) : categories.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    No categories found. Create one to organize your tools.
                                </TableCell>
                            </TableRow>
                        ) : (
                            categories.map((category) => (
                                <TableRow key={category.id}>
                                    <TableCell>
                                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                                    </TableCell>
                                    <TableCell className="font-medium">{category.name}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {category.description || "-"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex gap-2 justify-end">
                                            {/* Edit Button */}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openEditDialog(category)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>

                                            {/* Delete Button with Confirmation */}
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete Category?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This action cannot be undone. Tools in this category
                                                            will become uncategorized.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDeleteCategory(category.id)}
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        >
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Edit Category Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Category</DialogTitle>
                        <DialogDescription>
                            Update category details.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">Name</Label>
                            <Input
                                id="edit-name"
                                value={editCategory.name}
                                onChange={(e) => setEditCategory({
                                    ...editCategory,
                                    name: e.target.value
                                })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-description">Description</Label>
                            <Textarea
                                id="edit-description"
                                value={editCategory.description}
                                onChange={(e) => setEditCategory({
                                    ...editCategory,
                                    description: e.target.value
                                })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUpdateCategory}>Update Category</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
