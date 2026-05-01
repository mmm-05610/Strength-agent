---
name: design-system-engine
description: 在需要统一色彩、字体、组件状态、间距规则，并将 UI 规范工程化为 token 与组件约束时使用。
metadata:
  internal: false
  version: 1.0
---

# Design System Engine

## Purpose

把视觉规范转成可执行的工程资产，避免“每个页面各画各的”。

该技能专注把设计语言沉淀为：

- Design Tokens
- 组件状态规则
- 页面布局约束

## Key Concepts

### 1) Token 优先

先定义变量，再写样式。

- Color Tokens
- Typography Tokens
- Spacing Tokens
- Radius/Shadow Tokens

### 2) 组件状态矩阵

关键组件必须定义四类状态：

- default
- hover
- active
- disabled

### 3) 语义色而非功能色

例如 success/warn/error，不直接写“绿色按钮/红色文字”。

## Application

1. 资产盘点

- 收集现有页面中的颜色、字号、间距、圆角
- 去重后形成 token 草案

2. 定义 token 文件

- 维护 design-tokens.json 或 CSS Variables
- 约束 token 命名和用途

3. 组件模板化

- 按钮、卡片、输入框、标签、状态徽标统一样式
- 建立可复制的类名约定

4. 响应式规则

- 桌面/平板/手机的列数、边距、信息密度
- 保证核心动作按钮位置稳定

5. 设计验收

- 跨页面视觉一致
- 颜色与状态语义一致
- 新页面可直接复用现有组件

## Examples

场景：健身面板中的“状态徽标”

- 预算、路由、训练状态都采用同一徽标系统
- 颜色语义保持一致，避免认知负担

## Common Pitfalls

### Pitfall 1: token 定义后没人用

后果：规范文件与实际代码脱节。
修正：组件样式必须只消费 token。

### Pitfall 2: 只定义颜色不定义布局

后果：看起来同色系，但信息结构混乱。
修正：同时定义布局与间距规则。

### Pitfall 3: 组件命名随意

后果：样式重复和覆盖冲突。
修正：统一命名约定并定期清理冗余类。

## References

- skills/awesome-design-md-guide/SKILL.md
- https://github.com/wshobson/agents
- plugins/ui-design/skills/design-system-patterns/SKILL.md
- plugins/frontend-mobile-development/skills/tailwind-design-system/SKILL.md
