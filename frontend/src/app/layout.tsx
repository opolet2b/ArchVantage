import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { AppSidebar } from "@/components/app-sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ArchVantage",
  description: "Spatial computing platform for AI-driven insights and automation.",
};

import { ConversationProvider } from "@/lib/conversation-context"
import { AuthProvider } from "@/lib/auth-context"
import { ViewModeProvider } from "@/lib/view-mode-context"
import { AuthGuard } from "@/components/auth-guard"

import { Toaster } from "@/components/ui/toaster"

import { StyleProvider } from "@/lib/style-provider"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <StyleProvider>
          <ViewModeProvider>
            <ConversationProvider>
              <AuthProvider>
                <AuthGuard>
                  <div className="flex h-screen overflow-hidden bg-background transition-colors duration-300">
                    <AppSidebar />
                    <main className="flex-1 overflow-y-auto">
                      {children}
                    </main>
                  </div>
                </AuthGuard>
              </AuthProvider>
            </ConversationProvider>
          </ViewModeProvider>
        </StyleProvider>
        <Toaster />
      </body>
    </html>
  );
}

