interface CompositionPart {
  label: string;
  value: number;
  color: string;
  pct: number;
}

interface Props {
  parts: CompositionPart[];
  isEstimated: boolean;
  hasAnyData: boolean;
}

export function BodyCompositionBar({ parts, isEstimated, hasAnyData }: Props) {
  if (!hasAnyData || parts.length === 0) {
    return (
      <div className="body-composition-empty">
        暂无身体成分数据，请录入体重、骨骼肌、体脂肪等指标
      </div>
    );
  }

  return (
    <>
      <div className="body-composition-bar">
        {parts.map((p) => (
          <div
            key={p.label}
            className="body-composition-bar-segment"
            style={{
              width: `${Math.max(p.pct, 2)}%`,
              background: p.color,
            }}
            title={`${p.label}: ${p.value}kg (${p.pct}%)`}
          >
            {p.pct > 10 ? `${p.pct}%` : ""}
          </div>
        ))}
      </div>

      <div className="body-composition-legend">
        {parts.map((p) => (
          <div key={p.label} className="body-composition-legend-item">
            <span
              className="body-composition-legend-dot"
              style={{ background: p.color }}
            />
            <span className="body-composition-legend-label">{p.label}</span>
            <span className="body-composition-legend-value">{p.value}kg</span>
            <span className="body-composition-legend-pct">({p.pct}%)</span>
          </div>
        ))}
      </div>

      {isEstimated && (
        <div className="body-composition-note">
          * 体水分、蛋白质、无机盐为基于骨骼肌和体重的估算值
        </div>
      )}
    </>
  );
}
