"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Plus, Wrench } from "lucide-react";
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

export default function AgentsToolsLayout({
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
                    href="/agents-tools/agents"
                    icon={Bot}
                    label="My Agents"
                    isActive={pathname === "/agents-tools/agents" || pathname === "/agents-tools"}
                />
                <SidebarItem
                    href="/agents-tools/agents/builder/new"
                    icon={Plus}
                    label="Agent Builder"
                    isActive={pathname.includes("/builder")}
                />
                <SidebarItem
                    href="/agents-tools/tools"
                    icon={Wrench}
                    label="Tools"
                    isActive={pathname.startsWith("/agents-tools/tools")}
                />
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden">
                {children}
            </main>
        </div>
    );
}
