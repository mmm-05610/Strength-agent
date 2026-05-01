---
name: ui-experience-patterns
description: 在需要提升页面可读性、交互清晰度与操作反馈（尤其是表单与日历场景）时使用。
metadata:
  internal: false
  version: 1.0
---

# UI Experience Patterns

## Purpose

把“能用”提升到“好用”，重点优化用户在页面中的理解速度和操作确定性。

该技能适合：

- 表单编辑器
- 日历/计划视图
- 数据看板中的高频交互区域

## Key Concepts

### 1) 视觉层级清晰

一个区域只允许一个视觉主焦点。

### 2) 操作可预期

按钮文案、图标、位置要稳定，避免用户每次重新学习。

### 3) 反馈及时

提交、保存、失败、加载都要有可见反馈。

### 4) 信息减负

默认只展示必要信息，细节按需展开。

## Application

1. 识别高频任务路径

- 例如：修改训练日 -> 保存计划 -> 回看日历
- 将这条路径上的控件放在稳定位置

2. 简化控件形态

- 文本按钮改图标按钮时保留 aria-label/title
- 复杂表单拆成卡片区块

3. 状态表达统一

- success/warn/error/info 一致视觉语义
- 休息日/训练日等业务状态统一映射

4. 增加弱引导

- 输入控件使用占位说明和默认值
- 关键区域给出轻量提示，不打断流程

5. 移动端验证

- 触控目标大小足够
- 单列布局时主操作按钮可快速到达

## Examples

场景：周期模板编辑器

- 每个日期块保留训练勾选
- 勾选后显示训练部位下拉
- 顶部统一操作栏：重建模板 / 套用模板 / 保存

## Common Pitfalls

### Pitfall 1: 为了好看牺牲可读性

后果：视觉炫但任务完成率下降。
修正：先保证信息层级，再做装饰。

### Pitfall 2: 图标替代文本但无语义

后果：新用户看不懂，辅助技术不可读。
修正：必须补 aria-label 与 title。

### Pitfall 3: 状态提示分散

后果：用户不知道操作是否生效。
修正：关键操作统一反馈位置和样式。

## References

- https://github.com/wshobson/agents
- plugins/ui-design/skills/interaction-design/SKILL.md
- plugins/ui-design/skills/responsive-design/SKILL.md
- plugins/accessibility-compliance/skills/wcag-audit-patterns/SKILL.md
