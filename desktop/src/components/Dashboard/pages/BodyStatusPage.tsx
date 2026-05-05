import { useEffect, useState } from "react";
import type {
  DashboardData,
  BodyMetricCreate,
  BodyMetricHistory,
} from "../../../api/client";
import {
  fetchBodyMetrics,
  updateBodyMetric,
  deleteBodyMetric,
} from "../../../api/client";
import { useActions } from "../../../hooks/useActions";
import { useHistoryData } from "../../../hooks/useHistoryData";
import { getTodayStr } from "../shared/datetime";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { HistoryList, type HistoryItem } from "../shared/HistoryList";
import { InBodyScoreRing } from "../components/body/InBodyScoreRing";
import { BodyCompositionBar } from "../components/body/BodyCompositionBar";
import { MuscleFatBalance } from "../components/body/MuscleFatBalance";
import { SegmentalAnalysis } from "../components/body/SegmentalAnalysis";
import { BodyTrendChart } from "../components/body/BodyTrendChart";
import { rangeStatus } from "../components/body/rangeStatus";

interface Props {
  data: DashboardData;
  onRefresh: () => void;
  expandFormTrigger?: number;
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
    (referenceLow != null && referenceHigh != null && value != null
      ? rangeStatus(value, referenceLow, referenceHigh)
      : "var(--color-text-primary)");

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
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          {referenceLabel}
        </div>
      )}
    </div>
  );
}

type FormState = BodyMetricCreate & { log_date: string };

export function BodyStatusPage({ data, onRefresh, expandFormTrigger }: Props) {
  const { dispatch } = useActions();
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
  const { data: metricHistory, refresh: refreshMetrics } =
    useHistoryData<BodyMetricHistory>(fetchBodyMetrics, 90);
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
        await dispatch(
          "body_metric.upsert",
          form as unknown as Record<string, unknown>,
        );
      }
      setShowForm(false);
      setShowSegmentForm(false);
      refreshMetrics();
      onRefresh();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (id: number) => {
    const item = metricHistory.find((m) => m.id === id) as
      | (BodyMetricCreate & { id: number })
      | undefined;
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
      refreshMetrics();
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

  // Body metric history is managed by useHistoryData hook

  const trendTargetWeight = goal_progress?.target_weight_kg ?? null;
  const trendTargetMuscle = goal_progress?.target_muscle_kg ?? null;

  // INbody-style body composition
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

  const { parts: compData, isEstimated } = compositionParts();
  const hasAnyComposition =
    bm.body_fat_kg != null || bm.skeletal_muscle_kg != null;

  const segmentMuscleEntries = Object.keys(SEGMENT_LABELS).reduce(
    (acc, key) => {
      acc[key] = (bm as Record<string, unknown>)[key] as number | null;
      return acc;
    },
    {} as Record<string, number | null>,
  );

  const segmentFatEntries = Object.keys(FAT_SEGMENT_LABELS).reduce(
    (acc, key) => {
      acc[key] = (bm as Record<string, unknown>)[key] as number | null;
      return acc;
    },
    {} as Record<string, number | null>,
  );

  return (
    <div>
      <h2 className="dashboard-content-title">身体状态</h2>

      {/* ═══ Section 1: Hero — InBody Score + Assessment ═══ */}
      <div className="detail-section">
        <div className="card body-hero-card">
          <InBodyScoreRing score={bm.inbody_score} size={120} />
          <div className="body-hero-content">
            {bm.body_assessment ? (
              <div className="body-hero-assessment">{bm.body_assessment}</div>
            ) : (
              <div className="body-hero-no-assessment">尚未评估</div>
            )}
            <div className="body-hero-desc">
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
            <div className="body-hero-stats">
              <div>
                <div className="body-hero-stat-label">体重</div>
                <div className="body-hero-stat-value">
                  {fmt(latestWeight, " kg")}
                </div>
              </div>
              <div>
                <div className="body-hero-stat-label">骨骼肌</div>
                <div
                  className="body-hero-stat-value"
                  style={{ color: "var(--color-brand)" }}
                >
                  {fmt(bm.skeletal_muscle_kg, " kg")}
                </div>
              </div>
              <div>
                <div className="body-hero-stat-label">体脂肪</div>
                <div
                  className="body-hero-stat-value"
                  style={{ color: "var(--color-warning)" }}
                >
                  {fmt(bm.body_fat_kg, " kg")}
                </div>
              </div>
              <div>
                <div className="body-hero-stat-label">BMI</div>
                <div
                  className="body-hero-stat-value"
                  style={{
                    color:
                      bm.bmi != null
                        ? rangeStatus(bm.bmi, 18.5, 24)
                        : "var(--color-text-muted)",
                  }}
                >
                  {fmt(bm.bmi)}
                </div>
              </div>
              <div>
                <div className="body-hero-stat-label">体脂率</div>
                <div
                  className="body-hero-stat-value"
                  style={{
                    color:
                      bm.body_fat_rate_pct != null
                        ? rangeStatus(bm.body_fat_rate_pct, 10, 20)
                        : "var(--color-text-muted)",
                  }}
                >
                  {fmt(bm.body_fat_rate_pct, "%")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Section 2: Body Composition Analysis ═══ */}
      <div className="detail-section">
        <div className="detail-section-title">身体成分分析</div>
        <div className="card">
          <BodyCompositionBar
            parts={compData}
            isEstimated={isEstimated}
            hasAnyData={hasAnyComposition}
          />
        </div>
      </div>

      {/* ═══ Section 3: Muscle-Fat Balance ═══ */}
      <div className="detail-section">
        <div className="detail-section-title">肌肉-脂肪均衡</div>
        <div className="card">
          <MuscleFatBalance
            skeletalMuscleKg={bm.skeletal_muscle_kg}
            muscleWeightKg={bm.muscle_weight_kg}
            bodyFatKg={bm.body_fat_kg}
            bodyFatRatePct={bm.body_fat_rate_pct}
            bmi={bm.bmi}
            whr={bm.whr}
          />
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
        <SegmentalAnalysis
          title="节段肌肉均衡 (kg)"
          segments={segmentMuscleEntries}
          labels={SEGMENT_LABELS}
          emptyMessage="暂无节段肌肉数据，可通过 InBody 测量获取四肢和躯干的肌肉分布"
          barColor="var(--color-brand)"
        />
        <div style={{ height: 12 }} />
        <SegmentalAnalysis
          title="节段脂肪分布 (kg)"
          segments={segmentFatEntries}
          labels={FAT_SEGMENT_LABELS}
          emptyMessage="暂无节段脂肪数据，可通过 InBody 测量获取四肢和躯干的脂肪分布"
          barColor="var(--color-warning)"
        />
      </div>

      {/* ═══ Section 6: Body Trend ═══ */}
      <div className="detail-section">
        <BodyTrendChart
          history={metricHistory}
          targetWeightKg={trendTargetWeight}
          targetMuscleKg={trendTargetMuscle}
        />
      </div>

      {/* ═══ Section 7: Quick-Log Form ═══ */}
      <div className="detail-section">
        {showForm ? (
          <div className="card">
            <div className="body-form-header">
              <span className="detail-section-title" style={{ margin: 0 }}>
                记录身体数据
              </span>
              <button
                onClick={() => {
                  setShowForm(false);
                  setShowSegmentForm(false);
                }}
                className="body-form-close-btn"
              >
                <X size={16} />
              </button>
            </div>

            {/* Core fields */}
            <div className="body-form-grid small-gap">
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
                  <label className="body-form-label">{f.label}</label>
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
                    className="body-form-input"
                  />
                </div>
              ))}
            </div>

            {/* Segmental toggle */}
            <button
              onClick={() => setShowSegmentForm(!showSegmentForm)}
              className={`body-form-toggle${showSegmentForm ? " with-margin" : ""}`}
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
                    color: "var(--color-text-secondary)",
                    marginBottom: 8,
                    marginTop: 8,
                  }}
                >
                  肌肉均衡 (kg)
                </div>
                <div
                  className="body-form-sub-grid"
                  style={{ marginBottom: 16 }}
                >
                  {Object.entries(SEGMENT_LABELS).map(([key, label]) => (
                    <div key={key}>
                      <label className="body-form-sub-label">{label}</label>
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
                        className="body-form-sub-input"
                      />
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  节段脂肪 (kg)
                </div>
                <div className="body-form-sub-grid">
                  {Object.entries(FAT_SEGMENT_LABELS).map(([key, label]) => (
                    <div key={key}>
                      <label className="body-form-sub-label">{label}</label>
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
                        className="body-form-sub-input"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              className="btn-approve body-form-submit"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "保存中..." : "保存记录"}
            </button>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)} className="body-add-button">
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
