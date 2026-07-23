# Sleep Accountability Dashboard

Minimal Next.js dashboard that reads `sleep_events` from Supabase and shows,
per night, how late each person stayed up past their bedtime.

- **Rows** — nights (anchored to their evening date in Singapore time)
- **Columns** — sample, tiffany, sophia, yipin
- **Cells** — the latest activity timestamp past that person's bedtime,
  rounded **up** to the nearest half-hour (blank if they made it to bed on
  time)
- **Total half-hours** — sum of half-hours past bedtime per person
- **Owed (SGD)** — half-hours × 1.50 SGD

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

- Data comes straight from `sleep_events` via the Supabase REST API — no
  extra schema needed beyond what's already in `../schema.sql`.
- A "night" is anchored to the date its evening starts (SGT). Anything before
  noon SGT rolls into the previous night's row.
- Rounding is strictly *up* to the next 30-minute mark, so anyone still active
  past their bedtime is on the hook for at least one half-hour.
