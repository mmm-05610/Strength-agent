---
name: awesome-design-md-guide
description: 从 awesome-design-md 提炼前端设计原则并转化为可执行页面规范。用于在快速开发中保持一致的视觉语言、组件规则和响应式行为。
metadata:
  internal: false
  version: 1.0
---

# Awesome Design MD Guide

## Purpose

把 awesome-design-md 的核心方法转成可执行的前端设计工作流，帮助健身Agent的 Web 页面在简洁前提下保持一致性和专业感。

本技能不内嵌该项目全部内容，只保留索引入口与调用方法。

## Source Location

本地路径：

- C:/Users/maoqh/Desktop/项目文件/模板/awesome-design-md

GitHub 仓库：

- https://github.com/mmm-05610/awesome-design-md.git

调用时按需查询，不做整库复制。

## Key Concepts

### 1) DESIGN.md 是给设计智能体看的规范文件

- AGENTS.md 侧重如何开发
- DESIGN.md 侧重页面外观与体验规则

### 2) 设计规范最小骨架（9块）

1. Visual Theme and Atmosphere
2. Color Palette and Roles
3. Typography Rules
4. Component Stylings
5. Layout Principles
6. Depth and Elevation
7. Do and Dont
8. Responsive Behavior
9. Agent Prompt Guide

### 3) 快速使用方式

- 选定一个参考风格
- 提取颜色、字体、组件、布局四类核心 token
- 在当前项目中建立轻量 DESIGN 规范
- 用统一 token 驱动前端实现

## Application

### Step 1: 选择风格样本

从 awesome-design-md 的 design-md 目录选择 1 到 2 个样本风格（不要混太多）。

### Step 2: 提炼最小 token 集

提取并落库：

- brand/background/text/success/warning/error
- 字体层级（H1/H2/body/caption）
- 按钮/卡片/输入框状态
- 间距和断点

### Step 3: 形成项目内设计规范

输出文件建议：

- frontend/design/design-tokens.json
- frontend/design/design-rules.md

### Step 4: 页面落地优先级

优先做：

1. 今日面板
2. 训练计划
3. 训练记录
4. 恢复体征
5. 饮食记录
6. 知识库

### Step 5: 评审检查

检查以下一致性：

- 色彩语义一致
- 字体层级稳定
- 组件状态统一
- 移动端可用

## Fitness Agent UI Rules (MVP)

- 信息密度优先于装饰
- 训练数据卡片必须可扫描
- 关键动作按钮保持位置稳定
- 高风险建议使用显著告警色
- 编辑与保存动作必须显式反馈

## Query Guidance

当需要更详尽能力时：

1. 先查本地 README 和对应站点目录
2. 再查仓库在线内容
3. 需要完整 DESIGN 细节时，使用站点提供的 design-md 链接按需读取

## Common Pitfalls

### Pitfall 1: 一次混用多个品牌风格

后果：界面割裂。
修正：每个页面只选一个主风格来源。

### Pitfall 2: 只抄颜色，不抄布局逻辑

后果：像素看似接近，体验不一致。
修正：同时提取 spacing、层级、组件状态。

### Pitfall 3: 设计规则没有工程化

后果：实现阶段被随意改动。
修正：把设计规则映射为 token 文件和组件约束。

## References

- C:/Users/maoqh/Desktop/项目文件/模板/awesome-design-md/README.md
- C:/Users/maoqh/Desktop/项目文件/模板/awesome-design-md/CONTRIBUTING.md
- https://github.com/mmm-05610/awesome-design-md.git
