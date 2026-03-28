#!/bin/bash
# Do NOT use set -e — background processes may return non-zero on warnings

echo "[cloud-agent] Starting combined bot + desktop environment"

# ── 1. Start the desktop environment (Xvfb + VNC + WM) ──────────────
export HOME=/home/operative
export DISPLAY=:${DISPLAY_NUM:-1}

echo "[cloud-agent] Starting desktop on DISPLAY=$DISPLAY"
cd "$HOME"

# Start Xvfb
Xvfb $DISPLAY -ac -screen 0 ${WIDTH:-1920}x${HEIGHT:-1080}x24 -retro -dpi 96 \
  -nolisten tcp -nolisten unix &
XVFB_PID=$!
echo "[cloud-agent] Xvfb started (PID $XVFB_PID)"

# Wait for X to be ready (up to 10 seconds)
for i in $(seq 1 20); do
  if xdpyinfo -display $DISPLAY >/dev/null 2>&1; then
    echo "[cloud-agent] X display ready"
    break
  fi
  sleep 0.5
done

# Start window manager — openbox works headless, mutter needs a full session
if command -v openbox &>/dev/null; then
  openbox --display=$DISPLAY 2>/dev/null &
  sleep 1
  if kill -0 $! 2>/dev/null; then
    echo "[cloud-agent] Window manager: openbox (PID $!)"
  else
    echo "[cloud-agent] WARNING: openbox failed to start"
  fi
elif command -v mutter &>/dev/null; then
  mutter --replace --display=$DISPLAY 2>/dev/null &
  sleep 1
  echo "[cloud-agent] Window manager: mutter"
fi

# Start tint2 panel
if [ -f "$HOME/.config/tint2/tint2rc" ]; then
  tint2 -c "$HOME/.config/tint2/tint2rc" 2>/dev/null &
  echo "[cloud-agent] tint2 panel started"
fi

# Setup desktop icons
if command -v pcmanfm &>/dev/null; then
  pcmanfm --desktop --display=$DISPLAY 2>/dev/null &
  echo "[cloud-agent] pcmanfm desktop icons started"
fi

# Give desktop components time to initialize
sleep 2

# Start VNC server
echo "[cloud-agent] Starting VNC server on port 5900"
pkill -9 -f "x0vncserver" 2>/dev/null || true
sleep 0.5

if command -v x0vncserver &>/dev/null; then
  x0vncserver -display $DISPLAY -rfbport 5900 -SecurityTypes None &
  VNC_PID=$!
elif command -v x11vnc &>/dev/null; then
  x11vnc -display $DISPLAY -forever -shared -wait 50 -rfbport 5900 -nopw -nolookup -noxdamage -nap &
  VNC_PID=$!
fi

# Wait for VNC to be ready
for i in $(seq 1 10); do
  if netstat -tuln 2>/dev/null | grep -q ":5900 "; then
    echo "[cloud-agent] VNC server ready on port 5900"
    break
  fi
  sleep 1
done

# ── 2. Start the bot agent ───────────────────────────────────────────
echo "[cloud-agent] Starting bot agent"
cd /app

# Create workspace directory
mkdir -p "$HOME/.openclaw/workspace"

# The bot connects to the gateway as a node and handles:
# - Chat (LLM calls via Hanzo API)
# - Exec (runs commands locally — same env as desktop)
# - Browser control (Playwright on the desktop's browser)
# - VNC tunnel (proxies VNC to gateway)
# Gateway URL from env (read by bot's runner.ts)
export BOT_NODE_GATEWAY_URL="${BOT_NODE_GATEWAY_URL:-${BOT_GATEWAY_URL:-ws://bot-gateway.hanzo.svc:80}}"

# Node ID: prefer AGENT_NODE_ID (set by playground provisioner)
NODE_ID="${AGENT_NODE_ID:-${HANZO_NODE_ID:-cloud-unknown}}"

exec node hanzo-bot.mjs node run \
  --node-id "$NODE_ID" \
  --security full \
  --ask off
