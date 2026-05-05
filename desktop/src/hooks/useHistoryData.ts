import { useState, useEffect, useCallback, useRef, useMemo } from "react";

export interface HistoryDataOptions {
  /** Time window in days (default: 90) */
  days?: number;
  /** Enable client-side pagination (default: false) */
  paginate?: boolean;
  /** Items per page when pagination is enabled (default: 10) */
  pageSize?: number;
}

export interface HistoryDataState<T> {
  /** All fetched data within the time window */
  data: T[];
  /** Current page's slice when pagination is enabled; same as data otherwise */
  paginatedData: T[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setDays: (days: number) => void;
  days: number;
  // Pagination (only meaningful when pagination is enabled)
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setPageSize: (size: number) => void;
}

/**
 * Fetch and cache history data with a rolling time window.
 *
 * Supports optional client-side pagination for large datasets.
 *
 * @example
 * ```ts
 * // Simple time window (backward-compatible)
 * const { data, loading, refresh } = useHistoryData(fetchNutritionHistory, 90);
 *
 * // With client-side pagination
 * const { paginatedData, page, totalPages, nextPage, prevPage } =
 *   useHistoryData(fetchNutritionHistory, { days: 90, paginate: true, pageSize: 10 });
 * ```
 */
export function useHistoryData<T>(
  fetcher: (days: number) => Promise<T[]>,
  initialDaysOrOptions?: number | HistoryDataOptions,
): HistoryDataState<T> {
  const options: HistoryDataOptions =
    typeof initialDaysOrOptions === "number"
      ? { days: initialDaysOrOptions }
      : (initialDaysOrOptions ?? {});

  const {
    days: initialDays = 90,
    paginate = false,
    pageSize: initialPageSize = 10,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(initialDays);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const fetcherRef = useRef(fetcher);
  const daysRef = useRef(days);
  const mountedRef = useRef(true);

  fetcherRef.current = fetcher;

  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  // Reset to page 1 when data changes (new fetch, days change, etc.)
  useEffect(() => {
    if (paginate) setPage(1);
  }, [days, paginate]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current(daysRef.current);
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [days, refresh]);

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginatedData = useMemo(() => {
    if (!paginate) return data;
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, paginate, safePage, pageSize]);

  const hasNextPage = safePage < totalPages;
  const hasPrevPage = safePage > 1;

  const goToPage = useCallback(
    (p: number) => setPage(Math.max(1, Math.min(p, totalPages))),
    [totalPages],
  );

  const nextPage = useCallback(() => {
    if (hasNextPage) setPage((p) => p + 1);
  }, [hasNextPage]);

  const prevPage = useCallback(() => {
    if (hasPrevPage) setPage((p) => p - 1);
  }, [hasPrevPage]);

  const changePageSize = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  return {
    data,
    paginatedData,
    loading,
    error,
    refresh,
    setDays,
    days,
    page: safePage,
    pageSize,
    totalPages,
    hasNextPage,
    hasPrevPage,
    setPage: goToPage,
    nextPage,
    prevPage,
    setPageSize: changePageSize,
  };
}
