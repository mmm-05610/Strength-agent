interface Props {
  routeTier: string;
  totalCost: number;
  monthlyBudget: number;
  monthlySpent: number;
  ragDocCount: number;
  backendStatus: "connected" | "disconnected" | "connecting";
}

export function StatusBar({
  routeTier,
  totalCost,
  monthlyBudget,
  monthlySpent,
  ragDocCount,
  backendStatus,
}: Props) {
  const remaining = monthlyBudget - monthlySpent;
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className={`status-dot ${backendStatus}`} />
        <span>API: {backendStatus}</span>
        <span className="status-sep">|</span>
        <span>Tier: {routeTier || "—"}</span>
        <span className="status-sep">|</span>
        <span>RAG: {ragDocCount} docs loaded</span>
      </div>
      <div className="status-right">
        <span>Session: ¥{totalCost.toFixed(4)}</span>
        <span className="status-sep">|</span>
        <span>
          Month: ¥{monthlySpent.toFixed(2)} / ¥{monthlyBudget.toFixed(0)}
        </span>
        <span className={`budget-indicator ${remaining > 0 ? "ok" : "warn"}`}>
          {remaining > 0 ? `¥${remaining.toFixed(0)} left` : "Over budget"}
        </span>
      </div>
    </div>
  );
}
