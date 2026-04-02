"use client";

import Header from "@/components/Header";
import ChatWindow from "@/components/ChatWindow";
import MessageInput from "@/components/MessageInput";
import { useChat } from "@/hooks/useChat";

export default function ChatPage() {
  const { messages, isLoading, toolStatus, sendMessage, retry } = useChat();

  return (
    <div className="flex flex-col h-full">
      <Header />
      <ChatWindow messages={messages} toolStatus={toolStatus} onRetry={retry} />
      <MessageInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
