# Unified Action Layer 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户手动操作和 AI 工具调用共享完全相同的写操作代码路径

**Architecture:** 后端新增 ActionRegistry（actions.py + action_registry.py），前端新增 useActions.ts，所有写操作统一走 `dispatch(actionName, payload)` → `POST /api/v1/actions`

**Tech Stack:** FastAPI + Pydantic v2 + React 19 + TypeScript strict

---

### Task 1: Backend — Action Schema 定义

**Files:**

- Create: `mvp/backend/app/actions.py`

- [ ] **Step 1: 创建 ActionRequest 和所有 Payload Schema**

```python
"""Unified action schemas — 所有写操作的 Pydantic 模型."""
from __future__ import annotations
from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


class BodyMetricPayload(BaseModel):
    log_date: date
    height_cm: Optional[float] = Field(default=None, ge=50, le=300)
    weight_kg: Optional[float] = Field(default=None, ge=20, le=500)
    body_fat_pct: Optional[float] = Field(default=None, ge=1, le=60)
    muscle_mass_kg: Optional[float] = Field(default=None, ge=10, le=200)
    waist_cm: Optional[float] = Field(default=None, ge=30, le=200)
    hip_cm: Optional[float] = Field(default=None, ge=30, le=200)
    chest_cm: Optional[float] = Field(default=None, ge=30, le=200)
    notes: Optional[str] = Field(default=None, max_length=500)


class NutritionPayload(BaseModel):
    log_date: date
    meal_type: str = Field(..., pattern=r"^(breakfast|lunch|dinner|snack)$")
    food_name: str = Field(..., min_length=1, max_length=200)
    calories_kcal: Optional[float] = Field(default=None, ge=0)
    protein_g: Optional[float] = Field(default=None, ge=0)
    carbs_g: Optional[float] = Field(default=None, ge=0)
    fat_g: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)


class WorkoutPayload(BaseModel):
    training_date: date
    exercise_name: str = Field(..., min_length=1, max_length=200)
    sets: Optional[int] = Field(default=None, ge=1)
    reps: Optional[int] = Field(default=None, ge=1)
    weight_kg: Optional[float] = Field(default=None, ge=0)
    duration_minutes: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = Field(default=None, max_length=500)


class ReadinessPayload(BaseModel):
    log_date: date
    sleep_hours: Optional[float] = Field(default=None, ge=0, le=24)
    sleep_quality: Optional[int] = Field(default=None, ge=1, le=5)
    stress_level: Optional[int] = Field(default=None, ge=1, le=5)
    soreness_level: Optional[int] = Field(default=None, ge=1, le=5)
    energy_level: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = Field(default=None, max_length=500)


class GoalPayload(BaseModel):
    goal_type: str
    target_value: float
    target_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=500)


class ActionRequest(BaseModel):
    """统一请求体 — 前端和 AI 都发这个."""
    action: str
    payload: dict
```

- [ ] **Step 2: 验证 Schema 可导入**

Run: `cd mvp/backend && python -c "from app.actions import ActionRequest, BodyMetricPayload; print(ActionRequest.model_json_schema())"`
Expected: 输出 ActionRequest 的 JSON Schema

- [ ] **Step 3: Commit**

```bash
git add mvp/backend/app/actions.py
git commit -m "feat: add unified action schemas (actions.py)"
```

---

### Task 2: Backend — Action Registry

**Files:**

- Create: `mvp/backend/app/action_registry.py`

- [ ] **Step 1: 创建 ActionRegistry**

```python
"""Action registry — 所有写操作的注册和分发中心."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Callable
from pydantic import BaseModel


@dataclass
class ActionDef:
    name: str
    description: str
    schema: type[BaseModel]
    handler: Callable
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
        cls, action_name: str, payload: dict[str, Any], db
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
```

- [ ] **Step 2: 验证 Registry 基本功能**

Run: `cd mvp/backend && python -c "from app.action_registry import ActionRegistry; print('ActionRegistry OK')"`
Expected: `ActionRegistry OK`

- [ ] **Step 3: Commit**

```bash
git add mvp/backend/app/action_registry.py
git commit -m "feat: add ActionRegistry dispatch layer"
```

---

### Task 3: Backend — Action Handler 实现 + 注册

**Files:**

- Modify: `mvp/backend/app/main.py`

- [ ] **Step 1: 创建 handler 函数（在 main.py 中，复用现有逻辑）**

```python
# 在 main.py 顶部新增 import
from app.actions import (
    ActionRequest, BodyMetricPayload, NutritionPayload,
    WorkoutPayload, ReadinessPayload, GoalPayload,
)
from app.action_registry import ActionDef, ActionRegistry


# 在 startup 事件中（或模块加载时）注册所有 action
async def _handle_body_metric_upsert(payload: BodyMetricPayload, db):
    return await _upsert_body_metric(payload, db)

async def _handle_nutrition_create(payload: NutritionPayload, db):
    entity = NutritionEntity(**payload.model_dump())
    db.add(entity)
    await db.commit()
    return {"id": entity.id}

async def _handle_workout_create(payload: WorkoutPayload, db):
    entity = WorkoutEntity(**payload.model_dump())
    db.add(entity)
    await db.commit()
    return {"id": entity.id}

async def _handle_readiness_create(payload: ReadinessPayload, db):
    entity = ReadinessEntity(**payload.model_dump())
    db.add(entity)
    await db.commit()
    return {"id": entity.id}

async def _handle_goal_update(payload: GoalPayload, db):
    # 复用现有 update_goal_config 逻辑
    ...


# === Action 注册 (模块加载时执行) ===
ActionRegistry.register(ActionDef(
    name="body_metric.upsert",
    description="创建或更新身体指标记录。字段包括身高(cm)、体重(kg)、体脂率(%)、肌肉量(kg)、腰围(cm)、臀围(cm)、胸围(cm)。",
    schema=BodyMetricPayload,
    handler=_handle_body_metric_upsert,
    refresh_tags=["body_metrics", "dashboard"],
))

ActionRegistry.register(ActionDef(
    name="nutrition.create",
    description="记录一餐饮食。字段包括日期、餐类(breakfast/lunch/dinner/snack)、食物名称、热量(kcal)、蛋白质(g)、碳水(g)、脂肪(g)。",
    schema=NutritionPayload,
    handler=_handle_nutrition_create,
    refresh_tags=["nutrition", "dashboard"],
))

ActionRegistry.register(ActionDef(
    name="workout.create",
    description="记录一次训练动作。字段包括日期、动作名称、组数、次数、重量(kg)、时长(分钟)。",
    schema=WorkoutPayload,
    handler=_handle_workout_create,
    refresh_tags=["training", "dashboard"],
))

ActionRegistry.register(ActionDef(
    name="readiness.create",
    description="记录每日身体状态。字段包括日期、睡眠时长(h)、睡眠质量(1-5)、压力水平(1-5)、酸痛程度(1-5)、精力水平(1-5)。",
    schema=ReadinessPayload,
    handler=_handle_readiness_create,
    refresh_tags=["readiness", "dashboard"],
))

ActionRegistry.register(ActionDef(
    name="goal.update",
    description="更新目标设置。",
    schema=GoalPayload,
    handler=_handle_goal_update,
    refresh_tags=["goals", "dashboard"],
))
```

- [ ] **Step 2: 新增两个端点**

```python
@app.get("/api/v1/actions")
async def list_actions():
    """返回所有可用 action 及字段 schema — AI 用来发现系统能力."""
    return ActionRegistry.list_actions()


@app.post("/api/v1/actions")
async def dispatch_action(req: ActionRequest, db=Depends(get_db)):
    """统一 action 分发 — 所有写操作的唯一入口."""
    return await ActionRegistry.dispatch(req.action, req.payload, db)
```

- [ ] **Step 3: 验证端点**

Run:

```bash
curl http://127.0.0.1:18720/api/v1/actions | python -m json.tool
curl -X POST http://127.0.0.1:18720/api/v1/actions \
  -H "Content-Type: application/json" \
  -d '{"action":"body_metric.upsert","payload":{"log_date":"2026-05-04","weight_kg":81}}'
```

Expected: GET 返回 5 个 action，POST 返回 `{"success":true,"data":{...},"refresh_tags":["body_metrics","dashboard"]}`

- [ ] **Step 4: Commit**

```bash
git add mvp/backend/app/main.py
git commit -m "feat: add /api/v1/actions endpoints with action handlers"
```

---

### Task 4: Frontend — useActions Hook

**Files:**

- Create: `desktop/src/hooks/useActions.ts`

- [ ] **Step 1: 创建 useActions**

```typescript
import { useCallback } from "react";
import { useDashboard } from "./useDashboard";

const API_BASE = "http://127.0.0.1:18720/api/v1";

interface DispatchResult {
  success: boolean;
  data?: unknown;
  error?: string;
  refresh_tags?: string[];
}

export function useActions() {
  const { refresh } = useDashboard();

  const dispatch = useCallback(
    async (
      action: string,
      payload: Record<string, unknown>,
    ): Promise<DispatchResult> => {
      const res = await fetch(`${API_BASE}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}` };
      }
      const result: DispatchResult = await res.json();

      if (result.success && result.refresh_tags) {
        await refresh();
      }

      return result;
    },
    [refresh],
  );

  return { dispatch };
}
```

- [ ] **Step 2: TypeScript 检查**

Run: `cd desktop && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无新增错误（如果有，仅限 useActions.ts）

- [ ] **Step 3: Commit**

```bash
git add desktop/src/hooks/useActions.ts
git commit -m "feat: add useActions hook — unified dispatch for all mutations"
```

---

### Task 5: Dashboard 页面迁移 — BodyStatusPage

**Files:**

- Modify: `desktop/src/components/Dashboard/pages/BodyStatusPage.tsx`

- [ ] **Step 1: 替换导入和提交逻辑**

移除: `import { createBodyMetric, updateBodyMetric } from "@/api/client"`
新增: `import { useActions } from "@/hooks/useActions"`

handleSubmit 改造:

```typescript
const { dispatch } = useActions();

const handleSubmit = async () => {
  await dispatch("body_metric.upsert", form);
  setShowForm(false);
  fetchBodyMetrics(90).then(setMetricHistory);
};
```

- [ ] **Step 2: 验证**

手动操作 → 点击"记录身体数据" → 填写表单 → 点击保存 → 数据写入 + 历史刷新

- [ ] **Step 3: Commit**

```bash
git add desktop/src/components/Dashboard/pages/BodyStatusPage.tsx
git commit -m "refactor: migrate BodyStatusPage to useActions.dispatch"
```

---

### Task 6: Dashboard 页面迁移 — NutritionPage

**Files:**

- Modify: `desktop/src/components/Dashboard/pages/NutritionPage.tsx`

- [ ] **Step 1: 替换提交逻辑**

同 Task 5 模式: `dispatch("nutrition.create", form)`

- [ ] **Step 2: 验证** — 手动录入饮食数据

- [ ] **Step 3: Commit**

```bash
git add desktop/src/components/Dashboard/pages/NutritionPage.tsx
git commit -m "refactor: migrate NutritionPage to useActions.dispatch"
```

---

### Task 7: Dashboard 页面迁移 — RecoveryPage, TrainingPage, GoalsPage

**Files:**

- Modify: `desktop/src/components/Dashboard/pages/RecoveryPage.tsx`
- Modify: `desktop/src/components/Dashboard/pages/TrainingPage.tsx`
- Modify: `desktop/src/components/Dashboard/pages/GoalsPage.tsx`

- [ ] **Step 1: 批量迁移剩余 3 个页面**

RecoveryPage: `dispatch("readiness.create", form)`
TrainingPage: `dispatch("workout.create", form)`
GoalsPage: `dispatch("goal.update", form)`

- [ ] **Step 2: 逐个验证每个页面的手动操作**

- [ ] **Step 3: Commit**

```bash
git add desktop/src/components/Dashboard/pages/RecoveryPage.tsx \
        desktop/src/components/Dashboard/pages/TrainingPage.tsx \
        desktop/src/components/Dashboard/pages/GoalsPage.tsx
git commit -m "refactor: migrate Recovery/Training/Goals pages to useActions.dispatch"
```

---

### Task 8: AI 通道重构 — ChatPanel 简化

**Files:**

- Modify: `desktop/src/components/Chat/ChatPanel.tsx`

- [ ] **Step 1: 移除 switch/case，替换为 dispatch**

```typescript
// 移除旧 import
// import { createNutritionLog, createWorkout, ... } from "@/api/client";
// 新增
import { useActions } from "@/hooks/useActions";

const { dispatch } = useActions();

const handleFormSubmit = async (
  actionName: string, // 改用 actionName 而非 category
  data: Record<string, unknown>,
  toolCallId: string,
) => {
  const result = await dispatch(actionName, data);

  if (toolCallId && result.success) {
    markToolCallSubmitted(toolCallId, {
      submitted: true,
      submitted_data: data,
    });
  }
};
```

- [ ] **Step 2: 移除 CustomEvent 和 refreshDashboard 调用**

dispatch 已经通过 refresh_tags 自动刷新，不再需要:

- `window.dispatchEvent(new CustomEvent("body-metrics-updated"))`
- `refreshDashboard()`

- [ ] **Step 3: TypeScript 检查**

Run: `cd desktop && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add desktop/src/components/Chat/ChatPanel.tsx
git commit -m "refactor: simplify ChatPanel — replace switch/case with useActions.dispatch"
```

---

### Task 9: AI 通道重构 — DynamicForm + ToolCallCard + MessageList

**Files:**

- Modify: `desktop/src/components/Chat/DynamicForm.tsx`
- Modify: `desktop/src/components/Chat/ToolCallCard.tsx`
- Modify: `desktop/src/components/Chat/MessageList.tsx`

- [ ] **Step 1: DynamicForm — formSchema 增加 action 字段支持**

`onSubmit` 回调签名改为 `(actionName: string, data: Record<string, unknown>) => void`

- [ ] **Step 2: ToolCallCard — 传递 actionName**

formSchema 中提取 `action` 字段传给 `onFormSubmit`

- [ ] **Step 3: MessageList — onFormSubmit 签名更新**

- [ ] **Step 4: Commit**

```bash
git add desktop/src/components/Chat/DynamicForm.tsx \
        desktop/src/components/Chat/ToolCallCard.tsx \
        desktop/src/components/Chat/MessageList.tsx
git commit -m "refactor: update form callbacks to use actionName instead of category"
```

---

### Task 10: Backend — AI 工具和提示词简化

**Files:**

- Modify: `mvp/backend/app/main.py`

- [ ] **Step 1: 简化 render_form 工具定义**

移除工具 description 中硬编码的字段列表，改为引用 action

- [ ] **Step 2: 新增 get_available_actions 工具**

```python
{
    "name": "get_available_actions",
    "description": "获取所有可用的数据修改 action 及其字段 schema。在需要生成表单让用户录入数据时调用此工具。",
    "parameters": {"type": "object", "properties": {}}
}
```

`_execute_tool` 中处理:

```python
elif tool_name == "get_available_actions":
    return json.dumps(ActionRegistry.list_actions(), ensure_ascii=False)
```

- [ ] **Step 3: 精简系统提示词**

移除硬编码的字段列表（约 200 tokens），替换为:

```
所有数据修改通过 render_form 工具生成表单。
可用 action 类型及字段由 get_available_actions 工具定义。
当 intent=record_data 时，action 列表已注入此消息。
render_form 的 action 参数必须是已注册的 action name。
```

- [ ] **Step 4: 意图检测 record_data 时注入 action 列表**

```python
if user_intent == "record_data":
    actions_info = json.dumps(ActionRegistry.list_actions(), ensure_ascii=False)
    system_msg = f"{base_system_prompt}\n\n可用 actions:\n{actions_info}"
```

- [ ] **Step 5: 验证**

后端启动无报错，`GET /api/v1/actions` 返回正确的 action 列表

- [ ] **Step 6: Commit**

```bash
git add mvp/backend/app/main.py
git commit -m "refactor: simplify AI tools — add get_available_actions, trim system prompt"
```

---

### Task 11: 清理 & 回归验证

**Files:**

- Modify: `desktop/src/api/client.ts`
- Modify: `desktop/src/components/Dashboard/pages/BodyStatusPage.tsx`

- [ ] **Step 1: 清理 client.ts 中已被 useActions 替代的导出**

标记但保留函数（旧端点还在用）:

```typescript
/** @deprecated Use useActions().dispatch("body_metric.upsert", data) instead */
export const createBodyMetric = ...
```

- [ ] **Step 2: BodyStatusPage 移除 body-metrics-updated 事件监听**

- [ ] **Step 3: 完整 Playwright E2E**

- [ ] **Step 4: Commit**

```bash
git add desktop/src/api/client.ts \
        desktop/src/components/Dashboard/pages/BodyStatusPage.tsx
git commit -m "chore: cleanup deprecated code paths, remove stale event listeners"
```

---

## 验证清单

- [ ] `curl GET /api/v1/actions` 返回所有 5 个 action
- [ ] `curl POST /api/v1/actions` 每个 action 均返回 200 + refresh_tags
- [ ] 手动操作 BodyStatus/Nutrition/Recovery/Training/Goals 页面 → 数据正常写入
- [ ] AI 对话 "帮我记录身高188" → render_form → 表单预填 → 提交 → 数据写入
- [ ] AI 表单提交后 ToolCallCard 显示已提交状态
- [ ] Dashboard 面板在 AI 提交后自动刷新
- [ ] 老端点 POST /api/v1/body-metrics 等仍然正常工作
- [ ] `cd desktop && npx tsc --noEmit` 零错误
