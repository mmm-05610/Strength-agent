import { useEffect, useRef, useState } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AnimatedNumber } from "../../shared/AnimatedNumber";
import type { BodyMetricHistory } from "../../../../api/client";

/* ── Trend helpers ── */

interface MetricOption {
  key: keyof BodyMetricHistory;
  label: string;
  unit: string;
  color: string;
  decimals: number;
}

const METRIC_OPTIONS: MetricOption[] = [
  {
    key: "body_weight_kg",
    label: "体重",
    unit: "kg",
    color: "var(--color-brand)",
    decimals: 1,
  },
  {
    key: "body_fat_rate_pct",
    label: "体脂率",
    unit: "%",
    color: "var(--color-warning)",
    decimals: 1,
  },
  {
    key: "skeletal_muscle_kg",
    label: "骨骼肌",
    unit: "kg",
    color: "var(--color-mint)",
    decimals: 2,
  },
  {
    key: "muscle_weight_kg",
    label: "肌肉量",
    unit: "kg",
    color: "var(--color-success)",
    decimals: 1,
  },
  {
    key: "body_fat_kg",
    label: "体脂肪",
    unit: "kg",
    color: "#F0A050",
    decimals: 1,
  },
];

const DAY_OPTIONS = [7, 14, 30, 90] as const;

type TrendDays = (typeof DAY_OPTIONS)[number];

interface TrendStats {
  avg: number | null;
  min: number | null;
  max: number | null;
  delta: number | null;
  deltaPct: number | null;
}

function computeStats(
  trendData: { value: number }[],
  decimals: number,
): TrendStats {
  if (trendData.length < 2)
    return { avg: null, min: null, max: null, delta: null, deltaPct: null };
  const vals = trendData.map((d) => d.value);
  const avg = +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(
    decimals,
  );
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const first = vals[0];
  const last = vals[vals.length - 1];
  const delta = +(last - first).toFixed(decimals);
  const deltaPct = first !== 0 ? +((delta / first) * 100).toFixed(1) : null;
  return { avg, min, max, delta, deltaPct };
}

function deltaColor(delta: number, isFatMetric: boolean): string {
  if (delta === 0) return "var(--color-text-muted)";
  const up = delta > 0;
  if (isFatMetric) return up ? "var(--color-danger)" : "var(--color-mint)";
  return up ? "var(--color-mint)" : "var(--color-danger)";
}

/* ── Props ── */

interface Props {
  history: BodyMetricHistory[];
  targetWeightKg: number | null;
  targetMuscleKg: number | null;
}

/* ── Component ── */

export function BodyTrendChart({
  history,
  targetWeightKg,
  targetMuscleKg,
}: Props) {
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const [activeMetric, setActiveMetric] = useState<MetricOption>(
    METRIC_OPTIONS[0],
  );
  const [trendDays, setTrendDays] = useState<TrendDays>(14);

  // Goal target based on active metric
  const goalTarget = (() => {
    switch (activeMetric.key) {
      case "body_weight_kg":
        return targetWeightKg;
      case "skeletal_muscle_kg":
      case "muscle_weight_kg":
        return targetMuscleKg;
      default:
        return null;
    }
  })();

  // Filter data by calendar days
  const trendCutoff = new Date();
  trendCutoff.setDate(trendCutoff.getDate() - trendDays);
  const trendCutoffStr = trendCutoff.toISOString().slice(0, 10);
  const rawTrendData = history
    .filter((d) => d.log_date >= trendCutoffStr)
    .map((d) => ({
      date: d.log_date.slice(5),
      value: (d[activeMetric.key] as number | null) ?? null,
    }))
    .filter((d) => d.value != null);

  const trendData = rawTrendData as { date: string; value: number }[];
  const trendStats = computeStats(trendData, activeMetric.decimals);
  const gradientId = `trendFill-${activeMetric.key}`;

  // Scroll chart to latest
  useEffect(() => {
    if (chartScrollRef.current) {
      chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
    }
  }, [trendData]);

  {
    /* ── Chart config ── */
  }
  const chartProps = {
    data: trendData,
    margin: { top: 12, right: 20, left: 20, bottom: 4 } as const,
  };

  const commonDefs = (
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={activeMetric.color} stopOpacity={0.24} />
        <stop offset="100%" stopColor={activeMetric.color} stopOpacity={0.02} />
      </linearGradient>
    </defs>
  );

  const commonGrid = (
    <CartesianGrid
      strokeDasharray="3 3"
      stroke="var(--color-border-light)"
      vertical={false}
    />
  );

  const commonXAxis = (
    <XAxis
      dataKey="date"
      tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
      axisLine={false}
      tickLine={false}
      interval={
        trendDays === 90
          ? "preserveStartEnd"
          : trendDays === 30
            ? 4
            : trendDays === 14
              ? 2
              : 1
      }
    />
  );

  const commonYAxis = <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />;

  const commonTooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-light)",
        borderRadius: 12,
        fontSize: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
      }}
      formatter={(v) => {
        const num = Number(v);
        const idx = trendData.findIndex((d) => d.value === num);
        const delta =
          idx > 0 && trendData[0].value != null
            ? num - trendData[0].value
            : null;
        return [
          `${num} ${activeMetric.unit}${delta != null ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(activeMetric.decimals)})` : ""}`,
          activeMetric.label,
        ];
      }}
      labelStyle={{
        color: "var(--color-text-muted)",
        marginBottom: 4,
      }}
    />
  );

  const commonArea = (
    <Area
      type="monotone"
      dataKey="value"
      stroke={activeMetric.color}
      strokeWidth={2.5}
      fill={`url(#${gradientId})`}
      dot={false}
      activeDot={{
        r: 5,
        fill: "#fff",
        stroke: activeMetric.color,
        strokeWidth: 2.5,
      }}
      animationDuration={800}
      animationEasing="ease-out"
    />
  );

  const goalLine =
    goalTarget != null ? (
      <ReferenceLine
        y={goalTarget}
        stroke={activeMetric.color}
        strokeDasharray="6 4"
        strokeOpacity={0.5}
        label={{
          value: `目标 ${goalTarget}`,
          position: "insideTopRight",
          fontSize: 10,
          fill: activeMetric.color,
        }}
      />
    ) : null;

  return (
    <div className="trend-chart-wrapper">
      {/* Header */}
      <div className="trend-chart-header">
        <h3 className="detail-section-title" style={{ margin: 0 }}>
          身体趋势
        </h3>
        <div className="segmented-control">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              className={`segmented-control-item${trendDays === d ? " active" : ""}`}
              onClick={() => setTrendDays(d)}
            >
              {d}天
            </button>
          ))}
        </div>
      </div>

      {/* Metric selector */}
      <div className="segmented-control" style={{ marginBottom: 16 }}>
        {METRIC_OPTIONS.map((m) => (
          <button
            key={m.key}
            className={`segmented-control-item${activeMetric.key === m.key ? " active" : ""}`}
            onClick={() => setActiveMetric(m)}
            style={
              activeMetric.key === m.key
                ? { background: m.color, borderColor: m.color }
                : undefined
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart card */}
      <div className="card" style={{ overflow: "hidden" }}>
        {trendData.length > 1 ? (
          <>
            {/* Latest value + delta */}
            <div className="trend-chart-current">
              <div
                className="trend-chart-current-value"
                style={{ color: activeMetric.color }}
              >
                <AnimatedNumber
                  value={trendData[trendData.length - 1].value}
                  decimals={activeMetric.decimals}
                />
                <span className="trend-chart-current-unit">
                  {activeMetric.unit}
                </span>
              </div>
              {trendStats.delta != null && (
                <span
                  className="trend-chart-current-delta"
                  style={{
                    color: deltaColor(
                      trendStats.delta,
                      activeMetric.key === "body_fat_kg" ||
                        activeMetric.key === "body_fat_rate_pct",
                    ),
                  }}
                >
                  {trendStats.delta > 0
                    ? "↑"
                    : trendStats.delta < 0
                      ? "↓"
                      : "→"}{" "}
                  <AnimatedNumber
                    value={Math.abs(trendStats.delta)}
                    decimals={activeMetric.decimals}
                  />
                  {activeMetric.unit}
                  {trendStats.deltaPct != null &&
                    ` (${trendStats.deltaPct > 0 ? "+" : ""}${trendStats.deltaPct}%)`}
                </span>
              )}
              <span className="trend-chart-period">{trendDays}天趋势</span>
            </div>

            {/* Chart */}
            {trendDays === 90 ? (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart {...chartProps}>
                  {commonDefs}
                  {commonGrid}
                  {commonXAxis}
                  {commonYAxis}
                  {commonTooltip}
                  {goalLine}
                  {commonArea}
                  <Brush
                    dataKey="date"
                    height={24}
                    stroke="var(--color-brand)"
                    fill="var(--color-bg-secondary)"
                    tickFormatter={() => ""}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div ref={chartScrollRef} className="trend-chart-scroll">
                <ComposedChart
                  width={Math.max(trendData.length * 64, 300)}
                  height={240}
                  data={trendData}
                  margin={{ top: 12, right: 20, left: 20, bottom: 4 }}
                >
                  {commonDefs}
                  {commonGrid}
                  {commonXAxis}
                  {commonYAxis}
                  {commonTooltip}
                  {goalLine}
                  {commonArea}
                </ComposedChart>
              </div>
            )}

            {/* Stats row */}
            <div className="trend-chart-stats-row">
              {[
                {
                  label: "平均",
                  value: trendStats.avg,
                  color: "var(--color-text-primary)",
                },
                {
                  label: "最低",
                  value: trendStats.min,
                  color: "var(--color-text-muted)",
                },
                {
                  label: "最高",
                  value: trendStats.max,
                  color: "var(--color-text-muted)",
                },
                {
                  label: "变化",
                  value:
                    trendStats.delta != null
                      ? Math.abs(trendStats.delta)
                      : null,
                  color: deltaColor(
                    trendStats.delta ?? 0,
                    activeMetric.key === "body_fat_kg" ||
                      activeMetric.key === "body_fat_rate_pct",
                  ),
                },
              ].map((stat) => (
                <div key={stat.label} className="trend-stat-item">
                  <div className="trend-stat-label">{stat.label}</div>
                  <div
                    className="trend-stat-value"
                    style={{ color: stat.color }}
                  >
                    {stat.value != null ? (
                      <>
                        <AnimatedNumber
                          value={stat.value}
                          decimals={activeMetric.decimals}
                        />
                        {activeMetric.unit}
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="trend-chart-empty">
            {history.length < 2
              ? "记录 2 次以上身体数据即可看到趋势图"
              : `${activeMetric.label}的历史数据不足，切换其他指标查看`}
          </div>
        )}
      </div>
    </div>
  );
}
