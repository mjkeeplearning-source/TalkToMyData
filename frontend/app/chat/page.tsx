"use client";

import { useState, useCallback } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import MessageInput from "@/components/MessageInput";
import { useChat } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    conversations,
    activeId,
    activeConversation,
    newConversation,
    selectConversation,
    deleteConversation,
    saveConversation,
  } = useConversations();

  const { messages, isLoading, toolStatus, sendMessage, retry } = useChat({
    conversationId: activeId,
    initialMessages: activeConversation?.messages ?? [],
    initialHistory: activeConversation?.history ?? [],
    onSave: saveConversation,
  });

  const handleSend = useCallback(
    (text: string) => {
      const convId = activeId ?? newConversation();
      sendMessage(text, convId);
    },
    [activeId, newConversation, sendMessage]
  );

  const handlePrompt = useCallback(
    (text: string) => {
      const convId = activeId ?? newConversation();
      sendMessage(text, convId);
    },
    [activeId, newConversation, sendMessage]
  );

  const handleRetry = useCallback(() => {
    if (!activeId) return;
    retry(activeId);
  }, [activeId, retry]);

  const handleNew = useCallback(() => {
    newConversation();
    setSidebarOpen(false);
  }, [newConversation]);

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--surface-alt)" }}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onNew={handleNew}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content */}
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{ background: "var(--surface)" }}
      >
        <Header onMenuToggle={() => setSidebarOpen((o) => !o)} />

        <ChatWindow
          messages={messages}
          toolStatus={toolStatus}
          onRetry={handleRetry}
          onPrompt={handlePrompt}
        />

        <MessageInput onSend={handleSend} disabled={isLoading} />
      </div>
    </div>
  );
}
