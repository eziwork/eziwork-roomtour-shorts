#!/usr/bin/env python3
"""Scaffold a room-tour short project and analyze its footage. Works on Windows, macOS and Linux.

Usage: python new_project.py <source-video> <project-dir> [grid-step-seconds, default 1; use 0.5 for fast footage]

Produces in <project-dir>:
  index.html (placeholder, overwritten by build.mjs), assets/source.mp4, assets/fonts/*
  analysis/grid.jpg      one frame every STEP seconds, 10 per row (read this to time captions)
  analysis/probe.txt     duration / resolution / fps / audio levels / orientation
  analysis/cuts.txt      hard-cut timestamps (empty for one-take walkthroughs)
  analysis/grid_wide.jpg only for non-vertical sources: wider frames with yellow guides every 10% of
                         the width, for picking reframe.py keys (see SKILL.md step 1-b)
"""
import glob, json, math, os, re, shutil, subprocess, sys, tempfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

if len(sys.argv) < 3:
    sys.exit(__doc__)
SRC, PROJ = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
STEP = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def tool(name):
    exe = shutil.which(name)
    if not exe:
        sys.exit(f"{name} 를 찾지 못했어요. 먼저 실행하세요: python \"{os.path.join(SKILL, 'scripts', 'doctor.py')}\"")
    return exe


FFMPEG, FFPROBE, NPX = tool("ffmpeg"), tool("ffprobe"), tool("npx")


def ff(*args):
    subprocess.run([FFMPEG, "-loglevel", "error", "-y", *args], check=True)


if not os.path.exists(os.path.join(PROJ, "hyperframes.json")):
    env = dict(os.environ)
    # init re-installs the HyperFrames agent skills globally every time; skip that once they are installed.
    home = os.path.expanduser("~")
    if any(os.path.exists(os.path.join(home, d, "skills", "hyperframes")) for d in (".agents", ".codex", ".claude")):
        env["HYPERFRAMES_SKIP_SKILLS"] = "1"
    subprocess.run([NPX, "-y", "hyperframes", "init", PROJ, "--non-interactive", "--example=blank", "--skill=general-video"],
                   check=True, stdout=subprocess.DEVNULL, env=env)
fonts = os.path.join(PROJ, "assets", "fonts")
analysis = os.path.join(PROJ, "analysis")
os.makedirs(fonts, exist_ok=True)
os.makedirs(analysis, exist_ok=True)
for f in glob.glob(os.path.join(SKILL, "assets", "fonts", "*")):
    shutil.copy2(f, fonts)
V = os.path.join(PROJ, "assets", "source.mp4")
shutil.copy2(SRC, V)

probe = json.loads(subprocess.run([FFPROBE, "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,codec_name:format=duration",
                                   "-of", "json", V], capture_output=True, text=True, check=True).stdout)
vs = next(s for s in probe["streams"] if s.get("codec_type") == "video")
DUR, VW, VH = float(probe["format"]["duration"]), int(vs["width"]), int(vs["height"])
vol = subprocess.run([FFMPEG, "-i", V, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
levels = re.findall(r"(mean|max)_volume: ([-0-9.]+) dB", vol)
ORIENT = "landscape" if VW >= VH or VW / VH > 0.6 else "vertical"
with open(os.path.join(analysis, "probe.txt"), "w", encoding="utf-8") as fh:
    fh.write(f"duration={DUR}\n")
    fh.write(f"codec_name={vs.get('codec_name')}|width={VW}|height={VH}|r_frame_rate={vs.get('r_frame_rate')}\n")
    fh.write("\n".join(f"{k}_volume: {v} dB" for k, v in levels) + "\n" if levels else "no audio\n")
    fh.write(f"orientation={ORIENT} ({VW} x {VH})\n")

# One frame every STEP seconds, tiled 10 per row (row r, col c = (r*10+c)*STEP seconds).
# Numbered files instead of a glob pattern: ffmpeg on Windows has no -pattern_type glob.
tmp = tempfile.mkdtemp(prefix="rt-grid-")
nfr = math.ceil(DUR / STEP)
for i in range(nfr):
    ff("-ss", f"{i * STEP + 0.2:.2f}", "-i", V, "-frames:v", "1", "-vf", "scale=240:-2,format=yuvj420p", os.path.join(tmp, f"f_{i:03d}.jpg"))
ff("-framerate", "1", "-i", os.path.join(tmp, "f_%03d.jpg"), "-vf", f"tile=10x{math.ceil(nfr / 10)}:padding=4:color=white,format=yuvj420p",
   "-frames:v", "1", os.path.join(analysis, "grid.jpg"))
shutil.rmtree(tmp, ignore_errors=True)

sc = subprocess.run([FFMPEG, "-i", V, "-vf", "select='gt(scene,0.35)',showinfo", "-f", "null", "-"],
                    capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
with open(os.path.join(analysis, "cuts.txt"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(re.findall(r"pts_time:([0-9.]+)", sc)))

if ORIENT == "landscape":
    tmp = tempfile.mkdtemp(prefix="rt-wide-")
    secs = math.ceil(DUR)
    for s in range(secs):
        ff("-ss", f"{s}.2", "-i", V, "-frames:v", "1", "-vf", "scale=480:-2,drawgrid=w=iw/10:h=ih:t=2:c=yellow@0.7,format=yuvj420p",
           os.path.join(tmp, f"f_{s:03d}.jpg"))
    ff("-framerate", "1", "-i", os.path.join(tmp, "f_%03d.jpg"), "-vf", f"tile=5x{math.ceil(secs / 5)}:padding=4:color=white,format=yuvj420p",
       "-frames:v", "1", os.path.join(analysis, "grid_wide.jpg"))
    shutil.rmtree(tmp, ignore_errors=True)

print(f"project:  {PROJ}")
print(open(os.path.join(analysis, "probe.txt"), encoding="utf-8").read().strip())
print(f"cuts:     {open(os.path.join(analysis, 'cuts.txt'), encoding='utf-8').read().replace(chr(10), ' ')}")
print(f"grid:     {os.path.join(analysis, 'grid.jpg')}  (10 frames per row; row r, col c = (r*10+c)*{STEP:g} seconds)")
if ORIENT == "landscape":
    print(f"LANDSCAPE source: reframe before building. Pick keys from {os.path.join(analysis, 'grid_wide.jpg')}")
    print("          (5 frames per row; row r, col c = second r*5+c; yellow lines every 10% of width)")
