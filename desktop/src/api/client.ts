const API_BASE = "http://127.0.0.1:18720/api/v1";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RagSource {
  kb_name: string;
  title: string;
  snippet: string;
  score: number;
}

export interface ChatResponse {
  content: string;
  rag_sources: RagSource[];
  route_tier: string;
  estimated_cost_rmb: number;
}

export interface DashboardData {
  today_training: {
    is_training_day: boolean;
    completed: boolean;
    focus_area: string;
    recommendation: string;
  };
  recovery: {
    sleep_hours: number;
    fatigue_score: number;
    pain_score: number;
    stress_score: number;
    log_date: string;
  };
  nutrition: {
    calories_kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    water_liters: number;
    body_weight_kg: number | null;
    log_date: string;
  };
  goal_progress: {
    goal_type: string;
    current_weight_kg: number;
    target_weight_kg: number;
    weight_gap_kg: number;
    days_remaining: number;
    progress_label: string;
    summary: string;
    actual_weekly_weight_change_kg: number | null;
    required_weekly_weight_change_kg: number | null;
    current_muscle_kg: number | null;
    target_muscle_kg: number | null;
    muscle_gap_kg: number | null;
    target_date?: string;
    start_date?: string;
  };
  weight_trend: Array<{
    log_date: string;
    body_weight_kg: number;
  }>;
  body_metrics: {
    body_weight_kg: number | null;
    body_fat_rate_pct: number | null;
    body_fat_kg: number | null;
    muscle_weight_kg: number | null;
    skeletal_muscle_kg: number | null;
    body_water_kg: number | null;
    protein_kg: number | null;
    minerals_kg: number | null;
    left_upper_muscle_kg: number | null;
    right_upper_muscle_kg: number | null;
    left_lower_muscle_kg: number | null;
    right_lower_muscle_kg: number | null;
    trunk_muscle_kg: number | null;
    left_upper_fat_kg: number | null;
    right_upper_fat_kg: number | null;
    left_lower_fat_kg: number | null;
    right_lower_fat_kg: number | null;
    trunk_fat_kg: number | null;
    waist_cm: number | null;
    hip_cm: number | null;
    inbody_score: number | null;
    bmr_kcal: number | null;
    bmi: number | null;
    smi: number | null;
    whr: number | null;
    body_assessment: string;
    height_cm: number | null;
    measured_at: string | null;
    source: string;
  };
  cost_status: {
    monthly_budget_rmb: number;
    spent_rmb: number;
    remaining_rmb: number;
  };
}

export interface ChangeProposal {
  id: number;
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  status: "pending" | "approved" | "rejected";
  change_category: string;
  created_at: string;
  resolved_at: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

export interface ChatMeta {
  rag_sources: RagSource[];
  route_tier: string;
  cost: number;
  tokens_used: number;
  thinking_time_ms: number;
  thinking_process: string;
}

export interface ToolCallEvent {
  id: string;
  tool_name: string;
  arguments: string;
  result?: {
    success?: boolean;
    message?: string;
    error?: string;
    rendered?: string;
    form_schema?: Record<string, unknown>;
    chart_config?: Record<string, unknown>;
  };
}

export interface SendMessageOptions {
  thinkingMode?: boolean;
  model?: string;
  images?: string[];
}

export async function sendMessage(
  messages: ChatMessage[],
  onToken: (token: string) => void,
  onDone: (meta: ChatMeta) => void,
  onError: (err: string) => void,
  onThinking?: (token: string) => void,
  onToolCall?: (call: ToolCallEvent) => void,
  onToolResult?: (id: string, result: ToolCallEvent["result"]) => void,
  options?: SendMessageOptions,
): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      messages,
      enable_rag: true,
      enable_profile: true,
      thinking_mode: options?.thinkingMode ?? false,
    };
    if (options?.model) body.model = options.model;
    if (options?.images?.length) body.images = options.images;

    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let doneCalled = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "token") {
            onToken(parsed.content);
          } else if (parsed.type === "thinking") {
            onThinking?.(parsed.content);
          } else if (parsed.type === "tool_call") {
            onToolCall?.({
              id: parsed.id,
              tool_name: parsed.tool_name,
              arguments: parsed.arguments,
            });
          } else if (parsed.type === "tool_result") {
            onToolResult?.(parsed.id, parsed.result);
          } else if (parsed.type === "meta") {
            if (!doneCalled) {
              doneCalled = true;
              onDone({
                rag_sources: parsed.rag_sources || [],
                route_tier: parsed.route_tier,
                cost: parsed.estimated_cost_rmb,
                tokens_used: parsed.tokens_used ?? 0,
                thinking_time_ms: parsed.thinking_time_ms ?? 0,
                thinking_process: parsed.thinking_process ?? "",
              });
            }
          } else if (parsed.type === "error") {
            onError(parsed.message);
          }
        } catch {
          // Malformed JSON — log for debugging but don't break the stream
          if (data.length < 200) {
            console.warn("[SSE] Failed to parse:", data);
          } else {
            console.warn("[SSE] Failed to parse chunk of length", data.length);
          }
        }
      }
    }
    // If stream ended without a meta event, call onDone with empty data
    if (!doneCalled) {
      onDone({
        rag_sources: [],
        route_tier: "",
        cost: 0,
        tokens_used: 0,
        thinking_time_ms: 0,
        thinking_process: "",
      });
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function fetchDashboard(): Promise<DashboardData> {
  return request<DashboardData>("/dashboard");
}

export async function approveChangeProposal(
  id: number,
): Promise<ChangeProposal> {
  return request<ChangeProposal>(`/change-proposals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved_by: "user" }),
  });
}

export async function rejectChangeProposal(
  id: number,
): Promise<ChangeProposal> {
  return request<ChangeProposal>(`/change-proposals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved_by: "user", rejected: true }),
  });
}

export async function fetchPendingProposals(): Promise<ChangeProposal[]> {
  return request<ChangeProposal[]>("/change-proposals?status=pending");
}

export interface ChatHistoryMessage {
  id: number;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  tokens_used: number | null;
  thinking_time_ms: number | null;
  thinking_process: string | null;
  rag_sources: RagSource[] | null;
  created_at: string;
}

export interface ChatHistoryResponse {
  messages: ChatHistoryMessage[];
  total_count: number;
}

export async function fetchChatHistory(
  userId: string = "default",
): Promise<ChatHistoryResponse> {
  return request<ChatHistoryResponse>(
    `/chat/history?user_id=${encodeURIComponent(userId)}`,
  );
}

export interface ExerciseSet {
  exercise_name: string;
  equipment: string;
  sets: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
}

export interface WorkoutSession {
  id: number;
  training_date: string;
  focus_area: string;
  notes: string;
  exercise_sets: ExerciseSet[];
  created_at: string;
}

export async function fetchWorkouts(
  days: number = 30,
): Promise<WorkoutSession[]> {
  return request<WorkoutSession[]>(`/workouts?days=${days}`);
}

export interface NutritionLogCreate {
  log_date: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_liters: number;
}

export interface ReadinessLogCreate {
  log_date: string;
  sleep_hours: number;
  fatigue_score: number;
  pain_score: number;
  stress_score: number;
}

export interface BodyMetricCreate {
  log_date: string;
  body_weight_kg?: number | null;
  body_fat_rate_pct?: number | null;
  body_fat_kg?: number | null;
  muscle_weight_kg?: number | null;
  skeletal_muscle_kg?: number | null;
  body_water_kg?: number | null;
  protein_kg?: number | null;
  minerals_kg?: number | null;
  height_cm?: number | null;
  left_upper_muscle_kg?: number | null;
  right_upper_muscle_kg?: number | null;
  left_lower_muscle_kg?: number | null;
  right_lower_muscle_kg?: number | null;
  trunk_muscle_kg?: number | null;
  left_upper_fat_kg?: number | null;
  right_upper_fat_kg?: number | null;
  left_lower_fat_kg?: number | null;
  right_lower_fat_kg?: number | null;
  trunk_fat_kg?: number | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  inbody_score?: number | null;
  bmr_kcal?: number | null;
  source?: string;
  source_asset_id?: number | null;
}

/** @deprecated Use useActions().dispatch("nutrition.create", data) instead */
export async function createNutritionLog(data: NutritionLogCreate) {
  return request("/nutrition", { method: "POST", body: JSON.stringify(data) });
}

/** @deprecated Use useActions().dispatch("readiness.create", data) instead */
export async function createReadinessLog(data: ReadinessLogCreate) {
  return request("/readiness", { method: "POST", body: JSON.stringify(data) });
}

/** @deprecated Use useActions().dispatch("body_metric.upsert", data) instead */
export async function createBodyMetric(data: BodyMetricCreate) {
  return request("/body-metrics", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface BodyMetricHistory {
  id: number;
  log_date: string;
  body_weight_kg: number | null;
  body_fat_rate_pct: number | null;
  body_fat_kg: number | null;
  muscle_weight_kg: number | null;
  skeletal_muscle_kg: number | null;
  body_water_kg: number | null;
  protein_kg: number | null;
  minerals_kg: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  inbody_score: number | null;
  bmr_kcal: number | null;
  bmi: number | null;
  smi: number | null;
  whr: number | null;
  height_cm: number | null;
  measured_at: string | null;
  created_at: string | null;
  source: string;
}

export async function fetchBodyMetrics(
  days = 30,
): Promise<BodyMetricHistory[]> {
  return request<BodyMetricHistory[]>(`/body-metrics?days=${days}`);
}

/** @deprecated Use useActions().dispatch("workout.create", data) instead */
export async function createWorkout(data: {
  training_date: string;
  focus_area: string;
  notes?: string;
  exercise_sets: ExerciseSet[];
}) {
  return request("/workouts", { method: "POST", body: JSON.stringify(data) });
}

export interface NutritionLogEntry {
  id: number;
  log_date: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_liters: number;
  notes: string;
  created_at: string;
}

export interface ReadinessLogEntry {
  id: number;
  log_date: string;
  sleep_hours: number;
  fatigue_score: number;
  pain_score: number;
  stress_score: number;
  created_at: string;
}

export interface GoalConfig {
  goal_type: "muscle_gain" | "fat_loss" | "maintenance";
  start_date: string;
  target_date: string;
  start_weight_kg: number;
  target_weight_kg: number;
  start_muscle_kg: number | null;
  target_muscle_kg: number | null;
  latest_muscle_kg: number | null;
}

export interface CycleDayPlan {
  day: number;
  focus: string;
  exercises: string[];
}

export interface PlanState {
  cycle_week: number;
  next_training_time: string;
  weekly_plan: Record<string, string>;
  cycle_length_days: number;
  cycle_start_date: string;
  cycle_day_plan: CycleDayPlan[];
}

export async function fetchPlanState(): Promise<PlanState> {
  return request<PlanState>("/plan");
}

export async function fetchNutritionHistory(
  days: number = 30,
): Promise<NutritionLogEntry[]> {
  return request<NutritionLogEntry[]>(`/nutrition?days=${days}`);
}

export async function fetchReadinessHistory(
  days: number = 30,
): Promise<ReadinessLogEntry[]> {
  return request<ReadinessLogEntry[]>(`/readiness?days=${days}`);
}

export async function fetchGoalConfig(): Promise<GoalConfig> {
  return request<GoalConfig>("/goals");
}

/** @deprecated Use useActions().dispatch("goal.update", data) instead */
export async function updateGoalConfig(data: GoalConfig) {
  return request("/goals", { method: "POST", body: JSON.stringify(data) });
}

export async function clearChatHistory(
  keepLatest: number = 50,
  userId: string = "default",
): Promise<{ deleted: number; message: string }> {
  return request<{ deleted: number; message: string }>(
    `/chat/history?user_id=${encodeURIComponent(userId)}&keep_latest=${keepLatest}`,
    { method: "DELETE" },
  );
}

// --- Update/Delete interfaces ---

export interface WorkoutSessionUpdate {
  training_date?: string | null;
  focus_area?: string | null;
  notes?: string | null;
  exercise_sets?: ExerciseSet[] | null;
}

export interface NutritionLogUpdate {
  log_date?: string | null;
  calories_kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  water_liters?: number | null;
  notes?: string | null;
}

export interface ReadinessLogUpdate {
  log_date?: string | null;
  sleep_hours?: number | null;
  fatigue_score?: number | null;
  pain_score?: number | null;
  stress_score?: number | null;
}

export interface BodyMetricUpdate {
  log_date?: string | null;
  body_weight_kg?: number | null;
  body_fat_rate_pct?: number | null;
  body_fat_kg?: number | null;
  muscle_weight_kg?: number | null;
  skeletal_muscle_kg?: number | null;
  body_water_kg?: number | null;
  protein_kg?: number | null;
  minerals_kg?: number | null;
  left_upper_muscle_kg?: number | null;
  right_upper_muscle_kg?: number | null;
  left_lower_muscle_kg?: number | null;
  right_lower_muscle_kg?: number | null;
  trunk_muscle_kg?: number | null;
  left_upper_fat_kg?: number | null;
  right_upper_fat_kg?: number | null;
  left_lower_fat_kg?: number | null;
  right_lower_fat_kg?: number | null;
  trunk_fat_kg?: number | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  inbody_score?: number | null;
  bmr_kcal?: number | null;
  height_cm?: number | null;
  source_asset_id?: number | null;
}

// --- Update/Delete API functions ---

export async function updateWorkout(id: number, data: WorkoutSessionUpdate) {
  return request<WorkoutSession>(`/workouts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteWorkout(id: number) {
  return request<{ ok: boolean; deleted_workout_id: number }>(
    `/workouts/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function updateNutritionLog(id: number, data: NutritionLogUpdate) {
  return request<NutritionLogEntry>(`/nutrition/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteNutritionLog(id: number) {
  return request<{ ok: boolean; deleted_nutrition_id: number }>(
    `/nutrition/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function updateReadinessLog(id: number, data: ReadinessLogUpdate) {
  return request<ReadinessLogEntry>(`/readiness/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteReadinessLog(id: number) {
  return request<{ ok: boolean; deleted_readiness_id: number }>(
    `/readiness/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function updateBodyMetric(id: number, data: BodyMetricUpdate) {
  return request<BodyMetricHistory>(`/body-metrics/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteBodyMetric(id: number) {
  return request<{ ok: boolean; deleted_metric_id: number }>(
    `/body-metrics/${id}`,
    {
      method: "DELETE",
    },
  );
}
