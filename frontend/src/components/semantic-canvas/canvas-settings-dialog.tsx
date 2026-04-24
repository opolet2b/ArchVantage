"use client";

import * as React from "react";
import { Settings, FolderOpen, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCanvasStore } from "./canvas-store";
import { toast } from "@/components/ui/use-toast";

export function CanvasSettingsDialog() {
    const [open, setOpen] = React.useState(false);
    const canvasSettings = useCanvasStore((s) => s.canvasSettings);
    const updateCanvasSettings = useCanvasStore((s) => s.updateCanvasSettings);
    const sttProfiles = useCanvasStore((s) => s.sttProfiles);
    const selectedSttModel = useCanvasStore((s) => s.selectedSttModel);
    const setSelectedSttModel = useCanvasStore((s) => s.setSelectedSttModel);

    // Local state for form
    const [defaultSourcePath, setDefaultSourcePath] = React.useState("");

    // Load initial values when dialog opens
    React.useEffect(() => {
        if (open) {
            setDefaultSourcePath(canvasSettings?.default_source_path || "");
        }
    }, [open, canvasSettings]);

    const handleSave = async () => {
        try {
            await updateCanvasSettings({
                ...canvasSettings,
                default_source_path: defaultSourcePath
            });
            toast({ title: "Settings Saved", description: "Default source path updated." });
            setOpen(false);
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Canvas Settings">
                    <Settings className="h-4 w-4 text-slate-500" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Canvas Settings</DialogTitle>
                    <DialogDescription>
                        Configure global settings for this canvas.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="default-path" className="text-right">
                            Default Source Path
                        </Label>
                        <div className="col-span-3 flex items-center gap-2">
                            <Input
                                id="default-path"
                                value={defaultSourcePath}
                                onChange={(e) => setDefaultSourcePath(e.target.value)}
                                placeholder="C:\Users\Name\Documents\Project"
                                className="font-mono text-xs"
                            />
                        </div>
                        <div className="col-start-2 col-span-3 text-[10px] text-muted-foreground">
                            If a file's source path is missing, the system will look for it here by filename.
                        </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="stt-engine" className="text-right">
                            Dictation Engine
                        </Label>
                        <div className="col-span-3">
                            <Select
                                value={selectedSttModel || ""}
                                onValueChange={(value) => setSelectedSttModel(value)}
                            >
                                <SelectTrigger id="stt-engine" className="w-full h-8 text-sm">
                                    <SelectValue placeholder="Select dictation engine..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {sttProfiles.map((profile: any) => (
                                        <SelectItem key={profile.id || profile.name} value={profile.id?.toString() || profile.name}>
                                            <div className="flex items-center gap-2">
                                                <Mic className="h-3 w-3" />
                                                <span>{profile.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    ({profile.is_browser_native ? "Browser" : profile.provider_type})
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                    {sttProfiles.length === 0 && (
                                        <div className="p-2 text-xs text-muted-foreground text-center">
                                            No STT profiles found. Check settings.
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="col-start-2 col-span-3 text-[10px] text-muted-foreground">
                            Default speech-to-text engine used for node dictation.
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
