/* ==========================================================================
   UI art kit: one storm-navy language for verb icons, frames, ranks, busts
   and Pilot. Painted Gen webp under textures/ui/ when present; SVG stand-ins
   until then. Micro-feel (press, ready glow, radial wipe, 150 ms slides) lives
   in css/ui-kit.css. Playtest: ui-art-kit.
   ========================================================================== */
import { createUiKit } from "./hawkes-ui.js";

const BASE = "textures/ui/";
const VERBS = ["bolt", "rain", "wind", "fog", "sunbreak"];
const RANKS = ["S", "A", "B", "C"];
const BUSTS = ["birdie", "dex", "ines"];

const powerAlias = {
  bolt: "bolt", lightning: "bolt", storm: "bolt",
  rain: "rain",
  wind: "wind", gust: "wind", gale: "wind", tornado: "wind",
  fog: "fog",
  sunbreak: "sunbreak", sun: "sunbreak", "sun break": "sunbreak",
};

const state = {
  source: "svg", // "svg" stand-in | "gen" when webp files resolve
  verbs: {},
  ranks: {},
  busts: {},
  frame: BASE + "panel-frame.svg",
  pilot: BASE + "pilot.svg",
  ui: null,
};

// textures/ui/index.json lists the painted webp that are really there (vite writes it from disk at build),
// so a file that isn't in the repo is never requested (no 404s) and the SVG stand-in is used.
let painted = null;
async function loadIndex() {
  try {
    const r = await fetch(BASE + "index.json");
    const j = r.ok ? await r.json() : null;
    painted = new Set((j && j.files) || []);
  } catch (e) {
    painted = new Set();
  }
}

function prefer(webp, svg) {
  if (painted && !painted.has(webp)) return Promise.resolve(svg);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(webp);
    img.onerror = () => resolve(svg);
    img.src = webp;
  });
}

async function resolveKit() {
  let gen = 0;
  await loadIndex();
  for (const id of VERBS) {
    const litSvg = `${BASE}verb-${id}-lit.svg`;
    const unlitSvg = `${BASE}verb-${id}-unlit.svg`;
    const lit = await prefer(`${BASE}verb-${id}-lit.webp`, litSvg);
    const unlit = await prefer(`${BASE}verb-${id}-unlit.webp`, unlitSvg);
    if (lit.endsWith(".webp")) gen++;
    if (unlit.endsWith(".webp")) gen++;
    state.verbs[id] = { lit, unlit };
  }
  for (const r of RANKS) {
    const svg = `${BASE}rank-${r}.svg`;
    const url = await prefer(`${BASE}rank-${r}.webp`, svg);
    if (url.endsWith(".webp")) gen++;
    state.ranks[r] = url;
  }
  for (const who of BUSTS) {
    const svg = `${BASE}bust-${who}.svg`;
    const url = await prefer(`${BASE}bust-${who}.webp`, svg);
    if (url.endsWith(".webp")) gen++;
    state.busts[who] = url;
  }
  state.frame = await prefer(`${BASE}panel-frame.webp`, `${BASE}panel-frame.svg`);
  if (state.frame.endsWith(".webp")) gen++;
  state.pilot = await prefer(`${BASE}pilot.webp`, `${BASE}pilot.svg`);
  if (state.pilot.endsWith(".webp")) gen++;
  state.source = gen > 0 ? (gen >= 19 ? "gen" : "mixed") : "svg";
  document.documentElement.style.setProperty("--ui-frame", `url("${state.frame}")`);
  document.documentElement.dataset.uiArt = state.source;
  try {
    window.dispatchEvent(new CustomEvent("day:ui-art", { detail: info() }));
  } catch (e) { /* */ }
}

/** Verb icon URL. lit=true when ready to cast. */
export function verbIcon(id, lit) {
  const key = powerAlias[id] || id;
  const pair = state.verbs[key] || { lit: `${BASE}verb-${key}-lit.svg`, unlit: `${BASE}verb-${key}-unlit.svg` };
  return lit ? pair.lit : pair.unlit;
}

export function rankStamp(rank) {
  const r = String(rank || "").toUpperCase();
  return state.ranks[r] || `${BASE}rank-${r}.svg`;
}

export function bust(who) {
  const id = String(who || "").toLowerCase();
  if (id === "pilot") return state.pilot;
  if (id === "quill" || id === "ines quill") return state.busts.ines || `${BASE}bust-ines.svg`;
  if (id.startsWith("bird")) return state.busts.birdie || `${BASE}bust-birdie.svg`;
  if (id.startsWith("dex")) return state.busts.dex || `${BASE}bust-dex.svg`;
  if (id.startsWith("ines")) return state.busts.ines || `${BASE}bust-ines.svg`;
  return state.busts[id] || state.pilot;
}

export function frameUrl() {
  return state.frame;
}

/** Map a goal's power / piece / label to a verb id for the HUD icon. */
export function goalVerb(g, pieces) {
  if (!g) return null;
  if (g.power) return powerAlias[g.power] || g.power;
  if (g.kind === "help" && g.piece && pieces) {
    const p = pieces.find((x) => x.id === g.piece);
    const pow = p && p.powers && p.powers[0];
    if (pow) return powerAlias[pow] || pow;
  }
  if (g.kind === "weather" || g.kind === "weather-time") {
    const st = (g.states && g.states[0]) || g.state;
    if (st === "rain") return "rain";
    if (st === "fog") return "fog";
    if (st === "wind") return "wind";
  }
  const label = String(g.label || "");
  if (/Lightning|bolt/i.test(label)) return "bolt";
  if (/\bRain\b/i.test(label)) return "rain";
  if (/\bWind\b|Gale|Gust|Tornado/i.test(label)) return "wind";
  if (/\bFog\b/i.test(label)) return "fog";
  if (/\bSun\b/i.test(label)) return "sunbreak";
  return null;
}

/** Strip bracketed key letters from on-screen goal / prompt copy. */
export function stripKeyLetters(text) {
  return String(text || "")
    .replace(/\s*\([A-Z0-9](?:\s*\/\s*[A-Z0-9]+)?\)/g, "")
    .replace(/\b(?:Tap|Press|Hold)\s+[A-Z]\b/g, (m) => m.split(/\s+/)[0])
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function applyFrame(el) {
  if (!el) return;
  el.classList.add("ui-frame");
}

export function applyRank(el, rank) {
  if (!el) return;
  const r = String(rank || "").toUpperCase();
  el.classList.add("ui-rank", "r-" + r);
  el.style.setProperty("--ui-rank", `url("${rankStamp(r)}")`);
  if (!el.querySelector(".ui-rank-img")) {
    const img = document.createElement("img");
    img.className = "ui-rank-img";
    img.alt = r;
    img.src = rankStamp(r);
    el.prepend(img);
  } else {
    el.querySelector(".ui-rank-img").src = rankStamp(r);
  }
}

export function info() {
  return {
    source: state.source,
    frame: state.frame,
    pilot: state.pilot,
    verbs: { ...state.verbs },
    ranks: { ...state.ranks },
    busts: { ...state.busts },
  };
}

function wireMenus() {
  // 150 ms open/close on the Episodes menu, Neighbors panel and Settings pop.
  const slide = (el, on) => {
    if (!el) return;
    el.classList.add("ui-slide");
    if (on) {
      el.hidden = false;
      el.classList.remove("ui-slide-out");
      void el.offsetWidth;
      el.classList.add("ui-slide-in");
    } else {
      el.classList.remove("ui-slide-in");
      el.classList.add("ui-slide-out");
      const done = () => {
        if (el.classList.contains("ui-slide-out")) el.hidden = true;
        el.removeEventListener("transitionend", done);
      };
      el.addEventListener("transitionend", done);
      setTimeout(done, 200);
    }
  };
  const watch = (sel, attr) => {
    const el = document.querySelector(sel);
    if (!el || el.dataset.uiSlideWatch) return;
    el.dataset.uiSlideWatch = "1";
    const obs = new MutationObserver(() => {
      // Only animate when our flag isn't driving it — menus still toggle .hidden themselves.
      if (el.hidden) el.classList.remove("ui-slide-in");
      else {
        el.classList.add("ui-slide");
        el.classList.add("ui-slide-in");
      }
    });
    obs.observe(el, { attributes: true, attributeFilter: [attr || "hidden"] });
  };
  watch("#episode-menu");
  watch("#neighbors-panel");
  watch("#settings-pop");
  watch("#episode-score");
  // Mark framed panels
  ["#episode-score .ep-panel", "#episode-menu .ep-panel", "#episode-offer .ep-panel",
    "#ending-card .ep-panel", "#closing-card .ep-panel", "#neighbors-panel",
    "#settings-pop", "#ability-toast", "#neighbor-toast", "#voice-caption",
    ".ep-hud .ep-card"].forEach((sel) => {
    document.querySelectorAll(sel).forEach(applyFrame);
  });
  return { slide };
}

export function install() {
  if (typeof document === "undefined") return { info };
  document.documentElement.classList.add("ui-kit");
  // Default SVG paths before the async webp probe finishes.
  VERBS.forEach((id) => {
    state.verbs[id] = { lit: `${BASE}verb-${id}-lit.svg`, unlit: `${BASE}verb-${id}-unlit.svg` };
  });
  RANKS.forEach((r) => { state.ranks[r] = `${BASE}rank-${r}.svg`; });
  BUSTS.forEach((who) => { state.busts[who] = `${BASE}bust-${who}.svg`; });
  try {
    state.ui = createUiKit({ win: window });
  } catch (e) {
    state.ui = null;
  }
  resolveKit();
  // Menus may mount after us.
  const boot = () => wireMenus();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 0);
  setTimeout(boot, 800);
  const api = { verbIcon, rankStamp, bust, frameUrl, goalVerb, stripKeyLetters, applyFrame, applyRank, info, ui: () => state.ui };
  if (window.day) window.day.uiArt = api;
  window.uiArt = api;
  return api;
}

install();
