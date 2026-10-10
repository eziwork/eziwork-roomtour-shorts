#!/usr/bin/env python3
"""Landscape (or any non-9:16) footage -> vertical 1080x1920 with a moving crop that follows the subject.

Usage: reframe.py <src.mp4> <out.mp4> <keys.json>

keys.json: [[time_s, center_x], ...]  center_x = where the subject is, as a fraction of source width
           (0 = left edge, 0.5 = middle, 1 = right edge). Read it off analysis/grid_wide.jpg, whose
           yellow guide lines sit at every 10% of the width.

The path is linearly interpolated between keys, then Gaussian-smoothed (~0.35s) so the virtual camera
pans gently instead of jerking, and fed to ffmpeg's crop through sendcmd. Audio is copied untouched.
Needs only python3 + ffmpeg (no numpy/opencv)."""
import json, math, os, subprocess, sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SRC, OUT, KEYS_PATH = (os.path.abspath(p) for p in sys.argv[1:4])
with open(KEYS_PATH, encoding="utf-8") as fh:
    KEYS = sorted(json.load(fh))

probe = json.loads(subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
     "stream=width,height,r_frame_rate:format=duration", "-of", "json", SRC],
    capture_output=True, text=True, check=True).stdout)
st = probe["streams"][0]
W, H = int(st["width"]), int(st["height"])
num, den = st["r_frame_rate"].split("/")
FPS = float(num) / float(den)
DUR = float(probe["format"]["duration"])
CW = int(round(H * 9 / 16 / 2) * 2)  # 9:16 crop window width
if CW > W:
    sys.exit(f"source {W}x{H} is already narrower than 9:16; no reframe needed")


def lin(t):
    if t <= KEYS[0][0]:
        return KEYS[0][1]
    for (t0, v0), (t1, v1) in zip(KEYS, KEYS[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * (t - t0) / max(t1 - t0, 1e-6)
    return KEYS[-1][1]


n = int(math.ceil(DUR * FPS)) + 1
raw = [lin(i / FPS) for i in range(n)]
sig = 0.35 * FPS
R = int(3 * sig)
ker = [math.exp(-(k * k) / (2 * sig * sig)) for k in range(-R, R + 1)]
smooth = []
for i in range(n):
    acc = wsum = 0.0
    for k, w in zip(range(-R, R + 1), ker):
        acc += raw[min(max(i + k, 0), n - 1)] * w
        wsum += w
    smooth.append(acc / wsum)

clamp = lambda c: min(max(c * W - CW / 2, 0), W - CW)
cmd_path = os.path.splitext(OUT)[0] + ".crop_cmds.txt"
with open(cmd_path, "w", encoding="utf-8") as f:
    for i, c in enumerate(smooth):
        f.write(f"{i / FPS:.4f} crop x {clamp(c):.1f};\n")

# The command file is passed by bare name with ffmpeg running in its folder: a Windows path ("C:\\...")
# inside a filter string would need escaping of the drive colon and backslashes.
vf = (f"sendcmd=f={os.path.basename(cmd_path)},crop=w={CW}:h={H}:x={clamp(smooth[0]):.1f}:y=0,"
      f"scale=1080:1920:flags=lanczos,setsar=1,format=yuv420p")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", SRC, "-vf", vf, "-c:v", "libx264",
                "-preset", "slow", "-crf", "16", "-c:a", "copy", "-movflags", "+faststart", OUT], check=True,
               cwd=os.path.dirname(cmd_path))
check = os.path.splitext(OUT)[0] + ".check.jpg"
rows = int(math.ceil(DUR / 10))
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", OUT, "-vf",
                f"fps=1,scale=180:-2,tile=10x{rows}:padding=4:color=white,format=yuvj420p", "-frames:v", "1", check], check=True)
print(f"wrote {OUT}  (crop {CW}x{H} of {W}x{H}, upscale x{1920 / H:.2f})")
print(f"check {check}: one frame per second of the result; make sure no second is stuck on a blank wall")
