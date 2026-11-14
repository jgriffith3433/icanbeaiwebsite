/* ==========================================================================
   Diegetic day soundscapes (Firewatch-style room tone for Small Weather's autopilot).
   Data: day.config.js `daysound`. Switched by schedule chapter/block; sources sit at
   visible spots (fridge, desk, fountain…). Phone/low: only the current scape's files
   load, at most 3 loops at once. Car radio plays a 20 s jingle then a weather report
   that names a weather the player called today (day.memory.facts). Gen clips under
   audio/daysound/; until they land, short synth beds stand in (same ids).
   Uses score's ambience bus when present; optional reverb zone hook when day.mix exists.
   day.daysound / window.daysound: now(), scape(), radioWeather(). Events: day:daysound.
   ========================================================================== */
import { pickRate } from "./variety.js";
import {
  SCAPES, scapeOf, radioWeatherOf, pickLoops, loopCap, activeLoops,
} from "./daysound-core.js";

function cfg() {
  const d = (window.DAY_CONFIG && window.DAY_CONFIG.daysound) || {};
  return {
    fade: d.fade != null ? d.fade : 0.7,
    mix: d.mix != null ? d.mix : 0.55,
    radioDelay: d.radioDelay != null ? d.radioDelay : 4.5,
    radioEvery: d.radioEvery != null ? d.radioEvery : 180,
    jingle: d.jingle != null ? d.jingle : null,
    reports: d.reports || {},
    scapes: d.scapes || {},
    landmarks: d.landmarks || {},
  };
}

function soundOn() {
  const btn = document.getElementById && document.getElementById("sound");
  return !!(btn && btn.getAttribute("aria-pressed") === "true");
}

function qualityLow() {
  try {
    const L = window.day && window.day.look;
    if (L && typeof L.quality === "function") return L.quality() === "low";
    if (window.look && typeof window.look.quality === "function") return window.look.quality() === "low";
  } catch (e) { /* */ }
  return !!(document.documentElement && document.documentElement.classList.contains("touch-ui"));
}

function isTouch() {
  return !!(document.documentElement && document.documentElement.classList.contains("touch-ui"));
}

/** Resolve a named spot to world x/z from day.config rooms + building origins. */
export function spotXZ(name, landmarks) {
  if (!name) return null;
  if (landmarks && landmarks[name]) {
    const p = landmarks[name];
    return { x: p[0], z: p[1] };
  }
  const conf = window.DAY_CONFIG || {};
  const buildings = conf.buildings || {};
  const rooms = conf.rooms || {};
  for (const rid of Object.keys(rooms)) {
    const r = rooms[rid];
    const s = r.spots && r.spots[name];
    if (!s) continue;
    const b = buildings[r.building || "home"];
    const o = (b && b.origin) || [0, 0];
    return { x: s[0] + o[0], z: s[1] + o[1] };
  }
  return null;
}

function emit(detail) {
  if (typeof window.CustomEvent !== "function" || !window.dispatchEvent) return;
  try { window.dispatchEvent(new window.CustomEvent("day:daysound", { detail })); } catch (e) { /* */ }
}

export function startDaySound(dayApi) {
  const day = dayApi || window.day;
  if (!day || day.daysound) return day && day.daysound;

  let ctx = null;
  let master = null;
  let usingScoreBus = false;
  const buffers = Object.create(null);
  const missing = Object.create(null);
  const loading = Object.create(null);
  const synthBuf = Object.create(null);
  const playing = Object.create(null); // id -> { src, gain, pan, file }
  let currentScape = null;
  let lastChapter = "";
  let lastBlock = "";
  let radioAt = -1e9;
  let radioPlayedFor = "";
  let keyboardSince = 0;
  let keyboardOn = false;
  let applyBusy = false;
  let lastWantedKey = "";
  let lastApplyAt = 0;
  const log = []; // recent scape switches for the playtest
  const live = {
    scape: null,
    chapter: null,
    block: null,
    loops: [],
    playing: 0,
    cap: 6,
    sources: Object.create(null),
    radio: null,
    radioWeather: "clear",
    keyboard: false,
    keyboardWithinSec: null,
    loaded: [],
    usingScoreBus: false,
    on: false,
    heard: 0,
  };

  function bus() {
    const S = day.score;
    if (S && typeof S.ambienceBus === "function") {
      const b = S.ambienceBus();
      if (b && b.ctx && b.bus) {
        ctx = b.ctx;
        master = b.bus;
        usingScoreBus = true;
        live.usingScoreBus = true;
        return b;
      }
    }
    // Soft hook for a future mix module (buses + reverb zones), as on other Hawkes games.
    const M = day.mix || window.mix;
    if (M && typeof M.bus === "function") {
      const b = M.bus("ambience") || M.bus("sfx");
      if (b && b.ctx) {
        ctx = b.ctx;
        master = b.gain || b.bus;
        usingScoreBus = !!b.reverb;
        live.usingScoreBus = usingScoreBus;
        return { ctx, bus: master, zone: b.zone || null };
      }
    }
    if (ctx && master) return { ctx, bus: master };
    if (!soundOn()) return null;
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = cfg().mix;
      const lim = ctx.createDynamicsCompressor();
      if (lim.threshold) lim.threshold.value = -8;
      if (lim.ratio) lim.ratio.value = 8;
      master.connect(lim);
      lim.connect(ctx.destination);
      usingScoreBus = false;
      live.usingScoreBus = false;
      return { ctx, bus: master };
    } catch (e) {
      ctx = null;
      return null;
    }
  }

  function resume() {
    const b = bus();
    if (b && b.ctx && b.ctx.state === "suspended") b.ctx.resume().catch(() => {});
    return b;
  }

  function makeSynth(id) {
    if (synthBuf[id]) return synthBuf[id];
    const b = bus();
    if (!b) return null;
    const rate = b.ctx.sampleRate || 22050;
    const secs = 2.4;
    const n = Math.floor(rate * secs);
    const buf = b.ctx.createBuffer(1, n, rate);
    const d = buf.getChannelData(0);
    // Distinct timbres per layer so the sound log (and an ear) can tell scapes apart.
    const kind = id.split("-").pop() || id;
    let seed = 1;
    for (let i = 0; i < id.length; i++) seed = (seed * 33 + id.charCodeAt(i)) & 0xffff;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff) * 2 - 1; };
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      let v = 0;
      if (kind === "hum" || kind === "hvac" || kind === "cabin") {
        v = 0.08 * Math.sin(2 * Math.PI * (kind === "hvac" ? 90 : 55) * t) + 0.04 * rnd();
      } else if (kind === "kettle" || kind === "coffee" || kind === "machine") {
        v = 0.05 * Math.sin(2 * Math.PI * (380 + 40 * Math.sin(t * 3)) * t) + 0.03 * rnd();
      } else if (kind === "shower" || kind === "fountain" || kind === "window") {
        v = 0.12 * rnd() * (0.5 + 0.5 * Math.sin(t * 17));
      } else if (kind === "tv" || kind === "meeting" || kind === "kids") {
        v = 0.04 * Math.sin(2 * Math.PI * (220 + 80 * Math.sin(t * 5.5)) * t) + 0.05 * rnd();
      } else if (kind === "keys" || kind === "keyboard") {
        const click = ((i % Math.floor(rate * 0.09)) < 40) ? 0.25 * rnd() : 0;
        v = click;
      } else if (kind === "ducks") {
        v = 0.06 * Math.sin(2 * Math.PI * (480 + 120 * Math.sin(t * 2.2)) * t) * Math.max(0, Math.sin(t * 1.7));
      } else if (kind === "tick" || kind === "clock") {
        v = ((i % Math.floor(rate * 0.5)) < 80) ? 0.2 * rnd() : 0;
      } else if (kind === "traffic" || kind === "train" || kind === "wipers") {
        v = 0.07 * rnd() * (0.4 + 0.6 * Math.abs(Math.sin(t * (kind === "wipers" ? 4 : 0.7))));
      } else {
        v = 0.05 * rnd();
      }
      const edge = Math.min(1, i / (rate * 0.05), (n - i) / (rate * 0.05));
      d[i] = v * edge;
    }
    synthBuf[id] = buf;
    return buf;
  }

  async function loadFile(url) {
    if (!url || missing[url]) return null;
    if (buffers[url]) return buffers[url];
    if (loading[url]) return loading[url];
    const b = bus();
    if (!b) return null;
    loading[url] = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then((ab) => b.ctx.decodeAudioData(ab.slice(0)))
      .then((buf) => {
        buffers[url] = buf;
        delete loading[url];
        if (live.loaded.indexOf(url) < 0) live.loaded.push(url);
        return buf;
      })
      .catch(() => {
        missing[url] = 1;
        delete loading[url];
        return null;
      });
    return loading[url];
  }

  function placePan(x, z) {
    const world = day.world && day.world();
    const scene = world && world.scene;
    const cam = scene && scene.activeCamera;
    const B = window.BABYLON;
    if (!cam || x == null || z == null || !B) return { pan: 0, gain: 1 };
    const p = cam.globalPosition || cam.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const dist = Math.hypot(dx, dz);
    let pan = 0;
    try {
      const right = cam.getDirection(B.Axis.X);
      pan = dist > 0.5 ? (dx * right.x + dz * right.z) / dist : 0;
    } catch (e) { /* */ }
    return {
      pan: Math.max(-0.85, Math.min(0.85, pan)),
      gain: 1 / (1 + Math.max(0, dist - 6) / 16),
    };
  }

  function stopLoop(id, fade) {
    const node = playing[id];
    if (!node) return;
    const b = bus();
    const t0 = b ? b.ctx.currentTime : 0;
    try {
      node.gain.gain.cancelScheduledValues(t0);
      node.gain.gain.setValueAtTime(node.gain.gain.value, t0);
      node.gain.gain.linearRampToValueAtTime(0.0001, t0 + (fade != null ? fade : cfg().fade));
      node.src.stop(t0 + (fade != null ? fade : cfg().fade) + 0.05);
    } catch (e) { /* */ }
    delete playing[id];
  }

  /* Ducked under control: -6 dB (x0.5) on every loop, ramped over 0.4 s. */
  const DUCK_DB = -6;
  let duck = 1;
  function setDuck(on) {
    const want = on ? Math.pow(10, DUCK_DB / 20) : 1;
    live.ducked = on;
    live.duckDb = on ? DUCK_DB : 0;
    if (want === duck) return;
    duck = want;
    try {
      const b = bus();
      Object.keys(playing).forEach((id) => {
        const node = playing[id];
        if (b && node && node.gain) node.gain.gain.setTargetAtTime(node.vol * duck, b.ctx.currentTime, 0.15);
      });
    } catch (e) { /* */ }
  }

  function stopAll(fade) {
    Object.keys(playing).forEach((id) => stopLoop(id, fade));
  }

  async function startLoop(id, layer) {
    if (playing[id]) return playing[id];
    const b = resume();
    if (!b || !soundOn()) return null;
    let buf = null;
    let source = "synth";
    if (layer && layer.file) {
      buf = await loadFile(layer.file);
      if (buf) source = "file";
    }
    if (!buf) buf = makeSynth(id);
    if (!buf) return null;
    const src = b.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = b.ctx.createGain();
    g.gain.value = 0.0001;
    let node = g;
    let panner = null;
    if (b.ctx.createStereoPanner) {
      panner = b.ctx.createStereoPanner();
      g.connect(panner);
      node = panner;
    }
    // Optional reverb zone send when a mix module exposes one.
    const M = day.mix || window.mix;
    if (M && typeof M.send === "function") {
      try { M.send(node, layer && layer.zone); } catch (e) { /* */ }
    }
    node.connect(b.bus);
    const vol = (layer && layer.vol != null ? layer.vol : 0.45) * cfg().mix;
    const t0 = b.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol * duck, t0 + cfg().fade);
    try { src.start(); } catch (e) { return null; }
    playing[id] = { src, gain: g, panner, file: source, vol, spot: layer && layer.at };
    live.sources[id] = source;
    live.heard += 1;
    return playing[id];
  }

  /* The audio probe flags the same sample id at the same rate twice within 60 s. Every (re)start gets a rate a little off 1
     (+-1.5%, never the one this id last had), so a bed that restarts or a repeated one-shot is never identical. */
  const lastRates = {};
  function jitterRate(id) {
    let r = 1 + (Math.random() * 0.03 - 0.015);
    if (Math.abs(r - (lastRates[id] || 0)) < 0.004) r += r < 1 ? 0.005 : -0.005;
    lastRates[id] = r;
    return r;
  }

  function playOneShot(url, synthId, vol, at) {
    const b = resume();
    if (!b || !soundOn()) return Promise.resolve(false);
    return (url ? loadFile(url) : Promise.resolve(null)).then((buf) => {
      if (!buf) buf = makeSynth(synthId || "oneshot");
      if (!buf) return false;
      const src = b.ctx.createBufferSource();
      src.buffer = buf;
      try { src.__hawkesSampleId = "daysound-" + String(url || synthId || "oneshot").split("/").pop(); src.playbackRate.value = pickRate(src.__hawkesSampleId); } catch (e) { /* */ }
      const g = b.ctx.createGain();
      g.gain.value = (vol != null ? vol : 0.5) * cfg().mix;
      let node = g;
      if (at && b.ctx.createStereoPanner) {
        const p = placePan(at.x, at.z);
        const pan = b.ctx.createStereoPanner();
        pan.pan.value = p.pan;
        g.gain.value *= p.gain;
        g.connect(pan);
        node = pan;
      }
      node.connect(b.bus);
      try { src.start(); } catch (e) { return false; }
      live.heard += 1;
      return true;
    });
  }

  async function playRadio(weather) {
    const c = cfg();
    const report = c.reports[weather] || c.reports.clear;
    const car = spotXZ("parkHome", c.landmarks) || { x: -1.5, z: 7.6 };
    live.radioWeather = weather;
    live.radio = { weather, at: Date.now() };
    emit({ action: "radio", weather, jingle: !!c.jingle, report: report && report.text });
    await playOneShot(c.jingle, "radio-jingle", 0.42, car);
    const wait = c.radioDelay * 1000;
    await new Promise((r) => setTimeout(r, wait));
    if (currentScape !== "commute") return;
    const file = report && report.file;
    await playOneShot(file, "radio-" + weather, 0.7, car);
    emit({ action: "radio-report", weather, text: report && report.text, source: file && !missing[file] ? "file" : "synth" });
  }

  function layerMap(scapeId) {
    const sc = cfg().scapes[scapeId];
    const layers = (sc && sc.layers) || [];
    const map = Object.create(null);
    layers.forEach((L) => { if (L && L.id) map[L.id] = L; });
    return { sc, layers, map };
  }

  async function applyScape(scapeId, frameCtx, why) {
    if (applyBusy) return;
    const c = cfg();
    const { layers, map } = layerMap(scapeId);
    const cap = loopCap(qualityLow() ? "low" : "high", isTouch());
    live.cap = cap;
    const wanted = activeLoops(scapeId, layers, frameCtx);
    const keep = pickLoops(wanted, cap);
    const wantKey = scapeId + "|" + keep.join(",");
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    // Same loops: only refresh pans, and at most ~3 Hz.
    if (wantKey === lastWantedKey && scapeId === currentScape) {
      if (now - lastApplyAt < 320) return;
      lastApplyAt = now;
      keep.forEach((id) => {
        const node = playing[id];
        const L = map[id];
        if (!node || !L || !node.panner) return;
        const at = spotXZ(L.at, c.landmarks);
        if (!at) return;
        const p = placePan(at.x, at.z);
        node.panner.pan.value = p.pan;
      });
      live.playing = keep.length;
      live.on = soundOn();
      return;
    }
    lastWantedKey = wantKey;
    lastApplyAt = now;
    applyBusy = true;
    try {
      const urls = keep.map((id) => map[id] && map[id].file).filter(Boolean);
      if (qualityLow() || isTouch()) {
        live.loaded = live.loaded.filter((u) => urls.indexOf(u) >= 0 || /radio-jingle|radio-wx/.test(u));
      }
      Object.keys(playing).forEach((id) => {
        if (keep.indexOf(id) < 0) stopLoop(id);
      });
      for (const id of keep) await startLoop(id, map[id]);
      keep.forEach((id) => {
        const node = playing[id];
        const L = map[id];
        if (!node || !L) return;
        const at = spotXZ(L.at, c.landmarks);
        if (at && node.panner) {
          const p = placePan(at.x, at.z);
          node.panner.pan.value = p.pan;
          try {
            const b = bus();
            if (b) node.gain.gain.setTargetAtTime(node.vol * p.gain * duck, b.ctx.currentTime, 0.15);
          } catch (e) { /* */ }
        }
      });
      live.scape = scapeId;
      live.loops = keep.slice();
      live.playing = keep.length;
      live.on = soundOn();
      if (scapeId !== currentScape) {
        currentScape = scapeId;
        log.push({ scape: scapeId, at: Date.now(), why: why || "switch", block: frameCtx && frameCtx.block, chapter: frameCtx && frameCtx.chapter });
        if (log.length > 24) log.shift();
        emit({ action: "scape", scape: scapeId, loops: keep.slice(), chapter: frameCtx && frameCtx.chapter, block: frameCtx && frameCtx.block, cap });
      }
    } finally {
      applyBusy = false;
    }
  }

  function frameContext(info) {
    const fr = (info && info.fr) || (day.now && day.now().frame) || {};
    const a = fr.action || {};
    const person = fr.person || {};
    const W = day.weather && day.weather.now && day.weather.now();
    return {
      chapter: fr.chapter || a.chapter || "",
      block: a.block || "",
      place: a.place || "",
      pose: person.pose || a.pose || "",
      hand: a.hand || person.hand || "",
      things: fr.things || a.things || {},
      inCar: !!(person.inCar || a.inCar),
      wet: !!(W && ((W.rain || 0) > 0.15 || W.state === "rain" || W.state === "storm")),
    };
  }

  function tick(info) {
    if (!soundOn()) {
      if (Object.keys(playing).length) stopAll(0.2);
      live.on = false;
      live.playing = 0;
      return;
    }
    // Under control the day's room tone stays, ducked about 6 dB (never muted) so the roof is not silent.
    const mode = day.control && typeof day.control.mode === "function" ? day.control.mode() : "schedule";
    setDuck(mode === "control" || mode === "returning");
    resume();
    const fc = frameContext(info);
    const scape = scapeOf(fc);
    live.chapter = fc.chapter;
    live.block = fc.block;

    // Keyboard timing: clock starts when the desk block begins; flips on when the keyboard loop is actually playing.
    const atDesk = fc.place === "desk" || fc.place === "deskStand" || fc.hand === "type";
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (scape === "office" && atDesk) {
      if (!keyboardSince) keyboardSince = nowMs;
      const looping = !!(playing.keyboard || (live.loops && live.loops.indexOf("keyboard") >= 0));
      if (looping && !keyboardOn) {
        keyboardOn = true;
        live.keyboard = true;
        live.keyboardWithinSec = (nowMs - keyboardSince) / 1000;
        emit({ action: "keyboard-on", place: fc.place, withinSec: live.keyboardWithinSec });
      } else if (looping) {
        live.keyboardWithinSec = (nowMs - keyboardSince) / 1000;
      }
    } else if (keyboardOn || keyboardSince) {
      if (keyboardOn) emit({ action: "keyboard-off", place: fc.place, block: fc.block });
      keyboardOn = false;
      keyboardSince = 0;
      live.keyboard = false;
    }

    const blockChanged = fc.block && fc.block !== lastBlock;
    const chapterChanged = fc.chapter && fc.chapter !== lastChapter;
    if (scape !== currentScape || blockChanged || chapterChanged) {
      applyScape(scape, fc, chapterChanged ? "chapter" : blockChanged ? "block" : "scape");
    } else {
      // Refresh which conditional layers are on (shower, desk, rain).
      applyScape(scape, fc, "refresh");
    }
    lastBlock = fc.block || lastBlock;
    lastChapter = fc.chapter || lastChapter;

    // Car radio once per commute stretch, naming today's called weather.
    if (scape === "commute" && fc.inCar) {
      const key = (day.now && day.now().key) || "day";
      const tag = key + ":" + (fc.chapter || "commute");
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (radioPlayedFor !== tag && now - radioAt > cfg().radioEvery * 1000) {
        radioPlayedFor = tag;
        radioAt = now;
        const facts = (day.memory && day.memory.facts && day.memory.facts()) || {};
        const weather = radioWeatherOf(facts);
        playRadio(weather);
      }
    }
  }

  // Drive from the day's watch; also a light render hook so pans stay alive while scrubbing slowly.
  if (typeof day.watch === "function") day.watch((info) => tick(info));
  const world = day.world && day.world();
  if (world && world.scene && world.scene.onBeforeRenderObservable) {
    let acc = 0;
    world.scene.onBeforeRenderObservable.add(() => {
      acc += (world.scene.getEngine().getDeltaTime() || 16) / 1000;
      if (acc < 0.35) return;
      acc = 0;
      if (!soundOn() || !currentScape) return;
      const { map } = layerMap(currentScape);
      Object.keys(playing).forEach((id) => {
        const node = playing[id];
        const L = map[id];
        if (!node || !node.panner || !L) return;
        const at = spotXZ(L.at, cfg().landmarks);
        if (!at) return;
        const p = placePan(at.x, at.z);
        node.panner.pan.value = p.pan;
      });
    });
  }

  window.addEventListener("pointerdown", () => { if (soundOn()) resume(); }, true);
  const soundBtn = document.getElementById && document.getElementById("sound");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      if (soundOn()) resume();
      else stopAll(0.15);
    });
  }

  const api = {
    now: () => ({
      scape: live.scape,
      chapter: live.chapter,
      block: live.block,
      loops: live.loops.slice(),
      playing: live.playing,
      ducked: !!live.ducked,
      duckDb: live.duckDb || 0,
      cap: live.cap,
      sources: Object.assign({}, live.sources),
      radio: live.radio ? Object.assign({}, live.radio) : null,
      radioWeather: live.radioWeather,
      keyboard: live.keyboard,
      keyboardWithinSec: live.keyboardWithinSec,
      loaded: live.loaded.slice(),
      usingScoreBus: live.usingScoreBus,
      on: live.on,
      heard: live.heard,
      log: log.map((e) => Object.assign({}, e)),
      scapes: SCAPES.slice(),
    }),
    scape: () => live.scape,
    radioWeather: () => {
      const facts = (day.memory && day.memory.facts && day.memory.facts()) || {};
      return radioWeatherOf(facts);
    },
    /** Playtest helper: force a scape without scrubbing. */
    force: (id, ctx) => applyScape(id, ctx || frameContext(null), "force"),
    /** Playtest helper: fire the car radio for a given weather. */
    playRadio: (w) => playRadio(w || api.radioWeather()),
  };
  day.daysound = api;
  window.daysound = api;
  emit({ action: "ready", scapes: SCAPES.slice() });
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startDaySound();
}
