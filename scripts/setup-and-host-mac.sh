#!/usr/bin/env bash
# ==============================================================================
# You Are Rhyme — Turnkey Mac Setup & Multiplayer Host Launcher
# Clones repo (kyle-multiplayer), installs all dependencies, and launches the host.
# ==============================================================================

set -e

echo ""
echo "================================================================="
echo "   YOU ARE RHYME — MAC HOSTING & AUTOMATIC MULTIPLAYER SETUP"
echo "   Act III, Scene IV: Hamlet vs. Queen Gertrude"
echo "================================================================="
echo ""

# 1. Check for Git
if ! command -v git &> /dev/null; then
    echo "[!] Git is not installed on this Mac."
    echo "[!] Running 'xcode-select --install'. Complete the prompt, then re-run this script."
    xcode-select --install
    exit 1
fi

# 2. Check for Node & npm
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo "[!] Node.js is required but was not found in PATH."
    echo "    Please install Node.js (v18+) via https://nodejs.org or run:"
    echo "    brew install node"
    exit 1
fi
echo "[+] Node.js $(node -v) and npm $(npm -v) detected."

# 3. Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "[!] Python 3 is required but was not found."
    echo "    Please install Python 3 via https://python.org or run:"
    echo "    brew install python@3.11"
    exit 1
fi
echo "[+] Python 3 detected ($(python3 --version))."

# 4. Clone or Update the Repository
TARGET_DIR="$HOME/you-are-rhyme"
REPO_URL="https://github.com/kdavidmitchell/you-are-rhyme.git"
BRANCH="kyle-multiplayer"

if [ -d "$TARGET_DIR/.git" ]; then
    echo "[+] Repository already exists at $TARGET_DIR. Updating to latest $BRANCH..."
    cd "$TARGET_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    echo "[+] Cloning $REPO_URL (branch: $BRANCH) to $TARGET_DIR..."
    git clone -b "$BRANCH" "$REPO_URL" "$TARGET_DIR"
    cd "$TARGET_DIR"
fi

# 5. Trap for graceful shutdown on Ctrl+C
cleanup() {
    echo ""
    echo "[Host] Discharging stagecraft and terminating child processes..."
    if [ -n "$PY_PID" ] && kill -0 "$PY_PID" 2>/dev/null; then
        kill "$PY_PID" 2>/dev/null || true
    fi
    if [ -n "$NODE_PID" ] && kill -0 "$NODE_PID" 2>/dev/null; then
        kill "$NODE_PID" 2>/dev/null || true
    fi
    echo "[Host] Chamber closed. All actors discharged."
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 6. Python Virtual Environment Setup & Dependencies
echo ""
echo "[1/4] Setting up Python virtual environment & faster-whisper..."
if [ ! -d "python/.venv" ]; then
    python3 -m venv python/.venv
fi
source python/.venv/bin/activate
pip install --upgrade pip --quiet
pip install -r python/requirements.txt --quiet
echo "      -> Python dependencies verified."

# 7. Node Dependencies & Client Build
echo ""
echo "[2/4] Installing Node dependencies and building React production bundle..."
npm install --quiet
npm install --prefix server --quiet
npm install --prefix client --quiet
npm run build --prefix client

# 8. Ensure cloudflared is available (Automatic Download if missing)
BIN_DIR="$TARGET_DIR/bin"
mkdir -p "$BIN_DIR"
PATH="$BIN_DIR:$PATH"

if ! command -v cloudflared &> /dev/null; then
    echo ""
    echo "[+] Obtaining Cloudflare Quick Tunnel binary for macOS..."
    ARCH="$(uname -m)"
    if [ "$ARCH" = "arm64" ]; then
        CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64"
    else
        CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64"
    fi
    curl -sSL "$CF_URL" -o "$BIN_DIR/cloudflared"
    chmod +x "$BIN_DIR/cloudflared"
    xattr -d com.apple.quarantine "$BIN_DIR/cloudflared" 2>/dev/null || true
    echo "      -> cloudflared binary installed to $BIN_DIR/cloudflared"
fi

# 9. Launch Python Whisper Microservice
echo ""
echo "[3/4] Launching Python Whisper transcription engine (Port 5000)..."
python3 python/transcriber.py &
PY_PID=$!
sleep 2

# 10. Launch Node.js Socket.io Orchestrator
echo ""
echo "[4/4] Launching Node.js Orchestrator & Static Web Server (Port 3001)..."
node server/index.js &
NODE_PID=$!
sleep 2

# 11. Launch Tunnel
echo ""
echo "================================================================="
echo "   YOU ARE RHYME IS NOW LIVE ON YOUR MAC!"
echo "================================================================="
echo "Local access: http://localhost:3001"
echo ""
echo "Starting Cloudflare Quick Tunnel for remote HTTPS & microphone..."
echo "Watch the logs below for your public https://*.trycloudflare.com link!"
echo "================================================================="
echo ""

cloudflared tunnel --url http://localhost:3001
