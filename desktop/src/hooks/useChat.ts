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

export interface ToolCallEvent {
  id: string;
  tool_name: string;
  arguments: string;
  result?: {
    success?: boolean;
    message?: string;
    error?: string;
    rendered?: string;
    form_schema?: Record<string, unknown>;
    chart_config?: Record<string, unknown>;
    submitted?: boolean;
    submitted_data?: Record<string, unknown>;
    changes?: Array<{
      key: string;
      label: string;
      before: string;
      after: string;
    }>;
  };
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  images?: string[];
  ragSources?: RagSource[];
  proposals?: ChangeProposal[];
  isStreaming?: boolean;
  thinkingTimeMs?: number;
  thinkingProcess?: string;
  thinkingContent?: string;
  tokensUsed?: number;
  toolCalls?: ToolCallEvent[];
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
  const [thinkingMode, setThinkingMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("");
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
    async (userInput: string, images?: string[]) => {
      const now = new Date();
      const userTs = formatTime(now.toISOString());

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: userInput,
        timestamp: userTs,
        images,
      };
      addMessage(userMsg);

      const assistantId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: "",
        isStreaming: true,
        thinkingContent: "",
      };
      setMessages((prev) => [...prev, assistantMsg]);

      setIsLoading(true);
      setError(null);

      // Build chat messages from the current conversation (excluding streaming assistant)
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

          fetchPendingProposals().then((proposals) => {
            // Filter: only meaningful changes, max 3 proposals per message
            const meaningful = proposals
              .filter((p) => {
                if (p.status !== "pending") return false;
                if (p.old_value == null && p.new_value == null) return false;
                if (p.old_value === p.new_value) return false;
                if (
                  typeof p.old_value === "object" &&
                  typeof p.new_value === "object"
                ) {
                  return (
                    JSON.stringify(p.old_value) !== JSON.stringify(p.new_value)
                  );
                }
                return true;
              })
              .slice(0, 3);
            if (meaningful.length > 0) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, proposals: meaningful } : m,
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
        // onThinking
        (token) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, thinkingContent: (m.thinkingContent || "") + token }
                : m,
            ),
          );
        },
        // onToolCall
        (toolCall) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
                : m,
            ),
          );
        },
        // onToolResult
        (id, result) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && m.toolCalls
                ? {
                    ...m,
                    toolCalls: m.toolCalls.map((tc) =>
                      tc.id === id ? { ...tc, result } : tc,
                    ),
                  }
                : m,
            ),
          );
        },
        // options
        { thinkingMode, model: selectedModel || undefined, images },
      );
    },
    [messages, addMessage, thinkingMode, selectedModel],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setTotalCost(0);
    setError(null);
  }, []);

  const markToolCallSubmitted = useCallback(
    (
      toolCallId: string,
      submissionResult: {
        submitted: true;
        submitted_data: Record<string, unknown>;
        changes?: Array<{
          key: string;
          label: string;
          before: string;
          after: string;
        }>;
      },
    ) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (!msg.toolCalls) return msg;
          return {
            ...msg,
            toolCalls: msg.toolCalls.map((tc) =>
              tc.id === toolCallId
                ? { ...tc, result: { ...tc.result, ...submissionResult } }
                : tc,
            ),
          };
        }),
      );
    },
    [],
  );

  return {
    messages,
    isLoading,
    routeTier,
    totalCost,
    error,
    historyLoaded,
    thinkingMode,
    setThinkingMode,
    selectedModel,
    setSelectedModel,
    chat,
    clearChat,
    markToolCallSubmitted,
  };
}
