import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChat } from "@/hooks/useChat";

afterEach(() => {
  vi.restoreAllMocks();
});

const DEFAULT_OPTS = {
  conversationId: "conv-1",
  initialMessages: [] as ReturnType<typeof useChat>["messages"],
  initialHistory: [] as { role: "user" | "assistant"; content: string }[],
  onSave: vi.fn(),
};

function makeStream(events: { event: string; data: string }[]): ReadableStream {
  const text = events
    .map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`)
    .join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function makeRawStream(rawText: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(rawText));
      controller.close();
    },
  });
}

function stubFetch(events: { event: string; data: string }[]) {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    body: makeStream(events),
  } as Response);
}

describe("useChat", () => {
  it("starts with empty messages and not loading", () => {
    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.toolStatus).toBeNull();
  });

  it("adds user and assistant messages after sendMessage", async () => {
    stubFetch([{ event: "done", data: "{}" }]);
    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    await act(async () => {
      await result.current.sendMessage("Hello", "conv-1");
    });
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Hello");
    expect(result.current.messages[1].role).toBe("assistant");
  });

  it("messages include id and timestamp fields", async () => {
    stubFetch([{ event: "done", data: "{}" }]);
    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    await act(async () => {
      await result.current.sendMessage("Hello", "conv-1");
    });
    const userMsg = result.current.messages[0];
    expect(userMsg.id).toBeDefined();
    expect(userMsg.timestamp).toBeInstanceOf(Date);
  });

  it("accumulates token events into assistant message content", async () => {
    stubFetch([
      { event: "token", data: "Hello" },
      { event: "token", data: " world" },
      { event: "done", data: "{}" },
    ]);
    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    await act(async () => {
      await result.current.sendMessage("Hi", "conv-1");
    });
    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("Hello world");
  });

  it("clears toolStatus and isLoading after stream with tool_call completes", async () => {
    stubFetch([
      { event: "tool_call", data: "list_tools" },
      { event: "token", data: "result" },
      { event: "done", data: "{}" },
    ]);
    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    await act(async () => {
      await result.current.sendMessage("Go", "conv-1");
    });
    expect(result.current.toolStatus).toBeNull();
    expect(result.current.isLoading).toBe(false);
    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("result");
  });

  it("sets error message on SSE error event", async () => {
    stubFetch([
      { event: "error", data: '{"message":"Rate limit reached. Please wait a moment and try again."}' },
    ]);
    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    await act(async () => {
      await result.current.sendMessage("Hi", "conv-1");
    });
    const errMsg = result.current.messages.find((m) => m.role === "error");
    expect(errMsg).toBeDefined();
    expect(errMsg?.content).toMatch(/rate limit/i);
  });

  it("sets error message on fetch failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    await act(async () => {
      await result.current.sendMessage("Hi", "conv-1");
    });
    const errMsg = result.current.messages.find((m) => m.role === "error");
    expect(errMsg).toBeDefined();
    expect(errMsg?.content).toMatch(/connection lost/i);
  });

  it("resets isLoading and toolStatus after any response", async () => {
    stubFetch([
      { event: "token", data: "answer" },
      { event: "done", data: "{}" },
    ]);
    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    await act(async () => {
      await result.current.sendMessage("Hello", "conv-1");
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.toolStatus).toBeNull();
  });

  it("reconstructs newlines from escaped \\n literals in SSE data", async () => {
    const raw =
      "event: token\ndata: ### Heading\\n| Col |\\n\\n| Row |\n\n" +
      "event: done\ndata: {}\n\n";
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: makeRawStream(raw),
    } as Response);
    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    await act(async () => {
      await result.current.sendMessage("Hi", "conv-1");
    });
    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("### Heading\n| Col |\n\n| Row |");
  });

  it("calls onSave with messages and history on done event", async () => {
    const onSave = vi.fn();
    stubFetch([
      { event: "token", data: "answer" },
      { event: "done", data: "{}" },
    ]);
    const { result } = renderHook(() => useChat({ ...DEFAULT_OPTS, onSave }));
    await act(async () => {
      await result.current.sendMessage("Hello", "conv-1");
    });
    expect(onSave).toHaveBeenCalledWith(
      "conv-1",
      expect.any(Array),
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Hello" }),
      ])
    );
  });

  it("ignores sendMessage when already loading", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue({
        ok: true,
        body: makeStream([{ event: "done", data: "{}" }]),
      } as Response);

    const { result } = renderHook(() => useChat(DEFAULT_OPTS));
    await act(async () => {
      await result.current.sendMessage("First", "conv-1");
    });
    expect(fetchSpy.mock.calls.length).toBe(1);
  });
});
