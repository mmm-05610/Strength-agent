---
name: frontend-architecture-playbook
description: 在需要重构前端结构、拆分页面状态、建立可维护模块边界时使用（适配 HTML/CSS/JS 与框架项目）。
metadata:
  internal: false
  version: 1.0
---

# Frontend Architecture Playbook

## Purpose

把前端从“页面脚本堆叠”升级为“模块化架构”，让后续迭代不会越改越乱。

目标是提升三件事：

- 可维护性（改动范围可预测）
- 可扩展性（新模块可平滑接入）
- 可测试性（逻辑可隔离验证）

## Key Concepts

### 1) 三层拆分

- View Layer: DOM 渲染与交互绑定
- State Layer: 页面状态、派生状态、状态同步
- Service Layer: API 调用、错误处理、重试与回退

### 2) 单向数据流

- 数据更新路径固定：输入 -> 状态变更 -> 渲染
- 避免在多个函数里直接改 DOM 与共享变量

### 3) 事件契约

- 交互事件统一命名和出口
- 页面内任何按钮都要能追踪到唯一 handler

## Application

1. 先画边界

- 列出页面模块：如 dashboard、plan、calendar、form
- 标记每个模块的输入、输出、依赖

2. 建立状态模型

- 主状态：服务端数据
- 视图状态：当前 tab、筛选条件、编辑中数据
- 派生状态：通过纯函数计算，不手动冗余存储

3. 服务封装

- 封装 getJson/postJson
- 统一超时、错误提示、fallback
- 禁止在页面函数中散落 fetch

4. 渲染策略

- 每个模块一个 render 函数
- 模块更新时只刷新自身区域
- 重渲染函数要幂等

5. 架构验收

- 任意需求改动能明确落到某一层
- 新增模块不需要改动全局核心逻辑

## Examples

场景：训练计划页重构

- 旧：表单、状态、渲染混在一个函数里
- 新：
  - state.editableCyclePlan 管编辑态
  - service 层处理 plan API
  - renderCycleEditor 只负责 UI 输出

## Common Pitfalls

### Pitfall 1: 只拆文件不拆职责

后果：文件变多但耦合不变。
修正：先定义每层职责再拆文件。

### Pitfall 2: 状态与 DOM 双写

后果：显示与真实数据不一致。
修正：以状态为唯一数据源，DOM 只渲染状态。

### Pitfall 3: 事件处理分散

后果：排查 Bug 需要全局搜索。
修正：集中绑定事件并保持命名一致。

## References

- https://github.com/wshobson/agents
- plugins/frontend-mobile-development/skills/react-state-management/SKILL.md
- plugins/frontend-mobile-development/skills/nextjs-app-router-patterns/SKILL.md
