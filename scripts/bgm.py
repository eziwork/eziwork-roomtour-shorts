#!/usr/bin/env python3
"""Find and fetch background music for a room-tour project, with a license that allows commercial use.

Source: Openverse (api.openverse.org, run by WordPress.org) - a public search API over Creative Commons
audio (mostly Jamendo). No key, no sign-up. Anonymous limit: 20 searches/min, 200/day.
Only CC0 / public domain / CC BY are taken: commercial use OK, editing OK. CC BY needs a credit line -> this
script writes it into spec.bgm.credit and assets/bgm-credit.txt; put that line in the Instagram caption.
(Pixabay is not used: it has no music API and its terms forbid automated collection.)

Usage:
  python bgm.py <project>                       # search by the project's style, download 3 candidates, use #1
  python bgm.py <project> --query "acoustic"    # your own mood words (English works best)
  python bgm.py <project> --pick 2              # switch to candidate 2 from the last search (no new search)
  python bgm.py <project> --none                # remove background music from the spec
"""
import argparse, json, os, re, shutil, statistics, subprocess, sys, urllib.error, urllib.parse, urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = "https://api.openverse.org/v1/audio/"
UA = {"User-Agent": "roomtour-shorts/1.0 (skill; background music search)"}
MOODS = {  # style -> search phrases, tried in order
    "vlog": ["happy instrumental", "upbeat instrumental", "acoustic instrumental"],
    "quiz": ["upbeat corporate", "upbeat instrumental", "happy instrumental"],
    "luxe": ["piano instrumental", "chill instrumental", "ambient instrumental"],
    "diary": ["acoustic instrumental", "chill instrumental", "happy instrumental"],
}
WANT_TAGS = {"vlog": {"happy", "upbeat", "speed_medium", "speed_high", "positive"},
             "quiz": {"upbeat", "corporate", "speed_high", "speed_medium", "happy"},
             "luxe": {"piano", "calm", "peaceful", "ambient", "relaxing", "speed_low"},
             "diary": {"acoustic", "acousticguitar", "calm", "peaceful", "happy", "speed_medium"}}
VOCAL_TAGS = {"male", "female", "vocal", "vocals", "voice", "singing", "rap"}


def get_json(url):
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
    except urllib.error.HTTPError as e:
        sys.exit(f"음악 검색 실패 ({e.code}). 429면 잠시 후 다시 시도하세요 (하루 200회 제한).")
    except urllib.error.URLError as e:
        sys.exit(f"인터넷 연결 실패: {e.reason}\nCodex 샌드박스라면 이 명령에 네트워크 승인이 필요해요.")


def search(phrases, need_s, style, n=3):
    seen, scored = set(), []
    for q in phrases:
        url = API + "?" + urllib.parse.urlencode({"q": q, "license": "by,cc0,pdm", "category": "music", "page_size": 20, "mature": "false"})
        for r in get_json(url).get("results", []):
            if r["id"] in seen or not r.get("url"):
                continue
            seen.add(r["id"])
            dur = (r.get("duration") or 0) / 1000
            if dur < need_s + 2 or dur > 600:
                continue
            tags = {t["name"].lower() for t in (r.get("tags") or [])}
            score = (3 if "instrumental" in tags else 0) + len(tags & WANT_TAGS.get(style, set())) - (6 if tags & VOCAL_TAGS else 0)
            scored.append((score, r, dur, sorted(tags)))
        if len([s for s in scored if s[0] >= 3]) >= n:
            break
    scored.sort(key=lambda x: -x[0])
    return scored[:n]


def credit_line(r):
    lic = "CC0" if r["license"] in ("cc0", "pdm") else f"CC {r['license'].upper()} {r.get('license_version') or ''}".strip()
    return f"Music: \"{r['title']}\" by {r.get('creator') or 'unknown'} ({lic}) {r.get('foreign_landing_url') or ''}".strip()


def lively_offset(path, need_s):
    """Skip a quiet intro: start where the track first reaches its usual loudness (per-second RMS)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af",
                        "aresample=8000,asetnsamples=n=8000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
                        "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    rms = [float(v) for v in re.findall(r"RMS_level=(-?[0-9.]+|-inf)", r.stdout + r.stderr) if v != "-inf"]
    if len(rms) < need_s + 5:
        return 0
    typical = statistics.median(rms)
    for t, v in enumerate(rms):
        if v >= typical - 3 and t + need_s <= len(rms):
            return t
    return 0


def use(proj, spec, cand, k):
    c = next(x for x in cand if x["n"] == k)
    src = os.path.join(proj, c["file"])
    ext = os.path.splitext(src)[1]
    dst_rel = f"assets/bgm{ext}"
    shutil.copy2(src, os.path.join(proj, dst_rel))
    spec["bgm"] = {**{k2: v for k2, v in (spec.get("bgm") or {}).items() if k2 in ("volume", "duck", "fadeOut")},
                   "src": dst_rel, "credit": c["credit"], "license": c["license"], "source": c["landing"]}
    if c.get("offset"):
        spec["bgm"]["offset"] = c["offset"]
    with open(os.path.join(proj, "spec.json"), "w", encoding="utf-8") as fh:
        json.dump(spec, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(proj, "assets", "bgm-credit.txt"), "w", encoding="utf-8") as fh:
        fh.write(c["credit"] + "\n")
    print(f"\n사용: {k}번 {c['title']} ({c['duration']:.0f}초)\n출처: {c['credit']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("--query")
    ap.add_argument("--pick", type=int)
    ap.add_argument("--none", action="store_true")
    ap.add_argument("-n", type=int, default=3)
    a = ap.parse_args()
    proj = a.project
    with open(os.path.join(proj, "spec.json"), encoding="utf-8") as fh:
        spec = json.load(fh)
    cdir = os.path.join(proj, "assets", "bgm-candidates")
    cjson = os.path.join(cdir, "candidates.json")
    if a.none:
        spec.pop("bgm", None)
        with open(os.path.join(proj, "spec.json"), "w", encoding="utf-8") as fh:
            json.dump(spec, fh, ensure_ascii=False, indent=1)
        return print("배경음을 뺐어요.")
    if a.pick:
        cand = json.load(open(cjson, encoding="utf-8"))
        if a.pick not in [c["n"] for c in cand]:
            sys.exit(f"후보 번호는 {[c['n'] for c in cand]} 중에서 골라요.")
        return use(proj, spec, cand, a.pick)
    style = spec.get("style", "diary")
    need = spec["duration"] + ((spec.get("outro") or {}).get("hold", 2.5) if spec.get("outro") else 0)
    phrases = [a.query] if a.query else MOODS.get(style, MOODS["vlog"])
    found = search(phrases, need, style, a.n)
    if not found:
        sys.exit("조건에 맞는 곡(상업적 사용 가능, 영상보다 긴 연주곡)을 못 찾았어요. --query 로 다른 분위기 단어를 넣어 보세요.")
    os.makedirs(cdir, exist_ok=True)
    cand = []
    for i, (score, r, dur, tags) in enumerate(found, 1):
        rel = f"assets/bgm-candidates/{i}.mp3"
        try:
            req = urllib.request.Request(r["url"], headers=UA)
            with urllib.request.urlopen(req, timeout=120) as resp, open(os.path.join(proj, rel), "wb") as fh:
                shutil.copyfileobj(resp, fh)
        except Exception as e:
            print(f"  {i}번 받기 실패, 건너뜀: {e}")
            continue
        off = lively_offset(os.path.join(proj, rel), need)
        c = {"n": i, "offset": off, "title": r["title"], "creator": r.get("creator"), "license": r["license"], "duration": dur,
             "tags": tags, "file": rel, "landing": r.get("foreign_landing_url"), "credit": credit_line(r)}
        cand.append(c)
        print(f"{i}. {r['title']} - {r.get('creator')} | {dur:.0f}초 (시작 {off}초부터) | {c['credit'].split('(')[-1].split(')')[0]} | {', '.join(tags[:6])}")
    if not cand:
        sys.exit("후보를 하나도 받지 못했어요.")
    json.dump(cand, open(cjson, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n후보 파일: {cdir}  (들어 보고 바꾸려면 --pick 번호)")
    use(proj, spec, cand, cand[0]["n"])


if __name__ == "__main__":
    main()
