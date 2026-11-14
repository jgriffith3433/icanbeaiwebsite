import { buildFigure, detectAnimProblems, FOOT_SLIDE_LIMIT } from "./peoplekit.js";
import { fixStops, segLength, along } from "./placement.js";
import { makeRouter } from "./pavement.js";
import { buildArcProps, stepArcProps, nextBeat, powerMatches, clampBeat, emptyArcs } from "./neighbor-arcs.js";
/* ==========================================================================
   Neighbors — three people on his avenue with their own look, home and day
   (day.config.js `neighbors`). Each has an ask (answer it with an ability, close by),
   a thank-you and a surprise, shown as speech bubbles. Beats trigger by the clock and by
   how close he is; a finished beat pays score and Pressure and shows it (toast, stars on
   the name tag, a floating +score, the tally). Personal arcs (neighbors.arcs): 3 beats each
   persisted in js/memory.js across real days, with world props and 3 pips in the menu.
   Figures come from js/peoplekit.js (docs/characters.md);
   their limbs are driven procedurally (stride from route speed, beat gestures, weather posture).
   Pure helpers are exported for scripts/check-neighbors.mjs.
   ========================================================================== */

/** Is hour `h` in [from, to]? from > to wraps past midnight. No window = always. */
export function inWindow(h, from, to) {
  if (from == null || to == null) return true;
  return from <= to ? h >= from && h <= to : h >= from || h <= to;
}

/** Hour of day (0..24) of a day-minute (the day runs 7:30 to 7:30). */
export function hourOf(minutes) {
  return (((minutes % 1440) + 1440) % 1440) / 60;
}

const WALK_M_PER_MIN = 80; // sim metres per sim minute for the walks between stops
const PERSONALITY = { birdie: "plants", dex: "phone", quill: "scope" };
/* idle actions at a stop (stops' 5th item) -> the figure's own idle pose (js/peoplekit.js): the existing clips, no new ones */
const ACTION_POSE = { water: "plants", phone: "phone", scope: "scope" };

/** Where a neighbor is at hour h: { x, z, moving, inside, sit, yaw }. `stops` are [hour, x, z, "inside"|"sit"?]. */
export function placeAt(stops, h) {
  let i = 0;
  for (let k = 0; k < stops.length; k++) if (stops[k][0] <= h) i = k;
  const a = stops[i];
  const b = stops[(i + 1) % stops.length];
  const bh = b[0] > a[0] ? b[0] : b[0] + 24;
  const dist = segLength(a, b); // through a.via: the corners round a building
  const dur = Math.min(Math.max(0.3, dist / WALK_M_PER_MIN) / 60, (bh - a[0]) * 0.8); // hours
  const leave = bh - dur;
  const hh = h < a[0] ? h + 24 : h;
  if (dist < 0.01 || hh < leave) {
    return {
      x: a[1],
      z: a[2],
      moving: false,
      inside: a[3] === "inside",
      sit: a[3] === "sit" || a[4] === "sit",
      yaw: null,
      stop: i,
      action: a[4] || null,
    };
  }
  const f = Math.min(1, Math.max(0, (hh - leave) / dur));
  const pt = along(a, b, f);
  return { x: pt.x, z: pt.z, moving: f < 1, inside: false, sit: false, yaw: pt.yaw, stop: f < 1 ? -1 : (i + 1) % stops.length, action: null };
}

/** The park's lawn as a footprint, so a walk never crosses its edge: [{ x, z, w, d }] ([] without a park). */
export function lawnSolids(city) {
  const p = city && city.park;
  if (!p) return [];
  return [{ x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2, w: p.x1 - p.x0, d: p.z1 - p.z0, lawn: true }];
}

function install() {
  const day = window.day;
  const cfg = window.DAY_CONFIG && window.DAY_CONFIG.neighbors;
  const world = day && day.world && day.world();
  const B = window.BABYLON;
  if (!day || !cfg || !world || !world.scene || !B) return null;
  const L = cfg.lines || {};
  const scene = world.scene;
  const people = cfg.list || [];
  const key = cfg.storageKey || "icanbe.neighbors";

  /* ---- state: beats are per day; the score is for good ---- */
  let total = 0;
  try { total = (JSON.parse(localStorage.getItem(key)) || {}).score | 0; } catch (e) { /* private mode */ }
  let dayKey = null;
  const st = {}; // id -> { stage, askOpen, askAt, shown: [{beat, until}], missed }
  const fresh = () => people.forEach((p) => (st[p.id] = { stage: 0, doneBeats: [], bubble: null, bubbleUntil: 0, thanksAt: 0, askOpen: false, remembered: false, arcOpen: false, arcAsk: false, arcThanksAt: 0, arcLinesAt: 0, arcLineI: 0 }));
  fresh();
  let dayScore = 0;
  let lastH = null;
  const events = [];
  function emit(action, detail) {
    events.push(Object.assign({ action, t: performance.now() }, detail));
    if (events.length > 80) events.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:neighbor", { detail: Object.assign({ action }, detail) })); } catch (e) { /* node */ }
  }

  /* ---- personal arcs (persisted in day.memory.arcs) ---- */
  const arcsCfg = cfg.arcs || {};
  const arcsList = arcsCfg.list || {};
  const arcNear = arcsCfg.near || cfg.near || 10;
  const arcRange = arcsCfg.range || cfg.range || 18;
  let arcBuilt = null;
  const readArcs = () => {
    const M = day.memory;
    if (M && M.arcs) return M.arcs();
    return emptyArcs();
  };
  const writeArc = (id, beat) => {
    const M = day.memory;
    if (M && M.setArc) M.setArc(id, beat);
    rebuildArcProps();
    renderPanel();
  };
  function rebuildArcProps() {
    if (arcBuilt && arcBuilt.root) {
      try { arcBuilt.root.dispose(false, true); } catch (e) { /* gone */ }
    }
    arcBuilt = buildArcProps(B, scene, world, arcsCfg, readArcs());
    emit("arc-props", { arcs: readArcs(), info: arcBuilt.info });
  }
  rebuildArcProps();
  window.addEventListener("day:memory", (e) => {
    const d = (e && e.detail) || {};
    // apply() emits action "apply" with why "reload"/"load"/"reset"; setArc emits "arc"
    if (d.action === "arc" || d.action === "reset" || d.why === "reload" || d.why === "load" || d.why === "reset") rebuildArcProps();
  });

  /* ---- figures + animation detectors ---- */
  const animStats = { footSlide: 0, mismatch: 0, samples: 0, dayKey: null };
  /* placement: every stop on open ground (a stop in a building moves to the nearest door or pavement point) and each
     walk routed round the footprints (js/placement.js) */
  /* the pavement graph (js/pavement.js): walks go along the sidewalks and crosswalks; the park's lawn counts as a solid so
     no leg crosses its edge */
  const cityCfg = (window.DAY_CONFIG && window.DAY_CONFIG.city) || {};
  const lawn = lawnSolids(cityCfg);
  const routeSolids = (world.solids || []).concat(lawn);
  const router = world.solids ? makeRouter(cityCfg, (window.DAY_CONFIG && window.DAY_CONFIG.street) || null, routeSolids) : null;
  people.forEach((p) => {
    if (p.__placed || !world.solids) return;
    const fx = fixStops(p.stops, routeSolids, router || undefined);
    p.stops = fx.stops;
    p.__placed = { moved: fx.moved, detours: fx.detours };
  });
  people.forEach((p) => {
    const fig = buildFigure(B, scene, p.id, p.look, p.scale || 1);
    p.__fig = fig;
    p.__root = fig.root;
    p.__meshes = fig.meshes;
    p.__legLen = fig.legLen;
    p.__pos = { x: p.stops[0][1], z: p.stops[0][2], inside: false, moving: false, sit: false };
    p.__yaw = 0;
    p.__sample = null;
    p.__gestureWant = null;
  });

  /* ---- DOM: tags, bubbles, toast, tally, the finder panel ---- */
  const style = document.createElement("style");
  style.textContent = `
.nb-layer{z-index:9;pointer-events:none;overflow:hidden;font-family:Outfit,system-ui,sans-serif}
.nb-tag{position:absolute;transform:translate(-50%,-100%);text-align:center;white-space:nowrap;transition:opacity .2s}
.nb-name{display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(10,14,22,.78);border:2px solid var(--nb,#f0c27a);color:#f6f1e8;font:700 0.74rem Outfit,system-ui,sans-serif}
.nb-name b{color:var(--nb,#f0c27a);margin-left:6px;letter-spacing:1px}
.nb-bubble{position:relative;display:block;margin:0 auto 8px;max-width:250px;width:max-content;padding:9px 13px;border-radius:14px;background:#f6f1e8;color:#1a1c22;font:600 0.82rem/1.3 Outfit,system-ui,sans-serif;white-space:normal;text-align:left;box-shadow:0 8px 22px rgba(0,0,0,.4)}
.nb-bubble:after{content:"";position:absolute;left:50%;bottom:-7px;margin-left:-7px;border:7px solid transparent;border-bottom:0;border-top-color:#f6f1e8}
.nb-bubble[hidden]{display:none}
.nb-bubble.ask{border:2px solid var(--nb,#f0c27a)}
.nb-bubble small{display:block;margin-top:4px;color:#6a5a2a;font-weight:700}
.nb-plus{position:absolute;transform:translate(-50%,-100%);color:#f0c27a;font:800 1.15rem Outfit,system-ui,sans-serif;text-shadow:0 2px 6px #000;animation:nbPlus 2.2s ease-out forwards}
@keyframes nbPlus{from{opacity:1;margin-top:0}to{opacity:0;margin-top:-70px}}
.nb-btn{z-index:7;appearance:none;border:1px solid rgba(246,241,232,.22);background:rgba(14,16,22,.62);color:#f6f1e8;border-radius:14px;padding:10px 16px;font:600 0.84rem Outfit,system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(12px)}
.nb-btn:hover{background:rgba(240,194,122,.16)}
.nb-panel{z-index:7;width:min(300px,calc(100vw - 36px));background:rgba(10,14,22,.82);border:1px solid rgba(240,194,122,.4);border-radius:16px;padding:12px 14px;color:#e7eef8;font:600 0.78rem/1.35 Outfit,system-ui,sans-serif;backdrop-filter:blur(14px)}
.nb-panel[hidden]{display:none}
.nb-panel h3{margin:0 0 8px;font-size:0.95rem}
.nb-panel .row{display:flex;gap:8px;align-items:center;margin:6px 0}
.nb-panel .dot{flex:0 0 12px;height:12px;border-radius:50%}
.nb-panel .bust{flex:0 0 36px;width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid rgba(240,194,122,.45)}
.nb-panel .row small{display:block;color:rgba(231,238,248,.62);font-weight:500}
.nb-panel .stars{margin-left:auto;color:#f0c27a;letter-spacing:1px}
.nb-panel .pips{margin-left:auto;display:flex;gap:5px;align-items:center;flex:0 0 auto}
.nb-panel .pip{width:10px;height:10px;border-radius:50%;border:1.5px solid rgba(240,194,122,.7);background:transparent;box-sizing:border-box}
.nb-panel .pip.on{background:#f0c27a;border-color:#f0c27a;box-shadow:0 0 6px rgba(240,194,122,.55)}
.nb-panel .tally{margin-top:8px;color:#f0c27a}
.nb-toast{z-index:9;transform:translate(-50%,-8px);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;padding:10px 18px;border-radius:999px;background:rgba(14,16,22,.92);border:1px solid #f0c27a;color:#f6f1e8;font:600 0.95rem Outfit,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);white-space:nowrap;max-width:calc(100vw - 24px)}
.nb-toast.on{opacity:1;transform:translate(-50%,0)}
/* Phone: Neighbors menu stays reachable (3 arc pips); public view still hides it. */
html.touch-ui .nb-btn{display:inline-flex;min-width:44px;min-height:44px;align-items:center;justify-content:center}
.preview-public .nb-btn{display:none}
`;
  document.head.appendChild(style);
  const layer = document.createElement("div");
  layer.id = "neighbors";
  layer.className = "nb-layer";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "neighbors-btn";
  btn.className = "nb-btn";
  btn.textContent = L.open || "Neighbors";
  const panel = document.createElement("div");
  panel.id = "neighbors-panel";
  panel.className = "nb-panel";
  panel.hidden = true;
  const toast = document.createElement("div");
  toast.id = "neighbor-toast";
  toast.className = "nb-toast";
  toast.setAttribute("role", "status");
  (document.getElementById("hud-left") || document.body).append(btn);
  document.body.append(layer, panel, toast);
  btn.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderPanel();
  });
  people.forEach((p) => {
    const tag = document.createElement("div");
    tag.className = "nb-tag";
    tag.id = "nb-" + p.id;
    tag.style.setProperty("--nb", p.color);
    tag.innerHTML = `<span class="nb-bubble" hidden></span><span class="nb-name">${p.name}<b></b></span>`;
    layer.appendChild(tag);
    p.__tag = tag;
    p.__bubble = tag.querySelector(".nb-bubble");
    p.__stars = tag.querySelector("b");
  });

  let toastTimer = 0;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("on"), 4200);
  }

  const FADE_NEAR = 0.6; // m from the camera: fully faded
  const FADE_FAR = 1.4; // m from the camera: fully drawn
  const LOOK_R = (cfg.awareness && cfg.awareness.look) || 6; // m: a neighbour notices him
  const REACT_R = (cfg.awareness && cfg.awareness.react) || 8; // m: a cast this near is answered
  const PERSONAL = 1.1; // m between the player's centre and a neighbor's drawn centre

  /* ---- who is where ---- */
  const hero = () => {
    const C = day.control;
    if (C && C.mode && C.mode() !== "schedule") {
      // control and the walk back are both drawn from the controller's own position
      const s = C.state();
      return { x: s.x, z: s.z, y: s.y };
    }
    const fr = day.now && day.now().frame;
    return fr && fr.person ? { x: fr.person.x, z: fr.person.z, y: 0 } : null;
  };
  const distTo = (p, h) => (h ? Math.hypot(p.__pos.x - h.x, p.__pos.z - h.z) : 1e9);
  const stars = (p) => {
    const n = (p.beats || []).length;
    const d = st[p.id].doneBeats.length;
    return "★".repeat(d) + "☆".repeat(Math.max(0, n - d));
  };
  const pipsHtml = (id) => {
    const n = clampBeat(readArcs()[id] || 0);
    return `<span class="pips" data-id="${id}" data-beat="${n}" aria-label="${n} of 3">${[1, 2, 3].map((i) => `<span class="pip${i <= n ? " on" : ""}" data-i="${i}"></span>`).join("")}</span>`;
  };
  const whoName = (p) => (p.name || "").split(" ")[0];
  function speakLine(p, who, text, via) {
    const V = day.voice;
    if (!V || !V.speakAs) return false;
    if (who === "He") {
      V.speakAs("He", text, { via: via || "neighbor-arc" });
      return true;
    }
    V.speakAs(whoName(p), text, { x: p.__pos.x, z: p.__pos.z, via: via || "neighbor-arc" });
    return true;
  }
  function finishArcBeat(p, beatIndex, beat) {
    const done = beatIndex;
    writeArc(p.id, done);
    const s = st[p.id];
    s.arcOpen = false;
    s.arcAsk = false;
    s.arcThanksAt = 0;
    s.arcLinesAt = 0;
    s.arcLineI = 0;
    if (beat && beat.wave) {
      // Dex's payoff: stand in the shop doorway and wave
      p.__force = { x: 46.2, z: 9.6 };
      p.__gestureWant = "thanks";
    } else if (beat && beat.kind === "scene") p.__gestureWant = "surprise";
    else if (beat && beat.kind === "cue") p.__gestureWant = "ask";
    emit("arc-beat", {
      id: p.id, beat: done, beatId: beat && beat.id, kind: beat && beat.kind, prop: beat && beat.prop,
      x: p.__pos.x, z: p.__pos.z, arcs: readArcs(),
    });
    emit("gesture", { id: p.id, kind: beat && beat.wave ? "thanks" : (beat && beat.kind === "scene" ? "surprise" : "ask"), beat: beat && beat.id, x: p.__pos.x, z: p.__pos.z });
    if (day.note && beat) day.note(`${p.name}: arc ${done}`);
  }
  function playArcLines(p, beat, beatIndex, nowMs) {
    const s = st[p.id];
    const lines = beat.lines || [];
    if (!lines.length) {
      finishArcBeat(p, beatIndex, beat);
      return;
    }
    if (!s.arcOpen) {
      s.arcOpen = true;
      s.arcLineI = 0;
      s.arcLinesAt = nowMs;
      const L0 = lines[0];
      const spoken = speakLine(p, L0.who, L0.text, "neighbor-arc-" + beat.id);
      s.bubble = { id: beat.id + "-0", kind: "arc", text: L0.text, spoken };
      s.bubbleUntil = nowMs + 5500;
      p.__gestureWant = beat.kind === "scene" ? "surprise" : "ask";
      emit("arc-scene", { id: p.id, beat: beatIndex, beatId: beat.id, line: 0, who: L0.who, text: L0.text, x: p.__pos.x, z: p.__pos.z });
      return;
    }
    if (nowMs < s.arcLinesAt + 3200) return;
    const next = s.arcLineI + 1;
    if (next >= lines.length) {
      s.bubble = null;
      finishArcBeat(p, beatIndex, beat);
      return;
    }
    s.arcLineI = next;
    s.arcLinesAt = nowMs;
    const L = lines[next];
    const spoken = speakLine(p, L.who, L.text, "neighbor-arc-" + beat.id);
    s.bubble = { id: beat.id + "-" + next, kind: "arc", text: L.text, spoken };
    s.bubbleUntil = nowMs + 5500;
    emit("arc-scene", { id: p.id, beat: beatIndex, beatId: beat.id, line: next, who: L.who, text: L.text, x: p.__pos.x, z: p.__pos.z });
  }
  function stepArc(p, h, here, nowMs) {
    const spec = arcsList[p.id];
    if (!spec || !spec.beats) return;
    const progress = clampBeat(readArcs()[p.id] || 0);
    const want = nextBeat(progress);
    if (!want) {
      // beat 3 done: Dex keeps waving when near (doorway hold)
      if (p.id === "dex" && progress >= 3 && here && distTo(p, here) < arcNear) p.__gestureWant = p.__gestureWant || "thanks";
      return;
    }
    const beat = spec.beats[want - 1];
    if (!beat) return;
    if (!inWindow(h, beat.from, beat.to)) return;
    // payoff scenes can finish at the doorway even if their stop says inside; cues/asks need them out
    if (p.__pos.inside && beat.kind !== "scene") return;
    const near = distTo(p, here) < arcNear;
    const s = st[p.id];
    // while an arc scene is rolling, keep feeding lines
    if (s.arcOpen && (beat.kind === "cue" || beat.kind === "scene")) {
      playArcLines(p, beat, want, nowMs);
      return;
    }
    if (beat.kind === "ask") {
      if (s.arcAsk && s.arcThanksAt && nowMs >= s.arcThanksAt) {
        s.arcThanksAt = 0;
        const thanks = beat.thanks || "";
        if (thanks) {
          const spoken = speakLine(p, whoName(p), thanks, "neighbor-arc-" + beat.id);
          s.bubble = { id: beat.id + "-thanks", kind: "thanks", text: thanks, spoken };
          s.bubbleUntil = nowMs + 5500;
          p.__gestureWant = "thanks";
          emit("arc-scene", { id: p.id, beat: want, beatId: beat.id, line: "thanks", who: whoName(p), text: thanks, x: p.__pos.x, z: p.__pos.z });
        }
        finishArcBeat(p, want, beat);
        return;
      }
      if (near && !s.arcAsk && !s.askOpen) {
        s.arcAsk = true;
        const spoken = speakLine(p, whoName(p), beat.text, "neighbor-arc-" + beat.id);
        s.bubble = { id: beat.id, kind: "ask", text: beat.text, spoken, ability: beat.ability || (beat.abilities && beat.abilities[0]) };
        s.bubbleUntil = Infinity;
        p.__gestureWant = "ask";
        emit("arc-scene", { id: p.id, beat: want, beatId: beat.id, line: "ask", who: whoName(p), text: beat.text, x: p.__pos.x, z: p.__pos.z });
      }
      return;
    }
    // cue / scene: start when near
    if (near && !s.arcOpen && !s.askOpen && !s.arcAsk) playArcLines(p, beat, want, nowMs);
  }

  /* ---- beats ---- */
  function grant(p, beat) {
    const r = beat.reward;
    if (!r) return;
    total += r.score | 0;
    dayScore += r.score | 0;
    try { localStorage.setItem(key, JSON.stringify({ score: total })); } catch (e) { /* private mode */ }
    const A = (window.powers || day.powers || {}).abilities;
    if (A && A.reset && r.pressure) {
      const cur = (A.now && A.now().energy) || 0;
      const max = (A.now && A.now().max) || 100;
      A.reset(Math.min(max, cur + r.pressure));
    }
    const text = String(L.reward || "{name}: +{score} {label}")
      .replace("{name}", p.name.split(" ")[0])
      .replace("{score}", String(r.score))
      .replace("{label}", r.label || "");
    showToast(text);
    if (day.note) day.note(`${p.name}: ${beat.text}`);
    if (day.note) day.note(text);
    // a floating +score over them
    const plus = document.createElement("div");
    plus.className = "nb-plus";
    plus.textContent = "+" + r.score;
    plus.style.left = (p.__sx || window.innerWidth / 2) + "px";
    plus.style.top = (p.__sy || window.innerHeight / 2) + "px";
    layer.appendChild(plus);
    setTimeout(() => plus.remove(), 2400);
    emit("reward", { id: p.id, beat: beat.id, kind: beat.kind, score: r.score, pressure: r.pressure, total, dayScore });
    renderPanel();
  }
  function finish(p, beat, inChain) {
    const s = st[p.id];
    s.doneBeats.push(beat.id);
    if (inChain) s.stage++;
    s.askOpen = false;
    emit("beat-done", { id: p.id, beat: beat.id, kind: beat.kind });
    grant(p, beat);
  }
  function say(p, beat, secs) {
    const s = st[p.id];
    // Spoken through js/voice.js (their own voice, from where they stand, one caption tagged with their name; never over
    // Small Weather): the bubble then keeps only the verb chip of an ask, not the words.
    const V = day.voice;
    const spoken = !!(V && V.speakAs);
    if (spoken) V.speakAs(p.name.split(" ")[0], beat.text, { x: p.__pos.x, z: p.__pos.z, via: "neighbor-" + beat.kind });
    s.bubble = Object.assign({}, beat, { spoken });
    s.bubbleUntil = beat.kind === "ask" ? Infinity : performance.now() + secs * 1000;
    // ask / thanks / surprise each play their own gesture on the figure
    if (beat.kind === "ask" || beat.kind === "thanks" || beat.kind === "surprise") {
      p.__gestureWant = beat.kind;
      emit("gesture", { id: p.id, kind: beat.kind, beat: beat.id, x: p.__pos.x, z: p.__pos.z });
    }
    emit("beat", { id: p.id, beat: beat.id, kind: beat.kind, text: beat.text, x: p.__pos.x, z: p.__pos.z, positional: spoken });
  }

  function stepBeats(p, h, here, nowMs) {
    const s = st[p.id];
    if (s.bubble && s.bubble.kind !== "ask" && nowMs > s.bubbleUntil) s.bubble = null;
    if (p.__pos.inside) return;
    const near = distTo(p, here) < (cfg.near || 9);
    const beats = p.beats || [];
    // what he remembers (day.memory facts, today and yesterday): a voiced greeting the first time he walks up each day,
    // `helped` after he answered their ask, `botched` after he left it; not while an ask of theirs is open or answered today
    const rem = p.remember;
    if (rem && near && !s.remembered && !s.askOpen && !s.thanksAt && !s.bubble && !s.doneBeats.includes(`${p.id}-ask`)) {
      const f = (day.memory && day.memory.facts && day.memory.facts()) || {};
      const tone = f[`answered.${p.id}`] ? "helped" : f[`botched.${p.id}`] ? "botched" : null;
      if (tone && rem[tone]) {
        s.remembered = true;
        say(p, { id: `${p.id}-remember-${tone}`, kind: "remember", text: rem[tone] }, 7);
        p.__gestureWant = tone === "helped" ? "thanks" : null; // a wave for the ones he helped
        emit("remember", { id: p.id, tone });
        return;
      }
    }
    // the surprise has its own window and needs only the clock and him being close
    const sur = beats.find((b) => b.kind === "surprise");
    if (sur && !s.doneBeats.includes(sur.id) && near && inWindow(h, sur.from, sur.to) && !s.askOpen && !s.thanksAt) {
      say(p, sur, 8);
      finish(p, sur, false);
      return;
    }
    const beat = beats[s.stage];
    if (!beat || beat.kind === "surprise") return;
    if (beat.kind === "ask") {
      // today's request (js/daily.js) is theirs: their usual ask gives way to it
      if (day.daily && day.daily.owns && day.daily.owns(p.id)) return;
      if (!inWindow(h, beat.from, beat.to)) {
        if (s.askOpen) {
          // the window closed unanswered: the ask and its thanks are missed for today
          s.askOpen = false;
          s.bubble = null;
          s.stage = 2;
          emit("beat-missed", { id: p.id, beat: beat.id });
        }
        return;
      }
      if (near) {
        if (!s.askOpen) {
          s.askOpen = true;
          say(p, beat, 0);
        }
      } else if (s.askOpen && distTo(p, here) > (cfg.range || 16) * 2.5) {
        s.askOpen = false; // walked off: it asks again when he's back
        s.bubble = null;
      }
    } else if (beat.kind === "thanks") {
      if (!s.thanksAt) s.thanksAt = nowMs + 1100;
      else if (nowMs >= s.thanksAt) {
        s.thanksAt = 0;
        say(p, beat, 6);
        finish(p, beat, true);
      }
    }
  }

  /* Sun-break aftermath: Dex names the dry parcels with his existing thanks line when he's near */
  window.addEventListener("day:crowd", (e) => {
    const d = (e && e.detail) || {};
    if (d.action !== "aftermath") return;
    const dex = people.find((p) => p.id === "dex");
    if (!dex || !dex.__pos || dex.__pos.inside) return;
    const here = hero();
    if (!here || distTo(dex, here) > 28) return;
    const thanks = (dex.beats || []).find((b) => b.kind === "thanks");
    const text = (thanks && thanks.text) || "Dry as a bone. I owe you a delivery.";
    const V = day.voice || window.voice;
    if (V && V.speakAs) V.speakAs("Dex", text, { x: dex.__pos.x, z: dex.__pos.z, via: "aftermath" });
    else say(dex, { kind: "thanks", text }, 5);
    try {
      if (window.aftermath && window.aftermath.info) {
        /* mark on the aftermath module if it's listening via day:crowd neighborSaid is set there */
      }
      window.dispatchEvent(new CustomEvent("day:aftermath", { detail: { action: "neighbor", who: "dex", text } }));
    } catch (err) { /* */ }
  });

  /* awareness: a cast within REACT_R of a neighbour is answered with their own small act (rain: a point at the sky and the
     umbrella goes up; lightning: they duck; wind: a hand on the hat via the weather pose). They go back to their routine after. */
  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    const pw = d.power || d.action;
    if (!pw || pw === "denied") return;
    const kind = ["bolt", "lightning", "storm"].includes(pw) ? "duck"
      : ["rain", "sunbreak", "sun", "fog"].includes(pw) ? "point"
      : ["gust", "gale", "tornado", "wind"].includes(pw) ? "hat" : null;
    if (!kind) return;
    const here = hero();
    if (!here) return;
    const nowMs = performance.now();
    people.forEach((p) => {
      if (!p.__pos || p.__pos.inside) return;
      const dd = Math.hypot(here.x - p.__pos.x, here.z - p.__pos.z);
      if (dd > REACT_R) return;
      if (kind !== "hat") p.__reactWant = { kind, until: nowMs + 350 };
      p.__reactAt = nowMs;
      emit("react", { id: p.id, kind, power: pw, d: +dd.toFixed(2), x: p.__pos.x, z: p.__pos.z });
    });
  });

  /* answering an ask: he calls its ability close to them */
  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    if ((!d.power && !d.action) || d.action === "denied") return;
    const here = hero();
    people.forEach((p) => {
      const s = st[p.id];
      // personal-arc ask (takes priority when open)
      if (s.arcAsk && !p.__pos.inside) {
        const progress = clampBeat(readArcs()[p.id] || 0);
        const want = nextBeat(progress);
        const arcBeat = want && arcsList[p.id] && arcsList[p.id].beats[want - 1];
        if (arcBeat && arcBeat.kind === "ask" && powerMatches(arcBeat, d.power, d.action) && distTo(p, here) <= arcRange) {
          s.bubble = null;
          s.arcThanksAt = performance.now() + 1100;
          emit("arc-cast", { id: p.id, beat: want, beatId: arcBeat.id, power: d.power || d.action });
          return;
        }
      }
      const beat = (p.beats || [])[s.stage];
      if (!beat || beat.kind !== "ask" || !s.askOpen || p.__pos.inside) return;
      if (d.power !== beat.ability && d.action !== beat.ability) return;
      if (distTo(p, here) > (cfg.range || 16)) return;
      s.askOpen = false;
      s.bubble = null;
      s.stage++;
      s.doneBeats.push(beat.id);
      emit("beat-done", { id: p.id, beat: beat.id, kind: "ask", ability: beat.ability });
      renderPanel();
    });
  });

  /* ---- the finder panel ---- */
  const compass = (dx, dz) => {
    const a = Math.atan2(dx, dz) * (180 / Math.PI);
    return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((a + 360) % 360) / 45) % 8];
  };
  function renderPanel() {
    const here = hero();
    const art = window.uiArt || (window.day && window.day.uiArt);
    panel.innerHTML = `<h3>${L.title || "Your neighbors"}</h3>` + people.map((p) => {
      const d = distTo(p, here);
      const where = p.__pos.inside ? `${L.inside || "at home"}: ${p.home}` : here ? `${Math.round(d)} m ${compass(p.__pos.x - here.x, p.__pos.z - here.z)}` : p.home;
      const face = art && art.bust
        ? `<img class="bust" alt="" src="${art.bust(p.id || p.name)}"/>`
        : `<span class="dot" style="background:${p.color}"></span>`;
      const arcTitle = (arcsList[p.id] && arcsList[p.id].title) || "";
      return `<div class="row" data-neighbor="${p.id}">${face}<div>${p.name}<small>${p.role}${arcTitle ? " · " + arcTitle : ""} · ${where}</small></div>${arcsList[p.id] ? pipsHtml(p.id) : ""}</div>`;
    }).join("") + `<div class="tally">${L.score || "Good neighbor"}: ${total}</div>`;
    if (art && art.applyFrame) art.applyFrame(panel);
  }

  /* ---- per frame ---- */
  const v = new B.Vector3();
  let lastPanel = 0;
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    const eng = scene.getEngine();
    const nowMs = performance.now();
    const fr = day.now && day.now();
    if (!fr || fr.minutes == null) return;
    if (fr.key !== dayKey) {
      if (dayKey != null) {
        fresh();
        dayScore = 0;
      }
      dayKey = fr.key;
    }
    const h = hourOf(fr.minutes);
    lastH = h;
    const here = hero();
    const w = eng.getRenderWidth();
    const hh = eng.getRenderHeight();
    const canvas = eng.getRenderingCanvas();
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: w, height: hh };
    const dt = Math.min(0.1, eng.getDeltaTime() / 1000 || 0.016);
    if (animStats.dayKey !== dayKey) {
      animStats.dayKey = dayKey;
      animStats.footSlide = 0;
      animStats.mismatch = 0;
      animStats.samples = 0;
    }
    const sky = (window.weather && window.weather.now && window.weather.now())
      || (day.weather && day.weather.now && day.weather.now())
      || {};
    const weatherState = sky.state || "clear";
    const sunK = typeof sky.sun === "number" ? sky.sun : 0;
    people.forEach((p) => {
      const pl = p.__force
        ? { x: p.__force.x, z: p.__force.z, inside: false, moving: false, sit: false, yaw: p.__pos && p.__pos.yaw }
        : placeAt(p.stops, h);
      const prevX = p.__pos.x;
      const prevZ = p.__pos.z;
      p.__pos = pl;
      const root = p.__root;
      root.setEnabled(!pl.inside);
      // feet on whatever is under them (the sidewalk is 6 cm up, the lawn 3 cm)
      if (p.__gx == null || Math.abs(pl.x - p.__gx) > 0.05 || Math.abs(pl.z - p.__gz) > 0.05) {
        p.__gx = pl.x;
        p.__gz = pl.z;
        p.__gy = world.surfaceAt ? world.surfaceAt(pl.x, pl.z) : 0;
      }
      /* the player walks the same sidewalks: step the drawn figure aside (not its route or its distances) rather
         than let the two bodies overlap */
      let dx = pl.x;
      let dz = pl.z;
      if (here && !pl.inside && day.control && day.control.mode && day.control.mode() !== "schedule") {
        const ox = pl.x - here.x;
        const oz = pl.z - here.z;
        const od = Math.hypot(ox, oz);
        if (od < PERSONAL) {
          const k = od > 0.01 ? PERSONAL / od : 0;
          dx = here.x + (k ? ox * k : PERSONAL);
          dz = here.z + oz * k;
        }
      }
      const jump = Math.hypot(pl.x - prevX, pl.z - prevZ) > 0.55;
      const speed = jump || dt <= 0 ? 0 : Math.hypot(pl.x - prevX, pl.z - prevZ) / dt;
      // turn-before-walk: face the route first; during a beat gesture, face him
      let yawErr = 0;
      const facingHim = !!(p.__gestureWant || (p.__fig.anim && p.__fig.anim.gesture)) && here;
      if (pl.moving && !facingHim) {
        const yaw = pl.yaw != null ? pl.yaw : Math.atan2(pl.x - prevX, pl.z - prevZ);
        yawErr = Math.atan2(Math.sin(yaw - p.__yaw), Math.cos(yaw - p.__yaw));
        const turnRate = Math.abs(yawErr) > 0.55 ? 10 : 8;
        p.__yaw += yawErr * Math.min(1, dt * turnRate);
        yawErr = Math.atan2(Math.sin(yaw - p.__yaw), Math.cos(yaw - p.__yaw));
      } else if (here && (facingHim || Math.hypot(here.x - pl.x, here.z - pl.z) < 18)) {
        const yaw = Math.atan2(here.x - pl.x, here.z - pl.z);
        p.__yaw += Math.atan2(Math.sin(yaw - p.__yaw), Math.cos(yaw - p.__yaw)) * Math.min(1, dt * (facingHim ? 7 : 4));
      }
      root.position.set(dx, p.__gy, dz);
      root.rotation.y = p.__yaw;

      // a chat stop: a short wave to whoever passes, every 9-15 s of standing there (the figure's own `ask` gesture)
      if (pl.action === "chat" && !pl.moving && !pl.inside && !p.__gestureWant && !(p.__fig.anim && p.__fig.anim.gesture)) {
        if (p.__chatAt == null) p.__chatAt = nowMs + 2500 + ((p.id.charCodeAt(0) * 37) % 6000);
        if (nowMs >= p.__chatAt) { p.__gestureWant = "ask"; p.__chatAt = nowMs + 9000 + ((nowMs | 0) % 6000); }
      } else if (pl.moving) p.__chatAt = null;
      const gest = p.__gestureWant;
      // work (Dex patching a turbine) stays held for the ending scene; other beats clear once played
      if (gest && gest !== "work" && p.__fig.anim.gesture === gest) p.__gestureWant = null;
      const react = !!(sky.manual && (weatherState === "storm" || weatherState === "rain" || weatherState === "wind")
        && here && Math.hypot(here.x - pl.x, here.z - pl.z) < 22 && !gest && !pl.moving);
      /* awareness: inside LOOK_R he is noticed (the head turns to him, limited, even while they walk); a stopped neighbour
         also gives a small hello once per visit; a cast near them is answered (point at rain, hat in wind, duck from a bolt) */
      const dHim = here ? Math.hypot(here.x - pl.x, here.z - pl.z) : 1e9;
      const aw = p.__aware || (p.__aware = { on: false, greetAt: -1e9, said: false, lookAt: 0, until: 0 });
      if (!aw.on && dHim < LOOK_R && !pl.inside) {
        aw.on = true;
        aw.lookAt = nowMs;
        aw.said = false;
        emit("look", { id: p.id, d: +dHim.toFixed(2), x: pl.x, z: pl.z });
      } else if (aw.on && (dHim > LOOK_R + 2 || pl.inside)) aw.on = false;
      let look = null;
      if (aw.on && here) {
        const toHim = Math.atan2(here.x - pl.x, here.z - pl.z);
        const rel = Math.atan2(Math.sin(toHim - p.__yaw), Math.cos(toHim - p.__yaw));
        look = { yaw: rel, pitch: Math.max(-0.3, Math.min(0.3, -((here.y || 0) + 1.6 - (p.__gy + 1.6 * (p.scale || 1))) / Math.max(1.5, dHim))) };
        p.__lookRel = rel;
      }
      let greet = null;
      if (p.__reactWant && nowMs < p.__reactWant.until) greet = p.__reactWant.kind;
      else if (aw.on && !aw.said && !pl.moving && !pl.sit && !gest && nowMs - aw.lookAt > 450 && nowMs - aw.greetAt > 25000) {
        aw.said = true;
        aw.greetAt = nowMs;
        greet = (p.id.length + Math.round(nowMs / 1000)) % 2 ? "wave" : "nod";
        emit("greet", { id: p.id, kind: greet, d: +dHim.toFixed(2) });
      }
      const sample = p.__fig.step({
        look,
        greet,
        dt,
        speed: pl.moving && !jump ? Math.max(speed, 0.15) : 0,
        moving: !!pl.moving,
        yawErr,
        sit: !!pl.sit,
        weather: weatherState,
        sunShield: sunK,
        gesture: gest || (p.__fig.anim.gesture && p.__fig.anim.gesture !== "react" ? p.__fig.anim.gesture : null),
        react,
        personality: (!pl.moving && pl.action && ACTION_POSE[pl.action]) || PERSONALITY[p.id] || null,
        jump,
      });
      // hip drop already applied inside step; keep feet on the surface
      root.position.y = p.__gy;
      if (!pl.inside && !jump) {
        const prev = p.__sample;
        const hit = detectAnimProblems(sample, prev, { limit: FOOT_SLIDE_LIMIT });
        animStats.samples++;
        if (hit.footSlide) {
          animStats.footSlide++;
          if (animStats.footSlide <= 3) emit("anim-fail", { id: p.id, kind: "foot-slide", m: +hit.slideM.toFixed(3), state: sample.state });
        }
        if (hit.mismatch) {
          animStats.mismatch++;
          if (animStats.mismatch <= 3) emit("anim-fail", { id: p.id, kind: "mismatch", state: sample.state, speed: sample.speed });
        }
      }
      if ((sample.weather === "rain" || sample.weather === "storm") && sample.weatherK > 0.5 && !(p.__umbOn)) {
        p.__umbOn = true;
        emit("umbrella", { id: p.id, weather: sample.weather, x: pl.x, z: pl.z });
      } else if (sample.weatherK < 0.2) p.__umbOn = false;
      p.__sample = Object.assign({ jump }, sample);

      /* the orbit camera can end up beside them: up close one box fills the screen as a big slab, so they fade out
         (as he does below 1 m) between FADE_NEAR and FADE_FAR from the camera */
      if (cam.position) {
        const cdist = Math.hypot(cam.position.x - dx, cam.position.y - (p.__gy + 0.9 * (p.scale || 1)), cam.position.z - dz);
        const vis = Math.max(0, Math.min(1, (cdist - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
        if (vis !== p.__vis) {
          p.__vis = vis;
          p.__meshes.forEach((m) => {
            m.visibility = vis;
            m.setEnabled(vis > 0.02);
          });
        }
      }
      // same-day ask/thanks first; personal arcs fill in when that conversation is free
      stepBeats(p, h, here, nowMs);
      if (!(st[p.id].askOpen || st[p.id].thanksAt)) stepArc(p, h, here, nowMs);

      // the name tag and bubble above their head
      const tag = p.__tag;
      const top = 2.05 * (p.scale || 1);
      v.set(pl.x, top, pl.z);
      const pr = B.Vector3.Project(v, B.Matrix.IdentityReadOnly, scene.getTransformMatrix(), cam.viewport.toGlobal(w, hh));
      const cd = cam.position ? B.Vector3.Distance(cam.position, v) : 0;
      const s = st[p.id];
      const showBubble = !!s.bubble && !pl.inside;
      const on = !pl.inside && pr.z > 0 && pr.z < 1 && cd < (cfg.tagRange || 90);
      tag.style.display = on ? "" : "none";
      if (on) {
        p.__sx = rect.left + (pr.x * rect.width) / w;
        p.__sy = rect.top + (pr.y * rect.height) / hh;
        tag.style.left = p.__sx.toFixed(1) + "px";
        tag.style.top = p.__sy.toFixed(1) + "px";
        tag.style.opacity = cd > 60 ? String(Math.max(0.35, 1 - (cd - 60) / 60)) : "1";
        tag.style.zIndex = String(Math.round(1000 - cd));
        const b = p.__bubble;
        b.hidden = !(showBubble && cd < 40 && !(s.bubble.spoken && s.bubble.kind !== "ask"));
        if (showBubble) {
          const txt = (s.bubble.spoken ? "" : s.bubble.text) + (s.bubble.kind === "ask" ? `<small>${(window.powers && window.powers.abilities && window.powers.abilities.get && (window.powers.abilities.get(s.bubble.ability) || {}).name) || s.bubble.ability}</small>` : "");
          if (b.dataset.id !== s.bubble.id) {
            b.dataset.id = s.bubble.id;
            b.innerHTML = txt;
            b.className = "nb-bubble " + s.bubble.kind;
          }
        } else delete b.dataset.id;
        const sr = stars(p);
        if (p.__stars.textContent !== sr) p.__stars.textContent = sr;
      }
    });
    stepArcProps(arcBuilt, dt);
    if (!panel.hidden && nowMs - lastPanel > 500) {
      lastPanel = nowMs;
      renderPanel();
    }
  });

  const api = {
    now: () => ({
      score: total,
      dayScore,
      arcs: readArcs(),
      arcProps: arcBuilt ? Object.assign({}, arcBuilt.info) : null,
      footSlideFails: animStats.footSlide,
      mismatchFails: animStats.mismatch,
      animSamples: animStats.samples,
      people: people.map((p) => {
        const s = p.__sample || {};
        return {
          id: p.id,
          name: p.name,
          x: p.__pos.x,
          z: p.__pos.z,
          inside: p.__pos.inside,
          moving: p.__pos.moving,
          sit: !!p.__pos.sit,
          stop: p.__pos.stop == null ? -1 : p.__pos.stop,
          action: p.__pos.action || null,
          routine: (p.stops || []).length,
          stage: st[p.id].stage,
          done: st[p.id].doneBeats.slice(),
          asking: st[p.id].askOpen,
          arcAsk: !!st[p.id].arcAsk,
          arcOpen: !!st[p.id].arcOpen,
          arc: clampBeat(readArcs()[p.id] || 0),
          bubble: st[p.id].bubble ? st[p.id].bubble.text : "",
          stars: stars(p),
          pips: clampBeat(readArcs()[p.id] || 0),
          parts: p.__meshes.length,
          look: p.color,
          anim: s.state || "idle",
          gesture: s.gesture || null,
          weatherPose: s.weatherK > 0.4 ? s.weather : null,
          speed: s.speed || 0,
          phase: s.phase || 0,
          plantedL: !!s.plantedL,
          plantedR: !!s.plantedR,
        };
      }),
    }),
    /** Per-frame animation detectors for the playtest (foot-slide and state/motion mismatch). */
    anim: () => ({
      footSlideFails: animStats.footSlide,
      mismatchFails: animStats.mismatch,
      samples: animStats.samples,
      limit: FOOT_SLIDE_LIMIT,
      people: people.map((p) => {
        const s = p.__sample || {};
        return {
          id: p.id,
          state: s.state || "idle",
          speed: s.speed || 0,
          gesture: s.gesture || null,
          look: s.look || 0,
          aware: !!(p.__aware && p.__aware.on),
          weather: s.weather || "clear",
          weatherK: s.weatherK || 0,
          sit: s.sit || 0,
          plantedL: !!s.plantedL,
          plantedR: !!s.plantedR,
          footL: s.footL || null,
          footR: s.footR || null,
        };
      }),
    }),
    /** Placement audit (js/placement.js): where neighbour `id` stands at hour h, the height it is drawn at (`surfaceAt`), and the fix log. */
    placementAt: (id, h) => {
      const p = people.find((q) => q.id === id);
      if (!p) return null;
      const pl = placeAt(p.stops, h);
      return { x: pl.x, z: pl.z, inside: pl.inside, moving: pl.moving, stop: pl.stop, action: pl.action, y: world.surfaceAt ? world.surfaceAt(pl.x, pl.z) : 0 };
    },
    /** The solids a walk must keep out of (buildings and the lawn) and the pavement graph the routes follow. */
    pavement: () => ({ graph: router ? router.graph : null, solids: routeSolids }),
    placement: () => people.map((p) => ({ id: p.id, moved: (p.__placed && p.__placed.moved) || [], detours: (p.__placed && p.__placed.detours) || [], drawnY: p.__root.position.y, shown: p.__root.isEnabled() })),
    /** Reset detector counters (a new day also clears them). */
    resetAnim: () => {
      animStats.footSlide = 0;
      animStats.mismatch = 0;
      animStats.samples = 0;
    },
    events: () => events.slice(),
    /** Asks that are up right now for the world markers (js/asks.js): in their window, not answered or missed, not today's request. */
    asks: () => (lastH == null ? [] : people.map((p) => {
      const s = st[p.id];
      const beat = (p.beats || [])[s.stage];
      if (!beat || beat.kind !== "ask" || !inWindow(lastH, beat.from, beat.to)) return null;
      if (day.daily && day.daily.owns && day.daily.owns(p.id)) return null;
      return { who: p.id, id: beat.id, verb: beat.ability, x: p.__pos.x, z: p.__pos.z, inside: !!p.__pos.inside, scale: p.scale || 1 };
    }).filter(Boolean)),
    /** Have them play a gesture (ask, thanks, surprise) toward him: js/daily.js's request and thanks. */
    gesture: (id, kind) => {
      const p = people.find((q) => q.id === id);
      if (p) p.__gestureWant = kind;
      return !!p;
    },
    /** Hold them at a spot for a staged scene (ending / finale). null clears the hold. */
    stand: (id, x, z) => {
      const p = people.find((q) => q.id === id);
      if (!p) return false;
      if (x == null || z == null) { p.__force = null; return true; }
      p.__force = { x: +x, z: +z };
      p.__pos = { x: +x, z: +z, inside: false, moving: false, sit: false };
      return true;
    },
    /** Open or close the Neighbors panel (playtest / phone pips). */
    panel: (on) => {
      panel.hidden = on === false;
      if (!panel.hidden) renderPanel();
      return !panel.hidden;
    },
    /** Current arc progress { birdie, dex, quill }. */
    arcs: () => readArcs(),
    /** Arc world marks currently drawn (ribbon, openSign, chartBeacon, …). */
    arcProps: () => (arcBuilt ? Object.assign({}, arcBuilt.info) : null),
    /** Playtest setup: set one neighbour's arc beat 0..3 and rebuild props. */
    setArc: (id, beat) => {
      writeArc(id, beat);
      const s = st[id];
      if (s) { s.arcOpen = false; s.arcAsk = false; s.arcThanksAt = 0; s.arcLineI = 0; }
      return readArcs();
    },
    /** Advance the next pending arc beat as if the scene finished (playtest shortcut after real cast). */
    advanceArc: (id) => {
      const cur = clampBeat(readArcs()[id] || 0);
      if (cur >= 3) return readArcs();
      const spec = arcsList[id];
      const beat = spec && spec.beats[cur];
      const p = people.find((q) => q.id === id);
      if (p && beat) finishArcBeat(p, cur + 1, beat);
      else writeArc(id, cur + 1);
      return readArcs();
    },
    /** Playtest setup: mark today's ask/thanks done so a personal arc can speak without the morning ask. */
    quietDay: (id) => {
      const s = st[id];
      if (!s) return false;
      s.stage = 2;
      s.askOpen = false;
      s.thanksAt = 0;
      s.bubble = null;
      ["ask", "thanks"].forEach((k) => {
        const bid = `${id}-${k}`;
        if (!s.doneBeats.includes(bid)) s.doneBeats.push(bid);
      });
      return true;
    },
  };
  window.neighbors = api;
  day.neighbors = api;
  renderPanel();
  return api;
}

if (typeof window !== "undefined" && window.day) install();
