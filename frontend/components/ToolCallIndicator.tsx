interface Props {
  status: string;
}

export default function ToolCallIndicator({ status }: Props) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        {status}
      </div>
    </div>
  );
}
