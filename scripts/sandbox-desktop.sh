#!/usr/bin/env bash
# The desktop class's display. Starts a virtual screen, then becomes the same
# `sleep infinity` every other sandbox class runs.
#
# This is NOT a daemon in the sense the sandbox design forbids. Nothing started
# here accepts a command that runs code: X draws, openbox decorates,
# x0vncserver mirrors pixels and websockify carries RFB over WebSocket. Work
# still arrives only through the Kubernetes exec subresource.
#
# x0vncserver, NOT x11vnc, AND THE REASON IS A REAL BUG.
# hanzoai/operative found it and wrote it down in
# docker/image/.operative/x11vnc_startup.sh: x11vnc (LibVNCServer 0.9.13) peeks
# at the first byte of a new connection to tell WebSocket from RFB — but in RFB
# the SERVER speaks first, so a plain RFB client and x11vnc both wait for each
# other forever. Behind websockify, which is exactly this arrangement, that
# deadlock is the default outcome. TigerVNC's x0vncserver does not do the peek.
set -euo pipefail

DISPLAY_NUM="${SANDBOX_DISPLAY_NUM:-1}"
SCREEN="${SANDBOX_SCREEN:-1280x800x24}"
VNC_PORT="${SANDBOX_VNC_PORT:-5900}"
NOVNC_PORT="${SANDBOX_NOVNC_PORT:-6080}"
# Loopback by default. A sandbox's screen is reached by port-forward or by an
# ingress that terminates auth in front of it — never by binding 0.0.0.0 and
# hoping the NetworkPolicy is the only thing standing there.
LISTEN_HOST="${SANDBOX_LISTEN_HOST:-localhost}"
ENABLE_NOVNC="${SANDBOX_ENABLE_NOVNC:-1}"

export DISPLAY=":${DISPLAY_NUM}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-sandbox}"
mkdir -p "${XDG_RUNTIME_DIR}"
chmod 700 "${XDG_RUNTIME_DIR}"

log() { printf '[sandbox-desktop] %s\n' "$*" >&2; }

Xvfb "${DISPLAY}" -screen 0 "${SCREEN}" -ac -nolisten tcp &

# Wait for the server to actually answer before starting anything that needs
# it. Racing openbox against Xvfb is how a desktop pod comes up with no window
# manager and no error anyone ever sees.
for _ in $(seq 1 50); do
  if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
if ! xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
  log "X server never came up on ${DISPLAY}"
  exit 1
fi
log "X up on ${DISPLAY} (${SCREEN})"

openbox &

x0vncserver -display "${DISPLAY}" -rfbport "${VNC_PORT}" \
  -SecurityTypes None -localhost "$([ "${LISTEN_HOST}" = "localhost" ] && echo yes || echo no)" &
log "vnc on ${LISTEN_HOST}:${VNC_PORT}"

if [ "${ENABLE_NOVNC}" = "1" ]; then
  websockify --web /usr/share/novnc "${LISTEN_HOST}:${NOVNC_PORT}" \
    "localhost:${VNC_PORT}" &
  log "novnc on ${LISTEN_HOST}:${NOVNC_PORT}"
fi

# The pod's command, same as every other class.
#
# SANDBOX_TTL_SECONDS is the run's budget, and honouring it here is what lets a
# desktop container self-destruct exactly like a headless one — where the runner
# passes `sleep <ttl>` as the command outright. Unset means `infinity`, which is
# the Kubernetes case: there the pod's lifetime is the control plane's business
# and a container that outlives its own timer would just be a second, disagreeing
# opinion about when the run ends.
exec sleep "${SANDBOX_TTL_SECONDS:-infinity}"
