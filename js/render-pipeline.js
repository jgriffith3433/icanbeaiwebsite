/* ==========================================================================
   The render pipeline: how the picture is graded, lit and finished.
   Builds on the DefaultRenderingPipeline world.js makes ("look") and adds:
   - ACES tonemapping with the day's exposure (js/look.js and weather.js set it each frame),
   - a colour-grade LUT per time-of-day block (dawn, noon, golden hour, dusk, night) and per weather overlay
     (storm: cool, desaturated teal; fog: milky, low contrast; sun break: warm lift). The LUTs are authored here,
     in code, from grade parameters: a 3D texture baked from the blended parameters, crossfaded over about 4 s
     by the day's clock and weather.js's state,
   - bloom on emissives only (threshold above anything the sky or a lit wall reaches),
   - SSAO2 for contact darkness at roof edges, AC units and kerbs (high only),
   - a cascaded shadow generator (2 cascades at 2048 with soft PCF; one 1024 cascade on low) for the sun and,
     at night, the moon: Small Weather, the neighbours, the crowd and the rooftop props cast,
   - FXAA, a light vignette and a very subtle chromatic aberration (high only),
   - screen-space reflections on the wet street (desktop high); phones use a reflection-probe
     fallback on the road (weather.js / look clear coat) instead of SSR.
   Low quality (phones): tonemap, LUT and half-res bloom, one 1024 cascade, no SSAO, no SSR.
   Small Weather keeps his own fill light (js/small-weather.js, includedOnlyMeshes): nothing here brightens the
   city for him. `day.render.info()` reports what is on, the current LUT and the shadow casters (the playtests).
   ========================================================================== */
const B = window.BABYLON;

/* ---------------- the grades ---------------- */
/* Each grade is applied to the tonemapped (display) colour:
   gain x, lift (raises the blacks), gamma (> 1 darkens the mids), shadow / high (tints that follow the picture's
   darks and lights), saturation and contrast. Time-of-day grades are absolute; the weather overlays are deltas
   that scale/offset whatever grade the hour has. */
export const GRADES = {
  dawn: { gain: [1.06, 0.97, 0.93], lift: [0.004, 0.006, 0.012], gamma: 1.02, shadow: [0.0, 0.02, 0.05], high: [0.06, 0.02, -0.02], sat: 1.05, con: 1.04 },
  noon: { gain: [1.0, 1.02, 1.04], lift: [0.004, 0.008, 0.02], gamma: 1.0, shadow: [-0.005, 0.01, 0.045], high: [0.01, 0.015, 0.01], sat: 0.98, con: 1.03 },
  golden: { gain: [1.13, 0.98, 0.78], lift: [0.006, 0.004, 0.0], gamma: 0.96, shadow: [-0.02, 0.022, 0.06], high: [0.09, 0.035, -0.07], sat: 1.2, con: 1.1 },
  dusk: { gain: [1.0, 0.87, 1.06], lift: [0.008, 0.0, 0.02], gamma: 1.04, shadow: [0.015, 0.0, 0.075], high: [0.05, -0.02, 0.06], sat: 1.12, con: 1.1 },
  night: { gain: [0.94, 1.04, 1.2], lift: [0.008, 0.02, 0.05], gamma: 0.94, shadow: [0.0, 0.035, 0.1], high: [-0.02, 0.02, 0.06], sat: 0.95, con: 1.04 },
};
export const OVERLAYS = {
  storm: { gain: [0.84, 1.0, 1.05], lift: [0.0, 0.006, 0.01], gamma: 1.06, shadow: [-0.01, 0.035, 0.04], high: [-0.04, 0.025, 0.045], sat: 0.55, con: 1.08 },
  fog: { gain: [0.96, 0.98, 1.0], lift: [0.05, 0.055, 0.062], gamma: 0.95, shadow: [0.0, 0.0, 0.01], high: [0.0, 0.0, 0.0], sat: 0.76, con: 0.8 },
  sunbreak: { gain: [1.12, 1.04, 0.88], lift: [0.02, 0.012, 0.0], gamma: 0.94, shadow: [0.0, 0.0, 0.0], high: [0.06, 0.04, 0.0], sat: 1.2, con: 1.04 },
};
export const TOD = Object.keys(GRADES);
export const OVERLAY_NAMES = Object.keys(OVERLAYS);
export const LUT_NAMES = TOD.concat(OVERLAY_NAMES);

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (t) => t * t * (3 - 2 * t);

/** The hour's grade blend: key hours around the sun's day, smoothstepped, wrapping at midnight. */
export function timeWeights(hour, sunrise, sunset) {
  const keys = [
    [sunrise - 1.4, "night"],
    [sunrise - 0.2, "dawn"],
    [sunrise + 0.5, "dawn"],
    [sunrise + 2.6, "noon"],
    [sunset - 3.4, "noon"],
    [sunset - 1.5, "golden"],
    [sunset - 0.25, "golden"],
    [sunset + 0.35, "dusk"],
    [sunset + 0.9, "dusk"],
    [sunset + 2.2, "night"],
  ];
  const w = { dawn: 0, noon: 0, golden: 0, dusk: 0, night: 0 };
  const h = ((hour % 24) + 24) % 24;
  let i = keys.length - 1;
  for (let k = 0; k < keys.length; k++) if (keys[k][0] <= h) i = k;
  const a = keys[i];
  const b = keys[(i + 1) % keys.length];
  let h0 = a[0];
  let h1 = b[0];
  let hh = h;
  if (h1 <= h0) h1 += 24;
  if (hh < h0) hh += 24;
  const t = h1 - h0 < 1e-6 ? 0 : smooth(clamp01((hh - h0) / (h1 - h0)));
  w[a[1]] += 1 - t;
  w[b[1]] += t;
  return w;
}

/** The weather overlays from weather.now(): storm (cool teal), fog (milky), sun break (warm lift). */
export function overlayWeights(n) {
  if (!n) return { storm: 0, fog: 0, sunbreak: 0 };
  const storm = clamp01((n.lightning || 0) + (n.rain || 0) * 0.35 + clamp01(((n.cover || 0) - 0.3) / 0.6) * 0.12);
  const fog = clamp01(smooth(clamp01(((n.fog || 0) - 0.02) / 0.07)) + (n.snow || 0) * 0.3);
  const sunbreak = clamp01(n.sun || 0) * (1 - storm);
  return { storm, fog, sunbreak };
}

/** One parameter set from the hour's blend and the overlays. */
export function blendGrade(tw, ow) {
  const g = { gain: [0, 0, 0], lift: [0, 0, 0], gamma: 0, shadow: [0, 0, 0], high: [0, 0, 0], sat: 0, con: 0 };
  let total = 0;
  for (const k of TOD) {
    const w = tw[k] || 0;
    if (!w) continue;
    const p = GRADES[k];
    total += w;
    for (let c = 0; c < 3; c++) {
      g.gain[c] += p.gain[c] * w;
      g.lift[c] += p.lift[c] * w;
      g.shadow[c] += p.shadow[c] * w;
      g.high[c] += p.high[c] * w;
    }
    g.gamma += p.gamma * w;
    g.sat += p.sat * w;
    g.con += p.con * w;
  }
  const inv = total > 0 ? 1 / total : 1;
  for (let c = 0; c < 3; c++) {
    g.gain[c] *= inv;
    g.lift[c] *= inv;
    g.shadow[c] *= inv;
    g.high[c] *= inv;
  }
  g.gamma *= inv;
  g.sat *= inv;
  g.con *= inv;
  for (const name of OVERLAY_NAMES) {
    const k = ow && ow[name];
    if (!k) continue;
    const o = OVERLAYS[name];
    for (let c = 0; c < 3; c++) {
      g.gain[c] *= mix(1, o.gain[c], k);
      g.lift[c] += o.lift[c] * k;
      g.shadow[c] += o.shadow[c] * k;
      g.high[c] += o.high[c] * k;
    }
    g.gamma *= mix(1, o.gamma, k);
    g.sat *= mix(1, o.sat, k);
    g.con *= mix(1, o.con, k);
  }
  return g;
}

/** Bake a size^3 RGBA8 LUT (index ((b * size + g) * size + r) * 4) from grade parameters. Channel-wise steps run on a
    1D table first, so a 32^3 bake is plain arithmetic (about a millisecond). */
export function bakeLut(g, size, out) {
  const data = out || new Uint8Array(size * size * size * 4);
  const tab = [new Float32Array(size), new Float32Array(size), new Float32Array(size)];
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < size; i++) {
      const v = i / (size - 1);
      tab[c][i] = Math.pow(Math.max(0, v * g.gain[c] + g.lift[c] * (1 - v)), g.gamma);
    }
  }
  const hiMix = Math.max(0, g.con - 1);
  const flat = g.con < 1 ? g.con : 1;
  const sh = g.shadow;
  const hi = g.high;
  let o = 0;
  for (let bi = 0; bi < size; bi++) {
    const cb = tab[2][bi];
    for (let gi = 0; gi < size; gi++) {
      const cg = tab[1][gi];
      for (let ri = 0; ri < size; ri++) {
        let r = tab[0][ri];
        let gg = cg;
        let b = cb;
        const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        const ls = (1 - Math.min(1, l)) * (1 - Math.min(1, l));
        const lh = Math.min(1, l) * Math.min(1, l);
        r += sh[0] * ls + hi[0] * lh;
        gg += sh[1] * ls + hi[1] * lh;
        b += sh[2] * ls + hi[2] * lh;
        const l2 = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        r = l2 + (r - l2) * g.sat;
        gg = l2 + (gg - l2) * g.sat;
        b = l2 + (b - l2) * g.sat;
        r = r < 0 ? 0 : r > 1 ? 1 : r;
        gg = gg < 0 ? 0 : gg > 1 ? 1 : gg;
        b = b < 0 ? 0 : b > 1 ? 1 : b;
        if (hiMix > 0) {
          r = mix(r, r * r * (3 - 2 * r), hiMix);
          gg = mix(gg, gg * gg * (3 - 2 * gg), hiMix);
          b = mix(b, b * b * (3 - 2 * b), hiMix);
        } else if (flat < 1) {
          r = mix(0.5, r, flat);
          gg = mix(0.5, gg, flat);
          b = mix(0.5, b, flat);
        }
        data[o] = Math.round(r * 255);
        data[o + 1] = Math.round(gg * 255);
        data[o + 2] = Math.round(b * 255);
        data[o + 3] = 255;
        o += 4;
      }
    }
  }
  return data;
}

/** What a grade does to a colour (the checks and the playtest use it without a GPU). */
export function applyGrade(g, rgb) {
  const size = 17;
  const d = bakeLut(g, size);
  const at = (v) => Math.max(0, Math.min(size - 1, Math.round(v * (size - 1))));
  const i = ((at(rgb[2]) * size + at(rgb[1])) * size + at(rgb[0])) * 4;
  return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
}

function gradeDistance(a, b) {
  let d = 0;
  for (let c = 0; c < 3; c++) {
    d = Math.max(d, Math.abs(a.gain[c] - b.gain[c]), Math.abs(a.lift[c] - b.lift[c]) * 4, Math.abs(a.shadow[c] - b.shadow[c]) * 4, Math.abs(a.high[c] - b.high[c]) * 4);
  }
  return Math.max(d, Math.abs(a.gamma - b.gamma), Math.abs(a.sat - b.sat), Math.abs(a.con - b.con));
}

/* ---------------- the install ---------------- */
const CROWD_CASTERS = /^crowd-(legs|torso|head|hair|bag|dog|car|cabin|wheels)$/;
const PROP_CASTERS = /^props-(solid|roof)$/;

export function installRenderPipeline(world) {
  const scene = world && world.scene;
  const engine = world && world.engine;
  if (!scene || !engine) return null;
  if (scene.metadata && scene.metadata.renderPipeline) return scene.metadata.renderPipeline;
  const stage = world.stage || {};
  const pipeline = stage.pipeline;
  const sun = stage.sun || scene.getLightByName("sun");
  const camera = stage.camera || scene.activeCamera;
  const ipc = pipeline && pipeline.imageProcessing && pipeline.imageProcessing.imageProcessingConfiguration;
  const nullEngine = engine.getClassName() === "NullEngine";
  const cfg = window.DAY_CONFIG || {};
  const skyCfg = cfg.sky || {};
  const parse = (s, d) => (window.DayEngine ? window.DayEngine.parseClock(s) / 60 : d);
  const sunrise = parse(skyCfg.sunrise || "7:05", 7.083);
  const sunset = parse(skyCfg.sunset || "18:25", 18.416);

  const state = {
    quality: "high",
    lutSize: 0,
    lut: null,
    bakes: 0,
    tw: { dawn: 0, noon: 1, golden: 0, dusk: 0, night: 0 },
    ow: { storm: 0, fog: 0, sunbreak: 0 },
    grade: blendGrade({ noon: 1 }, null),
    baked: null,
    lastBake: -1e9,
    fade: 1.3, // seconds: the grade is 95% there after about 4 s
    errors: [],
    cascades: 0,
    mapSize: 0,
    moon: 0,
  };
  const fail = (what, e) => {
    state.errors.push(what + ": " + ((e && e.message) || e));
    try { console.warn("[render-pipeline] " + what, e); } catch (x) { /* no console */ }
  };

  const lowNow = () => {
    try {
      const l = scene.metadata && scene.metadata.dayLook;
      if (l) return l.quality() === "low";
    } catch (e) { /* look isn't up */ }
    return false;
  };
  const clockHour = () => {
    try {
      const n = window.day && window.day.now && window.day.now();
      if (n && typeof n.minutes === "number") return (((n.minutes % 1440) + 1440) % 1440) / 60;
    } catch (e) { /* the day isn't up yet */ }
    return 12;
  };

  /* ---------- colour grade ---------- */
  function makeLut(size) {
    if (nullEngine || !B.RawTexture3D || !ipc) return null;
    try {
      const data = bakeLut(state.grade, size);
      const tex = new B.RawTexture3D(data, size, size, size, B.Engine.TEXTUREFORMAT_RGBA, scene, false, false, B.Texture.BILINEAR_SAMPLINGMODE, B.Engine.TEXTURETYPE_UNSIGNED_BYTE);
      tex.wrapU = B.Texture.CLAMP_ADDRESSMODE;
      tex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
      tex.wrapR = B.Texture.CLAMP_ADDRESSMODE;
      tex.level = 1;
      tex.name = "grade-lut";
      state.lutData = data;
      return tex;
    } catch (e) {
      fail("grade LUT", e);
      return null;
    }
  }
  function useLut(size) {
    if (state.lutSize === size && state.lut) return;
    const old = state.lut;
    state.lutSize = size;
    state.lut = makeLut(size);
    state.baked = state.lut ? { ...state.grade } : null;
    if (ipc) {
      ipc.colorGradingTexture = state.lut || null;
      ipc.colorGradingEnabled = !!state.lut;
    }
    if (old) old.dispose();
    state.bakes++;
  }
  function rebake(now) {
    if (!state.lut || !state.lutData) return;
    if (state.baked && gradeDistance(state.baked, state.grade) < 0.002) return;
    if (now - state.lastBake < 90) return;
    state.lastBake = now;
    bakeLut(state.grade, state.lutSize, state.lutData);
    state.lut.update(state.lutData);
    state.baked = JSON.parse(JSON.stringify(state.grade));
    state.bakes++;
  }

  /* ---------- shadows ---------- */
  let csm = null;
  const registered = new Set();
  function buildShadows(low) {
    if (!sun || nullEngine || !B.CascadedShadowGenerator) return;
    try {
      const mapSize = low ? 1024 : 2048;
      if (csm && csm.getShadowMap && state.mapSize === mapSize) {
        csm.numCascades = low ? 1 : 2;
        state.cascades = csm.numCascades;
        configureCsm(low);
        return;
      }
      const old = stage.shadows;
      let carry = old && old.getShadowMap && old.getShadowMap() ? old.getShadowMap().renderList.slice() : [];
      if (low) carry = carry.filter((m) => !/^(crowd-|block-|city-)/.test(m.name || "")); // the phone's pass: him, the neighbours, props and what world.js listed
      if (csm) csm.dispose();
      else if (old) old.dispose();
      Object.keys(groups).forEach((k) => (groups[k] = 0));
      csm = new B.CascadedShadowGenerator(mapSize, sun);
      csm.numCascades = low ? 1 : 2;
      csm.autoCalcDepthBounds = false;
      csm.stabilizeCascades = true;
      csm.depthClamp = true;
      csm.cascadeBlendPercentage = 0.1;
      csm.lambda = 0.8;
      csm.bias = 0.0008;
      csm.normalBias = 0.04;
      csm.darkness = 0.3;
      configureCsm(low);
      registered.clear();
      const seen = new Set();
      carry.forEach((m) => {
        if (seen.has(m)) return;
        seen.add(m);
        csm.addShadowCaster(m, false);
        registered.add(m);
      });
      state.mapSize = mapSize;
      state.cascades = csm.numCascades;
      if (stage.setShadows) stage.setShadows(csm);
    } catch (e) {
      fail("cascaded shadows", e);
    }
  }
  function configureCsm(low) {
    csm.shadowMaxZ = low ? 70 : 120;
    csm.usePercentageCloserFiltering = true;
    csm.filteringQuality = low ? B.ShadowGenerator.QUALITY_LOW : B.ShadowGenerator.QUALITY_MEDIUM;
    csm.freezeShadowCastersBoundingInfo = false;
  }

  /* what casts: his proxy (world.js adds it), the neighbours, the crowd, rooftop props and (high) the block shells
     and facade chunks; what receives: the props and the city's facades. New arrivals join through scene add events (see drainPending). */
  const groups = { player: 0, neighbours: 0, crowd: 0, props: 0, buildings: 0, other: 0 };
  function isNeighbourPart(m) {
    for (let p = m.parent; p; p = p.parent) if (/^neighbor-/.test(p.name || "")) return true;
    return false;
  }
  /* what one mesh is: "props" | "crowd" | "buildings" | "neighbours" | "player" | null, and whether it takes shadows */
  function classify(m, low) {
    const n = m.name || "";
    if (PROP_CASTERS.test(n)) return { group: "props", recv: true };
    if (n === "props-flat" || n === "props-glow") return { group: null, recv: true };
    if (!low && CROWD_CASTERS.test(n)) return { group: "crowd", recv: false };
    if (!low && (/^block-/.test(n) || /^city-(brick|concrete|glass|stone)-/.test(n))) return { group: "buildings", recv: true };
    if (/^city-/.test(n) && n !== "city-skyline" && n !== "city-beacons" && n !== "city-base") return { group: null, recv: true };
    if (n === "playerShadowProxy") return { group: "player", recv: false };
    if (m.getTotalVertices && m.getTotalVertices() > 0 && isNeighbourPart(m)) return { group: "neighbours", recv: true };
    return null;
  }
  function register(m, low, g, list) {
    if (!m || registered.has(m) || !m.getTotalVertices) return false;
    const c = classify(m, low);
    if (!c) return false;
    if (c.group) {
      registered.add(m);
      if (!list.includes(m)) g.addShadowCaster(m, false);
      groups[c.group]++;
    }
    if (c.recv) m.receiveShadows = true;
    return true;
  }
  /* the first pass (and a quality change): everything that is there now, before the loading warm-up compiles it */
  function scanCasters(low) {
    const g = stage.shadows;
    const sm = g && g.getShadowMap && g.getShadowMap();
    if (!sm) return;
    const list = sm.renderList;
    scene.meshes.forEach((m) => register(m, low, g, list));
  }
  /* anything that arrives later (people, props, the model, neighbours) is queued by the scene's own add events, no
     polling: its shadow-depth and lit shaders compile first, and only then does it join the shadow map. */
  const pending = [];
  let compiling = false;
  scene.onNewMeshAddedObservable.add((m) => { if (m && m.getTotalVertices) pending.push(m); });
  function drainPending() {
    if (compiling || !pending.length) return;
    const g = stage.shadows;
    const sm = g && g.getShadowMap && g.getShadowMap();
    if (!sm) return;
    const low = state.quality === "low";
    const batch = pending.splice(0, pending.length).filter((m) => !m.isDisposed() && !registered.has(m) && classify(m, low));
    if (!batch.length) return;
    const add = () => {
      const list = sm.renderList;
      batch.forEach((m) => { if (!m.isDisposed()) register(m, low, g, list); });
    };
    if (nullEngine || !g.forceCompilationAsync) { add(); return; }
    compiling = true;
    // compile the depth shader for these meshes on a scratch list, then add them; the lit materials compile with them
    const real = sm.renderList;
    const done = () => { compiling = false; add(); };
    try {
      sm.renderList = batch.filter((m) => m.getTotalVertices() > 0);
      const jobs = [g.forceCompilationAsync().catch(() => {})];
      batch.forEach((m) => { if (m.material && m.material.forceCompilationAsync) jobs.push(m.material.forceCompilationAsync(m).catch(() => {})); });
      sm.renderList = real;
      Promise.all(jobs).then(done, done);
    } catch (e) {
      sm.renderList = real;
      done();
    }
  }

  /* ---------- SSAO2 (high only) ---------- */
  let ssao = null;
  function wantSsao(on) {
    if (nullEngine || !B.SSAO2RenderingPipeline) return;
    if (!on) {
      if (ssao) { try { ssao.dispose(); } catch (e) { /* gone */ } ssao = null; }
      return;
    }
    if (ssao) return;
    try {
      ssao = new B.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera], false);
      ssao.radius = 1.6; // metres: roof edges, AC units, kerbs
      ssao.totalStrength = 0.85;
      ssao.base = 0.12;
      ssao.samples = 16;
      ssao.maxZ = 90;
      ssao.minZAspect = 0.4;
      ssao.expensiveBlur = false;
    } catch (e) {
      ssao = null;
      fail("SSAO2", e);
    }
  }

  /* ---------- SSR on wet streets (desktop high only; phones use a reflection probe) ---------- */
  let ssr = null;
  let ssrOn = false;
  function wantSsr(on) {
    if (nullEngine) return;
    if (!on) {
      if (ssr) {
        try { ssr.dispose(); } catch (e) { /* */ }
        ssr = null;
      }
      ssrOn = false;
      return;
    }
    if (ssr) { ssrOn = true; return; }
    try {
      if (!B.SSRRenderingPipeline) { ssrOn = false; return; }
      ssr = new B.SSRRenderingPipeline("wet-ssr", scene, [camera], false); // geometry-buffer off: uses the scene's depth
      ssr.strength = 0.9;
      ssr.reflectionSpecularFalloffExponent = 2.2;
      ssr.roughnessFactor = 0.14;
      ssr.step = 0.1;
      ssr.maxSteps = 28;
      ssr.maxDistance = 80;
      ssr.selfCollisionNumSkip = 2;
      ssr.enableAutomaticThicknessComputation = false;
      ssr.thickness = 0.35;
      ssr.blurDispersionStrength = 0.04;
      ssr.enableSmoothReflections = true;
      ssrOn = true;
    } catch (e) {
      ssr = null;
      ssrOn = false;
      fail("SSR", e);
    }
  }

  /* ---------- the finish: bloom, FXAA, aberration, vignette ---------- */
  function applyFinish(low) {
    if (!pipeline) return;
    pipeline.bloomEnabled = !low; // phone: no bloom pass
    pipeline.bloomThreshold = 0.9; // emissives (windows, neon, bolts, seams, the cast glow); the sky and lit walls stay under it
    pipeline.bloomKernel = low ? 16 : 24;
    pipeline.bloomScale = 0.5; // half-res
    pipeline.fxaaEnabled = !low;
    pipeline.samples = 1;
    try {
      pipeline.chromaticAberrationEnabled = !low;
      if (!low && pipeline.chromaticAberration) {
        pipeline.chromaticAberration.aberrationAmount = 7;
        pipeline.chromaticAberration.radialIntensity = 0.9;
      }
    } catch (e) { fail("chromatic aberration", e); }
    if (pipeline.imageProcessing) {
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
      pipeline.imageProcessing.contrast = 1.04; // the grade carries the contrast
      pipeline.imageProcessing.vignetteEnabled = !low;
      pipeline.imageProcessing.vignetteWeight = 1.05;
    }
  }

  function applyQuality(low) {
    state.quality = low ? "low" : "high";
    applyFinish(low);
    useLut(low ? 16 : 32);
    buildShadows(low);
    scanCasters(low);
    wantSsao(!low);
    wantSsr(!low);
  }

  /* ---------- the moon: a cool key light with shadows when the sun is gone ---------- */
  const moonDir = new B.Vector3(0.42, -0.78, 0.46).normalize();
  const moonCol = new B.Color3(0.56, 0.66, 0.95);
  const tmpDir = new B.Vector3();

  let lastLow = lowNow();
  let lastClock = null;
  let jumpUntil = 0;
  let t0 = typeof performance !== "undefined" ? performance.now() : 0;
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0.001, (engine.getDeltaTime ? engine.getDeltaTime() : 16) / 1000));
    const low = lowNow();
    if (low !== lastLow) {
      lastLow = low;
      applyQuality(low);
    }
    // the grade: time-of-day blend and weather overlays follow their targets
    const hour = clockHour();
    if (lastClock != null) {
      let d = Math.abs(hour - lastClock);
      if (d > 12) d = 24 - d;
      if (d > 0.05) jumpUntil = now + 1400; // a scrub or a jump: crossfade lighting (~0.7 s), never a hard step
    }
    lastClock = hour;
    const tT = timeWeights(hour, sunrise, sunset);
    let oT = { storm: 0, fog: 0, sunbreak: 0 };
    try { oT = overlayWeights(window.weather && window.weather.now ? window.weather.now() : null); } catch (e) { /* not up */ }
    const k = 1 - Math.exp(-dt / (now < jumpUntil ? 0.7 : state.fade));
    for (const n of TOD) state.tw[n] += (tT[n] - state.tw[n]) * k;
    for (const n of OVERLAY_NAMES) state.ow[n] += (oT[n] - state.ow[n]) * k;
    state.target = tT;
    state.grade = blendGrade(state.tw, state.ow);
    rebake(now);

    // the moon takes the sun's place in the night
    const night = state.tw.night;
    if (sun && night > 0.02) {
      const sunK = Math.min(1, sun.intensity / 0.2);
      const m = night * (1 - sunK);
      const cover = oT.storm * 0.7;
      state.moon = m * (1 - cover);
      if (m > 0.01) {
        sun.intensity = Math.max(sun.intensity, 0.2 * state.moon);
        B.Color3.LerpToRef(sun.diffuse, moonCol, m, sun.diffuse);
        B.Vector3.LerpToRef(sun.direction, moonDir, m, tmpDir);
        tmpDir.normalize();
        sun.direction.copyFrom(tmpDir);
      }
    } else state.moon = 0;

    drainPending();
  });

  applyQuality(lastLow);

  const api = {
    /** Active effects, the LUTs, the current grade and the shadow casters. */
    info() {
      const low = state.quality === "low";
      const g = stage.shadows;
      const list = g && g.getShadowMap && g.getShadowMap() ? g.getShadowMap().renderList : [];
      const dom = (o) => Object.keys(o).reduce((a, b) => (o[b] > o[a] ? b : a));
      const overlay = dom({ none: 0.12, storm: state.ow.storm, fog: state.ow.fog, sunbreak: state.ow.sunbreak });
      const tod = dom(state.tw);
      const effects = [];
      if (ipc && ipc.toneMappingEnabled) effects.push("tonemap");
      if (ipc && ipc.colorGradingEnabled && state.lut) effects.push("grade-lut");
      if (pipeline && pipeline.bloomEnabled) effects.push("bloom");
      if (csm) effects.push("cascaded-shadows");
      if (ssao) effects.push("ssao2");
      if (ssrOn) effects.push("ssr");
      if (pipeline && pipeline.fxaaEnabled) effects.push("fxaa");
      if (pipeline && pipeline.imageProcessing && pipeline.imageProcessing.vignetteEnabled) effects.push("vignette");
      if (pipeline && pipeline.chromaticAberrationEnabled) effects.push("chromatic-aberration");
      return {
        quality: state.quality,
        effects,
        ssr: ssrOn,
        tonemapping: ipc && ipc.toneMappingEnabled ? (ipc.toneMappingType === B.ImageProcessingConfiguration.TONEMAPPING_ACES ? "ACES" : "other") : "off",
        exposure: ipc ? Number(ipc.exposure.toFixed(3)) : null,
        bloom: pipeline ? { enabled: !!pipeline.bloomEnabled, threshold: pipeline.bloomThreshold, scale: pipeline.bloomScale, kernel: pipeline.bloomKernel, source: "emissives" } : null,
        luts: LUT_NAMES.slice(),
        lutCount: LUT_NAMES.length,
        lut: { name: overlay === "none" ? tod : tod + "+" + overlay, timeOfDay: tod, overlay, size: state.lutSize, bakes: state.bakes, on: !!(ipc && ipc.colorGradingEnabled && state.lut), weights: { ...state.tw, ...state.ow } },
        grade: JSON.parse(JSON.stringify(state.grade)),
        shadows: {
          generator: csm ? "cascaded" : g ? "single" : "none",
          cascades: state.cascades,
          mapSize: state.mapSize || (g && g.getShadowMap && g.getShadowMap() ? g.getShadowMap().getSize().width : 0),
          pcf: !!(g && g.usePercentageCloserFiltering),
          casters: list.length,
          groups: { ...groups },
          moon: Number(state.moon.toFixed(2)),
        },
        ssao: !!ssao,
        fxaa: !!(pipeline && pipeline.fxaaEnabled),
        errors: state.errors.slice(),
        skyline: skylineInfo(),
      };
    },
    grade: () => JSON.parse(JSON.stringify(state.grade)),
    /** What the grade does to a colour right now (the playtest compares hours without reading pixels). */
    gradeOf: (rgb) => applyGrade(state.grade, rgb),
    /** The grade the clock and weather are heading for, applied at once (no fade): for the checks. */
    settle() {
      state.tw = { ...timeWeights(clockHour(), sunrise, sunset) };
      try { state.ow = { ...overlayWeights(window.weather && window.weather.now ? window.weather.now() : null) }; } catch (e) { /* not up */ }
      state.grade = blendGrade(state.tw, state.ow);
      state.lastBake = -1e9;
      rebake(performance.now() + 1e6);
      return api.grade();
    },
    setQuality(level) { applyQuality(level === "low"); },
  };

  /* the far towers by day: lit enough to read against the sky, never a black slab (cityscape.js sets the fill; this reads it) */
  function skylineInfo() {
    const m = scene.getMaterialByName("skyline");
    if (!m) return null;
    const fog = scene.fogColor;
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const fill = Math.min(1, lum(m.emissiveColor) + lum(m.diffuseColor) * 0.6);
    return { fill: Number(fill.toFixed(3)), sky: Number(lum(fog).toFixed(3)), ratio: Number((fill / Math.max(0.01, lum(fog))).toFixed(2)) };
  }

  /* No material may ask for more lights than the shader's uniform budget allows (the beta's 'Unable to compile effect' came
     from maxSimultaneousLights 10+ with the prepass and plugins on top). Clamp every material now and every one added
     later (an event, not a poll); a plain default of 4 is under the cap. */
  const LIGHT_CAP = 6;
  const lightCap = { max: LIGHT_CAP, clamped: 0 };
  const clampLights = (m) => {
    if (m && typeof m.maxSimultaneousLights === "number" && m.maxSimultaneousLights > LIGHT_CAP) {
      m.maxSimultaneousLights = LIGHT_CAP; lightCap.clamped++;
      if (m.markAsDirty) m.markAsDirty(B.Material.LightDirtyFlag);
    }
  };
  scene.materials.forEach(clampLights);
  scene.onNewMaterialAddedObservable.add(clampLights);
  api.lightCap = () => {
    scene.materials.forEach(clampLights);
    let worst = 0;
    scene.materials.forEach((m) => { if (typeof m.maxSimultaneousLights === "number") worst = Math.max(worst, m.maxSimultaneousLights); });
    return { max: LIGHT_CAP, worst, clamped: lightCap.clamped, lights: scene.lights.length };
  };

  scene.metadata = scene.metadata || {};
  scene.metadata.renderPipeline = api;
  world.render = api;
  if (window.day) window.day.render = api;
  return api;
}

const live = typeof window !== "undefined" && window.day && window.day.world && window.day.world();
if (live) installRenderPipeline(live);
