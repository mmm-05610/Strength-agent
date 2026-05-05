interface Props {
  proteinG: number;
  carbsG: number;
  fatG: number;
  proteinGoal?: number;
  carbsGoal?: number;
  fatGoal?: number;
  waterL?: number;
  waterGoal?: number;
  bodyWeightKg?: number | null;
  dateLogged?: boolean;
}

const BAR_COLORS: Record<string, string> = {
  protein: "var(--accent)",
  carbs: "var(--mint)",
  fat: "var(--warning)",
} as const;

function MacroBarItem({
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
    <div className="macro-bar-item">
      <div className="macro-bar-header">
        <span className="macro-bar-label">{label}</span>
        <span className="macro-bar-numbers">
          {current}
          <span className="target">
            /{target}
            {unit}
          </span>
          <span className="pct" style={{ color }}>
            {pct}%
          </span>
        </span>
      </div>
      <div className="macro-bar-track">
        <div
          className="macro-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function MacroBreakdown({
  proteinG,
  carbsG,
  fatG,
  proteinGoal = 100,
  carbsGoal = 250,
  fatGoal = 60,
  waterL,
  waterGoal = 3.0,
  bodyWeightKg,
  dateLogged = true,
}: Props) {
  return (
    <div className="nutrition-macro-bars">
      <div className="nutrition-summary-title">
        {dateLogged
          ? `今日 ${Math.round(proteinG + carbsG + fatG)} kcal`
          : "今日尚未记录"}
      </div>
      <MacroBarItem
        label="蛋白质"
        current={dateLogged ? proteinG : 0}
        target={proteinGoal}
        unit="g"
        color={BAR_COLORS.protein}
      />
      <MacroBarItem
        label="碳水"
        current={dateLogged ? carbsG : 0}
        target={carbsGoal}
        unit="g"
        color={BAR_COLORS.carbs}
      />
      <MacroBarItem
        label="脂肪"
        current={dateLogged ? fatG : 0}
        target={fatGoal}
        unit="g"
        color={BAR_COLORS.fat}
      />
      <div className="nutrition-water-weight">
        <span>
          水分 <strong>{dateLogged ? `${waterL}L` : "—"}</strong>
          <span style={{ color: "var(--text-muted)" }}> / {waterGoal}L</span>
        </span>
        {dateLogged && bodyWeightKg != null && (
          <span>
            体重 <strong>{bodyWeightKg} kg</strong>
          </span>
        )}
      </div>
    </div>
  );
}
