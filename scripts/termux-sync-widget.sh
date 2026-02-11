#!/data/data/com.termux/files/usr/bin/bash
# Hanzo Bot OAuth Sync Widget
# Syncs Claude Code tokens to Hanzo Bot on l36 server
# Place in ~/.shortcuts/ on phone for Termux:Widget

termux-toast "Syncing Hanzo Bot auth..."

# Run sync on l36 server
SERVER="${BOT_SERVER:-${BOT_SERVER:-l36}}"
RESULT=$(ssh "$SERVER" '/home/admin/bot/scripts/sync-claude-code-auth.sh' 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    # Extract expiry time from output
    EXPIRY=$(echo "$RESULT" | grep "Token expires:" | cut -d: -f2-)

    termux-vibrate -d 100
    termux-toast "Hanzo Bot synced! Expires:${EXPIRY}"

    # Optional: restart hanzo-bot service
    ssh "$SERVER" 'systemctl --user restart bot' 2>/dev/null
else
    termux-vibrate -d 300
    termux-toast "Sync failed: ${RESULT}"
fi
