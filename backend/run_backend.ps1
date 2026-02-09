# Run Backend Server with Correct Virtual Environment
# This script ensures that the project's venv is used, bypassing any Anaconda or global Python path conflicts.

$BackendDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $BackendDir

$VenvPath = Join-Path $BackendDir "venv"
$PythonExe = Join-Path $VenvPath "Scripts" "python.exe"
$UvicornExe = Join-Path $VenvPath "Scripts" "uvicorn.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Error "Virtual environment not found at $VenvPath. Please create it first."
    exit 1
}

Write-Host "Starting Backend with Virtual Environment: $VenvPath" -ForegroundColor Cyan

# Force use of the venv's uvicorn and python
& $PythonExe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
