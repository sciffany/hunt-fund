#!/usr/bin/env bash
# Install sleep_tracker as a per-user LaunchAgent on macOS.
# Idempotent: rerun it after editing .env or the script.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.sleeptracker.agent"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"

cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
    echo "no .env file found in $SCRIPT_DIR" >&2
    echo "copy .env.example to .env and fill it in first:" >&2
    echo "    cp .env.example .env" >&2
    exit 1
fi

if [ ! -d .venv ]; then
    echo "creating virtualenv at .venv..."
    python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
deactivate

mkdir -p "$PLIST_DIR" "$LOG_DIR"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$SCRIPT_DIR/.venv/bin/python</string>
        <string>$SCRIPT_DIR/sleep_tracker.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$SCRIPT_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>30</integer>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PYTHONUNBUFFERED</key>
        <string>1</string>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/sleep_tracker.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/sleep_tracker.err.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load -w "$PLIST_PATH"

cat <<INFO

sleep_tracker installed.
  plist:  $PLIST_PATH
  stdout: $LOG_DIR/sleep_tracker.out.log
  stderr: $LOG_DIR/sleep_tracker.err.log

First run needs Accessibility permission for the Python binary so pynput
can observe input events. macOS will usually prompt; if it doesn't, open

  System Settings > Privacy & Security > Accessibility

click "+" and add:

  $SCRIPT_DIR/.venv/bin/python

Then run:  launchctl kickstart -k gui/\$(id -u)/$LABEL

Useful commands:
  stop:     launchctl unload "$PLIST_PATH"
  start:    launchctl load   "$PLIST_PATH"
  restart:  launchctl kickstart -k gui/\$(id -u)/$LABEL
  status:   launchctl list | grep $LABEL
  tail log: tail -F "$LOG_DIR/sleep_tracker.out.log"
INFO
