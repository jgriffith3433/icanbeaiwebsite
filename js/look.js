/* ==========================================================================
   The city look: Small Weather's Dose Of Destruction art on the district.
   Navy and black, electric blue at night, rain-wet surfaces, daylight that
   stays readable. PBR on the streets and blocks, neon, a sky that blends
   day / dusk / night (the weather system calls setSky), bloom and a quality
   toggle for phones.

   Gen textures land in textures/city/ (hawkes.assets.json). Until that
   manifest exists, the surfaces are painted here so the page isn't flat colour.
   ========================================================================== */
const B = window.BABYLON;

const TILE = 256;
const SKY_W = 512;
const SKY_H = 256;

function mod(a, m) {
  return ((a % m) + m) % m;
}
function hash(ix, iy) {
  let n = Math.imul(ix ^ 0x27d4eb2d, 0x85ebca6b) ^ Math.imul(iy ^ 0x165667b1, 0xc2b2ae35);
  n = Math.imul(n ^ (n >>> 15), n | 1);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
function noise(u, v, period) {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => hash(mod(i, period), mod(j, period));
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(u, v) {
  return noise(u, v, 4) * 0.55 + noise(u, v, 8) * 0.3 + noise(u, v, 16) * 0.15;
}
function wrap01(t) {
  return t - Math.floor(t);
}
function mix(a, b, t) {
  return a + (b - a) * t;
}
function rgb(r, g, b) {
  return { r, g, b };
}
function lerpRgb(a, b, t) {
  return rgb(mix(a.r, b.r, t), mix(a.g, b.g, t), mix(a.b, b.b, t));
}

/* One tile: albedo plus an OpenGL normal (+Y up) from the height. */
function paint(scene, name, size, sample, bump) {
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const H = (u, v) => sample(wrap01(u), wrap01(v)).h;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const c = sample(u, v);
      const i = (y * size + x) * 4;
      albedo[i] = c.r;
      albedo[i + 1] = c.g;
      albedo[i + 2] = c.b;
      albedo[i + 3] = 255;
      const e = 1 / size;
      const dx = (H(u + e, v) - H(u - e, v)) * bump;
      const dy = (H(u, v + e) - H(u, v - e)) * bump;
      const len = Math.hypot(dx, dy, 1);
      normal[i] = (-dx / len) * 127.5 + 127.5;
      normal[i + 1] = (-dy / len) * 127.5 + 127.5;
      normal[i + 2] = (1 / len) * 127.5 + 127.5;
      normal[i + 3] = 255;
    }
  }
  const mk = (data) => {
    const tex = new B.RawTexture(data, size, size, B.Engine.TEXTUREFORMAT_RGBA, scene, false, false, B.Texture.BILINEAR_SAMPLINGMODE);
    tex.wrapU = B.Texture.WRAP_ADDRESSMODE;
    tex.wrapV = B.Texture.WRAP_ADDRESSMODE;
    return tex;
  };
  return { albedo: mk(albedo), normal: mk(normal) };
}

function paintSky(scene, name, sample) {
  const data = new Uint8Array(SKY_W * SKY_H * 4);
  for (let y = 0; y < SKY_H; y++) {
    for (let x = 0; x < SKY_W; x++) {
      const c = sample(x / SKY_W, y / SKY_H);
      const i = (y * SKY_W + x) * 4;
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 255;
    }
  }
  const tex = new B.RawTexture(data, SKY_W, SKY_H, B.Engine.TEXTUREFORMAT_RGBA, scene, false, true, B.Texture.BILINEAR_SAMPLINGMODE);
  tex.wrapU = B.Texture.WRAP_ADDRESSMODE;
  tex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
  tex.name = name;
  return tex;
}

function asphalt(u, v) {
  const n = fbm(u, v);
  const grain = noise(u, v, 32);
  const crack = noise(u * 3.1 + 0.2, v * 0.4, 6) < 0.28 ? 0.72 : 1;
  const wet = noise(u, v, 3);
  const base = lerpRgb(rgb(42, 48, 58), rgb(62, 74, 92), grain);
  const blue = wet > 0.62 ? lerpRgb(base, rgb(70, 110, 150), (wet - 0.62) * 0.8) : base;
  const c = lerpRgb(rgb(28, 32, 40), blue, 0.55 + n * 0.45);
  return { r: c.r * crack, g: c.g * crack, b: c.b * crack, h: n * 0.35 + grain * 0.15 + (crack < 1 ? 0.25 : 0) };
}
function concrete(u, v) {
  const n = fbm(u + 4, v + 2);
  const pit = noise(u, v, 24);
  const stain = noise(u, v, 5);
  const c = lerpRgb(rgb(78, 84, 90), rgb(96, 108, 118), n);
  const wet = stain > 0.6 ? lerpRgb(c, rgb(62, 78, 96), 0.35) : c;
  return { r: wet.r * (0.92 + pit * 0.1), g: wet.g * (0.92 + pit * 0.1), b: wet.b * (0.94 + pit * 0.08), h: n * 0.4 + pit * 0.2 };
}
function brick(u, v) {
  const rows = 8;
  const cols = 4;
  const row = Math.floor(v * rows);
  const uu = wrap01(u + (row % 2) * 0.5);
  const fu = wrap01(uu * cols);
  const fv = wrap01(v * rows);
  const mortar = fu < 0.08 || fv < 0.1;
  const n = noise(u, v, 20);
  const tone = lerpRgb(rgb(78, 52, 56), rgb(96, 64, 62), n);
  const c = mortar ? rgb(58, 62, 70) : tone;
  return { r: c.r, g: c.g, b: c.b, h: mortar ? 0.15 : 0.55 + n * 0.2 };
}
function glass(u, v) {
  const mullion = wrap01(u * 5) < 0.07 || wrap01(v * 8) < 0.06;
  const n = fbm(u, v);
  const pane = lerpRgb(rgb(28, 40, 58), rgb(46, 78, 112), n);
  const c = mullion ? rgb(16, 20, 28) : pane;
  return { r: c.r, g: c.g, b: c.b, h: mullion ? 0.7 : 0.15 + n * 0.1 };
}
function roof(u, v) {
  const n = fbm(u + 1, v + 3);
  const seam = wrap01(u * 4) < 0.04 || wrap01(v * 3) < 0.045;
  const puddle = noise(u, v, 3) > 0.68;
  let c = lerpRgb(rgb(32, 36, 44), rgb(48, 54, 64), n);
  if (puddle) c = lerpRgb(c, rgb(60, 96, 130), 0.45);
  if (seam) c = lerpRgb(c, rgb(20, 22, 28), 0.6);
  return { r: c.r, g: c.g, b: c.b, h: (seam ? 0.2 : 0.45) + n * 0.25 + (puddle ? 0.15 : 0) };
}
function park(u, v) {
  const n = fbm(u + 8, v);
  const blade = noise(u, v, 28);
  const c = lerpRgb(rgb(32, 58, 44), rgb(48, 78, 52), n * 0.7 + blade * 0.3);
  return { r: c.r, g: c.g, b: c.b, h: blade * 0.55 + n * 0.2 };
}

/* v = 0 is the bottom of the panorama, v = 1 the zenith. Horizon sits at 0.42. */
function skyDay(u, v) {
  const zenith = rgb(126, 178, 214);
  const horizon = rgb(214, 228, 236);
  const below = rgb(40, 52, 62);
  const cloud = fbm(u, v * 2);
  let c = v < 0.42 ? lerpRgb(below, horizon, v / 0.42) : lerpRgb(horizon, zenith, (v - 0.42) / 0.58);
  if (v > 0.48 && v < 0.82 && cloud > 0.55) c = lerpRgb(c, rgb(236, 242, 246), (cloud - 0.55) * 1.4);
  return c;
}
function skyDusk(u, v) {
  const zenith = rgb(16, 22, 42);
  const horizon = rgb(214, 122, 78);
  const blue = rgb(36, 64, 120);
  const below = rgb(12, 14, 24);
  const cloud = fbm(u + 0.3, v);
  let c = v < 0.42 ? lerpRgb(below, horizon, v / 0.42) : lerpRgb(lerpRgb(horizon, blue, Math.min(1, (v - 0.42) * 2.2)), zenith, Math.max(0, (v - 0.55) / 0.45));
  if (v > 0.4 && v < 0.7 && cloud > 0.5) c = lerpRgb(c, rgb(232, 150, 96), (cloud - 0.5) * 0.7);
  return c;
}
function skyNight(u, v) {
  const zenith = rgb(6, 8, 16);
  const horizon = rgb(22, 48, 82);
  const below = rgb(4, 6, 12);
  let c = v < 0.42 ? lerpRgb(below, horizon, v / 0.42) : lerpRgb(horizon, zenith, (v - 0.42) / 0.58);
  if (v > 0.55 && hash(Math.floor(u * 180), Math.floor(v * 90)) > 0.997) c = rgb(220, 230, 245);
  return c;
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/* Clock weights. Dawn borrows the dusk colours; noon is all day. */
export function skyWeights(hour, sky) {
  const SR = sky.sunrise;
  const SS = sky.sunset;
  let day = 0;
  let dusk = 0;
  let night = 1;
  if (hour >= SR - 1.2 && hour < SR + 1.1) {
    const up = smoothstep(SR - 0.2, SR + 1.1, hour);
    dusk = smoothstep(SR - 1.2, SR + 0.15, hour) * (1 - up);
    day = up;
    night = Math.max(0, 1 - day - dusk);
  } else if (hour >= SR + 1.1 && hour < SS - 1.15) {
    day = 1;
    night = 0;
  } else if (hour >= SS - 1.15 && hour < SS + 1.7) {
    const into = smoothstep(SS - 1.15, SS + 0.15, hour);
    const down = smoothstep(SS + 0.05, SS + 1.7, hour);
    day = 1 - into;
    night = down;
    dusk = Math.max(0, 1 - day - night);
  }
  const s = day + dusk + night || 1;
  return { day: day / s, dusk: dusk / s, night: night / s };
}

function tileBox(mesh, tile) {
  const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind);
  const nrm = mesh.getVerticesData(B.VertexBuffer.NormalKind);
  if (!pos || !nrm || nrm.length !== pos.length) return;
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0, k = 0; i < pos.length; i += 3, k += 2) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    const ax = Math.abs(nrm[i]);
    const ay = Math.abs(nrm[i + 1]);
    const az = Math.abs(nrm[i + 2]);
    if (ay >= ax && ay >= az) {
      uv[k] = x / tile;
      uv[k + 1] = z / tile;
    } else if (ax >= az) {
      uv[k] = z / tile;
      uv[k + 1] = y / tile;
    } else {
      uv[k] = x / tile;
      uv[k + 1] = y / tile;
    }
  }
  mesh.setVerticesData(B.VertexBuffer.UVKind, uv);
}

function readQuality() {
  try {
    if (typeof location !== "undefined") {
      const q = new URLSearchParams(location.search).get("quality");
      if (q === "low" || q === "high") return q;
    }
  } catch (e) { /* node, or a locked-down page */ }
  try {
    const saved = localStorage.getItem("icanbe.quality");
    if (saved === "low" || saved === "high") return saved;
  } catch (e) { /* no storage */ }
  let narrow = false;
  let coarse = false;
  try { narrow = window.innerWidth <= 700; } catch (e) { /* node */ }
  try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch (e) { /* node */ }
  const mem = typeof navigator !== "undefined" && navigator.deviceMemory;
  if ((mem && mem <= 4) || narrow || coarse) return "low";
  return "high";
}

function clockHour() {
  try {
    const now = window.day && window.day.now && window.day.now();
    if (now && typeof now.minutes === "number") return ((now.minutes % 1440) + 1440) % 1440 / 60;
  } catch (e) { /* the day isn't up yet */ }
  return 12;
}

/**
 * Dress an existing world. Safe to call once; a second call returns the same API.
 * @param {{ scene: import("@babylonjs/core").Scene, engine: import("@babylonjs/core").Engine }} world
 */
export function installLook(world) {
  const scene = world && world.scene;
  const engine = world && world.engine;
  if (!scene || !engine) return null;
  if (scene.metadata && scene.metadata.dayLook) return scene.metadata.dayLook;

  const cfg = window.DAY_CONFIG || {};
  const skyCfg = cfg.sky || {};
  const clock = {
    sunrise: window.DayEngine ? window.DayEngine.parseClock(skyCfg.sunrise || "7:05") / 60 : 7.083,
    sunset: window.DayEngine ? window.DayEngine.parseClock(skyCfg.sunset || "18:25") / 60 : 18.416,
  };
  const blocks = (cfg.city && cfg.city.blocks) || [];

  const pipes = (scene.postProcessRenderPipelineManager && scene.postProcessRenderPipelineManager.supportedPipelines) || [];
  const pipeline = pipes.find((p) => p.name === "look") || pipes[0] || null;
  const glow = (scene.effectLayers || []).find((l) => l.name === "glow") || null;
  const sun = scene.getLightByName("sun");

  if (pipeline && pipeline.bloomWeight != null) {
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.52;
    pipeline.bloomWeight = 0.36;
    pipeline.bloomKernel = 32;
    pipeline.bloomScale = 0.5;
  }

  let source = "procedural";
  const maps = {
    asphalt: paint(scene, "asphalt", TILE, asphalt, 2.2),
    concrete: paint(scene, "concrete", TILE, concrete, 1.6),
    brick: paint(scene, "brick", TILE, brick, 2.4),
    glass: paint(scene, "glass", TILE, glass, 1.1),
    roof: paint(scene, "roof", TILE, roof, 1.5),
    ground: paint(scene, "park", TILE, park, 1.4),
  };
  const skies = {
    day: paintSky(scene, "skyDay", skyDay),
    dusk: paintSky(scene, "skyDusk", skyDusk),
    night: paintSky(scene, "skyNight", skyNight),
  };

  const surfaces = [];
  function pbr(name, tex, opt) {
    const m = new B.PBRMaterial(name, scene);
    m.albedoTexture = tex.albedo;
    m.bumpTexture = tex.normal;
    m.bumpTexture.level = opt.bump == null ? 0.65 : opt.bump;
    m.metallic = opt.metallic || 0;
    m.roughness = opt.roughness == null ? 0.45 : opt.roughness;
    m.usePhysicalLightFalloff = false;
    m.maxSimultaneousLights = 4;
    m.directIntensity = 1.25;
    m.environmentIntensity = 0.7;
    m.reflectionTexture = skies.day;
    if (skies.day) skies.day.coordinatesMode = B.Texture.EQUIRECTANGULAR_MODE;
    if (opt.wet) {
      m.clearCoat.isEnabled = true;
      m.clearCoat.intensity = opt.coat == null ? 0.32 : opt.coat;
      m.clearCoat.roughness = 0.1;
    }
    m.metadata = { wet: !!opt.wet };
    surfaces.push(m);
    return m;
  }
  const mats = {
    asphalt: pbr("asphalt", maps.asphalt, { roughness: 0.32, wet: true, coat: 0.42, bump: 0.45 }),
    concrete: pbr("concrete", maps.concrete, { roughness: 0.4, wet: true, coat: 0.28, bump: 0.4 }),
    brick: pbr("brick", maps.brick, { roughness: 0.72, bump: 0.85 }),
    glass: pbr("glass", maps.glass, { metallic: 0.55, roughness: 0.16, wet: true, coat: 0.55, bump: 0.25 }),
    roof: pbr("roof", maps.roof, { roughness: 0.38, wet: true, coat: 0.36, bump: 0.5 }),
    ground: pbr("park", maps.ground, { roughness: 0.82, bump: 0.55 }),
  };

  function dress(mesh, mat, tile) {
    if (!mesh) return;
    mesh.material = mat;
    mesh.receiveShadows = true;
    if (tile) tileBox(mesh, tile);
  }
  const roadName = (n) => n === "road" || n === "lot" || /^ave\d+r\d+$/.test(n) || /^cross\d+r\d+$/.test(n);
  const walkName = (n) => n === "driveway" || n === "parkpath" || /^walk[SN]\d+$/.test(n) || /^ave[SN]\d+_\d+$/.test(n) || /^cross[WE]\d+_\d+$/.test(n) || /ramp$/.test(n);
  scene.meshes.forEach((mesh) => {
    const n = mesh.name || "";
    if (n === "ground") dress(mesh, mats.ground, 4);
    else if (roadName(n)) dress(mesh, mats.asphalt, 2.4);
    else if (walkName(n)) dress(mesh, mats.concrete, 2.2);
  });
  blocks.forEach((b) => {
    const shell = scene.getMeshByName("block-" + b.id);
    const glassTower = b.h >= 10;
    dress(shell, glassTower ? mats.glass : mats.brick, glassTower ? 3.2 : 2.4);
    const slab = B.MeshBuilder.CreateBox("roof-" + b.id, {
      width: Math.max(1, b.w - 0.7),
      height: 0.04,
      depth: Math.max(1, b.d - 0.7),
    }, scene);
    slab.position.set(b.x, b.h - 0.02, b.z);
    slab.isPickable = false;
    dress(slab, mats.roof, 2.2);
    ["ps", "pn", "pn1", "pn2", "pw", "pe"].forEach((suffix) => {
      const lip = scene.getMeshByName(b.id + suffix);
      if (lip) dress(lip, mats.roof, 1.6);
    });
  });

  const seenCrown = new Set();
  scene.meshes.forEach((m) => {
    if (!m.name || !m.name.startsWith("crown") || !m.material || seenCrown.has(m.material)) return;
    seenCrown.add(m.material);
    const c = m.material.diffuseColor;
    if (!c) return;
    c.r *= 0.55;
    c.g *= 0.75;
    c.b = Math.min(1, c.b * 0.9 + 0.06);
  });

  const neonMats = [];
  const neonHex = ["#3ecbff", "#ff4d8d", "#8eb6ff"];
  blocks.forEach((b, i) => {
    const faceZ = b.z + b.d / 2 + 0.045;
    const y = Math.min(Math.max(2.4, b.h * 0.55), b.h - 0.8);
    const mat = new B.StandardMaterial("neon-" + b.id, scene);
    const base = B.Color3.FromHexString(neonHex[i % neonHex.length]);
    mat.diffuseColor = base.scale(0.2);
    mat.emissiveColor = base.clone();
    mat.specularColor = B.Color3.Black();
    mat.disableLighting = false;
    mat.metadata = { base };
    neonMats.push(mat);
    const w = Math.min(3.4, b.w * 0.38);
    const bar = B.MeshBuilder.CreateBox("neon-" + b.id, { width: w, height: 0.14, depth: 0.05 }, scene);
    bar.position.set(b.x, y, faceZ);
    bar.material = mat;
    bar.isPickable = false;
    const tick = B.MeshBuilder.CreateBox("neon2-" + b.id, { width: w * 0.42, height: 0.1, depth: 0.05 }, scene);
    tick.position.set(b.x - w * 0.18, y - 0.36, faceZ);
    tick.material = mat;
    tick.isPickable = false;
    if (glow) {
      glow.addIncludedOnlyMesh(bar);
      glow.addIncludedOnlyMesh(tick);
    }
  });

  let dome = null;
  let skyMat = null;
  if (engine.getClassName() !== "NullEngine") {
    try {
      skyMat = new B.ShaderMaterial("skyBlend", scene, {
        vertexSource: `
          precision highp float;
          attribute vec3 position;
          uniform mat4 worldViewProjection;
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = worldViewProjection * vec4(position, 1.0);
          }`,
        fragmentSource: `
          precision highp float;
          varying vec3 vPos;
          uniform sampler2D dayTex;
          uniform sampler2D duskTex;
          uniform sampler2D nightTex;
          uniform vec3 weights;
          void main() {
            vec3 dir = normalize(vPos);
            float u = atan(dir.x, dir.z) / 6.28318530718 + 0.5;
            float v = asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265 + 0.5;
            vec3 c = texture2D(dayTex, vec2(u, v)).rgb * weights.x
              + texture2D(duskTex, vec2(u, v)).rgb * weights.y
              + texture2D(nightTex, vec2(u, v)).rgb * weights.z;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }, {
        attributes: ["position"],
        uniforms: ["worldViewProjection", "weights"],
        samplers: ["dayTex", "duskTex", "nightTex"],
      });
      skyMat.backFaceCulling = false;
      skyMat.disableDepthWrite = false;
      skyMat.setTexture("dayTex", skies.day);
      skyMat.setTexture("duskTex", skies.dusk);
      skyMat.setTexture("nightTex", skies.night);
      skyMat.setVector3("weights", new B.Vector3(1, 0, 0));
      dome = B.MeshBuilder.CreateSphere("skyDome", { diameter: 520, segments: 24 }, scene);
      dome.material = skyMat;
      dome.isPickable = false;
      dome.applyFog = false;
      dome.infiniteDistance = false;
      dome.renderingGroupId = 0;
    } catch (e) {
      dome = null;
      skyMat = null;
    }
  }

  let quality = readQuality();
  let override = null;
  const weightVec = new B.Vector3(1, 0, 0);
  let last = { day: 1, dusk: 0, night: 0, exposure: 1.16, neon: 0.2 };

  function weightsNow() {
    const base = skyWeights(clockHour(), clock);
    if (!override) return base;
    return {
      day: override.day != null ? override.day : base.day,
      dusk: override.dusk != null ? override.dusk : base.dusk,
      night: override.night != null ? override.night : base.night,
    };
  }

  function applyQuality(level, via) {
    quality = level === "low" ? "low" : "high";
    const low = quality === "low";
    try { localStorage.setItem("icanbe.quality", quality); } catch (e) { /* private mode */ }
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    engine.setHardwareScalingLevel(low ? 1 : 1 / Math.min(dpr, 1.5));
    if (pipeline) {
      pipeline.bloomEnabled = !low;
      pipeline.samples = low ? 1 : 4;
      pipeline.fxaaEnabled = !low;
    }
    if (sun) sun.shadowEnabled = !low;
    if (glow) {
      glow.intensity = low ? 0.35 : 0.75;
      glow.blurKernelSize = low ? 16 : 48;
    }
    surfaces.forEach((m) => {
      if (m.metadata && m.metadata.wet && m.clearCoat) m.clearCoat.isEnabled = !low;
    });
    const btn = typeof document !== "undefined" && document.getElementById && document.getElementById("quality");
    if (btn) {
      btn.textContent = low ? "Quality: low" : "Quality: high";
      btn.setAttribute("aria-pressed", low ? "true" : "false");
      btn.title = low ? "Smooth on a phone. Click for the full picture." : "Full picture. Click for a smoother phone setting.";
    }
    if (via && window.dispatchEvent) window.dispatchEvent(new CustomEvent("day:quality", { detail: { value: quality, via } }));
  }

  scene.onBeforeRenderObservable.add(() => {
    const w = weightsNow();
    const s = w.day + w.dusk + w.night || 1;
    w.day /= s;
    w.dusk /= s;
    w.night /= s;
    const exposure = override && override.exposure != null ? override.exposure : 1.16 * w.day + 1.02 * w.dusk + 0.88 * w.night;
    const fogDensity = override && override.fogDensity != null ? override.fogDensity : 0.0048 + w.night * 0.0045 + w.dusk * 0.0015;
    if (pipeline && pipeline.imageProcessing) pipeline.imageProcessing.exposure = exposure;
    scene.fogMode = B.Scene.FOGMODE_EXP2;
    scene.fogDensity = fogDensity;
    const horizon = lerpRgb(lerpRgb(rgb(214, 228, 236), rgb(214, 122, 78), w.dusk), rgb(22, 48, 82), w.night);
    // day weight pulls the noon horizon back toward the bright sky when dusk and night are both low
    const dayHorizon = lerpRgb(horizon, rgb(186, 214, 232), w.day);
    if (override && override.fogColor) {
      const col = typeof override.fogColor === "string" ? B.Color3.FromHexString(override.fogColor) : override.fogColor;
      scene.fogColor.copyFrom(col);
    } else {
      scene.fogColor.set(dayHorizon.r / 255, dayHorizon.g / 255, dayHorizon.b / 255);
    }
    scene.clearColor.set(dayHorizon.r / 255, dayHorizon.g / 255, dayHorizon.b / 255, 1);
    if (dome && scene.activeCamera) dome.position.copyFrom(scene.activeCamera.position);
    if (skyMat) {
      weightVec.set(w.day, w.dusk, w.night);
      skyMat.setVector3("weights", weightVec);
    }
    const ibl = 0.35 + w.day * 0.55;
    surfaces.forEach((m) => { m.environmentIntensity = ibl; });
    const neonK = 0.16 + w.dusk * 0.55 + w.night * 1.2;
    neonMats.forEach((m) => {
      const base = m.metadata.base;
      m.emissiveColor.set(base.r * neonK, base.g * neonK, base.b * neonK);
    });
    last = { day: w.day, dusk: w.dusk, night: w.night, exposure, neon: neonK, fogDensity };
  });

  function mountButton() {
    if (!document.body || !document.body.append || !document.createElement) return;
    if (document.getElementById("quality")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "quality";
    btn.className = "quality-btn";
    btn.addEventListener("click", () => {
      applyQuality(quality === "low" ? "high" : "low", "click");
      btn.blur();
    });
    document.body.append(btn);
  }
  mountButton();
  applyQuality(quality);

  function loadGen() {
    if (typeof fetch !== "function" || typeof document === "undefined" || !document.baseURI) return;
    let url;
    try { url = new URL("textures/city/manifest.json", document.baseURI).href; } catch (e) { return; }
    fetch(url).then((res) => (res.ok ? res.json() : null)).then((man) => {
      if (!man) return;
      const tex = (file) => {
        const t = new B.Texture(file, scene, false, false, B.Texture.TRILINEAR_SAMPLINGMODE);
        t.wrapU = B.Texture.WRAP_ADDRESSMODE;
        t.wrapV = B.Texture.WRAP_ADDRESSMODE;
        return t;
      };
      Object.keys(mats).forEach((key) => {
        const spec = man[key];
        if (!spec || !spec.albedo) return;
        const m = mats[key];
        m.albedoTexture = tex(spec.albedo);
        if (spec.normal) {
          m.bumpTexture = tex(spec.normal);
          m.bumpTexture.level = m.bumpTexture.level || 0.6;
        }
        if (spec.roughness) {
          m.metallicTexture = tex(spec.roughness);
          m.useRoughnessFromMetallicTextureGreen = true;
          m.useMetallnessFromMetallicTextureBlue = false;
          m.roughness = 1;
        }
      });
      if (man.sky && skyMat) {
        if (man.sky.day) skyMat.setTexture("dayTex", tex(man.sky.day));
        if (man.sky.dusk) skyMat.setTexture("duskTex", tex(man.sky.dusk));
        if (man.sky.night) skyMat.setTexture("nightTex", tex(man.sky.night));
        if (man.sky.day) {
          const env = tex(man.sky.day);
          env.coordinatesMode = B.Texture.EQUIRECTANGULAR_MODE;
          surfaces.forEach((m) => { m.reflectionTexture = env; });
        }
      }
      source = "gen";
    }).catch(() => { /* stand-ins stay until the textures are published */ });
  }
  loadGen();

  const api = {
    quality(level) {
      if (level == null) return quality;
      applyQuality(level, "api");
      return quality;
    },
    /** Weather blend. Pass a partial ({ day, dusk, night, fogDensity, fogColor, exposure }) or null to follow the clock. */
    setSky(partial) {
      override = partial || null;
    },
    skyAt(hour) {
      return skyWeights(hour, clock);
    },
    info() {
      return {
        quality,
        source,
        pbr: surfaces.length,
        textured: surfaces.filter((m) => !!m.albedoTexture).length,
        neon: neonMats.length,
        bloom: !!(pipeline && pipeline.bloomEnabled),
        shadows: !!(sun && sun.shadowEnabled),
        samples: pipeline ? pipeline.samples : 0,
        exposure: last.exposure,
        neonLevel: last.neon,
        sky: { day: last.day, dusk: last.dusk, night: last.night },
        scaling: engine.getHardwareScalingLevel(),
        dome: !!dome,
      };
    },
  };
  scene.metadata = scene.metadata || {};
  scene.metadata.dayLook = api;
  world.look = api;
  if (window.day) window.day.look = api;
  return api;
}

const live = window.day && window.day.world && window.day.world();
if (live) installLook(live);
