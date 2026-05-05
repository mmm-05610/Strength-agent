# 单一真源数据架构重构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 NutritionLogEntity 与 BodyMetricEntity 之间的字段重叠，建立 body_metrics 为身体指标唯一真源，修复 Dashboard 写读不一致。

**Architecture:** 数据库层去重叠 + 写入路径自动同步 + 读取路径统一数据源。nutrition_logs 删 4 列，body_metrics 改为 append-only。所有身体指标读取统一走 body_metrics。

**Tech Stack:** Python FastAPI + SQLAlchemy + SQLite, React TypeScript

---

### Task 1: 数据库迁移 — BodyMetricEntity 加 source 列 + 去 UNIQUE

**Files:**

- Modify: `mvp/backend/app/entities.py:99-132`
- Modify: `mvp/backend/app/main.py` (新增迁移函数)

- [x] **Step 1: BodyMetricEntity 修改**

`mvp/backend/app/entities.py:99-132` 改动：

```python
class BodyMetricEntity(Base):
    __tablename__ = "body_metrics"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    log_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)  # 去掉 unique=True
    body_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    # ... 其余身体指标列不变 ...
    # 新增
    source: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    source_asset_id: Mapped[int | None] = mapped_column(ForeignKey("knowledge_assets.id", ondelete="SET NULL"), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

- [x] **Step 2: 新增迁移函数 `_migrate_body_metrics_schema`**

在 `mvp/backend/app/main.py` 中新增（放在 `on_startup` 之前）：

```python
def _migrate_body_metrics_schema(db: Session) -> None:
    """v0.3.0: 去掉 body_metrics.log_date UNIQUE + 新增 source 列"""
    import sqlite3
    engine = db.get_bind()
    if engine.dialect.name != "sqlite":
        return

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        # 检查 source 列是否存在
        cur.execute("PRAGMA table_info(body_metrics)")
        cols = [r[1] for r in cur.fetchall()]
        has_source = "source" in cols
        has_unique = any(
            r[2] == "UNIQUE" and r[1] == "log_date"
            for r in cur.execute("PRAGMA index_list(body_metrics)").fetchall()
            for r in cur.execute(f"PRAGMA index_info({r[1]})").fetchall()
        )

        if has_source and not has_unique:
            return  # 已迁移

        # 重建表
        cur.execute("""
            CREATE TABLE body_metrics_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date DATE NOT NULL,
                body_weight_kg FLOAT,
                body_fat_rate_pct FLOAT,
                body_fat_kg FLOAT,
                muscle_weight_kg FLOAT,
                skeletal_muscle_kg FLOAT,
                body_water_kg FLOAT,
                protein_kg FLOAT,
                minerals_kg FLOAT,
                left_upper_muscle_kg FLOAT,
                right_upper_muscle_kg FLOAT,
                left_lower_muscle_kg FLOAT,
                right_lower_muscle_kg FLOAT,
                trunk_muscle_kg FLOAT,
                left_upper_fat_kg FLOAT,
                right_upper_fat_kg FLOAT,
                left_lower_fat_kg FLOAT,
                right_lower_fat_kg FLOAT,
                trunk_fat_kg FLOAT,
                waist_cm FLOAT,
                hip_cm FLOAT,
                inbody_score INTEGER,
                bmr_kcal INTEGER,
                source VARCHAR(32) NOT NULL DEFAULT 'manual',
                source_asset_id INTEGER REFERENCES knowledge_assets(id) ON DELETE SET NULL,
                created_at DATETIME NOT NULL DEFAULT (datetime('now'))
            )
        """)
        cur.execute("""
            INSERT INTO body_metrics_new (
                id, log_date, body_weight_kg, body_fat_rate_pct, body_fat_kg,
                muscle_weight_kg, skeletal_muscle_kg, body_water_kg, protein_kg,
                minerals_kg, left_upper_muscle_kg, right_upper_muscle_kg,
                left_lower_muscle_kg, right_lower_muscle_kg, trunk_muscle_kg,
                left_upper_fat_kg, right_upper_fat_kg, left_lower_fat_kg,
                right_lower_fat_kg, trunk_fat_kg, waist_cm, hip_cm,
                inbody_score, bmr_kcal, source_asset_id, created_at
            )
            SELECT
                id, log_date, body_weight_kg, body_fat_rate_pct, body_fat_kg,
                muscle_weight_kg, skeletal_muscle_kg, body_water_kg, protein_kg,
                minerals_kg, left_upper_muscle_kg, right_upper_muscle_kg,
                left_lower_muscle_kg, right_lower_muscle_kg, trunk_muscle_kg,
                left_upper_fat_kg, right_upper_fat_kg, left_lower_fat_kg,
                right_lower_fat_kg, trunk_fat_kg, waist_cm, hip_cm,
                inbody_score, bmr_kcal, source_asset_id, created_at
            FROM body_metrics
        """)
        cur.execute("DROP TABLE body_metrics")
        cur.execute("ALTER TABLE body_metrics_new RENAME TO body_metrics")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_body_metrics_log_date ON body_metrics(log_date)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_body_metrics_source_asset_id ON body_metrics(source_asset_id)")
        raw.commit()
    finally:
        raw.close()
```

- [x] **Step 3: `on_startup` 中调用迁移**

```python
@app.on_event("startup")
def on_startup() -> None:
    init_db()
    # 运行迁移
    db = next(get_db())
    try:
        _migrate_body_metrics_schema(db)
    finally:
        db.close()
    # Preload RAG knowledge base in background
    import threading
    threading.Thread(target=_rag_pipeline.ensure_loaded, daemon=True).start()
```

- [x] **Step 4: 重启后端验证迁移**

```bash
cd mvp/backend && python -c "from app.main import app; from app.db import get_db; db=next(get_db()); print('OK')"
```

---

### Task 2: 数据库迁移 — nutrition_logs 删 4 列 + 历史数据转移

**Files:**

- Modify: `mvp/backend/app/entities.py:69-85`
- Modify: `mvp/backend/app/main.py` (新增迁移函数)

- [x] **Step 1: NutritionLogEntity 删除 4 列**

`mvp/backend/app/entities.py:69-85` 改为：

```python
class NutritionLogEntity(Base):
    __tablename__ = "nutrition_logs"

    id: Mapped[int] = mapped_column(PK_TYPE, primary_key=True, autoincrement=True)
    log_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    calories_kcal: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_g: Mapped[float] = mapped_column(Float, nullable=False)
    water_liters: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

- [x] **Step 2: 新增迁移函数 `_migrate_nutrition_logs_schema`**

```python
def _migrate_nutrition_logs_schema(db: Session) -> None:
    """v0.3.0: nutrition_logs 删除 4 列体重叠字段, 历史数据迁移到 body_metrics"""
    engine = db.get_bind()
    if engine.dialect.name != "sqlite":
        return

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("PRAGMA table_info(nutrition_logs)")
        cols = [r[1] for r in cur.fetchall()]

        if "body_weight_kg" not in cols:
            return  # 已迁移

        # 1. 迁移历史数据: nutrition_logs 中有体测数据 → body_metrics
        cur.execute("""
            INSERT OR IGNORE INTO body_metrics (log_date, body_weight_kg, body_fat_rate_pct, muscle_weight_kg, waist_cm, source)
            SELECT log_date, body_weight_kg, body_fat_rate_pct, muscle_weight_kg, waist_cm, 'nutrition_migrate'
            FROM nutrition_logs
            WHERE body_weight_kg IS NOT NULL
               OR body_fat_rate_pct IS NOT NULL
               OR muscle_weight_kg IS NOT NULL
               OR waist_cm IS NOT NULL
        """)

        # 2. 重建 nutrition_logs 表(不含 4 列)
        cur.execute("""
            CREATE TABLE nutrition_logs_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date DATE NOT NULL,
                calories_kcal INTEGER NOT NULL,
                protein_g FLOAT NOT NULL,
                carbs_g FLOAT NOT NULL,
                fat_g FLOAT NOT NULL,
                water_liters FLOAT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                created_at DATETIME NOT NULL DEFAULT (datetime('now'))
            )
        """)
        cur.execute("""
            INSERT INTO nutrition_logs_new (id, log_date, calories_kcal, protein_g, carbs_g, fat_g, water_liters, notes, created_at)
            SELECT id, log_date, calories_kcal, protein_g, carbs_g, fat_g, water_liters, notes, created_at
            FROM nutrition_logs
        """)
        cur.execute("DROP TABLE nutrition_logs")
        cur.execute("ALTER TABLE nutrition_logs_new RENAME TO nutrition_logs")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_nutrition_logs_log_date ON nutrition_logs(log_date)")
        raw.commit()
    finally:
        raw.close()
```

- [x] **Step 3: `on_startup` 中调用**

```python
@app.on_event("startup")
def on_startup() -> None:
    init_db()
    db = next(get_db())
    try:
        _migrate_body_metrics_schema(db)
        _migrate_nutrition_logs_schema(db)
    finally:
        db.close()
    import threading
    threading.Thread(target=_rag_pipeline.ensure_loaded, daemon=True).start()
```

- [x] **Step 4: 重启后端验证**

```bash
cd mvp/backend && python -c "
from app.db import get_db, init_db
init_db()
db = next(get_db())
from sqlalchemy import inspect
insp = inspect(db.get_bind())
print('nutrition_logs cols:', [c['name'] for c in insp.get_columns('nutrition_logs')])
print('body_metrics cols:', [c['name'] for c in insp.get_columns('body_metrics')])
db.close()
"
```

---

### Task 3: Pydantic 模型同步

**Files:**

- Modify: `mvp/backend/app/models.py:67-78, 86-97, 113-143`

- [x] **Step 1: NutritionLogCreate 删除 4 字段**

```python
class NutritionLogCreate(BaseModel):
    log_date: date
    calories_kcal: int = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    water_liters: float = Field(ge=0)
    notes: str = ""
```

- [x] **Step 2: NutritionLogUpdate 删除 4 字段**

```python
class NutritionLogUpdate(BaseModel):
    log_date: date | None = None
    calories_kcal: int | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    water_liters: float | None = Field(default=None, ge=0)
    notes: str | None = None
```

- [x] **Step 3: BodyMetricCreate 新增 source 字段**

在 `BodyMetricCreate` 类中新增一行：

```python
    source: str = "manual"
```

- [x] **Step 4: 验证模型导入无错误**

```bash
cd mvp/backend && python -c "from app.models import NutritionLogCreate, NutritionLogUpdate, BodyMetricCreate; print('OK')"
```

---

### Task 4: 后端写入路径改造

**Files:**

- Modify: `mvp/backend/app/main.py:359-433` (\_upsert → \_insert)
- Modify: `mvp/backend/app/main.py:464-469` (\_action_nutrition_create 加自动同步)
- Modify: `mvp/backend/app/main.py:438-461` (\_action_body_metric_upsert 适配)

- [x] **Step 1: `_upsert_body_metric` → `_insert_body_metric`**

删除第 386-402 行的 upsert 逻辑，改为始终 INSERT：

```python
def _insert_body_metric(
    db: Session,
    log_date: date,
    body_weight_kg: float | None = None,
    body_fat_rate_pct: float | None = None,
    body_fat_kg: float | None = None,
    muscle_weight_kg: float | None = None,
    skeletal_muscle_kg: float | None = None,
    body_water_kg: float | None = None,
    protein_kg: float | None = None,
    minerals_kg: float | None = None,
    left_upper_muscle_kg: float | None = None,
    right_upper_muscle_kg: float | None = None,
    left_lower_muscle_kg: float | None = None,
    right_lower_muscle_kg: float | None = None,
    trunk_muscle_kg: float | None = None,
    left_upper_fat_kg: float | None = None,
    right_upper_fat_kg: float | None = None,
    left_lower_fat_kg: float | None = None,
    right_lower_fat_kg: float | None = None,
    trunk_fat_kg: float | None = None,
    waist_cm: float | None = None,
    hip_cm: float | None = None,
    inbody_score: int | None = None,
    bmr_kcal: int | None = None,
    source: str = "manual",
    source_asset_id: int | None = None,
) -> BodyMetricEntity:
    item = BodyMetricEntity(
        log_date=log_date,
        body_weight_kg=body_weight_kg,
        body_fat_rate_pct=body_fat_rate_pct,
        body_fat_kg=body_fat_kg,
        muscle_weight_kg=muscle_weight_kg,
        skeletal_muscle_kg=skeletal_muscle_kg,
        body_water_kg=body_water_kg,
        protein_kg=protein_kg,
        minerals_kg=minerals_kg,
        left_upper_muscle_kg=left_upper_muscle_kg,
        right_upper_muscle_kg=right_upper_muscle_kg,
        left_lower_muscle_kg=left_lower_muscle_kg,
        right_lower_muscle_kg=right_lower_muscle_kg,
        trunk_muscle_kg=trunk_muscle_kg,
        left_upper_fat_kg=left_upper_fat_kg,
        right_upper_fat_kg=right_upper_fat_kg,
        left_lower_fat_kg=left_lower_fat_kg,
        right_lower_fat_kg=right_lower_fat_kg,
        trunk_fat_kg=trunk_fat_kg,
        waist_cm=waist_cm,
        hip_cm=hip_cm,
        inbody_score=inbody_score,
        bmr_kcal=bmr_kcal,
        source=source,
        source_asset_id=source_asset_id,
    )
    db.add(item)
    db.flush()
    db.refresh(item)
    return item
```

- [x] **Step 2: `_action_body_metric_upsert` 适配新签名**

将 `_upsert_body_metric` 调用改为 `_insert_body_metric`：

```python
async def _action_body_metric_upsert(payload: BodyMetricCreate, db: Session) -> dict:
    if payload.height_cm is not None:
        set_setting(db, "height_cm", payload.height_cm)
    item = _insert_body_metric(
        db, log_date=payload.log_date, body_weight_kg=payload.body_weight_kg,
        body_fat_rate_pct=payload.body_fat_rate_pct, body_fat_kg=payload.body_fat_kg,
        muscle_weight_kg=payload.muscle_weight_kg, skeletal_muscle_kg=payload.skeletal_muscle_kg,
        body_water_kg=payload.body_water_kg, protein_kg=payload.protein_kg,
        minerals_kg=payload.minerals_kg,
        left_upper_muscle_kg=payload.left_upper_muscle_kg,
        right_upper_muscle_kg=payload.right_upper_muscle_kg,
        left_lower_muscle_kg=payload.left_lower_muscle_kg,
        right_lower_muscle_kg=payload.right_lower_muscle_kg,
        trunk_muscle_kg=payload.trunk_muscle_kg,
        left_upper_fat_kg=payload.left_upper_fat_kg,
        right_upper_fat_kg=payload.right_upper_fat_kg,
        left_lower_fat_kg=payload.left_lower_fat_kg,
        right_lower_fat_kg=payload.right_lower_fat_kg,
        trunk_fat_kg=payload.trunk_fat_kg,
        waist_cm=payload.waist_cm, hip_cm=payload.hip_cm,
        inbody_score=payload.inbody_score, bmr_kcal=payload.bmr_kcal,
        source=payload.source,
        source_asset_id=payload.source_asset_id,
    )
    return {"id": item.id, "log_date": str(item.log_date)}
```

- [x] **Step 3: `_action_nutrition_create` 加自动同步逻辑**

```python
_BODY_FIELD_NAMES = ("body_weight_kg", "body_fat_rate_pct", "muscle_weight_kg", "waist_cm")

async def _action_nutrition_create(payload: NutritionLogCreate, db: Session) -> dict:
    data = payload.model_dump()
    body_kwargs = {}
    for k in _BODY_FIELD_NAMES:
        v = data.pop(k, None)
        if v is not None:
            body_kwargs[k] = v

    item = NutritionLogEntity(**data)
    db.add(item)
    db.flush()
    db.refresh(item)

    if body_kwargs:
        _insert_body_metric(db, log_date=payload.log_date, source="nutrition_sync", **body_kwargs)

    return {"id": item.id}
```

- [x] **Step 4: `create_nutrition` API (POST /api/v1/nutrition) 同步修改**

该函数直接构造 `NutritionLogEntity(**payload.model_dump())`，现在 payload 已不含 4 个字段，无需修改逻辑。但需确认 `_to_nutrition_schema` 也不引用这 4 个字段——检查行 190-192 移除引用：

`_to_nutrition_schema` (行 180-195) 改为：

```python
def _to_nutrition_schema(item: NutritionLogEntity) -> NutritionLog:
    return NutritionLog(
        id=item.id,
        log_date=item.log_date,
        calories_kcal=item.calories_kcal,
        protein_g=item.protein_g,
        carbs_g=item.carbs_g,
        fat_g=item.fat_g,
        water_liters=item.water_liters,
        notes=item.notes,
        created_at=item.created_at,
    )
```

- [x] **Step 5: 启动后端验证无 import 错误**

```bash
cd mvp/backend && timeout 5 python -m uvicorn app.main:app --host 127.0.0.1 --port 18720 2>&1 || true
```

---

### Task 5: 后端读取路径修复

**Files:**

- Modify: `mvp/backend/app/main.py:636-660` (\_weight_trend_weekly_kg)
- Modify: `mvp/backend/app/main.py:663-737` (\_build_goal_progress)
- Modify: `mvp/backend/app/main.py:2239-2292, 2251-2258` (get_dashboard)

- [x] **Step 1: `_weight_trend_weekly_kg` 切换数据源到 BodyMetricEntity**

```python
def _weight_trend_weekly_kg(db: Session, end_date: date) -> float | None:
    start_window = end_date.fromordinal(end_date.toordinal() - 27)
    rows = db.scalars(
        select(BodyMetricEntity)
        .where(
            BodyMetricEntity.body_weight_kg.is_not(None),
            BodyMetricEntity.log_date >= start_window,
            BodyMetricEntity.log_date <= end_date,
        )
        .order_by(BodyMetricEntity.log_date.asc(), BodyMetricEntity.id.asc())
    ).all()

    if len(rows) < 2:
        return None

    base_date = rows[0].log_date
    xs = [(r.log_date - base_date).days for r in rows]
    ys = [float(r.body_weight_kg) for r in rows]

    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)

    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator <= 0:
        return None

    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=False))
    slope_per_day = numerator / denominator
    return round(slope_per_day * 7, 4)
```

- [x] **Step 2: `_build_goal_progress` current_weight 切换数据源**

将第 664-670 行改为从 BodyMetricEntity 取最新体重：

```python
def _build_goal_progress(db: Session, config: GoalConfig) -> GoalProgress:
    latest_weight_row = db.scalar(
        select(BodyMetricEntity)
        .where(BodyMetricEntity.body_weight_kg.is_not(None))
        .order_by(desc(BodyMetricEntity.log_date), desc(BodyMetricEntity.id))
    )

    current_weight = float(latest_weight_row.body_weight_kg) if latest_weight_row else float(config.start_weight_kg)
    current_date = latest_weight_row.log_date if latest_weight_row else date.today()
    # ... 后续逻辑不变 ...
```

- [x] **Step 3: `get_dashboard` nutrition 补 `body_weight_kg` 字段**

在 nutrition dict 构造处 (第 2239-2246 行) 增加 `body_weight_kg`：

```python
    # 从 body_metrics 取最新体重
    latest_weight = db.scalar(
        select(BodyMetricEntity.body_weight_kg)
        .where(BodyMetricEntity.body_weight_kg.is_not(None))
        .order_by(desc(BodyMetricEntity.log_date), desc(BodyMetricEntity.id))
    )
    nutrition = {
        "calories_kcal": latest_nutrition.calories_kcal if latest_nutrition else 0,
        "protein_g": latest_nutrition.protein_g if latest_nutrition else 0,
        "carbs_g": latest_nutrition.carbs_g if latest_nutrition else 0,
        "fat_g": latest_nutrition.fat_g if latest_nutrition else 0,
        "water_liters": latest_nutrition.water_liters if latest_nutrition else 0,
        "body_weight_kg": float(latest_weight) if latest_weight else None,
        "log_date": str(latest_nutrition.log_date) if latest_nutrition else "",
    }
```

- [x] **Step 4: `get_dashboard` goal_progress 完整透传**

将第 2251-2258 行改为直接使用 `_build_goal_progress` 返回值：

```python
    config = _load_goal_config(db)
    gp = _build_goal_progress(db, config)
    goal_progress = {
        "goal_type": gp.goal_type,
        "start_date": str(gp.start_date) if gp.start_date else None,
        "target_date": str(gp.target_date) if gp.target_date else None,
        "current_weight_kg": gp.current_weight_kg,
        "target_weight_kg": gp.target_weight_kg,
        "weight_gap_kg": gp.weight_gap_kg,
        "days_remaining": gp.days_remaining,
        "progress_label": gp.progress_label,
        "summary": gp.summary,
        "actual_weekly_weight_change_kg": gp.actual_weekly_weight_change_kg,
        "required_weekly_weight_change_kg": gp.required_weekly_weight_change_kg,
        "current_muscle_kg": gp.current_muscle_kg,
        "target_muscle_kg": gp.target_muscle_kg,
        "muscle_gap_kg": gp.muscle_gap_kg,
    }
```

- [x] **Step 5: `list_body_metrics` API 适配 source 列**

`_to_body_metric_schema` (行 300) 需增加 `source` 字段：

```python
def _to_body_metric_schema(item: BodyMetricEntity, asset: KnowledgeAssetEntity | None = None) -> BodyMetric:
    return BodyMetric(
        # ... 其他字段 ...
        source=getattr(item, "source", "manual"),
        # ...
    )
```

- [x] **Step 6: `weight_trend` 去重逻辑**

由于 body_metrics 现在可能同一天多记录，weight_trend 取每日最新：

```python
    weight_by_date: dict[str, float] = {}
    for r in sorted(body_metric_weight_rows, key=lambda r: (r.log_date, r.id)):
        weight_by_date[str(r.log_date)] = float(r.body_weight_kg)
    # 无需 nutrition_weight_rows 参与
```

并删除 nutrition_weight_rows 的查询 (第 2264-2271 行)。

- [x] **Step 7: 重启后端验证 API 可访问**

```bash
curl -s http://127.0.0.1:18720/api/v1/dashboard | python -m json.tool | head -30
```

---

### Task 6: 前端 TypeScript 接口同步

**Files:**

- Modify: `desktop/src/api/client.ts:343-349, 530-541, 552-578`

- [x] **Step 1: NutritionLogCreate 删除 4 字段**

```typescript
export interface NutritionLogCreate {
  log_date: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_liters: number;
}
```

- [x] **Step 2: NutritionLogUpdate 删除 4 字段**

```typescript
export interface NutritionLogUpdate {
  log_date?: string | null;
  calories_kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  water_liters?: number | null;
  notes?: string | null;
}
```

- [x] **Step 3: NutritionLogEntry 删除 4 字段**

```typescript
export interface NutritionLogEntry {
  id: number;
  log_date: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_liters: number;
  notes: string;
  created_at: string;
}
```

- [x] **Step 4: BodyMetricCreate 新增 source 字段**

```typescript
export interface BodyMetricCreate {
  log_date: string;
  body_weight_kg?: number | null;
  // ... 其他字段不变 ...
  source_asset_id?: number | null;
  source?: string;
}
```

- [x] **Step 5: 前端 TypeScript 编译检查**

```bash
cd desktop && npx tsc --noEmit 2>&1
```

---

### Task 7: 端到端验证

- [x] **Step 1: 通过 Action API 写入体重**

```bash
curl -s -X POST http://127.0.0.1:18720/api/v1/actions \
  -H "Content-Type: application/json" \
  -d '{"action":"body_metric.upsert","payload":{"log_date":"2026-05-05","body_weight_kg":60.0,"source":"manual"}}'
```

- [x] **Step 2: 验证 Dashboard 所有模块都显示 60kg**

```bash
curl -s http://127.0.0.1:18720/api/v1/dashboard | python -c "
import json, sys
d = json.load(sys.stdin)
print('weight_trend:', d['weight_trend'])
print('body_metrics.weight:', d['body_metrics']['body_weight_kg'])
print('nutrition.body_weight:', d['nutrition']['body_weight_kg'])
print('goal_progress.current:', d['goal_progress']['current_weight_kg'])
"
```

- [x] **Step 3: 通过 nutrition.create 写入体重并验证自动同步**

```bash
curl -s -X POST http://127.0.0.1:18720/api/v1/actions \
  -H "Content-Type: application/json" \
  -d '{"action":"nutrition.create","payload":{"log_date":"2026-05-05","calories_kcal":2000,"protein_g":120,"carbs_g":200,"fat_g":60,"water_liters":2.0,"body_weight_kg":61.0}}'

# 验证自动同步
curl -s http://127.0.0.1:18720/api/v1/dashboard | python -c "
import json, sys
d = json.load(sys.stdin)
print('Latest body_metrics weight:', d['body_metrics']['body_weight_kg'])
print('Dashboard goal_progress weight:', d['goal_progress']['current_weight_kg'])
"
```

- [x] **Step 4: 启动前端验证 UI**

```bash
cd desktop && npm run tauri dev
```

在浏览器中验证：

- 通过聊天记录体重 → Dashboard 概览卡片体重更新
- body 详情页体重更新
- 目标页 current_weight 更新
- 趋势图体重更新
