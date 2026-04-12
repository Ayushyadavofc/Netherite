$ErrorActionPreference = 'Stop'
$env:PYTHONNOUSERSITE = '1'
Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue

function Resolve-PythonCommand {
  $candidates = @(
    @{ Exe = 'py'; Args = @('-3') },
    @{ Exe = 'python'; Args = @() }
  )

  foreach ($candidate in $candidates) {
    try {
      & $candidate.Exe @($candidate.Args + '--version') *> $null
      return $candidate
    } catch {
      continue
    }
  }

  throw 'Python 3 was not found. Install Python 3.10+ on the build machine before packaging Netherite.'
}

function Invoke-PythonCommand {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Python,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & $Python.Exe @($Python.Args + $Arguments)
  if ($LASTEXITCODE -ne 0) {
    $argumentList = ($Python.Args + $Arguments) -join ' '
    throw "Command failed: $($Python.Exe) $argumentList"
  }
}

function Copy-DirectoryContents {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  if (-not (Test-Path $Source)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -Path $Source -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackendRoot = Join-Path $RepoRoot 'prechaos\backend'
$RuntimeRoot = Join-Path $RepoRoot 'prechaos\runtime'
$RuntimeBackendRoot = Join-Path $RuntimeRoot 'backend'
$RuntimeBinRoot = Join-Path $RuntimeBackendRoot 'bin'
$RuntimeDataRoot = Join-Path $RuntimeBackendRoot 'data'
$RuntimeModelRoot = Join-Path $RuntimeBackendRoot 'models'
$BuildVenvRoot = Join-Path $BackendRoot '.venv-build'
$BuildPython = Join-Path $BuildVenvRoot 'Scripts\python.exe'
$PyInstallerWorkRoot = Join-Path $BackendRoot 'build\pyinstaller'
$PyInstallerDistRoot = Join-Path $BackendRoot 'dist\pyinstaller'
$BundledAppRoot = Join-Path $PyInstallerDistRoot 'prechaos-backend'
$BundledExePath = Join-Path $BundledAppRoot 'prechaos-backend.exe'

if (-not (Test-Path $BuildPython)) {
  $pythonBootstrap = Resolve-PythonCommand
  Invoke-PythonCommand -Python $pythonBootstrap -Arguments @('-m', 'venv', $BuildVenvRoot)
}

& $BuildPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to upgrade pip for the PreChaos build environment.'
}

& $BuildPython -m pip install -r (Join-Path $BackendRoot 'requirements.txt') pyinstaller==6.14.1
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to install PreChaos build dependencies.'
}

if (Test-Path $PyInstallerWorkRoot) {
  Remove-Item -LiteralPath $PyInstallerWorkRoot -Recurse -Force
}
if (Test-Path $PyInstallerDistRoot) {
  Remove-Item -LiteralPath $PyInstallerDistRoot -Recurse -Force
}
if (Test-Path $RuntimeRoot) {
  Remove-Item -LiteralPath $RuntimeRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $PyInstallerWorkRoot | Out-Null

& $BuildPython -m PyInstaller `
  --noconfirm `
  --clean `
  --onedir `
  --name prechaos-backend `
  --distpath $PyInstallerDistRoot `
  --workpath $PyInstallerWorkRoot `
  --specpath $PyInstallerWorkRoot `
  --paths $BackendRoot `
  --collect-all uvicorn `
  --collect-all fastapi `
  --collect-all starlette `
  --collect-all anyio `
  --collect-all openpyxl `
  --collect-all pydantic `
  --collect-submodules scipy `
  --collect-data scipy `
  --collect-binaries scipy `
  --collect-submodules sklearn `
  --collect-data sklearn `
  --collect-data numpy `
  --collect-binaries numpy `
  (Join-Path $BackendRoot 'main.py')
if ($LASTEXITCODE -ne 0) {
  throw 'PyInstaller failed to build the standalone PreChaos backend.'
}

if (-not (Test-Path $BundledExePath)) {
  throw "Expected bundled backend executable was not found at $BundledExePath"
}

New-Item -ItemType Directory -Force -Path $RuntimeBinRoot | Out-Null
Copy-Item -LiteralPath $BundledAppRoot -Destination $RuntimeBinRoot -Recurse -Force

New-Item -ItemType Directory -Force -Path $RuntimeDataRoot | Out-Null
$dataSource = Join-Path $BackendRoot 'data'
if (Test-Path $dataSource) {
  Get-ChildItem -Path $dataSource -File | Where-Object {
    $_.Name -notin @('live_samples.jsonl', 'live_events.jsonl', 'prediction_log.jsonl', 'security.log')
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $RuntimeDataRoot $_.Name) -Force
  }
}

Copy-DirectoryContents -Source (Join-Path $BackendRoot 'models') -Destination $RuntimeModelRoot

Write-Host "Bundled PreChaos backend at $BundledExePath"
