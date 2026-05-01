import { useEffect, useState } from "react";
import type { DashboardData, NutritionLogEntry } from "../../../api/client";
import {
  createNutritionLog,
  fetchNutritionHistory,
  updateNutritionLog,
  deleteNutritionLog,
} from "../../../api/client";
import { Plus, X } from "lucide-react";
import { HistoryList, type HistoryItem } from "../shared/HistoryList";
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
import { AnimatedNumber } from "../shared/AnimatedNumber";

interface Props {
  data: DashboardData;
  onRefresh: () => void;
  expandFormTrigger?: number;
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ── Calorie Ring ── */
function CalorieRing({
  current,
  target,
  size = 140,
}: {
  current: number;
  target: number;
  size?: number;
}) {
  const r = size / 2 - 12;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, (current / target) * 100);
  const offset = circ - (pct / 100) * circ;
  const color = pct <= 100 ? "var(--mint)" : "var(--warning)";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-secondary)"
          strokeWidth="14"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
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
            fontSize: 28,
            fontWeight: 800,
            color: "var(--text-primary)",
            lineHeight: 1,
          }}
        >
          {current}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          / {target} kcal
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color,
            marginTop: 2,
          }}
        >
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}

/* ── Macro progress bar ── */
function MacroBar({
  label,
  current,
  target,
  unit,
  color,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
}) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {current}
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
            /{target}
            {unit}
          </span>
          <span style={{ marginLeft: 6, color, fontWeight: 700 }}>{pct}%</span>
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: "var(--bg-secondary)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 4,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

export function NutritionPage({ data, onRefresh, expandFormTrigger }: Props) {
  const { nutrition, goal_progress, body_metrics } = data;

  // Dynamic targets based on goal type
  const targetCals =
    goal_progress?.goal_type === "muscle_gain"
      ? 2800
      : goal_progress?.goal_type === "fat_loss"
        ? 2000
        : 2400;
  const targetProtein = Math.round((body_metrics.body_weight_kg ?? 70) * 2.0);
  const targetCarbs =
    goal_progress?.goal_type === "muscle_gain"
      ? 350
      : goal_progress?.goal_type === "fat_loss"
        ? 200
        : 280;
  const targetFat = goal_progress?.goal_type === "muscle_gain" ? 80 : 60;
  const targetWater = 3.0;

  const [history, setHistory] = useState<NutritionLogEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (expandFormTrigger && expandFormTrigger > 0) setShowForm(true);
  }, [expandFormTrigger]);
  const [viewDays, setViewDays] = useState<7 | 14 | 30>(7);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState({
    calories_kcal: nutrition.calories_kcal || 0,
    protein_g: nutrition.protein_g || 0,
    carbs_g: nutrition.carbs_g || 0,
    fat_g: nutrition.fat_g || 0,
    water_liters: nutrition.water_liters || 0,
    body_weight_kg: null as number | null,
  });

  useEffect(() => {
    fetchNutritionHistory(90)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingId) {
        await updateNutritionLog(editingId, form);
        setEditingId(null);
      } else {
        await createNutritionLog({
          log_date: getTodayStr(),
          ...form,
        });
      }
      setShowForm(false);
      fetchNutritionHistory(90)
        .then(setHistory)
        .catch(() => {});
      onRefresh();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (id: number) => {
    const item = history.find((h) => h.id === id);
    if (!item) return;
    setForm({
      calories_kcal: item.calories_kcal,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      water_liters: item.water_liters,
      body_weight_kg: item.body_weight_kg,
    });
    setEditingId(id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定删除这条饮食记录吗？")) return;
    setDeleting(id);
    try {
      await deleteNutritionLog(id);
      fetchNutritionHistory(90)
        .then(setHistory)
        .catch(() => {});
      onRefresh();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const nutritionHistoryItems: HistoryItem[] = history
    .slice()
    .sort((a, b) => b.log_date.localeCompare(a.log_date))
    .map((h) => ({
      id: h.id,
      date: h.log_date,
      summary: `${h.calories_kcal}kcal P:${h.protein_g}g`,
      details: `C:${h.carbs_g}g F:${h.fat_g}g H₂O:${h.water_liters}L${h.body_weight_kg ? ` 体重:${h.body_weight_kg}kg` : ""}`,
    }));

  // Chart data follows viewDays toggle, from 90-day history
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

  const statsData = chartData;

  const avgCals =
    statsData.length > 0
      ? Math.round(
          statsData.reduce((s, d) => s + d.calories, 0) / statsData.length,
        )
      : 0;
  const avgProtein =
    statsData.length > 0
      ? Math.round(
          statsData.reduce((s, d) => s + d.protein, 0) / statsData.length,
        )
      : 0;
  const daysOnTrack = statsData.filter(
    (d) => d.calories >= targetCals * 0.85 && d.calories <= targetCals * 1.15,
  ).length;

  const hasData = nutrition.log_date || history.length > 0;

  return (
    <div>
      <h2 className="dashboard-content-title">饮食摄入</h2>

      {!hasData && !showForm ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            暂无饮食数据，开始记录你的每日饮食吧。
          </div>
          <button className="btn-approve" onClick={() => setShowForm(true)}>
            <Plus size={14} style={{ marginRight: 4 }} />
            记录今日饮食
          </button>
        </div>
      ) : (
        <>
          {/* ═══ Section 1: Daily Summary — Calorie Ring + Macros ═══ */}
          <div className="detail-section">
            <div
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 32,
                padding: "24px 28px",
                flexWrap: "wrap",
              }}
            >
              <CalorieRing
                current={nutrition.log_date ? nutrition.calories_kcal : 0}
                target={targetCals}
                size={140}
              />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: 16,
                  }}
                >
                  {nutrition.log_date
                    ? `今日 ${nutrition.calories_kcal} kcal`
                    : "今日尚未记录"}
                </div>
                <MacroBar
                  label="蛋白质"
                  current={nutrition.log_date ? nutrition.protein_g : 0}
                  target={targetProtein}
                  unit="g"
                  color="var(--accent)"
                />
                <MacroBar
                  label="碳水"
                  current={nutrition.log_date ? nutrition.carbs_g : 0}
                  target={targetCarbs}
                  unit="g"
                  color="var(--mint)"
                />
                <MacroBar
                  label="脂肪"
                  current={nutrition.log_date ? nutrition.fat_g : 0}
                  target={targetFat}
                  unit="g"
                  color="var(--warning)"
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 8,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>
                    水分{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {nutrition.log_date ? `${nutrition.water_liters}L` : "—"}
                    </strong>
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}
                      / {targetWater}L
                    </span>
                  </span>
                  {nutrition.log_date && nutrition.body_weight_kg != null && (
                    <span>
                      体重{" "}
                      <strong style={{ color: "var(--text-primary)" }}>
                        {nutrition.body_weight_kg} kg
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ Unified Time Toggle + Trend Charts ═══ */}
          {history.length > 0 && (
            <>
              <div className="trend-chart-header" style={{ marginTop: 0 }}>
                <div className="detail-section-title" style={{ margin: 0 }}>
                  趋势图表
                </div>
                <div className="segmented-control">
                  {([7, 14, 30] as const).map((d) => (
                    <button
                      key={d}
                      className={`segmented-control-item${viewDays === d ? " active" : ""}`}
                      onClick={() => setViewDays(d)}
                    >
                      {d}天
                    </button>
                  ))}
                </div>
              </div>

              {/* Calorie Trend */}
              <div className="detail-section" style={{ marginTop: 0 }}>
                <div className="trend-chart-wrapper">
                  <div className="card" style={{ overflow: "hidden" }}>
                    <div
                      className="detail-section-title"
                      style={{ padding: "14px 20px 0", margin: 0 }}
                    >
                      热量趋势
                    </div>
                    {viewDays <= 14 ? (
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
                          />
                          <YAxis yAxisId="left" hide />
                          <YAxis yAxisId="right" hide orientation="right" />
                          <Tooltip
                            contentStyle={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-light)",
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                          />
                          <ReferenceLine
                            yAxisId="left"
                            y={targetCals}
                            stroke="var(--accent)"
                            strokeDasharray="6 4"
                            strokeOpacity={0.5}
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="calories"
                            fill="var(--accent)"
                            radius={[4, 4, 0, 0]}
                            opacity={0.8}
                            name="热量"
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="protein"
                            stroke="var(--mint)"
                            strokeWidth={2}
                            dot={false}
                            name="蛋白质"
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
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
                            interval={viewDays === 30 ? 4 : 2}
                          />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-light)",
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                            formatter={(v) => [`${v} kcal`, "热量"]}
                          />
                          <ReferenceLine
                            y={targetCals}
                            stroke="var(--accent)"
                            strokeDasharray="6 4"
                            strokeOpacity={0.5}
                            label={{
                              value: `目标 ${targetCals}`,
                              position: "insideTopRight",
                              fontSize: 10,
                              fill: "var(--accent)",
                            }}
                          />
                          <Bar
                            dataKey="calories"
                            fill="var(--accent)"
                            radius={[4, 4, 0, 0]}
                            opacity={0.8}
                            name="热量"
                            animationDuration={800}
                            animationEasing="ease-out"
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Macro Trend */}
              <div className="detail-section" style={{ marginTop: 0 }}>
                <div className="trend-chart-wrapper">
                  <div className="card" style={{ overflow: "hidden" }}>
                    <div
                      className="detail-section-title"
                      style={{ padding: "14px 20px 0", margin: 0 }}
                    >
                      宏量营养素趋势
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
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
                          interval={
                            viewDays === 30 ? 4 : viewDays === 14 ? 2 : 1
                          }
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-light)",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                        <ReferenceLine
                          y={targetProtein}
                          stroke="var(--accent)"
                          strokeDasharray="6 4"
                          strokeOpacity={0.4}
                          label={{
                            value: `蛋白 ${targetProtein}g`,
                            position: "insideTopRight",
                            fontSize: 9,
                            fill: "var(--accent)",
                          }}
                        />
                        <ReferenceLine
                          y={targetCarbs}
                          stroke="var(--mint)"
                          strokeDasharray="6 4"
                          strokeOpacity={0.4}
                          label={{
                            value: `碳水 ${targetCarbs}g`,
                            position: "insideTopRight",
                            fontSize: 9,
                            fill: "var(--mint)",
                          }}
                        />
                        <ReferenceLine
                          y={targetFat}
                          stroke="var(--warning)"
                          strokeDasharray="6 4"
                          strokeOpacity={0.4}
                          label={{
                            value: `脂肪 ${targetFat}g`,
                            position: "insideTopRight",
                            fontSize: 9,
                            fill: "var(--warning)",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="protein"
                          stroke="var(--accent)"
                          strokeWidth={2}
                          dot={false}
                          name="蛋白质"
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                        <Line
                          type="monotone"
                          dataKey="carbs"
                          stroke="var(--mint)"
                          strokeWidth={2}
                          dot={false}
                          name="碳水"
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                        <Line
                          type="monotone"
                          dataKey="fat"
                          stroke="var(--warning)"
                          strokeWidth={2}
                          dot={false}
                          name="脂肪"
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Period Summary Stats */}
              <div className="detail-section" style={{ marginTop: 0 }}>
                <div className="trend-chart-stats-row">
                  <div className="trend-stat-item">
                    <div className="trend-stat-label">{viewDays}天日均热量</div>
                    <div
                      className="trend-stat-value"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <AnimatedNumber
                        value={avgCals}
                        decimals={0}
                        suffix=" kcal"
                      />
                    </div>
                  </div>
                  <div className="trend-stat-item">
                    <div className="trend-stat-label">日均蛋白质</div>
                    <div
                      className="trend-stat-value"
                      style={{ color: "var(--accent)" }}
                    >
                      <AnimatedNumber
                        value={avgProtein}
                        decimals={0}
                        suffix=" g"
                      />
                    </div>
                  </div>
                  <div className="trend-stat-item">
                    <div className="trend-stat-label">达标天数 (±15%)</div>
                    <div
                      className="trend-stat-value"
                      style={{
                        color:
                          daysOnTrack >= viewDays * 0.7
                            ? "var(--mint)"
                            : "var(--warning)",
                      }}
                    >
                      {daysOnTrack}/{viewDays}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═══ Section 4: Diet Strategy (goal-based) ═══ */}
          {goal_progress && (
            <div className="detail-section">
              <div className="detail-section-title">
                {goal_progress.goal_type === "muscle_gain"
                  ? "增肌饮食策略"
                  : goal_progress.goal_type === "fat_loss"
                    ? "减脂饮食策略"
                    : "维持期饮食策略"}
              </div>
              <div
                className="card"
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.8,
                }}
              >
                <div>
                  <strong>每日热量</strong>：{targetCals} kcal
                  {goal_progress.goal_type === "muscle_gain" &&
                    "（热量盈余 ~300 kcal）"}
                  {goal_progress.goal_type === "fat_loss" &&
                    "（热量缺口 ~400 kcal）"}
                </div>
                <div>
                  <strong>蛋白质</strong>：{targetProtein}g（
                  {body_metrics.body_weight_kg != null
                    ? `${(targetProtein / body_metrics.body_weight_kg).toFixed(1)}g/kg`
                    : "2.0g/kg"}
                  ）
                </div>
                <div>
                  <strong>碳水</strong>：{targetCarbs}g（训练日可适量增加）
                </div>
                <div>
                  <strong>脂肪</strong>：{targetFat}g（优先不饱和脂肪酸）
                </div>
                <div>
                  <strong>水分</strong>：{targetWater}L（训练日额外补充 0.5-1L）
                </div>
              </div>
            </div>
          )}

          {/* ═══ Section 5: Quick-Log Form ═══ */}
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
                    记录今日饮食
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
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  {[
                    {
                      key: "calories_kcal",
                      label: "总热量 (kcal)",
                      step: 50,
                      min: 0,
                    },
                    { key: "protein_g", label: "蛋白质 (g)", step: 5, min: 0 },
                    { key: "carbs_g", label: "碳水 (g)", step: 10, min: 0 },
                    { key: "fat_g", label: "脂肪 (g)", step: 5, min: 0 },
                    {
                      key: "water_liters",
                      label: "水分 (L)",
                      step: 0.1,
                      min: 0,
                    },
                    {
                      key: "body_weight_kg" as const,
                      label: "今日体重 (kg, 可选)",
                      step: 0.1,
                      min: 0,
                    },
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
                        min={f.min}
                        placeholder={f.key === "body_weight_kg" ? "可选" : ""}
                        value={
                          f.key === "body_weight_kg"
                            ? (form.body_weight_kg ?? "")
                            : (form[f.key as keyof typeof form] as number)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            if (f.key === "body_weight_kg") {
                              setForm({ ...form, body_weight_kg: null });
                            } else {
                              setForm({ ...form, [f.key]: 0 });
                            }
                          } else {
                            setForm({ ...form, [f.key]: parseFloat(raw) || 0 });
                          }
                        }}
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
                <Plus size={14} />
                {editingId ? "保存修改" : "记录今日饮食"}
              </button>
            )}
          </div>
        </>
      )}
      <HistoryList
        title="饮食历史"
        items={nutritionHistoryItems}
        onEdit={handleEdit}
        onDelete={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
