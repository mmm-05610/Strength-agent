interface Props {
  score: number;
  max?: number;
  label: string;
  color: string;
  size?: number;
}

export function ScoreDial({
  score,
  max = 100,
  label,
  color,
  size = 100,
}: Props) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, (score / max) * 100);
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="score-dial" style={{ width: size }}>
      <div
        className="score-dial-chart"
        style={{ position: "relative", width: size, height: size }}
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
        <span className="score-dial-value" style={{ fontSize: size * 0.22 }}>
          {score}
        </span>
      </div>
      <span className="score-dial-label">{label}</span>
    </div>
  );
}
