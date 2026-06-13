# deploy.ps1 — one command to ship everything.
#
#   ./deploy.ps1 "what I changed"
#
# Commits all changes and pushes to main. GitHub Actions then:
#   - rebuilds the site  (pages.yml)
#   - redeploys the AI function IF you touched app/supabase/functions (functions.yml)
#
# No Supabase CLI needed locally. First push opens a GitHub login window.

param(
  [Parameter(Mandatory = $false)]
  [string]$Message = "update"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

git add -A

# nothing staged? bail politely
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "Nothing to deploy — no changes." -ForegroundColor Yellow
  exit 0
}

Write-Host "Committing:" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "  $_" }

git commit -m $Message
git push origin main

Write-Host ""
Write-Host "Pushed. Watch the build: https://github.com/Fezmustafah/Document-maker/actions" -ForegroundColor Green
Write-Host "Site live in ~90s. AI function redeploys only if you changed app/supabase/functions." -ForegroundColor Green
