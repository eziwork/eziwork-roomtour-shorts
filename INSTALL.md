# Windows · macOS 설치

## 1. 준비물

| 프로그램 | Windows (PowerShell) | macOS (터미널) |
|---|---|---|
| Node.js 18 이상 | `winget install -e --id OpenJS.NodeJS.LTS` | `brew install node` |
| ffmpeg | `winget install -e --id Gyan.FFmpeg` | `brew install ffmpeg` |
| Python 3.9 이상 | `winget install -e --id Python.Python.3.12` | `brew install python` |

설치 후 터미널을 새로 엽니다. `scripts/doctor.py`가 빠진 것만 골라 이 명령을 보여 줍니다.

## 2. 스킬 넣기

이 저장소를 내려받아 **폴더 이름을 `roomtour-shorts`로** 두고 Codex 스킬 폴더에 넣습니다. 아래 명령은 이름을 바꿔 받습니다.

Windows:
```powershell
git clone https://github.com/eziwork/eziwork-roomtour-shorts "$env:USERPROFILE\.codex\skills\roomtour-shorts"
cd "$env:USERPROFILE\.codex\skills\roomtour-shorts"
python scripts\doctor.py
python scripts\doctor.py --install
```

macOS:
```sh
git clone https://github.com/eziwork/eziwork-roomtour-shorts ~/.codex/skills/roomtour-shorts
cd ~/.codex/skills/roomtour-shorts
python3 scripts/doctor.py
python3 scripts/doctor.py --install
```

`--install`은 무료 음성 엔진 Supertonic을 `~/.roomtour-shorts/venv`(Windows: `%USERPROFILE%\.roomtour-shorts\venv`)에 설치하고 음성 모델(약 385MB)을 받습니다. 목소리를 쓰지 않으면 건너뛰어도 됩니다.

Claude Code에서 쓰려면 같은 폴더를 `~/.claude/skills/roomtour-shorts`에 넣습니다.

## 3. 확인

```
python scripts/selftest.py
```

ffmpeg로 만든 시험 영상에 네 버전을 모두 적용해 렌더링합니다. `자체 점검 통과`가 나오면 준비가 끝난 것입니다. 처음 실행은 HyperFrames를 받느라 몇 분 걸릴 수 있습니다.

## 4. 유료 Gemini 목소리 (선택)

기본 목소리(Supertonic)는 키가 필요 없습니다. Gemini 목소리를 쓰려면 키를 한 번 저장합니다. 키는 숨김 입력으로 받고, 채팅이나 프로젝트 폴더에 남기지 않습니다.

```
python scripts/tts.py --setup
```

## 문제 해결

- **Codex에서 `Failed to launch the browser process` / `Permission denied`**: 샌드박스가 크롬을 막은 것입니다. Codex가 권한 상승을 요청하면 허용하세요.
- **`Supertonic 환경이 없어요`**: `python scripts/doctor.py --install`을 실행합니다.
- **배경음 검색이 `429`로 실패**: 공개 API의 하루 200회 한도입니다. 잠시 후 다시 시도하세요.
