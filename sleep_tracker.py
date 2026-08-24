#!/usr/bin/env python3
"""Sleep accountability tracker.

Logs the latest mouse/keyboard activity between 8pm and 6am (local time)
to the hunt-fund ingest API (Neon via Prisma) so a partner/roommate can
hold you accountable.

Events logged:
    app_start  - when the tracker process starts (always, regardless of window)
    activity   - the timestamp of the most recent mouse/keyboard event,
                 flushed at most once every FLUSH_INTERVAL_SECONDS while inside
                 the tracking window
    app_close  - when the tracker process shuts down cleanly (always)

The tracker only reads whether input happened, never what keys were pressed.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import NoReturn

# pythonw.exe from Task Scheduler has a stripped PATH, so OpenSSL's DLLs
# (next to the *base* interpreter, not the venv) are not found. `_ssl` then
# fails to import, urllib silently omits HTTPSHandler, and urlopen(https://...)
# raises URLError: unknown url type: https. Fix the search path before any
# import that pulls in ssl/urllib.
#
# The handles from os.add_dll_directory MUST be kept alive. Discarding them
# immediately removes the directory from the search path (the returned object
# unregisters itself on GC / refcount 0). PATH is also not searched for
# extension-module deps on Python 3.8+, so this is the actual fix.
_WINDOWS_DLL_DIRS: list[object] = []


def _prepare_windows_ssl() -> None:
    if sys.platform != "win32":
        return
    dirs: list[str] = []

    def _add(raw: str | None) -> None:
        if not raw:
            return
        path = os.path.normpath(raw)
        if path not in dirs and os.path.isdir(path):
            dirs.append(path)

    cfg = Path(sys.prefix) / "pyvenv.cfg"
    if cfg.is_file():
        for line in cfg.read_text(encoding="utf-8", errors="replace").splitlines():
            key, _, value = line.partition("=")
            key = key.strip().lower()
            value = value.strip().strip('"')
            if key == "home":
                _add(value)
            elif key == "executable":
                _add(str(Path(value).parent))
    _add(getattr(sys, "base_prefix", None))
    _add(sys.prefix)
    _add(str(Path(sys.executable).resolve().parent))

    # python.org: libssl next to python.exe; _ssl.pyd in DLLs\.
    # conda: OpenSSL in Library\bin.
    for base in list(dirs):
        _add(os.path.join(base, "DLLs"))
        _add(os.path.join(base, "Library", "bin"))

    add_dll = getattr(os, "add_dll_directory", None)
    for directory in dirs:
        if add_dll is not None:
            try:
                _WINDOWS_DLL_DIRS.append(add_dll(directory))
            except OSError:
                pass
    if dirs:
        os.environ["PATH"] = os.pathsep.join(dirs) + os.pathsep + os.environ.get("PATH", "")


def _die(message: str, code: int = 2) -> NoReturn:
    # pythonw.exe has no console; sys.stderr is None. Write to the log file
    # the VBS wrapper sets so the error is not silent.
    stream = sys.stderr if sys.stderr is not None else sys.stdout
    if stream is not None:
        print(message, file=stream)
    else:
        log_path = os.environ.get("SLEEP_TRACKER_LOG")
        if log_path:
            try:
                with open(log_path, "a", encoding="utf-8") as fh:
                    fh.write(message + "\n")
            except OSError:
                pass
    raise SystemExit(code)


_prepare_windows_ssl()

try:
    import ssl
except ImportError:
    _die(
        "error: this Python has no SSL support, so HTTPS ingest cannot work. "
        "On Windows install Python from python.org (not the Microsoft Store), "
        "delete .venv, and rerun install-windows.ps1."
    )

import atexit
import http.client
import importlib
import json
import logging
import signal
import socket
import threading
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

# sitecustomize / a .pth file may have imported urllib before OpenSSL was
# searchable, in which case HTTPSHandler is missing even though `ssl` works.
if not hasattr(http.client, "HTTPSConnection") or not hasattr(
    urllib.request, "HTTPSHandler"
):
    importlib.reload(http.client)
    importlib.reload(urllib.request)
if not hasattr(urllib.request, "HTTPSHandler"):
    _die(
        "error: urllib has no HTTPS support. "
        "On Windows install Python from python.org (not the Microsoft Store), "
        "delete .venv, and rerun install-windows.ps1."
    )

from dotenv import load_dotenv
from pynput import keyboard, mouse

load_dotenv(Path(__file__).resolve().parent / ".env")

# Under pythonw.exe on Windows, sys.stdout / sys.stderr are None. Guard the
# line-buffering tweak so the process doesn't crash before logging is set up.
if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except AttributeError:
        pass


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        _die(f"error: environment variable {name} is required")
    return value


def _require_app_url() -> str:
    value = _require_env("APP_URL").strip().rstrip("/")
    if not value.startswith(("https://", "http://")):
        _die(f"error: APP_URL must be an http(s) origin, got {value[:40]!r}")
    return value


APP_URL = _require_app_url()
INGEST_TOKEN = _require_env("INGEST_TOKEN")

# Direct connection. Windows otherwise injects IE/WinINET proxy settings
# (Clash, VPNs, "automatically detect settings"), and urllib then tries to
# open an https proxy URL — which is the other common source of
# "unknown url type: https" when SSL did not load.
_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPSHandler(context=ssl.create_default_context()),
)
urllib.request.install_opener(_OPENER)
USER_NAME = os.environ.get("USER_NAME") or socket.gethostname()

# Local-time window during which activity events are recorded.
# Window wraps midnight when START > END.
WINDOW_START_HOUR = int(os.environ.get("WINDOW_START_HOUR", "20"))  # 8pm
WINDOW_END_HOUR = int(os.environ.get("WINDOW_END_HOUR", "6"))       # 6am

# Max frequency for writing "activity" rows. We only ever record the *latest*
# activity timestamp seen in the last interval, so we get one row per interval
# during which the user was active.
FLUSH_INTERVAL_SECONDS = int(os.environ.get("FLUSH_INTERVAL_SECONDS", "30"))

LOG_FILE = os.environ.get("SLEEP_TRACKER_LOG")

# Route logs to a file if SLEEP_TRACKER_LOG is set, else to stdout (so launchd's
# StandardOutPath picks them up). Under pythonw.exe on Windows sys.stdout is
# None, so fall back to a NullHandler to avoid crashing at import time — set
# SLEEP_TRACKER_LOG in the scheduled task to actually get logs on Windows.
if LOG_FILE:
    _handlers: list[logging.Handler] = [logging.FileHandler(LOG_FILE)]
elif sys.stdout is not None:
    _handlers = [logging.StreamHandler(sys.stdout)]
else:
    _handlers = [logging.NullHandler()]
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
    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self._lock = threading.Lock()
        self._last_activity: datetime | None = None
        self._last_flushed: datetime | None = None
        self.stop_event = threading.Event()

    def on_activity(self, *_args, **_kwargs) -> None:
        # Called from pynput listener threads on every mouse/key event.
        # Keep this hot path trivial; the flush loop does the network work.
        ts = datetime.now(timezone.utc)
        with self._lock:
            self._last_activity = ts

    def log_event(self, event_type: str, event_time: datetime | None = None) -> None:
        event_time = event_time or datetime.now(timezone.utc)
        payload = {
            "username": USER_NAME,
            "eventType": event_type,
            "eventTime": event_time.isoformat(),
            "sessionId": self.session_id,
        }
        request = urllib.request.Request(
            f"{APP_URL}/api/ingest/sleep",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {INGEST_TOKEN}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with _OPENER.open(request, timeout=15) as response:
                response.read()
            log.info("logged %s at %s", event_type, event_time.isoformat())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:200]
            log.error("failed to log %s: HTTP %s %s", event_type, exc.code, body)
        except Exception as exc:  # network / auth / schema errors
            extra = ""
            if "unknown url type: https" in str(exc):
                extra = (
                    "  (Python never registered HTTPS. Install Python from "
                    "python.org, delete .venv, and rerun install-windows.ps1)"
                )
            log.error("failed to log %s: %s%s", event_type, exc, extra)

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
    session_id = str(uuid.uuid4())
    tracker = ActivityTracker(session_id)

    log.info(
        "sleep_tracker starting user=%s session=%s window=%02d:00-%02d:00 flush=%ds ssl=%s",
        USER_NAME,
        session_id,
        WINDOW_START_HOUR,
        WINDOW_END_HOUR,
        FLUSH_INTERVAL_SECONDS,
        getattr(ssl, "OPENSSL_VERSION", "unknown"),
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
