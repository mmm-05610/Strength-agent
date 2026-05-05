import { useEffect, useState, useMemo } from "react";
import type { DashboardData } from "../../api/client";
import {
  fetchNutritionHistory,
  fetchReadinessHistory,
  fetchWorkouts,
} from "../../api/client";
import type {
  NutritionLogEntry,
  ReadinessLogEntry,
  WorkoutSession,
} from "../../api/client";
import {
  Activity,
  UtensilsCrossed,
  Dumbbell,
  Heart,
  Target,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";

type TabId =
  | "overview"
  | "body"
  | "nutrition"
  | "training"
  | "recovery"
  | "goals";

interface Props {
  data: DashboardData;
  onNavigate: (tab: TabId, expandForm?: boolean) => void;
}

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "早上好";
  if (h >= 12 && h < 18) return "下午好";
  return "晚上好";
}

function computeReadiness(recovery: DashboardData["recovery"]): number {
  if (!recovery.log_date) return 0;
  const sleepNorm = Math.min(recovery.sleep_hours / 9, 1) * 100;
  const fatigueNorm = ((10 - recovery.fatigue_score) / 9) * 100;
  const painNorm = ((10 - recovery.pain_score) / 9) * 100;
  const stressNorm = ((10 - recovery.stress_score) / 9) * 100;
  return Math.round(
    sleepNorm * 0.4 + fatigueNorm * 0.25 + painNorm * 0.15 + stressNorm * 0.2,
  );
}

function readinessColor(score: number): string {
  if (score >= 70) return "var(--mint)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}

function readinessLabel(score: number): string {
  if (score >= 70) return "准备就绪";
  if (score >= 40) return "注意恢复";
  return "需要休息";
}

interface Insight {
  severity: "critical" | "warning" | "good";
  message: string;
}

function MiniSparkline({
  data,
  width = 100,
  height = 32,
  color = "var(--accent)",
}: {
  data: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const valid = data.filter((d): d is number => d !== null);
  if (valid.length < 2) {
    return (
      <svg width={width} height={height} className="mini-sparkline">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      </svg>
    );
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const padding = 4;
  const chartH = height - padding * 2;
  const stepX = (width - 4) / (valid.length - 1);

  const points = valid.map((v, i) => {
    const x = 2 + i * stepX;
    const y = padding + chartH - ((v - min) / range) * chartH;
    return `${i === 0 ? "M" : "L"} ${x},${y}`;
  });

  const areaPath = [
    points.join(" "),
    `L ${2 + (valid.length - 1) * stepX},${height - 2}`,
    `L 2,${height - 2}`,
    "Z",
  ].join(" ");

  return (
    <svg
      width={width}
      height={height}
      className="mini-sparkline"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={areaPath} fill={color} className="mini-sparkline-area" />
      <path d={points.join(" ")} stroke={color} />
    </svg>
  );
}

function TrainingMiniBars({ workouts }: { workouts: WorkoutSession[] }) {
  const today = new Date();
  const days: { date: string; active: boolean; focus?: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const w = workouts.find((w) => w.training_date === ds);
    days.push({
      date: ds,
      active: !!w,
      focus: w?.focus_area,
    });
  }

  return (
    <div
      className="training-mini-bars"
      title={days
        .map((d) => `${d.date}: ${d.active ? d.focus : "rest"}`)
        .join("\n")}
    >
      {days.map((d, i) => (
        <div
          key={i}
          className={`training-mini-bar ${d.active ? "active" : "inactive"}`}
          style={{ height: d.active ? 22 + Math.random() * 6 : 8 }}
        />
      ))}
    </div>
  );
}

const INSIGHT_ICONS: Record<Insight["severity"], typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: Info,
  good: CheckCircle2,
};

const INSIGHT_COLORS: Record<Insight["severity"], string> = {
  critical: "var(--danger)",
  warning: "var(--warning)",
  good: "var(--mint)",
};

export function DashboardOverview({ data, onNavigate }: Props) {
  const {
    body_metrics,
    nutrition,
    recovery,
    goal_progress,
    today_training,
    weight_trend,
  } = data;

  const [nutritionHistory, setNutritionHistory] = useState<NutritionLogEntry[]>(
    [],
  );
  const [readinessHistory, setReadinessHistory] = useState<ReadinessLogEntry[]>(
    [],
  );
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    fetchNutritionHistory(7)
      .then(setNutritionHistory)
      .catch(() => {});
    fetchReadinessHistory(7)
      .then(setReadinessHistory)
      .catch(() => {});
    fetchWorkouts(7)
      .then(setWorkoutHistory)
      .catch(() => {});
  }, []);

  const readiness = computeReadiness(recovery);
  const rColor = readinessColor(readiness);
  const rLabel = readinessLabel(readiness);

  // Mini trend data
  const weight7d = weight_trend.map((w) => w.body_weight_kg);
  const calories7d = nutritionHistory
    .slice()
    .reverse()
    .map((n) => n.calories_kcal);
  const sleep7d = readinessHistory
    .slice()
    .reverse()
    .map((r) => r.sleep_hours);

  // Weekly training days count
  const weekTrainingDays = workoutHistory.filter((w) => {
    const d = new Date(w.training_date);
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo;
  }).length;

  // Avg calories
  const avgCalories =
    calories7d.length > 0
      ? Math.round(calories7d.reduce((a, b) => a + b, 0) / calories7d.length)
      : null;

  // Insights
  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = [];
    if (recovery.log_date) {
      if (recovery.sleep_hours < 7) {
        list.push({
          severity: "warning",
          message: `睡眠仅 ${recovery.sleep_hours}h，建议今晚提前 30 分钟入睡`,
        });
      }
      if (recovery.fatigue_score >= 7) {
        list.push({
          severity: "warning",
          message: `疲劳度偏高 (${recovery.fatigue_score}/10)，考虑降低训练强度`,
        });
      }
      if (recovery.pain_score >= 6) {
        list.push({
          severity: "critical",
          message: `疼痛感较高 (${recovery.pain_score}/10)，建议关注恢复，必要时调整计划`,
        });
      }
      if (readiness >= 70) {
        list.push({
          severity: "good",
          message: `恢复准备度 ${readiness}%，身体状态良好，适合高强度训练`,
        });
      }
    }
    if (nutrition.log_date) {
      if (nutrition.protein_g < 120) {
        list.push({
          severity: "warning",
          message: `蛋白质摄入不足 (${nutrition.protein_g}g)，建议目标 >120g/天`,
        });
      }
      if (nutrition.water_liters < 2) {
        list.push({
          severity: "warning",
          message: `饮水量 ${nutrition.water_liters}L，建议每天 ≥2L`,
        });
      }
    }
    if (goal_progress) {
      if (goal_progress.progress_label === "健康") {
        list.push({
          severity: "good",
          message: `目标进度健康：${goal_progress.summary}`,
        });
      } else if (goal_progress.progress_label === "过慢") {
        list.push({
          severity: "warning",
          message: `体重变化偏慢，每周需 ${goal_progress.required_weekly_weight_change_kg?.toFixed(2) ?? "?"}kg`,
        });
      } else if (goal_progress.progress_label === "超额") {
        list.push({
          severity: "warning",
          message: `体重变化过快，注意控制节奏避免流失肌肉`,
        });
      }
    }
    list.sort((a, b) => {
      const order = { critical: 0, warning: 1, good: 2 };
      return order[a.severity] - order[b.severity];
    });
    return list.slice(0, 5);
  }, [recovery, nutrition, goal_progress, readiness]);

  // Goal progress percentage
  const goalProgressPct = useMemo(() => {
    if (!goal_progress) return 0;
    if (!goal_progress.days_remaining) return 100;
    if (goal_progress.target_date && goal_progress.start_date) {
      const totalDays =
        (new Date(goal_progress.target_date).getTime() -
          new Date(goal_progress.start_date).getTime()) /
        (1000 * 60 * 60 * 24);
      if (totalDays > 0) {
        return Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((totalDays - goal_progress.days_remaining) / totalDays) * 100,
            ),
          ),
        );
      }
    }
    return 50;
  }, [goal_progress]);

  const goalLabel =
    goal_progress?.goal_type === "muscle_gain"
      ? "增肌"
      : goal_progress?.goal_type === "fat_loss"
        ? "减脂"
        : "维持";

  return (
    <div>
      <h2 className="dashboard-content-title">概览</h2>

      {/* Hero Section */}
      <div className="overview-hero animate-fade-in-up">
        <div className="overview-hero-left">
          <div className="hero-greeting">
            {getTimeGreeting()}，今天感觉如何？
          </div>
          <div className="hero-readiness" style={{ color: rColor }}>
            {recovery.log_date ? `${readiness}%` : "--"}
          </div>
          <div className="hero-readiness-label">
            {recovery.log_date ? rLabel : "暂无恢复数据"}
          </div>
        </div>
        <div className="overview-hero-right">
          <div className="hero-mini-stat">
            <div className="hero-mini-stat-value">
              {body_metrics.body_weight_kg != null
                ? `${body_metrics.body_weight_kg}`
                : "--"}
            </div>
            <div className="hero-mini-stat-label">体重 kg</div>
          </div>
          <div className="hero-mini-stat">
            <div className="hero-mini-stat-value">
              {recovery.log_date ? `${recovery.sleep_hours}` : "--"}
            </div>
            <div className="hero-mini-stat-label">睡眠 h</div>
          </div>
          <div className="hero-mini-stat">
            <div className="hero-mini-stat-value">{weekTrainingDays}</div>
            <div className="hero-mini-stat-label">周训练天</div>
          </div>
          <div className="hero-mini-stat">
            <div className="hero-mini-stat-value">
              {avgCalories != null ? `${avgCalories}` : "--"}
            </div>
            <div className="hero-mini-stat-label">日均热量</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button
          className="quick-action-btn"
          onClick={() => onNavigate("nutrition", true)}
        >
          <UtensilsCrossed size={14} />
          记录饮食
        </button>
        <button
          className="quick-action-btn"
          onClick={() => onNavigate("training", true)}
        >
          <Dumbbell size={14} />
          记录训练
        </button>
        <button
          className="quick-action-btn"
          onClick={() => onNavigate("recovery", true)}
        >
          <Heart size={14} />
          记录恢复
        </button>
      </div>

      {/* 5 Cards with Mini Trends */}
      <div className="overview-grid">
        {/* Body */}
        <div
          className="overview-card animate-fade-in-up"
          style={{ animationDelay: "0s" }}
          onClick={() => onNavigate("body")}
        >
          <div className="overview-card-header">
            <div
              className="overview-card-icon"
              style={{ background: "var(--success-light)" }}
            >
              <Activity size={18} color="var(--success)" />
            </div>
            <span className="overview-card-link">详情 →</span>
          </div>
          <div className="overview-card-title">身体状态</div>
          <MiniSparkline data={weight7d} color="var(--success)" />
          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>
              最新{" "}
              {body_metrics.body_weight_kg != null
                ? `${body_metrics.body_weight_kg}kg`
                : "--"}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              体脂{" "}
              {body_metrics.body_fat_rate_pct != null
                ? `${body_metrics.body_fat_rate_pct}%`
                : "--"}
            </span>
          </div>
        </div>

        {/* Nutrition */}
        <div
          className="overview-card animate-fade-in-up"
          style={{ animationDelay: "0.05s" }}
          onClick={() => onNavigate("nutrition")}
        >
          <div className="overview-card-header">
            <div
              className="overview-card-icon"
              style={{ background: "var(--accent-light)" }}
            >
              <UtensilsCrossed size={18} color="var(--accent)" />
            </div>
            <span className="overview-card-link">详情 →</span>
          </div>
          <div className="overview-card-title">饮食摄入</div>
          <MiniSparkline data={calories7d} color="var(--accent)" />
          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>
              热量{" "}
              {nutrition.log_date ? `${nutrition.calories_kcal}kcal` : "--"}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              蛋白 {nutrition.log_date ? `${nutrition.protein_g}g` : "--"}
            </span>
          </div>
        </div>

        {/* Training */}
        <div
          className="overview-card animate-fade-in-up"
          style={{ animationDelay: "0.1s" }}
          onClick={() => onNavigate("training")}
        >
          <div className="overview-card-header">
            <div
              className="overview-card-icon"
              style={{ background: "var(--warning-light)" }}
            >
              <Dumbbell size={18} color="var(--warning)" />
            </div>
            <span className="overview-card-link">详情 →</span>
          </div>
          <div className="overview-card-title">训练执行</div>
          <TrainingMiniBars workouts={workoutHistory} />
          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>
              {today_training.completed
                ? "今日已完成"
                : today_training.is_training_day
                  ? "今日待训练"
                  : "今日休息"}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              {today_training.focus_area || "--"}
            </span>
          </div>
        </div>

        {/* Recovery */}
        <div
          className="overview-card animate-fade-in-up"
          style={{ animationDelay: "0.15s" }}
          onClick={() => onNavigate("recovery")}
        >
          <div className="overview-card-header">
            <div
              className="overview-card-icon"
              style={{ background: "var(--mint-light)" }}
            >
              <Heart size={18} color="var(--mint)" />
            </div>
            <span className="overview-card-link">详情 →</span>
          </div>
          <div className="overview-card-title">恢复与感受</div>
          <MiniSparkline data={sleep7d} color="var(--mint)" />
          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>
              睡眠 {recovery.log_date ? `${recovery.sleep_hours}h` : "--"}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              疲劳 {recovery.log_date ? `${recovery.fatigue_score}/10` : "--"}
            </span>
          </div>
        </div>

        {/* Goals */}
        <div
          className="overview-card animate-fade-in-up"
          style={{ animationDelay: "0.2s" }}
          onClick={() => onNavigate("goals")}
        >
          <div className="overview-card-header">
            <div
              className="overview-card-icon"
              style={{ background: "var(--danger-light)" }}
            >
              <Target size={18} color="var(--danger)" />
            </div>
            <span className="overview-card-link">详情 →</span>
          </div>
          <div className="overview-card-title">目标与计划</div>
          <div className="goal-progress-compact">
            <div className="goal-progress-track">
              <div
                className="goal-progress-fill"
                style={{ width: `${goalProgressPct}%` }}
              />
            </div>
            <div className="goal-progress-label">
              <span>
                {goalLabel} ·{" "}
                {goal_progress
                  ? `${goal_progress.current_weight_kg}→${goal_progress.target_weight_kg}kg`
                  : "--"}
              </span>
              <span>
                {goal_progress ? `剩余${goal_progress.days_remaining}天` : "--"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="insights-header">
            <span className="insights-title">AI Coach 今日洞察</span>
          </div>
          <div className="insights-list">
            {insights.map((item, i) => {
              const Icon = INSIGHT_ICONS[item.severity];
              return (
                <div
                  key={i}
                  className={`insight-item severity-${item.severity}`}
                >
                  <Icon
                    size={14}
                    className="insight-icon"
                    color={INSIGHT_COLORS[item.severity]}
                  />
                  <span className="insight-text">{item.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
