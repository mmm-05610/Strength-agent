# Fitness Agent MVP Development Plan

## Objective

在低预算条件下（30 RMB/月模型费用），交付一个可运行的健身教练 MVP：

- 消息界面 + 简洁Web页面
- 规则引擎优先
- AI 提议改动需用户同意
- 可追溯的训练与恢复记录

## Scope

In:

- 训练记录、恢复记录、饮食记录
- 每日提醒与每周总结
- 页面化查看与编辑
- 知识库图片上传（InBody）与索引
- 基础 AI 解释与受控调用

Out:

- 姿态识别
- 复杂可视化与动画系统
- 机器学习预测模型

## Architecture (MVP)

- Backend: FastAPI
- DB: PostgreSQL
- Frontend: 简洁 Web（移动优先）
- Bot: Telegram
- Scheduler: APScheduler
- LLM: DeepSeek API（控费路由）

## Phases

### Phase A: Foundation (Week 1)

- 建立后端工程骨架与配置
- 设计核心表结构（用户、计划、训练、恢复、饮食、审计）
- 打通健康检查与基础 CRUD

Exit Criteria:

- 本地可启动
- 核心表可增删改查

### Phase B: Rule-first Coaching (Week 2)

- 实现渐进负荷与 Deload 判定规则
- 生成下一次训练建议
- 生成模板化周报

Exit Criteria:

- 不依赖 LLM 即可产生建议与周报

### Phase C: Frontend + Knowledge Base (Week 3)

- 实现今日面板、计划、记录、恢复、饮食、知识库页面
- 支持图片上传索引与历史检索
- 支持手动编辑与保存

Exit Criteria:

- 用户可在页面完成查看与编辑闭环

### Phase D: Bot + Consent Workflow (Week 4)

- Telegram 指令录入与提醒
- AI 提议改动 -> 用户同意 -> 审计写入
- 高风险字段二次确认

Exit Criteria:

- 消息端与 Web 端状态一致
- 审计日志可追溯

### Phase E: Budgeted AI Enablement (Week 5)

- 接入 DeepSeek API
- 启用 L0/L1/L2 路由与预算阈值降级
- 启用缓存与调用统计

Exit Criteria:

- 月预算 30 RMB 配置生效
- 预算超阈值自动降级

## Risks and Mitigations

- 风险：上下文过长导致成本飙升
  - 缓解：固定 token 上限与摘要注入
- 风险：AI改动误操作
  - 缓解：用户同意与二次确认
- 风险：多入口状态不一致
  - 缓解：统一后端写入路径与审计

## Deliverables

- 技能与计划文档
- MVP 代码骨架
- 预算控费配置
- 可运行演示路径
