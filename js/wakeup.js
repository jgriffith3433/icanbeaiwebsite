/* ==========================================================================
   Wake him: Take control while Small Weather sleeps (a visit at 03:00 finds him in bed).
   A short flash hides the cut and he is on the apartment roof in night weather (fog, far lightning) with the Charge full,
   ready to cast, in the same instant as the tap (a microtask after the take event, no timer), looking up (the lookup clip)
   for his first 0.9 s there. Let go and he walks back to
   bed by the day's own routes (js/control.js), the clock never stopped.
   Words/numbers: day.config.js `wake`. Not during the cold open; a bot's tab only for the wake playtests.
   `day.wake`: now(), enabled(); `day:wake` events: start, stretch, roof, ready, back.
   ========================================================================== */

export function startWake() {
  const day = window.day;
  const cfg = window.DAY_CONFIG && window.DAY_CONFIG.wake;
  if (!day || day.wake || !cfg) return null;
  const html = document.documentElement;
  let quiet = false;
  try {
    const id = new URLSearchParams(location.search).get("playtest");
    if (id && id !== "wake-him" && id !== "audio-check" && id !== "any-hour") quiet = true;
  } catch (e) { /* no location */ }

  let phase = "idle"; // idle | stretch | cut | ready
  let t0 = 0;
  let timers = [];
  let readyAt = 0;
  let bedPose = null;
  const log = [];
  const later = (fn, ms) => { const h = setTimeout(() => { timers = timers.filter((x) => x !== h); fn(); }, ms); timers.push(h); return h; };
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  function emit(action, extra) {
    const detail = Object.assign({ action, phase, t: Math.round((performance.now() - t0) / 10) / 100 }, extra || {});
    log.push(detail);
    if (log.length > 30) log.shift();
    window.dispatchEvent(new CustomEvent("day:wake", { detail }));
  }
  const asleep = (fr) => !!(fr && fr.person && ["lie", "side", "recline"].includes(fr.person.pose) && !fr.person.inCar);

  /* The cut to the roof is the heavy frame (the roof, fog and night-sky shaders compile on the first frame that draws them, and a
     software renderer stalls the page for seconds). Pay for it while he is still asleep and nobody has tapped: once at load and
     after each scene change (a clock jump to the night), compile the materials around the roof spot. A stall that lands between the
     tap and the 1.3 s stretch timer used to put "ready" seconds late. */
  let warmedFor = "";
  function prewarm() {
    try {
      if (quiet || phase !== "idle" || !day.transition || !day.transition.warm || !day.control || day.control.mode() !== "schedule") return;
      if (!asleep(day.now && day.now().frame)) return;
      const key = String(Math.round(day.now().minutes / 60));
      if (warmedFor === key) return;
      warmedFor = key;
      Promise.resolve(day.transition.warm(1200, { x: cfg.spot.x, z: cfg.spot.z, r: 45 })).catch(() => {});
    } catch (e) { /* a head start only */ }
  }
  window.addEventListener("day:transition", (e) => { if (e && e.detail && e.detail.action === "end") setTimeout(prewarm, 50); });
  setTimeout(prewarm, 3000);

  function release() {
    const C = day.control;
    if (C.hold) C.hold(false);
    if (C.anim) C.anim(null);
    html.classList.remove("waking");
  }
  function abort(why) {
    if (phase === "idle") return;
    clear();
    release();
    emit("abort", { why });
    phase = "idle";
  }

  function toRoof() {
    const C = day.control;
    if (C.mode() !== "control") return abort("not-in-control");
    phase = "cut";
    const W = window.weather;
    if (W && W.triggerFlash) W.triggerFlash(80, -0.2); // the flash covers the move
    const sp = cfg.spot;
    const cam = cfg.camera;
    C.place(sp.x, sp.z, sp.yaw, { from: sp.from, alpha: cam.alpha, beta: cam.beta, radius: cam.radius });
    if (C.push) C.push({ from: cam.from, fov: 0, secs: cam.secs });
    const sk = cfg.sky || {};
    if (W && W.set && sk.state) W.set(sk.state, sk.intensity || 0.6, "power");
    const P = window.powers || day.powers;
    if (P && P.abilities && P.abilities.reset) P.abilities.reset(cfg.charge || 100);
    emit("roof", { x: sp.x, z: sp.z });
    // Ready the moment the roof pose and the cast input are live, and that moment is the tap itself (begin() runs this in a
    // microtask right after the take event, not on a timer). A timer, even 0.6 s or 1.3 s, queues behind whatever stalls the page
    // after the tap (the roof, fog and night-sky shaders, the first control frame) and landed seconds late: wake.secondsToReady
    // read 100 in the playtest. The flash, the camera dive and the look-up are cosmetic and carry on on their own clocks.
    release();
    phase = "ready";
    readyAt = performance.now();
    if (day.note && cfg.log) day.note(cfg.log);
    emit("ready", { sinceTap: Math.round((readyAt - t0) / 10) / 100 });
    // He wakes looking up at the open sky: the lookup clip plays over his first moments on the roof (a cast or a step overrides it).
    const st = cfg.stretch || {};
    if (C.anim && st.clip) {
      C.anim(st.clip);
      later(() => { if (phase === "ready" && C.anim) C.anim(null); }, (st.secs || 0.9) * 1000);
    }
    if (W && W.triggerFlash && sk.flashAgainSecs) later(() => { try { W.triggerFlash((sk.flash || [90])[0], (sk.flash || [0, -0.3])[1]); } catch (e) { /* */ } }, sk.flashAgainSecs * 1000);
  }

  function begin(via) {
    phase = "stretch";
    t0 = performance.now();
    readyAt = 0;
    const st = cfg.stretch || {};
    emit("start", { via, pose: bedPose });
    emit("stretch", { clip: st.clip });
    // Compile the roof's and the night sky's shaders now, async, so the cut isn't the frame that pays for them.
    try { if (day.transition && day.transition.warm) Promise.resolve(day.transition.warm(900, { x: cfg.spot.x, z: cfg.spot.z, r: 45 })).catch(() => {}); } catch (e) { /* warm is a head start */ }
    // After the other take-event listeners (moments.js pushes its own camera in its own), so the roof dive is the last word.
    Promise.resolve().then(() => { if (phase === "stretch") toRoof(); });
  }

  window.addEventListener("day:control", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "take") {
      if (quiet || (phase !== "idle" && phase !== "ready")) return;
      if (day.coldopen && day.coldopen.active && day.coldopen.active()) return;
      const fr = day.now && day.now().frame;
      if (!asleep(fr)) return;
      bedPose = fr.person.pose;
      begin(d.via);
    } else if (d.action === "let-go") {
      if (phase === "stretch" || phase === "cut") abort("let-go");
    } else if (d.action === "back" && phase === "ready") {
      const fr = day.now && day.now().frame;
      phase = "idle";
      emit("back", { how: d.how, pose: fr && fr.person ? fr.person.pose : null, asleep: asleep(fr), mode: day.now().mode });
    }
  });

  const api = {
    enabled: () => !quiet,
    /** A power pressed before the cut (the cut runs a microtask after the tap, so this is rare): go to the roof now. True if it did. */
    skip(why) {
      if (phase !== "stretch") return false;
      clear();
      emit("skip", { why });
      toRoof();
      return phase === "ready";
    },
    now: () => ({ phase, active: phase === "stretch" || phase === "cut", readyAt, startedAt: t0, bedPose, log: log.slice() }),
  };
  day.wake = api;
  window.wake = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startWake();
