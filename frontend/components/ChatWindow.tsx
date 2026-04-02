"use client";

import { useEffect, useRef } from "react";
import { type ChatMessage } from "@/hooks/useChat";
import MessageBubble from "./MessageBubble";
import ToolCallIndicator from "./ToolCallIndicator";

interface Props {
  messages: ChatMessage[];
  toolStatus: string | null;
  onRetry: () => void;
}

export default function ChatWindow({ messages, toolStatus, onRetry }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolStatus]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Ask anything about your Tableau data.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          message={msg}
          onRetry={
            msg.role === "error" && i === messages.length - 1
              ? onRetry
              : undefined
          }
        />
      ))}
      {toolStatus && <ToolCallIndicator status={toolStatus} />}
      <div ref={bottomRef} />
    </div>
  );
}
