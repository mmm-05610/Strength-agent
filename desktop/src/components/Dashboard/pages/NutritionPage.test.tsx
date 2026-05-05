import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NutritionPage } from "./NutritionPage";
import { createMockDashboardData } from "../../../test/factories";
import type { DashboardData } from "../../../api/client";

vi.mock("../../../api/client", () => ({
  fetchNutritionHistory: vi.fn().mockResolvedValue([]),
  updateNutritionLog: vi.fn(),
  deleteNutritionLog: vi.fn(),
}));

vi.mock("../../../hooks/useActions", () => ({
  useActions: () => ({ dispatch: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../../../hooks/useHistoryData", () => ({
  useHistoryData: () => ({ data: [], refresh: vi.fn() }),
}));

describe("NutritionPage", () => {
  let mockData: DashboardData;

  beforeEach(() => {
    mockData = createMockDashboardData();
  });

  it("renders the nutrition title", () => {
    render(<NutritionPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("饮食摄入")).toBeInTheDocument();
  });

  it("renders the quick-log button when data exists", () => {
    render(<NutritionPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("记录今日饮食")).toBeInTheDocument();
  });

  it("renders diet strategy section with target calories", () => {
    render(<NutritionPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText(/增肌饮食策略/)).toBeInTheDocument();
  });

  it("does not render 'undefined' in text content", () => {
    render(<NutritionPage data={mockData} onRefresh={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/\bundefined\b/);
  });
});
