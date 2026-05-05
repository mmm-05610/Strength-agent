"""Action registry — 所有写操作的注册和分发中心."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from pydantic import BaseModel
from sqlalchemy.orm import Session


@dataclass
class ActionDef:
    name: str
    description: str
    schema: type[BaseModel]
    handler: Callable  # async (validated_payload, db: Session) -> dict
    refresh_tags: list[str]


class ActionRegistry:
    _actions: dict[str, ActionDef] = {}

    @classmethod
    def register(cls, action: ActionDef) -> None:
        cls._actions[action.name] = action

    @classmethod
    def list_actions(cls) -> list[dict[str, Any]]:
        return [
            {
                "name": a.name,
                "description": a.description,
                "schema": a.schema.model_json_schema(),
            }
            for a in cls._actions.values()
        ]

    @classmethod
    async def dispatch(
        cls, action_name: str, payload: dict[str, Any], db: Session
    ) -> dict[str, Any]:
        action = cls._actions.get(action_name)
        if not action:
            return {"success": False, "error": f"Unknown action: {action_name}"}
        validated = action.schema(**payload)
        result = await action.handler(validated, db)
        return {
            "success": True,
            "data": result,
            "refresh_tags": action.refresh_tags,
        }
