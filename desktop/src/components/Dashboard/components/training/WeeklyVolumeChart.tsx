import type { WorkoutSession } from "../../../../api/client";
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
  workouts: WorkoutSession[];
}

export function WeeklyVolumeChart({ workouts }: Props) {
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
      weeks.push({
        label: `W${w + 1}`,
        volume: Math.round(volume),
        sets,
      });
    }
    return weeks;
  })();

  return (
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
  );
}
