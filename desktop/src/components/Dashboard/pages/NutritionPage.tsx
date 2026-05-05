import { useEffect, useState } from "react";
import type { DashboardData, NutritionLogEntry } from "../../../api/client";
import {
  fetchNutritionHistory,
  updateNutritionLog,
  deleteNutritionLog,
} from "../../../api/client";
import { useActions } from "../../../hooks/useActions";
import { useHistoryData } from "../../../hooks/useHistoryData";
import { getTodayStr } from "../shared/datetime";
import { Plus, X } from "lucide-react";
import { HistoryList, type HistoryItem } from "../shared/HistoryList";
import { AnimatedNumber } from "../shared/AnimatedNumber";
import { EmptyState } from "../components/shared/EmptyState";
import { CalorieRing } from "../components/nutrition/CalorieRing";
import { MacroBreakdown } from "../components/nutrition/MacroBreakdown";
import { NutritionTrendChart } from "../components/nutrition/NutritionTrendChart";

interface Props {
  data: DashboardData;
  onRefresh: () => void;
  expandFormTrigger?: number;
}

export function NutritionPage({ data, onRefresh, expandFormTrigger }: Props) {
  const { dispatch } = useActions();
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

  const { data: history, refresh: refreshHistory } =
    useHistoryData<NutritionLogEntry>(fetchNutritionHistory, 90);
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

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingId) {
        await updateNutritionLog(editingId, form);
        setEditingId(null);
      } else {
        await dispatch("nutrition.create", {
          log_date: getTodayStr(),
          ...form,
        } as unknown as Record<string, unknown>);
      }
      setShowForm(false);
      refreshHistory();
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
      body_weight_kg: null,
    });
    setEditingId(id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定删除这条饮食记录吗？")) return;
    setDeleting(id);
    try {
      await deleteNutritionLog(id);
      refreshHistory();
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
      details: `C:${h.carbs_g}g F:${h.fat_g}g H₂O:${h.water_liters}L`,
    }));

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

  const avgCals =
    chartData.length > 0
      ? Math.round(
          chartData.reduce((s, d) => s + d.calories, 0) / chartData.length,
        )
      : 0;
  const avgProtein =
    chartData.length > 0
      ? Math.round(
          chartData.reduce((s, d) => s + d.protein, 0) / chartData.length,
        )
      : 0;
  const daysOnTrack = chartData.filter(
    (d) => d.calories >= targetCals * 0.85 && d.calories <= targetCals * 1.15,
  ).length;

  const hasData = nutrition.log_date || history.length > 0;

  return (
    <div>
      <h2 className="dashboard-content-title">饮食摄入</h2>

      {!hasData && !showForm ? (
        <EmptyState
          title="暂无饮食数据"
          description="开始记录你的每日饮食吧。"
          action={{
            label: "记录今日饮食",
            onClick: () => setShowForm(true),
          }}
        />
      ) : (
        <>
          {/* Daily Summary — Calorie Ring + Macros */}
          <div className="detail-section">
            <div className="card nutrition-card-row">
              <CalorieRing
                current={nutrition.log_date ? nutrition.calories_kcal : 0}
                target={targetCals}
                size={140}
              />
              <MacroBreakdown
                proteinG={nutrition.protein_g}
                carbsG={nutrition.carbs_g}
                fatG={nutrition.fat_g}
                proteinGoal={targetProtein}
                carbsGoal={targetCarbs}
                fatGoal={targetFat}
                waterL={nutrition.water_liters}
                waterGoal={targetWater}
                bodyWeightKg={nutrition.body_weight_kg}
                dateLogged={!!nutrition.log_date}
              />
            </div>
          </div>

          {/* Trend Chart with Metric Switching */}
          {history.length > 0 && (
            <>
              <div className="detail-section" style={{ marginTop: 0 }}>
                <NutritionTrendChart
                  history={history}
                  viewDays={viewDays}
                  targetCalories={targetCals}
                  targetProtein={targetProtein}
                  targetCarbs={targetCarbs}
                  targetFat={targetFat}
                />
              </div>

              {/* Time Toggle + Period Summary Stats */}
              <div className="detail-section" style={{ marginTop: 0 }}>
                <div className="trend-chart-header" style={{ marginTop: 0 }}>
                  <div className="detail-section-title" style={{ margin: 0 }}>
                    统计概览
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

          {/* Diet Strategy */}
          {goal_progress && (
            <div className="detail-section">
              <div className="detail-section-title">
                {goal_progress.goal_type === "muscle_gain"
                  ? "增肌饮食策略"
                  : goal_progress.goal_type === "fat_loss"
                    ? "减脂饮食策略"
                    : "维持期饮食策略"}
              </div>
              <div className="card diet-strategy-card">
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

          {/* Quick-Log Form */}
          <div className="detail-section">
            {showForm ? (
              <div className="card">
                <div className="nutrition-form-header">
                  <span className="detail-section-title" style={{ margin: 0 }}>
                    记录今日饮食
                  </span>
                  <button
                    className="icon-btn-muted"
                    onClick={() => setShowForm(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="nutrition-form-grid">
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
                      <label className="nutrition-form-field-label">
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
                        className="nutrition-form-input"
                      />
                    </div>
                  ))}
                </div>
                <button
                  className="btn-approve nutrition-form-submit"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? "保存中..." : "保存记录"}
                </button>
              </div>
            ) : (
              <button
                className="dashed-add-btn"
                onClick={() => setShowForm(true)}
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
