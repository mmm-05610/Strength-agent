from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session, sessionmaker

from .entities import AppSettingEntity, Base

DEFAULT_SQLITE_PATH = Path(__file__).resolve().parents[1] / "fitness_agent.db"
DEFAULT_SQLITE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    DEFAULT_SQLITE_URL,
)

engine_kwargs = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


DEFAULT_SETTINGS = {
    "current_goal": "strength",
    "height_cm": 175.0,
    "next_training_time": "2026-04-16 19:00",
    "cycle_week": 1,
    "weekly_plan": {
        "mon": "upper",
        "wed": "lower",
        "fri": "upper",
    },
    "budget": {
        "monthly_budget_rmb": 30,
        "soft_limit_ratio": 0.7,
        "hard_limit_ratio": 1.0,
    },
    "goal_tracking": {
        "goal_type": "muscle_gain",
        "start_date": "2026-04-16",
        "target_date": "2026-07-01",
        "start_weight_kg": 65.0,
        "target_weight_kg": 73.0,
        "start_muscle_kg": 31.9,
        "target_muscle_kg": 35.0,
        "latest_muscle_kg": 31.9,
    },
}


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_nutrition_optional_columns()
    _ensure_change_proposal_category_column()
    _ensure_body_metric_expanded_columns()
    with SessionLocal() as session:
        for key, value in DEFAULT_SETTINGS.items():
            existing = session.get(AppSettingEntity, key)
            if existing is None:
                session.add(AppSettingEntity(key=key, value=value))
        session.commit()


def _ensure_nutrition_optional_columns() -> None:
    if not DATABASE_URL.startswith("sqlite"):
        return

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "nutrition_logs" not in table_names:
        return

    existing_columns = {col["name"] for col in inspector.get_columns("nutrition_logs")}
    alter_sql: list[str] = []
    if "body_fat_rate_pct" not in existing_columns:
        alter_sql.append("ALTER TABLE nutrition_logs ADD COLUMN body_fat_rate_pct FLOAT")
    if "muscle_weight_kg" not in existing_columns:
        alter_sql.append("ALTER TABLE nutrition_logs ADD COLUMN muscle_weight_kg FLOAT")

    if not alter_sql:
        return

    with engine.begin() as conn:
        for sql in alter_sql:
            conn.execute(text(sql))


def _ensure_change_proposal_category_column() -> None:
    if not DATABASE_URL.startswith("sqlite"):
        return

    inspector = inspect(engine)
    if "change_proposals" not in set(inspector.get_table_names()):
        return

    existing_columns = {col["name"] for col in inspector.get_columns("change_proposals")}
    if "change_category" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE change_proposals ADD COLUMN change_category VARCHAR(32) NOT NULL DEFAULT 'profile'"))


def _ensure_body_metric_expanded_columns() -> None:
    if not DATABASE_URL.startswith("sqlite"):
        return

    inspector = inspect(engine)
    if "body_metrics" not in set(inspector.get_table_names()):
        return

    existing_columns = {col["name"] for col in inspector.get_columns("body_metrics")}
    new_float_cols = [
        "body_fat_kg", "skeletal_muscle_kg",
        "left_upper_muscle_kg", "right_upper_muscle_kg",
        "left_lower_muscle_kg", "right_lower_muscle_kg", "trunk_muscle_kg",
        "left_upper_fat_kg", "right_upper_fat_kg",
        "left_lower_fat_kg", "right_lower_fat_kg", "trunk_fat_kg",
        "waist_cm", "hip_cm",
    ]
    new_int_cols = ["inbody_score", "bmr_kcal"]
    new_comp_cols = ["body_water_kg", "protein_kg", "minerals_kg"]

    alter_sql: list[str] = []
    for col in new_float_cols + new_comp_cols:
        if col not in existing_columns:
            alter_sql.append(f"ALTER TABLE body_metrics ADD COLUMN {col} FLOAT")
    for col in new_int_cols:
        if col not in existing_columns:
            alter_sql.append(f"ALTER TABLE body_metrics ADD COLUMN {col} INTEGER")

    if not alter_sql:
        return

    with engine.begin() as conn:
        for sql in alter_sql:
            conn.execute(text(sql))


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_setting(session: Session, key: str, default=None):
    row = session.get(AppSettingEntity, key)
    if row is None:
        return default
    return row.value


def set_setting(session: Session, key: str, value) -> None:
    row = session.get(AppSettingEntity, key)
    if row is None:
        session.add(AppSettingEntity(key=key, value=value))
        return
    row.value = value


def list_settings(session: Session) -> dict:
    rows = session.scalars(select(AppSettingEntity)).all()
    return {row.key: row.value for row in rows}
