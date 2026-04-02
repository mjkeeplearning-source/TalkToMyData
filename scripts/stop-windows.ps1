$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)
docker compose down
