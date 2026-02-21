#!/usr/bin/env bash
# Hanzo Bot installer — https://hanzo.bot
# Usage: curl -fsSL https://hanzo.bot/install.sh | bash
#
# Wrapped in main() so the entire script is parsed before execution,
# preventing stdin consumption issues with "curl | bash".

main() {
  set -euo pipefail

  PACKAGE="${BOT_PACKAGE:-@hanzo/bot}"
  VERSION="${BOT_VERSION:-latest}"
  NODE_MAJOR="${BOT_NODE_VERSION:-22}"

  install_node() {
    echo "Node.js not found. Installing Node.js ${NODE_MAJOR}..."
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq < /dev/null
      sudo apt-get install -y -qq ca-certificates curl gnupg < /dev/null
      sudo mkdir -p /etc/apt/keyrings
      curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
        | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
      echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
        | sudo tee /etc/apt/sources.list.d/nodesource.list >/dev/null
      sudo apt-get update -qq < /dev/null
      sudo apt-get install -y -qq nodejs < /dev/null
    elif command -v brew >/dev/null 2>&1; then
      brew install node
    else
      echo "Error: cannot auto-install Node.js on this OS. Install from https://nodejs.org" >&2
      exit 1
    fi
  }

  install_git() {
    if ! command -v git >/dev/null 2>&1; then
      echo "Installing git..."
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get install -y -qq git < /dev/null
      elif command -v brew >/dev/null 2>&1; then
        brew install git
      fi
    fi
  }

  command -v node >/dev/null 2>&1 || install_node
  command -v npm >/dev/null 2>&1 || install_node
  install_git

  # Set up npm prefix for non-root installs
  if [ "$(id -u)" != "0" ]; then
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    export PATH="$HOME/.npm-global/bin:$PATH"
  fi

  echo "Installing ${PACKAGE}@${VERSION}..."
  npm install -g "${PACKAGE}@${VERSION}"

  echo "Done. Run 'hanzo-bot' to get started."
}

main "$@"
