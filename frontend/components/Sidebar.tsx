"use client";

import { type Conversation } from "@/lib/types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function groupByDate(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const groups: Map<string, Conversation[]> = new Map();
  for (const conv of conversations) {
    const label = formatDate(conv.updatedAt);
    const group = groups.get(label) ?? [];
    group.push(conv);
    groups.set(label, group);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export default function Sidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
  isOpen,
  onClose,
}: Props) {
  const groups = groupByDate(conversations);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Conversation history"
        className={[
          "fixed inset-y-0 left-0 z-30 w-64 flex flex-col transition-transform duration-200",
          "lg:relative lg:translate-x-0 lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{ background: "var(--sidebar-bg)" }}
      >
        {/* Brand header */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <div
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: "var(--accent)", color: "var(--primary)" }}
            aria-hidden="true"
          >
            AI
          </div>
          <div>
            <div
              className="text-sm font-semibold leading-tight"
              style={{ color: "var(--sidebar-fg)" }}
            >
              AIDA
            </div>
            <div
              className="text-[10px] leading-tight"
              style={{ color: "var(--sidebar-fg-muted)" }}
            >
              AI for Data Analytics
            </div>
          </div>
        </div>

        {/* New chat button */}
        <div className="px-4 py-3">
          <button
            onClick={onNew}
            aria-label="Start a new conversation"
            className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors"
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "var(--sidebar-fg)",
              border: "1px solid var(--sidebar-border)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.18)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
            }
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            New conversation
          </button>
        </div>

        {/* Conversation list */}
        <nav
          className="flex-1 overflow-y-auto px-3 pb-4 sidebar-scroll"
          aria-label="Past conversations"
        >
          {conversations.length === 0 ? (
            <p
              className="text-center text-xs px-4 py-8"
              style={{ color: "var(--sidebar-fg-muted)" }}
            >
              No conversations yet
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map(({ label, items }) => (
                <div key={label}>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-1"
                    style={{ color: "var(--sidebar-fg-muted)" }}
                  >
                    {label}
                  </p>
                  <ul role="list" className="space-y-0.5">
                    {items.map((conv) => (
                      <li key={conv.id}>
                        <div
                          className="group flex items-center gap-1 rounded-lg"
                          style={{
                            background:
                              conv.id === activeId
                                ? "var(--sidebar-item-active)"
                                : undefined,
                          }}
                        >
                          <button
                            onClick={() => { onSelect(conv.id); onClose(); }}
                            className="flex-1 text-left px-3 py-2.5 rounded-lg text-sm truncate transition-colors"
                            style={{ color: "var(--sidebar-fg)" }}
                            onMouseEnter={(e) => {
                              if (conv.id !== activeId)
                                e.currentTarget.parentElement!.style.background =
                                  "var(--sidebar-item-hover)";
                            }}
                            onMouseLeave={(e) => {
                              if (conv.id !== activeId)
                                e.currentTarget.parentElement!.style.background = "";
                            }}
                            title={conv.title}
                            aria-current={conv.id === activeId ? "true" : undefined}
                          >
                            {conv.title}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                            aria-label={`Delete conversation: ${conv.title}`}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1.5 mr-1 rounded transition-opacity"
                            style={{ color: "var(--sidebar-fg-muted)" }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.color = "var(--sidebar-fg)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.color = "var(--sidebar-fg-muted)")
                            }
                          >
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                              <path d="M2 2l9 9M11 2l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
