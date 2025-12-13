import { WorkflowEditor } from "@/components/workflow-editor"

export default function WorkflowPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
            <WorkflowEditor />
        </main>
    )
}
