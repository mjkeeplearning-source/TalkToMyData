"use client";

import { useState, useCallback, useRef } from "react";
import { postChat, type Message } from "@/lib/api";

export interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const historyRef = useRef<Message[]>([]);
  const lastUserMessageRef = useRef<string>("");

  const execute = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    setIsLoading(true);
    setToolStatus(null);

    let assistantContent = "";

    try {
      const response = await postChat(text, historyRef.current);

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          let eventType = "";
          let eventData = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: "))
              eventData = eventData ? eventData + "\n" + line.slice(6) : line.slice(6);
          }

          if (eventType === "token") {
            assistantContent += eventData;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
              };
              return updated;
            });
          } else if (eventType === "tool_call") {
            setToolStatus("Analyzing...");
          } else if (eventType === "error") {
            let errorMessage = "Something went wrong. Please try again.";
            try {
              const parsed = JSON.parse(eventData);
              if (parsed.message) errorMessage = parsed.message;
            } catch { /* use default */ }
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "error", content: errorMessage };
              return updated;
            });
          } else if (eventType === "done") {
            setToolStatus(null);
            historyRef.current = [
              ...historyRef.current,
              { role: "user", content: text },
              { role: "assistant", content: assistantContent },
            ];
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "error",
          content: "Connection lost. Please try again.",
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      setToolStatus(null);
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      lastUserMessageRef.current = text;
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      await execute(text);
    },
    [isLoading, execute]
  );

  const retry = useCallback(() => {
    const text = lastUserMessageRef.current;
    if (!text || isLoading) return;
    // Remove the last error message and the preceding user message, then resend
    setMessages((prev) => prev.slice(0, -2));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    execute(text);
  }, [isLoading, execute]);

  return { messages, isLoading, toolStatus, sendMessage, retry };
}
