#!/bin/zsh
# Auto-switch to the correct Node.js version via nvm when opening a terminal in this project
# This script is sourced by VS Code terminal integration

# Load nvm if available
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# If .nvmrc exists in the workspace, use it
if [ -f ".nvmrc" ]; then
  REQUIRED_VERSION=$(cat .nvmrc | tr -d '[:space:]')
  CURRENT_VERSION=$(node -v 2>/dev/null | sed 's/^v//')

  if [ "$CURRENT_VERSION" != "$REQUIRED_VERSION" ] && [ "$CURRENT_VERSION" != "${REQUIRED_VERSION}.0" ]; then
    echo "🔄 Switching to Node.js v${REQUIRED_VERSION}..."
    nvm install "$REQUIRED_VERSION" 2>/dev/null
    nvm use "$REQUIRED_VERSION"
  else
    echo "✅ Node.js v${CURRENT_VERSION} (matches .nvmrc)"
  fi
fi
