import React from 'react';
import { useCanvasStore, CanvasThing } from '../canvas-store';
import { cn } from '@/lib/utils';
import {
    Briefcase, // Business Service
    AppWindow, // Application Component
    Server, // Technology Node
    Target, // Goal
    Layers, // Plateau
    Box, // Application Function / General
    Circle, // Default
    User, // Business Actor
    Users, // Business Collaboration
    Play, // Business Process
    Zap, // Business Event
    FileText, // Business Object / Representation
    Database, // Data Object
    Cpu, // System Software
    Monitor, // Device
    Smartphone, // Device
    Globe, // Network
    Map, // Location
    Flag, // Principle
    Diamond, // Requirement
    GitMerge, // Junction
    ArrowRight, // Process/Flow
    Settings // Service
} from 'lucide-react';

interface ArchiMateElementViewerProps {
    thing: CanvasThing;
}

interface StyleConfig {
    bg: string;
    border: string;
    icon: any;
    text: string;
}

// Colors (Standard ArchiMate)
const COLORS = {
    BUSINESS: { bg: "bg-[#ffffb5]", border: "border-yellow-400", text: "text-yellow-900" },
    APPLICATION: { bg: "bg-[#b5ffff]", border: "border-cyan-400", text: "text-cyan-900" },
    TECHNOLOGY: { bg: "bg-[#c9e7b7]", border: "border-green-400", text: "text-green-900" }, // Also Physical
    MOTIVATION: { bg: "bg-[#e6e6fa]", border: "border-purple-400", text: "text-purple-900" },
    IMPLEMENTATION: { bg: "bg-[#ffe4e1]", border: "border-pink-400", text: "text-pink-900" },
    OTHER: { bg: "bg-slate-100", border: "border-slate-300", text: "text-slate-900" }
};

const ELEMENT_STYLES: Record<string, StyleConfig> = {
    // Business Layer
    "BusinessActor": { ...COLORS.BUSINESS, icon: User },
    "BusinessRole": { ...COLORS.BUSINESS, icon: User }, // Cylinder ish
    "BusinessCollaboration": { ...COLORS.BUSINESS, icon: Users },
    "BusinessInterface": { ...COLORS.BUSINESS, icon: Circle }, // Exposed interface
    "BusinessProcess": { ...COLORS.BUSINESS, icon: ArrowRight }, // Arrow flow
    "BusinessFunction": { ...COLORS.BUSINESS, icon: Play }, // Chevron
    "BusinessInteraction": { ...COLORS.BUSINESS, icon: GitMerge },
    "BusinessEvent": { ...COLORS.BUSINESS, icon: Zap }, // Rounded rect with something?
    "BusinessService": { ...COLORS.BUSINESS, icon: Briefcase }, // Rounded rect
    "BusinessObject": { ...COLORS.BUSINESS, icon: FileText },
    "Contract": { ...COLORS.BUSINESS, icon: FileText },
    "Representation": { ...COLORS.BUSINESS, icon: FileText },
    "Product": { ...COLORS.BUSINESS, icon: Box },

    // Application Layer
    "ApplicationComponent": { ...COLORS.APPLICATION, icon: AppWindow }, // Component box
    "ApplicationCollaboration": { ...COLORS.APPLICATION, icon: Users },
    "ApplicationInterface": { ...COLORS.APPLICATION, icon: Circle },
    "ApplicationFunction": { ...COLORS.APPLICATION, icon: Play },
    "ApplicationInteraction": { ...COLORS.APPLICATION, icon: GitMerge },
    "ApplicationProcess": { ...COLORS.APPLICATION, icon: ArrowRight },
    "ApplicationEvent": { ...COLORS.APPLICATION, icon: Zap },
    "ApplicationService": { ...COLORS.APPLICATION, icon: Settings }, // Gear? or rounded rect
    "DataObject": { ...COLORS.APPLICATION, icon: Database },

    // Technology & Physical Layer
    "Node": { ...COLORS.TECHNOLOGY, icon: Server }, // Box with 3d effect
    "Device": { ...COLORS.TECHNOLOGY, icon: Monitor }, // Screen
    "SystemSoftware": { ...COLORS.TECHNOLOGY, icon: Cpu },
    "TechnologyCollaboration": { ...COLORS.TECHNOLOGY, icon: Users },
    "TechnologyInterface": { ...COLORS.TECHNOLOGY, icon: Circle },
    "TechnologyFunction": { ...COLORS.TECHNOLOGY, icon: Play },
    "TechnologyProcess": { ...COLORS.TECHNOLOGY, icon: ArrowRight },
    "TechnologyInteraction": { ...COLORS.TECHNOLOGY, icon: GitMerge },
    "TechnologyEvent": { ...COLORS.TECHNOLOGY, icon: Zap },
    "TechnologyService": { ...COLORS.TECHNOLOGY, icon: Settings },
    "Artifact": { ...COLORS.TECHNOLOGY, icon: FileText },
    "CommunicationNetwork": { ...COLORS.TECHNOLOGY, icon: Globe },
    "Path": { ...COLORS.TECHNOLOGY, icon: ArrowRight },
    "Equipment": { ...COLORS.TECHNOLOGY, icon: Box },
    "Facility": { ...COLORS.TECHNOLOGY, icon: Box },
    "DistributionNetwork": { ...COLORS.TECHNOLOGY, icon: Globe },
    "Material": { ...COLORS.TECHNOLOGY, icon: Box },

    // Motivation & Strategy
    "Stakeholder": { ...COLORS.MOTIVATION, icon: User },
    "Driver": { ...COLORS.MOTIVATION, icon: Target },
    "Assessment": { ...COLORS.MOTIVATION, icon: FileText },
    "Goal": { ...COLORS.MOTIVATION, icon: Target },
    "Outcome": { ...COLORS.MOTIVATION, icon: Target },
    "Principle": { ...COLORS.MOTIVATION, icon: Flag },
    "Requirement": { ...COLORS.MOTIVATION, icon: Diamond }, // It's a parallelogram strictly
    "Constraint": { ...COLORS.MOTIVATION, icon: Diamond },
    "Meaning": { ...COLORS.MOTIVATION, icon: FileText },
    "Value": { ...COLORS.MOTIVATION, icon: Circle },
    "Resource": { ...COLORS.MOTIVATION, icon: Box },
    "Capability": { ...COLORS.MOTIVATION, icon: Box },
    "CourseOfAction": { ...COLORS.MOTIVATION, icon: ArrowRight },

    // Implementation & Migration
    "WorkPackage": { ...COLORS.IMPLEMENTATION, icon: Briefcase },
    "Deliverable": { ...COLORS.IMPLEMENTATION, icon: FileText },
    "ImplementationEvent": { ...COLORS.IMPLEMENTATION, icon: Zap },
    "Plateau": { ...COLORS.IMPLEMENTATION, icon: Layers },
    "Gap": { ...COLORS.IMPLEMENTATION, icon: Circle },

    // Other / Composite
    "Location": { ...COLORS.OTHER, icon: Map, bg: "bg-[#ffe4b5]", border: "border-orange-400", text: "text-orange-900" }, // Orangeish
    "Grouping": { ...COLORS.OTHER, icon: Box, bg: "bg-white", border: "border-slate-400 border-dashed", text: "text-slate-600" },
    "Junction": { ...COLORS.OTHER, icon: Circle, bg: "bg-black", border: "border-black", text: "text-white" },
};

const getLayerStyle = (type: string): StyleConfig => {
    // 1. Try Direct Lookup
    // Normalized check: remove "archimate:" prefix if present
    const cleanType = type.split(":").pop() || type;

    if (ELEMENT_STYLES[cleanType]) {
        return ELEMENT_STYLES[cleanType];
    }

    // 2. Fallback Heuristics
    const t = cleanType.toLowerCase();

    if (t.includes("business")) return { ...COLORS.BUSINESS, icon: Briefcase };
    if (t.includes("application") || t.includes("data")) return { ...COLORS.APPLICATION, icon: AppWindow };
    if (t.includes("technology") || t.includes("system") || t.includes("device")) return { ...COLORS.TECHNOLOGY, icon: Server };
    if (t.includes("motivation") || t.includes("strategy") || t.includes("requirement")) return { ...COLORS.MOTIVATION, icon: Target };
    if (t.includes("implementation") || t.includes("migration")) return { ...COLORS.IMPLEMENTATION, icon: Layers };

    return { ...COLORS.OTHER, icon: Circle };
};

export function ArchiMateElementViewer({ thing }: ArchiMateElementViewerProps) {
    // Determine style from thing.content.type
    const type = (thing.content.type as string) || "Unknown";
    const style = getLayerStyle(type);
    const Icon = style.icon;

    return (
        <div className={cn(
            "w-full h-full flex flex-col relative overflow-hidden rounded-sm border-2 shadow-sm transition-colors",
            style.bg,
            // style.darkBg, // ArchiMate usually fixed colors, but for dark mode maybe we just dim?
            style.border
        )}>
            {/* Header Icon Area */}
            <div className="absolute top-1 right-1 p-0.5 opacity-70">
                <Icon className={cn("w-4 h-4", style.text)} />
            </div>

            {/* Content Area */}
            <div className="flex-1 flex items-center justify-center p-2 text-center">
                <span className={cn("text-xs font-semibold leading-tight break-words", style.text)}>
                    {thing.title || "Unnamed Element"}
                </span>
            </div>

            {/* Optional Type Hints? */}
            {/* <div className="absolute bottom-1 left-1 text-[8px] opacity-50 uppercase">{type.split(":").pop()}</div> */}
        </div>
    );
}
