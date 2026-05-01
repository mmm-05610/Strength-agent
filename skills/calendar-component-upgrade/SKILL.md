---
name: calendar-component-upgrade
description: 在需要为无构建前端快速选型并接入开源日历组件（公历月视图、联网时间、状态着色）时使用。
metadata:
  internal: false
  version: 1.0
---

# Calendar Component Upgrade

## Purpose

在现有 Web 页面中，把“手写日历”升级为可维护、可扩展的开源日历组件，并保持业务状态可视化（已完成/计划/未完成/休息）。

该技能默认面向“纯 HTML + CSS + JS、无构建工具”的项目。

## Key Concepts

### 选型结论（默认推荐）

- 首选: FullCalendar
- 原因:
  - 支持 CDN 直连（无需 npm 构建）
  - 月视图成熟，公历模板完整
  - 日期导航、locale、today 高亮能力稳定
  - 社区活跃、文档完备

### 备选

- TUI Calendar: 功能丰富，CDN 友好，但默认交互复杂度偏高
- react-big-calendar: React 项目友好，不适合纯原生页面

### 数据映射原则

- 日历组件负责“日期网格 + 导航 + 可访问性”
- 业务代码负责“状态判定与颜色语义”
- 网络时间只决定“今天”的基准，不改动业务数据源

## Application

1. 基线检查

- 确认当前项目是否是无构建环境。
- 若是无构建环境，优先选择 CDN 方式接入 FullCalendar。

2. 接入组件资源

- 在页面 head 注入 FullCalendar CSS。
- 在业务脚本前注入 FullCalendar global JS。

3. 初始化公历月视图

- 使用 dayGridMonth。
- 设置 firstDay=1（周一开头），locale=zh-cn。
- 关闭内置 headerToolbar，复用页面已有导航按钮。

4. 映射训练状态到日期单元格

- 从业务数据生成日期状态（done/planned/missed/rest）。
- 在 day cell 上附加状态 class，用 CSS 做颜色语义。
- 通过 title 提示 focus_area，避免日期格信息过载。

5. 接入联网时间（带回退）

- 先请求可用时间 API（例如 timeapi.io）。
- 失败后尝试备用 API（例如 worldtimeapi）。
- 全部失败回退本机时间。
- 每 10 分钟刷新一次 now 基准并重绘 today 高亮。

6. 验收清单

- 月切换正常（上月/本月/下月）。
- 今日高亮与日期来源展示正确。
- 训练状态颜色与图例一致。
- 网络失败时仍可显示本地时间并正常渲染。

## Examples

场景: 健身教练面板首页日历升级

- 输入: 周期模板计划 + 训练记录 + 当前日期
- 输出:
  - 公历月视图
  - 已完成（绿）、计划（蓝）、未完成（橙）、休息（灰）
  - 日期来源标签（联网/本地）

## Common Pitfalls

- 只替换 UI，不保留业务状态映射。
  - 后果: 看起来是新日历，但没有训练语义。
  - 修正: 保留并复用 getPlanForDate + workout 完成记录判定。

- 仅依赖单一时间 API。
  - 后果: 网络波动时 today 错乱或空白。
  - 修正: 多源回退 + 本地兜底。

- 在无构建项目里引入 React 专属日历库。
  - 后果: 集成成本高、维护复杂。
  - 修正: 优先使用 FullCalendar global bundle。

## References

- mvp/frontend/index.html
- mvp/frontend/app.js
- mvp/frontend/styles.css
- https://fullcalendar.io/docs
- https://nhn.github.io/tui.calendar/latest/
