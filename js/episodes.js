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
    if (!ep || !ep.id) continue;
    const ch = ep.chapters || [];
    if (ch.length && chapter && ch.indexOf(chapter) < 0) continue;
    const after = clockMinutes(ep.after);
    const before = clockMinutes(ep.before);
    if (after != null && minutes < after) continue;
    if (before != null && minutes > before) continue;
    if (ep.needOut && inCar) continue;
    if (inCar && (ep.id === "commute-home" || ep.debris)) continue;
    return ep;
  }
  return null;
}

/** Forecast-style score: percent + band word from day.config.js bands. */
export function scoreCard(done, total, left, timer, bands) {
  const n = Math.max(1, total | 0);
  const d = Math.max(0, Math.min(n, done | 0));
  let pct = Math.round((100 * d) / n);
  if (timer > 0 && left > 0 && d >= n) {
    const bonus = Math.min(8, Math.round((left / timer) * 8));
    pct = Math.min(100, pct + bonus);
  } else if (timer > 0 && left <= 0 && d < n) {
    pct = Math.max(0, pct - 8);
  }
  const list = Array.isArray(bands) && bands.length ? bands : [{ min: 0, word: "weather" }];
  let word = list[list.length - 1].word;
  for (let i = 0; i < list.length; i++) {
    if (pct >= (list[i].min | 0)) {
      word = list[i].word;
      break;
    }
  }
  return {
    pct,
    word,
    text: `Today's forecast: ${pct}% chance of ${word}`,
    done: d,
    total: n,
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
    best[id] = { pct: card.pct, word: card.word, text: card.text, when: Date.now() };
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
.ep-offer,.ep-score,.ep-menu{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,.55);padding:18px}
.ep-offer[hidden],.ep-score[hidden],.ep-menu[hidden]{display:none}
.ep-panel{width:min(420px,100%);background:rgba(14,16,22,.92);border:1px solid rgba(246,241,232,.18);border-radius:20px;padding:22px 22px 18px;color:#f6f1e8;font:500 0.95rem/1.4 Outfit,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.ep-panel h2{margin:0 0 6px;font-size:1.25rem}
.ep-panel p{margin:0 0 14px;color:rgba(246,241,232,.72)}
.ep-panel .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.ep-panel button{appearance:none;border:1px solid rgba(246,241,232,.22);background:rgba(246,241,232,.08);color:#f6f1e8;border-radius:12px;padding:10px 16px;font:600 0.88rem Outfit,system-ui,sans-serif;cursor:pointer}
.ep-panel button.primary{background:#f0c27a;color:#1a1c22;border-color:transparent}
.ep-panel .forecast{font-size:1.15rem;font-weight:700;color:#9fd4ff;margin:8px 0 4px}
.ep-panel .bestline{font-size:0.82rem;color:rgba(246,241,232,.55)}
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
  hud.innerHTML = `<div class="ep-card"><h3></h3><p class="tag"></p><ul></ul><div class="timer" hidden></div><div class="cue" hidden></div></div>`;

  const offer = document.createElement("div");
  offer.id = "episode-offer";
  offer.className = "ep-offer";
  offer.hidden = true;
  offer.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><h2></h2><p class="tagline"></p><p class="hint"></p><div class="actions"><button type="button" class="primary accept"></button><button type="button" class="decline"></button></div></div>`;

  const scoreEl = document.createElement("div");
  scoreEl.id = "episode-score";
  scoreEl.className = "ep-score";
  scoreEl.hidden = true;
  scoreEl.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><h2></h2><p class="forecast"></p><p class="detail"></p><p class="bestline"></p><div class="actions"><button type="button" class="primary ok">OK</button></div></div>`;

  const menu = document.createElement("div");
  menu.id = "episode-menu";
  menu.className = "ep-menu";
  menu.hidden = true;
  menu.innerHTML = `<div class="ep-panel" role="dialog" aria-modal="true"><h2>${L.menu}</h2><p>Jump the clock to a chapter and play that episode.</p><div class="ep-list"></div><div class="actions"><button type="button" class="close">Close</button></div></div>`;

  document.body.append(menuBtn, hud, offer, scoreEl, menu);

  const hudTitle = hud.querySelector("h3");
  const hudTag = hud.querySelector(".tag");
  const hudList = hud.querySelector("ul");
  const hudTimer = hud.querySelector(".timer");
  const hudCue = hud.querySelector(".cue");
  const offerTitle = offer.querySelector("h2");
  const offerTag = offer.querySelector(".tagline");
  const offerHint = offer.querySelector(".hint");
  const offerAccept = offer.querySelector(".accept");
  const offerDecline = offer.querySelector(".decline");
  const scoreTitle = scoreEl.querySelector("h2");
  const scoreForecast = scoreEl.querySelector(".forecast");
  const scoreDetail = scoreEl.querySelector(".detail");
  const scoreBest = scoreEl.querySelector(".bestline");
  const scoreOk = scoreEl.querySelector(".ok");
  const menuList = menu.querySelector(".ep-list");
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
  function clearProps() {
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
    return (ep.goals || []).map((g) => Object.assign({}, g, { done: false, progress: 0 }));
  }
  function goalsDone(run) {
    return run.goals.filter((g) => g.done).length;
  }
  function allDone(run) {
    return run.goals.length > 0 && run.goals.every((g) => g.done);
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
      const markEl = document.createElement("i");
      markEl.textContent = g.done ? "✓" : "·";
      const label = document.createElement("span");
      let text = g.label || g.id;
      if (g.kind === "rods" || g.kind === "bolts" || g.kind === "timed-bolts" || g.kind === "debris") {
        const need = g.count | 0;
        const have = Math.min(need, g.progress | 0);
        text += ` (${have}/${need})`;
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
    paintHud();
    if (allDone(active)) finish("clear");
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
      if (g.done || !afterMet(g, active)) return;
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

  /* ---- start / finish ---- */
  function showOffer(ep) {
    offerEp = ep;
    offerTitle.textContent = ep.title;
    offerTag.textContent = ep.tagline || "";
    offerHint.textContent = L.offer;
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
    if (ep.rods && ep.rods.length) spawnRods(ep.rods);
    else clearProps();
    if (ep.debris) spawnDebris();
    if (ep.lines && ep.lines.start && day.note) day.note(ep.lines.start);
    paintHud();
    mark("start", { id: ep.id, via: via || "play", title: ep.title });
    return true;
  }
  function endQuiet() {
    active = null;
    clearProps();
    hud.hidden = true;
  }
  function finish(why) {
    if (!active) return null;
    const run = active;
    const card = scoreCard(goalsDone(run), run.goals.length, run.left, run.ep.timer || 0, bands);
    const rec = recordBest(storageKey, run.ep.id, card);
    if (day.note) {
      if (why === "clear" && run.ep.lines && run.ep.lines.done) day.note(run.ep.lines.done);
      else if (why === "time") day.note(L.timeUp);
      else if (why === "let-go") day.note(L.letGo);
      day.note(card.text);
    }
    scoreTitle.textContent = L.scoreTitle;
    scoreForecast.textContent = card.text;
    scoreDetail.textContent = `${card.done} of ${card.total} goals` + (why === "time" ? " · time up" : why === "let-go" ? " · let go" : "");
    const b = rec.best[run.ep.id];
    scoreBest.textContent = b ? `${L.best}: ${b.pct}% chance of ${b.word}` : "";
    scoreEl.hidden = false;
    mark("score", { id: run.ep.id, pct: card.pct, word: card.word, text: card.text, why, improved: rec.improved });
    endQuiet();
    return card;
  }
  function hideScore() {
    scoreEl.hidden = true;
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
    hideOffer();
    mark("decline", { id });
  });
  offer.addEventListener("click", (e) => {
    if (e.target === offer) {
      declinedTake = true;
      const id = offerEp && offerEp.id;
      hideOffer();
      mark("decline", { id });
    }
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
      const ep = matchEpisode(list, chapter, minutes, { inCar });
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

  /* ---- tick (through world.update wrap) ---- */
  let lastWall = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.5, (now - lastWall) / 1000);
    lastWall = now;
    if (!active) return;
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
          }
        : null,
    offer: () => (offerEp ? { id: offerEp.id, title: offerEp.title } : null),
    best: () => loadBest(storageKey),
    start: (id, via) => {
      const ep = list.find((e) => e.id === id);
      return ep ? start(ep, via || "api") : false;
    },
    end: (why) => (active ? finish(why || "api") : null),
    match: (chapter, minutes, opt) => matchEpisode(list, chapter, minutes, opt),
    log: () => log.slice(),
    menu: showMenu,
  };
  day.episodes = api;
  window.episodes = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) install();
