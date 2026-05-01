"""
Seed the Strength Agent database with 3.5 months of realistic user data.

User profile: male, 25yo, 175cm, muscle gain goal (65kg → 73kg)
Period: 2026-01-15 to 2026-04-30
Training: upper/lower/upper split, 3x/week
"""

import random
import sys
from datetime import date, timedelta
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent / "mvp" / "backend"))
from app.db import init_db, SessionLocal
from app.entities import (
    AppSettingEntity,
    BodyMetricEntity,
    NutritionLogEntity,
    ReadinessLogEntity,
    WorkoutSessionEntity,
    WorkoutSetEntity,
)

random.seed(42)

# ── User profile ──
HEIGHT_CM = 175.0
START_DATE = date(2026, 1, 15)
END_DATE = date(2026, 4, 30)  # today-ish

# ── Training schedule (Mon=0, Sun=6): upper on Mon/Thu, lower on Wed ──
TRAINING_DAYS = [0, 2, 4]  # Mon, Wed, Fri
FOCUS_MAP = {0: "upper", 2: "lower", 4: "upper"}

UPPER_EXERCISES = [
    {"name": "杠铃卧推", "equipment": "barbell", "sets": 4, "reps": 8, "weight_start": 50, "weight_end": 67.5, "rpe": 8},
    {"name": "高位下拉", "equipment": "cable", "sets": 4, "reps": 10, "weight_start": 40, "weight_end": 55, "rpe": 8},
    {"name": "哑铃侧平举", "equipment": "dumbbell", "sets": 3, "reps": 15, "weight_start": 7.5, "weight_end": 10, "rpe": 8.5},
    {"name": "杠铃划船", "equipment": "barbell", "sets": 4, "reps": 8, "weight_start": 45, "weight_end": 60, "rpe": 8},
    {"name": "绳索下压", "equipment": "cable", "sets": 3, "reps": 12, "weight_start": 15, "weight_end": 22.5, "rpe": 8},
]

LOWER_EXERCISES = [
    {"name": "杠铃深蹲", "equipment": "barbell", "sets": 5, "reps": 8, "weight_start": 60, "weight_end": 85, "rpe": 8.5},
    {"name": "罗马尼亚硬拉", "equipment": "barbell", "sets": 4, "reps": 10, "weight_start": 60, "weight_end": 82.5, "rpe": 8},
    {"name": "保加利亚分腿蹲", "equipment": "dumbbell", "sets": 3, "reps": 10, "weight_start": 15, "weight_end": 22.5, "rpe": 8.5},
    {"name": "腿屈伸", "equipment": "machine", "sets": 3, "reps": 15, "weight_start": 40, "weight_end": 55, "rpe": 8},
    {"name": "提踵", "equipment": "smith", "sets": 4, "reps": 15, "weight_start": 80, "weight_end": 100, "rpe": 7},
]


def progress_weight(start, end, pct):
    return round(start + (end - start) * pct, 1)


def daterange(start, end):
    for n in range((end - start).days + 1):
        yield start + timedelta(days=n)


def seed():
    # 1. Ensure all tables exist
    init_db()

    session = SessionLocal()

    try:
        # ── Update app_settings ──
        goal_settings = {
            "goal_type": "muscle_gain",
            "start_date": "2026-01-15",
            "target_date": "2026-07-01",
            "start_weight_kg": 65.0,
            "target_weight_kg": 73.0,
            "start_muscle_kg": 31.9,
            "target_muscle_kg": 35.0,
            "latest_muscle_kg": 34.1,
        }
        for key, value in {
            "goal_tracking": goal_settings,
            "height_cm": HEIGHT_CM,
        }.items():
            existing = session.get(AppSettingEntity, key)
            if existing:
                existing.value = value
            else:
                session.add(AppSettingEntity(key=key, value=value))

        print("[OK] Updated app_settings")

        total_days = (END_DATE - START_DATE).days

        body_count = 0
        nutrition_count = 0
        readiness_count = 0
        workout_count = 0

        for current_date in daterange(START_DATE, END_DATE):
            day_num = (current_date - START_DATE).days
            pct = day_num / total_days

            weekday = current_date.weekday()

            # ── Body Metrics (every Sunday) ──
            if weekday == 6:
                bm = BodyMetricEntity(
                    log_date=current_date,
                    body_weight_kg=round(65.0 + 8.5 * pct + random.uniform(-0.3, 0.3), 1),
                    skeletal_muscle_kg=round(31.9 + 2.4 * pct + random.uniform(-0.1, 0.2), 1),
                    body_fat_kg=round(9.0 + 1.5 * pct + random.uniform(-0.2, 0.2), 1),
                    body_fat_rate_pct=round(13.8 + 0.5 * pct + random.uniform(-0.3, 0.3), 1),
                    muscle_weight_kg=round(49.5 + 3.5 * pct + random.uniform(-0.2, 0.2), 1),
                    waist_cm=round(76.0 - 1.5 * pct + random.uniform(-0.3, 0.3), 1),
                    hip_cm=round(92.0 + 1.0 * pct + random.uniform(-0.2, 0.2), 1),
                    inbody_score=round(min(90, 62 + 22 * pct + random.randint(-3, 3))),
                    bmr_kcal=round(1580 + 120 * pct + random.randint(-20, 20)),
                    # Segmental muscle
                    left_upper_muscle_kg=round(2.8 + 0.25 * pct + random.uniform(-0.03, 0.05), 2),
                    right_upper_muscle_kg=round(2.85 + 0.25 * pct + random.uniform(-0.03, 0.05), 2),
                    left_lower_muscle_kg=round(5.6 + 0.5 * pct + random.uniform(-0.05, 0.08), 2),
                    right_lower_muscle_kg=round(5.65 + 0.5 * pct + random.uniform(-0.05, 0.08), 2),
                    trunk_muscle_kg=round(15.0 + 0.9 * pct + random.uniform(-0.1, 0.15), 2),
                    # Segmental fat
                    left_upper_fat_kg=round(0.6 + 0.08 * pct + random.uniform(-0.02, 0.02), 2),
                    right_upper_fat_kg=round(0.62 + 0.08 * pct + random.uniform(-0.02, 0.02), 2),
                    left_lower_fat_kg=round(1.5 + 0.15 * pct + random.uniform(-0.03, 0.03), 2),
                    right_lower_fat_kg=round(1.52 + 0.15 * pct + random.uniform(-0.03, 0.03), 2),
                    trunk_fat_kg=round(4.76 + 0.6 * pct + random.uniform(-0.1, 0.1), 2),
                )
                session.add(bm)
                body_count += 1

            # ── Nutrition Logs (daily, with occasional gaps) ──
            if random.random() < 0.93:  # ~93% compliance
                nl = NutritionLogEntity(
                    log_date=current_date,
                    calories_kcal=round(2500 + 400 * pct + random.randint(-200, 200), -1),
                    protein_g=round(120 + 15 * pct + random.randint(-10, 15)),
                    carbs_g=round(280 + 30 * pct + random.randint(-30, 40)),
                    fat_g=round(65 + 5 * pct + random.randint(-8, 10)),
                    water_liters=round(2.2 + 0.6 * pct + random.uniform(-0.3, 0.3), 1),
                    body_weight_kg=round(65.0 + 8.5 * pct + random.uniform(-0.5, 0.5), 1),
                )
                session.add(nl)
                nutrition_count += 1

            # ── Readiness Logs (daily, with occasional gaps) ──
            if random.random() < 0.88:  # ~88% compliance
                rl = ReadinessLogEntity(
                    log_date=current_date,
                    sleep_hours=round(6.5 + random.uniform(0, 2.5), 1),
                    fatigue_score=random.choices([2, 3, 4, 5, 6, 7], weights=[15, 25, 25, 20, 10, 5])[0],
                    pain_score=random.choices([1, 2, 3, 4, 5, 6], weights=[20, 25, 25, 15, 10, 5])[0],
                    stress_score=random.choices([1, 2, 3, 4, 5, 6, 7], weights=[10, 20, 25, 20, 15, 7, 3])[0],
                )
                session.add(rl)
                readiness_count += 1

            # ── Workout Sessions (Mon/Wed/Fri) ──
            if weekday in TRAINING_DAYS:
                focus = FOCUS_MAP[weekday]
                exercises = UPPER_EXERCISES if focus == "upper" else LOWER_EXERCISES

                ws = WorkoutSessionEntity(
                    training_date=current_date,
                    focus_area=focus,
                    notes="专注发力感" if random.random() < 0.3 else "",
                )
                session.add(ws)
                session.flush()  # get ws.id

                for ex in exercises:
                    wset = WorkoutSetEntity(
                        workout_session_id=ws.id,
                        exercise_name=ex["name"],
                        equipment=ex["equipment"],
                        sets=ex["sets"],
                        reps=ex["reps"],
                        weight_kg=progress_weight(ex["weight_start"], ex["weight_end"], pct),
                        rpe=ex["rpe"],
                    )
                    session.add(wset)

                workout_count += 1

        session.commit()
        print(f"\n[OK] Seeded {body_count} body_metrics (weekly InBody)")
        print(f"[OK] Seeded {nutrition_count} nutrition_logs (daily)")
        print(f"[OK] Seeded {readiness_count} readiness_logs (daily)")
        print(f"[OK] Seeded {workout_count} workout_sessions (3x/week)")
        print(f"\nDate range: {START_DATE} → {END_DATE}")
        print(f"Total days: {total_days}")

        # Verify
        from sqlalchemy import select, func
        for entity, name in [
            (BodyMetricEntity, "body_metrics"),
            (NutritionLogEntity, "nutrition_logs"),
            (ReadinessLogEntity, "readiness_logs"),
            (WorkoutSessionEntity, "workout_sessions"),
            (WorkoutSetEntity, "workout_sets"),
        ]:
            cnt = session.scalar(select(func.count()).select_from(entity))
            print(f"  {name}: {cnt} rows [OK]")

    except Exception as e:
        session.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed()
