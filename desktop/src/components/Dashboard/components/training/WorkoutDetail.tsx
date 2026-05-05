import type { WorkoutSession } from "../../../../api/client";
import { Dumbbell } from "lucide-react";

interface Props {
  workout: WorkoutSession;
  onEdit?: () => void;
  onDelete?: () => void;
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

export function WorkoutDetail({ workout }: Props) {
  return (
    <div className="detail-section">
      <div className="card workout-detail-card">
        <div className="workout-detail-header">
          <div>
            <span className="workout-detail-title">
              {workout.training_date}
            </span>
            <span className="workout-detail-focus-badge">
              {FOCUS_OPTIONS.find((f) => f.value === workout.focus_area)
                ?.label ?? workout.focus_area}
            </span>
          </div>
          <span className="workout-detail-meta">
            {workout.exercise_sets.length} 个动作
            {" · "}
            {workout.exercise_sets.reduce((s, e) => s + e.sets, 0)} 组
          </span>
        </div>

        {workout.exercise_sets.map((ex, i) => (
          <div key={i} className="exercise-item">
            <div className="exercise-icon">
              <Dumbbell size={16} color="var(--accent)" />
            </div>
            <div className="exercise-info">
              <div className="exercise-name">{ex.exercise_name}</div>
              <div className="exercise-equipment">
                {ex.equipment}
                {ex.rpe != null && ` · RPE ${ex.rpe}`}
              </div>
            </div>
            <div className="exercise-stats">
              <div className="exercise-volume">
                {ex.sets}×{ex.reps} · {ex.weight_kg}kg
              </div>
              <div className="exercise-1rm">
                估 1RM {est1RM(ex.weight_kg, ex.reps)}kg
              </div>
            </div>
          </div>
        ))}

        {workout.notes && <div className="workout-notes">{workout.notes}</div>}
      </div>
    </div>
  );
}
