/* ==========================================================================
   Small Weather's powers, while the player has him.

   Five verbs, one Charge pool: Lightning (E; hold into Storm), Rain (R),
   Wind (V; tap Gust, hold Gale, full charge Tornado; G aliases a Gust),
   Fog (C), Sun (X). Charge fills over time and faster in a storm. Keys 1–7
   and the Q wheel live behind Settings as Sky studio (off by default).

   The numbers and the lines are day.config.js `powers`. createGauge() is the
   meter with no scene, so npm test can spend it dry. startPowers() is the page.
   ========================================================================== */

import * as boltFx from "./lightning.js";
import { createAbilities, startAbilityBar, VERB_IDS } from "./abilities.js";
import { powerPose } from "./power-poses.js";
export { debrisCap, shellCount, inPlaza, plazaCourse, FUNNEL_LIFE } from "./tornado.js";

/** All spendable effects (verbs + hold depths). The bar shows VERB_IDS only. */
export const POWER_NAMES = ["bolt", "rain", "wind", "fog", "sunbreak", "storm", "gust", "gale", "tornado"];
export { VERB_IDS };

const DEFAULTS = {
  max: 100,
  regen: 12,
  stormRegen: 14,
  hold: 0.7, // Lightning hold → Storm
  windHold: 0.55, // Wind hold → Gale
  windFull: 1.35, // Wind full charge → Tornado
  tapMax: 0.28, // release before this = tap (bolt / gust)
  aim: 3.6,
  cone: 52,
  reach: 11,
  costs: { storm: 40, bolt: 24, gust: 16, tornado: 48, rain: 18, gale: 20, fog: 16, sunbreak: 22, wind: 16 },
  keys: { bolt: "e", rain: "r", wind: "v", fog: "c", sunbreak: "x", gust: "g" },
  // seconds before it can be called again, and how long it lasts (the bar's sweep and glow)
  cooldowns: { storm: 6, bolt: 1.5, gust: 2, tornado: 8, rain: 4, gale: 5, fog: 4, sunbreak: 6, wind: 2 },
  durations: { storm: 0, bolt: 0.55, gust: 0.42, tornado: 5.4, rain: 3, gale: 3, fog: 3, sunbreak: 3, wind: 0 },
  names: { storm: "Storm", bolt: "Lightning", gust: "Gust", tornado: "Tornado", rain: "Rain", gale: "Gale", fog: "Fog", sunbreak: "Sun", wind: "Wind" },
  lines: {
    gather: "The sky draws in over him.",
    windGather: "The air tightens in his hands.",
    storm: "He calls the storm down.",
    bolt: "Lightning. Where he aimed.",
    gust: "A hard gust.",
    tornado: "He sends a tornado down the street.",
    rain: "Rain, just here, just for a moment.",
    gale: "A gale tears down the street.",
    fog: "Fog rolls in off the street.",
    sunbreak: "The clouds split. Warm light.",
    dry: "Not enough charge.",
    locked: "Not unlocked yet.",
    cooling: "Not ready yet.",
  },
};

/** Flat unit forward of an orbit camera. Alpha is the Babylon yaw: the camera sits at (cos α, sin α), looking back along it. */
export function cameraForward(alpha) {
  const x = -Math.cos(alpha);
  const z = -Math.sin(alpha);
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

/** True when (px, pz) lies in the cone from (ox, oz) along a unit (dx, dz). */
export function inCone(ox, oz, dx, dz, px, pz, length, cosMin) {
  const vx = px - ox;
  const vz = pz - oz;
  const dist = Math.hypot(vx, vz);
  if (dist < 0.35 || dist > length) return false;
  return (vx * dx + vz * dz) / dist >= cosMin;
}

/** Speed of sound (m/s). Thunder delay matches Battlefield-style distance roll. */
export const SPEED_OF_SOUND = 343;
/** Within this many metres the body/rumble rides the flash (criterion: "with the flash"). */
export const THUNDER_NEAR_M = 30;

/** Seconds between the flash and the thunder. Farther strikes wait at 343 m/s. */
export function thunderDelay(distance) {
  const d = Math.max(0, distance);
  if (d <= THUNDER_NEAR_M) return 0;
  return Math.min(2.8, d / SPEED_OF_SOUND);
}

/**
 * The Pressure meter. step(dt, storming) fills it. spend(name) returns false
 * when the call costs more than he has, and does not change the meter.
 */
export function createGauge(opt) {
  opt = Object.assign({}, DEFAULTS, opt || {});
  const costs = Object.assign({}, DEFAULTS.costs, opt.costs);
  const max = opt.max > 0 ? opt.max : 100;
  let value = Math.max(0, Math.min(max, opt.start || 0));

  function step(dt, storming) {
    const rate = (opt.regen || 0) + (storming ? opt.stormRegen || 0 : 0);
    value = Math.min(max, value + rate * Math.max(0, dt));
  }
  function spend(name) {
    const cost = costs[name];
    if (cost == null || value < cost - 1e-4) return false;
    value -= cost;
    return true;
  }
  function now() {
    return { value, max, costs: Object.assign({}, costs) };
  }
  return { step, spend, now };
}

/** Nearest city block or cutaway building to a point. */
export function nearestStructure(cfg, x, z) {
  let best = null;
  const consider = (hit) => {
    if (!best || hit.d < best.d) best = hit;
  };
  ((cfg.city && cfg.city.blocks) || []).forEach((b) => {
    consider({ d: Math.hypot(x - b.x, z - b.z), kind: "block", id: b.id, block: b });
  });
  Object.entries(cfg.buildings || {}).forEach(([id, b]) => {
    if (!b.bounds) return;
    const o = b.origin || [0, 0];
    const cx = (b.bounds[0] + b.bounds[2]) / 2 + o[0];
    const cz = (b.bounds[1] + b.bounds[3]) / 2 + o[1];
    consider({ d: Math.hypot(x - cx, z - cz), kind: "rooms", id, building: b });
  });
  return best;
}

/** Which street he's on, and which way `dir` sends a tornado along it. */
export function streetCourse(cfg, x, z, dirX, dirZ) {
  const street = cfg.street || { z: 12.6, from: -48, to: 210 };
  const avenues = (cfg.city && cfg.city.avenues) || [{ z: street.z, from: street.from, to: street.to }];
  const crosses = (cfg.city && cfg.city.crosses) || [];
  let best = null;
  avenues.forEach((a) => {
    const d = Math.abs(z - a.z);
    if (!best || d < best.d) best = { d, axis: "x", x, z: a.z, from: a.from, to: a.to };
  });
  crosses.forEach((c) => {
    const d = Math.abs(x - c.x);
    if (!best || d < best.d) best = { d, axis: "z", x: c.x, z, from: c.from, to: c.to };
  });
  if (!best) best = { d: 0, axis: "x", x, z: street.z, from: street.from, to: street.to };
  const along = best.axis === "x" ? dirX : dirZ;
  best.dir = along < -0.08 ? -1 : 1;
  return best;
}

export function startPowers(world, dayApi) {
  const day = dayApi || window.day;
  if (!world || !world.scene || world.__powers) return world && world.__powers;
  const B = window.BABYLON;
  const scene = world.scene;
  const cfg = Object.assign({}, DEFAULTS, (window.DAY_CONFIG && window.DAY_CONFIG.powers) || {});
  cfg.costs = Object.assign({}, DEFAULTS.costs, cfg.costs);
  cfg.keys = Object.assign({}, DEFAULTS.keys, cfg.keys);
  cfg.cooldowns = Object.assign({}, DEFAULTS.cooldowns, cfg.cooldowns);
  cfg.durations = Object.assign({}, DEFAULTS.durations, cfg.durations);
  cfg.names = Object.assign({}, DEFAULTS.names, cfg.names);
  cfg.lines = Object.assign({}, DEFAULTS.lines, cfg.lines);
  // The registry every call goes through (js/abilities.js); Charge is the Pressure pool (Body Energy is separate).
  const abil = createAbilities({ max: cfg.max });
  POWER_NAMES.forEach((id) => {
    const key = cfg.keys[id] || (id === "storm" ? cfg.keys.bolt : id === "gale" || id === "tornado" ? cfg.keys.wind : "");
    abil.register({
      id,
      name: cfg.names[id] || id,
      key,
      cost: cfg.costs[id] != null ? cfg.costs[id] : 0,
      cooldown: cfg.cooldowns[id] || 0,
      duration: cfg.durations[id] || 0,
      verb: VERB_IDS.includes(id),
    });
  });
  const gauge = {
    step: (dt, storm) => abil.step(dt, (cfg.regen || 0) + (storm ? cfg.stormRegen || 0 : 0)),
    now: () => ({ value: abil.now().energy, max: abil.now().max, costs: Object.assign({}, cfg.costs) }),
  };
  let lastWhy = null;
  gauge.spend = (id) => {
    // Wind depths share the Wind lock; Storm shares Lightning's lock.
    if ((id === "gust" || id === "gale" || id === "tornado") && abil.isLocked("wind")) {
      lastWhy = "locked";
      return false;
    }
    if (id === "storm" && abil.isLocked("bolt")) {
      lastWhy = "locked";
      return false;
    }
    const r = abil.use(id);
    lastWhy = r.ok ? null : r.reason;
    return r.ok;
  };
  function buzz() {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(18);
    } catch (e) { /* unsupported */ }
  }
  const cosMin = Math.cos(((cfg.cone || 52) * Math.PI) / 180);
  const reach = cfg.reach || 11;
  const aimDist = cfg.aim || 3.6;

  let props = []; // filled from the tornado debris pool (bins, chairs, …)
  let age = 0;
  // Lightning hold → Storm; Wind hold → Gale / full → Tornado (tap = bolt / gust).
  let keyBolt = false;
  let touchBolt = false;
  let padBolt = false;
  let keyWind = false;
  let touchWind = false;
  let padWind = false;
  let boltCharge = 0;
  let windCharge = 0;
  let boltResolved = false;
  let windResolved = ""; // "", "gale", "tornado"
  let gatherNoted = false;
  let windGatherNoted = false;
  let localStorm = false;
  let wantStorm = false; // for pose() / now().charging while Lightning is gathering
  let charge = 0; // mirrors boltCharge for now().radius / pose
  let prevTouchBolt = false;
  let prevTouchWind = false;
  let castFor = 0;
  let throwFor = 0;
  let flash = 0;
  let shake = 0;
  let shakeT = 0;
  let shaking = false;
  let shakeRun = 0;
  let shakeMax = 0;
  let hitstop = 0;
  let push = 0;
  let pushApplied = 0;
  let lastCast = null;
  const fxList = [];
  const shaken = { a: 0, b: 0 };
  let strike = null;
  let strikeSnap = null;
  let strikeConductor = null;
  let strikeInfo = null;
  let strikeSurfaceY = 0;
  let gustFx = null;
  let tornado = null;
  let blocked = null;
  let blackout = null;
  let alarm = null;
  let pointerAimed = false;
  let aimClient = null;
  let wasControl = false;
  const padPrev = {};
  const pendingThunder = [];
  let audio = null;
  let alarmBeeps = 0;

  const canDom = !!(document.body && typeof document.body.append === "function" && document.head);
  const stub = () => ({ hidden: true, style: {}, textContent: "", classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, appendChild() {}, addEventListener() {} });
  let meter = stub();
  let meterFill = stub();
  let reticle = stub();
  let pad = stub();
  const buttons = {};

  function mode() {
    return day.control && day.control.mode ? day.control.mode() : "schedule";
  }
  function who() {
    const s = day.control && day.control.state ? day.control.state() : null;
    return s || { x: 0, y: 0, z: 0, yaw: 0, mode: mode() };
  }
  function wx() {
    return window.weather || world.__weather || null;
  }
  function storming() {
    const w = wx();
    return !!(localStorm || (w && w.now && w.now().state === "storm"));
  }
  function line(key) {
    return cfg.lines[key] || "";
  }
  function note(text) {
    if (text && day.note) day.note(text);
  }
  function emit(detail) {
    if (typeof window.CustomEvent !== "function" || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new window.CustomEvent("day:power", { detail }));
    } catch (err) {
      /* the test's window has no events */
    }
  }

  /* ---- cast sequence: wind-up, burst at the target, layered SFX, a short push; all in the press's own frame ---- */
  const CAST = {
    storm: { kind: "bloom", color: [0.35, 0.42, 0.7], base: 110, hold: 0.09 },
    bolt: { kind: "fork", color: [1, 1.2, 1.6], base: 520 },
    gust: { kind: "ring", color: [0.7, 0.9, 1], base: 300 },
    tornado: { kind: "bloom", color: [0.5, 0.5, 0.58], base: 85 },
    rain: { kind: "flurry", color: [0.45, 0.7, 1.1], base: 400 },
    gale: { kind: "ring", color: [0.6, 1, 0.8], base: 240 },
    fog: { kind: "flurry", color: [0.85, 0.9, 1], base: 180 },
    sunbreak: { kind: "shaft", color: [1.4, 1.1, 0.5], base: 660 },
  };
  function fxMat(c) {
    const m = new B.StandardMaterial("cast-fx", scene);
    m.disableLighting = true;
    m.emissiveColor = new B.Color3(c[0], c[1], c[2]);
    m.alpha = 0.8;
    m.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    m.backFaceCulling = false;
    return m;
  }
  function addFx(mesh, mat, life, grow, rise) {
    mesh.material = mat;
    mesh.isPickable = false;
    fxList.push({ mesh, mat, life, t: 0, grow, rise: rise || 0, s0: mesh.scaling.clone() });
  }
  function castSound(id, c) {
    const a = ensureAudio();
    if (!a || !soundOn()) return;
    if (a.ctx.state === "suspended") a.ctx.resume();
    const v = Math.floor(Math.random() * 3);
    const pitch = (0.92 + Math.random() * 0.16) * [1, 1.12, 0.89][v];
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = ["sine", "triangle", "triangle"][v];
    o.frequency.setValueAtTime(c.base * pitch * 0.5, t);
    o.frequency.exponentialRampToValueAtTime(c.base * pitch, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    g.gain.setValueAtTime(0, t + 0.225);
    o.connect(g);
    g.connect(a.master);
    o.start(t);
    o.stop(t + 0.25);
    burst(c.base * pitch * 2.2, 0.28 + v * 0.06, 0.2, ["lowpass", "bandpass", "bandpass"][v]);
  }
  function castFx(id) {
    const c = CAST[id];
    if (!c || !scene) return;
    const p = who();
    const f = forward();
    let tg;
    if (id === "bolt") tg = groundAim() || { x: p.x + f.x * 6, y: p.y, z: p.z + f.z * 6 };
    else if (id === "storm" || id === "tornado") tg = { x: p.x + f.x * 4, y: p.y, z: p.z + f.z * 4 };
    else tg = { x: p.x + f.x * 5, y: p.y, z: p.z + f.z * 5 };
    castFor = Math.max(castFor, 0.5);
    [-0.45, 0.45].forEach((side) => {
      const h = B.MeshBuilder.CreateSphere("cast-hand", { diameter: 0.5, segments: 6 }, scene);
      h.position.set(p.x + f.z * side, (p.y || 0) + 1.5, p.z - f.x * side);
      addFx(h, fxMat(c.color), 0.4, 1.8, 0.5);
    });
    const mat = fxMat(c.color);
    const y = tg.y || 0;
    if (c.kind === "bloom") {
      for (let i = 0; i < 4; i++) {
        const m = B.MeshBuilder.CreateSphere("cast-bloom", { diameter: 1.6, segments: 6 }, scene);
        m.position.set(tg.x + (i - 1.5) * 0.9, y + 3 + (i % 2) * 0.6, tg.z);
        addFx(m, mat, 0.6, 1.7, 0.8);
      }
    } else if (c.kind === "ring") {
      const m = B.MeshBuilder.CreateTorus("cast-ring", { diameter: 1.4, thickness: 0.14, tessellation: 20 }, scene);
      m.position.set(tg.x, y + 1.1, tg.z);
      m.rotation.x = Math.PI / 2;
      addFx(m, mat, 0.5, 5, 0);
    } else if (c.kind === "shaft") {
      const m = B.MeshBuilder.CreateCylinder("cast-shaft", { diameter: 1.6, height: 12, tessellation: 12 }, scene);
      m.position.set(tg.x, y + 6, tg.z);
      addFx(m, mat, 0.7, 1.4, 0);
    } else if (c.kind === "flurry") {
      for (let i = 0; i < 10; i++) {
        const m = B.MeshBuilder.CreateSphere("cast-flurry", { diameter: 0.22, segments: 4 }, scene);
        m.position.set(tg.x + (Math.random() - 0.5) * 3, y + 3 + Math.random() * 1.5, tg.z + (Math.random() - 0.5) * 3);
        addFx(m, mat, 0.6, 1, -4);
      }
    }
    // the fork and its flash come from bolt() itself
    castSound(id, c);
    push = id === "storm" ? 0.05 : 0.03;
    if (c.hold) hitstop = c.hold;
    if (id !== "bolt" && id !== "gale" && id !== "tornado") shake = Math.max(shake, 0.008);
    lastCast = { id, at: performance.now(), kind: c.kind, hitstop: !!c.hold };
  }
  function say(action, via, power) {
    if (action !== "denied") {
      castFx(power || action);
      buzz();
    }
    const g = gauge.now();
    const a = abil.get(power || action);
    emit({ action, via: via || "key", power: power || action, pressure: Math.round(g.value), energy: Math.round(g.value), cooldown: a ? a.cooldown : 0, reason: action === "denied" ? lastWhy : undefined });
  }

  /* ---- look: a cloud over him, a bolt, a scorch, the gust's shape, the tornado ---- */
  const cloudMat = new B.StandardMaterial("power-cloud", scene);
  cloudMat.disableLighting = true;
  cloudMat.emissiveColor = new B.Color3(0.04, 0.05, 0.1);
  cloudMat.alpha = 0.78;
  cloudMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  cloudMat.backFaceCulling = false;
  const cloud = B.MeshBuilder.CreateSphere("power-cloud", { diameter: 1, segments: 10 }, scene);
  cloud.material = cloudMat;
  cloud.isPickable = false;
  cloud.setEnabled(false);
  const shelf = B.MeshBuilder.CreateCylinder("power-shelf", { diameter: 1, height: 0.35, tessellation: 12 }, scene);
  shelf.material = cloudMat;
  shelf.isPickable = false;
  shelf.setEnabled(false);

  const boltMat = new B.StandardMaterial("power-bolt", scene);
  boltMat.disableLighting = true;
  boltMat.emissiveColor = new B.Color3(1.1, 1.35, 1.65);
  const flashLight = new B.PointLight("strike-flash", B.Vector3.Zero(), scene);
  flashLight.diffuse = new B.Color3(0.75, 0.86, 1);
  flashLight.intensity = 0;
  flashLight.range = 48; // reaches the facades within 40 m of a strike
  /* Stays enabled at intensity 0: enabling a light changes the light count of every material it reaches, and that
     recompile froze the page for ~290 ms on the first bolt. Enabled from the start, the warm-up compiles with it. */

  const gustMat = new B.StandardMaterial("power-gust", scene);
  gustMat.disableLighting = true;
  gustMat.emissiveColor = new B.Color3(0.55, 0.7, 0.85);
  gustMat.alpha = 0.28;
  gustMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  gustMat.backFaceCulling = false;
  const gustMesh = B.MeshBuilder.CreateBox("power-gust", { width: 1, height: 1, depth: 1 }, scene);
  gustMesh.material = gustMat;
  gustMesh.isPickable = false;
  gustMesh.setEnabled(false);

  /* One shared material for the windows a strike blacks out (it was a new material per strike). */
  const blackoutMat = new B.StandardMaterial("blackout", scene);
  blackoutMat.disableLighting = true;
  blackoutMat.emissiveColor = new B.Color3(0.01, 0.012, 0.02);

  /* Shader warm-up. Every material above is first drawn the frame its power is first used, and compiling it there froze
     the first bolt/gust/tornado by 100-300 ms. Compile them now, off the frame (parallel shader compile), on probe meshes
     that are never drawn. A failed warm-up only means the old first-use compile, so it is not an error. */
  const warmProbe = (mesh, mat) => { mesh.material = mat; mesh.isPickable = false; mesh.setEnabled(false); return mesh; };
  const warmList = [
    [cloud, cloudMat], [gustMesh, gustMat],
    [warmProbe(B.MeshBuilder.CreateBox("blackout-probe", { size: 1 }, scene), blackoutMat), blackoutMat],
  ];
  setTimeout(() => {
    warmList.forEach(([mesh, mat]) => {
      if (mat.forceCompilationAsync) mat.forceCompilationAsync(mesh).catch(() => {});
    });
  }, 0);

  let rainPs = null;
  try {
    rainPs = new B.ParticleSystem("power-rain", 700, scene);
    rainPs.emitter = new B.Vector3(0, 8, 0);
    rainPs.minEmitBox = new B.Vector3(-4, 0, -4);
    rainPs.maxEmitBox = new B.Vector3(4, 1, 4);
    rainPs.color1 = new B.Color4(0.7, 0.82, 1, 0.55);
    rainPs.color2 = new B.Color4(0.85, 0.9, 1, 0.25);
    rainPs.colorDead = new B.Color4(1, 1, 1, 0);
    rainPs.minSize = 0.08;
    rainPs.maxSize = 0.2;
    rainPs.minLifeTime = 0.35;
    rainPs.maxLifeTime = 0.6;
    rainPs.emitRate = 0;
    rainPs.direction1 = new B.Vector3(-0.2, -1, -0.1);
    rainPs.direction2 = new B.Vector3(0.2, -1, 0.15);
    rainPs.minEmitPower = 14;
    rainPs.maxEmitPower = 20;
    rainPs.gravity = new B.Vector3(0, -6, 0);
    rainPs.start();
  } catch (err) {
    rainPs = null;
  }

  const glow = (scene.effectLayers || []).find((l) => l.name === "glow");
  if (glow && glow.addIncludedOnlyMesh) {
  }

  const fx = boltFx.createBoltFx(B, scene, {
    glow,
    flashLight,
    camera: () => world.camera,
    quality: () => (day.look && day.look.quality ? day.look.quality() : window.look && window.look.quality ? window.look.quality() : "high"),
  });
  setTimeout(() => fx.warm(), 0);

  const qOf = () => (day.look && day.look.quality ? day.look.quality() : window.look && window.look.quality ? window.look.quality() : "high");
  function looseSpecs() {
    const street = (window.DAY_CONFIG && window.DAY_CONFIG.street) || { z: 12.6 };
    const list = (cfg.loose || []).map((spec) => ({
      kind: spec.kind || "bin",
      x: spec.x,
      z: spec.z != null ? spec.z : street.z + (spec.dz || 0),
      y: spec.y,
      yaw: spec.yaw || 0,
    }));
    return list;
  }
  function persistDebris(marks) {
    try {
      if (day.memory && day.memory.noteDebris) day.memory.noteDebris(marks);
      else {
        window.dispatchEvent(new CustomEvent("day:tornado-debris", { detail: { marks } }));
      }
    } catch (err) { /* memory optional */ }
  }
  /* The tornado's module (js/tornado.js, 735 lines) is not in the first chunk: js/late.js loads it right after the first cast
     (or on idle) through `loadTornado()`. Until then `tornadoLook` is an idle stand-in and a Tornado cast waits for it. */
  let tornadoFx = null;
  let tornadoLook = { warm() {}, ensurePool() {}, pool: [], propPositions: () => [], update() {}, start: () => null, info: () => ({ active: null, landed: 0, settleLeft: 0 }) };
  let tornadoP = null;
  const buildTornado = () => tornadoFx.createTornadoFx(B, scene, {
    quality: qOf,
    physics: () => world.physics && world.physics(),
    surfaceAt: (x, z) => {
      if (world.surfaceAt) return world.surfaceAt(x, z);
      return surfaceY(x, z);
    },
    wetAt: (x, z) => {
      const w = wx();
      const wet = w && w.now ? (w.now().wet || 0) : 0;
      // fountain pool in the plaza, or ability-wet road
      if (wet > 0.2) return true;
      return Math.hypot(x - 118, z - 23.3) < 3.2;
    },
    onLand: persistDebris,
    onShake: (amp) => { shake = Math.max(shake, amp); },
    exclude: (mesh) => {
      if (!mesh || !mesh.name) return false;
      // neighbours and Small Weather stay out of the debris set
      if (/^(nb-|sw-|small-weather|person|avatar)/i.test(mesh.name)) return true;
      return false;
    },
    specs: looseSpecs,
  });
  function loadTornado() {
    if (!tornadoP) {
      tornadoP = import("./tornado.js").then((mod) => {
        tornadoFx = mod;
        tornadoLook = buildTornado();
        setTimeout(() => tornadoLook.warm(), 0);
        return true;
      }).catch((err) => { tornadoP = null; console.error("[powers] the tornado didn't load:", err); return false; });
    }
    return tornadoP;
  }

  let cloudR = 0;
  let cloudTarget = 0;

  function forward() {
    const cam = world.camera;
    if (cam && Number.isFinite(cam.alpha)) return cameraForward(cam.alpha);
    const p = who();
    return { x: Math.sin(p.yaw || 0), z: Math.cos(p.yaw || 0) };
  }

  let aimOverride = null; // the opening points the first bolt at the shop's rod
  let gateFn = null; // the opening decides when a bolt may go (a hold, not a tap)
  function groundAim() {
    if (aimOverride) return aimOverride;
    const p = who();
    if (pointerAimed && aimClient && world.engine && world.engine.getRenderWidth) {
      const canvas = scene.getEngine().getRenderingCanvas && scene.getEngine().getRenderingCanvas();
      const rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      if (rect && rect.width > 2 && rect.height > 2) {
        try {
          const rw = world.engine.getRenderWidth();
          const rh = world.engine.getRenderHeight();
          const rx = ((aimClient.x - rect.left) / rect.width) * rw;
          const ry = ((aimClient.y - rect.top) / rect.height) * rh;
          const ray = scene.createPickingRay(rx, ry, B.Matrix.Identity(), world.camera);
          if (ray && ray.direction.y < -0.04) {
            const t = (0.05 - ray.origin.y) / ray.direction.y;
            if (t > 0 && t < 80) {
              const hit = ray.origin.add(ray.direction.scale(t));
              const d = Math.hypot(hit.x - p.x, hit.z - p.z);
              if (d > 0.8 && d < 32) return { x: hit.x, z: hit.z, y: surfaceY(hit.x, hit.z) };
            }
          }
        } catch (err) {
          /* fall through to the resting aim */
        }
      }
    }
    const f = forward();
    return { x: p.x + f.x * aimDist, z: p.z + f.z * aimDist, y: surfaceY(p.x + f.x * aimDist, p.z + f.z * aimDist) };
  }

  function surfaceY(x, z) {
    let y = 0.08;
    ((window.DAY_CONFIG.city && window.DAY_CONFIG.city.blocks) || []).forEach((b) => {
      if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2) y = Math.max(y, b.h + 0.06);
    });
    return y;
  }

  function shove(prop, ix, iy, iz) {
    if (!prop || prop.state === "done" || prop.landed) return;
    const at = prop.mesh.getAbsolutePosition();
    if (prop.body) {
      try {
        prop.body.applyImpulse(new B.Vector3(ix, iy, iz), at);
      } catch (err) {
        prop.mesh.position.addInPlace(new B.Vector3(ix, iy, iz).scale(0.015));
      }
    } else {
      prop.mesh.position.addInPlace(new B.Vector3(ix, iy, iz).scale(0.02));
    }
  }

  function ensureProps() {
    tornadoLook.ensurePool(looseSpecs());
    props = tornadoLook.pool;
  }

  function propPositions() {
    return tornadoLook.propPositions();
  }

  /* ---- calls ---- */
  const refuseLogged = {};
  function refuse(power, via) {
    blocked = { power, pressure: Math.round(gauge.now().value), at: age, reason: lastWhy };
    // A cooldown is already on the ability bar: no log row. Other refusals log at most once per 3 s per reason.
    if (lastWhy !== "cooldown" && (refuseLogged[lastWhy] === undefined || age - refuseLogged[lastWhy] > 3)) {
      refuseLogged[lastWhy] = age;
      note(line(lastWhy === "locked" ? "locked" : "dry"));
    }
    say("denied", via, power);
    return false;
  }

  function summon(via) {
    if (!gauge.spend("storm")) return refuse("storm", via);
    localStorm = true;
    cloudTarget = 34;
    castFor = 1.05;
    const w = wx();
    if (w && w.set) w.set("storm", 1, "power");
    note(line("storm"));
    say("storm", via, "storm");
    burst(160, 1.1, 0.45, "lowpass");
    return true;
  }

  function bolt(via) {
    if (mode() !== "control") return false;
    if (!gauge.spend("bolt")) return refuse("bolt", via);
    const aim = snapToConductor(groundAim());
    const p = who();
    throwFor = 0.55;
    flash = 1;
    hitstop = Math.max(hitstop, 0.06); // the world holds its breath for the crack
    const dist = Math.hypot(aim.x - (world.camera ? world.camera.position.x : p.x), aim.z - (world.camera ? world.camera.position.z : p.z));
    const delay = thunderDelay(dist);
    shake = Math.max(shake, 0.02 + 0.03 * (1 - Math.min(1, dist / 36)));
    showBolt(aim);
    strikeConductor = aim.conductor || null;
    const wxb = wx();
    if (wxb && wxb.set) wxb.set("storm", 0.85, "power"); // the strike brings a storm; js/weather.js eases it out
    const hit = nearestStructure(window.DAY_CONFIG || {}, aim.x, aim.z);
    if (hit) beginBlackout(hit);
    const car = nearestCar(aim.x, aim.z);
    const alarmed = !!(car && car.d < 28);
    if (alarmed) beginAlarm(car.node);
    strikeSnap = propPositions();
    let knocked = 0;
    props.forEach((prop) => {
      const dx = prop.mesh.position.x - aim.x;
      const dz = prop.mesh.position.z - aim.z;
      const d = Math.hypot(dx, dz);
      if (d > 7.5) return;
      const k = (1 - d / 7.5) * 78;
      const n = d < 0.2 ? 1 : d;
      shove(prop, (dx / n) * k, 26 + (1 - d / 7.5) * 30, (dz / n) * k);
      knocked++;
    });
    strike = {
      id: (strike ? strike.id : 0) + 1,
      x: aim.x,
      y: strikeSurfaceY,
      z: aim.z,
      aimX: aim.aimX != null ? aim.aimX : aim.x,
      aimZ: aim.aimZ != null ? aim.aimZ : aim.z,
      delay,
      dist: Math.round(dist * 10) / 10,
      thunder: false,
      alarm: alarmed,
      blackout: hit ? hit.id : null,
      knocked,
      conductor: strikeConductor ? strikeConductor.kind : null,
      forks: strikeInfo ? strikeInfo.forks : 0,
      at: age,
      flashAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
    pendingThunder.push({ at: age + delay, id: strike.id, dist, delay, flashAt: strike.flashAt });
    note(line("bolt"));
    say("bolt", via, "bolt");
    return true;
  }

  function gust(via) {
    if (mode() !== "control") return false;
    if (!gauge.spend("gust")) return refuse("gust", via);
    const p = who();
    const f = forward();
    let pushes = 0;
    props.forEach((prop) => {
      if (!inCone(p.x, p.z, f.x, f.z, prop.mesh.position.x, prop.mesh.position.z, reach, cosMin)) return;
      const k = prop.kind === "umbrella" ? 70 : 58;
      shove(prop, f.x * k, 16, f.z * k);
      pushes++;
    });
    if (day && day.sfx && day.sfx.cast) day.sfx.cast("gust");
    gustMesh.setEnabled(true);
    gustMesh.scaling.set(3.2, 1.15, reach);
    gustMesh.position.set(p.x + f.x * (reach * 0.45), 1.05, p.z + f.z * (reach * 0.45));
    gustMesh.rotation.y = Math.atan2(f.x, f.z);
    gustFx = { id: (gustFx ? gustFx.id : 0) + 1, until: age + 0.42, pushes, dirX: f.x, dirZ: f.z, at: age };
    // A hard gust also plants a short updraft he can ride (storm-riding traversal).
    if (day.control && day.control.spawnUpdraft) {
      const ride = (window.DAY_CONFIG && window.DAY_CONFIG.control && window.DAY_CONFIG.control.ride && window.DAY_CONFIG.control.ride.updraft) || {};
      day.control.spawnUpdraft(p.x, p.z, {
        r: ride.radius != null ? ride.radius : 4.2,
        lift: ride.lift != null ? ride.lift : 8,
        life: ride.life != null ? ride.life : 7,
        kind: "gust",
      });
    }
    shake = Math.max(shake, 0.012);
    note(line("gust"));
    say("gust", via, "gust");
    burst(700, 0.4, 0.4, "bandpass");
    return true;
  }

  let tornadoWait = false;
  function sendTornado(via) {
    if (mode() !== "control") return false;
    if (tornado && tornado.life > 0) return false;
    if (!tornadoFx) { // still loading: show it, then cast once it is in (never a silent tap)
      if (!tornadoWait) {
        tornadoWait = true;
        window.dispatchEvent(new CustomEvent("day:late", { detail: { feature: "tornado", state: "loading", via } }));
        loadTornado().then((ok) => { tornadoWait = false; if (ok) sendTornado(via); });
      }
      return false;
    }
    if (!gauge.spend("tornado")) return refuse("tornado", via);
    ensureProps();
    const p = who();
    const f = forward();
    const plaza = tornadoFx.plazaCourse(p.x, p.z, f.x);
    const course = plaza || streetCourse(window.DAY_CONFIG || {}, p.x, p.z, f.x, f.z);
    const start = {
      x: course.axis === "x" ? (plaza ? Math.max(course.from + 2, Math.min(course.to - 2, p.x)) : p.x) : course.x,
      z: course.axis === "z" ? p.z : course.z,
      axis: course.axis,
      dir: course.dir,
      from: course.from,
      to: course.to,
      life: cfg.durations.tornado || tornadoFx.FUNNEL_LIFE,
      zone: course.zone || (plaza ? "plaza" : "street"),
    };
    tornado = tornadoLook.start(start);
    // crowd scare + scream come from day:crowd scatter (tornadoLook.start) and day:power (crowd.js)
    note(line("tornado"));
    say("tornado", via, "tornado");
    burst(90, 0.8, 0.5, "lowpass");
    return true;
  }

  /* ---- the four weather abilities: each sets the sky for a few seconds (js/weather.js eases it out) ---- */
  const callFx = { until: 0, id: "", pulse: 0 }; // gale: the street-wide push, fading
  function weatherCall(id, via) {
    if (mode() !== "control") return false;
    if (!gauge.spend(id)) return refuse(id, via);
    const w = wx();
    if (id === "rain") {
      if (w && w.set) w.set("rain", 1, "power");
      try { day.slice && day.slice.drench && day.slice.drench(true); } catch (e) { /* no slice */ }
      if (!(day && day.sfx && day.sfx.cast && day.sfx.cast("rain"))) {
        noiseWash(5200, 2.4, 0.2, "highpass");
        noiseWash(1700, 2.0, 0.1, "bandpass");
      }
    } else if (id === "gale") {
      if (w && w.set) w.set("wind", 1, "power");
      const p = who();
      const f = forward();
      props.forEach((prop) => {
        const dx = prop.mesh.position.x - p.x;
        const dz = prop.mesh.position.z - p.z;
        if (Math.hypot(dx, dz) > 16) return;
        shove(prop, f.x * 52, 12, f.z * 52);
      });
      callFx.dirX = f.x;
      callFx.dirZ = f.z;
      callFx.until = age + 3;
      shake = Math.max(shake, 0.01);
      if (!(day && day.sfx && day.sfx.cast && day.sfx.cast("gale"))) sweep(260, 1500, 2.6, 0.32);
    } else if (id === "fog") {
      if (w && w.set) w.set("fog", 1, "power");
      if (!(day && day.sfx && day.sfx.cast && day.sfx.cast("fog"))) pad2([110, 165, 220], 3.4, 0.07);
    } else if (id === "sunbreak") {
      if (w && w.sunbreak) w.sunbreak();
      else if (w && w.set) w.set("clear", 1, "power");
      if (!(day && day.sfx && day.sfx.cast && day.sfx.cast("sunbreak"))) chime([523.25, 659.25, 783.99, 1046.5], 0.12);
    }
    callFx.id = id;
    callFx.at = age;
    note(line(id));
    say(id, via, id);
    return true;
  }
  const commands = { storm: summon, bolt, gust, tornado: sendTornado };
  ["rain", "gale", "fog", "sunbreak"].forEach((id) => (commands[id] = (via) => weatherCall(id, via)));
  function command(name, via) {
    const fn = commands[name];
    if (!fn) return false;
    if (mode() !== "control") return pressWatching(name, via || "key");
    if (gateFn && !gateFn(name, via || "key")) return false;
    if (releaseCast) return fn(via || "key");
    return windUp(name, via || "key", fn);
  }
  // A Gust/Gale/Lightning tap fires on release: the press itself was the wind-up, so no second pause before the effect.
  let releaseCast = false;

  /* The wind-up: a cast made standing still turns him to face the aim (a step when it is over 90 deg: js/control.js `face`)
     and plays the raise-the-hands pose before the effect fires, 0.12-0.22 s after the press, so the first visible effect
     stays under 300 ms. On the move, in the air, or a power already pending, it goes at once. */
  const WINDUP_MIN = 0.12;
  const WINDUP_MAX = 0.22;
  let pendingCast = null;
  function windUp(name, via, fn) {
    const st = day.control && day.control.state ? day.control.state() : null;
    const still = st && st.grounded && (st.speed || 0) < 0.8;
    if (!still || pendingCast || !day.control.face || aimOverride) return fn(via);
    if (name === "rain" || name === "fog" || name === "sunbreak") {
      // sky casts don't need his hands up first: the sky answers on the press frame, he still turns toward the aim as it lands
      const a = groundAim();
      const q = who();
      if (a && Math.hypot(a.x - q.x, a.z - q.z) > 0.8) day.control.face(Math.atan2(a.x - q.x, a.z - q.z));
      return fn(via);
    }
    const aim = groundAim();
    const p = who();
    let wait = WINDUP_MIN;
    if (aim && Math.hypot(aim.x - p.x, aim.z - p.z) > 0.8) {
      const t = day.control.face(Math.atan2(aim.x - p.x, aim.z - p.z));
      if (t) wait = Math.min(WINDUP_MAX, Math.max(WINDUP_MIN, t.dur * 0.75));
    }
    pendingCast = { name, via, fn, left: wait, total: wait };
    return true;
  }
  function tickWindUp(dt) {
    if (!pendingCast) return;
    const c = pendingCast;
    c.left -= dt;
    if (c.left > 0) return;
    pendingCast = null;
    if (mode() !== "control") return;
    if (!c.fn(c.via)) refuseBar(c.name);
  }

  /* A power pressed while only watching is never refused: the first press takes control (the Take control button's own
     path, so the night wake runs too) and then casts that power, with a one-line toast on how to give him back. */
  let watchCast = null; // a cast waiting for the night wake to land him on the roof
  function takeToast() {
    if (!canDom) return;
    const touch = !!(day.control.state && day.control.state().touch);
    const text = touch ? line("takeoverTouch") : line("takeover");
    if (!text) return;
    let el = document.getElementById("take-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "take-toast";
      el.className = "take-toast";
      el.setAttribute("role", "status");
      document.body.append(el);
    }
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(takeToast.h);
    takeToast.h = setTimeout(() => el.classList.remove("show"), 3600);
    note(text);
  }
  function pressWatching(name, via) {
    if (!canDom || !day.control || !day.control.take || mode() !== "schedule") return false;
    const cls = document.documentElement.classList;
    if (cls.contains("title-up") || cls.contains("cold-open")) return false;
    if (!day.control.take(via)) return false; // driving: the one case he can't be taken
    takeToast();
    const cast = () => {
      if (mode() !== "control") return;
      const ok = gateFn && !gateFn(name, via) ? false : commands[name](via);
      if (!ok) refuseBar(name);
    };
    const wk = day.wake && day.wake.now ? day.wake.now() : null;
    if (wk && wk.active) {
      // asleep: he stretches and is put on the roof first; cast the moment he is ready
      const h = (e) => {
        const a = e.detail && e.detail.action;
        if (a !== "ready" && a !== "abort") return;
        window.removeEventListener("day:wake", h);
        clearTimeout(watchCast);
        if (a === "ready") setTimeout(cast, 60);
      };
      window.addEventListener("day:wake", h);
      watchCast = setTimeout(() => window.removeEventListener("day:wake", h), 8000);
    } else cast();
    return true;
  }

  /* A bolt prefers a tall conductor (an antenna, the Needle) within 3 m of where it was aimed. */
  function snapToConductor(aim) {
    const list = (day.cityscape && day.cityscape.info && day.cityscape.info().props && day.cityscape.info().props.conductors) || [];
    const c = boltFx.pickConductor(list, aim.x, aim.z, 3);
    return c ? { x: c.x, y: c.y, z: c.z, conductor: c, aimX: aim.x, aimZ: aim.z } : aim;
  }
  /* The surface under the strike: its height and normal (a roof or the street), so the scorch lies flush on it. */
  function surfaceAt(x, y, z, reach) {
    try {
      const ray = new B.Ray(new B.Vector3(x, y + (reach ? 0 : 2.5), z), new B.Vector3(0, -1, 0), reach || 6);
      const hit = scene.pickWithRay(ray, (m) => m.isPickable !== false && m.isEnabled() && !/^(strike-|power-|cast-|funnel|debris|mem-)/.test(m.name));
      if (hit && hit.hit && hit.pickedPoint) {
        const n = hit.getNormal(true);
        if (n && n.y > 0.55 && (reach || Math.abs(hit.pickedPoint.y - y) < 1.2)) return { y: hit.pickedPoint.y, normal: { x: n.x, y: n.y, z: n.z } };
      }
    } catch (err) { /* the resting height */ }
    return { y: y, normal: { x: 0, y: 1, z: 0 } };
  }
  function showBolt(aim) {
    const c = aim.conductor || null;
    const under = c ? surfaceAt(c.x, c.y - 4, c.z, 140) : surfaceAt(aim.x, aim.y, aim.z);
    const tipY = c ? c.y : under.y;
    const info = fx.strike({ x: aim.x, y: tipY, z: aim.z }, tipY + 48, { normal: under.normal, conductor: c, decalY: under.y });
    strikeInfo = info;
    strikeSurfaceY = under.y;
  }

  function beginBlackout(hit) {
    const covers = [];
    if (hit.kind === "block" && hit.block) {
      const b = hit.block;
      const x0 = b.x - b.w / 2;
      const x1 = b.x + b.w / 2;
      const z0 = b.z - b.d / 2;
      const z1 = b.z + b.d / 2;
      const floors = Math.max(1, Math.floor((b.h - 0.8) / 3));
      const mat = blackoutMat;
      for (let f = 0; f < floors; f++) {
        const wy = 1.7 + f * 3;
        if (wy > b.h - 0.9) continue;
        for (let wx = x0 + 1.7; wx < x1 - 0.8; wx += 3.1) {
          if (b.stair && wx > b.stair.x0 - 0.3 && wx < b.stair.x1 + 0.3) continue;
          [z1 + 0.14, z0 - 0.14].forEach((wz) => {
            const m = B.MeshBuilder.CreateBox("blackout-win", { width: 1.25, height: 1.35, depth: 0.08 }, scene);
            m.position.set(wx, wy, wz);
            m.material = mat;
            m.isPickable = false;
            covers.push(m);
          });
        }
      }
    }
    const area = areaOf(hit);
    const dims = [];
    if (area) {
      scene.meshes.forEach((m) => {
        if (!m.material || !m.material.emissiveColor) return;
        if (!/^(wg|lampshade|flshade|clockface|screenface|btvface)$/.test(m.name)) return;
        const p = m.getAbsolutePosition();
        if (p.x < area.x0 - 0.4 || p.x > area.x1 + 0.4 || p.z < area.z0 - 0.4 || p.z > area.z1 + 0.4) return;
        dims.push(m);
      });
    }
    const lights = lightsOf(hit.id);
    blackout = { id: hit.id, until: age + 8, covers, dims, lights };
  }

  function areaOf(hit) {
    if (hit.kind === "block" && hit.block) {
      const b = hit.block;
      return { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 };
    }
    const b = hit.building;
    if (!b || !b.bounds) return null;
    const o = b.origin || [0, 0];
    return { x0: b.bounds[0] + o[0], x1: b.bounds[2] + o[0], z0: b.bounds[1] + o[1], z1: b.bounds[3] + o[1] };
  }

  function lightsOf(id) {
    const rooms = (window.DAY_CONFIG && window.DAY_CONFIG.rooms) || {};
    return scene.lights.filter((L) => {
      if (id === "office" && /^office\d/.test(L.name)) return true;
      if (!L.name.startsWith("light-")) return false;
      const room = rooms[L.name.slice(6)];
      return !!(room && room.building === id);
    });
  }

  function nearestCar(x, z) {
    let best = null;
    (scene.transformNodes || []).forEach((n) => {
      if (n.name !== "car" || !n.isEnabled()) return;
      const p = n.getAbsolutePosition();
      const d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.d) best = { node: n, d, position: p };
    });
    return best;
  }

  function beginAlarm(node) {
    alarm = { node, until: age + 6.2, phase: 0 };
    alarmBeeps = age;
  }

  /* ---- sound, the same idea as the weather: noise, not a file ---- */
  function soundOn() {
    const btn = document.getElementById && document.getElementById("sound");
    return !!(btn && btn.getAttribute("aria-pressed") === "true");
  }
  function ensureAudio() {
    if (audio || (!window.AudioContext && !window.webkitAudioContext)) return audio;
    try {
      // Share js/mix.js's context so these casts go through its compressor and limiter and the Effects slider;
      // a private context straight to the speakers had no headroom control (the old bad-sounding casts).
      const Mx = window.mix;
      let ctx = null;
      let dest = null;
      if (Mx && Mx.ctx) {
        try { if (Mx.unlock) Mx.unlock(); ctx = Mx.ctx(); const b = Mx.bus && Mx.bus("sfx"); dest = b && b.bus; } catch (e) { ctx = null; }
      }
      if (!ctx || !dest) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        ctx = new Ctx();
        dest = ctx.createDynamicsCompressor();
        dest.threshold.value = -8; dest.ratio.value = 12; dest.knee.value = 10; dest.attack.value = 0.003; dest.release.value = 0.2;
        dest.connect(ctx.destination);
      }
      const master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(dest);
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.97 * b0 + 0.1 * w;
        data[i] = Math.max(-1, Math.min(1, b0 * 2.6));
      }
      audio = { ctx, master, buf };
    } catch (err) {
      audio = null;
    }
    return audio;
  }
  // The three cast sounds share one 1 s noise buffer, which the audio probe names "buf:1x44100": tag each source by its own
  // kind and give it a playback rate that differs from that kind's last one, so no sample+rate repeats inside 60 s.
  const noiseRates = {};
  function tagNoise(src, kind) {
    // The probe flags a repeat against ANY play of the same sample and rate in the last 60 s (rates match within 0.001),
    // so keep every rate used by this kind in that window and pick one at least 0.002 from all of them; if the window
    // is crowded, widen the spread rather than repeat.
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const used = (noiseRates[kind] = (noiseRates[kind] || []).filter((u) => now - u.t < 62));
    let r = 1;
    for (let spread = 0.06, tries = 0; tries < 60; tries++, spread = Math.min(0.4, spread + 0.01)) {
      r = 1 + (Math.random() * 2 - 1) * spread;
      if (used.every((u) => Math.abs(u.r - r) >= 0.002)) break;
    }
    used.push({ r, t: now });
    try { src.__hawkesSampleId = "power-noise-" + kind; src.playbackRate.value = r; } catch (e) { /* */ }
  }
  function burst(freq, dur, vol, type) {
    const a = ensureAudio();
    if (!a || !soundOn()) return;
    if (a.ctx.state === "suspended") a.ctx.resume();
    const t = a.ctx.currentTime;
    const src = a.ctx.createBufferSource();
    src.buffer = a.buf;
    tagNoise(src, "burst");
    const filter = a.ctx.createBiquadFilter();
    filter.type = type || "lowpass";
    // The noise buffer is normalised hot (x2.6, clamped), so the level is scaled down here; each play jitters
    // pitch (filter) and level by up to ~8% so repeats never sound identical.
    filter.frequency.setValueAtTime(Math.max(30, freq * (0.92 + Math.random() * 0.16)), t);
    const g = a.ctx.createGain();
    const lvl = Math.min(0.3, Math.max(0.001, vol * 0.4)) * (0.92 + Math.random() * 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.gain.setValueAtTime(0, t + dur + 0.005); // end on true zero: no click when the source stops
    src.connect(filter);
    filter.connect(g);
    g.connect(a.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }
  /* Each weather call has its own procedural sound (no file): rain a hiss, gale a rising sweep, fog a low pad, sun a chime. */
  function noiseWash(freq, dur, vol, type) {
    const a = ensureAudio();
    if (!a || !soundOn()) return;
    if (a.ctx.state === "suspended") a.ctx.resume();
    const t = a.ctx.currentTime;
    const src = a.ctx.createBufferSource();
    src.buffer = a.buf;
    tagNoise(src, "wash");
    src.loop = true;
    const f = a.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.35);
    g.gain.setValueAtTime(vol, t + Math.max(0.4, dur - 1.1));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(a.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
  function sweep(from, to, dur, vol) {
    const a = ensureAudio();
    if (!a || !soundOn()) return;
    if (a.ctx.state === "suspended") a.ctx.resume();
    const t = a.ctx.currentTime;
    const src = a.ctx.createBufferSource();
    src.buffer = a.buf;
    tagNoise(src, "sweep");
    src.loop = true;
    const f = a.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.55);
    f.frequency.exponentialRampToValueAtTime(from * 0.8, t + dur);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(a.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
  function pad2(freqs, dur, vol) {
    const a = ensureAudio();
    if (!a || !soundOn()) return;
    if (a.ctx.state === "suspended") a.ctx.resume();
    const t = a.ctx.currentTime;
    freqs.forEach((hz, i) => {
      const o = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      o.type = "sine";
      o.frequency.value = hz * (1 + i * 0.002);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(a.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }
  function chime(freqs, vol) {
    const a = ensureAudio();
    if (!a || !soundOn()) return;
    if (a.ctx.state === "suspended") a.ctx.resume();
    const t = a.ctx.currentTime;
    freqs.forEach((hz, i) => {
      const o = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      o.type = "triangle";
      o.frequency.value = hz;
      const at = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
      o.connect(g);
      g.connect(a.master);
      o.start(at);
      o.stop(at + 1.55);
    });
  }
  function beepAlarm() {
    const a = ensureAudio();
    if (!a || !soundOn() || !alarm) return;
    if (age < alarmBeeps) return;
    alarmBeeps = age + 0.28;
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = "square";
    o.frequency.value = alarm.phase % 2 < 1 ? 740 : 520;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g);
    g.connect(a.master);
    o.start(t);
    o.stop(t + 0.18);
  }

  /* ---- Charge (ability bar) and the reticle; the old Pressure chip and power pad are gone ---- */
  if (canDom) {
    const style = document.createElement("style");
    style.textContent = `
.pressure{display:none !important}
.powerpad{display:none !important}
.power-reticle{position:fixed;z-index:5;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid #9fd4ff;border-radius:50%;box-shadow:0 0 8px rgba(80,160,255,.8);pointer-events:none}
.power-reticle[hidden]{display:none}
html.touch-ui.in-control .side{display:none}
`;
    document.head.appendChild(style);
    meter = document.createElement("div");
    meter.className = "pressure";
    meter.id = "pressure";
    meter.hidden = true;
    meterFill = { style: {} };
    reticle = document.createElement("div");
    reticle.className = "power-reticle";
    reticle.id = "power-reticle";
    reticle.hidden = true;
    pad = document.createElement("div");
    pad.className = "powerpad";
    pad.id = "powerpad";
    pad.hidden = true;
    document.body.append(reticle, pad);
  }

  function refuseBar(id) {
    const why = abil.why(id === "gust" || id === "gale" || id === "tornado" ? "wind" : id === "storm" ? "bolt" : id);
    if (why === "locked") bar.refuse(line("locked"));
    else if (why === "energy") bar.refuse(line("dry"));
  }

  const bar = startAbilityBar(abil, (id) => {
    if (id === "bolt" || id === "wind") return; // holds go through onHold
    if (command(id, "touch")) return;
    refuseBar(id);
  }, {
    verbs: VERB_IDS,
    onHold(id, down) {
      // watching: the press takes control and casts the tap (Lightning / Gust); holds start from the next press
      if (mode() === "schedule") {
        if (down && !pressWatching(id === "wind" ? "gust" : "bolt", "touch")) refuseBar(id === "wind" ? "gust" : "bolt");
        return;
      }
      if (id === "bolt") touchBolt = !!down;
      if (id === "wind") touchWind = !!down;
    },
  });

  function paintMeter() {
    if (!canDom) return;
    const on = mode() === "control";
    // watching, the ring is there too: a tap on a power takes control and casts it (not while he drives or the cold open runs)
    const fr = day.control && day.control.mode && !on && day.now ? day.now().frame : null;
    const watching = !on && mode() === "schedule" && !!fr && !(fr.person && fr.person.inCar) && !document.documentElement.classList.contains("cold-open");
    bar.paint(on || watching);
    meter.hidden = true;
    pad.hidden = true;
    if (!on) reticle.hidden = true;
  }

  function placeReticle(aim) {
    if (!canDom || mode() !== "control" || !world.camera) {
      reticle.hidden = true;
      return;
    }
    try {
      const rw = world.engine.getRenderWidth();
      const rh = world.engine.getRenderHeight();
      const canvas = world.engine.getRenderingCanvas();
      const rect = canvas.getBoundingClientRect();
      const v = B.Vector3.Project(new B.Vector3(aim.x, aim.y + 0.15, aim.z), B.Matrix.Identity(), scene.getTransformMatrix(), world.camera.viewport.toGlobal(rw, rh));
      if (v.z < 0 || v.z > 1) {
        reticle.hidden = true;
        return;
      }
      reticle.hidden = false;
      let rx = rect.left + (v.x / rw) * rect.width;
      let ry = rect.top + (v.y / rh) * rect.height;
      // keep the ring between the HUD rows: never under Let go (top centre), Quality or the screen edge
      const keep = 12;
      rx = Math.max(rect.left + keep, Math.min(rect.right - keep, rx));
      ry = Math.max(rect.top + keep, Math.min(rect.bottom - keep, ry));
      for (const id of ["control", "quality"]) {
        const el = document.getElementById(id) || document.querySelector(id === "control" ? ".control-btn" : ".quality-btn");
        if (!el || el.hidden) continue;
        const b = el.getBoundingClientRect();
        if (!b.width || b.top > rect.top + rect.height * 0.4) continue;
        if (rx > b.left - keep && rx < b.right + keep && ry < b.bottom + keep) ry = b.bottom + keep;
      }
      reticle.style.left = rx + "px";
      reticle.style.top = ry + "px";
    } catch (err) {
      reticle.hidden = true;
    }
  }

  /* ---- keys, mouse, gamepad ---- */
  const keyName = {};
  Object.entries(cfg.keys).forEach(([name, k]) => (keyName[String(k).toLowerCase()] = name));
  // G stays as a Gust alias (brief); map it onto Wind's tap path via keyName "gust".
  function releaseBolt(via) {
    if (boltResolved) return;
    if (boltCharge < (cfg.tapMax || 0.28)) {
      releaseCast = true;
      try { if (!command("bolt", via)) refuseBar("bolt"); } finally { releaseCast = false; }
    }
    // held past Storm threshold already fired; mid-hold with no Storm = no bolt
  }
  function releaseWind(via) {
    // Exclusive depths (same idea as Lightning): tap Gust, mid hold Gale on release, full charge Tornado while held.
    if (windResolved === "tornado") return;
    releaseCast = true;
    try {
      if (windCharge >= (cfg.windHold || 0.55)) {
        if (!command("gale", via)) refuseBar("gale");
        return;
      }
      if (!command("gust", via)) refuseBar("gust");
    } finally { releaseCast = false; }
  }
  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT" && e.target.type !== "range") return;
    const name = keyName[(e.key || "").toLowerCase()];
    if (name && mode() === "schedule" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && commands[name === "wind" ? "gust" : name === "bolt" ? "bolt" : name]) {
      if (pressWatching(name === "wind" ? "gust" : name, "key")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    if (!name || mode() !== "control") return;
    if (name === "bolt") {
      if (!e.repeat) keyBolt = true;
    } else if (name === "wind") {
      if (!e.repeat) keyWind = true;
    } else if (name === "gust") {
      if (!e.repeat) command("gust", "key"); // G alias: tap Gust
    } else if (!e.repeat) command(name, "key");
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  window.addEventListener("keyup", (e) => {
    const name = keyName[(e.key || "").toLowerCase()];
    if (name === "bolt" && keyBolt) {
      keyBolt = false;
      if (mode() === "control") releaseBolt("key");
      boltCharge = 0;
      boltResolved = false;
      gatherNoted = false;
    }
    if (name === "wind" && keyWind) {
      keyWind = false;
      if (mode() === "control") releaseWind("key");
      windCharge = 0;
      windResolved = "";
      windGatherNoted = false;
    }
  }, true);
  window.addEventListener("pointermove", (e) => {
    const canvas = world.engine && world.engine.getRenderingCanvas && world.engine.getRenderingCanvas();
    if (!canvas || e.target !== canvas) return;
    pointerAimed = true;
    aimClient = { x: e.clientX, y: e.clientY };
  }, true);
  window.addEventListener("pointerdown", (e) => {
    const a = ensureAudio();
    if (a && a.ctx.state === "suspended") a.ctx.resume();
    if (mode() !== "control") return;
    const canvas = world.engine && world.engine.getRenderingCanvas && world.engine.getRenderingCanvas();
    if (!canvas || e.target !== canvas) return;
    // A street tap aims the next cast; right-click still throws Lightning.
    pointerAimed = true;
    aimClient = { x: e.clientX, y: e.clientY };
    if (e.button === 2) {
      command("bolt", "mouse");
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    // left tap on the street sets aim for the next cast (camera drag still works)
  }, true);
  window.addEventListener("contextmenu", (e) => {
    if (mode() === "control") e.preventDefault();
  }, true);

  function pollPad() {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    let boltHold = false;
    let windHold = false;
    for (const g of pads) {
      if (!g || !g.connected) continue;
      const pressed = (i) => {
        const b = g.buttons[i];
        return !!(b && (b.pressed || b.value > 0.55));
      };
      const edge = (i) => {
        const now = pressed(i);
        const was = padPrev[g.index + ":" + i];
        padPrev[g.index + ":" + i] = now;
        return now && !was;
      };
      if (pressed(3) || pressed(2)) boltHold = true; // Y or X: hold Lightning → Storm
      if (pressed(6) || pressed(7)) windHold = true; // LT/RT: hold Wind
      if (edge(1)) command("rain", "gamepad");
      if (edge(0)) command("fog", "gamepad");
      if (edge(9)) command("sunbreak", "gamepad");
    }
    return { boltHold, windHold };
  }

  /* ---- each frame, after the day and the weather have had the scene ---- */
  function tick(dt) {
    dt = Math.max(0, Math.min(0.1, dt || 0));
    age += dt;
    ensureProps();
    const on = mode() === "control";
    if (on && !wasControl) pointerAimed = false;
    if (!on) {
      keyBolt = false;
      touchBolt = false;
      padBolt = false;
      keyWind = false;
      touchWind = false;
      padWind = false;
      wantStorm = false;
      localStorm = false;
      cloudTarget = 0;
      boltResolved = false;
      windResolved = "";
      gatherNoted = false;
      windGatherNoted = false;
      boltCharge = 0;
      windCharge = 0;
      charge = 0;
    }
    wasControl = on;
    if (on) gauge.step(dt, storming());

    const padState = on ? pollPad() : { boltHold: false, windHold: false };
    const boltDown = on && (keyBolt || touchBolt || padState.boltHold);
    const windDown = on && (keyWind || touchWind || padState.windHold);

    // Falling edges (touch / gamepad). Keyboard uses keyup.
    if (on && prevTouchBolt && !touchBolt && !keyBolt && !padState.boltHold) {
      releaseBolt("touch");
      boltCharge = 0; boltResolved = false; gatherNoted = false; charge = 0;
    }
    if (on && padBolt && !padState.boltHold && !keyBolt && !touchBolt) {
      releaseBolt("gamepad");
      boltCharge = 0; boltResolved = false; gatherNoted = false; charge = 0;
    }
    if (on && prevTouchWind && !touchWind && !keyWind && !padState.windHold) {
      releaseWind("touch");
      windCharge = 0; windResolved = ""; windGatherNoted = false;
    }
    if (on && padWind && !padState.windHold && !keyWind && !touchWind) {
      releaseWind("gamepad");
      windCharge = 0; windResolved = ""; windGatherNoted = false;
    }
    prevTouchBolt = touchBolt;
    prevTouchWind = touchWind;
    padBolt = padState.boltHold;
    padWind = padState.windHold;

    wantStorm = boltDown && !boltResolved && boltCharge >= (cfg.tapMax || 0.28);
    /* `charge` drives pose(): it must never outlive the hold (a key release used to leave it above 0, so the wind-up pose
       was asked for until Let go and he never settled back to idle). */
    if (!boltDown) charge = 0;
    if (boltDown) {
      boltCharge += dt;
      charge = boltCharge;
      if (boltCharge >= (cfg.tapMax || 0.28)) {
        if (!gatherNoted) {
          gatherNoted = true;
          note(line("gather"));
        }
        if (!boltResolved) cloudTarget = Math.max(cloudTarget, 2.2 + 7 * Math.min(1, boltCharge / (cfg.hold || 0.7)));
        if (!boltResolved && boltCharge >= (cfg.hold || 0.7)) {
          boltResolved = true;
          const via = padState.boltHold ? "gamepad" : touchBolt ? "touch" : "key";
          if (!summon(via)) refuseBar("storm");
          if (!localStorm) cloudTarget = 0;
        }
      }
    }

    if (windDown) {
      windCharge += dt;
      if (windCharge >= (cfg.tapMax || 0.28)) {
        if (!windGatherNoted) {
          windGatherNoted = true;
          note(line("windGather"));
        }
        if (!boltDown && !localStorm) {
          const full = cfg.windFull || 1.35;
          cloudTarget = Math.max(cloudTarget, 1.4 + 10 * Math.min(1, windCharge / full));
        }
        // Full charge → Tornado only (no Gale tax on the way). Mid-hold Gale fires on release.
        if (windResolved !== "tornado" && windCharge >= (cfg.windFull || 1.35)) {
          windResolved = "tornado";
          const via = padState.windHold ? "gamepad" : touchWind ? "touch" : "key";
          if (!command("tornado", via)) refuseBar("tornado");
        }
      }
    } else if (!boltDown && !localStorm) {
      cloudTarget = 0;
    }
    if (localStorm) cloudTarget = Math.max(cloudTarget, 34);

    cloudR += (cloudTarget - cloudR) * (1 - Math.exp(-2.6 * dt));
    const showCloud = cloudR > 0.8;
    cloud.setEnabled(showCloud);
    shelf.setEnabled(showCloud);
    if (showCloud) {
      const p = who();
      cloud.scaling.set(cloudR * 2, cloudR * 0.85, cloudR * 2);
      // The sphere's underside (centre - 0.425R) stays 7 m over his feet at any size, so the camera and he are never inside it.
      // ...and never under or around the camera: a high / zoomed-out orbit camera (phone landscape) sat inside it, a dark orb over his head.
      const camY = world.camera && world.camera.position ? world.camera.position.y : 0;
      const under = Math.max((p.y || 0) + 7, camY + 3);
      cloud.position.set(p.x, under + cloudR * 0.425, p.z);
      shelf.scaling.set(cloudR * 2.4, 1, cloudR * 2.4);
      shelf.position.set(p.x, under + 0.2, p.z);
      // Belt and braces: whatever the camera does between frames (a pull-back, a zoom, a wall swing), a cloud close to the lens fades out
      // instead of showing as an opaque dark disc over his head (the playtest's camera-inside, phone landscape).
      let near = 1;
      if (world.camera && world.camera.position) {
        const cp = world.camera.position;
        const d = Math.hypot(cp.x - p.x, cp.y - cloud.position.y, cp.z - p.z);
        const reach = cloudR * 0.6 + 2;
        near = Math.max(0, Math.min(1, (d - reach) / 4));
      }
      cloudMat.alpha = Math.min(0.84, 0.35 + cloudR / 40) * near;
    }
    if (rainPs) {
      const p = who();
      rainPs.emitter.set(p.x, (p.y || 0) + 9, p.z);
      const w = wx();
      const globalRain = w && w.now ? w.now().rain : 0;
      rainPs.emitRate = localStorm ? (globalRain > 0.72 ? 60 : 900) : 0;
    }

    tickWindUp(dt);
    castFor = Math.max(0, castFor - dt);
    throwFor = Math.max(0, throwFor - dt);
    flash = Math.max(0, flash - dt * 3.1);
    fx.update(dt);
    flashLight.intensity = Math.max(flash * 36, fx.lightI());

    if (flash > 0) {
      const c = scene.clearColor;
      const k = flash * 0.72;
      c.r += (1 - c.r) * k;
      c.g += (1 - c.g) * k;
      c.b += (1 - c.b) * k;
      const stage = world.stage || {};
      if (stage.pipeline && stage.pipeline.imageProcessing) {
        const ipc = stage.pipeline.imageProcessing.imageProcessingConfiguration;
        const curExp = ipc ? ipc._exposure : stage.pipeline.imageProcessing.exposure;
        const nextExp = curExp * (1 + flash * 1.5);
        const safeExp = Math.abs(nextExp - 1.0) < 1e-4 ? 0.9999 : nextExp;
        if (ipc) ipc._exposure = safeExp;
        if (scene.imageProcessingConfiguration) scene.imageProcessingConfiguration._exposure = safeExp;
      }
    }

    if (callFx.until > age) {
      // Gale: a steady shove nearby, fading (not every plaza chair from across the district)
      const k = (callFx.until - age) / 3;
      const me = who();
      props.forEach((prop) => {
        if (Math.hypot(prop.mesh.position.x - me.x, prop.mesh.position.z - me.z) > 16) return;
        shove(prop, callFx.dirX * 5 * k, 0.4, callFx.dirZ * 5 * k);
      });
    }
    if (gustFx && age > gustFx.until) {
      gustMesh.setEnabled(false);
      gustFx = gustFx.pushes != null ? Object.assign(gustFx, { alive: false }) : gustFx;
    }
    if (strike && strikeSnap && age < strike.at + 1.2) {
      let n = 0;
      props.forEach((prop, i) => {
        const s = strikeSnap[i];
        if (!s) return;
        if (Math.hypot(prop.mesh.position.x - s.x, prop.mesh.position.z - s.z) > 0.35) n++;
      });
      strike.knocked = Math.max(strike.knocked, n);
    }
    for (let i = pendingThunder.length - 1; i >= 0; i--) {
      const th = pendingThunder[i];
      if (age < th.at) continue;
      pendingThunder.splice(i, 1);
      if (strike && strike.id === th.id) strike.thunder = true;
      flash = Math.max(flash, 0.28);
      shake = Math.max(shake, 0.018 + 0.04 * (1 - Math.min(1, th.dist / 40)));
      // Layered thunder (js/sfx.js): body + rumble variants, distance low-pass, sidechain duck. Falls back to the
      // recorded near/far cracks in score.js, then a synth rumble under either.
      let sampled = false;
      if (day && day.sfx && day.sfx.thunder) {
        sampled = !!day.sfx.thunder({
          dist: th.dist,
          delay: th.delay,
          flashAt: th.flashAt,
          x: strike && strike.x,
          z: strike && strike.z,
        });
      }
      if (!sampled && day && day.score && day.score.crack) {
        sampled = !!day.score.crack(th.dist < 22 ? "near" : "far", { dist: th.dist, delay: th.delay, flashAt: th.flashAt });
      }
      burst(140, 1.35, sampled ? 0.28 : 0.6, "lowpass");
      say("thunder", "world", "bolt");
    }

    {
      const cam = world.camera && world.camera.position;
      tornadoLook.update(dt, cam);
      tornado = tornadoLook.info().active;
    }

    if (blackout) {
      if (age > blackout.until) {
        blackout.covers.forEach((m) => m.dispose());
        blackout = null;
      } else {
        blackout.lights.forEach((L) => (L.intensity = 0));
        blackout.dims.forEach((m) => m.material.emissiveColor.set(0.012, 0.012, 0.016));
      }
    }
    if (alarm) {
      alarm.phase += dt * 14;
      if (age > alarm.until) alarm = null;
      else {
        const onLamp = Math.sin(alarm.phase) > 0;
        alarm.node.getChildMeshes(false).forEach((m) => {
          if (!m.material || !m.material.emissiveColor) return;
          if (!/^(hl|tl)/.test(m.name)) return;
          const k = onLamp ? 2.4 : 0.02;
          if (m.name.startsWith("hl")) m.material.emissiveColor.set(k, k * 0.95, k * 0.75);
          else m.material.emissiveColor.set(k, k * 0.08, k * 0.05);
        });
        beepAlarm();
      }
    }

    for (let i = fxList.length - 1; i >= 0; i--) {
      const f = fxList[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        f.mesh.dispose();
        f.mat.dispose();
        fxList.splice(i, 1);
        continue;
      }
      f.mesh.scaling.set(f.s0.x * (1 + (f.grow - 1) * k), f.s0.y * (1 + (f.grow - 1) * k), f.s0.z * (1 + (f.grow - 1) * k));
      f.mesh.position.y += f.rise * dt;
      f.mat.alpha = 0.8 * (1 - k);
    }
    hitstop = Math.max(0, hitstop - dt);
    // Camera shake never runs over 0.28 s in one go; a push in the fov goes with it.
    if (shake > 0.0005 && !shaking) {
      shaking = true;
      shakeT = 0.28;
      shakeRun = 0;
    }
    if (shaking) {
      shakeRun += dt;
      shakeMax = Math.max(shakeMax, shakeRun);
      shakeT -= dt;
      if (shakeT <= 0 || shake <= 0.0005) {
        shake = 0;
        shaking = false;
      }
    }
    const cam = world.camera;
    if (cam) {
      cam.alpha -= shaken.a;
      cam.beta -= shaken.b;
      // eased towards each new random offset (not a fresh one every frame): the camera's turn rate stays under the 180 deg/s limit
      shaken.a += ((Math.random() - 0.5) * shake * 0.5 - shaken.a) * 0.4;
      shaken.b += ((Math.random() - 0.5) * shake * 0.4 - shaken.b) * 0.4;
      cam.alpha += shaken.a;
      cam.beta += shaken.b;
      cam.shakeAlpha = shaken.a; // js/control.js reads the camera's drag net of this
      shake = Math.max(0, shake - dt * 1.6);
      cam.fov += pushApplied;
      pushApplied = push;
      cam.fov -= pushApplied;
      push = Math.max(0, push - dt * 0.4);
    }

    const aim = on ? groundAim() : null;
    if (aim) placeReticle(aim);
    paintMeter();
  }

  const prev = world.update.bind(world);
  world.update = function (fr, dt, opts) {
    prev(fr, hitstop > 0 ? dt * 0.1 : dt, opts);
    try {
      tick(dt);
    } catch (err) {
      console.error("[powers]", err);
    }
  };

  function pose() {
    if (mode() !== "control") return null;
    if (throwFor > 0) return "throw";
    if (pendingCast) return powerPose(pendingCast.name);
    // Distinct wind-ups: Lightning/Storm gather vs Rain/Fog/Sun/Wind gather (js/small-weather.js clips).
    const boltHand = !!(keyBolt || touchBolt || padBolt || wantStorm || (charge > 0 && !windCharge));
    const weatherHand = !!(keyWind || touchWind || padWind || windCharge > 0);
    if (boltHand) return "windbolt";
    if (weatherHand) return "windrain";
    if (castFor > 0) {
      return powerPose(lastCast && lastCast.id);
    }
    return null;
  }

  function now() {
    const g = gauge.now();
    const aim = mode() === "control" ? groundAim() : null;
    return {
      pressure: g.value,
      energy: g.value,
      abilities: abil.now().abilities,
      max: g.max,
      costs: g.costs,
      storming: storming(),
      called: localStorm,
      radius: cloudR,
      charging: wantStorm && !boltResolved,
      /* a cast being wound up: Lightning's hold, or Wind's hold before Gale/Tornado (js/stems.js reads it) */
      windup: (wantStorm && !boltResolved) || (mode() === "control" && (boltCharge > 0.05 || windCharge > 0.05)),
      flash,
      aim: aim ? { x: aim.x, z: aim.z, y: aim.y } : null,
      strike: strike ? Object.assign({}, strike) : null,
      bolt: fx.info(),
      gust: gustFx ? { id: gustFx.id, pushes: gustFx.pushes, dirX: gustFx.dirX, dirZ: gustFx.dirZ, alive: gustMesh.isEnabled() } : null,
      tornado: (() => {
        const ti = tornadoLook.info();
        const a = ti.active || tornado;
        if (!a) {
          return ti.landed > 0 || ti.settleLeft > 0
            ? {
                x: 0, z: 0, life: 0, travelled: 0, faded: true,
                shells: ti.shells, layers: ti.shells + 1, dustRing: true,
                lifted: ti.lifted, landed: ti.landed, floating: ti.floating, sunk: ti.sunk,
                debrisCap: ti.debrisCap, settleLeft: ti.settleLeft, ground: ti.ground,
              }
            : null;
        }
        return {
          x: a.x, z: a.z, axis: a.axis, dir: a.dir, life: a.life, age: a.age,
          travelled: a.travelled != null ? a.travelled : Math.hypot(a.x - (a.startX || a.x), a.z - (a.startZ || a.z)),
          zone: a.zone, shells: a.shells, layers: a.layers || (a.shells + 1),
          dustRing: a.dustRing !== false, spray: !!a.spray,
          lifted: a.lifted != null ? a.lifted : ti.lifted,
          landed: a.landed != null ? a.landed : ti.landed,
          floating: ti.floating, sunk: ti.sunk, debrisCap: a.debrisCap || ti.debrisCap,
          settleLeft: ti.settleLeft, ground: ti.ground, faded: a.life <= 0,
        };
      })(),
      tornadoFx: tornadoLook.info(),
      blocked: blocked ? Object.assign({}, blocked) : null,
      blackout: blackout ? blackout.id : null,
      alarm: !!(alarm && age < alarm.until),
      props: propPositions(),
      localRain: localStorm,
      cast: lastCast
        ? Object.assign({ shakeMax, power: lastCast.id, age: (performance.now() - lastCast.at) / 1000 }, lastCast)
        : { shakeMax },
    };
  }

  const api = {
    now,
    loadTornado,
    tornadoLoaded: () => !!tornadoFx,
    pose,
    command,
    thunderDelay,
    boltFx: fx,
    abilities: abil,
    /** The opening's hooks: aim every bolt at {x,y,z} (null = back to the reticle); gate(fn(name, via) -> bool) (null = open). */
    aimAt(pt) { aimOverride = pt ? { x: pt.x, y: pt.y, z: pt.z } : null; return aimOverride; },
    /* A one-off camera shake from outside (the results card's stamp): eased noise like a cast's, never over 0.28 s. */
    kick(amount) { shake = Math.max(shake, Math.min(0.03, amount || 0)); return shake; },
    hitstop(sec) { hitstop = Math.max(hitstop, sec || 0); return hitstop; },
    gate(fn) { gateFn = typeof fn === "function" ? fn : null; return !!gateFn; },
    hold(on) {
      // Cold-open / tests: hold Lightning (Storm) or release.
      touchBolt = !!on;
      if (!on) {
        boltCharge = 0;
        boltResolved = false;
        gatherNoted = false;
        charge = 0;
      }
      wantStorm = !!on;
      return wantStorm;
    },
  };
  world.__powers = api;
  window.powers = api;
  if (day) day.powers = api;
  return api;
}

if (typeof window !== "undefined" && window.day && window.day.world && typeof document !== "undefined" && document.body) {
  const w = window.day.world();
  if (w) startPowers(w);
}
