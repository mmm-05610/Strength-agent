import { useEffect, useState } from "react";
import type { DashboardData, GoalConfig } from "../../../api/client";
import { fetchGoalConfig, updateGoalConfig } from "../../../api/client";
import {
  TrendingUp,
  TrendingDown,
  Edit3,
  X,
  Check,
  Settings,
} from "lucide-react";

interface Props {
  data: DashboardData;
  onRefresh: () => void;
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function GoalsPage({ data, onRefresh }: Props) {
  const { goal_progress, body_metrics } = data;

  const [goalConfig, setGoalConfig] = useState<GoalConfig | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<GoalConfig | null>(null);

  useEffect(() => {
    fetchGoalConfig()
      .then(setGoalConfig)
      .catch(() => {});
  }, []);

  // Weight progress ring
  const r = 48;
  const circ = 2 * Math.PI * r;

  if (!goal_progress) {
    return (
      <div>
        <h2 className="dashboard-content-title">目标与计划</h2>
        <div style={{ textAlign: "center", padding: 60 }}>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            尚未设定目标，请在设置中配置阶段目标。
          </div>
          {goalConfig && (
            <button
              className="btn-approve"
              onClick={() => {
                setEditForm({ ...goalConfig });
                setShowEdit(true);
              }}
            >
              <Settings size={14} style={{ marginRight: 4 }} />
              修改目标
            </button>
          )}
        </div>
      </div>
    );
  }

  const getGoalLabel = (type: string) => {
    if (type === "muscle_gain") return "增肌";
    if (type === "fat_loss") return "减脂";
    if (type === "maintenance") return "维持";
    return type;
  };

  // Progress computation
  const isMuscleGain = goal_progress.goal_type === "muscle_gain";
  const isFatLoss = goal_progress.goal_type === "fat_loss";
  const startWeight = isMuscleGain
    ? goal_progress.target_weight_kg -
      Math.abs(goal_progress.weight_gap_kg) -
      (goal_progress.current_weight_kg > goal_progress.target_weight_kg
        ? goal_progress.current_weight_kg - goal_progress.target_weight_kg
        : 0)
    : goal_progress.target_weight_kg +
      Math.abs(goal_progress.weight_gap_kg) +
      (goal_progress.current_weight_kg < goal_progress.target_weight_kg
        ? goal_progress.target_weight_kg - goal_progress.current_weight_kg
        : 0);
  const totalGap = Math.max(
    Math.abs(goal_progress.target_weight_kg - startWeight),
    1,
  );
  const currentProg = Math.abs(goal_progress.current_weight_kg - startWeight);
  const isExceeded = isMuscleGain
    ? goal_progress.current_weight_kg >= goal_progress.target_weight_kg
    : isFatLoss
      ? goal_progress.current_weight_kg <= goal_progress.target_weight_kg
      : goal_progress.weight_gap_kg === 0;
  const pct = isExceeded
    ? 100
    : Math.min(100, Math.round((currentProg / totalGap) * 100));
  const offset = circ - (pct / 100) * circ;

  const ringColor = isExceeded
    ? "var(--mint)"
    : goal_progress.progress_label === "健康"
      ? "var(--success)"
      : goal_progress.progress_label === "过慢"
        ? "var(--warning)"
        : goal_progress.progress_label === "超额"
          ? "var(--danger)"
          : "var(--text-muted)";

  // Weekly change rate
  const weeklyChange =
    goal_progress.actual_weekly_weight_change_kg != null
      ? goal_progress.actual_weekly_weight_change_kg
      : null;
  const requiredChange =
    goal_progress.required_weekly_weight_change_kg != null
      ? goal_progress.required_weekly_weight_change_kg
      : null;

  // Days elapsed / total
  const totalDays =
    goal_progress.days_remaining +
    (goalConfig
      ? Math.floor(
          (new Date(getTodayStr()).getTime() -
            new Date(goalConfig.start_date).getTime()) /
            86400000,
        )
      : 0);
  const elapsedDays = totalDays - goal_progress.days_remaining;
  const timePct =
    totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : 0;

  const handleSaveGoal = async () => {
    if (!editForm) return;
    setSaving(true);
    try {
      await updateGoalConfig(editForm);
      setGoalConfig(editForm);
      setShowEdit(false);
      onRefresh();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="dashboard-content-title">目标与计划</h2>

      {/* ═══ Section 1: Goal Type + Key Numbers ═══ */}
      <div className="detail-section">
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "24px 28px",
            flexWrap: "wrap",
          }}
        >
          {/* Progress Ring */}
          <div
            style={{
              position: "relative",
              width: 120,
              height: 120,
              flexShrink: 0,
            }}
          >
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke="var(--bg-secondary)"
                strokeWidth="12"
              />
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={ringColor}
                strokeWidth="12"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
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
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                {pct}%
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                完成度
              </span>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "var(--accent)",
                }}
              >
                {getGoalLabel(goal_progress.goal_type)}
              </span>
              <span
                className={`goal-label-badge ${isExceeded ? "已完成" : goal_progress.progress_label}`}
                style={
                  isExceeded
                    ? { color: "var(--mint)", background: "var(--mint-light)" }
                    : undefined
                }
              >
                {isExceeded ? "已完成" : goal_progress.progress_label}
              </span>
              {goalConfig && (
                <button
                  onClick={() => {
                    setEditForm({ ...goalConfig });
                    setShowEdit(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 2,
                    marginLeft: "auto",
                  }}
                >
                  <Edit3 size={14} />
                </button>
              )}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.8,
              }}
            >
              <div>
                当前体重{" "}
                <strong style={{ color: "var(--accent)" }}>
                  {goal_progress.current_weight_kg} kg
                </strong>
                {" → "}
                目标 <strong>{goal_progress.target_weight_kg} kg</strong>
                {" · "}
                {isFatLoss
                  ? isExceeded
                    ? "已多减"
                    : "还需减"
                  : isMuscleGain
                    ? isExceeded
                      ? "已多增"
                      : "还需增"
                    : "差值"}{" "}
                <strong style={{ color: ringColor }}>
                  {isExceeded ? "+" : ""}
                  {Math.abs(goal_progress.weight_gap_kg).toFixed(1)} kg
                </strong>
              </div>
              {weeklyChange != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  每周变化{" "}
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        (isFatLoss && weeklyChange < 0) ||
                        (isMuscleGain && weeklyChange > 0)
                          ? "var(--mint)"
                          : "var(--warning)",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    {weeklyChange > 0 ? (
                      <TrendingUp size={14} />
                    ) : (
                      <TrendingDown size={14} />
                    )}
                    {weeklyChange > 0 ? "+" : ""}
                    {weeklyChange.toFixed(2)} kg/周
                  </span>
                  {requiredChange != null && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      (需 {requiredChange > 0 ? "+" : ""}
                      {requiredChange.toFixed(2)})
                    </span>
                  )}
                </div>
              )}
              {goal_progress.current_muscle_kg != null &&
                goal_progress.target_muscle_kg != null && (
                  <div>
                    当前肌肉{" "}
                    <strong style={{ color: "var(--accent)" }}>
                      {goal_progress.current_muscle_kg} kg
                    </strong>
                    {goal_progress.muscle_gap_kg != null && (
                      <>
                        {" → "}目标{" "}
                        <strong>{goal_progress.target_muscle_kg} kg</strong>
                        {" · "}差距{" "}
                        <strong
                          style={{
                            color:
                              goal_progress.muscle_gap_kg > 0
                                ? "var(--mint)"
                                : "var(--warning)",
                          }}
                        >
                          {goal_progress.muscle_gap_kg > 0 ? "+" : ""}
                          {goal_progress.muscle_gap_kg.toFixed(1)} kg
                        </strong>
                      </>
                    )}
                  </div>
                )}
            </div>

            {/* Timeline bar */}
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                <span>{goalConfig?.start_date ?? "起始"}</span>
                <span>{goalConfig?.target_date ?? "目标"}</span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "var(--bg-secondary)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, timePct)}%`,
                    background: ringColor,
                    borderRadius: 3,
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                {isExceeded ? (
                  <strong style={{ color: "var(--mint)" }}>目标已达成</strong>
                ) : (
                  <>
                    还剩{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {goal_progress.days_remaining}
                    </strong>{" "}
                    天
                  </>
                )}{" "}
                · 已过 {elapsedDays} 天
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Section 2: Detail Metrics ═══ */}
      <div className="detail-section">
        <div className="detail-metrics-grid">
          <div className="detail-metric-card">
            <div className="detail-metric-label">起始体重</div>
            <div className="detail-metric-value" style={{ fontSize: 18 }}>
              {startWeight.toFixed(1)}
              <span className="detail-metric-unit">kg</span>
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">当前体重</div>
            <div
              className="detail-metric-value"
              style={{ color: "var(--accent)" }}
            >
              {goal_progress.current_weight_kg}
              <span className="detail-metric-unit">kg</span>
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">目标体重</div>
            <div className="detail-metric-value">
              {goal_progress.target_weight_kg}
              <span className="detail-metric-unit">kg</span>
            </div>
          </div>
          {goal_progress.current_muscle_kg != null && (
            <div className="detail-metric-card">
              <div className="detail-metric-label">当前肌肉量</div>
              <div
                className="detail-metric-value"
                style={{ color: "var(--accent)" }}
              >
                {goal_progress.current_muscle_kg}
                <span className="detail-metric-unit">kg</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section 3: Summary ═══ */}
      <div className="detail-section">
        <div className="detail-section-title">进度分析</div>
        <div
          className="card"
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.8,
          }}
        >
          <div>{goal_progress.summary}</div>
        </div>
      </div>

      {/* ═══ Section 4: Diet & Training Strategy ═══ */}
      <div className="detail-section">
        <div className="detail-section-title">
          {goal_progress.goal_type === "muscle_gain"
            ? "增肌饮食策略"
            : goal_progress.goal_type === "fat_loss"
              ? "减脂饮食策略"
              : "维持期策略"}
        </div>
        <div
          className="card"
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.8,
          }}
        >
          <div>
            <strong>每日热量</strong>：
            {goal_progress.goal_type === "muscle_gain"
              ? "2600-2800 kcal（热量盈余 ~300 kcal）"
              : goal_progress.goal_type === "fat_loss"
                ? "2000-2200 kcal（热量缺口 ~400 kcal）"
                : "2400 kcal（维持）"}
          </div>
          <div>
            <strong>蛋白质</strong>：1.6-2.0g/kg 体重（约{" "}
            {Math.round((body_metrics.body_weight_kg ?? 70) * 1.8)}g/天）
          </div>
          <div>
            <strong>碳水</strong>：
            {goal_progress.goal_type === "muscle_gain"
              ? "训练日 300-400g，休息日 200g"
              : "训练日 200-250g，休息日 150g"}
          </div>
          <div>
            <strong>脂肪</strong>：60-80g，优先不饱和脂肪酸
          </div>
          <div>
            <strong>水分</strong>：每日 3L+（训练日额外 0.5-1L）
          </div>
        </div>
      </div>

      {/* ═══ Section 5: Goal Config Edit Modal ═══ */}
      {showEdit && editForm && (
        <div className="detail-section">
          <div
            className="card"
            style={{ borderLeft: "3px solid var(--accent)" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <span className="detail-section-title" style={{ margin: 0 }}>
                编辑目标
              </span>
              <button
                onClick={() => setShowEdit(false)}
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
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  目标类型
                </label>
                <select
                  value={editForm.goal_type}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      goal_type: e.target.value as GoalConfig["goal_type"],
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
                >
                  <option value="muscle_gain">增肌</option>
                  <option value="fat_loss">减脂</option>
                  <option value="maintenance">维持</option>
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  起始日期
                </label>
                <input
                  type="date"
                  value={editForm.start_date}
                  onChange={(e) =>
                    setEditForm({ ...editForm, start_date: e.target.value })
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
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  目标日期
                </label>
                <input
                  type="date"
                  value={editForm.target_date}
                  onChange={(e) =>
                    setEditForm({ ...editForm, target_date: e.target.value })
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
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  起始体重 (kg)
                </label>
                <input
                  type="number"
                  step={0.1}
                  value={editForm.start_weight_kg}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      start_weight_kg: parseFloat(e.target.value) || 0,
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
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  目标体重 (kg)
                </label>
                <input
                  type="number"
                  step={0.1}
                  value={editForm.target_weight_kg}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      target_weight_kg: parseFloat(e.target.value) || 0,
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
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  起始肌肉量 (kg, 可选)
                </label>
                <input
                  type="number"
                  step={0.1}
                  value={editForm.start_muscle_kg ?? ""}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      start_muscle_kg:
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value),
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
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  目标肌肉量 (kg, 可选)
                </label>
                <input
                  type="number"
                  step={0.1}
                  value={editForm.target_muscle_kg ?? ""}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      target_muscle_kg:
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value),
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
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                className="btn-approve"
                onClick={handleSaveGoal}
                disabled={saving}
                style={{ flex: 1, fontSize: 14, padding: "10px 0" }}
              >
                <Check size={14} style={{ marginRight: 4 }} />
                {saving ? "保存中..." : "保存目标"}
              </button>
              <button
                onClick={() => setShowEdit(false)}
                style={{
                  padding: "10px 24px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 14,
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
