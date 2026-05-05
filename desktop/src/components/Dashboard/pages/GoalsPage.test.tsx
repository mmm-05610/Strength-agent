import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoalsPage } from "./GoalsPage";
import { createMockDashboardData } from "../../../test/factories";
import type { DashboardData } from "../../../api/client";

vi.mock("../../../api/client", () => ({
  fetchGoalConfig: vi.fn().mockResolvedValue({
    goal_type: "muscle_gain",
    start_date: "2026-04-16",
    target_date: "2026-07-01",
    start_weight_kg: 65,
    target_weight_kg: 85,
    start_muscle_kg: 31.9,
    target_muscle_kg: 35,
    latest_muscle_kg: 32,
  }),
}));

vi.mock("../../../hooks/useActions", () => ({
  useActions: () => ({ dispatch: vi.fn().mockResolvedValue(undefined) }),
}));

describe("GoalsPage", () => {
  let mockData: DashboardData;

  beforeEach(() => {
    mockData = createMockDashboardData();
  });

  it("renders the goals title", () => {
    render(<GoalsPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("目标与计划")).toBeInTheDocument();
  });

  it("renders target weight metric", () => {
    render(<GoalsPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("目标体重")).toBeInTheDocument();
  });

  it("does not render 'undefined' in text content", () => {
    render(<GoalsPage data={mockData} onRefresh={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/\bundefined\b/);
  });
});
