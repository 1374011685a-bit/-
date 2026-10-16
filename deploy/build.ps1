# Build and push the Block Jump image (Windows / PowerShell).
#
#   .\deploy\build.ps1 -Image docker.io/yourname/block-jump:1.0
#
# Needs Docker Desktop (or any docker CLI) running and `docker login` done for
# the registry you push to.

param(
    [string]$Image = "docker.io/YOUR_DOCKERHUB_NAME/block-jump:1.0"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Building $Image from $root" -ForegroundColor Cyan
docker build -t $Image $root
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "Pushing $Image" -ForegroundColor Cyan
docker push $Image
if ($LASTEXITCODE -ne 0) { throw "docker push failed" }

Write-Host "Done. Now create the app on Sealos with port 80 (see deploy/DEPLOY.md)." -ForegroundColor Green
