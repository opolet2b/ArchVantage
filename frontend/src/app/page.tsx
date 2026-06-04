"use client";

import * as React from "react";
import dynamic from "next/dynamic";

const ChatInterface = dynamic(
  () => import("@/components/chat-interface").then((mod) => mod.ChatInterface),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading Chat Interface...
      </div>
    ),
  }
);

const CanvasView = dynamic(
  () => import("@/components/semantic-canvas").then((mod) => mod.CanvasView),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading Canvas...
      </div>
    ),
  }
);

import { useViewMode } from "@/lib/view-mode-context";
import { useConversation } from "@/lib/conversation-context";

export default function Home() {
  const { viewMode, setViewMode } = useViewMode();
  const { setActiveConversationId } = useConversation();

  // Listen for open-conversation events from canvas
  React.useEffect(() => {
    const handleOpenConversation = (event: CustomEvent<{ conversationId: string }>) => {
      setActiveConversationId(event.detail.conversationId);
      setViewMode("chat");
    };

    window.addEventListener(
      "open-conversation",
      handleOpenConversation as EventListener
    );

    return () => {
      window.removeEventListener(
        "open-conversation",
        handleOpenConversation as EventListener
      );
    };
  }, [setActiveConversationId, setViewMode]);

  return (
    <main className="flex h-screen flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* View Content */}
      <div className="flex-1 w-full h-full">
        {viewMode === "chat" ? (
          <div className="flex items-center justify-center h-full">
            <ChatInterface />
          </div>
        ) : (
          <div className="w-full h-full">
            <CanvasView />
          </div>
        )}
      </div>
    </main>
  );
}


