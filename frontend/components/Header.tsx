"use client";

import { useEffect, useState } from "react";

interface Props {
  onMenuToggle: () => void;
}

export default function Header({ onMenuToggle }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const res = await fetch("/health");
        if (!cancelled) setConnected(res.ok);
      } catch {
        if (!cancelled) setConnected(false);
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <header
      className="flex items-center gap-3 px-4 py-3 shrink-0"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
      role="banner"
    >
      {/* Mobile sidebar toggle */}
      <button
        onClick={onMenuToggle}
        aria-label="Toggle navigation menu"
        className="lg:hidden p-1.5 rounded-lg transition-colors"
        style={{ color: "var(--text-secondary)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--surface-alt)")
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {/* Title */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div
          className="hidden sm:flex w-7 h-7 rounded-lg items-center justify-center text-xs font-bold shrink-0"
          style={{ background: "var(--primary)", color: "#fff" }}
          aria-hidden="true"
        >
          AI
        </div>
        <div className="min-w-0">
          <h1
            className="text-sm font-semibold leading-tight truncate"
            style={{ color: "var(--text-primary)" }}
          >
            AIDA
          </h1>
          <p
            className="text-[10px] leading-tight truncate hidden sm:block"
            style={{ color: "var(--text-muted)" }}
          >
            Artificial Intelligence for Data Analytics
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Connection status */}
        <div
          className="flex items-center gap-1.5 text-xs"
          role="status"
          aria-live="polite"
          aria-label={`Backend ${connected === null ? "connecting" : connected ? "connected" : "disconnected"}`}
          style={{ color: "var(--text-muted)" }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background:
                connected === null
                  ? "var(--text-muted)"
                  : connected
                  ? "var(--success)"
                  : "var(--error)",
            }}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">
            {connected === null ? "Connecting" : connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {/* User avatar */}
        <div
          className="flex items-center gap-2 pl-3"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: "var(--primary)", color: "#fff" }}
            aria-hidden="true"
          >
            MJ
          </div>
          <span
            className="text-xs font-medium hidden sm:block"
            style={{ color: "var(--text-secondary)" }}
          >
            Manish Jain
          </span>
        </div>
      </div>
    </header>
  );
}
