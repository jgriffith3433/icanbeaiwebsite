/* ==========================================================================
   The cold open: a new player's first Play (js/title.js calls it). No card, no modal, no step list.
   The title closes and he is the player's in the same frame, on the apartment roof at dusk, the camera pushing in
   over his shoulder while a storm cell he didn't call rolls in (rain, far thunder, the music tenses with the sky).
   He says one line (his DoD voice, js/voice.js); a pulsing ring marks the shop roof's lightning rod and the only
   words on screen are "Hold E" ("Hold the bolt" on touch, with one big Bolt button over the right thumb). The
   bolt: hit-stop, flash, the street lamps flicker, the crowd looks up, Birdie calls up from the avenue (her
   voice), and he answers. Then the HUD comes in and the day is his.
   Words: day.config.js `coldopen`. Returning players (icanbe.opening or icanbe.tutorial kept) never see it.
   A bot's tab (?playtest= other than cold-start) never gets it; the cold-start scenario arms it.
   `day.coldopen`: pending(), active(), start(via), arm(), now(); `day:coldopen` events.
   ========================================================================== */

export function startColdOpen() {
  const day = window.day;
  if (!day || day.coldopen || !document.body) return day && day.coldopen;
  const cfg = (window.DAY_CONFIG && window.DAY_CONFIG.coldopen) || null;
  if (!cfg) return null;
  const html = document.documentElement;
  const B = window.BABYLON;

  let quiet = false;
  let playtestId = "";
  try {
    const id = new URLSearchParams(location.search).get("playtest");
    playtestId = id || "";
    if (id && id !== "cold-start" && id !== "title-key-art" && id !== "phone-touch" && id !== "audio-check") quiet = true;
    // a cold bot (the first-five run, no ?playtest) plays it like a stranger; a runner's start(id) quiets the title first, which cancels the auto-start
  } catch (e) { /* no location */ }

  const style = document.createElement("style");
  style.textContent = `
.co-prompt{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 22px 12px;border-radius:999px;background:rgba(10,13,22,.72);border:1px solid rgba(126,200,255,.5);backdrop-filter:blur(8px);color:#f6f1e8;font:600 1.15rem/1 Fraunces,Georgia,serif;text-shadow:0 2px 12px rgba(0,0,0,.55);pointer-events:none;opacity:0;transition:opacity .4s ease}
.co-prompt.on{opacity:1}
.co-prompt[hidden]{display:none}
.co-prompt .bar{width:96px;height:4px;border-radius:2px;background:rgba(246,241,232,.22);overflow:hidden}
.co-prompt .bar i{display:block;height:100%;width:0;background:#7ec8ff;box-shadow:0 0 10px #7ec8ff}
.co-bolt{appearance:none;width:104px;height:104px;border-radius:50%;border:2px solid rgba(126,200,255,.75);background:rgba(14,22,40,.62);color:#bfe3ff;font:700 1rem Outfit,system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;backdrop-filter:blur(6px);box-shadow:0 0 22px rgba(126,200,255,.45)}
.co-bolt[hidden]{display:none}
.co-bolt.held{background:#7ec8ff;color:#0c1220}
.co-say{display:flex;align-items:center;gap:10px;max-width:min(88vw,28em);padding:8px 16px;border-radius:999px;background:rgba(10,13,22,.7);border:1px solid rgba(240,194,122,.45);backdrop-filter:blur(8px);color:#f6f1e8;font:600 clamp(.95rem,2.2vw,1.15rem)/1.25 Fraunces,Georgia,serif;text-shadow:0 2px 12px rgba(0,0,0,.55);pointer-events:none}
.co-say[hidden]{display:none}
.co-say b{font:600 .65rem/1 Outfit,system-ui,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#f0c27a}
`;
  document.head.appendChild(style);

  const prompt = document.createElement("div");
  prompt.className = "co-prompt";
  prompt.id = "coldopen-prompt";
  prompt.hidden = true;
  prompt.setAttribute("role", "status");
  prompt.innerHTML = `<span class="txt"></span><span class="bar"><i></i></span>`;
  const bolt = document.createElement("button");
  bolt.type = "button";
  bolt.className = "co-bolt";
  bolt.id = "coldopen-bolt";
  bolt.hidden = true;
  bolt.textContent = "Rain";
  bolt.setAttribute("aria-label", "Rain");
  const say = document.createElement("div");
  say.className = "co-say";
  say.id = "coldopen-say";
  say.hidden = true;
  say.setAttribute("role", "status");
  say.innerHTML = `<b></b><span></span>`;
  document.body.append(prompt, bolt, say);
  const promptTxt = prompt.querySelector(".txt");
  const promptBar = prompt.querySelector(".bar i");

  let on = false; // from Play until the first bolt's moment is over
  let phase = "idle"; // idle | landing | waiting | cast | done
  let t0 = 0;
  let castAt = 0;
  let reactAt = 0;
  let firstInputAt = 0;
  let held = null; // { via, t }
  let passing = false;
  let meshes = null;
  let obs = null;
  let timers = [];
  const log = [];

  const touchy = () => html.classList.contains("touch-ui") || (day.control && day.control.state && day.control.state().touch);
  const later = (fn, ms) => { const h = setTimeout(() => { timers = timers.filter((x) => x !== h); fn(); }, ms); timers.push(h); return h; };
  function emit(action, extra) {
    const detail = Object.assign({ action, t: Math.round((performance.now() - t0) / 10) / 100 }, extra || {});
    log.push(detail);
    if (log.length > 40) log.shift();
    window.dispatchEvent(new CustomEvent("day:coldopen", { detail }));
  }
  const keys = () => cfg.keys || ["icanbe.opening", "icanbe.tutorial"];
  const returning = () => {
    try { return keys().some((k) => !!localStorage.getItem(k)); } catch (e) { return true; }
  };
  const mark = () => { keys().forEach((k) => { try { localStorage.setItem(k, "cold-open"); } catch (e) { /* private mode */ } }); };

  /* ---- the rod, the beam and the ring: world-space, on the shop roof ---- */
  function build() {
    const w = day.world && day.world();
    if (!w || !w.scene || !B) return null;
    const scene = w.scene;
    const R = cfg.rod;
    const metal = new B.StandardMaterial("co-rod", scene);
    metal.diffuseColor = new B.Color3(0.55, 0.58, 0.62);
    metal.emissiveColor = new B.Color3(0.1, 0.22, 0.36);
    const glow = new B.StandardMaterial("co-glow", scene);
    glow.disableLighting = true;
    glow.emissiveColor = new B.Color3(0.45, 0.78, 1);
    glow.alpha = 0.85;
    glow.fogEnabled = false;
    glow.backFaceCulling = false;
    const beamM = glow.clone("co-beam");
    beamM.alpha = 0.16;
    const pole = B.MeshBuilder.CreateCylinder("co-rod-pole", { diameter: 0.16, height: R.height, tessellation: 8 }, scene);
    pole.position.set(R.x, R.roofY + R.height / 2, R.z);
    pole.material = metal;
    const tip = B.MeshBuilder.CreateSphere("co-rod-tip", { diameter: 0.36, segments: 8 }, scene);
    tip.position.set(R.x, R.roofY + R.height + 0.1, R.z);
    tip.material = metal;
    const top = R.roofY + R.height;
    const ring = B.MeshBuilder.CreateTorus("co-ring", { diameter: 3.4, thickness: 0.16, tessellation: 40 }, scene);
    ring.position.set(R.x, top - 0.6, R.z);
    ring.material = glow;
    const beam = B.MeshBuilder.CreateCylinder("co-beam", { diameter: 1.5, height: 22, tessellation: 20, updatable: false }, scene);
    beam.position.set(R.x, top + 11, R.z);
    beam.material = beamM;
    const arrow = B.MeshBuilder.CreateCylinder("co-arrow", { diameterTop: 1.1, diameterBottom: 0, height: 1.3, tessellation: 4 }, scene);
    arrow.material = glow;
    arrow.position.set(R.x, top + 3.4, R.z);
    [pole, tip, ring, beam, arrow].forEach((m) => { m.isPickable = false; m.alwaysSelectAsActiveMesh = true; });
    ring.renderingGroupId = beam.renderingGroupId = arrow.renderingGroupId = 1; // over the skyline, so it reads from the roof 70 m away
    return { scene, metal, glow, beamM, pole, tip, ring, beam, arrow, top };
  }
  function dropMeshes() {
    if (!meshes) return;
    [meshes.pole, meshes.tip, meshes.ring, meshes.beam, meshes.arrow].forEach((m) => m.dispose());
    [meshes.metal, meshes.glow, meshes.beamM].forEach((m) => m.dispose());
    if (obs) meshes.scene.onBeforeRenderObservable.remove(obs);
    obs = null;
    meshes = null;
  }
  function frame() {
    const dt = Math.min(0.1, (meshes.scene.getEngine().getDeltaTime() || 16) / 1000);
    const nowS = performance.now() / 1000;
    const pulse = 1 + 0.1 * Math.sin(nowS * 5);
    let prog = 0;
    if (held) {
      held.t += dt;
      prog = Math.min(1, held.t / (cfg.holdSec || 0.05));
      if (prog >= 1) fire(held.via);
    }
    const s = pulse * (1 - 0.18 * prog);
    meshes.ring.scaling.set(s, s, s);
    meshes.arrow.position.y = meshes.top + 3.4 + 0.35 * Math.sin(nowS * 4);
    meshes.arrow.rotation.y += dt * 1.5;
    meshes.ring.rotation.y += dt * (1 + prog * 6);
    meshes.glow.emissiveColor.set(0.45 + 0.55 * prog, 0.78 + 0.22 * prog, 1);
    meshes.beamM.alpha = 0.13 + 0.06 * Math.sin(nowS * 5) + 0.3 * prog;
    // up close the 1.5 m shaft reads as a solid blue pillar: fade it out within 22 m, gone by 9 m
    const cam = meshes.scene.activeCamera;
    if (cam) meshes.beam.visibility = Math.max(0, Math.min(1, (Math.hypot(cam.position.x - meshes.beam.position.x, cam.position.z - meshes.beam.position.z) - 9) / 13));
    promptBar.style.width = Math.round(prog * 100) + "%";
  }

  /* ---- the hold ---- */
  let castVerb = "rain"; // the verb the press asked for: Rain is the prompted first cast, the rod's bolt still works
  function press(via, name) {
    if (phase !== "waiting" && phase !== "landing") return;
    castVerb = name === "bolt" ? "bolt" : "rain";
    if (!firstInputAt) {
      firstInputAt = performance.now();
      emit("input", { via, kind: "hold" });
    }
    if (held) return;
    if (!(cfg.holdSec > 0)) { fire(via); return; } // one tap
    held = { via, t: 0 };
    bolt.classList.add("held");
    emit("hold", { via });
  }
  function release() {
    if (!held) return;
    const was = held;
    held = null;
    bolt.classList.remove("held");
    promptBar.style.width = "0%";
    if (phase === "waiting" || phase === "landing") emit("release", { via: was.via, held: Math.round(was.t * 100) / 100 });
  }
  function fire(via) {
    const verb = castVerb;
    held = null;
    bolt.classList.remove("held");
    const P = window.powers || day.powers;
    if (!P) return;
    if (P.aimAt) {
      if (verb === "rain") P.aimAt({ x: -19.3, y: 0.4, z: 9.15 });
      else P.aimAt({ x: cfg.rod.x, y: cfg.rod.roofY + cfg.rod.height, z: cfg.rod.z });
    }
    phase = "cast";
    castAt = performance.now();
    passing = true;
    let ok = false;
    try { ok = P.command(verb, via === "touch" ? "touch" : via); } finally { passing = false; }
    if (!ok) { phase = "waiting"; castAt = 0; held = null; return; }
    P.hitstop(0.14);
    if (day.cityscape && day.cityscape.flicker) day.cityscape.flicker(1.8);
    prompt.classList.remove("on");
    bolt.hidden = true;
    emit("bolt", { via });
    // The crowd looks up on its own (the bolt's storm is the ability weather its reaction reads); Birdie answers a beat
    // after that. If the crowd is thin or late, she calls anyway.
    later(() => birdie("timer"), 3500);
    later(finish, 22000); // a safety: the sequence ends itself after his answer to Birdie
    later(() => html.classList.remove("cold-open"), 1600); // the day's HUD comes in after the strike
  }
  function pipeLine(who, text) {
    window.dispatchEvent(new CustomEvent("day:story", { detail: { action: "say", who, text, via: "coldopen", positional: !!(day.voice && day.voice.speakAs) } }));
  }
  function caption(who, text, secs) {
    say.querySelector("b").textContent = who;
    say.querySelector("span").textContent = text;
    say.hidden = false;
    later(() => { say.hidden = true; }, (secs || 3.6) * 1000);
  }
  let birdieDone = false;
  function birdie(why) {
    if (birdieDone || phase !== "cast") return;
    birdieDone = true;
    const L = cfg.lines.birdie;
    const V = day.voice;
    const N = day.neighbors && day.neighbors.now && day.neighbors.now();
    const me = N && N.people && N.people.find((p) => p.id === "birdie");
    // The story is the one line she calls (voiced, one caption); his reply is no second caption: the street's lesson
    // answers it by play (Rain is open now), so the first minute stays under the 40-word limit.
    const afterLine = () => {
      emit("after", { text: "" });
      later(finish, 600); // her call opened Rain: the bolt's gate comes off once she has spoken
    };
    // Birdie calls from her pots (js/voice.js: her voice, from where she stands, one caption with her name on it, never
    // over his line); the street's lesson (js/street.js) starts on this event: her call is Rain's ask.
    pipeLine(L[0], L[1]);
    if (V && V.speakAs) V.speakAs(L[0], L[1], { x: me ? me.x : -21, z: me ? me.z : 9.5, via: "coldopen", onend: () => later(afterLine, 500) });
    else { caption(L[0], L[1], 5); later(afterLine, 5600); }
    emit("birdie", { why, text: L[1] });
  }
  function finish() {
    if (phase === "done") return;
    phase = "done";
    on = false;
    html.classList.remove("cold-open");
    const P = window.powers || day.powers;
    if (P) { P.gate(null); P.aimAt(null); }
    bolt.hidden = true;
    prompt.hidden = true;
    dropMeshes();
    timers.forEach(clearTimeout);
    timers = [];
    say.hidden = true;
    emit("end");
    // she stays on the lawn until the street's first thanks (or 2 minutes), so the ring and her ask stay where she is
    const free = () => { if (day.neighbors && day.neighbors.stand) day.neighbors.stand("birdie", null, null); window.removeEventListener("day:street", onStreet); };
    const onStreet = (e) => { if (e && e.detail && e.detail.action === "thanks") free(); };
    window.addEventListener("day:street", onStreet);
    setTimeout(free, 120000);
  }

  /* ---- inputs: the hold's release (the press arrives through powers' gate) ---- */
  window.addEventListener("keyup", (e) => { if (held && (e.key || "").toLowerCase() === "e") release(); }, true);
  window.addEventListener("pointerup", () => { if (held) release(); }, true);
  window.addEventListener("pointercancel", () => { if (held) release(); }, true);
  window.addEventListener("blur", () => release());
  bolt.addEventListener("pointerdown", (e) => {
    press("touch", playtestId === "ask-markers" || playtestId === "street-teaches" ? "bolt" : undefined);
    try { bolt.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    e.preventDefault();
  });
  bolt.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("day:crowd", (e) => {
    const d = (e && e.detail) || {};
    if (!on || phase !== "cast" || d.action !== "reaction" || (d.kind !== "lookup" && d.kind !== "rain")) return;
    reactAt = performance.now();
    emit("react", { kind: d.kind });
    later(() => birdie("look-up"), (cfg.reactDelay || 1) * 1000);
  });

  // Letting go (Esc, B) while the cold open is up ends it: otherwise its gate, prompt and rod stay up with him back on his
  // day, and `on` stays true so the next Play is refused ("Play didn't hand him over", cold-start blocker).
  window.addEventListener("day:control", (e) => {
    const d = (e && e.detail) || {};
    if (on && d.action === "let-go") { emit("abort", { via: d.via }); finish(); }
  });

  /* ---- the glance: Birdie on the lawn, seen before any word ---- */
  // A cut-away that starts on a neighbor where they stand (waving) and eases back to the camera's own pose over
  // `secs`, so the end hands over with no snap. The player sees who is asking before anyone says anything.
  let glancing = false;
  function glance(id, secs, done) {
    const w = day.world && day.world();
    const N = day.neighbors;
    const cam = w && w.camera;
    const me = N && N.now && N.now().people.find((p) => p.id === id);
    if (!w || !w.cineShot || !cam || !me || w.cineOn()) { if (done) done(false); return false; }
    const g = cfg.glance || {};
    const tg = cam.target;
    if (N.gesture) N.gesture(id, "ask");
    glancing = true;
    w.cineShot({
      secs, tx: [me.x, tg.x], ty: [(g.y == null ? 1.4 : g.y), tg.y], tz: [me.z, tg.z],
      alpha: [g.alpha == null ? -1.45 : g.alpha, cam.alpha], beta: [g.beta || 1.28, cam.beta], radius: [g.radius || 9, cam.radius],
    });
    emit("glance", { id, x: me.x, z: me.z });
    later(() => { try { w.cineShot(null); } catch (e) { /* */ } glancing = false; emit("glance-end", { id }); if (done) done(true); }, secs * 1000 + 60);
    return true;
  }

  /* ---- the sequence ---- */
  let fromTitle = false;
  function begin() {
    const C = day.control;
    const sp = cfg.spot;
    C.place(sp.x, sp.z, sp.yaw, { from: sp.from, alpha: cfg.camera.alpha, beta: cfg.camera.beta, radius: cfg.camera.radius });
    if (day.jump && cfg.clock) day.jump(cfg.clock);
    // From the title's key-art shot (it ends on this very pose, wider) the camera dives in with no cut and no extra fov;
    // a flash covers the sky changing to dusk. Otherwise the long wide push-in.
    const dive = fromTitle && cfg.dive;
    if (C.push) C.push(dive ? { from: dive.from, fov: 0, secs: dive.secs } : { from: cfg.camera.from, fov: cfg.camera.fov, secs: cfg.camera.secs });
    if (dive && window.weather && window.weather.triggerFlash) window.weather.triggerFlash(60, -0.15);
    const P = window.powers || day.powers;
    if (P) {
      P.abilities.reset(100);
      if (P.abilities.unlock) P.abilities.unlock("rain"); // the street's lessons lock the verbs from the start: the first cast is Rain
      P.aimAt({ x: cfg.rod.x, y: cfg.rod.roofY + cfg.rod.height, z: cfg.rod.z });
      P.gate((name, via) => {
        if (passing || !on || phase === "done") return true; // never refuse a cast once the opening is over
        if (name === "rain" || name === "bolt") press(via, name);
        return false; // nothing but Rain (the prompted gesture) and the rod's bolt
      });
    }
    meshes = build();
    if (meshes) obs = meshes.scene.onBeforeRenderObservable.add(frame);
    phase = "landing";
    promptTxt.textContent = touchy() ? cfg.prompt.touch : cfg.prompt.keys;
    bolt.hidden = !touchy();
    emit("landed", { x: sp.x, z: sp.z });
    // Birdie is out on the park lawn, in view of the roof, waving up at him: the camera finds her when the push-in is
    // done (a cut-away that eases back to him), and he speaks only after that.
    const B0 = cfg.birdie;
    if (B0 && day.neighbors && day.neighbors.stand) day.neighbors.stand("birdie", B0.x, B0.z);
    const pushMs = ((dive ? dive.secs : cfg.camera.secs) + 0.2) * 1000;
    const gSecs = (cfg.glance && cfg.glance.secs) || 0;
    if (gSecs) later(() => { if (on) glance("birdie", gSecs); }, pushMs);
    // the cell: far thunder as it arrives, then his line, then the prompt
    const W = window.weather;
    later(() => { if (W && W.triggerFlash) W.triggerFlash(90, -0.3); }, 700);
    later(() => {
      // No story line before the first cast: the frame is him, the rod and one prompt (clarity, critic cold-start).
      emit("line", { text: "", silent: true });
      phase = "waiting";
      prompt.hidden = false;
      requestAnimationFrame(() => prompt.classList.add("on"));
      emit("prompt", { text: promptTxt.textContent });
    }, Math.max((cfg.firstLine || 1.4) * 1000, pushMs)); // the prompt waits for the push-in only, not the glance at Birdie: the first instruction comes first
  }
  function tryTake(frames) {
    const C = day.control;
    const btn = document.getElementById("control");
    if (C.mode() === "schedule") {
      if (btn && !btn.disabled) btn.click();
      else if (!btn) C.take();
    }
    if (C.mode() === "control") return begin();
    // He is driving (or between frames): jump the clock to dusk, where he is on foot, and take him on the next frame.
    if (frames === 0 && day.jump && cfg.clock) day.jump(cfg.clock);
    if (frames > 40) { emit("failed", { mode: C.mode() }); finish(); return; }
    requestAnimationFrame(() => tryTake(frames + 1));
  }

  const api = {
    pending: () => !quiet && !on && !returning(),
    active: () => on,
    arm() { if (on) finish(); quiet = false; return true; },
    /** Called by the title's Play, in the click: the same frame the title closes. */
    start(via, opts) {
      if (on || quiet || returning()) return false;
      fromTitle = !!(opts && opts.fromTitle);
      if (!day.control || !day.control.place) return false;
      on = true;
      t0 = performance.now();
      firstInputAt = 0;
      castAt = 0;
      reactAt = 0;
      birdieDone = false;
      held = null;
      mark();
      if (day.tutorial && day.tutorial.skip) day.tutorial.skip(); // its card is up under the title for a new player
      html.classList.add("cold-open", "first-min");
      setTimeout(() => html.classList.remove("first-min"), 56000);
      const W = window.weather;
      if (W && W.set) W.set(cfg.cell.state, cfg.cell.intensity, "cell"); // the storm nobody called
      emit("start", { via });
      tryTake(0);
      return true;
    },
    glance: (id, secs) => glance(id || "birdie", secs || ((cfg.glance && cfg.glance.secs) || 2.6)),
    glancing: () => glancing,
    now: () => ({ on, phase, startedAt: t0, glancing, held: !!held, firstInput: firstInputAt ? (firstInputAt - t0) / 1000 : null, cast: castAt ? (castAt - t0) / 1000 : null, react: reactAt ? (reactAt - t0) / 1000 : null, log: log.slice() }),
  };
  day.coldopen = api;
  window.coldopen = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startColdOpen();
