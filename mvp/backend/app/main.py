from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path
import json
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

from .actions import ActionRequest
from .action_registry import ActionDef, ActionRegistry
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
from .services.food_recognition import food_client as _food_client
from .services.inbody_ocr import run_inbody_ocr_with_volcengine
from .services.volcengine_ocr_client import VolcengineOcrClient
from .services.rag_pipeline import rag_pipeline as _rag_pipeline
from .services.profile_aggregator import aggregate_user_profile, profile_to_prompt_context



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
    db = next(get_db())
    try:
        _migrate_body_metrics_schema(db)
        _migrate_nutrition_logs_schema(db)
    finally:
        db.close()
    # Preload RAG knowledge base in background
    import threading
    threading.Thread(target=_rag_pipeline.ensure_loaded, daemon=True).start()


def _migrate_body_metrics_schema(db: Session) -> None:
    """v0.3.0: 去掉 body_metrics.log_date UNIQUE + 新增 source 列"""
    engine = db.get_bind()
    if engine.dialect.name != "sqlite":
        return

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("PRAGMA table_info(body_metrics)")
        cols = [r[1] for r in cur.fetchall()]
        if "source" in cols:
            return  # 已迁移

        cur.executescript("""
            CREATE TABLE body_metrics_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date DATE NOT NULL,
                body_weight_kg FLOAT,
                body_fat_rate_pct FLOAT,
                body_fat_kg FLOAT,
                muscle_weight_kg FLOAT,
                skeletal_muscle_kg FLOAT,
                body_water_kg FLOAT,
                protein_kg FLOAT,
                minerals_kg FLOAT,
                left_upper_muscle_kg FLOAT,
                right_upper_muscle_kg FLOAT,
                left_lower_muscle_kg FLOAT,
                right_lower_muscle_kg FLOAT,
                trunk_muscle_kg FLOAT,
                left_upper_fat_kg FLOAT,
                right_upper_fat_kg FLOAT,
                left_lower_fat_kg FLOAT,
                right_lower_fat_kg FLOAT,
                trunk_fat_kg FLOAT,
                waist_cm FLOAT,
                hip_cm FLOAT,
                inbody_score INTEGER,
                bmr_kcal INTEGER,
                source VARCHAR(32) NOT NULL DEFAULT 'manual',
                source_asset_id INTEGER REFERENCES knowledge_assets(id) ON DELETE SET NULL,
                created_at DATETIME NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO body_metrics_new (
                id, log_date, body_weight_kg, body_fat_rate_pct, body_fat_kg,
                muscle_weight_kg, skeletal_muscle_kg, body_water_kg, protein_kg,
                minerals_kg, left_upper_muscle_kg, right_upper_muscle_kg,
                left_lower_muscle_kg, right_lower_muscle_kg, trunk_muscle_kg,
                left_upper_fat_kg, right_upper_fat_kg, left_lower_fat_kg,
                right_lower_fat_kg, trunk_fat_kg, waist_cm, hip_cm,
                inbody_score, bmr_kcal, source_asset_id, created_at
            )
            SELECT
                id, log_date, body_weight_kg, body_fat_rate_pct, body_fat_kg,
                muscle_weight_kg, skeletal_muscle_kg, body_water_kg, protein_kg,
                minerals_kg, left_upper_muscle_kg, right_upper_muscle_kg,
                left_lower_muscle_kg, right_lower_muscle_kg, trunk_muscle_kg,
                left_upper_fat_kg, right_upper_fat_kg, left_lower_fat_kg,
                right_lower_fat_kg, trunk_fat_kg, waist_cm, hip_cm,
                inbody_score, bmr_kcal, source_asset_id, created_at
            FROM body_metrics;
            DROP TABLE body_metrics;
            ALTER TABLE body_metrics_new RENAME TO body_metrics;
            CREATE INDEX IF NOT EXISTS ix_body_metrics_log_date ON body_metrics(log_date);
            CREATE INDEX IF NOT EXISTS ix_body_metrics_source_asset_id ON body_metrics(source_asset_id);
        """)
        raw.commit()
    finally:
        raw.close()


def _migrate_nutrition_logs_schema(db: Session) -> None:
    """v0.3.0: nutrition_logs 删除 4 个身体指标字段, 历史数据迁移到 body_metrics"""
    engine = db.get_bind()
    if engine.dialect.name != "sqlite":
        return

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("PRAGMA table_info(nutrition_logs)")
        cols = [r[1] for r in cur.fetchall()]
        if "body_weight_kg" not in cols:
            return  # 已迁移

        # 1. 迁移历史数据: nutrition_logs 中有体测数据 → body_metrics (同日期跳过)
        cur.execute("""
            INSERT OR IGNORE INTO body_metrics (log_date, body_weight_kg, body_fat_rate_pct, muscle_weight_kg, waist_cm, source)
            SELECT log_date, body_weight_kg, body_fat_rate_pct, muscle_weight_kg, waist_cm, 'nutrition_migrate'
            FROM nutrition_logs
            WHERE body_weight_kg IS NOT NULL
               OR body_fat_rate_pct IS NOT NULL
               OR muscle_weight_kg IS NOT NULL
               OR waist_cm IS NOT NULL
        """)

        # 2. 重建 nutrition_logs 表(不含 4 列)
        cur.executescript("""
            CREATE TABLE nutrition_logs_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date DATE NOT NULL,
                calories_kcal INTEGER NOT NULL,
                protein_g FLOAT NOT NULL,
                carbs_g FLOAT NOT NULL,
                fat_g FLOAT NOT NULL,
                water_liters FLOAT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                created_at DATETIME NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO nutrition_logs_new (id, log_date, calories_kcal, protein_g, carbs_g, fat_g, water_liters, notes, created_at)
            SELECT id, log_date, calories_kcal, protein_g, carbs_g, fat_g, water_liters, notes, created_at
            FROM nutrition_logs;
            DROP TABLE nutrition_logs;
            ALTER TABLE nutrition_logs_new RENAME TO nutrition_logs;
            CREATE INDEX IF NOT EXISTS ix_nutrition_logs_log_date ON nutrition_logs(log_date);
        """)
        raw.commit()
    finally:
        raw.close()


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


def _insert_body_metric(
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
    source: str = "manual",
    source_asset_id: int | None = None,
) -> BodyMetricEntity:
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
        source=source,
        source_asset_id=source_asset_id,
    )
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


# ── Action handlers (wrappers for ActionRegistry) ──────────────────────────

async def _action_body_metric_upsert(payload: BodyMetricCreate, db: Session) -> dict:
    if payload.height_cm is not None:
        set_setting(db, "height_cm", payload.height_cm)
    item = _insert_body_metric(
        db, log_date=payload.log_date, body_weight_kg=payload.body_weight_kg,
        body_fat_rate_pct=payload.body_fat_rate_pct, body_fat_kg=payload.body_fat_kg,
        muscle_weight_kg=payload.muscle_weight_kg, skeletal_muscle_kg=payload.skeletal_muscle_kg,
        body_water_kg=payload.body_water_kg, protein_kg=payload.protein_kg,
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
        waist_cm=payload.waist_cm, hip_cm=payload.hip_cm,
        inbody_score=payload.inbody_score, bmr_kcal=payload.bmr_kcal,
        source=payload.source,
        source_asset_id=payload.source_asset_id,
    )
    return {"id": item.id, "log_date": str(item.log_date)}


_BODY_FIELD_NAMES = ("body_weight_kg", "body_fat_rate_pct", "muscle_weight_kg", "waist_cm")


async def _action_nutrition_create(payload: NutritionLogCreate, db: Session) -> dict:
    data = payload.model_dump()
    body_kwargs = {}
    for k in _BODY_FIELD_NAMES:
        v = data.pop(k, None)
        if v is not None:
            body_kwargs[k] = v

    item = NutritionLogEntity(**data)
    db.add(item)
    db.flush()
    db.refresh(item)

    if body_kwargs:
        _insert_body_metric(db, log_date=payload.log_date, source="nutrition_sync", **body_kwargs)

    return {"id": item.id}


async def _action_workout_create(payload: WorkoutSessionCreate, db: Session) -> dict:
    item = WorkoutSessionEntity(
        training_date=payload.training_date, focus_area=payload.focus_area, notes=payload.notes,
    )
    db.add(item)
    db.flush()
    for s in payload.exercise_sets:
        db.add(WorkoutSetEntity(
            workout_session_id=item.id, exercise_name=s.exercise_name,
            equipment=s.equipment, sets=s.sets, reps=s.reps,
            weight_kg=s.weight_kg, rpe=s.rpe,
        ))
    db.flush()
    db.refresh(item)
    return {"id": item.id}


async def _action_readiness_create(payload: ReadinessLogCreate, db: Session) -> dict:
    item = ReadinessLogEntity(**payload.model_dump())
    db.add(item)
    db.flush()
    db.refresh(item)
    return {"id": item.id}


async def _action_goal_update(payload: GoalConfig, db: Session) -> dict:
    set_setting(db, "goal_tracking", payload.model_dump(mode="json"))
    db.flush()
    return {"updated": True}


# ── Action registration (executed at module load) ─────────────────────────

ActionRegistry.register(ActionDef(
    name="body_metric.upsert",
    description="创建或更新身体指标记录。字段: log_date, body_weight_kg, body_fat_rate_pct, body_fat_kg, muscle_weight_kg, skeletal_muscle_kg, body_water_kg, protein_kg, minerals_kg, left_upper_muscle_kg, right_upper_muscle_kg, left_lower_muscle_kg, right_lower_muscle_kg, trunk_muscle_kg, left_upper_fat_kg, right_upper_fat_kg, left_lower_fat_kg, right_lower_fat_kg, trunk_fat_kg, waist_cm, hip_cm, inbody_score, bmr_kcal, height_cm, source_asset_id",
    schema=BodyMetricCreate,
    handler=_action_body_metric_upsert,
    refresh_tags=["body_metrics", "dashboard"],
))

ActionRegistry.register(ActionDef(
    name="nutrition.create",
    description="记录一餐饮食。字段: log_date, calories_kcal, protein_g, carbs_g, fat_g, water_liters, body_weight_kg, body_fat_rate_pct, muscle_weight_kg, waist_cm, notes",
    schema=NutritionLogCreate,
    handler=_action_nutrition_create,
    refresh_tags=["nutrition", "dashboard"],
))

ActionRegistry.register(ActionDef(
    name="workout.create",
    description="记录一次训练。字段: training_date, focus_area, notes, exercise_sets[{exercise_name, equipment, sets, reps, weight_kg, rpe}]",
    schema=WorkoutSessionCreate,
    handler=_action_workout_create,
    refresh_tags=["training", "dashboard"],
))

ActionRegistry.register(ActionDef(
    name="readiness.create",
    description="记录每日恢复状态。字段: log_date, sleep_hours, fatigue_score, pain_score, stress_score",
    schema=ReadinessLogCreate,
    handler=_action_readiness_create,
    refresh_tags=["readiness", "dashboard"],
))

ActionRegistry.register(ActionDef(
    name="goal.update",
    description="更新目标设置。字段: goal_type(muscle_gain/fat_loss/maintenance), start_date, target_date, start_weight_kg, target_weight_kg, start_muscle_kg, target_muscle_kg",
    schema=GoalConfig,
    handler=_action_goal_update,
    refresh_tags=["goals", "dashboard"],
))


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
        select(BodyMetricEntity)
        .where(
            BodyMetricEntity.body_weight_kg.is_not(None),
            BodyMetricEntity.log_date >= start_window,
            BodyMetricEntity.log_date <= end_date,
        )
        .order_by(BodyMetricEntity.log_date.asc(), BodyMetricEntity.id.asc())
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
        select(BodyMetricEntity)
        .where(
            BodyMetricEntity.body_weight_kg.is_not(None),
            BodyMetricEntity.log_date <= date.today(),
        )
        .order_by(desc(BodyMetricEntity.log_date), desc(BodyMetricEntity.id))
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


# ── Unified Action Layer ──────────────────────────────────────────────────


@app.get("/api/v1/actions")
async def list_actions() -> list[dict[str, Any]]:
    """返回所有可用 action 及字段 schema — AI 用于发现系统能力."""
    return ActionRegistry.list_actions()


@app.post("/api/v1/actions")
async def dispatch_action(req: ActionRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    """统一 action 分发 — 所有数据写操作的唯一入口."""
    return await ActionRegistry.dispatch(req.action, req.payload, db)


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
    data = payload.model_dump()
    body_kwargs = {}
    for k in _BODY_FIELD_NAMES:
        v = data.pop(k, None)
        if v is not None:
            body_kwargs[k] = v
    item = NutritionLogEntity(**data)
    db.add(item)
    db.flush()
    db.refresh(item)
    if body_kwargs:
        _insert_body_metric(db, log_date=payload.log_date, source="nutrition_sync", **body_kwargs)
    return _to_nutrition_schema(item)


@app.put("/api/v1/nutrition/{log_id}", response_model=NutritionLog)
def update_nutrition(log_id: int, payload: NutritionLogUpdate, db: Session = Depends(get_db)) -> NutritionLog:
    item = db.get(NutritionLogEntity, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Nutrition log not found")
    for field_name in (
        "log_date", "calories_kcal", "protein_g", "carbs_g", "fat_g",
        "water_liters", "notes",
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

    item = _insert_body_metric(
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
        metric_row = _insert_body_metric(
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
        metric_row = _insert_body_metric(
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
        metric_row = _insert_body_metric(
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

    metric_row = _insert_body_metric(
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

    if payload.rejected:
        proposal.status = "rejected"
        proposal.resolved_at = datetime.utcnow()
        db.flush()
        db.refresh(proposal)
        return _to_change_proposal_schema(proposal)

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


# ---------------------------------------------------------------------------
# AI Tool definitions (OpenAI/DeepSeek function-calling format)
# ---------------------------------------------------------------------------

AI_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_dashboard_data",
            "description": "获取用户当前的仪表盘数据概览，包括训练、恢复、饮食、身体成分、目标进度、身高",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "render_form",
            "description": (
                "输出一个可填写的表单JSON Schema，前端会自动渲染为交互式表单。\n"
                "当用户想要记录数据时，你必须使用此工具生成表单，让用户自己确认填写。\n"
                "绝对不允许直接修改用户数据。\n"
                "action 必须是 get_available_actions 返回列表中的某个 name。\n"
                "字段 key 必须与对应 action schema 的 property 名完全一致。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "表单标题"},
                    "description": {"type": "string", "description": "表单说明，解释用户填写后会发生什么"},
                    "action": {
                        "type": "string",
                        "enum": ["body_metric.upsert", "nutrition.create", "workout.create", "readiness.create", "goal.update"],
                        "description": "数据写入 action 名称。body_metric.upsert(身体指标)/nutrition.create(饮食)/workout.create(训练)/readiness.create(恢复)/goal.update(目标)",
                    },
                    "fields": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "key": {"type": "string", "description": "字段键名，必须与对应 action schema 的 property 名完全一致"},
                                "label": {"type": "string", "description": "中文标签"},
                                "type": {"type": "string", "enum": ["number", "integer", "string", "date", "select"], "description": "字段类型"},
                                "unit": {"type": "string", "description": "单位，如 kg, %, kcal, cm"},
                                "required": {"type": "boolean", "description": "是否必填"},
                                "placeholder": {"type": "string", "description": "占位提示文本（如'请输入体重'），不要填实际数值——用 default_value 预填"},
                                "min": {"type": "number", "description": "最小值"},
                                "max": {"type": "number", "description": "最大值"},
                                "options": {"type": "array", "items": {"type": "string"}, "description": "select类型的选项"},
                                "default_value": {"description": "预填默认值，从用户消息中提取的具体数值。如用户说'身高191cm'则default_value=191。和placeholder完全不同——default_value会预填进表单"},
                            },
                            "required": ["key", "label", "type"],
                        },
                        "description": "表单字段列表",
                    },
                },
                "required": ["title", "action", "fields"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_available_actions",
            "description": "获取所有可用的数据修改 action 列表及其字段 schema。在需要生成 render_form 之前调用此工具，以获取准确的字段定义（字段名、类型、约束）。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "render_chart",
            "description": "输出图表配置JSON，前端会自动渲染为可视化图表。支持 line（趋势）、bar（对比）、pie（占比）、gauge（仪表盘）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_type": {"type": "string", "enum": ["line", "bar", "pie", "gauge"], "description": "图表类型"},
                    "title": {"type": "string", "description": "图表标题"},
                    "labels": {"type": "array", "items": {"type": "string"}, "description": "X轴/分类标签"},
                    "datasets": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string", "description": "数据集名称"},
                                "data": {"type": "array", "items": {"type": "number"}, "description": "数据值"},
                                "color": {"type": "string", "description": "颜色 hex"},
                            },
                            "required": ["label", "data"],
                        },
                        "description": "数据集",
                    },
                },
                "required": ["chart_type", "title", "labels", "datasets"],
            },
        },
    },
]


# Schema params consumed by each tool handler (for unused_param detection).
# Keys not in this set are silently ignored by the handler -> data loss risk.
_CONSUMED_PARAMS: dict[str, set[str]] = {
    "get_dashboard_data": set(),
    "render_form": {"title", "description", "action", "fields"},
    "render_chart": {"chart_type", "title", "labels", "datasets"},
    "get_available_actions": set(),
}

LOG_DIR = Path(__file__).resolve().parents[2] / "log"
_AUDIT_LOG = LOG_DIR / "_tool_audit.jsonl"


def _write_tool_audit(tool_name: str, args: dict[str, Any], result: dict[str, Any]) -> None:
    """Write tool invocation input/output to JSONL for diagnostics."""
    try:
        _AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "tool": tool_name,
            "args": {k: v for k, v in args.items() if k != "exercise_sets"},
            "success": result.get("success"),
            "unused_params": result.get("unused_params", []),
        }
        with open(_AUDIT_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
    except Exception:
        pass


def _execute_tool(db_session_factory, tool_name: str, tool_args: dict[str, Any]) -> dict[str, Any]:
    """Execute a single tool call and return the result. Opens fresh DB session."""
    from .db import SessionLocal as _SL

    session = _SL()
    try:
        if tool_name == "get_dashboard_data":
            latest_nutrition = session.scalar(select(NutritionLogEntity).order_by(desc(NutritionLogEntity.log_date), desc(NutritionLogEntity.id)))
            latest_readiness = session.scalar(select(ReadinessLogEntity).order_by(desc(ReadinessLogEntity.log_date), desc(ReadinessLogEntity.id)))
            latest_body_metric = session.scalar(select(BodyMetricEntity).order_by(desc(BodyMetricEntity.log_date), desc(BodyMetricEntity.id)))
            goal_config = _load_goal_config(session)
            goal_progress = _build_goal_progress(session, goal_config)
            height_cm_val = get_setting(session, "height_cm")
            return {
                "success": True,
                "nutrition": {
                    "latest_calories": latest_nutrition.calories_kcal if latest_nutrition else None,
                    "latest_protein_g": latest_nutrition.protein_g if latest_nutrition else None,
                },
                "recovery": {
                    "latest_sleep_hours": latest_readiness.sleep_hours if latest_readiness else None,
                    "latest_fatigue": latest_readiness.fatigue_score if latest_readiness else None,
                },
                "goal": {
                    "type": goal_progress.goal_type,
                    "current_weight": goal_progress.current_weight_kg,
                    "target_weight": goal_progress.target_weight_kg,
                    "days_remaining": goal_progress.days_remaining,
                    "progress": goal_progress.progress_label,
                },
                "body_metric": {
                    "latest_weight_kg": latest_body_metric.body_weight_kg if latest_body_metric else None,
                    "latest_body_fat_pct": latest_body_metric.body_fat_rate_pct if latest_body_metric else None,
                    "latest_muscle_kg": latest_body_metric.muscle_weight_kg if latest_body_metric else None,
                    "latest_waist_cm": latest_body_metric.waist_cm if latest_body_metric else None,
                },
                "profile": {
                    "height_cm": float(height_cm_val) if height_cm_val else None,
                },
            }

        elif tool_name == "render_form":
            return {"success": True, "rendered": "form", "form_schema": tool_args}

        elif tool_name == "render_chart":
            return {"success": True, "rendered": "chart", "chart_config": tool_args}

        elif tool_name == "get_available_actions":
            import json as _json2
            return {"success": True, "actions": ActionRegistry.list_actions()}

        else:
            return {"success": False, "error": f"Unknown tool: {tool_name}"}

    except Exception as exc:
        session.rollback()
        return {"success": False, "error": str(exc)}
    finally:
        session.close()


# Keywords that indicate the user wants to record/modify data (→ force render_form)
_RECORD_INTENT_PATTERNS = [
    "记录一下", "更新一下", "修改一下", "调整一下",
    "帮我记", "记录", "更新", "修改", "设置", "输入", "添加", "保存",
    "改成", "改为", "调整", "设为", "记一下",
    "录入", "登记", "填写", "上报", "写一下", "改一下",
]

# Query keywords that override record intent (e.g. "查看记录" is a query, not record)
_QUERY_OVERRIDE_PATTERNS = [
    "查看", "显示", "看.", "看？", "看看", "趋势", "图表",
    "多少", "怎么样", "如何", "为什么", "是什么",
]


def _detect_intent(user_message: str) -> str:
    """Classify user intent for tool_choice strategy."""
    for pat in _QUERY_OVERRIDE_PATTERNS:
        if pat in user_message:
            return "general"
    for pat in _RECORD_INTENT_PATTERNS:
        if pat in user_message:
            return "record_data"
    return "general"


@app.post("/api/v1/chat")
async def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    """Main chat endpoint with tool-calling, thinking mode, and vision support."""
    import json as _json

    spent = get_month_spent_rmb(db)
    last_msg = payload.messages[-1].content if payload.messages else ""

    # Intent detection → drives tool_choice strategy
    user_intent = _detect_intent(last_msg)

    # Determine model: user override > cost router > env default
    # When thinking_mode is off (fast mode), force a non-reasoning model
    thinking_enabled = payload.thinking_mode
    if payload.model:
        model = payload.model
        route_tier = "l1"
        route_reason = "user selected model"
        if not thinking_enabled and "reasoner" in model.lower():
            model = cost_config.model_l1
            route_reason = "fast mode override (reasoner → flash)"
    else:
        needs_complex = any(k in last_msg.lower() for k in ["plateau", "injury", "deload", "complex", "conflict"])
        route_tier, route_reason = pick_tier(
            config=cost_config, spent_rmb=spent, preference="auto", needs_complex_reasoning=needs_complex,
        )
        model = cost_config.model_l2 if route_tier == "l2" else cost_config.model_l1
        if not thinking_enabled and route_tier == "l2":
            model = cost_config.model_l1
            route_reason = "fast mode override (L2 → L1)"

    # Build system prompt
    system_prompt = (
        "<role>\n"
        "You are a professional strength and conditioning coach AI. You help users track\n"
        "fitness data and get personalized advice.\n\n"
        "IMPORTANT: You CANNOT directly modify the user's data. All data recording must\n"
        "go through forms that the user fills in and confirms. This ensures data integrity.\n\n"
        "Your coaching personality:\n"
        "- Data-driven but warm — celebrate progress, address setbacks constructively\n"
        "- Concise — prefer one clear recommendation over a wall of text\n"
        "- Honest about uncertainty — if the user's data is incomplete, acknowledge it\n"
        "  rather than pretending precision\n\n"
        "HARD BOUNDARIES:\n"
        "- NEVER prescribe aggressive load increases when recovery metrics are poor\n"
        "- NEVER recommend training through pain that sounds like an injury\n"
        "- NEVER invent, guess, or fabricate numerical data\n"
        "- NEVER suggest supplements, medications, or medical diagnoses\n"
        "</role>\n\n"
        "<decision_flow>\n"
        "When a user sends a message, follow this decision tree:\n\n"
        "STEP 1 — CLASSIFY THE USER'S INTENT\n"
        '  ├─ "I want to record data" (nutrition, workout, recovery, body metrics, goal)\n'
        "  │   → Use render_form to generate an interactive form. NEVER write data directly.\n"
        "  │     The user will fill in the form and submit it themselves.\n"
        '  ├─ "I want to see my data visualized" (charts, trends, comparisons)\n'
        "  │   → FIRST call get_dashboard_data, then use render_chart with real data.\n"
        '  ├─ "I need advice or knowledge" (training questions, nutrition guidance)\n'
        "  │   → FIRST call get_dashboard_data to fetch the user's real data.\n"
        "  │     Then analyze the data and give personalized advice.\n"
        '  └─ "Casual chat or greeting"\n'
        "      → Respond directly.\n\n"
        "CRITICAL: You have 4 tools:\n"
        "  1. get_dashboard_data — read current stats (MANDATORY before any advice)\n"
        "  2. get_available_actions — get available data-entry actions with field schemas\n"
        "  3. render_form — generate a form for the user to fill in (action must be from get_available_actions)\n"
        "  4. render_chart — visualize data with charts\n"
        "There are NO direct write tools. All data entry goes through render_form.\n"
        "</decision_flow>\n\n"
        "<tool_usage_rules>\n"
        "get_dashboard_data — fetch current stats (MANDATORY for any data-dependent response)\n"
        "  WHEN: user asked ANY question that needs current data to answer well.\n"
        "  RULE: If you don't know the answer without checking user data, you MUST\n"
        "        call this tool FIRST. NEVER say \"让我看看你的数据\" without calling it.\n\n"
        "get_available_actions — discover available data-entry actions and their field schemas\n"
        "  WHEN: before calling render_form to know exact field names, types, and constraints.\n"
        "  RULE: call this FIRST if you do not know the exact fields for the data type.\n"
        "        Each action schema lists the valid field keys and their constraints.\n\n"
        "render_form — show an interactive data entry form (THE ONLY WAY to record data)\n"
        "  WHEN: user wants to record ANY data (nutrition, workout, recovery, body metrics,\n"
        "        goal, profile). Whether they provided numbers or not — ALWAYS use render_form.\n"
        "  HOW:  set action to one of the names from get_available_actions.\n"
        "        Include fields relevant to what the user wants to record. Use Chinese labels.\n"
        "        Set reasonable min/max for numeric fields. Include the unit in the label or\n"
        "        as a separate unit field.\n"
        "        CRITICAL: When the user provides specific values (e.g. '身高191cm' or '体重75kg'),\n"
        "        set default_value on the field with that value (NOT placeholder!). This pre-fills the form\n"
        "        so the user only needs to confirm, not re-enter data.\n"
        "        Field keys MUST match the action schema property names. Call get_available_actions if you are unsure about field names.\n"
        "  WHY:  forms let the user review and confirm before data is saved. This is the\n"
        "        only reliable path to the database.\n\n"
        "render_chart — visualize data with a chart\n"
        "  WHEN: user asked to see trends, comparisons, or visual summaries.\n"
        "  HOW:  FIRST call get_dashboard_data, THEN use render_chart with the real data.\n"
        "</tool_usage_rules>\n\n"
        "<examples>\n"
        "<example>\n"
        'User: "我今天早上体重75kg，帮我记录一下"\n'
        "Assistant calls: get_dashboard_data() then render_form({\n"
        '  title: \"记录体重数据\",\n'
        '  action: \"body_metric.upsert\",\n'
        '  fields: [{key: \"body_weight_kg\", label: \"体重\", type: \"number\", unit: \"kg\", required: true, min: 30, max: 300}]\n'
        "})\n"
        "Assistant responds:\n"
        "  好的！我帮你准备了体重记录表单，当前值已预填75kg。请确认后提交，数据会自动保存。\n"
        "</example>\n\n"
        "<example>\n"
        'User: "帮我记录饮食"\n'
        "Assistant calls: render_form({\n"
        '  title: \"记录今日饮食\", action: \"nutrition.create\",\n'
        '  fields: [{key: \"calories_kcal\", label: \"总热量\", type: \"integer\", unit: \"kcal\"}, ...]\n'
        "})\n"
        "Assistant responds:\n"
        "  请填写下面的表单来记录今天的饮食数据，填完后提交即可保存。\n"
        "</example>\n\n"
        "<example>\n"
        'User: "我最近训练怎么样？"\n'
        "Assistant calls: get_dashboard_data()\n"
        "Assistant responds with personalized analysis based on the real data returned.\n"
        "</example>\n"
        "</examples>\n\n"
        "<constraints>\n"
        "- Always respond in Chinese (except tool names, JSON keys, and code blocks)\n"
        "- Keep responses concise: 2-4 sentences for forms, 3-5 for advice\n"
        "- NEVER use batch_summary blocks — those were for direct write tools which no longer exist\n"
        "- If you called render_chart, output a :::chart block in the response\n"
        "- When user provides numbers, include them as default values in the form fields\n"
        "</constraints>"
    )

    rag_sources = []
    if payload.enable_rag and route_tier != "l0":
        try:
            rag_results = _rag_pipeline.search(last_msg, top_k=3)
            rag_sources = rag_results
            rag_context = _rag_pipeline.build_rag_context(last_msg, max_chars=2000, top_k=3)
            if rag_context:
                system_prompt += f"\n\n## Relevant fitness knowledge\n{rag_context}\n\nUse this knowledge to inform your answer."
        except Exception:
            pass

    if payload.enable_profile and route_tier != "l0":
        try:
            profile = aggregate_user_profile(db)
            profile_ctx = profile_to_prompt_context(profile)
            if profile_ctx:
                system_prompt += f"\n\n## User profile and recent data\n{profile_ctx}\n\nUse this data to personalize your advice."
        except Exception:
            pass

    # Inject available actions when the user wants to record data
    if user_intent == "record_data":
        import json as _json3
        actions_info = _json3.dumps(ActionRegistry.list_actions(), ensure_ascii=False)
        system_prompt += f"\n\n## Available data-entry actions\n{actions_info}\n\nWhen calling render_form, set action to one of the names listed above. Use the exact field keys from the action's schema."

    # Build API messages — support images for vision
    api_messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for msg in payload.messages:
        if msg.role == "user" and payload.images and payload.images[0]:
            # Multi-modal message with images
            content_parts: list[dict[str, Any]] = [{"type": "text", "text": msg.content}]
            for img_b64 in payload.images[:3]:  # max 3 images
                if img_b64.startswith("data:"):
                    content_parts.append({"type": "image_url", "image_url": {"url": img_b64}})
                else:
                    content_parts.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}})
            api_messages.append({"role": "user", "content": content_parts})
        else:
            api_messages.append({"role": msg.role, "content": msg.content})

    # Save user message
    user_msg_entity = ChatMessageEntity(user_id="default", role="user", content=last_msg)
    db.add(user_msg_entity)
    db.flush()

    approx_input_tokens = sum(len(str(m.get("content", ""))) // 4 for m in api_messages)
    estimated_cost = estimate_cost_rmb(cost_config, route_tier, approx_input_tokens, cost_config.max_output_tokens_per_call)

    thinking_parts: list[str] = []
    if rag_sources:
        thinking_parts.append(f"检索到 {len(rag_sources)} 篇相关知识:")
        for i, r in enumerate(rag_sources, 1):
            thinking_parts.append(f"  {i}. [{r['kb_name']}] {r['title']} (相关度: {r['score']})")
    thinking_process = "\n".join(thinking_parts) if thinking_parts else ""

    if not deepseek_client.is_configured():
        def _fallback():
            suggestion = suggest_today_plan(
                workouts=[],
                readiness_logs=[],
                goal=str(get_setting(db, "current_goal", "strength")),
            )
            yield {"event": "token", "data": _json.dumps({"type": "token", "content": f"[Rule Engine] {suggestion['action']}: {suggestion['reason']}. Set DEEPSEEK_API_KEY for AI-powered responses."}, ensure_ascii=False)}
            yield {"event": "meta", "data": _json.dumps({"type": "meta", "rag_sources": [], "route_tier": "l0", "estimated_cost_rmb": 0.0, "needs_profile_extraction": False}, ensure_ascii=False)}
        return EventSourceResponse(_fallback())

    def stream_generator():
        full_response = ""
        total_tokens = 0
        thinking_start = time.time()
        first_token_time: float | None = None
        thinking_time_ms = 0
        tool_calls_made: list[dict[str, Any]] = []
        accumulated_content = ""

        # Determine tool_choice based on user intent
        if user_intent == "record_data":
            tool_choice: str | dict[str, Any] = {"type": "function", "function": {"name": "render_form"}}
        else:
            tool_choice = "auto"

        # Debug: trace Round 1/2 flow
        debug_log = Path(__file__).resolve().parents[2] / "log" / "_debug_stream.log"
        def _debug(msg: str) -> None:
            try:
                with open(debug_log, "a", encoding="utf-8") as f:
                    f.write(f"[{datetime.utcnow().isoformat()}] {msg}\n")
            except Exception:
                pass
        _debug(f"=== New stream start, model={model}, thinking_enabled={thinking_enabled}, intent={user_intent}, tool_choice={tool_choice if isinstance(tool_choice, str) else 'forced:render_form'} ===")

        try:
            # --- Round 1: stream with tools ---
            tool_calls_buffer: dict[int, dict[str, Any]] = {}
            current_finish_reason = ""

            for chunk in deepseek_client.chat_completion_stream(
                model=model,
                messages=api_messages,
                max_tokens=cost_config.max_output_tokens_per_call,
                tools=AI_TOOLS,
                tool_choice=tool_choice,
                thinking_enabled=thinking_enabled,
            ):
                if chunk["type"] == "thinking":
                    if thinking_enabled:
                        yield {"event": "thinking", "data": _json.dumps({"type": "thinking", "content": chunk["content"]}, ensure_ascii=False)}

                elif chunk["type"] == "token":
                    if first_token_time is None:
                        first_token_time = time.time()
                        thinking_time_ms = int((first_token_time - thinking_start) * 1000)
                    full_response += chunk["content"]
                    yield {"event": "token", "data": _json.dumps({"type": "token", "content": chunk["content"]}, ensure_ascii=False)}

                elif chunk["type"] == "tool_call":
                    tool_calls_made.append({"id": chunk["id"], "name": chunk["name"], "arguments": chunk["arguments"]})
                    yield {"event": "tool_call", "data": _json.dumps({"type": "tool_call", "tool_name": chunk["name"], "arguments": chunk["arguments"], "id": chunk["id"]}, ensure_ascii=False)}

                elif chunk["type"] == "meta":
                    total_tokens = chunk.get("usage", {}).get("total_tokens", 0)

            accumulated_content = full_response

            _debug(f"Round 1 done. full_response_len={len(full_response)}, tool_calls_made={len(tool_calls_made)}, finish_reason={current_finish_reason}")

            # --- Round 2: if model called tools, execute and continue ---
            if tool_calls_made:
                # Execute tools
                tool_results: list[dict[str, Any]] = []
                for tc in tool_calls_made:
                    try:
                        args = _json.loads(tc["arguments"]) if isinstance(tc["arguments"], str) else tc["arguments"]
                    except (_json.JSONDecodeError, TypeError):
                        args = {}
                    result = _execute_tool(db, tc["name"], args)
                    _write_tool_audit(tc["name"], args, result)
                    tool_results.append({"tool_call_id": tc["id"], "role": "tool", "content": _json.dumps(result, ensure_ascii=False)})
                    yield {"event": "tool_result", "data": _json.dumps({"type": "tool_result", "tool_name": tc["name"], "result": result, "id": tc["id"]}, ensure_ascii=False)}

                # Add assistant tool_calls message and tool results to conversation
                api_messages.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [{"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": tc["arguments"]}} for tc in tool_calls_made],
                })
                for tr in tool_results:
                    api_messages.append(tr)

                # Round 2: stream the final response
                _debug(f"Round 2 starting, api_messages count={len(api_messages)}, last_role={api_messages[-1]['role'] if api_messages else 'N/A'}")
                round2_response = ""
                for chunk in deepseek_client.chat_completion_stream(
                    model=model,
                    messages=api_messages,
                    max_tokens=cost_config.max_output_tokens_per_call,
                    tools=AI_TOOLS,
                    tool_choice="auto",
                    thinking_enabled=thinking_enabled,
                ):
                    if chunk["type"] == "thinking":
                        if thinking_enabled:
                            yield {"event": "thinking", "data": _json.dumps({"type": "thinking", "content": chunk["content"]}, ensure_ascii=False)}

                    elif chunk["type"] == "token":
                        if first_token_time is None:
                            first_token_time = time.time()
                            thinking_time_ms = int((first_token_time - thinking_start) * 1000)
                        round2_response += chunk["content"]
                        full_response += chunk["content"]
                        yield {"event": "token", "data": _json.dumps({"type": "token", "content": chunk["content"]}, ensure_ascii=False)}

                    elif chunk["type"] == "tool_call":
                        # Handle cascaded tool calls
                        tool_calls_made.append({"id": chunk["id"], "name": chunk["name"], "arguments": chunk["arguments"]})
                        try:
                            args2 = _json.loads(chunk["arguments"]) if isinstance(chunk["arguments"], str) else chunk["arguments"]
                        except (_json.JSONDecodeError, TypeError):
                            args2 = {}
                        result2 = _execute_tool(db, chunk["name"], args2)
                        _write_tool_audit(chunk["name"], args2, result2)
                        yield {"event": "tool_result", "data": _json.dumps({"type": "tool_result", "tool_name": chunk["name"], "result": result2, "id": chunk["id"]}, ensure_ascii=False)}

                    elif chunk["type"] == "meta":
                        usage2 = chunk.get("usage", {})
                        if usage2.get("total_tokens"):
                            total_tokens += usage2["total_tokens"]

                accumulated_content = round2_response if round2_response else full_response

                _debug(f"Round 2 done. round2_response_len={len(round2_response)}, accumulated_len={len(accumulated_content)}")
            else:
                _debug("No tool calls made, skipping Round 2")

        except Exception as e:
            _debug(f"EXCEPTION in stream_generator: {type(e).__name__}: {e}")
            yield {"event": "error", "data": _json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)}
            return

        if first_token_time is None:
            thinking_time_ms = int((time.time() - thinking_start) * 1000)
        if total_tokens == 0:
            total_tokens = approx_input_tokens + len(full_response) // 4

        # Save to DB
        from .db import SessionLocal as _SessionLocal
        save_session = _SessionLocal()
        try:
            assistant_msg = ChatMessageEntity(
                user_id="default", role="assistant",
                content=accumulated_content,
                tokens_used=total_tokens, thinking_time_ms=thinking_time_ms,
                thinking_process=thinking_process,
                rag_sources=[{"kb_name": r["kb_name"], "title": r["title"], "snippet": r["snippet"][:200], "score": r["score"]} for r in rag_sources] if rag_sources else None,
            )
            save_session.add(assistant_msg)
            save_session.commit()
        except Exception:
            save_session.rollback()
        finally:
            save_session.close()

        yield {
            "event": "meta",
            "data": _json.dumps({
                "type": "meta",
                "rag_sources": [{"kb_name": r["kb_name"], "title": r["title"], "snippet": r["snippet"][:200], "score": r["score"]} for r in rag_sources],
                "route_tier": route_tier,
                "estimated_cost_rmb": estimated_cost,
                "tokens_used": total_tokens,
                "thinking_time_ms": thinking_time_ms,
                "thinking_process": thinking_process,
                "needs_profile_extraction": True,
            }, ensure_ascii=False),
        }

        save_session.add(LlmUsageLogEntity(
            tier=route_tier, model=model, route_reason=route_reason,
            input_tokens=approx_input_tokens, output_tokens=len(full_response) // 4,
            cost_rmb=estimated_cost, created_at=datetime.utcnow(),
        ))
        save_session.commit()

        # Parse batch_summary blocks from AI response and create change proposals
        # The AI outputs :::batch_summary{...}::: blocks when it executes data-writing tools.
        # These serve as inline confirmation cards — no separate extraction step needed.
        import re as _re
        batch_matches = _re.findall(r":::batch_summary\s*(\{[\s\S]*?\})\s*:::", full_response)
        for batch_json in batch_matches:
            try:
                batch = _json.loads(batch_json)
                for change in batch.get("changes", []):
                    if not change.get("success"):
                        continue
                    field_label = str(change.get("field_label", ""))
                    if not field_label:
                        continue
                    proposal_session = _SessionLocal()
                    try:
                        proposal = ChangeProposalEntity(
                            field_path=field_label,
                            old_value=str(change.get("before", "—")),
                            new_value=str(change.get("after", "")),
                            reason=f"Batch summary: {field_label}",
                            initiator="ai",
                            status="approved",
                            change_category=str(change.get("category", "profile")),
                        )
                        proposal_session.add(proposal)
                        proposal_session.commit()
                    except Exception:
                        proposal_session.rollback()
                    finally:
                        proposal_session.close()
            except Exception:
                pass

    return EventSourceResponse(stream_generator())


@app.post("/api/v1/chat/upload")
async def chat_upload_food_image(file: UploadFile = File(...)):
    """Upload a food image for recognition. Returns dish name + nutrition info."""
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

    # Run food recognition pipeline
    result = _food_client.image_to_nutrition(raw)

    return {
        "image_url": f"/uploads/{filename}",
        "filename": filename,
        "recognition": result,
    }


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
        "body_weight_kg": None,  # filled below from body_metrics
        "log_date": str(latest_nutrition.log_date) if latest_nutrition else "",
    }

    # Goal progress
    config = _load_goal_config(db)
    goal_progress_data = _build_goal_progress(db, config)
    goal_progress = {
        "goal_type": goal_progress_data.goal_type,
        "start_date": str(goal_progress_data.start_date) if goal_progress_data.start_date else None,
        "target_date": str(goal_progress_data.target_date) if goal_progress_data.target_date else None,
        "current_weight_kg": goal_progress_data.current_weight_kg,
        "target_weight_kg": goal_progress_data.target_weight_kg,
        "weight_gap_kg": goal_progress_data.weight_gap_kg,
        "days_remaining": goal_progress_data.days_remaining,
        "progress_label": goal_progress_data.progress_label,
        "summary": goal_progress_data.summary,
        "actual_weekly_weight_change_kg": goal_progress_data.actual_weekly_weight_change_kg,
        "required_weekly_weight_change_kg": goal_progress_data.required_weekly_weight_change_kg,
        "current_muscle_kg": goal_progress_data.current_muscle_kg,
        "target_muscle_kg": goal_progress_data.target_muscle_kg,
        "muscle_gap_kg": goal_progress_data.muscle_gap_kg,
    }

    # Weight trend (last 7 days) — from body_metrics, latest per date
    seven_days_ago = today.fromordinal(today.toordinal() - 6)
    weight_rows = db.scalars(
        select(BodyMetricEntity)
        .where(
            BodyMetricEntity.body_weight_kg.is_not(None),
            BodyMetricEntity.log_date >= seven_days_ago,
            BodyMetricEntity.log_date <= today,
        )
        .order_by(BodyMetricEntity.log_date.asc(), BodyMetricEntity.id.asc())
    ).all()

    weight_by_date: dict[str, float] = {}
    for r in weight_rows:
        weight_by_date[str(r.log_date)] = float(r.body_weight_kg)

    weight_trend = [
        {"log_date": d, "body_weight_kg": w}
        for d, w in sorted(weight_by_date.items())
    ]

    # Fill nutrition.body_weight_kg from weight_trend
    if weight_trend:
        nutrition["body_weight_kg"] = weight_trend[-1]["body_weight_kg"]

    # Body metrics — merge recent records so a partial save doesn't hide complete InBody data
    thirty_days_ago = today.fromordinal(today.toordinal() - 29)
    recent_metrics = db.scalars(
        select(BodyMetricEntity)
        .where(
            BodyMetricEntity.log_date >= thirty_days_ago,
            BodyMetricEntity.log_date <= today,
        )
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
