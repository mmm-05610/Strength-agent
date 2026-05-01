from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import yaml
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..entities import LlmUsageLogEntity


@dataclass
class CostConfig:
    monthly_budget_rmb: float
    reserve_ratio: float
    soft_limit_ratio: float
    hard_limit_ratio: float
    max_input_tokens_per_call: int
    max_output_tokens_per_call: int
    max_context_sessions: int
    max_context_days: int
    model_l1: str
    model_l2: str
    price_l1_input_per_1m_rmb: float
    price_l1_output_per_1m_rmb: float
    price_l2_input_per_1m_rmb: float
    price_l2_output_per_1m_rmb: float


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "cost_control.sample.yaml"


def load_cost_config() -> CostConfig:
    with open(DEFAULT_CONFIG_PATH, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    return CostConfig(
        monthly_budget_rmb=float(raw.get("monthly_budget_rmb", 30)),
        reserve_ratio=float(raw.get("reserve_ratio", 0.1)),
        soft_limit_ratio=float(raw.get("soft_limit_ratio", 0.7)),
        hard_limit_ratio=float(raw.get("hard_limit_ratio", 1.0)),
        max_input_tokens_per_call=int(raw.get("max_input_tokens_per_call", 1200)),
        max_output_tokens_per_call=int(raw.get("max_output_tokens_per_call", 300)),
        max_context_sessions=int(raw.get("max_context_sessions", 3)),
        max_context_days=int(raw.get("max_context_days", 7)),
        model_l1=str(raw.get("model_l1", "deepseek-chat")),
        model_l2=str(raw.get("model_l2", "deepseek-reasoner")),
        price_l1_input_per_1m_rmb=float(raw.get("price_l1_input_per_1m_rmb", 0.8)),
        price_l1_output_per_1m_rmb=float(raw.get("price_l1_output_per_1m_rmb", 1.6)),
        price_l2_input_per_1m_rmb=float(raw.get("price_l2_input_per_1m_rmb", 4.0)),
        price_l2_output_per_1m_rmb=float(raw.get("price_l2_output_per_1m_rmb", 16.0)),
    )


def get_month_spent_rmb(session: Session) -> float:
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    stmt = select(func.coalesce(func.sum(LlmUsageLogEntity.cost_rmb), 0.0)).where(LlmUsageLogEntity.created_at >= month_start)
    return float(session.scalar(stmt) or 0.0)


def estimate_cost_rmb(config: CostConfig, tier: str, input_tokens: int, output_tokens: int) -> float:
    if tier == "l2":
        input_cost = (input_tokens / 1_000_000) * config.price_l2_input_per_1m_rmb
        output_cost = (output_tokens / 1_000_000) * config.price_l2_output_per_1m_rmb
    else:
        input_cost = (input_tokens / 1_000_000) * config.price_l1_input_per_1m_rmb
        output_cost = (output_tokens / 1_000_000) * config.price_l1_output_per_1m_rmb
    return round(input_cost + output_cost, 6)


def pick_tier(config: CostConfig, spent_rmb: float, preference: str, needs_complex_reasoning: bool) -> tuple[str, str]:
    usable_budget = config.monthly_budget_rmb * (1 - config.reserve_ratio)
    ratio = spent_rmb / usable_budget if usable_budget > 0 else 1.0

    if ratio >= config.hard_limit_ratio:
        return "l0", "hard budget limit reached"

    if preference == "l2" and ratio < config.soft_limit_ratio:
        return "l2", "user requested l2 and budget allows"

    if preference == "l1":
        return "l1", "user requested l1"

    if needs_complex_reasoning and ratio < config.soft_limit_ratio:
        return "l2", "auto detected complex request"

    if ratio >= config.soft_limit_ratio:
        return "l1", "soft budget limit reached, l2 disabled"

    return "l1", "default low-cost route"
