# sleep_tracker

Tiny background agent that logs the latest mouse/keyboard activity between
8pm and 6am to the hunt-fund app (Neon via `/api/ingest/sleep`), so two
people can keep each other accountable for going to bed.

The tracker never records *what* keys are pressed — only *that* something
happened, plus the timestamp.

## What it logs

| event       | when                                                                   |
|-------------|------------------------------------------------------------------------|
| `app_start` | when the tracker starts (always)                                       |
| `activity`  | timestamp of most recent input, flushed at most every 30s, only in-window |
| `app_close` | when the tracker exits cleanly (always) — SIGTERM, SIGINT, or SIGHUP   |

Each event also carries a `session_id` (UUID per run) and a `user_name`
that must match a hunt-fund account username.

## Setup

### 1. hunt-fund

The desktop tracker POSTs to the Next.js ingest API, which writes
`SleepEvent` rows in Neon. You need:

- A deployed (or local) hunt-fund app — see [`app/README.md`](./app/README.md)
- The shared `INGEST_TOKEN` from that app's env
- A hunt-fund username that already exists (sign in once and pick it)

### 2. Configure

```bash
cp .env.example .env
# then edit .env with your APP_URL, INGEST_TOKEN, and USER_NAME
```

`USER_NAME` must match the hunt-fund account username (e.g. `"tiffany"`).

### 3. Install as a background service (macOS)

```bash
./install-macos.sh
```

That script:

1. Creates `.venv/` and installs `requirements.txt` into it.
2. Writes `~/Library/LaunchAgents/com.sleeptracker.agent.plist`.
3. Loads it with `launchctl`, which starts it now and every login.

On first launch macOS will prompt for **Accessibility** permission for
the Python binary. If it doesn't prompt, add it manually:

- System Settings → Privacy & Security → Accessibility
- `+` and select `<repo>/.venv/bin/python`
- Then: `launchctl kickstart -k gui/$(id -u)/com.sleeptracker.agent`

### 4. Verify

```bash
tail -F ~/Library/Logs/sleep_tracker.out.log ~/Library/Logs/sleep_tracker.err.log
```

`out.log` gets the app's own log lines; `err.log` gets Python tracebacks
if anything crashes. You should see an `app_start` line, then `activity`
lines every 30s while you move the mouse (after 8pm). In Neon / Prisma
Studio, new `SleepEvent` rows (`APP_START`, then `ACTIVITY`) should
appear for that user.

### Troubleshooting

- `HTTP 401` / `Invalid ingest token` — the `INGEST_TOKEN` in `.env`
  does not match the Next.js app's `INGEST_TOKEN`.
- `HTTP 404` / `Unknown username` — `USER_NAME` does not match a
  hunt-fund account. Sign in once and set the same username.
- `HTTP 503` / `Ingest is not configured` — the Next.js app is missing
  `INGEST_TOKEN`.
- `This process is not trusted! Input event monitoring will not be
  possible...` — you need to grant Accessibility to
  `<repo>/.venv/bin/python` (see step 3 above) and then
  `launchctl kickstart -k gui/$(id -u)/com.sleeptracker.agent`.

## Managing the agent (macOS)

```bash
# stop
launchctl unload ~/Library/LaunchAgents/com.sleeptracker.agent.plist

# start
launchctl load   ~/Library/LaunchAgents/com.sleeptracker.agent.plist

# restart
launchctl kickstart -k gui/$(id -u)/com.sleeptracker.agent

# status
launchctl list | grep com.sleeptracker.agent

# uninstall
./uninstall-macos.sh
```

Stopping the agent via `launchctl unload` sends SIGTERM, which fires
the `app_close` handler before the process exits — so intentional
shutdowns get logged.

## Windows

The Python script itself is cross-platform — `pynput` and the stdlib
HTTP client both support Windows. `install-windows.ps1` is the equivalent
of `install-macos.sh`: it creates the venv, installs `requirements.txt`,
writes a VBS wrapper, and registers a per-user scheduled task that
launches `pythonw.exe sleep_tracker.py` at every logon.

### 1. Prereqs

- Python 3.10+ from [python.org](https://www.python.org/downloads/windows/)
  (make sure "Add python.exe to PATH" is checked, or that the `py`
  launcher is available).
- A `.env` file in the repo root (`Copy-Item .env.example .env`, then
  edit `APP_URL`, `INGEST_TOKEN`, and `USER_NAME`).

### 2. Install

From an ordinary (non-admin) PowerShell in the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

That script:

1. Creates `.venv\` and installs `requirements.txt` into it.
2. Writes `run-sleep-tracker.vbs` next to the script — this is what
   the task actually launches (via `wscript.exe`), so nothing flashes
   a console window at logon.
3. Registers a scheduled task named `SleepTracker` under your user
   account with an "At log on" trigger, then starts it right away.

Unlike macOS, Windows does **not** require any Accessibility-style
permission for `pynput` to observe input — it uses low-level hooks.
Some antivirus tools may still flag it (it looks like a keylogger even
though only *that* input happened is recorded, never *what*).

### 3. Verify

Logs go to `%LOCALAPPDATA%\SleepTracker\sleep_tracker.log`:

```powershell
Get-Content -Wait "$env:LOCALAPPDATA\SleepTracker\sleep_tracker.log"
```

You should see an `app_start` line, then `activity` lines every 30s
while you move the mouse (after 8pm). In Neon / Prisma Studio, new
`SleepEvent` rows (`APP_START`, then `ACTIVITY`) should appear for
that user.

### 4. Managing the agent (Windows)

```powershell
# stop
Stop-ScheduledTask       -TaskName 'SleepTracker'

# start
Start-ScheduledTask      -TaskName 'SleepTracker'

# restart
Stop-ScheduledTask -TaskName 'SleepTracker'; Start-ScheduledTask -TaskName 'SleepTracker'

# status (LastRunTime, LastTaskResult, NextRunTime)
Get-ScheduledTask        -TaskName 'SleepTracker' | Get-ScheduledTaskInfo

# uninstall
powershell -ExecutionPolicy Bypass -File .\uninstall-windows.ps1
```

`Stop-ScheduledTask` only stops the `wscript.exe` wrapper — the
detached `pythonw.exe` child keeps running. `uninstall-windows.ps1`
kills any leftover `pythonw.exe sleep_tracker.py` processes as well
as removing the task and the VBS wrapper. To stop the agent without
uninstalling, kill it directly:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe'" |
    Where-Object { $_.CommandLine -match 'sleep_tracker.py' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### Troubleshooting (Windows)

- `<urlopen error unknown url type: https>` — Python never registered
  HTTPS. Typical causes: Microsoft Store Python, a venv whose OpenSSL
  DLLs are not next to `pythonw.exe`, or a system HTTPS proxy (Clash /
  VPN / "automatically detect settings"). Copy the updated
  `sleep_tracker.py` onto the machine and rerun
  `install-windows.ps1` (it copies `libssl`/`libcrypto` into
  `.venv\Scripts` and bypasses the WinINET proxy). If it still fails,
  install Python from [python.org](https://www.python.org/downloads/windows/),
  delete `.venv`, and rerun the installer.
- No log file appears — the task ran but Python crashed before
  configuring logging. Check the task's `LastTaskResult` via
  `Get-ScheduledTask 'SleepTracker' | Get-ScheduledTaskInfo`. Then run
  the script in the foreground to see the traceback:
  `.\.venv\Scripts\python.exe .\sleep_tracker.py`
- `app_close` never appears at shutdown — Windows terminates
  `pythonw.exe` on logoff without a chance to run `atexit`, so clean
  shutdowns aren't always logged. `app_start` at the next logon is the
  reliable signal that the previous session ended.
- `Register-ScheduledTask : Access is denied` — you're trying to
  register under a different user. The install script scopes the task
  to `$env:USERNAME`; run it from the account that will actually be
  logging in.

## Android

Companion Android app in [`android/`](./android/). It runs a foreground
service that POSTs one `PHONE_ACTIVITY` row to the hunt-fund ingest API
(`/api/ingest/sleep`) every 2 minutes while the phone is unlocked with
the screen on, only inside the local recording window (default 8pm–6am).
That event type is kept distinct from the desktop tracker's `ACTIVITY`
rows. Brief unlocks (checking the time, pocket wakes) that end before
the next tick are ignored.

`ACTION_SCREEN_ON` / `ACTION_SCREEN_OFF` / `ACTION_USER_PRESENT` are
still received so the in-app debug UI can show the service is alive;
none of those broadcasts are posted. They are protected system intents,
so a manifest-declared receiver never fires for them — the foreground
service exists to keep the runtime receiver and the 2-minute heartbeat
alive while the phone is idle.

### 1. Configure

```bash
cp android/local.properties.example android/local.properties
# then edit android/local.properties with your values:
#   app.url=https://groupfundz.vercel.app
#   ingest.token=...     # same INGEST_TOKEN as the Next.js app
#   user.name=tiffany    # must match the hunt-fund username
```

These are baked into `BuildConfig` at build time, so rebuild the APK if
you change `user.name` (e.g. installing on a second phone).

### 2. Build & install

Open `android/` in Android Studio and Run, or from the command line with
Android SDK + a device attached:

```bash
cd android
./gradlew installDebug
```

On first launch, tap **Start tracking** and accept the notification
permission prompt on Android 13+ (needed for the ongoing foreground-
service notification to show up; the service still runs either way).
Optionally tap **Enable step counting**: the app prefers **Google
Health Connect** (grant Steps + background read) so daily totals
include watches, Fit, Samsung Health, and on-device steps. If Health
Connect is missing, needs an update, or permission is denied, it falls
back to the phone's hardware step counter (`ACTIVITY_RECOGNITION` +
`TYPE_STEP_COUNTER`). The UI shows today's total and the active source;
at local midnight (and whenever you tap **Send steps**) the last 7
Health Connect days are POSTed to `/api/ingest/steps`. The app then
auto-restarts after reboot or a reinstall via a `BOOT_COMPLETED` /
`MY_PACKAGE_REPLACED` receiver.

### Security caveat

The ingest token is compiled into the APK. Anyone with the APK can
extract it. Treat `INGEST_TOKEN` like a write password for tracker rows.

## Running in the foreground (for testing)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python sleep_tracker.py
# Ctrl-C to log app_close and exit
```

## Env vars

| var                    | default        | notes                                       |
|------------------------|----------------|---------------------------------------------|
| `APP_URL`              | required       | hunt-fund origin, no trailing slash          |
| `INGEST_TOKEN`         | required       | same shared secret as the Next.js app       |
| `USER_NAME`            | hostname       | must match the hunt-fund account username    |
| `WINDOW_START_HOUR`    | `20`           | local-hour when activity logging turns on   |
| `WINDOW_END_HOUR`      | `6`            | local-hour when activity logging turns off  |
| `FLUSH_INTERVAL_SECONDS` | `30`         | max frequency of `activity` rows            |
| `SLEEP_TRACKER_LOG`    | stdout         | optional local log file path                |

## Querying who was up last night

Raw events land in Neon's `SleepEvent` table. The hunt-fund app reads
them; to inspect from SQL:

```sql
select u.username, e."eventType", e."eventTime"
from "SleepEvent" e
join "User" u on u.id = e."userId"
order by e."eventTime" desc
limit 20;
```

## Privacy notes

- Nothing about the *content* of input is captured, only the timestamps.
- The event stream reveals when you're at the keyboard, so treat the
  Neon tables like personal data (short retention is a good idea for
  anything shared beyond two trusted people).

