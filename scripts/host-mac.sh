#!/usr/bin/env bash
# ==============================================================================
# You Are Rhyme — Dedicated Mac Multiplayer Host & Tunnel Launcher
# ==============================================================================

set -e

# Change directory to project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "================================================================="
echo "   YOU ARE RHYME — THEATRICAL DUELING HOST ORCHESTRATOR"
echo "   Hosting Act III, Scene IV: Hamlet vs. Gertrude"
echo "================================================================="

# Trap to kill background processes on exit
cleanup() {
    echo ""
    echo "[Host] Shutting down child processes..."
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

# 1. Verify Python Virtual Environment
echo "[1/4] Checking Python Whisper environment..."
if [ -d "python/.venv" ]; then
    source python/.venv/bin/activate
elif [ -d "python/venv" ]; then
    source python/venv/bin/activate
else
    echo "[!] No existing virtual environment found in python/.venv."
    echo "[!] Creating virtualenv and installing faster-whisper..."
    python3 -m venv python/.venv
    source python/.venv/bin/activate
    pip install -r python/requirements.txt
fi

echo "[2/4] Starting Python transcription microservice (Whisper)..."
python3 python/transcriber.py &
PY_PID=$!
echo "      -> Python Whisper active (PID: $PY_PID) on port 5000"

# 2. Build the React client distribution
echo "[3/4] Building production React client..."
npm run build --prefix client

# 3. Start Node.js Backend Orchestrator
echo "[4/4] Starting Node.js Socket.io Orchestrator..."
node server/index.js &
NODE_PID=$!
echo "      -> Node.js server active (PID: $NODE_PID) on port 3001"

# Brief sleep to let services bind
sleep 2

# 4. Check for cloudflared
echo ""
if command -v cloudflared &> /dev/null; then
    echo "================================================================="
    echo "   Launching Cloudflare Quick Tunnel (HTTPS)..."
    echo "   Both actors can connect from any network with working mic!"
    echo "================================================================="
    echo ""
    cloudflared tunnel --url http://localhost:3001
else
    echo "================================================================="
    echo " [NOTE] 'cloudflared' was not found in your PATH."
    echo " To enable free public HTTPS for remote players:"
    echo "   brew install cloudflared"
    echo ""
    echo " Serving locally at:"
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
    echo "   http://$LOCAL_IP:3001"
    echo "   http://localhost:3001"
    echo "================================================================="
    echo "Press Ctrl+C to stop the host."
    wait $NODE_PID
fi
