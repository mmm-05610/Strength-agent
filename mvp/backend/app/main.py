from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
import os
import time
import uuid
from typing import Any

import requests
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, selectinload

from .db import get_db, get_setting, init_db, list_settings, set_setting
from .entities import (
    AuditLogEntity,
    BodyMetricEntity,
    ChangeProposalEntity,
    ChatMessageEntity,
    KnowledgeAssetEntity,
    LlmUsageLogEntity,
    NutritionLogEntity,
    ReadinessLogEntity,
    WorkoutSessionEntity,
    WorkoutSetEntity,
)
from .models import (
    AiRecommendationRequest,
    AiRecommendationResponse,
    ApproveProposalRequest,
    AuditLogEntry,
    BodyMetric,
    BodyMetricCreate,
    BodyMetricOcrResponse,
    BodyMetricUpdate,
    ChangeProposal,
    ChangeProposalCreate,
    ChatHistoryMessage,
    ChatHistoryResponse,
    ChatMessage,
    ChatRequest,
    DashboardResponse,
    ExerciseSet,
    KnowledgeAsset,
    KnowledgeAssetCreate,
    NutritionLog,
    NutritionLogCreate,
    NutritionLogUpdate,
    GoalConfig,
    GoalProgress,
    PlanState,
    CycleDayPlan,
    ReadinessLog,
    ReadinessLogCreate,
    ReadinessLogUpdate,
    TodayDashboard,
    WeeklyPlanUpdate,
    WorkoutSession,
    WorkoutSessionCreate,
    WorkoutSessionUpdate,
)
from .rule_engine import suggest_today_plan
from .services.cost_router import estimate_cost_rmb, get_month_spent_rmb, load_cost_config, pick_tier
from .services.deepseek_client import DeepSeekClient
from .services.inbody_ocr import run_inbody_ocr_with_volcengine
from .services.volcengine_ocr_client import VolcengineOcrClient
from .services.rag_pipeline import rag_pipeline as _rag_pipeline
from .services.profile_aggregator import aggregate_user_profile, profile_to_prompt_context
from .services.profile_extractor import extract_profile_changes


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue

        cleaned = value.strip().strip('"').strip("'")
        os.environ[key] = cleaned


_load_local_env()

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", "8388608"))
ALLOWED_IMAGE_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

app = FastAPI(title="Fitness Agent MVP", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

cost_config = load_cost_config()
deepseek_client = DeepSeekClient()
volcengine_ocr_client = VolcengineOcrClient()


DEFAULT_GOAL_TRACKING = {
    "goal_type": "muscle_gain",
    "start_date": "2026-04-16",
    "target_date": "2026-07-01",
    "start_weight_kg": 65.0,
    "target_weight_kg": 73.0,
    "start_muscle_kg": 31.9,
    "target_muscle_kg": 35.0,
    "latest_muscle_kg": 31.9,
}

WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    # Preload RAG knowledge base in background
    import threading
    threading.Thread(target=_rag_pipeline.ensure_loaded, daemon=True).start()


def _to_workout_schema(item: WorkoutSessionEntity) -> WorkoutSession:
    return WorkoutSession(
        id=item.id,
        training_date=item.training_date,
        focus_area=item.focus_area,
        notes=item.notes,
        created_at=item.created_at,
        exercise_sets=[
            ExerciseSet(
                exercise_name=s.exercise_name,
                equipment=s.equipment,
                sets=s.sets,
                reps=s.reps,
                weight_kg=float(s.weight_kg),
                rpe=s.rpe,
            )
            for s in item.exercise_sets
        ],
    )


def _to_readiness_schema(item: ReadinessLogEntity) -> ReadinessLog:
    return ReadinessLog(
        id=item.id,
        log_date=item.log_date,
        sleep_hours=item.sleep_hours,
        fatigue_score=item.fatigue_score,
        pain_score=item.pain_score,
        stress_score=item.stress_score,
        created_at=item.created_at,
    )


def _to_nutrition_schema(item: NutritionLogEntity) -> NutritionLog:
    return NutritionLog(
        id=item.id,
        log_date=item.log_date,
        calories_kcal=item.calories_kcal,
        protein_g=item.protein_g,
        carbs_g=item.carbs_g,
        fat_g=item.fat_g,
        water_liters=item.water_liters,
        body_weight_kg=item.body_weight_kg,
        body_fat_rate_pct=item.body_fat_rate_pct,
        muscle_weight_kg=item.muscle_weight_kg,
        waist_cm=item.waist_cm,
        notes=item.notes,
        created_at=item.created_at,
    )


def _to_knowledge_schema(item: KnowledgeAssetEntity) -> KnowledgeAsset:
    return KnowledgeAsset(
        id=item.id,
        asset_type=item.asset_type,
        title=item.title,
        source_path=item.source_path,
        tags=item.tags or [],
        captured_on=item.captured_on,
        created_at=item.created_at,
    )


def _image_url_for_asset(asset: KnowledgeAssetEntity | None) -> str | None:
    if asset is None:
        return None

    raw = str(asset.source_path or "").replace("\\", "/")
    if raw.startswith("uploads/"):
        return f"/uploads/{raw.split('/', 1)[1]}"
    return None


def _local_upload_path_from_source(source_path: str | None) -> Path | None:
    raw = str(source_path or "").replace("\\", "/").strip()
    if not raw.startswith("uploads/"):
        return None

    rel = raw.split("/", 1)[1]
    candidate = (UPLOAD_DIR / rel).resolve()
    upload_root = UPLOAD_DIR.resolve()
    if upload_root not in candidate.parents and candidate != upload_root:
        return None
    return candidate


def _delete_asset_and_file(db: Session, asset: KnowledgeAssetEntity) -> None:
    db.query(BodyMetricEntity).filter(BodyMetricEntity.source_asset_id == asset.id).update({"source_asset_id": None})

    local_path = _local_upload_path_from_source(asset.source_path)
    if local_path and local_path.is_file():
        try:
            local_path.unlink()
        except OSError:
            pass

    db.delete(asset)


def _compute_bmi(weight_kg: float | None, height_cm: float) -> float | None:
    if weight_kg is None or height_cm <= 0:
        return None
    return round(weight_kg / ((height_cm / 100) ** 2), 1)


def _compute_smi(skeletal_muscle_kg: float | None, height_cm: float) -> float | None:
    if skeletal_muscle_kg is None or height_cm <= 0:
        return None
    return round(skeletal_muscle_kg / ((height_cm / 100) ** 2), 2)


def _compute_whr(waist_cm: float | None, hip_cm: float | None) -> float | None:
    if waist_cm is None or hip_cm is None or hip_cm <= 0:
        return None
    return round(waist_cm / hip_cm, 2)


def _generate_body_assessment(
    bmi: float | None,
    body_fat_pct: float | None,
    inbody_score: int | None,
    skeletal_muscle_kg: float | None,
) -> str:
    """Generate a fun, encouraging body nickname based on composition data."""
    import random

    if bmi is None:
        return "神秘体质"

    # High score → athletic tier regardless of other metrics
    if inbody_score is not None and inbody_score >= 80:
        return random.choice([
            "运动健将", "肌肉达人", "力量之星",
            "钢铁战士", "健身模范", "体能冠军",
        ])

    if bmi < 18.5:
        pool = ["轻盈少年", "小旋风", "风之使者", "小辣椒", "闪电侠", "纸片超人"]
    elif bmi < 24:
        if body_fat_pct is not None and body_fat_pct < 15 and skeletal_muscle_kg is not None and skeletal_muscle_kg > 30:
            pool = ["肌肉线条", "精钢芭比", "小钢炮", "肌肉猎豹", "铁块", "力与美"]
        elif body_fat_pct is not None and body_fat_pct < 20:
            pool = ["健康之星", "活力达人", "元气满满", "运动阳光", "标准模板", "轻盈力量"]
        else:
            pool = ["温柔力量", "软萌健将", "健康小胖", "圆润小可爱", "温和小暖"]
    elif bmi < 28:
        pool = ["可爱多", "小圆润", "敦实小将", "温暖小胖", "大力水手", "稳重如山"]
    else:
        pool = ["重量级守护者", "快乐大宝贝", "霸气侧漏", "圆圆满满", "敦厚力量", "大可爱"]

    return random.choice(pool)


def _to_body_metric_schema(item: BodyMetricEntity, asset: KnowledgeAssetEntity | None = None) -> BodyMetric:
    height_cm_raw = _get_setting_standalone("height_cm")
    height_cm = float(height_cm_raw) if height_cm_raw else 170.0

    bmi = _compute_bmi(item.body_weight_kg, height_cm)
    smi = _compute_smi(item.skeletal_muscle_kg, height_cm)
    whr = _compute_whr(item.waist_cm, item.hip_cm)
    assessment = _generate_body_assessment(bmi, item.body_fat_rate_pct, item.inbody_score, item.skeletal_muscle_kg)

    return BodyMetric(
        id=item.id,
        log_date=item.log_date,
        body_weight_kg=item.body_weight_kg,
        body_fat_rate_pct=item.body_fat_rate_pct,
        body_fat_kg=item.body_fat_kg,
        muscle_weight_kg=item.muscle_weight_kg,
        skeletal_muscle_kg=item.skeletal_muscle_kg,
        body_water_kg=item.body_water_kg,
        protein_kg=item.protein_kg,
        minerals_kg=item.minerals_kg,
        left_upper_muscle_kg=item.left_upper_muscle_kg,
        right_upper_muscle_kg=item.right_upper_muscle_kg,
        left_lower_muscle_kg=item.left_lower_muscle_kg,
        right_lower_muscle_kg=item.right_lower_muscle_kg,
        trunk_muscle_kg=item.trunk_muscle_kg,
        left_upper_fat_kg=item.left_upper_fat_kg,
        right_upper_fat_kg=item.right_upper_fat_kg,
        left_lower_fat_kg=item.left_lower_fat_kg,
        right_lower_fat_kg=item.right_lower_fat_kg,
        trunk_fat_kg=item.trunk_fat_kg,
        waist_cm=item.waist_cm,
        hip_cm=item.hip_cm,
        inbody_score=item.inbody_score,
        bmr_kcal=item.bmr_kcal,
        bmi=bmi,
        smi=smi,
        whr=whr,
        body_assessment=assessment,
        source_asset_id=item.source_asset_id,
        created_at=item.created_at,
    )


def _parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [x.strip() for x in str(raw).split(",") if x.strip()]


def _get_setting_standalone(key: str, default=None):
    """Read a setting outside of request context (opens its own session)."""
    from .db import SessionLocal as _SL, get_setting as _gs
    s = _SL()
    try:
        return _gs(s, key, default)
    finally:
        s.close()


def _upsert_body_metric(
    db: Session,
    log_date: date,
    body_weight_kg: float | None = None,
    body_fat_rate_pct: float | None = None,
    body_fat_kg: float | None = None,
    muscle_weight_kg: float | None = None,
    skeletal_muscle_kg: float | None = None,
    body_water_kg: float | None = None,
    protein_kg: float | None = None,
    minerals_kg: float | None = None,
    left_upper_muscle_kg: float | None = None,
    right_upper_muscle_kg: float | None = None,
    left_lower_muscle_kg: float | None = None,
    right_lower_muscle_kg: float | None = None,
    trunk_muscle_kg: float | None = None,
    left_upper_fat_kg: float | None = None,
    right_upper_fat_kg: float | None = None,
    left_lower_fat_kg: float | None = None,
    right_lower_fat_kg: float | None = None,
    trunk_fat_kg: float | None = None,
    waist_cm: float | None = None,
    hip_cm: float | None = None,
    inbody_score: int | None = None,
    bmr_kcal: int | None = None,
    source_asset_id: int | None = None,
) -> BodyMetricEntity:
    existing = db.scalar(select(BodyMetricEntity).where(BodyMetricEntity.log_date == log_date))
    if existing is not None:
        for field_name in (
            "body_weight_kg", "body_fat_rate_pct", "body_fat_kg", "muscle_weight_kg",
            "skeletal_muscle_kg", "body_water_kg", "protein_kg", "minerals_kg",
            "left_upper_muscle_kg", "right_upper_muscle_kg",
            "left_lower_muscle_kg", "right_lower_muscle_kg", "trunk_muscle_kg",
            "left_upper_fat_kg", "right_upper_fat_kg",
            "left_lower_fat_kg", "right_lower_fat_kg", "trunk_fat_kg",
            "waist_cm", "hip_cm", "inbody_score", "bmr_kcal", "source_asset_id",
        ):
            val = locals().get(field_name)
            if val is not None:
                setattr(existing, field_name, val)
        db.flush()
        db.refresh(existing)
        return existing

    item = BodyMetricEntity(
        log_date=log_date,
        body_weight_kg=body_weight_kg,
        body_fat_rate_pct=body_fat_rate_pct,
        body_fat_kg=body_fat_kg,
        muscle_weight_kg=muscle_weight_kg,
        skeletal_muscle_kg=skeletal_muscle_kg,
        body_water_kg=body_water_kg,
        protein_kg=protein_kg,
        minerals_kg=minerals_kg,
        left_upper_muscle_kg=left_upper_muscle_kg,
        right_upper_muscle_kg=right_upper_muscle_kg,
        left_lower_muscle_kg=left_lower_muscle_kg,
        right_lower_muscle_kg=right_lower_muscle_kg,
        trunk_muscle_kg=trunk_muscle_kg,
        left_upper_fat_kg=left_upper_fat_kg,
        right_upper_fat_kg=right_upper_fat_kg,
        left_lower_fat_kg=left_lower_fat_kg,
        right_lower_fat_kg=right_lower_fat_kg,
        trunk_fat_kg=trunk_fat_kg,
        waist_cm=waist_cm,
        hip_cm=hip_cm,
        inbody_score=inbody_score,
        bmr_kcal=bmr_kcal,
        source_asset_id=source_asset_id,
    )
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def _to_change_proposal_schema(item: ChangeProposalEntity) -> ChangeProposal:
    return ChangeProposal(
        id=item.id,
        field_path=item.field_path,
        old_value=item.old_value,
        new_value=item.new_value,
        reason=item.reason,
        initiator=item.initiator,
        status=item.status,
        change_category=getattr(item, "change_category", "profile") or "profile",
        created_at=item.created_at,
        resolved_at=item.resolved_at,
    )


def _to_audit_schema(item: AuditLogEntity) -> AuditLogEntry:
    return AuditLogEntry(
        id=item.id,
        actor=item.actor,
        action=item.action,
        field_path=item.field_path,
        old_value=item.old_value,
        new_value=item.new_value,
        evidence=item.evidence,
        created_at=item.created_at,
    )


def _default_cycle_day_plan_from_weekly(weekly_plan: dict[str, str]) -> list[CycleDayPlan]:
    day_plan: list[CycleDayPlan] = []
    for i, key in enumerate(WEEKDAY_KEYS, start=1):
        focus = str(weekly_plan.get(key, "rest"))
        is_training = focus.lower() != "rest"
        day_plan.append(
            CycleDayPlan(
                day_index=i,
                label=f"D{i}",
                is_training=is_training,
                focus_area=focus if is_training else "rest",
            )
        )
    return day_plan


def _normalize_cycle_day_plan(raw: Any, cycle_length_days: int, weekly_plan: dict[str, str]) -> list[CycleDayPlan]:
    if isinstance(raw, list) and raw:
        parsed: list[CycleDayPlan] = []
        for item in raw:
            try:
                d = CycleDayPlan(**item)
            except Exception:
                continue
            if 1 <= d.day_index <= cycle_length_days:
                parsed.append(d)

        if parsed:
            by_idx = {d.day_index: d for d in parsed}
            normalized: list[CycleDayPlan] = []
            for idx in range(1, cycle_length_days + 1):
                existing = by_idx.get(idx)
                if existing is not None:
                    normalized.append(existing)
                else:
                    normalized.append(CycleDayPlan(day_index=idx, label=f"D{idx}", is_training=False, focus_area="rest"))
            return normalized

    base = _default_cycle_day_plan_from_weekly(weekly_plan)
    if cycle_length_days <= 7:
        return base[:cycle_length_days]

    normalized = []
    for idx in range(1, cycle_length_days + 1):
        src = base[(idx - 1) % len(base)]
        normalized.append(
            CycleDayPlan(
                day_index=idx,
                label=f"D{idx}",
                is_training=src.is_training,
                focus_area=src.focus_area,
            )
        )
    return normalized


def _load_goal_config(db: Session) -> GoalConfig:
    raw = get_setting(db, "goal_tracking", DEFAULT_GOAL_TRACKING)
    merged = {**DEFAULT_GOAL_TRACKING, **(raw if isinstance(raw, dict) else {})}
    return GoalConfig(**merged)


def _weight_trend_weekly_kg(db: Session, end_date: date) -> float | None:
    start_window = end_date.fromordinal(end_date.toordinal() - 27)
    rows = db.scalars(
        select(NutritionLogEntity)
        .where(NutritionLogEntity.body_weight_kg.is_not(None), NutritionLogEntity.log_date >= start_window, NutritionLogEntity.log_date <= end_date)
        .order_by(NutritionLogEntity.log_date.asc(), NutritionLogEntity.id.asc())
    ).all()

    if len(rows) < 2:
        return None

    base_date = rows[0].log_date
    xs = [(r.log_date - base_date).days for r in rows]
    ys = [float(r.body_weight_kg) for r in rows]

    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)

    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator <= 0:
        return None

    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=False))
    slope_per_day = numerator / denominator
    return round(slope_per_day * 7, 4)


def _build_goal_progress(db: Session, config: GoalConfig) -> GoalProgress:
    latest_weight_row = db.scalar(
        select(NutritionLogEntity)
        .where(NutritionLogEntity.body_weight_kg.is_not(None))
        .order_by(desc(NutritionLogEntity.log_date), desc(NutritionLogEntity.id))
    )

    current_weight = float(latest_weight_row.body_weight_kg) if latest_weight_row else float(config.start_weight_kg)
    current_date = latest_weight_row.log_date if latest_weight_row else date.today()
    actual_weekly = _weight_trend_weekly_kg(db, current_date)

    days_remaining = (config.target_date - current_date).days
    days_remaining = max(days_remaining, 0)

    weight_gap = round(float(config.target_weight_kg) - current_weight, 3)
    required_weekly = None
    if days_remaining > 0:
        required_weekly = round(weight_gap / (days_remaining / 7), 4)

    current_muscle = config.latest_muscle_kg if config.latest_muscle_kg is not None else config.start_muscle_kg
    muscle_gap = None
    if config.target_muscle_kg is not None and current_muscle is not None:
        muscle_gap = round(float(config.target_muscle_kg) - float(current_muscle), 3)

    direction = 1 if config.target_weight_kg >= config.start_weight_kg else -1
    label = "数据不足"
    if required_weekly is not None and actual_weekly is not None:
        aligned_required = required_weekly * direction
        aligned_actual = actual_weekly * direction

        if aligned_required <= 0:
            label = "超额"
        else:
            ratio = aligned_actual / aligned_required
            if ratio < 0.8:
                label = "过慢"
            elif ratio > 1.2:
                label = "超额"
            else:
                label = "健康"

    if label == "超额":
        if direction > 0:
            summary = (
                f"当前体重 {current_weight:.1f}kg，已超出目标 {config.target_weight_kg:.1f}kg "
                f"(+{abs(weight_gap):.1f}kg)；进度判定：{label}。"
            )
        else:
            summary = (
                f"当前体重 {current_weight:.1f}kg，已低于目标 {config.target_weight_kg:.1f}kg "
                f"(-{abs(weight_gap):.1f}kg)；进度判定：{label}。"
            )
    else:
        gap_word = "还差" if weight_gap > 0 else "已超出"
        summary = (
            f"当前体重 {current_weight:.1f}kg，目标 {config.target_weight_kg:.1f}kg，"
            f"{gap_word} {abs(weight_gap):.1f}kg；进度判定：{label}。"
        )

    return GoalProgress(
        goal_type=config.goal_type,
        start_date=config.start_date,
        target_date=config.target_date,
        days_remaining=days_remaining,
        current_weight_kg=round(current_weight, 3),
        target_weight_kg=round(float(config.target_weight_kg), 3),
        weight_gap_kg=weight_gap,
        current_muscle_kg=float(current_muscle) if current_muscle is not None else None,
        target_muscle_kg=float(config.target_muscle_kg) if config.target_muscle_kg is not None else None,
        muscle_gap_kg=muscle_gap,
        required_weekly_weight_change_kg=required_weekly,
        actual_weekly_weight_change_kg=actual_weekly,
        progress_label=label,
        summary=summary,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "fitness-agent-mvp"}


@app.get("/api/v1/dashboard/today", response_model=TodayDashboard)
def get_today_dashboard(db: Session = Depends(get_db)) -> TodayDashboard:
    workouts = db.scalars(
        select(WorkoutSessionEntity)
        .options(selectinload(WorkoutSessionEntity.exercise_sets))
        .order_by(WorkoutSessionEntity.training_date.asc(), WorkoutSessionEntity.id.asc())
    ).all()
    readiness = db.scalars(select(ReadinessLogEntity).order_by(ReadinessLogEntity.log_date.asc(), ReadinessLogEntity.id.asc())).all()

    goal = get_setting(db, "current_goal", "strength")
    next_training_time = get_setting(db, "next_training_time", "2026-04-16 19:00")
    suggestion = suggest_today_plan(workouts=workouts, readiness_logs=readiness, goal=goal)

    budget = get_setting(db, "budget", {
        "monthly_budget_rmb": 30,
        "soft_limit_ratio": 0.7,
        "hard_limit_ratio": 1.0,
    })
    spent = get_month_spent_rmb(db)
    monthly_budget = float(budget.get("monthly_budget_rmb", 30))

    return TodayDashboard(
        today_training=True,
        next_training_time=str(next_training_time),
        today_recommendation=suggestion,
        budget_status={
            "spent_rmb": round(spent, 4),
            "monthly_budget_rmb": monthly_budget,
            "ratio": round(spent / monthly_budget, 4) if monthly_budget else 0,
        },
    )


@app.get("/api/v1/plan", response_model=PlanState)
def get_plan_state(db: Session = Depends(get_db)) -> PlanState:
    cycle_week = int(get_setting(db, "cycle_week", 1))
    next_training_time = str(get_setting(db, "next_training_time", "2026-04-16 19:00"))
    weekly_plan = get_setting(db, "weekly_plan", {"mon": "upper", "wed": "lower", "fri": "upper"})
    if not isinstance(weekly_plan, dict):
        weekly_plan = {"mon": "upper", "wed": "lower", "fri": "upper"}

    cycle_length_days = int(get_setting(db, "cycle_length_days", 7))
    cycle_length_days = min(28, max(7, cycle_length_days))

    cycle_start_date_raw = get_setting(db, "cycle_start_date", "2026-04-16")
    try:
        cycle_start_date = date.fromisoformat(str(cycle_start_date_raw))
    except ValueError:
        cycle_start_date = date.today()

    cycle_day_plan_raw = get_setting(db, "cycle_day_plan", None)
    cycle_day_plan = _normalize_cycle_day_plan(cycle_day_plan_raw, cycle_length_days, weekly_plan)

    return PlanState(
        cycle_week=cycle_week,
        next_training_time=next_training_time,
        weekly_plan=weekly_plan,
        cycle_length_days=cycle_length_days,
        cycle_start_date=cycle_start_date,
        cycle_day_plan=cycle_day_plan,
    )


@app.get("/api/v1/goals", response_model=GoalConfig)
def get_goal_config(db: Session = Depends(get_db)) -> GoalConfig:
    return _load_goal_config(db)


@app.put("/api/v1/goals", response_model=GoalConfig)
def update_goal_config(payload: GoalConfig, db: Session = Depends(get_db)) -> GoalConfig:
    set_setting(db, "goal_tracking", payload.model_dump(mode="json"))
    db.flush()
    return _load_goal_config(db)


@app.get("/api/v1/goals/progress", response_model=GoalProgress)
def get_goal_progress(db: Session = Depends(get_db)) -> GoalProgress:
    config = _load_goal_config(db)
    return _build_goal_progress(db, config)


@app.put("/api/v1/plan", response_model=PlanState)
def update_plan_state(payload: WeeklyPlanUpdate, db: Session = Depends(get_db)) -> PlanState:
    set_setting(db, "cycle_week", payload.cycle_week)
    set_setting(db, "next_training_time", payload.next_training_time)
    set_setting(db, "weekly_plan", payload.weekly_plan)
    set_setting(db, "cycle_length_days", payload.cycle_length_days)
    set_setting(db, "cycle_start_date", payload.cycle_start_date.isoformat())

    normalized_cycle_plan = _normalize_cycle_day_plan(
        [d.model_dump(mode="json") for d in payload.cycle_day_plan],
        payload.cycle_length_days,
        payload.weekly_plan,
    )
    set_setting(db, "cycle_day_plan", [d.model_dump(mode="json") for d in normalized_cycle_plan])

    db.flush()

    return PlanState(
        cycle_week=payload.cycle_week,
        next_training_time=payload.next_training_time,
        weekly_plan=payload.weekly_plan,
        cycle_length_days=payload.cycle_length_days,
        cycle_start_date=payload.cycle_start_date,
        cycle_day_plan=normalized_cycle_plan,
    )


@app.get("/api/v1/workouts", response_model=list[WorkoutSession])
def list_workouts(days: int = Query(default=7, ge=1, le=90), db: Session = Depends(get_db)) -> list[WorkoutSession]:
    rows = db.scalars(
        select(WorkoutSessionEntity)
        .options(selectinload(WorkoutSessionEntity.exercise_sets))
        .order_by(desc(WorkoutSessionEntity.training_date), desc(WorkoutSessionEntity.id))
        .limit(days)
    ).all()
    return [_to_workout_schema(row) for row in rows]


@app.post("/api/v1/workouts", response_model=WorkoutSession)
def create_workout(payload: WorkoutSessionCreate, db: Session = Depends(get_db)) -> WorkoutSession:
    item = WorkoutSessionEntity(training_date=payload.training_date, focus_area=payload.focus_area, notes=payload.notes)
    db.add(item)
    db.flush()

    for s in payload.exercise_sets:
        db.add(
            WorkoutSetEntity(
                workout_session_id=item.id,
                exercise_name=s.exercise_name,
                equipment=s.equipment,
                sets=s.sets,
                reps=s.reps,
                weight_kg=s.weight_kg,
                rpe=s.rpe,
            )
        )

    db.flush()
    db.refresh(item)
    item = db.scalar(
        select(WorkoutSessionEntity)
        .options(selectinload(WorkoutSessionEntity.exercise_sets))
        .where(WorkoutSessionEntity.id == item.id)
    )
    return _to_workout_schema(item)


@app.put("/api/v1/workouts/{workout_id}", response_model=WorkoutSession)
def update_workout(workout_id: int, payload: WorkoutSessionUpdate, db: Session = Depends(get_db)) -> WorkoutSession:
    item = db.get(WorkoutSessionEntity, workout_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Workout session not found")

    if payload.training_date is not None:
        item.training_date = payload.training_date
    if payload.focus_area is not None:
        item.focus_area = payload.focus_area
    if payload.notes is not None:
        item.notes = payload.notes

    if payload.exercise_sets is not None:
        # Delete old sets, insert new ones
        for old_set in item.exercise_sets:
            db.delete(old_set)
        db.flush()
        for s in payload.exercise_sets:
            db.add(WorkoutSetEntity(
                workout_session_id=item.id,
                exercise_name=s.exercise_name,
                equipment=s.equipment,
                sets=s.sets,
                reps=s.reps,
                weight_kg=s.weight_kg,
                rpe=s.rpe,
            ))

    db.flush()
    db.refresh(item)
    item = db.scalar(
        select(WorkoutSessionEntity)
        .options(selectinload(WorkoutSessionEntity.exercise_sets))
        .where(WorkoutSessionEntity.id == item.id)
    )
    return _to_workout_schema(item)


@app.delete("/api/v1/workouts/{workout_id}")
def delete_workout(workout_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    item = db.get(WorkoutSessionEntity, workout_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Workout session not found")
    for s in list(item.exercise_sets):
        db.delete(s)
    db.delete(item)
    return {"ok": True, "deleted_workout_id": workout_id}


@app.get("/api/v1/readiness", response_model=list[ReadinessLog])
def list_readiness(days: int = Query(default=7, ge=1, le=90), db: Session = Depends(get_db)) -> list[ReadinessLog]:
    rows = db.scalars(select(ReadinessLogEntity).order_by(desc(ReadinessLogEntity.log_date), desc(ReadinessLogEntity.id)).limit(days)).all()
    return [_to_readiness_schema(row) for row in rows]


@app.post("/api/v1/readiness", response_model=ReadinessLog)
def create_readiness(payload: ReadinessLogCreate, db: Session = Depends(get_db)) -> ReadinessLog:
    item = ReadinessLogEntity(**payload.model_dump())
    db.add(item)
    db.flush()
    db.refresh(item)
    return _to_readiness_schema(item)


@app.put("/api/v1/readiness/{log_id}", response_model=ReadinessLog)
def update_readiness(log_id: int, payload: ReadinessLogUpdate, db: Session = Depends(get_db)) -> ReadinessLog:
    item = db.get(ReadinessLogEntity, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Readiness log not found")
    for field_name in ("log_date", "sleep_hours", "fatigue_score", "pain_score", "stress_score"):
        val = getattr(payload, field_name, None)
        if val is not None:
            setattr(item, field_name, val)
    db.flush()
    db.refresh(item)
    return _to_readiness_schema(item)


@app.delete("/api/v1/readiness/{log_id}")
def delete_readiness(log_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    item = db.get(ReadinessLogEntity, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Readiness log not found")
    db.delete(item)
    return {"ok": True, "deleted_readiness_id": log_id}


@app.get("/api/v1/nutrition", response_model=list[NutritionLog])
def list_nutrition(days: int = Query(default=7, ge=1, le=90), db: Session = Depends(get_db)) -> list[NutritionLog]:
    rows = db.scalars(select(NutritionLogEntity).order_by(desc(NutritionLogEntity.log_date), desc(NutritionLogEntity.id)).limit(days)).all()
    return [_to_nutrition_schema(row) for row in rows]


@app.post("/api/v1/nutrition", response_model=NutritionLog)
def create_nutrition(payload: NutritionLogCreate, db: Session = Depends(get_db)) -> NutritionLog:
    item = NutritionLogEntity(**payload.model_dump())
    db.add(item)
    db.flush()
    db.refresh(item)
    return _to_nutrition_schema(item)


@app.put("/api/v1/nutrition/{log_id}", response_model=NutritionLog)
def update_nutrition(log_id: int, payload: NutritionLogUpdate, db: Session = Depends(get_db)) -> NutritionLog:
    item = db.get(NutritionLogEntity, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Nutrition log not found")
    for field_name in (
        "log_date", "calories_kcal", "protein_g", "carbs_g", "fat_g",
        "water_liters", "body_weight_kg", "body_fat_rate_pct",
        "muscle_weight_kg", "waist_cm", "notes",
    ):
        val = getattr(payload, field_name, None)
        if val is not None:
            setattr(item, field_name, val)
    db.flush()
    db.refresh(item)
    return _to_nutrition_schema(item)


@app.delete("/api/v1/nutrition/{log_id}")
def delete_nutrition(log_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    item = db.get(NutritionLogEntity, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Nutrition log not found")
    db.delete(item)
    return {"ok": True, "deleted_nutrition_id": log_id}


@app.get("/api/v1/ocr/status")
def get_ocr_status() -> dict[str, Any]:
    info = volcengine_ocr_client.describe()
    return {
        "configured": bool(info.get("configured")),
        "base_url": f"https://{info.get('host')}",
        "model": f"{info.get('action')}@{info.get('version')}",
        "provider": info.get("provider"),
    }


@app.get("/api/v1/body-metrics", response_model=list[BodyMetric])
def list_body_metrics(days: int = Query(default=90, ge=1, le=365), db: Session = Depends(get_db)) -> list[BodyMetric]:
    end_date = date.today()
    start_window = end_date.fromordinal(end_date.toordinal() - max(days - 1, 0))

    rows = db.scalars(
        select(BodyMetricEntity)
        .where(BodyMetricEntity.log_date >= start_window, BodyMetricEntity.log_date <= end_date)
        .order_by(BodyMetricEntity.log_date.asc(), BodyMetricEntity.id.asc())
    ).all()

    asset_ids = sorted({r.source_asset_id for r in rows if r.source_asset_id})
    assets_by_id: dict[int, KnowledgeAssetEntity] = {}
    if asset_ids:
        assets = db.scalars(select(KnowledgeAssetEntity).where(KnowledgeAssetEntity.id.in_(asset_ids))).all()
        assets_by_id = {a.id: a for a in assets}

    return [_to_body_metric_schema(r, assets_by_id.get(r.source_asset_id or -1)) for r in rows]


@app.post("/api/v1/body-metrics", response_model=BodyMetric)
def upsert_body_metric(payload: BodyMetricCreate, db: Session = Depends(get_db)) -> BodyMetric:
    if payload.height_cm is not None:
        set_setting(db, "height_cm", payload.height_cm)

    item = _upsert_body_metric(
        db,
        log_date=payload.log_date,
        body_weight_kg=payload.body_weight_kg,
        body_fat_rate_pct=payload.body_fat_rate_pct,
        body_fat_kg=payload.body_fat_kg,
        muscle_weight_kg=payload.muscle_weight_kg,
        skeletal_muscle_kg=payload.skeletal_muscle_kg,
        body_water_kg=payload.body_water_kg,
        protein_kg=payload.protein_kg,
        minerals_kg=payload.minerals_kg,
        left_upper_muscle_kg=payload.left_upper_muscle_kg,
        right_upper_muscle_kg=payload.right_upper_muscle_kg,
        left_lower_muscle_kg=payload.left_lower_muscle_kg,
        right_lower_muscle_kg=payload.right_lower_muscle_kg,
        trunk_muscle_kg=payload.trunk_muscle_kg,
        left_upper_fat_kg=payload.left_upper_fat_kg,
        right_upper_fat_kg=payload.right_upper_fat_kg,
        left_lower_fat_kg=payload.left_lower_fat_kg,
        right_lower_fat_kg=payload.right_lower_fat_kg,
        trunk_fat_kg=payload.trunk_fat_kg,
        waist_cm=payload.waist_cm,
        hip_cm=payload.hip_cm,
        inbody_score=payload.inbody_score,
        bmr_kcal=payload.bmr_kcal,
        source_asset_id=payload.source_asset_id,
    )
    asset = db.get(KnowledgeAssetEntity, item.source_asset_id) if item.source_asset_id else None
    return _to_body_metric_schema(item, asset)


@app.put("/api/v1/body-metrics/{metric_id}", response_model=BodyMetric)
def update_body_metric(metric_id: int, payload: BodyMetricUpdate, db: Session = Depends(get_db)) -> BodyMetric:
    item = db.get(BodyMetricEntity, metric_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Body metric not found")
    for field_name in (
        "log_date", "body_weight_kg", "body_fat_rate_pct", "body_fat_kg",
        "muscle_weight_kg", "skeletal_muscle_kg", "body_water_kg",
        "protein_kg", "minerals_kg",
        "left_upper_muscle_kg", "right_upper_muscle_kg",
        "left_lower_muscle_kg", "right_lower_muscle_kg", "trunk_muscle_kg",
        "left_upper_fat_kg", "right_upper_fat_kg",
        "left_lower_fat_kg", "right_lower_fat_kg", "trunk_fat_kg",
        "waist_cm", "hip_cm", "inbody_score", "bmr_kcal",
        "height_cm", "source_asset_id",
    ):
        val = getattr(payload, field_name, None)
        if val is not None:
            setattr(item, field_name, val)
    db.flush()
    db.refresh(item)
    asset = db.get(KnowledgeAssetEntity, item.source_asset_id) if item.source_asset_id else None
    return _to_body_metric_schema(item, asset)


@app.delete("/api/v1/body-metrics/{metric_id}")
def delete_body_metric(metric_id: int, delete_asset: bool = Query(default=True), db: Session = Depends(get_db)) -> dict[str, Any]:
    item = db.get(BodyMetricEntity, metric_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Body metric not found")

    asset_deleted = False
    asset = db.get(KnowledgeAssetEntity, item.source_asset_id) if item.source_asset_id else None

    db.delete(item)

    if delete_asset and asset is not None:
        # For safety, only delete when no remaining metric references this asset.
        still_referenced = db.scalar(select(BodyMetricEntity.id).where(BodyMetricEntity.source_asset_id == asset.id).limit(1))
        if still_referenced is None:
            _delete_asset_and_file(db, asset)
            asset_deleted = True

    return {"ok": True, "deleted_metric_id": metric_id, "deleted_asset": asset_deleted}


@app.post("/api/v1/body-metrics/ocr", response_model=BodyMetricOcrResponse)
async def ocr_body_metrics(
    file: UploadFile = File(...),
    captured_on: str | None = Form(default=None),
    title: str | None = Form(default=None),
    tags: str | None = Form(default="inbody,ocr"),
    db: Session = Depends(get_db),
) -> BodyMetricOcrResponse:
    if not file.content_type or file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=415, detail="Only jpeg/png/webp images are supported")

    raw = await file.read()
    await file.close()

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (>{MAX_UPLOAD_BYTES} bytes)")

    ext = ALLOWED_IMAGE_MIME[file.content_type]
    filename = f"{uuid.uuid4().hex}{ext}"
    target_path = UPLOAD_DIR / filename
    target_path.write_bytes(raw)

    captured_date: date | None = None
    if captured_on:
        try:
            captured_date = date.fromisoformat(str(captured_on))
        except ValueError:
            raise HTTPException(status_code=400, detail="captured_on must be ISO date YYYY-MM-DD")

    asset = KnowledgeAssetEntity(
        asset_type="inbody_image",
        title=str(title or f"InBody {captured_date or date.today():%Y-%m-%d}"),
        source_path=f"uploads/{filename}",
        tags=_parse_tags(tags),
        captured_on=captured_date,
    )
    db.add(asset)
    db.flush()
    db.refresh(asset)

    metric_date = captured_date or date.today()

    if not volcengine_ocr_client.is_configured():
        metric_row = _upsert_body_metric(
            db,
            log_date=metric_date,
            body_weight_kg=None,
            body_fat_rate_pct=None,
            muscle_weight_kg=None,
            source_asset_id=asset.id,
        )
        return BodyMetricOcrResponse(
            status="not_configured",
            message="VOLCENGINE_ACCESS_KEY_ID / VOLCENGINE_SECRET_ACCESS_KEY missing",
            asset=_to_knowledge_schema(asset),
            metric=_to_body_metric_schema(metric_row, asset),
            raw_output=None,
        )

    try:
        ocr = run_inbody_ocr_with_volcengine(volcengine_ocr_client, raw, file.content_type)
    except requests.HTTPError as err:
        status = "error"
        message = "OCR request failed"
        if err.response is not None and err.response.status_code in (400, 415):
            status = "not_supported"
            message = "Provider does not support this OCR action/version"
        elif err.response is not None and err.response.status_code in (401, 403):
            status = "not_configured"
            message = "OCR auth failed (check VOLCENGINE credentials/signature)"
        metric_row = _upsert_body_metric(
            db,
            log_date=metric_date,
            body_weight_kg=None,
            body_fat_rate_pct=None,
            muscle_weight_kg=None,
            source_asset_id=asset.id,
        )
        return BodyMetricOcrResponse(
            status=status,
            message=message,
            asset=_to_knowledge_schema(asset),
            metric=_to_body_metric_schema(metric_row, asset),
            raw_output=getattr(err.response, "text", None),
        )
    except Exception as err:
        metric_row = _upsert_body_metric(
            db,
            log_date=metric_date,
            body_weight_kg=None,
            body_fat_rate_pct=None,
            muscle_weight_kg=None,
            source_asset_id=asset.id,
        )
        return BodyMetricOcrResponse(
            status="error",
            message=str(err),
            asset=_to_knowledge_schema(asset),
            metric=_to_body_metric_schema(metric_row, asset),
            raw_output=None,
        )

    metric_row = _upsert_body_metric(
        db,
        log_date=metric_date,
        body_weight_kg=ocr.body_weight_kg,
        body_fat_rate_pct=ocr.body_fat_rate_pct,
        muscle_weight_kg=ocr.muscle_weight_kg,
        source_asset_id=asset.id,
    )

    has_any = any(v is not None for v in [ocr.body_weight_kg, ocr.body_fat_rate_pct, ocr.muscle_weight_kg])
    has_weight_and_other = ocr.body_weight_kg is not None and (ocr.body_fat_rate_pct is not None or ocr.muscle_weight_kg is not None)
    status: str = "needs_review"
    if has_weight_and_other:
        status = "ok"
    elif not has_any:
        status = "needs_review"

    return BodyMetricOcrResponse(
        status=status,
        message="" if status == "ok" else "识别结果不完整，请在电子表单中校对后保存",
        asset=_to_knowledge_schema(asset),
        metric=_to_body_metric_schema(metric_row, asset),
        raw_output=ocr.raw_output,
    )


@app.get("/api/v1/knowledge-assets", response_model=list[KnowledgeAsset])
def list_knowledge_assets(db: Session = Depends(get_db)) -> list[KnowledgeAsset]:
    rows = db.scalars(select(KnowledgeAssetEntity).order_by(desc(KnowledgeAssetEntity.created_at))).all()
    return [_to_knowledge_schema(row) for row in rows]


@app.post("/api/v1/knowledge-assets", response_model=KnowledgeAsset)
def create_knowledge_asset(payload: KnowledgeAssetCreate, db: Session = Depends(get_db)) -> KnowledgeAsset:
    item = KnowledgeAssetEntity(**payload.model_dump())
    db.add(item)
    db.flush()
    db.refresh(item)
    return _to_knowledge_schema(item)


@app.delete("/api/v1/knowledge-assets/{asset_id}")
def delete_knowledge_asset(asset_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    asset = db.get(KnowledgeAssetEntity, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Knowledge asset not found")

    _delete_asset_and_file(db, asset)
    return {"ok": True, "deleted_asset_id": asset_id}


@app.get("/api/v1/change-proposals", response_model=list[ChangeProposal])
def list_change_proposals(db: Session = Depends(get_db)) -> list[ChangeProposal]:
    rows = db.scalars(select(ChangeProposalEntity).order_by(desc(ChangeProposalEntity.created_at))).all()
    return [_to_change_proposal_schema(row) for row in rows]


@app.post("/api/v1/change-proposals", response_model=ChangeProposal)
def create_change_proposal(payload: ChangeProposalCreate, db: Session = Depends(get_db)) -> ChangeProposal:
    old_value: Any = get_setting(db, payload.field_path)

    proposal = ChangeProposalEntity(
        field_path=payload.field_path,
        old_value=old_value,
        new_value=payload.new_value,
        reason=payload.reason,
        initiator=payload.initiator,
        status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(proposal)
    db.flush()
    db.refresh(proposal)
    return _to_change_proposal_schema(proposal)


@app.post("/api/v1/change-proposals/{proposal_id}/approve", response_model=ChangeProposal)
def approve_proposal(proposal_id: int, payload: ApproveProposalRequest, db: Session = Depends(get_db)) -> ChangeProposal:
    proposal = db.get(ChangeProposalEntity, proposal_id)
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")

    if proposal.status != "pending":
        raise HTTPException(status_code=409, detail="Proposal already resolved")

    proposal.status = "approved"
    proposal.resolved_at = datetime.utcnow()

    category = getattr(proposal, "change_category", "profile") or "profile"
    new_value = proposal.new_value
    today = date.today()

    if category == "profile":
        set_setting(db, proposal.field_path, new_value)

    elif category == "nutrition":
        if isinstance(new_value, dict):
            nutrition = NutritionLogEntity(
                log_date=today,
                calories_kcal=int(new_value.get("calories_kcal", 0)),
                protein_g=float(new_value.get("protein_g", 0)),
                carbs_g=float(new_value.get("carbs_g", 0)),
                fat_g=float(new_value.get("fat_g", 0)),
                water_liters=float(new_value.get("water_liters", 0)),
                body_weight_kg=float(new_value.get("body_weight_kg")) if new_value.get("body_weight_kg") is not None else None,
            )
            db.add(nutrition)

    elif category == "readiness":
        if isinstance(new_value, dict):
            readiness = ReadinessLogEntity(
                log_date=today,
                sleep_hours=float(new_value.get("sleep_hours", 0)),
                fatigue_score=int(new_value.get("fatigue_score", 0)),
                pain_score=int(new_value.get("pain_score", 0)),
                stress_score=int(new_value.get("stress_score", 0)),
            )
            db.add(readiness)

    elif category == "body_metric":
        if isinstance(new_value, dict):
            body = BodyMetricEntity(
                log_date=today,
                body_weight_kg=float(new_value.get("body_weight_kg")) if new_value.get("body_weight_kg") is not None else None,
                body_fat_rate_pct=float(new_value.get("body_fat_rate_pct")) if new_value.get("body_fat_rate_pct") is not None else None,
                muscle_weight_kg=float(new_value.get("muscle_weight_kg")) if new_value.get("muscle_weight_kg") is not None else None,
            )
            db.add(body)

    elif category == "workout":
        if isinstance(new_value, dict):
            workout = WorkoutSessionEntity(
                training_date=today,
                focus_area=str(new_value.get("focus_area", "full_body")),
                notes=str(new_value.get("notes", "")),
            )
            db.add(workout)
            db.flush()
            exercises = new_value.get("exercise_sets", [])
            if isinstance(exercises, list):
                for ex in exercises:
                    if isinstance(ex, dict):
                        db.add(WorkoutSetEntity(
                            workout_session_id=workout.id,
                            exercise_name=str(ex.get("exercise_name", "")),
                            equipment=str(ex.get("equipment", "barbell")),
                            sets=int(ex.get("sets", 0)),
                            reps=int(ex.get("reps", 0)),
                            weight_kg=float(ex.get("weight_kg", 0)),
                            rpe=float(ex.get("rpe")) if ex.get("rpe") is not None else None,
                        ))

    log = AuditLogEntity(
        actor=payload.approved_by,
        action="approve_change_proposal",
        field_path=proposal.field_path,
        old_value=proposal.old_value,
        new_value=new_value,
        evidence=payload.confirm_token or "ui-confirm",
        created_at=datetime.utcnow(),
    )
    db.add(log)
    db.flush()
    db.refresh(proposal)

    return _to_change_proposal_schema(proposal)


@app.get("/api/v1/audit-logs", response_model=list[AuditLogEntry])
def list_audit_logs(db: Session = Depends(get_db)) -> list[AuditLogEntry]:
    rows = db.scalars(select(AuditLogEntity).order_by(desc(AuditLogEntity.created_at)).limit(100)).all()
    return [_to_audit_schema(row) for row in rows]


@app.post("/api/v1/ai/recommendation", response_model=AiRecommendationResponse)
def ai_recommendation(payload: AiRecommendationRequest, db: Session = Depends(get_db)) -> AiRecommendationResponse:
    spent = get_month_spent_rmb(db)
    needs_complex = any(k in payload.user_query.lower() for k in ["plateau", "injury", "deload", "complex", "conflict"])
    route_tier, route_reason = pick_tier(
        config=cost_config,
        spent_rmb=spent,
        preference=payload.route_preference,
        needs_complex_reasoning=needs_complex,
    )

    workouts = db.scalars(
        select(WorkoutSessionEntity)
        .options(selectinload(WorkoutSessionEntity.exercise_sets))
        .order_by(desc(WorkoutSessionEntity.training_date), desc(WorkoutSessionEntity.id))
        .limit(cost_config.max_context_sessions)
    ).all()
    readiness = db.scalars(select(ReadinessLogEntity).order_by(desc(ReadinessLogEntity.log_date), desc(ReadinessLogEntity.id)).limit(7)).all()

    if route_tier == "l0":
        baseline = suggest_today_plan(workouts=list(reversed(workouts)), readiness_logs=list(reversed(readiness)), goal=str(get_setting(db, "current_goal", "strength")))
        return AiRecommendationResponse(
            route_tier="l0",
            model="rule-engine",
            reason=route_reason,
            content=f"{baseline['action']}: {baseline['reason']}",
            estimated_cost_rmb=0.0,
        )

    model = cost_config.model_l2 if route_tier == "l2" else cost_config.model_l1

    context_lines = []
    for w in workouts:
        if not w.exercise_sets:
            continue
        s = w.exercise_sets[0]
        context_lines.append(
            f"{w.training_date} {w.focus_area} {s.exercise_name} {s.sets}x{s.reps}@{float(s.weight_kg)}kg rpe={s.rpe}"
        )

    readiness_lines = [
        f"{r.log_date} sleep={r.sleep_hours} fatigue={r.fatigue_score} pain={r.pain_score} stress={r.stress_score}" for r in readiness
    ]

    system_prompt = (
        "You are a careful strength coach. Keep response concise, structured, and safe. "
        "Never recommend aggressive load jumps when recovery metrics are poor."
    )
    user_prompt = (
        f"User goal: {get_setting(db, 'current_goal', 'strength')}\n"
        f"Recent workouts:\n" + "\n".join(context_lines[: cost_config.max_context_sessions]) + "\n\n"
        f"Recent readiness:\n" + "\n".join(readiness_lines[: cost_config.max_context_days]) + "\n\n"
        f"Question: {payload.user_query}"
    )

    if not deepseek_client.is_configured():
        fallback_content = "DeepSeek key not configured. Returning rule-engine guidance only."
        return AiRecommendationResponse(
            route_tier=route_tier,
            model="not-configured",
            reason="DEEPSEEK_API_KEY missing",
            content=fallback_content,
            estimated_cost_rmb=0.0,
        )

    response = deepseek_client.chat_completion(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=cost_config.max_output_tokens_per_call,
    )

    content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
    usage = response.get("usage", {})
    input_tokens = int(usage.get("prompt_tokens", min(len(user_prompt) // 4, cost_config.max_input_tokens_per_call)))
    output_tokens = int(usage.get("completion_tokens", min(len(content) // 4, cost_config.max_output_tokens_per_call)))

    estimated_cost = estimate_cost_rmb(cost_config, route_tier, input_tokens, output_tokens)

    db.add(
        LlmUsageLogEntity(
            tier=route_tier,
            model=model,
            route_reason=route_reason,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_rmb=estimated_cost,
            created_at=datetime.utcnow(),
        )
    )

    return AiRecommendationResponse(
        route_tier=route_tier,
        model=model,
        reason=route_reason,
        content=content,
        estimated_cost_rmb=estimated_cost,
    )


@app.post("/api/v1/chat")
async def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    """Main chat endpoint with RAG + profile-enhanced streaming response."""
    import json as _json

    spent = get_month_spent_rmb(db)
    # Determine route tier
    last_msg = payload.messages[-1].content if payload.messages else ""
    needs_complex = any(k in last_msg.lower() for k in ["plateau", "injury", "deload", "complex", "conflict"])
    route_tier, route_reason = pick_tier(
        config=cost_config,
        spent_rmb=spent,
        preference="auto",
        needs_complex_reasoning=needs_complex,
    )

    model = cost_config.model_l2 if route_tier == "l2" else cost_config.model_l1

    # Build enhanced system prompt with RAG + profile
    system_prompt = "You are a professional strength and conditioning coach. "

    rag_sources = []
    if payload.enable_rag and route_tier != "l0":
        try:
            rag_results = _rag_pipeline.search(last_msg, top_k=3)
            rag_sources = rag_results
            rag_context = _rag_pipeline.build_rag_context(last_msg, max_chars=2000, top_k=3)
            if rag_context:
                system_prompt += (
                    "\n\n## Relevant fitness knowledge\n"
                    f"{rag_context}\n\n"
                    "Use this knowledge to inform your answer. "
                    "Cite sources when applicable."
                )
        except Exception:
            pass

    if payload.enable_profile and route_tier != "l0":
        try:
            profile = aggregate_user_profile(db)
            profile_ctx = profile_to_prompt_context(profile)
            if profile_ctx:
                system_prompt += (
                    "\n\n## User profile and recent data\n"
                    f"{profile_ctx}\n\n"
                    "Use this data to personalize your advice."
                )
        except Exception:
            pass

    system_prompt += (
        "\nKeep responses concise and actionable. "
        "When suggesting load changes, explain the reasoning. "
        "When recovery metrics are poor, prioritize rest and safety."
    )

    # Format messages for API
    api_messages = [{"role": "system", "content": system_prompt}]
    for msg in payload.messages:
        api_messages.append({"role": msg.role, "content": msg.content})

    if not deepseek_client.is_configured():
        # Fallback: rule engine response
        def fallback_generator():
            workouts = db.scalars(
                select(WorkoutSessionEntity)
                .options(selectinload(WorkoutSessionEntity.exercise_sets))
                .order_by(desc(WorkoutSessionEntity.training_date))
                .limit(3)
            ).all()
            readiness = db.scalars(
                select(ReadinessLogEntity)
                .order_by(desc(ReadinessLogEntity.log_date))
                .limit(7)
            ).all()
            suggestion = suggest_today_plan(
                workouts=list(reversed(workouts)),
                readiness_logs=list(reversed(readiness)),
                goal=str(get_setting(db, "current_goal", "strength")),
            )
            yield {
                "event": "token",
                "data": _json.dumps({
                    "type": "token",
                    "content": f"[Rule Engine] {suggestion['action']}: {suggestion['reason']}. "
                               f"Set DEEPSEEK_API_KEY for AI-powered responses.",
                }, ensure_ascii=False),
            }
            yield {
                "event": "meta",
                "data": _json.dumps({
                    "type": "meta",
                    "rag_sources": [],
                    "route_tier": "l0",
                    "estimated_cost_rmb": 0.0,
                    "needs_profile_extraction": False,
                }, ensure_ascii=False),
            }

        return EventSourceResponse(fallback_generator())

    # Save user message to DB
    user_msg_entity = ChatMessageEntity(
        user_id="default",
        role="user",
        content=last_msg,
    )
    db.add(user_msg_entity)
    db.flush()

    # Estimate token usage for logging
    approx_input_tokens = sum(len(m["content"]) // 4 for m in api_messages)
    estimated_cost = estimate_cost_rmb(cost_config, route_tier, approx_input_tokens, cost_config.max_output_tokens_per_call)

    # Build thinking process from RAG context
    thinking_parts: list[str] = []
    if rag_sources:
        thinking_parts.append(f"检索到 {len(rag_sources)} 篇相关知识:")
        for i, r in enumerate(rag_sources, 1):
            thinking_parts.append(f"  {i}. [{r['kb_name']}] {r['title']} (相关度: {r['score']})")
    thinking_process = "\n".join(thinking_parts) if thinking_parts else ""

    def stream_generator():
        full_response = ""
        total_tokens = 0
        thinking_start = time.time()
        first_token_time: float | None = None
        thinking_time_ms = 0

        try:
            for chunk in deepseek_client.chat_completion_stream(
                model=model,
                messages=api_messages,
                max_tokens=cost_config.max_output_tokens_per_call,
            ):
                if chunk["type"] == "token":
                    if first_token_time is None:
                        first_token_time = time.time()
                        thinking_time_ms = int((first_token_time - thinking_start) * 1000)
                    full_response += chunk["content"]
                    yield {
                        "event": "token",
                        "data": _json.dumps({
                            "type": "token",
                            "content": chunk["content"],
                        }, ensure_ascii=False),
                    }
                elif chunk["type"] == "meta":
                    total_tokens = chunk.get("usage", {}).get("total_tokens", 0)
        except Exception as e:
            yield {
                "event": "error",
                "data": _json.dumps({
                    "type": "error",
                    "message": str(e),
                }, ensure_ascii=False),
            }
            return

        if first_token_time is None:
            thinking_time_ms = int((time.time() - thinking_start) * 1000)
        if total_tokens == 0:
            total_tokens = approx_input_tokens + len(full_response) // 4

        # Save assistant message to DB (use fresh session — outer session may be closed
        # by the time EventSourceResponse consumes this generator)
        from .db import SessionLocal as _SessionLocal
        save_session = _SessionLocal()
        try:
            assistant_msg = ChatMessageEntity(
                user_id="default",
                role="assistant",
                content=full_response,
                tokens_used=total_tokens,
                thinking_time_ms=thinking_time_ms,
                thinking_process=thinking_process,
                rag_sources=[
                    {"kb_name": r["kb_name"], "title": r["title"],
                     "snippet": r["snippet"][:200], "score": r["score"]}
                    for r in rag_sources
                ] if rag_sources else None,
            )
            save_session.add(assistant_msg)
            save_session.commit()
        except Exception:
            save_session.rollback()
        finally:
            save_session.close()

        # Send metadata with timing and token info
        yield {
            "event": "meta",
            "data": _json.dumps({
                "type": "meta",
                "rag_sources": [
                    {"kb_name": r["kb_name"], "title": r["title"],
                     "snippet": r["snippet"][:200], "score": r["score"]}
                    for r in rag_sources
                ],
                "route_tier": route_tier,
                "estimated_cost_rmb": estimated_cost,
                "tokens_used": total_tokens,
                "thinking_time_ms": thinking_time_ms,
                "thinking_process": thinking_process,
                "needs_profile_extraction": True,
            }, ensure_ascii=False),
        }

        # Log usage and extract profile changes (use save_session)
        save_session.add(LlmUsageLogEntity(
            tier=route_tier,
            model=model,
            route_reason=route_reason,
            input_tokens=approx_input_tokens,
            output_tokens=len(full_response) // 4,
            cost_rmb=estimated_cost,
            created_at=datetime.utcnow(),
        ))
        save_session.commit()

        # Extract profile changes
        conversation = "\n".join(
            f"{m['role']}: {m['content']}" for m in api_messages[1:]
        ) + f"\nassistant: {full_response}"

        changes = extract_profile_changes(conversation, deepseek_client)
        for change in changes:
            field_path = str(change.get("field_path", ""))
            new_value = change.get("new_value")
            reason = str(change.get("reason", "Extracted from conversation"))
            category = str(change.get("category", "profile"))
            if not field_path:
                continue

            # Use a fresh session for reading settings and saving proposals
            proposal_session = _SessionLocal()
            try:
                if category == "profile":
                    from .db import get_setting as _get_setting
                    old_value_val = _get_setting(proposal_session, field_path)
                else:
                    old_value_val = None

                proposal = ChangeProposalEntity(
                    field_path=field_path,
                    old_value=old_value_val,
                    new_value=new_value,
                    reason=reason,
                    initiator="ai",
                    status="pending",
                    change_category=category,
                )
                proposal_session.add(proposal)
                proposal_session.commit()
            except Exception:
                proposal_session.rollback()
            finally:
                proposal_session.close()

    return EventSourceResponse(stream_generator())


@app.get("/api/v1/dashboard", response_model=DashboardResponse)
def get_dashboard(db: Session = Depends(get_db)):
    """Aggregated dashboard data for the right panel."""
    # Training
    workouts = db.scalars(
        select(WorkoutSessionEntity)
        .options(selectinload(WorkoutSessionEntity.exercise_sets))
        .order_by(desc(WorkoutSessionEntity.training_date), desc(WorkoutSessionEntity.id))
        .limit(7)
    ).all()
    today = date.today()
    today_workout = next((w for w in workouts if w.training_date == today), None)
    next_training = str(get_setting(db, "next_training_time", "TBD"))
    goal = str(get_setting(db, "current_goal", "strength"))

    today_training = {
        "is_training_day": True,
        "completed": today_workout is not None,
        "focus_area": today_workout.focus_area if today_workout else "rest",
        "recommendation": suggest_today_plan(
            workouts=list(reversed(workouts)),
            readiness_logs=db.scalars(
                select(ReadinessLogEntity)
                .order_by(desc(ReadinessLogEntity.log_date))
                .limit(7)
            ).all()[::-1],
            goal=goal,
        ).get("reason", ""),
    }

    # Recovery
    latest_readiness = db.scalar(
        select(ReadinessLogEntity)
        .order_by(desc(ReadinessLogEntity.log_date), desc(ReadinessLogEntity.id))
    )
    recovery = {
        "sleep_hours": latest_readiness.sleep_hours if latest_readiness else 0,
        "fatigue_score": latest_readiness.fatigue_score if latest_readiness else 0,
        "pain_score": latest_readiness.pain_score if latest_readiness else 0,
        "stress_score": latest_readiness.stress_score if latest_readiness else 0,
        "log_date": str(latest_readiness.log_date) if latest_readiness else "",
    }

    # Nutrition
    latest_nutrition = db.scalar(
        select(NutritionLogEntity)
        .order_by(desc(NutritionLogEntity.log_date), desc(NutritionLogEntity.id))
    )
    nutrition = {
        "calories_kcal": latest_nutrition.calories_kcal if latest_nutrition else 0,
        "protein_g": latest_nutrition.protein_g if latest_nutrition else 0,
        "carbs_g": latest_nutrition.carbs_g if latest_nutrition else 0,
        "fat_g": latest_nutrition.fat_g if latest_nutrition else 0,
        "water_liters": latest_nutrition.water_liters if latest_nutrition else 0,
        "log_date": str(latest_nutrition.log_date) if latest_nutrition else "",
    }

    # Goal progress
    config = _load_goal_config(db)
    goal_progress_data = _build_goal_progress(db, config)
    goal_progress = {
        "goal_type": goal_progress_data.goal_type,
        "current_weight_kg": goal_progress_data.current_weight_kg,
        "target_weight_kg": goal_progress_data.target_weight_kg,
        "weight_gap_kg": goal_progress_data.weight_gap_kg,
        "days_remaining": goal_progress_data.days_remaining,
        "progress_label": goal_progress_data.progress_label,
        "summary": goal_progress_data.summary,
    }

    # Weight trend (last 7 days) — merge from nutrition logs + body metrics
    seven_days_ago = today.fromordinal(today.toordinal() - 6)

    nutrition_weight_rows = db.scalars(
        select(NutritionLogEntity)
        .where(
            NutritionLogEntity.body_weight_kg.is_not(None),
            NutritionLogEntity.log_date >= seven_days_ago,
        )
        .order_by(NutritionLogEntity.log_date.asc())
    ).all()

    body_metric_weight_rows = db.scalars(
        select(BodyMetricEntity)
        .where(
            BodyMetricEntity.body_weight_kg.is_not(None),
            BodyMetricEntity.log_date >= seven_days_ago,
        )
        .order_by(BodyMetricEntity.log_date.asc())
    ).all()

    # Merge by date; body_metric takes precedence for same date (more deliberate measurement)
    weight_by_date: dict[str, float] = {}
    for r in nutrition_weight_rows:
        weight_by_date[str(r.log_date)] = float(r.body_weight_kg)
    for r in body_metric_weight_rows:
        weight_by_date[str(r.log_date)] = float(r.body_weight_kg)

    weight_trend = [
        {"log_date": d, "body_weight_kg": w}
        for d, w in sorted(weight_by_date.items())
    ]

    # Body metrics — merge recent records so a partial save doesn't hide complete InBody data
    thirty_days_ago = today.fromordinal(today.toordinal() - 29)
    recent_metrics = db.scalars(
        select(BodyMetricEntity)
        .where(BodyMetricEntity.log_date >= thirty_days_ago)
        .order_by(desc(BodyMetricEntity.log_date), desc(BodyMetricEntity.id))
    ).all()

    height_cm_raw = get_setting(db, "height_cm", 170.0)
    height_cm = float(height_cm_raw) if height_cm_raw else 170.0

    # Merge: for each field take the most recent non-null value
    def _merge_metric(field: str) -> Any:
        for m in recent_metrics:
            v = getattr(m, field, None)
            if v is not None:
                return v
        return None

    if recent_metrics:
        _bmi = _compute_bmi(_merge_metric("body_weight_kg"), height_cm)
        _smi = _compute_smi(_merge_metric("skeletal_muscle_kg"), height_cm)
        _whr = _compute_whr(_merge_metric("waist_cm"), _merge_metric("hip_cm"))
        _assessment = _generate_body_assessment(
            _bmi, _merge_metric("body_fat_rate_pct"),
            _merge_metric("inbody_score"), _merge_metric("skeletal_muscle_kg"),
        )
        body_metrics = {
            "body_weight_kg": _merge_metric("body_weight_kg"),
            "body_fat_rate_pct": _merge_metric("body_fat_rate_pct"),
            "body_fat_kg": _merge_metric("body_fat_kg"),
            "muscle_weight_kg": _merge_metric("muscle_weight_kg"),
            "skeletal_muscle_kg": _merge_metric("skeletal_muscle_kg"),
            "body_water_kg": _merge_metric("body_water_kg"),
            "protein_kg": _merge_metric("protein_kg"),
            "minerals_kg": _merge_metric("minerals_kg"),
            "left_upper_muscle_kg": _merge_metric("left_upper_muscle_kg"),
            "right_upper_muscle_kg": _merge_metric("right_upper_muscle_kg"),
            "left_lower_muscle_kg": _merge_metric("left_lower_muscle_kg"),
            "right_lower_muscle_kg": _merge_metric("right_lower_muscle_kg"),
            "trunk_muscle_kg": _merge_metric("trunk_muscle_kg"),
            "left_upper_fat_kg": _merge_metric("left_upper_fat_kg"),
            "right_upper_fat_kg": _merge_metric("right_upper_fat_kg"),
            "left_lower_fat_kg": _merge_metric("left_lower_fat_kg"),
            "right_lower_fat_kg": _merge_metric("right_lower_fat_kg"),
            "trunk_fat_kg": _merge_metric("trunk_fat_kg"),
            "waist_cm": _merge_metric("waist_cm"),
            "hip_cm": _merge_metric("hip_cm"),
            "inbody_score": _merge_metric("inbody_score"),
            "bmr_kcal": _merge_metric("bmr_kcal"),
            "bmi": _bmi,
            "smi": _smi,
            "whr": _whr,
            "body_assessment": _assessment,
            "height_cm": float(height_cm_raw) if height_cm_raw else None,
        }
    else:
        body_metrics = {
            "body_weight_kg": None, "body_fat_rate_pct": None, "body_fat_kg": None,
            "muscle_weight_kg": None, "skeletal_muscle_kg": None,
            "body_water_kg": None, "protein_kg": None, "minerals_kg": None,
            "left_upper_muscle_kg": None, "right_upper_muscle_kg": None,
            "left_lower_muscle_kg": None, "right_lower_muscle_kg": None, "trunk_muscle_kg": None,
            "left_upper_fat_kg": None, "right_upper_fat_kg": None,
            "left_lower_fat_kg": None, "right_lower_fat_kg": None, "trunk_fat_kg": None,
            "waist_cm": None, "hip_cm": None,
            "inbody_score": None, "bmr_kcal": None,
            "bmi": None, "smi": None, "whr": None, "body_assessment": "",
            "height_cm": None,
        }

    # Cost status
    spent = get_month_spent_rmb(db)
    cost_status = {
        "monthly_budget_rmb": 30.0,
        "spent_rmb": round(spent, 4),
        "remaining_rmb": round(30.0 - spent, 4),
    }

    return DashboardResponse(
        today_training=today_training,
        recovery=recovery,
        nutrition=nutrition,
        goal_progress=goal_progress,
        weight_trend=weight_trend,
        body_metrics=body_metrics,
        cost_status=cost_status,
    )


MAX_CHAT_MESSAGES = 10000  # keep all messages up to this count, then trim oldest


def _trim_chat_messages(db: Session, user_id: str, max_count: int = MAX_CHAT_MESSAGES) -> int:
    """Delete oldest messages for user when exceeding max_count. Returns number deleted."""
    total = db.scalar(
        select(func.count(ChatMessageEntity.id)).where(ChatMessageEntity.user_id == user_id)
    ) or 0
    if total <= max_count:
        return 0

    # Find the id of the Nth oldest message, delete everything older
    cutoff_id = db.scalar(
        select(ChatMessageEntity.id)
        .where(ChatMessageEntity.user_id == user_id)
        .order_by(ChatMessageEntity.id.desc())
        .offset(max_count - 1)
        .limit(1)
    )
    if cutoff_id is None:
        return 0

    result = db.execute(
        ChatMessageEntity.__table__.delete().where(
            ChatMessageEntity.user_id == user_id,
            ChatMessageEntity.id < cutoff_id,
        )
    )
    return result.rowcount


@app.get("/api/v1/chat/history", response_model=ChatHistoryResponse)
def get_chat_history(
    user_id: str = Query(default="default"),
    db: Session = Depends(get_db),
):
    """Load all persisted chat messages for a user."""
    rows = db.scalars(
        select(ChatMessageEntity)
        .where(ChatMessageEntity.user_id == user_id)
        .order_by(ChatMessageEntity.id.asc())
    ).all()

    messages = [
        ChatHistoryMessage(
            id=row.id,
            user_id=row.user_id,
            role=row.role,
            content=row.content,
            tokens_used=row.tokens_used,
            thinking_time_ms=row.thinking_time_ms,
            thinking_process=row.thinking_process,
            rag_sources=row.rag_sources,
            created_at=row.created_at.isoformat() if row.created_at else "",
        )
        for row in rows
    ]
    return ChatHistoryResponse(messages=messages, total_count=len(messages))


@app.delete("/api/v1/chat/history")
def clear_chat_history(
    user_id: str = Query(default="default"),
    keep_latest: int = Query(default=50, description="Keep the latest N messages, 0 to clear all"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Clear chat history. By default keeps latest 50 messages."""
    if keep_latest <= 0:
        deleted = db.execute(
            ChatMessageEntity.__table__.delete().where(
                ChatMessageEntity.user_id == user_id
            )
        ).rowcount
    else:
        cutoff_id = db.scalar(
            select(ChatMessageEntity.id)
            .where(ChatMessageEntity.user_id == user_id)
            .order_by(ChatMessageEntity.id.desc())
            .offset(keep_latest - 1)
            .limit(1)
        )
        if cutoff_id is None:
            return {"deleted": 0, "message": "No messages to clear"}
        deleted = db.execute(
            ChatMessageEntity.__table__.delete().where(
                ChatMessageEntity.user_id == user_id,
                ChatMessageEntity.id < cutoff_id,
            )
        ).rowcount

    return {"deleted": deleted, "message": f"Deleted {deleted} messages"}


@app.get("/api/v1/settings")
def get_all_settings(db: Session = Depends(get_db)) -> dict[str, Any]:
    return list_settings(db)
