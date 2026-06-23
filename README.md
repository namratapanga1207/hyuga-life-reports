# Hyuga Life — Nutritionist Reports

Web app that replaces the [Google Colab notebook](https://colab.research.google.com/drive/1vTe5ioqe1zTch346T3eC5vSRoRn4SVqh?usp=sharing) for Hyuga Life nutritionist reporting.

## Reports

| Tab | What it does |
|-----|----------------|
| **Summary** | Monthly counts: Chat with Nutritionist clicks, Entry Point 1, Entry Point 2 |
| **Ticket dump** | Row-level tickets (January-style sheet): phone, link, first message, entry point, tags |

**Only filter:** start date and end date (IST).

## Stack

- **Frontend:** Next.js (React)
- **Backend:** Vercel serverless API routes → ClickHouse
- **Account:** Hyuga Life `28052` (override via `HYUGA_ACCOUNT_ID`)

## Local setup

```bash
npm install
cp .env.example .env.local
# fill ClickHouse credentials
npm run dev
```

Open http://localhost:3000

## Vercel deploy

1. Push this repo to GitHub
2. Import in [Vercel](https://vercel.com/new)
3. Set environment variables:
   - `CLICKHOUSE_HOST`
   - `CLICKHOUSE_PORT` (default `8443`)
   - `CLICKHOUSE_USER`
   - `CLICKHOUSE_PASSWORD`
   - `HYUGA_ACCOUNT_ID` (optional, default `28052`)

## API

```
GET /api/summary?start_date=2026-01-01&end_date=2026-01-31
GET /api/tickets?start_date=2026-01-01&end_date=2026-01-31
GET /api/health
```

## Colab origin

The original notebook read `april.csv` / `may.csv` from Google Drive and exported Excel files. This app uses the same business logic via ClickHouse SQL (validated against the Google Sheet reports).
