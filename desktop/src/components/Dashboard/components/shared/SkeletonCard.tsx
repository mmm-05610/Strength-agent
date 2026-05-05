interface Props {
  /** Height-based variant: "card" | "text" | "circle" | "value" */
  variant?: "card" | "text-row" | "stat";
  lines?: number;
}

export function SkeletonCard({ variant = "card", lines = 3 }: Props) {
  if (variant === "text-row") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton skeleton-text"
            style={{ width: `${60 + Math.random() * 35}%` }}
          />
        ))}
      </div>
    );
  }

  if (variant === "stat") {
    return (
      <div className="skeleton-card">
        <div className="skeleton-card-header">
          <div
            className="skeleton skeleton-circle"
            style={{ width: 32, height: 32 }}
          />
          <div className="skeleton skeleton-text short" />
        </div>
        <div className="skeleton skeleton-value" />
        <div className="skeleton skeleton-text" style={{ width: "40%" }} />
      </div>
    );
  }

  return (
    <div className="skeleton-card">
      <div className="skeleton-card-header">
        <div className="skeleton skeleton-text short" />
      </div>
      <div className="skeleton-card-body">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton skeleton-text"
            style={{ width: `${50 + Math.random() * 45}%` }}
          />
        ))}
      </div>
    </div>
  );
}
