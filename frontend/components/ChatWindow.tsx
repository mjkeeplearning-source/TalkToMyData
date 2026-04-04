"use client";

import { useEffect, useRef } from "react";
import { type ChatMessage } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import ToolCallIndicator from "./ToolCallIndicator";
import EmptyState from "./EmptyState";

interface Props {
  messages: ChatMessage[];
  toolStatus: string | null;
  onRetry: () => void;
  onPrompt: (text: string) => void;
}

export default function ChatWindow({ messages, toolStatus, onRetry, onPrompt }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolStatus]);

  if (messages.length === 0) {
    return <EmptyState onPrompt={onPrompt} />;
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-6"
      role="log"
      aria-label="Conversation"
      aria-live="polite"
    >
      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onRetry={
              msg.role === "error" && msg.id === messages[messages.length - 1]?.id
                ? onRetry
                : undefined
            }
          />
        ))}
        {toolStatus && <ToolCallIndicator status={toolStatus} />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
