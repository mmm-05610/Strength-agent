import { useEffect, useState } from "react";
import type {
  DashboardData,
  WorkoutSession,
  ExerciseSet,
} from "../../../api/client";
import {
  fetchWorkouts,
  createWorkout,
  updateWorkout,
  deleteWorkout,
} from "../../../api/client";
import { HistoryList, type HistoryItem } from "../shared/HistoryList";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Flame,
  Dumbbell,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells: { day: number; month: "prev" | "current" | "next" }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, month: "prev" });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, month: "current" });
  }
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      cells.push({ day: i, month: "next" });
    }
  }
  return cells;
}

function formatDate(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

const FOCUS_TAG: Record<string, { label: string; color: string }> = {
  upper: { label: "上肢", color: "var(--accent)" },
  lower: { label: "下肢", color: "var(--mint)" },
  full_body: { label: "全身", color: "var(--lavender)" },
  push: { label: "推", color: "var(--warning)" },
  pull: { label: "拉", color: "var(--success)" },
  legs: { label: "腿", color: "var(--mint)" },
  rest: { label: "休", color: "var(--text-muted)" },
};

function est1RM(weight: number, reps: number) {
  if (reps <= 0) return 0;
  return Math.round(weight * (1 + reps / 30));
}

const FOCUS_OPTIONS = [
  { value: "upper", label: "上肢" },
  { value: "lower", label: "下肢" },
  { value: "full_body", label: "全身" },
  { value: "push", label: "推" },
  { value: "pull", label: "拉" },
  { value: "legs", label: "腿部" },
  { value: "rest", label: "休息" },
];

const EQUIPMENT_OPTIONS = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "smith",
];

const EMPTY_EXERCISE: ExerciseSet = {
  exercise_name: "",
  equipment: "barbell",
  sets: 3,
  reps: 8,
  weight_kg: 0,
  rpe: null,
};

function StreakCounter({ workouts }: { workouts: WorkoutSession[] }) {
  const sorted = [...workouts]
    .map((w) => w.training_date)
    .sort()
    .reverse();
  let streak = 0;
  const today = new Date();
  const check = new Date(today);

  for (let i = 0; i < 365; i++) {
    const ds = formatDate(
      check.getFullYear(),
      check.getMonth(),
      check.getDate(),
    );
    if (sorted.includes(ds)) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else {
      if (i === 0) {
        // Today might not be a training day, check if this week has training
        check.setDate(check.getDate() - 1);
        continue;
      }
      break;
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Flame
        size={16}
        color={streak > 0 ? "var(--warning)" : "var(--text-muted)"}
      />
      <span
        style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}
      >
        {streak > 0 ? `连续 ${streak} 周训练` : "本周尚未训练"}
      </span>
    </div>
  );
}

export function TrainingPage({ data, onRefresh, expandFormTrigger }: Props) {
  const { today_training } = data;
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (expandFormTrigger && expandFormTrigger > 0) setShowForm(true);
  }, [expandFormTrigger]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [formFocus, setFormFocus] = useState(
    today_training.focus_area || "upper",
  );
  const [formNotes, setFormNotes] = useState("");
  const [formExercises, setFormExercises] = useState<ExerciseSet[]>([
    { ...EMPTY_EXERCISE },
  ]);

  const loadWorkouts = () => {
    fetchWorkouts(90)
      .then(setWorkouts)
      .catch(() => setWorkouts([]));
  };

  useEffect(() => {
    loadWorkouts();
  }, []);

  const workoutMap = new Map<string, WorkoutSession>();
  for (const w of workouts) {
    workoutMap.set(w.training_date, w);
  }

  const todayStr = formatDate(now.getFullYear(), now.getMonth(), now.getDate());
  const cells = getMonthDays(viewYear, viewMonth);
  const selectedWorkout = selectedDate ? workoutMap.get(selectedDate) : null;

  // Month stats
  const monthWorkouts = workouts.filter((w) => {
    const d = new Date(w.training_date);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  });
  const monthCount = monthWorkouts.length;
  const monthTotalSets = monthWorkouts.reduce(
    (sum, w) => sum + w.exercise_sets.reduce((s, e) => s + e.sets, 0),
    0,
  );
  // Best estimated 1RM across all exercises this month
  const monthBest1RM = Math.max(
    0,
    ...monthWorkouts.flatMap((w) =>
      w.exercise_sets.map((e) => est1RM(e.weight_kg, e.reps)),
    ),
  );

  // Heatmap intensity: volume = sum(weight × reps × sets) per workout
  const volumeByDate = new Map<string, number>();
  for (const w of workouts) {
    const vol = w.exercise_sets.reduce(
      (s, e) => s + e.weight_kg * e.reps * e.sets,
      0,
    );
    volumeByDate.set(w.training_date, vol);
  }
  const volumes = [...volumeByDate.values()];
  const maxVol = volumes.length > 0 ? Math.max(...volumes) : 1;
  const getIntensity = (dateStr: string) => {
    const vol = volumeByDate.get(dateStr);
    if (vol == null || vol === 0) return 0;
    return Math.min(4, Math.ceil((vol / maxVol) * 4));
  };

  // Weekly volume for bar chart
  const weeklyVolume = (() => {
    const weeks: { label: string; volume: number; sets: number }[] = [];
    const now = new Date();
    for (let w = 3; w >= 0; w--) {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay() - w * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      let volume = 0;
      let sets = 0;
      for (const wo of workouts) {
        const d = new Date(wo.training_date);
        if (d >= start && d <= end) {
          volume += wo.exercise_sets.reduce(
            (s, e) => s + e.weight_kg * e.reps * e.sets,
            0,
          );
          sets += wo.exercise_sets.reduce((s, e) => s + e.sets, 0);
        }
      }
      const wkLabel = `W${w + 1}`;
      weeks.push({ label: wkLabel, volume: Math.round(volume), sets });
    }
    return weeks;
  })();

  // Consistency score: training days in last 4 weeks
  const consistencyScore = (() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 28);
    const recentDates = workouts
      .filter((w) => new Date(w.training_date) >= cutoff)
      .map((w) => w.training_date);
    const uniqueDays = new Set(recentDates).size;
    const pct = Math.round((uniqueDays / 28) * 100);
    return { days: uniqueDays, pct };
  })();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSubmit = async () => {
    const validExercises = formExercises.filter(
      (ex) => ex.exercise_name.trim() && ex.weight_kg >= 0,
    );
    if (validExercises.length === 0) return;

    setSubmitting(true);
    try {
      const payload = {
        focus_area: formFocus,
        notes: formNotes,
        exercise_sets: validExercises.map((ex) => ({
          ...ex,
          sets: ex.sets || 3,
          reps: ex.reps || 8,
        })),
      };
      if (editingId) {
        await updateWorkout(editingId, payload);
        setEditingId(null);
      } else {
        await createWorkout({
          training_date: getTodayStr(),
          ...payload,
        });
      }
      setShowForm(false);
      setFormExercises([{ ...EMPTY_EXERCISE }]);
      setFormNotes("");
      loadWorkouts();
      onRefresh();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (id: number) => {
    const item = workouts.find((w) => w.id === id);
    if (!item) return;
    setFormFocus(item.focus_area);
    setFormNotes(item.notes || "");
    setFormExercises(
      item.exercise_sets.length > 0
        ? item.exercise_sets.map((s) => ({ ...s }))
        : [{ ...EMPTY_EXERCISE }],
    );
    setEditingId(id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定删除这条训练记录吗？")) return;
    setDeleting(id);
    try {
      await deleteWorkout(id);
      loadWorkouts();
      onRefresh();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const workoutHistoryItems: HistoryItem[] = workouts
    .slice()
    .sort((a, b) => b.training_date.localeCompare(a.training_date))
    .map((w) => ({
      id: w.id,
      date: w.training_date,
      summary: `${w.focus_area} · ${w.exercise_sets.length}个动作`,
      details: w.exercise_sets
        .map((s) => `${s.exercise_name} ${s.sets}×${s.reps}@${s.weight_kg}kg`)
        .join(", "),
    }));

  return (
    <div>
      <h2 className="dashboard-content-title">训练执行</h2>

      {/* ═══ Section 1: Today Status + Month Stats ═══ */}
      <div className="detail-section">
        <div className="detail-metrics-grid">
          <div className="detail-metric-card">
            <div className="detail-metric-label">今日状态</div>
            <div
              className="detail-metric-value"
              style={{
                fontSize: 18,
                color: today_training.completed
                  ? "var(--mint)"
                  : today_training.is_training_day
                    ? "var(--warning)"
                    : "var(--text-secondary)",
              }}
            >
              {today_training.completed
                ? "已完成"
                : today_training.is_training_day
                  ? "待训练"
                  : "休息日"}
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">本月训练</div>
            <div className="detail-metric-value">
              {monthCount}
              <span className="detail-metric-unit">次</span>
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">本月总组数</div>
            <div className="detail-metric-value">
              {monthTotalSets}
              <span className="detail-metric-unit">组</span>
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">本月最佳 1RM</div>
            <div className="detail-metric-value" style={{ fontSize: 18 }}>
              {monthBest1RM > 0 ? `${monthBest1RM}kg` : "—"}
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">训练焦点</div>
            <div className="detail-metric-value">
              {today_training.focus_area
                ? (FOCUS_OPTIONS.find(
                    (f) => f.value === today_training.focus_area,
                  )?.label ?? today_training.focus_area)
                : "—"}
            </div>
          </div>
          <div className="detail-metric-card">
            <div className="detail-metric-label">4周一致性</div>
            <div
              className="detail-metric-value"
              style={{
                color:
                  consistencyScore.pct >= 75
                    ? "var(--mint)"
                    : consistencyScore.pct >= 50
                      ? "var(--warning)"
                      : "var(--danger)",
              }}
            >
              {consistencyScore.days}/28
              <span className="detail-metric-unit">
                {" "}
                ({consistencyScore.pct}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Section 2: Calendar ═══ */}
      <div className="detail-section">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="detail-section-title" style={{ margin: 0 }}>
              {viewYear}年{viewMonth + 1}月
            </span>
            <StreakCounter workouts={workouts} />
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button
              className="calendar-nav-btn"
              onClick={() => {
                const now = new Date();
                setViewYear(now.getFullYear());
                setViewMonth(now.getMonth());
              }}
              title="回到今天"
            >
              今天
            </button>
            <button className="calendar-nav-btn" onClick={prevMonth}>
              <ChevronLeft size={14} />
            </button>
            <button className="calendar-nav-btn" onClick={nextMonth}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="calendar-grid">
          {WEEKDAYS.map((d) => (
            <div key={d} className="calendar-day-header">
              {d}
            </div>
          ))}
          {cells.map((c, i) => {
            const yr =
              c.month === "prev"
                ? viewMonth === 0
                  ? viewYear - 1
                  : viewYear
                : c.month === "next"
                  ? viewMonth === 11
                    ? viewYear + 1
                    : viewYear
                  : viewYear;
            const mo =
              c.month === "prev"
                ? viewMonth === 0
                  ? 11
                  : viewMonth - 1
                : c.month === "next"
                  ? viewMonth === 11
                    ? 0
                    : viewMonth + 1
                  : viewMonth;
            const dateStr = formatDate(yr, mo, c.day);
            const workoutOnDay = workoutMap.get(dateStr);
            const hasWorkout = !!workoutOnDay;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const intensity = getIntensity(dateStr);
            const totalSets = workoutOnDay
              ? workoutOnDay.exercise_sets.reduce((s, e) => s + e.sets, 0)
              : 0;

            let cls = "calendar-day";
            if (c.month !== "current") cls += " other-month";
            if (isToday) cls += " today";
            if (isSelected) cls += " selected";
            if (hasWorkout) cls += ` intensity-${intensity}`;

            const tag = workoutOnDay
              ? FOCUS_TAG[workoutOnDay.focus_area]
              : null;

            return (
              <div
                key={i}
                className={cls}
                onClick={() => {
                  if (hasWorkout || c.month === "current") {
                    setSelectedDate(dateStr);
                  }
                }}
              >
                <span className="calendar-day-num">{c.day}</span>
                {hasWorkout && (
                  <div className="calendar-day-content">
                    <span className="calendar-day-sets">{totalSets}组</span>
                    {tag && (
                      <span
                        className="calendar-day-tag"
                        style={{ color: tag.color }}
                      >
                        {tag.label}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Weekly Volume Chart */}
        <div className="weekly-volume-chart" style={{ marginTop: 16 }}>
          <div className="detail-section-title" style={{ marginBottom: 8 }}>
            周训练容量
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart
              data={weeklyVolume}
              margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border-light)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(v, _name, _props) => [
                  `${((v as number) / 1000).toFixed(1)}k kg`,
                  "容量",
                ]}
                labelFormatter={(label) => {
                  const item = weeklyVolume.find((w) => w.label === label);
                  return item ? `${label} · ${item.sets}组` : label;
                }}
              />
              <Bar
                dataKey="volume"
                fill="var(--accent)"
                radius={[4, 4, 0, 0]}
                opacity={0.75}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══ Section 3: Selected Workout Detail ═══ */}
      {selectedWorkout && (
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
              <div>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {selectedWorkout.training_date}
                </span>
                <span
                  style={{
                    marginLeft: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--accent)",
                    background: "var(--accent-light)",
                    padding: "2px 10px",
                    borderRadius: 10,
                  }}
                >
                  {FOCUS_OPTIONS.find(
                    (f) => f.value === selectedWorkout.focus_area,
                  )?.label ?? selectedWorkout.focus_area}
                </span>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {selectedWorkout.exercise_sets.length} 个动作
                {" · "}{" "}
                {selectedWorkout.exercise_sets.reduce((s, e) => s + e.sets, 0)}{" "}
                组
              </span>
            </div>

            {selectedWorkout.exercise_sets.map((ex, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom:
                    i < selectedWorkout.exercise_sets.length - 1
                      ? "1px solid var(--border-light)"
                      : "none",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--accent-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Dumbbell size={16} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {ex.exercise_name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {ex.equipment}
                    {ex.rpe != null && ` · RPE ${ex.rpe}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {ex.sets}×{ex.reps} · {ex.weight_kg}kg
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    估 1RM {est1RM(ex.weight_kg, ex.reps)}kg
                  </div>
                </div>
              </div>
            ))}

            {selectedWorkout.notes && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border-light)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {selectedWorkout.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Section 4: Training Split ═══ */}
      <div className="detail-section">
        <div className="detail-section-title">训练分化计划</div>
        <div className="card">
          <table className="split-table">
            <thead>
              <tr>
                <th>星期</th>
                <th>训练部位</th>
                <th>类型</th>
              </tr>
            </thead>
            <tbody>
              {["周一", "周三", "周五"].map((day) => (
                <tr key={day}>
                  <td>{day}</td>
                  <td>{day === "周三" ? "下肢" : "上肢"}</td>
                  <td style={{ color: "var(--accent)", fontWeight: 500 }}>
                    力量训练
                  </td>
                </tr>
              ))}
              {["周二", "周四", "周六", "周日"].map((day) => (
                <tr key={day}>
                  <td>{day}</td>
                  <td>—</td>
                  <td style={{ color: "var(--mint)" }}>休息/有氧</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Section 5: Recent Workouts ═══ */}
      {workouts.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">最近训练</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {workouts.slice(0, 5).map((w) => (
              <div
                key={w.id}
                className="card"
                style={{
                  cursor: "pointer",
                  padding: "12px 16px",
                }}
                onClick={() => setSelectedDate(w.training_date)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {w.training_date}
                    </span>
                    <span
                      style={{
                        marginLeft: 10,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--accent)",
                      }}
                    >
                      {FOCUS_OPTIONS.find((f) => f.value === w.focus_area)
                        ?.label ?? w.focus_area}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {w.exercise_sets.length} 动作 ·{" "}
                    {w.exercise_sets.reduce((s, e) => s + e.sets, 0)} 组{" · "}
                    最高 1RM{" "}
                    {Math.max(
                      0,
                      ...w.exercise_sets.map((e) =>
                        est1RM(e.weight_kg, e.reps),
                      ),
                    )}
                    kg
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Section 6: Log Workout Form ═══ */}
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
                记录今日训练
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

            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <select
                value={formFocus}
                onChange={(e) => setFormFocus(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  fontSize: 14,
                  fontFamily: "inherit",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  flex: 1,
                }}
              >
                {FOCUS_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="备注 (可选)"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                style={{
                  flex: 2,
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

            {formExercises.map((ex, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 6,
                  marginBottom: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: 10,
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <input
                  type="text"
                  placeholder="动作名称"
                  value={ex.exercise_name}
                  onChange={(e) => {
                    const next = [...formExercises];
                    next[i] = { ...next[i], exercise_name: e.target.value };
                    setFormExercises(next);
                  }}
                  style={{
                    flex: 3,
                    minWidth: 120,
                    padding: "6px 8px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                    fontFamily: "inherit",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                <select
                  value={ex.equipment}
                  onChange={(e) => {
                    const next = [...formExercises];
                    next[i] = { ...next[i], equipment: e.target.value };
                    setFormExercises(next);
                  }}
                  style={{
                    width: 80,
                    padding: "6px 4px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    fontFamily: "inherit",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {EQUIPMENT_OPTIONS.map((eq) => (
                    <option key={eq} value={eq}>
                      {eq}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="重量"
                  value={ex.weight_kg || ""}
                  onChange={(e) => {
                    const next = [...formExercises];
                    next[i] = {
                      ...next[i],
                      weight_kg: parseFloat(e.target.value) || 0,
                    };
                    setFormExercises(next);
                  }}
                  style={{
                    width: 65,
                    padding: "6px 4px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                    fontFamily: "inherit",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                <input
                  type="number"
                  placeholder="组"
                  value={ex.sets || ""}
                  onChange={(e) => {
                    const next = [...formExercises];
                    next[i] = {
                      ...next[i],
                      sets: parseInt(e.target.value) || 0,
                    };
                    setFormExercises(next);
                  }}
                  style={{
                    width: 50,
                    padding: "6px 4px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                    fontFamily: "inherit",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                <input
                  type="number"
                  placeholder="次"
                  value={ex.reps || ""}
                  onChange={(e) => {
                    const next = [...formExercises];
                    next[i] = {
                      ...next[i],
                      reps: parseInt(e.target.value) || 0,
                    };
                    setFormExercises(next);
                  }}
                  style={{
                    width: 50,
                    padding: "6px 4px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                    fontFamily: "inherit",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                <select
                  value={ex.rpe ?? ""}
                  onChange={(e) => {
                    const next = [...formExercises];
                    next[i] = {
                      ...next[i],
                      rpe:
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value),
                    };
                    setFormExercises(next);
                  }}
                  style={{
                    width: 62,
                    padding: "6px 2px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    fontFamily: "inherit",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">RPE</option>
                  {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {formExercises.length > 1 && (
                  <button
                    onClick={() =>
                      setFormExercises(formExercises.filter((_, j) => j !== i))
                    }
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--danger)",
                      cursor: "pointer",
                      padding: 4,
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={() =>
                setFormExercises([
                  ...formExercises,
                  {
                    ...EMPTY_EXERCISE,
                    equipment:
                      formExercises[formExercises.length - 1]?.equipment ||
                      "barbell",
                  },
                ])
              }
              style={{
                width: "100%",
                padding: "8px",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                marginBottom: 16,
              }}
            >
              + 添加动作
            </button>

            <button
              className="btn-approve"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ width: "100%", fontSize: 14, padding: "10px 0" }}
            >
              {submitting ? "保存中..." : "保存训练记录"}
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
            {editingId ? "保存修改" : "记录今日训练"}
          </button>
        )}
      </div>
      <HistoryList
        title="训练历史"
        items={workoutHistoryItems}
        onEdit={handleEdit}
        onDelete={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
