/* ==========================================================================
   Episodes — playable weather missions on chapters of Small Weather's day.
   Data: day.config.js `episodes`. Offer on take control, or pick from the
   Episodes menu (jumps the clock). Goals track weather, powers, rods, reach,
   debris and timed bolts; a forecast-style score card lands in localStorage.
   ========================================================================== */

import { createFinale } from "./finale.js";

/* ---- the finale's show (Light show) ----
   `cues` = [{ at, power }]: seconds from the show's start and the ability to call. A call is a hit when it is the cue's
   ability and lands inside `f.good` seconds of `at` (perfect inside `f.perfect`). */
export function gradeCall(dt, f) {
  const d = Math.abs(dt);
  if (d <= (f.perfect != null ? f.perfect : 0.45)) return "perfect";
  if (d <= (f.good != null ? f.good : 1.1)) return "good";
  return null;
}
/** The unresolved cue of this ability nearest to now (`t`), if it is close enough: { index, grade, dt }, else null. */
export function matchShowCue(cues, power, t, f) {
  let best = null;
  (cues || []).forEach((c, i) => {
    if (c.state !== "wait" || c.power !== power) return;
    const g = gradeCall(t - c.at, f);
    if (!g) return;
    const d = Math.abs(t - c.at);
    if (!best || d < best.d) best = { index: i, grade: g, dt: t - c.at, d };
  });
  return best ? { index: best.index, grade: best.grade, dt: best.dt } : null;
}
/** The four score fractions (0..1) of a show: Timing, Chain, Clean calls and Variety. */
export function showTally(show, f, varietyTarget) {
  const n = Math.max(1, (show.cues || []).length);
  const pts = (show.cues || []).reduce((a, c) => a + (c.grade === "perfect" ? 1 : c.grade === "good" ? 0.6 : 0), 0);
  return {
    people: pts / n,
    time: Math.min(1, (show.best | 0) / n),
    damage: Math.max(0, 1 - (show.off | 0) * 0.12),
    variety: Math.min(1, (show.used ? show.used.size : 0) / Math.max(1, varietyTarget || 5)),
  };
}

/** Parse "HH:MM" to minutes past midnight (same idea as DayEngine.parseClock). */
export function clockMinutes(clock) {
  if (typeof clock === "number") return clock;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(clock || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Which episode matches this chapter + clock (first match wins). */
export function matchEpisode(list, chapter, minutes, opt) {
  const inCar = !!(opt && opt.inCar);
  const items = Array.isArray(list) ? list : [];
  for (let i = 0; i < items.length; i++) {
    const ep = items[i];
    if (!ep || !ep.id || ep.tutorial) continue;
    const ch = ep.chapters || [];
    if (ch.length && chapter && ch.indexOf(chapter) < 0) continue;
    const after = clockMinutes(ep.after);
    const before = clockMinutes(ep.before);
    if (after != null && minutes < after) continue;
    if (before != null && minutes > before) continue;
    if (ep.needOut && inCar) continue;
    // A later part is offered by itself only once the part before it has been played.
    if (ep.afterPart && !(opt && opt.arc && opt.arc.parts && opt.arc.parts[ep.afterPart])) continue;
    if (inCar && (ep.id === "commute-home" || ep.debris)) continue;
    return ep;
  }
  return null;
}

/** Is (x, z) inside a zone { rect: [x0, z0, x1, z1], pad }? */
export function inZone(zone, x, z) {
  if (!zone || !zone.rect) return false;
  const r = zone.rect;
  const pad = zone.pad || 0;
  return x >= r[0] - pad && x <= r[2] + pad && z >= r[1] - pad && z <= r[3] + pad;
}

/** What one weather call adds to the Strain meter: its cost, doubled if the same call came inside stackSec. */
export function strainCost(cfg, power, lastAt, now) {
  const base = (cfg && cfg.costs && cfg.costs[power]) != null ? cfg.costs[power] : 1;
  const stack = cfg && cfg.stackSec != null ? cfg.stackSec : 60;
  return lastAt != null && now - lastAt <= stack ? base * 2 : base;
}

/* ---- the arc across the three parts (Part 3 and the endings) ----
   `arc` = { parts: { 1: { scarred, strain, kicks, goals, at }, 2: …, 3: … }, ending }, kept in localStorage.
   `at` is the sim minute the part ended at; Strain falls by 1 each sim hour, so it is what's left at `nowMin`. */
export function carryStrain(arc, nowMin, upto, perHour) {
  const parts = (arc && arc.parts) || {};
  const per = perHour != null ? perHour : 1;
  let sum = 0;
  Object.keys(parts).forEach((k) => {
    const p = parts[k];
    if (!p || (upto != null && Number(k) >= upto)) return;
    const hours = Math.max(0, (nowMin - (p.at || 0)) / 60);
    sum += Math.max(0, Math.round((p.strain | 0) - hours * per));
  });
  return sum;
}

/* Which ending the arc earned: C when the sky is overworked (Strain at the Tank at the overcast line, or every part
   scarred), A when all three parts were played clean and the Tank stayed at or under the calm line, else B. */
export function pickEnding(arc, tankStrain, rules) {
  const r = Object.assign({ calm: 6, overcast: 10 }, rules || {});
  const parts = (arc && arc.parts) || {};
  const played = [1, 2, 3].filter((n) => parts[n]);
  const scarred = played.filter((n) => parts[n].scarred).length;
  if (tankStrain >= r.overcast || (played.length === 3 && scarred === 3)) return "C";
  if (played.length === 3 && scarred === 0 && tankStrain <= r.calm) return "A";
  return "B";
}

/* The four needs, one line each, from what the parts left behind: state is ok, scar or open (never answered). */
export function cityFared(arc, lines) {
  const parts = (arc && arc.parts) || {};
  const L = lines || {};
  const has = (n, k) => !!(parts[n] && (parts[n].kicks || []).indexOf(k) >= 0);
  const goal = (n, id) => !!(parts[n] && (parts[n].goals || []).indexOf(id) >= 0);
  const pick = (key, state) => (L[key] && L[key][state]) || `${key}: ${state}`;
  const out = [];
  let st = !parts[1] || !goal(1, "rain-park") ? "open" : has(1, "flood") || has(1, "scorch") ? "scar" : "ok";
  out.push({ need: "park", state: st, text: pick("park", st) });
  st = !parts[2] || !goal(2, "turn") ? "open" : has(2, "overspeed") || has(2, "topple") || (parts[2].toppled | 0) > 0 ? "scar" : "ok";
  out.push({ need: "turbines", state: st, text: pick("turbines", st) });
  st = !parts[1] || !goal(1, "stalls") ? "open" : has(1, "soak") || parts[1].scarred || has(2, "topple") ? "scar" : "ok";
  out.push({ need: "market", state: st, text: pick("market", st) });
  const p3 = parts[3];
  st = !p3 || !goal(3, "fill") ? "open" : has(3, "overcast") || has(3, "flood") ? "scar" : "ok";
  out.push({ need: "reservoir", state: st, text: pick("reservoir", st) });
  return out;
}

function wordFor(pct, bands) {
  const list = Array.isArray(bands) && bands.length ? bands : [{ min: 0, word: "weather" }];
  for (let i = 0; i < list.length; i++) if (pct >= (list[i].min | 0)) return list[i].word;
  return list[list.length - 1].word;
}

/** Forecast-style score: percent + band word from day.config.js bands.
    `story` = { value, budget, kicks, penalty } for the arc's parts: over the budget (or any kick-back)
    the part is scarred: the percent drops and the card says so. */
export function scoreCard(done, total, left, timer, bands, story) {
  const n = Math.max(1, total | 0);
  const d = Math.max(0, Math.min(n, done | 0));
  let pct = Math.round((100 * d) / n);
  if (timer > 0 && left > 0 && d >= n) {
    const bonus = Math.min(8, Math.round((left / timer) * 8));
    pct = Math.min(100, pct + bonus);
  } else if (timer > 0 && left <= 0 && d < n) {
    pct = Math.max(0, pct - 8);
  }
  let scarred = false;
  if (story) {
    scarred = story.value > story.budget || (story.kicks | 0) > 0;
    if (scarred) pct = Math.max(0, pct - (story.penalty != null ? story.penalty : 25));
  }
  const word = wordFor(pct, bands);
  return {
    pct,
    word,
    text: `Today's forecast: ${pct}% chance of ${word}` + (story ? (scarred ? " · scarred" : " · clean") : ""),
    done: d,
    total: n,
    scarred,
    strain: story ? story.value : 0,
    budget: story ? story.budget : 0,
  };
}

/** Rank for a rescue episode: points over `rank.max` as a percent, then the first band (S..C) it reaches. */
export function rankFor(points, rank) {
  const r = rank || {};
  const max = r.max > 0 ? r.max : 1;
  const pct = Math.max(0, Math.min(100, Math.round((100 * Math.max(0, points)) / max)));
  const bands = Array.isArray(r.bands) && r.bands.length ? r.bands : [{ min: 0, rank: "C" }];
  let letter = bands[bands.length - 1].rank;
  for (let i = 0; i < bands.length; i++) {
    if (pct >= (bands[i].min | 0)) {
      letter = bands[i].rank;
      break;
    }
  }
  return { pct, rank: letter };
}

/** The unified score. `m` = { people, time, damage, variety }, each 0..1; `scoring.weights` sets what each is worth
    (they add to the max). Returns the rows for the card, the points and the percent of the max. */
export function scoreBreakdown(m, scoring) {
  const sc = scoring || {};
  const w = Object.assign({ people: 400, time: 200, damage: 250, variety: 150 }, sc.weights || {});
  const rows = ["people", "time", "damage", "variety"].map((id) => {
    const v = Math.max(0, Math.min(1, Number(m && m[id]) || 0));
    return { id, value: v, max: w[id], points: Math.round(w[id] * v) };
  });
  const max = rows.reduce((n, r) => n + r.max, 0);
  const points = rows.reduce((n, r) => n + r.points, 0);
  return { rows, points, max, pct: max > 0 ? Math.round((100 * points) / max) : 0 };
}

/** S to C from a percent, by the first band it reaches. */
export function rankOf(pct, bands) {
  const list = Array.isArray(bands) && bands.length ? bands : [{ min: 0, rank: "C" }];
  for (let i = 0; i < list.length; i++) if (pct >= (list[i].min | 0)) return list[i].rank;
  return list[list.length - 1].rank;
}

/** The challenge version of an episode: a tighter timer, a smaller strain budget, more people in the set pieces.
    Returns a copy; `ep` is untouched. `ep.challenge` = { timer: 0.7, budget: -1, extra: { pieceId: [people…] } }. */
export function challengeEp(ep, base) {
  const ch = Object.assign({ timer: 0.7, budget: -1 }, base || {}, ep.challenge || {});
  const o = Object.assign({}, ep, { challengeOn: true, title: ep.title + " (Challenge)" });
  if (ep.timer) o.timer = Math.max(30, Math.round(ep.timer * ch.timer));
  if (ep.strain) o.strain = Object.assign({}, ep.strain, { budget: Math.max(2, ep.strain.budget + (ch.budget | 0)) });
  if (ep.pieces) {
    const extra = ch.extra || {};
    o.pieces = ep.pieces.map((q) => Object.assign({}, q, { people: q.people.concat(extra[q.id] || []) }));
    o.goals = ep.goals.map((g) => (g.kind === "help" && extra[g.piece] ? Object.assign({}, g, { count: g.count + extra[g.piece].length }) : g));
  }
  return o;
}

export function loadBest(key, store) {
  const s = store || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s || !key) return {};
  try {
    const raw = s.getItem(key);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch (err) {
    return {};
  }
}

export function saveBest(key, best, store) {
  const s = store || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s || !key) return false;
  try {
    s.setItem(key, JSON.stringify(best || {}));
    return true;
  } catch (err) {
    return false;
  }
}

/** Record a run if it beats the stored best for that episode id. `card.cleared` (every goal done) is kept for good:
    it is what unlocks the Challenge. A challenge run is stored under `<id>#challenge`. */
export function recordBest(key, id, card, store) {
  const best = loadBest(key, store);
  const prev = best[id];
  const cleared = !!(card.cleared || (prev && prev.cleared));
  const done = !!(card.done || cleared || (prev && (prev.done || prev.cleared)));
  if (!prev || (card.pct | 0) > (prev.pct | 0)) {
    best[id] = { pct: card.pct, word: card.word, text: card.text, scarred: !!card.scarred, rank: card.rank || null, points: card.points == null ? null : card.points, cleared, done, when: Date.now() };
    saveBest(key, best, store);
    return { best, improved: true };
  }
  if ((cleared && !prev.cleared) || (done && !prev.done)) {
    prev.cleared = cleared;
    prev.done = done;
    saveBest(key, best, store);
  }
  return { best, improved: false };
}

/** An episode counts as finished once a run reached its end (a clear, time up or scarred), not a let-go. */
export function episodeDone(best, id) {
  const b = best && best[id];
  return !!(b && (b.done || b.cleared));
}

/** The playable episodes in menu order (the tutorial is always open and is not part of the chain). */
export function chainOf(list) {
  // the story's order is the chapters' (`ep.chapter`); inside a chapter, the list's own order
  return (Array.isArray(list) ? list : [])
    .filter((e) => e && e.id && !e.tutorial)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.chapter || 0) - (b.e.chapter || 0) || a.i - b.i)
    .map((x) => x.e);
}

/** Why an episode is locked: the title of the episode before it that is not finished yet, or null when it is open.
    The first one is always open; each later one opens when the one before it is finished. */
export function episodeLock(list, best, id) {
  const chain = chainOf(list);
  const i = chain.findIndex((e) => e.id === id);
  if (i <= 0) return null;
  const prev = chain[i - 1];
  return episodeDone(best, prev.id) ? null : prev.title || prev.id;
}

/** The episode after `id` in the chain, or null at the end. */
export function nextEpisode(list, id) {
  const chain = chainOf(list);
  const i = chain.findIndex((e) => e.id === id);
  return i >= 0 && i < chain.length - 1 ? chain[i + 1] : null;
}

/** Progress for the title screen: finished count, stars (S 3, A 2, anything else finished 1) and the next episode to play
    (the first in the chain not finished yet, with its tagline), or null when every one is done. */
export function progressOf(list, best) {
  const chain = chainOf(list);
  const star = (id) => {
    const b = best && best[id];
    if (!episodeDone(best, id)) return 0;
    return b && b.rank === "S" ? 3 : b && b.rank === "A" ? 2 : 1;
  };
  const done = chain.filter((e) => episodeDone(best, e.id)).length;
  const stars = chain.reduce((a, e) => a + star(e.id), 0);
  const nxt = chain.find((e) => !episodeDone(best, e.id)) || null;
  return { done, total: chain.length, stars, maxStars: chain.length * 3, next: nxt ? { id: nxt.id, title: nxt.title || nxt.id, tagline: nxt.tagline || "" } : null };
}

/** The Challenge is open once the episode has been cleared (every goal done) in the normal mode. */
export function challengeOpen(best, id) {
  return !!(best && best[id] && best[id].cleared);
}

function install() {
  const day = window.day;
  const cfgRoot = window.DAY_CONFIG || {};
  const cfg = cfgRoot.episodes || {};
  const list = Array.isArray(cfg.list) ? cfg.list : [];
  if (!day || !list.length) return null;

  const L = Object.assign(
    {
      offer: "An episode is open.",
      accept: "Take it",
      decline: "Just walk",
      menu: "Episodes",
      scoreTitle: "Today's forecast",
      best: "Best",
      done: "Episode clear.",
      timeUp: "Time's up.",
      letGo: "Episode paused — score stands.",
    },
    cfg.lines || {}
  );
  const bands = cfg.bands || [];
  const arcKey = cfg.arcKey || "icanbe.story.arc";
  const END = cfg.endings || {};
  const loadArc = () => {
    const a = loadBest(arcKey);
    if (!a.parts || typeof a.parts !== "object") a.parts = {};
    return a;
  };
  const storageKey = cfg.storageKey || "icanbe.episodes.best";
  const B = window.BABYLON;
  const world = day.world && day.world();

  /* ---- state ---- */
  let active = null; // { ep, goals: [{…, done}], started, left, rodsHit, bolts, timed, debris, lastStrike, cueOn, cueAge }
  let offerEp = null;
  let declinedTake = false;
  let lastControl = "schedule";
  const log = [];
  const mark = (what, detail) => {
    log.push({ t: performance.now(), what, detail });
    if (log.length > 40) log.shift();
    emit(what, detail);
  };
  function emit(action, detail) {
    if (typeof window.CustomEvent !== "function" || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new window.CustomEvent("day:episode", { detail: Object.assign({ action }, detail || {}) }));
    } catch (err) {
      /* node tests */
    }
  }

  /* ---- DOM (styles stay here so we don't fight css/site.css / the art pass) ---- */
  const style = document.createElement("style");
  style.textContent = `
.ep-btn{z-index:7;appearance:none;border:1px solid rgba(246,241,232,.22);background:rgba(14,16,22,.62);color:#f6f1e8;border-radius:14px;padding:10px 16px;font:600 0.84rem Outfit,system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(12px)}
.ep-btn:hover{background:rgba(240,194,122,.16)}
@media (max-width:700px){.ep-btn{display:inline-flex;align-items:center;justify-content:center;height:44px;min-height:44px;min-width:44px;padding:0 14px;border-radius:999px;font-size:0.78rem;white-space:nowrap}}
html.touch-ui .ep-btn{display:inline-flex;align-items:center;justify-content:center;height:44px;min-height:44px;min-width:44px;padding:0 14px;border-radius:999px;font-size:0.78rem;white-space:nowrap}
.ep-hud{z-index:7;width:min(280px,calc(100vw - 36px));pointer-events:none;font:600 0.78rem/1.35 Outfit,system-ui,sans-serif;color:#e7eef8}
html.touch-ui .ep-hud{width:min(420px,calc(100vw - 24px))}
.ep-hud[hidden]{display:none}
.ep-hud .ep-card{pointer-events:auto;background:rgba(10,14,22,.72);border:1px solid rgba(126,200,255,.35);border-radius:16px;padding:12px 14px;backdrop-filter:blur(14px)}
.ep-hud li .g-ico{flex:0 0 22px;width:22px;height:22px;margin-top:1px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(126,200,255,.45))}
.ep-hud .prompt .g-ico{width:20px;height:20px;vertical-align:-4px;margin-right:6px}
.ep-hud h3{margin:0 0 4px;font-size:0.95rem;letter-spacing:.02em;font-family:Fraunces,Georgia,serif}
.ep-hud .tag{margin:0 0 8px;color:rgba(231,238,248,.7);font-weight:500}
.ep-hud ul{display:none;margin:0;padding:0;list-style:none}
.ep-hud .objective{display:flex;gap:8px;align-items:center;margin:2px 0 0;font:700 .95rem/1.25 Outfit,system-ui,sans-serif;color:#f6f1e8}
.ep-hud .objective[hidden]{display:none}
.ep-hud .objective .g-ico{flex:0 0 26px;width:26px;height:26px;object-fit:contain;filter:drop-shadow(0 0 8px rgba(126,200,255,.6))}
/* the results ceremony: dim + blur of the city, stats counting up, the stamp slamming */
.ep-score.ceremony{background:rgba(6,8,14,var(--cer-dim,.72));-webkit-backdrop-filter:blur(var(--cer-blur,8px));backdrop-filter:blur(var(--cer-blur,8px));animation:cerIn .3s ease-out}
@keyframes cerIn{from{background:rgba(6,8,14,0);-webkit-backdrop-filter:blur(0);backdrop-filter:blur(0)}}
.ep-score.ceremony .breakdown li{transition:opacity .15s,transform .15s}
.ep-score.ceremony .breakdown li.pend{opacity:0;transform:translateX(-14px)}
.ep-score.ceremony .breakdown li.tick em{color:#ffe08a}
.ep-score.ceremony:not(.stamped) .rank{opacity:0;transform:scale(3.2)}
.ep-score.ceremony .rank.slam{animation:cerSlam .34s cubic-bezier(.2,1.6,.4,1) both}
@keyframes cerSlam{0%{opacity:0;transform:scale(3.2) rotate(-8deg)}60%{opacity:1;transform:scale(.92) rotate(1deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
.ep-score.ceremony.stamped .ep-panel{animation:cerJolt .3s linear}
@keyframes cerJolt{0%,100%{transform:none}20%{transform:translate(4px,-5px)}45%{transform:translate(-4px,3px)}70%{transform:translate(2px,-2px)}}
.ep-score .gradeline{margin:2px 0 8px;text-align:center;font:600 1.02rem/1.3 Outfit,system-ui,sans-serif;color:#f6f1e8;font-style:italic}
.ep-score .beststamp{float:right;margin:-54px 4px 0 0;width:44px;text-align:center;font:800 1.7rem/1 Outfit,system-ui,sans-serif;opacity:.85}
.ep-score .beststamp small{display:block;font:600 .55rem Outfit,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:rgba(246,241,232,.6)}
.ep-score .beststamp img{width:34px;height:34px;object-fit:contain}
.ep-score .ep-panel{max-height:calc(100dvh - 24px);overflow:auto}
html.touch-ui .ep-score{align-items:flex-end;padding-bottom:max(14px,env(safe-area-inset-bottom))}
html.touch-ui .ep-score .actions{flex-wrap:nowrap}
html.touch-ui .ep-score .actions button{flex:1 1 0;min-height:56px;min-width:56px;font-size:1rem}
html.touch-ui .ep-score .ep-panel{padding:14px 16px 12px}
html.touch-ui .ep-score .ep-panel .rank{font-size:3rem}
html.touch-ui .ep-score .forecast,html.touch-ui .ep-score .rankdetail{margin-bottom:4px}
.ep-score .actions button:focus-visible{outline:3px solid #9fd4ff;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.ep-score.ceremony,.ep-score.ceremony .rank.slam,.ep-score.ceremony.stamped .ep-panel{animation:none}}
.ep-hud li{display:flex;gap:8px;align-items:flex-start;margin:4px 0;color:rgba(231,238,248,.88)}
.ep-hud li.done{color:#8dceb0;text-decoration:line-through}
.ep-hud li i{flex:0 0 14px;font-style:normal}
.ep-hud .timer{margin-top:8px;font-variant-numeric:tabular-nums;color:#9fd4ff}
.ep-hud .cue{margin-top:6px;color:#f0c27a}
.ep-hud .cue .cn{display:block}
.ep-hud .cue .bar{display:block;height:6px;margin:5px 0;border-radius:3px;background:rgba(240,194,122,.18);overflow:hidden}
.ep-hud .cue .bar b{display:block;height:100%;width:0;background:#f0c27a;border-radius:3px}
.ep-hud .cue .cj{display:block;color:#9fd4ff;font-variant-numeric:tabular-nums}
.ep-hud .cue .cj.perfect{color:#ffe08a}.ep-hud .cue .cj.miss,.ep-hud .cue .cj.off{color:#e58a7a}
.ep-hud .prompt{margin:8px 0 0;color:#f0c27a}
.ep-hud .skip{margin-top:8px;appearance:none;min-height:36px;padding:6px 14px;border-radius:999px;border:1px solid rgba(246,241,232,.28);background:transparent;color:#f0c27a;font:600 0.8rem Outfit,system-ui,sans-serif;cursor:pointer}
.ep-hud .skip:hover{background:rgba(240,194,122,.14)}
html.touch-ui .ep-hud .skip,html.touch-ui .ep-panel button{min-height:44px;min-width:44px}
.ep-hud li.failed{color:#e58a7a;text-decoration:line-through}
.ep-hud .strain{margin-top:8px;color:#9fd4ff}
.ep-hud .strain.over{color:#e58a7a}
.ep-hud .strain i{display:block;height:5px;margin-top:3px;border-radius:3px;background:rgba(159,212,255,.18);overflow:hidden}
.ep-hud .strain b{display:block;height:100%;background:#9fd4ff;border-radius:3px}
.ep-hud .strain.over b{background:#e58a7a}
.ep-hud .rankline{margin-top:8px;display:flex;gap:10px;align-items:baseline;color:#f0c27a;font-variant-numeric:tabular-nums}
.ep-hud .rankline b{font-size:1.15rem;color:#f6f1e8}
.ep-hud .pieceline{margin-top:6px;color:#9fd4ff}
.ep-hud .pieceline.late{color:#e58a7a}
.ep-panel .rank{margin:6px 0 0;font:800 4rem/1 Outfit,system-ui,sans-serif;letter-spacing:.02em;color:#f0c27a;text-align:center}
.ep-panel .rank .ui-rank-img{display:block;width:72px;height:72px;margin:0 auto 2px;object-fit:contain;filter:drop-shadow(0 0 12px rgba(126,200,255,.35))}
.ep-panel .rank.r-S{color:#ffe08a;text-shadow:0 0 22px rgba(255,224,138,.6)}.ep-panel .rank.r-A{color:#8dceb0}.ep-panel .rank.r-B{color:#9fd4ff}.ep-panel .rank.r-C{color:#e58a7a}
.ep-panel .rankdetail{font-size:.9rem;color:rgba(246,241,232,.75);margin:2px 0 8px}
.ep-say{z-index:22;transform:translate(-50%,8px);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;max-width:min(520px,calc(100vw - 28px));padding:10px 16px;border-radius:14px;background:#f6f1e8;color:#1a1c22;font:600 0.9rem/1.35 Outfit,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)}
.ep-say.on{opacity:1;transform:translate(-50%,0)}
.ep-say b{display:block;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#7a5a1a;margin-bottom:2px}
.ep-panel .strainline{font-size:.9rem;color:#9fd4ff;margin:0 0 10px}
.ep-score.scarred .forecast,.ep-score.scarred .strainline{color:#e58a7a}
.ep-toast{z-index:9;transform:translate(-50%,-8px);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;padding:10px 18px;border-radius:999px;background:rgba(14,16,22,.9);border:1px solid #f0c27a;color:#f6f1e8;font:600 0.95rem Outfit,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);white-space:nowrap;max-width:calc(100vw - 24px)}
.ep-toast.on{opacity:1;transform:translate(-50%,0)}
.ep-score,.ep-menu,.ep-ending{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,.55);padding:18px}
.ep-offer{z-index:21;pointer-events:none}
.ep-offer .ep-panel{pointer-events:auto;width:auto;max-width:min(280px,calc(100vw - 24px));padding:12px 14px;border-radius:14px;background:rgba(14,16,22,.9);backdrop-filter:blur(6px)}
.ep-offer h2{margin:0;font-size:1rem}
.ep-offer .tagline{margin:2px 0 0;font-size:.85rem;color:rgba(246,241,232,.8)}
.ep-offer .hint{margin:2px 0 0;font-size:.8rem;color:rgba(246,241,232,.6)}
.ep-offer .actions{display:flex;gap:8px;margin-top:10px}
.ep-offer .actions button{min-height:44px;min-width:44px;flex:1}
.ep-offer[hidden],.ep-score[hidden],.ep-menu[hidden],.ep-ending[hidden]{display:none}
.ep-score[hidden],.ep-menu[hidden],.ep-ending[hidden]{display:none}
.ep-panel{width:min(420px,100%);background:rgba(14,16,22,.92);border:1px solid rgba(246,241,232,.18);border-radius:20px;padding:22px 22px 18px;color:#f6f1e8;font:500 0.95rem/1.4 Outfit,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.ep-panel h2{margin:0 0 6px;font-size:1.25rem}
.ep-panel p{margin:0 0 14px;color:rgba(246,241,232,.72)}
.ep-panel .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.ep-panel button{appearance:none;border:1px solid rgba(246,241,232,.22);background:rgba(246,241,232,.08);color:#f6f1e8;border-radius:12px;padding:10px 16px;font:600 0.88rem Outfit,system-ui,sans-serif;cursor:pointer}
.ep-panel button.primary{background:#f0c27a;color:#1a1c22;border-color:transparent}
.ep-panel .forecast{font-size:1.15rem;font-weight:700;color:#9fd4ff;margin:8px 0 4px}
.ep-panel .breakdown{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:4px}
.ep-panel .breakdown li{display:grid;grid-template-columns:1fr 80px 64px;gap:8px;align-items:center;font-size:.82rem;color:rgba(246,241,232,.85)}
.ep-panel .breakdown i{display:block;height:6px;border-radius:3px;background:rgba(246,241,232,.14);overflow:hidden}
.ep-panel .breakdown i b{display:block;height:100%;background:#f0c27a}
.ep-panel .breakdown em{font-style:normal;text-align:right;font-variant-numeric:tabular-nums}
.ep-panel .nextline{margin:8px 0 0;font-size:.82rem;color:rgba(246,241,232,.55)}
.ep-panel button[disabled]{opacity:.45;cursor:default}
.ep-menu .ep-row.locked{opacity:.5;cursor:default}
.ep-menu .ep-row .rk{display:inline-block;min-width:1.2em;margin-right:6px;font-weight:800;color:#f0c27a;vertical-align:-2px}
.ep-menu .ep-row .rk.ui-rank-inline{width:1.35em;height:1.35em;min-width:1.35em;background:center/contain no-repeat var(--ui-rank);color:transparent;text-shadow:none;overflow:hidden}
.ep-menu .ep-list{max-height:min(60vh,520px);overflow:auto}
.ep-panel .unlockline{margin:6px 0 0;font-size:.9rem;color:#9fd4ff;font-weight:700}
.ep-menu .ep-row.chal{padding-left:24px;border-style:dashed}
.ep-menu .ep-chapter{display:flex;flex-direction:column;gap:1px;margin:12px 2px 2px;padding:0 2px;color:#f6f1e8}
.ep-menu .ep-chapter b{font:700 .72rem Outfit,system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#7ec8ff}
.ep-menu .ep-chapter small{font:italic 500 .95rem Fraunces,Georgia,serif;opacity:.85}
.ep-menu .ep-row.chal[disabled]{opacity:.45;cursor:default}
.ep-panel .bestline{font-size:0.82rem;color:rgba(246,241,232,.55)}
.ep-ending .ep-panel{width:min(520px,100%)}
.ep-ending .kicker{margin:0 0 2px;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:#9fd4ff}
.ep-ending ul{margin:0 0 12px;padding:0;list-style:none}
.ep-ending li{margin:5px 0;color:rgba(246,241,232,.86)}
.ep-ending li b{display:inline-block;min-width:92px;color:#f0c27a;font-weight:600}
.ep-ending li.scar b,.ep-ending li.scar{color:#e58a7a}
.ep-ending li.open b,.ep-ending li.open{color:rgba(246,241,232,.5)}
.ep-ending .lastline{font-size:1.05rem;color:#f6f1e8;margin:10px 0 4px}
.ep-ending .lastline i{display:block;font-style:normal;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#7ec8ff}
.ep-ending .tally{font-size:.85rem;color:#9fd4ff;margin:0 0 6px}
.ep-credits,.ep-post{position:fixed;inset:0;z-index:24;display:flex;align-items:flex-end;justify-content:center;pointer-events:none;padding:max(18px,env(safe-area-inset-top)) 18px max(28px,calc(env(safe-area-inset-bottom) + 18px))}
.ep-credits[hidden],.ep-post[hidden]{display:none}
.ep-credits{background:linear-gradient(180deg,rgba(4,6,12,.15) 0%,rgba(4,6,12,.55) 42%,rgba(4,6,12,.82) 100%);pointer-events:auto}
.ep-credits .roll{width:min(420px,100%);text-align:center;color:#f6f1e8;font:500 1rem/1.45 Outfit,system-ui,sans-serif;transform:translateY(40vh);animation:epCreditsUp var(--ep-credits-secs,26s) linear forwards}
.ep-credits .roll .kicker{margin:0 0 4px;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:#9fd4ff}
.ep-credits .roll h2{margin:0 0 18px;font:700 clamp(1.35rem,5vw,1.8rem)/1.15 Fraunces,Georgia,serif}
.ep-credits .cast{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.ep-credits .cast li{margin:0}
.ep-credits .cast b{display:block;font-size:max(14px,.95rem);font-weight:700;color:#f6f1e8}
.ep-credits .cast span{display:block;font-size:max(14px,.82rem);color:rgba(246,241,232,.7);margin-top:2px}
.ep-credits .skip,.ep-post .skip{pointer-events:auto;appearance:none;border:1px solid rgba(246,241,232,.28);background:rgba(14,16,22,.72);color:#f6f1e8;border-radius:12px;padding:12px 18px;min-height:44px;min-width:44px;font:600 .9rem Outfit,system-ui,sans-serif;cursor:pointer;position:absolute;left:50%;bottom:max(18px,calc(env(safe-area-inset-bottom) + 14px));transform:translateX(-50%)}
@keyframes epCreditsUp{from{transform:translateY(42vh)}to{transform:translateY(-110%)}}
.ep-post{align-items:center;background:rgba(6,8,14,.62);pointer-events:auto}
.ep-post .card{width:min(420px,100%);background:rgba(14,16,22,.92);border:1px solid rgba(246,241,232,.18);border-radius:18px;padding:20px 20px 16px;color:#f6f1e8;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.ep-post .kicker{margin:0 0 4px;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:#9fd4ff}
.ep-post h2{margin:0 0 8px;font:700 max(16px,1.15rem)/1.25 Fraunces,Georgia,serif}
.ep-post p{margin:0 0 14px;font-size:max(14px,.95rem);color:rgba(246,241,232,.82);line-height:1.4}
.ep-post .skip{position:static;transform:none;background:#f0c27a;color:#1a1c22;border-color:transparent}
@media (max-width:700px){
  .ep-credits .cast b,.ep-credits .cast span,.ep-post h2,.ep-post p{font-size:max(14px,1rem)}
}
.ep-menu .ep-list{display:flex;flex-direction:column;gap:8px;margin:12px 0}
.ep-menu .ep-row{display:flex;flex-direction:column;align-items:flex-start;text-align:left;width:100%;gap:2px}
.ep-menu .ep-row small{font-weight:500;color:rgba(246,241,232,.55)}
`;
  document.head.appendChild(style);

  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.id = "episodes";
  menuBtn.className = "ep-btn";
  menuBtn.textContent = L.menu;

  const hud = document.createElement("div");
  hud.id = "episode-hud";
  hud.className = "ep-hud";
  hud.hidden = true;
  hud.innerHTML = `<div class="ep-card"><h3></h3><p class="tag"></p><p class="objective" hidden></p><ul></ul><div class="timer" hidden></div><div class="strain" hidden></div><div class="rankline" hidden></div><div class="pieceline" hidden></div><div class="cue" hidden></div><p class="prompt" hidden></p><button type="button" class="skip" hidden>Skip</button></div>`;

  const offer = document.createElement("div");
  offer.id = "episode-offer";
  offer.className = "ep-offer";
  offer.hidden = true;
  offer.innerHTML = `<div class="ep-panel" role="status"><h2></h2><p class="tagline"></p><p class="hint"></p><div class="actions"><button type="button" class="primary accept"></button><button type="button" class="decline"></button></div></div>`;

  const scoreEl = document.createElement("div");
  scoreEl.id = "episode-score";
  scoreEl.className = "ep-score";
  scoreEl.hidden = true;
  scoreEl.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><h2></h2><p class="rank" hidden></p><div class="beststamp" hidden></div><p class="gradeline" hidden></p><p class="rankdetail" hidden></p><ul class="breakdown" hidden></ul><p class="forecast"></p><p class="detail"></p><p class="strainline" hidden></p><p class="bestline"></p><p class="unlockline" hidden></p><div class="actions"><button type="button" class="primary next">Next episode</button><button type="button" class="replay">Replay</button><button type="button" class="ok">OK</button></div><p class="nextline" hidden></p></div>`;

  const endEl = document.createElement("div");
  endEl.id = "ending-card";
  endEl.className = "ep-ending";
  endEl.hidden = true;
  endEl.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><p class="kicker"></p><h2></h2><p class="scene"></p><ul class="fared"></ul><p class="lastline"></p><p class="tally"></p><div class="actions"><button type="button" class="primary again"></button></div></div>`;

  /* The closing card after the finale: the day's three stories and the neighbors, from the arc the parts left. */
  const closeEl = document.createElement("div");
  closeEl.id = "closing-card";
  closeEl.className = "ep-ending";
  closeEl.hidden = true;
  closeEl.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><p class="kicker"></p><h2></h2><p class="scene"></p><ul class="fared"></ul><ul class="neighbors"></ul><p class="lastline"></p><p class="tally"></p><div class="actions"><button type="button" class="primary again"></button></div></div>`;

  /* Credits flyover (Night Show payoff): cast scroll over a crane-out shot, then tomorrow's sky request. */
  const creditsEl = document.createElement("div");
  creditsEl.id = "credits-roll";
  creditsEl.className = "ep-credits";
  creditsEl.hidden = true;
  creditsEl.innerHTML = `<div class="roll" aria-live="polite"><p class="kicker"></p><h2></h2><ul class="cast"></ul></div><button type="button" class="skip">Skip</button>`;

  const postEl = document.createElement("div");
  postEl.id = "post-credits";
  postEl.className = "ep-post";
  postEl.hidden = true;
  postEl.innerHTML = `<div class="card" role="dialog" aria-modal="true"><p class="kicker"></p><h2></h2><p class="ask"></p><button type="button" class="skip">Continue</button></div>`;

  const menu = document.createElement("div");
  menu.id = "episode-menu";
  menu.className = "ep-menu";
  menu.hidden = true;
  menu.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><h2>${L.menu}</h2><p>Jump the clock to a chapter and play that episode.</p><div class="ep-list"></div><div class="actions"><button type="button" class="close">Close</button></div></div>`;

  const toast = document.createElement("div");
  toast.id = "ability-toast";
  toast.className = "ep-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  const say = document.createElement("div");
  say.id = "episode-say";
  say.className = "ep-say";
  say.setAttribute("role", "status");
  say.setAttribute("aria-live", "polite");

  (document.getElementById("hud-left") || document.body).append(menuBtn);
  document.body.append(hud, offer, scoreEl, endEl, closeEl, creditsEl, postEl, menu, toast, say);

  const hudTitle = hud.querySelector("h3");
  const hudTag = hud.querySelector(".tag");
  const hudList = hud.querySelector("ul");
  const hudObjective = hud.querySelector(".objective");
  const hudTimer = hud.querySelector(".timer");
  const hudCue = hud.querySelector(".cue");
  hudCue.innerHTML = `<b class="cn"></b><i class="bar"><b></b></i><span class="cj"></span>`;
  const cueName = hudCue.querySelector(".cn");
  const cueBar = hudCue.querySelector(".bar b");
  const cueJudge = hudCue.querySelector(".cj");
  const hudStrain = hud.querySelector(".strain");
  const hudRank = hud.querySelector(".rankline");
  const hudPiece = hud.querySelector(".pieceline");
  const hudPrompt = hud.querySelector(".prompt");
  const hudSkip = hud.querySelector(".skip");
  const offerTitle = offer.querySelector("h2");
  const offerTag = offer.querySelector(".tagline");
  const offerHint = offer.querySelector(".hint");
  const offerAccept = offer.querySelector(".accept");
  const offerDecline = offer.querySelector(".decline");
  const scoreTitle = scoreEl.querySelector("h2");
  const scoreForecast = scoreEl.querySelector(".forecast");
  const scoreDetail = scoreEl.querySelector(".detail");
  const scoreBest = scoreEl.querySelector(".bestline");
  const scoreStrain = scoreEl.querySelector(".strainline");
  const scoreRank = scoreEl.querySelector(".rank");
  const scoreGrade = scoreEl.querySelector(".gradeline");
  const scoreBestStamp = scoreEl.querySelector(".beststamp");
  const scoreRankDetail = scoreEl.querySelector(".rankdetail");
  const scoreBreak = scoreEl.querySelector(".breakdown");
  const scoreUnlock = scoreEl.querySelector(".unlockline");
  const scoreOk = scoreEl.querySelector(".ok");
  const scoreNext = scoreEl.querySelector(".next");
  const scoreReplay = scoreEl.querySelector(".replay");
  const scoreNextLine = scoreEl.querySelector(".nextline");
  let lastRun = null; // { id, challenge } of the run the card shows
  const menuList = menu.querySelector(".ep-list");
  const endKicker = endEl.querySelector(".kicker");
  const endTitle = endEl.querySelector("h2");
  const endScene = endEl.querySelector(".scene");
  const endFared = endEl.querySelector(".fared");
  const endLast = endEl.querySelector(".lastline");
  const endTally = endEl.querySelector(".tally");
  const endAgain = endEl.querySelector(".again");
  const menuClose = menu.querySelector(".close");

  offerAccept.textContent = L.accept;
  offerDecline.textContent = L.decline;

  /* ---- rods / debris meshes (episode-local; not world.js) ---- */
  const props = { rods: [], debris: [], people: [], set: [], mats: null };
  function ensureMats() {
    if (!B || !world || !world.scene || props.mats) return props.mats;
    const rod = new B.StandardMaterial("ep-rod", world.scene);
    rod.diffuseColor = new B.Color3(0.55, 0.58, 0.62);
    rod.emissiveColor = new B.Color3(0.15, 0.35, 0.55);
    rod.specularColor = new B.Color3(0.4, 0.5, 0.6);
    const lit = new B.StandardMaterial("ep-rod-lit", world.scene);
    lit.diffuseColor = new B.Color3(0.7, 0.85, 1);
    lit.emissiveColor = new B.Color3(0.35, 0.7, 1);
    lit.specularColor = new B.Color3(0.2, 0.3, 0.4);
    const junk = new B.StandardMaterial("ep-debris", world.scene);
    junk.diffuseColor = new B.Color3(0.35, 0.32, 0.28);
    junk.specularColor = new B.Color3(0.05, 0.05, 0.05);
    props.mats = { rod, lit, junk };
    return props.mats;
  }
  /* ---- story props (Parts 1 and 2): market stalls, roof turbines, scorch and flood patches ---- */
  const story = { stalls: [], turbines: [], patches: [], spin: 0, turned: false, gauge: null };
  const STALL_AT = [[109, 20.4], [114, 20.4], [123, 20.4], [127.5, 20.4], [118, 33.4]];
  const STALL_COLORS = ["#d9604a", "#e0a53c", "#4f9a5b", "#4a7fc0", "#a65bb5"];
  function smat(name, hex, emissive) {
    const m = new B.StandardMaterial("ep-" + name + hex, world.scene);
    const c = B.Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.emissiveColor = c.scale(emissive || 0.12);
    m.specularColor = new B.Color3(0.05, 0.05, 0.05);
    return m;
  }
  function spawnStalls(open) {
    if (!B || !world || !world.scene) return;
    STALL_AT.forEach(([x, z], i) => {
      const node = new B.TransformNode("ep-stall-" + i, world.scene);
      node.position.set(x, world.surfaceAt ? world.surfaceAt(x, z) : 0, z); // on the plaza's paving, not in it
      const parts = [];
      const add = (m) => { m.parent = node; m.isPickable = false; parts.push(m); return m; };
      const table = add(B.MeshBuilder.CreateBox("ep-stall-table-" + i, { width: 2.2, height: 0.85, depth: 1 }, world.scene));
      table.position.y = 0.43;
      table.material = smat("table", "#8a6a44");
      [-1, 1].forEach((sx) => {
        const post = add(B.MeshBuilder.CreateCylinder("ep-stall-post-" + i, { diameter: 0.08, height: 2.3, tessellation: 6 }, world.scene));
        post.position.set(sx * 1.05, 1.15, -0.4);
        post.material = smat("post", "#5a5a60");
      });
      const awning = add(B.MeshBuilder.CreateBox("ep-stall-awning-" + i, { width: 2.5, height: 0.07, depth: 1.5 }, world.scene));
      awning.position.set(0, 2.3, -0.05);
      awning.rotation.x = 0.18;
      const goods = add(B.MeshBuilder.CreateBox("ep-stall-goods-" + i, { width: 1.7, height: 0.22, depth: 0.6 }, world.scene));
      goods.position.set(0, 0.96, 0);
      const st = { node, awning, goods, color: STALL_COLORS[i % STALL_COLORS.length], open: false, down: false, tilt: 0, shut: false };
      st.matOpen = smat("awn", st.color, 0.25);
      st.matShut = smat("awn", "#3a3c44", 0.02);
      st.matGoods = smat("goods", "#9fc060", 0.18);
      st.matBare = smat("bare", "#4a4a50", 0.02);
      story.stalls.push(st);
      setStall(st, !!open);
    });
  }
  function setStall(st, on) {
    st.open = on;
    st.awning.material = on ? st.matOpen : st.matShut;
    st.goods.material = on ? st.matGoods : st.matBare;
    st.goods.setEnabled(on);
  }
  function shutStall(st) {
    st.shut = true;
    setStall(st, false);
  }
  function toppleStall(dir) {
    const up = story.stalls.filter((s) => !s.down);
    if (!up.length) return null;
    const st = up[Math.floor(up.length / 2)];
    st.down = true;
    st.tiltTo = Math.PI / 2 * (dir || 1);
    return st;
  }
  function spawnTurbines(cfgT) {
    if (!B || !world || !world.scene || !cfgT) return;
    cfgT.x.forEach((x, i) => {
      const root = new B.TransformNode("ep-turbine-" + i, world.scene);
      root.position.set(x, cfgT.y, cfgT.z);
      const pole = B.MeshBuilder.CreateCylinder("ep-turbine-pole-" + i, { diameterTop: 0.14, diameterBottom: 0.26, height: 3.4, tessellation: 8 }, world.scene);
      pole.parent = root;
      pole.position.y = 1.7;
      pole.material = smat("pole", "#cfd4dc", 0.1);
      pole.isPickable = false;
      const rotor = new B.TransformNode("ep-turbine-rotor-" + i, world.scene);
      rotor.parent = root;
      rotor.position.set(0, 3.5, 0.3);
      const hub = B.MeshBuilder.CreateSphere("ep-turbine-hub-" + i, { diameter: 0.42, segments: 8 }, world.scene);
      hub.parent = rotor;
      hub.material = smat("hub", "#c9ced6", 0.15);
      hub.isPickable = false;
      for (let k = 0; k < 3; k++) {
        const arm = new B.TransformNode("ep-turbine-arm-" + i + k, world.scene);
        arm.parent = rotor;
        arm.rotation.z = (k * Math.PI * 2) / 3;
        const blade = B.MeshBuilder.CreateBox("ep-turbine-blade-" + i + k, { width: 0.2, height: 1.9, depth: 0.05 }, world.scene);
        blade.parent = arm;
        blade.position.y = 1.15;
        blade.material = smat("blade", "#f2f0ea", 0.18);
        blade.isPickable = false;
      }
      story.turbines.push({ root, rotor, hub, w: 0, still: true, lit: false, matHub: hub.material });
    });
  }
  /* Part 3: the Storm Tank's gauge, a glass tube on the avenue side of the tank that fills as the mast is charged
     and the rain comes down. `level` is 0..1; the fill grows from the bottom. */
  function spawnGauge(cfgG) {
    if (!B || !world || !world.scene || !cfgG) return;
    const root = new B.TransformNode("ep-gauge", world.scene);
    root.position.set(cfgG.x, world.surfaceAt ? world.surfaceAt(cfgG.x, cfgG.z) : 0, cfgG.z);
    const H = cfgG.h || 10;
    const tube = B.MeshBuilder.CreateBox("ep-gauge-tube", { width: 1.1, height: H, depth: 1.1 }, world.scene);
    tube.parent = root;
    tube.position.y = H / 2;
    const tm = smat("gauge-glass", "#27323f", 0.08);
    tm.alpha = 0.7;
    tube.material = tm;
    tube.isPickable = false;
    const fill = B.MeshBuilder.CreateBox("ep-gauge-fill", { width: 0.8, height: H, depth: 0.8 }, world.scene);
    fill.parent = root;
    fill.material = smat("gauge-water", "#3ecbff", 0.9);
    fill.isPickable = false;
    // the Board's speaker on its own post beside the gauge: it lights up and pulses when the Board speaks
    const post = B.MeshBuilder.CreateCylinder("ep-gauge-post", { diameter: 0.22, height: 4.2, tessellation: 8 }, world.scene);
    post.parent = root;
    post.position.set(2.6, 2.1, 0);
    post.material = smat("speaker-post", "#5a5a60", 0.05);
    post.isPickable = false;
    const horn = B.MeshBuilder.CreateBox("ep-gauge-speaker", { width: 1.0, height: 0.65, depth: 0.65 }, world.scene);
    horn.parent = root;
    horn.position.set(2.6, 4.5, 0);
    horn.material = smat("speaker", "#ffb347", 0.15);
    horn.isPickable = false;
    story.gauge = { root, fill, H, level: 0, to: 0, glow: fill.material, speaker: horn.material, flare: 0 };
    setGauge(0, true);
  }
  function setGauge(v, snap) {
    const g = story.gauge;
    if (!g) return;
    g.to = Math.max(0, Math.min(1, v));
    if (snap) g.level = g.to;
    applyGauge();
  }
  function applyGauge() {
    const g = story.gauge;
    if (!g) return;
    const k = Math.max(0.02, g.level);
    g.fill.scaling.y = k;
    g.fill.position.y = (g.H * k) / 2;
  }
  function patch(kind, x, z, r, hex, alpha) {
    if (!B || !world || !world.scene) return;
    const d = B.MeshBuilder.CreateCylinder("ep-patch-" + kind, { diameter: r * 2, height: 0.05, tessellation: 20 }, world.scene);
    d.position.set(x, kind === "flood" ? 0.1 : 0.07, z);
    const m = smat(kind, hex, 0.15);
    if (alpha < 1) m.alpha = alpha;
    d.material = m;
    d.isPickable = false;
    story.patches.push(d);
  }
  function clearStory() {
    story.stalls.forEach((s) => s.node.dispose(false, false));
    story.turbines.forEach((t) => t.root.dispose(false, false));
    story.patches.forEach((d) => d.dispose());
    if (story.gauge) story.gauge.root.dispose(false, true);
    story.gauge = null;
    story.turned = false;
    story.momentSpin = false;
    story.speakerOn = false;
    if (world.officePower) world.officePower(1);
    story.stalls = [];
    story.turbines = [];
    story.patches = [];
  }
  function clearProps(keepStory) {
    if (!keepStory) clearStory();
    props.rods.forEach((r) => {
      if (r.mesh) r.mesh.dispose();
      if (r.ball) r.ball.dispose();
    });
    props.debris.forEach((m) => m.dispose && m.dispose());
    props.people.forEach((q) => q.root && q.root.dispose(false, true));
    props.people = [];
    props.set.forEach((q) => q.root && q.root.dispose(false, true));
    props.set = [];
    props.rods = [];
    props.debris = [];
  }
  function spawnRods(ids) {
    if (!B || !world || !world.scene) return;
    const mats = ensureMats();
    const blocks = ((cfgRoot.city && cfgRoot.city.blocks) || []).filter((b) => ids.indexOf(b.id) >= 0);
    clearProps();
    blocks.forEach((b) => {
      const pole = B.MeshBuilder.CreateCylinder("ep-rod-" + b.id, { diameter: 0.18, height: 1.6, tessellation: 8 }, world.scene);
      pole.position.set(b.x, b.h + 0.8, b.z);
      pole.material = mats.rod;
      pole.isPickable = false;
      const ball = B.MeshBuilder.CreateSphere("ep-rod-tip-" + b.id, { diameter: 0.42, segments: 8 }, world.scene);
      ball.position.set(b.x, b.h + 1.7, b.z);
      ball.material = mats.rod;
      ball.isPickable = false;
      props.rods.push({ id: b.id, x: b.x, y: b.h + 1.7, z: b.z, mesh: pole, ball, hit: false });
    });
  }
  function spawnDebris(area) {
    if (!B || !world || !world.scene) return;
    const mats = ensureMats();
    const street = cfgRoot.street || { z: 12.6, from: -48, to: 210 };
    const zs = street.z || 12.6;
    // `area` = { x0, x1, n } puts the junk where a set piece needs it; without it, along the whole avenue.
    const n = area && area.n ? area.n : 8;
    const step = area ? (area.x1 - area.x0) / Math.max(1, n - 1) : 14;
    for (let i = 0; i < n; i++) {
      const x = area ? area.x0 + i * step : 20 + i * 14 + (i % 2) * 3;
      const z = zs + (i % 2 === 0 ? -2.4 : 2.6);
      const box = B.MeshBuilder.CreateBox("ep-debris-" + i, { width: 0.7, height: 0.55, depth: 0.55 }, world.scene);
      box.position.set(x, 0.28, z);
      box.material = mats.junk;
      box.isPickable = false;
      props.debris.push(box);
    }
  }
  function lightRod(id) {
    const mats = ensureMats();
    props.rods.forEach((r) => {
      if (r.id !== id || r.hit) return;
      r.hit = true;
      if (mats) {
        r.mesh.material = mats.lit;
        r.ball.material = mats.lit;
      }
    });
  }

  /* ---- goal helpers ---- */
  function goalState(ep) {
    return (ep.goals || []).map((g) => {
      const o = Object.assign({}, g, { done: false, failed: false, progress: 0 });
      if (g.seconds) o.count = g.seconds;
      return o;
    });
  }
  /* The unified score, the same for every episode: people helped (or goals done), time left, damage avoided
     (wrong calls, Strain, kick-backs) and ability variety. `scoring` in day.config.js sets the weights and bands. */
  const scoring = cfg.scoring || {};
  const scoreBands = scoring.bands || [{ min: 90, rank: "S" }, { min: 70, rank: "A" }, { min: 45, rank: "B" }, { min: 0, rank: "C" }];
  function liveScore(run) {
    const ep = run.ep;
    const R = run.rescue;
    const done = allDone(run);
    let people;
    if (R && R.total) {
      const rk = ep.rank || {};
      const late = rk.help > 0 ? (rk.late || 0) / rk.help : 0.6;
      people = (R.helped - R.late * (1 - late)) / R.total;
    } else people = run.goals.length ? goalsDone(run) / run.goals.length : 0;
    const time = done ? (ep.timer > 0 ? Math.max(0, run.left) / ep.timer : 1) : 0;
    let damage = 1;
    if (R) damage -= Math.min(1, R.hurt * 0.25);
    if (ep.strain) damage -= Math.min(1, run.strain / (2 * ep.strain.budget)) * 0.6 + Math.min(0.4, run.kicks.length * 0.2);
    const target = ep.variety || scoring.variety || 3;
    const variety = run.used ? Math.min(1, run.used.size / target) : 0;
    let m = { people, time, damage: Math.max(0, damage), variety };
    if (run.show) m = showTally(run.show, ep.finale, ep.variety); // the finale scores the show, not goals
    const b = scoreBreakdown(m, scoring);
    b.rank = rankOf(b.pct, scoreBands);
    b.used = run.show ? [...run.show.used] : run.used ? [...run.used] : [];
    b.target = target;
    return b;
  }
  function goalsDone(run) {
    return run.goals.filter((g) => g.done).length;
  }
  function allDone(run) {
    return run.goals.length > 0 && run.goals.every((g) => g.done);
  }
  /* A story part ends when every goal is done or failed (a failed one makes it a scarred finish). */
  function settled(run) {
    return run.goals.length > 0 && run.goals.every((g) => g.done || g.failed);
  }
  function afterMet(g, run) {
    if (!g.after) return true;
    const prev = run.goals.find((x) => x.id === g.after);
    return !!(prev && prev.done);
  }
  function playerPos() {
    const C = day.control;
    if (C && C.mode && C.mode() === "control" && C.state) {
      const s = C.state();
      return { x: s.x, z: s.z, y: s.y };
    }
    const fr = day.now && day.now().frame;
    if (fr && fr.person) return { x: fr.person.x, z: fr.person.z, y: 0 };
    return null;
  }
  function spotOf(name) {
    const d = day.today && day.today();
    return d && d.spots && d.spots[name] ? d.spots[name] : null;
  }
  /* ---- the tutorial episode: abilities locked, unlocked one at a time, a toast each ---- */
  const tutKey = cfg.tutorialKey || "icanbe.episodes.tutorial";
  let toastTimer = 0;
  let botQuiet = false;
  try {
    // Only a real player, or the tutorial-episode scenario, is offered it by itself: other scenarios
    // start with empty storage and must not meet the offer.
    const pid = new URLSearchParams(location.search).get("playtest");
    if (pid && pid !== "tutorial-episode") botQuiet = true;
    else if (!pid && navigator.webdriver) botQuiet = true; // runner start() without ?playtest=
  } catch (e) { /* no location */ }
  function tutorialDone() {
    try { return !!localStorage.getItem(tutKey); } catch (e) { return false; }
  }
  function rememberTutorial(how) {
    try { localStorage.setItem(tutKey, how); } catch (e) { /* private mode */ }
  }
  function abil() {
    const P = window.powers || day.powers;
    return P && P.abilities ? P.abilities : null;
  }
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("on"), 4200);
  }
  function unlockAbility(id, run) {
    const A = abil();
    if (!A || !id) return;
    A.unlock(id);
    // Wind's hold depths and Lightning's Storm share the verb's lock.
    if (id === "wind") ["gust", "gale", "tornado"].forEach((x) => A.unlock(x));
    if (id === "bolt") A.unlock("storm");
    const info = A.get(id) || { name: id, key: "" };
    const text = String((run.ep.lines && run.ep.lines.unlock) || "New ability: {name}. Key {key}.")
      .replace("{name}", info.name)
      .replace("{key}", String(info.key).toUpperCase());
    showToast(text);
    if (day.note) day.note(text);
    const slot = document.getElementById("ability-" + id);
    if (slot) {
      slot.classList.add("unlocked-now");
      setTimeout(() => slot.classList.remove("unlocked-now"), 4200);
    }
    // Pressure is topped up so a new ability can be tried straight away.
    if (A.reset) A.reset(100);
    run.unlocked.push(id);
    mark("unlock", { id: run.ep.id, power: id, name: info.name, key: info.key });
  }
  function openAllAbilities() {
    const A = abil();
    if (A) A.unlock();
  }
  function currentTutorialGoal(run) {
    return run.goals.find((g) => !g.done) || null;
  }

  /* The one objective line: the goal he is on now, its verb's icon, no key letters (the list above it is hidden). */
  function paintObjective(art) {
    const g = active && !active.ep.tutorial ? active.goals.find((x) => !x.done && !x.failed && afterMet(x, active)) : null;
    hudObjective.hidden = !g;
    hudObjective.textContent = "";
    if (!g) return;
    const verb = art && art.goalVerb ? art.goalVerb(g, active.ep.pieces) : g.power || null;
    if (verb && art && art.verbIcon) {
      const ico = document.createElement("img");
      ico.className = "g-ico";
      ico.alt = "";
      ico.src = art.verbIcon(verb, true);
      hudObjective.appendChild(ico);
    }
    let text = g.label || g.id;
    if (art && art.stripKeyLetters) text = art.stripKeyLetters(text);
    const need = g.count | 0;
    if (need > 1) text += ` (${Math.min(need, g.progress | 0)}/${need})`;
    else if (g.seconds) text += ` (${Math.min(g.seconds, Math.floor(g.progress || 0))}/${g.seconds} s)`;
    hudObjective.append(document.createTextNode(text));
  }
  function paintHud() {
    if (!active) {
      hud.hidden = true;
      return;
    }
    hud.hidden = false;
    hudTitle.textContent = active.ep.title;
    hudTag.textContent = active.ep.tagline || "";
    hudList.innerHTML = "";
    const art = window.uiArt || (window.day && window.day.uiArt);
    active.goals.forEach((g) => {
      const li = document.createElement("li");
      if (g.done) li.className = "done";
      else if (g.failed) li.className = "failed";
      const markEl = document.createElement("i");
      markEl.textContent = g.done ? "✓" : g.failed ? "✗" : "·";
      const verb = art && art.goalVerb ? art.goalVerb(g, active.ep.pieces) : (g.power || null);
      if (verb && art && art.verbIcon) {
        const ico = document.createElement("img");
        ico.className = "g-ico";
        ico.alt = "";
        ico.src = art.verbIcon(verb, !g.done && !g.failed);
        li.appendChild(ico);
      }
      const label = document.createElement("span");
      let text = g.label || g.id;
      if (art && art.stripKeyLetters) text = art.stripKeyLetters(text);
      if ((g.kind === "ability-in" && g.count > 1) || g.kind === "rods" || g.kind === "bolts" || g.kind === "timed-bolts" || g.kind === "debris" || g.kind === "help" || g.kind === "show-hits" || g.kind === "show-variety") {
        const need = g.count | 0;
        const have = Math.min(need, g.progress | 0);
        text += ` (${have}/${need})`;
      } else if (g.seconds) {
        text += ` (${Math.min(g.seconds, Math.floor(g.progress || 0))}/${g.seconds} s)`;
      }
      label.textContent = text;
      li.append(markEl, label);
      hudList.appendChild(li);
    });
    paintObjective(art);
    if (active.ep.timer && !active.show) {
      hudTimer.hidden = false;
      const sec = Math.max(0, Math.ceil(active.left));
      hudTimer.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    } else hudTimer.hidden = true;
    if (active.ep.strain) {
      const sc = (cfg.strain && cfg.strain.lines) || {};
      const b = active.ep.strain.budget;
      hudStrain.hidden = false;
      hudStrain.className = "strain" + (active.strain > b ? " over" : "");
      hudStrain.innerHTML = `${sc.meter || "Sky"}: ${active.strain} ${sc.of || "of"} ${b}<i><b style="width:${Math.min(100, Math.round((100 * active.strain) / b))}%"></b></i>`;
    } else hudStrain.hidden = true;
    const RS = active.rescue;
    if (!active.ep.tutorial) {
      const ls = liveScore(active);
      hudRank.hidden = false;
      hudRank.innerHTML = (RS ? `Score <b>${RS.score}</b> · ${RS.helped}/${RS.total} helped · ` : "") + `${ls.points} points · Rank <b>${ls.rank}</b>`;
    }
    if (RS && active.ep.rank) {
      hudPiece.hidden = !RS.def;
      if (RS.def) {
        const left = Math.max(0, Math.ceil(RS.def.limit - (active.age - RS.at)));
        hudPiece.className = "pieceline" + (left <= 0 ? " late" : "");
        hudPiece.textContent = `Set piece ${RS.idx + 1} of ${active.ep.pieces.length}: ` + (left > 0 ? `${left} s for full points` : "late, worth less");
      }
    } else {
      hudPiece.hidden = true;
    }
    if (active.ep.tutorial) hudRank.hidden = true;
    const cur = active.ep.tutorial ? currentTutorialGoal(active) : null;
    hudPrompt.hidden = !cur;
    if (cur) {
      const artP = window.uiArt || (window.day && window.day.uiArt);
      const prompt = artP && artP.stripKeyLetters ? artP.stripKeyLetters(cur.prompt || "") : (cur.prompt || "");
      const verbP = artP && artP.goalVerb ? artP.goalVerb(cur, active.ep.pieces) : (cur.power || null);
      hudPrompt.textContent = "";
      if (verbP && artP && artP.verbIcon) {
        const ico = document.createElement("img");
        ico.className = "g-ico";
        ico.alt = "";
        ico.src = artP.verbIcon(verbP, true);
        hudPrompt.appendChild(ico);
      }
      hudPrompt.appendChild(document.createTextNode(prompt));
    } else hudPrompt.textContent = "";
    hudSkip.hidden = !active.ep.tutorial;
    if (active.show) paintCue();
    else if (active.ep.cue) {
      hudCue.hidden = false;
      cueName.textContent = active.cueOn ? "Now — strike!" : "Wait for the cue…";
      cueBar.style.width = "0%";
      cueJudge.textContent = "";
    } else hudCue.hidden = true;
  }
  function completeGoal(g, via) {
    if (!active || g.done || !afterMet(g, active)) return false;
    g.done = true;
    g.progress = Math.max(g.progress | 0, g.count | 0);
    mark("goal", { id: active.ep.id, goal: g.id, via: via || "play" });
    // a turning point plays as a moment (camera, world, sting, voice) and stands in for the toast and the log line
    const staged = playTurning("goal:" + g.id);
    if (!staged) {
      if (day.note) day.note((g.label || g.id) + ".");
      const tt = active.ep.toasts && active.ep.toasts["goal:" + g.id];
      if (tt) showToast(tt);
      sayKey("goal:" + g.id);
    }
    if (g.kind === "wind-time") {
      story.turned = true;
      if (!staged && world.officePower) world.officePower(1);
    }
    if (g.kind === "help" && active.rescue) afterPiece();
    if (active.ep.tutorial) {
      const next = currentTutorialGoal(active);
      if (next) unlockAbility(next.power, active);
    }
    paintHud();
    const A = active;
    const over = () => {
      if (active !== A) return;
      if (allDone(A)) finish("clear");
      else if (A.ep.strain && settled(A)) finish("scarred");
    };
    if (momentOn()) A.afterMoment = over; // the card waits for the moment to end
    else over();
    return true;
  }
  function bumpProgress(g, n, via) {
    if (!active || g.done || !afterMet(g, active)) return;
    g.progress = Math.min(g.count | 0, (g.progress | 0) + (n || 1));
    paintHud();
    if (g.progress >= (g.count | 0)) completeGoal(g, via);
  }

  function tryGoalsFromSnap(via) {
    if (!active) return;
    const W = window.weather || day.weather;
    const wx = W && W.now ? W.now() : null;
    const P = window.powers || day.powers;
    const pow = P && P.now ? P.now() : null;
    const pos = playerPos();

    active.goals.forEach((g) => {
      if (!active || g.done || !afterMet(g, active)) return;
      if (g.kind === "weather" && wx && wx.state === g.state) completeGoal(g, via || "weather");
      if (g.kind === "weather-any" && wx && (g.states || []).indexOf(wx.state) >= 0) completeGoal(g, via || "weather");
      if (g.kind === "storm" && ((wx && wx.state === "storm") || (pow && pow.storming) || (pow && pow.called))) {
        completeGoal(g, via || "storm");
      }
      if (g.kind === "reach" && pos) {
        let tx = g.x;
        let tz = g.z;
        if (g.spot) {
          const s = spotOf(g.spot);
          if (s) {
            tx = s.x;
            tz = s.z;
          }
        }
        if (tx != null && Math.hypot(pos.x - tx, pos.z - tz) <= (g.r != null ? g.r : 5)) completeGoal(g, via || "reach");
      }
      if (g.kind === "intact") {
        if (active.toppled > 0) failGoal(g);
        else completeGoal(g, via || "intact");
      }
      if (g.kind === "rods") {
        g.progress = active.rodsHit.size;
        if (g.progress >= (g.count | 0)) completeGoal(g, via || "rod");
        else paintHud();
      }
      if (g.kind === "bolts") {
        g.progress = active.bolts;
        if (g.progress >= (g.count | 0)) completeGoal(g, via || "bolt");
        else paintHud();
      }
      if (g.kind === "timed-bolts") {
        g.progress = active.timed;
        if (g.progress >= (g.count | 0)) completeGoal(g, via || "timed");
        else paintHud();
      }
      if (g.kind === "debris") {
        g.progress = active.debris;
        if (g.progress >= (g.count | 0)) completeGoal(g, via || "debris");
        else paintHud();
      }
    });
  }

  /* ---- story parts: dialogue, Strain, kick-backs ---- */
  const said = []; // every line spoken: { t, who, text, key, ep }
  let sayQueue = [];
  let sayLeft = 0;
  function storyEvent(action, detail) {
    if (typeof window.CustomEvent !== "function" || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new window.CustomEvent("day:story", { detail: Object.assign({ action }, detail || {}) }));
    } catch (err) {
      /* node tests */
    }
  }
  /* The lines a key holds, in order, each shown for a few seconds (box at the bottom, and the log). */
  function sayKey(key, ep) {
    const e = ep || (active && active.ep);
    const lines = e && e.say && e.say[key];
    if (!lines) return;
    const spent = active && active.spent;
    // a turning-point moment (playTurning) already spoke some of a key's lines
    lines.forEach(([who, text], i) => { if (!(spent && spent.has(e.id + ":" + key + "#" + i))) sayQueue.push({ who, text, key, ep: e.id }); });
    if (sayLeft <= 0) nextSay();
  }
  /* ---- turning points (js/moments.js `play`, data in day.config.js moments.turning) ---- */
  const momentOn = () => !!(day.moments && day.moments.playing && day.moments.playing());
  function turningFor(beat) {
    const T = active && day.moments && day.moments.turning && day.moments.turning(active.ep.id);
    return T && T.on === beat && day.moments.enabled && day.moments.enabled() ? T : null;
  }
  /* The episode's big beat as a staged moment instead of a toast and a log line: a cut-away camera on the place, the
     event happening there (`fx`), a music sting, and the episode's own voiced lines (one caption line at a time). */
  function playTurning(beat) {
    const A = active;
    const T = turningFor(beat);
    if (!T || A.turnedBeats && A.turnedBeats.has(beat)) return false;
    const sk = (T.say.scarredKey && (A.over || A.kicks.length)) ? T.say.scarredKey : T.say.key;
    const all = (A.ep.say && A.ep.say[sk]) || [];
    const play = T.say.play.filter((p) => all[p.i]);
    A.spent = A.spent || new Set();
    A.turnedBeats = A.turnedBeats || new Set();
    A.turnedBeats.add(beat);
    play.forEach((p) => A.spent.add(A.ep.id + ":" + sk + "#" + p.i));
    const rest = all.filter((l, i) => !play.some((p) => p.i === i));
    const fxs = turnFx(T.fx, A);
    const ok = day.moments.play({
      id: A.ep.id,
      title: T.title,
      secs: T.secs,
      sting: T.sting,
      shot: T.shot,
      lines: play.map((p) => ({ who: all[p.i][0], text: all[p.i][1], at: p.at, caption: p.caption })),
      speak: (who, text) => {
        said.push({ t: performance.now(), who, text, key: sk, ep: A.ep.id, moment: true });
        if (said.length > 80) said.shift();
        storyEvent("say", { who, text, key: sk, id: A.ep.id, moment: true });
      },
      onStart: fxs.start,
      tick: fxs.tick,
      onEnd: () => {
        fxs.end();
        if (active !== A) return;
        if (T.rest === true) rest.forEach(([who, text]) => sayQueue.push({ who, text, key: sk, ep: A.ep.id }));
        if (T.rest === true && sayLeft <= 0) nextSay();
        mark("moment", { id: A.ep.id, beat, moment: T.title });
        const after = A.afterMoment;
        A.afterMoment = null;
        if (after) after();
      },
    });
    if (!ok) { play.forEach((p) => A.spent.delete(A.ep.id + ":" + sk + "#" + p.i)); A.turnedBeats.delete(beat); }
    return ok;
  }
  /* What happens in the world during a moment, by `fx`: { start, tick(k), end }. */
  function turnFx(kind, A) {
    const none = { start() {}, tick() {}, end() {} };
    const W = window.weather || day.weather;
    const flick = (s) => { try { day.cityscape && day.cityscape.flicker && day.cityscape.flicker(s); } catch (e) { /* no city */ } };
    if (kind === "lawn") {
      const lawn = (k) => { try { day.slice && day.slice.setLawn && day.slice.setLawn("damp", k, true); } catch (e) { /* no slice */ } };
      return {
        start() { lawn(0); if (W && W.set) W.set("rain", 0.85, "power"); },
        tick(k) { lawn(Math.max(0, Math.min(1, (k - 0.15) / 0.6))); },
        end() { lawn(1); },
      };
    }
    if (kind === "turbines") {
      return {
        start() { story.momentSpin = true; flick(1.4); if (world.officePower) world.officePower(0.15); },
        // the blades spin up first, then the office lights come back on a stutter and settle
        tick(k) {
          if (!world.officePower) return;
          const on = k < 0.3 ? 0.15 : k < 0.5 ? (Math.sin(k * 90) > 0 ? 0.9 : 0.25) : 1;
          world.officePower(on);
        },
        end() { story.momentSpin = false; if (world.officePower) world.officePower(1); },
      };
    }
    if (kind === "gauge") {
      return {
        start() { story.speakerOn = true; if (story.gauge) story.gauge.flare = 1; },
        tick() {},
        end() { story.speakerOn = false; if (story.gauge) story.gauge.flare = 0; },
      };
    }
    if (kind === "fog") return { start() { flick(1.8); }, tick() {}, end() {} };
    if (kind === "gate") {
      const gate = () => props.set.find((q) => q.kind === "gate");
      return {
        start() { const q = gate(); if (q) q.momentAngle = 1.2; },
        tick(k) { const q = gate(); if (q) q.momentAngle = k < 0.25 ? 1.2 : Math.max(0.05, 1.2 - ((k - 0.25) / 0.5) * 1.15); },
        end() { const q = gate(); if (q) q.momentAngle = null; },
      };
    }
    return none;
  }
  function nextSay() {
    const n = sayQueue.shift();
    if (!n) {
      sayLeft = 0;
      say.classList.remove("on");
      return;
    }
    sayLeft = 2.4 + n.text.length * 0.035;
    say.innerHTML = "";
    const who = document.createElement("b");
    who.textContent = n.who;
    say.append(who, document.createTextNode(n.text));
    say.classList.add("on");
    said.push({ t: performance.now(), who: n.who, text: n.text, key: n.key, ep: n.ep });
    if (said.length > 80) said.shift();
    if (day.note) day.note(`${n.who}: ${n.text}`);
    storyEvent("say", { who: n.who, text: n.text, key: n.key, id: n.ep });
  }
  function failGoal(g) {
    if (g.done || g.failed) return;
    g.failed = true;
    mark("goal-failed", { id: active.ep.id, goal: g.id });
    paintHud();
    if (settled(active)) finish("scarred");
  }
  function kick(id, extra) {
    if (!active || active.kicks.indexOf(id) >= 0) return false;
    active.kicks.push(id);
    sayKey("kick:" + id);
    const text = (active.ep.scars && active.ep.scars[id]) || id;
    if (day.note) day.note(`Kick-back: ${text}.`);
    mark("kick", Object.assign({ id: active.ep.id, kick: id }, extra || {}));
    storyEvent("kick", { id: active.ep.id, kick: id, strain: active.strain });
    return true;
  }
  /* One weather call during a story part: Strain, then what the sky does about it where he stood. */
  function onStoryCall(power) {
    const A = active;
    const sc = cfg.strain || {};
    const budget = A.ep.strain.budget;
    const nowS = performance.now() / 1000;
    const add = strainCost(Object.assign({}, sc, A.ep.strain), power, A.lastCall[power], nowS);
    A.lastCall[power] = nowS;
    A.strain += add;
    A.calls[power] = (A.calls[power] | 0) + 1;
    const pos = playerPos();
    const zones = A.ep.zones || {};
    const at = (name) => !!(pos && inZone(zones[name], pos.x, pos.z));
    const wasOver = A.over;
    A.over = A.strain > budget;
    mark("strain", { id: A.ep.id, power, add, strain: A.strain, budget, over: A.over });
    if (!A.edgy && A.strain >= budget - 1) {
      A.edgy = true;
      sayKey("edgy");
    }
    if (A.ep.id === "dry-park") {
      if (power === "rain" && at("market")) {
        A.strain += 2;
        A.marketWet = true;
        kick("soak", { x: pos.x, z: pos.z });
      }
      if (power === "rain" && at("park") && A.over && kick("flood")) patch("flood", 15, 60, 9, "#2c6f98", 0.55);
      if (power === "sunbreak" && at("market")) A.marketWet = false;
      if (power === "sunbreak" && A.over && pos && kick("scorch")) patch("scorch", pos.x - 1.5, pos.z + 3, 3.2, "#6b4a22", 1);
    } else if (A.ep.id === "low-tank") {
      const lim = (cfg.endings && cfg.endings.rules) || { calm: 6, overcast: 10 };
      if (A.strain > lim.calm && A.strain < lim.overcast && kick("flood")) patch("flood", 190, 24, 9, "#2c6f98", 0.55);
      if (A.strain >= lim.overcast && kick("overcast")) {
        const W = window.weather || day.weather;
        if (W && W.set) W.set("storm", 1, "power");
      }
    } else if (A.ep.id === "still-blades") {
      if (power === "gale" && at("market")) {
        toppleStall(1);
        A.toppled += 1;
        kick("topple", { x: pos.x, z: pos.z });
      }
      if (power === "gale" && A.over && at("roofs")) {
        A.windSec = 0;
        const g = A.goals.find((x) => x.kind === "wind-time");
        if (g && !g.done) g.progress = 0;
        A.shutUntil = A.age + 6;
        toppleStall(-1);
        A.toppled += 1;
        kick("overspeed");
      }
    }
    A.over = A.strain > budget;
    paintHud();
    if (A.toppled > 0) A.goals.filter((g) => g.kind === "intact").forEach(failGoal);
  }

  /* ---- rescue episodes (Rooftop storm): stranded people, helped by an ability called near them ---- */
  function buildPerson(q) {
    if (!B || !world || !world.scene) return null;
    const root = new B.TransformNode("ep-person-" + q.id, world.scene);
    root.position.set(q.x, q.y || 0, q.z);
    const add = (m, y, mat) => { m.parent = root; m.position.y = y; m.material = mat; m.isPickable = false; return m; };
    add(B.MeshBuilder.CreateCylinder("ep-person-body-" + q.id, { diameter: 0.5, height: 1.1, tessellation: 10 }, world.scene), 0.65, smat("person", q.color || "#cccccc", 0.15));
    add(B.MeshBuilder.CreateSphere("ep-person-head-" + q.id, { diameter: 0.38, segments: 8 }, world.scene), 1.45, smat("head", "#e8c9a8", 0.1));
    const warn = smat("warn", "#ffb347", 0.9);
    const ring = add(B.MeshBuilder.CreateTorus("ep-person-ring-" + q.id, { diameter: 1.9, thickness: 0.1, tessellation: 20 }, world.scene), 0.08, warn);
    const beam = add(B.MeshBuilder.CreateCylinder("ep-person-beam-" + q.id, { diameter: 0.14, height: 7, tessellation: 6 }, world.scene), 3.5, warn.clone("ep-warn-beam-" + q.id));
    beam.material.alpha = 0.35;
    return { root, ring, beam, warn, ok: smat("ok", "#6be0a0", 0.9) };
  }
  /* The scenery of a set piece (def.prop): flood water, a dead bus, a bridge gate. Plain shapes; the art pass is later. */
  function buildSet(def) {
    if (!B || !world || !world.scene || !def.prop) return null;
    const P = def.prop;
    const root = new B.TransformNode("ep-set-" + def.id, world.scene);
    root.position.set(P.x, 0, P.z);
    const add = (m, x, y, z, mat) => { m.parent = root; m.position.set(x, y, z); m.material = mat; m.isPickable = false; return m; };
    const out = { root, kind: P.kind, def, level: 0, hurts: 0 };
    if (P.kind === "water") {
      const mat = smat("flood", "#2f6f9a", 0.35);
      mat.alpha = 0.6;
      out.water = add(B.MeshBuilder.CreateBox("ep-set-water", { width: P.w || 12, height: 1, depth: P.d || 7 }, world.scene), 0, 0.05, 0, mat);
      out.water.scaling.y = 0.2;
    } else if (P.kind === "bus") {
      out.body = add(B.MeshBuilder.CreateBox("ep-set-bus", { width: 9, height: 2.7, depth: 2.5 }, world.scene), 0, 1.65, 0, smat("bus", "#c9a227", 0.05));
      out.glass = add(B.MeshBuilder.CreateBox("ep-set-bus-glass", { width: 8.2, height: 0.9, depth: 2.56 }, world.scene), 0, 2.15, 0, smat("busglass", "#33414f", 0.05));
      [-3, 3].forEach((wx, i) => add(B.MeshBuilder.CreateCylinder("ep-set-bus-wheel" + i, { diameter: 1.1, height: 2.7, tessellation: 12 }, world.scene), wx, 0.55, 0, smat("tyre", "#1b1c20", 0.02)).rotation.x = Math.PI / 2);
      out.lit = smat("buslit", "#ffe9a0", 0.9);
    } else if (P.kind === "gate") {
      add(B.MeshBuilder.CreateBox("ep-set-post-a", { width: 0.4, height: 2.2, depth: 0.4 }, world.scene), 0, 1.1, -4.5, smat("post", "#5a5a60"));
      add(B.MeshBuilder.CreateBox("ep-set-post-b", { width: 0.4, height: 2.2, depth: 0.4 }, world.scene), 0, 1.1, 4.5, smat("post", "#5a5a60"));
      const pivot = new B.TransformNode("ep-set-pivot", world.scene);
      pivot.parent = root;
      pivot.position.set(0, 2, -4.5);
      const bar = B.MeshBuilder.CreateBox("ep-set-bar", { width: 0.25, height: 0.25, depth: 9 }, world.scene);
      bar.parent = pivot;
      bar.position.z = 4.5;
      bar.material = smat("bar", "#e0503c", 0.5);
      bar.isPickable = false;
      out.pivot = pivot;
      out.angle = 1.2;
    }
    props.set.push(out);
    return out;
  }
  /* A call that hurts the piece: points off, the full-points window shorter, the scenery worse. */
  function hurtPiece(power) {
    const R = active.rescue;
    const def = R.def;
    const rk = active.ep.rank || {};
    const pen = rk.hurt != null ? rk.hurt : 40;
    R.score = Math.max(0, R.score - pen);
    R.hurt += 1;
    R.at -= def.hurtSecs != null ? def.hurtSecs : 15;
    const set = props.set.find((q) => q.def === def);
    if (set) set.hurts += 1;
    props.people.forEach((p) => {
      if (p.m && !p.helped && R.people.indexOf(p) >= 0) p.m.ring.scaling.setAll(1.5);
    });
    mark("hurt", { id: active.ep.id, piece: def.id, power, points: -pen, score: R.score, hurts: R.hurt });
    storyEvent("hurt", { id: active.ep.id, piece: def.id, power, points: -pen, score: R.score });
    sayKey("hurt:" + def.id);
    showToast(`-${pen} ${(def.hurtText && def.hurtText[power]) || "that made it worse"}`);
    paintHud();
  }
  function pieceGoal(R) {
    return active.goals.find((g) => g.kind === "help" && R.def && g.piece === R.def.id);
  }
  function beginPiece(i) {
    const R = active && active.rescue;
    const def = active && active.ep.pieces && active.ep.pieces[i];
    if (!R || !def) return;
    R.idx = i;
    R.def = def;
    R.at = active.age;
    R.lateSaid = false;
    R.people = def.people.map((q) => {
      const m = buildPerson(q);
      const person = Object.assign({}, q, { helped: false, late: false, t: 0, m });
      if (m) props.people.push(person);
      return person;
    });
    if (def.debris) spawnDebris(def.debris === true ? null : def.debris);
    buildSet(def);
    sayKey("piece:" + def.id);
    mark("piece", { id: active.ep.id, piece: def.id, index: i, people: def.people.length });
    paintHud();
  }
  /* The storm turns: the rain stops and a fog the street can't see through takes its place. */
  function doTwist(say) {
    const R = active.rescue;
    if (R.twisted) return;
    R.twisted = true;
    const ts = active.ep.twistSky || { state: "fog", intensity: 1 };
    R.sky = { state: ts.state, intensity: ts.intensity };
    const W = window.weather || day.weather;
    if (W && W.set) W.set(ts.state, ts.intensity, "story");
    if (say !== false) sayKey("twist");
    mark("twist", { id: active.ep.id, sky: ts.state });
    storyEvent("twist", { id: active.ep.id });
  }
  function afterPiece() {
    const R = active.rescue;
    const def = R.def;
    const staged = !!(def.twist && turningFor("twist"));
    if (def.twist) doTwist(!staged);
    if (active.ep.pieces[R.idx + 1]) beginPiece(R.idx + 1);
    else {
      R.sky = null;
      R.def = null;
    }
    if (staged && !playTurning("twist")) sayKey("twist");
  }
  function helpPerson(p) {
    const R = active.rescue;
    const rk = active.ep.rank || {};
    const def = R.def;
    p.late = active.age - R.at > def.limit;
    p.helped = true;
    const pts = p.late ? rk.late : rk.help;
    R.score += pts;
    R.helped += 1;
    R.lastHelpAt = active.age;
    if (p.late) R.late += 1;
    if (p.m) {
      p.m.ring.material = p.m.ok;
      p.m.beam.material = p.m.ok;
    }
    if (def.debris) {
      const n = Math.ceil(props.debris.length / def.people.length);
      for (let k = 0; k < n; k++) {
        const m = props.debris.find((x) => x.isEnabled());
        if (m) m.setEnabled(false);
      }
    }
    mark("help", { id: active.ep.id, piece: def.id, person: p.id, points: pts, late: p.late, score: R.score, helped: R.helped });
    storyEvent("help", { id: active.ep.id, piece: def.id, person: p.id, points: pts, late: p.late, score: R.score });
    showToast(`+${pts} ${p.name}${p.late ? " (late)" : ""}`);
    if (p.thanks) {
      const k = p.thanks.indexOf(": ");
      sayQueue.push({ who: k > 0 ? p.thanks.slice(0, k) : p.name, text: k > 0 ? p.thanks.slice(k + 2) : p.thanks, key: "thanks:" + p.id, ep: active.ep.id });
      if (sayLeft <= 0) nextSay();
    }
    const A = abil();
    if (A && A.reset) A.reset(100); // a rescue pays the Pressure back
    const g = pieceGoal(R);
    if (g) {
      g.progress = R.people.filter((x) => x.helped).length;
      paintHud();
      if (g.progress >= (g.count | 0)) completeGoal(g, "help");
    }
    paintHud();
  }
  function onPieceCall(power) {
    const R = active.rescue;
    const def = R && R.def;
    if (!def) return;
    const isHurt = def.hurts && def.hurts.indexOf(power) >= 0;
    if (!isHurt && def.powers.indexOf(power) < 0) return;
    const pos = playerPos();
    if (!pos) return;
    if (isHurt) {
      // Only a call made near the stranded hurts them.
      if (R.people.some((p) => !p.helped && Math.hypot(pos.x - p.x, pos.z - p.z) <= def.range + 6)) hurtPiece(power);
      return;
    }
    let best = null;
    let bd = 1e9;
    R.people.forEach((p) => {
      if (p.helped) return;
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d <= def.range && d < bd) {
        best = p;
        bd = d;
      }
    });
    if (best) helpPerson(best);
    else mark("help-miss", { id: active.ep.id, piece: def.id, power });
  }
  function rescueTick(dt) {
    const A = active;
    const R = A.rescue;
    const W = window.weather || day.weather;
    // The storm holds the sky: after an ability's own weather runs out, it comes back.
    if (R.sky && W && W.now && W.set && !W.now().manual) W.set(R.sky.state, R.sky.intensity, "story");
    if (R.def) {
      const el = A.age - R.at;
      if (!R.lateSaid && el > R.def.limit) {
        R.lateSaid = true;
        sayKey("late:" + R.def.id);
        mark("late", { id: A.ep.id, piece: R.def.id });
      }
    }
    props.set.forEach((q) => {
      const calm = q.def !== R.def || R.people.every((p) => p.helped);
      if (q.kind === "water" && q.water) {
        const want = calm ? 0.02 : 0.2 + 0.35 * q.hurts;
        q.water.scaling.y += (want - q.water.scaling.y) * Math.min(1, dt * 1.5);
      } else if (q.kind === "gate" && q.pivot) {
        const el = A.age - R.at;
        const want = q.momentAngle != null ? q.momentAngle : calm ? 1.2 : Math.min(0, 1.2 - 1.2 * Math.max(0, el / (q.def.limit || 60)) - 0.3 * q.hurts);
        q.angle += (want - q.angle) * Math.min(1, dt * (q.momentAngle != null ? 6 : 2));
        q.pivot.rotation.x = q.angle;
      } else if (q.kind === "bus" && q.glass && calm && q.glass.material !== q.lit) q.glass.material = q.lit;
    });
    props.people.forEach((p) => {
      if (!p.m) return;
      if (!p.helped) {
        const k = 1 + 0.12 * Math.sin(A.age * 5 + p.x);
        p.m.ring.scaling.x = k;
        p.m.ring.scaling.z = k;
      } else {
        p.t += dt;
        const f = Math.max(0, Math.min(1, (p.t - 1.2) / 0.8));
        p.m.root.scaling.setAll(Math.max(0.001, 1 - f));
        if (f >= 1 && p.m.root.isEnabled()) p.m.root.setEnabled(false);
      }
    });
  }

  /* ---- start / finish ---- */
  function showOffer(ep) {
    offerEp = ep;
    offerTitle.textContent = ep.title;
    // a small corner toast, under 40 words in all: the day keeps running under it and nothing waits on it
    offerTag.textContent = (ep.tagline || "").split(/\s+/).slice(0, 18).join(" ");
    offerHint.textContent = "";
    offerHint.hidden = true;
    offer.hidden = false;
    clearTimeout(offerTimer);
    offerTimer = setTimeout(() => { if (offerEp === ep && !offer.hidden) { hideOffer(); mark("offer-expired", { id: ep.id }); } }, 25000);
    mark("offer", { id: ep.id, words: offer.textContent.trim().split(/\s+/).length });
  }
  let offerTimer = 0;
  let offerArmed = false; // he is the player's and hasn't cast yet: the offer waits for the first cast
  function hideOffer() {
    offer.hidden = true;
    clearTimeout(offerTimer);
    offerEp = null;
  }
  function pickOffer() {
    const fr = day.now && day.now().frame;
    const chapter = (fr && (fr.chapter || (fr.action && fr.action.chapter))) || "";
    const minutes = (day.now && day.now().minutes) || 0;
    const inCar = !!(fr && fr.person && fr.person.inCar);
    // "Learn the weather" is practice now, in the Episodes menu only: the street's neighbors teach each verb by asking
    // for it out loud (js/street.js), so no card is offered to a new player.
    return matchEpisode(list, chapter, minutes, { inCar, arc: loadArc() });
  }
  function offerAfterCast() {
    if (!offerArmed || active || !offer.hidden || declinedTake) return;
    const co = window.day.coldopen;
    if (co && co.active && co.active()) return; // shown when the cold open ends
    // a new player's first minute stays under 40 words: the toast waits until `first-min` (js/coldopen.js) is over
    if (document.documentElement.classList.contains("first-min")) { setTimeout(offerAfterCast, 3000); return; }
    offerArmed = false;
    const ep = pickOffer();
    if (ep) showOffer(ep);
  }
  /* ---- the finale: the show's cues, judged on timing; the stage is js/finale.js ---- */
  let stage = null; // the plaza stage (spectators, beams, fireworks, aurora), alive from the start to the closing card
  let stageHold = false; // keep the stage up after the show for the score and closing cards
  let pendingClosing = null;
  let closeAuto = 0;
  let creditsOn = null; // { t0, secs, cfg, card, timer }
  let postOn = null; // { t0, secs, ask, timer }
  let lastFinale = null; // last night finale cfg (for credits after endQuiet)
  function clearRoofStands() {
    const N = day.neighbors;
    if (!N || !N.stand) return;
    ["birdie", "dex", "quill"].forEach((id) => { try { N.stand(id, null, null); } catch (e) { /* */ } });
  }
  function placeRoofs(F) {
    const N = day.neighbors;
    if (!N || !N.stand || !F || !F.roofs) return [];
    const placed = [];
    F.roofs.forEach((r) => {
      if (N.stand(r.id, r.x, r.z)) {
        if (N.gesture && r.gesture) N.gesture(r.id, r.gesture);
        placed.push({ id: r.id, who: r.who, x: r.x, z: r.z });
      }
    });
    return placed;
  }
  function speakFarewell(F) {
    const text = (F && F.farewell && F.farewell.text) || (window.DAY_CONFIG && window.DAY_CONFIG.pilot && window.DAY_CONFIG.pilot.farewell);
    if (!text) return false;
    const id = (F && F.farewell && F.farewell.id) || "pilot-finale-farewell";
    const lines = (window.DAY_CONFIG && window.DAY_CONFIG.pilot && window.DAY_CONFIG.pilot.lines) || [];
    const line = lines.find((p) => p.id === id) || { id, group: "finale", text, file: "audio/pilot/pilot-finale-farewell.mp3" };
    let ok = false;
    try {
      if (day.voice && day.voice.speakPilot) ok = !!day.voice.speakPilot(line, { via: "finale", queue: false, radio: window.DAY_CONFIG.pilot && window.DAY_CONFIG.pilot.radio });
    } catch (e) { /* */ }
    mark("show-farewell", { id: "night", text, voiced: ok });
    if (day.note) day.note(`Pilot: ${text}`);
    return true;
  }
  let roofCut = null; // { until, id }
  function speakRoof(r) {
    if (!r || r.said) return;
    r.said = true;
    const who = r.who || r.id;
    const text = r.text;
    // sayKey → #episode-say + day:story (js/dialogue.js speaks in their voice)
    sayKey("roof:" + r.id);
    try {
      if (day.neighbors && day.neighbors.gesture) day.neighbors.gesture(r.id, r.gesture || "thanks");
    } catch (e) { /* */ }
    // Brief cutaway so the roof watcher is seen from the plaza, not only heard
    const cut = (lastFinale && lastFinale.roofCutSec) || 1.9;
    if (r.shot && day.world && day.world()) {
      try {
        if (day.control && day.control.hold) day.control.hold(true);
        document.documentElement.classList.add("cine-up");
        day.world().cineShot(Object.assign({ secs: cut }, r.shot));
        try { window.hawkesPlaytest && window.hawkesPlaytest.cut && window.hawkesPlaytest.cut(cut + 0.4); } catch (e) { /* */ }
        roofCut = { until: performance.now() + cut * 1000, id: r.id };
        setTimeout(() => {
          if (!roofCut || roofCut.id !== r.id) return;
          roofCut = null;
          try { if (day.world && day.world() && day.world().cineShot) day.world().cineShot(null); } catch (e) { /* */ }
          try { if (day.control && day.control.hold) day.control.hold(false); } catch (e) { /* */ }
          if (!creditsOn) document.documentElement.classList.remove("cine-up");
        }, cut * 1000);
      } catch (e) { /* */ }
    }
    mark("show-roof", { id: "night", who, neighbor: r.id, text, x: r.x, z: r.z, cutaway: !!r.shot });
  }
  function cityAnswers(grade, power) {
    const k = grade === "perfect" ? 1 : 0.65;
    try {
      if (day.cityscape && day.cityscape.flicker) day.cityscape.flicker(0.55 + 0.55 * k);
    } catch (e) { /* */ }
    try {
      const W = window.weather || day.weather;
      if (W && W.triggerFlash && (power === "bolt" || grade === "perfect")) W.triggerFlash(18 + (1 - k) * 30, 0);
    } catch (e) { /* */ }
    try {
      // Plaza crowd answers the light with him (cheer / look-up near the fountain)
      window.dispatchEvent(new window.CustomEvent("day:crowd", { detail: { action: grade === "perfect" ? "celebrate" : "flinch", secs: 1.2 + k, x: 118, z: 26, r: 28 } }));
    } catch (e) { /* */ }
  }
  function tomorrowAskLine(cfg) {
    const post = cfg || {};
    try {
      const D = day.daily;
      const today = day.memory && day.memory.today && day.memory.today().date;
      if (D && D.forDate && today) {
        const [yy, mm, dd] = String(today).split("-").map(Number);
        const n = new Date(yy, mm - 1, dd + 1, 12);
        const key = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
        const ask = D.forDate(key);
        if (ask && ask.title) return { key, ask, line: `Tomorrow: ${ask.title}` };
      }
      if (D && D.today) {
        const t = D.today();
        if (t && t.title) return { key: null, ask: t, line: `Tomorrow: ${t.title}` };
      }
    } catch (e) { /* */ }
    return { key: null, ask: null, line: post.fallback || "Tomorrow the sky will ask again." };
  }
  function endCredits(how) {
    const c = creditsOn;
    if (!c) return false;
    creditsOn = null;
    if (c.timer) clearTimeout(c.timer);
    creditsEl.hidden = true;
    try { if (day.world && day.world() && day.world().cineShot) day.world().cineShot(null); } catch (e) { /* */ }
    try { if (day.control && day.control.hold) day.control.hold(false); } catch (e) { /* */ }
    document.documentElement.classList.remove("cine-up");
    try { window.hawkesPlaytest && window.hawkesPlaytest.cut && window.hawkesPlaytest.cut(); } catch (e) { /* */ }
    mark("credits", { id: "night", how: how || "end", secs: c.secs, cast: (c.cfg.cast || []).length });
    showPostCredits();
    return true;
  }
  function showCredits(card) {
    const F = lastFinale;
    const C = F && F.credits;
    if (!C) { showClosing(card); return false; }
    const secs = Math.max(12, Math.min(40, C.secs || 26));
    creditsOn = { t0: performance.now(), secs, cfg: C, card, timer: null };
    creditsEl.style.setProperty("--ep-credits-secs", secs + "s");
    creditsEl.querySelector(".kicker").textContent = C.kicker || "I Can Be";
    creditsEl.querySelector("h2").textContent = C.title || "The Night Show";
    creditsEl.querySelector(".skip").textContent = C.skip || "Skip";
    const ul = creditsEl.querySelector(".cast");
    ul.innerHTML = "";
    (C.cast || []).forEach((row) => {
      const li = document.createElement("li");
      const b = document.createElement("b");
      b.textContent = row.role || row.name || "";
      const sp = document.createElement("span");
      sp.textContent = row.name && row.role ? row.name : "";
      li.append(b);
      if (sp.textContent) li.append(sp);
      ul.appendChild(li);
    });
    const roll = creditsEl.querySelector(".roll");
    roll.style.animation = "none";
    void roll.offsetWidth;
    roll.style.animation = "";
    creditsEl.hidden = false;
    document.documentElement.classList.add("cine-up");
    try { if (day.control && day.control.hold) day.control.hold(true); } catch (e) { /* */ }
    try { window.hawkesPlaytest && window.hawkesPlaytest.cut && window.hawkesPlaytest.cut(secs + 1); } catch (e) { /* */ }
    try {
      if (day.world && day.world() && day.world().cineShot && C.shot) day.world().cineShot(Object.assign({ secs }, C.shot));
    } catch (e) { /* */ }
    try {
      if (day.stems && day.stems.motif) day.stems.motif(C.motif || "credits");
    } catch (e) { /* */ }
    mark("credits-start", { id: "night", secs, cast: (C.cast || []).length });
    creditsOn.timer = setTimeout(() => endCredits("end"), secs * 1000);
    return true;
  }
  function endPost(how) {
    const p = postOn;
    if (!p) return false;
    postOn = null;
    if (p.timer) clearTimeout(p.timer);
    postEl.hidden = true;
    try { if (day.world && day.world() && day.world().cineShot) day.world().cineShot(null); } catch (e) { /* */ }
    try { if (day.control && day.control.hold) day.control.hold(false); } catch (e) { /* */ }
    document.documentElement.classList.remove("cine-up");
    clearRoofStands();
    stopStage();
    mark("post-credits", { id: "night", how: how || "end", line: p.line, ask: p.ask && p.ask.id });
    return true;
  }
  function showPostCredits() {
    const P = (lastFinale && lastFinale.postCredits) || { secs: 7, fallback: "Tomorrow the sky will ask again.", kicker: "Tomorrow", skip: "Continue" };
    const info = tomorrowAskLine(P);
    const secs = Math.max(4, Math.min(14, P.secs || 7));
    postOn = { t0: performance.now(), secs, ask: info.ask, line: info.line, timer: null };
    postEl.querySelector(".kicker").textContent = P.kicker || "Tomorrow";
    postEl.querySelector("h2").textContent = info.ask && info.ask.name ? info.ask.name : "The sky";
    postEl.querySelector(".ask").textContent = info.line;
    postEl.querySelector(".skip").textContent = P.skip || "Continue";
    postEl.hidden = false;
    // Land the crane on tomorrow's asker when we know where they stand
    try {
      const ask = info.ask;
      const place = ask && (ask.stand || ask.place);
      const x = place && (place.x != null ? place.x : place[0]);
      const z = place && (place.z != null ? place.z : place[1]);
      if (x != null && z != null && day.world && day.world() && day.world().cineShot) {
        if (day.control && day.control.hold) day.control.hold(true);
        document.documentElement.classList.add("cine-up");
        day.world().cineShot({ secs, tx: x, ty: 3.2, tz: z, alpha: -1.6, beta: 1.05, radius: 16 });
      }
    } catch (e) { /* */ }
    mark("post-credits-show", { id: "night", line: info.line, ask: info.ask && info.ask.id });
    try {
      if (info.ask && info.ask.ask && day.voice && day.voice.speakAs) {
        const place = info.ask.stand || info.ask.place || {};
        day.voice.speakAs(info.ask.name || info.ask.who || "Birdie", info.ask.ask, { x: place.x, z: place.z, via: "finale-tomorrow", queue: false });
      }
    } catch (e) { /* */ }
    postOn.timer = setTimeout(() => endPost("end"), secs * 1000);
  }
  function stopStage() {
    if (stage) stage.stop();
    stage = null;
    stageHold = false;
  }
  function startShow(ep) {
    const F = ep.finale;
    lastFinale = F;
    active.show = {
      started: false, t: 0, over: false, endAt: 0, hits: 0, perfect: 0, off: 0, chain: 0, best: 0, act: -1, judge: "", judgeKind: "",
      farewell: false, roofsSaid: 0,
      used: new Set(), cues: F.cues.map((c) => Object.assign({ state: "wait", grade: null, dt: null }, c)),
      roofs: (F.roofs || []).map((r) => Object.assign({ said: false }, r)),
    };
    const placed = placeRoofs(F);
    stage = createFinale(world, B, F);
    if (stage) stage.start(F.spectators);
    mark("show-stage", { id: ep.id, spectators: F.spectators, cues: F.cues.length, roofs: placed.map((p) => p.id).join(",") });
  }
  const inPlaza = () => {
    const pos = playerPos();
    const z = active && active.ep.zones && active.ep.zones.plaza;
    return !!(pos && z && inZone(z, pos.x, pos.z));
  };
  const powerName = (id) => { const a = abil(); const v = a && a.get && a.get(id); return v ? `${v.name} (${String(v.key || "").toUpperCase()})` : id; };
  /* One weather call during the show: a hit on a cue, or off the beat. */
  function onShowCall(power) {
    const A = active;
    const S = A.show;
    const F = A.ep.finale;
    if (!S.started || S.over) return;
    const m = inPlaza() ? matchShowCue(S.cues, power, S.t, F) : null;
    if (!m) {
      S.off += 1;
      S.chain = 0;
      S.judge = F.lines.off;
      S.judgeKind = "off";
      mark("show-off", { id: A.ep.id, power, t: +S.t.toFixed(2), off: S.off });
      paintHud();
      return;
    }
    const c = S.cues[m.index];
    c.state = "hit";
    c.grade = m.grade;
    c.dt = m.dt;
    S.hits += 1;
    if (m.grade === "perfect") S.perfect += 1;
    S.chain += 1;
    S.best = Math.max(S.best, S.chain);
    S.used.add(power);
    S.judge = `${F.lines[m.grade]}${m.dt >= 0 ? " +" : " "}${m.dt.toFixed(2)} s · ×${S.chain}`;
    S.judgeKind = m.grade;
    if (stage) stage.cue(power, m.grade);
    cityAnswers(m.grade, power);
    mark("show-cue", { id: A.ep.id, cue: m.index, power, grade: m.grade, dt: +m.dt.toFixed(2), chain: S.chain, hits: S.hits });
    A.goals.forEach((g) => {
      if (g.kind === "show-hits") { g.progress = S.hits; if (S.hits >= (g.count | 0)) completeGoal(g, "show"); }
      if (g.kind === "show-variety") { g.progress = S.used.size; if (S.used.size >= (g.count | 0)) completeGoal(g, "show"); }
    });
    if (active) paintHud();
  }
  function showTick(dt) {
    const A = active;
    const S = A.show;
    const F = A.ep.finale;
    if (!S.started) {
      if (inPlaza()) {
        S.started = true;
        const a = abil();
        if (a && a.reset) a.reset(100);
        if (!S.farewell) { S.farewell = true; speakFarewell(F); }
        sayKey("gather");
        mark("show-begin", { id: A.ep.id, gathered: stage ? stage.info().gathered : 0, farewell: S.farewell, roofs: (S.roofs || []).length });
        paintHud();
      }
      return;
    }
    S.t += dt;
    (S.roofs || []).forEach((r) => {
      if (!r.said && S.t >= r.at) {
        speakRoof(r);
        S.roofsSaid = (S.roofsSaid || 0) + 1;
      }
    });
    F.acts.forEach((a, i) => {
      if (i > S.act && S.t >= a.at) {
        S.act = i;
        if (day.note) day.note((F.lines.act && F.lines.act[a.name]) || a.name);
        sayKey("act:" + a.name);
        mark("show-act", { id: A.ep.id, act: a.name });
      }
    });
    S.cues.forEach((c, i) => {
      if (c.state === "wait" && S.t > c.at + F.good) {
        c.state = "miss";
        S.chain = 0;
        S.judge = F.lines.miss;
        S.judgeKind = "miss";
        if (stage) stage.cue(c.power, "miss");
        mark("show-miss", { id: A.ep.id, cue: i, power: c.power });
      }
    });
    if (!S.over && S.cues.every((c) => c.state !== "wait")) {
      S.over = true;
      S.endAt = S.t + (F.afterSec != null ? F.afterSec : 5);
      const k = S.hits / S.cues.length;
      if (stage) stage.grand(k);
      if (day.note) day.note(F.lines.done);
      mark("show-over", { id: A.ep.id, hits: S.hits, perfect: S.perfect, best: S.best, off: S.off, of: S.cues.length, roofs: S.roofsSaid || 0 });
    }
    if (S.over && S.t >= S.endAt) {
      stageHold = true;
      const g = A.goals.find((x) => x.kind === "show-end");
      if (g) completeGoal(g, "show");
      if (active === A) finish("time"); // not every goal done: the show is still over
    }
  }
  function paintCue() {
    const A = active;
    const S = A.show;
    const F = A.ep.finale;
    hudCue.hidden = false;
    if (!S.started) {
      cueName.textContent = "Walk to the plaza. The show starts when he gets there.";
      cueBar.style.width = "0%";
      cueJudge.textContent = stage ? `${stage.info().gathered} of ${stage.info().spectators} are in place` : "";
      cueJudge.className = "cj";
      return;
    }
    const nx = S.cues.find((c) => c.state === "wait");
    if (nx) {
      const inSec = nx.at - S.t;
      cueName.textContent = `Next: ${powerName(nx.power)} in ${Math.max(0, inSec).toFixed(1)} s`;
      cueBar.style.width = Math.round(100 * Math.max(0, Math.min(1, 1 - inSec / 3))) + "%";
    } else {
      cueName.textContent = S.over ? F.lines.done : "";
      cueBar.style.width = "100%";
    }
    cueJudge.textContent = S.judge || "";
    cueJudge.className = "cj " + (S.judgeKind || "");
  }
  /* ---- chapter openers (js/moments.js `chapter`, config `arc`): the first start of any episode in a chapter plays
     that chapter's opener first (once per player: localStorage icanbe.chapters); skipping it still starts the episode. ---- */
  const CH_KEY = "icanbe.chapters";
  const chapterList = () => (window.DAY_CONFIG && window.DAY_CONFIG.arc) || [];
  const chapterOf = (id) => { const c = chapterList().find((x) => x.episodes.indexOf(id) >= 0); return c ? c.n : 0; };
  function chaptersSeen() { try { return JSON.parse(localStorage.getItem(CH_KEY) || "[]"); } catch (e) { return []; } }
  function chapterSeen(n) { const a = chaptersSeen(); if (a.indexOf(n) < 0) { a.push(n); try { localStorage.setItem(CH_KEY, JSON.stringify(a)); } catch (e) { /* private mode */ } } }
  function start(ep, via, opts) {
    if (!ep) return false;
    const n = chapterOf(ep.id);
    if (n && !(opts && opts.noOpener) && chaptersSeen().indexOf(n) < 0 && day.moments && day.moments.chapter && day.moments.enabled && day.moments.enabled()) {
      hideOffer();
      hideMenu();
      if (active) endQuiet();
      const openChapter = () => {
        chapterSeen(n);
        const played = day.moments.chapter(n, {
          onEnd: (how, d) => {
            // let-go or another moment replacing it means he didn't mean to start the episode
            if (d && (d.via === "let-go" || d.via === "replaced")) return;
            startNow(ep, via, Object.assign({}, opts, { noOpener: true }));
          },
        });
        if (played) { mark("chapter", { chapter: n, id: ep.id }); return true; }
        return startNow(ep, via, opts);
      };
      const T = day.transition;
      // Clock jump under the storm wipe so the chapter opener never hard-cuts the hour in the open.
      if (T && T.wipe && ep.clock && day.jump) {
        T.wipe(() => { day.jump(ep.clock); }, { kind: "chapter", id: "ch-" + n }).then(openChapter);
        return true;
      }
      if (ep.clock && day.jump) day.jump(ep.clock);
      return openChapter();
    }
    return startNow(ep, via, opts);
  }
  /** Fade newly spawned episode meshes in over 0.3 s so they never pop within 30 m. */
  function fadeNewProps() {
    const T = day.transition;
    if (!T || !T.fadeIn) return;
    const nodes = [];
    story.stalls.forEach((s) => s.node && nodes.push(s.node));
    story.turbines.forEach((t) => t.root && nodes.push(t.root));
    if (story.gauge && story.gauge.root) nodes.push(story.gauge.root);
    props.rods.forEach((r) => { if (r.mesh) nodes.push(r.mesh); if (r.ball) nodes.push(r.ball); });
    props.debris.forEach((m) => m && nodes.push(m));
    if (nodes.length) T.fadeIn(nodes);
  }
  function armEpisode(ep, via, opts) {
    active = {
      ep,
      goals: goalState(ep),
      started: performance.now() / 1000,
      left: ep.timer || 0,
      rodsHit: new Set(),
      bolts: 0,
      timed: 0,
      debris: 0,
      lastStrike: 0,
      cueOn: false,
      cueAge: 0,
      via: via || "play",
      used: new Set(),
    };
    active.unlocked = [];
    Object.assign(active, { strain: 0, over: false, edgy: false, lastCall: {}, calls: {}, kicks: [], marketWet: false, toppled: 0, windSec: 0, stay: 0, shutUntil: 0, age: 0 });
    if (ep.id === "dry-park" && !ep.challengeOn) saveBest(arcKey, { parts: {} }); // Part 1 starts the arc over
    active.carry = 0;
    if (ep.part === 3) {
      // Strain the district still carries from the earlier parts, less one for each sim hour since.
      const nowMin = (day.now && day.now().minutes) || 0;
      active.carry = carryStrain(loadArc(), nowMin, 3, cfg.strain && cfg.strain.perHour);
      active.strain = active.carry;
      active.over = active.strain > ep.strain.budget;
    }
    if (ep.tutorial) {
      const A = abil();
      if (A) A.lock();
      const first = currentTutorialGoal(active);
      if (first) unlockAbility(first.power, active);
    }
    if (ep.rods && ep.rods.length) spawnRods(ep.rods);
    else clearProps();
    if (ep.pieces) {
      active.rescue = { idx: -1, def: null, at: 0, score: 0, helped: 0, late: 0, total: ep.pieces.reduce((n, q) => n + q.people.length, 0), hurt: 0, precision: false, lastHelpAt: -9, sky: ep.sky ? Object.assign({}, ep.sky) : null, bonus: 0, people: [], twisted: false, lateSaid: false };
    }
    if (ep.debris) spawnDebris();
    if (ep.market) spawnStalls(!!ep.market.open);
    if (ep.turbines) spawnTurbines(ep.turbines);
    if (ep.id === "still-blades" && world.officePower) world.officePower(0.15); // "the lights are low": the moment brings them back
    if (ep.gauge) spawnGauge(ep.gauge);
    // Fade after the wipe lifts (caller), or now if there was no wipe.
    if (!(opts && opts.wiped)) fadeNewProps();
    stopStage();
    pendingClosing = null;
    closeAuto = 0;
    if (ep.finale) startShow(ep);
    sayQueue = [];
    sayLeft = 0;
    sayKey("start", ep);
    if (active.rescue) {
      const W = window.weather || day.weather;
      if (active.rescue.sky && W && W.set) W.set(active.rescue.sky.state, active.rescue.sky.intensity, "story");
      beginPiece(0);
    }
    if (ep.lines && ep.lines.start && day.note) day.note(ep.lines.start);
    paintHud();
    mark("start", { id: ep.id, via: via || "play", title: ep.title, challenge: !!ep.challengeOn, timer: ep.timer || 0, wipe: !!(opts && opts.wiped) });
  }
  function startNow(ep, via, opts) {
    if (!ep) return false;
    if (opts && opts.challenge && !ep.tutorial) ep = challengeEp(ep, cfg.challenge);
    hideOffer();
    hideMenu();
    if (active) endQuiet();
    const C = day.control;
    const T = day.transition;
    const wantWipe = !(opts && opts.noWipe) && T && T.wipe;
    if (wantWipe) {
      // Storm-cloud wipe hides the clock jump, prop swap, take-control blend and shader warm-up.
      T.wipe(() => {
        if (day.jump && ep.clock) day.jump(ep.clock);
        armEpisode(ep, via, Object.assign({}, opts, { wiped: true }));
        if (C && C.mode && C.mode() === "schedule") C.take();
      }, { kind: "episode", id: ep.id }).then(() => { fadeNewProps(); });
      return true;
    }
    if (C && C.mode && C.mode() === "schedule") {
      if (day.jump && ep.clock) day.jump(ep.clock);
      setTimeout(() => { if (C.mode() === "schedule") C.take(); }, 80);
    }
    armEpisode(ep, via, opts);
    return true;
  }
  function endQuiet() {
    if (active) active.afterMoment = null;
    if (momentOn()) day.moments.skip();
    if (world.officePower) world.officePower(1);
    if (active && active.show && !stageHold) stopStage();
    if (active && active.ep.tutorial) openAllAbilities();
    if (active && active.rescue) active.rescue.sky = null;
    active = null;
    clearProps(true); // the stalls, blades and patches stay: they are how the part ended
    hud.hidden = true;
  }
  function finish(why) {
    if (!active) return null;
    const run = active;
    if (run.ep.tutorial) {
      // Done and Skip are remembered; letting go (or a restart) only pauses it: it's offered again.
      const how = why === "clear" ? "done" : why === "skip" ? "skip" : "pause";
      if (how !== "pause") rememberTutorial(how);
      const L2 = run.ep.lines || {};
      const text = how === "done" ? L2.done : how === "skip" ? L2.skip : "";
      if (text) {
        if (day.note) day.note(text);
        showToast(text);
      }
      mark("tutorial-" + how, { id: run.ep.id, why, goals: goalsDone(run), unlocked: run.unlocked.length });
      mark("score", { id: run.ep.id, why, tutorial: true, goals: goalsDone(run) });
      endQuiet();
      return null;
    }
    const storyMeta = run.ep.strain
      ? { value: run.strain, budget: run.ep.strain.budget, kicks: run.kicks.length, penalty: (cfg.strain && cfg.strain.scarPenalty) || 25 }
      : null;
    const card = scoreCard(goalsDone(run), run.goals.length, run.left, run.ep.timer || 0, bands, storyMeta);
    const sb = liveScore(run);
    if (run.rescue) run.rescue.bonus = Math.round(sb.rows[1].points);
    card.pct = sb.pct;
    card.word = wordFor(sb.pct, bands);
    card.text = `Today's forecast: ${card.pct}% chance of ${card.word}` + (storyMeta ? (card.scarred ? " · scarred" : " · clean") : "");
    card.rank = sb.rank;
    card.points = sb.points;
    card.cleared = why === "clear" || (why !== "time" && why !== "let-go" && allDone(run));
    card.done = why === "clear" || why === "time" || why === "scarred" || card.cleared;
    lastRun = { id: run.ep.id, challenge: !!run.ep.challengeOn };
    const bestId = run.ep.challengeOn ? run.ep.id + "#challenge" : run.ep.id;
    const prevBest = loadBest(storageKey)[bestId];
    const rec = recordBest(storageKey, bestId, card);
    // The scars the card lists: each kick-back, a shut stall in Part 1, a goal that failed.
    const scars = run.kicks.map((k) => (run.ep.scars && run.ep.scars[k]) || k);
    if (run.ep.id === "dry-park" && story.stalls.length) {
      const filled = run.goals.some((g) => g.kind === "stay" && g.done);
      if (filled) story.stalls.forEach((x) => setStall(x, true));
      if (card.scarred && filled) {
        shutStall(story.stalls[story.stalls.length - 1]);
        scars.push((run.ep.scars && run.ep.scars.shut) || "a stall stays shut");
      }
    }
    if (run.ep.part && !run.ep.challengeOn && (why === "clear" || why === "scarred" || why === "time")) {
      const arc = loadArc();
      arc.parts[run.ep.part] = {
        scarred: !!card.scarred,
        strain: run.strain,
        kicks: run.kicks.slice(),
        goals: run.goals.filter((g) => g.done).map((g) => g.id),
        toppled: run.toppled,
        at: (day.now && day.now().minutes) || 0,
      };
      if (run.ep.part === 3) {
        const id = pickEnding(arc, run.strain, END.rules);
        arc.ending = { id, tank: run.strain };
        pendingEnding = { id, rank: card.rank || "C" };
      }
      saveBest(arcKey, arc);
      mark("arc", { id: run.ep.id, part: run.ep.part, scarred: !!card.scarred, strain: run.strain });
    }
    if (card.scarred && run.strain > run.ep.strain.budget) scars.push(`strain ${run.strain} over ${run.ep.strain.budget}`);
    if (run.ep.strain && (why === "clear" || why === "scarred")) sayKey(card.scarred ? "end:scarred" : "end:clean", run.ep);
    if (card.rank && (why === "clear" || why === "time")) sayKey("end:" + card.rank, run.ep);
    if (day.note) {
      if ((why === "clear" || why === "scarred") && run.ep.lines && (card.scarred ? run.ep.lines.scarred : run.ep.lines.done)) day.note(card.scarred ? run.ep.lines.scarred : run.ep.lines.done);
      else if (why === "clear" && run.ep.lines && run.ep.lines.done) day.note(run.ep.lines.done);
      else if (why === "time") day.note((run.ep.lines && run.ep.lines.timeUp) || L.timeUp);
      else if (why === "let-go") day.note(L.letGo);
      day.note(card.text);
    }
    scoreTitle.textContent = L.scoreTitle;
    scoreForecast.textContent = card.text;
    scoreDetail.textContent = `${card.done} of ${card.total} goals` + (why === "time" ? " · time up" : why === "let-go" ? " · let go" : "");
    scoreRank.hidden = false;
    scoreRank.textContent = card.rank;
    scoreRank.className = "rank r-" + card.rank;
    try {
      const artR = window.uiArt || (window.day && window.day.uiArt);
      if (artR && artR.applyRank && card.rank) artR.applyRank(scoreRank, card.rank);
    } catch (e) { /* */ }
    scoreRankDetail.hidden = false;
    {
      const R = run.rescue;
      scoreRankDetail.textContent = `Rank ${card.rank} · ${card.points} of ${sb.max} points` + (run.ep.challengeOn ? " · Challenge" : "") + (R ? ` · ${R.helped} of ${R.total} stranded helped` + (R.late ? ` (${R.late} late)` : "") + (R.hurt ? ` · ${R.hurt} wrong call${R.hurt > 1 ? "s" : ""}` : "") : "");
      const names = Object.assign({ people: R ? "People helped" : "Goals done", time: "Time left", damage: "Damage avoided", variety: "Ability variety" }, scoring.names || {}, (run.ep.finale && run.ep.finale.rowNames) || {});
      if (run.show) scoreRankDetail.textContent += ` · ${run.show.hits} of ${run.show.cues.length} cues on the beat (${run.show.perfect} perfect)` + (run.show.off ? ` · ${run.show.off} off the beat` : "");
      scoreBreak.innerHTML = "";
      sb.rows.forEach((r) => {
        const li = document.createElement("li");
        li.dataset.part = r.id;
        const nm = document.createElement("span");
        nm.textContent = names[r.id] + (r.id === "variety" ? ` (${sb.used.length} of ${sb.target})` : "");
        const bar = document.createElement("i");
        const fill = document.createElement("b");
        fill.style.width = Math.round(r.value * 100) + "%";
        bar.appendChild(fill);
        const pt = document.createElement("em");
        pt.textContent = `${r.points}/${r.max}`;
        li.append(nm, bar, pt);
        scoreBreak.appendChild(li);
      });
      scoreBreak.hidden = false;
    }
    scoreEl.classList.toggle("scarred", !!card.scarred);
    if (storyMeta) {
      const sl = (cfg.strain && cfg.strain.lines) || {};
      scoreStrain.hidden = false;
      scoreStrain.textContent = `${sl.meter || "Sky"} ${run.strain} ${sl.of || "of"} ${run.ep.strain.budget}` + (run.carry ? ` (${run.carry} carried from earlier)` : "") + ` · ${card.scarred ? sl.scarred || "Scarred" : sl.clean || "Clean"}` + (scars.length ? `: ${scars.join("; ")}` : "");
    } else scoreStrain.hidden = true;
    const b = rec.best[bestId];
    scoreBest.textContent = b ? `${L.best}: rank ${b.rank || "-"} · ${b.pct}% chance of ${b.word}` + (rec.improved && prevBest ? " (new best)" : "") : "";
    const unlocked = !run.ep.challengeOn && card.cleared && !(prevBest && prevBest.cleared) && run.ep.id !== "tutorial";
    scoreUnlock.hidden = !unlocked;
    scoreUnlock.textContent = unlocked ? (scoring.unlockLine || "Challenge unlocked. Find it in the Episodes menu.") : "";
    paintScoreButtons(why);
    scoreEl.hidden = false;
    startCeremony(card, run.ep.id, b && b.rank);
    if (run.ep.finale && run.ep.finale.closing && run.show && run.show.started && (why === "clear" || why === "time")) {
      pendingClosing = { rank: card.rank, points: card.points, hits: run.show.hits, of: run.show.cues.length, perfect: run.show.perfect, best: run.show.best, max: sb.max, closing: run.ep.finale.closing };
      closeAuto = run.ep.finale.closeAfter != null ? run.ep.finale.closeAfter : 9;
    } else if (run.show) stageHold = false;
    mark("score", { id: run.ep.id, challenge: !!run.ep.challengeOn, cleared: card.cleared, unlocked, best: b ? b.rank : null, parts: sb.rows.map((r) => r.id + ":" + r.points).join(","), variety: sb.used.join(","), rank: card.rank || null, points: card.points == null ? null : card.points, helped: run.rescue ? run.rescue.helped : null, pct: card.pct, word: card.word, text: card.text, why, improved: rec.improved, scarred: card.scarred, strain: run.strain, kicks: run.kicks.slice(), scars, show: run.show ? { hits: run.show.hits, perfect: run.show.perfect, off: run.show.off, best: run.show.best, of: run.show.cues.length, used: [...run.show.used].join(",") } : undefined });
    endQuiet();
    return card;
  }
  let pendingEnding = null;
  /* The ending scene (not a text card): which of A/B/C, lived in-engine via js/moments.js `ending`. */
  function showEnding(id, opts) {
    opts = opts || {};
    const e = END[id];
    if (!e) return null;
    const arc = loadArc();
    const fared = cityFared(arc, END.fared);
    const tank = (arc.ending && arc.ending.tank) || 0;
    const rank = opts.rank || (arc.ending && arc.ending.rank) || "C";
    endEl.hidden = true; // never the old summary card
    endEl.dataset.ending = id;
    if (day.note) day.note(`${e.name}.`);
    mark("ending", { id: "ending", ending: id, name: e.name, tank, rank, fared: fared.map((f) => f.need + ":" + f.state).join(",") });
    storyEvent("ending", { ending: id, name: e.name, tank, rank, fared: fared.map((f) => ({ need: f.need, state: f.state })) });
    const M = day.moments;
    const played = !!(M && M.ending && M.ending(id, {
      rank,
      onEnd: () => {
        try { window.dispatchEvent(new window.CustomEvent("day:episode", { detail: { action: "ending-done", ending: id, name: e.name, rank } })); } catch (err) { /* */ }
      },
    }));
    if (!played) {
      // fallback: stamp only if moments aren't up yet (NullEngine / early boot)
      mark("ending-scene", { id: "ending", ending: id, fallback: true });
    }
    return { id, name: e.name, fared, rank, scene: played };
  }
  /* Replay and Next episode on the score card. Next shows what it opens, or why it is shut. */
  function paintScoreButtons(why) {
    const best = loadBest(storageKey);
    const base = lastRun && list.find((e) => e.id === lastRun.id);
    const nxt = base && !base.tutorial ? nextEpisode(list, base.id) : null;
    const lock = nxt ? episodeLock(list, best, nxt.id) : null;
    const hold = !!pendingEnding; // the ending card comes first; its button is the way on
    scoreReplay.hidden = !base || hold;
    scoreNext.hidden = !!lastRun && lastRun.challenge ? true : hold || !nxt;
    scoreNext.disabled = !!lock;
    scoreNext.textContent = nxt && !lock ? `Next: ${nxt.title}` : "Next episode";
    scoreNextLine.hidden = !(nxt && lock) || scoreNext.hidden;
    scoreNextLine.textContent = lock ? `Next episode is locked. Finish ${lock} first.` : "";
    scoreEl.dataset.next = nxt && !lock && !scoreNext.hidden ? nxt.id : "";
  }
  /* Jump the clock to an episode's chapter, take control and start it (the menu, Replay and Next all go this way).
     With js/transition.js the clock jump and prop swap run under the storm wipe — never in the open. */
  function launch(ep, opts) {
    const T = day.transition;
    if (T && T.wipe) {
      start(ep, "menu", opts);
      return;
    }
    if (day.jump && ep.clock) day.jump(ep.clock);
    const C = day.control;
    setTimeout(() => {
      if (C && C.mode && C.mode() === "schedule") C.take();
      start(ep, "menu", opts);
    }, 120);
  }
  function hideScore() {
    scoreEl.hidden = true;
    cerClear();
    closeAuto = 0;
    if (pendingEnding) {
      const pe = pendingEnding;
      pendingEnding = null;
      showEnding(typeof pe === "string" ? pe : pe.id, typeof pe === "string" ? {} : pe);
    } else if (pendingClosing) {
      const c = pendingClosing;
      pendingClosing = null;
      if (lastFinale && lastFinale.credits) showCredits(c);
      else showClosing(c);
    } else if (!active) stopStage();
  }
  /* The closing card: how the day's stories ended (from the arc the three parts left), the neighbors in the crowd, his last line. */
  function showClosing(c) {
    const K = c.closing;
    const arc = loadArc();
    const fared = cityFared(arc, END.fared);
    const endingId = arc.ending && arc.ending.id;
    closeEl.querySelector(".kicker").textContent = K.kicker || "Closing night";
    closeEl.querySelector("h2").textContent = K.title || "The district, tonight";
    closeEl.querySelector(".scene").textContent = (K.intro && (K.intro[endingId] || K.intro.none)) || "";
    const ul = closeEl.querySelector(".fared");
    ul.innerHTML = "";
    fared.forEach((f) => {
      const li = document.createElement("li");
      li.className = f.state;
      li.dataset.need = f.need;
      const b = document.createElement("b");
      b.textContent = (END.needs && END.needs[f.need]) || f.need;
      li.append(b, document.createTextNode(f.text));
      ul.appendChild(li);
    });
    const nb = closeEl.querySelector(".neighbors");
    nb.innerHTML = "";
    (K.neighbors || []).forEach(([who, text]) => {
      const li = document.createElement("li");
      li.dataset.neighbor = who;
      const b = document.createElement("b");
      b.textContent = who;
      li.append(b, document.createTextNode(text));
      nb.appendChild(li);
    });
    const last = (K.last && (K.last[c.rank] || K.last.C)) || ["He", ""];
    const ll = closeEl.querySelector(".lastline");
    ll.innerHTML = "";
    const who = document.createElement("i");
    who.textContent = last[0];
    ll.append(who, document.createTextNode(last[1]));
    closeEl.querySelector(".tally").textContent = `${K.tally || "The show"}: rank ${c.rank} · ${c.points} of ${c.max} points · ${c.hits} of ${c.of} cues on the beat (${c.perfect} perfect) · best chain ${c.best}`;
    closeEl.querySelector(".again").textContent = K.button || "Walk the city";
    closeEl.dataset.ending = endingId || "none";
    closeEl.dataset.rank = c.rank;
    closeEl.hidden = false;
    if (day.note) day.note(`${K.title || "Closing night"}. ${last[0]}: ${last[1]}`);
    mark("closing", { id: "night", rank: c.rank, ending: endingId || "none", fared: fared.map((f) => f.need + ":" + f.state).join(","), neighbors: (K.neighbors || []).length });
  }
  closeEl.querySelector(".again").addEventListener("click", () => {
    closeEl.hidden = true;
    clearRoofStands();
    stopStage();
  });
  creditsEl.querySelector(".skip").addEventListener("click", () => endCredits("skip"));
  postEl.querySelector(".skip").addEventListener("click", () => endPost("skip"));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" && e.key !== "Enter") return;
    if (!creditsEl.hidden) { e.preventDefault(); endCredits("key"); }
    else if (!postEl.hidden) { e.preventDefault(); endPost("key"); }
  }, true);

  function hideMenu() {
    menu.hidden = true;
    document.documentElement.classList.remove("ep-menu-up"); // css/hud.css: the in-play HUD comes back
  }
  function showMenu() {
    const best = loadBest(storageKey);
    menuList.innerHTML = "";
    // grouped by chapter: each chapter's name and line, then its episodes (the tutorial sits in the first)
    const order = [];
    chapterList().forEach((c) => {
      const eps = list.filter((e) => e.chapter === c.n);
      if (!eps.length) return;
      order.push({ head: c });
      eps.forEach((e) => order.push({ ep: e }));
    });
    list.filter((e) => !chapterOf(e.id)).forEach((e) => order.push({ ep: e }));
    order.forEach((row) => {
      if (row.head) {
        const h = document.createElement("div");
        h.className = "ep-chapter";
        h.id = "ep-chapter-" + row.head.n;
        h.dataset.chapter = String(row.head.n);
        h.innerHTML = `<b>Chapter ${row.head.n} · ${row.head.title}</b><small>${row.head.line}</small>`;
        menuList.appendChild(h);
        return;
      }
      const ep = row.ep;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ep-row";
      btn.id = "ep-row-" + ep.id;
      const b = best[ep.id];
      const lock = ep.tutorial ? null : episodeLock(list, best, ep.id);
      btn.dataset.locked = lock ? "1" : "0";
      btn.dataset.rank = b && b.rank ? b.rank : "";
      const artM = window.uiArt || (window.day && window.day.uiArt);
      const rk = b && b.rank
        ? (artM && artM.rankStamp
          ? `<span class="rk ui-rank-inline" style="--ui-rank:url('${artM.rankStamp(b.rank)}')" title="${b.rank}">${b.rank}</span>`
          : `<span class="rk">${b.rank}</span>`)
        : "";
      btn.innerHTML = lock
        ? `<strong>${ep.title}</strong><small>Locked · finish ${lock} first</small>`
        : `<strong>${rk}${ep.title}</strong><small>${ep.tagline || ""}${b ? ` · ${L.best} ${b.rank ? "rank " + b.rank + " · " : ""}${b.pct}%${episodeDone(best, ep.id) ? " · finished" : ""}` : ""}</small>`;
      if (lock) {
        btn.disabled = true;
        btn.classList.add("locked");
      }
      btn.addEventListener("click", () => {
        hideMenu();
        launch(ep);
      });
      menuList.appendChild(btn);
      if (ep.tutorial || (btn.disabled && btn.classList.contains("locked"))) return;
      const ch = challengeEp(ep, cfg.challenge);
      const open = challengeOpen(best, ep.id);
      const cb = document.createElement("button");
      cb.type = "button";
      cb.className = "ep-row chal";
      cb.id = "ep-challenge-" + ep.id;
      cb.dataset.locked = open ? "0" : "1";
      const cbest = best[ep.id + "#challenge"];
      const extra = ch.pieces ? ch.pieces.reduce((n, q) => n + q.people.length, 0) - ep.pieces.reduce((n, q) => n + q.people.length, 0) : 0;
      cb.innerHTML = `<strong>Challenge</strong><small>${open ? `${ch.timer ? Math.floor(ch.timer / 60) + ":" + String(ch.timer % 60).padStart(2, "0") + " timer" : "tighter"}${extra ? `, ${extra} more to help` : ""}${ch.strain ? `, Sky budget ${ch.strain.budget}` : ""}${cbest ? ` · ${L.best} ${cbest.rank || "-"}` : ""}` : "Clear it once to unlock"}</small>`;
      if (!open) cb.disabled = true;
      cb.addEventListener("click", () => {
        hideMenu();
        launch(ep, { challenge: true });
      });
      menuList.appendChild(cb);
    });
    menu.hidden = false;
    document.documentElement.classList.add("ep-menu-up"); // css/hud.css: caption, ability bar and hint step aside
    mark("menu", {});
  }

  menuBtn.addEventListener("click", () => {
    if (menu.hidden) showMenu();
    else hideMenu();
  });
  menuClose.addEventListener("click", hideMenu);
  menu.addEventListener("click", (e) => {
    if (e.target === menu) hideMenu();
  });
  offerAccept.addEventListener("click", () => {
    if (offerEp) start(offerEp, "offer");
  });
  offerDecline.addEventListener("click", () => {
    declinedTake = true;
    const id = offerEp && offerEp.id;
    if (offerEp && offerEp.tutorial) rememberTutorial("skip");
    hideOffer();
    mark("decline", { id });
  });
  offer.addEventListener("click", (e) => {
    if (e.target === offer) {
      declinedTake = true;
      const id = offerEp && offerEp.id;
      if (offerEp && offerEp.tutorial) rememberTutorial("skip");
      hideOffer();
      mark("decline", { id });
    }
  });
  endAgain.addEventListener("click", () => { endEl.hidden = true; });
  hudSkip.addEventListener("click", () => {
    if (active && active.ep.tutorial) finish("skip");
  });
  scoreOk.addEventListener("click", hideScore);
  scoreReplay.addEventListener("click", () => {
    const base = lastRun && list.find((e) => e.id === lastRun.id);
    if (!base || pendingEnding) return;
    scoreEl.hidden = true;
    pendingClosing = null;
    closeAuto = 0;
    mark("replay", { id: base.id, challenge: lastRun.challenge });
    launch(base, lastRun.challenge ? { challenge: true } : undefined);
  });
  scoreNext.addEventListener("click", () => {
    const base = lastRun && list.find((e) => e.id === lastRun.id);
    const nxt = base && nextEpisode(list, base.id);
    if (!nxt || pendingEnding || episodeLock(list, loadBest(storageKey), nxt.id)) return;
    scoreEl.hidden = true;
    pendingClosing = null;
    closeAuto = 0;
    mark("next", { id: nxt.id, from: base.id });
    launch(nxt);
  });
  scoreEl.addEventListener("click", (e) => {
    if (e.target === scoreEl) hideScore();
  });

  /* ---- events ---- */
  window.addEventListener("day:control", (e) => {
    const d = (e && e.detail) || {};
    const action = d.action;
    if (action === "take") {
      lastControl = "control";
      declinedTake = false;
      if (cfg.offerOnTake === false) return;
      // The offer is a corner toast that comes after his first cast (never before, never a modal): arm it here.
      if (window.day.tutorial && window.day.tutorial.blocking && window.day.tutorial.blocking()) return;
      if (active || !offer.hidden) return;
      offerArmed = true;
    } else if (action === "let-go") {
      lastControl = "returning";
      offerArmed = false;
      hideOffer();
      if (active) finish("let-go");
    } else if (action === "back") {
      lastControl = "schedule";
      declinedTake = false;
      hideOffer();
    }
  });

  window.addEventListener("day:weather", () => {
    if (active) tryGoalsFromSnap("weather");
  });

  window.addEventListener("day:coldopen", (e) => {
    if (e && e.detail && (e.detail.action === "end" || e.detail.action === "failed")) setTimeout(offerAfterCast, 2500);
  });
  window.addEventListener("day:power", (e) => {
    const pd = (e && e.detail) || {};
    if (offerArmed && !active && !pd.denied && pd.action === pd.power) setTimeout(offerAfterCast, 1500);
    if (!active) return;
    const d = (e && e.detail) || {};
    const power = d.power || d.action;
    if (active.ep.tutorial) {
      // A used ability ("denied" and the world's thunder echo don't count).
      if (d.action !== power || d.action === "denied") return;
      const cur = currentTutorialGoal(active);
      const windFamily = { wind: 1, gust: 1, gale: 1, tornado: 1 };
      const match = cur && (cur.power === power || (cur.power === "wind" && windFamily[power]) || (cur.power === "bolt" && power === "storm"));
      if (match) completeGoal(cur, d.via || "key");
      return;
    }
    if (d.action === d.power && d.action !== "denied" && active.used) active.used.add(d.power);
    if (active.rescue && d.action === d.power && d.action !== "denied") onPieceCall(d.power);
    if (active.show && d.action === d.power && d.action !== "denied") {
      onShowCall(d.power);
      if (!active) return;
    }
    if (active.ep.strain && d.action === d.power && d.action !== "denied") {
      onStoryCall(d.power);
      const pos = playerPos();
      active.goals.forEach((g) => {
        if (g.kind !== "ability-in" || g.done || !afterMet(g, active) || g.power !== d.power) return;
        if (!(pos && inZone((active.ep.zones || {})[g.zone], pos.x, pos.z))) return;
        if (g.count > 1) bumpProgress(g, 1, d.via || "key");
        else completeGoal(g, d.via || "key");
      });
      if (!active) return;
    }
    if (power === "storm") tryGoalsFromSnap("storm");
    if (power === "gust" || power === "tornado") {
      active.debris += 1;
      tryGoalsFromSnap("debris");
    }
    if (power === "bolt") {
      // Strike coords come from powers.now().strike on the next tick.
      setTimeout(() => {
        if (!active) return;
        const P = window.powers || day.powers;
        const snap = P && P.now ? P.now() : null;
        const strike = snap && snap.strike;
        if (!strike || strike.id === active.lastStrike) return;
        active.lastStrike = strike.id;
        active.bolts += 1;
        if (active.cueOn) active.timed += 1;
        let hitRod = null;
        props.rods.forEach((r) => {
          if (r.hit) return;
          if (Math.hypot(strike.x - r.x, strike.z - r.z) <= 5.5) hitRod = r;
        });
        if (hitRod) {
          lightRod(hitRod.id);
          active.rodsHit.add(hitRod.id);
          mark("rod", { id: active.ep.id, rod: hitRod.id });
          const R = active.rescue;
          if (R && !R.precision && active.ep.rank && active.ep.pieces.some((q) => q.rod === hitRod.id) && ((R.def && R.def.rod === hitRod.id) || active.age - R.lastHelpAt < 1.5)) {
            R.precision = true;
            R.score += active.ep.rank.precision;
            showToast(`+${active.ep.rank.precision} grounded clean`);
            mark("precision", { id: active.ep.id, rod: hitRod.id, score: R.score });
            paintHud();
          }
        }
        tryGoalsFromSnap("bolt");
      }, 40);
    }
  });

  /* Seconds in a zone count only while the sky is right; the stalls and blades follow them. */
  function storyTick(dt) {
    const A = active;
    const W = window.weather || day.weather;
    const wx = W && W.now ? W.now() : null;
    const pos = playerPos();
    const zones = A.ep.zones || {};
    A.goals.forEach((g) => {
      if (g.done || g.failed || !afterMet(g, A)) return;
      if (g.kind === "stay" && pos && inZone(zones[g.zone], pos.x, pos.z) && !A.marketWet) {
        g.progress = Math.min(g.seconds, (g.progress || 0) + dt);
        A.stay = g.progress;
        if (g.progress >= g.seconds) completeGoal(g, "stay");
      }
      if (g.kind === "weather-time" && pos && inZone(zones[g.zone], pos.x, pos.z) && wx && (g.states || [g.state]).indexOf(wx.state) >= 0) {
        g.progress = Math.min(g.seconds, (g.progress || 0) + dt);
        if (g.progress >= g.seconds) completeGoal(g, "weather");
      }
      if (g.kind === "wind-time" && pos && inZone(zones[g.zone], pos.x, pos.z) && wx && wx.state === "wind" && A.age >= A.shutUntil) {
        g.progress = Math.min(g.seconds, (g.progress || 0) + dt);
        A.windSec = g.progress;
        if (g.progress >= g.seconds) completeGoal(g, "wind");
      }
    });
  }
  function animateStory(dt) {
    const A = active;
    // Part 1: stalls open as the market fills (a fifth of the way each), the ones scarred stay shut.
    const stay = A && A.goals ? A.goals.find((g) => g.kind === "stay") : null;
    if (stay && story.stalls.length) {
      const n = stay.done ? story.stalls.length : Math.floor((story.stalls.length * (stay.progress || 0)) / stay.seconds);
      story.stalls.forEach((st, i) => {
        if (!st.shut && !st.down && st.open !== i < n) setStall(st, i < n);
      });
    }
    story.stalls.forEach((st) => {
      if (st.down && Math.abs(st.tilt - st.tiltTo) > 0.01) {
        st.tilt += (st.tiltTo - st.tilt) * Math.min(1, dt * 5);
        st.node.rotation.z = st.tilt;
        st.node.position.y = Math.abs(Math.sin(st.tilt)) * 0.4;
      }
    });
    // Part 3: the gauge follows the goals (a third per charge, the rest from the rain) and eases to it.
    if (story.gauge) {
      const g = story.gauge;
      if (A && A.goals) {
        const frac = (id) => { const x = A.goals.find((q) => q.id === id); return x ? (x.done ? 1 : Math.min(1, (x.progress || 0) / (x.count || x.seconds || 1))) : 0; };
        g.to = 0.35 * frac("charge") + 0.65 * frac("fill");
      }
      g.level += (g.to - g.level) * Math.min(1, dt * 3);
      applyGauge();
      if (g.speaker) {
        const pulse = story.speakerOn ? 0.55 + 0.45 * Math.sin(performance.now() / 110) : 0.15;
        const c = g.speaker.emissiveColor;
        if (c) c.set(1 * pulse, 0.7 * pulse, 0.28 * pulse);
        if (g.glow && g.glow.emissiveColor) {
          const f = 0.9 + 0.1 * (g.flare ? Math.sin(performance.now() / 160) : 0);
          g.glow.emissiveColor.set(0.24 * f * (1 + g.flare), 0.8 * f * (1 + g.flare * 0.4), 1 * f);
        }
      }
    }
    // Part 2: blades turn with the wind on the roof; a shut turbine stands dead; a won one turns for good.
    if (story.turbines.length) {
      const W = window.weather || day.weather;
      const wx = W && W.now ? W.now() : null;
      const turned = story.turned;
      const shut = A && A.age < A.shutUntil;
      const blowing = !!(wx && wx.state === "wind") && !!A;
      const want = story.momentSpin ? 7 : shut ? 0 : turned ? 2.2 : blowing ? 6 : 0;
      story.turbines.forEach((t) => {
        t.w += (want - t.w) * Math.min(1, dt * 1.6);
        t.rotor.rotation.z -= t.w * dt;
      });
      story.spin = story.turbines[0].w;
    }
  }

  /* ---- world markers: every target of the goal he is on stands in the world as a soft beam, a ring and the verb's icon ---- */
  const MK = { nodes: new Map(), mat: null, tex: {}, last: [], t: 0 };
  const MK_BEAM_H = 46; // tall enough to read from 30 m and over the rooftops
  function markMat() {
    if (MK.mat) return MK.mat;
    const m = new B.StandardMaterial("ep-mark", world.scene);
    m.disableLighting = true;
    m.emissiveColor = new B.Color3(0.45, 0.85, 1);
    m.alpha = 0.22;
    m.backFaceCulling = false;
    m.fogEnabled = false;
    m.disableDepthWrite = true;
    return (MK.mat = m);
  }
  function iconMat(url) {
    if (MK.tex[url]) return MK.tex[url];
    const t = new B.Texture(url, world.scene);
    t.hasAlpha = true;
    const m = new B.StandardMaterial("ep-mark-ico", world.scene);
    m.disableLighting = true;
    m.emissiveTexture = t;
    m.opacityTexture = t;
    m.emissiveColor = new B.Color3(1, 1, 1);
    m.backFaceCulling = false;
    m.fogEnabled = false;
    return (MK.tex[url] = m);
  }
  /* Where each unmet, unlocked goal's targets are: zone rect centres, reach spots, the stranded in the current piece, the plaza for the show. */
  function goalTargets(run) {
    const out = [];
    const zones = run.ep.zones || {};
    const art = window.uiArt || (window.day && window.day.uiArt);
    run.goals.forEach((g) => {
      if (g.done || g.failed || !afterMet(g, run)) return;
      const verb = art && art.goalVerb ? art.goalVerb(g, run.ep.pieces) : g.power || null;
      const at = (key, x, z, r, y) => out.push({ key: g.id + ":" + key, goal: g.id, verb, x, z, r: Math.max(2.2, Math.min(12, r)), y: y || 0 });
      if (g.kind === "help" && run.rescue && run.rescue.def && run.rescue.def.id === g.piece) {
        run.rescue.people.forEach((p, i) => { if (!p.helped) at("p" + i, p.x, p.z, 2.4, p.y); });
      } else if (g.kind === "reach") {
        let x = g.x, z = g.z;
        if (g.spot) { const s = spotOf(g.spot); if (s) { x = s.x; z = s.z; } }
        if (x != null) at("reach", x, z, g.r != null ? g.r : 5);
      } else if (g.zone && zones[g.zone] && zones[g.zone].rect) {
        const r = zones[g.zone].rect;
        at("zone", (r[0] + r[2]) / 2, (r[1] + r[3]) / 2, Math.max(r[2] - r[0], r[3] - r[1]) / 2);
      } else if ((g.kind === "show-hits" || g.kind === "show-variety" || g.kind === "show-end") && zones.plaza && zones.plaza.rect) {
        const r = zones.plaza.rect;
        at("show", (r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 9);
      }
    });
    return out;
  }
  function dropMark(n) {
    ["ring", "beam", "icon"].forEach((k) => { try { n[k].dispose(); } catch (e) { /* gone */ } });
  }
  function markTick(dt) {
    if (!B || !world || !world.scene) return;
    const want = active && !momentOn() ? goalTargets(active) : [];
    MK.t += dt;
    const keys = new Set(want.map((w) => w.key));
    MK.nodes.forEach((n, k) => { if (!keys.has(k)) { dropMark(n); MK.nodes.delete(k); } });
    const A = abil();
    const pos = playerPos();
    const art = window.uiArt || (window.day && window.day.uiArt);
    MK.last = want.map((w) => {
      let n = MK.nodes.get(w.key);
      const y = Math.max(w.y || 0, world.surfaceAt ? world.surfaceAt(w.x, w.z) : 0);
      if (!n) {
        const mat = markMat();
        const ring = B.MeshBuilder.CreateTorus("ep-mark-ring", { diameter: 2, thickness: 0.08, tessellation: 40 }, world.scene);
        const beam = B.MeshBuilder.CreateCylinder("ep-mark-beam", { diameter: 1, height: MK_BEAM_H, tessellation: 14, subdivisions: 1 }, world.scene);
        const icon = B.MeshBuilder.CreatePlane("ep-mark-icon", { size: 3.4 }, world.scene);
        icon.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
        [ring, beam, icon].forEach((m) => { m.isPickable = false; m.alphaIndex = 20; });
        ring.material = beam.material = mat.clone("ep-mark-" + w.key);
        beam.material.alpha = 0.2;
        icon.material = null;
        n = { ring, beam, icon, ico: null };
        MK.nodes.set(w.key, n);
      }
      const url = w.verb && art && art.verbIcon ? art.verbIcon(w.verb, true) : null;
      if (url && n.ico !== url) { try { n.icon.material = iconMat(url); n.ico = url; } catch (e) { /* no icon */ } }
      n.icon.setEnabled(!!(url && n.icon.material));
      const ab = w.verb && A && A.get ? A.get(w.verb === "sun" ? "sunbreak" : w.verb) : null;
      const ready = !ab || (ab.ready !== false && !ab.locked);
      const k = ready ? 0.5 + 0.5 * Math.sin(MK.t * 6) : 0;
      const sc = w.r * (1 + 0.1 * k);
      n.ring.position.set(w.x, y + 0.08, w.z);
      n.ring.scaling.set(sc / 1, 1, sc / 1);
      n.ring.rotation.x = 0;
      n.beam.position.set(w.x, y + MK_BEAM_H / 2, w.z);
      n.beam.scaling.set(Math.min(w.r, 3) * 0.9, 1, Math.min(w.r, 3) * 0.9);
      n.beam.material.alpha = ready ? 0.2 + 0.2 * k : 0.14;
      n.ring.material.alpha = ready ? 0.55 + 0.4 * k : 0.35;
      n.icon.position.set(w.x, y + 11 + 0.4 * Math.sin(MK.t * 2 + w.x), w.z);
      n.icon.scaling.setAll(ready ? 1 + 0.15 * k : 0.9);
      return { goal: w.goal, verb: w.verb, x: w.x, z: w.z, y, radius: w.r, height: MK_BEAM_H, iconY: 11, ready, pulse: +k.toFixed(2), dist: pos ? +Math.hypot(pos.x - w.x, pos.z - w.z).toFixed(1) : null };
    });
  }

  /* ---- the results ceremony: dim and blur the city, count the stats up one by one with ticks, slam the rank stamp (thud,
     camera shake), and Small Weather says the grade. Numbers in `episodes.scoring.ceremony`, lines in `scoring.grade`. ---- */
  const CER = Object.assign({ dim: 0.72, blurPx: 8, rowGap: 0.42, rowSecs: 0.36, stampAt: 0.5, shake: 0.02, bestScale: 0.42 }, scoring.ceremony || {});
  const gradeLines = scoring.grade || {};
  const lastGrade = {};
  let cer = null; // { rows, stamped, rank, timers, count }
  function cerClear() {
    if (cer) cer.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    cer = null;
    scoreEl.classList.remove("ceremony", "stamped");
    scoreRank.classList.remove("slam");
  }
  function primaryButton() {
    return [scoreNext, scoreReplay, scoreOk].find((b) => !b.hidden && !b.disabled) || scoreOk;
  }
  function cerRow(li, i) {
    li.classList.remove("pend");
    li.classList.add("tick");
    setTimeout(() => li.classList.remove("tick"), 220);
    const em = li.querySelector("em");
    const bar = li.querySelector("b");
    const [pts, max] = String(em.dataset.final || em.textContent).split("/").map(Number);
    bar.style.width = li.dataset.fill;
    cer.shown++;
    emit("stat-tick", { row: li.dataset.part, index: i, points: pts });
    const t0 = performance.now();
    const iv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (CER.rowSecs * 1000));
      em.textContent = `${Math.round(pts * k)}/${max}`;
      if (k >= 1) clearInterval(iv);
    }, 40);
    cer.timers.push(iv);
  }
  function cerSlam() {
    if (!cer || cer.stamped) return;
    cer.stamped = true;
    const rank = cer.rank;
    scoreEl.classList.add("stamped");
    scoreRank.classList.add("slam");
    emit("stamp", { rank, id: cer.id, thud: true, stats: cer.shown });
    try { if (day.powers && day.powers.kick) day.powers.kick(CER.shake); if (day.powers && day.powers.hitstop) day.powers.hitstop(0.05); } catch (e) { /* no powers */ }
    const pool = gradeLines[rank] || [];
    if (pool.length) {
      const pick = pool.filter((t) => t !== lastGrade[rank]);
      const text = (pick.length ? pick : pool)[Math.floor(Math.random() * (pick.length || pool.length))];
      lastGrade[rank] = text;
      scoreGrade.hidden = false;
      scoreGrade.textContent = `“${text}”`;
      cer.line = text;
      storyEvent("say", { who: "He", text, grade: rank });
      emit("grade-line", { rank, text, id: cer.id });
    }
    if (cer.best) {
      scoreBestStamp.hidden = false;
      const art = window.uiArt || (window.day && window.day.uiArt);
      scoreBestStamp.innerHTML = `<small>${L.best}</small>` + (art && art.rankStamp ? `<img alt="${cer.best}" src="${art.rankStamp(cer.best)}">` : `<b>${cer.best}</b>`);
    }
    const btn = primaryButton();
    btn.classList.add("primary");
    try { btn.focus({ preventScroll: true }); } catch (e) { /* hidden */ }
  }
  function cerSkip() {
    if (!cer || cer.stamped) return;
    cer.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    [...scoreBreak.children].forEach((li, i) => {
      if (li.classList.contains("pend")) { li.classList.remove("pend"); cer.shown++; emit("stat-tick", { row: li.dataset.part, index: i, skipped: true }); }
      const em = li.querySelector("em");
      em.textContent = em.dataset.final;
      li.querySelector("b").style.width = li.dataset.fill;
    });
    cerSlam();
  }
  function startCeremony(card, id, bestRank) {
    cerClear();
    const lis = [...scoreBreak.children];
    lis.forEach((li) => {
      const bar = li.querySelector("b");
      const em = li.querySelector("em");
      li.dataset.fill = bar.style.width;
      em.dataset.final = em.textContent;
      bar.style.width = "0%";
      em.textContent = `0/${em.textContent.split("/")[1]}`;
      li.classList.add("pend");
    });
    scoreGrade.hidden = true;
    scoreBestStamp.hidden = true;
    scoreEl.style.setProperty("--cer-dim", String(CER.dim));
    scoreEl.style.setProperty("--cer-blur", CER.blurPx + "px");
    scoreEl.classList.add("ceremony");
    cer = { rank: card.rank || "C", id, best: bestRank || null, shown: 0, stamped: false, timers: [], line: null };
    lis.forEach((li, i) => cer.timers.push(setTimeout(() => cerRow(li, i), (0.25 + i * CER.rowGap) * 1000)));
    cer.timers.push(setTimeout(cerSlam, (0.25 + lis.length * CER.rowGap + CER.stampAt) * 1000));
    // the buttons are usable from the first frame; Enter or a tap on the card skips to the stamp, then Enter presses the focused one
    try { primaryButton().focus({ preventScroll: true }); } catch (e) { /* hidden */ }
  }
  document.addEventListener("keydown", (e) => {
    if (scoreEl.hidden || (e.key !== "Enter" && e.key !== " ")) return;
    if (cer && !cer.stamped) { e.preventDefault(); e.stopPropagation(); cerSkip(); return; }
    const f = document.activeElement;
    if (e.key === "Enter" && !(f && scoreEl.contains(f) && f.tagName === "BUTTON")) { e.preventDefault(); e.stopPropagation(); primaryButton().click(); }
  }, true);
  scoreEl.addEventListener("pointerdown", (e) => { if (cer && !cer.stamped && !e.target.closest("button")) cerSkip(); });

  /* ---- tick (through world.update wrap) ---- */
  let lastWall = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.5, (now - lastWall) / 1000);
    lastWall = now;
    if (sayLeft > 0) {
      sayLeft -= dt;
      if (sayLeft <= 0) nextSay();
    }
    animateStory(dt);
    try { markTick(dt); } catch (err) { console.error("[episodes] marks", err); }
    if (closeAuto > 0) {
      closeAuto -= dt;
      if (closeAuto <= 0 && !scoreEl.hidden && pendingClosing) hideScore();
    }
    if (stage) {
      const W = window.weather || day.weather;
      const fg = W && W.now ? W.now().fog : 0;
      stage.update(dt, Math.max(0, Math.min(1, (fg - 0.01) / 0.03)));
    }
    if (!active) return;
    if (momentOn()) {
      // a turning-point moment is playing: the episode's clock waits (the set pieces keep moving)
      if (active.rescue) rescueTick(dt);
      return;
    }
    active.age += dt;
    if (active.show) showTick(dt);
    if (!active) return;
    if (active.ep.strain) storyTick(dt);
    if (active.rescue) rescueTick(dt);
    if (active.ep.timer && !active.show) {
      active.left -= dt;
      if (active.left <= 0) {
        active.left = 0;
        finish("time");
        return;
      }
    }
    if (active.ep.cue) {
      const every = active.ep.cue.every || 4;
      const win = active.ep.cue.window || 1.5;
      active.cueAge += dt;
      const phase = active.cueAge % every;
      const on = phase < win;
      if (on !== active.cueOn) {
        active.cueOn = on;
        paintHud();
      }
    }
    tryGoalsFromSnap();
    if (active && active.ep.timer) paintHud();
  }

  if (world && world.update) {
    const prev = world.update.bind(world);
    world.update = function (fr, dt, opts) {
      prev(fr, dt, opts);
      try {
        tick();
      } catch (err) {
        console.error("[episodes]", err);
      }
    };
  } else {
    const loop = () => {
      try {
        tick();
      } catch (err) {
        console.error("[episodes]", err);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  const api = {
    list: () => list.slice(),
    progress: () => progressOf(list, loadBest(storageKey)),
    now: () =>
      active
        ? {
            id: active.ep.id,
            title: active.ep.title,
            challenge: !!active.ep.challengeOn,
            left: active.left,
            goals: active.goals.map((g) => ({ id: g.id, done: g.done, progress: g.progress, label: g.label })),
            rods: [...active.rodsHit],
            bolts: active.bolts,
            timed: active.timed,
            debris: active.debris,
            cue: active.cueOn,
            unlocked: (active.unlocked || []).slice(),
            rescue: active.rescue
              ? { score: active.rescue.score, helped: active.rescue.helped, total: active.rescue.total, piece: active.rescue.def ? active.rescue.def.id : null, twisted: active.rescue.twisted, late: active.rescue.late, hurt: active.rescue.hurt, precision: active.rescue.precision, rank: liveScore(active).rank, people: active.rescue.people.map((p) => ({ id: p.id, x: p.x, z: p.z, helped: p.helped })) }
              : null,
            prompt: active.ep.tutorial && currentTutorialGoal(active) ? currentTutorialGoal(active).prompt : null,
          }
        : null,
    show: () => {
      if (!active || !active.show) return null;
      const S = active.show;
      const nx = S.cues.find((c) => c.state === "wait");
      return {
        started: S.started, t: S.t, over: S.over, hits: S.hits, perfect: S.perfect, off: S.off, chain: S.chain, best: S.best, used: [...S.used],
        farewell: !!S.farewell, roofsSaid: S.roofsSaid || 0,
        roofs: (S.roofs || []).map((r) => ({ id: r.id, who: r.who, x: r.x, z: r.z, at: r.at, said: !!r.said, text: r.text })),
        next: nx ? { power: nx.power, at: nx.at, in: nx.at - S.t } : null,
        cues: S.cues.map((c) => ({ at: c.at, power: c.power, state: c.state, grade: c.grade })),
        judge: S.judge, stage: stage ? stage.info() : null,
      };
    },
    stage: () => (stage ? stage.info() : null),
    marks: () => MK.last.slice(),
    ceremony: () => ({ on: !!cer, stamped: !!(cer && cer.stamped), stats: cer ? cer.shown : 0, rank: cer ? cer.rank : null, line: cer ? cer.line : null, rows: scoreBreak.children.length, shown: !scoreEl.hidden, buttons: [scoreNext, scoreReplay].filter((b) => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return { name: b.className, h: Math.round(r.height), w: Math.round(r.width), bottom: Math.round(r.bottom) }; }), focus: (document.activeElement && document.activeElement.className) || "", panel: (() => { const r = (scoreEl.querySelector(".ep-panel") || scoreEl).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), vw: window.innerWidth, vh: window.innerHeight }; })() }),
    gradeLines: () => JSON.parse(JSON.stringify(gradeLines)),
    closing: () => ({ shown: !closeEl.hidden, rank: closeEl.dataset.rank || null, ending: closeEl.dataset.ending || null, pending: !!pendingClosing, fared: [...closeEl.querySelectorAll(".fared li")].map((li) => li.dataset.need + ":" + li.className), neighbors: [...closeEl.querySelectorAll(".neighbors li")].map((li) => li.dataset.neighbor) }),
    credits: () => ({
      shown: !creditsEl.hidden,
      pending: !!creditsOn,
      secs: creditsOn ? creditsOn.secs : ((lastFinale && lastFinale.credits && lastFinale.credits.secs) || 0),
      cast: [...creditsEl.querySelectorAll(".cast b")].map((b) => b.textContent),
      fontPx: (() => { const b = creditsEl.querySelector(".cast b"); return b ? parseFloat(getComputedStyle(b).fontSize) || 0 : 0; })(),
    }),
    postCredits: () => ({
      shown: !postEl.hidden,
      pending: !!postOn,
      line: (postEl.querySelector(".ask") || {}).textContent || (postOn && postOn.line) || "",
      ask: postOn && postOn.ask ? postOn.ask.id : null,
      fontPx: (() => { const p = postEl.querySelector(".ask"); return p ? parseFloat(getComputedStyle(p).fontSize) || 0 : 0; })(),
    }),
    roofs: () => {
      const people = (day.neighbors && day.neighbors.now && day.neighbors.now().people) || [];
      const want = (lastFinale && lastFinale.roofs) || [];
      return want.map((r) => {
        const p = people.find((q) => q.id === r.id);
        const near = p ? Math.hypot(p.x - r.x, p.z - r.z) < 3.5 : false;
        return { id: r.id, who: r.who, wantX: r.x, wantZ: r.z, x: p ? p.x : null, z: p ? p.z : null, text: r.text, onRoof: near };
      });
    },
    offer: () => (offerEp ? { id: offerEp.id, title: offerEp.title } : null),
    best: () => loadBest(storageKey),
    lock: (id) => episodeLock(list, loadBest(storageKey), id),
    challenge: (id) => challengeOpen(loadBest(storageKey), id),
    score: () => (active && !active.ep.tutorial ? liveScore(active) : null),
    tutorial: () => ({ done: tutorialDone(), key: tutKey }),
    skip: () => (active && active.ep.tutorial ? finish("skip") : null),
    start: (id, via, opts) => {
      const ep = list.find((e) => e.id === id);
      if (ep && opts && opts.challenge && !challengeOpen(loadBest(storageKey), id)) return false; // locked until cleared
      return ep ? start(ep, via || "api", opts) : false;
    },
    end: (why) => (active ? finish(why || "api") : null),
    match: (chapter, minutes, opt) => matchEpisode(list, chapter, minutes, opt),
    log: () => log.slice(),
    said: () => said.slice(),
    story: () =>
      active && active.ep.strain
        ? {
            id: active.ep.id,
            strain: active.strain,
            budget: active.ep.strain.budget,
            over: active.over,
            kicks: active.kicks.slice(),
            toppled: active.toppled,
            stay: active.stay,
            windSec: active.windSec,
            marketWet: active.marketWet,
            stalls: story.stalls.map((x) => (x.down ? "down" : x.open ? "open" : x.shut ? "shut" : "closed")),
            turbine: story.spin,
            carry: active.carry,
            gauge: story.gauge ? story.gauge.level : null,
          }
        : null,
    menu: showMenu,
    arc: () => loadArc(),
    ending: () => {
      const a = loadArc();
      const sceneOn = !!(day.moments && day.moments.playing && day.moments.playing() && /^ending-/.test((day.moments.now() || {}).turning || ""));
      const stamp = typeof document !== "undefined" && document.getElementById("ending-stamp");
      return a.ending ? {
        id: a.ending.id,
        name: (END[a.ending.id] || {}).name,
        tank: a.ending.tank,
        shown: sceneOn || !!(stamp && !stamp.hidden),
        card: !endEl.hidden,
        fared: cityFared(a, END.fared),
      } : null;
    },
    showEnding: (id, opts) => showEnding(id || (loadArc().ending || {}).id, opts),
    /** Spin the annex turbines for a staged ending beat (0..1 of full). */
    spinTurbines: (k) => {
      const want = Math.max(0, Math.min(1, +k || 0)) * 6;
      story.turbines.forEach((t) => { t.w = want; t.still = want < 0.4; });
      story.spin = want;
      story.momentSpin = want > 0.5;
      return story.spin;
    },
    /** Make sure Part 2's turbines exist (Heavy Weather ending may run after Part 3 cleared them). */
    ensureTurbines: () => {
      if (story.turbines.length) return story.turbines.length;
      const ep2 = list.find((e) => e.id === "still-blades");
      if (ep2 && ep2.turbines) spawnTurbines(ep2.turbines);
      return story.turbines.length;
    },
    /** Drop a flood patch on the avenue (Overcast ending). */
    floodAvenue: () => patch("flood", 66, 12.6, 4.5, "#3a6a8a", 0.55),
    resetArc: () => saveBest(arcKey, { parts: {} }),
    chapterSeen: () => chaptersSeen(),
    resetChapters: () => { try { localStorage.removeItem(CH_KEY); } catch (e) { /* none */ } },
    chapterOf,
  };
  day.episodes = api;
  window.episodes = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) install();
