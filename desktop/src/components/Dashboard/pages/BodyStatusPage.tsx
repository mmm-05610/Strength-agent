import { useEffect, useRef, useState } from "react";
import type {
  DashboardData,
  BodyMetricCreate,
  BodyMetricHistory,
} from "../../../api/client";
import {
  createBodyMetric,
  fetchBodyMetrics,
  updateBodyMetric,
  deleteBodyMetric,
} from "../../../api/client";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { HistoryList, type HistoryItem } from "../shared/HistoryList";
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
import { AnimatedNumber } from "../shared/AnimatedNumber";

interface Props {
  data: DashboardData;
  onRefresh: () => void;
  expandFormTrigger?: number;
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

const SEGMENT_LABELS: Record<string, string> = {
  left_upper_muscle_kg: "左上肢",
  right_upper_muscle_kg: "右上肢",
  left_lower_muscle_kg: "左下肢",
  right_lower_muscle_kg: "右下肢",
  trunk_muscle_kg: "躯干",
};

const FAT_SEGMENT_LABELS: Record<string, string> = {
  left_upper_fat_kg: "左上肢",
  right_upper_fat_kg: "右上肢",
  left_lower_fat_kg: "左下肢",
  right_lower_fat_kg: "右下肢",
  trunk_fat_kg: "躯干",
};

const fmt = (v: number | null | undefined, unit = "") =>
  v != null ? `${v}${unit}` : "—";

const METRIC_OPTIONS: {
  key: keyof BodyMetricHistory;
  label: string;
  unit: string;
  color: string;
  decimals: number;
}[] = [
  {
    key: "body_weight_kg",
    label: "体重",
    unit: "kg",
    color: "var(--accent)",
    decimals: 1,
  },
  {
    key: "body_fat_rate_pct",
    label: "体脂率",
    unit: "%",
    color: "var(--warning)",
    decimals: 1,
  },
  {
    key: "skeletal_muscle_kg",
    label: "骨骼肌",
    unit: "kg",
    color: "var(--mint)",
    decimals: 2,
  },
  {
    key: "muscle_weight_kg",
    label: "肌肉量",
    unit: "kg",
    color: "var(--success)",
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

/* ── Reference range color ── */
function rangeStatus(
  value: number | null | undefined,
  low: number,
  high: number,
): string {
  if (value == null) return "var(--text-muted)";
  if (value >= low && value <= high) return "var(--mint)";
  if (value < low) return "var(--warning)";
  return "var(--danger)";
}

/* ── Standard Range Bar ── */
function RangeBar({
  value,
  min,
  max,
  low,
  high,
  unit = "",
  barColor = "var(--accent)",
}: {
  value: number | null;
  min: number;
  max: number;
  low: number;
  high: number;
  unit?: string;
  barColor?: string;
}) {
  if (value == null)
    return (
      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>无数据</span>
    );

  const range = max - min;
  const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const lowPct = ((low - min) / range) * 100;
  const highPct = ((high - min) / range) * 100;
  const inRange = value >= low && value <= high;

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 3,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: inRange ? "var(--mint)" : "var(--warning)",
          }}
        >
          {value}
          {unit}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {low}
          {unit} – {high}
          {unit}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 8,
          borderRadius: 4,
          background: "var(--bg-secondary)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${lowPct}%`,
            width: `${highPct - lowPct}%`,
            height: "100%",
            background: "var(--mint-light)",
            borderRadius: 4,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: -3,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: barColor,
            border: "2px solid #fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            transition: "left 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

/* ── InBody Score Ring ── */
function ScoreRing({
  score,
  size = 100,
}: {
  score: number | null;
  size?: number;
}) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;
  const offset = circ - (pct / 100) * circ;

  const color =
    score != null
      ? score >= 80
        ? "var(--mint)"
        : score >= 70
          ? "var(--success)"
          : score >= 60
            ? "var(--warning)"
            : "var(--danger)"
      : "var(--text-muted)";

  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-secondary)"
          strokeWidth="8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: size * 0.24,
            fontWeight: 800,
            color: "var(--text-primary)",
          }}
        >
          {score != null ? score : "--"}
        </span>
        <span style={{ fontSize: size * 0.09, color: "var(--text-muted)" }}>
          InBody 得分
        </span>
      </div>
    </div>
  );
}

/* ── Metric card for grid ── */
function MetricCard({
  label,
  value,
  unit = "",
  referenceLabel,
  referenceLow,
  referenceHigh,
  color: explicitColor,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  referenceLabel?: string;
  referenceLow?: number;
  referenceHigh?: number;
  color?: string;
}) {
  const color =
    explicitColor ??
    (referenceLow != null && referenceHigh != null
      ? rangeStatus(value, referenceLow, referenceHigh)
      : "var(--text-primary)");

  return (
    <div className="detail-metric-card">
      <div className="detail-metric-label">{label}</div>
      <div className="detail-metric-value" style={{ color }}>
        {fmt(value)}
        {value != null && unit ? (
          <span className="detail-metric-unit">{unit}</span>
        ) : null}
      </div>
      {referenceLabel && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
          {referenceLabel}
        </div>
      )}
    </div>
  );
}

type FormState = BodyMetricCreate & { log_date: string };

export function BodyStatusPage({ data, onRefresh, expandFormTrigger }: Props) {
  const { weight_trend, body_metrics: bm, goal_progress } = data;
  const latestWeight =
    bm.body_weight_kg ??
    (weight_trend.length > 0
      ? weight_trend[weight_trend.length - 1].body_weight_kg
      : null);

  const [showForm, setShowForm] = useState(false);
  const [showSegmentForm, setShowSegmentForm] = useState(false);

  useEffect(() => {
    if (expandFormTrigger && expandFormTrigger > 0) setShowForm(true);
  }, [expandFormTrigger]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [metricHistory, setMetricHistory] = useState<BodyMetricHistory[]>([]);
  const [trendDays, setTrendDays] = useState<7 | 14 | 30 | 90>(14);
  const [activeMetric, setActiveMetric] = useState<
    (typeof METRIC_OPTIONS)[number]
  >(METRIC_OPTIONS[0]);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormState>({
    log_date: getTodayStr(),
    body_weight_kg: latestWeight,
    body_fat_rate_pct: bm.body_fat_rate_pct,
    body_fat_kg: bm.body_fat_kg,
    muscle_weight_kg: bm.muscle_weight_kg,
    skeletal_muscle_kg: bm.skeletal_muscle_kg,
    body_water_kg: bm.body_water_kg,
    protein_kg: bm.protein_kg,
    minerals_kg: bm.minerals_kg,
    left_upper_muscle_kg: bm.left_upper_muscle_kg,
    right_upper_muscle_kg: bm.right_upper_muscle_kg,
    left_lower_muscle_kg: bm.left_lower_muscle_kg,
    right_lower_muscle_kg: bm.right_lower_muscle_kg,
    trunk_muscle_kg: bm.trunk_muscle_kg,
    left_upper_fat_kg: bm.left_upper_fat_kg,
    right_upper_fat_kg: bm.right_upper_fat_kg,
    left_lower_fat_kg: bm.left_lower_fat_kg,
    right_lower_fat_kg: bm.right_lower_fat_kg,
    trunk_fat_kg: bm.trunk_fat_kg,
    waist_cm: bm.waist_cm,
    hip_cm: bm.hip_cm,
    inbody_score: bm.inbody_score,
    bmr_kcal: bm.bmr_kcal,
    height_cm: bm.height_cm ?? null,
  });

  const setField = (key: keyof FormState, value: number | null) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingId) {
        await updateBodyMetric(editingId, form);
        setEditingId(null);
      } else {
        await createBodyMetric(form);
      }
      setShowForm(false);
      setShowSegmentForm(false);
      fetchBodyMetrics(90)
        .then(setMetricHistory)
        .catch(() => {});
      onRefresh();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (id: number) => {
    const item = metricHistory.find((m) => m.id === id);
    if (!item) return;
    setForm({
      log_date: item.log_date,
      body_weight_kg: item.body_weight_kg ?? undefined,
      body_fat_rate_pct: item.body_fat_rate_pct ?? undefined,
      body_fat_kg: item.body_fat_kg ?? undefined,
      muscle_weight_kg: item.muscle_weight_kg ?? undefined,
      skeletal_muscle_kg: item.skeletal_muscle_kg ?? undefined,
      body_water_kg: item.body_water_kg ?? undefined,
      protein_kg: item.protein_kg ?? undefined,
      minerals_kg: item.minerals_kg ?? undefined,
      left_upper_muscle_kg: item.left_upper_muscle_kg ?? undefined,
      right_upper_muscle_kg: item.right_upper_muscle_kg ?? undefined,
      left_lower_muscle_kg: item.left_lower_muscle_kg ?? undefined,
      right_lower_muscle_kg: item.right_lower_muscle_kg ?? undefined,
      trunk_muscle_kg: item.trunk_muscle_kg ?? undefined,
      left_upper_fat_kg: item.left_upper_fat_kg ?? undefined,
      right_upper_fat_kg: item.right_upper_fat_kg ?? undefined,
      left_lower_fat_kg: item.left_lower_fat_kg ?? undefined,
      right_lower_fat_kg: item.right_lower_fat_kg ?? undefined,
      trunk_fat_kg: item.trunk_fat_kg ?? undefined,
      waist_cm: item.waist_cm ?? undefined,
      hip_cm: item.hip_cm ?? undefined,
      inbody_score: item.inbody_score ?? undefined,
      bmr_kcal: item.bmr_kcal ?? undefined,
      height_cm: item.height_cm ?? undefined,
      source_asset_id: undefined,
    });
    setEditingId(id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定删除这条身体数据记录吗？")) return;
    setDeleting(id);
    try {
      await deleteBodyMetric(id);
      fetchBodyMetrics(90)
        .then(setMetricHistory)
        .catch(() => {});
      onRefresh();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const bodyMetricHistoryItems: HistoryItem[] = metricHistory
    .slice()
    .sort((a, b) => b.log_date.localeCompare(a.log_date))
    .map((m) => ({
      id: m.id,
      date: m.log_date,
      summary:
        [
          m.body_weight_kg && `${m.body_weight_kg}kg`,
          m.body_fat_rate_pct && `体脂${m.body_fat_rate_pct}%`,
          m.skeletal_muscle_kg && `骨骼肌${m.skeletal_muscle_kg}kg`,
        ]
          .filter(Boolean)
          .join(" · ") || "部分数据",
      details: [
        m.waist_cm && `腰围${m.waist_cm}cm`,
        m.inbody_score && `InBody ${m.inbody_score}分`,
        m.bmi && `BMI ${m.bmi}`,
      ]
        .filter(Boolean)
        .join(", "),
    }));

  useEffect(() => {
    fetchBodyMetrics(90)
      .then(setMetricHistory)
      .catch(() => setMetricHistory([]));
  }, []);

  // Multi-metric trend data — filter by calendar days
  const trendCutoff = new Date();
  trendCutoff.setDate(trendCutoff.getDate() - trendDays);
  const trendCutoffStr = trendCutoff.toISOString().slice(0, 10);
  const trendData = metricHistory
    .filter((d) => d.log_date >= trendCutoffStr)
    .map((d) => ({
      date: d.log_date.slice(5),
      value: (d[activeMetric.key] as number | null) ?? null,
    }))
    .filter((d) => d.value != null);

  const trendStats = (() => {
    const vals = trendData.map((d) => d.value!);
    if (vals.length < 2)
      return { avg: null, min: null, max: null, delta: null, deltaPct: null };
    const avg = +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(
      activeMetric.decimals,
    );
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const first = vals[0];
    const last = vals[vals.length - 1];
    const delta = +(last - first).toFixed(activeMetric.decimals);
    const deltaPct = first !== 0 ? +((delta / first) * 100).toFixed(1) : null;
    return { avg, min, max, delta, deltaPct };
  })();

  // Scroll chart to latest data
  useEffect(() => {
    if (chartScrollRef.current) {
      chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
    }
  }, [trendData]);

  // Derive gradient ID from active metric key
  const gradientId = `trendFill-${activeMetric.key}`;

  // Goal target reference line — only for metrics with a matching goal target
  const goalTarget = (() => {
    if (!goal_progress) return null;
    switch (activeMetric.key) {
      case "body_weight_kg":
        return goal_progress.target_weight_kg;
      case "skeletal_muscle_kg":
      case "muscle_weight_kg":
        return goal_progress.target_muscle_kg;
      default:
        return null;
    }
  })();

  // INbody-style body composition — prefer real data, fall back to estimates
  const compositionParts = () => {
    const parts: {
      label: string;
      value: number;
      color: string;
      pct: number;
    }[] = [];
    const weight = latestWeight ?? 0;
    if (weight <= 0) return { parts, isEstimated: false };

    const fatKg = bm.body_fat_kg ?? 0;
    const skMuscle = bm.skeletal_muscle_kg ?? 0;
    const hasRealComposition =
      bm.body_water_kg != null ||
      bm.protein_kg != null ||
      bm.minerals_kg != null;

    // Use real data when available, otherwise estimate from skeletal muscle
    const bodyWater = bm.body_water_kg ?? +(skMuscle * 0.75).toFixed(1);
    const protein = bm.protein_kg ?? +(skMuscle * 0.2).toFixed(1);
    const minerals = bm.minerals_kg ?? +(weight * 0.045).toFixed(1);
    const remainder = +(
      weight -
      fatKg -
      bodyWater -
      protein -
      minerals
    ).toFixed(1);

    if (bodyWater > 0) {
      parts.push({
        label: "体水分",
        value: bodyWater,
        color: "#5B9BD5",
        pct: +((bodyWater / weight) * 100).toFixed(1),
      });
    }
    if (protein > 0) {
      parts.push({
        label: "蛋白质",
        value: protein,
        color: "#7C6FF7",
        pct: +((protein / weight) * 100).toFixed(1),
      });
    }
    if (minerals > 0) {
      parts.push({
        label: "无机盐",
        value: minerals,
        color: "#A0A0C0",
        pct: +((minerals / weight) * 100).toFixed(1),
      });
    }
    if (fatKg > 0) {
      parts.push({
        label: "体脂肪",
        value: fatKg,
        color: "#F0A050",
        pct: +((fatKg / weight) * 100).toFixed(1),
      });
    }
    if (remainder > 0.1) {
      parts.push({
        label: "其他",
        value: remainder,
        color: "#D0D0D0",
        pct: +((remainder / weight) * 100).toFixed(1),
      });
    }
    return { parts, isEstimated: !hasRealComposition };
  };

  const compParts = compositionParts();
  const compData = compParts.parts;
  const hasSegmentMuscle =
    bm.left_upper_muscle_kg != null ||
    bm.right_upper_muscle_kg != null ||
    bm.left_lower_muscle_kg != null ||
    bm.right_lower_muscle_kg != null ||
    bm.trunk_muscle_kg != null;
  const hasSegmentFat =
    bm.left_upper_fat_kg != null ||
    bm.right_upper_fat_kg != null ||
    bm.left_lower_fat_kg != null ||
    bm.right_lower_fat_kg != null ||
    bm.trunk_fat_kg != null;

  return (
    <div>
      <h2 className="dashboard-content-title">身体状态</h2>

      {/* ═══ Section 1: Hero — InBody Score + Assessment ═══ */}
      <div className="detail-section">
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, #F8F7FC 0%, #F0EEF8 100%)",
            border: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            gap: 32,
            padding: "24px 28px",
          }}
        >
          <ScoreRing score={bm.inbody_score} size={120} />
          <div style={{ flex: 1 }}>
            {bm.body_assessment ? (
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--accent)",
                  marginBottom: 4,
                }}
              >
                {bm.body_assessment}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                尚未评估
              </div>
            )}
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
              }}
            >
              {bm.inbody_score != null && bm.inbody_score >= 80
                ? "身体成分非常优秀，继续保持当前训练和饮食计划！"
                : bm.inbody_score != null && bm.inbody_score >= 70
                  ? "身体成分良好，有优化空间，注意增肌减脂平衡。"
                  : bm.inbody_score != null && bm.inbody_score >= 60
                    ? "身体成分一般，建议加强训练并优化饮食结构。"
                    : bm.inbody_score != null
                      ? "身体成分需改善，AI Coach 可为你制定专属计划。"
                      : "开始记录身体数据，AI Coach 会帮你分析改善方向。"}
            </div>
            <div
              style={{
                display: "flex",
                gap: 24,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  体重
                </span>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {fmt(latestWeight, " kg")}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  骨骼肌
                </span>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "var(--accent)",
                  }}
                >
                  {fmt(bm.skeletal_muscle_kg, " kg")}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  体脂肪
                </span>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "var(--warning)",
                  }}
                >
                  {fmt(bm.body_fat_kg, " kg")}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  BMI
                </span>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: rangeStatus(bm.bmi, 18.5, 24),
                  }}
                >
                  {fmt(bm.bmi)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  体脂率
                </span>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: rangeStatus(bm.body_fat_rate_pct, 10, 20),
                  }}
                >
                  {fmt(bm.body_fat_rate_pct, "%")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Section 2: Body Composition Analysis (INbody-style) ═══ */}
      <div className="detail-section">
        <div className="detail-section-title">身体成分分析</div>
        <div className="card">
          {compData.length > 0 ? (
            <>
              {/* Stacked bar */}
              <div
                style={{
                  display: "flex",
                  height: 28,
                  borderRadius: 14,
                  overflow: "hidden",
                  marginBottom: 16,
                }}
              >
                {compData.map((p) => (
                  <div
                    key={p.label}
                    style={{
                      width: `${Math.max(p.pct, 2)}%`,
                      background: p.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#fff",
                      transition: "width 0.5s ease",
                    }}
                    title={`${p.label}: ${p.value}kg (${p.pct}%)`}
                  >
                    {p.pct > 10 ? `${p.pct}%` : ""}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div
                style={{
                  display: "flex",
                  gap: 20,
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                {compData.map((p) => (
                  <div
                    key={p.label}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: p.color,
                      }}
                    />
                    <span
                      style={{ fontSize: 12, color: "var(--text-secondary)" }}
                    >
                      {p.label}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {p.value}kg
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      ({p.pct}%)
                    </span>
                  </div>
                ))}
              </div>
              {/* Note */}
              {compParts.isEstimated && compData.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  * 体水分、蛋白质、无机盐为基于骨骼肌和体重的估算值
                </div>
              )}
              {bm.body_fat_kg == null && bm.skeletal_muscle_kg == null && (
                <div
                  style={{
                    marginTop: 12,
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  * 身体成分估算需要骨骼肌和体脂肪数据，请通过 InBody
                  测量或手动录入
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: 32,
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              暂无身体成分数据，请录入体重、骨骼肌、体脂肪等指标
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section 3: Muscle-Fat Balance ═══ */}
      <div className="detail-section">
        <div className="detail-section-title">肌肉-脂肪均衡</div>
        <div className="card">
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                骨骼肌 (kg)
              </div>
              <RangeBar
                value={bm.skeletal_muscle_kg}
                min={20}
                max={50}
                low={28}
                high={38}
                unit=" kg"
                barColor="var(--accent)"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                肌肉重量 (kg)
              </div>
              {bm.muscle_weight_kg != null ? (
                <div>
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: "var(--accent)",
                    }}
                  >
                    {bm.muscle_weight_kg} kg
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: 30,
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    无数据 — 可通过 InBody 测量获取
                  </span>
                </div>
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                体脂肪 (kg)
              </div>
              <RangeBar
                value={bm.body_fat_kg}
                min={0}
                max={40}
                low={8}
                high={18}
                unit=" kg"
                barColor="var(--warning)"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                体脂率 (%)
              </div>
              <RangeBar
                value={bm.body_fat_rate_pct}
                min={5}
                max={40}
                low={10}
                high={20}
                unit="%"
                barColor="var(--warning)"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                BMI (kg/m²)
              </div>
              <RangeBar
                value={bm.bmi}
                min={15}
                max={35}
                low={18.5}
                high={24}
                unit=""
                barColor="var(--success)"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                腰臀比 WHR
              </div>
              {bm.whr != null ? (
                <div>
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: rangeStatus(bm.whr, 0.75, 0.9),
                    }}
                  >
                    {bm.whr}
                  </span>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    标准 0.75–0.90
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  录入腰围和臀围后自动计算
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Section 4: Body Measurements ═══ */}
      <div className="detail-section">
        <div className="detail-section-title">身体测量数据</div>
        <div className="detail-metrics-grid">
          <MetricCard label="身高" value={bm.height_cm} unit=" cm" />
          <MetricCard label="体重" value={latestWeight} unit=" kg" />
          <MetricCard
            label="腰围"
            value={bm.waist_cm}
            unit=" cm"
            referenceLow={70}
            referenceHigh={90}
            referenceLabel="建议 70–90 cm"
          />
          <MetricCard label="臀围" value={bm.hip_cm} unit=" cm" />
          <MetricCard
            label="腰臀比"
            value={bm.whr}
            referenceLow={0.75}
            referenceHigh={0.9}
            referenceLabel="标准 0.75–0.90"
          />
          <MetricCard
            label="SMI 骨骼肌指数"
            value={bm.smi}
            unit=" kg/m²"
            referenceLabel="标准 ≥7.0"
          />
          <MetricCard
            label="基础代谢率"
            value={bm.bmr_kcal}
            unit=" kcal"
            referenceLabel="每日静息消耗"
          />
          <MetricCard
            label="InBody 得分"
            value={bm.inbody_score}
            unit=" /100"
            referenceLow={70}
            referenceHigh={100}
            referenceLabel="良好 ≥70"
          />
        </div>
      </div>

      {/* ═══ Section 5: Segmental Analysis ═══ */}
      <div className="detail-section">
        <div className="detail-section-title">节段分析</div>

        {/* Segmental Muscle */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 16,
            }}
          >
            节段肌肉均衡 (kg)
          </div>
          {hasSegmentMuscle ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 16,
                height: 140,
                padding: "8px 0",
              }}
            >
              {Object.entries(SEGMENT_LABELS).map(([key, label]) => {
                const val = (bm as Record<string, unknown>)[key] as
                  | number
                  | null;
                const maxVal = Math.max(
                  ...(Object.keys(SEGMENT_LABELS).map(
                    (k) => (bm as Record<string, unknown>)[k] as number,
                  ) as number[]),
                  1,
                );
                const barPct = val ? (val / maxVal) * 100 : 0;
                const barColor =
                  barPct > 80
                    ? "var(--accent)"
                    : barPct > 50
                      ? "var(--success)"
                      : "var(--warning)";
                return (
                  <div
                    key={key}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color:
                          val != null
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                      }}
                    >
                      {fmt(val)}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        height: 100,
                        background: "var(--bg-secondary)",
                        borderRadius: 8,
                        overflow: "hidden",
                        position: "relative",
                      }}
                    >
                      {val != null && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: 0,
                            width: "100%",
                            height: `${barPct}%`,
                            background: barColor,
                            borderRadius: "8px 8px 0 0",
                            opacity: 0.75,
                            transition: "height 0.5s ease",
                          }}
                        />
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: 24,
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              暂无节段肌肉数据，可通过 InBody 测量获取四肢和躯干的肌肉分布
            </div>
          )}
        </div>

        {/* Segmental Fat */}
        <div className="card">
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 16,
            }}
          >
            节段脂肪分布 (kg)
          </div>
          {hasSegmentFat ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 16,
                height: 140,
                padding: "8px 0",
              }}
            >
              {Object.entries(FAT_SEGMENT_LABELS).map(([key, label]) => {
                const val = (bm as Record<string, unknown>)[key] as
                  | number
                  | null;
                const maxVal = Math.max(
                  ...(Object.keys(FAT_SEGMENT_LABELS).map(
                    (k) => (bm as Record<string, unknown>)[k] as number,
                  ) as number[]),
                  1,
                );
                const barPct = val ? (val / maxVal) * 100 : 0;
                return (
                  <div
                    key={key}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color:
                          val != null
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                      }}
                    >
                      {fmt(val)}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        height: 100,
                        background: "var(--bg-secondary)",
                        borderRadius: 8,
                        overflow: "hidden",
                        position: "relative",
                      }}
                    >
                      {val != null && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: 0,
                            width: "100%",
                            height: `${barPct}%`,
                            background: "var(--warning)",
                            borderRadius: "8px 8px 0 0",
                            opacity: 0.7,
                            transition: "height 0.5s ease",
                          }}
                        />
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: 24,
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              暂无节段脂肪数据，可通过 InBody 测量获取四肢和躯干的脂肪分布
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section 6: Body Trend — Multi-Metric ═══ */}
      <div className="detail-section">
        <div className="trend-chart-wrapper">
          <div className="trend-chart-header">
            <div className="detail-section-title" style={{ margin: 0 }}>
              身体趋势
            </div>
            <div className="segmented-control">
              {([7, 14, 30, 90] as const).map((d) => (
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

          <div className="card" style={{ overflow: "hidden" }}>
            {trendData.length > 1 ? (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "14px 20px 0",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "baseline", gap: 10 }}
                  >
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: activeMetric.color,
                      }}
                    >
                      <AnimatedNumber
                        value={trendData[trendData.length - 1].value}
                        decimals={activeMetric.decimals}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text-muted)",
                          marginLeft: 3,
                        }}
                      >
                        {activeMetric.unit}
                      </span>
                    </span>
                    {trendStats.delta != null && (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: (() => {
                            if (trendStats.delta === 0)
                              return "var(--text-muted)";
                            const isFat =
                              activeMetric.key === "body_fat_kg" ||
                              activeMetric.key === "body_fat_rate_pct";
                            const up = trendStats.delta > 0;
                            return isFat
                              ? up
                                ? "var(--danger)"
                                : "var(--mint)"
                              : up
                                ? "var(--mint)"
                                : "var(--danger)";
                          })(),
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
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {trendDays}天趋势
                  </span>
                </div>

                {trendDays === 90 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart
                      data={trendData}
                      margin={{ top: 12, right: 20, left: 20, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border-light)"
                        vertical={false}
                      />
                      <defs>
                        <linearGradient
                          id={gradientId}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor={activeMetric.color}
                            stopOpacity={0.24}
                          />
                          <stop
                            offset="100%"
                            stopColor={activeMetric.color}
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-light)",
                          borderRadius: 12,
                          fontSize: 12,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                        }}
                        formatter={(v, _name, _props) => {
                          const idx = trendData.findIndex((d) => d.value === v);
                          const delta =
                            idx > 0 && trendData[0].value != null
                              ? (v as number) - trendData[0].value!
                              : null;
                          return [
                            `${v} ${activeMetric.unit}${delta != null ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(activeMetric.decimals)})` : ""}`,
                            activeMetric.label,
                          ];
                        }}
                        labelStyle={{
                          color: "var(--text-muted)",
                          marginBottom: 4,
                        }}
                      />
                      {goalTarget != null && (
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
                      )}
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
                      <Brush
                        dataKey="date"
                        height={24}
                        stroke="var(--accent)"
                        fill="var(--bg-secondary)"
                        tickFormatter={() => ""}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div
                    ref={chartScrollRef}
                    style={{
                      overflowX: "auto",
                      overflowY: "hidden",
                      paddingBottom: 8,
                    }}
                  >
                    <ComposedChart
                      width={Math.max(trendData.length * 64, 300)}
                      height={240}
                      data={trendData}
                      margin={{ top: 12, right: 20, left: 20, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border-light)"
                        vertical={false}
                      />
                      <defs>
                        <linearGradient
                          id={gradientId}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor={activeMetric.color}
                            stopOpacity={0.24}
                          />
                          <stop
                            offset="100%"
                            stopColor={activeMetric.color}
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                        axisLine={false}
                        tickLine={false}
                        interval={
                          trendDays === 30 ? 4 : trendDays === 14 ? 2 : 1
                        }
                      />
                      <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-light)",
                          borderRadius: 12,
                          fontSize: 12,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                        }}
                        formatter={(v, _name, _props) => {
                          const idx = trendData.findIndex((d) => d.value === v);
                          const delta =
                            idx > 0 && trendData[0].value != null
                              ? (v as number) - trendData[0].value!
                              : null;
                          return [
                            `${v} ${activeMetric.unit}${delta != null ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(activeMetric.decimals)})` : ""}`,
                            activeMetric.label,
                          ];
                        }}
                        labelStyle={{
                          color: "var(--text-muted)",
                          marginBottom: 4,
                        }}
                      />
                      {goalTarget != null && (
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
                      )}
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
                    </ComposedChart>
                  </div>
                )}

                <div className="trend-chart-stats-row">
                  {[
                    {
                      label: "平均",
                      value: trendStats.avg,
                      color: "var(--text-primary)",
                    },
                    {
                      label: "最低",
                      value: trendStats.min,
                      color: "var(--text-muted)",
                    },
                    {
                      label: "最高",
                      value: trendStats.max,
                      color: "var(--text-muted)",
                    },
                    {
                      label: "变化",
                      value:
                        trendStats.delta != null
                          ? Math.abs(trendStats.delta)
                          : null,
                      color: (() => {
                        if (trendStats.delta == null || trendStats.delta === 0)
                          return "var(--text-muted)";
                        const isFat =
                          activeMetric.key === "body_fat_kg" ||
                          activeMetric.key === "body_fat_rate_pct";
                        const up = trendStats.delta > 0;
                        return isFat
                          ? up
                            ? "var(--danger)"
                            : "var(--mint)"
                          : up
                            ? "var(--mint)"
                            : "var(--danger)";
                      })(),
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
              <div
                style={{
                  textAlign: "center",
                  padding: 48,
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                {metricHistory.length < 2
                  ? "记录 2 次以上身体数据即可看到趋势图"
                  : `${activeMetric.label}的历史数据不足，切换其他指标查看`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Section 7: Quick-Log Form ═══ */}
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
                记录身体数据
              </span>
              <button
                onClick={() => {
                  setShowForm(false);
                  setShowSegmentForm(false);
                }}
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

            {/* Core fields */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: showSegmentForm ? 16 : 0,
              }}
            >
              {[
                { key: "height_cm", label: "身高 (cm)", step: 0.1 },
                { key: "body_weight_kg", label: "体重 (kg)", step: 0.1 },
                { key: "skeletal_muscle_kg", label: "骨骼肌 (kg)", step: 0.1 },
                { key: "muscle_weight_kg", label: "肌肉重量 (kg)", step: 0.1 },
                { key: "body_water_kg", label: "体水分 (kg)", step: 0.1 },
                { key: "protein_kg", label: "蛋白质 (kg)", step: 0.1 },
                { key: "minerals_kg", label: "无机盐 (kg)", step: 0.1 },
                { key: "body_fat_kg", label: "体脂肪 (kg)", step: 0.1 },
                { key: "body_fat_rate_pct", label: "体脂率 (%)", step: 0.1 },
                { key: "inbody_score", label: "InBody得分 (0-100)", step: 1 },
                { key: "bmr_kcal", label: "基础代谢率 (kcal)", step: 10 },
                { key: "waist_cm", label: "腰围 (cm)", step: 0.1 },
                { key: "hip_cm", label: "臀围 (cm)", step: 0.1 },
              ].map((f) => (
                <div key={f.key}>
                  <label
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    {f.label}
                  </label>
                  <input
                    type="number"
                    step={f.step}
                    value={
                      ((form as unknown as Record<string, unknown>)[
                        f.key
                      ] as number) ?? ""
                    }
                    onChange={(e) =>
                      setField(
                        f.key as keyof FormState,
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value),
                      )
                    }
                    style={{
                      width: "100%",
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
              ))}
            </div>

            {/* Segmental toggle */}
            <button
              onClick={() => setShowSegmentForm(!showSegmentForm)}
              style={{
                width: "100%",
                padding: "8px",
                border: "none",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginTop: 12,
                marginBottom: showSegmentForm ? 16 : 0,
              }}
            >
              {showSegmentForm ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              节段分析 (InBody详情)
            </button>

            {showSegmentForm && (
              <>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                    marginTop: 8,
                  }}
                >
                  肌肉均衡 (kg)
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  {Object.entries(SEGMENT_LABELS).map(([key, label]) => (
                    <div key={key}>
                      <label
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          display: "block",
                          marginBottom: 2,
                        }}
                      >
                        {label}
                      </label>
                      <input
                        type="number"
                        step={0.01}
                        value={
                          ((form as unknown as Record<string, unknown>)[
                            key
                          ] as number) ?? ""
                        }
                        onChange={(e) =>
                          setField(
                            key as keyof FormState,
                            e.target.value === ""
                              ? null
                              : parseFloat(e.target.value),
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)",
                          fontSize: 13,
                          fontFamily: "inherit",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  节段脂肪 (kg)
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                  }}
                >
                  {Object.entries(FAT_SEGMENT_LABELS).map(([key, label]) => (
                    <div key={key}>
                      <label
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          display: "block",
                          marginBottom: 2,
                        }}
                      >
                        {label}
                      </label>
                      <input
                        type="number"
                        step={0.01}
                        value={
                          ((form as unknown as Record<string, unknown>)[
                            key
                          ] as number) ?? ""
                        }
                        onChange={(e) =>
                          setField(
                            key as keyof FormState,
                            e.target.value === ""
                              ? null
                              : parseFloat(e.target.value),
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)",
                          fontSize: 13,
                          fontFamily: "inherit",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              className="btn-approve"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                marginTop: 16,
                width: "100%",
                fontSize: 14,
                padding: "10px 0",
              }}
            >
              {submitting ? "保存中..." : "保存记录"}
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
            <Plus size={14} /> {editingId ? "保存修改" : "记录身体数据"}
          </button>
        )}
      </div>
      <HistoryList
        title="身体数据历史"
        items={bodyMetricHistoryItems}
        onEdit={handleEdit}
        onDelete={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
