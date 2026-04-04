"use client";

import { useState, useCallback, useEffect } from "react";
import { type Conversation, type ChatMessage, type ApiMessage } from "@/lib/types";

const STORAGE_KEY = "aida_conversations";
const MAX_CONVERSATIONS = 50;

function generateId(): string {
  return crypto.randomUUID();
}

function serializeConversations(conversations: Conversation[]): string {
  return JSON.stringify(
    conversations.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messages: c.messages.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    }))
  );
}

function deserializeConversations(raw: string): Conversation[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
      messages: (c.messages ?? []).map((m: ChatMessage & { timestamp: string }) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })),
    }));
  } catch {
    return [];
  }
}

export interface UseConversationsReturn {
  conversations: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  newConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  saveConversation: (id: string, messages: ChatMessage[], history: ApiMessage[]) => void;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const loaded = deserializeConversations(raw);
      setConversations(loaded);
      if (loaded.length > 0) setActiveId(loaded[0].id);
    }
  }, []);

  function persist(updated: Conversation[]) {
    localStorage.setItem(STORAGE_KEY, serializeConversations(updated));
    setConversations(updated);
  }

  const newConversation = useCallback((): string => {
    const id = generateId();
    const now = new Date();
    const conv: Conversation = {
      id,
      title: "New conversation",
      messages: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => {
      const updated = [conv, ...prev].slice(0, MAX_CONVERSATIONS);
      localStorage.setItem(STORAGE_KEY, serializeConversations(updated));
      return updated;
    });
    setActiveId(id);
    return id;
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        localStorage.setItem(STORAGE_KEY, serializeConversations(updated));
        return updated;
      });
      setActiveId((prev) => {
        if (prev !== id) return prev;
        // Select next conversation or null
        const remaining = conversations.filter((c) => c.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      });
    },
    [conversations]
  );

  const saveConversation = useCallback(
    (id: string, messages: ChatMessage[], history: ApiMessage[]) => {
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== id) return c;
          const firstUserMsg = messages.find((m) => m.role === "user");
          return {
            ...c,
            title: firstUserMsg
              ? firstUserMsg.content.slice(0, 60) +
                (firstUserMsg.content.length > 60 ? "…" : "")
              : c.title,
            messages,
            history,
            updatedAt: new Date(),
          };
        });
        localStorage.setItem(STORAGE_KEY, serializeConversations(updated));
        return updated;
      });
    },
    []
  );

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null;

  return {
    conversations,
    activeId,
    activeConversation,
    newConversation,
    selectConversation,
    deleteConversation,
    saveConversation,
  };
}
