# Market Metrics Dashboard

**A "should I trade today?" decision tool — live at [market-metrics-dashboard.vercel.app](https://market-metrics-dashboard.vercel.app)**

### The question
Before risking capital, a discretionary trader asks the same thing every morning: *is the
broad market environment favorable right now, and if so, where is the strength?* Answering it
normally means bouncing between half a dozen sites for macro data, breadth, and sector rotation
— slow, and easy to skip on a busy open.

### What I built
A single-screen market terminal that turns that scattered routine into one read. It rolls four
independent signals into a **"Should I Trade?" market-quality score**:

- **Macro** — key FRED economic series
- **Breadth** — % of names above moving averages, new highs vs lows
- **Stage analysis** — Weinstein Stage 1–4 classification
- **Sector rotation** — relative strength across sectors

So the go/no-go call and the where-to-look call take seconds instead of a morning.

### The engineering decision that matters
The front end **never calls a third-party API at runtime.** A scheduled Supabase pipeline (edge
functions on `pg_cron`) pulls FRED / Finviz / Yahoo into **Postgres views** on a fixed cadence;
React reads only those pre-computed views. That keeps the dashboard fast, resilient to upstream
outages, and free of API keys in the browser — and it means the analytics logic lives in SQL,
where it's testable, not scattered through UI code.

### What it demonstrates
A full path from raw third-party data → scheduled ETL → modeled Postgres views (with row-level
security) → a decision-support UI. Data engineering and analytics judgment, not just a chart.

### Limitations & next
Single-user tool, not financial advice; signals are descriptive, not predictive. Next: alerting
when the quality score crosses thresholds, and a backtest of the score vs forward returns.

---

## Technical setup

**Architecture**
```
React (Vercel)  →  Postgres views (Supabase)  ←  Edge Functions (pg_cron)  →  FRED / Finviz / Yahoo
```

**Environment variables** — set in Vercel → Project Settings → Environment Variables (Production + Preview + Development):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://xwjjrxdsegakshpxzfhi.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon **public** key (Supabase → Project Settings → API) |

For local dev, copy `.env.example` to `.env` and paste the values.

**Backend (deployed)** — tables `macro_series_meta`, `macro_observations`; view `macro_monitor_v` (what the frontend reads); edge function `fetch-fred`; cron `fetch-fred-twice-daily` (06:00 + 22:00 UTC); RLS so anon can only SELECT data views.

**Local dev**
```bash
npm install
cp .env.example .env   # then paste the anon key
npm run dev
```

**Deploy** — push to `main`; Vercel auto-builds.
