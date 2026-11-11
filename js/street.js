/* ==========================================================================
   The street teaches (neighbors.teach in day.config.js). After the cold open's first bolt the other four verbs are
   locked and each arrives because a neighbor asks for it out loud, in their own voice, one after another:
   Birdie (Rain, on her pots: her call is the cold open's own line), Dex (Sun break, the damp parcels), Ines (Fog over
   the annex, then a Wind gust to clear it). No card, no list: each ask is a voiced, captioned line from where the
   neighbor stands (js/voice.js speakAs: positional, never over Small Weather), the verb's button joins the bar
   with a glow, a vibrate and the unlock sound, a ring and beam stand on the one who asked, and the thanks is voiced.
   A neighbor who is inside, or far down the avenue, asks by a call from the window or the street (`call` line).
   Progress is kept in localStorage `icanbe.street` (stages done), so a reload picks up where it was.
   Starting any episode (the practice episode in the Episodes menu included) ends the lesson: everything opens.
   `day.street`: now(), stages(), begin(), stop(), answer(power), reset(). Events: `day:street`
   (begin / ask / unlock / thanks / done / stop). Playtest: `street-teaches`.
   ========================================================================== */

/** The stage list from the config: a step with `then` is two stages (the second is asked by the first one's thanks). */
export function stagesOf(teach) {
  const out = [];
  ((teach && teach.steps) || []).forEach((st) => {
    out.push({ id: st.id, who: st.who, unlock: st.unlock, answer: st.answer, color: st.color, spot: st.spot, ask: st.ask || null, call: st.call || null, thanks: st.thanks, followUp: !!st.then });
    if (st.then) out.push({ id: st.then.unlock, who: st.who, unlock: st.then.unlock, answer: st.then.answer, color: st.then.color || st.color, spot: st.spot, ask: null, call: null, thanks: st.then.thanks, followUp: false, spokenBy: st.id });
  });
  return out;
}

export function startStreet() {
  const day = window.day;
  const root = window.DAY_CONFIG;
  const cfg = root && root.neighbors && root.neighbors.teach;
  if (!day || !cfg || day.street || typeof document === "undefined" || !document.body) return day && day.street;
  const html = document.documentElement;
  const B = window.BABYLON;
  const stages = stagesOf(cfg);
  const key = cfg.storageKey || "icanbe.street";
  const near = cfg.near || 14;
  const range = cfg.range || 18;

  let quiet = false;
  try {
    const id = new URLSearchParams(location.search).get("playtest");
    if (id && id !== "cold-start" && id !== "street-teaches") quiet = true; // other scenarios never meet the lesson
    else if (!id && navigator.webdriver) quiet = true;
  } catch (e) { /* no location */ }

  let n = -1; // the stage in play; -1 = not teaching, stages.length = done
  let phase = "off"; // off | gap | open | thanks
  let wait = 0; // s left in a gap
  let thanksIn = 0;
  let openFor = 0;
  let nagged = false;
  let cue = null;
  let lastAsk = null;
  const log = [];

  const style = document.createElement("style");
  style.textContent = `
html.street-wait .abilitybar .ab.locked{display:none}
.abilitybar .ab.st-new{animation:stNew 4.6s ease-out 1;border-color:#f0c27a;box-shadow:0 0 22px 6px rgba(240,194,122,.95)}
@keyframes stNew{0%{transform-origin:center;filter:brightness(2.2);box-shadow:0 0 34px 12px rgba(255,226,154,1)}30%{filter:brightness(1.5)}100%{filter:none;box-shadow:0 0 14px rgba(240,194,122,.9)}}
`;
  document.head.appendChild(style);

  const save = () => { try { localStorage.setItem(key, JSON.stringify({ n })); } catch (e) { /* private mode */ } };
  const loadN = () => {
    try { const j = JSON.parse(localStorage.getItem(key)); return j && Number.isInteger(j.n) ? j.n : null; } catch (e) { return null; }
  };
  function emit(action, extra) {
    const detail = Object.assign({ action, stage: n, id: stages[n] && stages[n].id }, extra || {});
    log.push(Object.assign({ t: Math.round(performance.now()) }, detail));
    if (log.length > 40) log.shift();
    try { window.dispatchEvent(new window.CustomEvent("day:street", { detail })); } catch (e) { /* node */ }
  }
  const abil = () => { const P = window.powers || day.powers; return P && P.abilities ? P.abilities : null; };
  const lockIds = (from) => {
    const A = abil();
    if (!A) return;
    stages.slice(from).forEach((s) => A.lock([s.unlock]));
  };
  const hero = () => {
    const C = day.control;
    if (!C || !C.state) return null;
    const s = C.state();
    return { x: s.x, z: s.z };
  };
  const inControl = () => !!(day.control && day.control.mode && day.control.mode() === "control");
  const person = (id) => {
    const N = day.neighbors && day.neighbors.now && day.neighbors.now();
    return N && N.people ? N.people.find((p) => p.id === id) : null;
  };
  /** Where the one who asked stands: where they are outside, else their window (the spot). */
  function target(s) {
    const p = person(s.who);
    if (p && !p.inside) return { x: p.x, z: p.z, inside: false };
    return { x: s.spot.x, z: s.spot.z, inside: true };
  }
  const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 1e9);
  const firstName = (id) => {
    const p = ((root.neighbors && root.neighbors.list) || []).find((x) => x.id === id);
    return p ? p.name.split(" ")[0] : id;
  };

  /* ---- the cue: a ring and a beam on whoever asked, over the skyline ---- */
  function buildCue() {
    const w = day.world && day.world();
    if (!w || !w.scene || !B) return null;
    const scene = w.scene;
    const glow = new B.StandardMaterial("st-glow", scene);
    glow.disableLighting = true;
    glow.emissiveColor = new B.Color3(1, 0.8, 0.4);
    glow.alpha = 0.85;
    glow.fogEnabled = false;
    glow.backFaceCulling = false;
    const beamM = glow.clone("st-beam");
    beamM.alpha = 0.16;
    const ring = B.MeshBuilder.CreateTorus("st-ring", { diameter: 3.2, thickness: 0.14, tessellation: 40 }, scene);
    ring.material = glow;
    const beam = B.MeshBuilder.CreateCylinder("st-beam", { diameter: 1.3, height: 20, tessellation: 20 }, scene);
    beam.material = beamM;
    [ring, beam].forEach((m) => { m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.renderingGroupId = 1; m.setEnabled(false); });
    const obs = scene.onBeforeRenderObservable.add(frame);
    return { scene, glow, beamM, ring, beam, obs, at: null };
  }
  function frame() {
    if (!cue) return;
    const on = phase === "open" && !!cue.at;
    cue.ring.setEnabled(on);
    cue.beam.setEnabled(on);
    if (!on) return;
    const dt = Math.min(0.1, (cue.scene.getEngine().getDeltaTime() || 16) / 1000);
    const s = stages[n];
    const t = target(s);
    const gy = day.world().surfaceAt ? day.world().surfaceAt(t.x, t.z) : 0;
    const pulse = 1 + 0.1 * Math.sin(performance.now() / 200);
    cue.ring.position.set(t.x, gy + 0.3, t.z);
    cue.ring.scaling.set(pulse, pulse, pulse);
    cue.ring.rotation.y += dt * 1.2;
    cue.beam.position.set(t.x, gy + 10, t.z);
    cue.beamM.alpha = 0.14 + 0.05 * Math.sin(performance.now() / 200);
    cue.at = t;
  }
  function placeCue(s) {
    if (!cue) cue = buildCue();
    if (!cue) return;
    const c = s.color || [1, 0.8, 0.4];
    cue.glow.emissiveColor.set(c[0], c[1], c[2]);
    cue.beamM.emissiveColor.set(c[0], c[1], c[2]);
    cue.at = target(s);
  }
  function dropCue() {
    if (!cue) return;
    cue.at = null;
    cue.ring.setEnabled(false);
    cue.beam.setEnabled(false);
  }

  /* ---- an ask: the line, the unlock, the cue ---- */
  function unlock(s) {
    const A = abil();
    if (A) {
      A.unlock(s.unlock);
      if (A.reset) A.reset(100); // a new verb can be tried at once
    }
    const slot = document.getElementById("ability-" + s.unlock);
    if (slot) {
      slot.classList.remove("st-new");
      void slot.offsetWidth;
      slot.classList.add("st-new", "unlocked-now");
      setTimeout(() => slot.classList.remove("st-new", "unlocked-now"), 4800);
    }
    try { if (navigator.vibrate) navigator.vibrate([40, 60, 40]); } catch (e) { /* no vibrate */ }
    emit("unlock", { verb: s.unlock });
  }
  function speak(who, text, at, onend) {
    const V = day.voice;
    if (V && V.speakAs) return V.speakAs(firstName(who), text, { x: at.x, z: at.z, via: "street", onend });
    if (onend) setTimeout(onend, 3000);
    return null;
  }
  function callText(s) {
    const t = target(s);
    const H = hero();
    const close = !t.inside && dist(H, t) < near;
    const cold = root.coldopen && root.coldopen.lines && root.coldopen.lines.birdie;
    const text = close ? s.ask || s.call : s.call || s.ask;
    return { text: text || (cold && cold[1]), close, inside: t.inside };
  }
  function open(s, spokenAlready) {
    phase = "open";
    openFor = 0;
    nagged = false;
    placeCue(s);
    unlock(s);
    const c = callText(s);
    if (!spokenAlready && c.text) speak(s.who, c.text, target(s));
    lastAsk = { id: s.id, who: s.who, text: c.text, spoken: !spokenAlready, close: c.close, inside: c.inside, called: !c.close };
    emit("ask", { who: s.who, verb: s.unlock, close: c.close, inside: c.inside, text: c.text, cue: !!cue });
  }
  function gapTo(i, secs) {
    n = i;
    save();
    if (n >= stages.length) return finish();
    phase = "gap";
    wait = secs;
  }
  function finish() {
    phase = "off";
    dropCue();
    html.classList.remove("street-wait");
    emit("done", {});
    n = stages.length;
    save();
  }

  /* ---- an answer: his call of the verb near them ---- */
  function answer(power) {
    if (phase !== "open" || n < 0) return false;
    const s = stages[n];
    if (!s.answer.includes(power)) return false;
    if (dist(hero(), target(s)) > range) return false;
    phase = "thanks";
    thanksIn = 1.1;
    dropCue();
    emit("answered", { verb: s.unlock, power });
    return true;
  }
  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "denied") return;
    answer(d.power || d.action);
  });

  function thank() {
    const s = stages[n];
    const t = target(s);
    emit("thanks", { who: s.who, text: s.thanks });
    const next = stages[n + 1];
    if (s.followUp && next) {
      // the thanks is also the next ask (Ines: the fog is too good, a gust to clear a window): it opens the next verb
      speak(s.who, s.thanks, t);
      n++;
      save();
      open(next, true);
      return;
    }
    speak(s.who, s.thanks, t);
    gapTo(n + 1, cfg.gap || 4.5);
  }

  /* ---- the clock of it: real seconds, only while he is the player's ---- */
  let last = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (n >= 0 && n < stages.length && inControl()) {
      if (phase === "gap") {
        wait -= dt;
        if (wait <= 0) open(stages[n], false);
      } else if (phase === "thanks") {
        thanksIn -= dt;
        if (thanksIn <= 0) thank();
      } else if (phase === "open") {
        openFor += dt;
        if (!nagged && openFor > (cfg.nag || 40)) {
          nagged = true;
          const s = stages[n];
          const c = callText(s);
          if (c.text && !s.spokenBy) speak(s.who, c.text, target(s));
          emit("nag", { who: s.who });
        }
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---- begin / stop ---- */
  function begin() {
    if (quiet && !arming) return false;
    if (n >= 0 && n < stages.length) return false;
    lockIds(0);
    html.classList.add("street-wait");
    n = 0;
    save();
    emit("begin", {});
    // the cold open spoke Birdie's call: Rain opens with it
    open(stages[0], true);
    return true;
  }
  let arming = false;
  function stop(why) {
    if (n < 0 || n >= stages.length) {
      html.classList.remove("street-wait");
      return;
    }
    const A = abil();
    if (A) stages.forEach((s) => A.unlock(s.unlock));
    dropCue();
    html.classList.remove("street-wait");
    phase = "off";
    n = stages.length;
    save();
    emit("stop", { why: why || "stop" });
  }
  function reset() {
    n = -1;
    phase = "off";
    try { localStorage.removeItem(key); } catch (e) { /* private mode */ }
    dropCue();
    html.classList.remove("street-wait");
  }

  // the cold open's Birdie call starts the lesson (her line is the Rain ask)
  window.addEventListener("day:coldopen", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "start") {
      // a new player's cold open: the four verbs are locked from the first frame (the bolt is the one he has)
      arming = true;
      if (n < 0) { lockIds(0); html.classList.add("street-wait"); }
    } else if (d.action === "birdie") begin();
    else if ((d.action === "end" || d.action === "failed") && n < 0) {
      // the cold open ended without Birdie's call (it failed): never leave a verb locked behind a lesson that didn't start
      const A = abil();
      if (A) stages.forEach((s) => A.unlock(s.unlock));
      html.classList.remove("street-wait");
    }
  });
  // any episode (the practice one included) needs every verb: the lesson is over
  window.addEventListener("day:episode", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "start" && n >= 0 && n < stages.length) stop("episode");
  });

  // a reload in the middle of the lesson: the verbs not yet asked for stay locked, the next ask comes on his first steps
  const saved = quiet ? null : loadN();
  if (saved != null && saved >= 0 && saved < stages.length) {
    arming = true;
    n = saved;
    lockIds(n);
    html.classList.add("street-wait");
    phase = "gap";
    wait = 3;
    // the verbs already asked for are open
    const A = abil();
    if (A) stages.slice(0, n).forEach((s) => A.unlock(s.unlock));
  }
  requestAnimationFrame(tick);

  const api = {
    now: () => ({ stage: n, phase, id: stages[n] && stages[n].id, done: n >= stages.length, locked: stages.filter((s) => { const A = abil(); return A && A.isLocked(s.unlock); }).map((s) => s.unlock), cue: !!(cue && cue.at && phase === "open"), last: lastAsk, log: log.slice() }),
    stages: () => stages.slice(),
    begin() { arming = true; return begin(); },
    stop,
    answer,
    reset,
    cueAt: () => (cue && cue.at ? { x: cue.at.x, z: cue.at.z } : null),
  };
  day.street = api;
  window.street = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startStreet();
