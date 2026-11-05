/* ==========================================================================
   Episodes — playable weather missions on chapters of Small Weather's day.
   Data: day.config.js `episodes`. Offer on take control, or pick from the
   Episodes menu (jumps the clock). Goals track weather, powers, rods, reach,
   debris and timed bolts; a forecast-style score card lands in localStorage.
   ========================================================================== */

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

/** Record a run if it beats the stored best for that episode id. */
export function recordBest(key, id, card, store) {
  const best = loadBest(key, store);
  const prev = best[id];
  if (!prev || (card.pct | 0) > (prev.pct | 0)) {
    best[id] = { pct: card.pct, word: card.word, text: card.text, scarred: !!card.scarred, when: Date.now() };
    saveBest(key, best, store);
    return { best, improved: true };
  }
  return { best, improved: false };
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
.ep-btn{position:fixed;z-index:7;left:18px;bottom:118px;appearance:none;border:1px solid rgba(246,241,232,.22);background:rgba(14,16,22,.62);color:#f6f1e8;border-radius:14px;padding:10px 16px;font:600 0.84rem Outfit,system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(12px)}
.ep-btn:hover{background:rgba(240,194,122,.16)}
.preview-public .ep-btn{bottom:78px}
@media (max-width:700px){.ep-btn{left:auto;right:max(12px,env(safe-area-inset-right));top:calc(max(12px,env(safe-area-inset-top)) + 150px);bottom:auto;transform:none;display:inline-flex;align-items:center;justify-content:center;height:44px;min-height:44px;min-width:44px;padding:0 14px;border-radius:999px;font-size:0.78rem;white-space:nowrap}.preview-public .ep-btn{top:calc(max(12px,env(safe-area-inset-top)) + 50px);bottom:auto}.in-control .ep-btn{left:50%;right:auto;top:auto;bottom:max(8px,env(safe-area-inset-bottom));transform:translateX(-50%)}}
html.touch-ui .ep-btn{left:auto;right:max(12px,env(safe-area-inset-right));top:calc(max(12px,env(safe-area-inset-top)) + 150px);bottom:auto;transform:none;display:inline-flex;align-items:center;justify-content:center;height:44px;min-height:44px;min-width:44px;padding:0 14px;border-radius:999px;font-size:0.78rem;white-space:nowrap}
html.touch-ui.preview-public .ep-btn{top:calc(max(12px,env(safe-area-inset-top)) + 50px);bottom:auto}
html.touch-ui.in-control .ep-btn{left:50%;right:auto;top:auto;bottom:max(8px,env(safe-area-inset-bottom));transform:translateX(-50%)}
.ep-hud{position:fixed;z-index:7;right:18px;top:88px;width:min(280px,calc(100vw - 36px));pointer-events:none;font:600 0.78rem/1.35 Outfit,system-ui,sans-serif;color:#e7eef8}
.ep-hud[hidden]{display:none}
.ep-hud .ep-card{pointer-events:auto;background:rgba(10,14,22,.72);border:1px solid rgba(126,200,255,.35);border-radius:16px;padding:12px 14px;backdrop-filter:blur(14px)}
.ep-hud h3{margin:0 0 4px;font-size:0.95rem;letter-spacing:.02em}
.ep-hud .tag{margin:0 0 8px;color:rgba(231,238,248,.7);font-weight:500}
.ep-hud ul{margin:0;padding:0;list-style:none}
.ep-hud li{display:flex;gap:8px;align-items:flex-start;margin:4px 0;color:rgba(231,238,248,.88)}
.ep-hud li.done{color:#8dceb0;text-decoration:line-through}
.ep-hud li i{flex:0 0 14px;font-style:normal}
.ep-hud .timer{margin-top:8px;font-variant-numeric:tabular-nums;color:#9fd4ff}
.ep-hud .cue{margin-top:6px;color:#f0c27a}
.ep-hud .prompt{margin:8px 0 0;color:#f0c27a}
.ep-hud .skip{margin-top:8px;appearance:none;min-height:36px;padding:6px 14px;border-radius:999px;border:1px solid rgba(246,241,232,.28);background:transparent;color:#f0c27a;font:600 0.8rem Outfit,system-ui,sans-serif;cursor:pointer}
.ep-hud .skip:hover{background:rgba(240,194,122,.14)}
.ep-hud li.failed{color:#e58a7a;text-decoration:line-through}
.ep-hud .strain{margin-top:8px;color:#9fd4ff}
.ep-hud .strain.over{color:#e58a7a}
.ep-hud .strain i{display:block;height:5px;margin-top:3px;border-radius:3px;background:rgba(159,212,255,.18);overflow:hidden}
.ep-hud .strain b{display:block;height:100%;background:#9fd4ff;border-radius:3px}
.ep-hud .strain.over b{background:#e58a7a}
.ep-say{position:fixed;z-index:22;left:50%;bottom:max(96px,calc(env(safe-area-inset-bottom) + 88px));transform:translate(-50%,8px);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;max-width:min(520px,calc(100vw - 28px));padding:10px 16px;border-radius:14px;background:#f6f1e8;color:#1a1c22;font:600 0.9rem/1.35 Outfit,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)}
.ep-say.on{opacity:1;transform:translate(-50%,0)}
.ep-say b{display:block;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#7a5a1a;margin-bottom:2px}
.ep-panel .strainline{font-size:.9rem;color:#9fd4ff;margin:0 0 10px}
.ep-score.scarred .forecast,.ep-score.scarred .strainline{color:#e58a7a}
.ep-toast{position:fixed;z-index:9;left:50%;top:max(64px,calc(env(safe-area-inset-top) + 56px));transform:translate(-50%,-8px);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;padding:10px 18px;border-radius:999px;background:rgba(14,16,22,.9);border:1px solid #f0c27a;color:#f6f1e8;font:600 0.95rem Outfit,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);white-space:nowrap;max-width:calc(100vw - 24px)}
.ep-toast.on{opacity:1;transform:translate(-50%,0)}
.ep-offer,.ep-score,.ep-menu,.ep-ending{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,.55);padding:18px}
.ep-offer[hidden],.ep-score[hidden],.ep-menu[hidden],.ep-ending[hidden]{display:none}
.ep-panel{width:min(420px,100%);background:rgba(14,16,22,.92);border:1px solid rgba(246,241,232,.18);border-radius:20px;padding:22px 22px 18px;color:#f6f1e8;font:500 0.95rem/1.4 Outfit,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.ep-panel h2{margin:0 0 6px;font-size:1.25rem}
.ep-panel p{margin:0 0 14px;color:rgba(246,241,232,.72)}
.ep-panel .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.ep-panel button{appearance:none;border:1px solid rgba(246,241,232,.22);background:rgba(246,241,232,.08);color:#f6f1e8;border-radius:12px;padding:10px 16px;font:600 0.88rem Outfit,system-ui,sans-serif;cursor:pointer}
.ep-panel button.primary{background:#f0c27a;color:#1a1c22;border-color:transparent}
.ep-panel .forecast{font-size:1.15rem;font-weight:700;color:#9fd4ff;margin:8px 0 4px}
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
  hud.innerHTML = `<div class="ep-card"><h3></h3><p class="tag"></p><ul></ul><div class="timer" hidden></div><div class="strain" hidden></div><div class="cue" hidden></div><p class="prompt" hidden></p><button type="button" class="skip" hidden>Skip</button></div>`;

  const offer = document.createElement("div");
  offer.id = "episode-offer";
  offer.className = "ep-offer";
  offer.hidden = true;
  offer.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><h2></h2><p class="tagline"></p><p class="hint"></p><div class="actions"><button type="button" class="primary accept"></button><button type="button" class="decline"></button></div></div>`;

  const scoreEl = document.createElement("div");
  scoreEl.id = "episode-score";
  scoreEl.className = "ep-score";
  scoreEl.hidden = true;
  scoreEl.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><h2></h2><p class="forecast"></p><p class="detail"></p><p class="strainline" hidden></p><p class="bestline"></p><div class="actions"><button type="button" class="primary ok">OK</button></div></div>`;

  const endEl = document.createElement("div");
  endEl.id = "ending-card";
  endEl.className = "ep-ending";
  endEl.hidden = true;
  endEl.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><p class="kicker"></p><h2></h2><p class="scene"></p><ul class="fared"></ul><p class="lastline"></p><p class="tally"></p><div class="actions"><button type="button" class="primary again"></button></div></div>`;

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

  document.body.append(menuBtn, hud, offer, scoreEl, endEl, menu, toast, say);

  const hudTitle = hud.querySelector("h3");
  const hudTag = hud.querySelector(".tag");
  const hudList = hud.querySelector("ul");
  const hudTimer = hud.querySelector(".timer");
  const hudCue = hud.querySelector(".cue");
  const hudStrain = hud.querySelector(".strain");
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
  const scoreOk = scoreEl.querySelector(".ok");
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
  const props = { rods: [], debris: [], mats: null };
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
      node.position.set(x, 0, z);
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
    root.position.set(cfgG.x, 0, cfgG.z);
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
    story.gauge = { root, fill, H, level: 0, to: 0, glow: fill.material };
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
  function spawnDebris() {
    if (!B || !world || !world.scene) return;
    const mats = ensureMats();
    const street = cfgRoot.street || { z: 12.6, from: -48, to: 210 };
    const zs = street.z || 12.6;
    for (let i = 0; i < 8; i++) {
      const x = 20 + i * 14 + (i % 2) * 3;
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

  function paintHud() {
    if (!active) {
      hud.hidden = true;
      return;
    }
    hud.hidden = false;
    hudTitle.textContent = active.ep.title;
    hudTag.textContent = active.ep.tagline || "";
    hudList.innerHTML = "";
    active.goals.forEach((g) => {
      const li = document.createElement("li");
      if (g.done) li.className = "done";
      else if (g.failed) li.className = "failed";
      const markEl = document.createElement("i");
      markEl.textContent = g.done ? "✓" : g.failed ? "✗" : "·";
      const label = document.createElement("span");
      let text = g.label || g.id;
      if ((g.kind === "ability-in" && g.count > 1) || g.kind === "rods" || g.kind === "bolts" || g.kind === "timed-bolts" || g.kind === "debris") {
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
    if (active.ep.timer) {
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
    const cur = active.ep.tutorial ? currentTutorialGoal(active) : null;
    hudPrompt.hidden = !cur;
    hudPrompt.textContent = cur ? cur.prompt || "" : "";
    hudSkip.hidden = !active.ep.tutorial;
    if (active.ep.cue) {
      hudCue.hidden = false;
      hudCue.textContent = active.cueOn ? "Now — strike!" : "Wait for the cue…";
    } else hudCue.hidden = true;
  }
  function completeGoal(g, via) {
    if (!active || g.done || !afterMet(g, active)) return false;
    g.done = true;
    g.progress = Math.max(g.progress | 0, g.count | 0);
    if (day.note) day.note((g.label || g.id) + ".");
    mark("goal", { id: active.ep.id, goal: g.id, via: via || "play" });
    const tt = active.ep.toasts && active.ep.toasts["goal:" + g.id];
    if (tt) showToast(tt);
    sayKey("goal:" + g.id);
    if (g.kind === "wind-time") story.turned = true;
    if (active.ep.tutorial) {
      const next = currentTutorialGoal(active);
      if (next) unlockAbility(next.power, active);
    }
    paintHud();
    if (allDone(active)) finish("clear");
    else if (active.ep.strain && settled(active)) finish("scarred");
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
    lines.forEach(([who, text]) => sayQueue.push({ who, text, key, ep: e.id }));
    if (sayLeft <= 0) nextSay();
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

  /* ---- start / finish ---- */
  function showOffer(ep) {
    offerEp = ep;
    offerTitle.textContent = ep.title;
    offerTag.textContent = ep.tagline || "";
    offerHint.textContent = ep.tutorial ? "New here? Learn the five weather abilities, one at a time." : L.offer;
    offer.hidden = false;
    mark("offer", { id: ep.id });
  }
  function hideOffer() {
    offer.hidden = true;
    offerEp = null;
  }
  function start(ep, via) {
    if (!ep) return false;
    hideOffer();
    hideMenu();
    if (active) endQuiet();
    const C = day.control;
    if (C && C.mode && C.mode() === "schedule") {
      if (day.jump && ep.clock) day.jump(ep.clock);
      // Wait a beat for the frame, then take control if needed.
      setTimeout(() => {
        if (C.mode() === "schedule") C.take();
      }, 80);
    }
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
    };
    active.unlocked = [];
    Object.assign(active, { strain: 0, over: false, edgy: false, lastCall: {}, calls: {}, kicks: [], marketWet: false, toppled: 0, windSec: 0, stay: 0, shutUntil: 0, age: 0 });
    if (ep.id === "dry-park") saveBest(arcKey, { parts: {} }); // Part 1 starts the arc over
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
    if (ep.debris) spawnDebris();
    if (ep.market) spawnStalls(!!ep.market.open);
    if (ep.turbines) spawnTurbines(ep.turbines);
    if (ep.gauge) spawnGauge(ep.gauge);
    sayQueue = [];
    sayLeft = 0;
    sayKey("start", ep);
    if (ep.lines && ep.lines.start && day.note) day.note(ep.lines.start);
    paintHud();
    mark("start", { id: ep.id, via: via || "play", title: ep.title });
    return true;
  }
  function endQuiet() {
    if (active && active.ep.tutorial) openAllAbilities();
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
    const rec = recordBest(storageKey, run.ep.id, card);
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
    if (run.ep.part && (why === "clear" || why === "scarred" || why === "time")) {
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
        pendingEnding = id;
      }
      saveBest(arcKey, arc);
      mark("arc", { id: run.ep.id, part: run.ep.part, scarred: !!card.scarred, strain: run.strain });
    }
    if (card.scarred && run.strain > run.ep.strain.budget) scars.push(`strain ${run.strain} over ${run.ep.strain.budget}`);
    if (run.ep.strain && (why === "clear" || why === "scarred")) sayKey(card.scarred ? "end:scarred" : "end:clean", run.ep);
    if (day.note) {
      if ((why === "clear" || why === "scarred") && run.ep.lines && (card.scarred ? run.ep.lines.scarred : run.ep.lines.done)) day.note(card.scarred ? run.ep.lines.scarred : run.ep.lines.done);
      else if (why === "clear" && run.ep.lines && run.ep.lines.done) day.note(run.ep.lines.done);
      else if (why === "time") day.note(L.timeUp);
      else if (why === "let-go") day.note(L.letGo);
      day.note(card.text);
    }
    scoreTitle.textContent = L.scoreTitle;
    scoreForecast.textContent = card.text;
    scoreDetail.textContent = `${card.done} of ${card.total} goals` + (why === "time" ? " · time up" : why === "let-go" ? " · let go" : "");
    scoreEl.classList.toggle("scarred", !!card.scarred);
    if (storyMeta) {
      const sl = (cfg.strain && cfg.strain.lines) || {};
      scoreStrain.hidden = false;
      scoreStrain.textContent = `${sl.meter || "Sky"} ${run.strain} ${sl.of || "of"} ${run.ep.strain.budget}` + (run.carry ? ` (${run.carry} carried from earlier)` : "") + ` · ${card.scarred ? sl.scarred || "Scarred" : sl.clean || "Clean"}` + (scars.length ? `: ${scars.join("; ")}` : "");
    } else scoreStrain.hidden = true;
    const b = rec.best[run.ep.id];
    scoreBest.textContent = b ? `${L.best}: ${b.pct}% chance of ${b.word}` : "";
    scoreEl.hidden = false;
    mark("score", { id: run.ep.id, pct: card.pct, word: card.word, text: card.text, why, improved: rec.improved, scarred: card.scarred, strain: run.strain, kicks: run.kicks.slice(), scars });
    endQuiet();
    return card;
  }
  let pendingEnding = null;
  /* The ending card: which of the three endings, how each need came out, his last line, the Sky total. */
  function showEnding(id) {
    const e = END[id];
    if (!e) return null;
    const arc = loadArc();
    const fared = cityFared(arc, END.fared);
    const L2 = END.lines || {};
    endKicker.textContent = L2.kicker || "How the district fared";
    endTitle.textContent = e.name;
    endScene.textContent = e.scene;
    endFared.innerHTML = "";
    fared.forEach((f) => {
      const li = document.createElement("li");
      li.className = f.state;
      const b = document.createElement("b");
      b.textContent = (END.needs && END.needs[f.need]) || f.need;
      li.append(b, document.createTextNode(f.text));
      li.dataset.need = f.need;
      endFared.appendChild(li);
    });
    endLast.innerHTML = "";
    const who = document.createElement("i");
    who.textContent = e.last[0];
    endLast.append(who, document.createTextNode(e.last[1]));
    const tank = (arc.ending && arc.ending.tank) || 0;
    endTally.textContent = `${L2.tally || "Sky at the Tank"}: ${tank}`;
    endAgain.textContent = L2.again || "Walk the city";
    endEl.dataset.ending = id;
    endEl.hidden = false;
    if (day.note) day.note(`${e.name}. ${e.last[0]}: ${e.last[1]}`);
    mark("ending", { id: "ending", ending: id, name: e.name, tank, fared: fared.map((f) => f.need + ":" + f.state).join(",") });
    storyEvent("ending", { ending: id, name: e.name, tank, fared: fared.map((f) => ({ need: f.need, state: f.state })) });
    return { id, name: e.name, fared };
  }
  function hideScore() {
    scoreEl.hidden = true;
    if (pendingEnding) {
      const id = pendingEnding;
      pendingEnding = null;
      showEnding(id);
    }
  }

  function hideMenu() {
    menu.hidden = true;
  }
  function showMenu() {
    const best = loadBest(storageKey);
    menuList.innerHTML = "";
    list.forEach((ep) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ep-row";
      const b = best[ep.id];
      btn.innerHTML = `<strong>${ep.title}</strong><small>${ep.tagline || ""}${b ? ` · ${L.best} ${b.pct}%` : ""}</small>`;
      btn.addEventListener("click", () => {
        hideMenu();
        if (day.jump && ep.clock) day.jump(ep.clock);
        const C = day.control;
        const go = () => {
          if (C && C.mode && C.mode() === "schedule") C.take();
          start(ep, "menu");
        };
        setTimeout(go, 120);
      });
      menuList.appendChild(btn);
    });
    menu.hidden = false;
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
      // The first-visit card is the only prompt until it is skipped or finished.
      if (window.day.tutorial && window.day.tutorial.blocking && window.day.tutorial.blocking()) return;
      if (active || !offer.hidden) return;
      const fr = day.now && day.now().frame;
      const chapter = (fr && (fr.chapter || (fr.action && fr.action.chapter))) || "";
      const minutes = (day.now && day.now().minutes) || 0;
      const inCar = !!(fr && fr.person && fr.person.inCar);
      const tut = list.find((e) => e.tutorial);
      if (tut && !botQuiet && !tutorialDone()) {
        showOffer(tut);
        return;
      }
      const ep = matchEpisode(list, chapter, minutes, { inCar, arc: loadArc() });
      if (ep) showOffer(ep);
    } else if (action === "let-go") {
      lastControl = "returning";
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

  window.addEventListener("day:power", (e) => {
    if (!active) return;
    const d = (e && e.detail) || {};
    const power = d.power || d.action;
    if (active.ep.tutorial) {
      // A used ability ("denied" and the world's thunder echo don't count).
      if (d.action !== power || d.action === "denied") return;
      const cur = currentTutorialGoal(active);
      if (cur && cur.power === power) completeGoal(cur, d.via || "key");
      return;
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
    }
    // Part 2: blades turn with the wind on the roof; a shut turbine stands dead; a won one turns for good.
    if (story.turbines.length) {
      const W = window.weather || day.weather;
      const wx = W && W.now ? W.now() : null;
      const turned = story.turned;
      const shut = A && A.age < A.shutUntil;
      const blowing = !!(wx && wx.state === "wind") && !!A;
      const want = shut ? 0 : turned ? 2.2 : blowing ? 6 : 0;
      story.turbines.forEach((t) => {
        t.w += (want - t.w) * Math.min(1, dt * 1.6);
        t.rotor.rotation.z -= t.w * dt;
      });
      story.spin = story.turbines[0].w;
    }
  }

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
    if (!active) return;
    active.age += dt;
    if (active.ep.strain) storyTick(dt);
    if (active.ep.timer) {
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
    now: () =>
      active
        ? {
            id: active.ep.id,
            title: active.ep.title,
            left: active.left,
            goals: active.goals.map((g) => ({ id: g.id, done: g.done, progress: g.progress, label: g.label })),
            rods: [...active.rodsHit],
            bolts: active.bolts,
            timed: active.timed,
            debris: active.debris,
            cue: active.cueOn,
            unlocked: (active.unlocked || []).slice(),
            prompt: active.ep.tutorial && currentTutorialGoal(active) ? currentTutorialGoal(active).prompt : null,
          }
        : null,
    offer: () => (offerEp ? { id: offerEp.id, title: offerEp.title } : null),
    best: () => loadBest(storageKey),
    tutorial: () => ({ done: tutorialDone(), key: tutKey }),
    skip: () => (active && active.ep.tutorial ? finish("skip") : null),
    start: (id, via) => {
      const ep = list.find((e) => e.id === id);
      return ep ? start(ep, via || "api") : false;
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
      return a.ending ? { id: a.ending.id, name: (END[a.ending.id] || {}).name, tank: a.ending.tank, shown: !endEl.hidden, fared: cityFared(a, END.fared) } : null;
    },
    showEnding: (id) => showEnding(id || (loadArc().ending || {}).id),
    resetArc: () => saveBest(arcKey, { parts: {} }),
  };
  day.episodes = api;
  window.episodes = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) install();
