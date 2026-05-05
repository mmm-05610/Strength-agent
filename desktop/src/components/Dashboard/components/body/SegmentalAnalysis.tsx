interface Props {
  title: string;
  segments: Record<string, number | null>;
  labels: Record<string, string>;
  emptyMessage: string;
  barColor: string;
}

export function SegmentalAnalysis({
  title,
  segments,
  labels,
  emptyMessage,
  barColor,
}: Props) {
  const hasData = Object.values(segments).some((v) => v != null);

  if (!hasData) {
    return (
      <div className="card">
        <div className="segmental-title">{title}</div>
        <div className="segmental-empty">{emptyMessage}</div>
      </div>
    );
  }

  const vals = Object.keys(labels).map(
    (k) => (segments[k] as number | null) ?? 0,
  );
  const maxVal = Math.max(...vals, 1);

  return (
    <div className="card">
      <div className="segmental-title">{title}</div>
      <div className="segmental-bars">
        {Object.entries(labels).map(([key, label]) => {
          const val = segments[key] as number | null;
          const barPct = val ? (val / maxVal) * 100 : 0;
          const opacity =
            val != null ? (barPct > 80 ? 0.85 : barPct > 50 ? 0.75 : 0.65) : 0;

          return (
            <div key={key} className="segmental-bar-col">
              <span
                className="segmental-bar-value"
                style={{
                  color:
                    val != null
                      ? "var(--color-text-primary)"
                      : "var(--color-text-muted)",
                }}
              >
                {val != null ? val : "--"}
              </span>
              <div className="segmental-bar-track">
                {val != null && (
                  <div
                    className="segmental-bar-fill"
                    style={{
                      height: `${barPct}%`,
                      background: barColor,
                      opacity,
                    }}
                  />
                )}
              </div>
              <span className="segmental-bar-label">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
