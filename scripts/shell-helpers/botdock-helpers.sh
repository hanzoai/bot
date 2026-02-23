#!/usr/bin/env bash
# BotDock - Docker helpers for Bot
# Inspired by Simon Willison's "Running Bot in Docker"
# https://til.simonwillison.net/llms/bot-docker
#
# Installation:
#   mkdir -p ~/.botdock && curl -sL https://raw.githubusercontent.com/hanzoai/bot/main/scripts/shell-helpers/botdock-helpers.sh -o ~/.botdock/botdock-helpers.sh
#   echo 'source ~/.botdock/botdock-helpers.sh' >> ~/.zshrc
#
# Usage:
#   botdock-help    # Show all available commands

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
BOTDOCK_CONFIG="${HOME}/.botdock/config"

# Common paths to check for Bot
BOTDOCK_COMMON_PATHS=(
  "${HOME}/bot"
  "${HOME}/workspace/bot"
  "${HOME}/projects/bot"
  "${HOME}/dev/bot"
  "${HOME}/code/bot"
  "${HOME}/src/bot"
)

_botdock_filter_warnings() {
  grep -v "^WARN\|^time="
}

_botdock_trim_quotes() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  printf "%s" "$value"
}

_botdock_read_config_dir() {
  if [[ ! -f "$BOTDOCK_CONFIG" ]]; then
    return 1
  fi
  local raw
  raw=$(sed -n 's/^BOTDOCK_DIR=//p' "$BOTDOCK_CONFIG" | head -n 1)
  if [[ -z "$raw" ]]; then
    return 1
  fi
  _botdock_trim_quotes "$raw"
}

# Ensure BOTDOCK_DIR is set and valid
_botdock_ensure_dir() {
  # Already set and valid?
  if [[ -n "$BOTDOCK_DIR" && -f "${BOTDOCK_DIR}/docker-compose.yml" ]]; then
    return 0
  fi

  # Try loading from config
  local config_dir
  config_dir=$(_botdock_read_config_dir)
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
    echo "Bot found at: $found_path"
    echo -n "   Use this location? [Y/n] "
    read -r response
    if [[ "$response" =~ ^[Nn] ]]; then
      echo ""
      echo "Set BOTDOCK_DIR manually:"
      echo "  export BOTDOCK_DIR=/path/to/bot"
      return 1
    fi
    BOTDOCK_DIR="$found_path"
  else
    echo ""
    echo "❌ Bot not found in common locations."
    echo ""
    echo "Clone it first:"
    echo ""
    echo "  git clone https://github.com/hanzoai/bot.git ~/bot"
    echo "  cd ~/bot && ./docker-setup.sh"
    echo ""
    echo "Or set BOTDOCK_DIR if it's elsewhere:"
    echo ""
    echo "  export BOTDOCK_DIR=/path/to/bot"
    echo ""
    return 1
  fi

  # Save to config
  if [[ ! -d "${HOME}/.botdock" ]]; then
    /bin/mkdir -p "${HOME}/.botdock"
  fi
  echo "BOTDOCK_DIR=\"$BOTDOCK_DIR\"" > "$BOTDOCK_CONFIG"
  echo "✅ Saved to $BOTDOCK_CONFIG"
  echo ""
  return 0
}

# Wrapper to run docker compose commands
_botdock_compose() {
  _botdock_ensure_dir || return 1
  command docker compose -f "${BOTDOCK_DIR}/docker-compose.yml" "$@"
}

_botdock_read_env_token() {
  _botdock_ensure_dir || return 1
  if [[ ! -f "${BOTDOCK_DIR}/.env" ]]; then
    return 1
  fi
  local raw
  raw=$(sed -n 's/^BOT_GATEWAY_TOKEN=//p' "${BOTDOCK_DIR}/.env" | head -n 1)
  if [[ -z "$raw" ]]; then
    return 1
  fi
  _botdock_trim_quotes "$raw"
}

# Basic Operations
botdock-start() {
  _botdock_compose up -d bot-gateway
}

botdock-stop() {
  _botdock_compose down
}

botdock-restart() {
  _botdock_compose restart bot-gateway
}

botdock-logs() {
  _botdock_compose logs -f bot-gateway
}

botdock-status() {
  _botdock_compose ps
}

# Navigation
botdock-cd() {
  _botdock_ensure_dir || return 1
  cd "${BOTDOCK_DIR}"
}

botdock-config() {
  cd ~/.bot
}

botdock-workspace() {
  cd ~/.bot/workspace
}

# Container Access
botdock-shell() {
  _botdock_compose exec bot-gateway \
    bash -c 'echo "alias bot=\"./bot.mjs\"" > /tmp/.bashrc_bot && bash --rcfile /tmp/.bashrc_bot'
}

botdock-exec() {
  _botdock_compose exec bot-gateway "$@"
}

botdock-cli() {
  _botdock_compose run --rm bot-cli "$@"
}

# Maintenance
botdock-rebuild() {
  _botdock_compose build bot-gateway
}

botdock-clean() {
  _botdock_compose down -v --remove-orphans
}

# Health check
botdock-health() {
  _botdock_ensure_dir || return 1
  local token
  token=$(_botdock_read_env_token)
  if [[ -z "$token" ]]; then
    echo "❌ Error: Could not find gateway token"
    echo "   Check: ${BOTDOCK_DIR}/.env"
    return 1
  fi
  _botdock_compose exec -e "BOT_GATEWAY_TOKEN=$token" bot-gateway \
    node dist/index.js health
}

# Show gateway token
botdock-token() {
  _botdock_read_env_token
}

# Fix token configuration (run this once after setup)
botdock-fix-token() {
  _botdock_ensure_dir || return 1

  echo "🔧 Configuring gateway token..."
  local token
  token=$(botdock-token)
  if [[ -z "$token" ]]; then
    echo "❌ Error: Could not find gateway token"
    echo "   Check: ${BOTDOCK_DIR}/.env"
    return 1
  fi

  echo "📝 Setting token: ${token:0:20}..."

  _botdock_compose exec -e "TOKEN=$token" bot-gateway \
    bash -c './bot.mjs config set gateway.remote.token "$TOKEN" && ./bot.mjs config set gateway.auth.token "$TOKEN"' 2>&1 | _botdock_filter_warnings

  echo "🔍 Verifying token was saved..."
  local saved_token
  saved_token=$(_botdock_compose exec bot-gateway \
    bash -c "./bot.mjs config get gateway.remote.token 2>/dev/null" 2>&1 | _botdock_filter_warnings | tr -d '\r\n' | head -c 64)

  if [[ "$saved_token" == "$token" ]]; then
    echo "✅ Token saved correctly!"
  else
    echo "⚠️  Token mismatch detected"
    echo "   Expected: ${token:0:20}..."
    echo "   Got: ${saved_token:0:20}..."
  fi

  echo "🔄 Restarting gateway..."
  _botdock_compose restart bot-gateway 2>&1 | _botdock_filter_warnings

  echo "⏳ Waiting for gateway to start..."
  sleep 5

  echo "✅ Configuration complete!"
  echo -e "   Try: $(_cmd botdock-devices)"
}

# Open dashboard in browser
botdock-dashboard() {
  _botdock_ensure_dir || return 1

  echo "Getting dashboard URL..."
  local output exit_status url
  output=$(_botdock_compose run --rm bot-cli dashboard --no-open 2>&1)
  exit_status=$?
  url=$(printf "%s\n" "$output" | _botdock_filter_warnings | grep -o 'http[s]\?://[^[:space:]]*' | head -n 1)
  if [[ $exit_status -ne 0 ]]; then
    echo "❌ Failed to get dashboard URL"
    echo -e "   Try restarting: $(_cmd botdock-restart)"
    return 1
  fi

  if [[ -n "$url" ]]; then
    echo "✅ Opening: $url"
    open "$url" 2>/dev/null || xdg-open "$url" 2>/dev/null || echo "   Please open manually: $url"
    echo ""
    echo -e "${_CLR_CYAN}💡 If you see 'pairing required' error:${_CLR_RESET}"
    echo -e "   1. Run: $(_cmd botdock-devices)"
    echo "   2. Copy the Request ID from the Pending table"
    echo -e "   3. Run: $(_cmd 'botdock-approve <request-id>')"
  else
    echo "❌ Failed to get dashboard URL"
    echo -e "   Try restarting: $(_cmd botdock-restart)"
  fi
}

# List device pairings
botdock-devices() {
  _botdock_ensure_dir || return 1

  echo "🔍 Checking device pairings..."
  local output exit_status
  output=$(_botdock_compose exec bot-gateway node dist/index.js devices list 2>&1)
  exit_status=$?
  printf "%s\n" "$output" | _botdock_filter_warnings
  if [ $exit_status -ne 0 ]; then
    echo ""
    echo -e "${_CLR_CYAN}💡 If you see token errors above:${_CLR_RESET}"
    echo -e "   1. Verify token is set: $(_cmd botdock-token)"
    echo "   2. Try manual config inside container:"
    echo -e "      $(_cmd botdock-shell)"
    echo -e "      $(_cmd 'bot config get gateway.remote.token')"
    return 1
  fi

  echo ""
  echo -e "${_CLR_CYAN}💡 To approve a pairing request:${_CLR_RESET}"
  echo -e "   $(_cmd 'botdock-approve <request-id>')"
}

# Approve device pairing request
botdock-approve() {
  _botdock_ensure_dir || return 1

  if [[ -z "$1" ]]; then
    echo -e "❌ Usage: $(_cmd 'botdock-approve <request-id>')"
    echo ""
    echo -e "${_CLR_CYAN}💡 How to approve a device:${_CLR_RESET}"
    echo -e "   1. Run: $(_cmd botdock-devices)"
    echo "   2. Find the Request ID in the Pending table (long UUID)"
    echo -e "   3. Run: $(_cmd 'botdock-approve <that-request-id>')"
    echo ""
    echo "Example:"
    echo -e "   $(_cmd 'botdock-approve 6f9db1bd-a1cc-4d3f-b643-2c195262464e')"
    return 1
  fi

  echo "✅ Approving device: $1"
  _botdock_compose exec bot-gateway \
    node dist/index.js devices approve "$1" 2>&1 | _botdock_filter_warnings

  echo ""
  echo "✅ Device approved! Refresh your browser."
}

# Show all available botdock helper commands
botdock-help() {
  echo -e "\n${_CLR_BOLD}${_CLR_CYAN}BotDock - Docker Helpers for Bot${_CLR_RESET}\n"

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}⚡ Basic Operations${_CLR_RESET}"
  echo -e "  $(_cmd botdock-start)       ${_CLR_DIM}Start the gateway${_CLR_RESET}"
  echo -e "  $(_cmd botdock-stop)        ${_CLR_DIM}Stop the gateway${_CLR_RESET}"
  echo -e "  $(_cmd botdock-restart)     ${_CLR_DIM}Restart the gateway${_CLR_RESET}"
  echo -e "  $(_cmd botdock-status)      ${_CLR_DIM}Check container status${_CLR_RESET}"
  echo -e "  $(_cmd botdock-logs)        ${_CLR_DIM}View live logs (follows)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🐚 Container Access${_CLR_RESET}"
  echo -e "  $(_cmd botdock-shell)       ${_CLR_DIM}Shell into container (bot alias ready)${_CLR_RESET}"
  echo -e "  $(_cmd botdock-cli)         ${_CLR_DIM}Run CLI commands (e.g., botdock-cli status)${_CLR_RESET}"
  echo -e "  $(_cmd botdock-exec) ${_CLR_CYAN}<cmd>${_CLR_RESET}  ${_CLR_DIM}Execute command in gateway container${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🌐 Web UI & Devices${_CLR_RESET}"
  echo -e "  $(_cmd botdock-dashboard)   ${_CLR_DIM}Open web UI in browser ${_CLR_CYAN}(auto-guides you)${_CLR_RESET}"
  echo -e "  $(_cmd botdock-devices)     ${_CLR_DIM}List device pairings ${_CLR_CYAN}(auto-guides you)${_CLR_RESET}"
  echo -e "  $(_cmd botdock-approve) ${_CLR_CYAN}<id>${_CLR_RESET} ${_CLR_DIM}Approve device pairing ${_CLR_CYAN}(with examples)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}⚙️  Setup & Configuration${_CLR_RESET}"
  echo -e "  $(_cmd botdock-fix-token)   ${_CLR_DIM}Configure gateway token ${_CLR_CYAN}(run once)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🔧 Maintenance${_CLR_RESET}"
  echo -e "  $(_cmd botdock-rebuild)     ${_CLR_DIM}Rebuild Docker image${_CLR_RESET}"
  echo -e "  $(_cmd botdock-clean)       ${_CLR_RED}⚠️  Remove containers & volumes (nuclear)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🛠️  Utilities${_CLR_RESET}"
  echo -e "  $(_cmd botdock-health)      ${_CLR_DIM}Run health check${_CLR_RESET}"
  echo -e "  $(_cmd botdock-token)       ${_CLR_DIM}Show gateway auth token${_CLR_RESET}"
  echo -e "  $(_cmd botdock-cd)          ${_CLR_DIM}Jump to bot project directory${_CLR_RESET}"
  echo -e "  $(_cmd botdock-config)      ${_CLR_DIM}Open config directory (~/.bot)${_CLR_RESET}"
  echo -e "  $(_cmd botdock-workspace)   ${_CLR_DIM}Open workspace directory${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_CLR_RESET}"
  echo -e "${_CLR_BOLD}${_CLR_GREEN}🚀 First Time Setup${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  1.${_CLR_RESET} $(_cmd botdock-start)          ${_CLR_DIM}# Start the gateway${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  2.${_CLR_RESET} $(_cmd botdock-fix-token)      ${_CLR_DIM}# Configure token${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  3.${_CLR_RESET} $(_cmd botdock-dashboard)      ${_CLR_DIM}# Open web UI${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  4.${_CLR_RESET} $(_cmd botdock-devices)        ${_CLR_DIM}# If pairing needed${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  5.${_CLR_RESET} $(_cmd botdock-approve) ${_CLR_CYAN}<id>${_CLR_RESET}   ${_CLR_DIM}# Approve pairing${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_GREEN}💬 WhatsApp Setup${_CLR_RESET}"
  echo -e "  $(_cmd botdock-shell)"
  echo -e "    ${_CLR_BLUE}>${_CLR_RESET} $(_cmd 'bot channels login --channel whatsapp')"
  echo -e "    ${_CLR_BLUE}>${_CLR_RESET} $(_cmd 'bot status')"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_CYAN}💡 All commands guide you through next steps!${_CLR_RESET}"
  echo -e "${_CLR_BLUE}📚 Docs: ${_CLR_RESET}${_CLR_CYAN}https://docs.hanzo.bot${_CLR_RESET}"
  echo ""
}
