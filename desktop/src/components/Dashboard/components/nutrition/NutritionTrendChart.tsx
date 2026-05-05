import { useState } from "react";
import type { NutritionLogEntry } from "../../../../api/client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Metric = "calories" | "protein" | "carbs" | "fat";

interface Props {
  history: NutritionLogEntry[];
  viewDays: 7 | 14 | 30;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}

const METRICS: { key: Metric; label: string }[] = [
  { key: "calories", label: "热量" },
  { key: "protein", label: "蛋白质" },
  { key: "carbs", label: "碳水" },
  { key: "fat", label: "脂肪" },
];

const METRIC_COLORS: Record<Metric, string> = {
  calories: "var(--accent)",
  protein: "var(--accent)",
  carbs: "var(--mint)",
  fat: "var(--warning)",
};

const TARGET_MAP: Record<
  Metric,
  "targetCalories" | "targetProtein" | "targetCarbs" | "targetFat"
> = {
  calories: "targetCalories",
  protein: "targetProtein",
  carbs: "targetCarbs",
  fat: "targetFat",
};

const METRIC_UNITS: Record<Metric, string> = {
  calories: " kcal",
  protein: " g",
  carbs: " g",
  fat: " g",
};

export function NutritionTrendChart({
  history,
  viewDays,
  targetCalories,
  targetProtein,
  targetCarbs,
  targetFat,
}: Props) {
  const [metric, setMetric] = useState<Metric>("calories");
  const target = {
    targetCalories,
    targetProtein,
    targetCarbs,
    targetFat,
  }[TARGET_MAP[metric]] as number;

  const chartData = history
    .slice(-viewDays)
    .reverse()
    .map((d) => ({
      date: d.log_date.slice(5),
      calories: d.calories_kcal,
      protein: d.protein_g,
      carbs: d.carbs_g,
      fat: d.fat_g,
    }));

  const unit = METRIC_UNITS[metric];
  const color = METRIC_COLORS[metric];
  const xInterval = viewDays === 30 ? 4 : viewDays === 14 ? 2 : 1;

  return (
    <div>
      <div className="trend-chart-header" style={{ marginTop: 0 }}>
        <div className="detail-section-title" style={{ margin: 0 }}>
          趋势图表
        </div>
        <div className="segmented-control">
          {METRICS.map((m) => (
            <button
              key={m.key}
              className={`segmented-control-item${metric === m.key ? " active" : ""}`}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="trend-chart-wrapper">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart
            data={chartData}
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
              interval={xInterval}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-light)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value) => [
                `${Number(value)}${unit}`,
                metric === "calories" ? "热量" : metric,
              ]}
            />
            <ReferenceLine
              y={target}
              stroke={color}
              strokeDasharray="6 4"
              strokeOpacity={0.5}
              label={
                viewDays > 14
                  ? {
                      value: `目标 ${target}${unit.trim()}`,
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: color,
                    }
                  : undefined
              }
            />
            {metric === "calories" ? (
              <Bar
                dataKey="calories"
                fill={color}
                radius={[4, 4, 0, 0]}
                opacity={0.8}
                name="热量"
                animationDuration={800}
                animationEasing="ease-out"
              />
            ) : (
              <Line
                type="monotone"
                dataKey={metric}
                stroke={color}
                strokeWidth={2}
                dot={false}
                name={METRICS.find((m) => m.key === metric)?.label ?? metric}
                animationDuration={800}
                animationEasing="ease-out"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
