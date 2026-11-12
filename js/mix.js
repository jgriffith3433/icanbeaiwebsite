/* ==========================================================================
   The mix: buses (music, ambience, sfx, voice, UI) → makeup → compressor →
   limiter → destination. World sounds get HRTF (or stereo pan on low) with
   inverse-distance roll-off and a building occlusion low-pass. Six synthesised
   convolution reverb zones crossfade over 0.5 s. Voice ducks music −8 dB and
   ambience −4 dB (150 ms attack). Settings: Music / Effects / Voice sliders
   (icanbe.mix.*). day.audio.info() for playtests.

   Import before score.js / sfx.js / voice.js so they can share this context.
   Pure helpers: js/mix-core.js.
   ========================================================================== */

import {
  ZONES, DUCK, IR_SHAPE, PLAZA, duckGains, dbToGain, zoneAt, fillImpulse,
  occludeCutoffHz, occludeGainDb, anyBoxBlocks,
} from "./mix-core.js";

const LEVELS_KEY = "icanbe.mix";
const CROSSFADE_SEC = 0.5;
const TARGET_LUFS = -16;
const MAKEUP_MAX = 2.2;
const OCCLUSION_THROTTLE_MS = 80;

function soundOn() {
  const btn = document.getElementById && document.getElementById("sound");
  return !!(btn && btn.getAttribute("aria-pressed") === "true");
}

function lowQuality() {
  try {
    if (window.day && window.day.look && typeof window.day.look.quality === "function") {
      return window.day.look.quality() === "low";
    }
  } catch (e) { /* */ }
  return !!(document.documentElement && document.documentElement.classList.contains("touch-ui"));
}

function readLevels() {
  const out = { music: 0.85, effects: 0.9, voice: 1 };
  try {
    const raw = localStorage.getItem(LEVELS_KEY);
    if (!raw) return out;
    const j = JSON.parse(raw);
    if (j && typeof j === "object") {
      if (j.music != null) out.music = clamp01(j.music);
      if (j.effects != null) out.effects = clamp01(j.effects);
      if (j.voice != null) out.voice = clamp01(j.voice);
    }
  } catch (e) { /* private */ }
  return out;
}

function writeLevels(levels) {
  try { localStorage.setItem(LEVELS_KEY, JSON.stringify(levels)); } catch (e) { /* */ }
}

function clamp01(v) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function buildingBoundsFromConfig() {
  const cfg = (window.DAY_CONFIG && window.DAY_CONFIG.buildings) || {};
  const home = cfg.home || {};
  const office = cfg.office || {};
  const ho = home.origin || [0, 0];
  const hb = home.bounds || [-7, -3.6, 11, 4.6];
  const oo = office.origin || [128, 0];
  const ob = office.bounds || [0, -3.6, 18, 4.6];
  return {
    home: { x0: ho[0] + hb[0], z0: ho[1] + hb[1], x1: ho[0] + hb[2], z1: ho[1] + hb[3] },
    office: { x0: oo[0] + ob[0], z0: oo[1] + ob[1], x1: oo[0] + ob[2], z1: oo[1] + ob[3] },
    plaza: PLAZA,
    roofY: 4.2,
  };
}

function solidBoxes(bounds) {
  const boxes = [];
  if (bounds.home) boxes.push(bounds.home);
  if (bounds.office) boxes.push(bounds.office);
  const city = (window.DAY_CONFIG && window.DAY_CONFIG.city) || {};
  const blocks = city.blocks || [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || b.w == null) continue;
    const hw = (b.w || 0) * 0.5;
    const hd = (b.d || 0) * 0.5;
    boxes.push({ x0: b.x - hw, z0: b.z - hd, x1: b.x + hw, z1: b.z + hd });
  }
  return boxes;
}

export function startMix(dayApi) {
  const day = dayApi || window.day;
  if (!day || day.mix) return day && day.mix;

  let ctx = null;
  let master = null;
  let makeup = null;
  let compressor = null;
  let limiter = null;
  let analyser = null;
  const buses = Object.create(null); // name -> { gain, duckGain?, levelGain }
  let levels = readLevels();
  let unlocked = false;
  let zone = "street";
  let zoneTarget = "street";
  let zoneT = 1;
  let duckOn = false;
  let duckMusic = 1;
  let duckAmb = 1;
  let duckUntil = 0;
  let voicePlaying = false;
  let loudness = TARGET_LUFS;
  let makeupK = 1;
  const reverb = Object.create(null); // zone -> { convolver, wet, drySend }
  let reverbIn = null; // merger gain into current wet blend
  const zoneWet = Object.create(null);
  ZONES.forEach((z) => { zoneWet[z] = z === "street" ? 1 : 0; });
  const spatials = []; // active { panner, filter, gain, x, y, z, lastOcc, occluded }
  let lastOccAt = 0;
  let boxes = [];
  let bounds = buildingBoundsFromConfig();
  const log = []; // recent audio log lines for the playtest
  const live = {
    zone: "street",
    zones: ZONES.slice(),
    buses: { music: 0, ambience: 0, sfx: 0, voice: 0, ui: 0 },
    duck: { on: false, musicDb: 0, ambienceDb: 0, attackMs: DUCK.attackMs },
    levels: { ...levels },
    loudness: TARGET_LUFS,
    spatial: { hrtf: true, active: 0, occluded: 0 },
    reverb: { wet: 0, label: IR_SHAPE.street.label },
    on: false,
    unlocked: false,
  };

  function note(msg, detail) {
    const row = { t: (typeof performance !== "undefined" ? performance.now() : Date.now()), msg, detail: detail || null };
    log.push(row);
    if (log.length > 80) log.shift();
    try {
      window.dispatchEvent(new CustomEvent("day:audio", { detail: { action: "log", msg, ...(detail || {}) } }));
    } catch (e) { /* */ }
  }

  function ensureCtx() {
    if (ctx) return ctx;
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.9;
      makeup = ctx.createGain();
      makeup.gain.value = 1;
      compressor = ctx.createDynamicsCompressor();
      if (compressor.threshold) compressor.threshold.value = -18;
      if (compressor.knee) compressor.knee.value = 8;
      if (compressor.ratio) compressor.ratio.value = 3;
      if (compressor.attack) compressor.attack.value = 0.01;
      if (compressor.release) compressor.release.value = 0.22;
      limiter = ctx.createDynamicsCompressor();
      if (limiter.threshold) limiter.threshold.value = -1.2;
      if (limiter.knee) limiter.knee.value = 0.5;
      if (limiter.ratio) limiter.ratio.value = 20;
      if (limiter.attack) limiter.attack.value = 0.002;
      if (limiter.release) limiter.release.value = 0.12;
      analyser = ctx.createAnalyser ? ctx.createAnalyser() : null;
      if (analyser) {
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
      }
      // Buses
      ["music", "ambience", "sfx", "voice", "ui"].forEach((name) => {
        const levelGain = ctx.createGain();
        levelGain.gain.value = 1;
        const duckGain = ctx.createGain();
        duckGain.gain.value = 1;
        const gain = ctx.createGain();
        gain.gain.value = 1;
        gain.connect(duckGain);
        duckGain.connect(levelGain);
        levelGain.connect(master);
        buses[name] = { gain, duckGain, levelGain, name };
      });
      master.connect(makeup);
      makeup.connect(compressor);
      compressor.connect(limiter);
      if (analyser) {
        limiter.connect(analyser);
        analyser.connect(ctx.destination);
      } else {
        limiter.connect(ctx.destination);
      }
      // Reverb send bus: each zone convolver → wet gain → master
      reverbIn = ctx.createGain();
      reverbIn.gain.value = 1;
      ZONES.forEach((z) => buildIr(z));
      applyLevels();
    } catch (err) {
      ctx = null;
      console.warn("[mix] AudioContext failed", err);
      return null;
    }
    return ctx;
  }

  function buildIr(z) {
    if (!ctx || reverb[z]) return reverb[z];
    const shape = IR_SHAPE[z] || IR_SHAPE.street;
    const secs = Math.min(2.4, Math.max(0.2, shape.decaySec * 2.2));
    const n = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    fillImpulse(L, ctx.sampleRate, z);
    // Slightly decorrelated right channel.
    fillImpulse(R, ctx.sampleRate, z);
    for (let i = 0; i < n; i++) R[i] = R[i] * 0.92 + (L[i] * 0.08);
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    const wet = ctx.createGain();
    wet.gain.value = z === zone ? shape.wet : 0;
    reverbIn.connect(conv);
    conv.connect(wet);
    wet.connect(master);
    reverb[z] = { convolver: conv, wet, shape };
    return reverb[z];
  }

  function applyLevels() {
    if (!buses.music) return;
    const m = levels.music;
    const e = levels.effects;
    const v = levels.voice;
    buses.music.levelGain.gain.value = m;
    buses.ambience.levelGain.gain.value = e;
    buses.sfx.levelGain.gain.value = e;
    buses.ui.levelGain.gain.value = e;
    buses.voice.levelGain.gain.value = v;
    live.levels = { music: m, effects: e, voice: v };
  }

  function setLevels(partial, persist) {
    if (partial) {
      if (partial.music != null) levels.music = clamp01(partial.music);
      if (partial.effects != null) levels.effects = clamp01(partial.effects);
      if (partial.voice != null) levels.voice = clamp01(partial.voice);
    }
    applyLevels();
    if (persist !== false) writeLevels(levels);
    return { ...levels };
  }

  function unlock() {
    ensureCtx();
    if (!ctx) return false;
    unlocked = true;
    live.unlocked = true;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    bounds = buildingBoundsFromConfig();
    boxes = solidBoxes(bounds);
    return true;
  }

  function bus(name) {
    ensureCtx();
    if (!ctx) return null;
    const b = buses[name] || buses.sfx;
    return { ctx, bus: b.gain, gain: b.gain, reverb: reverbIn, zone, name: b.name };
  }

  /** Route a node into a bus and (optionally) the reverb send. */
  function send(node, zoneName) {
    if (!node || !ensureCtx()) return null;
    const b = buses[zoneName && buses[zoneName] ? zoneName : "sfx"] || buses.sfx;
    try { node.connect(b.gain); } catch (e) { /* already */ }
    if (reverbIn) {
      try {
        const tap = ctx.createGain();
        tap.gain.value = 0.35;
        node.connect(tap);
        tap.connect(reverbIn);
      } catch (e) { /* */ }
    }
    return b;
  }

  function setDuck(on, holdMs) {
    duckOn = !!on;
    voicePlaying = duckOn;
    if (duckOn) {
      duckUntil = (typeof performance !== "undefined" ? performance.now() : Date.now()) + (holdMs != null ? holdMs : 2800);
    }
    live.duck.on = duckOn;
    const g = duckGains(duckOn);
    live.duck.musicDb = duckOn ? DUCK.musicDb : 0;
    live.duck.ambienceDb = duckOn ? DUCK.ambienceDb : 0;
    if (ctx && buses.music) {
      const t = ctx.currentTime;
      const atk = DUCK.attackMs / 1000;
      const rel = DUCK.releaseMs / 1000;
      const m = buses.music.duckGain.gain;
      const a = buses.ambience.duckGain.gain;
      m.cancelScheduledValues(t);
      a.cancelScheduledValues(t);
      m.setValueAtTime(m.value, t);
      a.setValueAtTime(a.value, t);
      if (duckOn) {
        m.linearRampToValueAtTime(g.music, t + atk);
        a.linearRampToValueAtTime(g.ambience, t + atk);
        duckMusic = g.music;
        duckAmb = g.ambience;
        note("duck-on", { musicDb: DUCK.musicDb, ambienceDb: DUCK.ambienceDb, attackMs: DUCK.attackMs });
      } else {
        m.linearRampToValueAtTime(1, t + rel);
        a.linearRampToValueAtTime(1, t + rel);
        duckMusic = 1;
        duckAmb = 1;
        note("duck-off", {});
      }
    }
  }

  /**
   * Place a world source: returns { input, panner, filter, gain, stop }.
   * Connect your source into `.input`. HRTF on high; equalpower / stereo on low.
   */
  function place(x, y, z, opts) {
    opts = opts || {};
    if (!ensureCtx()) return null;
    const input = ctx.createGain();
    input.gain.value = 1;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 18000;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    const baseGain = opts.gain != null ? opts.gain : 1;
    gain.gain.value = baseGain;
    const busName = opts.bus || "sfx";
    const dest = (buses[busName] || buses.sfx).gain;
    let panner = null;
    let stereo = null;
    const useHrtf = !lowQuality() && !!ctx.createPanner;
    if (useHrtf) {
      panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = opts.refDistance != null ? opts.refDistance : 4;
      panner.maxDistance = opts.maxDistance != null ? opts.maxDistance : 80;
      panner.rolloffFactor = opts.rolloff != null ? opts.rolloff : 1;
      try {
        if (panner.positionX) {
          panner.positionX.value = -(Number(x) || 0); // Babylon left-handed → WebAudio right-handed
          panner.positionY.value = Number(y) || 0;
          panner.positionZ.value = Number(z) || 0;
        } else if (panner.setPosition) {
          panner.setPosition(-(Number(x) || 0), Number(y) || 0, Number(z) || 0);
        }
      } catch (e) { /* */ }
      input.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
    } else if (ctx.createStereoPanner) {
      stereo = ctx.createStereoPanner();
      stereo.pan.value = 0;
      input.connect(filter);
      filter.connect(stereo);
      stereo.connect(gain);
    } else {
      input.connect(filter);
      filter.connect(gain);
    }
    gain.connect(dest);
    if (reverbIn && opts.reverb !== false) {
      const tap = ctx.createGain();
      tap.gain.value = 0.3;
      gain.connect(tap);
      tap.connect(reverbIn);
    }
    const entry = {
      input, panner, stereo, filter, gain, baseGain, x, y: y || 0, z, occluded: false, lastOcc: 0, useHrtf, busName,
      stop() {
        const i = spatials.indexOf(entry);
        if (i >= 0) spatials.splice(i, 1);
        try { input.disconnect(); } catch (e) { /* */ }
      },
      move(nx, ny, nz) {
        entry.x = nx; entry.y = ny || 0; entry.z = nz;
        if (panner) {
          try {
            if (panner.positionX) {
              panner.positionX.value = -nx;
              panner.positionY.value = ny || 0;
              panner.positionZ.value = nz;
            } else if (panner.setPosition) panner.setPosition(-nx, ny || 0, nz);
          } catch (e) { /* */ }
        }
      },
    };
    spatials.push(entry);
    updateOneSpatial(entry, true);
    return entry;
  }

  function listenerPos() {
    const w = day.world && day.world();
    const cam = w && w.scene && w.scene.activeCamera;
    if (cam && (cam.globalPosition || cam.position)) {
      const p = cam.globalPosition || cam.position;
      return { x: p.x, y: p.y, z: p.z };
    }
    return personPos();
  }

  function personPos() {
    try {
      if (day.control && typeof day.control.mode === "function" && day.control.mode() === "control" && day.control.state) {
        const s = day.control.state();
        return { x: s.x, y: s.y, z: s.z, inCar: false, room: null };
      }
    } catch (e) { /* */ }
    try {
      const now = day.now && day.now();
      const fr = now && now.frame;
      if (fr && fr.person) {
        const a = fr.action || {};
        return {
          x: fr.person.x,
          y: fr.person.y != null ? fr.person.y : 0,
          z: fr.person.z,
          inCar: !!(fr.person.inCar || a.inCar),
          room: fr.room || a.room || null,
          building: fr.building || a.building || null,
        };
      }
    } catch (e) { /* */ }
    return { x: 0, y: 0, z: 0 };
  }

  function updateListener() {
    if (!ctx || !ctx.listener) return;
    const p = listenerPos();
    const L = ctx.listener;
    try {
      if (L.positionX) {
        L.positionX.value = -p.x;
        L.positionY.value = p.y;
        L.positionZ.value = p.z;
      } else if (L.setPosition) {
        L.setPosition(-p.x, p.y, p.z);
      }
      const w = day.world && day.world();
      const cam = w && w.scene && w.scene.activeCamera;
      if (cam && cam.getForwardRay) {
        const f = cam.getForwardRay(1).direction;
        const up = { x: 0, y: 1, z: 0 };
        if (L.forwardX) {
          L.forwardX.value = -f.x;
          L.forwardY.value = f.y;
          L.forwardZ.value = f.z;
          L.upX.value = up.x;
          L.upY.value = up.y;
          L.upZ.value = up.z;
        } else if (L.setOrientation) {
          L.setOrientation(-f.x, f.y, f.z, up.x, up.y, up.z);
        }
      }
    } catch (e) { /* */ }
  }

  function updateOneSpatial(s, force) {
    const cam = listenerPos();
    const dx = s.x - cam.x;
    const dz = s.z - cam.z;
    const dist = Math.hypot(dx, dz);
    if (s.stereo) {
      // Low quality: stereo pan by camera right, inverse distance on gain.
      let pan = 0;
      try {
        const w = day.world && day.world();
        const c = w && w.scene && w.scene.activeCamera;
        if (c && window.BABYLON) {
          const right = c.getDirection(window.BABYLON.Axis.X);
          pan = dist > 0.5 ? (dx * right.x + dz * right.z) / dist : 0;
        }
      } catch (e) { /* */ }
      s.stereo.pan.value = Math.max(-0.9, Math.min(0.9, pan));
      s.baseGain = 1 / (1 + Math.max(0, dist - 4) / 18);
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!force && now - s.lastOcc < OCCLUSION_THROTTLE_MS) {
      // Still refresh gain from the latest base (distance) × occlusion.
      const base = s.baseGain != null ? s.baseGain : 1;
      const occK = s.occluded ? dbToGain(occludeGainDb(true)) : 1;
      if (s.gain && s.gain.gain) s.gain.gain.value = base * occK;
      return;
    }
    s.lastOcc = now;
    if (!boxes.length) boxes = solidBoxes(bounds);
    const blocked = anyBoxBlocks(cam.x, cam.z, s.x, s.z, boxes);
    const cut = occludeCutoffHz(blocked);
    const db = occludeGainDb(blocked);
    if (s.filter) s.filter.frequency.setTargetAtTime(cut, ctx.currentTime, 0.05);
    const base = s.baseGain != null ? s.baseGain : 1;
    const occK = blocked ? dbToGain(db) : 1;
    if (s.gain && s.gain.gain) {
      try { s.gain.gain.setTargetAtTime(base * occK, ctx.currentTime, 0.05); } catch (e) { s.gain.gain.value = base * occK; }
    }
    if (blocked !== s.occluded || force) {
      s.occluded = blocked;
      if (blocked) {
        note("occlusion", { x: s.x, z: s.z, cutoffHz: cut, gainDb: db, occluded: true });
      } else if (!force) {
        note("occlusion-clear", { x: s.x, z: s.z, cutoffHz: cut, occluded: false });
      }
    }
    s.occluded = blocked;
  }

  function setZone(next) {
    if (!next || ZONES.indexOf(next) < 0) next = "street";
    if (next === zoneTarget) return zone;
    zoneTarget = next;
    zoneT = 0;
    note("zone", { zone: next, label: (IR_SHAPE[next] || {}).label });
    try {
      window.dispatchEvent(new CustomEvent("day:audio", { detail: { action: "zone", zone: next } }));
    } catch (e) { /* */ }
    return next;
  }

  function stepZone(dt) {
    if (!ctx) return;
    if (zoneT < 1) {
      zoneT = Math.min(1, zoneT + dt / CROSSFADE_SEC);
      if (zoneT >= 1) zone = zoneTarget;
    } else {
      zone = zoneTarget;
    }
    // Crossfade wet gains toward the target zone.
    ZONES.forEach((z) => {
      const want = z === zoneTarget ? 1 : 0;
      const cur = zoneWet[z] || 0;
      const next = cur + (want - cur) * Math.min(1, dt / CROSSFADE_SEC);
      zoneWet[z] = next;
      const r = reverb[z];
      if (r && r.wet) {
        const wet = (r.shape.wet || 0.3) * next;
        r.wet.gain.setTargetAtTime(wet, ctx.currentTime, 0.05);
      }
    });
    live.zone = zoneT >= 1 ? zone : zoneTarget;
    live.reverb = {
      wet: zoneWet[live.zone] || 0,
      label: (IR_SHAPE[live.zone] || IR_SHAPE.street).label,
      crossfade: Math.round(zoneT * 100) / 100,
    };
  }

  function measureLoudness(dt) {
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    try { analyser.getFloatTimeDomainData(buf); } catch (e) { return; }
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length) + 1e-9;
    // Rough K-weight stand-in: treat RMS as loudness proxy → dBFS, aim near −16.
    const db = 20 * Math.log10(rms);
    loudness = loudness * 0.98 + db * 0.02;
    const err = TARGET_LUFS - loudness;
    const adj = Math.max(-0.15, Math.min(0.15, err * 0.02 * Math.min(1, dt * 4)));
    makeupK = Math.max(0.5, Math.min(MAKEUP_MAX, makeupK * Math.pow(10, adj / 20)));
    if (makeup) makeup.gain.setTargetAtTime(makeupK, ctx.currentTime, 0.3);
    live.loudness = Math.round(loudness * 10) / 10;
  }

  function tick(dt) {
    if (!soundOn()) {
      live.on = false;
      return;
    }
    live.on = true;
    if (!unlocked) return;
    if (!ctx) ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    updateListener();
    const p = personPos();
    const next = zoneAt(p, bounds);
    if (next !== zoneTarget) setZone(next);
    stepZone(dt || 0.05);
    // Duck release when hold expires.
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (duckOn && now > duckUntil && !voicePlaying) setDuck(false);
    // Keep duck gains tracked for info().
    if (buses.music) {
      duckMusic = buses.music.duckGain.gain.value;
      duckAmb = buses.ambience.duckGain.gain.value;
      live.duck = {
        on: duckOn || duckMusic < 0.95,
        musicDb: Math.round(20 * Math.log10(Math.max(1e-6, duckMusic)) * 10) / 10,
        ambienceDb: Math.round(20 * Math.log10(Math.max(1e-6, duckAmb)) * 10) / 10,
        attackMs: DUCK.attackMs,
        musicGain: Math.round(duckMusic * 1000) / 1000,
        ambienceGain: Math.round(duckAmb * 1000) / 1000,
      };
    }
    let occluded = 0;
    for (let i = 0; i < spatials.length; i++) {
      updateOneSpatial(spatials[i], false);
      if (spatials[i].occluded) occluded++;
    }
    live.spatial = { hrtf: !lowQuality(), active: spatials.length, occluded };
    live.buses = {
      music: buses.music ? buses.music.levelGain.gain.value * duckMusic : 0,
      ambience: buses.ambience ? buses.ambience.levelGain.gain.value * duckAmb : 0,
      sfx: buses.sfx ? buses.sfx.levelGain.gain.value : 0,
      voice: buses.voice ? buses.voice.levelGain.gain.value : 0,
      ui: buses.ui ? buses.ui.levelGain.gain.value : 0,
    };
    measureLoudness(dt || 0.05);
  }

  function info() {
    return {
      zone: live.zone,
      zones: ZONES.slice(),
      label: (IR_SHAPE[live.zone] || {}).label || live.zone,
      buses: { ...live.buses },
      duck: { ...live.duck },
      levels: { ...live.levels },
      loudness: live.loudness,
      targetLufs: TARGET_LUFS,
      spatial: { ...live.spatial },
      reverb: { ...live.reverb },
      on: live.on,
      unlocked: unlocked,
      log: log.slice(-20),
    };
  }

  /* -------- Settings: Music / Effects / Voice sliders (≥44 px on phone) -------- */
  function mountSliders() {
    if (!document.body || !document.createElement) return;
    if (document.getElementById("mix-sliders")) return;
    const pop = document.getElementById("settings-pop") || document.body;
    const wrap = document.createElement("div");
    wrap.id = "mix-sliders";
    wrap.className = "mix-sliders";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Mix levels");
    const mk = (key, label) => {
      const row = document.createElement("label");
      row.className = "mix-row";
      row.dataset.bus = key;
      const name = document.createElement("span");
      name.className = "mix-name";
      name.textContent = label;
      const inp = document.createElement("input");
      inp.type = "range";
      inp.min = "0";
      inp.max = "100";
      inp.step = "1";
      inp.value = String(Math.round(levels[key] * 100));
      inp.id = `mix-${key}`;
      inp.setAttribute("aria-label", label);
      inp.addEventListener("input", () => {
        const v = clamp01(Number(inp.value) / 100);
        setLevels({ [key]: v }, true);
        note("level", { bus: key, value: v });
      });
      row.appendChild(name);
      row.appendChild(inp);
      return row;
    };
    wrap.appendChild(mk("music", "Music"));
    wrap.appendChild(mk("effects", "Effects"));
    wrap.appendChild(mk("voice", "Voice"));
    pop.appendChild(wrap);
  }

  // Wire ducking from voice / dialogue events.
  window.addEventListener("day:voice", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action === "play" || !d.action) {
      voicePlaying = true;
      setDuck(true, 3200);
    } else if (d.action === "end" || d.action === "stop") {
      voicePlaying = false;
      setDuck(false);
    }
  });
  window.addEventListener("day:dialogue", (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.action === "end" || d.action === "stop") {
      voicePlaying = false;
      setDuck(false);
    } else {
      voicePlaying = true;
      setDuck(true, 4000);
    }
  });

  const soundBtn = document.getElementById && document.getElementById("sound");
  if (soundBtn) soundBtn.addEventListener("click", () => { if (soundOn()) unlock(); });
  window.addEventListener("pointerdown", () => { if (soundOn()) unlock(); }, true);

  // Tick with the day (no setInterval network polling: the render loop is fine).
  try {
    const w = day.world && day.world();
    if (w && w.scene && w.scene.onBeforeRenderObservable) {
      let last = typeof performance !== "undefined" ? performance.now() : Date.now();
      w.scene.onBeforeRenderObservable.add(() => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
        last = now;
        tick(dt);
      });
    }
  } catch (e) { /* headless */ }

  if (document.body) mountSliders();
  else if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", mountSliders);

  const api = {
    unlock,
    bus,
    send,
    place,
    tick,
    info,
    now: info,
    zone: () => live.zone,
    setZone,
    zoneAt: (p) => zoneAt(p, bounds),
    duck: setDuck,
    levels: (partial) => (partial ? setLevels(partial, true) : { ...levels }),
    ctx: () => (ensureCtx(), ctx),
    master: () => (ensureCtx(), master),
    log: () => log.slice(),
    ZONES,
  };
  day.mix = api;
  day.audio = api; // acceptance: day.audio.info()
  window.mix = api;
  window.audio = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  startMix();
}
