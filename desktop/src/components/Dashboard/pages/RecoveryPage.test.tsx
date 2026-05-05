import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecoveryPage } from "./RecoveryPage";
import { createMockDashboardData } from "../../../test/factories";
import type { DashboardData } from "../../../api/client";

vi.mock("../../../api/client", () => ({
  fetchReadinessHistory: vi.fn().mockResolvedValue([]),
  updateReadinessLog: vi.fn(),
  deleteReadinessLog: vi.fn(),
}));

vi.mock("../../../hooks/useActions", () => ({
  useActions: () => ({ dispatch: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../../../hooks/useHistoryData", () => ({
  useHistoryData: () => ({ data: [], refresh: vi.fn() }),
}));

describe("RecoveryPage", () => {
  let mockData: DashboardData;

  beforeEach(() => {
    mockData = createMockDashboardData();
  });

  it("renders the recovery title", () => {
    render(<RecoveryPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("恢复与感受")).toBeInTheDocument();
  });

  it("renders the log readiness button", () => {
    render(<RecoveryPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("记录今日恢复状态")).toBeInTheDocument();
  });

  it("does not render 'undefined' in text content", () => {
    render(<RecoveryPage data={mockData} onRefresh={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/\bundefined\b/);
  });
});
