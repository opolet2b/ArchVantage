import { ChatInterface } from "@/components/chat-interface"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
      <ChatInterface />
    </main>
  )
}
