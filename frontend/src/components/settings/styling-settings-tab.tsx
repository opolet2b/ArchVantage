"use client"

import * as React from "react"
import { Check, Monitor, Smartphone, LayoutTemplate, Box } from "lucide-react"
import { useStyle, VisualStyle } from "@/lib/style-provider"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function StylingSettingsTab() {
    const { style, setStyle } = useStyle()

    const themes: { id: VisualStyle; name: string; description: string; icon: any }[] = [
        {
            id: "default",
            name: "Default",
            description: "Clean, balanced look. Standard radius and consistent colors.",
            icon: Monitor,
        },
        {
            id: "glass",
            name: "Apple Glassmorphism",
            description: "Translucent layers, blurs, and soft shadows. Inspired by macOS.",
            icon: Smartphone,
        },
        {
            id: "material",
            name: "Google Material You",
            description: "Expressive pill shapes, high contrast, and pastel tints.",
            icon: LayoutTemplate,
        },
        {
            id: "fluent",
            name: "Microsoft Fluent",
            description: "Mica effects, crisp 8px radius, and depth elevation.",
            icon: Box,
        },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Appearance</h3>
                <p className="text-sm text-muted-foreground">
                    Customize the look and feel of the application.
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {themes.map((theme) => (
                    <div
                        key={theme.id}
                        className={cn(
                            "cursor-pointer relative flex items-start space-x-4 rounded-xl border p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800",
                            style === theme.id ? "border-primary bg-slate-50 dark:bg-slate-900 ring-1 ring-primary" : "border-slate-200 dark:border-slate-800"
                        )}
                        onClick={() => setStyle(theme.id)}
                    >
                        <div
                            className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800",
                                style === theme.id && "bg-primary text-primary-foreground"
                            )}
                        >
                            <theme.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium leading-none">
                                {theme.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {theme.description}
                            </p>
                        </div>
                        {style === theme.id && (
                            <div className="absolute top-4 right-4 text-primary">
                                <Check className="h-4 w-4" />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Preview Section - Optional, helps visualize the change immediately */}
            <Card className="mt-8 border-dashed">
                <CardHeader>
                    <CardTitle>Preview</CardTitle>
                    <CardDescription>This is how your components look with the <strong>{themes.find(t => t.id === style)?.name}</strong> style.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-4">
                        <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
                            Primary Button
                        </button>
                        <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                            Secondary Button
                        </button>
                        <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                            Ghost
                        </button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
