/* ==========================================================================
   The weather. One place other code can read: weather.now(), weather.set(state, intensity).
   Seven states — clear, clouds, rain, storm, fog, wind, snow — each with its own
   sky tint, light, fog, particles, wet roads, wind and a sound. They blend over a
   few real seconds on top of the time-of-day sky js/world.js already draws.
   With nobody in control, the day follows a forecast seeded by the date. While
   he's the player's, the five verbs call weather; keys 1–7 and hold Q (the
   radial) are Sky studio, off by default in Settings. After let-go an ability's
   weather holds for a few real seconds, then drifts back.
   ========================================================================== */

const SKY_STUDIO_KEY = "icanbe.skyStudio";
export function skyStudioOn() {
  try { return localStorage.getItem(SKY_STUDIO_KEY) === "on"; } catch (e) { return false; }
}
export function setSkyStudio(on, via) {
  const v = !!on;
  try { localStorage.setItem(SKY_STUDIO_KEY, v ? "on" : "off"); } catch (e) { /* private mode */ }
  if (typeof window !== "undefined" && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent("day:sky-studio", { detail: { on: v, via: via || "api" } }));
  }
  return v;
}

/* ---- tunables: weather is the player's, never the day's ---- */
export const AUTOMATIC_WEATHER = false; // true brings back the date-seeded forecast (off: the sky is calm and clear)
export const ABILITY_HOLD_SEC = 3; // real seconds an ability's weather lasts after its last call (and after let-go for keys 1–7)
export const ABILITY_FADE_SEC = 2; // real seconds the sky takes to ease back to clear once that's over

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
  if (!AUTOMATIC_WEATHER) return { state: "clear", intensity: 1, slot: 0 };
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
  const holdSec = opt.hold > 0 ? opt.hold : ABILITY_HOLD_SEC;
  const tau = blendSec / 3;
  const fadeTau = ABILITY_FADE_SEC / 3;
  const weights = {};
  STATES.forEach((s) => (weights[s] = s === "clear" ? 1 : 0));
  let target = "clear";
  let targetIntensity = 1;
  let level = 1;
  let manual = false;
  let cell = false; // the title/cold-open storm cell: holds the sky without setting `manual`, so ability reactions wait for the player's cast
  let wasHeld = false;
  let holdLeft = 0;
  let powerLeft = 0; // an ability's own weather: lasts ABILITY_HOLD_SEC from its last call, in control or not
  let lastForecast = { state: "clear", intensity: 1, slot: 0 };
  let sunFlag = false; // a Sun break is the ability's weather right now (clear sky, warm light)
  let sun = 0; // 0..1, how much of that warm light is showing; eases in and out with the ability
  let roofWet = 0; // 0..1 smooth surface wetness on roofs and roads
  let puddleLevel = 0; // 0..1 smooth puddle growth and drying
  let steam = 0; // 0..1 short steam wisp off wet roofs as sun/clear dries them
  let steamLeft = 0;
  let steamHold = 0; // aftermath can hold steam for ~20 s (js/aftermath.js boostSteam)
  let wasRainWet = false;
  let snowCover = 0; // 0..1 snow layer accumulation on upward faces, melts afterwards
  let warming = null; // the loading warm-up's `{ state, intensity, sun }` while it holds the sky (see warm())

  function step(dt, snap) {
    const dtPos = Math.max(0, dt || 0);
    const fading = target === "clear" && !manual;
    const k = snap ? 1 : 1 - Math.exp(-dtPos / (fading ? fadeTau : tau));
    for (const s of STATES) {
      const g = s === target ? 1 : 0;
      weights[s] += (g - weights[s]) * k;
    }
    level += (targetIntensity - level) * k;
    const sk = snap ? 1 : 1 - Math.exp(-dtPos / (sunFlag && manual ? 0.5 : ABILITY_FADE_SEC / 3));
    sun += ((sunFlag && manual ? 1 : 0) - sun) * sk;
    if (sun < 0.002) sun = 0;

    const L = look();
    const sunny = target === "clear" || sun > 0.05;
    if (snap) {
      steamLeft = 0;
      steamHold = 0;
      steam = 0;
      roofWet = L.wet;
      puddleLevel = manual && L.rain > 0.15 ? L.wet : 0;
      wasRainWet = L.rain > 0.25 || L.wet > 0.5;
      snowCover = L.snow > 0.5 ? 1 : 0;
    } else {
      const raining = target === "rain" || target === "storm" || L.rain > 0.35;
      const wetGoal = raining ? Math.max(L.wet, L.rain) : L.wet;
      const wetTau = wetGoal > roofWet ? 1.05 : sunny ? 1.05 : 1.7;
      roofWet += (wetGoal - roofWet) * (1 - Math.exp(-dtPos / wetTau));
      if (roofWet < 0.01) roofWet = 0;
      if (roofWet > 0.25 && (L.rain > 0.2 || L.wet > 0.45)) wasRainWet = true;

      const pGoal = manual && raining ? Math.min(1, Math.max(L.wet, L.rain)) : 0;
      const pTau = pGoal > puddleLevel ? 0.45 : sunny ? 1.05 : 1.8;
      puddleLevel += (pGoal - puddleLevel) * (1 - Math.exp(-dtPos / pTau));
      if (puddleLevel < 0.01) puddleLevel = 0;

      if (wasRainWet && sunny && !raining && roofWet > 0.08) {
        steamLeft = Math.max(steamLeft, 2.5);
        wasRainWet = false;
      }
      if (steamHold > 0) steamHold = Math.max(0, steamHold - dtPos);
      if (steamLeft > 0) steamLeft = Math.max(0, steamLeft - dtPos);
      const dryingRoof = sunny && !raining && (roofWet > 0.06 || steamLeft > 0.15 || steamHold > 0.1);
      const holdK = steamHold > 0 ? Math.min(1, 0.55 + steamHold / 20) : 0;
      const steamGoal = dryingRoof ? Math.min(1, Math.max(roofWet * 1.35, steamLeft * 0.45, holdK)) : 0;
      const steamTau = steamGoal > steam ? 0.24 : 0.55;
      steam += (steamGoal - steam) * (1 - Math.exp(-dtPos / steamTau));
      if (steam < 0.005) steam = 0;

      const snowing = target === "snow" || L.snow > 0.45;
      const snowGoal = snowing ? Math.min(1, Math.max(0.4, L.snow * 1.15)) : 0;
      const snowTau = snowGoal > snowCover ? 1.15 : sunny ? 0.95 : 1.5;
      snowCover += (snowGoal - snowCover) * (1 - Math.exp(-dtPos / snowTau));
      if (snowCover < 0.015) snowCover = 0;
    }
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
      sun,
      roofWet,
      puddleLevel,
      steam,
      snowCover,
      hold: Math.max(holdLeft, powerLeft),
      holdSec,
      forecast: lastForecast.state,
      forecastIntensity: lastForecast.intensity,
    };
  }

  function set(state, intensity, via) {
    if (!STATES.includes(state)) return false;
    if (via !== "forecast") warming = null; // a real call ends the loading warm-up and keeps what it set
    target = state;
    targetIntensity = intensity == null || !Number.isFinite(intensity) ? 1 : Math.max(0, Math.min(1, intensity));
    sunFlag = false;
    if (via === "cell") {
      manual = false;
      cell = state !== lastForecast.state;
      holdLeft = 0;
      powerLeft = 0;
      if (opt.onSet) opt.onSet({ state, intensity: targetIntensity, via });
    } else if (via !== "forecast") {
      manual = true;
      cell = false;
      holdLeft = 0;
      powerLeft = via === "power" ? holdSec * (state === "rain" ? 2.4 : 1) : 0; // a Rain cast stays long enough to soak the street
      if (via === "power" && (state === "rain" || state === "storm")) puddleLevel = Math.min(puddleLevel, 0.05);
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
      cell = false;
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
    if (powerLeft > 0 && manual && !snap) {
      powerLeft = Math.max(0, powerLeft - Math.max(0, dt));
      if (powerLeft <= 0) {
        manual = false;
        holdLeft = 0;
        if (opt.onDrift) opt.onDrift({ from: target, to: lastForecast.state });
      }
    }
    if (!manual && !cell) {
      target = lastForecast.state;
      targetIntensity = lastForecast.intensity;
      holdLeft = 0;
    }
    step(dt, snap || !!warming);
  }

  /** The loading warm-up (startWeather's warmCasts): hold `{ state, intensity, sun }` as an ability's weather, snapped on, with no
   *  log line, event or react line, so each effect draws once behind the card. `warm(null)` snaps back to the forecast. A real
   *  `set()` (the cold open's storm cell, a cast) takes over: the warm-up then stops touching the sky. */
  function warm(spec) {
    if (!spec) {
      if (!warming) return false;
      warming = null;
      manual = false;
      cell = false;
      powerLeft = 0;
      holdLeft = 0;
      sunFlag = false;
      target = lastForecast.state;
      targetIntensity = lastForecast.intensity;
      step(0, true);
      return true;
    }
    if ((manual || cell) && !warming) return false;
    if (!STATES.includes(spec.state)) return false;
    warming = spec;
    manual = true;
    powerLeft = 0;
    holdLeft = 0;
    target = spec.state;
    targetIntensity = Math.max(0, Math.min(1, spec.intensity == null ? 1 : spec.intensity));
    sunFlag = !!spec.sun;
    step(0, true);
    return true;
  }

  /** Sun break: the sky clears and the light turns warm, for as long as an ability's weather lasts. */
  function sunbreak() {
    if (!set("clear", 1, "power")) return false;
    sunFlag = true;
    return true;
  }

  /** Hold the drying steam wisp for `sec` real seconds (Sun-break aftermath). */
  function boostSteam(sec) {
    const s = Math.max(0, sec == null ? 20 : sec);
    steamHold = Math.max(steamHold, s);
    steamLeft = Math.max(steamLeft, Math.min(4, s * 0.2));
  }

  return { set, sunbreak, boostSteam, step, follow, now, look, blendSec, holdSec, warm, warming: () => !!warming };
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
    roofGloss: 0.06,
    heard: 0,
    flashes: 0,
    thunders: 0,
    lastThunderDelay: 0,
    lastStrikeDist: 0,
    flashLight: 0,
    particles: "off",
    puddles: 0,
    reflectProbe: false,
    ripples: 0,
    reflect: 0,
    awnings: 0,
    treeSway: 0,
    awningSway: 0,
    litterRate: 0,
    snowMeshes: 0,
    tier: "desktop",
    activeParticles: 0,
  };
  let flash = 0;
  let nextFlash = 0.65;
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
      const again = day.notes && day.notes().some((n) => n.text === line); // a label is logged once a day
      if (noted.state !== detail.state && day.note && !again) day.note(line);
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
    // One use of a line per day (js/barks.js keeps the list); a state whose lines are all used stays quiet.
    const text = day.barks ? day.barks.take(lines) : lines[Math.floor(Math.random() * lines.length)];
    if (!text) {
      react.state = n.state;
      react.at = react.cool;
      return;
    }
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
    hemiFill: new B.Color3(0.74, 0.8, 0.94),
    diff: new B.Color3(),
  };
  const puddles = [];
  let pmat = null;
  let puddleTex = null;
  let rippleClock = 0;
  /* Low-quality wet-street reflections: a small ReflectionProbe of neon/lamps instead of SSR. */
  let streetProbe = null;
  let streetProbeOn = false;
  let streetProbeAcc = 1;
  let streetProbeReady = false;
  const streetProbePos = new B.Vector3(Number.NaN, 0.4, 0);
  function fillStreetProbeList() {
    if (!streetProbe) return;
    streetProbe.renderList.length = 0;
    scene.meshes.forEach((m) => {
      if (!m || !m.name) return;
      // cityscape names: city-brick-*, city-shops-*, city-skyline, facade-apt/office, cs-lamp*, sign-*, props-glow
      if (/^(city-|facade-|cs-lamp|sign-|props-glow|city-beacon)/.test(m.name)) {
        try { streetProbe.renderList.push(m); } catch (e) { /* */ }
      }
    });
    streetProbeReady = streetProbe.renderList.length > 0;
  }
  try {
    if (B.ReflectionProbe && roadIsPbr && roadMat) {
      streetProbe = new B.ReflectionProbe("wetStreetProbe", 64, scene, true);
      streetProbe.refreshRate = -1; // manual: only while wet on low
      if (streetProbe.cubeTexture) {
        streetProbe.cubeTexture.coordinatesMode = B.Texture.CUBIC_MODE;
      }
      // list fills late: facades and signs arrive after weather.js boots (cityscape imports after)
      scene.onAfterRenderObservable.addOnce(() => fillStreetProbeList());
    }
  } catch (e) { streetProbe = null; }
  function paintPuddleRipple(phase, rippleAmt) {
    if (!puddleTex) return;
    try {
      const size = 96;
      const c = puddleTex.getContext();
      c.clearRect(0, 0, size, size);
      const g = c.createRadialGradient(48, 48, 6, 48, 48, 45);
      g.addColorStop(0, "rgba(180,210,245,0.92)");
      g.addColorStop(0.7, "rgba(140,180,225,0.75)");
      g.addColorStop(1, "rgba(110,150,200,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
      if (rippleAmt > 0.05) {
        const rings = [
          [48, 48, (phase * 28) % 36],
          [34, 42, ((phase + 0.37) * 26) % 28],
          [62, 54, ((phase + 0.71) * 24) % 26],
        ];
        c.lineWidth = 1.8;
        for (let i = 0; i < rings.length; i++) {
          const [cx, cy, r] = rings[i];
          const maxR = i === 0 ? 36 : 27;
          const a = Math.max(0, (1 - r / maxR) * 0.65 * rippleAmt);
          c.strokeStyle = `rgba(225,242,255,${a.toFixed(3)})`;
          c.beginPath();
          c.arc(cx, cy, Math.max(1.5, r), 0, Math.PI * 2);
          c.stroke();
        }
      }
      puddleTex.update();
    } catch (e) { /* headless canvas fallback */ }
  }
  if (roadMat) {
    pmat = new B.StandardMaterial("puddle", scene);
    pmat.diffuseColor = new B.Color3(0.015, 0.024, 0.036);
    pmat.emissiveColor = new B.Color3(0.012, 0.022, 0.036);
    pmat.specularColor = new B.Color3(0.78, 0.86, 0.96);
    pmat.specularPower = 96;
    pmat.alpha = 0;
    pmat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    pmat.disableDepthWrite = true;
    pmat.zOffset = -2;
    pmat.backFaceCulling = true;
    try {
      puddleTex = new B.DynamicTexture("wx-puddle", 96, scene, false);
      puddleTex.hasAlpha = true;
      paintPuddleRipple(0, 0);
      pmat.opacityTexture = puddleTex;
    } catch (e) {
      puddleTex = null;
    }
    const rz = (window.DAY_CONFIG && window.DAY_CONFIG.street && window.DAY_CONFIG.street.z) || 12.6;
    [[0, 0.15], [2.4, -0.35], [-2.1, 0.4], [4.6, 0.2], [-4.4, -0.15], [1.2, 1.1]].forEach((spot, i) => {
      const mesh = B.MeshBuilder.CreateBox("puddle" + i, { width: 2.1, height: 0.016, depth: 1.25 }, scene);
      mesh.material = pmat;
      mesh.position.set(spot[0], 0.056, rz + spot[1]);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.setEnabled(false);
      puddles.push({ mesh, dx: spot[0], dz: spot[1], rz, follow: true, lastScale: 1 });
    });
    const cityBlocks = (window.DAY_CONFIG && window.DAY_CONFIG.city && window.DAY_CONFIG.city.blocks) || [];
    cityBlocks.filter((b) => b.stair).forEach((b, bi) => {
      [[-2.1, -1.1], [1.9, 1.2]].forEach((off, oi) => {
        const mesh = B.MeshBuilder.CreateBox(`roof-puddle-${bi}-${oi}`, { width: 2.0, height: 0.015, depth: 1.3 }, scene);
        mesh.material = pmat;
        mesh.position.set(b.x + off[0], b.h + 0.012, b.z + off[1]);
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        mesh.setEnabled(false);
        puddles.push({ mesh, dx: 0, dz: 0, rz: b.z + off[1], follow: false, lastScale: 1 });
      });
    });
  }

  /* ---- upward-face snow layer on rooftops ---- */
  const snowCaps = [];
  let lastSnowCap = -1;
  const snowCapMat = new B.StandardMaterial("weather-snow-cap", scene);
  snowCapMat.diffuseColor = new B.Color3(0.95, 0.97, 1.0);
  snowCapMat.emissiveColor = new B.Color3(0.2, 0.22, 0.27);
  snowCapMat.specularColor = new B.Color3(0.36, 0.4, 0.48);
  snowCapMat.specularPower = 48;
  snowCapMat.alpha = 0;
  snowCapMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  snowCapMat.disableDepthWrite = true;
  snowCapMat.zOffset = -3;
  snowCapMat.backFaceCulling = true;
  {
    const cityBlocks = (window.DAY_CONFIG && window.DAY_CONFIG.city && window.DAY_CONFIG.city.blocks) || [];
    cityBlocks.filter((b) => b.stair).forEach((b) => {
      const cap = B.MeshBuilder.CreateBox("roof-snow-" + b.id, {
        width: Math.max(1.2, b.w - 0.9),
        height: 0.032,
        depth: Math.max(1.2, b.d - 0.9),
      }, scene);
      cap.material = snowCapMat;
      cap.position.set(b.x, b.h + 0.02, b.z);
      cap.isPickable = false;
      cap.receiveShadows = true;
      cap.setEnabled(false);
      snowCaps.push(cap);
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
    const tKind = name === "leaves" ? "leaf" : (name === "snow" || name === "splash" || name === "mist" || name === "motes" || name === "steam" ? "dot" : "streak");
    ps.particleTexture = tex(tKind);
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
      } else if (kind === "leaf") {
        c.fillStyle = "rgba(255,255,255,0.95)";
        c.beginPath();
        c.moveTo(32, 8);
        c.quadraticCurveTo(54, 24, 46, 52);
        c.quadraticCurveTo(32, 60, 18, 52);
        c.quadraticCurveTo(10, 24, 32, 8);
        c.fill();
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
  const dustPs = makeSystem("dust", 1200, 350); // wind: blowing litter, leaves and dust streaks
  const mistPs = makeSystem("mist", 600, 160); // fog mist banks, plus rising steam wisps off drying wet roofs
  const motesPs = makeSystem("motes", 700, 200); // sun break: gold motes lifting through the light
  if (rainPs) {
    rainPs.billboardMode = B.ParticleSystem.BILLBOARDMODE_STRETCHED;
    rainPs.minEmitBox.set(-18, 0, -18);
    rainPs.maxEmitBox.set(18, 2, 18);
    rainPs.minLifeTime = 0.45;
    rainPs.maxLifeTime = 0.75;
    rainPs.minSize = 0.1;
    rainPs.maxSize = 0.22;
    rainPs.minScaleX = 0.16; // thin, long streaks: stretched along the velocity, so they lean with the wind
    rainPs.maxScaleX = 0.26;
    rainPs.minScaleY = 2.6;
    rainPs.maxScaleY = 4.2;
    rainPs.color1.set(0.75, 0.84, 0.95, 0.6);
    rainPs.color2.set(0.85, 0.9, 1, 0.3);
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
    dustPs.minEmitBox.set(-13, -0.8, -13);
    dustPs.maxEmitBox.set(13, 2.8, 13);
    dustPs.minLifeTime = 0.65;
    dustPs.maxLifeTime = 1.45;
    dustPs.minSize = 0.09;
    dustPs.maxSize = 0.22;
    dustPs.minAngularSpeed = -5;
    dustPs.maxAngularSpeed = 5;
    dustPs.color1.set(0.8, 0.58, 0.28, 0.72);
    dustPs.color2.set(0.84, 0.8, 0.7, 0.45);
  }
  if (mistPs) {
    mistPs.minEmitBox.set(-16, 0, -16);
    mistPs.maxEmitBox.set(16, 1.2, 16);
    mistPs.minLifeTime = 3;
    mistPs.maxLifeTime = 5;
    mistPs.minSize = 3;
    mistPs.maxSize = 6.5;
    mistPs.color1.set(0.86, 0.88, 0.9, 0.16);
    mistPs.color2.set(0.78, 0.8, 0.84, 0.09);
  }
  if (motesPs) {
    motesPs.blendMode = B.ParticleSystem.BLENDMODE_ADD;
    motesPs.minEmitBox.set(-14, 0, -14);
    motesPs.maxEmitBox.set(14, 3, 14);
    motesPs.minLifeTime = 1.6;
    motesPs.maxLifeTime = 3;
    motesPs.minSize = 0.07;
    motesPs.maxSize = 0.2;
    motesPs.color1.set(1, 0.86, 0.5, 0.8);
    motesPs.color2.set(1, 0.7, 0.35, 0.45);
  }
  systems.forEach((ps) => {
    try {
      ps.start();
    } catch (err) {
      ps.__dead = true;
      try { ps.dispose(); } catch (e) { /* already gone */ }
    }
  });

  /* ---- trees and shopfront awnings lean/flap with the wind; colliders stay put ---- */
  const sway = [];
  const tmpS = new B.Vector3();
  const tmpP = new B.Vector3();
  const tmpR = new B.Quaternion();
  const swayQ = new B.Quaternion();
  const tmpM = new B.Matrix();
  const canSway = !!(scene.getEngine().getCaps && scene.getEngine().getCaps().instancedArrays);
  {
    const cityBlocks = (window.DAY_CONFIG && window.DAY_CONFIG.city && window.DAY_CONFIG.city.blocks) || [];
    if (cityBlocks.length) {
      let awCount = 0;
      const awMatrices = [];
      const awScale = new B.Vector3(1, 1, 1);
      cityBlocks.forEach((b) => {
        const count = Math.max(2, Math.min(4, Math.floor((b.w - 3) / 4.2)));
        const span = Math.max(0, b.w - 4.4);
        [-1, 1].forEach((side) => {
          const z = b.z + side * (b.d / 2 + 0.56);
          const pitch = side > 0 ? 0.32 : -0.32;
          const q = B.Quaternion.FromEulerAngles(pitch, 0, 0);
          for (let i = 0; i < count; i++) {
            awCount++;
            if (canSway) {
              const u = count === 1 ? 0 : i / (count - 1) - 0.5;
              const x = b.x + u * span;
              const m = B.Matrix.Compose(awScale, q, new B.Vector3(x, 3.18, z));
              awMatrices.push(m);
            }
          }
        });
      });
      live.awnings = awCount;
      if (canSway && awMatrices.length) {
        const awMat = new B.StandardMaterial("weather-awning-mat", scene);
        awMat.diffuseColor = new B.Color3(0.78, 0.3, 0.22);
        awMat.specularColor = new B.Color3(0.14, 0.14, 0.14);
        awMat.backFaceCulling = true;
        const awMesh = B.MeshBuilder.CreateBox("weather-awnings", { width: 2.6, height: 0.12, depth: 1.15 }, scene);
        awMesh.material = awMat;
        awMesh.isPickable = false;
        awMesh.receiveShadows = true;
        const buf = new Float32Array(awMatrices.length * 16);
        awMatrices.forEach((m, idx) => m.copyToArray(buf, idx * 16));
        awMesh.thinInstanceSetBuffer("matrix", buf, 16, false);
      }
    }
  }
  scene.meshes.forEach((mesh) => {
    if (!mesh.thinInstanceCount) return;
    const isAwning = mesh.name === "weather-awnings";
    if (!isAwning && mesh.name !== "trunk" && mesh.name.indexOf("crown") !== 0) return;
    const mats = mesh.thinInstanceGetWorldMatrices();
    const base = [];
    for (let i = 0; i < mats.length; i++) {
      mats[i].decompose(tmpS, tmpR, tmpP);
      base.push({ s: tmpS.clone(), r: tmpR.clone(), p: tmpP.clone() });
    }
    sway.push({ mesh, base, crown: mesh.name.indexOf("crown") === 0, awning: isAwning });
  });
  let windT = 0;
  let swayAcc = 0;
  let wasSwayed = false;

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
      // Share js/mix.js's context: weather beds go to its ambience bus (limiter, Effects slider, voice ducking).
      const Mx = window.mix;
      let ctx = null;
      let dest = null;
      if (Mx && Mx.ctx) {
        try { if (Mx.unlock) Mx.unlock(); ctx = Mx.ctx(); const b = Mx.bus && Mx.bus("ambience"); dest = b && b.bus; } catch (e) { ctx = null; }
      }
      const shared = !!(ctx && dest);
      if (!shared) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        ctx = new Ctx();
      }
      const master = ctx.createGain();
      master.gain.value = 0;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      master.connect(analyser);
      if (shared) master.connect(dest);
      else {
        const lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -8; lim.ratio.value = 12; lim.knee.value = 10; lim.attack.value = 0.003; lim.release.value = 0.2;
        analyser.connect(lim);
        lim.connect(ctx.destination);
      }
      const buffer = noiseBuffer(ctx);
      let layerN = 0;
      function layer(type, freq, withPan) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        // The ten beds share one noise buffer: each is its own voice (own id, rate and start point), so the audio
        // probe doesn't read them as one sample played again and again.
        layerN++;
        src.playbackRate.value = 1 + (layerN - 5) * 0.011;
        try { src.__hawkesSampleId = "wx-bed-" + type + "-" + freq; src.__hawkesBus = "ambience"; } catch (e) { /* */ }
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        const panner = withPan && ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(filter);
        if (panner) {
          filter.connect(panner);
          panner.connect(gain);
        } else {
          filter.connect(gain);
        }
        gain.connect(master);
        src.start(0, (layerN * 0.173) % 1.9);
        gain.filter = filter;
        gain.panner = panner;
        return gain;
      }
      audio = {
        ctx,
        master,
        analyser,
        buffer,
        data: new Uint8Array(analyser.fftSize),
        air: layer("lowpass", 2400),
        rain: layer("bandpass", 1500),
        rainRoof: layer("highpass", 2300),
        gutter: layer("bandpass", 920),
        umbrella: layer("bandpass", 1850, true),
        wind: layer("lowpass", 480, true),
        awning: layer("bandpass", 280, true),
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
  function thunderDelay(distance) {
    const d = Math.max(0, Number(distance) || 0);
    return Math.min(2.2, Math.max(0.06, Math.round((0.06 + d / 85) * 1000) / 1000));
  }
  const pendingThunder = [];
  let flashCounter = 0;
  function scheduleFlash(distOverride, panOverride) {
    flash = 1;
    live.flashes++;
    flashCounter++;
    // Alternate between close cracks (8..18m) and rolling distant thunder (42..125m) unless specified
    const defaultDist = flashCounter % 2 === 1 ? 11 + (flashCounter % 5) * 1.5 : 48 + ((flashCounter * 19) % 72);
    const dist = distOverride != null ? Math.max(1, Number(distOverride)) : defaultDist;
    const pan = panOverride != null ? Math.max(-1, Math.min(1, Number(panOverride))) : Math.sin(flashCounter * 1.9) * 0.75;
    const delay = thunderDelay(dist);
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const entry = {
      dist: Math.round(dist * 10) / 10,
      delay,
      left: delay,
      pan: Math.round(pan * 100) / 100,
      flashAt: nowMs,
      kind: dist < 22 ? "near" : "far",
    };
    live.lastFlash = {
      dist: entry.dist,
      expectedDelay: entry.delay,
      pan: entry.pan,
      kind: entry.kind,
      at: Math.round(nowMs),
    };
    live.lastStrikeDist = entry.dist;
    live.lastThunderDelay = entry.delay;
    pendingThunder.push(entry);
    if (typeof CustomEvent === "function" && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent("day:lightning", { detail: { flashes: live.flashes, distance: entry.dist, delay: entry.delay } }));
    }
    return entry;
  }
  function thunder(th) {
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const meta = th || { dist: 14, delay: thunderDelay(14), pan: 0, flashAt: nowMs - 220, kind: "near" };
    const near = meta.kind === "near" || meta.dist < 22;
    const actualDelay = Math.max(0, Math.round(((nowMs - (meta.flashAt || nowMs)) / 1000) * 1000) / 1000);
    live.thunders++;
    live.lastThunder = {
      kind: near ? "near" : "far",
      dist: meta.dist,
      expectedDelay: meta.delay,
      actualDelay: actualDelay || meta.delay,
      pan: meta.pan || 0,
      at: Math.round(nowMs),
    };
    live.lastStrikeDist = meta.dist;
    live.lastThunderDelay = meta.delay;
    if (typeof CustomEvent === "function" && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent("day:thunder", { detail: { thunders: live.thunders, delay: meta.delay, distance: meta.dist } }));
    }
    // Sampled crack from js/score.js when its files are in; plus procedural rumble/crack.
    if (day.score && day.score.crack) {
      day.score.crack(near ? "near" : "far", meta);
    }
    if (!audio || !soundOn()) return;
    const t = audio.ctx.currentTime;
    const src = audio.ctx.createBufferSource();
    src.buffer = audio.buffer;
    // The thunder shares the 2 s noise buffer with the beds: tag it for the audio probe (otherwise it is read as
    // "buf:2x88200" at rate 1 every time) and vary the pitch so no crack repeats the same buffer+rate inside 60 s.
    thunderN++;
    const tRate = 0.82 + ((thunderN * 0.137) % 1) * 0.36 + Math.random() * 0.01;
    src.playbackRate.value = tRate;
    try { src.__hawkesSampleId = "wx-thunder-" + (near ? "near" : "far"); src.__hawkesBus = "sfx"; } catch (e) { /* */ }
    const filter = audio.ctx.createBiquadFilter();
    filter.type = near ? "bandpass" : "lowpass";
    filter.frequency.setValueAtTime(near ? 420 : 190, t);
    filter.frequency.exponentialRampToValueAtTime(near ? 65 : 42, t + (near ? 1.2 : 1.9));
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(near ? 0.92 : 0.68, t + (near ? 0.018 : 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (near ? 1.35 : 2.1));
    src.connect(filter);
    if (audio.ctx.createStereoPanner && meta.pan) {
      const p = audio.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, meta.pan));
      filter.connect(p);
      p.connect(g);
    } else {
      filter.connect(g);
    }
    g.connect(audio.master);
    src.start(t);
    src.stop(t + (near ? 1.45 : 2.2));
  }
  let thunderN = 0;
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
    (document.getElementById("hud-left") || document.body).append(btn);
    document.body.append(wheel);
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
  function studio() {
    return skyStudioOn();
  }
  function paintUi(n) {
    if (!canUi) return;
    const name = STATE_NAMES[n.state] || n.state;
    btn.textContent = name;
    btn.setAttribute("aria-pressed", wheel.hidden ? "false" : "true");
    STATES.forEach((s) => wedges[s].classList.toggle("on", s === n.state));
    const on = clock().mode === "control" && studio();
    btn.hidden = !on;
    if (!on) wheel.hidden = true;
  }
  btn.addEventListener("pointerup", (e) => {
    if (clock().mode !== "control" || !studio()) return;
    openWheel(wheel.hidden);
    btn.blur();
    e.preventDefault();
  });
  wheel.addEventListener("pointerup", (e) => {
    if (!studio()) return;
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
    if (!studio()) return; // keys 1–7 and Q do nothing unless Sky studio is on
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
    if (!studio()) { openWheel(false); return; }
    const el = document.elementFromPoint(pointer.x, pointer.y);
    const w = el && el.closest && el.closest("[data-weather]");
    if (w) choose(w.dataset.weather, "wheel");
    openWheel(false);
  }, true);
  window.addEventListener("day:sky-studio", () => paintUi(weather.now()));
  // Settings toggle: Sky studio (keys 1–7 + Q wheel), off by default
  if (canUi && !document.getElementById("sky-studio")) {
    const lab = document.createElement("label");
    lab.id = "sky-studio";
    lab.className = "sky-studio";
    lab.innerHTML = `<input type="checkbox" id="sky-studio-toggle"${studio() ? " checked" : ""}/> Sky studio`;
    lab.title = "Keys 1–7 and hold Q set the sky directly (off by default)";
    const pop = document.getElementById("settings-pop");
    (pop || document.body).append(lab);
    const inp = lab.querySelector("input");
    inp.addEventListener("change", () => {
      setSkyStudio(inp.checked, "settings");
      paintUi(weather.now());
    });
    const st = document.createElement("style");
    st.textContent = `.sky-studio{display:flex;align-items:center;gap:8px;margin:8px 10px;font:600 0.78rem/1.2 system-ui,sans-serif;color:#d5e8ff;cursor:pointer}
.sky-studio input{width:18px;height:18px;accent-color:#7ec8ff}`;
    document.head.appendChild(st);
  }

  function isLowTier() {
    if (world.look && world.look.quality && world.look.quality() === "low") return true;
    try {
      if (typeof window !== "undefined" && window.innerWidth <= 860 && window.innerHeight <= 440) return true;
    } catch (e) { /* headless */ }
    return false;
  }

  /* ---- each frame, after the time-of-day sky ---- */
  function placeEmitters(look, wNow) {
    const cam = scene.activeCamera;
    const x = cam && cam.target ? cam.target.x : 0;
    const yBase = cam && cam.target ? Math.max(0, cam.target.y) : 0;
    const z = cam && cam.target ? cam.target.z : 0;
    const gust = 0.55 + 0.45 * Math.sin(windT * 0.7);
    const wx = look.wind * (2.2 + gust * 3.5);
    const low = isLowTier();
    live.tier = low ? "phone" : "desktop";
    const tierScale = low ? 0.24 : 1;
    /* the camera inside a cutaway room: no rain, snow, dust, mist or motes there */
    const indoors = !!(world.indoorsAt && world.indoorsAt(x, z));
    live.indoors = indoors;
    const cap = (ps, n) => (ps && !ps.__dead && !indoors ? n * (ps.__gpu ? 1 : 0.34) * tierScale : 0);
    if (rainPs && !rainPs.__dead) {
      rainPs.emitter.set(x, yBase + 14, z);
      // js/rain.js RAIN_BUDGET: at most 2500 streaks alive on a phone (rate x mean life 0.6 s), 9000 on a desktop
      rainPs.emitRate = Math.min(cap(rainPs, look.rain * 6200), (low ? 2500 : 9000) / 0.6);
      live.rainStreaks = Math.round(rainPs.emitRate * 0.6);
      rainPs.direction1.set(-0.35 - wx, -1, -0.15);
      rainPs.direction2.set(0.25 - wx * 0.7, -1, 0.2);
      rainPs.minEmitPower = 16 + look.wind * 6;
      rainPs.maxEmitPower = 24 + look.wind * 8;
      rainPs.gravity.set(-wx * 0.4, -4, 0);
    }
    if (splashPs && !splashPs.__dead) {
      splashPs.emitter.set(x, yBase + 0.2, z);
      splashPs.emitRate = cap(splashPs, look.splash * 900);
      splashPs.direction1.set(-0.4, 1, -0.4);
      splashPs.direction2.set(0.4, 1, 0.4);
      splashPs.gravity.set(0, -12, 0);
      splashPs.minEmitPower = 1.2;
      splashPs.maxEmitPower = 2.4;
    }
    if (snowPs && !snowPs.__dead) {
      snowPs.emitter.set(x, yBase + 12, z);
      snowPs.emitRate = cap(snowPs, look.snow * 1100);
      snowPs.direction1.set(-0.4 - look.wind, -1, -0.3);
      snowPs.direction2.set(0.5 - look.wind * 0.4, -1, 0.4);
      snowPs.gravity.set(0, -0.35, 0);
      snowPs.minEmitPower = 0.8;
      snowPs.maxEmitPower = 1.6;
    }
    if (dustPs && !dustPs.__dead) {
      dustPs.emitter.set(x, yBase + 1.3, z);
      const litterK = look.wind > 0.16 ? Math.max(look.dust, look.wind * 0.85) * look.wind : 0;
      dustPs.emitRate = cap(dustPs, litterK * 360);
      dustPs.direction1.set(0.7 + wx, -0.1, -0.3);
      dustPs.direction2.set(1.2 + wx * 1.1, 0.35, 0.35);
      dustPs.gravity.set(0, -0.8, 0);
      dustPs.minEmitPower = 5 + look.wind * 4;
      dustPs.maxEmitPower = 11 + look.wind * 6;
    }
    if (mistPs && !mistPs.__dead) {
      const fogRate = Math.max(0, Math.min(1, (look.fog - 0.03) / 0.06)) * 70;
      const steamAmt = wNow.steam || 0;
      if (steamAmt > 0.02 && fogRate < 5) {
        const roofY = yBase > 2.5 ? yBase + 0.15 : 6.2;
        mistPs.emitter.set(x, roofY, z);
        mistPs.minSize = 0.55;
        mistPs.maxSize = 1.45;
        mistPs.emitRate = cap(mistPs, steamAmt * 150);
        mistPs.direction1.set(-0.22, 0.85, -0.22);
        mistPs.direction2.set(0.22, 1.5, 0.22);
        mistPs.minEmitPower = 0.45;
        mistPs.maxEmitPower = 1.15;
      } else {
        mistPs.emitter.set(x, yBase + 0.3, z);
        mistPs.minSize = 3;
        mistPs.maxSize = 6.5;
        mistPs.emitRate = cap(mistPs, fogRate);
        mistPs.direction1.set(0.3, 0.02, -0.15);
        mistPs.direction2.set(0.6, 0.08, 0.15);
        mistPs.minEmitPower = 0.3;
        mistPs.maxEmitPower = 0.8;
      }
    }
    if (motesPs && !motesPs.__dead) {
      motesPs.emitter.set(x, yBase + 0.2, z);
      motesPs.emitRate = cap(motesPs, (wNow.sun || 0) * 110);
      motesPs.direction1.set(-0.2, 0.7, -0.2);
      motesPs.direction2.set(0.2, 1.2, 0.2);
      motesPs.gravity.set(0, 0.1, 0);
      motesPs.minEmitPower = 0.4;
      motesPs.maxEmitPower = 1.1;
    }
    live.litterRate = Math.round((dustPs && !dustPs.__dead ? dustPs.emitRate : 0) * 10) / 10;
    let totalRate = 0;
    for (let i = 0; i < systems.length; i++) {
      if (systems[i] && !systems[i].__dead) totalRate += systems[i].emitRate || 0;
    }
    live.activeParticles = Math.round(totalRate);
  }

  /* Reflections (clear coat on the road and the wet surfaces, the mirror puddles) show only while the weather
     is an ability's: set by the player (keys 1–7, the wheel, Storm) and held after let-go. The forecast's rain
     still darkens the road and falls, but doesn't shine. */
  let abilityK = 0;
  let lastPuddleAlpha = -1;
  function applyLook(L, dt, snap) {
    windT += dt;
    const wNow = weather.now();
    const isAbility = !!wNow.manual;
    const abTau = isAbility ? 0.45 : 1.2;
    abilityK = snap ? (isAbility ? 1 : 0) : abilityK + ((isAbility ? 1 : 0) - abilityK) * (1 - Math.exp(-Math.max(0, dt) / abTau));
    if (Math.abs(abilityK - (isAbility ? 1 : 0)) < 0.004) abilityK = isAbility ? 1 : 0;
    const wetR = L.wet * abilityK;
    const surfaceWet = Math.max(L.wet, wNow.roofWet || 0);
    const snowCover = wNow.snowCover || 0;
    live.reflect = wetR;
    live.roofGloss = Number((0.06 + Math.max(wetR, surfaceWet * 0.78) * 0.58).toFixed(3));
    const tod = scene.clearColor;
    scratch.tod.set(tod.r, tod.g, tod.b);
    scratch.tint.set(L.sky[0], L.sky[1], L.sky[2]);
    scratch.mul.set(scratch.tod.r * scratch.tint.r, scratch.tod.g * scratch.tint.g, scratch.tod.b * scratch.tint.b);
    B.Color3.LerpToRef(scratch.mul, scratch.tint, 0.42, scratch.toward);
    B.Color3.LerpToRef(scratch.tod, scratch.toward, L.cover, scratch.mixed);
    if (L.lightning > 0.35) {
      nextFlash -= dt;
      if (nextFlash <= 0) {
        nextFlash = 1.35 + Math.random() * 1.25;
        scheduleFlash();
      }
    } else nextFlash = Math.min(nextFlash, 0.65);
    for (let i = pendingThunder.length - 1; i >= 0; i--) {
      pendingThunder[i].left -= dt;
      if (pendingThunder[i].left <= 0) {
        const th = pendingThunder.splice(i, 1)[0];
        thunder(th);
      }
    }
    flash = Math.max(0, flash - dt * (flash > 0.4 ? 4.5 : 7.5));
    live.flashLight = Number((flash * Math.max(0.5, L.lightning)).toFixed(3));
    if (flash > 0) B.Color3.LerpToRef(scratch.mixed, scratch.white, flash * 0.85, scratch.mixed);
    // Sun break: the sky goes warm gold, scaled by how bright the hour already is (no gold at midnight).
    const sunK = (wNow.sun || 0) * Math.min(1, (scratch.tod.r + scratch.tod.g + scratch.tod.b) / 1.4);
    if (sunK > 0.001) {
      scratch.toward.set(1, 0.82, 0.5);
      B.Color3.LerpToRef(scratch.mixed, scratch.toward, sunK * 0.34, scratch.mixed);
    }
    scene.clearColor.set(scratch.mixed.r, scratch.mixed.g, scratch.mixed.b, 1);
    const fogMix = Math.min(1, L.fog / 0.045);
    scratch.fog.set(L.fogC[0], L.fogC[1], L.fogC[2]);
    B.Color3.LerpToRef(scratch.mixed, scratch.fog, fogMix * 0.9, scratch.fog);
    scene.fogColor.copyFrom(scratch.fog);
    scene.fogDensity = L.fog;
    if (sun) {
      sun.intensity *= L.light * (1 + flash * Math.max(0.5, L.lightning) * 3.6) * (1 + sunK * 0.7);
      if (sunK > 0.001 && sun.diffuse) {
        sun.diffuse.r = Math.min(1, sun.diffuse.r + (1 - sun.diffuse.r) * sunK);
        sun.diffuse.g += (0.84 - sun.diffuse.g) * sunK * 0.6;
        sun.diffuse.b += (0.55 - sun.diffuse.b) * sunK * 0.6;
      }
    }
    if (hemi) {
      // floor: a dusk storm must leave the street, ramp and people readable, not black. Dark asphalt and lawn
      // (albedo ~0.1) at 0.5 of a blue-grey light came out near black, so the floor is higher and the fill lifts toward a soft grey-blue.
      const nf = (scene.metadata && scene.metadata.nightFloor) || { hemi: 0.85 };
      const baseHemi = Math.max(nf.hemi, 0.85 + 0.2 * L.cover + 0.3 * L.cover * L.cover, hemi.intensity * L.hemi * (1 + sunK * 0.2));
      hemi.intensity = baseHemi + flash * Math.max(0.5, L.lightning) * 2.1;
      // A hemisphere light lights a vertical face with half sky, half ground colour: the near-black ground colour left every wall
      // (facades, the ramp's side) black at dusk in a storm, so the ground colour lifts toward the fill too.
      if (hemi.diffuse) B.Color3.LerpToRef(hemi.diffuse, scratch.hemiFill, 0.7 * L.cover, hemi.diffuse);
      if (hemi.groundColor) B.Color3.LerpToRef(hemi.groundColor, scratch.hemiFill, 0.7 * L.cover, hemi.groundColor);
    }
    const baseExp = stage.lastSun ? 0.86 + 0.12 * stage.lastSun.day : 0.92;
    const targetExp = Math.min(1.08, Math.max(0.92, baseExp * (0.88 + 0.12 * L.exposure) * (1 + flash * 0.85)));
    if (world.look && world.look.setSky) {
      world.look.setSky({
        clearColor: scratch.mixed,
        fogColor: scratch.fog,
        fogDensity: L.fog,
        exposure: targetExp,
        cover: L.cover,
        wet: wetR,
        surfaceWet,
        snowCover,
        rain: L.rain,
        storm: L.lightning,
        wind: L.wind,
        flash,
        sun: sunK, // js/sky.js: the Sun break's gap in the cloud deck and its god rays
      });
    } else if (pipeline && pipeline.imageProcessing) {
      const safeExp = Math.abs(targetExp - 1.0) < 1e-4 ? 0.9999 : targetExp;
      const ipc = pipeline.imageProcessing.imageProcessingConfiguration;
      if (ipc) ipc._exposure = safeExp;
      if (scene.imageProcessingConfiguration) scene.imageProcessingConfiguration._exposure = safeExp;
    }
    const low = isLowTier();
    if (roadMat && dryDiffuse) {
      const wet = surfaceWet;
      const g = 0.04 + wetR * 0.66;
      if (
        Math.abs(wet - (roadMat.__lastWet ?? -1)) > 0.005 ||
        Math.abs(wetR - (roadMat.__lastWetR ?? -1)) > 0.005 ||
        Math.abs(snowCover - (roadMat.__lastSnow ?? -1)) > 0.005 ||
        low !== roadMat.__lastLow
      ) {
        roadMat.__lastWet = wet;
        roadMat.__lastWetR = wetR;
        roadMat.__lastSnow = snowCover;
        roadMat.__lastLow = low;
        if (roadIsPbr) {
          dryDiffuse.scaleToRef(1 - wet * 0.48, scratch.diff);
          scratch.diff.b = Math.min(1, scratch.diff.b + wet * 0.04);
          if (snowCover > 0.01) {
            scratch.toward.set(0.88, 0.92, 0.98);
            B.Color3.LerpToRef(scratch.diff, scratch.toward, snowCover * 0.36, scratch.diff);
          }
          if (!roadMat.albedoColor) roadMat.albedoColor = scratch.diff.clone();
          else roadMat.albedoColor.copyFrom(scratch.diff);
          roadMat.roughness = Math.max(0.18, (dryRough == null ? 0.84 : dryRough) - Math.max(wetR, wet * 0.72) * 0.58);
          if (roadMat.clearCoat) {
            const wantCoat = !low; // intensity carries the wetness; toggling isEnabled recompiles the road shader mid-play
            if (roadMat.clearCoat.isEnabled !== wantCoat) roadMat.clearCoat.isEnabled = wantCoat;
            roadMat.clearCoat.intensity = wetR * 0.62;
            roadMat.clearCoat.roughness = 0.12 + (1 - wetR) * 0.18;
          }
          // phone / low: SSR is off — bind the wet-street ReflectionProbe so neon and lamps still mirror
          if (low && streetProbe && streetProbe.cubeTexture) {
            if (!streetProbeReady) fillStreetProbeList();
            const wantProbe = wetR > 0.15;
            // bound once and left bound: assigning reflectionTexture on and off recompiled the road's PBR shader at the first rain
            // (and every dry-wet change). Dry = environmentIntensity 0; wet = intensity up, the probe's refresh rate follows.
            if (roadMat.reflectionTexture !== streetProbe.cubeTexture) {
              if (roadMat.__dryEnv == null && roadMat.environmentIntensity != null) roadMat.__dryEnv = roadMat.environmentIntensity;
              roadMat.reflectionTexture = streetProbe.cubeTexture;
              if (roadMat.environmentIntensity != null) roadMat.environmentIntensity = 0;
            }
            if (wantProbe !== streetProbeOn) {
              streetProbeOn = wantProbe;
              // metallic workflow: environmentIntensity lifts the probe; reflectivityColor alone is ignored
              if (roadMat.__dryMetallic == null && roadMat.metallic != null) roadMat.__dryMetallic = roadMat.metallic;
              if (roadMat.metallic != null) roadMat.metallic = wantProbe ? Math.max(roadMat.__dryMetallic || 0, 0.35) : (roadMat.__dryMetallic != null ? roadMat.__dryMetallic : 0.08);
              if (roadMat.environmentIntensity != null) {
                roadMat.environmentIntensity = wantProbe ? Math.max(0.85, roadMat.__dryEnv == null ? 0.85 : roadMat.__dryEnv) : 0;
              }
              streetProbe.refreshRate = wantProbe ? 0 : -1; // 0 = render once: a static cube, not six faces of the city every 12 frames
              if (wantProbe) streetProbePos.copyFromFloats(Number.NaN, 0, 0);
            }
            if (wantProbe) {
              streetProbeAcc += 0.3;
              if (streetProbeAcc > 1.2) {
                streetProbeAcc = 0;
                const cam = scene.activeCamera;
                if (cam) {
                  const p = cam.globalPosition || cam.position;
                  // re-render the cube only after he has walked 40 m from where it was taken
                  const dx = p.x - streetProbePos.x, dz = p.z - streetProbePos.z;
                  if (!(dx * dx + dz * dz < 1600)) {
                    streetProbePos.copyFromFloats(p.x, 0.4, p.z);
                    streetProbe.position.copyFrom(streetProbePos);
                    streetProbe.refreshRate = 0;
                  }
                }
              }
            }
          } else if (streetProbeOn || (roadMat.reflectionTexture && roadMat.reflectionTexture === (streetProbe && streetProbe.cubeTexture))) {
            // leaving low quality (high has SSR and its own IBL): restore the dry look, one recompile on a deliberate switch
            streetProbeOn = false;
            roadMat.reflectionTexture = null;
            if (roadMat.__dryEnv != null && roadMat.environmentIntensity != null) roadMat.environmentIntensity = roadMat.__dryEnv;
            if (streetProbe) streetProbe.refreshRate = -1;
          }
        } else {
          dryDiffuse.scaleToRef(1 - wet * 0.52, scratch.diff);
          scratch.diff.b = Math.min(1, scratch.diff.b + wet * 0.04);
          roadMat.diffuseColor.copyFrom(scratch.diff);
          roadMat.ambientColor.copyFrom(scratch.diff).scaleInPlace(0.32);
          roadMat.specularColor.set(g, g * 1.02, g * 1.08);
          roadMat.specularPower = 64 - wet * 40;
        }
      }
      live.gloss = g;
      live.reflectProbe = streetProbeOn;
    }
    const cam = scene.activeCamera;
    const px = cam && cam.target ? cam.target.x : 0;
    const pLevel = Math.max(wNow.puddleLevel || 0, wetR);
    const showPuddles = pLevel > 0.08;
    const pScale = 0.25 + 0.75 * pLevel;
    const targetAlpha = showPuddles ? Math.min(0.82, 0.16 + pLevel * 0.62) : 0;
    if (pmat && Math.abs(targetAlpha - lastPuddleAlpha) > 0.005) {
      lastPuddleAlpha = targetAlpha;
      pmat.alpha = targetAlpha;
    }
    const rippleAmt = showPuddles && L.rain > 0.08 ? Math.min(1, L.rain * pLevel * 1.2) : 0;
    live.ripples = Number(rippleAmt.toFixed(3));
    if (rippleAmt > 0.05 && !low) {
      rippleClock += dt;
      if (rippleClock >= 0.09) {
        rippleClock = 0;
        paintPuddleRipple(windT, rippleAmt);
      }
    }
    puddles.forEach((p) => {
      p.mesh.setEnabled(showPuddles);
      if (showPuddles) {
        if (p.follow) {
          p.mesh.position.x = px + p.dx;
          p.mesh.position.z = p.rz + p.dz;
        }
        if (Math.abs(pScale - p.lastScale) > 0.01) {
          p.lastScale = pScale;
          p.mesh.scaling.set(pScale, 1, pScale);
        }
      }
    });
    live.puddles = puddles.filter((p) => p.mesh.isEnabled()).length;

    const showSnow = snowCover > 0.04;
    if (Math.abs(snowCover - lastSnowCap) > 0.005) {
      lastSnowCap = snowCover;
      snowCapMat.alpha = showSnow ? Math.min(0.92, snowCover * 0.92) : 0;
      const sScale = 0.58 + 0.42 * snowCover;
      for (let i = 0; i < snowCaps.length; i++) {
        const sc = snowCaps[i];
        sc.setEnabled(showSnow);
        if (showSnow) sc.scaling.set(sScale, 0.3 + 0.7 * snowCover, sScale);
      }
    }
    live.snowMeshes = showSnow ? snowCaps.length : 0;

    live.treeSway = L.wind > 0.08 ? Number((L.wind * 0.26).toFixed(3)) : 0;
    live.awningSway = L.wind > 0.08 ? Number((L.wind * 0.22).toFixed(3)) : 0;
    if (canSway) {
      if (L.wind > 0.08) {
        swayAcc += dt;
        const swayStep = low ? 0.095 : 0.055;
        if (swayAcc >= swayStep) {
          swayAcc = 0;
          wasSwayed = true;
          sway.forEach((entry) => {
            if (entry.awning) {
              const amp = L.wind * 0.22;
              entry.base.forEach((b, i) => {
                const phase = b.p.x * 0.23 + b.p.z * 0.17;
                const flap = amp * (0.45 + 0.55 * Math.sin(windT * 5.2 + phase));
                B.Quaternion.FromEulerAnglesToRef(flap, 0, flap * 0.35, swayQ);
                b.r.multiplyToRef(swayQ, tmpR);
                tmpS.set(b.s.x, b.s.y * (1 + Math.abs(flap) * 0.3), b.s.z * (1 + flap * 0.12));
                B.Matrix.ComposeToRef(tmpS, tmpR, b.p, tmpM);
                entry.mesh.thinInstanceSetMatrixAt(i, tmpM, i === entry.base.length - 1);
              });
            } else {
              const amp = L.wind * (entry.crown ? 0.26 : 0.07);
              entry.base.forEach((b, i) => {
                const phase = b.p.x * 0.17 + b.p.z * 0.11;
                const lean = Math.sin(windT * 2.0 + phase);
                const ang = amp * (0.5 + 0.5 * lean);
                B.Quaternion.FromEulerAnglesToRef(ang * 0.45, 0, ang, swayQ);
                b.r.multiplyToRef(swayQ, tmpR);
                B.Matrix.ComposeToRef(b.s, tmpR, b.p, tmpM);
                entry.mesh.thinInstanceSetMatrixAt(i, tmpM, i === entry.base.length - 1);
              });
            }
          });
        }
      } else if (wasSwayed) {
        wasSwayed = false;
        swayAcc = 0;
        sway.forEach((entry) => {
          entry.base.forEach((b, i) => {
            B.Matrix.ComposeToRef(b.s, b.r, b.p, tmpM);
            entry.mesh.thinInstanceSetMatrixAt(i, tmpM, i === entry.base.length - 1);
          });
        });
      }
    }
    placeEmitters(L, wNow);
    // Adaptive beds + sampled rain/wind/city hum (js/score.js). Procedural noise stays as a
    // fallback when the Gen files aren't there yet, and as a soft under-layer for hush/snow.
    const scored = day.score && day.score.tick ? day.score.tick(L, dt) : null;
    const scape = (scored && scored.soundscape) || null;
    if (audio) {
      const on = soundOn();
      if (on && audio.ctx.state === "suspended") audio.ctx.resume();
      const gust = 0.45 + 0.55 * Math.abs(Math.sin(windT * 0.45));
      const sampleDrive = !!(scored && scored.driving);
      const proc = sampleDrive ? 0.22 : 1; // soft under-layer when samples carry the bed
      audio.master.gain.value = on ? 0.36 * (sampleDrive ? 0.62 : 1) : 0;
      audio.air.gain.value = L.sound.air * 0.24 * (sampleDrive ? 0.3 : 1);
      if (audio.air.filter && scape && scape.cityToneHz) {
        audio.air.filter.frequency.value = scape.cityToneHz;
      }
      audio.rain.gain.value = L.sound.rain * 0.52 * proc;
      if (audio.rainRoof && scape) audio.rainRoof.gain.value = (scape.rainRoof || 0) * 0.38 * proc;
      if (audio.gutter && scape) {
        const trickle = 0.65 + 0.35 * Math.sin(windT * 5.2);
        audio.gutter.gain.value = (scape.gutter || 0) * 0.32 * trickle * proc;
      }
      if (audio.umbrella && scape) {
        audio.umbrella.gain.value = (scape.umbrella || 0) * 0.3 * proc;
        if (audio.umbrella.panner) audio.umbrella.panner.pan.value = scape.umbrellaPan || 0;
      }
      audio.wind.gain.value = L.sound.wind * 0.42 * gust * proc;
      if (audio.wind.panner && scape) audio.wind.panner.pan.value = scape.windPan || 0;
      if (audio.awning && scape) {
        const flap = 0.4 + 0.6 * Math.abs(Math.sin(windT * 6.5));
        audio.awning.gain.value = (scape.awning || 0) * 0.34 * flap * proc;
        if (audio.awning.panner) audio.awning.panner.pan.value = scape.awningPan || 0;
      }
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
    } else if (day.score && day.score.now) {
      live.heard = day.score.now().heard || 0;
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
      if (wall < 0.002 && typeof dt === "number" && dt > 0 && dt <= 0.5) wall = dt;
    }
    weather.follow(c.key, c.minutes, snap ? 0 : wall, snap, c.mode);
    const n = weather.now();
    if (!weather.warming()) tickReact(c.mode, n, snap ? 0 : wall);
    const L = weather.look();
    try {
      applyLook(L, wall, snap);
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
    const scNow = day.score && day.score.now ? day.score.now() : null;
    return Object.assign(weather.now(), {
      sky: live.sky,
      gloss: live.gloss,
      roofGloss: live.roofGloss,
      heard: live.heard,
      flashes: live.flashes,
      thunders: live.thunders,
      lastThunderDelay: live.lastThunderDelay,
      lastStrikeDist: live.lastStrikeDist,
      flashLight: live.flashLight,
      lastFlash: live.lastFlash || null,
      lastThunder: live.lastThunder || (scNow && scNow.lastThunder) || null,
      soundscape: (scNow && scNow.soundscape) || null,
      particles: live.particles,
      puddles: live.puddles,
      ripples: live.ripples,
      reflect: live.reflect || 0,
      reflectProbe: !!live.reflectProbe,
      awnings: live.awnings,
      treeSway: live.treeSway,
      awningSway: live.awningSway,
      litterRate: live.litterRate,
      snowMeshes: live.snowMeshes,
      tier: live.tier,
      activeParticles: live.activeParticles,
      rainStreaks: live.rainStreaks || 0,
    });
  }
  const api = {
    STATES,
    now: apiNow,
    set: (state, intensity, via) => weather.set(state, intensity, via),
    sunbreak: () => weather.sunbreak(),
    boostSteam: (sec) => weather.boostSteam(sec),
    triggerFlash: (dist, pan) => scheduleFlash(dist, pan),
    /** Behind the loading card: hold rain, fog, a sun break and wind for a few frames each so every effect they bring in (particles,
     *  ripples, curtains, fog slices, god rays, wet-road variants) compiles and allocates now, not on the first cast. Silent (no log,
     *  event, voice or bark), then snaps back to the forecast. Stops at once if a real call sets the weather. */
    async warmCasts(frames) {
      const n = Math.max(2, frames || 12);
      const eachFrames = (k) => new Promise((res) => {
        let i = 0;
        const done = () => { scene.onAfterRenderObservable.remove(obs); res(); };
        const obs = scene.onAfterRenderObservable.add(() => { if (++i >= k) done(); });
        setTimeout(done, 1500); // a hidden tab or a lost context draws nothing: don't hang
      });
      // snow too: the first snow (the switch the forecast makes ~24 s in on a snowy day) built its 5000 flakes, roof caps and road tint mid-play
      const steps = [["rain", 0.7, false], ["fog", 0.8, false], ["clear", 1, true], ["wind", 0.8, false], ["snow", 0.8, false]];
      let ran = 0;
      // the god-ray pass and the bolt's ribbons and scorch decal compile here too (no weather change, nothing shows)
      try { if (window.day && window.day.sky && window.day.sky.warmGodRays) await window.day.sky.warmGodRays(); } catch (e) { /* */ }
      try { const bf = window.powers && window.powers.boltFx; if (bf && bf.warm) await bf.warm(); } catch (e) { /* */ }
      for (const [state, intensity, sun] of steps) {
        if (!weather.warm({ state, intensity, sun })) break; // someone else already holds the sky
        await eachFrames(n);
        if (!weather.warming()) break; // a real call took over mid-way
        ran++;
      }
      weather.warm(null);
      return ran;
    },
    thunderDelay,
    forecast: (dateKey, minutes) => forecastAt(dateKey, minutes, cfg.forecast),
    /** The wheel, for a phone tap the playtest sends as a pointer. */
    open: (on) => { if (studio() || on === false) openWheel(on !== false); },
    wheel: () => !wheel.hidden,
    skyStudio(on) {
      if (on == null) return studio();
      setSkyStudio(!!on, "api");
      const inp = typeof document !== "undefined" && document.getElementById("sky-studio-toggle");
      if (inp) inp.checked = !!on;
      paintUi(weather.now());
      return studio();
    },
  };
  world.__weather = api;
  window.weather = api;
  day.weather = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) startWeather();
