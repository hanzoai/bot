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

# Setup desktop icons — create .desktop shortcut files and libfm config
# (ported from operative's start_all.sh)
echo "[cloud-agent] Setting up desktop icons..."
mkdir -p "$HOME/Desktop"
mkdir -p "$HOME/.config/libfm"

# Configure libfm to auto-execute .desktop files without prompting
cat > "$HOME/.config/libfm/libfm.conf" << 'LIBFM'
[config]
quick_exec=1

[ui]
always_show_tabs=0
LIBFM

# Create desktop shortcut files
cat > "$HOME/Desktop/Terminal.desktop" << 'DESK'
[Desktop Entry]
Name=Terminal
Exec=xterm -fa "Monospace" -fs 14
Icon=utilities-terminal
Type=Application
DESK

cat > "$HOME/Desktop/Firefox.desktop" << 'DESK'
[Desktop Entry]
Name=Firefox
Exec=firefox-esr
Icon=firefox-esr
Type=Application
DESK

cat > "$HOME/Desktop/Calculator.desktop" << 'DESK'
[Desktop Entry]
Name=Calculator
Exec=galculator
Icon=galculator
Type=Application
DESK

cat > "$HOME/Desktop/TextEditor.desktop" << 'DESK'
[Desktop Entry]
Name=Text Editor
Exec=gedit
Icon=text-editor
Type=Application
DESK

cat > "$HOME/Desktop/Spreadsheet.desktop" << 'DESK'
[Desktop Entry]
Name=Spreadsheet
Exec=libreoffice --calc
Icon=libreoffice-calc
Type=Application
DESK

cat > "$HOME/Desktop/Files.desktop" << 'DESK'
[Desktop Entry]
Name=Files
Exec=pcmanfm
Icon=system-file-manager
Type=Application
DESK

chmod +x "$HOME/Desktop/"*.desktop

# Start pcmanfm desktop mode (manages root window with desktop icons)
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

# ── 2. Start the operative API (computer-use tools) ──────────────────
# The operative Streamlit app provides screenshot, click, type tools
# on port 8501. The bot's LLM uses these for desktop automation.
if [ -d "$HOME/.operative" ] && [ -f "$HOME/.operative/operative/operative.py" ]; then
  echo "[cloud-agent] Starting operative API on port 8501"
  cd "$HOME/.operative"
  if [ -d ".venv" ]; then
    (
      source .venv/bin/activate 2>/dev/null || . .venv/bin/activate 2>/dev/null
      DISPLAY=$DISPLAY STREAMLIT_SERVER_PORT=8501 \
        python -m streamlit run operative/operative.py \
          --server.headless true \
          --server.address 0.0.0.0 \
          > /tmp/streamlit_stdout.log 2>&1 &
      echo "[cloud-agent] operative Streamlit started (PID $!)"
    )
  else
    echo "[cloud-agent] WARNING: operative venv not found, skipping"
  fi
  # Also start the operative HTTP server if present
  if [ -f "http_server.py" ]; then
    (
      source .venv/bin/activate 2>/dev/null || . .venv/bin/activate 2>/dev/null
      python http_server.py > /tmp/server_logs.txt 2>&1 &
      echo "[cloud-agent] operative HTTP server started"
    )
  fi
fi

# Start noVNC websocket proxy (port 6080 → VNC 5900)
if command -v websockify &>/dev/null || [ -f /usr/share/novnc/utils/novnc_proxy ]; then
  echo "[cloud-agent] Starting noVNC on port 6080"
  websockify --web /usr/share/novnc/ 6080 localhost:5900 > /tmp/novnc.log 2>&1 &
  echo "[cloud-agent] noVNC started (PID $!)"
fi

# ── 3. Start the bot agent ───────────────────────────────────────────
echo "[cloud-agent] Starting bot agent"
cd /app

# Create workspace directories.
# The bot expects its workspace at /home/node/.openclaw/workspace-{nodeId}
# (where node is the Node.js HOME). Create both the generic and node-specific
# workspace paths so the exec tool's canonical cwd check succeeds.
NODE_ID="${AGENT_NODE_ID:-${HANZO_NODE_ID:-cloud-unknown}}"
mkdir -p "$HOME/.openclaw/workspace"
mkdir -p "/home/node/.openclaw/workspace-${NODE_ID}"

# Create exec approvals file with permissive allowlist for cloud agents.
# Cloud agents need to run desktop commands (firefox, ls, etc.) without
# manual approval prompts.
# Write to $HOME/.openclaw/ (the path the bot process actually reads).
# HOME is /home/operative in the combined bot-cloud image.
mkdir -p "$HOME/.openclaw"
cat > "$HOME/.openclaw/exec-approvals.json" << 'APPROVALS'
{
  "version": 1,
  "defaults": {
    "security": "full",
    "ask": "off"
  },
  "agents": {
    "*": {
      "security": "full",
      "ask": "off",
      "allowlist": [
        {"pattern": "*"}
      ]
    }
  }
}
APPROVALS

# Write auth-profiles.json so the agent can authenticate LLM calls.
# Provisioned pods get HANZO_API_KEY from the playground provisioner.
# Writing to the "main" agent dir lets all per-agent dirs inherit it.
mkdir -p "/home/node/.openclaw/agents/main/agent"
AUTH_JSON="{\"version\":1,\"profiles\":{"
FIRST=1
if [ -n "$HANZO_API_KEY" ]; then
  AUTH_JSON="${AUTH_JSON}\"hanzo:default\":{\"type\":\"api_key\",\"provider\":\"hanzo\",\"key\":\"${HANZO_API_KEY}\"}"
  FIRST=0
fi
if [ -n "$ANTHROPIC_API_KEY" ]; then
  [ $FIRST -eq 0 ] && AUTH_JSON="${AUTH_JSON},"
  AUTH_JSON="${AUTH_JSON}\"anthropic:default\":{\"type\":\"api_key\",\"provider\":\"anthropic\",\"key\":\"${ANTHROPIC_API_KEY}\"}"
  FIRST=0
fi
if [ -n "$OPENAI_API_KEY" ]; then
  [ $FIRST -eq 0 ] && AUTH_JSON="${AUTH_JSON},"
  AUTH_JSON="${AUTH_JSON}\"openai:default\":{\"type\":\"api_key\",\"provider\":\"openai\",\"key\":\"${OPENAI_API_KEY}\"}"
fi
AUTH_JSON="${AUTH_JSON}},\"default\":\"hanzo:default\"}"
echo "$AUTH_JSON" > "/home/node/.openclaw/agents/main/agent/auth-profiles.json"
echo "[cloud-agent] auth-profiles.json written to main agent dir"

# Create bot config that routes exec to the local node (not sandbox).
# Without this, the embedded LLM agent defaults to host="sandbox" which
# fails because cloud pods don't have sandbox configured. Setting host="node"
# makes the agent dispatch commands through the gateway back to this node,
# where they execute in the same environment as the VNC desktop.
cat > "$HOME/.openclaw/openclaw.json" << 'BOTCONFIG'
{
  "tools": {
    "exec": {
      "host": "node",
      "security": "full",
      "ask": "off"
    }
  }
}
BOTCONFIG

# The bot connects to the gateway as a node and handles:
# - Chat (LLM calls via Hanzo API)
# - Exec (runs commands locally — same env as desktop)
# - Browser control (Playwright on the desktop's browser)
# - VNC tunnel (proxies VNC to gateway)
# Gateway URL from env (read by bot's runner.ts)
export BOT_NODE_GATEWAY_URL="${BOT_NODE_GATEWAY_URL:-${BOT_GATEWAY_URL:-ws://bot-gateway.hanzo.svc:80}}"

# Node ID: prefer AGENT_NODE_ID (set by playground provisioner)
NODE_ID="${AGENT_NODE_ID:-${HANZO_NODE_ID:-cloud-unknown}}"

# Security mode: cloud agents need full access to run desktop commands (firefox,
# ls, etc.) without approval. "full" with ask=off allows all commands.
# "allowlist" would block shell wrappers (sh -c) used by terminal and AI chat.
SECURITY_MODE="${AGENT_SECURITY_MODE:-full}"

exec node hanzo-bot.mjs node run \
  --node-id "$NODE_ID" \
  --security "$SECURITY_MODE" \
  --ask off
