# Group Fund app

Standalone Next.js app for Google sign-in, usernames, and groups. People join a group only after they accept an invite.

This is separate from [`../dashboard`](../dashboard): its own Neon database, no shared auth, no comic dashboard styling.

## Stack

- Next.js 15 (App Router)
- Prisma + Neon Postgres
- Auth.js (Google)

## Setup

1. Create a [Neon](https://neon.tech) project and copy the pooled and direct connection strings.
2. Create a Google OAuth client (Web application). Authorized redirect URI:

   `http://localhost:3000/api/auth/callback/google`

3. Configure env:

   ```bash
   cp .env.example .env.local
   ```

   Fill in:

   - `DATABASE_URL` — Neon pooled URL
   - `DIRECT_URL` — Neon direct URL (used by `prisma migrate`)
   - `INGEST_TOKEN` — shared secret the Android and desktop trackers send as `Authorization: Bearer`
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
   - `AUTH_URL` — `http://localhost:3000`

4. Install and migrate:

   ```bash
   npm install
   npx prisma migrate dev
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

   Phone and desktop trackers POST to `/api/ingest/sleep` and
   `/api/ingest/steps` with `Authorization: Bearer $INGEST_TOKEN`. The
   username in the body must match a hunt-fund account. Sleep event types
   are stored as Prisma enums (`PHONE_SESSION_START`, `PHONE_SESSION_END`,
   `PHONE_ACTIVITY`, `ACTIVITY`, …). Phone last-activity is computed when
   you refresh a night: sessions under 1 minute are dropped.

   In `next dev` only, the sign-in page also offers **Dev Owner** and **Dev
   Member**. Those create two local users and a sample group (`Dev Sleep Club`)
   so you can click through the app without Google. The buttons and provider
   are disabled in production builds.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Generate Prisma client and build |
| `npm run db:migrate` | Create / apply Prisma migrations |
| `npm run db:push` | Push schema without a migration (dev only) |
| `npm run db:studio` | Prisma Studio |

## Deploy (Vercel)

1. Import the `hunt-fund` repo.
2. Set the root directory to `app`.
3. Add the same environment variables (Production + Preview).
4. Set `AUTH_URL` to the Vercel URL and add that origin’s Google callback:

   Production: `https://groupfundz.vercel.app`

   `https://groupfundz.vercel.app/api/auth/callback/google`
