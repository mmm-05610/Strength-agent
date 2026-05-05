interface Range {
  low: number;
  high: number;
  unit?: string;
}

interface Props {
  value: number;
  range: Range;
  label?: string;
  showLabels?: boolean;
}

export function MetricRangeBar({
  value,
  range,
  label,
  showLabels = true,
}: Props) {
  const pct = Math.max(
    0,
    Math.min(100, ((value - range.low) / (range.high - range.low)) * 100),
  );
  const status =
    value < range.low ? "low" : value > range.high ? "high" : "normal";

  return (
    <div className="metric-range-bar">
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="metric-card-label">{label}</span>
          <span
            className="metric-card-value"
            style={{
              fontSize: "13px",
              color:
                status === "normal"
                  ? "var(--color-success)"
                  : status === "low"
                    ? "var(--color-danger)"
                    : "var(--color-warning)",
            }}
          >
            {value}
            {range.unit && (
              <span className="metric-card-unit">{range.unit}</span>
            )}
          </span>
        </div>
      )}
      <div className="metric-range-bar-track">
        <div
          className="metric-range-bar-indicator"
          style={{ left: `${pct}%` }}
        />
      </div>
      {showLabels && (
        <div className="metric-range-bar-labels">
          <span>
            {range.low}
            {range.unit}
          </span>
          <span>
            {range.high}
            {range.unit}
          </span>
        </div>
      )}
    </div>
  );
}
