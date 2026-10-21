/* ==========================================================================
   The weather. One place other code can read: weather.now(), weather.set(state, intensity).
   Seven states — clear, clouds, rain, storm, fog, wind, snow — each with its own
   sky tint, light, fog, particles, wet roads, wind and a sound. They blend over a
   few real seconds on top of the time-of-day sky js/world.js already draws.
   With nobody in control, the day follows a forecast seeded by the date. While
   he's the player's, 1–7, hold Q (a radial), or a tap on a phone sets it.
   After let-go the set weather holds for a few real seconds, then drifts back.
   ========================================================================== */

export const STATES = ["clear", "clouds", "rain", "storm", "fog", "wind", "snow"];

export const STATE_NAMES = {
  clear: "Clear",
  clouds: "Clouds",
  rain: "Rain",
  storm: "Storm",
  fog: "Fog",
  wind: "Wind",
  snow: "Snow",
};

/* How hard each state pushes the time-of-day sky. `cover` is how much of that
   sky it claims; the hour still shows through. Sounds are relative levels. */
const LOOK = {
  clear: { sky: [1.02, 1.03, 1.04], cover: 0.05, light: 1, hemi: 1, fog: 0.0065, fogC: [0.75, 0.82, 0.9], exposure: 1, wet: 0, wind: 0.06, rain: 0, splash: 0, snow: 0, dust: 0, lightning: 0, sound: { air: 0.28, rain: 0, wind: 0.06, thunder: 0, hush: 0, snow: 0 } },
  clouds: { sky: [0.62, 0.66, 0.74], cover: 0.62, light: 0.48, hemi: 0.82, fog: 0.016, fogC: [0.5, 0.54, 0.62], exposure: 0.9, wet: 0.02, wind: 0.16, rain: 0, splash: 0, snow: 0, dust: 0, lightning: 0, sound: { air: 0.1, rain: 0, wind: 0.14, thunder: 0, hush: 0.22, snow: 0 } },
  rain: { sky: [0.42, 0.48, 0.58], cover: 0.74, light: 0.28, hemi: 0.62, fog: 0.022, fogC: [0.32, 0.38, 0.46], exposure: 0.78, wet: 1, wind: 0.42, rain: 0.72, splash: 0.85, snow: 0, dust: 0, lightning: 0, sound: { air: 0, rain: 0.8, wind: 0.22, thunder: 0, hush: 0.05, snow: 0 } },
  storm: { sky: [0.2, 0.24, 0.4], cover: 0.86, light: 0.1, hemi: 0.4, fog: 0.034, fogC: [0.1, 0.12, 0.22], exposure: 0.58, wet: 1, wind: 1, rain: 1, splash: 1, snow: 0, dust: 0, lightning: 1, sound: { air: 0, rain: 1, wind: 0.72, thunder: 0.9, hush: 0, snow: 0 } },
  fog: { sky: [0.78, 0.8, 0.82], cover: 0.78, light: 0.34, hemi: 1.2, fog: 0.09, fogC: [0.8, 0.82, 0.84], exposure: 0.96, wet: 0.1, wind: 0.04, rain: 0, splash: 0, snow: 0, dust: 0, lightning: 0, sound: { air: 0.03, rain: 0, wind: 0.03, thunder: 0, hush: 0.85, snow: 0 } },
  wind: { sky: [0.78, 0.86, 0.98], cover: 0.32, light: 0.9, hemi: 0.95, fog: 0.009, fogC: [0.62, 0.7, 0.8], exposure: 1.04, wet: 0, wind: 1, rain: 0, splash: 0, snow: 0, dust: 1, lightning: 0, sound: { air: 0.06, rain: 0, wind: 1, thunder: 0, hush: 0, snow: 0 } },
  snow: { sky: [0.82, 0.86, 0.94], cover: 0.55, light: 0.72, hemi: 1.08, fog: 0.03, fogC: [0.84, 0.87, 0.92], exposure: 1.08, wet: 0.06, wind: 0.28, rain: 0, splash: 0, snow: 1, dust: 0, lightning: 0, sound: { air: 0.04, rain: 0, wind: 0.12, thunder: 0, hush: 0.28, snow: 0.9 } },
};

const FIELDS = ["cover", "light", "hemi", "fog", "exposure", "wet", "wind", "rain", "splash", "snow", "dust", "lightning"];
const SOUND = ["air", "rain", "wind", "thunder", "hush", "snow"];
const DEFAULT_WEIGHT = { clear: 26, clouds: 22, rain: 16, storm: 8, fog: 10, wind: 10, snow: 8 };

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The weather his day has at this minute: same date, same answer. */
export function forecastAt(dateKey, minutes, forecast) {
  const hours = (forecast && forecast.hours) || 3;
  const weight = (forecast && forecast.weight) || DEFAULT_WEIGHT;
  const span = hours * 60;
  const dayMin = ((minutes % 1440) + 1440) % 1440;
  const slot = Math.floor(dayMin / span);
  const rng = makeRng(hash(`weather:${dateKey}:${slot}`));
  let total = 0;
  STATES.forEach((s) => (total += weight[s] || 1));
  let r = rng() * total;
  let state = STATES[0];
  for (const s of STATES) {
    r -= weight[s] || 1;
    if (r <= 0) {
      state = s;
      break;
    }
  }
  return { state, intensity: 0.72 + rng() * 0.28, slot };
}

function emptyLook() {
  const o = { sky: [0, 0, 0], fogC: [0, 0, 0], sound: {} };
  FIELDS.forEach((f) => (o[f] = 0));
  SOUND.forEach((f) => (o.sound[f] = 0));
  return o;
}

function mixLooks(weights) {
  const o = emptyLook();
  for (const s of STATES) {
    const w = weights[s];
    if (w < 1e-4) continue;
    const L = LOOK[s];
    for (let i = 0; i < 3; i++) {
      o.sky[i] += L.sky[i] * w;
      o.fogC[i] += L.fogC[i] * w;
    }
    FIELDS.forEach((f) => (o[f] += L[f] * w));
    SOUND.forEach((f) => (o.sound[f] += (L.sound[f] || 0) * w));
  }
  return o;
}

/** Intensity eases a state back toward clear, so a light forecast isn't a full storm. */
function withIntensity(mixed, k) {
  const c = LOOK.clear;
  const o = emptyLook();
  for (let i = 0; i < 3; i++) {
    o.sky[i] = c.sky[i] + (mixed.sky[i] - c.sky[i]) * k;
    o.fogC[i] = c.fogC[i] + (mixed.fogC[i] - c.fogC[i]) * k;
  }
  FIELDS.forEach((f) => (o[f] = c[f] + (mixed[f] - c[f]) * k));
  SOUND.forEach((f) => (o.sound[f] = (c.sound[f] || 0) + ((mixed.sound[f] || 0) - (c.sound[f] || 0)) * k));
  return o;
}

/**
 * The state machine, with no scene. `step(dt, snap)` moves the blend.
 * `follow(date, minutes, dt, snap, mode)` is what the page calls each frame:
 * while he's the player's the set weather sticks; after let-go it holds for
 * `hold` real seconds, then drifts back to the day's forecast.
 */
export function createWeather(opt) {
  opt = opt || {};
  const blendSec = opt.blend > 0 ? opt.blend : 3.4;
  const holdSec = opt.hold > 0 ? opt.hold : 24;
  const tau = blendSec / 3;
  const weights = {};
  STATES.forEach((s) => (weights[s] = s === "clear" ? 1 : 0));
  let target = "clear";
  let targetIntensity = 1;
  let level = 1;
  let manual = false;
  let wasHeld = false;
  let holdLeft = 0;
  let lastForecast = { state: "clear", intensity: 1, slot: 0 };

  function step(dt, snap) {
    const k = snap ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau);
    for (const s of STATES) {
      const g = s === target ? 1 : 0;
      weights[s] += (g - weights[s]) * k;
    }
    level += (targetIntensity - level) * k;
  }

  function shown() {
    let name = STATES[0];
    let best = -1;
    for (const s of STATES) {
      if (weights[s] > best) {
        best = weights[s];
        name = s;
      }
    }
    return name;
  }

  function blend() {
    let err = Math.abs(level - targetIntensity);
    for (const s of STATES) err = Math.max(err, Math.abs(weights[s] - (s === target ? 1 : 0)));
    return 1 - err;
  }

  function look() {
    return withIntensity(mixLooks(weights), level);
  }

  function now() {
    const L = look();
    return {
      state: target,
      intensity: targetIntensity,
      shown: shown(),
      blend: blend(),
      level,
      wet: L.wet,
      wind: L.wind,
      fog: L.fog,
      rain: L.rain,
      snow: L.snow,
      dust: L.dust,
      lightning: L.lightning,
      light: L.light,
      cover: L.cover,
      sound: Object.assign({}, L.sound),
      manual,
      hold: holdLeft,
      holdSec,
      forecast: lastForecast.state,
      forecastIntensity: lastForecast.intensity,
    };
  }

  function set(state, intensity, via) {
    if (!STATES.includes(state)) return false;
    target = state;
    targetIntensity = intensity == null || !Number.isFinite(intensity) ? 1 : Math.max(0, Math.min(1, intensity));
    if (via !== "forecast") {
      manual = true;
      holdLeft = 0;
      if (opt.onSet) opt.onSet({ state, intensity: targetIntensity, via: via || "set" });
    }
    return true;
  }

  function follow(dateKey, minutes, dt, snap, mode) {
    const held = mode === "control" || mode === "returning";
    if (wasHeld && !held) {
      // Keep what he left behind for a while, then hand it back to the forecast.
      if (manual) holdLeft = holdSec;
      else holdLeft = 0;
    }
    wasHeld = held;
    lastForecast = forecastAt(dateKey, minutes, opt.forecast);
    if (!held && holdLeft > 0 && !snap) {
      holdLeft = Math.max(0, holdLeft - Math.max(0, dt));
      if (holdLeft <= 0 && manual) {
        manual = false;
        if (opt.onDrift) opt.onDrift({ from: target, to: lastForecast.state });
      }
    }
    if (!manual) {
      target = lastForecast.state;
      targetIntensity = lastForecast.intensity;
      holdLeft = 0;
    }
    step(dt, snap);
  }

  return { set, step, follow, now, look, blendSec, holdSec };
}

/* ---------------- the page: sky, particles, wet roads, wind, sound, the wheel ---------------- */

export function startWeather(world, dayApi) {
  const day = dayApi || window.day;
  if (!world) world = day && day.world && day.world();
  if (!world || !world.scene || world.__weather) return world && world.__weather;
  const cfg = (window.DAY_CONFIG && window.DAY_CONFIG.weather) || {};
  const B = window.BABYLON;
  const scene = world.scene;
  const stage = world.stage || {};
  const sun = stage.sun || scene.getLightByName("sun");
  const hemi = stage.hemi || scene.getLightByName("sky");
  const pipeline = stage.pipeline;
  const roadMat = stage.road || (scene.getMeshByName("road") && scene.getMeshByName("road").material);
  const roadIsPbr = !!(roadMat && roadMat.getClassName && roadMat.getClassName() === "PBRMaterial");

  const live = {
    sky: "#888888",
    gloss: roadMat
      ? (roadIsPbr
        ? (roadMat.clearCoat && roadMat.clearCoat.isEnabled ? roadMat.clearCoat.intensity : 0.04)
        : (roadMat.specularColor ? roadMat.specularColor.r : 0))
      : 0,
    heard: 0,
    flashes: 0,
    particles: "off",
    puddles: 0,
  };
  let flash = 0;
  let nextFlash = 1.6;
  let booted = false;
  let lastWall = typeof performance !== "undefined" ? performance.now() : 0;
  const noted = { state: null };
  const react = { state: null, at: 0, cool: (cfg.react && cfg.react.cooldown) || 18 };

  const weather = createWeather({
    blend: cfg.blend,
    hold: cfg.hold,
    forecast: cfg.forecast,
    onSet(detail) {
      const line = (cfg.lines && cfg.lines[detail.state]) || STATE_NAMES[detail.state];
      if (noted.state !== detail.state && day.note) day.note(line);
      noted.state = detail.state;
      if (typeof CustomEvent === "function" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("day:weather", { detail }));
      }
    },
    onDrift(detail) {
      if (typeof CustomEvent === "function" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("day:weather-drift", { detail }));
      }
    },
  });

  /** Autopilot log lines while the weather he left behind still holds (day.config.js weather.react). */
  function tickReact(mode, n, wall) {
    if (mode !== "schedule" || !n.manual) {
      if (mode === "control" || mode === "returning") react.state = null;
      return;
    }
    const lines = (cfg.react && cfg.react[n.state]) || null;
    if (!lines || !lines.length) return;
    const due = react.state !== n.state || react.at <= 0;
    if (!due) {
      react.at -= wall;
      return;
    }
    const text = lines[Math.floor(Math.random() * lines.length)];
    if (day.note) day.note(text);
    react.state = n.state;
    react.at = react.cool;
    if (typeof CustomEvent === "function" && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent("day:weather-react", { detail: { state: n.state, text } }));
    }
  }

  function clock() {
    const n = day.now ? day.now() : { key: "date", minutes: 12 * 60 };
    const mode = day.control ? day.control.mode() : "schedule";
    return { key: n.key || "date", minutes: n.minutes || 0, mode };
  }

  /* ---- wet road + puddles that mirror the street ---- */
  // Look dresses the avenue in PBR asphalt (albedoColor × texture); older builds used StandardMaterial diffuseColor.
  const dryDiffuse = roadMat
    ? (roadIsPbr
      ? (roadMat.albedoColor ? roadMat.albedoColor.clone() : new B.Color3(1, 1, 1))
      : roadMat.diffuseColor.clone())
    : null;
  const dryRough = roadIsPbr ? roadMat.roughness : null;
  const dryCoat = roadIsPbr && roadMat.clearCoat ? roadMat.clearCoat.intensity : null;
  const scratch = {
    tod: new B.Color3(),
    sky: new B.Color3(),
    tint: new B.Color3(),
    mul: new B.Color3(),
    toward: new B.Color3(),
    mixed: new B.Color3(),
    fog: new B.Color3(),
    white: new B.Color3(1, 1, 1),
    diff: new B.Color3(),
  };
  const puddles = [];
  if (roadMat) {
    const pmat = new B.StandardMaterial("puddle", scene);
    pmat.diffuseColor = new B.Color3(0.015, 0.022, 0.032);
    pmat.emissiveColor = new B.Color3(0.01, 0.018, 0.028);
    pmat.specularColor = new B.Color3(0.75, 0.84, 0.95);
    pmat.specularPower = 96;
    pmat.alpha = 0;
    pmat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    pmat.backFaceCulling = true;
    const rz = (window.DAY_CONFIG.street && window.DAY_CONFIG.street.z) || 12.6;
    [[0, 0.15], [2.4, -0.35], [-2.1, 0.4], [4.6, 0.2], [-4.4, -0.15], [1.2, 1.1]].forEach((spot, i) => {
      const mesh = B.MeshBuilder.CreateBox("puddle" + i, { width: 2.1, height: 0.02, depth: 1.25 }, scene);
      mesh.material = pmat;
      mesh.position.set(spot[0], 0.06, rz + spot[1]);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.setEnabled(false);
      puddles.push({ mesh, dx: spot[0], dz: spot[1], rz });
    });
  }

  /* ---- particles: GPU when the browser has them, the ordinary system otherwise ---- */
  const systems = [];
  function makeSystem(name, gpuCount, cpuCount) {
    let ps = null;
    let gpu = false;
    try {
      if (B.GPUParticleSystem && B.GPUParticleSystem.IsSupported) {
        ps = new B.GPUParticleSystem(name, { capacity: gpuCount }, scene);
        gpu = true;
      }
    } catch (err) {
      ps = null;
    }
    if (!ps) {
      try {
        ps = new B.ParticleSystem(name, cpuCount, scene);
      } catch (err) {
        return null;
      }
    }
    ps.emitter = new B.Vector3(0, 8, 0);
    ps.particleTexture = tex(name === "snow" || name === "splash" ? "dot" : "streak");
    if (!ps.particleTexture) {
      ps.dispose();
      return null;
    }
    ps.minEmitBox = new B.Vector3(-16, 0, -16);
    ps.maxEmitBox = new B.Vector3(16, 0, 16);
    ps.direction1 = new B.Vector3(0, -1, 0);
    ps.direction2 = new B.Vector3(0, -1, 0);
    ps.gravity = new B.Vector3(0, 0, 0);
    ps.minSize = 0.05;
    ps.maxSize = 0.1;
    ps.minLifeTime = 0.6;
    ps.maxLifeTime = 1;
    ps.emitRate = 0;
    ps.minEmitPower = 1;
    ps.maxEmitPower = 2;
    ps.updateSpeed = 0.016;
    ps.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
    ps.billboardMode = B.ParticleSystem.BILLBOARDMODE_ALL;
    ps.color1 = new B.Color4(1, 1, 1, 0.5);
    ps.color2 = new B.Color4(1, 1, 1, 0.3);
    ps.colorDead = new B.Color4(1, 1, 1, 0);
    ps.__gpu = gpu;
    systems.push(ps);
    if (gpu) live.particles = "gpu";
    else if (live.particles === "off") live.particles = "cpu";
    return ps;
  }
  function tex(kind) {
    try {
      const size = 64;
      const t = new B.DynamicTexture("wx-" + kind, size, scene, false);
      const c = t.getContext();
      if (kind === "streak") {
        const g = c.createLinearGradient(0, 0, 0, size);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.3, "rgba(255,255,255,0.95)");
        g.addColorStop(0.7, "rgba(255,255,255,0.95)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(24, 0, 16, size);
      } else {
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, size, size);
      }
      t.hasAlpha = true;
      t.update();
      return t;
    } catch (err) {
      return null;
    }
  }
  const rainPs = makeSystem("rain", 9000, 1400);
  const splashPs = makeSystem("splash", 2200, 500);
  const snowPs = makeSystem("snow", 5000, 900);
  const dustPs = makeSystem("dust", 1200, 350);
  if (rainPs) {
    rainPs.billboardMode = B.ParticleSystem.BILLBOARDMODE_STRETCHED;
    rainPs.minEmitBox.set(-18, 0, -18);
    rainPs.maxEmitBox.set(18, 2, 18);
    rainPs.minLifeTime = 0.45;
    rainPs.maxLifeTime = 0.75;
    rainPs.minSize = 0.12;
    rainPs.maxSize = 0.28;
    rainPs.color1.set(0.75, 0.84, 0.95, 0.55);
    rainPs.color2.set(0.85, 0.9, 1, 0.28);
  }
  if (splashPs) {
    splashPs.minEmitBox.set(-14, 0, -14);
    splashPs.maxEmitBox.set(14, 0.05, 14);
    splashPs.minLifeTime = 0.12;
    splashPs.maxLifeTime = 0.28;
    splashPs.minSize = 0.04;
    splashPs.maxSize = 0.14;
    splashPs.color1.set(0.8, 0.88, 1, 0.55);
    splashPs.color2.set(0.9, 0.95, 1, 0.25);
  }
  if (snowPs) {
    snowPs.minEmitBox.set(-18, 0, -18);
    snowPs.maxEmitBox.set(18, 6, 18);
    snowPs.minLifeTime = 3.2;
    snowPs.maxLifeTime = 5.5;
    snowPs.minSize = 0.06;
    snowPs.maxSize = 0.16;
    snowPs.color1.set(0.95, 0.97, 1, 0.9);
    snowPs.color2.set(0.85, 0.9, 1, 0.55);
  }
  if (dustPs) {
    dustPs.billboardMode = B.ParticleSystem.BILLBOARDMODE_STRETCHED;
    dustPs.minEmitBox.set(-12, -1, -12);
    dustPs.maxEmitBox.set(12, 2, 12);
    dustPs.minLifeTime = 0.5;
    dustPs.maxLifeTime = 1.1;
    dustPs.minSize = 0.08;
    dustPs.maxSize = 0.2;
    dustPs.color1.set(0.72, 0.7, 0.62, 0.35);
    dustPs.color2.set(0.8, 0.78, 0.7, 0.15);
  }
  systems.forEach((ps) => {
    try {
      ps.start();
    } catch (err) {
      ps.__dead = true;
      try { ps.dispose(); } catch (e) { /* already gone */ }
    }
  });

  /* ---- trees lean with the wind; the colliders stay where they are ---- */
  const sway = [];
  const tmpS = new B.Vector3();
  const tmpP = new B.Vector3();
  const tmpR = new B.Quaternion();
  const swayQ = new B.Quaternion();
  const tmpM = new B.Matrix();
  scene.meshes.forEach((mesh) => {
    if (!mesh.thinInstanceCount) return;
    if (mesh.name !== "trunk" && mesh.name.indexOf("crown") !== 0) return;
    const mats = mesh.thinInstanceGetWorldMatrices();
    const base = [];
    for (let i = 0; i < mats.length; i++) {
      mats[i].decompose(tmpS, tmpR, tmpP);
      base.push({ s: tmpS.clone(), r: tmpR.clone(), p: tmpP.clone() });
    }
    sway.push({ mesh, base, crown: mesh.name.indexOf("crown") === 0 });
  });
  let windT = 0;
  let swayAcc = 0;
  let wasSwayed = false;
  const canSway = !!(scene.getEngine().getCaps && scene.getEngine().getCaps().instancedArrays);

  /* ---- ambience, in the page's Sound button ---- */
  let audio = null;
  function noiseBuffer(ctx) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.98 * b0 + 0.08 * w;
      d[i] = Math.max(-1, Math.min(1, b0 * 3.2));
    }
    return buf;
  }
  function ensureAudio() {
    if (audio || !window.AudioContext && !window.webkitAudioContext) return audio;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      master.connect(analyser);
      analyser.connect(ctx.destination);
      const buffer = noiseBuffer(ctx);
      function layer(type, freq) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        src.start();
        return gain;
      }
      audio = {
        ctx,
        master,
        analyser,
        buffer,
        data: new Uint8Array(analyser.fftSize),
        air: layer("highpass", 1600),
        rain: layer("bandpass", 1500),
        wind: layer("lowpass", 480),
        hush: layer("lowpass", 240),
        snow: layer("bandpass", 620),
        rumble: layer("lowpass", 110),
      };
    } catch (err) {
      audio = null;
    }
    return audio;
  }
  function soundOn() {
    const btn = document.getElementById("sound");
    return !!(btn && btn.getAttribute("aria-pressed") === "true");
  }
  function thunder() {
    // Sampled crack from js/score.js when its files are in; else the procedural rumble.
    if (day.score && day.score.crack && day.score.crack()) return;
    if (!audio || !soundOn()) return;
    const t = audio.ctx.currentTime;
    const src = audio.ctx.createBufferSource();
    src.buffer = audio.buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(220, t);
    filter.frequency.exponentialRampToValueAtTime(50, t + 1.5);
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    src.connect(filter);
    filter.connect(g);
    g.connect(audio.master);
    src.start(t);
    src.stop(t + 1.8);
  }
  const soundBtn = document.getElementById && document.getElementById("sound");
  if (soundBtn) soundBtn.addEventListener("click", () => ensureAudio());
  window.addEventListener("pointerdown", () => {
    const a = ensureAudio();
    if (a && a.ctx.state === "suspended") a.ctx.resume();
  }, true);

  /* ---- the wheel: keys 1–7, hold Q, tap on a phone ---- */
  const canUi = !!(document.body && typeof document.body.append === "function");
  const stub = () => ({ hidden: true, style: {}, textContent: "", classList: { toggle() {} }, setAttribute() {}, addEventListener() {}, blur() {}, appendChild() {}, dataset: {} });
  let btn = stub();
  let wheel = stub();
  const wedges = {};
  STATES.forEach((s) => (wedges[s] = stub()));
  if (canUi) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "weather-btn";
    btn.className = "weather-btn";
    btn.hidden = true;
    btn.textContent = "Clear";
    wheel = document.createElement("div");
    wheel.id = "weather-wheel";
    wheel.className = "weather-wheel";
    wheel.hidden = true;
    wheel.setAttribute("role", "menu");
    wheel.setAttribute("aria-label", "Weather");
    STATES.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.weather = s;
      b.textContent = STATE_NAMES[s];
      b.setAttribute("aria-label", STATE_NAMES[s] + ", " + (i + 1));
      const ang = -Math.PI / 2 + (i + 0.5) * ((Math.PI * 2) / STATES.length);
      b.style.left = 50 + Math.cos(ang) * 38 + "%";
      b.style.top = 50 + Math.sin(ang) * 38 + "%";
      wheel.appendChild(b);
      wedges[s] = b;
    });
    document.body.append(btn, wheel);
  }

  const touchMode = () => (day.control && day.control.state().touch) || window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 700;
  let qHeld = false;
  let pointer = { x: 0, y: 0 };
  let lastChoose = 0;

  function choose(state, via) {
    const n = weather.now();
    if (n.state === state && n.manual && performance.now() - lastChoose < 280) return;
    lastChoose = performance.now();
    weather.set(state, 1, via);
    paintUi(weather.now());
  }
  function openWheel(on) {
    wheel.hidden = !on;
    if (on) paintUi(weather.now());
  }
  function paintUi(n) {
    if (!canUi) return;
    const name = STATE_NAMES[n.state] || n.state;
    btn.textContent = name;
    btn.setAttribute("aria-pressed", wheel.hidden ? "false" : "true");
    STATES.forEach((s) => wedges[s].classList.toggle("on", s === n.state));
    const on = clock().mode === "control";
    btn.hidden = !on;
    if (!on) wheel.hidden = true;
  }
  btn.addEventListener("pointerup", (e) => {
    if (clock().mode !== "control") return;
    openWheel(wheel.hidden);
    btn.blur();
    e.preventDefault();
  });
  wheel.addEventListener("pointerup", (e) => {
    const el = e.target.closest && e.target.closest("[data-weather]");
    if (!el) return;
    choose(el.dataset.weather, e.pointerType === "touch" || touchMode() ? "touch" : "wheel");
    if (!qHeld) openWheel(false);
    e.preventDefault();
  });
  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (wheel.hidden) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const w = el && el.closest && el.closest("[data-weather]");
    STATES.forEach((s) => wedges[s].classList.toggle("aim", !!(w && w.dataset.weather === s)));
  }, true);
  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT" && e.target.type !== "range") return;
    if (clock().mode !== "control") return;
    if (e.key === "q" || e.key === "Q") {
      if (!e.repeat) {
        qHeld = true;
        openWheel(true);
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (/^[1-7]$/.test(e.key) && !e.repeat) {
      choose(STATES[Number(e.key) - 1], "key");
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener("keyup", (e) => {
    if (e.key !== "q" && e.key !== "Q") return;
    if (!qHeld) return;
    qHeld = false;
    const el = document.elementFromPoint(pointer.x, pointer.y);
    const w = el && el.closest && el.closest("[data-weather]");
    if (w) choose(w.dataset.weather, "wheel");
    openWheel(false);
  }, true);

  /* ---- each frame, after the time-of-day sky ---- */
  function placeEmitters(look) {
    const cam = scene.activeCamera;
    const x = cam && cam.target ? cam.target.x : 0;
    const z = cam && cam.target ? cam.target.z : 0;
    const gust = 0.55 + 0.45 * Math.sin(windT * 0.7);
    const wx = look.wind * (2.2 + gust * 3.5);
    const cap = (ps, n) => (ps && !ps.__dead ? n * (ps.__gpu ? 1 : 0.34) : 0);
    if (rainPs && !rainPs.__dead) {
      rainPs.emitter.set(x, 14, z);
      rainPs.emitRate = cap(rainPs, look.rain * 4200);
      rainPs.direction1.set(-0.35 - wx, -1, -0.15);
      rainPs.direction2.set(0.25 - wx * 0.7, -1, 0.2);
      rainPs.minEmitPower = 16 + look.wind * 6;
      rainPs.maxEmitPower = 24 + look.wind * 8;
      rainPs.gravity.set(-wx * 0.4, -4, 0);
    }
    if (splashPs && !splashPs.__dead) {
      splashPs.emitter.set(x, 0.2, z);
      splashPs.emitRate = cap(splashPs, look.splash * 900);
      splashPs.direction1.set(-0.4, 1, -0.4);
      splashPs.direction2.set(0.4, 1, 0.4);
      splashPs.gravity.set(0, -12, 0);
      splashPs.minEmitPower = 1.2;
      splashPs.maxEmitPower = 2.4;
    }
    if (snowPs && !snowPs.__dead) {
      snowPs.emitter.set(x, 12, z);
      snowPs.emitRate = cap(snowPs, look.snow * 1100);
      snowPs.direction1.set(-0.4 - look.wind, -1, -0.3);
      snowPs.direction2.set(0.5 - look.wind * 0.4, -1, 0.4);
      snowPs.gravity.set(0, -0.35, 0);
      snowPs.minEmitPower = 0.8;
      snowPs.maxEmitPower = 1.6;
    }
    if (dustPs && !dustPs.__dead) {
      dustPs.emitter.set(x, 1.4, z);
      dustPs.emitRate = cap(dustPs, look.dust * look.wind * 280);
      dustPs.direction1.set(0.6 + wx, 0.05, -0.2);
      dustPs.direction2.set(1, 0.25, 0.3);
      dustPs.gravity.set(0, 0, 0);
      dustPs.minEmitPower = 6 + look.wind * 4;
      dustPs.maxEmitPower = 12 + look.wind * 6;
    }
  }

  function applyLook(L, dt) {
    windT += dt;
    const tod = scene.clearColor;
    scratch.tod.set(tod.r, tod.g, tod.b);
    scratch.tint.set(L.sky[0], L.sky[1], L.sky[2]);
    scratch.mul.set(scratch.tod.r * scratch.tint.r, scratch.tod.g * scratch.tint.g, scratch.tod.b * scratch.tint.b);
    B.Color3.LerpToRef(scratch.mul, scratch.tint, 0.42, scratch.toward);
    B.Color3.LerpToRef(scratch.tod, scratch.toward, L.cover, scratch.mixed);
    if (L.lightning > 0.45) {
      nextFlash -= dt;
      if (nextFlash <= 0) {
        flash = 1;
        live.flashes++;
        nextFlash = 2.2 + Math.random() * 2.4;
        thunder();
      }
    } else nextFlash = Math.min(nextFlash, 2);
    flash = Math.max(0, flash - dt * (flash > 0.4 ? 5 : 8));
    if (flash > 0) B.Color3.LerpToRef(scratch.mixed, scratch.white, flash * 0.82, scratch.mixed);
    scene.clearColor.set(scratch.mixed.r, scratch.mixed.g, scratch.mixed.b, 1);
    const fogMix = Math.min(1, L.fog / 0.045);
    scratch.fog.set(L.fogC[0], L.fogC[1], L.fogC[2]);
    B.Color3.LerpToRef(scratch.mixed, scratch.fog, fogMix * 0.9, scratch.fog);
    scene.fogColor.copyFrom(scratch.fog);
    scene.fogDensity = L.fog;
    if (sun) sun.intensity *= L.light * (1 + flash * L.lightning * 3.2);
    if (hemi) hemi.intensity = Math.max(0.16, hemi.intensity * L.hemi);
    const baseExp = pipeline && pipeline.imageProcessing ? pipeline.imageProcessing.exposure : 0.92;
    const targetExp = Math.min(1.08, Math.max(0.76, baseExp * (0.88 + 0.12 * L.exposure) * (1 + flash * 0.85)));
    if (pipeline && pipeline.imageProcessing) pipeline.imageProcessing.exposure = targetExp;
    if (world.look && world.look.setSky) {
      world.look.setSky({
        clearColor: scratch.mixed,
        fogColor: scratch.fog,
        fogDensity: L.fog,
        exposure: targetExp,
        cover: L.cover,
        wet: L.wet,
        rain: L.rain,
        storm: L.lightning,
        wind: L.wind,
        flash,
      });
    }
    if (roadMat && dryDiffuse) {
      const wet = L.wet;
      const g = 0.04 + wet * 0.66;
      if (roadIsPbr) {
        dryDiffuse.scaleToRef(1 - wet * 0.48, scratch.diff);
        scratch.diff.b = Math.min(1, scratch.diff.b + wet * 0.04);
        if (!roadMat.albedoColor) roadMat.albedoColor = scratch.diff.clone();
        else roadMat.albedoColor.copyFrom(scratch.diff);
        roadMat.roughness = Math.max(0.18, (dryRough == null ? 0.84 : dryRough) - wet * 0.58);
        if (roadMat.clearCoat) {
          roadMat.clearCoat.isEnabled = wet > 0.06 && (!world.look || world.look.quality() !== "low");
          roadMat.clearCoat.intensity = wet * 0.62;
          roadMat.clearCoat.roughness = 0.12 + (1 - wet) * 0.18;
        }
      } else {
        dryDiffuse.scaleToRef(1 - wet * 0.52, scratch.diff);
        scratch.diff.b = Math.min(1, scratch.diff.b + wet * 0.04);
        roadMat.diffuseColor.copyFrom(scratch.diff);
        roadMat.ambientColor.copyFrom(scratch.diff).scaleInPlace(0.32);
        roadMat.specularColor.set(g, g * 1.02, g * 1.08);
        roadMat.specularPower = 64 - wet * 40;
      }
      live.gloss = g;
    }
    const cam = scene.activeCamera;
    const px = cam && cam.target ? cam.target.x : 0;
    puddles.forEach((p) => {
      const show = L.wet > 0.2;
      p.mesh.setEnabled(show);
      p.mesh.position.x = px + p.dx;
      p.mesh.position.z = p.rz + p.dz;
      p.mesh.material.alpha = show ? Math.min(0.78, 0.18 + L.wet * 0.56) : 0;
    });
    live.puddles = puddles.filter((p) => p.mesh.isEnabled()).length;
    if (canSway) {
      if (L.wind > 0.18) {
        swayAcc += dt;
        if (swayAcc >= 0.055) {
          swayAcc = 0;
          wasSwayed = true;
          sway.forEach((tree) => {
            const amp = L.wind * (tree.crown ? 0.22 : 0.05);
            tree.base.forEach((b, i) => {
              const phase = b.p.x * 0.17 + b.p.z * 0.11;
              const lean = Math.sin(windT * 1.7 + phase);
              const ang = amp * (0.45 + 0.55 * lean);
              B.Quaternion.FromEulerAnglesToRef(ang * 0.45, 0, ang, swayQ);
              b.r.multiplyToRef(swayQ, tmpR);
              B.Matrix.ComposeToRef(b.s, tmpR, b.p, tmpM);
              tree.mesh.thinInstanceSetMatrixAt(i, tmpM, i === tree.base.length - 1);
            });
          });
        }
      } else if (wasSwayed) {
        wasSwayed = false;
        swayAcc = 0;
        sway.forEach((tree) => {
          tree.base.forEach((b, i) => {
            B.Matrix.ComposeToRef(b.s, b.r, b.p, tmpM);
            tree.mesh.thinInstanceSetMatrixAt(i, tmpM, i === tree.base.length - 1);
          });
        });
      }
    }
    placeEmitters(L);
    // Adaptive beds + sampled rain/wind/city hum (js/score.js). Procedural noise stays as a
    // fallback when the Gen files aren't there yet, and as a soft under-layer for hush/snow.
    const scored = day.score && day.score.tick ? day.score.tick(L, dt) : null;
    if (audio) {
      const on = soundOn();
      if (on && audio.ctx.state === "suspended") audio.ctx.resume();
      const gust = 0.45 + 0.55 * Math.abs(Math.sin(windT * 0.45));
      const sampleDrive = !!(scored && scored.driving);
      const proc = sampleDrive ? 0.18 : 1; // soft under-layer when samples carry the bed
      audio.master.gain.value = on ? 0.34 * (sampleDrive ? 0.55 : 1) : 0;
      audio.air.gain.value = L.sound.air * 0.22 * (sampleDrive ? 0.25 : 1);
      audio.rain.gain.value = L.sound.rain * 0.55 * proc;
      audio.wind.gain.value = L.sound.wind * 0.4 * gust * proc;
      audio.hush.gain.value = L.sound.hush * 0.3;
      audio.snow.gain.value = (L.sound.snow || 0) * 0.35;
      audio.rumble.gain.value = L.sound.thunder * 0.28 * (sampleDrive ? 0.35 : 1);
      audio.analyser.getByteTimeDomainData(audio.data);
      let s = 0;
      for (let i = 0; i < audio.data.length; i++) {
        const x = (audio.data[i] - 128) / 128;
        s += x * x;
      }
      const procHeard = Math.sqrt(s / audio.data.length);
      const scoreHeard = (day.score && day.score.now && day.score.now().heard) || 0;
      live.heard = Math.max(procHeard, scoreHeard);
    }
    const hex = (n) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0");
    live.sky = "#" + hex(scratch.mixed.r) + hex(scratch.mixed.g) + hex(scratch.mixed.b);
  }

  function frame(dt, opts) {
    const c = clock();
    const snap = !booted || !!(opts && opts.snap);
    booted = true;
    // Real seconds, not the day's capped frame step: a slow renderer still blends in a few seconds.
    let wall = dt;
    if (typeof performance !== "undefined") {
      const nowMs = performance.now();
      wall = Math.min(0.5, Math.max(0, (nowMs - lastWall) / 1000));
      lastWall = nowMs;
    }
    weather.follow(c.key, c.minutes, snap ? 0 : wall, snap, c.mode);
    const n = weather.now();
    tickReact(c.mode, n, snap ? 0 : wall);
    const L = weather.look();
    try {
      applyLook(L, wall);
    } catch (err) {
      console.error("[weather]", err);
    }
    paintUi(n);
  }

  const orig = world.update.bind(world);
  world.update = function (fr, dt, opts) {
    orig(fr, dt, opts);
    frame(dt, opts);
  };

  function apiNow() {
    return Object.assign(weather.now(), {
      sky: live.sky,
      gloss: live.gloss,
      heard: live.heard,
      flashes: live.flashes,
      particles: live.particles,
      puddles: live.puddles,
    });
  }
  const api = {
    STATES,
    now: apiNow,
    set: (state, intensity, via) => weather.set(state, intensity, via),
    forecast: (dateKey, minutes) => forecastAt(dateKey, minutes, cfg.forecast),
    /** The wheel, for a phone tap the playtest sends as a pointer. */
    open: (on) => openWheel(on !== false),
    wheel: () => !wheel.hidden,
  };
  world.__weather = api;
  window.weather = api;
  day.weather = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) startWeather();
