"""Unified action schemas — 所有写操作通过 POST /api/v1/actions 分发."""
from __future__ import annotations

from pydantic import BaseModel, Field


class ActionRequest(BaseModel):
    """统一请求体 — 前端和 AI 都发这个."""
    action: str = Field(..., description="action 名称, e.g. body_metric.upsert")
    payload: dict = Field(..., description="JSON 数据, 由对应 ActionDef.schema 校验")
