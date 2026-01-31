"use client";

import { ScenarioManager } from "@/components/semantic-canvas/scenario-manager";

export default function ScenariosPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
            <ScenarioManager />
        </main>
    )
}
