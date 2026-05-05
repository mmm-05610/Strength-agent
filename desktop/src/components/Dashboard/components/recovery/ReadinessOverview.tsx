import { ScoreDial } from "./ScoreDial";

interface MetricBar {
  label: string;
  value: number;
  color: string;
  desc: string;
}

interface Props {
  readinessScore: number;
  readinessColor: string;
  sleepScore: number;
  sleepColor: string;
  metrics: MetricBar[];
}

export function ReadinessOverview({
  readinessScore,
  readinessColor,
  sleepScore,
  sleepColor,
  metrics,
}: Props) {
  return (
    <div className="detail-section">
      <div className="card readiness-dials">
        <ScoreDial
          score={readinessScore}
          label="恢复准备度"
          color={readinessColor}
          size={100}
        />
        <ScoreDial
          score={Math.round(sleepScore)}
          label="睡眠得分"
          color={sleepColor}
          size={100}
        />
        <div className="readiness-metrics">
          {metrics.map((m) => (
            <div key={m.label} className="metric-bar-row">
              <span className="metric-bar-label">{m.label}</span>
              <div className="metric-bar-track">
                <div
                  className="metric-bar-fill"
                  style={{
                    width: `${(m.value / 10) * 100}%`,
                    background: m.color,
                  }}
                />
              </div>
              <span className="metric-bar-score" style={{ color: m.color }}>
                {m.value}/10
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
