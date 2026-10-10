# Roomtour Shorts one-line installer for Windows PowerShell (5.1 and 7+).
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/eziwork/eziwork-roomtour-shorts/main/install.ps1 | iex"
#
# Downloads the skill into %USERPROFILE%\.codex\skills\roomtour-shorts (an existing folder is kept as .bak-<time>),
# checks Node.js / ffmpeg / Python, then installs the free voice engine (Supertonic, about 550 MB).
# Options (set before running):
#   $env:ROOMTOUR_DEST = "$env:USERPROFILE\.claude\skills\roomtour-shorts"   install for Claude Code
#   $env:ROOMTOUR_NO_VOICE = "1"                                             skip the voice engine
#   $env:ROOMTOUR_REF = "v1.1.0"                                             install a specific version
#
# This file is ASCII only: Windows PowerShell 5.1 "irm | iex" does not decode UTF-8, so the Korean
# messages are stored as Base64 UTF-8 and decoded at run time.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
function T([string]$b64) { [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) }
$M_start = T '7ISk7LmYIOychOy5mDog'
$M_backup = T '6riw7KG0IO2PtOuNlOuKlCDrs7TqtIDtlojslrTsmpQ6IA=='
$M_nopy = T 'UHl0aG9u7J20IOyXhuyWtOyalC4gJ3dpbmdldCBpbnN0YWxsIC1lIC0taWQgUHl0aG9uLlB5dGhvbi4zLjEyJ+uhnCDshKTsuZjtlZjqs6AgUG93ZXJTaGVsbOydhCDsg4jroZwg7JewIOuSpCDri6Tsi5wg7Iuk7ZaJ7ZWY7IS47JqULg=='
$M_missing = T '7JyE7JeQICfsl4bsnYwn7Jy866GcIOuCmOyYqCDtlITroZzqt7jrnqjsnYQg7ISk7LmY7ZWcIOuSpCwgUG93ZXJTaGVsbOydhCDsg4jroZwg7Je06rOgIOydtCDshKTsuZgg66qF66C57J2EIOuLpOyLnCDsi6TtlontlZjshLjsmpQu'
$M_done = T '7ISk7LmYIOyZhOujjC4gQ29kZXjrpbwg64uk7IucIOyXtOqzoCDsnbTroIfqsowg7J6F66Cl7ZWY7IS47JqUOg=='
$M_try = T 'ICAkcm9vbXRvdXItc2hvcnRzIOydtCDrp6TrrLwg7JiB7IOBIOumtOyKpOuhnCDrp4zrk6TslrTspJg='

$Repo = 'eziwork/eziwork-roomtour-shorts'
$Ref = if ($env:ROOMTOUR_REF) { $env:ROOMTOUR_REF } else { 'main' }
$Dest = if ($env:ROOMTOUR_DEST) { $env:ROOMTOUR_DEST } else { Join-Path $env:USERPROFILE '.codex\skills\roomtour-shorts' }

Write-Host ($M_start + $Dest)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('roomtour-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'src.zip'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri "https://codeload.github.com/$Repo/zip/$Ref" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp
  $src = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1

  if (Test-Path $Dest) {
    $backup = $Dest + '.bak-' + (Get-Date -Format 'yyyyMMddHHmmss')
    Move-Item -Path $Dest -Destination $backup
    Write-Host ($M_backup + $backup)
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $Dest -Parent) | Out-Null
  Move-Item -Path $src.FullName -Destination $Dest
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# On Windows 'python' can be a Store stub before Python is installed, so test it by running it.
$py = $null
foreach ($cand in @('python', 'py')) {
  $cmd = Get-Command $cand -ErrorAction SilentlyContinue
  if ($cmd) {
    try { & $cmd.Source --version *> $null; if ($LASTEXITCODE -eq 0) { $py = $cmd.Source; break } } catch {}
  }
}
if (-not $py) { Write-Host $M_nopy; exit 1 }

& $py (Join-Path $Dest 'scripts\doctor.py')
if ($LASTEXITCODE -ne 0) { Write-Host ''; Write-Host $M_missing; exit 1 }

if ($env:ROOMTOUR_NO_VOICE -ne '1') {
  & $py (Join-Path $Dest 'scripts\doctor.py') --install
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host ''
Write-Host $M_done
Write-Host $M_try
