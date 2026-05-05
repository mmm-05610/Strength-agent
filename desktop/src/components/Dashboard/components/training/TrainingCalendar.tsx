import type { WorkoutSession } from "../../../../api/client";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";

interface Props {
  workouts: WorkoutSession[];
  year: number;
  month: number;
  onMonthChange: (y: number, m: number) => void;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const FOCUS_TAG: Record<string, { label: string; color: string }> = {
  upper: { label: "上肢", color: "var(--accent)" },
  lower: { label: "下肢", color: "var(--mint)" },
  full_body: { label: "全身", color: "var(--lavender)" },
  push: { label: "推", color: "var(--warning)" },
  pull: { label: "拉", color: "var(--success)" },
  legs: { label: "腿", color: "var(--mint)" },
  rest: { label: "休", color: "var(--text-muted)" },
};

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
        check.setDate(check.getDate() - 1);
        continue;
      }
      break;
    }
  }

  return (
    <div className="streak-counter">
      <Flame
        size={16}
        color={streak > 0 ? "var(--warning)" : "var(--text-muted)"}
      />
      <span className="streak-counter-value">
        {streak > 0 ? `连续 ${streak} 周训练` : "本周尚未训练"}
      </span>
    </div>
  );
}

export function TrainingCalendar({
  workouts,
  year,
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
}: Props) {
  const todayStr = formatDate(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  );
  const cells = getMonthDays(year, month);

  const workoutMap = new Map<string, WorkoutSession>();
  for (const w of workouts) {
    workoutMap.set(w.training_date, w);
  }

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

  const goToday = () => {
    const now = new Date();
    onMonthChange(now.getFullYear(), now.getMonth());
  };

  const prevMonth = () => {
    if (month === 0) {
      onMonthChange(year - 1, 11);
    } else {
      onMonthChange(year, month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      onMonthChange(year + 1, 0);
    } else {
      onMonthChange(year, month + 1);
    }
  };

  return (
    <div className="detail-section">
      <div className="calendar-header">
        <div className="calendar-header-left">
          <span className="detail-section-title" style={{ margin: 0 }}>
            {year}年{month + 1}月
          </span>
          <StreakCounter workouts={workouts} />
        </div>
        <div className="calendar-header-nav">
          <button
            className="calendar-nav-btn"
            onClick={goToday}
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
              ? month === 0
                ? year - 1
                : year
              : c.month === "next"
                ? month === 11
                  ? year + 1
                  : year
                : year;
          const mo =
            c.month === "prev"
              ? month === 0
                ? 11
                : month - 1
              : c.month === "next"
                ? month === 11
                  ? 0
                  : month + 1
                : month;
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

          const tag = workoutOnDay ? FOCUS_TAG[workoutOnDay.focus_area] : null;

          return (
            <div
              key={i}
              className={cls}
              onClick={() => {
                if (hasWorkout || c.month === "current") {
                  onSelectDate(dateStr);
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
    </div>
  );
}
