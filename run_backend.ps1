# Run Root Backend (Alternative)
# This script uses the root .venv if preferred.

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $RootDir

$VenvPath = Join-Path $RootDir "backend\venv"
$PythonExe = Join-Path $VenvPath "Scripts" "python.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Error "Virtual environment not found at $VenvPath."
    exit 1
}

Write-Host "Starting Backend from Root with Virtual Environment: $VenvPath" -ForegroundColor Cyan

# Change to backend dir for execution context
Set-Location (Join-Path $RootDir "backend")
& $PythonExe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
