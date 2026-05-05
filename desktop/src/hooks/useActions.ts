import { useCallback } from "react";
import { useDashboard } from "./useDashboard";

const API_BASE = "http://127.0.0.1:18720/api/v1";

interface DispatchResult {
  success: boolean;
  data?: unknown;
  error?: string;
  refresh_tags?: string[];
}

export function useActions() {
  const { refresh } = useDashboard();

  const dispatch = useCallback(
    async (
      action: string,
      payload: Record<string, unknown>,
    ): Promise<DispatchResult> => {
      // Auto-inject date fields when missing from AI-generated payloads
      const today = new Date().toISOString().slice(0, 10);
      const patched = { ...payload };
      if (action === "workout.create" && !patched.training_date) {
        patched.training_date = today;
      } else if (!patched.log_date && action !== "goal.update") {
        patched.log_date = today;
      }

      const res = await fetch(`${API_BASE}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload: patched }),
      });
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}` };
      }
      const result: DispatchResult = await res.json();

      if (result.success && result.refresh_tags) {
        await refresh();
      }

      return result;
    },
    [refresh],
  );

  return { dispatch };
}
