# Deploy NusStream (package -> server HTTP PC -> install+launch su TV via telnet root).
# Uso:
#   .\build.ps1               # package + deploy completo sulla TV
#   .\build.ps1 -NoInstall    # solo package (nessun tocco alla TV)
param([switch]$NoInstall)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 1) versione + package
$version = (Get-Content app\appinfo.json -Raw | ConvertFrom-Json).version
$ipk = "org.nusstream.app_${version}_all.ipk"
if (Test-Path $ipk) { Remove-Item $ipk -Force }
Write-Host "== ares-package (v$version) =="
ares-package app -o .
if (-not (Test-Path $ipk)) { throw "ipk non generato: $ipk" }
Write-Host "OK: $ipk"

if ($NoInstall) { exit 0 }

# 2) server statico sul PC (root apps\, porta 8081) — /nusstream/<ipk> -> apps\nusstream\<ipk>
if (-not (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue)) {
    Write-Host "== avvio server http :8081 (root $PSScriptRoot) =="
    Start-Process python -ArgumentList '-m','http.server','8081','--bind','0.0.0.0','--directory',"$PSScriptRoot" -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

# 3) deploy sulla TV (telnet root, vedi D:\tv\cmds_deploy*.txt)
Write-Host "== deploy su TV =="
python "$PSScriptRoot\deploy.py" $ipk
if ($LASTEXITCODE -ne 0) { throw "deploy fallito (exit $LASTEXITCODE)" }
Write-Host "Fatto."
