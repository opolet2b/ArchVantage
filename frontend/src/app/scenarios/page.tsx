"use client";

import { ScenarioManagementPanel } from "@/components/semantic-canvas/scenario-management-panel";

export default function ScenariosPage() {
    return (
        <main className="flex min-h-screen flex-col justify-center bg-slate-50 dark:bg-slate-950 p-4">
            <ScenarioManagementPanel />
        </main>
    )
}
