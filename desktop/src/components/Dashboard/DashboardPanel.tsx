import { useState, useCallback } from "react";
import { useDashboard } from "../../hooks/useDashboard";
import {
  LayoutDashboard,
  Activity,
  UtensilsCrossed,
  Dumbbell,
  Heart,
  Target,
} from "lucide-react";
import { DashboardOverview } from "./DashboardOverview";
import { BodyStatusPage } from "./pages/BodyStatusPage";
import { NutritionPage } from "./pages/NutritionPage";
import { TrainingPage } from "./pages/TrainingPage";
import { RecoveryPage } from "./pages/RecoveryPage";
import { GoalsPage } from "./pages/GoalsPage";

type TabId =
  | "overview"
  | "body"
  | "nutrition"
  | "training"
  | "recovery"
  | "goals";

interface Tab {
  id: TabId;
  label: string;
  icon: typeof LayoutDashboard;
}

const tabs: Tab[] = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "body", label: "身体", icon: Activity },
  { id: "nutrition", label: "饮食", icon: UtensilsCrossed },
  { id: "training", label: "训练", icon: Dumbbell },
  { id: "recovery", label: "恢复", icon: Heart },
  { id: "goals", label: "目标", icon: Target },
];

export function DashboardPanel() {
  const { data, loading, error, refresh } = useDashboard();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandFormTrigger, setExpandFormTrigger] = useState(0);

  const handleNavigate = useCallback((tab: TabId, expandForm?: boolean) => {
    setActiveTab(tab);
    if (expandForm) {
      setExpandFormTrigger((n) => n + 1);
    }
  }, []);

  if (loading && !data) {
    return (
      <div className="dashboard-panel">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            width: "100%",
          }}
        >
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
            加载中...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-panel">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            width: "100%",
          }}
        >
          <span style={{ color: "var(--danger)", fontSize: 14 }}>
            看板错误：{error}
          </span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dashboard-panel">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            width: "100%",
          }}
        >
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
            暂无数据
          </span>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <DashboardOverview data={data} onNavigate={handleNavigate} />;
      case "body":
        return (
          <BodyStatusPage
            data={data}
            onRefresh={refresh}
            expandFormTrigger={expandFormTrigger}
          />
        );
      case "nutrition":
        return (
          <NutritionPage
            data={data}
            onRefresh={refresh}
            expandFormTrigger={expandFormTrigger}
          />
        );
      case "training":
        return (
          <TrainingPage
            data={data}
            onRefresh={refresh}
            expandFormTrigger={expandFormTrigger}
          />
        );
      case "recovery":
        return (
          <RecoveryPage
            data={data}
            onRefresh={refresh}
            expandFormTrigger={expandFormTrigger}
          />
        );
      case "goals":
        return <GoalsPage data={data} onRefresh={refresh} />;
    }
  };

  return (
    <div className="dashboard-panel">
      <nav className="dashboard-nav">
        <div className="dashboard-nav-title">数据看板</div>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`dashboard-nav-item ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="dashboard-content">{renderContent()}</div>
    </div>
  );
}
