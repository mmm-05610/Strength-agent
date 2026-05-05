# Unified Action Layer 架构设计

**Status:** Approved
**Date:** 2026-05-04
**Goal:** 用户手动操作和 AI 工具调用共享完全相同的代码路径，左侧面板与右侧对话区完全隔离

---

## 1. 问题诊断

当前系统存在两条独立的写操作路径：

|                | 手动操作                     | AI 操作                                                          |
| -------------- | ---------------------------- | ---------------------------------------------------------------- |
| 调用链深度     | 2 层 (页面→API)              | 6 层 (SSE→useChat→ToolCallCard→DynamicForm→ChatPanel.switch→API) |
| 刷新机制       | fetchBodyMetrics + onRefresh | refreshDashboard + CustomEvent                                   |
| 校验           | 各页面内联                   | DynamicForm 通用校验                                             |
| ChatPanel 耦合 | 无                           | switch/case 知道所有数据分类                                     |

两条路径最终调用同一个 `createBodyMetric()`，但在此之前是两套独立代码。每次加新功能要改两处，刷新逻辑各写各的，ChatPanel 和 Dashboard 通过 CustomEvent 耦合。

## 2. 方案选择

选择 **变体 2：Typed Action Registry**（后端驱动 + Pydantic 类型约束）。

- 变体 1（纯 REST 合并）：改动最小但魔法字符串多，不选
- 变体 3（MCP 化）：过度设计，当前 ROI 低，不选

## 3. 架构设计

### 3.1 核心原则

- **左侧面板 = 只读视图**：Dashboard 页面只负责展示和渲染表单 UI，提交统一交给 Action Layer
- **右侧对话 = 只读触发**：AI 不再通过 ChatPanel.handleFormSubmit 绕圈子
- **Action Layer = 唯一写入口**：POST /api/v1/actions 是所有 mutation 的唯一端点
- **左右完全隔离**：ChatPanel 不 import Dashboard hooks，Dashboard 不监听 ChatPanel 事件

### 3.2 后端：action_registry.py

```python
@dataclass
class ActionDef:
    name: str              # "body_metric.upsert"
    description: str       # AI 可读的描述
    schema: type[BaseModel]  # Pydantic 校验
    handler: Callable      # async (validated_schema, db) -> dict
    refresh_tags: list[str]  # ["body_metrics", "dashboard"]

class ActionRegistry:
    _actions: dict[str, ActionDef] = {}
    # register() / list_actions() / dispatch()
```

### 3.3 后端端点

- `GET /api/v1/actions` — 返回所有可用 action（AI 用来发现系统能力）
- `POST /api/v1/actions` — 统一分发 `{action, payload}` → 校验 → 执行 → 返回 `{success, data, refresh_tags}`
- 老端点保留不动，渐进迁移

### 3.4 前端：useActions.ts

```typescript
const { dispatch } = useActions();
// dispatch("body_metric.upsert", {height_cm: 188, weight_kg: 81})
// → POST /api/v1/actions → 自动根据 refresh_tags 刷新
```

### 3.5 AI 侧简化

- 系统提示词从 ~300 tokens 缩减到 ~80 tokens
- 新增 `get_available_actions` 工具让 AI 动态发现能力
- render_form schema 增加 `action` 字段（如 "body_metric.upsert"）
- DynamicForm 提交时传 `actionName` 而不是 `category`

## 4. 迁移策略

| Phase       | 内容                                           | 文件    | 风险 |
| ----------- | ---------------------------------------------- | ------- | ---- |
| 1. 基础设施 | 创建 action_registry.py + actions.py，新增端点 | 3 files | 低   |
| 2. 前端桥接 | useActions.ts，迁移 5 个 Dashboard 页面        | 6 files | 中   |
| 3. AI 通道  | ChatPanel 移除 switch/case，提示词+工具简化    | 5 files | 中   |
| 4. 清理     | 移除旧代码、CustomEvent、标记 deprecated       | 3 files | 低   |

每 Phase 独立可验证，老路径完整保留，随时可回滚。

## 5. 预期收益

- ChatPanel handleFormSubmit: ~80 行 → ~15 行
- 每个 Dashboard 页面 handleSubmit: ~20 行 → ~5 行
- 系统提示词: ~300 tokens → ~80 tokens
- AI 操作延迟 = 手动操作延迟（dispatch 调用一致）
- 零新功能影响（老端点保留）
