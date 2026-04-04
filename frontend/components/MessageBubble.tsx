"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import { type ChatMessage } from "@/lib/types";

interface Props {
  message: ChatMessage;
  onRetry?: () => void;
}

/** Ensure ATX headings (# ## ###…) always start on their own line.
 *  Fixes intermittent SSE streaming artefact where the preceding \n is dropped.
 *  Table rows (lines starting with |) are left untouched to prevent breaking
 *  cells that contain # characters (e.g. | # | Name | row-number columns). */
function normalizeMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.trimStart().startsWith("|")) return line;
      return line.replace(/(.)(#{1,6} )/g, "$1\n$2");
    })
    .join("\n");
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [text]);

  return (
    <button
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy message"}
      className="copy-btn p-1.5 rounded-md transition-colors"
      style={{ color: "var(--text-muted)" }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--surface-hover)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M1.5 7L5 10.5L11.5 3" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2.5 9H2a1 1 0 01-1-1V2a1 1 0 011-1h6a1 1 0 011 1v1.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
    </button>
  );
}

export default function MessageBubble({ message, onRetry }: Props) {
  if (message.role === "user") {
    return (
      <div className="message-group flex flex-col items-end gap-1 message-appear">
        <div
          className="max-w-[75%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed"
          style={{
            background: "var(--bubble-user-bg)",
            color: "var(--bubble-user-fg)",
          }}
        >
          {message.content}
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <CopyButton text={message.content} />
          <time
            dateTime={message.timestamp.toISOString()}
            className="text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            {formatTime(message.timestamp)}
          </time>
        </div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="message-appear flex justify-start">
        <div
          className="max-w-[75%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed"
          role="alert"
          style={{
            background: "var(--error-bg)",
            border: "1px solid var(--error-border)",
            color: "var(--error)",
          }}
        >
          <div className="flex items-start gap-2">
            <svg
              className="shrink-0 mt-0.5"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
              <path d="M7 4.5v3M7 9.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <div>
              <p>{message.content}</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="mt-2 text-xs font-semibold underline underline-offset-2"
                  style={{ color: "var(--error)" }}
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="message-group flex flex-col items-start gap-1 message-appear">
      <div
        className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm"
        style={{
          background: "var(--bubble-assistant-bg)",
          color: "var(--bubble-assistant-fg)",
        }}
      >
        {message.content ? (
          <div className="chat-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeHighlight]}
              components={{
                table: ({ children }) => (
                  <div className="table-wrap">
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {normalizeMarkdown(message.content)}
            </ReactMarkdown>
          </div>
        ) : (
          <span className="inline-flex gap-1.5 items-center py-0.5" aria-label="Thinking">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
        )}
      </div>
      {message.content && (
        <div className="flex items-center gap-1.5 px-1">
          <CopyButton text={message.content} />
          <time
            dateTime={message.timestamp.toISOString()}
            className="text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            {formatTime(message.timestamp)}
          </time>
        </div>
      )}
    </div>
  );
}
