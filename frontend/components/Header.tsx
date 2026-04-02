"use client";

import { useEffect, useState } from "react";

export default function Header() {
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
    <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
      <h1 className="text-lg font-semibold text-gray-900 tracking-tight">
        TalkToMyData
      </h1>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span
          className={`w-2 h-2 rounded-full ${
            connected === null
              ? "bg-gray-300"
              : connected
              ? "bg-green-500"
              : "bg-red-500"
          }`}
        />
        <span>
          {connected === null ? "Connecting" : connected ? "Connected" : "Disconnected"}
        </span>
      </div>
    </header>
  );
}
