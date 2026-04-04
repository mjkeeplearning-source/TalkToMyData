import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversations } from "@/hooks/useConversations";

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.restoreAllMocks();
});

describe("useConversations", () => {
  it("starts with empty conversations and no active id", () => {
    const { result } = renderHook(() => useConversations());
    expect(result.current.conversations).toEqual([]);
    expect(result.current.activeId).toBeNull();
    expect(result.current.activeConversation).toBeNull();
  });

  it("creates a new conversation and sets it as active", () => {
    const { result } = renderHook(() => useConversations());
    let newId: string;
    act(() => {
      newId = result.current.newConversation();
    });
    expect(result.current.conversations.length).toBe(1);
    expect(result.current.activeId).toBe(newId!);
    expect(result.current.activeConversation?.title).toBe("New conversation");
  });

  it("selectConversation switches active id", () => {
    const { result } = renderHook(() => useConversations());
    let id1: string, id2: string;
    act(() => {
      id1 = result.current.newConversation();
      id2 = result.current.newConversation();
    });
    act(() => {
      result.current.selectConversation(id1!);
    });
    expect(result.current.activeId).toBe(id1!);
    void id2;
  });

  it("deleteConversation removes it from the list", () => {
    const { result } = renderHook(() => useConversations());
    let id: string;
    act(() => {
      id = result.current.newConversation();
    });
    act(() => {
      result.current.deleteConversation(id!);
    });
    expect(result.current.conversations.length).toBe(0);
  });

  it("saveConversation updates messages and title from first user message", () => {
    const { result } = renderHook(() => useConversations());
    let id: string;
    act(() => {
      id = result.current.newConversation();
    });
    const messages = [
      { id: "m1", role: "user" as const, content: "Hello world", timestamp: new Date() },
      { id: "m2", role: "assistant" as const, content: "Hi there", timestamp: new Date() },
    ];
    act(() => {
      result.current.saveConversation(id!, messages, []);
    });
    expect(result.current.conversations[0].title).toBe("Hello world");
    expect(result.current.conversations[0].messages.length).toBe(2);
  });

  it("persists conversations to localStorage", () => {
    const { result } = renderHook(() => useConversations());
    act(() => {
      result.current.newConversation();
    });
    const stored = localStorageMock.getItem("aida_conversations");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.length).toBe(1);
  });
});
