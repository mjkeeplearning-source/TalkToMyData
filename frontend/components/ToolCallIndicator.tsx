interface Props {
  status: string;
}

export default function ToolCallIndicator({ status }: Props) {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center gap-2.5 rounded-full px-4 py-2 text-xs font-medium"
        style={{
          background: "var(--surface-alt)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
        role="status"
        aria-label={status}
      >
        <span
          className="w-2 h-2 rounded-full animate-pulse shrink-0"
          style={{ background: "var(--accent)" }}
          aria-hidden="true"
        />
        {status}
      </div>
    </div>
  );
}
