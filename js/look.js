/* ==========================================================================
   The city look: Small Weather's Dose Of Destruction art on the district.
   Navy and black, electric blue at night, rain-wet surfaces, daylight that
   stays readable. PBR on the streets and blocks, neon, a procedural sky dome
   that blends day / dusk / night and weather state (weather.js calls setSky),
   controlled bloom on emissives, and a quality toggle for phones.
   ========================================================================== */
const B = window.BABYLON;

const TILE = 64;

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
  const e = 1 / size;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const c = sample(u, v);
      const i = (y * size + x) * 4;
      albedo[i] = c.r;
      albedo[i + 1] = c.g;
      albedo[i + 2] = c.b;
      albedo[i + 3] = 255;
      const dx = (H(u + e, v) - H(u - e, v)) * bump;
      const dy = (H(u, v + e) - H(u, v - e)) * bump;
      const invLen = 127.5 / Math.hypot(dx, dy, 1);
      normal[i] = -dx * invLen + 127.5;
      normal[i + 1] = -dy * invLen + 127.5;
      normal[i + 2] = invLen + 127.5;
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

/* Cohesive dark navy-slate asphalt, concrete, brick, glass, roof, and park turf —
   no harsh bathroom-tile grid lines or dry neon blotches. */
function asphalt(u, v) {
  const n = fbm(u, v);
  const grain = noise(u, v, 16);
  const c = lerpRgb(rgb(30, 34, 42), rgb(44, 50, 62), n * 0.6 + grain * 0.4);
  return { r: c.r, g: c.g, b: c.b, h: n * 0.25 + grain * 0.15 };
}
function concrete(u, v) {
  const n = fbm(u + 4, v + 2);
  const pit = noise(u, v, 16);
  const c = lerpRgb(rgb(66, 72, 80), rgb(82, 89, 98), n * 0.65 + pit * 0.35);
  return { r: c.r, g: c.g, b: c.b, h: n * 0.3 + pit * 0.15 };
}
function brick(u, v) {
  const rows = 8;
  const cols = 4;
  const row = Math.floor(v * rows);
  const uu = wrap01(u + (row % 2) * 0.5);
  const fu = wrap01(uu * cols);
  const fv = wrap01(v * rows);
  const mortar = fu < 0.08 || fv < 0.1;
  const n = noise(u, v, 16);
  const tone = lerpRgb(rgb(72, 48, 52), rgb(88, 58, 58), n);
  const c = mortar ? rgb(50, 54, 62) : tone;
  return { r: c.r, g: c.g, b: c.b, h: mortar ? 0.18 : 0.52 + n * 0.18 };
}
function glass(u, v) {
  const mullion = wrap01(u * 4) < 0.06 || wrap01(v * 6) < 0.05;
  const n = fbm(u, v);
  const pane = lerpRgb(rgb(22, 32, 48), rgb(36, 56, 82), n);
  const c = mullion ? rgb(14, 18, 26) : pane;
  return { r: c.r, g: c.g, b: c.b, h: mullion ? 0.6 : 0.15 + n * 0.08 };
}
function roof(u, v) {
  const n = fbm(u + 1, v + 3);
  const grain = noise(u, v, 12);
  const c = lerpRgb(rgb(28, 32, 40), rgb(40, 46, 56), n * 0.65 + grain * 0.35);
  return { r: c.r, g: c.g, b: c.b, h: 0.35 + n * 0.2 + grain * 0.1 };
}
function park(u, v) {
  const n = fbm(u + 8, v);
  const blade = noise(u, v, 16);
  const c = lerpRgb(rgb(30, 52, 40), rgb(44, 70, 48), n * 0.7 + blade * 0.3);
  return { r: c.r, g: c.g, b: c.b, h: blade * 0.4 + n * 0.2 };
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

function autoQuality() {
  let narrow = false;
  let coarse = false;
  try { narrow = window.innerWidth <= 700; } catch (e) { /* node */ }
  try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch (e) { /* node */ }
  const mem = typeof navigator !== "undefined" && navigator.deviceMemory;
  if ((mem && mem <= 4) || narrow || coarse) return "low";
  return "high";
}

/** url, a saved choice, or the phone auto-pick (narrow, coarse pointer, or <= 4 GB). */
function classifyQuality() {
  try {
    if (typeof location !== "undefined") {
      const q = new URLSearchParams(location.search).get("quality");
      if (q === "low" || q === "high") return { level: q, how: "url" };
    }
  } catch (e) { /* node, or a locked-down page */ }
  try {
    const saved = localStorage.getItem("icanbe.quality");
    if (saved === "low" || saved === "high") return { level: saved, how: "saved" };
  } catch (e) { /* no storage */ }
  return { level: autoQuality(), how: "auto" };
}

let qualityPick = { level: "high", how: "auto" };
function readQuality() {
  qualityPick = classifyQuality();
  return qualityPick.level;
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
    pipeline.bloomThreshold = 0.88;
    pipeline.bloomWeight = 0.16;
    pipeline.bloomKernel = 24;
    pipeline.bloomScale = 0.5;
  }

  let source = "procedural";
  const maps = {
    asphalt: paint(scene, "asphalt", TILE, asphalt, 1.4),
    concrete: paint(scene, "concrete", TILE, concrete, 1.1),
    brick: paint(scene, "brick", TILE, brick, 1.8),
    glass: paint(scene, "glass", TILE, glass, 0.8),
    roof: paint(scene, "roof", TILE, roof, 1.0),
    ground: paint(scene, "park", TILE, park, 1.1),
  };

  const surfaces = [];
  function pbr(name, tex, opt) {
    const m = new B.PBRMaterial(name, scene);
    m.albedoTexture = tex.albedo;
    m.bumpTexture = tex.normal;
    m.bumpTexture.level = opt.bump == null ? 0.45 : opt.bump;
    m.metallic = opt.metallic || 0;
    const dryRough = opt.roughness == null ? 0.84 : opt.roughness;
    m.roughness = dryRough;
    m.useRoughnessFromMetallicTextureAlpha = false;
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = false;
    m.usePhysicalLightFalloff = false;
    m.maxSimultaneousLights = 4;
    m.directIntensity = 1.0;
    m.environmentIntensity = 0.45;
    if (opt.wet) {
      m.clearCoat.isEnabled = false;
      m.clearCoat.intensity = 0;
      m.clearCoat.roughness = 0.18;
    }
    m.metadata = { wet: !!opt.wet, dryRough, maxCoat: opt.coat == null ? 0.45 : opt.coat };
    surfaces.push(m);
    return m;
  }
  const mats = {
    asphalt: pbr("asphalt", maps.asphalt, { roughness: 0.84, wet: true, coat: 0.55, bump: 0.35 }),
    concrete: pbr("concrete", maps.concrete, { roughness: 0.86, wet: true, coat: 0.38, bump: 0.32 }),
    brick: pbr("brick", maps.brick, { roughness: 0.88, bump: 0.65 }),
    glass: pbr("glass", maps.glass, { metallic: 0.35, roughness: 0.24, wet: true, coat: 0.45, bump: 0.2 }),
    roof: pbr("roof", maps.roof, { roughness: 0.85, wet: true, coat: 0.42, bump: 0.35 }),
    ground: pbr("park", maps.ground, { roughness: 0.9, bump: 0.45 }),
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
    else if (roadName(n)) dress(mesh, mats.asphalt, 2.8);
    else if (walkName(n)) dress(mesh, mats.concrete, 2.4);
  });
  // Weather (js/weather.js) wets stage.road; point it at the visible PBR asphalt, not the old StandardMaterial.
  if (world.stage) world.stage.road = mats.asphalt;
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
    dress(slab, mats.roof, 2.8);
    ["ps", "pn", "pn1", "pn2", "pw", "pe"].forEach((suffix) => {
      const lip = scene.getMeshByName(b.id + suffix);
      if (lip) dress(lip, mats.roof, 2.0);
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

  /* Seamless procedural sky dome: zero equirectangular wrap seam, zero underground white pole,
     and smooth horizon blend into scene.fogColor. */
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
          uniform vec3 weights;
          uniform vec3 horizonColor;
          uniform vec3 skyTint;
          uniform vec4 weather;

          float hash2(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
          }
          float noise2(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash2(i + vec2(0.0, 0.0)), hash2(i + vec2(1.0, 0.0)), u.x),
              mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }
          float fbm2(vec2 p) {
            float v = 0.0;
            v += 0.55 * noise2(p);
            v += 0.30 * noise2(p * 2.13 + vec2(3.7, 1.9));
            v += 0.15 * noise2(p * 4.27 + vec2(7.1, 5.3));
            return v;
          }

          void main() {
            vec3 dir = normalize(vPos);
            float h = clamp(dir.y, -1.0, 1.0);
            float up = max(0.0, h);

            vec3 dayZen = vec3(0.24, 0.44, 0.68);
            vec3 dayMid = vec3(0.46, 0.64, 0.80);
            vec3 duskZen = vec3(0.06, 0.09, 0.20);
            vec3 duskMid = vec3(0.76, 0.42, 0.28);
            vec3 nightZen = vec3(0.025, 0.038, 0.08);
            vec3 nightMid = vec3(0.06, 0.12, 0.22);

            vec3 zen = dayZen * weights.x + duskZen * weights.y + nightZen * weights.z;
            vec3 mid = dayMid * weights.x + duskMid * weights.y + nightMid * weights.z;
            vec3 sky = mix(mid, zen, smoothstep(0.04, 0.72, up));

            float cover = clamp(weather.x, 0.0, 1.0);
            float storm = clamp(weather.y, 0.0, 1.0);
            float flash = clamp(weather.z, 0.0, 1.0);
            float t = weather.w;

            sky = mix(sky, skyTint * 0.88, cover * 0.65);

            if (up > 0.01) {
              vec2 cloudUv = dir.xz / (up + 0.38) * 1.6 + vec2(t * 0.018, t * 0.008);
              float n = fbm2(cloudUv);
              float thresh = mix(0.58, 0.25, cover);
              float cMask = smoothstep(thresh, thresh + 0.28, n) * smoothstep(0.02, 0.22, up);
              vec3 cLight = mix(vec3(0.78, 0.83, 0.88), vec3(0.84, 0.54, 0.38), weights.y);
              cLight = mix(cLight, vec3(0.10, 0.15, 0.24), weights.z);
              vec3 cStorm = mix(vec3(0.26, 0.31, 0.38), vec3(0.11, 0.15, 0.22), storm);
              vec3 cCol = mix(cLight, cStorm, cover * 0.85);
              float rim = smoothstep(0.48, 0.72, n) * (storm * 0.35 + flash * 0.75);
              cCol += vec3(0.35, 0.68, 1.0) * rim;
              sky = mix(sky, cCol, cMask * (0.35 + cover * 0.55));
            }

            if (weights.z > 0.25 && up > 0.15 && cover < 0.75) {
              vec2 starCell = floor(dir.xz / (up + 0.25) * 90.0);
              float s = hash2(starCell);
              if (s > 0.9965) {
                float twinkle = 0.6 + 0.4 * sin(t * 2.5 + s * 400.0);
                sky += vec3(0.55, 0.68, 0.88) * twinkle * weights.z * (1.0 - cover) * smoothstep(0.15, 0.4, up);
              }
            }

            float horBlend = smoothstep(-0.04, 0.22, h);
            vec3 finalCol = mix(horizonColor, sky, horBlend);
            gl_FragColor = vec4(finalCol, 1.0);
          }`,
      }, {
        attributes: ["position"],
        uniforms: ["worldViewProjection", "weights", "horizonColor", "skyTint", "weather"],
      });
      skyMat.backFaceCulling = false;
      skyMat.disableDepthWrite = false;
      skyMat.setVector3("weights", new B.Vector3(1, 0, 0));
      skyMat.setVector3("horizonColor", new B.Vector3(0.5, 0.62, 0.74));
      skyMat.setVector3("skyTint", new B.Vector3(0.5, 0.62, 0.74));
      skyMat.setVector4("weather", new B.Vector4(0, 0, 0, 0));
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
  const fogVec = new B.Vector3(0.5, 0.62, 0.74);
  const clearVec = new B.Vector3(0.5, 0.62, 0.74);
  const weatherVec = new B.Vector4(0, 0, 0, 0);
  let skyTime = 0;
  let last = { day: 1, dusk: 0, night: 0, exposure: 0.94, neon: -1 };
  let lastWet = -1;
  let lastIbl = -1;
  let lastLow = null;
  scene.fogMode = B.Scene.FOGMODE_EXP2;

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
      pipeline.samples = 1;
      pipeline.fxaaEnabled = !low;
    }
    if (sun) sun.shadowEnabled = !low;
    if (glow) {
      glow.intensity = low ? 0.35 : 0.55;
      glow.blurKernelSize = 16;
    }
    surfaces.forEach((m) => {
      if (m.metadata && m.metadata.wet && m.clearCoat) {
        const wet = (override && override.wet != null) ? override.wet : 0;
        const want = !low && wet > 0.06;
        if (m.clearCoat.isEnabled !== want) m.clearCoat.isEnabled = want;
      }
    });
    const btn = typeof document !== "undefined" && document.getElementById && document.getElementById("quality");
    if (btn) {
      btn.textContent = low ? "Quality: low" : "Quality: high";
      btn.setAttribute("aria-pressed", low ? "true" : "false");
      btn.title = low ? "Smooth on a phone. Click for the full picture." : "Full picture. Click for a smoother phone setting.";
    }
    if (via === "click" || via === "api") qualityPick = { level: quality, how: "saved" };
    if (via && window.dispatchEvent) window.dispatchEvent(new CustomEvent("day:quality", { detail: { value: quality, via } }));
  }

  scene.onBeforeRenderObservable.add(() => {
    const w = weightsNow();
    const s = w.day + w.dusk + w.night || 1;
    w.day /= s;
    w.dusk /= s;
    w.night /= s;
    const defaultExp = 0.94 * w.day + 0.85 * w.dusk + 0.78 * w.night;
    const exposure = override && override.exposure != null ? override.exposure : defaultExp;
    const fogDensity = override && override.fogDensity != null ? override.fogDensity : 0.0045 + w.night * 0.0038 + w.dusk * 0.0015;
    if (pipeline && pipeline.imageProcessing) {
      const safeExp = Math.abs(exposure - 1) < 1e-4 ? 1.0002 : exposure;
      const ipc = pipeline.imageProcessing.imageProcessingConfiguration;
      if (ipc && ipc._exposure != null) {
        ipc._exposure = safeExp;
        if (scene.imageProcessingConfiguration) scene.imageProcessingConfiguration._exposure = safeExp;
      } else if (Math.abs(pipeline.imageProcessing.exposure - safeExp) > 0.01) {
        pipeline.imageProcessing.exposure = safeExp;
      }
    }
    scene.fogDensity = fogDensity;
    const horizon = lerpRgb(lerpRgb(rgb(168, 192, 212), rgb(196, 112, 74), w.dusk), rgb(18, 36, 62), w.night);
    const dayHorizon = lerpRgb(horizon, rgb(156, 186, 208), w.day);
    if (override && override.fogColor) {
      const col = typeof override.fogColor === "string" ? B.Color3.FromHexString(override.fogColor) : override.fogColor;
      scene.fogColor.copyFrom(col);
    } else {
      scene.fogColor.set(dayHorizon.r / 255, dayHorizon.g / 255, dayHorizon.b / 255);
    }
    if (override && override.clearColor) {
      const cc = override.clearColor;
      scene.clearColor.set(cc.r, cc.g, cc.b, 1);
    } else {
      scene.clearColor.set(dayHorizon.r / 255, dayHorizon.g / 255, dayHorizon.b / 255, 1);
    }
    if (dome && scene.activeCamera) dome.position.copyFrom(scene.activeCamera.position);
    if (skyMat) {
      weightVec.set(w.day, w.dusk, w.night);
      skyMat.setVector3("weights", weightVec);
      fogVec.set(scene.fogColor.r, scene.fogColor.g, scene.fogColor.b);
      skyMat.setVector3("horizonColor", fogVec);
      clearVec.set(scene.clearColor.r, scene.clearColor.g, scene.clearColor.b);
      skyMat.setVector3("skyTint", clearVec);
      const cover = override && override.cover != null ? override.cover : 0;
      const storm = override && override.storm != null ? override.storm : 0;
      const flash = override && override.flash != null ? override.flash : 0;
      skyTime += (engine.getDeltaTime ? engine.getDeltaTime() : 16) * 0.001;
      weatherVec.set(cover, storm, flash, skyTime);
      skyMat.setVector4("weather", weatherVec);
    }
    const wet = override && override.wet != null ? override.wet : 0;
    const low = quality === "low";
    const ibl = 0.28 + w.day * 0.34;
    if (Math.abs(wet - lastWet) > 0.01 || Math.abs(ibl - lastIbl) > 0.01 || low !== lastLow) {
      lastWet = wet;
      lastIbl = ibl;
      lastLow = low;
      surfaces.forEach((m) => {
        m.environmentIntensity = ibl;
        const meta = m.metadata || {};
        if (meta.wet && m !== mats.asphalt) {
          const dryRough = meta.dryRough != null ? meta.dryRough : 0.85;
          m.roughness = Math.max(0.22, dryRough - wet * 0.52);
          if (m.clearCoat) {
            const wantCoat = !low && wet > 0.06;
            if (m.clearCoat.isEnabled !== wantCoat) m.clearCoat.isEnabled = wantCoat;
            m.clearCoat.intensity = wet * (meta.maxCoat || 0.42);
            m.clearCoat.roughness = 0.14 + (1 - wet) * 0.16;
          }
        }
      });
    }
    const neonK = 0.22 + w.dusk * 0.72 + w.night * 1.38 + (override && override.storm ? override.storm * 0.45 : 0);
    if (Math.abs(neonK - last.neon) > 0.005) {
      neonMats.forEach((m) => {
        const base = m.metadata.base;
        m.emissiveColor.set(base.r * neonK, base.g * neonK, base.b * neonK);
      });
    }
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
  if (world.freezeStaticMeshes) world.freezeStaticMeshes();

  const api = {
    quality(level) {
      if (level == null) return quality;
      applyQuality(level, "api");
      return quality;
    },
    /** Weather blend. Pass a partial ({ day, dusk, night, fogDensity, fogColor, clearColor, exposure, cover, wet, storm, flash }) or null to follow the clock. */
    setSky(partial) {
      override = partial || null;
    },
    skyAt(hour) {
      return skyWeights(hour, clock);
    },
    info() {
      return {
        quality,
        qualityHow: qualityPick.how,
        auto: autoQuality(),
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
