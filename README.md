# sleep_tracker

Tiny background agent that logs the latest mouse/keyboard activity between
8pm and 6am to a shared Supabase table, so two people can keep each other
accountable for going to bed.

The tracker never records *what* keys are pressed — only *that* something
happened, plus the timestamp.

## What it logs

| event       | when                                                                   |
|-------------|------------------------------------------------------------------------|
| `app_start` | when the tracker starts (always)                                       |
| `activity`  | timestamp of most recent input, flushed at most every 30s, only in-window |
| `app_close` | when the tracker exits cleanly (always) — SIGTERM, SIGINT, or SIGHUP   |

Each event also carries a `session_id` (UUID per run) and a `user_name`
so both people writing into the same table are distinguishable.

## Setup

### 1. Supabase

Create a Supabase project (or use an existing one). In the SQL editor,
run [`schema.sql`](./schema.sql). It creates a `sleep_events` table
(raw event stream) and a `sleep_nights` table (per-night summary that
the dashboard reads from and its refresh button writes to), plus indexes
and RLS policies that let the anon key insert/read/update. The file is
safe to re-run and will migrate installs where `sleep_nights` was
previously exposed as a view.

Grab the project URL and anon key from Project Settings → API.

### 2. Configure

```bash
cp .env.example .env
# then edit .env with your SUPABASE_URL, SUPABASE_KEY, and USER_NAME
```

`USER_NAME` should be different on each machine (e.g. `"alex"` and `"sam"`).

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
lines every 30s while you move the mouse (after 8pm). In Supabase,
`select * from sleep_events order by event_time desc limit 20;` should
show the rows.

### Troubleshooting

- `HTTP/2 401 Unauthorized` / `Invalid API key` — the `SUPABASE_KEY` in
  `.env` is wrong or truncated. Copy the full `anon` `public` key from
  Supabase → Project Settings → API.
- `relation "sleep_events" does not exist` — you haven't run
  `schema.sql` yet. Paste it into the Supabase SQL editor.
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

The Python script itself is cross-platform — `pynput` and `supabase-py`
both support Windows. `install-windows.ps1` is the equivalent of
`install-macos.sh`: it creates the venv, installs `requirements.txt`,
writes a VBS wrapper, and registers a per-user scheduled task that
launches `pythonw.exe sleep_tracker.py` at every logon.

### 1. Prereqs

- Python 3.10+ from [python.org](https://www.python.org/downloads/windows/)
  (make sure "Add python.exe to PATH" is checked, or that the `py`
  launcher is available).
- A `.env` file in the repo root (`Copy-Item .env.example .env`, then
  edit `SUPABASE_URL`, `SUPABASE_KEY`, and `USER_NAME`).

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
while you move the mouse (after 8pm). In Supabase,
`select * from sleep_events order by event_time desc limit 20;` should
show the rows.

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
service that listens for the system broadcasts

- `ACTION_SCREEN_ON`
- `ACTION_SCREEN_OFF`
- `ACTION_USER_PRESENT`

and POSTs one `phone_activity` row to `sleep_events` per broadcast — a
phone-specific event type kept distinct from the desktop tracker's
`activity` rows so the two sources can be filtered separately. The
dashboard's `maxActivityFor` treats both types as "user was active", so
phone events count toward "last activity" out of the box.

All three broadcasts are protected system intents, so a manifest-declared
receiver never fires for them; the foreground service exists to keep our
runtime-registered receiver alive while the phone is idle.

### 1. Configure

```bash
cp android/local.properties.example android/local.properties
# then edit android/local.properties with your values:
#   supabase.url=...
#   supabase.key=...
#   user.name=alex-phone
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
The app then auto-restarts after reboot or a reinstall via a
`BOOT_COMPLETED` / `MY_PACKAGE_REPLACED` receiver.

Verify with `select * from sleep_events where user_name = 'alex-phone'
order by event_time desc limit 20;` in the Supabase SQL editor — you
should see a new row every time you press the power button or unlock
the phone.

### Security caveat

The Supabase anon key is compiled into the APK. Anyone with the APK can
extract it. This is the same trust level as `.env` on the desktop
tracker — fine when RLS on `sleep_events` limits the anon role to
insert/select on this one table, but worth calling out.

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
| `SUPABASE_URL`         | required       | project URL                                 |
| `SUPABASE_KEY`         | required       | anon or service_role key                    |
| `USER_NAME`            | hostname       | how this machine appears in the DB          |
| `SLEEP_TRACKER_TABLE`  | `sleep_events` | table name                                  |
| `WINDOW_START_HOUR`    | `20`           | local-hour when activity logging turns on   |
| `WINDOW_END_HOUR`      | `6`            | local-hour when activity logging turns off  |
| `FLUSH_INTERVAL_SECONDS` | `30`         | max frequency of `activity` rows            |
| `SLEEP_TRACKER_LOG`    | stdout         | optional local log file path                |

## Querying who was up last night

```sql
select user_name, night, last_activity
from sleep_nights
where night = current_date - 1
order by last_activity desc;
```

`sleep_nights` is populated by the dashboard's per-row refresh button, so
a `night` only appears after someone has clicked ↻ for it (or you've
inserted a row manually). To recompute from raw events directly in SQL:

```sql
insert into sleep_nights (user_name, night, last_activity, updated_at)
select
    user_name,
    (date_trunc('day', event_time - interval '12 hours'))::date as night,
    max(event_time) filter (where event_type in ('activity', 'phone_activity')) as last_activity,
    now()
from sleep_events
where event_time >= (current_date - 1)::timestamptz + interval '12 hours'
  and event_time <  (current_date    )::timestamptz + interval '12 hours'
group by 1, 2
on conflict (user_name, night)
do update set
    last_activity = excluded.last_activity,
    updated_at    = excluded.updated_at;
```

## Privacy notes

- Nothing about the *content* of input is captured, only the timestamps.
- The event stream reveals when you're at the keyboard, so treat the
  Supabase table like personal data (RLS + short retention are a good
  idea for anything shared beyond two trusted people).
