import { useEffect, useState } from "react";
import type {
  DashboardData,
  WorkoutSession,
  ExerciseSet,
} from "../../../api/client";
import {
  fetchWorkouts,
  fetchPlanState,
  updateWorkout,
  deleteWorkout,
} from "../../../api/client";
import { useActions } from "../../../hooks/useActions";
import { useHistoryData } from "../../../hooks/useHistoryData";
import { getTodayStr } from "../shared/datetime";
import { HistoryList, type HistoryItem } from "../shared/HistoryList";
import { Plus, X } from "lucide-react";
import {
  TrainingCalendar,
  WeeklyVolumeChart,
  WorkoutDetail,
  TrainingSplitTable,
} from "../components/training";

interface Props {
  data: DashboardData;
  onRefresh: () => void;
  expandFormTrigger?: number;
}

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

export function TrainingPage({ data, onRefresh, expandFormTrigger }: Props) {
  const { dispatch } = useActions();
  const { today_training } = data;
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { data: workouts, refresh: refreshWorkouts } =
    useHistoryData<WorkoutSession>(fetchWorkouts, 90);
  const [trainingPlan, setTrainingPlan] = useState<Record<
    string,
    { focus: string; exercises: string[] }
  > | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (expandFormTrigger && expandFormTrigger > 0) setShowForm(true);
  }, [expandFormTrigger]);

  useEffect(() => {
    fetchPlanState()
      .then((ps) => {
        const dayMap: Record<string, string> = {
          mon: "周一",
          tue: "周二",
          wed: "周三",
          thu: "周四",
          fri: "周五",
          sat: "周六",
          sun: "周日",
        };
        const plan: Record<string, { focus: string; exercises: string[] }> = {};
        for (const [key, focus] of Object.entries(ps.weekly_plan)) {
          const label = dayMap[key] ?? key;
          const dayPlan = ps.cycle_day_plan.find(
            (dp) =>
              dayMap[`day${dp.day}`] === label ||
              dp.day === Object.keys(dayMap).indexOf(key) + 1,
          );
          plan[label] = {
            focus:
              focus === "upper"
                ? "上肢"
                : focus === "lower"
                  ? "下肢"
                  : focus === "full_body"
                    ? "全身"
                    : focus,
            exercises: dayPlan?.exercises ?? [],
          };
        }
        setTrainingPlan(plan);
      })
      .catch(() => {});
  }, []);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [formFocus, setFormFocus] = useState(
    today_training.focus_area || "upper",
  );
  const [formNotes, setFormNotes] = useState("");
  const [formExercises, setFormExercises] = useState<ExerciseSet[]>([
    { ...EMPTY_EXERCISE },
  ]);

  const workoutMap = new Map<string, WorkoutSession>();
  for (const w of workouts) {
    workoutMap.set(w.training_date, w);
  }

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
  const monthBest1RM = Math.max(
    0,
    ...monthWorkouts.flatMap((w) =>
      w.exercise_sets.map((e) => est1RM(e.weight_kg, e.reps)),
    ),
  );

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

  const handleMonthChange = (y: number, m: number) => {
    setViewYear(y);
    setViewMonth(m);
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
        await dispatch("workout.create", {
          training_date: getTodayStr(),
          ...payload,
        } as unknown as Record<string, unknown>);
      }
      setShowForm(false);
      setFormExercises([{ ...EMPTY_EXERCISE }]);
      setFormNotes("");
      refreshWorkouts();
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
      refreshWorkouts();
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

  const statusClass = today_training.completed
    ? "metric-status-done"
    : today_training.is_training_day
      ? "metric-status-pending"
      : "metric-status-rest";

  const consistencyClass =
    consistencyScore.pct >= 75
      ? "consistency-good"
      : consistencyScore.pct >= 50
        ? "consistency-mid"
        : "consistency-poor";

  return (
    <div>
      <h2 className="dashboard-content-title">训练执行</h2>

      {/* Metric Cards */}
      <div className="detail-section">
        <div className="detail-metrics-grid">
          <div className="detail-metric-card">
            <div className="detail-metric-label">今日状态</div>
            <div
              className={`detail-metric-value ${statusClass}`}
              style={{ fontSize: 18 }}
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
            <div className={`detail-metric-value ${consistencyClass}`}>
              {consistencyScore.days}/28
              <span className="detail-metric-unit">
                {" "}
                ({consistencyScore.pct}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar + Weekly Volume */}
      <TrainingCalendar
        workouts={workouts}
        year={viewYear}
        month={viewMonth}
        onMonthChange={handleMonthChange}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      <WeeklyVolumeChart workouts={workouts} />

      {/* Selected Workout Detail */}
      {selectedWorkout && <WorkoutDetail workout={selectedWorkout} />}

      {/* Training Split */}
      <TrainingSplitTable plan={trainingPlan} />

      {/* Recent Workouts */}
      {workouts.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">最近训练</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {workouts.slice(0, 5).map((w) => (
              <div
                key={w.id}
                className="card recent-workout-item"
                onClick={() => setSelectedDate(w.training_date)}
              >
                <div className="recent-workout-header">
                  <div>
                    <span className="recent-workout-date">
                      {w.training_date}
                    </span>
                    <span className="recent-workout-focus">
                      {FOCUS_OPTIONS.find((f) => f.value === w.focus_area)
                        ?.label ?? w.focus_area}
                    </span>
                  </div>
                  <span className="recent-workout-summary">
                    {w.exercise_sets.length} 动作 ·{" "}
                    {w.exercise_sets.reduce((s, e) => s + e.sets, 0)} 组 · 最高
                    1RM{" "}
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

      {/* Log Workout Form */}
      <div className="detail-section">
        {showForm ? (
          <div className="card">
            <div className="training-form-header">
              <span className="detail-section-title" style={{ margin: 0 }}>
                记录今日训练
              </span>
              <button
                className="training-form-close"
                onClick={() => setShowForm(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="training-form-fields-row">
              <select
                className="training-form-select"
                value={formFocus}
                onChange={(e) => setFormFocus(e.target.value)}
              >
                {FOCUS_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                className="training-form-notes-input"
                type="text"
                placeholder="备注 (可选)"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>

            {formExercises.map((ex, i) => (
              <div key={i} className="training-form-exercise-row">
                <input
                  className="training-form-exercise-name"
                  type="text"
                  placeholder="动作名称"
                  value={ex.exercise_name}
                  onChange={(e) => {
                    const next = [...formExercises];
                    next[i] = { ...next[i], exercise_name: e.target.value };
                    setFormExercises(next);
                  }}
                />
                <select
                  className="training-form-sm-select"
                  value={ex.equipment}
                  onChange={(e) => {
                    const next = [...formExercises];
                    next[i] = { ...next[i], equipment: e.target.value };
                    setFormExercises(next);
                  }}
                >
                  {EQUIPMENT_OPTIONS.map((eq) => (
                    <option key={eq} value={eq}>
                      {eq}
                    </option>
                  ))}
                </select>
                <input
                  className="training-form-weight-input"
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
                />
                <input
                  className="training-form-sm-input"
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
                />
                <input
                  className="training-form-sm-input"
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
                />
                <select
                  className="training-form-rpe-select"
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
                    className="training-form-remove-btn"
                    onClick={() =>
                      setFormExercises(formExercises.filter((_, j) => j !== i))
                    }
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}

            <button
              className="training-form-add-btn"
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
          <button className="show-form-btn" onClick={() => setShowForm(true)}>
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
