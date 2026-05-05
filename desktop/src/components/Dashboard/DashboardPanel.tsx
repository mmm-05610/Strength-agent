import { useState, useCallback } from "react";
import { useDashboard } from "../../hooks/useDashboard";
import { DashboardShell } from "./layout/DashboardShell";
import type { NavTabId } from "./layout/DashboardSidebar";
import { DashboardOverview } from "./DashboardOverview";
import { BodyStatusPage } from "./pages/BodyStatusPage";
import { NutritionPage } from "./pages/NutritionPage";
import { TrainingPage } from "./pages/TrainingPage";
import { RecoveryPage } from "./pages/RecoveryPage";
import { GoalsPage } from "./pages/GoalsPage";
import { EmptyState } from "./components/shared/EmptyState";
import { AlertCircle } from "lucide-react";

export function DashboardPanel() {
  const { data, loading, error, refresh } = useDashboard();
  const [activeTab, setActiveTab] = useState<NavTabId>("overview");
  const [expandFormTrigger, setExpandFormTrigger] = useState(0);

  const handleNavigate = useCallback((tab: NavTabId, expandForm?: boolean) => {
    setActiveTab(tab);
    if (expandForm) {
      setExpandFormTrigger((n) => n + 1);
    }
  }, []);

  if (error) {
    return (
      <DashboardShell
        activeTab={activeTab}
        onNavigate={setActiveTab}
        onRefresh={refresh}
      >
        <EmptyState
          icon={<AlertCircle size={32} />}
          title="数据加载失败"
          description={error}
          action={{ label: "重试", onClick: refresh }}
        />
      </DashboardShell>
    );
  }

  if (!data) {
    return (
      <DashboardShell
        activeTab={activeTab}
        onNavigate={setActiveTab}
        onRefresh={refresh}
        loading={loading}
      >
        <EmptyState
          title="暂无数据"
          description="连接后端服务后即可查看仪表盘数据"
        />
      </DashboardShell>
    );
  }

  const todayIsTrainingDay = (() => {
    const day = new Date().getDay();
    return day === 1 || day === 3 || day === 5;
  })();

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
    <DashboardShell
      activeTab={activeTab}
      onNavigate={setActiveTab}
      onRefresh={refresh}
      todayIsTrainingDay={todayIsTrainingDay}
    >
      {renderContent()}
    </DashboardShell>
  );
}
