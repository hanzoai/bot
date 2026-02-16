#!/bin/sh
# Hanzo Bot Docker entrypoint with init script support.
#
# Runs any executable scripts found in /bot-init.d/ before starting
# the main process. This allows users to mount custom initialization
# scripts (e.g., install dependencies, apply patches, start services)
# without overriding the entire entrypoint.
#
# Usage in docker-compose.yml:
#   volumes:
#     - ./my-init-scripts:/bot-init.d:ro

INIT_DIR="/bot-init.d"

if [ -d "$INIT_DIR" ] && [ "$(ls -A "$INIT_DIR" 2>/dev/null)" ]; then
  echo "[bot-init] Running init scripts from $INIT_DIR..."
  for script in "$INIT_DIR"/*; do
    [ -f "$script" ] || continue
    if [ -x "$script" ]; then
      echo "[bot-init] Running $(basename "$script")..."
      output=$("$script" 2>&1) || echo "[bot-init] WARNING: $(basename "$script") exited with status $?"
      [ -n "$output" ] && printf '%s\n' "$output" | sed 's/^/  /'
    else
      echo "[bot-init] Skipping $(basename "$script") (not executable)"
    fi
  done
  echo "[bot-init] Done."
fi

exec "$@"
