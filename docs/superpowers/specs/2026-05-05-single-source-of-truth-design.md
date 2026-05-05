# 单一真源 (Single Source of Truth) 数据架构重构

**日期**: 2026-05-05  
**状态**: 已确认

## 背景

Dashboard 写入路径统一后，存在写读不一致：通过 `body_metric.upsert` 更新体重 60kg，仅趋势图显示正确，其余模块（goal_progress、nutrition、周变化率）仍从 `NutritionLogEntity` 读取旧数据。

根因：4 个身体指标字段（body_weight_kg, body_fat_rate_pct, muscle_weight_kg, waist_cm）在 `NutritionLogEntity` 和 `BodyMetricEntity` 两表重复存储，写入路径不同步。

## 设计原则

1. **单一真源**: 每个数据域只有一个规范存储表
2. **不可变事件日志**: 身体指标 append-only，当前值 = 查询投影
3. **自动同步**: nutrition.create 携带体测字段时自动转发到 body_metrics
4. **数据源溯源**: 每条 body_metrics 记录标注来源

## 数据域归属

| 域       | 规范表                              | 字段                                                                                                                                                                                                              |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身体指标 | `body_metrics`                      | body_weight_kg, body_fat_rate_pct, body_fat_kg, muscle_weight_kg, skeletal_muscle_kg, body_water_kg, protein_kg, minerals_kg, 分段肌肉×5, 分段脂肪×5, waist_cm, hip_cm, inbody_score, bmr_kcal, height_cm, source |
| 饮食     | `nutrition_logs`                    | calories_kcal, protein_g, carbs_g, fat_g, water_liters, notes                                                                                                                                                     |
| 恢复     | `readiness_logs`                    | sleep_hours, fatigue_score, pain_score, stress_score                                                                                                                                                              |
| 训练     | `workout_sessions` + `workout_sets` | 无重叠                                                                                                                                                                                                            |

## 变更清单

### 数据库

1. `body_metrics.log_date` 去掉 UNIQUE 约束 → append-only
2. `body_metrics` 新增 `source` 列 (VARCHAR 32, default "manual")
3. `nutrition_logs` 删除 4 列: body_weight_kg, body_fat_rate_pct, muscle_weight_kg, waist_cm
4. 迁移历史数据: nutrition_logs 中 4 列非空值 → INSERT INTO body_metrics

### 后端 (main.py)

5. `_upsert_body_metric` → `_insert_body_metric`: 去掉 upsert 逻辑，始终 INSERT
6. `_action_nutrition_create`: 提取体测字段 → 调用 `_insert_body_metric` 自动同步
7. `_weight_trend_weekly_kg`: 数据源从 NutritionLogEntity → BodyMetricEntity
8. `_build_goal_progress`: current_weight 从 NutritionLogEntity → BodyMetricEntity
9. `get_dashboard`: goal_progress 用 .model_dump() 完整透传；nutrition 补 body_weight_kg 字段

### 模型 (models.py)

10. NutritionLogCreate/Update 删除 4 个体测字段
11. BodyMetricCreate 新增 source 字段

### 实体 (entities.py)

12. BodyMetricEntity: 去掉 unique=True，新增 source 列
13. NutritionLogEntity: 删除 4 列

### 前端 (client.ts)

14. TypeScript NutritionLogCreate/NutritionLogUpdate 删除 4 字段

## 写入路径

```
nutrition.create {calories, protein, ..., body_weight_kg: 60}
  ├─→ nutrition_logs: {calories, protein, ...}  (仅饮食字段)
  └─→ body_metrics: {body_weight_kg: 60, source: "nutrition_sync"}  (自动同步)

body_metric.upsert {body_weight_kg: 60, ...}
  └─→ body_metrics: {body_weight_kg: 60, source: "manual"}
```

## 读取路径

所有身体指标查询统一走 `body_metrics`，取 `ORDER BY log_date DESC, id DESC LIMIT 1`。

Dashboard 各模块均从 BodyMetricEntity 取最新值：

- weight_trend ✅ (已正确)
- body_metrics ✅ (已正确)
- goal_progress.current_weight ✅ (修复)
- \_weight_trend_weekly_kg ✅ (修复)
- nutrition.body_weight_kg ✅ (修复)

## 迁移策略

SQLite 不支持 ALTER TABLE DROP COLUMN，采用重建表方式：

1. 历史数据迁移: INSERT INTO body_metrics SELECT ... FROM nutrition_logs WHERE ... (同日期跳过)
2. 重建 nutrition_logs (不含 4 列)
3. body_metrics 添加 source 列 + 去掉 UNIQUE 约束
4. 迁移幂等，在 on_startup 中检查执行
