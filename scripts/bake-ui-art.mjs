// Bakes the Hawkes Gen UI art sheets into textures/ui/*.webp (each <= 40 KB). Needs only ffmpeg (libwebp).
//   node scripts/bake-ui-art.mjs <dir with verbs.png ranks.png busts.png frame.png>
// Sources are the Gen jobs' sheets (hawkes.assets.json ui-* recipes). The background is near white, so the
// part of it connected to the sheet's edge is turned into alpha ("colour to alpha", which also keeps the soft
// cyan glow as real translucency); art inside the shapes stays opaque. Unlit verbs are the lit ones desaturated
// and dimmed. The frame is rebuilt as a clean 9-slice atlas (corners + one straight run per edge, so the mid-edge
// studs are never stretched): 152x152, corner 56 px (css `--ui-frame-slice`).
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const src = process.argv[2];
if (!src) { console.error("usage: node scripts/bake-ui-art.mjs <source dir>"); process.exit(1); }
const OUT = "textures/ui";
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), "uiart-"));

function ff(args, input) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { input, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  return r.stdout;
}
function decode(file, crop) {
  const vf = (crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : "") + "format=rgba";
  const buf = ff(["-i", path.join(src, file), "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
  return { w: crop ? crop.w : 0, h: crop ? crop.h : 0, d: buf };
}
function size(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(src, file)]);
  const [w, h] = String(r.stdout).trim().split(",").map(Number);
  return { w, h };
}
function encode(img, out, { w, h, q = 82 }) {
  const raw = path.join(tmp, "x.rgba");
  writeFileSync(raw, img.d);
  const vf = `scale=${w}:${h}:flags=lanczos`;
  ff(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${img.w}x${img.h}`, "-i", raw, "-vf", vf, "-c:v", "libwebp", "-quality", String(q), "-compression_level", "6", "-pix_fmt", "yuva420p", out]);
  const kb = statSync(out).size / 1024;
  console.log(path.basename(out), `${w}x${h}`, kb.toFixed(1) + " KB");
  if (kb > 40) throw new Error(out + " over 40 KB");
}
const minc = (d, i) => Math.min(d[i], d[i + 1], d[i + 2]);

// Flood the near-white background from seeds; turn it to alpha (colour to alpha over white).
function cutBackground(img, seeds, loose = 200, soft = false) {
  const { w, h, d } = img;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (const [x, y] of seeds) if (minc(d, (y * w + x) * 4) >= loose) { stack.push(y * w + x); seen[y * w + x] = 1; }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (seen[q] || minc(d, q * 4) < loose) continue;
      seen[q] = 1; stack.push(q);
    }
  }
  for (let p = 0; p < w * h; p++) {
    if (!seen[p]) continue;
    const i = p * 4;
    // soft: keep the colour (a pale cloud), fade only the last stretch to white
    const a = soft ? Math.max(0, Math.min(1, (250 - minc(d, i)) / 38)) : Math.max(0, Math.min(1, 1 - minc(d, i) / 255));
    const al = a < 0.035 ? 0 : a;
    if (soft) { d[i + 3] = Math.round(al * 255); continue; }
    if (al === 0) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] - (1 - al) * 255) / al)));
    d[i + 3] = Math.round(al * 255);
  }
  // one-pixel fringe: pixels touching background keep a little of the white, so soften their alpha
  const a0 = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) a0[p] = d[p * 4 + 3];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (seen[p] || a0[p] !== 255) continue;
    if (a0[p - 1] < 40 || a0[p + 1] < 40 || a0[p - w] < 40 || a0[p + w] < 40) {
      d[p * 4 + 3] = 170;
    }
  }
  return img;
}
function bbox(img, thr = 12) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.d[(y * img.w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1 };
}
// place on a transparent square canvas (centered, `pad` fraction margin)
function toSquare(img, pad = 0.08) {
  const b = bbox(img);
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
  const S = Math.ceil(Math.max(bw, bh) * (1 + pad * 2));
  const out = { w: S, h: S, d: Buffer.alloc(S * S * 4) };
  const ox = ((S - bw) / 2) | 0, oy = ((S - bh) / 2) | 0;
  for (let y = 0; y < bh; y++) img.d.copy(out.d, ((oy + y) * S + ox) * 4, ((b.y0 + y) * img.w + b.x0) * 4, ((b.y0 + y) * img.w + b.x0 + bw) * 4);
  return out;
}
function unlit(img) {
  const out = { w: img.w, h: img.h, d: Buffer.from(img.d) };
  for (let i = 0; i < out.d.length; i += 4) {
    const r = out.d[i], g = out.d[i + 1], b = out.d[i + 2];
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    // slate: mostly grey, a trace of blue, lifted a little so a navy glyph still reads on the dark slot
    const k = 0.78;
    out.d[i] = Math.min(255, (l * 0.8 + r * 0.2) * k + 18);
    out.d[i + 1] = Math.min(255, (l * 0.8 + g * 0.2) * k + 26);
    out.d[i + 2] = Math.min(255, (l * 0.8 + b * 0.2) * k + 40);
    out.d[i + 3] = Math.round(out.d[i + 3] * 0.9);
  }
  return out;
}
function crop(img, x, y, w, h) {
  const out = { w, h, d: Buffer.alloc(w * h * 4) };
  for (let r = 0; r < h; r++) img.d.copy(out.d, r * w * 4, ((y + r) * img.w + x) * 4, ((y + r) * img.w + x + w) * 4);
  return out;
}
function whole(file) { const s = size(file); const i = decode(file, { x: 0, y: 0, w: s.w, h: s.h }); return i; }

// ---- verbs: five regions on the sheet (it came out as two rows) ------------------------------------------------
const verbs = whole("verbs.png");
const VERB_BOXES = { bolt: [0, 10, 215, 330], rain: [255, 15, 370, 320], wind: [250, 420, 330, 235], fog: [555, 405, 340, 280], sunbreak: [880, 5, 330, 290] };
for (const [id, [x, y, w, h]] of Object.entries(VERB_BOXES)) {
  const c = cutBackground(crop(verbs, x, y, w, h), [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [w >> 1, h - 1]], id === "fog" ? 228 : 200, id === "fog");
  const sq = toSquare(c, 0.06);
  encode(sq, `${OUT}/verb-${id}-lit.webp`, { w: 128, h: 128 });
  encode(unlit(sq), `${OUT}/verb-${id}-unlit.webp`, { w: 128, h: 128 });
}

// ---- ranks ------------------------------------------------------------------------------------------------------
const ranks = whole("ranks.png");
const RW = Math.floor(ranks.w / 4);
["S", "A", "B", "C"].forEach((r, i) => {
  const c = cutBackground(crop(ranks, i * RW, 0, RW, ranks.h), [[0, 0], [RW - 1, 0], [0, ranks.h - 1], [RW - 1, ranks.h - 1]]);
  encode(toSquare(c, 0.03), `${OUT}/rank-${r}.webp`, { w: 160, h: 160 });
});

// ---- busts: the portrait window of each card (the card's name caption is cut away) --------------------------------
const busts = whole("busts.png");
const CARD = { birdie: 38, dex: 349, ines: 660 };
for (const [id, x] of Object.entries(CARD)) {
  encode(crop(busts, x, 26, 252, 402), `${OUT}/bust-${id}.webp`, { w: 168, h: 268, q: 80 });
}
// Pilot glyph: the glowing AI ring on the last card's jacket, round
{
  const g = crop(busts, 1030, 280, 140, 140);
  for (let y = 0; y < 140; y++) for (let x = 0; x < 140; x++) {
    const dd = Math.hypot(x - 70, y - 70);
    const a = Math.max(0, Math.min(1, (67 - dd) / 3));
    g.d[(y * 140 + x) * 4 + 3] = Math.round(a * 255);
  }
  encode(g, `${OUT}/pilot.webp`, { w: 128, h: 128 });
}

// ---- panel frame: 9-slice atlas, corners 56 px, straight edge runs 40 px, 152x152 ---------------------------------
const frame = whole("frame.png");
{
  const N = frame.w;
  const cutA = cutBackground(frame, [[1, 1], [N - 2, 1], [1, N - 2], [N - 2, N - 2], [N >> 1, N >> 1]], 215);
  const C = 224, E = 160, S = 2 * C + E;
  const atlas = { w: S, h: S, d: Buffer.alloc(S * S * 4) };
  const put = (sx, sy, sw, sh, dx, dy) => {
    for (let r = 0; r < sh; r++) cutA.d.copy(atlas.d, ((dy + r) * S + dx) * 4, ((sy + r) * N + sx) * 4, ((sy + r) * N + sx + sw) * 4);
  };
  // corners
  put(0, 0, C, C, 0, 0); put(N - C, 0, C, C, C + E, 0); put(0, N - C, C, C, 0, C + E); put(N - C, N - C, C, C, C + E, C + E);
  // edges: a straight run (x 260..420 / y 260..420)
  put(260, 0, E, C, C, 0); put(260, N - C, E, C, C, C + E);
  put(0, 260, C, E, 0, C); put(N - C, 260, C, E, C + E, C);
  // centre transparent
  encode(atlas, `${OUT}/panel-frame.webp`, { w: 152, h: 152, q: 85 });
}
rmSync(tmp, { recursive: true, force: true });
