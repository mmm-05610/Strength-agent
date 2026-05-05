import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrainingPage } from "./TrainingPage";
import { createMockDashboardData } from "../../../test/factories";
import type { DashboardData } from "../../../api/client";

vi.mock("../../../api/client", () => ({
  fetchWorkouts: vi.fn().mockResolvedValue([]),
  fetchPlanState: vi.fn().mockResolvedValue({
    cycle_week: 1,
    next_training_time: "2026-05-04T19:00:00",
    weekly_plan: {},
    cycle_length_days: 7,
    cycle_start_date: "2026-04-16",
    cycle_day_plan: [],
  }),
  updateWorkout: vi.fn(),
  deleteWorkout: vi.fn(),
}));

vi.mock("../../../hooks/useActions", () => ({
  useActions: () => ({ dispatch: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../../../hooks/useHistoryData", () => ({
  useHistoryData: () => ({ data: [], refresh: vi.fn() }),
}));

describe("TrainingPage", () => {
  let mockData: DashboardData;

  beforeEach(() => {
    mockData = createMockDashboardData();
  });

  it("renders the training title", () => {
    render(<TrainingPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("训练执行")).toBeInTheDocument();
  });

  it("renders the log workout button", () => {
    render(<TrainingPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("记录今日训练")).toBeInTheDocument();
  });

  it("shows today's training status", () => {
    render(<TrainingPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("今日状态")).toBeInTheDocument();
  });

  it("does not render 'undefined' in text content", () => {
    render(<TrainingPage data={mockData} onRefresh={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/\bundefined\b/);
  });
});
