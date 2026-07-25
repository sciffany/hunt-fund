# Sleep Accountability Dashboard

Minimal Next.js dashboard that reads the pre-aggregated `sleep_nights` table
from Supabase and shows, per night, how late each person stayed up past their
bedtime.

- **Rows** — nights (anchored to their evening date in Singapore time)
- **Columns** — sample, tiffany, sophia, yipin
- **Cells** — the latest activity timestamp past that person's bedtime,
  rounded **up** to the nearest half-hour (blank if they made it to bed on
  time)
- **Total half-hours** — sum of half-hours past bedtime per person
- **Owed (SGD)** — half-hours × 1.50 SGD
- **↻ beside a date** — recomputes that night by scanning the raw
  `sleep_events` for its SGT window and upserting one row per person into
  `sleep_nights`. The table (not the raw event stream) is the source of
  truth the dashboard renders from, so it isn't limited by PostgREST's
  per-request row cap.

Bedtimes (SGT):

| Person   | Bedtime  |
| -------- | -------- |
| sample   | 10:00 PM |
| tiffany  | 11:30 PM |
| sophia   |  1:00 AM |
| yipin    |  2:00 AM |

## Local development

```bash
cp .env.local.example .env.local
# fill in SUPABASE_URL and SUPABASE_ANON_KEY

npm install
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to a GitHub repo (either the whole `hunt/` repo with
   `dashboard/` as the project root, or just this folder on its own).
2. In Vercel, **Add New… → Project** and import the repo.
3. If you kept it inside `hunt/`, set the **Root Directory** to `dashboard`.
4. Add two environment variables (Production + Preview):
   - `SUPABASE_URL` — e.g. `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` — Supabase anon key (the same one the tracker uses is
     fine; the existing RLS policy already allows anon `SELECT`).
5. Click **Deploy**. Every request server-renders fresh data (no caching).

Or via the CLI:

```bash
npm i -g vercel
cd dashboard
vercel           # first-time link
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel --prod
```

## Notes

- The dashboard reads from `sleep_nights` (populated by clicking ↻).
  Recomputation and upsert happen in the `refreshNight` server action in
  `lib/actions.ts`, which uses the same Supabase env vars.
- A "night" is anchored to the date its evening starts (SGT). Anything before
  noon SGT rolls into the previous night's row.
- Rounding is strictly *up* to the next 30-minute mark, so anyone still active
  past their bedtime is on the hook for at least one half-hour.
- The last 14 nights always render, even if they haven't been refreshed yet,
  so there's always a ↻ button waiting to be clicked for a new night.
