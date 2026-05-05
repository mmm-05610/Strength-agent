import { type LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Activity,
  UtensilsCrossed,
  Dumbbell,
  Heart,
  Target,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export type NavTabId =
  | "overview"
  | "body"
  | "nutrition"
  | "training"
  | "recovery"
  | "goals";

interface NavItem {
  id: NavTabId;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeVariant?: "default" | "training-day";
}

interface Props {
  activeTab: NavTabId;
  onNavigate: (tab: NavTabId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  todayIsTrainingDay?: boolean;
}

const navItems: NavItem[] = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "body", label: "身体状态", icon: Activity },
  { id: "nutrition", label: "饮食摄入", icon: UtensilsCrossed },
  { id: "training", label: "训练记录", icon: Dumbbell },
  { id: "recovery", label: "恢复感受", icon: Heart },
  { id: "goals", label: "目标计划", icon: Target },
];

export function DashboardSidebar({
  activeTab,
  onNavigate,
  collapsed,
  onToggleCollapse,
  todayIsTrainingDay,
}: Props) {
  const items: NavItem[] = navItems.map((item) => {
    if (item.id === "training" && todayIsTrainingDay) {
      return {
        ...item,
        badge: undefined,
        badgeVariant: "training-day" as const,
      };
    }
    return item;
  });

  return (
    <aside
      className={`dashboard-sidebar${collapsed ? " collapsed" : ""}`}
      style={{
        width: collapsed ? "var(--sidebar-collapsed-width)" : undefined,
      }}
    >
      <div className="dashboard-sidebar-logo">
        {!collapsed && <span>Strength Agent</span>}
        <button className="sidebar-collapse-btn" onClick={onToggleCollapse}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item${activeTab === item.id ? " active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon size={18} />
            {!collapsed && <span>{item.label}</span>}
            {!collapsed && item.badge != null && (
              <span className="sidebar-nav-badge">{item.badge}</span>
            )}
            {!collapsed && item.badgeVariant === "training-day" && (
              <span className="sidebar-nav-badge training-day">训练日</span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}
