#!/usr/bin/env bash
# ==============================================================================
# You Are Rhyme -- Turnkey Windows Setup & Host for Bash (Git Bash / MSYS2 / WSL)
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "================================================================="
echo "   YOU ARE RHYME -- TURNKEY WINDOWS SETUP & HOST (BASH)"
echo "   Act III, Scene IV: Hamlet vs. Gertrude"
echo "================================================================="

# Launch setup-and-host-windows.ps1 with ExecutionPolicy Bypass via Windows PowerShell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PROJECT_ROOT/scripts/setup-and-host-windows.ps1"
