# CLAUDE.md — Strength Agent Desktop

## Tech Stack

- Tauri v2 + React 19 + TypeScript 6 + Vite 8
- FastAPI Python sidecar (port 18720)
- DeepSeek API for AI chat

## UI Design System (Numra Wellness Dashboard)

Reference: https://dribbble.com/shots/27320829-Numra-Wellness-Activity-Tracking-Dashboard

- **Primary**: Soft lavender purple (#7C6FF7 / #8B83BA)
- **Accent**: Mint green (#4ECDC4 / #6BCB77) for health/achievement metrics
- **Background**: Warm white (#F8F7FC / #F5F3FA)
- **Cards**: White (#FFFFFF), border-radius 16px, soft shadows
- **Text**: Dark gray (#2D2B3A) primary, medium gray (#7C7A8C) secondary
- **Borders**: Light purple-gray (#E8E6F0), minimal usage
- **Shadows**: Soft low-saturation drop shadows instead of hard borders
- **Icons**: Linear rounded style (lucide-react)
- **Typography**: Modern friendly sans-serif, clear weight hierarchy
- **Data viz**: Soft gradient bars, ring progress, smooth line charts

## Layout Framework (Cloudbrand)

Reference: https://dribbble.com/shots/26064917-Cloudbrand-Dashboard-AI-Health-Tracker-SaaS

- Two-panel layout: left sidebar (chat) + main content area (dashboard)
- Card grid in main content: 3-column top row, 2-column middle, 1-column bottom (AI insights)

## Dashboard Content (WellTrack)

Reference: https://dribbble.com/shots/25899288-WellTrack-Your-Health-Visualized

- Four pillars: Training / Recovery / Nutrition / Progress + AI Insights
