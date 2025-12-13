import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ChatBot Agent Orchestrator",
  description: "Advanced AI Chat & Agent Orchestration",
};

import { ConversationProvider } from "@/lib/conversation-context"
import { AuthProvider } from "@/lib/auth-context"
import { AuthGuard } from "@/components/auth-guard"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ConversationProvider>
          <AuthProvider>
            <AuthGuard>
              <div className="flex h-screen overflow-hidden bg-background">
                <AppSidebar />
                <main className="flex-1 overflow-y-auto">
                  {children}
                </main>
              </div>
            </AuthGuard>
          </AuthProvider>
        </ConversationProvider>
      </body>
    </html>
  );
}
