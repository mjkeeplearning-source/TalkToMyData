"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { postChat } from "@/lib/api";
import { type ChatMessage, type ApiMessage } from "@/lib/types";

function makeId(): string {
  return crypto.randomUUID();
}

interface UseChatOptions {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  initialHistory: ApiMessage[];
  onSave: (id: string, messages: ChatMessage[], history: ApiMessage[]) => void;
}

export function useChat({
  conversationId,
  initialMessages,
  initialHistory,
  onSave,
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  const historyRef = useRef<ApiMessage[]>(initialHistory);
  const lastUserMessageRef = useRef<string>("");
  const convIdRef = useRef<string | null>(conversationId);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Reset local state when conversation switches
  useEffect(() => {
    if (convIdRef.current === conversationId) return;
    convIdRef.current = conversationId;
    setMessages(initialMessages);
    historyRef.current = initialHistory;
    lastUserMessageRef.current = "";
    setIsLoading(false);
    setToolStatus(null);
  }, [conversationId, initialMessages, initialHistory]);

  const execute = useCallback(
    async (text: string, convId: string) => {
      const assistantId = makeId();
      const now = new Date();

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: now },
      ]);
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
              if (line.startsWith("data: ")) eventData = line.slice(6);
            }

            if (eventType === "token") {
              assistantContent += eventData.replace(/\\n/g, "\n");
              setMessages((prev) => {
                const updated = [...prev];
                const idx = updated.findIndex((m) => m.id === assistantId);
                if (idx !== -1) {
                  updated[idx] = { ...updated[idx], content: assistantContent };
                }
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
                const idx = updated.findIndex((m) => m.id === assistantId);
                if (idx !== -1) {
                  updated[idx] = {
                    ...updated[idx],
                    role: "error",
                    content: errorMessage,
                  };
                }
                return updated;
              });
            } else if (eventType === "done") {
              setToolStatus(null);
              const newHistory: ApiMessage[] = [
                ...historyRef.current,
                { role: "user", content: text },
                { role: "assistant", content: assistantContent },
              ];
              historyRef.current = newHistory;
              setMessages((prev) => {
                onSaveRef.current(convId, prev, newHistory);
                return prev;
              });
            }
          }
        }
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === assistantId);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              role: "error",
              content: "Connection lost. Please try again.",
            };
          }
          return updated;
        });
      } finally {
        setIsLoading(false);
        setToolStatus(null);
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string, convId: string) => {
      if (!text.trim() || isLoading) return;
      lastUserMessageRef.current = text;
      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      await execute(text, convId);
    },
    [isLoading, execute]
  );

  const retry = useCallback(
    (convId: string) => {
      const text = lastUserMessageRef.current;
      if (!text || isLoading) return;
      setMessages((prev) => prev.slice(0, -2));
      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      execute(text, convId);
    },
    [isLoading, execute]
  );

  return { messages, isLoading, toolStatus, sendMessage, retry };
}
