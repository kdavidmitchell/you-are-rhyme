#!/usr/bin/env bash
# ==============================================================================
# You Are Rhyme -- Windows Host Launcher for Bash (Git Bash / MSYS2 / WSL)
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "================================================================="
echo "   YOU ARE RHYME -- WINDOWS HOST LAUNCHER (BASH)"
echo "   Act III, Scene IV: Hamlet vs. Gertrude"
echo "================================================================="

# Launch host-windows.ps1 with ExecutionPolicy Bypass via Windows PowerShell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PROJECT_ROOT/scripts/host-windows.ps1"
