import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MessageBubble from "@/components/MessageBubble";
import { type ChatMessage } from "@/lib/types";

function msg(overrides: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content">): ChatMessage {
  return {
    id: "test-id",
    timestamp: new Date("2024-01-01T10:30:00"),
    ...overrides,
  };
}

describe("MessageBubble", () => {
  it("renders a user message", () => {
    render(<MessageBubble message={msg({ role: "user", content: "Hello" })} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders an assistant message with content", () => {
    render(<MessageBubble message={msg({ role: "assistant", content: "Hi there" })} />);
    expect(screen.getByText("Hi there")).toBeInTheDocument();
  });

  it("renders assistant typing dots when content is empty", () => {
    const { container } = render(
      <MessageBubble message={msg({ role: "assistant", content: "" })} />
    );
    expect(container.querySelector(".typing-dot")).toBeInTheDocument();
  });

  it("renders three typing dots for empty assistant message", () => {
    const { container } = render(
      <MessageBubble message={msg({ role: "assistant", content: "" })} />
    );
    expect(container.querySelectorAll(".typing-dot").length).toBe(3);
  });

  it("renders error bubble with message text", () => {
    render(
      <MessageBubble
        message={msg({ role: "error", content: "Something went wrong. Please try again." })}
      />
    );
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it("renders Try again button in error bubble when onRetry provided", () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={msg({ role: "error", content: "Error" })}
        onRetry={onRetry}
      />
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("calls onRetry when Try again is clicked", async () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={msg({ role: "error", content: "Error" })}
        onRetry={onRetry}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not render Try again button when onRetry is not provided", () => {
    render(<MessageBubble message={msg({ role: "error", content: "Error" })} />);
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("does not break table rows that contain a # cell (row-number column)", () => {
    // normalizeMarkdown must not insert \n inside a table row like | # | Name |
    const content = "| # | Name | Project |\n|---|-------|----------|\n| 1 | Superstore | Samples |";
    render(<MessageBubble message={msg({ role: "assistant", content })} />);
    expect(document.querySelector("table")).toBeInTheDocument();
  });

  it("renders a GFM table with proper single newlines between rows", () => {
    const content = "| Name | Project |\n|---|---|\n| Superstore | Samples |";
    render(<MessageBubble message={msg({ role: "assistant", content })} />);
    expect(document.querySelector("table")).toBeInTheDocument();
  });

  it("renders a GFM table even when blank line separates rows (SSE streaming artefact)", () => {
    // LLM sometimes emits \n\n between table rows; normalizeMarkdown must collapse these
    const content = "| Name | Project |\n|---|---|\n\n| Superstore | Samples |";
    render(<MessageBubble message={msg({ role: "assistant", content })} />);
    expect(document.querySelector("table")).toBeInTheDocument();
  });

  it("renders timestamp for user message", () => {
    render(<MessageBubble message={msg({ role: "user", content: "Hello" })} />);
    expect(screen.getByRole("time")).toBeInTheDocument();
  });

  it("renders timestamp for assistant message with content", () => {
    render(<MessageBubble message={msg({ role: "assistant", content: "Hi" })} />);
    expect(screen.getByRole("time")).toBeInTheDocument();
  });
});
