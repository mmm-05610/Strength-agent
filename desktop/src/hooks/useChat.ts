import { useState, useCallback, useEffect, useRef } from "react";
import {
  sendMessage,
  fetchPendingProposals,
  fetchChatHistory,
  type ChatMessage,
  type RagSource,
  type ChangeProposal,
  type ChatHistoryMessage,
} from "../api/client";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  ragSources?: RagSource[];
  proposals?: ChangeProposal[];
  isStreaming?: boolean;
  thinkingTimeMs?: number;
  thinkingProcess?: string;
  tokensUsed?: number;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${min}`;
}

function historyToMessage(h: ChatHistoryMessage): Message {
  return {
    id: String(h.id),
    role: h.role as "user" | "assistant",
    content: h.content,
    timestamp: formatTime(h.created_at),
    ragSources: h.rag_sources ?? undefined,
    thinkingTimeMs: h.thinking_time_ms ?? undefined,
    thinkingProcess: h.thinking_process ?? undefined,
    tokensUsed: h.tokens_used ?? undefined,
  };
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routeTier, setRouteTier] = useState<string>("");
  const [totalCost, setTotalCost] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const initializedRef = useRef(false);

  // Load persisted chat history on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    fetchChatHistory("default")
      .then((res) => {
        if (res.messages.length > 0) {
          setMessages(res.messages.map(historyToMessage));
        }
        setHistoryLoaded(true);
      })
      .catch(() => {
        setHistoryLoaded(true);
      });
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const chat = useCallback(
    async (userInput: string) => {
      const now = new Date();
      const userTs = formatTime(now.toISOString());

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: userInput,
        timestamp: userTs,
      };
      addMessage(userMsg);

      const assistantId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: "",
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      setIsLoading(true);
      setError(null);

      const chatMessages: ChatMessage[] = messages
        .concat(userMsg)
        .map((m) => ({ role: m.role, content: m.content }));

      await sendMessage(
        chatMessages,
        // onToken
        (token) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m,
            ),
          );
        },
        // onDone
        (meta) => {
          const doneTime = new Date();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    ragSources: meta.rag_sources,
                    isStreaming: false,
                    timestamp: formatTime(doneTime.toISOString()),
                    thinkingTimeMs: meta.thinking_time_ms ?? undefined,
                    thinkingProcess: meta.thinking_process ?? undefined,
                    tokensUsed: meta.tokens_used ?? undefined,
                  }
                : m,
            ),
          );
          setRouteTier(meta.route_tier);
          setTotalCost((prev) => prev + meta.cost);

          // Emit status update event
          window.dispatchEvent(
            new CustomEvent("chat-status", {
              detail: {
                routeTier: meta.route_tier,
                cost: meta.cost,
                ragCount: meta.rag_sources?.length ?? 0,
              },
            }),
          );

          setIsLoading(false);

          // Check for profile change proposals
          fetchPendingProposals().then((proposals) => {
            if (proposals.length > 0) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, proposals } : m,
                ),
              );
            }
          });
        },
        // onError
        (err) => {
          setError(err);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `Error: ${err}`,
                    isStreaming: false,
                    timestamp: formatTime(new Date().toISOString()),
                  }
                : m,
            ),
          );
          setIsLoading(false);
        },
      );
    },
    [messages, addMessage],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setTotalCost(0);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    routeTier,
    totalCost,
    error,
    historyLoaded,
    chat,
    clearChat,
  };
}
