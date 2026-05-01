# Fitness Agent MVP Starter

## What is included

- Backend API (FastAPI + PostgreSQL persistence)
- Rule-first recommendation flow + Deload guard
- DeepSeek AI layer with 30 RMB/month budget routing (L0/L1/L2)
- Six-panel web dashboard with real API integration
- AI change proposal + user approval workflow + audit trail

## Run backend

1. Open terminal in `mvp/backend`
2. Start PostgreSQL (recommended):
   `docker compose up -d`
   If Docker daemon is not running, you can continue with default SQLite fallback and switch to PostgreSQL later by setting `DATABASE_URL`.
3. Create Python 3.12 virtual environment:
   `py -3.12 -m venv .venv`
4. Install dependencies:
   `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`
5. Copy env template and fill keys:
   `copy .env.example .env`
6. Start server:
   `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`

If your terminal is not inside `mvp/backend`, use absolute command:
`c:/Users/maoqh/Desktop/项目文件/Strength-agent/mvp/backend/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000 --app-dir "c:/Users/maoqh/Desktop/项目文件/Strength-agent/mvp/backend"`

## Run frontend

1. Open `mvp/frontend/index.html` in browser, or
2. Run a static server in `mvp/frontend`:
   `python -m http.server 5500`
   Then open `http://127.0.0.1:5500`

## Core endpoints

- GET /health
- GET /api/v1/dashboard/today
- GET /api/v1/plan
- PUT /api/v1/plan
- POST /api/v1/workouts
- POST /api/v1/readiness
- POST /api/v1/nutrition
- POST /api/v1/knowledge-assets
- POST /api/v1/change-proposals
- POST /api/v1/change-proposals/{id}/approve
- POST /api/v1/ai/recommendation

## Notes

- PostgreSQL persistence is supported via `DATABASE_URL`.
- Development default is SQLite (`sqlite:///./fitness_agent.db`) when `DATABASE_URL` is not set.
- DeepSeek will only be called when `DEEPSEEK_API_KEY` is configured.
- If key is missing, AI endpoint falls back with non-billed guidance.
- Budget router enforces 30 RMB/month profile via config file.
- Python 3.14 may fail on this dependency set; use Python 3.12.
