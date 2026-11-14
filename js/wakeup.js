/* ==========================================================================
   Wake him: Take control while Small Weather sleeps (a visit at 03:00 finds him in bed).
   He stretches beside the bed (the lookup clip), a short flash hides the cut, and he is on the apartment roof in night
   weather (fog, far lightning) with the Charge full, ready to cast: about 2.6 s from the tap. Let go and he walks back to
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
    if (id && id !== "wake-him" && id !== "audio-check") quiet = true;
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
    if (C.anim) C.anim(null);
    const sp = cfg.spot;
    const cam = cfg.camera;
    C.place(sp.x, sp.z, sp.yaw, { from: sp.from, alpha: cam.alpha, beta: cam.beta, radius: cam.radius });
    if (C.push) C.push({ from: cam.from, fov: 0, secs: cam.secs });
    const sk = cfg.sky || {};
    if (W && W.set && sk.state) W.set(sk.state, sk.intensity || 0.6, "power");
    const P = window.powers || day.powers;
    if (P && P.abilities && P.abilities.reset) P.abilities.reset(cfg.charge || 100);
    emit("roof", { x: sp.x, z: sp.z });
    later(() => {
      if (phase !== "cut") return;
      release();
      phase = "ready";
      readyAt = performance.now();
      if (day.note && cfg.log) day.note(cfg.log);
      emit("ready", { sinceTap: Math.round((readyAt - t0) / 10) / 100 });
    }, (cfg.cutSecs || 0.35) * 1000 + 250);
    if (W && W.triggerFlash && sk.flashAgainSecs) later(() => { try { W.triggerFlash((sk.flash || [90])[0], (sk.flash || [0, -0.3])[1]); } catch (e) { /* */ } }, sk.flashAgainSecs * 1000);
  }

  function begin(via) {
    const C = day.control;
    phase = "stretch";
    t0 = performance.now();
    readyAt = 0;
    html.classList.add("waking");
    if (C.hold) C.hold(true);
    const st = cfg.stretch || {};
    if (C.anim && st.clip) C.anim(st.clip);
    emit("start", { via, pose: bedPose });
    emit("stretch", { clip: st.clip });
    later(toRoof, (st.secs || 1.3) * 1000);
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
    now: () => ({ phase, active: phase === "stretch" || phase === "cut", readyAt, startedAt: t0, bedPose, log: log.slice() }),
  };
  day.wake = api;
  window.wake = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startWake();
