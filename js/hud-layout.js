/* ==========================================================================
   HUD keep-out zones (the JS half of css/hud.css; imported before asks.js).

   css/hud.css places the HUD and owns the ONE toast lane (`--toast-top`, top centre, under the safe area: ep-toast, nb-toast,
   storm-toast). World markers (the ask plumbob, js/asks.js) are DOM elements projected from the 3D world each frame, so CSS can't keep
   them off the buttons. `hudLayout.clampAway(x, y, half)` does: the keep-out zones are the live rects of the top-right buttons
   (Sound, Details, Settings, Quality), the Take control / Let go button, the ability arc, the stick and Jump, the left stack, the
   status card, the clock (Time control, timeline), the side panel and the toast lane. A marker whose box meets one moves to the
   nearest free spot on screen, or (null) isn't drawn this frame. `hudLayout.check()` reports any marker or visible toast that
   overlaps a control (the playtests' overlap check uses it). `window.hudLayout`.
   ========================================================================== */
const ZONES = [
  "#sound", "#details", "#settings", ".settings-pop", "#quality", ".quality-btn", "#voices", "#control", ".control-btn",
  ".abilitybar", ".touchpad .stick", ".touchpad .jump", ".powerpad", "#weather-btn", "#pressure", "#episodes", ".ep-btn", ".nb-btn", ".pm-btn",
  "#neighbors-panel", ".panel.now", ".side", ".ep-hud", "#time-btn", "#time-drawer", ".hud.bottom", "#helped-count", "#update-pill", ".co-bolt",
];
const TOASTS = [".ep-toast", ".nb-toast", ".storm-toast", ".take-toast"];
const PAD = 6;

function shown(el) {
  if (!el || el.hidden) return null;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05) return null;
  }
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return null;
  return r;
}

/** Live rects of every visible control, [{name, l, t, r, b}]. */
function controls() {
  const out = [];
  ZONES.forEach((sel) => document.querySelectorAll(sel).forEach((el) => {
    const r = shown(el);
    if (r) out.push({ name: el.id ? "#" + el.id : sel, l: r.left, t: r.top, r: r.right, b: r.bottom });
  }));
  return out;
}

/** The toast lane: top centre, from the safe area down to one toast's height (css/hud.css `--toast-top`). */
function toastLane() {
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--toast-top-px")) || 64;
  const w = Math.min(420, innerWidth - 24);
  return { name: "toast lane", l: (innerWidth - w) / 2, t: top, r: (innerWidth + w) / 2, b: top + 56 };
}

const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

/** Move a (2 x half)-box centred at x,y out of every keep-out zone: nearest free centre, or null. */
function clampAway(x, y, half) {
  const zones = controls().concat([toastLane()]).map((z) => ({ l: z.l - PAD, t: z.t - PAD, r: z.r + PAD, b: z.b + PAD }));
  const box = (cx, cy) => ({ l: cx - half, t: cy - half, r: cx + half, b: cy + half });
  const inside = (cx, cy) => cx - half >= 4 && cx + half <= innerWidth - 4 && cy - half >= 4 && cy + half <= innerHeight - 4;
  const free = (cx, cy) => inside(cx, cy) && !zones.some((z) => hit(box(cx, cy), z));
  if (free(x, y)) return { x, y, moved: 0 };
  // candidates: each blocking zone's four escape edges, then the closest one that is free of all zones
  const c = [];
  zones.forEach((z) => {
    if (!hit(box(x, y), z)) return;
    c.push([z.l - half - 1, y], [z.r + half + 1, y], [x, z.t - half - 1], [x, z.b + half + 1]);
  });
  let best = null;
  c.forEach(([cx, cy]) => {
    if (!free(cx, cy)) return;
    const d = Math.hypot(cx - x, cy - y);
    if (!best || d < best.d) best = { x: cx, y: cy, d };
  });
  if (!best) return null;
  return { x: best.x, y: best.y, moved: Math.round(best.d) };
}

/** Problems now: a world marker over a control or a toast, a toast over a control. Strings, [] when clear. */
function check() {
  const found = [];
  const marks = [...document.querySelectorAll(".ask-mark")].map((el) => ({ el, r: shown(el), name: el.id || "ask marker" })).filter((m) => m.r);
  const toasts = TOASTS.map((s) => [...document.querySelectorAll(s)]).flat().map((el) => ({ el, r: shown(el), name: el.id || el.className.split(" ")[0] })).filter((m) => m.r);
  const ctl = controls();
  const R = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  marks.forEach((m) => {
    ctl.forEach((c) => { if (hit(R(m.r), c)) found.push(`${m.name} overlaps ${c.name}`); });
    toasts.forEach((t) => { if (hit(R(m.r), R(t.r))) found.push(`${m.name} overlaps ${t.name}`); });
  });
  toasts.forEach((t) => ctl.forEach((c) => { if (hit(R(t.r), c)) found.push(`${t.name} overlaps ${c.name}`); }));
  return found;
}

window.hudLayout = { controls, toastLane, clampAway, check };
