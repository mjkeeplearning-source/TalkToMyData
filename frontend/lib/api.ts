export interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function postChat(
  message: string,
  history: Message[]
): Promise<Response> {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
}
