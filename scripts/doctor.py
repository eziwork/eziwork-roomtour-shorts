#!/usr/bin/env python3
"""Check (and optionally set up) everything roomtour-shorts needs. Works on Windows, macOS and Linux.

Usage:
  python doctor.py            # check only: prints what is missing and the exact install command for this OS
  python doctor.py --install  # also creates the Supertonic voice environment (~/.roomtour-shorts/venv) and
                              # downloads the voice model once (needs internet; Codex will ask for approval)

Node.js, ffmpeg and Python themselves are never installed silently: the user runs the printed command.
"""
import os, platform, shutil, subprocess, sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WIN = os.name == "nt"
MAC = platform.system() == "Darwin"
HOME_DIR = os.path.join(os.path.expanduser("~"), ".roomtour-shorts")
VENV = os.path.join(HOME_DIR, "venv")
VENV_PY = os.path.join(VENV, "Scripts", "python.exe") if WIN else os.path.join(VENV, "bin", "python")

INSTALL = {
    "node": {"win": "winget install -e --id OpenJS.NodeJS.LTS", "mac": "brew install node", "linux": "sudo apt install nodejs npm"},
    "ffmpeg": {"win": "winget install -e --id Gyan.FFmpeg", "mac": "brew install ffmpeg", "linux": "sudo apt install ffmpeg"},
    "python": {"win": "winget install -e --id Python.Python.3.12", "mac": "brew install python", "linux": "sudo apt install python3 python3-venv"},
}
OSK = "win" if WIN else "mac" if MAC else "linux"


def run(cmd):
    try:
        exe = shutil.which(cmd[0])
        if not exe:
            return None
        r = subprocess.run([exe] + cmd[1:], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        return (r.stdout + r.stderr).strip()
    except Exception:
        return None


def check():
    rows, missing = [], []
    node = run(["node", "--version"])
    ok = bool(node) and int(node.lstrip("v").split(".")[0]) >= 18
    rows.append(("Node.js 18+", node or "없음", ok)); ok or missing.append("node")
    npx = shutil.which("npx")
    rows.append(("npx", "있음" if npx else "없음", bool(npx)))
    for tool in ("ffmpeg", "ffprobe"):
        v = run([tool, "-version"])
        rows.append((tool, v.splitlines()[0][:40] if v else "없음", bool(v)))
        if not v and "ffmpeg" not in missing:
            missing.append("ffmpeg")
    py_ok = sys.version_info >= (3, 9)
    rows.append(("Python 3.9+", platform.python_version(), py_ok)); py_ok or missing.append("python")
    st = os.path.exists(VENV_PY) and subprocess.run([VENV_PY, "-c", "import supertonic"], capture_output=True).returncode == 0
    rows.append(("Supertonic 목소리 환경", VENV if st else "아직 없음 (--install 로 설치)", st))
    print("roomtour-shorts 준비물 점검\n")
    for name, val, good in rows:
        print(f"  {'OK ' if good else '없음'}  {name:<22} {val}")
    if missing:
        print("\n아래 명령을 사용자가 자기 터미널에서 실행해 설치해야 해요" + (" (PowerShell)" if WIN else "") + ":")
        for m in missing:
            print(f"  {INSTALL[m][OSK]}")
        print("설치 후 터미널을 새로 열고 다시 점검하세요.")
    return not missing, st


def install_supertonic():
    os.makedirs(HOME_DIR, exist_ok=True)
    if not os.path.exists(VENV_PY):
        print(f"\nSupertonic 환경 만드는 중: {VENV}")
        subprocess.run([sys.executable, "-m", "venv", VENV], check=True)
    print("supertonic 패키지 설치 중 (pip)...")
    subprocess.run([VENV_PY, "-m", "pip", "install", "--upgrade", "pip", "-q"], check=True)
    subprocess.run([VENV_PY, "-m", "pip", "install", "supertonic==1.3.1", "-q"], check=True)
    print("음성 모델 받는 중 (처음 한 번)...")
    code = ("from supertonic import TTS; t=TTS(auto_download=True); "
            "s=t.get_voice_style(voice_name='F1'); w,_=t.synthesize(text='준비됐어요.', lang='ko', voice_style=s, total_steps=8); print('ok')")
    r = subprocess.run([VENV_PY, "-c", code], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if "ok" not in r.stdout:
        sys.exit("모델 준비 실패:\n" + r.stderr[-1500:])
    print("Supertonic 준비 완료.")


if __name__ == "__main__":
    base_ok, st_ok = check()
    if "--install" in sys.argv:
        if not base_ok:
            sys.exit("\n먼저 위 프로그램을 설치하세요.")
        if not st_ok:
            install_supertonic()
            check()
    sys.exit(0 if base_ok else 1)
