interface Props {
  current: number;
  target: number;
  size?: number;
}

export function CalorieRing({ current, target, size = 140 }: Props) {
  const r = size / 2 - 12;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, (current / target) * 100);
  const offset = circ - (pct / 100) * circ;
  const color = pct < 100 ? "var(--mint)" : "var(--warning)";

  return (
    <div className="calorie-ring" style={{ width: size, height: size }}>
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
      <div className="calorie-ring-center">
        <span className="calorie-ring-value">{current}</span>
        <span className="calorie-ring-target">/ {target} kcal</span>
        <span className="calorie-ring-pct" style={{ color }}>
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}
