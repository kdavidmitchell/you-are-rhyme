# ==============================================================================
# You Are Rhyme — Turnkey Windows Setup & Multiplayer Host Launcher
# Clones repo (branch kyle-multiplayer), installs dependencies, and launches host.
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   YOU ARE RHYME — WINDOWS HOSTING & AUTOMATIC MULTIPLAYER SETUP" -ForegroundColor Cyan
Write-Host "   Act III, Scene IV: Hamlet vs. Queen Gertrude" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check for Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Git is required but was not found in PATH." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "[+] Installing Git via winget..." -ForegroundColor Cyan
        winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
    } else {
        Write-Host "    Please install Git for Windows from https://git-scm.com/download/win and rerun." -ForegroundColor Red
        exit 1
    }
}
Write-Host "[+] Git detected ($((git --version).Trim()))." -ForegroundColor Green

# 2. Check for Node & npm
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Node.js is required but was not found in PATH." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "[+] Installing Node.js LTS via winget..." -ForegroundColor Cyan
        winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    } else {
        Write-Host "    Please install Node.js (v18+) from https://nodejs.org and rerun." -ForegroundColor Red
        exit 1
    }
}
$npmCmd = if (Get-Command "npm.cmd" -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
Write-Host "[+] Node.js detected ($((node -v).Trim())) and npm ($((& $npmCmd -v).Trim()))." -ForegroundColor Green

# 3. Check for Python 3
$SysPy = $null
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "$ScriptDir\..\python\.venv\Scripts\python.exe") {
    $SysPy = (Resolve-Path "$ScriptDir\..\python\.venv\Scripts\python.exe").Path
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $SysPy = "py"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    try {
        $ver = & python --version 2>&1
        if ($ver -match "Python 3\.") {
            $SysPy = "python"
        }
    } catch {}
}

if (-not $SysPy -and (Test-Path "$HOME\.local\bin\uv.exe")) {
    $SysPy = "$HOME\.local\bin\uv.exe"
}

if (-not $SysPy) {
    Write-Host "[!] Python 3 is required but was not found." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "[+] Installing Python 3.11 via winget..." -ForegroundColor Cyan
        winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
        $SysPy = "py"
    } else {
        Write-Host "    Please install Python 3.10+ from https://python.org or Microsoft Store." -ForegroundColor Red
        exit 1
    }
}
Write-Host "[+] Python detected: $SysPy" -ForegroundColor Green

# 4. Clone or Update the Repository
$REPO_URL = "https://github.com/kdavidmitchell/you-are-rhyme.git"
$BRANCH = "kyle-multiplayer"

$CurrentDir = (Get-Location).Path
$TARGET_DIR = $null

if (Test-Path "$CurrentDir\server\index.js" -and Test-Path "$CurrentDir\client\package.json") {
    $TARGET_DIR = $CurrentDir
    Write-Host "[+] Running inside existing repository at $TARGET_DIR." -ForegroundColor Green
} else {
    $TARGET_DIR = "$HOME\you-are-rhyme"
    if (Test-Path "$TARGET_DIR\.git") {
        Write-Host "[+] Repository already exists at $TARGET_DIR. Updating to latest $BRANCH..." -ForegroundColor Cyan
        Set-Location $TARGET_DIR
        git fetch origin
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
    } else {
        Write-Host "[+] Cloning $REPO_URL (branch: $BRANCH) to $TARGET_DIR..." -ForegroundColor Cyan
        git clone -b "$BRANCH" "$REPO_URL" "$TARGET_DIR"
        Set-Location $TARGET_DIR
    }
}

Set-Location $TARGET_DIR

# 5. Clean up any stale instances running on port 5000 or 3001
function Clean-Port([int]$Port) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $connections) {
            $pidToKill = $conn.OwningProcess
            if ($pidToKill -and $pidToKill -ne $PID) {
                Write-Host "[Host] Reclaiming port $Port from existing process (PID: $pidToKill)..." -ForegroundColor Yellow
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

Clean-Port 5000
Clean-Port 3001

# 6. Python Virtual Environment Setup & Dependencies
Write-Host "`n[1/4] Setting up Python virtual environment & faster-whisper..." -ForegroundColor White
$VenvPython = "$TARGET_DIR\python\.venv\Scripts\python.exe"
$VenvPip = "$TARGET_DIR\python\.venv\Scripts\pip.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "      -> Creating virtualenv in python\.venv..." -ForegroundColor Cyan
    if ($SysPy -like "*uv.exe*") {
        & $SysPy venv "$TARGET_DIR\python\.venv"
    } else {
        & $SysPy -m venv "$TARGET_DIR\python\.venv"
    }
}

& $VenvPip install --upgrade pip --quiet
& $VenvPip install -r "$TARGET_DIR\python\requirements.txt" --quiet
Write-Host "      -> Python dependencies verified." -ForegroundColor Green

# 7. Node Dependencies & Client Build
Write-Host "`n[2/4] Installing Node dependencies and building React production bundle..." -ForegroundColor White
& $npmCmd install --quiet
& $npmCmd install --prefix server --quiet
& $npmCmd install --prefix client --quiet
& $npmCmd run build --prefix client

# 8. Ensure cloudflared is available (Automatic Download if missing)
$BIN_DIR = "$TARGET_DIR\bin"
if (-not (Test-Path $BIN_DIR)) {
    New-Item -ItemType Directory -Path $BIN_DIR -Force | Out-Null
}
$env:PATH = "$BIN_DIR;$env:PATH"

$CloudflaredExe = "$BIN_DIR\cloudflared.exe"
if (-not (Test-Path $CloudflaredExe)) {
    if (Get-Command "cloudflared" -ErrorAction SilentlyContinue) {
        $CloudflaredExe = (Get-Command "cloudflared").Source
    } else {
        Write-Host "`n[+] Obtaining Cloudflare Quick Tunnel binary for Windows..." -ForegroundColor Cyan
        $CF_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        try {
            if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
                curl.exe -sSL "$CF_URL" -o "$CloudflaredExe"
            } else {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri $CF_URL -OutFile $CloudflaredExe -UseBasicParsing
            }
            Write-Host "      -> cloudflared binary installed to $CloudflaredExe" -ForegroundColor Green
        } catch {
            Write-Host "      [!] Note: Cloudflared download failed ($_); falling back to local network hosting." -ForegroundColor Yellow
        }
    }
}

# 9. Launch Python Whisper Microservice
Write-Host "`n[3/4] Launching Python Whisper transcription engine (Port 5000)..." -ForegroundColor White
$pyProcess = Start-Process -FilePath $VenvPython -ArgumentList "python\transcriber.py" -WorkingDirectory $TARGET_DIR -PassThru -NoNewWindow
Start-Sleep -Seconds 2

# 10. Launch Node.js Socket.io Orchestrator
Write-Host "`n[4/4] Launching Node.js Orchestrator & Static Web Server (Port 3001)..." -ForegroundColor White
$nodeProcess = Start-Process -FilePath "node" -ArgumentList "server\index.js" -WorkingDirectory $TARGET_DIR -PassThru -NoNewWindow
Start-Sleep -Seconds 2

# 11. Launch Tunnel & Host Loop
$LocalIPs = @()
try {
    $LocalIPs = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }).IPAddress
} catch {}

try {
    Write-Host "`n=================================================================" -ForegroundColor Cyan
    Write-Host "   YOU ARE RHYME IS NOW LIVE ON YOUR WINDOWS HOST!" -ForegroundColor Green
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "Local host access:   http://localhost:3001" -ForegroundColor White
    foreach ($ip in $LocalIPs) {
        Write-Host "Local network (LAN): http://${ip}:3001" -ForegroundColor White
    }
    Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

    if ($CloudflaredExe -and (Test-Path $CloudflaredExe)) {
        Write-Host "Starting Cloudflare Quick Tunnel for remote HTTPS & microphone..." -ForegroundColor Cyan
        Write-Host "Watch the logs below for your public https://*.trycloudflare.com link!`n" -ForegroundColor Yellow
        Write-Host "Press Ctrl+C to stop the host." -ForegroundColor Gray
        Write-Host "=================================================================`n" -ForegroundColor Cyan
        & $CloudflaredExe tunnel --url http://localhost:3001
    } else {
        Write-Host "`nServing locally. Press Ctrl+C to stop the host." -ForegroundColor Gray
        Write-Host "=================================================================`n" -ForegroundColor Cyan
        Wait-Process -Id $nodeProcess.Id
    }
} finally {
    Write-Host "`n[Host] Discharging stagecraft and terminating child processes..." -ForegroundColor Yellow
    if ($pyProcess -and -not $pyProcess.HasExited) {
        Stop-Process -Id $pyProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($nodeProcess -and -not $nodeProcess.HasExited) {
        Stop-Process -Id $nodeProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[Host] Chamber closed. All actors discharged." -ForegroundColor Green
}
