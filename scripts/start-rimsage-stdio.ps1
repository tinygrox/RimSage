param(
  [string]$Game = $env:RIMSAGE_GAME
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$entrypoint = Join-Path $repoRoot 'src/stdio.ts'

$bunCandidates = [System.Collections.Generic.List[string]]::new()
if ($env:RIMSAGE_BUN_PATH) {
  [void]$bunCandidates.Add($env:RIMSAGE_BUN_PATH)
}

try {
  $bunCommand = Get-Command bun -ErrorAction Stop
  if ($bunCommand.Source) {
    [void]$bunCandidates.Add($bunCommand.Source)
  }
} catch {
}

if ($env:USERPROFILE) {
  [void]$bunCandidates.Add((Join-Path $env:USERPROFILE '.bun\bin\bun.exe'))
}

$bunPath = $bunCandidates |
  Where-Object { $_ -and (Test-Path $_) } |
  Select-Object -Unique -First 1

if (-not $bunPath) {
  throw 'Bun executable not found. Set RIMSAGE_BUN_PATH or add bun to PATH.'
}

if ([string]::IsNullOrWhiteSpace($Game)) {
  $Game = 'rimworld'
}

$env:RIMSAGE_GAME = $Game

Push-Location $repoRoot
try {
  & $bunPath run $entrypoint
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
