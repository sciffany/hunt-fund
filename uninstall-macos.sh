#!/usr/bin/env bash
set -euo pipefail

LABEL="com.sleeptracker.agent"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "removed $PLIST_PATH"
else
    echo "no plist at $PLIST_PATH (nothing to remove)"
fi
