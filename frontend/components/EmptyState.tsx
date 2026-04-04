interface Props {
  onPrompt: (text: string) => void;
}

const SUGGESTED_PROMPTS = [
  {
    label: "List my data sources",
    description: "See all data sources you have access to",
    prompt: "List my data sources",
  },
  {
    label: "Top products by revenue",
    description: "Show the top 10 products ranked by revenue",
    prompt: "What are the top 10 products by revenue?",
  },
  {
    label: "Sales trends by quarter",
    description: "Analyse sales performance over the last quarter",
    prompt: "Show me sales trends over the last quarter",
  },
  {
    label: "Compare regional performance",
    description: "Break down performance across all regions",
    prompt: "Compare sales performance across all regions",
  },
];

export default function EmptyState({ onPrompt }: Props) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center px-6 py-12"
      role="main"
      aria-label="Start a conversation"
    >
      {/* AIDA mark */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold mb-6"
        style={{ background: "var(--primary)", color: "#fff" }}
        aria-hidden="true"
      >
        AI
      </div>

      <h2
        className="text-xl font-semibold text-center mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        What would you like to explore?
      </h2>
      <p
        className="text-sm text-center mb-8 max-w-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        Ask me anything about your Tableau data. I have access to your connected
        data sources and can answer questions, generate reports, and surface insights.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p.prompt}
            onClick={() => onPrompt(p.prompt)}
            className="text-left rounded-xl px-4 py-3.5 transition-all"
            style={{
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-hover)";
              e.currentTarget.style.borderColor = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--surface-alt)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <div className="text-sm font-medium mb-0.5" style={{ color: "var(--primary)" }}>
              {p.label}
            </div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {p.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
