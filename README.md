<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)">
    <img alt="Strength Agent" width="420" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MjAiIGhlaWdodD0iODAiPjxyZWN0IHdpZHRoPSI0MjAiIGhlaWdodD0iODAiIGZpbGw9IiNmOGY3ZmMiLz48dGV4dCB4PSIyMTAiIHk9IjUwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyOCIgZm9udC13ZWlnaHQ9IjcwMCIgZmlsbD0iIzJkMmIzYSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+U3RyZW5ndGggQWdlbnQ8L3RleHQ+PC9zdmc+" />
  </picture>
</p>

<p align="center">
  <strong>AI-powered fitness tracking desktop application</strong><br/>
  <sub>Built with Tauri · React 19 · TypeScript 6 · FastAPI · DeepSeek</sub>
</p>

<p align="center">
  <a href="#-features">English</a> &nbsp;|&nbsp;
  <a href="#-核心功能">中文</a>
</p>

---

<blockquote>
<p><strong>Note:</strong> This project is applying for <a href="https://mimo.cool">MIMO</a> free credits to support ongoing AI infrastructure costs. Strength Agent uses LLM-powered chat to help users log workouts, track nutrition, set fitness goals, and analyze body composition — making AI-assisted fitness coaching accessible to everyone.</p>
</blockquote>

---

<img src="./frontend.png" alt="Strength Agent Dashboard" width="100%" style="border-radius:12px" />

---

## ✨ Features

- **AI Chat Coach** — Natural language fitness logging via DeepSeek LLM. Say "I benched 80kg 5x5" and the AI parses it into structured workout data, with tool-call rendering and dynamic forms
- **Unified Dashboard** — Four-pillar layout: Training, Recovery, Nutrition, Body Composition. All metrics share a single source of truth data model
- **Body Composition Analysis** — Full InBody-style metrics with segmental analysis (5 body regions), muscle-fat balance visualization, and trend tracking
- **Goal Tracking** — Progress visualization with required vs actual weekly change, timeline projections, and muscle/fat ratio tracking
- **Food Recognition** — AI-powered meal logging with automatic calorie and macro estimation
- **Auto-Sync Architecture** — Nutrition logs automatically synchronize body weight/fat/muscle to the body metrics store, eliminating write-read inconsistency

## 🏗 Architecture

| Layer             | Technology                            |
| ----------------- | ------------------------------------- |
| Desktop Shell     | Tauri v2 (Rust)                       |
| Frontend          | React 19 + TypeScript 6 + Vite 8      |
| Charts            | Recharts 3.8                          |
| Icons             | Lucide React                          |
| Backend (Sidecar) | FastAPI + SQLAlchemy 2.0 ORM          |
| Database          | SQLite (embedded)                     |
| AI Engine         | DeepSeek API (function calling + RAG) |
| Testing           | Vitest 4 + Testing Library            |

### Data Architecture: Single Source of Truth

```
User Action (manual / AI chat)
    │
    ▼
┌─────────────────────┐
│   /api/v1/dispatch  │  ◀── Unified write path
│   Action Registry   │
└──────┬──────────────┘
       │
       ├── nutrition.create ──▶ NutritionLogEntity
       │         │                     │
       │         ▼                     │
       │    auto-sync: body fields ────┤
       │                               ▼
       ├── body_metric.upsert ──▶ BodyMetricEntity  ◀── Single Source of Truth
       │                               │
       ├── workout.create ────▶ WorkoutSessionEntity
       │
       └── readiness.create ──▶ ReadinessLogEntity
                │
                ▼
    ┌─────────────────────────┐
    │   GET /dashboard        │  ◀── All modules read from SSOT
    │   • training            │
    │   • recovery            │
    │   • nutrition (weight from body_metrics)
    │   • goal_progress (from body_metrics)
    │   • weight_trend (from body_metrics)
    │   • body_metrics
    └─────────────────────────┘
```

### Design System

- **Color space**: OKLCH tokens for consistent perceptual brightness
- **Palette**: Lavender purple primary (#7C6FF7) + mint green accent (#4ECDC4)
- **Components**: StatCard, ScoreDial, CalorieRing, ProgressRing, SegmentedControl
- **States**: Every component has `default / hover / active / disabled / loading / empty / error`
- **Animation**: CSS transitions on all interactive elements (duration + easing)

## 🚀 Quick Start

### Prerequisites

- Python 3.11+ &nbsp;·&nbsp; Node.js 22+ &nbsp;·&nbsp; Rust (for Tauri)

### Backend

```bash
cd mvp/backend
python -m venv .venv && source .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # edit with your DeepSeek API key
python -m uvicorn app.main:app --host 127.0.0.1 --port 18720 --reload
```

### Frontend

```bash
cd desktop
npm install
npm run tauri dev
```

### API Health Check

```bash
curl http://127.0.0.1:18720/api/v1/dashboard
```

## 📂 Project Structure

```
Strength-agent/
├── desktop/                      # Tauri + React frontend
│   ├── src/
│   │   ├── api/client.ts         # API client & TypeScript interfaces
│   │   ├── components/
│   │   │   ├── Chat/             # AI chat panel, tool cards, forms
│   │   │   └── Dashboard/        # Dashboard shell, pages, shared components
│   │   │       ├── layout/       # Header, sidebar, shell
│   │   │       ├── pages/        # Training, Recovery, Nutrition, BodyStatus, Goals
│   │   │       └── components/   # Reusable viz components (rings, dials, charts)
│   │   ├── hooks/                # useChat, useDashboard, useActions, useHistoryData
│   │   ├── styles/               # Design tokens, dashboard CSS, component CSS
│   │   └── test/                 # Test factories, setup, import validation
│   └── src-tauri/                # Rust shell
├── mvp/backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app, all routes, migrations
│   │   ├── entities.py           # SQLAlchemy ORM models
│   │   ├── models.py             # Pydantic request/response schemas
│   │   ├── actions.py            # Unified dispatch interface
│   │   ├── action_registry.py    # Action handler registration
│   │   └── services/
│   │       ├── deepseek_client.py    # LLM function calling
│   │       ├── profile_extractor.py  # Fitness profile extraction
│   │       └── food_recognition.py   # Meal → calorie/macro estimation
│   └── log/                      # Request/response logs (gitignored)
└── docs/superpowers/             # Design specs & implementation plans
```

## 🧪 Testing

```bash
# Frontend unit + component tests
cd desktop && npm test

# TypeScript type checking
cd desktop && npx tsc --noEmit
```

## 📄 License

MIT

---

## 核心功能

- **AI 健身教练** — 通过 DeepSeek 大模型实现自然语言训练记录。说出"我今天卧推 80kg 5x5"，AI 自动解析为结构化训练数据
- **统一仪表盘** — 四大模块：训练、恢复、饮食、体测。所有指标共享单一真源数据模型，杜绝读写不一致
- **体成分分析** — 完整 InBody 风格指标，含五区域节段分析、肌肉脂肪平衡可视化、趋势图谱
- **目标追踪** — 进度可视化，周变化量对比（实际 vs 要求），时间线预测
- **食物识别** — AI 自动识别餐食并估算热量与营养素
- **自动同步架构** — 饮食记录中的体重/体脂/肌肉数据自动同步至体测库，消除多模块数据不一致

## 技术亮点

| 领域     | 方案                                                               |
| -------- | ------------------------------------------------------------------ |
| 数据架构 | 单一真源 (SSOT) + 事件溯源轻模式，追加不可变记录                   |
| 写路径   | 统一 `/api/v1/dispatch` 动作分发，Action Registry 注册模式         |
| 读路径   | Dashboard 聚合 5 张表，所有身体指标统一从 body_metrics 读取        |
| 前端状态 | `useActions` / `useHistoryData` / `useOptimisticMutation` 三钩分离 |
| 迁移策略 | 启动时自动执行幂等 SQLite 表重建迁移，零停机                       |
| 设计系统 | OKLCH 色彩空间 + 7 状态覆盖 + CSS 过渡动画                         |
| 类型安全 | TypeScript 严格模式 + Pydantic v2 校验，前后端接口同构             |

---

<p align="center">
  <sub>Built with care for the MIMO community. AI credits help us ship faster.</sub>
</p>
