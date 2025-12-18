"use client";

/**
 * Theme Designer Component
 *
 * GUI panel for controlling YAML frontmatter styles.
 * Part of the Architecture-Aware Template Editor.
 */
import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight } from "lucide-react";

// Standard web-safe fonts
const FONT_OPTIONS = [
    "Arial",
    "Helvetica",
    "Times New Roman",
    "Georgia",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
    "Courier New",
    "Lucida Console",
    "Palatino Linotype",
];

// Page size options
const PAGE_SIZES = ["A4", "Letter", "Legal", "A5"];

// Theme settings interface
export interface ThemeSettings {
    // Page settings
    page_size?: string;
    page_margin?: string;
    // H1 styles
    h1_font?: string;
    h1_color?: string;
    h1_size?: string;
    h1_bold?: boolean;
    // H2 styles
    h2_font?: string;
    h2_color?: string;
    h2_size?: string;
    h2_bold?: boolean;
    // H3 styles
    h3_font?: string;
    h3_color?: string;
    h3_size?: string;
    // Body styles
    body_font?: string;
    body_size?: string;
    body_color?: string;
    // Quote styles
    quote_bg_color?: string;
    quote_border?: string;
    quote_color?: string;
    // Code styles
    code_bg_color?: string;
    code_color?: string;
}

interface ThemeDesignerProps {
    settings: ThemeSettings;
    onChange: (settings: ThemeSettings) => void;
}

// Collapsible section component
function StyleSection({
    title,
    children,
    defaultOpen = false,
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 px-3 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
                {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                ) : (
                    <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-medium text-sm">{title}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 py-3 space-y-3 border-l-2 border-slate-200 dark:border-slate-700 ml-2">
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
}

// Color picker input
function ColorInput({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <Label className="text-xs min-w-[50px]">{label}</Label>
            <input
                type="color"
                value={value || "#000000"}
                onChange={(e) => onChange(e.target.value)}
                className="w-8 h-8 border rounded cursor-pointer"
            />
            <Input
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder="#000000"
                className="flex-1 h-8 text-xs"
            />
        </div>
    );
}

export function ThemeDesigner({ settings, onChange }: ThemeDesignerProps) {
    // Update a single setting
    const updateSetting = useCallback(
        (key: keyof ThemeSettings, value: string | boolean) => {
            onChange({ ...settings, [key]: value });
        },
        [settings, onChange]
    );

    return (
        <div className="h-full overflow-y-auto space-y-2 p-3">
            <h3 className="font-semibold text-sm mb-3">Theme Designer</h3>

            {/* Page Settings */}
            <StyleSection title="Page Settings" defaultOpen={true}>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label className="text-xs">Size</Label>
                        <Select
                            value={settings.page_size || "A4"}
                            onValueChange={(v) => updateSetting("page_size", v)}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PAGE_SIZES.map((size) => (
                                    <SelectItem key={size} value={size}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-xs">Margin</Label>
                        <Input
                            value={settings.page_margin || "2cm"}
                            onChange={(e) => updateSetting("page_margin", e.target.value)}
                            placeholder="2cm"
                            className="h-8 text-xs"
                        />
                    </div>
                </div>
            </StyleSection>

            {/* Header 1 */}
            <StyleSection title="Header 1 (H1)" defaultOpen={true}>
                <div>
                    <Label className="text-xs">Font</Label>
                    <Select
                        value={settings.h1_font || "Arial"}
                        onValueChange={(v) => updateSetting("h1_font", v)}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FONT_OPTIONS.map((font) => (
                                <SelectItem key={font} value={font}>
                                    {font}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label className="text-xs">Size</Label>
                        <Input
                            value={settings.h1_size || "24px"}
                            onChange={(e) => updateSetting("h1_size", e.target.value)}
                            placeholder="24px"
                            className="h-8 text-xs"
                        />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                        <Switch
                            checked={settings.h1_bold !== false}
                            onCheckedChange={(v) => updateSetting("h1_bold", v)}
                        />
                        <Label className="text-xs">Bold</Label>
                    </div>
                </div>
                <ColorInput
                    label="Color"
                    value={settings.h1_color || "#2c3e50"}
                    onChange={(v) => updateSetting("h1_color", v)}
                />
            </StyleSection>

            {/* Header 2 */}
            <StyleSection title="Header 2 (H2)">
                <div>
                    <Label className="text-xs">Font</Label>
                    <Select
                        value={settings.h2_font || "Arial"}
                        onValueChange={(v) => updateSetting("h2_font", v)}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FONT_OPTIONS.map((font) => (
                                <SelectItem key={font} value={font}>
                                    {font}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label className="text-xs">Size</Label>
                        <Input
                            value={settings.h2_size || "20px"}
                            onChange={(e) => updateSetting("h2_size", e.target.value)}
                            placeholder="20px"
                            className="h-8 text-xs"
                        />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                        <Switch
                            checked={settings.h2_bold !== false}
                            onCheckedChange={(v) => updateSetting("h2_bold", v)}
                        />
                        <Label className="text-xs">Bold</Label>
                    </div>
                </div>
                <ColorInput
                    label="Color"
                    value={settings.h2_color || "#34495e"}
                    onChange={(v) => updateSetting("h2_color", v)}
                />
            </StyleSection>

            {/* Header 3 */}
            <StyleSection title="Header 3 (H3)">
                <div>
                    <Label className="text-xs">Font</Label>
                    <Select
                        value={settings.h3_font || "Arial"}
                        onValueChange={(v) => updateSetting("h3_font", v)}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FONT_OPTIONS.map((font) => (
                                <SelectItem key={font} value={font}>
                                    {font}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label className="text-xs">Size</Label>
                    <Input
                        value={settings.h3_size || "16px"}
                        onChange={(e) => updateSetting("h3_size", e.target.value)}
                        placeholder="16px"
                        className="h-8 text-xs"
                    />
                </div>
                <ColorInput
                    label="Color"
                    value={settings.h3_color || "#7f8c8d"}
                    onChange={(v) => updateSetting("h3_color", v)}
                />
            </StyleSection>

            {/* Body Text */}
            <StyleSection title="Body Text">
                <div>
                    <Label className="text-xs">Font</Label>
                    <Select
                        value={settings.body_font || "Georgia"}
                        onValueChange={(v) => updateSetting("body_font", v)}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FONT_OPTIONS.map((font) => (
                                <SelectItem key={font} value={font}>
                                    {font}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label className="text-xs">Size</Label>
                    <Input
                        value={settings.body_size || "14px"}
                        onChange={(e) => updateSetting("body_size", e.target.value)}
                        placeholder="14px"
                        className="h-8 text-xs"
                    />
                </div>
                <ColorInput
                    label="Color"
                    value={settings.body_color || "#333333"}
                    onChange={(v) => updateSetting("body_color", v)}
                />
            </StyleSection>

            {/* Blockquotes */}
            <StyleSection title="Notes (Blockquote)">
                <ColorInput
                    label="Background"
                    value={settings.quote_bg_color || "#f9f9f9"}
                    onChange={(v) => updateSetting("quote_bg_color", v)}
                />
                <ColorInput
                    label="Text"
                    value={settings.quote_color || "#555555"}
                    onChange={(v) => updateSetting("quote_color", v)}
                />
                <div>
                    <Label className="text-xs">Border</Label>
                    <Input
                        value={settings.quote_border || "4px solid #ccc"}
                        onChange={(e) => updateSetting("quote_border", e.target.value)}
                        placeholder="4px solid #ccc"
                        className="h-8 text-xs"
                    />
                </div>
            </StyleSection>

            {/* Code */}
            <StyleSection title="Code Blocks">
                <ColorInput
                    label="Background"
                    value={settings.code_bg_color || "#f4f4f4"}
                    onChange={(v) => updateSetting("code_bg_color", v)}
                />
                <ColorInput
                    label="Text"
                    value={settings.code_color || "#c7254e"}
                    onChange={(v) => updateSetting("code_color", v)}
                />
            </StyleSection>
        </div>
    );
}

// Helper to parse YAML string to ThemeSettings
export function parseYamlToSettings(yaml: string): ThemeSettings {
    const settings: ThemeSettings = {};

    const lines = yaml.split("\n");
    for (const line of lines) {
        const match = line.match(/^(\w+):\s*['"]?([^'"]+)['"]?$/);
        if (match) {
            const key = match[1] as keyof ThemeSettings;
            const value = match[2].trim();
            if (key === "h1_bold" || key === "h2_bold") {
                (settings as any)[key] = value === "true" || value === "bold";
            } else {
                (settings as any)[key] = value;
            }
        }
    }

    return settings;
}

// Helper to convert ThemeSettings to YAML string
export function settingsToYaml(settings: ThemeSettings): string {
    const lines: string[] = [];

    const orderedKeys: (keyof ThemeSettings)[] = [
        "page_size",
        "page_margin",
        "h1_font",
        "h1_color",
        "h1_size",
        "h1_bold",
        "h2_font",
        "h2_color",
        "h2_size",
        "h2_bold",
        "h3_font",
        "h3_color",
        "h3_size",
        "body_font",
        "body_size",
        "body_color",
        "quote_bg_color",
        "quote_border",
        "quote_color",
        "code_bg_color",
        "code_color",
    ];

    for (const key of orderedKeys) {
        const value = settings[key];
        if (value !== undefined && value !== "") {
            if (typeof value === "boolean") {
                lines.push(`${key}: ${value}`);
            } else {
                // Quote strings that contain spaces or special chars
                const needsQuotes = /[\s:#]/.test(String(value));
                lines.push(`${key}: ${needsQuotes ? `"${value}"` : value}`);
            }
        }
    }

    return lines.join("\n");
}
