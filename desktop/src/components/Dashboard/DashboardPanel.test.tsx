import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardPanel } from "./DashboardPanel";

vi.mock("../../api/client", () => ({
  fetchDashboard: vi.fn().mockResolvedValue({
    today_training: {
      is_training_day: true,
      completed: false,
      focus_area: "upper",
      recommendation: "",
    },
    recovery: {
      sleep_hours: 7,
      fatigue_score: 3,
      pain_score: 1,
      stress_score: 2,
      log_date: "2026-05-04",
    },
    nutrition: {
      calories_kcal: 2200,
      protein_g: 150,
      carbs_g: 250,
      fat_g: 70,
      water_liters: 2,
      body_weight_kg: 73,
      log_date: "2026-05-04",
    },
    goal_progress: {
      goal_type: "muscle_gain",
      current_weight_kg: 73,
      target_weight_kg: 85,
      weight_gap_kg: 12,
      days_remaining: 90,
      progress_label: "正常",
      summary: "正常",
      actual_weekly_weight_change_kg: null,
      required_weekly_weight_change_kg: null,
      current_muscle_kg: null,
      target_muscle_kg: null,
      muscle_gap_kg: null,
    },
    weight_trend: [],
    body_metrics: {
      body_weight_kg: 73,
      body_fat_rate_pct: 15,
      body_fat_kg: 10.95,
      muscle_weight_kg: 32,
      skeletal_muscle_kg: 34,
      body_water_kg: null,
      protein_kg: null,
      minerals_kg: null,
      left_upper_muscle_kg: null,
      right_upper_muscle_kg: null,
      left_lower_muscle_kg: null,
      right_lower_muscle_kg: null,
      trunk_muscle_kg: null,
      left_upper_fat_kg: null,
      right_upper_fat_kg: null,
      left_lower_fat_kg: null,
      right_lower_fat_kg: null,
      trunk_fat_kg: null,
      waist_cm: null,
      hip_cm: null,
      inbody_score: 80,
      bmr_kcal: null,
      bmi: null,
      smi: null,
      whr: null,
      body_assessment: "力量之星",
      height_cm: 183,
    },
    cost_status: { monthly_budget_rmb: 30, spent_rmb: 0, remaining_rmb: 30 },
  }),
}));

vi.mock("../../hooks/useDashboard", () => ({
  useDashboard: () => ({
    data: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe("DashboardPanel", () => {
  it("renders the sidebar with nav items", () => {
    render(<DashboardPanel />);
    expect(screen.getByText("总览")).toBeInTheDocument();
    expect(screen.getByText("身体状态")).toBeInTheDocument();
    expect(screen.getByText("饮食摄入")).toBeInTheDocument();
    expect(screen.getByText("训练记录")).toBeInTheDocument();
    expect(screen.getByText("恢复感受")).toBeInTheDocument();
    expect(screen.getByText("目标计划")).toBeInTheDocument();
  });

  it("does not render 'undefined' in text content", () => {
    render(<DashboardPanel />);
    expect(document.body.textContent).not.toMatch(/\bundefined\b/);
  });
});
