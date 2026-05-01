---
name: llm-cost-control-governor
description: 控制健身教练Agent的大模型调用成本。用于设置预算阈值、模型路由、降级策略、缓存策略和RAG检索上限，避免API费用失控。
metadata:
  internal: false
  version: 1.0
---

# LLM Cost Control Governor

## Purpose

为健身教练Agent提供统一控费流程，在不牺牲核心体验的前提下，把大模型API费用稳定在预算内。

本技能按学生预算设计，默认月预算 30 RMB。

## Key Concepts

### 1) Budget First

先定预算，再定调用策略。

### 2) Rule First

能规则引擎处理的场景，不调用大模型。

### 3) Context Compression

只传本次决策需要的最小上下文。

### 4) Graceful Degradation

超预算自动降级，不中断记录与提醒功能。

### 5) Cost Observability

每次调用都记录 token 和估算成本。

## Application

### Step 1: 预算基线（默认值）

- monthly_budget_rmb: 30
- reserve_ratio: 0.1
- usable_budget_rmb: 27
- hard_stop_ratio: 1.0
- soft_limit_ratio: 0.7

说明：保留 10% 预算作为异常周报或临时复杂问答缓冲。

### Step 2: 请求分层路由

- L0 规则层（0 成本）:
  - 训练提醒
  - 固定模板周报
  - 简单加重/减量规则
- L1 小模型层（低成本）:
  - 建议解释润色
  - 普通问答
- L2 大模型层（高成本）:
  - 复杂冲突决策
  - 计划重排
  - 高风险场景解释

路由原则：

1. 先判断 L0 是否可完成。
2. 不可完成再进入 L1。
3. 只有高复杂度且高价值请求才进入 L2。

### Step 3: Token 控制

- max_input_tokens_per_call: 1200
- max_output_tokens_per_call: 300
- max_context_sessions: 3
- max_context_days: 7
- response_style: concise_structured

上下文最小集合：

- 最近 3 次训练
- 最近 7 天恢复
- 当前周期周次
- 当前目标

### Step 4: RAG 控制

- rag_enabled_only_for: 复杂问答、历史相似案例
- rag_top_k: 3
- rag_max_chunk_tokens: 400
- disable_reranker_under_low_budget: true

### Step 5: 缓存策略

- semantic_cache_ttl_hours: 24
- weekly_report_cache_days: 7
- duplicate_question_window_minutes: 30

### Step 6: 自动降级

- 当预算消耗 >= 70%:
  - 禁用 L2（大模型）
  - 周报改为模板 + 少量 L1 补全
- 当预算消耗 >= 100%:
  - 仅保留 L0（规则引擎）
  - 暂停所有非关键大模型调用

### Step 7: 成本复盘

每周统计：

- 总调用次数
- 输入输出 token
- 每用户成本
- 缓存命中率
- 建议采纳率

每月动作：

- 调整路由阈值
- 调整 token 上限
- 调整哪些场景可以调用 L2

## DeepSeek Budget Profile (学生版)

### A. 默认额度分配（30 RMB/月）

- 规则层 L0: 0 RMB
- 小模型层 L1: 18 RMB
- 大模型层 L2: 6 RMB
- 预留与应急: 6 RMB

### B. 日均参考

- 日均总预算约: 1 RMB
- 常规日只用 L1
- 每周最多 1-2 次 L2

### C. 超预算应对顺序

1. 减少输出长度
2. 关闭 RAG
3. 禁用 L2
4. 只保留规则层

## Cost Formula

月成本估算：
C*month = N * (T*in * P_in + T_out \* P_out)

其中：

- N 为月请求数
- T_in/T_out 为单次输入输出 token
- P_in/P_out 为每 token 单价

## Common Pitfalls

### Pitfall 1: 把聊天当数据库

后果：上下文越来越长，成本快速上升。
修正：结构化落库，只传摘要。

### Pitfall 2: 每次都调大模型

后果：预算很快耗尽。
修正：强制规则优先与分层路由。

### Pitfall 3: 周报每次全量重算

后果：高频重复付费。
修正：周报缓存 + 增量更新。

### Pitfall 4: 无阈值无降级

后果：月底服务不可控。
修正：提前设置软硬阈值和自动降级。

## References

- Strength-agent/fitness-agent-requirements-analysis.md
- Strength-agent/skills/fitness-agent-orchestrator/SKILL.md
- Strength-agent/.agents/skills/api-integration/SKILL.md
- Strength-agent/.agents/skills/rag-implementation/SKILL.md
