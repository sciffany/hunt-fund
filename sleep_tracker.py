#!/usr/bin/env python3
"""Sleep accountability tracker.

Logs the latest mouse/keyboard activity between 8pm and 8am (local time)
to a Supabase table so a partner/roommate can hold you accountable.

Events logged:
    app_start  - when the tracker process starts (always, regardless of window)
    activity   - the timestamp of the most recent mouse/keyboard event,
                 flushed at most once every FLUSH_INTERVAL_SECONDS while inside
                 the tracking window
    app_close  - when the tracker process shuts down cleanly (always)

The tracker only reads whether input happened, never what keys were pressed.
"""

from __future__ import annotations

import atexit
import logging
import os
import signal
import sys
import threading
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from pynput import keyboard, mouse
from supabase import Client, create_client

load_dotenv()

try:
    sys.stdout.reconfigure(line_buffering=True)
except AttributeError:
    pass


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"error: environment variable {name} is required", file=sys.stderr)
        sys.exit(2)
    return value


SUPABASE_URL = _require_env("SUPABASE_URL")
SUPABASE_KEY = _require_env("SUPABASE_KEY")
USER_NAME = os.environ.get("USER_NAME") or os.uname().nodename
TABLE_NAME = os.environ.get("SLEEP_TRACKER_TABLE", "sleep_events")

# Local-time window during which activity events are recorded.
# Window wraps midnight when START > END.
WINDOW_START_HOUR = int(os.environ.get("WINDOW_START_HOUR", "20"))  # 8pm
WINDOW_END_HOUR = int(os.environ.get("WINDOW_END_HOUR", "8"))       # 8am

# Max frequency for writing "activity" rows. We only ever record the *latest*
# activity timestamp seen in the last interval, so we get one row per interval
# during which the user was active.
FLUSH_INTERVAL_SECONDS = int(os.environ.get("FLUSH_INTERVAL_SECONDS", "30"))

LOG_FILE = os.environ.get("SLEEP_TRACKER_LOG")

# Route logs to stdout (so launchd's StandardOutPath gets them) unless a
# specific file is requested via SLEEP_TRACKER_LOG.
_handlers: list[logging.Handler] = (
    [logging.FileHandler(LOG_FILE)] if LOG_FILE else [logging.StreamHandler(sys.stdout)]
)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=_handlers,
    force=True,
)
log = logging.getLogger("sleep_tracker")


def in_window(now_local: datetime) -> bool:
    """Return True if `now_local` falls inside the configured tracking window."""
    h = now_local.hour
    if WINDOW_START_HOUR <= WINDOW_END_HOUR:
        return WINDOW_START_HOUR <= h < WINDOW_END_HOUR
    return h >= WINDOW_START_HOUR or h < WINDOW_END_HOUR


class ActivityTracker:
    def __init__(self, supabase: Client, session_id: str) -> None:
        self.supabase = supabase
        self.session_id = session_id
        self._lock = threading.Lock()
        self._last_activity: datetime | None = None
        self._last_flushed: datetime | None = None
        self.stop_event = threading.Event()

    def on_activity(self, *_args, **_kwargs) -> None:
        # Called from pynput listener threads on every mouse/key event.
        # Keep this hot path trivial; the flush loop does the DB work.
        ts = datetime.now(timezone.utc)
        with self._lock:
            self._last_activity = ts

    def log_event(self, event_type: str, event_time: datetime | None = None) -> None:
        event_time = event_time or datetime.now(timezone.utc)
        payload = {
            "user_name": USER_NAME,
            "event_type": event_type,
            "event_time": event_time.isoformat(),
            "session_id": self.session_id,
        }
        try:
            self.supabase.table(TABLE_NAME).insert(payload).execute()
            log.info("logged %s at %s", event_type, event_time.isoformat())
        except Exception as exc:  # network / auth / schema errors
            log.error("failed to log %s: %s", event_type, exc)

    def flush_loop(self) -> None:
        while not self.stop_event.is_set():
            if in_window(datetime.now()):
                with self._lock:
                    latest = self._last_activity
                if latest is not None and (
                    self._last_flushed is None or latest > self._last_flushed
                ):
                    self.log_event("activity", latest)
                    self._last_flushed = latest
            self.stop_event.wait(FLUSH_INTERVAL_SECONDS)


def main() -> None:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    session_id = str(uuid.uuid4())
    tracker = ActivityTracker(supabase, session_id)

    log.info(
        "sleep_tracker starting user=%s session=%s window=%02d:00-%02d:00 flush=%ds",
        USER_NAME,
        session_id,
        WINDOW_START_HOUR,
        WINDOW_END_HOUR,
        FLUSH_INTERVAL_SECONDS,
    )
    tracker.log_event("app_start")

    # Ensure app_close fires exactly once, whether we exit via signal,
    # atexit, or an exception in the main loop.
    closed = threading.Event()

    def close_once() -> None:
        if closed.is_set():
            return
        closed.set()
        tracker.log_event("app_close")
        tracker.stop_event.set()

    def handle_signal(signum, _frame) -> None:
        log.info("received signal %s, shutting down", signum)
        close_once()
        sys.exit(0)

    atexit.register(close_once)
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, handle_signal)

    mouse_listener = mouse.Listener(
        on_move=tracker.on_activity,
        on_click=tracker.on_activity,
        on_scroll=tracker.on_activity,
    )
    keyboard_listener = keyboard.Listener(on_press=tracker.on_activity)
    mouse_listener.start()
    keyboard_listener.start()

    try:
        tracker.flush_loop()
    finally:
        close_once()
        mouse_listener.stop()
        keyboard_listener.stop()


if __name__ == "__main__":
    main()
