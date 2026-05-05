import { rangeStatus } from "./rangeStatus";

/* ── Reference Range Bar ── */
function RangeBar({
  value,
  min,
  max,
  low,
  high,
  unit = "",
  barColor = "var(--color-brand)",
}: {
  value: number | null;
  min: number;
  max: number;
  low: number;
  high: number;
  unit?: string;
  barColor?: string;
}) {
  if (value == null) return <span className="range-bar-empty">无数据</span>;

  const range = max - min;
  const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const lowPct = ((low - min) / range) * 100;
  const highPct = ((high - min) / range) * 100;
  const inRange = value >= low && value <= high;

  return (
    <div className="range-bar">
      <div className="range-bar-header">
        <span
          className="range-bar-value"
          style={{
            color: inRange ? "var(--color-mint)" : "var(--color-warning)",
          }}
        >
          {value}
          {unit}
        </span>
        <span className="range-bar-ref">
          {low}
          {unit} &ndash; {high}
          {unit}
        </span>
      </div>
      <div className="range-bar-track">
        <div
          className="range-bar-zone"
          style={{
            left: `${lowPct}%`,
            width: `${highPct - lowPct}%`,
          }}
        />
        <div
          className="range-bar-indicator"
          style={{
            left: `${pct}%`,
            background: barColor,
          }}
        />
      </div>
    </div>
  );
}

interface Props {
  skeletalMuscleKg: number | null;
  muscleWeightKg: number | null;
  bodyFatKg: number | null;
  bodyFatRatePct: number | null;
  bmi: number | null;
  whr: number | null;
}

export function MuscleFatBalance({
  skeletalMuscleKg,
  muscleWeightKg,
  bodyFatKg,
  bodyFatRatePct,
  bmi,
  whr,
}: Props) {
  return (
    <div className="muscle-fat-grid">
      <div>
        <div className="muscle-fat-label">骨骼肌 (kg)</div>
        <RangeBar
          value={skeletalMuscleKg}
          min={20}
          max={50}
          low={28}
          high={38}
          unit=" kg"
          barColor="var(--color-brand)"
        />
      </div>
      <div>
        <div className="muscle-fat-label">肌肉重量 (kg)</div>
        {muscleWeightKg != null ? (
          <div>
            <span className="muscle-fat-value-brand">{muscleWeightKg} kg</span>
          </div>
        ) : (
          <div className="muscle-fat-empty-row">
            <span className="muscle-fat-empty-text">
              无数据 &mdash; 可通过 InBody 测量获取
            </span>
          </div>
        )}
      </div>
      <div>
        <div className="muscle-fat-label">体脂肪 (kg)</div>
        <RangeBar
          value={bodyFatKg}
          min={0}
          max={40}
          low={8}
          high={18}
          unit=" kg"
          barColor="var(--color-warning)"
        />
      </div>
      <div>
        <div className="muscle-fat-label">体脂率 (%)</div>
        <RangeBar
          value={bodyFatRatePct}
          min={5}
          max={40}
          low={10}
          high={20}
          unit="%"
          barColor="var(--color-warning)"
        />
      </div>
      <div>
        <div className="muscle-fat-label">BMI (kg/m&sup2;)</div>
        <RangeBar
          value={bmi}
          min={15}
          max={35}
          low={18.5}
          high={24}
          unit=""
          barColor="var(--color-success)"
        />
      </div>
      <div>
        <div className="muscle-fat-label">腰臀比 WHR</div>
        {whr != null ? (
          <div>
            <span
              className="muscle-fat-value-dynamic"
              style={{
                color: rangeStatus(whr, 0.75, 0.9),
              }}
            >
              {whr}
            </span>
            <div className="muscle-fat-ref-label">标准 0.75&ndash;0.90</div>
          </div>
        ) : (
          <span className="muscle-fat-empty-text">
            录入腰围和臀围后自动计算
          </span>
        )}
      </div>
    </div>
  );
}
