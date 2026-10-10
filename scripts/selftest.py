#!/usr/bin/env python3
"""End-to-end check on a synthetic clip (no real footage, no network except first-time downloads).

Usage:
  python selftest.py [work-dir] [--no-voice] [--no-render]

Makes a 6-second 1080x1920 test video with ffmpeg, then runs the real pipeline on it for every style:
new_project.py -> spec.json -> (tts.py, Supertonic) -> build.mjs -> hyperframes render.
Exits non-zero on the first failure. Used by the GitHub Actions check on Windows and macOS.
"""
import json, os, shutil, subprocess, sys, tempfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
WORK = os.path.abspath(args[0]) if args else tempfile.mkdtemp(prefix="roomtour-selftest-")
VOICE = "--no-voice" not in sys.argv
RENDER = "--no-render" not in sys.argv
NPX, NODE, FFMPEG, FFPROBE = (shutil.which(x) for x in ("npx", "node", "ffmpeg", "ffprobe"))
for name, exe in (("npx", NPX), ("node", NODE), ("ffmpeg", FFMPEG), ("ffprobe", FFPROBE)):
    if not exe:
        sys.exit(f"{name} 가 없어요. python \"{os.path.join(HERE, 'doctor.py')}\" 로 설치 방법을 확인하세요.")


def run(cmd, cwd=None):
    print("$", " ".join(os.path.basename(c) if i == 0 else c for i, c in enumerate(cmd)), flush=True)
    r = subprocess.run(cmd, cwd=cwd, text=True, encoding="utf-8", errors="replace", capture_output=True)
    if r.returncode != 0:
        print(r.stdout[-3000:], r.stderr[-3000:])
        sys.exit(f"실패: {' '.join(cmd[:3])}")
    return r.stdout


os.makedirs(WORK, exist_ok=True)
src = os.path.join(WORK, "test-source.mp4")
run([FFMPEG, "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=6",
     "-f", "lavfi", "-i", "anoisesrc=d=6:c=pink:a=0.02", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", src])

SPECS = {
    "diary": {"intro": {"start": 0, "end": 2, "top": "korea", "lines": ["테스트", "랜선집구경"], "bottom": "roomtour!"},
              "captions": [{"start": 2, "end": 4, "kind": "label", "lines": ["거실", "+큰 창"]}, {"start": 4, "end": 6, "lines": ["구경해주셔서", "감사합니다 :)"]}]},
    "vlog": {"intro": {"start": 0, "end": 2, "lines": ["테스트 *원룸*"], "say": "끝까지 보세요"},
             "captions": [{"start": 2, "end": 4, "tone": "react", "sticker": "sparkle", "lines": ["와 이거 뭐에요.."], "say": "와 이거 보세요"},
                          {"start": 4, "end": 6, "tone": "note", "lines": ["테이프 라벨"], "say": ""}],
             "outro": {"hold": 1.5, "lines": ["이런 집은", "얼마일까요??"]}},
    "quiz": {"intro": {"start": 0, "end": 2, "lines": ["테스트 원룸", "월세 *얼마*?"]},
             "captions": [{"start": 2, "end": 6, "room": "방", "tags": ["창문"], "lines": ["방은 하나예요"], "say": "정답 공개! 월세 십만 원"}],
             "reveal": {"at": 4.5, "lines": ["보증금 100 / 월세 10"]}, "agency": {"name": "테스트공인중개사사무소", "phone": "010-0000-0000"}},
    "luxe": {"brand": "Test Realty", "intro": {"start": 0, "end": 2, "top": "Room Tour", "lines": ["테스트 하우스"]},
             "captions": [{"start": 2, "end": 6, "room": "거실", "en": "Living", "lines": ["큰 창"]}],
             "outro": {"hold": 1.5, "lines": ["방문 예약은 DM으로"]}},
}
results = []
for style, body in SPECS.items():
    proj = os.path.join(WORK, f"test-{style}")
    print(f"\n=== {style}", flush=True)
    run([sys.executable, os.path.join(HERE, "new_project.py"), src, proj])
    spec = {"style": style, "src": "assets/source.mp4", "duration": 6, **body}
    with open(os.path.join(proj, "spec.json"), "w", encoding="utf-8") as fh:
        json.dump(spec, fh, ensure_ascii=False, indent=1)
    if VOICE and style in ("vlog", "quiz"):
        run([sys.executable, os.path.join(HERE, "tts.py"), proj, "--voice", "female" if style == "vlog" else "male"])
    out = run([NODE, os.path.join(HERE, "build.mjs"), proj])
    if "warning" in out:
        print(out)
    if RENDER:
        run([NPX, "-y", "hyperframes", "render", "--quality", "draft"], cwd=proj)
        mp4s = [os.path.join(proj, "renders", f) for f in os.listdir(os.path.join(proj, "renders")) if f.endswith(".mp4")]
        if not mp4s:
            sys.exit(f"{style}: 렌더 결과 없음")
        info = json.loads(run([FFPROBE, "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", mp4s[0]]))
        v = next(s for s in info["streams"] if s["codec_type"] == "video")
        if (v["width"], v["height"]) != (1080, 1920):
            sys.exit(f"{style}: 해상도 {v['width']}x{v['height']}")
        results.append(f"{style}: {float(info['format']['duration']):.1f}s 1080x1920 {'audio' if any(s['codec_type'] == 'audio' for s in info['streams']) else 'no-audio'}")
    else:
        results.append(f"{style}: built")
print("\n자체 점검 통과\n" + "\n".join(results) + f"\n작업 폴더: {WORK}")
