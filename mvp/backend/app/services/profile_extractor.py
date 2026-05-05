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

EXTRACTION_PROMPT = """You are a conservative data extraction assistant. Your job is to detect ONLY profile-level changes (goals, settings, injuries, personal records) that a user has EXPLICITLY stated they want to update.

## CRITICAL RULES — violations are unacceptable:
1. DO NOT extract daily log data (nutrition, readiness, workout, body_metric). These are handled by other tools.
2. DO NOT extract values from casual mentions, questions, or hypothetical discussions.
3. DO NOT extract values the coach/AI suggested — only values the USER explicitly stated about themselves.
4. DO NOT guess or infer values — if the user didn't say a specific number, skip it.
5. When in doubt, output an empty list. It is better to miss one valid change than to spam the user with noise.

## What TO extract (ONLY these five field_path values):
- "goal_type": user explicitly says they want to change their fitness goal. Values: "muscle_gain", "fat_loss", "maintenance"
- "target_weight_kg": user explicitly states a target weight goal in kg
- "injuries": user reports a new injury or pain condition
- "experience_level": user states their training experience. Values: "beginner", "intermediate", "advanced"
- "personal_record": user reports a new personal record. Format: "exercise:weight_kg"

## Examples of what to IGNORE:
- "我今天吃了2000卡" → IGNORE (daily nutrition, handled by tools)
- "教练建议我减脂" → IGNORE (coach suggestion, not user's explicit statement)
- "我平时大概75kg" → IGNORE (casual mention, not an explicit update request)
- "深蹲应该做多少组" → IGNORE (question, not a data update)
- "减脂期应该怎么吃" → IGNORE (asking for advice, not stating a goal change)

## Examples of what to EXTRACT:
- "帮我把目标改成增肌" → extract goal_type: "muscle_gain"
- "我膝盖最近又开始疼了" → extract injuries: "膝盖疼痛"
- "我的目标是减到65kg" → extract target_weight_kg: 65
- "今天我深蹲PR突破100kg了" → extract personal_record: "squat:100"

Output ONLY valid JSON (no markdown, no explanation):
{{
  "changes": [
    {{
      "category": "profile",
      "field_path": "goal_type|target_weight_kg|injuries|experience_level|personal_record",
      "new_value": <the exact value>,
      "reason": "brief reason — what the user explicitly said"
    }}
  ]
}}

If nothing qualifies, output {{"changes": []}}.

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
    """Only accept profile-level changes with valid field_path values."""
    ALLOWED_FIELDS = {"goal_type", "target_weight_kg", "injuries", "experience_level", "personal_record"}
    VALID_GOAL_TYPES = {"muscle_gain", "fat_loss", "maintenance"}
    VALID_EXPERIENCE = {"beginner", "intermediate", "advanced"}

    valid = []
    seen_fields = set()
    for c in changes:
        field_path = str(c.get("field_path", ""))
        new_value = c.get("new_value")
        reason = str(c.get("reason", "Extracted from conversation"))

        if not field_path or new_value is None:
            continue
        if field_path not in ALLOWED_FIELDS:
            continue
        if field_path in seen_fields:
            continue

        if field_path == "goal_type" and new_value not in VALID_GOAL_TYPES:
            continue
        if field_path == "experience_level" and new_value not in VALID_EXPERIENCE:
            continue

        if field_path == "target_weight_kg":
            try:
                new_value = float(new_value)
            except (ValueError, TypeError):
                continue

        seen_fields.add(field_path)
        valid.append({
            "category": "profile",
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
    """Fallback: regex-based extraction — only profile-level changes (goals, injuries, PRs)."""
    changes: list[dict[str, Any]] = []

    # ── Goal type ──
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

    # ── Target weight ──
    target_m = re.search(r"(?:目标|减到|增到|降到)\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)", conversation)
    if target_m:
        changes.append({
            "category": "profile",
            "field_path": "target_weight_kg",
            "new_value": float(target_m.group(1)),
            "reason": "提及目标体重",
        })

    # ── Injury ── (body part + pain keyword, either order)
    injury_m = re.search(r"(?:膝盖|腰|肩|背|肘|手腕|脚踝)[^。.]*(?:受伤|伤病|疼|痛)", conversation)
    if not injury_m:
        injury_m = re.search(r"(?:受伤|伤病|疼|痛)[^。.]*(?:膝盖|腰|肩|背|肘|手腕|脚踝)", conversation)
    if injury_m:
        changes.append({
            "category": "profile",
            "field_path": "injuries",
            "new_value": injury_m.group(0),
            "reason": "提及伤病或疼痛",
        })

    # ── PR ──
    pr_m = re.search(r"(?:PR|pr|新纪录|个人最好)\s*[：:]*\s*(\w[\w一-鿿]*)\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)?", conversation)
    if pr_m:
        changes.append({
            "category": "profile",
            "field_path": "personal_record",
            "new_value": f"{pr_m.group(1)}:{pr_m.group(2)}",
            "reason": "提及新个人纪录",
        })

    return changes
