## Agent skills

### Issue tracker

Issues live as GitHub issues on `sciffany/hunt-fund`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five default roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Cloud agent

On boot, Postgres is up and the Next.js app in `app/` listens on port 3000. Sign in as Dev Owner or Dev Member. Gitignored `app/.env` and the repo-root `.env` are already filled in; the tracker user is `devowner`.

`dashboard/` dependencies are installed. Serving that app needs `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Building `android/` needs an Android SDK.
