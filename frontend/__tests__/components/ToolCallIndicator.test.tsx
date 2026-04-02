import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ToolCallIndicator from "@/components/ToolCallIndicator";

describe("ToolCallIndicator", () => {
  it("renders the status text", () => {
    render(<ToolCallIndicator status="Analyzing..." />);
    expect(screen.getByText("Analyzing...")).toBeInTheDocument();
  });

  it("renders a pulse dot", () => {
    const { container } = render(<ToolCallIndicator status="Analyzing..." />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });
});
