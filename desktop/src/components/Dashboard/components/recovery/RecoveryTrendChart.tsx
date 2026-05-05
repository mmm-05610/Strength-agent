import {
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReadinessLogEntry } from "../../../../api/client";

interface Props {
  history: ReadinessLogEntry[];
  viewDays: 7 | 14 | 30;
}

interface TrendPoint {
  date: string;
  sleep: number;
  fatigue: number;
  pain: number;
  stress: number;
}

export function RecoveryTrendChart({ history, viewDays }: Props) {
  const trendData: TrendPoint[] = history
    .slice(-viewDays)
    .reverse()
    .map((d) => ({
      date: d.log_date.slice(5),
      sleep: d.sleep_hours,
      fatigue: d.fatigue_score,
      pain: d.pain_score,
      stress: d.stress_score,
    }));

  const chartBody = (
    <>
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="var(--color-border-light)"
        vertical={false}
      />
      <XAxis
        dataKey="date"
        tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
        axisLine={false}
        tickLine={false}
        interval="preserveStartEnd"
        minTickGap={40}
      />
      <YAxis
        domain={[0, 10]}
        tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
        axisLine={false}
        tickLine={false}
        width={25}
      />
      <Tooltip
        contentStyle={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-light)",
          borderRadius: 12,
          fontSize: 12,
        }}
      />
      <ReferenceArea
        y1={7}
        y2={9}
        fill="var(--color-brand)"
        fillOpacity={0.06}
        label={{
          value: "理想睡眠 7-9h",
          position: "insideTopRight",
          fontSize: 9,
          fill: "var(--color-brand)",
        }}
      />
      <ReferenceArea
        y1={0}
        y2={4}
        fill="var(--color-mint)"
        fillOpacity={0.06}
        label={{
          value: "低疲劳",
          position: "insideBottomRight",
          fontSize: 9,
          fill: "var(--color-mint)",
        }}
      />
      <Line
        type="monotone"
        dataKey="sleep"
        stroke="var(--color-brand)"
        strokeWidth={2}
        dot={false}
        name="睡眠(h)"
        animationDuration={800}
        animationEasing="ease-out"
      />
      <Line
        type="monotone"
        dataKey="fatigue"
        stroke="var(--color-warning)"
        strokeWidth={2}
        dot={false}
        name="疲劳"
        animationDuration={800}
        animationEasing="ease-out"
      />
      <Line
        type="monotone"
        dataKey="pain"
        stroke="#B4A3E8"
        strokeWidth={2}
        dot={false}
        name="酸痛"
        animationDuration={800}
        animationEasing="ease-out"
      />
      <Line
        type="monotone"
        dataKey="stress"
        stroke="var(--color-danger)"
        strokeWidth={2}
        dot={false}
        name="压力"
        animationDuration={800}
        animationEasing="ease-out"
      />
    </>
  );

  const showBrush = viewDays === 30;

  return (
    <div className="trend-chart-wrapper">
      <div className="card" style={{ overflow: "hidden" }}>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart
            data={trendData}
            margin={
              showBrush
                ? { top: 8, right: 16, left: 0, bottom: 4 }
                : { top: 8, right: 16, left: 0, bottom: 0 }
            }
          >
            {chartBody}
            {showBrush && (
              <Brush
                dataKey="date"
                height={24}
                stroke="var(--color-brand)"
                fill="var(--color-bg-secondary)"
                tickFormatter={() => ""}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
