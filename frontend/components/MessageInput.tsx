"use client";

import { useState, useRef } from "react";

const MAX_LENGTH = 2000;

interface Props {
  onSend: (message: string) => void;
  disabled: boolean;
}

export default function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    if (next.length > MAX_LENGTH) return;
    setValue(next);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  }

  const remaining = MAX_LENGTH - value.length;
  const canSend = !!value.trim() && !disabled;

  return (
    <div
      className="shrink-0 px-4 py-4"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div className="max-w-3xl mx-auto">
        <div
          className="flex items-end gap-2 rounded-2xl px-4 py-2 transition-shadow"
          style={{
            background: "var(--surface-alt)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Ask anything about your data…"
            aria-label="Message input"
            className="flex-1 resize-none bg-transparent text-sm leading-relaxed py-1.5 focus:outline-none disabled:opacity-50"
            style={{
              color: "var(--text-primary)",
              maxHeight: "160px",
              overflowY: "auto",
            }}
          />

          <div className="flex items-center gap-2 pb-1 shrink-0">
            {remaining <= 200 && (
              <span
                className="text-xs tabular-nums"
                style={{ color: remaining < 50 ? "var(--error)" : "var(--text-muted)" }}
                aria-live="polite"
              >
                {remaining}
              </span>
            )}
            <button
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: canSend ? "var(--primary)" : "var(--border)",
                color: canSend ? "#fff" : "var(--text-muted)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M1.5 12.5L12.5 7L1.5 1.5V5.5L9.5 7L1.5 8.5V12.5Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>

        <p
          className="text-center text-[10px] mt-2"
          style={{ color: "var(--text-muted)" }}
        >
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
