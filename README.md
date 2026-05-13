# Market Metrics Dashboard

Bloomberg-style market dashboard for a single user. React + Vite + Tailwind on Vercel, data pre-computed in Supabase Postgres by edge functions on `pg_cron`. The frontend never calls third-party APIs — it only reads from the database.

## Phase 1 widgets

- [x] **Macro Monitor** — FRED economic KPIs, refreshed twice daily
- [ ] Should I Trade? — Market Quality Score
- [ ] Breadth Metrics — % above MAs, new highs/lows
- [ ] Stage Analysis — Stage 2 stocks
- [ ] Sector Pulse + RRG

## Architecture

```
React (Vercel)  →  Postgres views (Supabase)  ←  Edge Functions (pg_cron)  →  FRED / Finviz / Yahoo
```

## Environment variables

Set these in **Vercel → Project Settings → Environment Variables** (Production + Preview + Development):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://xwjjrxdsegakshpxzfhi.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon **public** key (Supabase → Project Settings → API) |

For local dev, copy `.env.example` to `.env` and paste the values.

## Backend (already deployed)

- Tables: `macro_series_meta`, `macro_observations`, `app_config`
- View: `macro_monitor_v` (what the frontend reads)
- Edge function: `fetch-fred`
- Cron: `fetch-fred-twice-daily` (06:00 + 22:00 UTC)
- RLS: anon can only SELECT data views; secrets (`app_config`) are service-role only.

## Local dev

```bash
npm install
cp .env.example .env  # then paste the anon key
npm run dev
```

## Deploy

Push to `main`. Vercel auto-builds. Done.
