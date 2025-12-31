"use client";

import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TaxonomyTab } from "@/components/admin/smart-analysis/taxonomy-tab";
import { SectionsTab } from "@/components/admin/smart-analysis/sections-tab";
import { PersonasTab } from "@/components/admin/smart-analysis/personas-tab";
import { FrameworksTab } from "@/components/admin/smart-analysis/frameworks-tab";
import { ThesaurusTab } from "@/components/admin/smart-analysis/thesaurus-tab";
import { GlobalCategoriesTab } from "@/components/admin/smart-analysis/global-categories-tab";
import { RenderingTypesTab } from "@/components/admin/smart-analysis/rendering-types-tab";
import { OutputFormatsTab } from "@/components/admin/smart-analysis/output-formats-tab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_URL } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Preset {
    name: string;
}

export default function SmartAnalysisAdminPage() {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<string>("");

    useEffect(() => {
        fetchPresets();
    }, []);

    const fetchPresets = async () => {
        try {
            const res = await fetch(`${API_URL}/config/presets`);
            if (res.ok) {
                const data = await res.json();
                // Match Workbench implementation: data.presets
                const loadedPresets = data.presets || [];
                if (Array.isArray(loadedPresets)) {
                    setPresets(loadedPresets);
                    if (loadedPresets.length > 0) {
                        setSelectedPreset(loadedPresets[0].name);
                    }
                } else {
                    console.error("Expected presets array but got:", data);
                    setPresets([]);
                }
            }
        } catch (error) {
            console.error("Failed to load presets", error);
            setPresets([]);
        }
    };

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-start">
                    <div className="space-y-2">
                        <h1 className="font-bold text-lg leading-none">Admin Panel</h1>
                        <p className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                            MANAGE THE BRAINS OF THE SMART ANALYSIS FRAMEWORK: TAXONOMIES, SPECIALIST PERSONAS, AND FRAMEWORKS.
                        </p>
                    </div>

                    {/* LLM Configuration Selector */}
                    <div className="flex items-center gap-3 bg-card border rounded-lg p-2 shadow-sm">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">AI Configuration</span>
                            <div className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${selectedPreset ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-amber-500'}`}></span>
                                <span className="text-xs font-medium text-foreground">
                                    {selectedPreset ? "Active" : "Select Config"}
                                </span>
                            </div>
                        </div>
                        <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                            <SelectTrigger className="w-[220px] h-9 text-xs font-medium border-muted-foreground/20 bg-muted/50 focus:ring-0 focus:ring-offset-0">
                                <SelectValue placeholder="Select LLM Configuration..." />
                            </SelectTrigger>
                            <SelectContent>
                                {presets.length === 0 ? (
                                    <div className="p-2 text-xs text-muted-foreground text-center">No presets found</div>
                                ) : (
                                    presets.map((preset) => (
                                        <SelectItem key={preset.name} value={preset.name} className="text-xs">
                                            {preset.name}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {!selectedPreset && (
                    <Alert variant="default" className="bg-amber-50 text-amber-800 border-amber-200">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No AI Configuration Selected</AlertTitle>
                        <AlertDescription>
                            Please select an LLM Configuration to use the AI Suggestion features in the tabs below.
                        </AlertDescription>
                    </Alert>
                )}
            </div>

            <Tabs defaultValue="taxonomy" className="space-y-4">
                <TabsList className="grid w-full grid-cols-6 h-auto bg-muted/30 p-1">
                    <TabsTrigger value="taxonomy" className="py-2 data-[state=active]:bg-[#4F46E5] data-[state=active]:text-white rounded-md transition-all">Taxonomy</TabsTrigger>
                    <TabsTrigger value="sections" className="py-2 data-[state=active]:bg-[#4F46E5] data-[state=active]:text-white rounded-md transition-all">Doc Sections</TabsTrigger>
                    <TabsTrigger value="personas" className="py-2 data-[state=active]:bg-[#4F46E5] data-[state=active]:text-white rounded-md transition-all">AI Personas</TabsTrigger>
                    <TabsTrigger value="frameworks" className="py-2 data-[state=active]:bg-[#4F46E5] data-[state=active]:text-white rounded-md transition-all">Frameworks</TabsTrigger>
                    <TabsTrigger value="thesaurus" className="py-2 data-[state=active]:bg-[#4F46E5] data-[state=active]:text-white rounded-md transition-all">Thesaurus</TabsTrigger>
                    <TabsTrigger value="rendering" className="py-2 data-[state=active]:bg-[#4F46E5] data-[state=active]:text-white rounded-md transition-all">Rendering Types</TabsTrigger>
                    <TabsTrigger value="formats" className="py-2 data-[state=active]:bg-[#4F46E5] data-[state=active]:text-white rounded-md transition-all">Output Formats</TabsTrigger>
                    <TabsTrigger value="categories" className="py-2 data-[state=active]:bg-[#4F46E5] data-[state=active]:text-white rounded-md transition-all">Global Categories</TabsTrigger>
                </TabsList>

                <TabsContent value="taxonomy">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">Analysis Taxonomy</CardTitle>
                            <CardDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">DEFINE THE AVAILABLE ANALYSIS TYPES AND THEIR CATEGORIZATION</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <TaxonomyTab selectedPreset={selectedPreset} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="sections">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">Document Sections</CardTitle>
                            <CardDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">MANAGE GENERIC AND DOMAIN-SPECIFIC DOCUMENT SECTIONS FOR EXTRACTION</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <SectionsTab />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="personas">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">Specialist AI Personas</CardTitle>
                            <CardDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">CONFIGURE THE SYSTEM PROMPTS AND TONES FOR DIFFERENT EXPERT ROLES</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <PersonasTab selectedPreset={selectedPreset} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="frameworks">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">Analysis Frameworks</CardTitle>
                            <CardDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">DEFINE STANDARD ANALYSIS FRAMEWORKS (E.G., SWOT, STRIDE) AND THEIR AI INSTRUCTIONS</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FrameworksTab selectedPreset={selectedPreset} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="thesaurus">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">Business Thesaurus</CardTitle>
                            <CardDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">MANAGE DOMAIN-SPECIFIC TERMINOLOGY MAPS</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ThesaurusTab selectedPreset={selectedPreset} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="categories">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">Global Categories</CardTitle>
                            <CardDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">MANAGE THE TOP-LEVEL CATEGORIES USED ACROSS THE SYSTEM</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <GlobalCategoriesTab />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="rendering">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">Rendering Types</CardTitle>
                            <CardDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">DEFINE VISUALIZATION AND RENDERING OPTIONS FOR EACH CATEGORY</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <RenderingTypesTab selectedPreset={selectedPreset} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="formats">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl font-bold">Output Formats</CardTitle>
                            <CardDescription className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">DEFINE SUPPORTED FILE FORMATS FOR OUTPUT GENERATION</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <OutputFormatsTab />
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>
        </div>
    );
}
