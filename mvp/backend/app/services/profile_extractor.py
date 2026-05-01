"""
Profile Extractor: analyses conversation to detect structured data changes.
Returns a list of change proposals with categories that the user must approve.

Categories:
  - "profile"    → stored via set_setting (goal, experience, injuries, PR, body_weight, etc.)
  - "nutrition"  → creates a NutritionLogEntity
  - "readiness"  → creates a ReadinessLogEntity
  - "body_metric" → creates a BodyMetricEntity
  - "workout"    → creates a WorkoutSessionEntity with exercise sets
"""
from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

from ..services.deepseek_client import DeepSeekClient

EXTRACTION_PROMPT = """Analyse this conversation between a fitness coach and a user.
Extract any concrete data the user mentioned. Only include values the user
CLEARLY stated. Output ONLY valid JSON (no markdown, no explanation):

{
  "changes": [
    {
      "category": "profile|nutrition|readiness|body_metric|workout",
      "field_path": "descriptive field name",
      "new_value": <value or object>,
      "reason": "brief reason from conversation"
    }
  ]
}

## Category rules:

### "profile" — single-value profile settings
Fields: goal_type ("muscle_gain"/"fat_loss"/"maintenance"), target_weight_kg (number),
target_date (ISO date), injuries (string), experience_level ("beginner"/"intermediate"/"advanced"),
personal_record ("exercise:weight_kg")
Example: {"category": "profile", "field_path": "goal_type", "new_value": "fat_loss", "reason": "..."}

### "nutrition" — daily dietary intake (object with numbers)
Fields: calories_kcal (int), protein_g (float), carbs_g (float), fat_g (float), water_liters (float), body_weight_kg (float|null)
Example: {"category": "nutrition", "field_path": "nutrition_log", "new_value": {"calories_kcal": 2200, "protein_g": 140, "carbs_g": 250, "fat_g": 60, "water_liters": 2.5}, "reason": "..."}

### "readiness" — daily recovery state (object with numbers)
Fields: sleep_hours (float), fatigue_score (int 1-10), pain_score (int 1-10), stress_score (int 1-10)
Example: {"category": "readiness", "field_path": "readiness_log", "new_value": {"sleep_hours": 7.5, "fatigue_score": 4, "pain_score": 2, "stress_score": 3}, "reason": "..."}

### "body_metric" — body measurement (object)
Fields: body_weight_kg (float|null), body_fat_rate_pct (float|null), muscle_weight_kg (float|null)
Example: {"category": "body_metric", "field_path": "body_metric_log", "new_value": {"body_weight_kg": 75.0, "body_fat_rate_pct": 18.5, "muscle_weight_kg": 32.0}, "reason": "..."}

### "workout" — training session (object with exercise_sets array)
Fields: focus_area (string), exercise_sets: [{"exercise_name": "bench press", "equipment": "barbell", "sets": 5, "reps": 5, "weight_kg": 80.0, "rpe": 8}]
Example: {"category": "workout", "field_path": "workout_log", "new_value": {"focus_area": "upper", "exercise_sets": [...]}, "reason": "..."}

If nothing was stated, output {"changes": []}.

Conversation:
{conversation}"""


def extract_profile_changes(
    conversation: str,
    client: DeepSeekClient,
) -> list[dict[str, Any]]:
    """Extract profile changes from conversation using DeepSeek."""
    if not client.is_configured():
        return _rule_based_extraction(conversation)

    try:
        prompt = EXTRACTION_PROMPT.format(conversation=conversation[:2500])
        response = client.chat_completion(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You are a data extraction assistant. Output ONLY valid JSON, no markdown."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=800,
        )
        content = response.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        content = re.sub(r"^```(?:json)?\s*", "", content.strip())
        content = re.sub(r"\s*```$", "", content)

        result = json.loads(content)
        changes = result.get("changes", [])
        return _validate_and_fill(changes)
    except Exception:
        return _rule_based_extraction(conversation)


def _validate_and_fill(changes: list[dict]) -> list[dict]:
    """Ensure each change has required fields and normalize values."""
    valid = []
    for c in changes:
        category = str(c.get("category", "profile"))
        field_path = str(c.get("field_path", ""))
        new_value = c.get("new_value")
        reason = str(c.get("reason", "Extracted from conversation"))

        if not field_path or new_value is None:
            continue
        if category not in ("profile", "nutrition", "readiness", "body_metric", "workout"):
            category = "profile"

        # Normalize number values
        if category == "profile" and isinstance(new_value, (int, float, str)):
            new_value = _coerce_value(field_path, new_value)

        valid.append({
            "category": category,
            "field_path": field_path,
            "new_value": new_value,
            "reason": reason,
        })
    return valid


def _coerce_value(field_path: str, value: Any) -> Any:
    """Coerce value type based on field path."""
    numeric_fields = {
        "target_weight_kg", "current_weight_kg", "body_weight_kg",
        "body_fat_rate_pct", "muscle_weight_kg",
    }
    if field_path in numeric_fields:
        try:
            return float(value)
        except (ValueError, TypeError):
            return value
    return value


def _rule_based_extraction(conversation: str) -> list[dict[str, Any]]:
    """Fallback: regex-based extraction with category detection."""
    changes: list[dict[str, Any]] = []

    # ── Nutrition detection ──
    cal_match = re.search(r"(?:吃了?|摄入|热量)\s*[:：]?\s*(\d+)\s*(?:千卡|大卡|kcal|卡路里)", conversation)
    protein_match = re.search(r"(?:蛋白质|蛋白)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g", conversation)
    carbs_match = re.search(r"(?:碳水)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g", conversation)
    fat_match = re.search(r"(?:脂肪)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g", conversation)
    water_match = re.search(r"(?:水分?|水|喝了?)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:L|升|ml)", conversation)

    if cal_match or protein_match or carbs_match or fat_match:
        nutrition: dict[str, Any] = {}
        if cal_match:
            nutrition["calories_kcal"] = int(cal_match.group(1))
        if protein_match:
            nutrition["protein_g"] = float(protein_match.group(1))
        if carbs_match:
            nutrition["carbs_g"] = float(carbs_match.group(1))
        if fat_match:
            nutrition["fat_g"] = float(fat_match.group(1))
        if water_match:
            nutrition["water_liters"] = float(water_match.group(1))

        # Check for body weight in same context
        weight_m = re.search(r"体重\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)", conversation)
        if weight_m:
            nutrition["body_weight_kg"] = float(weight_m.group(1))

        if len(nutrition) >= 2:
            changes.append({
                "category": "nutrition",
                "field_path": "nutrition_log",
                "new_value": nutrition,
                "reason": "从对话中识别到饮食数据",
            })

    # ── Readiness detection ──
    sleep_match = re.search(r"(?:睡(?:了|觉|眠)|睡眠)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:小时|h|个?小时)", conversation)
    pain_match = re.search(r"(?:酸[痛疼]|疼痛|DOMS)\s*[:：]?\s*(\d+)\s*(?:分)?\s*(?:/10)?", conversation)
    fatigue_match = re.search(r"(?:疲劳|累|精力|疲惫)\s*[:：]?\s*(\d+)\s*(?:分)?\s*(?:/10)?", conversation)
    stress_match = re.search(r"(?:压力|紧张|焦虑)\s*[:：]?\s*(\d+)\s*(?:分)?\s*(?:/10)?", conversation)

    if sleep_match or pain_match or fatigue_match or stress_match:
        readiness: dict[str, Any] = {}
        if sleep_match:
            readiness["sleep_hours"] = float(sleep_match.group(1))
        if fatigue_match:
            readiness["fatigue_score"] = int(fatigue_match.group(1))
        if pain_match:
            readiness["pain_score"] = int(pain_match.group(1))
        if stress_match:
            readiness["stress_score"] = int(stress_match.group(1))

        if len(readiness) >= 2:
            changes.append({
                "category": "readiness",
                "field_path": "readiness_log",
                "new_value": readiness,
                "reason": "从对话中识别到恢复数据",
            })

    # ── Workout detection ──
    exercise_patterns = [
        r"(?:做了?|练了?|完成了?|训练了?)\s*[:：]?\s*(.*?)(?:，|。|$)",
        r"(?:卧推|深蹲|硬拉|引体|划船|推举|弯举|臂屈伸|飞鸟|下拉)\s*.*?\d+",
    ]
    if any(re.search(p, conversation) for p in exercise_patterns):
        ex_sets: list[dict[str, Any]] = []
        ex_matches = re.findall(
            r"([\w一-鿿]+)\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)\s*(?:x|×|X)\s*(\d+)\s*(?:x|×|X)?\s*(\d+)?",
            conversation,
        )
        for m in ex_matches:
            exercise_name = m[0].strip()
            weight = float(m[1])
            sets = int(m[2])
            reps = int(m[3]) if m[3] else 8
            if exercise_name and weight > 0:
                ex_sets.append({
                    "exercise_name": exercise_name,
                    "equipment": "barbell",
                    "sets": sets,
                    "reps": reps,
                    "weight_kg": weight,
                    "rpe": None,
                })

        if ex_sets:
            focus = "full_body"
            upper_keywords = ["胸", "背", "肩", "臂", "上肢", "卧推", "划船", "推举", "弯举"]
            lower_keywords = ["腿", "臀", "下肢", "深蹲", "硬拉"]
            ctx = conversation.lower()
            if any(k in ctx for k in upper_keywords):
                focus = "upper"
            elif any(k in ctx for k in lower_keywords):
                focus = "lower"

            changes.append({
                "category": "workout",
                "field_path": "workout_log",
                "new_value": {"focus_area": focus, "exercise_sets": ex_sets, "notes": ""},
                "reason": "从对话中识别到训练记录",
            })

    # ── Profile detection (existing patterns) ──
    # Weight
    weight_patterns = [
        r"体重\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)",
        r"(\d+(?:\.\d+)?)\s*kg.*体重",
        r"现在\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)",
    ]
    for pat in weight_patterns:
        m = re.search(pat, conversation, re.IGNORECASE)
        if m:
            changes.append({
                "category": "profile",
                "field_path": "body_weight_kg",
                "new_value": float(m.group(1)),
                "reason": "从对话中识别到体重数据",
            })
            break

    # Body fat
    bf_match = re.search(r"(?:体脂[率]?)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%?", conversation)
    if bf_match:
        changes.append({
            "category": "body_metric",
            "field_path": "body_metric_log",
            "new_value": {"body_fat_rate_pct": float(bf_match.group(1))},
            "reason": "从对话中识别到体脂数据",
        })

    # Goal type
    if re.search(r"减脂|减肥|减重|cut|fat.?loss", conversation, re.IGNORECASE):
        changes.append({
            "category": "profile",
            "field_path": "goal_type",
            "new_value": "fat_loss",
            "reason": "提及减脂目标",
        })
    elif re.search(r"增肌|增重|bulk|muscle.?gain", conversation, re.IGNORECASE):
        changes.append({
            "category": "profile",
            "field_path": "goal_type",
            "new_value": "muscle_gain",
            "reason": "提及增肌目标",
        })

    # Injury
    injury_m = re.search(r"(?:受伤|伤病|疼|痛)[^。.]*(?:膝盖|腰|肩|背|肘|手腕|脚踝)", conversation)
    if injury_m:
        changes.append({
            "category": "profile",
            "field_path": "injuries",
            "new_value": injury_m.group(0),
            "reason": "提及伤病或疼痛",
        })

    # PR
    pr_m = re.search(r"(?:PR|pr|新纪录|个人最好)\s*[：:]*\s*(\w[\w一-鿿]*)\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)?", conversation)
    if pr_m:
        changes.append({
            "category": "profile",
            "field_path": "personal_record",
            "new_value": f"{pr_m.group(1)}:{pr_m.group(2)}",
            "reason": "提及新个人纪录",
        })

    return changes
