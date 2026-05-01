---
name: training-periodization-engine
description: 设计健身训练的周期化与渐进负荷逻辑。适用于自动调整重量、次数、训练量与Deload判定。
metadata:
  internal: false
  version: 1.0
---

# Training Periodization Engine

## Purpose

建立可计算、可解释的训练逻辑核心，让Agent能基于历史数据自动给出下一次训练建议。

## Key Concepts

### 核心实体

- user_profile: 训练目标、训练年龄、伤病限制
- exercise_catalog: 动作、主肌群、风险等级
- workout_session: 日期、计划、完成状态
- set_log: 重量、次数、RPE、RIR
- readiness_log: 睡眠、疲劳、疼痛、压力
- cycle_block: 周期类型、周数、目标强度
- deload_event: 触发原因、持续周数

### 三类关键指标

- 强度: %1RM 或 RPE
- 容量: 总训练量 = sets x reps x load
- 恢复: 睡眠、主观疲劳、疼痛趋势

### e1RM估算

Epley: e1RM = weight x (1 + reps / 30)

## Application

### Step 1: 初始参数

- 为每个主项建立起始e1RM
- 为用户选择周期策略:
  - 线性周期（新手）
  - 波动周期（中高级）

### Step 2: 单次训练后更新

对每个主动作计算：

- 最新e1RM
- 与过去3次中位值对比
- RPE偏移（实际RPE - 目标RPE）

### Step 3: 加载调整规则

建议规则（可直接编码）：

1. 若目标组完成且RPE <= 8，下一次 +2.5%（下肢可到+5%）
2. 若RPE 8.5-9.5，维持负荷
3. 若RPE >= 10 或动作失败，下一次 -2.5% 到 -5%
4. 若连续2周e1RM无提升且疲劳上升，触发Deload评估

### Step 4: Deload判定

满足任两项则进入Deload周：

- 连续2周主项e1RM无提升
- 最近7天平均疲劳分 > 阈值
- 疼痛评分连续上升
- 睡眠连续3天低于阈值

Deload策略:

- 训练量降低30%-50%
- 强度降低5%-10%
- 保留动作模式，不追求PR

### Step 5: 周报输出

每周输出至少包含：

- 主项e1RM变化
- 总训练量变化
- 恢复状态趋势
- 下周建议（加重/维持/减量/Deload）

## Pseudocode

```text
for exercise in main_lifts:
  perf = latest_performance(exercise)
  trend = rolling_median_e1rm(exercise, 3)
  rpe_gap = perf.actual_rpe - perf.target_rpe

  if perf.completed and perf.actual_rpe <= 8:
    next_load = perf.load * 1.025
  elif perf.actual_rpe >= 10 or perf.failed:
    next_load = perf.load * 0.95
  else:
    next_load = perf.load

if deload_trigger_count >= 2:
  apply_deload_week()
```

## Common Pitfalls

### Pitfall 1: 只看重量，不看恢复

后果: 过早透支，伤病风险上升。
修正: 每次建议都要读取恢复指标。

### Pitfall 2: 固定加重不分人群

后果: 新手进步快，高级训练者被错误加重。
修正: 分层阈值与步进比例。

### Pitfall 3: Deload触发过晚

后果: 连续平台甚至倒退。
修正: 建立可观测阈值并周更评估。

## References

- Strength-agent/.agents/skills/fitness-coach/SKILL.md
- Strength-agent/.agents/skills/sql-query/SKILL.md
- Strength-agent/skills/requirement-analysis-workflow/SKILL.md
