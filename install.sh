#!/usr/bin/env bash
# Roomtour Shorts 한 줄 설치 (macOS · Linux)
#   curl -fsSL https://raw.githubusercontent.com/eziwork/eziwork-roomtour-shorts/main/install.sh | bash
#
# 하는 일: 최신 스킬을 받아 ~/.codex/skills/roomtour-shorts 에 놓고(기존 폴더는 .bak-날짜 로 보관),
#          준비물을 점검한 뒤 무료 음성 엔진(Supertonic, 약 550MB)을 설치합니다.
# 바꾸고 싶으면:
#   ROOMTOUR_DEST=~/.claude/skills/roomtour-shorts   Claude Code에 설치
#   ROOMTOUR_NO_VOICE=1                              음성 엔진 설치 건너뛰기
#   ROOMTOUR_REF=v1.1.0                              특정 버전 설치
set -euo pipefail

REPO="eziwork/eziwork-roomtour-shorts"
REF="${ROOMTOUR_REF:-main}"
DEST="${ROOMTOUR_DEST:-$HOME/.codex/skills/roomtour-shorts}"

echo "Roomtour Shorts 설치: $DEST"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$tmp"
src="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  backup="$DEST.bak-$(date +%Y%m%d%H%M%S)"
  mv "$DEST" "$backup"
  echo "기존 폴더는 보관했어요: $backup"
fi
mkdir -p "$(dirname "$DEST")"
mv "$src" "$DEST"

PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo "Python이 없어요. 'brew install python'으로 설치한 뒤 다시 실행하세요."
  exit 1
fi

if ! "$PY" "$DEST/scripts/doctor.py"; then
  echo
  echo "위에 '없음'으로 나온 프로그램을 설치한 뒤, 터미널을 새로 열고 이 설치 명령을 다시 실행하세요."
  exit 1
fi

if [ "${ROOMTOUR_NO_VOICE:-0}" != "1" ]; then
  "$PY" "$DEST/scripts/doctor.py" --install
fi

echo
echo "설치 완료. Codex를 다시 열고 이렇게 입력하세요:"
echo '  $roomtour-shorts 이 매물 영상 릴스로 만들어줘'
