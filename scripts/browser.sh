#!/usr/bin/env bash
# The browser class's program: Chromium, full screen, on the display the desktop
# already started. Run as `sandbox-desktop browser`, so the X server, the window
# manager and the VNC pair are that script's business and this one only draws
# into them.
#
# A BROWSER IS A WINDOW, the way a phone is (avd.sh). The person watches it
# through the screen the fleet already serves (hanzoai/cloud apps/sandbox
# screen.go), and an agent drives it through the DevTools protocol on loopback:
# Playwright's `chromium.connectOverCDP("http://127.0.0.1:9222")`, run through
# the sandbox's exec. Both look at ONE Chromium, so what the agent does is what
# the person sees.
#
# LOOPBACK ONLY. A DevTools port is a remote control for every page the browser
# holds, cookies included, so it is bound to 127.0.0.1 and reached through exec
# like the VNC server is, never through the pod network.
#
# IT COMES BACK. A browser that crashes or is closed (a kiosk window has no close
# button, but `pkill chromium` does) is started again on the same profile, so the
# pane and the agent never face a display with nothing on it.
set -euo pipefail

PORT="${SANDBOX_CDP_PORT:-9222}"
PROFILE="${SANDBOX_BROWSER_PROFILE:-${HOME}/.browser}"
START="${SANDBOX_BROWSER_START:-about:blank}"
SCREEN="${SANDBOX_SCREEN:-1280x800x24}"
WIDTH="${SCREEN%%x*}"
REST="${SCREEN#*x}"
HEIGHT="${REST%%x*}"

log() { printf '[browser] %s\n' "$*" >&2; }

mkdir -p "${PROFILE}"
# A profile left by a browser that did not exit cleanly holds a lock naming a
# process that is gone, and Chromium then refuses to start on it.
rm -f "${PROFILE}/SingletonLock" "${PROFILE}/SingletonSocket" "${PROFILE}/SingletonCookie"

while :; do
  log "chromium on ${DISPLAY} at ${WIDTH}x${HEIGHT}, devtools on 127.0.0.1:${PORT}"
  chromium \
    --no-first-run \
    --no-default-browser-check \
    --disable-dev-shm-usage \
    --password-store=basic \
    --noerrdialogs \
    --hide-crash-restore-bubble \
    --disable-features=Translate \
    --kiosk \
    --window-position=0,0 \
    --window-size="${WIDTH},${HEIGHT}" \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="${PORT}" \
    --user-data-dir="${PROFILE}" \
    "${START}" || true
  log "chromium exited; starting it again"
  rm -f "${PROFILE}/SingletonLock" "${PROFILE}/SingletonSocket" "${PROFILE}/SingletonCookie"
  sleep 1
done
