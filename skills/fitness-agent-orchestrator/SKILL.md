---
name: fitness-agent-orchestrator
description: 用于构建健身私人教练Agent的端到端工作流。适用于从0到1搭建“记录-分析-建议-再记录”闭环。
metadata:
  internal: false
  version: 1.0
---

# Fitness Agent Orchestrator

## Purpose

把健身Agent建设拆成可执行阶段，确保先跑通最小闭环，再逐步加入智能能力。

目标不是一次做全，而是优先实现稳定、可追踪、可解释的训练建议。

## Key Concepts

### 最小闭环

记录 -> 分析 -> 建议 -> 记录

### 先后顺序

1. 训练数据与业务逻辑优先
2. 数据库与API稳定优先
3. LLM增强与RAG后置

### 推荐技术栈（默认）

- 后端: FastAPI
- 数据库: PostgreSQL
- 消息入口: Telegram Bot
- 定时任务: APScheduler
- LLM: OpenAI/Claude + Function Calling

## Application

### Phase 0: 需求与指标定义（1-2天）

- 明确用户目标: 力量/增肌/减脂/耐力
- 定义核心指标: e1RM、训练量、出勤率、睡眠、疲劳分
- 定义MVP成功线: 连续14天有记录、每周有建议、建议被采纳率

### Phase 1: MVP闭环（1-2周）

- 建表并接入记录API
- 支持训练记录录入、查询最近7天、生成每周报告
- 上线基础渐进负荷规则（不依赖LLM）

交付物:

- 可用的训练记录接口
- 每日提醒 + 每周总结
- 简单加重/减量建议

### Phase 2: 智能建议（2-4周）

- 引入函数调用:
  - increase_load
  - keep_load
  - deload
  - rest_day
- Prompt中注入最近3次训练 + RPE + 睡眠 + 疲劳
- 输出建议必须可追踪（附理由）

### Phase 3: 检索与个性化（4周+）

- 引入RAG检索相似历史场景
- 加入平台期检测与周期自动切换
- 增加用户画像分层策略（新手/中级/高级）

## 技能编排建议

按以下顺序加载现有技能：

1. postgresql-table-design
2. sql-query
3. fastapi-templates
4. api-integration
5. fitness-coach
6. rag-implementation
7. gdpr-data-handling

## Examples

输入场景:

- 用户连续2周卧推无提升，RPE持续偏高，睡眠<6小时

输出策略:

- 本周降低卧推主项训练量20%
- 保持技术动作频率
- 48小时后复测单组表现
- 若恢复分仍低，进入Deload周

## Common Pitfalls

### Pitfall 1: 先做大模型，后做数据

后果: 建议看起来聪明，但不稳定且不可回溯。
修正: 先完成规则引擎与数据闭环，再加LLM。

### Pitfall 2: 只存训练结果，不存上下文

后果: 无法解释为什么加重或减量。
修正: 同时记录RPE、睡眠、疲劳、疼痛标签。

### Pitfall 3: 没有用户安全边界

后果: 高风险建议导致受伤或流失。
修正: 设置硬性上限与停止条件，必要时建议休息或就医。

## References

- Strength-agent/.agents/skills/postgresql-table-design/SKILL.md
- Strength-agent/.agents/skills/fastapi-templates/SKILL.md
- Strength-agent/.agents/skills/rag-implementation/SKILL.md
- Strength-agent/skills/requirement-analysis-workflow/SKILL.md
