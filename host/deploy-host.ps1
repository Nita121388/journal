# deploy-host.ps1 - deploy the Journal host to a target directory and register
# its native-messaging entry.
#
# Design note: the native-messaging launcher (journal-host-launcher.exe) spawns
# `node server.js` with cwd = its own directory and injects NO environment
# variables. Therefore the deployed server.js source decides the defaults:
#   main branch source      -> DEFAULT_PORT 8765
#   dev/local branch source -> DEFAULT_PORT 8766
# and the data directory is always <deploy dir>\data (a junction).
# That is why this script refuses to deploy when the source default port does
# not match the requested port: it is the only guard against copying dev
# source into the prod directory (or the other way around).
#
# ASCII-only on purpose: PowerShell 5.1 reads BOM-less files as ANSI, so
# non-ASCII text here would come out as mojibake.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('prod', 'dev')][string]$Variant,
  [Parameter(Mandatory = $true)][string]$TargetDir,
  [Parameter(Mandatory = $true)][string]$DataDir,
  [Parameter(Mandatory = $true)][string]$HostName,
  [int]$Port = 0,
  [string[]]$ExtensionIds,
  # Only (re)write the native-messaging manifest (+ registry). Useful to shrink
  # allowed_origins on an already-running deployment without touching source.
  [switch]$ManifestOnly,
  [switch]$NoRegister
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$HostSrc = Join-Path $RepoRoot 'host'
$Launcher = Join-Path $HostSrc 'journal-host-launcher.exe'

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "launcher not found: $Launcher (expected the checked-in prebuilt binary)"
}

# ---- guard 1: source default port must match the requested port ------------
if (-not $ManifestOnly) {
  if ($Port -le 0) { throw '-Port is required unless -ManifestOnly is used' }

  $serverJs = Get-Content -LiteralPath (Join-Path $HostSrc 'server.js') -Raw
  $m = [regex]::Match($serverJs, 'const DEFAULT_PORT\s*=\s*(\d+)')
  if (-not $m.Success) { throw 'cannot find "const DEFAULT_PORT = <n>" in host/server.js' }
  $srcPort = [int]$m.Groups[1].Value
  if ($srcPort -ne $Port) {
    throw ("port mismatch: host/server.js DEFAULT_PORT=$srcPort but -Port=$Port. " +
           "Refusing to deploy: check out the '$Variant' branch (main=8765, dev/local=8766) " +
           "or correct the parameters.")
  }
}

# ---- extension ids ---------------------------------------------------------
if (-not $ExtensionIds -or $ExtensionIds.Count -eq 0) {
  $idFile = Join-Path $HostSrc 'extension-ids.txt'
  if (-not (Test-Path -LiteralPath $idFile)) {
    throw 'no -ExtensionIds given and host/extension-ids.txt is missing'
  }
  $ExtensionIds = @(Get-Content -LiteralPath $idFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
}
$origins = @($ExtensionIds | ForEach-Object { "chrome-extension://$_/" })

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

# ---- copy source (never deletes anything in the target) --------------------
if (-not $ManifestOnly) {
  $files = @(
    'server.js', 'package.json', 'cli.mjs', 'auto-summary.mjs', 'README.md',
    'extension-ids.txt', 'install-auto.bat'
  )
  # install-host.bat hardcodes the prod host name; copying it into the dev
  # directory would let a stray run hijack com.journal.host. Dev uses this
  # script instead.
  if ($Variant -eq 'prod') { $files += 'install-host.bat' }
  foreach ($f in $files) {
    $src = Join-Path $HostSrc $f
    if (-not (Test-Path -LiteralPath $src)) { throw "missing source file: $src" }
    Copy-Item -LiteralPath $src -Destination (Join-Path $TargetDir $f) -Force
  }
  foreach ($d in @('lib', 'sync')) {
    $src = Join-Path $HostSrc $d
    $dst = Join-Path $TargetDir $d
    if (-not (Test-Path -LiteralPath $src)) { throw "missing source dir: $src" }
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
  }
  Copy-Item -LiteralPath $Launcher -Destination (Join-Path $TargetDir 'journal-host-launcher.exe') -Force

  # server.js / lib / sync import ../../extension/shared/*.js
  $siblingExt = Join-Path (Split-Path -Parent $TargetDir) 'extension\shared'
  if (-not (Test-Path -LiteralPath $siblingExt)) {
    Write-Warning "sibling extension\shared not found next to $TargetDir - the deployed host will fail to import shared modules."
  }

  # ---- data junction -------------------------------------------------------
  $dataLink = Join-Path $TargetDir 'data'
  $dataResolved = [System.IO.Path]::GetFullPath($DataDir)
  if (Test-Path -LiteralPath $dataLink) {
    $item = Get-Item -LiteralPath $dataLink -Force
    $target = $null
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      $target = $item.Target
      if ($target -is [array]) { $target = $target[0] }
    }
    if (-not $target) {
      throw ("data path exists and is NOT a junction: $dataLink. " +
             "Refusing to deploy over a directory that may hold a live database.")
    }
    if ([System.IO.Path]::GetFullPath($target).TrimEnd('\') -ne $dataResolved.TrimEnd('\')) {
      throw "data junction points elsewhere: $dataLink -> $target (expected $dataResolved)"
    }
  } else {
    if (-not (Test-Path -LiteralPath $DataDir)) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null }
    & cmd.exe /c "mklink /J `"$dataLink`" `"$dataResolved`""
    if ($LASTEXITCODE -ne 0) { throw "mklink /J failed: $dataLink -> $dataResolved" }
  }
}

# ---- native messaging manifest --------------------------------------------
$manifestPath = Join-Path $TargetDir "$HostName.json"
$manifest = [ordered]@{
  name            = $HostName
  description     = "Journal host launcher ($Variant)"
  path            = (Join-Path $TargetDir 'journal-host-launcher.exe')
  type            = 'stdio'
  allowed_origins = @($origins)
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding ascii

# ---- registry (Chrome + Edge, per-user) -----------------------------------
$registered = @()
if (-not $NoRegister) {
  $browsers = @('Google\Chrome', 'Microsoft\Edge')
  foreach ($b in $browsers) {
    $key = "HKCU:\Software\$b\NativeMessagingHosts\$HostName"
    New-Item -Path $key -Force | Out-Null
    Set-ItemProperty -Path $key -Name '(default)' -Value $manifestPath
    $registered += $key
  }
}

# ---- receipt ---------------------------------------------------------------
Write-Host ''
Write-Host "[deploy-host] variant   : $Variant"
Write-Host "[deploy-host] host name : $HostName"
Write-Host "[deploy-host] port      : $(if ($ManifestOnly) { '(source unchanged)' } else { $Port })"
Write-Host "[deploy-host] target    : $TargetDir"
if (-not $ManifestOnly) {
  Write-Host "[deploy-host] data      : $DataDir (junction at $TargetDir\data)"
  Write-Host "[deploy-host] source    : $HostSrc"
}
Write-Host "[deploy-host] manifest  : $manifestPath"
Write-Host "[deploy-host] origins   : $($origins -join ', ')"
if ($registered.Count -gt 0) {
  foreach ($k in $registered) { Write-Host "[deploy-host] registry  : $k" }
} else {
  Write-Host '[deploy-host] registry  : skipped (-NoRegister)'
}
Write-Host ''
