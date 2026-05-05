import { type CSSProperties } from "react";

interface Props {
  percentage: number;
  current: number;
  target: number;
  unit: string;
  color: string;
  /** e.g. "完成度" */
  centerLabel?: string;
}

const R = 48;
const CIRC = 2 * Math.PI * R;

export function GoalProgressRing({
  percentage,
  current,
  target,
  unit,
  color,
  centerLabel = "完成度",
}: Props) {
  const pct = Math.min(100, Math.max(0, percentage));
  const offset = CIRC - (pct / 100) * CIRC;

  return (
    <div className="goal-ring-wrapper">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="var(--color-bg-secondary)"
          strokeWidth="12"
        />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dashoffset 0.8s ease" } as CSSProperties}
        />
      </svg>
      <div className="goal-ring-center">
        <span className="goal-ring-pct">{pct}%</span>
        <span className="goal-ring-sub">
          {current}/{target} {unit}
        </span>
        <span className="goal-ring-label">{centerLabel}</span>
      </div>
    </div>
  );
}
