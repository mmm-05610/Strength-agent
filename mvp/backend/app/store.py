from __future__ import annotations

from datetime import datetime
from typing import Any

from .models import (
    AuditLogEntry,
    ChangeProposal,
    KnowledgeAsset,
    KnowledgeAssetCreate,
    ReadinessLog,
    ReadinessLogCreate,
    WorkoutSession,
    WorkoutSessionCreate,
)


class InMemoryStore:
    def __init__(self) -> None:
        self.workouts: list[WorkoutSession] = []
        self.readiness_logs: list[ReadinessLog] = []
        self.assets: list[KnowledgeAsset] = []
        self.change_proposals: list[ChangeProposal] = []
        self.audit_logs: list[AuditLogEntry] = []
        self.settings: dict[str, Any] = {
            "current_goal": "strength",
            "next_training_time": "2026-04-16 19:00",
            "weekly_plan": {
                "mon": "upper",
                "wed": "lower",
                "fri": "upper",
            },
            "cycle_week": 1,
        }
        self.budget: dict[str, Any] = {
            "monthly_budget_rmb": 30,
            "spent_rmb": 0.0,
            "soft_limit_ratio": 0.7,
            "hard_limit_ratio": 1.0,
        }

    def add_workout(self, payload: WorkoutSessionCreate) -> WorkoutSession:
        item = WorkoutSession(
            id=len(self.workouts) + 1,
            created_at=datetime.utcnow(),
            **payload.model_dump(),
        )
        self.workouts.append(item)
        return item

    def add_readiness(self, payload: ReadinessLogCreate) -> ReadinessLog:
        item = ReadinessLog(
            id=len(self.readiness_logs) + 1,
            created_at=datetime.utcnow(),
            **payload.model_dump(),
        )
        self.readiness_logs.append(item)
        return item

    def add_asset(self, payload: KnowledgeAssetCreate) -> KnowledgeAsset:
        item = KnowledgeAsset(
            id=len(self.assets) + 1,
            created_at=datetime.utcnow(),
            **payload.model_dump(),
        )
        self.assets.append(item)
        return item

    def add_change_proposal(self, proposal: ChangeProposal) -> ChangeProposal:
        self.change_proposals.append(proposal)
        return proposal

    def add_audit_log(self, log: AuditLogEntry) -> AuditLogEntry:
        self.audit_logs.append(log)
        return log


db = InMemoryStore()
