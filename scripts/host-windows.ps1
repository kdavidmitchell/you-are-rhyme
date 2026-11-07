# ==============================================================================
# You Are Rhyme -- Dedicated Windows Multiplayer Host and Tunnel Launcher
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# Change directory to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..").Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   YOU ARE RHYME -- THEATRICAL DUELING HOST ORCHESTRATOR (WINDOWS)" -ForegroundColor Cyan
Write-Host "   Hosting Act III, Scene IV: Hamlet vs. Gertrude" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Clean up any stale instances running on port 5000 or 3001
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

# 2. Locate Python Virtual Environment
Write-Host "`n[1/4] Checking Python Whisper environment..." -ForegroundColor White

$PythonExe = $null
if (Test-Path "$ProjectRoot\python\.venv\Scripts\python.exe") {
    $PythonExe = "$ProjectRoot\python\.venv\Scripts\python.exe"
} elseif (Test-Path "$ProjectRoot\python\venv\Scripts\python.exe") {
    $PythonExe = "$ProjectRoot\python\venv\Scripts\python.exe"
} else {
    Write-Host "[!] No existing virtual environment found in python\.venv." -ForegroundColor Yellow
    Write-Host "[!] Looking for system Python to initialize virtualenv..." -ForegroundColor Yellow
    
    $SysPy = $null
    if (Get-Command py -ErrorAction SilentlyContinue) {
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
        Write-Host "[!] Python 3 was not found in PATH." -ForegroundColor Red
        Write-Host "    Please install Python 3.10+ (e.g. via winget install Python.Python.3.11) or rerun setup-and-host-windows.bat" -ForegroundColor Red
        exit 1
    }

    Write-Host "[+] Creating virtual environment in python\.venv..." -ForegroundColor Cyan
    if ($SysPy -like "*uv.exe*") {
        & $SysPy venv "$ProjectRoot\python\.venv"
    } else {
        & $SysPy -m venv "$ProjectRoot\python\.venv"
    }
    $PythonExe = "$ProjectRoot\python\.venv\Scripts\python.exe"
    & "$ProjectRoot\python\.venv\Scripts\pip.exe" install --upgrade pip --quiet
    & "$ProjectRoot\python\.venv\Scripts\pip.exe" install -r "$ProjectRoot\python\requirements.txt" --quiet
}

Write-Host "      -> Using Python: $PythonExe" -ForegroundColor Green

# 3. Build React Production Client
Write-Host "`n[2/4] Building production React client..." -ForegroundColor White
$npmCmd = if (Get-Command "npm.cmd" -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
& $npmCmd run build --prefix client

# 4. Check for cloudflared
$BinDir = "$ProjectRoot\bin"
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}
$env:PATH = "$BinDir;$env:PATH"

$CloudflaredExe = $null
if (Test-Path "$BinDir\cloudflared.exe") {
    $CloudflaredExe = "$BinDir\cloudflared.exe"
} elseif (Get-Command "cloudflared" -ErrorAction SilentlyContinue) {
    $CloudflaredExe = (Get-Command "cloudflared").Source
}

if (-not $CloudflaredExe) {
    Write-Host "`n[+] Downloading Cloudflare Quick Tunnel binary for Windows..." -ForegroundColor Cyan
    $CF_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    $TargetCF = "$BinDir\cloudflared.exe"
    try {
        if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
            curl.exe -sSL "$CF_URL" -o "$TargetCF"
        } else {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $CF_URL -OutFile $TargetCF -UseBasicParsing
        }
        $CloudflaredExe = $TargetCF
        Write-Host "      -> cloudflared binary saved to $CloudflaredExe" -ForegroundColor Green
    } catch {
        Write-Host "      [!] Note: Cloudflared download failed ($_); falling back to local network hosting." -ForegroundColor Yellow
    }
}

# 5. Start Background Microservices
Write-Host "`n[3/4] Starting Python transcription microservice (Whisper)..." -ForegroundColor White
$pyProcess = Start-Process -FilePath $PythonExe -ArgumentList "python\transcriber.py" -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow
Write-Host "      -> Python Whisper active (PID: $($pyProcess.Id)) on port 5000" -ForegroundColor Green

Write-Host "`n[4/4] Starting Node.js Socket.io Orchestrator..." -ForegroundColor White
$nodeProcess = Start-Process -FilePath "node" -ArgumentList "server\index.js" -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow
Write-Host "      -> Node.js server active (PID: $($nodeProcess.Id)) on port 3001" -ForegroundColor Green

# Brief wait to ensure ports bind
Start-Sleep -Seconds 2

# Resolve Local IPs for LAN display
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
        Write-Host "Starting Cloudflare Quick Tunnel for remote HTTPS and microphone..." -ForegroundColor Cyan
        Write-Host "The public HTTPS link will be automatically extracted and opened in your browser!`n" -ForegroundColor Yellow
        Write-Host "Press Ctrl+C to terminate the host and all background services." -ForegroundColor Gray
        Write-Host "=================================================================`n" -ForegroundColor Cyan

        $cfOpened = $false
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & $CloudflaredExe tunnel --url http://localhost:3001 2>&1 | ForEach-Object {
                $line = $_.ToString()
                Write-Host $line
                if (-not $cfOpened -and $line -match "(https://[a-zA-Z0-9.-]+\.trycloudflare\.com)") {
                    $cfUrl = $matches[1]
                    $cfOpened = $true
                    Write-Host "`n=================================================================" -ForegroundColor Green
                    Write-Host "   [Host] Cloudflare Quick Tunnel Established!" -ForegroundColor Green
                    Write-Host "   Opening chamber in your browser: $cfUrl" -ForegroundColor Yellow
                    Write-Host "=================================================================`n" -ForegroundColor Green
                    try {
                        Start-Process $cfUrl
                    } catch {
                        Write-Host "      [!] Could not launch browser automatically: $_" -ForegroundColor Yellow
                    }
                }
            }
        } finally {
            $ErrorActionPreference = $prevEAP
        }
    } else {
        Write-Host "`n[NOTE] 'cloudflared' was not found. Remote players over LAN can use http://<LAN-IP>:3001" -ForegroundColor Yellow
        Write-Host "Opening local chamber http://localhost:3001 in your browser..." -ForegroundColor Cyan
        try { Start-Process "http://localhost:3001" } catch {}
        Write-Host "Press Ctrl+C to stop the host." -ForegroundColor Gray
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
