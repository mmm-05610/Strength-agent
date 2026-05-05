import { useState, useCallback, useRef } from "react";

export interface MutationOptions<TData, TVariables> {
  /** The async mutation function (create, update, or delete) */
  mutationFn: (input: TVariables) => Promise<TData>;
  /**
   * Called before mutation. Optionally returns a rollback function
   * that restores state if the mutation fails.
   */
  onMutate?: (input: TVariables) => (() => void) | void;
  /** Called on mutation success */
  onSuccess?: (result: TData) => void;
  /** Called on mutation error (after rollback) */
  onError?: (error: Error) => void;
  /** Called after success to refresh stale data */
  refreshOnSuccess?: () => Promise<void>;
}

export interface MutationState<TData, TVariables> {
  /** Execute the mutation with optimistic update, rollback, and refresh */
  mutate: (input: TVariables) => Promise<TData | undefined>;
  /** True while mutation is in flight */
  isMutating: boolean;
  /** Latest error message, or null if no error */
  error: string | null;
  /** Clear the error state */
  resetError: () => void;
}

/**
 * Generic optimistic mutation hook.
 *
 * Automates the optimistic-update-with-rollback pattern used across
 * NutritionPage, RecoveryPage, TrainingPage, etc.
 *
 * @example
 * ```ts
 * const { mutate: save, isMutating } = useOptimisticMutation({
 *   mutationFn: (form) => updateNutritionLog(editingId, form),
 *   onMutate: () => {
 *     const snapshot = [...history];
 *     return () => setHistory(snapshot); // rollback
 *   },
 *   onSuccess: () => { setShowForm(false); setEditingId(null); },
 *   refreshOnSuccess: () => Promise.all([refreshHistory(), onRefresh()]).then(),
 * });
 * ```
 */
export function useOptimisticMutation<TData, TVariables>(
  options: MutationOptions<TData, TVariables>,
): MutationState<TData, TVariables> {
  const { mutationFn, onMutate, onSuccess, onError, refreshOnSuccess } =
    options;
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rollbackRef = useRef<(() => void) | null>(null);

  const mutate = useCallback(
    async (input: TVariables): Promise<TData | undefined> => {
      setIsMutating(true);
      setError(null);
      rollbackRef.current = null;

      // Execute optimistic update and capture rollback
      try {
        const rollback = onMutate?.(input);
        if (rollback) rollbackRef.current = rollback;
      } catch (optimisticErr) {
        // If the optimistic update itself throws, surface it
        const msg =
          optimisticErr instanceof Error
            ? optimisticErr.message
            : "Optimistic update failed";
        setError(msg);
        setIsMutating(false);
        return undefined;
      }

      try {
        const result = await mutationFn(input);
        onSuccess?.(result);
        if (refreshOnSuccess) {
          await refreshOnSuccess();
        }
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Mutation failed";
        setError(errorMsg);
        // Rollback optimistic update
        rollbackRef.current?.();
        onError?.(err instanceof Error ? err : new Error(errorMsg));
        return undefined;
      } finally {
        setIsMutating(false);
        rollbackRef.current = null;
      }
    },
    [mutationFn, onMutate, onSuccess, onError, refreshOnSuccess],
  );

  const resetError = useCallback(() => setError(null), []);

  return { mutate, isMutating, error, resetError };
}
