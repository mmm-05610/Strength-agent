from __future__ import annotations

from statistics import mean
from typing import Any

def _latest_readiness_score(readiness_logs: list[Any]) -> dict[str, float]:
    if not readiness_logs:
        return {"sleep": 7.0, "fatigue": 5.0, "pain": 3.0, "stress": 5.0}

    sample = readiness_logs[-3:]
    return {
        "sleep": mean([x.sleep_hours for x in sample]),
        "fatigue": mean([x.fatigue_score for x in sample]),
        "pain": mean([x.pain_score for x in sample]),
        "stress": mean([x.stress_score for x in sample]),
    }


def _find_latest_main_lift(workouts: list[Any]) -> tuple[str, float] | None:
    if not workouts:
        return None

    latest_sets = workouts[-1].exercise_sets
    if not latest_sets:
        return None

    main = latest_sets[0]
    return main.exercise_name, float(main.weight_kg)


def suggest_today_plan(
    workouts: list[Any],
    readiness_logs: list[Any],
    goal: str,
) -> dict[str, Any]:
    readiness = _latest_readiness_score(readiness_logs)
    lift = _find_latest_main_lift(workouts)

    if lift is None:
        return {
            "action": "baseline",
            "main_lift": "bench_press",
            "target_sets": "4 x 5",
            "target_weight_kg": 40,
            "reason": "No history yet. Start with baseline and collect data.",
            "goal": goal,
        }

    lift_name, weight = lift

    if readiness["pain"] >= 6 or readiness["fatigue"] >= 8 or readiness["sleep"] < 6:
        return {
            "action": "deload",
            "main_lift": lift_name,
            "target_sets": "3 x 5",
            "target_weight_kg": round(weight * 0.9, 1),
            "reason": "Recovery risk is high. Reduce load and volume.",
            "goal": goal,
        }

    if readiness["fatigue"] <= 5 and readiness["sleep"] >= 7:
        return {
            "action": "increase_load",
            "main_lift": lift_name,
            "target_sets": "4 x 5",
            "target_weight_kg": round(weight * 1.025, 1),
            "reason": "Readiness looks stable. Apply progressive overload.",
            "goal": goal,
        }

    return {
        "action": "keep_load",
        "main_lift": lift_name,
        "target_sets": "4 x 5",
        "target_weight_kg": weight,
        "reason": "Maintain load and prioritize execution quality.",
        "goal": goal,
    }
