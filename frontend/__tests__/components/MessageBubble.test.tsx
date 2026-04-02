import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MessageBubble from "@/components/MessageBubble";

describe("MessageBubble", () => {
  it("renders a user message", () => {
    render(<MessageBubble message={{ role: "user", content: "Hello" }} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders an assistant message with content", () => {
    render(
      <MessageBubble message={{ role: "assistant", content: "Hi there" }} />
    );
    expect(screen.getByText("Hi there")).toBeInTheDocument();
  });

  it("renders assistant typing dots when content is empty", () => {
    const { container } = render(
      <MessageBubble message={{ role: "assistant", content: "" }} />
    );
    // Three bounce spans rendered for typing indicator
    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots.length).toBe(3);
  });

  it("renders error bubble with message text", () => {
    render(
      <MessageBubble
        message={{ role: "error", content: "Something went wrong. Please try again." }}
      />
    );
    expect(
      screen.getByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
  });

  it("renders Try again button in error bubble when onRetry provided", () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={{ role: "error", content: "Error" }}
        onRetry={onRetry}
      />
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("calls onRetry when Try again is clicked", async () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={{ role: "error", content: "Error" }}
        onRetry={onRetry}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not render Try again button when onRetry is not provided", () => {
    render(<MessageBubble message={{ role: "error", content: "Error" }} />);
    expect(
      screen.queryByRole("button", { name: /try again/i })
    ).not.toBeInTheDocument();
  });
});
