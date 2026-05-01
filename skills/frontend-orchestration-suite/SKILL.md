---
name: frontend-orchestration-suite
description: 在需要系统性完善前端时使用：按“架构 -> 设计系统 -> 交互体验 -> 日历组件”顺序编排执行，产出可维护 UI。
metadata:
  internal: false
  version: 1.0
---

# Frontend Orchestration Suite

## Purpose

把前端改造从“零散修补”升级为“有顺序、有验收的系统改造”。

本技能作为总控入口，串联本地前端技能，适合持续迭代中的产品界面治理。

## Key Concepts

### 编排顺序（必须）

1. frontend-architecture-playbook
2. design-system-engine
3. awesome-design-md-guide
4. ui-experience-patterns
5. calendar-component-upgrade（按需）

### 每一层的职责

- 架构层：职责边界与状态流
- 设计层：token 与组件规范
- 体验层：任务路径与交互反馈
- 组件层：复杂控件（如日历）稳定接入

### 验收原则

- 每一层都要有可观察结果
- 不允许跳过架构直接堆样式
- 不允许只换皮不改交互逻辑

## Application

1. 诊断当前页面

- 列出“难改、难读、难用”问题
- 按层归类到 架构/设计/体验/组件

2. 执行架构治理

- 状态、服务、渲染职责分离
- 事件绑定集中化

3. 执行设计系统治理

- token 抽取与统一
- 组件状态矩阵补齐

4. 执行交互体验治理

- 高优路径简化（如：编辑 -> 保存 -> 回看）
- 操作反馈明确（成功/失败/加载）

5. 执行组件升级（按需）

- 对高复杂组件使用成熟开源方案
- 接入后映射业务状态，不丢语义

6. 最终验收

- 一致性：跨页面视觉和交互一致
- 稳定性：改一处不连锁破坏
- 可维护性：新需求可快速落位

## Examples

场景：健身 Agent 前端持续优化

- 先重构训练计划页编辑器状态
- 再统一表单和状态徽标
- 最后完成日历组件升级与联网时间容错

## Common Pitfalls

### Pitfall 1: 直接开始美化

后果：短期变好看，长期更难维护。
修正：先做架构，再做设计与体验。

### Pitfall 2: 组件替换后业务语义丢失

后果：界面可看但不可决策。
修正：保留训练状态、预算状态等业务映射。

### Pitfall 3: 缺少验收清单

后果：改动完成但质量不可验证。
修正：每层定义可观察验收项。

## References

- skills/frontend-architecture-playbook/SKILL.md
- skills/design-system-engine/SKILL.md
- skills/awesome-design-md-guide/SKILL.md
- skills/ui-experience-patterns/SKILL.md
- skills/calendar-component-upgrade/SKILL.md
