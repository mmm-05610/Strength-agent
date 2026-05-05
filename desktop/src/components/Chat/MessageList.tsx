import { useRef, useEffect, useState, useCallback } from "react";
import type { Message, ToolCallEvent } from "../../hooks/useChat";
import { approveChangeProposal, rejectChangeProposal } from "../../api/client";
import type { RagSource, ChangeProposal } from "../../api/client";
import { RichMarkdown } from "./RichMarkdown";
import { ToolCallCard } from "./ToolCallCard";
import {
  Brain,
  Sparkles,
  AlertCircle,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Target,
  Apple,
  Dumbbell,
  Moon,
  TrendingUp,
} from "lucide-react";

interface Props {
  messages: Message[];
  isLoading: boolean;
  onApproveProposal?: () => void;
  onFormSubmit?: (
    actionName: string,
    data: Record<string, unknown>,
    toolCallId: string,
  ) => Promise<void>;
}

function RagSourceBadge({ sources }: { sources: RagSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="rag-sources">
      <span className="rag-label">参考资料</span>
      {sources.map((s, i) => (
        <span key={i} className="rag-tag" title={s.snippet}>
          {s.title}
        </span>
      ))}
    </div>
  );
}

function ThinkingContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(true);
  if (!content) return null;
  return (
    <div className="thinking-inline">
      <button
        className="thinking-inline-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain size={13} />
        <span>{expanded ? "收起思考" : "查看思考过程"}</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && <div className="thinking-inline-body">{content}</div>}
    </div>
  );
}

function ToolCallList({
  calls,
  onFormSubmit,
}: {
  calls: ToolCallEvent[];
  onFormSubmit?: (
    actionName: string,
    data: Record<string, unknown>,
    toolCallId: string,
  ) => Promise<void>;
}) {
  return (
    <div className="tool-call-list">
      {calls.map((tc) => (
        <ToolCallCard key={tc.id} call={tc} onFormSubmit={onFormSubmit} />
      ))}
    </div>
  );
}

// --- Redesigned Proposal Card: inline chat pattern ---

const CATEGORY_META: Record<
  string,
  { icon: React.ComponentType<{ size?: number }>; label: string; color: string }
> = {
  profile: { icon: Target, label: "个人资料", color: "#7C6FF7" },
  nutrition: { icon: Apple, label: "饮食记录", color: "#4ECDC4" },
  readiness: { icon: Moon, label: "恢复记录", color: "#8B83BA" },
  body_metric: { icon: TrendingUp, label: "身体数据", color: "#F0A050" },
  workout: { icon: Dumbbell, label: "训练记录", color: "#6BCB77" },
};

const FIELD_LABELS: Record<string, string> = {
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
  skeletal_muscle_kg: "骨骼肌",
  waist_cm: "腰围",
  hip_cm: "臀围",
  focus_area: "部位",
  notes: "备注",
  exercise_sets: "动作数",
  goal_type: "目标类型",
  target_weight_kg: "目标体重",
};

function formatSingleValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 30 ? v.slice(0, 30) + "…" : v;
  return String(v);
}

function ProposalCard({
  proposal,
  onUpdate,
}: {
  proposal: ChangeProposal;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [decided, setDecided] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const meta = CATEGORY_META[proposal.change_category] || {
    icon: Sparkles,
    label: "数据变更",
    color: "#7C6FF7",
  };
  const Icon = meta.icon;
  const hasOldValue = proposal.old_value != null;

  // Build before/after fields
  const diffs: Array<{
    key: string;
    label: string;
    before: string;
    after: string;
  }> = [];
  if (typeof proposal.new_value === "object" && proposal.new_value) {
    const record = proposal.new_value as Record<string, unknown>;
    for (const [k, v] of Object.entries(record)) {
      if (v == null || v === "") continue;
      const label = FIELD_LABELS[k] || k;
      const oldVal =
        typeof proposal.old_value === "object" && proposal.old_value
          ? (proposal.old_value as Record<string, unknown>)[k]
          : null;
      diffs.push({
        key: k,
        label,
        before: formatSingleValue(oldVal),
        after: formatSingleValue(v),
      });
    }
  }

  const handleApprove = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      await approveChangeProposal(proposal.id);
      setDecision("approved");
      setDecided(true);
      onUpdate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "操作失败，请重试";
      if (msg.includes("409") || msg.includes("already resolved")) {
        setDecision("approved");
        setDecided(true);
        onUpdate();
      } else {
        setError(msg);
        inflightRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  }, [proposal.id, onUpdate]);

  const handleReject = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      await rejectChangeProposal(proposal.id);
      setDecision("rejected");
      setDecided(true);
      onUpdate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "操作失败，请重试";
      if (msg.includes("409") || msg.includes("already resolved")) {
        setDecision("rejected");
        setDecided(true);
        onUpdate();
      } else {
        setError(msg);
        inflightRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  }, [proposal.id, onUpdate]);

  if (decided) {
    return (
      <div className={`proposal-fitness decided ${decision}`}>
        <div className="proposal-fitness-result">
          <Check size={14} />
          <span>{decision === "approved" ? "已确认更改" : "已忽略"}</span>
        </div>
      </div>
    );
  }

  // Show max 3 diff items by default, rest on expand
  const visibleDiffs = expanded ? diffs : diffs.slice(0, 3);
  const hiddenCount = diffs.length - 3;

  return (
    <div className="proposal-fitness" style={{ borderLeftColor: meta.color }}>
      {/* Header — always visible */}
      <div className="proposal-fitness-header">
        <div
          className="proposal-fitness-icon"
          style={{ background: `${meta.color}15`, color: meta.color }}
        >
          <Icon size={14} />
        </div>
        <div className="proposal-fitness-meta">
          <span className="proposal-fitness-label">
            AI 建议更新{meta.label}
          </span>
          {proposal.reason && (
            <span className="proposal-fitness-reason">{proposal.reason}</span>
          )}
        </div>
        <AlertCircle
          size={13}
          className="proposal-fitness-risk"
          color="var(--warning)"
        />
      </div>

      {/* Diff — always visible, compact */}
      {diffs.length > 0 && (
        <div className="proposal-fitness-diff">
          {visibleDiffs.map((d) => (
            <span
              key={d.key}
              className={`pf-diff-chip ${hasOldValue && d.before !== "—" ? "changed" : "new"}`}
            >
              <span className="pf-diff-label">{d.label}</span>
              {hasOldValue && d.before !== "—" && (
                <span className="pf-diff-old">{d.before}</span>
              )}
              {hasOldValue && d.before !== "—" && (
                <span className="pf-diff-arrow">→</span>
              )}
              <span className="pf-diff-new">{d.after}</span>
            </span>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="pf-diff-more"
              onClick={() => setExpanded(true)}
            >
              +{hiddenCount} 项
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="proposal-fitness-actions">
        <button
          type="button"
          className="pf-btn pf-btn-approve"
          onClick={handleApprove}
          disabled={loading}
        >
          <Check size={13} />
          <span>确认</span>
        </button>
        <button
          type="button"
          className="pf-btn pf-btn-reject"
          onClick={handleReject}
          disabled={loading}
        >
          <X size={13} />
          <span>忽略</span>
        </button>
      </div>

      {error && (
        <div className="proposal-fitness-error">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}
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
      {seconds && <span className="meta-item">⏱ {seconds}s</span>}
      {msg.tokensUsed != null && msg.tokensUsed > 0 && (
        <span className="meta-item">{msg.tokensUsed} tokens</span>
      )}
    </div>
  );
}

function UserImages({ images }: { images: string[] }) {
  if (!images.length) return null;
  return (
    <div className="user-images">
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`上传 ${i + 1}`}
          className="user-image-thumb"
        />
      ))}
    </div>
  );
}

export function MessageList({
  messages,
  isLoading,
  onApproveProposal,
  onFormSubmit,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`message ${msg.role}${msg.isStreaming ? " streaming" : ""}`}
        >
          {/* Role indicator */}
          <div className="message-header">
            <span className="message-role">
              {msg.role === "user" ? "你" : "AI 教练"}
            </span>
            {msg.timestamp && (
              <span className="message-timestamp">{msg.timestamp}</span>
            )}
          </div>

          {/* Thinking: rendered above the main content, default expanded */}
          {msg.thinkingContent && (
            <ThinkingContent content={msg.thinkingContent} />
          )}
          {msg.thinkingProcess && !msg.thinkingContent && (
            <ThinkingContent content={msg.thinkingProcess} />
          )}

          {/* Images */}
          {msg.images && <UserImages images={msg.images} />}

          {/* Tool calls */}
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <ToolCallList calls={msg.toolCalls} onFormSubmit={onFormSubmit} />
          )}

          {/* Message body */}
          <div className="message-content">
            {msg.role === "assistant" && !msg.isStreaming && msg.content ? (
              <RichMarkdown content={msg.content} onFormSubmit={onFormSubmit} />
            ) : msg.role === "assistant" && msg.isStreaming ? (
              <span className="streaming-text">
                {msg.content || ""}
                <span className="cursor-blink">|</span>
              </span>
            ) : (
              <span>{msg.content}</span>
            )}
          </div>

          <MessageMeta msg={msg} />
          {msg.ragSources && <RagSourceBadge sources={msg.ragSources} />}

          {/* Proposals: inline in chat stream, after message content */}
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
        <div className="typing-indicator">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
