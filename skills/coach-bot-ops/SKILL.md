---
name: coach-bot-ops
description: 构建健身教练消息机器人（Telegram/Discord/企业IM）及定时调度、会话状态与安全策略。
metadata:
  internal: false
  version: 1.0
---

# Coach Bot Ops

## Purpose

让健身Agent通过消息入口长期稳定运行，负责提醒、收集记录、输出建议和周报。

## Key Concepts

### 入口优先级

1. Telegram Bot（最快）
2. Discord Bot
3. 企业微信/钉钉机器人

### 三类消息

- 采集消息: 训练记录、主观疲劳、睡眠
- 推送消息: 训练提醒、恢复提醒
- 决策消息: 本次建议与理由

### 会话状态最小集

- user_id
- current_goal
- current_cycle_week
- last_workout_summary
- pending_question

## Application

### Step 1: 命令与菜单

至少支持：

- /start
- /log_workout
- /log_sleep
- /status
- /weekly_report
- /help

### Step 2: 定时任务

- 每天 08:00 训练提醒
- 每天 22:00 恢复问卷
- 每周日晚 20:00 周报推送

建议实现:

- APScheduler 或 cron
- 任务幂等键: user_id + job_type + date

### Step 3: 建议生成链路

1. 拉取最近训练与恢复数据
2. 调用规则引擎生成初步建议
3. 调用LLM做解释和沟通优化
4. 返回结构化建议卡片

### Step 4: 安全与隐私

- 数据最小化采集
- 敏感字段加密存储
- 提供导出与删除命令
- API/Webhook签名校验 + 重放防护

### Step 5: 可观测性

最低监控：

- 推送成功率
- 命令响应时延
- 周报生成成功率
- 建议采纳率

## Message Template

```text
今日训练建议
- 主项: 卧推 4 x 5 @ 80kg
- 原因: 最近两次RPE下降，恢复分提升
- 备选: 若热身RPE偏高，改为 77.5kg
- 恢复提醒: 睡眠低于6小时时不做冲刺组
```

## Common Pitfalls

### Pitfall 1: 机器人只会发提醒，不会闭环

后果: 用户回复后没有进入分析，留存下降。
修正: 每条采集消息都落库并触发分析链。

### Pitfall 2: 定时任务重复触发

后果: 同一提醒多次发送，用户反感。
修正: 使用幂等键和任务去重。

### Pitfall 3: 直接让LLM决定高风险训练

后果: 建议不可控。
修正: 高风险决策必须先过规则引擎硬阈值。

## References

- Strength-agent/.agents/skills/api-integration/SKILL.md
- Strength-agent/.agents/skills/fastapi-templates/SKILL.md
- Strength-agent/.agents/skills/gdpr-data-handling/SKILL.md
- Strength-agent/.agents/skills/rag-implementation/SKILL.md
