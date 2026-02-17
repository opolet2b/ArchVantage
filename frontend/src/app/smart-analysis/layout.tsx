"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Box, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
    href: string;
    icon: React.ElementType;
    label: string;
    isActive: boolean;
}

function SidebarItem({ href, icon: Icon, label, isActive }: SidebarItemProps) {
    return (
        <Link
            href={href}
            className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200",
                isActive
                    ? "bg-white/10 text-white shadow-lg ring-1 ring-white/20"
                    : "text-indigo-200 hover:bg-white/5 hover:text-white"
            )}
            title={label}
        >
            <Icon className="h-6 w-6" />
            <span className="sr-only">{label}</span>
        </Link>
    );
}

export default function SmartAnalysisLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    return (
        <div className="flex h-full w-full bg-background">
            {/* Icon Sidebar */}
            <aside className="border-r border-indigo-900/50 bg-[#1A237E] w-16 flex flex-col items-center py-4 gap-4 box-border shadow-xl z-20">
                <SidebarItem
                    href="/smart-analysis/library"
                    icon={FolderOpen}
                    label="Template Library"
                    isActive={pathname === "/smart-analysis/library" || pathname === "/smart-analysis"}
                />
                <SidebarItem
                    href="/smart-analysis/workbench"
                    icon={Box}
                    label="Workbench"
                    isActive={pathname.startsWith("/smart-analysis/workbench")}
                />
                <SidebarItem
                    href="/smart-analysis/admin"
                    icon={Settings}
                    label="Admin"
                    isActive={pathname.startsWith("/smart-analysis/admin")}
                />
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    );
}
