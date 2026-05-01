import { useState, useEffect } from "react";
import { ChatPanel } from "./components/Chat/ChatPanel";
import { DashboardPanel } from "./components/Dashboard/DashboardPanel";
import { StatusBar } from "./components/common/StatusBar";
import { useDashboard } from "./hooks/useDashboard";

function App() {
  const [routeTier, setRouteTier] = useState("");
  const [sessionCost, setSessionCost] = useState(0);
  const { data: dashboard, loading, error } = useDashboard();
  const backendStatus =
    loading && !dashboard ? "connecting" : error ? "disconnected" : "connected";

  useEffect(() => {
    const handleStatusUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.routeTier) setRouteTier(detail.routeTier);
      if (detail.cost) setSessionCost((prev) => prev + (detail.cost as number));
    };
    window.addEventListener("chat-status", handleStatusUpdate);
    return () => window.removeEventListener("chat-status", handleStatusUpdate);
  }, []);

  return (
    <div className="app">
      <div className="main-content">
        <div className="left-panel">
          <DashboardPanel />
        </div>
        <div className="right-panel">
          <ChatPanel />
        </div>
      </div>
      <StatusBar
        routeTier={routeTier}
        totalCost={sessionCost}
        monthlyBudget={30}
        monthlySpent={dashboard?.cost_status?.spent_rmb ?? 0}
        ragDocCount={8}
        backendStatus={backendStatus}
      />
    </div>
  );
}

export default App;
