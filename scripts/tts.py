#!/usr/bin/env python3
"""Narration for a room-tour project -> assets/voice/*.wav + voice.json (read by build.mjs).

Engines:
  supertonic (default) - free, runs on this computer (Supertone Supertonic 3, OpenRAIL-M license).
                         Set up once with `python doctor.py --install`. No API key. Voices F1-F5 / M1-M5.
                         The license requires saying the voice is AI-generated: put the disclosure line in the post caption.
  gemini               - Gemini 3.8 Flash TTS (paid key). Voices like ko-kr-commercial-6. Takes tone directions.

Usage:
  python tts.py <project>                          # supertonic, female (F1), mc tone (a little faster)
  python tts.py <project> --voice male             # female | male | F1..F5 | M1..M5 (gemini: any voice id)
  python tts.py <project> --tone vlog              # mc (default, brisk, clear) | vlog (relaxed)
  python tts.py <project> --engine gemini          # paid Gemini voices instead
  python tts.py <project> --check                  # list what would be spoken and the time each line has
  python tts.py --setup                            # gemini only: store the API key once (hidden input), in your own terminal

What is spoken: every caption with `lines` (or `say`), plus `intro.say`. A caption's `say` overrides the
spoken text; `"say": ""` keeps that caption silent. Lines are cached by text+voice, so re-runs only redo
changed lines.

Gemini API key lookup, first hit wins (the key is never printed, never written to the project):
  1. --key-file <path>  2. env GEMINI_API_KEY  3. OS keychain via `keyring`  4. ~/.config/roomtour-shorts/gemini_api_key
"""
import argparse, base64, getpass, hashlib, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.request, wave

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

MODEL = "gemini-3.8-flash-tts"
VOICES = {"gemini": {"female": "ko-kr-commercial-6", "male": "ko-kr-commercial-5"},
          "supertonic": {"female": "F1", "male": "M1"}}
# Gemini: English direction is applied as tone and is not read aloud (checked on 3.8 Flash TTS).
TONES = {
    # 친근한 브이로그 혼잣말
    "vlog": ("Read this Korean line like a relaxed room-tour vlogger talking to a friend while walking through the home: "
             "light and warm, brisk natural pace with no long pauses, a little playful on questions, never like an advertisement"),
    # 또렷한 행사 진행·라이브커머스 톤 (기본, 릴스용)
    "mc": ("Read this Korean line like an upbeat event MC or live-commerce host: crisp articulation, bright projected voice, "
           "confident and energetic, quick pace, clear firm sentence endings, never soft or whispery"),
}
# Supertonic takes no tone direction; pace is the lever.
ST_SPEED = {"mc": 1.15, "vlog": 1.0}
KEY_FILE = os.path.join(os.path.expanduser("~"), ".config", "roomtour-shorts", "gemini_api_key")
KEYRING = ("roomtour-shorts", "gemini_api_key")
VENV = os.path.join(os.path.expanduser("~"), ".roomtour-shorts", "venv")
VENV_PY = os.path.join(VENV, "Scripts", "python.exe") if os.name == "nt" else os.path.join(VENV, "bin", "python")
LEAD = 0.15  # seconds after the caption appears before the voice starts
ST_WORKER = r"""
import json, sys
from supertonic import TTS
job = json.load(open(sys.argv[1], encoding="utf-8"))
tts = TTS(auto_download=True)
style = tts.get_voice_style(voice_name=job["voice"])
for it in job["items"]:
    wav, _ = tts.synthesize(text=it["text"], lang="ko", voice_style=style, total_steps=8, speed=job["speed"], silence_duration=0.1)
    tts.save_audio(wav, it["raw"])
print("done")
"""


def setup():
    key = getpass.getpass("Gemini API key (입력은 화면에 보이지 않아요): ").strip()
    if not key:
        sys.exit("키가 비어 있어요. 저장하지 않았습니다.")
    try:
        import keyring
        keyring.set_password(*KEYRING, key)
        print("OS 자격 증명 저장소(Windows 자격 증명 관리자 / macOS 키체인)에 저장했어요.")
        return
    except Exception:
        pass
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    with open(KEY_FILE, "w", encoding="utf-8") as fh:
        fh.write(key)
    if os.name == "nt":
        user = os.environ.get("USERNAME", "")
        subprocess.run(["icacls", KEY_FILE, "/inheritance:r", "/grant:r", f"{user}:F"], capture_output=True)
    else:
        os.chmod(KEY_FILE, 0o600)
    print(f"{KEY_FILE} 에 본인만 읽을 수 있게 저장했어요.")


def load_key(key_file):
    if key_file:
        return open(os.path.expanduser(key_file), encoding="utf-8").read().strip()
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"].strip()
    try:
        import keyring
        k = keyring.get_password(*KEYRING)
        if k:
            return k.strip()
    except Exception:
        pass
    if os.path.exists(KEY_FILE):
        return open(KEY_FILE, encoding="utf-8").read().strip()
    sys.exit("Gemini API 키를 찾지 못했어요. 사용자가 직접 자기 터미널에서 한 번 실행해야 합니다:\n"
             f"  python \"{os.path.abspath(__file__)}\" --setup\n"
             "(키를 채팅에 붙여넣지 마세요. 대화 기록에 그대로 남습니다.)")


def spoken(text):
    t = re.sub(r"\*", "", text)
    t = re.sub(r"[~♡♥★☆]+", "", t)
    t = re.sub(r"\.{2,}|…", ", ", t)
    t = re.sub(r"\?{2,}", "?", t)
    t = re.sub(r"!{2,}", "!", t)
    return re.sub(r"\s+", " ", t).strip()


def items_from_spec(spec):
    outro = spec.get("outro") or {}
    end_all = spec["duration"] + (outro.get("hold", 2.5) if outro else 0)
    out = []
    say = spec["intro"].get("say")
    if say:
        say = " ".join(say) if isinstance(say, list) else say
        out.append({"id": "intro", "start": round(spec["intro"]["start"] + 0.5, 3), "text": spoken(say)})
    for i, c in enumerate(spec["captions"]):
        text = c.get("say")
        if text is None:
            text = " ".join(c.get("lines") or [])
        text = spoken(text)
        if text:
            out.append({"id": f"cap-{i + 1}", "start": round(c["start"] + LEAD, 3), "text": text})
    # Each line may speak until the next spoken line begins (or the video ends).
    for k, it in enumerate(out):
        it["limit"] = out[k + 1]["start"] - 0.05 if k + 1 < len(out) else end_all
    return out


def gemini_synth(key, voice, style, text, out_path):
    body = {"contents": [{"parts": [{"text": f"{style}: {text}"}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(body).encode(), headers={"x-goog-api-key": key, "content-type": "application/json"})
    for attempt in range(5):
        try:
            r = json.load(urllib.request.urlopen(req, timeout=90))
            break
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode(errors="replace")
            if e.code in (429, 500, 503) and attempt < 4:
                time.sleep(5 * (attempt + 1))
                continue
            hint = {400: "요청 형식 또는 목소리 이름 확인", 401: "키가 잘못됨", 403: "키 권한/프로젝트 확인",
                    402: "선불 크레딧 소진 (AI Studio 결제에서 충전 필요)", 429: "사용량 한도 초과 (무료 키는 하루 10회)"}.get(e.code, "")
            sys.exit(f"TTS 요청 실패 {e.code} {hint}\n{msg}")
        except urllib.error.URLError as e:
            sys.exit(f"인터넷 연결 실패: {e.reason}\nCodex 샌드박스라면 이 명령에 네트워크 승인이 필요해요.")
    part = r["candidates"][0]["content"]["parts"][0]["inlineData"]
    data = base64.b64decode(part["data"])
    if data[:4] == b"RIFF":
        open(out_path, "wb").write(data)
    else:  # raw 16-bit PCM
        m = re.search(r"rate=(\d+)", part.get("mimeType", ""))
        with wave.open(out_path, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(m.group(1)) if m else 24000); w.writeframes(data)


def supertonic_batch(jobs, voice, speed):
    """jobs: [(text, final_path)]. One model load for the whole batch, then ffmpeg -> 16-bit 24k mono, trimmed."""
    if not os.path.exists(VENV_PY):
        doctor = os.path.join(os.path.dirname(os.path.abspath(__file__)), "doctor.py")
        sys.exit(f"Supertonic 환경이 없어요. 먼저 실행하세요:\n  python \"{doctor}\" --install")
    tmp = tempfile.mkdtemp(prefix="rt-tts-")
    items = [{"text": t, "raw": os.path.join(tmp, f"{i}.wav")} for i, (t, _) in enumerate(jobs)]
    jf = os.path.join(tmp, "job.json")
    with open(jf, "w", encoding="utf-8") as fh:
        json.dump({"voice": voice, "speed": speed, "items": items}, fh, ensure_ascii=False)
    wk = os.path.join(tmp, "worker.py")
    with open(wk, "w", encoding="utf-8") as fh:
        fh.write(ST_WORKER)
    r = subprocess.run([VENV_PY, wk, jf], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if "done" not in r.stdout:
        sys.exit("Supertonic 생성 실패:\n" + r.stderr[-1500:] + "\n(처음이면 모델을 받느라 인터넷이 필요해요. Codex라면 승인하세요.)")
    for it, (_, final) in zip(items, jobs):
        # loudness to a reels-like level (Supertonic comes out ~10 dB quieter than Gemini)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", it["raw"], "-af", "loudnorm=I=-15:TP=-1.5:LRA=11",
                        "-ac", "1", "-ar", "24000", "-sample_fmt", "s16", final], check=True)
        trim_silence(final)
    shutil.rmtree(tmp, ignore_errors=True)


def trim_silence(path, thresh=500, keep=0.12):
    """Cut leading/trailing near-silence (models sometimes pad seconds of quiet)."""
    import array
    with wave.open(path) as w:
        p = w.getparams(); frames = w.readframes(w.getnframes())
    if p.sampwidth != 2 or p.nchannels != 1:
        return
    a = array.array("h", frames)
    idx = [i for i in range(0, len(a), 120) if abs(a[i]) > thresh]
    if not idx:
        return
    pad = int(keep * p.framerate)
    lo, hi = max(0, idx[0] - pad), min(len(a), idx[-1] + pad)
    with wave.open(path, "wb") as w:
        w.setparams(p); w.writeframes(a[lo:hi].tobytes())


def duration(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project", nargs="?")
    ap.add_argument("--setup", action="store_true")
    ap.add_argument("--engine", default="supertonic", help="supertonic (기본, 무료) | gemini (유료 키)")
    ap.add_argument("--voice", default="female")
    ap.add_argument("--tone", default="mc", help="mc (기본, 또렷한 행사 진행 톤) | vlog (친근한 혼잣말)")
    ap.add_argument("--speed", type=float, help="supertonic 말 속도 (기본 mc 1.15 / vlog 1.0)")
    ap.add_argument("--key-file")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--volume", type=float, default=1.0)
    a = ap.parse_args()
    if a.setup:
        return setup()
    if not a.project:
        ap.error("project folder required")
    if a.engine not in VOICES:
        ap.error("--engine must be supertonic or gemini")
    proj = a.project
    with open(os.path.join(proj, "spec.json"), encoding="utf-8") as fh:
        spec = json.load(fh)
    engine = a.engine
    style = TONES.get(a.tone, a.tone)
    voice = VOICES[engine].get(a.voice, a.voice)
    speed = a.speed or ST_SPEED.get(a.tone, 1.1)
    items = items_from_spec(spec)
    if a.check:
        for it in items:
            print(f"{it['start']:5.1f}s  (최대 {it['limit'] - it['start']:.1f}s)  {it['text']}")
        return
    if not items:
        vj = os.path.join(proj, "voice.json")
        if os.path.exists(vj):
            os.remove(vj)
        return print("읽을 대사가 없어요 (모든 자막이 say: \"\"). 목소리 없이 원본 소리를 둡니다.")
    os.makedirs(os.path.join(proj, "assets", "voice"), exist_ok=True)
    tag = f"{engine}|{voice}|{style if engine == 'gemini' else f'{speed}|norm'}"
    for it in items:
        h = hashlib.sha1(f"{tag}|{it['text']}".encode()).hexdigest()[:10]
        it["rel"] = f"assets/voice/{it['id']}-{h}.wav"
        it["path"] = os.path.join(proj, it["rel"])
    todo = [it for it in items if not os.path.exists(it["path"])]
    if todo and engine == "supertonic":
        supertonic_batch([(it["text"], it["path"]) for it in todo], voice, speed)
    if todo and engine == "gemini":
        key = load_key(a.key_file)
        for it in todo:
            for _ in range(2):
                gemini_synth(key, voice, style, it["text"], it["path"])
                trim_silence(it["path"])
                # about 0.12-0.2s per syllable; far longer means a glitched take -> try once more
                if duration(it["path"]) < 0.3 * len(it["text"]) + 1.5:
                    break
    clips, warns = [], []
    for it in items:
        d = round(duration(it["path"]), 3)
        room = it["limit"] - it["start"]
        if d > room - 0.1:
            warns.append(f"{it['id']} 음성 {d:.1f}s > 자리 {room:.1f}s: \"{it['text']}\" -> say를 줄이거나 자막 시간을 늘리세요")
        clips.append({"id": it["id"], "start": it["start"], "duration": d, "file": it["rel"], "text": it["text"]})
        print(f"{it['start']:5.1f}s  {d:4.1f}s / {room:4.1f}s  {it['text']}")
    with open(os.path.join(proj, "voice.json"), "w", encoding="utf-8") as fh:
        json.dump({"voice": voice, "engine": engine, "model": "supertonic-3" if engine == "supertonic" else MODEL,
                   "aiLabel": True, "volume": a.volume, "clips": clips}, fh, ensure_ascii=False, indent=1)
    print(f"\nvoice.json 저장 ({len(clips)}줄, 새로 만든 것 {len(todo)}개, {engine} 목소리 {voice})")
    for w in warns:
        print("  경고:", w)


if __name__ == "__main__":
    main()
