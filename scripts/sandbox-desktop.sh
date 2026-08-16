#!/usr/bin/env bash
# The desktop class's display. Starts a virtual screen, then becomes the same
# `sleep infinity` every other sandbox class runs.
#
# NOTHING STARTED HERE LISTENS FOR WORK, which is the property the sandbox
# design asks for. X draws, openbox decorates, hsetroot paints, X0tigervnc
# mirrors pixels and websockify carries RFB over WebSocket — and every one of
# them binds loopback, so the only route to any of it is the exec subresource
# hanzoai/cloud reads the screen over.
#
# The terminal is a shell and a shell runs code, so it is worth saying whose:
# it is reachable only by drawing on this display, and the caller who can do
# that is the one holding a ticket for this sandbox's screen — who can already
# run anything here through the exec channel. A desktop with a terminal on it
# grants no authority a desktop without one withholds.
#
# TigerVNC, NOT x11vnc, AND THE REASON IS A REAL BUG.
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

# THE DESKTOP ITSELF. Everything above is plumbing that produces a managed root
# window; without these three the screen connects, draws nothing, and is
# indistinguishable from a screen that never came up.
#
# Each is a BACKGROUND launch, and that is the difference between a desktop and
# a program with a display. The foreground process at the bottom of this file is
# what the container waits on, so anything started there would end the pod when
# the user closed it — a terminal you can only close once.
#
# xrdb loads the terminal's look before the terminal exists, so the first window
# is already styled and so is every one openbox's root menu opens later.
xrdb -merge /etc/X11/Xresources/sandbox

# The root window, painted dark bottom-left to slightly lighter top-right. It is
# the first thing a client sees, so it is painted BEFORE the server starts
# serving: a frame of the X default stipple is the whole first impression.
hsetroot -add '#0a0c11' -add '#161b26' -gradient 20

# One terminal, open and waiting. It runs the user's own login shell — the
# configured zsh, with the dotfiles this image builds — because the point of the
# screen is to be somewhere work happens, and an empty desktop asks the person
# who opened it to already know openbox's menu is on the right mouse button.
xterm -geometry 104x30+48+40 &

# X0tigervnc IS the scraping server. `x0vncserver` on PATH is TigerVNC's session
# manager — a perl wrapper that starts the server, waits for it, and kills it if
# it does not appear — and ITS READINESS TEST CANNOT SEE A LOOPBACK LISTENER.
# Wrapper.pm checks the port by binding INADDR_ANY with SO_REUSEADDR and calling
# a bind that FAILS proof that the server is up; a server bound to 127.0.0.1
# leaves 0.0.0.0 free, so the bind keeps succeeding, and after 300 tries at 100ms
# the wrapper reports "X0tigervnc did not start up" and kills a server that had
# been serving the whole time.
#
# That is exactly this arrangement — `-localhost yes` is the line above this one,
# and it is not negotiable — so every desktop pod's screen died THIRTY SECONDS
# after boot, and nothing downstream could tell that from a screen that never
# existed: the pod is Running, exec answers, X and openbox are up, and only a VNC
# client ever finds out. Calling the server directly removes the supervisor that
# was the entire failure. Nothing is lost with it: the wrapper's job is desktop
# sessions, log rotation and pid files for a machine with many users, and this
# container has one screen and tini for a parent.
X0tigervnc -display "${DISPLAY}" -rfbport "${VNC_PORT}" \
  -SecurityTypes None -localhost="$([ "${LISTEN_HOST}" = "localhost" ] && echo 1 || echo 0)" \
  -desktop "sandbox" &
log "vnc on ${LISTEN_HOST}:${VNC_PORT}"

if [ "${ENABLE_NOVNC}" = "1" ]; then
  websockify --web /usr/share/novnc "${LISTEN_HOST}:${NOVNC_PORT}" \
    "localhost:${VNC_PORT}" &
  log "novnc on ${LISTEN_HOST}:${NOVNC_PORT}"
fi

# THEN THE CLASS'S OWN PROGRAM, IF IT HAS ONE. `sandbox-desktop avd` is the
# android class: this same screen, with a phone drawn on it. A class that wants
# something running on the display does not want a second X server, a second
# window manager and a second VNC pair — and the way it gets them is somebody
# copying this file to add three lines at the bottom, after which the two copies
# drift and only one of them gets the next fix.
#
# So the screen takes an argument. Everything above is the display; everything
# a class adds is argv. That also keeps the promise the other classes make: the
# argument runs INSTEAD of the sleep, so there is still exactly one process this
# container waits on, and the pod still ends when it does.
if [ "$#" -gt 0 ]; then
  log "running $*"
  exec "$@"
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
