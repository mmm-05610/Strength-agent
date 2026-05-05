import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BodyStatusPage } from "./BodyStatusPage";
import { createMockDashboardData } from "../../../test/factories";
import type { DashboardData } from "../../../api/client";

vi.mock("../../../api/client", () => ({
  fetchBodyMetrics: vi.fn().mockResolvedValue([]),
  updateBodyMetric: vi.fn(),
  deleteBodyMetric: vi.fn(),
}));

vi.mock("../../../hooks/useActions", () => ({
  useActions: () => ({ dispatch: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../../../hooks/useHistoryData", () => ({
  useHistoryData: () => ({ data: [], refresh: vi.fn() }),
}));

describe("BodyStatusPage", () => {
  let mockData: DashboardData;

  beforeEach(() => {
    mockData = createMockDashboardData();
  });

  it("renders the body status title", () => {
    render(<BodyStatusPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getByText("身体状态")).toBeInTheDocument();
  });

  it("renders the InBody score", () => {
    render(<BodyStatusPage data={mockData} onRefresh={vi.fn()} />);
    expect(screen.getAllByText("InBody 得分").length).toBeGreaterThanOrEqual(1);
  });

  it("does not render 'undefined' in text content", () => {
    render(<BodyStatusPage data={mockData} onRefresh={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/\bundefined\b/);
  });
});
