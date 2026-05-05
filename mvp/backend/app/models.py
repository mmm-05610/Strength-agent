from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ExerciseSet(BaseModel):
    exercise_name: str
    equipment: str
    sets: int = Field(ge=1)
    reps: int = Field(ge=1)
    weight_kg: float = Field(ge=0)
    rpe: float | None = Field(default=None, ge=1, le=10)


class WorkoutSessionCreate(BaseModel):
    training_date: date
    focus_area: str
    notes: str = ""
    exercise_sets: list[ExerciseSet]


class WorkoutSession(BaseModel):
    id: int
    training_date: date
    focus_area: str
    notes: str
    exercise_sets: list[ExerciseSet]
    created_at: datetime


class WorkoutSessionUpdate(BaseModel):
    training_date: date | None = None
    focus_area: str | None = None
    notes: str | None = None
    exercise_sets: list[ExerciseSet] | None = None


class ReadinessLogCreate(BaseModel):
    log_date: date
    sleep_hours: float = Field(ge=0, le=24)
    fatigue_score: int = Field(ge=1, le=10)
    pain_score: int = Field(ge=1, le=10)
    stress_score: int = Field(ge=1, le=10)


class ReadinessLog(BaseModel):
    id: int
    log_date: date
    sleep_hours: float
    fatigue_score: int
    pain_score: int
    stress_score: int
    created_at: datetime


class ReadinessLogUpdate(BaseModel):
    log_date: date | None = None
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    fatigue_score: int | None = Field(default=None, ge=1, le=10)
    pain_score: int | None = Field(default=None, ge=1, le=10)
    stress_score: int | None = Field(default=None, ge=1, le=10)


class NutritionLogCreate(BaseModel):
    model_config = ConfigDict(extra="allow")

    log_date: date
    calories_kcal: int = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    water_liters: float = Field(ge=0)
    notes: str = ""


class NutritionLog(NutritionLogCreate):
    id: int
    created_at: datetime


class NutritionLogUpdate(BaseModel):
    log_date: date | None = None
    calories_kcal: int | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    water_liters: float | None = Field(default=None, ge=0)
    notes: str | None = None


class KnowledgeAssetCreate(BaseModel):
    asset_type: Literal["inbody_image", "training_plan", "nutrition_note", "other"]
    title: str
    source_path: str
    tags: list[str] = Field(default_factory=list)
    captured_on: date | None = None


class KnowledgeAsset(KnowledgeAssetCreate):
    id: int
    created_at: datetime


class BodyMetricCreate(BaseModel):
    log_date: date
    measured_at: datetime | None = None
    body_weight_kg: float | None = Field(default=None, ge=0)
    body_fat_rate_pct: float | None = Field(default=None, ge=0, le=100)
    body_fat_kg: float | None = Field(default=None, ge=0)
    muscle_weight_kg: float | None = Field(default=None, ge=0)
    skeletal_muscle_kg: float | None = Field(default=None, ge=0)
    body_water_kg: float | None = Field(default=None, ge=0)
    protein_kg: float | None = Field(default=None, ge=0)
    minerals_kg: float | None = Field(default=None, ge=0)
    # Segmental muscle
    left_upper_muscle_kg: float | None = Field(default=None, ge=0)
    right_upper_muscle_kg: float | None = Field(default=None, ge=0)
    left_lower_muscle_kg: float | None = Field(default=None, ge=0)
    right_lower_muscle_kg: float | None = Field(default=None, ge=0)
    trunk_muscle_kg: float | None = Field(default=None, ge=0)
    # Segmental fat
    left_upper_fat_kg: float | None = Field(default=None, ge=0)
    right_upper_fat_kg: float | None = Field(default=None, ge=0)
    left_lower_fat_kg: float | None = Field(default=None, ge=0)
    right_lower_fat_kg: float | None = Field(default=None, ge=0)
    trunk_fat_kg: float | None = Field(default=None, ge=0)
    # Measurements
    waist_cm: float | None = Field(default=None, ge=0)
    hip_cm: float | None = Field(default=None, ge=0)
    # Scores
    inbody_score: int | None = Field(default=None, ge=0, le=100)
    bmr_kcal: int | None = Field(default=None, ge=0)
    # Profile
    height_cm: float | None = Field(default=None, ge=50, le=250)
    source: str = "manual"
    source_asset_id: int | None = None


class BodyMetric(BaseModel):
    id: int
    log_date: date
    body_weight_kg: float | None = None
    body_fat_rate_pct: float | None = None
    body_fat_kg: float | None = None
    muscle_weight_kg: float | None = None
    skeletal_muscle_kg: float | None = None
    body_water_kg: float | None = None
    protein_kg: float | None = None
    minerals_kg: float | None = None
    # Segmental muscle
    left_upper_muscle_kg: float | None = None
    right_upper_muscle_kg: float | None = None
    left_lower_muscle_kg: float | None = None
    right_lower_muscle_kg: float | None = None
    trunk_muscle_kg: float | None = None
    # Segmental fat
    left_upper_fat_kg: float | None = None
    right_upper_fat_kg: float | None = None
    left_lower_fat_kg: float | None = None
    right_lower_fat_kg: float | None = None
    trunk_fat_kg: float | None = None
    # Measurements
    waist_cm: float | None = None
    hip_cm: float | None = None
    # Scores
    inbody_score: int | None = None
    bmr_kcal: int | None = None
    # Computed
    bmi: float | None = None
    smi: float | None = None
    whr: float | None = None
    body_assessment: str = ""
    # Meta
    source_asset_id: int | None = None
    measured_at: datetime | None = None
    created_at: datetime | None = None
    image_url: str | None = None


class BodyMetricUpdate(BaseModel):
    log_date: date | None = None
    measured_at: datetime | None = None
    body_weight_kg: float | None = Field(default=None, ge=0)
    body_fat_rate_pct: float | None = Field(default=None, ge=0, le=100)
    body_fat_kg: float | None = Field(default=None, ge=0)
    muscle_weight_kg: float | None = Field(default=None, ge=0)
    skeletal_muscle_kg: float | None = Field(default=None, ge=0)
    body_water_kg: float | None = Field(default=None, ge=0)
    protein_kg: float | None = Field(default=None, ge=0)
    minerals_kg: float | None = Field(default=None, ge=0)
    left_upper_muscle_kg: float | None = Field(default=None, ge=0)
    right_upper_muscle_kg: float | None = Field(default=None, ge=0)
    left_lower_muscle_kg: float | None = Field(default=None, ge=0)
    right_lower_muscle_kg: float | None = Field(default=None, ge=0)
    trunk_muscle_kg: float | None = Field(default=None, ge=0)
    left_upper_fat_kg: float | None = Field(default=None, ge=0)
    right_upper_fat_kg: float | None = Field(default=None, ge=0)
    left_lower_fat_kg: float | None = Field(default=None, ge=0)
    right_lower_fat_kg: float | None = Field(default=None, ge=0)
    trunk_fat_kg: float | None = Field(default=None, ge=0)
    waist_cm: float | None = Field(default=None, ge=0)
    hip_cm: float | None = Field(default=None, ge=0)
    inbody_score: int | None = Field(default=None, ge=0, le=100)
    bmr_kcal: int | None = Field(default=None, ge=0)
    height_cm: float | None = Field(default=None, ge=50, le=250)
    source_asset_id: int | None = None


class BodyMetricOcrResponse(BaseModel):
    status: Literal["ok", "needs_review", "not_configured", "not_supported", "error"]
    message: str = ""
    asset: KnowledgeAsset
    metric: BodyMetric
    raw_output: str | None = None


class CycleDayPlan(BaseModel):
    day_index: int = Field(ge=1)
    label: str = ""
    is_training: bool = False
    focus_area: str = "rest"


class WeeklyPlanUpdate(BaseModel):
    cycle_week: int = Field(ge=1)
    next_training_time: str
    weekly_plan: dict[str, str]
    cycle_length_days: int = Field(default=7, ge=7, le=28)
    cycle_start_date: date = Field(default_factory=date.today)
    cycle_day_plan: list[CycleDayPlan] = Field(default_factory=list)


class PlanState(BaseModel):
    cycle_week: int
    next_training_time: str
    weekly_plan: dict[str, str]
    cycle_length_days: int = 7
    cycle_start_date: date
    cycle_day_plan: list[CycleDayPlan] = Field(default_factory=list)


class ChangeProposalCreate(BaseModel):
    field_path: str
    new_value: Any
    reason: str
    initiator: Literal["ai", "user"] = "ai"
    change_category: str = "profile"


class ChangeProposal(BaseModel):
    id: int
    field_path: str
    old_value: Any
    new_value: Any
    reason: str
    initiator: Literal["ai", "user"]
    status: Literal["pending", "approved", "rejected"]
    change_category: str = "profile"
    created_at: datetime
    resolved_at: datetime | None = None


class ApproveProposalRequest(BaseModel):
    approved_by: Literal["user"] = "user"
    rejected: bool = False
    confirm_token: str | None = None


class AuditLogEntry(BaseModel):
    id: int
    actor: Literal["ai", "user", "system"]
    action: str
    field_path: str
    old_value: Any
    new_value: Any
    evidence: str
    created_at: datetime


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    enable_rag: bool = True
    enable_profile: bool = True
    thinking_mode: bool = False
    model: str | None = None
    images: list[str] | None = None  # base64-encoded images for vision


class ProfileExtractionResponse(BaseModel):
    changes: list[dict] = Field(default_factory=list)


class RagSource(BaseModel):
    kb_name: str
    title: str
    snippet: str
    score: float


class ChatMetaResponse(BaseModel):
    rag_sources: list[RagSource] = Field(default_factory=list)
    route_tier: str
    estimated_cost_rmb: float
    tokens_used: int = 0
    thinking_time_ms: int = 0
    thinking_process: str = ""


class ChatHistoryMessage(BaseModel):
    id: int
    user_id: str
    role: str
    content: str
    tokens_used: int | None = None
    thinking_time_ms: int | None = None
    thinking_process: str | None = None
    rag_sources: list[dict] | None = None
    created_at: str


class ChatHistoryResponse(BaseModel):
    messages: list[ChatHistoryMessage] = Field(default_factory=list)
    total_count: int = 0


class DashboardResponse(BaseModel):
    today_training: dict
    recovery: dict
    nutrition: dict
    goal_progress: dict
    weight_trend: list[dict] = Field(default_factory=list)
    body_metrics: dict = Field(default_factory=dict)
    cost_status: dict = Field(default_factory=dict)


class AiRecommendationRequest(BaseModel):
    user_query: str
    route_preference: Literal["auto", "l1", "l2"] = "auto"


class AiRecommendationResponse(BaseModel):
    route_tier: Literal["l0", "l1", "l2"]
    model: str
    reason: str
    content: str
    estimated_cost_rmb: float


class TodayDashboard(BaseModel):
    today_training: bool
    next_training_time: str
    today_recommendation: dict[str, Any]
    budget_status: dict[str, Any]


class GoalConfig(BaseModel):
    goal_type: Literal["muscle_gain", "fat_loss", "maintenance"] = "muscle_gain"
    start_date: date
    target_date: date
    start_weight_kg: float = Field(ge=0)
    target_weight_kg: float = Field(ge=0)
    start_muscle_kg: float | None = Field(default=None, ge=0)
    target_muscle_kg: float | None = Field(default=None, ge=0)
    latest_muscle_kg: float | None = Field(default=None, ge=0)


class GoalProgress(BaseModel):
    goal_type: Literal["muscle_gain", "fat_loss", "maintenance"]
    start_date: date
    target_date: date
    days_remaining: int
    current_weight_kg: float
    target_weight_kg: float
    weight_gap_kg: float
    current_muscle_kg: float | None = None
    target_muscle_kg: float | None = None
    muscle_gap_kg: float | None = None
    required_weekly_weight_change_kg: float | None = None
    actual_weekly_weight_change_kg: float | None = None
    progress_label: Literal["健康", "过慢", "超额", "数据不足"]
    summary: str
