import { useEffect, useState } from "react";
import type { DashboardData, ReadinessLogEntry } from "../../../api/client";
import {
  createReadinessLog,
  fetchReadinessHistory,
  updateReadinessLog,
  deleteReadinessLog,
} from "../../../api/client";
import { Plus, X } from "lucide-react";
import { HistoryList, type HistoryItem } from "../shared/HistoryList";
import {
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  data: DashboardData;
  onRefresh: () => void;
  expandFormTrigger?: number;
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ── Whoop-style Score Dial ── */
function ScoreDial({
  score,
  max = 100,
  label,
  color,
  size = 100,
}: {
  score: number;
  max?: number;
  label: string;
  color: string;
  size?: number;
}) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, (score / max) * 100);
  const offset = circ - (pct / 100) * circ;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--bg-secondary)"
            strokeWidth="8"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: size * 0.22,
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            {score}
          </span>
        </div>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function RecoveryPage({ data, onRefresh, expandFormTrigger }: Props) {
  const { recovery } = data;

  const [history, setHistory] = useState<ReadinessLogEntry[]>([]);
  const [viewDays, setViewDays] = useState<7 | 14 | 30>(14);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (expandFormTrigger && expandFormTrigger > 0) setShowForm(true);
  }, [expandFormTrigger]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState({
    sleep_hours: recovery.sleep_hours || 7,
    fatigue_score: recovery.fatigue_score || 3,
    pain_score: recovery.pain_score || 2,
    stress_score: recovery.stress_score || 3,
  });

  useEffect(() => {
    fetchReadinessHistory(90)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingId) {
        await updateReadinessLog(editingId, form);
        setEditingId(null);
      } else {
        await createReadinessLog({ log_date: getTodayStr(), ...form });
      }
      setShowForm(false);
      fetchReadinessHistory(90)
        .then(setHistory)
        .catch(() => {});
      onRefresh();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (id: number) => {
    const item = history.find((h) => h.id === id);
    if (!item) return;
    setForm({
      sleep_hours: item.sleep_hours,
      fatigue_score: item.fatigue_score,
      pain_score: item.pain_score,
      stress_score: item.stress_score,
    });
    setEditingId(id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定删除这条恢复记录吗？")) return;
    setDeleting(id);
    try {
      await deleteReadinessLog(id);
      fetchReadinessHistory(90)
        .then(setHistory)
        .catch(() => {});
      onRefresh();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const readinessHistoryItems: HistoryItem[] = history
    .slice()
    .sort((a, b) => b.log_date.localeCompare(a.log_date))
    .map((h) => ({
      id: h.id,
      date: h.log_date,
      summary: `睡眠${h.sleep_hours}h 疲劳${h.fatigue_score}`,
      details: `疼痛${h.pain_score} 压力${h.stress_score}`,
    }));

  // Composite readiness score (0-100)
  // Sleep: 0-10h → 0-100, Fatigue/Pain/Stress: 10-low → better
  const sleepScore = Math.min(100, (recovery.sleep_hours / 8) * 100);
  const readinessScore = recovery.log_date
    ? Math.round(
        sleepScore * 0.4 +
          ((10 - recovery.fatigue_score) / 9) * 100 * 0.25 +
          ((10 - recovery.pain_score) / 9) * 100 * 0.15 +
          ((10 - recovery.stress_score) / 9) * 100 * 0.2,
      )
    : 0;

  const readinessColor =
    readinessScore >= 70
      ? "var(--mint)"
      : readinessScore >= 40
        ? "var(--warning)"
        : "var(--danger)";

  const sleepColor =
    recovery.sleep_hours >= 7
      ? "var(--mint)"
      : recovery.sleep_hours >= 6
        ? "var(--warning)"
        : "var(--danger)";

  const getLevel = (score: number, reverse = false) => {
    const v = reverse ? 10 - score : score;
    if (v >= 7) return { label: "良好", color: "var(--mint)" };
    if (v >= 4) return { label: "中等", color: "var(--warning)" };
    return { label: "需关注", color: "var(--danger)" };
  };

  // Trend chart
  const trendData = history
    .slice(-viewDays)
    .reverse()
    .map((d) => ({
      date: d.log_date.slice(5),
      sleep: d.sleep_hours,
      fatigue: d.fatigue_score,
      pain: d.pain_score,
      stress: d.stress_score,
    }));

  const hasData = !!recovery.log_date || history.length > 0;

  if (!hasData && !showForm) {
    return (
      <div>
        <h2 className="dashboard-content-title">恢复与感受</h2>
        <div style={{ textAlign: "center", padding: 60 }}>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            暂无恢复数据，开始记录你的每日状态吧。
          </div>
          <button className="btn-approve" onClick={() => setShowForm(true)}>
            <Plus size={14} style={{ marginRight: 4 }} />
            记录今日状态
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="dashboard-content-title">恢复与感受</h2>

      {/* ═══ Section 1: Three-Dial Overview (Whoop-style) ═══ */}
      <div className="detail-section">
        <div
          className="card"
          style={{
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            padding: "28px 16px",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <ScoreDial
            score={readinessScore}
            label="恢复准备度"
            color={readinessColor}
            size={100}
          />
          <ScoreDial
            score={Math.round(sleepScore)}
            label="睡眠得分"
            color={sleepColor}
            size={100}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {[
              {
                label: "疲劳度",
                value: recovery.fatigue_score,
                color: getLevel(recovery.fatigue_score).color,
                desc: getLevel(recovery.fatigue_score).label,
              },
              {
                label: "肌肉酸痛",
                value: recovery.pain_score,
                color: getLevel(recovery.pain_score).color,
                desc: getLevel(recovery.pain_score).label,
              },
              {
                label: "压力",
                value: recovery.stress_score,
                color: getLevel(recovery.stress_score).color,
                desc: getLevel(recovery.stress_score).label,
              },
            ].map((m) => (
              <div
                key={m.label}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    width: 50,
                  }}
                >
                  {m.label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    background: "var(--bg-secondary)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(m.value / 10) * 100}%`,
                      background: m.color,
                      borderRadius: 3,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: m.color,
                    width: 32,
                  }}
                >
                  {m.value}/10
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Section 2: Metric Cards ═══ */}
      <div className="detail-section">
        <div className="detail-metrics-grid">
          <div className="detail-metric-card">
            <div className="detail-metric-label">睡眠时长</div>
            <div className="detail-metric-value" style={{ color: sleepColor }}>
              {recovery.sleep_hours}
              <span className="detail-metric-unit">小时</span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: sleepColor,
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              {recovery.sleep_hours >= 8
                ? "充足"
                : recovery.sleep_hours >= 7
                  ? "良好"
                  : recovery.sleep_hours >= 6
                    ? "一般"
                    : "不足"}
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">疲劳度</div>
            <div
              className="detail-metric-value"
              style={{ color: getLevel(recovery.fatigue_score).color }}
            >
              {recovery.fatigue_score}
              <span className="detail-metric-unit">/10</span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: getLevel(recovery.fatigue_score).color,
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              {getLevel(recovery.fatigue_score).label}
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">肌肉酸痛</div>
            <div
              className="detail-metric-value"
              style={{ color: getLevel(recovery.pain_score).color }}
            >
              {recovery.pain_score}
              <span className="detail-metric-unit">/10</span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: getLevel(recovery.pain_score).color,
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              {getLevel(recovery.pain_score).label}
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">压力</div>
            <div
              className="detail-metric-value"
              style={{ color: getLevel(recovery.stress_score).color }}
            >
              {recovery.stress_score}
              <span className="detail-metric-unit">/10</span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: getLevel(recovery.stress_score).color,
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              {getLevel(recovery.stress_score).label}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Section 3: Recovery Trend ═══ */}
      {history.length > 1 && (
        <div className="detail-section">
          <div className="trend-chart-wrapper">
            <div className="trend-chart-header">
              <div className="detail-section-title" style={{ margin: 0 }}>
                恢复趋势
              </div>
              <div className="segmented-control">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    className={`segmented-control-item${viewDays === d ? " active" : ""}`}
                    onClick={() => setViewDays(d)}
                  >
                    {d}天
                  </button>
                ))}
              </div>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              {viewDays === 30 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart
                    data={trendData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-light)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis
                      domain={[0, 10]}
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      width={25}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-light)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <ReferenceArea
                      y1={7}
                      y2={9}
                      fill="var(--accent)"
                      fillOpacity={0.06}
                      label={{
                        value: "理想睡眠 7-9h",
                        position: "insideTopRight",
                        fontSize: 9,
                        fill: "var(--accent)",
                      }}
                    />
                    <ReferenceArea
                      y1={0}
                      y2={4}
                      fill="var(--mint)"
                      fillOpacity={0.06}
                      label={{
                        value: "低疲劳",
                        position: "insideBottomRight",
                        fontSize: 9,
                        fill: "var(--mint)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sleep"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                      name="睡眠(h)"
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="fatigue"
                      stroke="var(--warning)"
                      strokeWidth={2}
                      dot={false}
                      name="疲劳"
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="pain"
                      stroke="#B4A3E8"
                      strokeWidth={2}
                      dot={false}
                      name="酸痛"
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="stress"
                      stroke="var(--danger)"
                      strokeWidth={2}
                      dot={false}
                      name="压力"
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <Brush
                      dataKey="date"
                      height={24}
                      stroke="var(--accent)"
                      fill="var(--bg-secondary)"
                      tickFormatter={() => ""}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart
                    data={trendData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border-light)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis
                      domain={[0, 10]}
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      width={25}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-light)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <ReferenceArea
                      y1={7}
                      y2={9}
                      fill="var(--accent)"
                      fillOpacity={0.06}
                      label={{
                        value: "理想睡眠 7-9h",
                        position: "insideTopRight",
                        fontSize: 9,
                        fill: "var(--accent)",
                      }}
                    />
                    <ReferenceArea
                      y1={0}
                      y2={4}
                      fill="var(--mint)"
                      fillOpacity={0.06}
                      label={{
                        value: "低疲劳",
                        position: "insideBottomRight",
                        fontSize: 9,
                        fill: "var(--mint)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sleep"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                      name="睡眠(h)"
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="fatigue"
                      stroke="var(--warning)"
                      strokeWidth={2}
                      dot={false}
                      name="疲劳"
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="pain"
                      stroke="#B4A3E8"
                      strokeWidth={2}
                      dot={false}
                      name="酸痛"
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="stress"
                      stroke="var(--danger)"
                      strokeWidth={2}
                      dot={false}
                      name="压力"
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Section 4: 7-Day Averages ═══ */}
      {history.length >= 3 && (
        <div className="detail-section">
          <div className="detail-section-title">近期统计</div>
          <div
            style={{
              display: "flex",
              gap: 12,
            }}
          >
            {(() => {
              const recent = history.slice(-7);
              const avgSleep = +(
                recent.reduce((s, d) => s + d.sleep_hours, 0) / recent.length
              ).toFixed(1);
              const avgFatigue = +(
                recent.reduce((s, d) => s + d.fatigue_score, 0) / recent.length
              ).toFixed(1);
              const avgStress = +(
                recent.reduce((s, d) => s + d.stress_score, 0) / recent.length
              ).toFixed(1);

              return (
                <>
                  <div
                    style={{
                      flex: 1,
                      background: "var(--bg-card)",
                      borderRadius: "var(--radius)",
                      padding: "12px 16px",
                      border: "1px solid var(--border-light)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: "var(--text-primary)",
                      }}
                    >
                      {avgSleep}h
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      7天均睡眠
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: "var(--bg-card)",
                      borderRadius: "var(--radius)",
                      padding: "12px 16px",
                      border: "1px solid var(--border-light)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: "var(--text-primary)",
                      }}
                    >
                      {avgFatigue}/10
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      均疲劳度
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: "var(--bg-card)",
                      borderRadius: "var(--radius)",
                      padding: "12px 16px",
                      border: "1px solid var(--border-light)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: "var(--text-primary)",
                      }}
                    >
                      {avgStress}/10
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      均压力
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══ Section 5: AI Recovery Recommendations ═══ */}
      {recovery.log_date && (
        <div className="detail-section">
          <div className="detail-section-title">AI 恢复建议</div>
          <div
            className="card"
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.8,
              borderLeft: `3px solid ${readinessColor}`,
            }}
          >
            {recovery.sleep_hours < 7 && (
              <div>
                · 睡眠不足7小时，今晚尽量提前30分钟入睡。睡眠是恢复的第一要素。
              </div>
            )}
            {recovery.sleep_hours >= 7 && (
              <div style={{ color: "var(--mint)" }}>
                · 睡眠时长良好（{recovery.sleep_hours}
                h），继续保持规律的睡眠节律。
              </div>
            )}
            {recovery.fatigue_score >= 7 && (
              <div>
                · 疲劳度偏高（{recovery.fatigue_score}
                /10），建议安排轻量训练或完全休息日。
              </div>
            )}
            {recovery.fatigue_score <= 3 && (
              <div style={{ color: "var(--mint)" }}>
                · 疲劳度低，身体恢复良好，适合进行高强度训练。
              </div>
            )}
            {recovery.pain_score >= 5 && (
              <div>
                · 肌肉酸痛明显（{recovery.pain_score}
                /10），训练前充分热身，避免高强度离心动作。
              </div>
            )}
            {recovery.stress_score >= 7 && (
              <div>
                · 压力较高（{recovery.stress_score}
                /10），训练可能加重身体负担，优先调节心情。
              </div>
            )}
            {recovery.stress_score <= 3 && (
              <div style={{ color: "var(--mint)" }}>
                · 压力水平低，心理状态良好。
              </div>
            )}
            {recovery.sleep_hours >= 7 &&
              recovery.fatigue_score <= 4 &&
              recovery.pain_score <= 3 &&
              recovery.stress_score <= 4 && (
                <div style={{ fontWeight: 600, color: "var(--mint)" }}>
                  各项指标良好，可放心进行正常强度训练！
                </div>
              )}
          </div>
        </div>
      )}

      {/* ═══ Section 6: Log Form ═══ */}
      <div className="detail-section">
        {showForm ? (
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <span className="detail-section-title" style={{ margin: 0 }}>
                记录今日恢复状态
              </span>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {[
                {
                  key: "sleep_hours" as const,
                  label: "睡眠时长 (小时)",
                  step: 0.5,
                  min: 0,
                  max: 12,
                },
                {
                  key: "fatigue_score" as const,
                  label: "疲劳度 (1-10)",
                  step: 1,
                  min: 1,
                  max: 10,
                },
                {
                  key: "pain_score" as const,
                  label: "肌肉酸痛 (1-10)",
                  step: 1,
                  min: 1,
                  max: 10,
                },
                {
                  key: "stress_score" as const,
                  label: "压力 (1-10)",
                  step: 1,
                  min: 1,
                  max: 10,
                },
              ].map((f) => (
                <div key={f.key}>
                  <label
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    {f.label}
                  </label>
                  <input
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={form[f.key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [f.key]: parseFloat(e.target.value) || 0,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      fontSize: 14,
                      fontFamily: "inherit",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              className="btn-approve"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                marginTop: 16,
                width: "100%",
                fontSize: 14,
                padding: "10px 0",
              }}
            >
              {submitting ? "保存中..." : "保存记录"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "var(--radius)",
              border: "1px dashed var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Plus size={14} />
            {editingId ? "保存修改" : "记录今日恢复状态"}
          </button>
        )}
      </div>
      <HistoryList
        title="恢复历史"
        items={readinessHistoryItems}
        onEdit={handleEdit}
        onDelete={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
