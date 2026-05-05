import { useEffect, useState } from "react";
import type { DashboardData, ReadinessLogEntry } from "../../../api/client";
import {
  fetchReadinessHistory,
  updateReadinessLog,
  deleteReadinessLog,
} from "../../../api/client";
import { useActions } from "../../../hooks/useActions";
import { useHistoryData } from "../../../hooks/useHistoryData";
import { getTodayStr } from "../shared/datetime";
import { Plus, X } from "lucide-react";
import { HistoryList, type HistoryItem } from "../shared/HistoryList";
import { ReadinessOverview } from "../components/recovery/ReadinessOverview";
import { RecoveryTrendChart } from "../components/recovery/RecoveryTrendChart";

interface Props {
  data: DashboardData;
  onRefresh: () => void;
  expandFormTrigger?: number;
}

export function RecoveryPage({ data, onRefresh, expandFormTrigger }: Props) {
  const { dispatch } = useActions();
  const { recovery } = data;

  const { data: history, refresh: refreshHistory } =
    useHistoryData<ReadinessLogEntry>(fetchReadinessHistory, 90);
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

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingId) {
        await updateReadinessLog(editingId, form);
        setEditingId(null);
      } else {
        await dispatch("readiness.create", {
          log_date: getTodayStr(),
          ...form,
        } as unknown as Record<string, unknown>);
      }
      setShowForm(false);
      refreshHistory();
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
      refreshHistory();
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

  const hasData = !!recovery.log_date || history.length > 0;

  if (!hasData && !showForm) {
    return (
      <div>
        <h2 className="dashboard-content-title">恢复与感受</h2>
        <div className="empty-state">
          <p className="empty-state-desc">
            暂无恢复数据，开始记录你的每日状态吧。
          </p>
          <button className="empty-state-cta" onClick={() => setShowForm(true)}>
            <Plus size={14} />
            记录今日状态
          </button>
        </div>
      </div>
    );
  }

  const formFields = [
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
  ];

  return (
    <div>
      <h2 className="dashboard-content-title">恢复与感受</h2>

      {/* Section 1: Readiness Overview */}
      <ReadinessOverview
        readinessScore={readinessScore}
        readinessColor={readinessColor}
        sleepScore={Math.round(sleepScore)}
        sleepColor={sleepColor}
        metrics={[
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
        ]}
      />

      {/* Section 2: Metric Cards */}
      <div className="detail-section">
        <div className="detail-metrics-grid">
          <div className="detail-metric-card">
            <div className="detail-metric-label">睡眠时长</div>
            <div className="detail-metric-value" style={{ color: sleepColor }}>
              {recovery.sleep_hours}
              <span className="detail-metric-unit">小时</span>
            </div>
            <div className="detail-metric-status" style={{ color: sleepColor }}>
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
              className="detail-metric-status"
              style={{ color: getLevel(recovery.fatigue_score).color }}
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
              className="detail-metric-status"
              style={{ color: getLevel(recovery.pain_score).color }}
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
              className="detail-metric-status"
              style={{ color: getLevel(recovery.stress_score).color }}
            >
              {getLevel(recovery.stress_score).label}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Recovery Trend */}
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
            <RecoveryTrendChart history={history} viewDays={viewDays} />
          </div>
        </div>
      )}

      {/* Section 4: 7-Day Averages */}
      {history.length >= 3 && (
        <div className="detail-section">
          <div className="detail-section-title">近期统计</div>
          <div className="avg-cards-row">
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
                  <div className="avg-card">
                    <div className="avg-card-value">{avgSleep}h</div>
                    <div className="avg-card-label">7天均睡眠</div>
                  </div>
                  <div className="avg-card">
                    <div className="avg-card-value">{avgFatigue}/10</div>
                    <div className="avg-card-label">均疲劳度</div>
                  </div>
                  <div className="avg-card">
                    <div className="avg-card-value">{avgStress}/10</div>
                    <div className="avg-card-label">均压力</div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Section 5: AI Recovery Recommendations */}
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
              <div className="ai-recommendation-great">
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
              <div className="ai-recommendation-great">
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
              <div className="ai-recommendation-great">
                · 压力水平低，心理状态良好。
              </div>
            )}
            {recovery.sleep_hours >= 7 &&
              recovery.fatigue_score <= 4 &&
              recovery.pain_score <= 3 &&
              recovery.stress_score <= 4 && (
                <div className="ai-recommendation-great">
                  各项指标良好，可放心进行正常强度训练！
                </div>
              )}
          </div>
        </div>
      )}

      {/* Section 6: Log Form */}
      <div className="detail-section">
        {showForm ? (
          <div className="card">
            <div className="recovery-form-header">
              <span className="detail-section-title" style={{ margin: 0 }}>
                记录今日恢复状态
              </span>
              <button
                onClick={() => setShowForm(false)}
                className="recovery-form-close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="recovery-form-grid">
              {formFields.map((f) => (
                <div key={f.key}>
                  <label className="recovery-form-label">{f.label}</label>
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
                    className="recovery-form-input"
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
            className="recovery-form-add-btn"
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
