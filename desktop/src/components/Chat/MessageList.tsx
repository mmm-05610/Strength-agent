import { useRef, useEffect, useState } from "react";
import type { Message } from "../../hooks/useChat";
import { approveChangeProposal, rejectChangeProposal } from "../../api/client";
import type { RagSource, ChangeProposal } from "../../api/client";

interface Props {
  messages: Message[];
  isLoading: boolean;
  onApproveProposal?: () => void;
}

function RagSourceBadge({ sources }: { sources: RagSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="rag-sources">
      <span className="rag-label">References:</span>
      {sources.map((s, i) => (
        <span key={i} className="rag-tag" title={s.snippet}>
          {s.title} ({s.kb_name})
        </span>
      ))}
    </div>
  );
}

function ThinkingProcess({ process }: { process: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!process) return null;
  return (
    <div className="thinking-process">
      <button
        className="thinking-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "▾" : "▸"} 思考过程
      </button>
      {expanded && <div className="thinking-body">{process}</div>}
    </div>
  );
}

function getCategoryLabel(category: string) {
  if (category === "profile") return "个人资料";
  if (category === "nutrition") return "饮食记录";
  if (category === "readiness") return "恢复记录";
  if (category === "body_metric") return "身体数据";
  if (category === "workout") return "训练记录";
  return "数据变更";
}

function formatProposalValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== "")
      .slice(0, 4);
    if (entries.length === 0) return "—";
    return entries
      .map(([k, v]) => {
        const label: Record<string, string> = {
          calories_kcal: "热量",
          protein_g: "蛋白质",
          carbs_g: "碳水",
          fat_g: "脂肪",
          water_liters: "水分",
          body_weight_kg: "体重",
          sleep_hours: "睡眠",
          fatigue_score: "疲劳",
          pain_score: "酸痛",
          stress_score: "压力",
          body_fat_rate_pct: "体脂率",
          muscle_weight_kg: "肌肉",
          focus_area: "部位",
          exercise_sets: "动作数",
        };
        const keyLabel = label[k] || k;
        if (k === "exercise_sets" && Array.isArray(v))
          return `${keyLabel}: ${v.length}个`;
        if (typeof v === "number") return `${keyLabel}: ${v}`;
        return `${keyLabel}: ${String(v)}`;
      })
      .join(" · ");
  }
  return String(value);
}

function ProposalCard({
  proposal,
  onUpdate,
}: {
  proposal: ChangeProposal;
  onUpdate: () => void;
}) {
  const handleApprove = async () => {
    await approveChangeProposal(proposal.id);
    onUpdate();
  };
  const handleReject = async () => {
    await rejectChangeProposal(proposal.id);
    onUpdate();
  };

  const hasOldValue = proposal.old_value != null;

  return (
    <div className="proposal-card">
      <div className="proposal-header">
        AI 检测到数据变更 · {getCategoryLabel(proposal.change_category)}
      </div>
      <div className="proposal-body">
        {hasOldValue && (
          <>
            <span className="proposal-old">
              {formatProposalValue(proposal.old_value)}
            </span>
            <span className="proposal-arrow">→</span>
          </>
        )}
        <span className="proposal-new">
          {formatProposalValue(proposal.new_value)}
        </span>
      </div>
      <div className="proposal-reason">{proposal.reason}</div>
      <div className="proposal-actions">
        <button onClick={handleApprove} className="btn-approve">
          确认
        </button>
        <button onClick={handleReject} className="btn-reject">
          忽略
        </button>
      </div>
    </div>
  );
}

function MessageMeta({ msg }: { msg: Message }) {
  if (msg.role !== "assistant" || msg.isStreaming) return null;
  if (!msg.thinkingTimeMs && !msg.tokensUsed) return null;

  const seconds = msg.thinkingTimeMs
    ? (msg.thinkingTimeMs / 1000).toFixed(1)
    : null;

  return (
    <div className="message-meta">
      {seconds && (
        <span className="meta-item" title="Thinking time">
          ⏱ {seconds}s
        </span>
      )}
      {msg.tokensUsed != null && msg.tokensUsed > 0 && (
        <span className="meta-item token-badge" title="Tokens used">
          {msg.tokensUsed} tokens
        </span>
      )}
    </div>
  );
}

export function MessageList({ messages, isLoading, onApproveProposal }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <div key={msg.id} className={`message ${msg.role}`}>
          <div className="message-header">
            <span className="message-role">
              {msg.role === "user" ? "你" : "AI 教练"}
            </span>
            {msg.timestamp && (
              <span className="message-timestamp">{msg.timestamp}</span>
            )}
          </div>
          {msg.thinkingProcess && (
            <ThinkingProcess process={msg.thinkingProcess} />
          )}
          <div className="message-content">
            {msg.content || (msg.isStreaming ? "..." : "")}
          </div>
          <MessageMeta msg={msg} />
          {msg.ragSources && <RagSourceBadge sources={msg.ragSources} />}
          {msg.proposals?.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onUpdate={onApproveProposal || (() => {})}
            />
          ))}
        </div>
      ))}
      {isLoading && messages[messages.length - 1]?.isStreaming && (
        <div className="typing-indicator">思考中...</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
