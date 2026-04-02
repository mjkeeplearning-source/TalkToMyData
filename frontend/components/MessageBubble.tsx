import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { type ChatMessage } from "@/hooks/useChat";

interface Props {
  message: ChatMessage;
  onRetry?: () => void;
}

export default function MessageBubble({ message, onRetry }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-gray-900 text-white px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm leading-relaxed">
          <p>{message.content}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs font-medium text-red-600 underline hover:text-red-800"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-gray-100 text-gray-900 px-4 py-2.5 text-sm leading-relaxed">
        {message.content ? (
          <div className="chat-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <span className="inline-flex gap-1 items-center text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}
