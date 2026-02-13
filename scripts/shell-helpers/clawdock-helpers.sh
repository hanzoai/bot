#!/usr/bin/env bash
# BotDock - Docker helpers for Hanzo Bot
# Inspired by Simon Willison's "Running Hanzo Bot in Docker"
# https://til.simonwillison.net/llms/hanzo-bot-docker
#
# Installation:
#   mkdir -p ~/.bot && curl -sL https://raw.githubusercontent.com/hanzoai/bot/main/scripts/shell-helpers/bot-helpers.sh -o ~/.hanzo/bot/bot-helpers.sh
#   echo 'source ~/.hanzo/bot/bot-helpers.sh' >> ~/.zshrc
#
# Usage:
#   bot-help    # Show all available commands

# =============================================================================
# Colors
# =============================================================================
_CLR_RESET='\033[0m'
_CLR_BOLD='\033[1m'
_CLR_DIM='\033[2m'
_CLR_GREEN='\033[0;32m'
_CLR_YELLOW='\033[1;33m'
_CLR_BLUE='\033[0;34m'
_CLR_MAGENTA='\033[0;35m'
_CLR_CYAN='\033[0;36m'
_CLR_RED='\033[0;31m'

# Styled command output (green + bold)
_clr_cmd() {
  echo -e "${_CLR_GREEN}${_CLR_BOLD}$1${_CLR_RESET}"
}

# Inline command for use in sentences
_cmd() {
  echo "${_CLR_GREEN}${_CLR_BOLD}$1${_CLR_RESET}"
}

# =============================================================================
# Config
# =============================================================================
BOTDOCK_CONFIG="${HOME}/.bot/config"

# Common paths to check for Hanzo Bot
BOTDOCK_COMMON_PATHS=(
  "${HOME}/hanzo-bot"
  "${HOME}/workspace/hanzo-bot"
  "${HOME}/projects/hanzo-bot"
  "${HOME}/dev/hanzo-bot"
  "${HOME}/code/hanzo-bot"
  "${HOME}/src/hanzo-bot"
)

_bot_filter_warnings() {
  grep -v "^WARN\|^time="
}

_bot_trim_quotes() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  printf "%s" "$value"
}

_bot_read_config_dir() {
  if [[ ! -f "$BOTDOCK_CONFIG" ]]; then
    return 1
  fi
  local raw
  raw=$(sed -n 's/^BOTDOCK_DIR=//p' "$BOTDOCK_CONFIG" | head -n 1)
  if [[ -z "$raw" ]]; then
    return 1
  fi
  _bot_trim_quotes "$raw"
}

# Ensure BOTDOCK_DIR is set and valid
_bot_ensure_dir() {
  # Already set and valid?
  if [[ -n "$BOTDOCK_DIR" && -f "${BOTDOCK_DIR}/docker-compose.yml" ]]; then
    return 0
  fi

  # Try loading from config
  local config_dir
  config_dir=$(_bot_read_config_dir)
  if [[ -n "$config_dir" && -f "${config_dir}/docker-compose.yml" ]]; then
    BOTDOCK_DIR="$config_dir"
    return 0
  fi

  # Auto-detect from common paths
  local found_path=""
  for path in "${BOTDOCK_COMMON_PATHS[@]}"; do
    if [[ -f "${path}/docker-compose.yml" ]]; then
      found_path="$path"
      break
    fi
  done

  if [[ -n "$found_path" ]]; then
    echo ""
    echo "🤖 Found Hanzo Bot at: $found_path"
    echo -n "   Use this location? [Y/n] "
    read -r response
    if [[ "$response" =~ ^[Nn] ]]; then
      echo ""
      echo "Set BOTDOCK_DIR manually:"
      echo "  export BOTDOCK_DIR=/path/to/hanzo-bot"
      return 1
    fi
    BOTDOCK_DIR="$found_path"
  else
    echo ""
    echo "❌ Hanzo Bot not found in common locations."
    echo ""
    echo "Clone it first:"
    echo ""
    echo "  git clone https://github.com/hanzoai/bot.git ~/hanzo-bot"
    echo "  cd ~/hanzo-bot && ./docker-setup.sh"
    echo ""
    echo "Or set BOTDOCK_DIR if it's elsewhere:"
    echo ""
    echo "  export BOTDOCK_DIR=/path/to/hanzo-bot"
    echo ""
    return 1
  fi

  # Save to config
  if [[ ! -d "${HOME}/.bot" ]]; then
    /bin/mkdir -p "${HOME}/.bot"
  fi
  echo "BOTDOCK_DIR=\"$BOTDOCK_DIR\"" > "$BOTDOCK_CONFIG"
  echo "✅ Saved to $BOTDOCK_CONFIG"
  echo ""
  return 0
}

# Wrapper to run docker compose commands
_bot_compose() {
  _bot_ensure_dir || return 1
  command docker compose -f "${BOTDOCK_DIR}/docker-compose.yml" "$@"
}

_bot_read_env_token() {
  _bot_ensure_dir || return 1
  if [[ ! -f "${BOTDOCK_DIR}/.env" ]]; then
    return 1
  fi
  local raw
  raw=$(sed -n 's/^BOT_GATEWAY_TOKEN=//p' "${BOTDOCK_DIR}/.env" | head -n 1)
  if [[ -z "$raw" ]]; then
    return 1
  fi
  _bot_trim_quotes "$raw"
}

# Basic Operations
bot-start() {
  _bot_compose up -d hanzo-bot-gateway
}

bot-stop() {
  _bot_compose down
}

bot-restart() {
  _bot_compose restart hanzo-bot-gateway
}

bot-logs() {
  _bot_compose logs -f hanzo-bot-gateway
}

bot-status() {
  _bot_compose ps
}

# Navigation
bot-cd() {
  _bot_ensure_dir || return 1
  cd "${BOTDOCK_DIR}"
}

bot-config() {
  cd ~/.bot
}

bot-workspace() {
  cd ~/.hanzo/bot/workspace
}

# Container Access
bot-shell() {
  _bot_compose exec hanzo-bot-gateway \
    bash -c 'echo "alias hanzo-bot=\"./hanzo-bot.mjs\"" > /tmp/.bashrc_hanzo-bot && bash --rcfile /tmp/.bashrc_hanzo-bot'
}

bot-exec() {
  _bot_compose exec hanzo-bot-gateway "$@"
}

bot-cli() {
  _bot_compose run --rm hanzo-bot-cli "$@"
}

# Maintenance
bot-rebuild() {
  _bot_compose build hanzo-bot-gateway
}

bot-clean() {
  _bot_compose down -v --remove-orphans
}

# Health check
bot-health() {
  _bot_ensure_dir || return 1
  local token
  token=$(_bot_read_env_token)
  if [[ -z "$token" ]]; then
    echo "❌ Error: Could not find gateway token"
    echo "   Check: ${BOTDOCK_DIR}/.env"
    return 1
  fi
  _bot_compose exec -e "BOT_GATEWAY_TOKEN=$token" hanzo-bot-gateway \
    node dist/index.js health
}

# Show gateway token
bot-token() {
  _bot_read_env_token
}

# Fix token configuration (run this once after setup)
bot-fix-token() {
  _bot_ensure_dir || return 1

  echo "🔧 Configuring gateway token..."
  local token
  token=$(bot-token)
  if [[ -z "$token" ]]; then
    echo "❌ Error: Could not find gateway token"
    echo "   Check: ${BOTDOCK_DIR}/.env"
    return 1
  fi

  echo "📝 Setting token: ${token:0:20}..."

  _bot_compose exec -e "TOKEN=$token" hanzo-bot-gateway \
    bash -c './hanzo-bot.mjs config set gateway.remote.token "$TOKEN" && ./hanzo-bot.mjs config set gateway.auth.token "$TOKEN"' 2>&1 | _bot_filter_warnings

  echo "🔍 Verifying token was saved..."
  local saved_token
  saved_token=$(_bot_compose exec hanzo-bot-gateway \
    bash -c "./hanzo-bot.mjs config get gateway.remote.token 2>/dev/null" 2>&1 | _bot_filter_warnings | tr -d '\r\n' | head -c 64)

  if [[ "$saved_token" == "$token" ]]; then
    echo "✅ Token saved correctly!"
  else
    echo "⚠️  Token mismatch detected"
    echo "   Expected: ${token:0:20}..."
    echo "   Got: ${saved_token:0:20}..."
  fi

  echo "🔄 Restarting gateway..."
  _bot_compose restart hanzo-bot-gateway 2>&1 | _bot_filter_warnings

  echo "⏳ Waiting for gateway to start..."
  sleep 5

  echo "✅ Configuration complete!"
  echo -e "   Try: $(_cmd bot-devices)"
}

# Open dashboard in browser
bot-dashboard() {
  _bot_ensure_dir || return 1

  echo "🤖 Getting dashboard URL..."
  local output status url
  output=$(_bot_compose run --rm hanzo-bot-cli dashboard --no-open 2>&1)
  status=$?
  url=$(printf "%s\n" "$output" | _bot_filter_warnings | grep -o 'http[s]\?://[^[:space:]]*' | head -n 1)
  if [[ $status -ne 0 ]]; then
    echo "❌ Failed to get dashboard URL"
    echo -e "   Try restarting: $(_cmd bot-restart)"
    return 1
  fi

  if [[ -n "$url" ]]; then
    echo "✅ Opening: $url"
    open "$url" 2>/dev/null || xdg-open "$url" 2>/dev/null || echo "   Please open manually: $url"
    echo ""
    echo -e "${_CLR_CYAN}💡 If you see 'pairing required' error:${_CLR_RESET}"
    echo -e "   1. Run: $(_cmd bot-devices)"
    echo "   2. Copy the Request ID from the Pending table"
    echo -e "   3. Run: $(_cmd 'bot-approve <request-id>')"
  else
    echo "❌ Failed to get dashboard URL"
    echo -e "   Try restarting: $(_cmd bot-restart)"
  fi
}

# List device pairings
bot-devices() {
  _bot_ensure_dir || return 1

  echo "🔍 Checking device pairings..."
  local output status
  output=$(_bot_compose exec hanzo-bot-gateway node dist/index.js devices list 2>&1)
  status=$?
  printf "%s\n" "$output" | _bot_filter_warnings
  if [ $status -ne 0 ]; then
    echo ""
    echo -e "${_CLR_CYAN}💡 If you see token errors above:${_CLR_RESET}"
    echo -e "   1. Verify token is set: $(_cmd bot-token)"
    echo "   2. Try manual config inside container:"
    echo -e "      $(_cmd bot-shell)"
    echo -e "      $(_cmd 'hanzo-bot config get gateway.remote.token')"
    return 1
  fi

  echo ""
  echo -e "${_CLR_CYAN}💡 To approve a pairing request:${_CLR_RESET}"
  echo -e "   $(_cmd 'bot-approve <request-id>')"
}

# Approve device pairing request
bot-approve() {
  _bot_ensure_dir || return 1

  if [[ -z "$1" ]]; then
    echo -e "❌ Usage: $(_cmd 'bot-approve <request-id>')"
    echo ""
    echo -e "${_CLR_CYAN}💡 How to approve a device:${_CLR_RESET}"
    echo -e "   1. Run: $(_cmd bot-devices)"
    echo "   2. Find the Request ID in the Pending table (long UUID)"
    echo -e "   3. Run: $(_cmd 'bot-approve <that-request-id>')"
    echo ""
    echo "Example:"
    echo -e "   $(_cmd 'bot-approve 6f9db1bd-a1cc-4d3f-b643-2c195262464e')"
    return 1
  fi

  echo "✅ Approving device: $1"
  _bot_compose exec hanzo-bot-gateway \
    node dist/index.js devices approve "$1" 2>&1 | _bot_filter_warnings

  echo ""
  echo "✅ Device approved! Refresh your browser."
}

# Show all available bot helper commands
bot-help() {
  echo -e "\n${_CLR_BOLD}${_CLR_CYAN}🤖 BotDock - Docker Helpers for Hanzo Bot${_CLR_RESET}\n"

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}⚡ Basic Operations${_CLR_RESET}"
  echo -e "  $(_cmd bot-start)       ${_CLR_DIM}Start the gateway${_CLR_RESET}"
  echo -e "  $(_cmd bot-stop)        ${_CLR_DIM}Stop the gateway${_CLR_RESET}"
  echo -e "  $(_cmd bot-restart)     ${_CLR_DIM}Restart the gateway${_CLR_RESET}"
  echo -e "  $(_cmd bot-status)      ${_CLR_DIM}Check container status${_CLR_RESET}"
  echo -e "  $(_cmd bot-logs)        ${_CLR_DIM}View live logs (follows)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🐚 Container Access${_CLR_RESET}"
  echo -e "  $(_cmd bot-shell)       ${_CLR_DIM}Shell into container (hanzo-bot alias ready)${_CLR_RESET}"
  echo -e "  $(_cmd bot-cli)         ${_CLR_DIM}Run CLI commands (e.g., bot-cli status)${_CLR_RESET}"
  echo -e "  $(_cmd bot-exec) ${_CLR_CYAN}<cmd>${_CLR_RESET}  ${_CLR_DIM}Execute command in gateway container${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🌐 Web UI & Devices${_CLR_RESET}"
  echo -e "  $(_cmd bot-dashboard)   ${_CLR_DIM}Open web UI in browser ${_CLR_CYAN}(auto-guides you)${_CLR_RESET}"
  echo -e "  $(_cmd bot-devices)     ${_CLR_DIM}List device pairings ${_CLR_CYAN}(auto-guides you)${_CLR_RESET}"
  echo -e "  $(_cmd bot-approve) ${_CLR_CYAN}<id>${_CLR_RESET} ${_CLR_DIM}Approve device pairing ${_CLR_CYAN}(with examples)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}⚙️  Setup & Configuration${_CLR_RESET}"
  echo -e "  $(_cmd bot-fix-token)   ${_CLR_DIM}Configure gateway token ${_CLR_CYAN}(run once)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🔧 Maintenance${_CLR_RESET}"
  echo -e "  $(_cmd bot-rebuild)     ${_CLR_DIM}Rebuild Docker image${_CLR_RESET}"
  echo -e "  $(_cmd bot-clean)       ${_CLR_RED}⚠️  Remove containers & volumes (nuclear)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🛠️  Utilities${_CLR_RESET}"
  echo -e "  $(_cmd bot-health)      ${_CLR_DIM}Run health check${_CLR_RESET}"
  echo -e "  $(_cmd bot-token)       ${_CLR_DIM}Show gateway auth token${_CLR_RESET}"
  echo -e "  $(_cmd bot-cd)          ${_CLR_DIM}Jump to hanzo-bot project directory${_CLR_RESET}"
  echo -e "  $(_cmd bot-config)      ${_CLR_DIM}Open config directory (~/.bot)${_CLR_RESET}"
  echo -e "  $(_cmd bot-workspace)   ${_CLR_DIM}Open workspace directory${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_CLR_RESET}"
  echo -e "${_CLR_BOLD}${_CLR_GREEN}🚀 First Time Setup${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  1.${_CLR_RESET} $(_cmd bot-start)          ${_CLR_DIM}# Start the gateway${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  2.${_CLR_RESET} $(_cmd bot-fix-token)      ${_CLR_DIM}# Configure token${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  3.${_CLR_RESET} $(_cmd bot-dashboard)      ${_CLR_DIM}# Open web UI${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  4.${_CLR_RESET} $(_cmd bot-devices)        ${_CLR_DIM}# If pairing needed${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  5.${_CLR_RESET} $(_cmd bot-approve) ${_CLR_CYAN}<id>${_CLR_RESET}   ${_CLR_DIM}# Approve pairing${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_GREEN}💬 WhatsApp Setup${_CLR_RESET}"
  echo -e "  $(_cmd bot-shell)"
  echo -e "    ${_CLR_BLUE}>${_CLR_RESET} $(_cmd 'hanzo-bot channels login --channel whatsapp')"
  echo -e "    ${_CLR_BLUE}>${_CLR_RESET} $(_cmd 'hanzo-bot status')"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_CYAN}💡 All commands guide you through next steps!${_CLR_RESET}"
  echo -e "${_CLR_BLUE}📚 Docs: ${_CLR_RESET}${_CLR_CYAN}https://docs.hanzo.bot${_CLR_RESET}"
  echo ""
}
