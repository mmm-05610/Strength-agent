import { useEffect, useState } from "react";
import type { DashboardData, GoalConfig } from "../../../api/client";
import { fetchGoalConfig } from "../../../api/client";
import { useActions } from "../../../hooks/useActions";
import { getTodayStr } from "../shared/datetime";
import { TrendingUp, TrendingDown, Edit3, Settings } from "lucide-react";
import { GoalProgressRing } from "../components/goals/GoalProgressRing";
import { GoalEditor } from "../components/goals/GoalEditor";

interface Props {
  data: DashboardData;
  onRefresh: () => void;
}

export function GoalsPage({ data, onRefresh }: Props) {
  const { dispatch } = useActions();
  const { goal_progress, body_metrics } = data;

  const [goalConfig, setGoalConfig] = useState<GoalConfig | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGoalConfig()
      .then(setGoalConfig)
      .catch(() => {});
  }, []);

  const getGoalLabel = (type: string) => {
    if (type === "muscle_gain") return "增肌";
    if (type === "fat_loss") return "减脂";
    if (type === "maintenance") return "维持";
    return type;
  };

  if (!goal_progress) {
    return (
      <div>
        <h2 className="dashboard-content-title">目标与计划</h2>
        <div className="page-empty-state">
          <div className="page-empty-state-desc">
            尚未设定目标，请在设置中配置阶段目标。
          </div>
          {goalConfig && (
            <button className="btn-approve" onClick={() => setShowEdit(true)}>
              <Settings size={14} style={{ marginRight: 4 }} />
              修改目标
            </button>
          )}
        </div>
      </div>
    );
  }

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

  const handleSaveGoal = async (updated: GoalConfig) => {
    setSaving(true);
    try {
      await dispatch(
        "goal.update",
        updated as unknown as Record<string, unknown>,
      );
      setGoalConfig(updated);
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

      {/* Section 1: Goal Type + Key Numbers */}
      <div className="detail-section">
        <div className="card goal-header-card">
          {/* Progress Ring */}
          <GoalProgressRing
            percentage={pct}
            current={goal_progress.current_weight_kg}
            target={goal_progress.target_weight_kg}
            unit="kg"
            color={ringColor}
          />

          <div className="goal-info">
            <div className="goal-type-row">
              <span className="goal-type-label">
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
                  className="goal-edit-btn"
                  onClick={() => setShowEdit(true)}
                >
                  <Edit3 size={14} />
                </button>
              )}
            </div>
            <div className="goal-info-meta">
              <div>
                当前体重{" "}
                <strong className="detail-metric-value-accent">
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
                <div className="goal-weekly-change">
                  每周变化{" "}
                  <span
                    className="weekly-change-value"
                    style={{
                      color:
                        (isFatLoss && weeklyChange < 0) ||
                        (isMuscleGain && weeklyChange > 0)
                          ? "var(--mint)"
                          : "var(--warning)",
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
                    <span className="goal-weekly-req">
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
                    <strong className="detail-metric-value-accent">
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
            <div className="goal-timeline">
              <div className="goal-timeline-labels">
                <span>{goalConfig?.start_date ?? "起始"}</span>
                <span>{goalConfig?.target_date ?? "目标"}</span>
              </div>
              <div className="goal-timeline-track">
                <div
                  className="goal-timeline-fill"
                  style={{
                    width: `${Math.min(100, timePct)}%`,
                    background: ringColor,
                  }}
                />
              </div>
              <div className="goal-timeline-info">
                {isExceeded ? (
                  <strong className="timeline-done-text">目标已达成</strong>
                ) : (
                  <>
                    还剩{" "}
                    <strong className="timeline-remaining-text">
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

      {/* Section 2: Detail Metrics */}
      <div className="detail-section">
        <div className="detail-metrics-grid">
          <div className="detail-metric-card">
            <div className="detail-metric-label">起始体重</div>
            <div className="detail-metric-value detail-metric-value-sm">
              {startWeight.toFixed(1)}
              <span className="detail-metric-unit">kg</span>
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">当前体重</div>
            <div className="detail-metric-value detail-metric-value-accent">
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
              <div className="detail-metric-value detail-metric-value-accent">
                {goal_progress.current_muscle_kg}
                <span className="detail-metric-unit">kg</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Summary */}
      <div className="detail-section">
        <div className="detail-section-title">进度分析</div>
        <div className="card goal-card-text">
          <div>{goal_progress.summary}</div>
        </div>
      </div>

      {/* Section 4: Diet & Training Strategy */}
      <div className="detail-section">
        <div className="detail-section-title">
          {goal_progress.goal_type === "muscle_gain"
            ? "增肌饮食策略"
            : goal_progress.goal_type === "fat_loss"
              ? "减脂饮食策略"
              : "维持期策略"}
        </div>
        <div className="card goal-card-text">
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

      {/* Section 5: Goal Config Edit Modal */}
      {showEdit && goalConfig && (
        <GoalEditor
          goal={goalConfig}
          onSave={handleSaveGoal}
          onCancel={() => setShowEdit(false)}
          saving={saving}
        />
      )}
    </div>
  );
}
