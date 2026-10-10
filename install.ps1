# Roomtour Shorts 한 줄 설치 (Windows PowerShell)
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/eziwork/eziwork-roomtour-shorts/main/install.ps1 | iex"
#
# 하는 일: 최신 스킬을 받아 %USERPROFILE%\.codex\skills\roomtour-shorts 에 놓고(기존 폴더는 .bak-날짜 로 보관),
#          준비물을 점검한 뒤 무료 음성 엔진(Supertonic, 약 550MB)을 설치합니다.
# 바꾸고 싶으면 실행 전에:
#   $env:ROOMTOUR_DEST = "$env:USERPROFILE\.claude\skills\roomtour-shorts"   Claude Code에 설치
#   $env:ROOMTOUR_NO_VOICE = "1"                                             음성 엔진 설치 건너뛰기
#   $env:ROOMTOUR_REF = "v1.1.0"                                             특정 버전 설치
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'

$Repo = 'eziwork/eziwork-roomtour-shorts'
$Ref = if ($env:ROOMTOUR_REF) { $env:ROOMTOUR_REF } else { 'main' }
$Dest = if ($env:ROOMTOUR_DEST) { $env:ROOMTOUR_DEST } else { Join-Path $env:USERPROFILE '.codex\skills\roomtour-shorts' }

Write-Host "Roomtour Shorts 설치: $Dest"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('roomtour-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'src.zip'
  Invoke-WebRequest -Uri "https://codeload.github.com/$Repo/zip/$Ref" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp
  $src = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1

  if (Test-Path $Dest) {
    $backup = $Dest + '.bak-' + (Get-Date -Format 'yyyyMMddHHmmss')
    Move-Item -Path $Dest -Destination $backup
    Write-Host "기존 폴더는 보관했어요: $backup"
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $Dest -Parent) | Out-Null
  Move-Item -Path $src.FullName -Destination $Dest
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# Windows의 'python'은 설치 전이면 스토어 안내만 띄우는 가짜 명령일 수 있어 실제 실행으로 확인한다
$py = $null
foreach ($cand in @('python', 'py')) {
  $cmd = Get-Command $cand -ErrorAction SilentlyContinue
  if ($cmd) {
    try { & $cmd.Source --version *> $null; if ($LASTEXITCODE -eq 0) { $py = $cmd.Source; break } } catch {}
  }
}
if (-not $py) {
  Write-Host "Python이 없어요. 'winget install -e --id Python.Python.3.12'로 설치하고 PowerShell을 새로 연 뒤 다시 실행하세요."
  exit 1
}

& $py (Join-Path $Dest 'scripts\doctor.py')
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "위에 '없음'으로 나온 프로그램을 설치한 뒤, PowerShell을 새로 열고 이 설치 명령을 다시 실행하세요."
  exit 1
}

if ($env:ROOMTOUR_NO_VOICE -ne '1') {
  & $py (Join-Path $Dest 'scripts\doctor.py') --install
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host ""
Write-Host "설치 완료. Codex를 다시 열고 이렇게 입력하세요:"
Write-Host '  $roomtour-shorts 이 매물 영상 릴스로 만들어줘'
