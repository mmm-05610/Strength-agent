"""
Profile Aggregator: collects user data from SQLite for RAG context injection.
Queries: goals, recent workouts, recovery, nutrition, body metrics.
"""
from __future__ import annotations

import json
from datetime import date
from statistics import mean

from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_setting
from ..entities import (
    BodyMetricEntity,
    NutritionLogEntity,
    ReadinessLogEntity,
    WorkoutSessionEntity,
)

DEFAULT_GOAL = {
    "goal_type": "muscle_gain",
    "start_date": "2026-04-16",
    "target_date": "2026-07-01",
    "start_weight_kg": 65.0,
    "target_weight_kg": 73.0,
    "start_muscle_kg": 31.9,
    "target_muscle_kg": 35.0,
}


def aggregate_user_profile(db: Session) -> dict:
    goal = get_setting(db, "goal_tracking", DEFAULT_GOAL)
    if not isinstance(goal, dict):
        goal = DEFAULT_GOAL

    # Recent workouts (last 3 sessions)
    workout_rows = db.scalars(
        select(WorkoutSessionEntity)
        .options(selectinload(WorkoutSessionEntity.exercise_sets))
        .order_by(desc(WorkoutSessionEntity.training_date), desc(WorkoutSessionEntity.id))
        .limit(3)
    ).all()

    recent_workouts = []
    for w in workout_rows:
        recent_workouts.append({
            "date": str(w.training_date),
            "focus": w.focus_area,
            "sets": [
                {
                    "exercise": s.exercise_name,
                    "sets": s.sets,
                    "reps": s.reps,
                    "weight_kg": float(s.weight_kg),
                    "rpe": s.rpe,
                }
                for s in (w.exercise_sets or [])
            ],
        })

    # Recovery (last 7 days)
    seven_days_ago = date.today().fromordinal(date.today().toordinal() - 6)
    readiness_rows = db.scalars(
        select(ReadinessLogEntity)
        .where(ReadinessLogEntity.log_date >= seven_days_ago)
        .order_by(desc(ReadinessLogEntity.log_date))
    ).all()

    recovery_summary = {}
    if readiness_rows:
        recovery_summary = {
            "avg_sleep_hours": round(mean(r.sleep_hours for r in readiness_rows), 1),
            "avg_fatigue": round(mean(r.fatigue_score for r in readiness_rows), 1),
            "avg_pain": round(mean(r.pain_score for r in readiness_rows), 1),
            "avg_stress": round(mean(r.stress_score for r in readiness_rows), 1),
            "latest_date": str(readiness_rows[0].log_date),
        }

    # Nutrition (last 7 days)
    nutrition_rows = db.scalars(
        select(NutritionLogEntity)
        .where(NutritionLogEntity.log_date >= seven_days_ago)
        .order_by(desc(NutritionLogEntity.log_date))
    ).all()

    nutrition_summary = {}
    if nutrition_rows:
        nutrition_summary = {
            "avg_calories": round(mean(n.calories_kcal for n in nutrition_rows)),
            "avg_protein_g": round(mean(n.protein_g for n in nutrition_rows), 1),
            "avg_carbs_g": round(mean(n.carbs_g for n in nutrition_rows), 1),
            "avg_fat_g": round(mean(n.fat_g for n in nutrition_rows), 1),
            "latest_date": str(nutrition_rows[0].log_date),
        }

    # Latest body metrics
    latest_metric = db.scalar(
        select(BodyMetricEntity)
        .order_by(desc(BodyMetricEntity.log_date), desc(BodyMetricEntity.id))
    )
    body_metrics = {}
    if latest_metric:
        body_metrics = {
            "body_weight_kg": latest_metric.body_weight_kg,
            "body_fat_rate_pct": latest_metric.body_fat_rate_pct,
            "muscle_weight_kg": latest_metric.muscle_weight_kg,
            "latest_date": str(latest_metric.log_date),
        }

    # Current weight (prefer body_metrics, fallback to goal start)
    current_weight = body_metrics.get("body_weight_kg") or float(
        goal.get("start_weight_kg", 65.0)
    )
    current_body_fat = body_metrics.get("body_fat_rate_pct")
    current_muscle = body_metrics.get("muscle_weight_kg") or goal.get("latest_muscle_kg")

    profile = {
        "goal": {
            "type": goal.get("goal_type", "muscle_gain"),
            "target_weight_kg": float(goal.get("target_weight_kg", 73.0)),
            "target_date": str(goal.get("target_date", "2026-07-01")),
        },
        "current": {
            "weight_kg": round(float(current_weight), 1) if current_weight else None,
            "body_fat_pct": round(float(current_body_fat), 1) if current_body_fat else None,
            "muscle_kg": round(float(current_muscle), 1) if current_muscle else None,
        },
        "recent_workouts": recent_workouts,
        "recovery": recovery_summary,
        "nutrition": nutrition_summary,
    }

    return profile


def profile_to_prompt_context(profile: dict) -> str:
    """Convert profile dict to a compact prompt-ready string."""
    parts = []

    goal = profile.get("goal", {})
    current = profile.get("current", {})
    parts.append(
        f"目标: {goal.get('type', 'N/A')}, "
        f"目标体重 {goal.get('target_weight_kg', 'N/A')}kg, "
        f"截止 {goal.get('target_date', 'N/A')}"
    )
    parts.append(
        f"当前体重: {current.get('weight_kg', 'N/A')}kg, "
        f"体脂率: {current.get('body_fat_pct', 'N/A')}%, "
        f"肌肉量: {current.get('muscle_kg', 'N/A')}kg"
    )

    recovery = profile.get("recovery", {})
    if recovery:
        parts.append(
            f"最近7天恢复: 睡眠 {recovery.get('avg_sleep_hours', 'N/A')}h, "
            f"疲劳 {recovery.get('avg_fatigue', 'N/A')}/10, "
            f"疼痛 {recovery.get('avg_pain', 'N/A')}/10, "
            f"压力 {recovery.get('avg_stress', 'N/A')}/10"
        )

    nutrition = profile.get("nutrition", {})
    if nutrition:
        parts.append(
            f"最近7天营养: {nutrition.get('avg_calories', 'N/A')}kcal/天, "
            f"蛋白质 {nutrition.get('avg_protein_g', 'N/A')}g/天"
        )

    workouts = profile.get("recent_workouts", [])
    if workouts:
        workout_lines = []
        for w in workouts:
            exercises = ", ".join(
                f"{s['exercise']} {s['sets']}x{s['reps']}@{s['weight_kg']}kg RPE{s['rpe']}"
                for s in w.get("sets", [])
            )
            workout_lines.append(f"  {w['date']} [{w['focus']}]: {exercises}")
        parts.append("最近训练:\n" + "\n".join(workout_lines))

    return "\n".join(parts)
