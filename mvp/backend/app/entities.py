from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


PK_TYPE = BigInteger().with_variant(Integer, "sqlite")


class Base(DeclarativeBase):
    pass


class WorkoutSessionEntity(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    training_date: Mapped[date] = mapped_column(Date, nullable=False)
    focus_area: Mapped[str] = mapped_column(String(64), nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    exercise_sets: Mapped[list[WorkoutSetEntity]] = relationship(
        "WorkoutSetEntity", back_populates="workout_session", cascade="all, delete-orphan"
    )


class WorkoutSetEntity(Base):
    __tablename__ = "workout_sets"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    workout_session_id: Mapped[int] = mapped_column(ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True)
    exercise_name: Mapped[str] = mapped_column(String(128), nullable=False)
    equipment: Mapped[str] = mapped_column(String(64), nullable=False)
    sets: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)

    workout_session: Mapped[WorkoutSessionEntity] = relationship("WorkoutSessionEntity", back_populates="exercise_sets")


class ReadinessLogEntity(Base):
    __tablename__ = "readiness_logs"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    log_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    sleep_hours: Mapped[float] = mapped_column(Float, nullable=False)
    fatigue_score: Mapped[int] = mapped_column(Integer, nullable=False)
    pain_score: Mapped[int] = mapped_column(Integer, nullable=False)
    stress_score: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class NutritionLogEntity(Base):
    __tablename__ = "nutrition_logs"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    log_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    calories_kcal: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_g: Mapped[float] = mapped_column(Float, nullable=False)
    water_liters: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class KnowledgeAssetEntity(Base):
    __tablename__ = "knowledge_assets"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    asset_type: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    source_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    captured_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class BodyMetricEntity(Base):
    __tablename__ = "body_metrics"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    log_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    body_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_fat_rate_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_fat_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    muscle_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    skeletal_muscle_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_water_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    minerals_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Segmental muscle
    left_upper_muscle_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    right_upper_muscle_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    left_lower_muscle_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    right_lower_muscle_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    trunk_muscle_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Segmental fat
    left_upper_fat_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    right_upper_fat_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    left_lower_fat_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    right_lower_fat_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    trunk_fat_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Measurements
    waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    hip_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Scores
    inbody_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bmr_kcal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Meta
    source: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    source_asset_id: Mapped[int | None] = mapped_column(ForeignKey("knowledge_assets.id", ondelete="SET NULL"), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ChangeProposalEntity(Base):
    __tablename__ = "change_proposals"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    field_path: Mapped[str] = mapped_column(String(128), nullable=False)
    old_value: Mapped[dict | str | int | float | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | str | int | float | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    initiator: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    change_category: Mapped[str] = mapped_column(String(32), nullable=False, default="profile")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLogEntity(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(16), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    field_path: Mapped[str] = mapped_column(String(128), nullable=False)
    old_value: Mapped[dict | str | int | float | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | str | int | float | None] = mapped_column(JSON, nullable=True)
    evidence: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AppSettingEntity(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class LlmUsageLogEntity(Base):
    __tablename__ = "llm_usage_logs"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    tier: Mapped[str] = mapped_column(String(8), index=True, nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    route_reason: Mapped[str] = mapped_column(String(256), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_rmb: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ChatMessageEntity(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), default="default", index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thinking_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thinking_process: Mapped[str | None] = mapped_column(Text, nullable=True)
    rag_sources: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
