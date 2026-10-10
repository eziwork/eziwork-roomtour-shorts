#!/usr/bin/env node
// Room-tour shorts generator: <project>/spec.json -> <project>/index.html (HyperFrames, 1080x1920)
// Usage: node build.mjs <project-dir>
// Spec format: see ../references/spec-format.md
// Styles: diary (handwritten, default) | vlog (임장 브이로그) | quiz (질문 훅 -> 공개) | luxe (미니멀 하이엔드)
// Narration: if <project>/voice.json exists (written by tts.py), each line is placed as an <audio> clip.
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const dir = process.argv[2] || ".";
const spec = JSON.parse(readFileSync(join(dir, "spec.json"), "utf8"));

const PALETTES = {
  lilac: ["#ffb3dc", "#b9a2ff"], // reference look: pink -> lavender
  peach: ["#ffc59e", "#ff9fb2"],
  mint: ["#a8f0d8", "#9cc8ff"],
  butter: ["#fff1a6", "#ffc89c"],
};

const PRE = (w, file) => ({ family: "Pretendard", file: `assets/fonts/${file}`, weight: w, format: "woff2" });
const STYLES = {
  // Handwritten diary look of Instagram 랜선집구경 reels
  diary: {
    fonts: [{ family: "RoomTourHand", file: "assets/fonts/Gaegu-Bold.ttf", weight: 700, format: "truetype" }],
    titleSize: 118,
    captionSize: 66,
    accentSize: 96,
    enSize: 58,
    captionMax: 19,
    introMax: 9,
    outroMax: 15,
  },
  // 임장 브이로그: one sans family, a speech bubble, one accent color
  vlog: {
    fonts: [
      { family: "RoomTourHand", file: "assets/fonts/Gaegu-Bold.ttf", weight: 700, format: "truetype" },
      PRE(800, "Pretendard-ExtraBold.woff2"),
      PRE(900, "Pretendard-Black.woff2"),
    ],
    captionMax: 18,
    introMax: 11,
    outroMax: 11,
  },
  // 질문 훅 -> 가격 공개
  quiz: {
    fonts: [PRE(600, "Pretendard-SemiBold.woff2"), PRE(700, "Pretendard-Bold.woff2"), PRE(800, "Pretendard-ExtraBold.woff2"), PRE(900, "Pretendard-Black.woff2")],
    accent: "#ffe08a",
    captionMax: 17,
    introMax: 9,
    outroMax: 20,
    bigMax: 8,
  },
  // 미니멀 하이엔드: italic serif English + spaced Korean serif
  luxe: {
    fonts: [
      { family: "LuxeEn", file: "assets/fonts/CormorantGaramond-Italic.woff2", weight: 500, format: "woff2", style: "italic" },
      { family: "LuxeKo", file: "assets/fonts/NotoSerifKR-Regular.woff2", weight: 400, format: "woff2" },
      PRE(600, "Pretendard-SemiBold.woff2"),
    ],
    accent: "#e9d9b8",
    captionMax: 16,
    introMax: 14,
    outroMax: 18,
  },
};

const styleName = spec.style || "diary";
if (!STYLES[styleName]) throw new Error(`unknown style "${styleName}" (diary | vlog | quiz | luxe)`);
const style = { ...STYLES[styleName], ...(spec.styleOverrides || {}) };
const [accentFrom, accentTo] = PALETTES[spec.palette || "lilac"] || PALETTES.lilac;
const D = spec.duration;
const intro = spec.intro;
const introEnd = intro.end;
const offsetY = spec.captionOffsetY ?? 0;
// Optional end card: the last frame freezes (blurred, darkened) for `hold` seconds under closing text,
// so the last room keeps its own caption instead of losing it to the CTA.
const outro = spec.outro || null;
const hold = outro ? outro.hold ?? 2.5 : 0;
const TOTAL = +(D + hold).toFixed(3);
// Optional small persistent info line at the top (e.g. "신림동 · 500/35"), for listings with facts.
const badge = spec.badge || null;
// Optional narration placed by tts.py
const voiceRaw = existsSync(join(dir, "voice.json")) ? JSON.parse(readFileSync(join(dir, "voice.json"), "utf8")) : null;
const voice = voiceRaw && voiceRaw.clips && voiceRaw.clips.length ? voiceRaw : null; // no spoken lines = no narration
// With narration the footage goes silent unless the spec says otherwise.
const volume = spec.volume ?? (voice ? 0 : 1);

// *word* marks the one accent word in a line (vlog/quiz/luxe). diary shows it as plain text.
const plain = (s) => String(s).replace(/\*/g, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rich = (s) => (styleName === "diary" ? esc(plain(s)) : esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>"));
const lines = (arr, cls) => arr.map((l) => `<p class="${cls}">${rich(l)}</p>`).join("\n        ");

// ---- validation: catch the mistakes that otherwise only show up in a render ----
const warnings = [];
if (!existsSync(join(dir, spec.src))) warnings.push(`source video not found: ${spec.src}`);
for (const f of style.fonts) if (!existsSync(join(dir, f.file))) warnings.push(`font not found: ${f.file} (copy <skill>/assets/fonts/* into assets/fonts/)`);
// Visual width in "full characters": spaces and ASCII punctuation are about half a Hangul glyph wide.
const vlen = (l) => [...plain(l)].reduce((n, ch) => n + (/[\s.,:;!?·/()+\-~'"]/.test(ch) ? 0.5 : /[A-Za-z0-9]/.test(ch) ? 0.6 : 1), 0);
const captions = spec.captions.map((c, i) => ({ ...c, lines: c.lines || [], id: `cap-${i + 1}` }));
let prevEnd = introEnd;
for (const c of captions) {
  if (c.start < prevEnd - 0.001) warnings.push(`${c.id} starts at ${c.start}s, overlapping the previous text (ends ${prevEnd}s)`);
  if (c.end > D + 0.001) warnings.push(`${c.id} ends at ${c.end}s, past duration ${D}s`);
  if (c.end - c.start < 1.6) warnings.push(`${c.id} is on screen ${(c.end - c.start).toFixed(1)}s; under ~1.6s is hard to read`);
  for (const l of c.lines) if (vlen(l) > style.captionMax) warnings.push(`${c.id} line "${plain(l)}" is ~${vlen(l)} chars wide; over ${style.captionMax} may overflow in ${styleName}`);
  if (c.lines.length > (styleName === "vlog" ? 3 : 2)) warnings.push(`${c.id} has ${c.lines.length} lines; keep ${styleName === "vlog" ? "1-3" : "1-2"} lines`);
  if (styleName !== "diary" && c.kind === "label") warnings.push(`${c.id} uses kind:"label" (diary only); use "room" for ${styleName}`);
  prevEnd = c.end;
}
if (outro) {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-sseof", "-0.2", "-i", join(dir, spec.src), "-frames:v", "1", "-update", "1", "-vf", "format=yuvj420p", join(dir, "assets/last-frame.jpg")]);
  if (r.status !== 0) warnings.push(`could not extract last frame for outro: ${r.stderr}`);
  for (const l of outro.big || []) if (vlen(l) > (style.bigMax || 8)) warnings.push(`outro big line "${plain(l)}" is ~${vlen(l)} chars wide; over ${style.bigMax || 8} may overflow at price size`);
  for (const l of outro.lines || []) if (vlen(l) > style.outroMax) warnings.push(`outro line "${plain(l)}" is ~${vlen(l)} chars wide; over ${style.outroMax} may overflow at end-card size`);
}
if (badge && [...plain(badge.text)].length > 22) warnings.push(`badge "${badge.text}" is long; keep it under ~22 chars`);
for (const l of intro.lines) if (vlen(l) > style.introMax) warnings.push(`intro line "${plain(l)}" is ~${vlen(l)} chars wide; over ${style.introMax} may overflow at title size`);

// Room spans: a room label stays up from its caption until the next room starts (vlog/quiz/luxe).
const rooms = [];
captions.forEach((c) => {
  if (!c.room) return;
  if (rooms.length) rooms[rooms.length - 1].end = c.start;
  rooms.push({ id: `room-${rooms.length + 1}`, n: rooms.length + 1, name: c.room, en: c.en, tags: c.tags || [], start: c.start, end: D, cap: c });
});
const pad2 = (n) => String(n).padStart(2, "0");
const clipAttrs = (start, end, track) => `data-start="${(+start).toFixed(3)}" data-duration="${+(end - start).toFixed(3)}" data-track-index="${track}"`;
const badgeStart = badge ? badge.start ?? introEnd : 0;
const badgeEnd = badge ? badge.end ?? D : 0;

if (voice && !style.fonts.some((f) => f.family === "Pretendard")) style.fonts = [...style.fonts, PRE(600, "Pretendard-SemiBold.woff2")];
const fontFaces = style.fonts
  .map((f) => `@font-face { font-family: "${f.family}"; src: url("${f.file}") format("${f.format}"); font-weight: ${f.weight}; font-style: ${f.style || "normal"}; }`)
  .join("\n      ");
const outroBg = outro ? `      <div id="outro-wrap" class="clip" ${clipAttrs(D, TOTAL, 4)}>\n        <img id="outro-bg" src="assets/last-frame.jpg" alt="" />\n      </div>` : "";

const tweens = [];
const fadeOut = (sel, end, dur = 0.22) => {
  if (end < TOTAL - 0.05) tweens.push(`tl.to("${sel}", { opacity: 0, duration: ${dur}, ease: "power1.in" }, ${(end - dur - 0.02).toFixed(2)});`);
};

// ======================= diary (original look, unchanged) =======================
function diary() {
  const captionHtml = captions
    .map((c) => {
      const en = c.en ? `<p class="cap-en">${esc(c.en)}</p>\n        ` : "";
      const cls = `cap-slot clip${c.kind === "label" ? " cap--label" : ""}`;
      const pad = c.offsetY !== undefined ? ` style="padding-top: ${c.offsetY}px"` : "";
      return `      <div id="${c.id}" class="${cls}"${pad} data-start="${c.start}" data-duration="${+(c.end - c.start).toFixed(3)}" data-track-index="2">
        ${en}${c.lines.map((l, i) => `<p class="cap-line${i === 0 ? " cap-head" : ""}">${rich(l)}</p>`).join("\n        ")}
      </div>`;
    })
    .join("\n");
  if (intro.top) tweens.push(`tl.fromTo("#intro .accent-top", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.15);`);
  tweens.push(`tl.fromTo("#intro .title-line", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.14 }, 0.3);`);
  if (intro.bottom) tweens.push(`tl.fromTo("#intro .accent-bottom", { opacity: 0, y: 18, rotation: -3 }, { opacity: 1, y: 0, rotation: 0, duration: 0.55, ease: "back.out(2)" }, 0.75);`);
  tweens.push(`tl.to("#intro > *", { opacity: 0, duration: 0.3, ease: "power1.in" }, ${(introEnd - 0.32).toFixed(2)});`);
  for (const c of captions) {
    const sel = `#${c.id} > p`;
    tweens.push(`tl.fromTo("${sel}", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.06 }, ${c.start.toFixed(2)});`);
    if (c.end < TOTAL - 0.05) tweens.push(`tl.to("${sel}", { opacity: 0, duration: 0.22, ease: "power1.in" }, ${(c.end - 0.24).toFixed(2)});`);
  }
  if (badge) tweens.push(`tl.fromTo("#badge > p", { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, ${badgeStart.toFixed(2)});`);
  if (outro) {
    tweens.push(`tl.fromTo("#outro-bg", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, ${D.toFixed(2)});`);
    tweens.push(`tl.fromTo("#outro > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out", stagger: 0.12 }, ${(D + 0.2).toFixed(2)});`);
  }
  const font = style.fonts[0];
  const css = `
      #root { font-family: "${font.family}", sans-serif; font-weight: ${font.weight}; color: #fff; }
      /* Soft scrims: just enough darkening that white handwriting reads on bright walls */
      #intro-scrim { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 38% at 50% 50%, rgba(0,0,0,0.28), rgba(0,0,0,0) 70%); }
      #cap-scrim { position: absolute; inset: 0; background: radial-gradient(ellipse 95% 11% at 50% ${(50 + offsetY / 19.2).toFixed(2)}%, rgba(0,0,0,0.26), rgba(0,0,0,0) 100%); }
      #intro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 0 70px; text-align: center; }
      .accent, .cap-en {
        display: block; line-height: 1;
        background: linear-gradient(90deg, ${accentFrom}, ${accentTo});
        -webkit-background-clip: text; background-clip: text; color: transparent;
        filter: drop-shadow(0 0 2px rgba(255,255,255,0.95)) drop-shadow(0 2px 6px rgba(0,0,0,0.35));
        padding: 8px 12px;
      }
      .accent { font-size: ${style.accentSize}px; }
      .accent-top { margin-bottom: 110px; }
      .accent-bottom { margin-top: 150px; }
      .title-line { display: block; font-size: ${style.titleSize}px; line-height: 1.12; letter-spacing: -0.02em; text-shadow: 0 0 3px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.35); white-space: nowrap; }
      .cap-slot { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: ${offsetY}px 60px 0; text-align: center; }
      .cap-line { display: block; font-size: ${style.captionSize}px; line-height: 1.18; letter-spacing: -0.02em; text-shadow: 0 0 4px rgba(0,0,0,0.7), 0 2px 10px rgba(0,0,0,0.5); white-space: nowrap; }
      #badge { position: absolute; left: 0; right: 0; top: 250px; display: flex; justify-content: center; }
      .badge-text { display: block; font-size: ${Math.round(style.captionSize * 0.82)}px; line-height: 1.2; letter-spacing: -0.01em; text-shadow: 0 0 4px rgba(0,0,0,0.7), 0 2px 10px rgba(0,0,0,0.5); white-space: nowrap; }
      #outro-wrap { position: absolute; inset: 0; overflow: hidden; background: #000; }
      #outro-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(16px) brightness(0.55); }
      #outro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 0 70px; text-align: center; }
      .outro-accent { margin-bottom: 40px; }
      .outro-line { display: block; font-size: ${Math.round(style.captionSize * 1.25)}px; line-height: 1.2; letter-spacing: -0.02em; text-shadow: 0 0 3px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.35); white-space: nowrap; }
      .cap-en { font-size: ${style.enSize}px; margin-bottom: 4px; }
      .cap--label .cap-head { font-size: ${Math.round(style.captionSize * 1.08)}px; }`;
  const body = `
      <div id="intro-scrim" class="clip" data-start="${intro.start}" data-duration="${+(introEnd - intro.start).toFixed(3)}" data-track-index="1"></div>
      <div id="intro" class="clip" data-start="${intro.start}" data-duration="${+(introEnd - intro.start).toFixed(3)}" data-track-index="1">
        ${intro.top ? `<span class="accent accent-top">${esc(intro.top)}</span>` : ""}
        ${lines(intro.lines, "title-line")}
        ${intro.bottom ? `<span class="accent accent-bottom">${esc(intro.bottom)}</span>` : ""}
      </div>

      <div id="cap-scrim" class="clip" data-start="${introEnd}" data-duration="${+(D - introEnd).toFixed(3)}" data-track-index="1"></div>
${captionHtml}
${badge ? `      <div id="badge" class="clip" ${clipAttrs(badgeStart, badgeEnd, 3)}>\n        <p class="badge-text">${rich(badge.text)}</p>\n      </div>` : ""}
${outroBg}
${outro ? `      <div id="outro" class="clip" ${clipAttrs(D, TOTAL, 5)}>\n        ${outro.top ? `<span class="accent outro-accent">${esc(outro.top)}</span>` : ""}\n        ${lines(outro.lines, "outro-line")}\n      </div>` : ""}`;
  return { css, body };
}

// ======================= vlog: 임장 브이로그 =======================
// Every caption has a role (tone) and the role decides the decoration, like the reference reels:
// info = white boxes + black heavy gothic (titles, facts) / say = white hand lettering + dark outline (plain talk)
// explain = white lettering + soft colored glow / react = big colored lettering, double outline, tilted (reactions)
// note = masking tape label (short asides) / ask = comic speech bubble / highlight = solid color boxes
const VLOG_TONE_DEFAULT = { info: "mid", say: "low", explain: "low", react: "mid", note: "low", ask: "mid", highlight: "low" };
const VLOG_POS = { top: 430, upper: 640, mid: 900, low: 1230 };
const STICKERS = {
  sparkle: (c) => `<svg viewBox="0 0 40 40"><path d="M20 2 C21.5 14 26 18.5 38 20 C26 21.5 21.5 26 20 38 C18.5 26 14 21.5 2 20 C14 18.5 18.5 14 20 2Z" fill="${c}" stroke="#1d1d1d" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  heart: (c) => `<svg viewBox="0 0 40 40"><path d="M20 35 C8 26 3 19 3 12.5 C3 7.5 7 4 11.5 4 C15 4 18 6 20 9.5 C22 6 25 4 28.5 4 C33 4 37 7.5 37 12.5 C37 19 32 26 20 35Z" fill="${c}" stroke="#1d1d1d" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
  star: (c) => `<svg viewBox="0 0 40 40"><path d="M20 3 L24.6 14.6 L37 15.4 L27.4 23.3 L30.5 35.5 L20 28.8 L9.5 35.5 L12.6 23.3 L3 15.4 L15.4 14.6Z" fill="${c}" stroke="#1d1d1d" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  burst: (c) => `<svg viewBox="0 0 40 40"><g stroke="${c}" stroke-width="4.5" stroke-linecap="round"><path d="M8 30 L15 23"/><path d="M20 26 L20 13"/><path d="M32 30 L25 23"/></g></svg>`,
  arrow: (c) => `<svg viewBox="0 0 60 40"><path d="M6 8 C 10 30, 34 36, 52 26" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/><path d="M44 20 L53 26 L43 32" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
function vlog() {
  const P = { hot: "#ff6a3d", sun: "#ffd447", pink: "#ff8fb8", glow: "#8fa8ff", deep: "#2f5d4f", tape: "#f1e2bf", ...(spec.vlogPalette || {}) };
  const colorOf = (k) => P[k] || k;
  // text -> per-character spans for the typing reveal; *word* becomes an accent run
  const typed = (line, accent) =>
    String(line)
      .split(/(\*[^*]+\*)/)
      .map((seg) => {
        const em = /^\*.*\*$/.test(seg);
        const chars = [...(em ? seg.slice(1, -1) : seg)].map((ch) => `<span class="ch">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("");
        return em ? `<em style="color:${accent}">${chars}</em>` : chars;
      })
      .join("");
  const plainLines = (arr, accent) => arr.map((l) => typed(l, accent)).join("<br>");
  const items = [];
  if (intro.lines?.length) items.push({ id: "intro-title", tone: "info", lines: intro.lines, start: intro.start, end: introEnd, pos: intro.pos || "upper", sticker: intro.sticker ?? "sparkle" });
  if (intro.say) items.push({ id: "intro-say", tone: intro.sayTone || "say", lines: [].concat(intro.say), start: intro.start + 0.5, end: introEnd, pos: "low" });
  captions.filter((c) => c.lines.length).forEach((c) => items.push({ ...c, tone: c.tone || "say" }));
  // optional title recap on top of a caption (the reference repeats its title card mid-video)
  captions.filter((c) => c.title).forEach((c) => items.push({ id: `${c.id}-title`, tone: "info", lines: intro.lines, start: c.start, end: c.end, pos: "top", small: true }));

  const html = [];
  for (const it of items) {
    const tone = it.tone;
    if (!VLOG_TONE_DEFAULT[tone]) warnings.push(`${it.id} tone "${tone}" unknown (info say explain react note ask highlight)`);
    const y = (VLOG_POS[it.pos || VLOG_TONE_DEFAULT[tone]] ?? VLOG_POS.low) + (it.offsetY ?? offsetY);
    const tilt = it.tilt ?? { react: -4, note: -2.5, ask: 2 }[tone] ?? 0;
    const accent = colorOf(it.accent || (tone === "say" ? "sun" : tone === "explain" ? "sun" : "hot"));
    const sticker = it.sticker === "none" ? null : it.sticker || { react: "burst", info: null, ask: null }[tone] || null;
    const stColor = colorOf(it.stickerColor || (sticker === "heart" ? "pink" : sticker === "burst" ? "sun" : "#ffffff"));
    let inner;
    if (tone === "info" || tone === "highlight") {
      inner = it.lines.map((l) => `<span class="box">${typed(l, tone === "info" ? colorOf("hot") : colorOf("sun"))}</span>`).join("");
    } else if (tone === "react") {
      const col = colorOf(it.color || "hot");
      const t = it.lines.map((l) => esc(plain(l))).join("<br>");
      inner = `<span class="rk">${t}</span><span class="rf" style="color:${col}">${t}</span>`;
    } else {
      inner = plainLines(it.lines, accent);
    }
    const st = sticker ? `<i class="st st-${sticker}">${STICKERS[sticker](stColor)}</i>${sticker === "sparkle" ? `<i class="st st2">${STICKERS.sparkle(colorOf("sun"))}</i>` : ""}` : "";
    html.push(`      <div id="${it.id}" class="vc clip" style="top:${y}px" ${clipAttrs(it.start, it.end, it.small ? 3 : 2)}><div class="t-${tone}${it.small ? " small" : ""}" style="transform:rotate(${tilt}deg)">${inner}${st}</div></div>`);
    // motion: typing for talk-like tones, pop for reactions/bubbles, slide for boxes
    const sel = `#${it.id}`;
    if (tone === "react" || tone === "ask") {
      tweens.push(`tl.fromTo("${sel} > div", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.42, ease: "back.out(2.4)" }, ${it.start.toFixed(2)});`);
    } else if (tone === "info" || tone === "highlight") {
      tweens.push(`tl.fromTo("${sel} .box", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.1 }, ${it.start.toFixed(2)});`);
    } else {
      if (tone === "note") tweens.push(`tl.fromTo("${sel} > div", { opacity: 0 }, { opacity: 1, duration: 0.15 }, ${it.start.toFixed(2)});`);
      const n = it.lines.reduce((a, l) => a + [...plain(l)].length, 0);
      const each = Math.min(0.05, 0.9 / Math.max(n, 1));
      tweens.push(`tl.fromTo("${sel} .ch", { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: ${each.toFixed(3)} }, ${(it.start + (tone === "note" ? 0.1 : 0)).toFixed(2)});`);
    }
    if (sticker) tweens.push(`tl.fromTo("${sel} .st", { opacity: 0, scale: 0.2, rotation: -40 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.4, ease: "back.out(2.6)", stagger: 0.08 }, ${(it.start + 0.25).toFixed(2)});`);
    fadeOut(sel, it.end, 0.18);
  }
  if (badge) tweens.push(`tl.fromTo("#badge", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${badgeStart.toFixed(2)});`);
  if (outro) {
    tweens.push(`tl.fromTo("#outro-bg", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, ${D.toFixed(2)});`);
    tweens.push(`tl.fromTo("#outro-v .box", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.12 }, ${(D + 0.15).toFixed(2)});`);
    if (outro.say) tweens.push(`tl.fromTo("#outro-say .ch", { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.04 }, ${(D + 0.7).toFixed(2)});`);
  }
  const ink = "#1d1d1d";
  const css = `
      #root { color: #fff; }
      em { font-style: normal; }
      .vc { position: absolute; left: 0; right: 0; display: flex; justify-content: center; transform: translateY(-50%); }
      .vc > div { position: relative; text-align: center; white-space: nowrap; }
      .ch { display: inline; }
      .st { position: absolute; width: 64px; height: 64px; top: -46px; right: -50px; }
      .st svg { width: 100%; height: 100%; overflow: visible; }
      .st2 { width: 38px; height: 38px; top: auto; bottom: -22px; right: auto; left: -44px; }
      .st-arrow { width: 110px; height: 74px; top: auto; bottom: -70px; right: auto; left: -70px; }
      .st-burst { top: -64px; right: -40px; width: 80px; height: 80px; }
      /* info: one white box per line, heavy gothic */
      .t-info { display: flex; flex-direction: column; align-items: center; gap: 10px; }
      .t-info .box { display: inline-block; background: #fff; color: #141414; font-family: "Pretendard"; font-weight: 900; font-size: 66px; line-height: 1.12;
        letter-spacing: -0.04em; padding: 10px 26px 12px; border-radius: 14px; box-shadow: 0 6px 18px rgba(0,0,0,0.18); }
      .t-info.small .box { font-size: 40px; padding: 6px 16px 8px; border-radius: 10px; }
      /* highlight: solid color boxes, white bold text */
      .t-highlight { display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .t-highlight .box { display: inline-block; background: ${P.deep}; color: #fff; font-family: "Pretendard"; font-weight: 800; font-size: 52px; line-height: 1.2;
        letter-spacing: -0.03em; padding: 8px 22px 10px; border-radius: 10px; }
      /* say: white hand lettering with a dark outline */
      .t-say { font-family: "RoomTourHand"; font-weight: 700; font-size: 76px; line-height: 1.14; letter-spacing: -0.06em; color: #fff;
        -webkit-text-stroke: 11px ${ink}; paint-order: stroke fill; text-shadow: 0 5px 10px rgba(0,0,0,0.25); }
      /* explain: white lettering with a soft colored glow */
      .t-explain { font-family: "RoomTourHand"; font-weight: 700; font-size: 70px; line-height: 1.18; letter-spacing: -0.05em; color: #fff;
        -webkit-text-stroke: 4px #26305e; paint-order: stroke fill;
        text-shadow: 0 0 10px ${P.glow}, 0 0 22px ${P.glow}, 0 0 36px ${P.glow}; }
      /* react: big colored lettering, white outline over a dark outline */
      .t-react { display: grid; font-family: "RoomTourHand"; font-weight: 700; font-size: 112px; line-height: 1.05; letter-spacing: -0.04em; }
      .t-react > span { grid-area: 1 / 1; }
      .t-react .rk { color: ${ink}; -webkit-text-stroke: 28px ${ink}; paint-order: stroke fill; text-shadow: 0 8px 0 ${ink}; }
      .t-react .rf { -webkit-text-stroke: 12px #fff; paint-order: stroke fill; }
      /* note: masking tape label */
      .t-note { font-family: "RoomTourHand"; font-weight: 700; font-size: 58px; line-height: 1.2; letter-spacing: -0.04em; color: #2a2620; background: ${P.tape};
        padding: 16px 40px 18px; box-shadow: 0 6px 14px rgba(0,0,0,0.22);
        clip-path: polygon(0 6%, 3% 0, 7% 7%, 12% 1%, 18% 6%, 25% 0, 33% 5%, 41% 0, 50% 6%, 58% 1%, 66% 6%, 74% 0, 82% 5%, 90% 0, 96% 6%, 100% 2%, 100% 95%, 97% 100%, 91% 94%, 84% 100%, 76% 95%, 68% 100%, 60% 94%, 51% 100%, 43% 95%, 35% 100%, 27% 94%, 19% 100%, 11% 95%, 5% 100%, 0 94%); }
      .t-note em { color: #c2410c !important; }
      /* ask: comic speech bubble */
      .t-ask { font-family: "RoomTourHand"; font-weight: 700; font-size: 64px; line-height: 1.18; letter-spacing: -0.05em; color: ${ink}; background: #fff; border: 5px solid ${ink};
        border-radius: 999px; padding: 26px 56px 30px; }
      .t-ask::after { content: ""; position: absolute; left: 22%; bottom: -30px; width: 40px; height: 40px; background: #fff;
        border-right: 5px solid ${ink}; border-bottom: 5px solid ${ink}; transform: skewX(-25deg) rotate(45deg); }
      .t-ask em { color: ${P.hot} !important; }
      #badge { position: absolute; top: 236px; left: 50%; transform: translateX(-50%); padding: 10px 24px; border-radius: 12px; background: #fff;
        color: #141414; font-family: "Pretendard"; font-weight: 800; font-size: 34px; letter-spacing: -0.02em; white-space: nowrap; }
      #outro-wrap { position: absolute; inset: 0; overflow: hidden; background: #000; }
      #outro-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(10px) brightness(0.75); }
      #outro-v { position: absolute; left: 0; right: 0; top: 760px; display: flex; flex-direction: column; align-items: center; gap: 70px; }`;
  const body = `
${html.join("\n")}
${badge ? `      <div id="badge" class="clip" ${clipAttrs(badgeStart, badgeEnd, 6)}>${rich(badge.text)}</div>` : ""}
${outroBg}
${
  outro
    ? `      <div id="outro-v" class="clip" ${clipAttrs(D, TOTAL, 5)}><div class="t-info">${(outro.lines || []).map((l) => `<span class="box">${typed(l, P.hot)}</span>`).join("")}</div>${
        outro.say ? `<div id="outro-say" class="t-say">${plainLines([].concat(outro.say), P.sun)}</div>` : ""
      }</div>`
    : ""
}`;
  return { css, body };
}

// ======================= quiz: 질문 훅 + 정보 프레임 =======================
// Like the price-quiz / listing-info shorts: solid bands top and bottom, footage in the middle,
// a fixed hook headline on top, a price line that stays hidden as ??? until `reveal.at`,
// and the agency disclosure line under the footage.
function quiz() {
  const Q = { band: "#1d2550", accent: "#ffd84a", ...(spec.quizPalette || {}) };
  const FT = 560, FH = 900; // footage window: y 560..1460
  const reveal = spec.reveal || null;
  const agency = spec.agency || null;
  const subs = captions
    .filter((c) => c.lines.length)
    .map((c) => `      <div id="${c.id}" class="qsub clip" ${clipAttrs(c.start, c.end, 2)}>${c.lines.map(rich).join("<br>")}</div>`)
    .join("\n");
  const chips = rooms.map((r) => `      <div id="${r.id}" class="qchip clip" ${clipAttrs(r.start, r.end, 3)}>${esc(r.name)}${r.tags.length ? `<small>${r.tags.map(esc).join(" · ")}</small>` : ""}</div>`).join("\n");
  const priceLines = reveal ? reveal.lines || [] : [];
  const hidden = priceLines.map((l) => esc(plain(l).replace(/[0-9][0-9,.]*(만원|억|천|만)?/g, "???"))).join("<br>");
  if (reveal && reveal.at === undefined) warnings.push("reveal.at (seconds) is required to show the price");
  // headline is on screen the whole time; it pops in once
  tweens.push(`tl.fromTo("#qhead .h", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out", stagger: 0.12 }, 0.1);`);
  if (intro.bottom) tweens.push(`tl.fromTo("#qhead .s", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.6);`);
  for (const c of captions.filter((c) => c.lines.length)) {
    tweens.push(`tl.fromTo("#${c.id}", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" }, ${c.start.toFixed(2)});`);
    fadeOut(`#${c.id}`, c.end);
  }
  for (const r of rooms) {
    tweens.push(`tl.fromTo("#${r.id}", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, ${r.start.toFixed(2)});`);
    fadeOut(`#${r.id}`, r.end);
  }
  if (reveal) {
    const at = reveal.at ?? D - 3;
    tweens.push(`tl.fromTo("#qprice .hid", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${(introEnd).toFixed(2)});`);
    tweens.push(`tl.to("#qprice .hid", { opacity: 0, scale: 1.3, duration: 0.25, ease: "power1.in" }, ${(at - 0.25).toFixed(2)});`);
    tweens.push(`tl.fromTo("#qprice .val", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2.2)", immediateRender: false }, ${at.toFixed(2)});`);
    tweens.push(`tl.set("#qprice .val", { opacity: 0 }, 0);`);
    tweens.push(`tl.fromTo("#qprice .flash", { opacity: 0.85 }, { opacity: 0, duration: 0.6, ease: "power1.out", immediateRender: false }, ${at.toFixed(2)});`);
  }
  if (outro) {
    tweens.push(`tl.fromTo("#outro-bg", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" }, ${D.toFixed(2)});`);
    tweens.push(`tl.fromTo("#qend > *", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.42, ease: "power2.out", stagger: 0.12 }, ${(D + 0.15).toFixed(2)});`);
  }
  const css = `
      #root { font-family: "Pretendard", sans-serif; color: #fff; background: ${Q.band}; }
      em { font-style: normal; color: ${Q.accent}; }
      #footage { top: ${FT}px; height: ${FH}px; }
      #qhead { position: absolute; top: 200px; left: 50px; right: 50px; height: ${FT - 220}px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
      #qhead .h { font-weight: 900; font-size: 92px; line-height: 1.12; letter-spacing: -0.045em; white-space: nowrap; }
      #qhead .s { font-weight: 700; font-size: 38px; margin-top: 20px; opacity: 0.85; letter-spacing: -0.02em; }
      #qprice { position: absolute; left: 0; right: 0; top: ${FT + FH - 200}px; height: 180px; display: flex; align-items: center; justify-content: center; }
      #qprice > div { grid-area: 1 / 1; }
      #qprice .wrap { display: grid; place-items: center; }
      #qprice .hid, #qprice .val { grid-area: 1 / 1; background: rgba(0,0,0,0.62); padding: 18px 40px; border-radius: 18px; font-weight: 900; font-size: 56px; line-height: 1.25; letter-spacing: -0.03em; text-align: center; white-space: nowrap; }
      #qprice .hid { color: #fff; }
      #qprice .val { color: ${Q.accent}; }
      #qprice .flash { position: absolute; inset: -${FT + FH - 200}px 0 0 0; background: #fff; pointer-events: none; height: 1920px; opacity: 0; }
      .qchip { position: absolute; top: ${FT + 30}px; left: 40px; background: ${Q.band}; padding: 10px 22px 12px; border-radius: 12px; font-weight: 800; font-size: 40px; letter-spacing: -0.02em; white-space: nowrap; }
      .qchip small { display: block; font-weight: 600; font-size: 26px; opacity: 0.85; margin-top: 2px; }
      .qsub { position: absolute; left: 0; right: 0; top: ${FT + FH - 330}px; text-align: center; font-weight: 800; font-size: 50px; line-height: 1.28; letter-spacing: -0.03em; white-space: nowrap;
        text-shadow: 0 0 6px rgba(0,0,0,0.6), 0 2px 14px rgba(0,0,0,0.55); }
      #qagency { position: absolute; top: ${FT + FH + 24}px; left: 40px; right: 40px; text-align: center; font-weight: 600; font-size: 28px; line-height: 1.45; opacity: 0.9; letter-spacing: -0.01em; }
      #outro-wrap { position: absolute; inset: 0; overflow: hidden; background: #000; }
      #outro-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(18px) brightness(0.5); }
      #qend { position: absolute; top: 640px; left: 80px; right: 80px; text-align: center; }
      #qend .t { font-weight: 700; font-size: 40px; opacity: 0.85; }
      #qend .big { font-weight: 900; font-size: 104px; line-height: 1.12; letter-spacing: -0.04em; margin-top: 10px; white-space: nowrap; }
      #qend .row { font-weight: 600; font-size: 42px; margin-top: 22px; opacity: 0.92; white-space: nowrap; }
      #qend .cta { margin-top: 46px; display: inline-block; font-weight: 800; font-size: 44px; background: ${Q.accent}; color: #1a1a1a; padding: 18px 40px; border-radius: 999px; }`;
  const agencyLine = agency ? [agency.name, agency.owner && `대표 ${agency.owner}`, agency.reg && `등록번호 ${agency.reg}`, agency.address, agency.phone].filter(Boolean).map(esc).join(" · ") : "";
  const body = `
      <div id="qhead" class="clip" ${clipAttrs(0, D, 1)}>${intro.lines.map((l) => `<div class="h">${rich(l)}</div>`).join("")}${intro.bottom ? `<div class="s">${rich(intro.bottom)}</div>` : ""}</div>
${subs}
${chips}
${reveal ? `      <div id="qprice" class="clip" ${clipAttrs(introEnd, D, 4)}><div class="wrap"><div class="hid">${hidden}</div><div class="val">${priceLines.map(rich).join("<br>")}</div></div><div class="flash"></div></div>` : ""}
${agency ? `      <div id="qagency" class="clip" ${clipAttrs(0, D, 6)}>${agencyLine}</div>` : ""}
${outroBg}
${
  outro
    ? `      <div id="qend" class="clip" ${clipAttrs(D, TOTAL, 5)}>${outro.top ? `<div class="t">${rich(outro.top)}</div>` : ""}${(outro.big || []).map((l) => `<div class="big">${rich(l)}</div>`).join("")}${(outro.lines || []).map((l) => `<div class="row">${rich(l)}</div>`).join("")}${outro.cta ? `<div><span class="cta">${rich(outro.cta)}</span></div>` : ""}</div>`
    : ""
}`;
  return { css, body };
}

// ======================= luxe: 미니멀 하이엔드 =======================
// Like high-end listing/interior shorts: almost no text. A short serif cover, small brief room names,
// a persistent small brand + contact watermark, and one closing card.
function luxe() {
  const brand = spec.brand || null;
  const contact = spec.contact || null;
  const notes = captions
    .filter((c) => c.lines.length && !c.room)
    .map((c) => `      <div id="${c.id}" class="note clip" ${clipAttrs(c.start, c.end, 2)}>${c.lines.map(rich).join("<br>")}</div>`)
    .join("\n");
  if (captions.filter((c) => c.lines.length && !c.room).length > 2) warnings.push("luxe: keep in-between sentences to 2 or fewer (reference reels have almost no text)");
  const roomHtml = rooms
    .map((r) => {
      const ko = [r.name, ...r.cap.lines.map(plain)].join(" · ");
      const end = Math.min(r.end, r.start + 2.8); // names show briefly, then the footage carries the room
      return `      <div id="${r.id}" class="lbl clip" ${clipAttrs(r.start, end, 3)}>${r.en ? `<div class="en">${esc(r.en)}</div>` : ""}<div class="ko"><i></i>${esc(ko)}</div></div>`;
    })
    .join("\n");
  tweens.push(`tl.fromTo("#cover .en", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" }, ${(intro.start + 0.2).toFixed(2)});`);
  tweens.push(`tl.fromTo("#cover .rule", { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power2.inOut" }, ${(intro.start + 0.6).toFixed(2)});`);
  tweens.push(`tl.fromTo("#cover .ko, #cover .sm", { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power1.out", stagger: 0.2 }, ${(intro.start + 0.9).toFixed(2)});`);
  tweens.push(`tl.to("#cover > *", { opacity: 0, duration: 0.45, ease: "power1.in" }, ${(introEnd - 0.47).toFixed(2)});`);
  for (const c of captions.filter((c) => c.lines.length && !c.room)) {
    tweens.push(`tl.fromTo("#${c.id}", { opacity: 0 }, { opacity: 1, duration: 0.7, ease: "power1.out" }, ${c.start.toFixed(2)});`);
    fadeOut(`#${c.id}`, c.end, 0.5);
  }
  for (const r of rooms) {
    const end = Math.min(r.end, r.start + 2.8);
    tweens.push(`tl.fromTo("#${r.id} > *", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", stagger: 0.15 }, ${r.start.toFixed(2)});`);
    tweens.push(`tl.to("#${r.id} > *", { opacity: 0, duration: 0.5, ease: "power1.in" }, ${(end - 0.52).toFixed(2)});`);
  }
  if (brand || contact) tweens.push(`tl.fromTo("#wm", { opacity: 0 }, { opacity: 1, duration: 0.8 }, ${introEnd.toFixed(2)});`);
  if (outro) {
    tweens.push(`tl.fromTo("#outro-bg", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.out" }, ${D.toFixed(2)});`);
    tweens.push(`tl.fromTo("#end > *", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", stagger: 0.18 }, ${(D + 0.25).toFixed(2)});`);
  }
  const css = `
      #root { color: #fff; }
      em { font-style: normal; color: #e9d9b8; }
      #shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.16), rgba(0,0,0,0) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.3) 100%); }
      #cover { position: absolute; top: 720px; left: 0; right: 0; text-align: center; }
      #cover .en { font-family: "LuxeEn", serif; font-style: italic; font-weight: 500; font-size: 132px; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.25); }
      #cover .rule { width: 80px; height: 1.5px; background: rgba(255,255,255,0.85); margin: 40px auto 32px; }
      #cover .ko { font-family: "LuxeKo", serif; font-size: 36px; letter-spacing: 0.28em; line-height: 1.7; text-shadow: 0 1px 10px rgba(0,0,0,0.35); }
      #cover .sm { font-family: "LuxeKo", serif; font-size: 24px; letter-spacing: 0.3em; margin-top: 18px; opacity: 0.8; }
      .lbl { position: absolute; left: 70px; top: 1300px; text-shadow: 0 1px 12px rgba(0,0,0,0.35); }
      .lbl .en { font-family: "LuxeEn", serif; font-style: italic; font-weight: 500; font-size: 76px; line-height: 1; }
      .lbl .ko { font-family: "LuxeKo", serif; font-size: 28px; letter-spacing: 0.2em; margin-top: 16px; display: flex; align-items: center; gap: 18px; white-space: nowrap; }
      .lbl .ko i { display: inline-block; width: 44px; height: 1.5px; background: #e9d9b8; }
      .note { position: absolute; top: 1010px; left: 0; right: 0; text-align: center; font-family: "LuxeKo", serif; font-size: 40px; line-height: 1.7;
        letter-spacing: 0.08em; text-shadow: 0 1px 12px rgba(0,0,0,0.45); white-space: nowrap; }
      #wm { position: absolute; top: 236px; right: 60px; text-align: right; opacity: 0.82; text-shadow: 0 1px 8px rgba(0,0,0,0.35); }
      #wm .b { font-family: "LuxeEn", serif; font-style: italic; font-weight: 500; font-size: 40px; line-height: 1.1; }
      #wm .c { font-family: "Pretendard", sans-serif; font-weight: 600; font-size: 24px; letter-spacing: 0.04em; margin-top: 6px; }
      #outro-wrap { position: absolute; inset: 0; overflow: hidden; background: #000; }
      #outro-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(14px) brightness(0.42) saturate(0.8); }
      #end { position: absolute; top: 720px; left: 0; right: 0; text-align: center; color: #f3eadb; }
      #end .en { font-family: "LuxeEn", serif; font-style: italic; font-weight: 500; font-size: 100px; }
      #end .rule { width: 70px; height: 1.5px; background: #d8c39a; margin: 38px auto; }
      #end .ko { font-family: "LuxeKo", serif; font-size: 36px; line-height: 1.9; letter-spacing: 0.14em; white-space: nowrap; }`;
  const body = `
      <div id="shade" class="clip" ${clipAttrs(0, D, 1)}></div>
      <div id="cover" class="clip" ${clipAttrs(intro.start, introEnd, 1)}>
        <div class="en">${esc(intro.top || "Room Tour")}</div><div class="rule"></div><div class="ko">${intro.lines.map(rich).join("<br>")}</div>${intro.bottom ? `<div class="sm">${esc(intro.bottom)}</div>` : ""}
      </div>
${notes}
${roomHtml}
${brand || contact ? `      <div id="wm" class="clip" ${clipAttrs(introEnd, D, 6)}>${brand ? `<div class="b">${esc(brand)}</div>` : ""}${contact ? `<div class="c">${esc(contact)}</div>` : ""}</div>` : ""}
${outroBg}
${outro ? `      <div id="end" class="clip" ${clipAttrs(D, TOTAL, 5)}><div class="en">${esc(outro.top || "Private Viewing")}</div><div class="rule"></div><div class="ko">${(outro.lines || []).map(rich).join("<br>")}</div></div>` : ""}`;
  return { css, body };
}

const { css, body } = { diary, vlog, quiz, luxe }[styleName]();

// Narration clips from tts.py (voice.json): one <audio> per line, on its own track.
// The AI-voice disclosure goes in the Instagram caption (see SKILL.md report step), not on screen.
// spec.aiLabel: true puts a small "AI 음성" mark on the video as well.
const aiLabelHtml = voice && spec.aiLabel === true
  ? `      <div id="ai-label" class="clip" ${clipAttrs(0, TOTAL, 9)}>AI 음성</div>`
  : "";
const voiceHtml = voice
  ? voice.clips
      .map((v, i) => `      <audio id="vo-${i + 1}" src="${v.file}" ${clipAttrs(v.start, Math.min(v.start + v.duration, TOTAL), 10 + (i % 2))} data-volume="${voice.volume ?? 1}"></audio>`)
      .join("\n")
  : "";
if (voice) {
  let prev = -1;
  voice.clips.forEach((v, i) => {
    if (!existsSync(join(dir, v.file))) warnings.push(`narration file missing: ${v.file} (run tts.py again)`);
    if (v.start < prev - 0.05) warnings.push(`narration ${i + 1} starts at ${v.start}s while line ${i} is still speaking (until ${prev.toFixed(2)}s)`);
    prev = v.start + v.duration;
  });
}

// Optional background music (spec.bgm): trimmed and loudness-normalized once, faded in/out,
// and ducked under every narration line so the voice stays on top.
const bgm = spec.bgm || null;
let bgmHtml = "";
if (bgm) {
  const srcPath = join(dir, bgm.src || "");
  const normRel = "assets/bgm-norm.m4a";
  const normPath = join(dir, normRel);
  if (!bgm.src || !existsSync(srcPath)) warnings.push(`background music not found: ${bgm.src}`);
  else {
    if (!existsSync(normPath) || statSync(srcPath).mtimeMs > statSync(normPath).mtimeMs || bgm.offset !== undefined) {
      const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(bgm.offset ?? 0), "-i", srcPath, "-vn", "-t", String(TOTAL + 1),
        "-af", "loudnorm=I=-20:TP=-2:LRA=11", "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", normPath]);
      if (r.status !== 0) warnings.push(`could not prepare background music: ${r.stderr}`);
    }
    const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", normPath]);
    const len = parseFloat(String(pr.stdout)) || 0;
    if (len && len < TOTAL - 0.2) warnings.push(`background music is ${len.toFixed(1)}s, shorter than the video (${TOTAL}s); pick a longer track or an earlier offset`);
    const base = bgm.volume ?? 0.85;
    const duck = bgm.duck ?? 0.22;
    const fadeOut = Math.min(bgm.fadeOut ?? 1.5, TOTAL / 3);
    const fadeStart = TOTAL - fadeOut;
    // merge narration windows that are close together into one duck
    const spans = [];
    for (const c of voice ? voice.clips : []) {
      const s0 = c.start, e0 = c.start + c.duration;
      const last = spans[spans.length - 1];
      if (last && s0 - last[1] < 0.6) last[1] = Math.max(last[1], e0);
      else spans.push([s0, e0]);
    }
    const pts = [[0, 0], [0.4, base]];
    for (const [s0, e0] of spans) {
      const a0 = Math.max(s0 - 0.2, pts[pts.length - 1][0] + 0.01);
      if (a0 >= fadeStart) break;
      pts.push([a0, base], [s0, duck], [Math.min(e0, fadeStart), duck]);
      if (e0 + 0.3 < fadeStart) pts.push([e0 + 0.3, base]);
    }
    const lastV = pts[pts.length - 1][1];
    pts.push([Math.max(fadeStart, pts[pts.length - 1][0] + 0.01), lastV], [TOTAL, 0]);
    const automation = JSON.stringify({ version: 1, lanes: [{ target: "volume", points: pts.map(([t, v]) => ({ t: +t.toFixed(3), v: +v.toFixed(3) })) }] });
    bgmHtml = `      <audio id="bgm" src="${normRel}" ${clipAttrs(0, TOTAL, 12)} data-volume="1" data-automation='${automation}'></audio>`;
  }
}

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${fontFaces}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
      #footage { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      #ai-label { position: absolute; top: 172px; right: 48px; padding: 6px 14px; border-radius: 8px; background: rgba(0,0,0,0.38);
        color: rgba(255,255,255,0.9); font: 600 26px/1.2 "Pretendard", sans-serif; letter-spacing: -0.01em; }${css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1080" data-height="1920">
      <video id="footage" class="clip" src="${spec.src}" playsinline ${volume > 0 ? `data-has-audio="true" data-volume="${volume}"` : "muted"} data-start="0" data-duration="${D}" data-track-index="0"></video>
${body}
${aiLabelHtml}
${voiceHtml}
${bgmHtml}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${tweens.join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

writeFileSync(join(dir, "index.html"), html.replace(/\n{3,}/g, "\n\n"));
// Plain list of every on-screen text with its time window, for review and hand-off.
const f = (n) => (+n).toFixed(1);
const listing = [
  `style: ${styleName}${voice ? ` · narration ${voice.voice} (${voice.clips.length} lines)` : ""}`,
  `${f(intro.start)}-${f(introEnd)}\t[intro] ${[intro.top, ...intro.lines, intro.bottom].filter(Boolean).map(plain).join(" / ")}${intro.say ? `  (say: ${[].concat(intro.say).map(plain).join(" ")})` : ""}`,
  ...captions.map((c) => `${f(c.start)}-${f(c.end)}\t${c.kind === "label" ? "[label] " : ""}${c.room ? `[${c.room}${c.tags ? " | " + c.tags.join(", ") : ""}] ` : ""}${c.en ? c.en + " / " : ""}${c.lines.map(plain).join(" / ")}`),
  ...(badge ? [`${f(badgeStart)}-${f(badgeEnd)}\t[badge] ${plain(badge.text)}`] : []),
  ...(outro ? [`${f(D)}-${f(TOTAL)}\t[outro] ${[outro.top, ...(outro.big || []), ...(outro.lines || []), outro.cta].filter(Boolean).map(plain).join(" / ")}`] : []),
  ...(bgm ? [`bgm: ${bgm.src}${bgm.credit ? " (" + bgm.credit + ")" : ""}`] : []),
  ...(voice ? ["", "narration:", ...voice.clips.map((v) => `${f(v.start)}-${f(v.start + v.duration)}\t${v.text}`)] : []),
];
writeFileSync(join(dir, "captions.txt"), listing.join("\n") + "\n");
console.log(`wrote ${join(dir, "index.html")} (${styleName}, ${captions.length} captions, ${TOTAL}s${outro ? `, incl. ${hold}s end card` : ""}${voice ? `, ${voice.clips.length} narration clips` : ""})`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
