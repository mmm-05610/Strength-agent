import { useState, useEffect, useCallback } from "react";
import { fetchDashboard } from "../api/client";
import type { DashboardData } from "../api/client";

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchDashboard();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll every 30 seconds for updates
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { data, loading, error, refresh };
}
