$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

if (-not (Test-Path ".env")) {
    Write-Error "Error: .env file not found. Copy .env.example and fill in your values."
    exit 1
}

try {
    docker info > $null 2>&1
} catch {
    Write-Error "Error: Docker is not running. Start Docker Desktop and try again."
    exit 1
}

docker compose up --build -d
Write-Host "App running at http://localhost:8000"
