interface Props {
  score: number | null;
  size?: number;
}

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-text-muted)";
  if (score >= 80) return "var(--color-mint)";
  if (score >= 70) return "var(--color-success)";
  if (score >= 60) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function InBodyScoreRing({ score, size = 100 }: Props) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;
  const offset = circ - (pct / 100) * circ;
  const color = scoreColor(score);

  return (
    <div className="inbody-score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-bg-secondary)"
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
          className="inbody-score-ring-circle"
        />
      </svg>
      <div className="inbody-score-ring-overlay">
        <span
          className="inbody-score-ring-number"
          style={{ fontSize: size * 0.24 }}
        >
          {score != null ? score : "--"}
        </span>
        <span
          className="inbody-score-ring-label"
          style={{ fontSize: size * 0.09 }}
        >
          InBody 得分
        </span>
      </div>
    </div>
  );
}
