import { type ReactNode, useState } from "react";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardHeader } from "./DashboardHeader";
import type { NavTabId } from "./DashboardSidebar";
import { SkeletonCard } from "../components/shared/SkeletonCard";

interface Props {
  activeTab: NavTabId;
  onNavigate: (tab: NavTabId) => void;
  onRefresh: () => void;
  children: ReactNode;
  loading?: boolean;
  lastSyncTime?: string;
  refreshing?: boolean;
  todayIsTrainingDay?: boolean;
  userName?: string;
}

export function DashboardShell({
  activeTab,
  onNavigate,
  onRefresh,
  children,
  loading,
  lastSyncTime,
  refreshing,
  todayIsTrainingDay,
  userName,
}: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="dashboard-shell">
        <div
          style={{
            width: "var(--sidebar-width)",
            minWidth: "var(--sidebar-width)",
            height: "100%",
            background: "var(--color-bg-card)",
            borderRight: "1px solid var(--color-border)",
            padding: "var(--space-4)",
          }}
        >
          <SkeletonCard variant="text-row" lines={6} />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: "var(--header-height)",
              borderBottom: "1px solid var(--color-border-light)",
              padding: "0 var(--space-6)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <SkeletonCard variant="text-row" lines={1} />
          </div>
          <div className="dashboard-content">
            <div className="stat-cards-grid">
              <SkeletonCard variant="stat" />
              <SkeletonCard variant="stat" />
              <SkeletonCard variant="stat" />
            </div>
            <SkeletonCard variant="card" lines={5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <DashboardSidebar
        activeTab={activeTab}
        onNavigate={onNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        todayIsTrainingDay={todayIsTrainingDay}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <DashboardHeader
          onRefresh={onRefresh}
          lastSyncTime={lastSyncTime}
          refreshing={refreshing}
          userName={userName}
        />
        <div className="dashboard-content">{children}</div>
      </div>
    </div>
  );
}
