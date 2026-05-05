import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  iconBg?: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  meta?: string;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  unit,
  icon,
  iconBg = "var(--color-brand-light)",
  trend,
  trendLabel,
  meta,
  onClick,
}: Props) {
  const trendClass = trend ? `trend-${trend}` : "";
  return (
    <div
      className="stat-card"
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      <div className="stat-card-header">
        <span className="stat-card-label">{label}</span>
        {icon && (
          <div className="stat-card-icon" style={{ background: iconBg }}>
            {icon}
          </div>
        )}
      </div>
      <div className="stat-card-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {(trendLabel || meta) && (
        <div className="stat-card-meta">
          {trendLabel && <span className={trendClass}>{trendLabel}</span>}
          {meta && <span>{meta}</span>}
        </div>
      )}
    </div>
  );
}
