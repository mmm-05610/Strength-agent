from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass
from typing import Any

import requests

from .deepseek_client import DeepSeekClient
from .volcengine_ocr_client import VolcengineOcrClient


@dataclass(frozen=True)
class InBodyOcrResult:
    body_weight_kg: float | None
    body_fat_rate_pct: float | None
    muscle_weight_kg: float | None
    raw_output: str


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        num = float(value)
    except Exception:
        return None
    if num != num or num in (float("inf"), float("-inf")):
        return None
    return num


def _extract_first_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None

    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < 0 or end <= start:
        return None

    candidate = text[start : end + 1].strip()
    try:
        return json.loads(candidate)
    except Exception:
        return None


def run_inbody_ocr_with_deepseek(client: DeepSeekClient, image_bytes: bytes, mime_type: str) -> InBodyOcrResult:
    model = os.getenv("DEEPSEEK_VISION_MODEL", os.getenv("DEEPSEEK_OCR_MODEL", "deepseek-chat"))

    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{b64}"

    system_prompt = (
        "You are a strict information extraction engine. "
        "Return ONLY a JSON object (no markdown, no extra text)."
    )

    user_prompt = (
        "Extract the following metrics from this InBody/body composition report image. "
        "Return JSON with keys: body_weight_kg, body_fat_rate_pct, muscle_weight_kg. "
        "Use null when missing. Units: kg for weight/muscle, percent for body fat."
    )

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]

    try:
        resp = client.chat_completion(model=model, messages=messages, max_tokens=400)
    except requests.HTTPError as err:
        # Surface as a controlled error for caller to classify.
        raise err

    content = (
        resp.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    raw_output = str(content or "")

    payload = _extract_first_json_object(raw_output)
    if payload is None:
        # Try a mild regex cleanup as fallback
        cleaned = re.sub(r"```(?:json)?", "", raw_output, flags=re.IGNORECASE).strip("` \n")
        payload = _extract_first_json_object(cleaned) or {}

    body_weight = _safe_float(payload.get("body_weight_kg"))
    body_fat = _safe_float(payload.get("body_fat_rate_pct"))
    muscle = _safe_float(payload.get("muscle_weight_kg"))

    return InBodyOcrResult(
        body_weight_kg=body_weight,
        body_fat_rate_pct=body_fat,
        muscle_weight_kg=muscle,
        raw_output=raw_output,
    )


def _collect_text_snippets(obj: Any, parent_key: str = "") -> list[str]:
    if obj is None:
        return []

    key = str(parent_key or "").lower()
    want_key = key in {
        "text",
        "texts",
        "word",
        "words",
        "content",
        "contents",
        "line",
        "lines",
    }

    if isinstance(obj, str):
        return [obj] if (want_key or len(obj) >= 2) else []

    if isinstance(obj, (int, float, bool)):
        return []

    if isinstance(obj, list):
        out: list[str] = []
        for item in obj:
            out.extend(_collect_text_snippets(item, parent_key))
        return out

    if isinstance(obj, dict):
        out = []
        for k, v in obj.items():
            out.extend(_collect_text_snippets(v, str(k)))
        return out

    return []


def _extract_ocr_text(resp: dict[str, Any]) -> str:
    # Heuristic: flatten likely text fields.
    snippets = _collect_text_snippets(resp)
    cleaned: list[str] = []
    for s in snippets:
        t = str(s).strip()
        if not t:
            continue
        if t in cleaned:
            continue
        cleaned.append(t)
    return "\n".join(cleaned)


def _extract_volc_line_texts(resp: dict[str, Any]) -> list[str]:
    data = resp.get("data") or {}
    lines = data.get("line_texts")
    if not isinstance(lines, list):
        return []

    out: list[str] = []
    for item in lines:
        if not isinstance(item, str):
            continue
        t = item.strip()
        if t:
            out.append(t)
    return out


def _first_number_in_text(text: str) -> float | None:
    if not text:
        return None
    m = re.search(r"([0-9]{1,3}(?:\.[0-9]+)?)", text)
    if not m:
        return None
    return _safe_float(m.group(1))


def _find_metric_near_label(
    lines: list[str],
    label_patterns: list[str],
    *,
    lookahead: int,
    lo: float,
    hi: float,
    reverse: bool = False,
    exclude_nearby_patterns: list[str] | None = None,
    exclude_window: int = 2,
) -> float | None:
    if not lines:
        return None

    label_res = [re.compile(p) for p in label_patterns]
    exclude_res = [re.compile(p) for p in (exclude_nearby_patterns or [])]

    indices = range(len(lines) - 1, -1, -1) if reverse else range(len(lines))
    for i in indices:
        line = lines[i]
        if not any(r.search(line) for r in label_res):
            continue

        if exclude_res:
            start = max(0, i - exclude_window)
            end = min(len(lines), i + exclude_window + 1)
            neighborhood = "\n".join(lines[start:end])
            if any(r.search(neighborhood) for r in exclude_res):
                continue

        for j in range(i, min(len(lines), i + lookahead + 1)):
            v = _first_number_in_text(lines[j])
            if v is None:
                continue
            if lo <= v <= hi:
                return v

    return None


def _parse_inbody_metrics_from_lines(lines: list[str]) -> tuple[float | None, float | None, float | None]:
    weight_exclude = [
        r"目标体重",
        r"体重控制",
        r"肌肉控制",
        r"脂肪控制",
        r"去脂体重",
    ]

    weight = _find_metric_near_label(
        lines,
        label_patterns=[
            r"体重\s*\(\s*kg\s*\)",
            r"体重\s*kg\b",
            r"\bWeight\b",
            r"体重\b",
        ],
        lookahead=3,
        lo=20.0,
        hi=300.0,
        reverse=True,
        exclude_nearby_patterns=weight_exclude,
        exclude_window=2,
    )

    body_fat = _find_metric_near_label(
        lines,
        label_patterns=[
            r"体脂百分比",
            r"体脂肪率",
            r"体脂率",
            r"\bPBF\b",
        ],
        lookahead=3,
        lo=0.0,
        hi=100.0,
        reverse=True,
    )

    muscle = _find_metric_near_label(
        lines,
        label_patterns=[
            r"骨骼肌量",
            r"骨骼肌\s*\(\s*kg\s*\)",
            r"骨骼肌\b",
            r"\bSMM\b",
        ],
        lookahead=3,
        lo=5.0,
        hi=120.0,
        reverse=True,
    )

    return weight, body_fat, muscle


def _pick_first_in_range(matches: list[str], lo: float, hi: float) -> float | None:
    for m in matches:
        try:
            v = float(m)
        except Exception:
            continue
        if lo <= v <= hi:
            return v
    return None


def _parse_inbody_metrics_from_text(text: str) -> tuple[float | None, float | None, float | None]:
    if not text:
        return None, None, None

    normalized = (
        text.replace("：", ":")
        .replace("％", "%")
        .replace("ＫＧ", "kg")
        .replace("Kg", "kg")
        .replace("KG", "kg")
    )

    weight_candidates: list[str] = []
    for pat in [
        r"(?:体重|\bWeight\b)\s*[:：]?\s*([0-9]{2,3}(?:\.[0-9]+)?)\s*kg?",
        r"(?:体重|\bWeight\b)\s*[:：]?\s*([0-9]{2,3}(?:\.[0-9]+)?)",
    ]:
        weight_candidates.extend(re.findall(pat, normalized, flags=re.IGNORECASE))

    fat_candidates: list[str] = []
    for pat in [
        r"(?:体脂肪率|体脂率|\bPBF\b|\bBody\s*Fat\b)\s*[:：]?\s*([0-9]{1,2}(?:\.[0-9]+)?)\s*%",
        r"(?:体脂肪率|体脂率|\bPBF\b)\s*[:：]?\s*([0-9]{1,2}(?:\.[0-9]+)?)",
    ]:
        fat_candidates.extend(re.findall(pat, normalized, flags=re.IGNORECASE))

    muscle_candidates: list[str] = []
    for pat in [
        r"(?:骨骼肌量|骨骼肌|\bSMM\b|\bSkeletal\s*Muscle\s*Mass\b)\s*[:：]?\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*kg?",
        r"(?:肌肉重量|肌肉量)\s*[:：]?\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*kg",
    ]:
        muscle_candidates.extend(re.findall(pat, normalized, flags=re.IGNORECASE))

    weight = _pick_first_in_range(weight_candidates, 20.0, 300.0)
    body_fat = _pick_first_in_range(fat_candidates, 0.0, 100.0)
    muscle = _pick_first_in_range(muscle_candidates, 5.0, 120.0)

    return weight, body_fat, muscle


def run_inbody_ocr_with_volcengine(client: VolcengineOcrClient, image_bytes: bytes, mime_type: str) -> InBodyOcrResult:
    # Volcengine OCR is text-first: OCR -> heuristic extraction.
    b64 = base64.b64encode(image_bytes).decode("ascii")
    resp = client.ocr_image_base64(b64)

    line_texts = _extract_volc_line_texts(resp)
    if line_texts:
        weight, body_fat, muscle = _parse_inbody_metrics_from_lines(line_texts)
        ocr_text = "\n".join(line_texts)
    else:
        ocr_text = _extract_ocr_text(resp)
        weight, body_fat, muscle = _parse_inbody_metrics_from_text(ocr_text)

    raw_output = json.dumps(
        {"ocr_text": ocr_text, "provider_response": resp},
        ensure_ascii=False,
    )
    if len(raw_output) > 12000:
        raw_output = raw_output[:12000] + "\n... (truncated)"

    return InBodyOcrResult(
        body_weight_kg=weight,
        body_fat_rate_pct=body_fat,
        muscle_weight_kg=muscle,
        raw_output=raw_output,
    )
