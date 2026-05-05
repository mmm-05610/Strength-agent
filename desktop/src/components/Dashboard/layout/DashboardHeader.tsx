import { RefreshCw } from "lucide-react";
import { formatDateFull } from "../shared/datetime";

interface Props {
  onRefresh: () => void;
  lastSyncTime?: string;
  refreshing?: boolean;
  userName?: string;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export function DashboardHeader({
  onRefresh,
  lastSyncTime,
  refreshing,
  userName,
}: Props) {
  const greeting = getGreeting();
  const today = formatDateFull(new Date().toISOString().slice(0, 10));

  return (
    <header className="dashboard-header">
      <div>
        <span className="dashboard-header-greeting">
          {greeting}
          {userName ? `，${userName}` : ""}
          <span>{today}</span>
        </span>
      </div>
      <div className="dashboard-header-actions">
        {lastSyncTime && (
          <span className="dashboard-header-sync-time">
            上次同步：{lastSyncTime}
          </span>
        )}
        <button
          className={`dashboard-header-refresh${refreshing ? " spinning" : ""}`}
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
          {refreshing ? "刷新中..." : "刷新数据"}
        </button>
      </div>
    </header>
  );
}
