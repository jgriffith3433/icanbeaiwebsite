/* Heavy rain that is wet: splashes and ripples on every surface, curtains on the skyline, water on the windows,
   drips off gutters and awnings, drops on the lens, and a thicker air (J, 2026-11-11; The Last of Us Part II's
   Seattle downpour is the reference).

   js/weather.js keeps the sky, the road, the sound and the falling streaks (GPU particles stretched along their
   velocity and bent by the wind; its rain budget is `streakBudget` here). This module is everything the rain does
   when it arrives. It only reads `weather.now()` (rain, wind, manual) and the camera, and draws on top:

   - a HEIGHT MAP of the district (`createHeightMap`: every solid's top, 6 m cells, read at one point): a drop that
     lands is found by one lookup, never a per-drop ray or a physics body. Each landing is a ripple ring (an
     expanding flat quad, one dynamic mesh) and, on hard things (roofs, car roofs, umbrellas, his shoulders), a
     crown of 3 droplets thrown up (billboard quads, one more mesh). Puddles get the big slow rings.
   - CURTAINS: 3 open cylinders at 56, 84 and 118 m (2 on low), inward-facing, a streaky alpha map scrolling down
     and downwind, kept under the cloud deck; they follow the camera and don't take fog (they are the fog).
   - WATER ON THE WINDOWS: a material plugin on the facade, shopfront and skyline materials; runnels run down the
     wall in world space (`wrAmt` is the rain, 0 dry, so the compile happens once at load).
   - DRIPS: from roof edges (gutters) near him and from the shop awnings, falling to the ground and ringing it.
   - LENS: a 2D canvas over the picture. Drops bead (grow), then slide with a trail and clear; they come most when
     the camera is level or looks up into the rain, and wipe away when it looks down. None on low quality.
   - HEIGHT FOG: heavy rain thickens the scene's fog (`fogBoost`), so the far end of the avenue goes soft.

   `day.rain.info()`: { rain, hits: { ripples, splashes, kinds }, curtains, drips, lens, window, fog, streaks }.
   Pure parts (budget, height map, lens step, fog) are checked by scripts/check-rain.mjs under `npm test`. */

export const RAIN_BUDGET = {
  high: { hits: 150, spawn: 120, drips: 40, curtains: 3, lens: 56, streaks: 9000 },
  low: { hits: 44, spawn: 34, drips: 12, curtains: 2, lens: 0, streaks: 4000 }, // phone: at most 4000 streak particles, no lens drops
};
export const REACH = 15; // metres around the camera where drops land
export const CURTAIN_R = [56, 84, 118];

export function budget(quality) {
  return quality === "low" ? RAIN_BUDGET.low : RAIN_BUDGET.high;
}

/** Streak particles alive at once for an emit rate and mean lifetime, kept inside the quality's cap. */
export function streakBudget(quality) {
  return budget(quality).streaks;
}
export function streakRate(rate, life, quality) {
  return Math.min(rate, streakBudget(quality) / Math.max(0.05, life));
}

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Extra fog multiplier for heavy rain: 1 up to a shower, 1.7 in a downpour. */
export function fogBoost(rain, wind) {
  return 1 + 0.7 * sstep(0.45, 1, rain || 0) + 0.15 * sstep(0.5, 1, wind || 0) * sstep(0.3, 0.8, rain || 0);
}
/** About how far you see through EXP2 fog of this density (metres; the 5% contrast distance). */
export function visibilityM(density) {
  return Math.sqrt(3) / Math.max(1e-4, density);
}
/** How much of the skyline curtain shows: none in a drizzle, full in a downpour. */
export function curtainAlpha(rain) {
  return 0.46 * sstep(0.12, 0.85, rain || 0);
}

/** A cheap deterministic generator (the rain looks the same on every machine). */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/* ---------------- the height map ---------------- */

/**
 * Tops of the district's solids on a grid. `at(x, z)` = { y, roof, solid }: the highest top under the point
 * (the ground from `groundAt` when nothing is over it). `roof` is true on a building's roof (top >= 3 m).
 */
export function createHeightMap(getSolids, groundAt, cell) {
  const C = cell || 6;
  let grid = new Map();
  let built = -1;
  const key = (i, j) => i * 100003 + j;
  function build() {
    const solids = getSolids() || [];
    grid = new Map();
    for (let n = 0; n < solids.length; n++) {
      const s = solids[n];
      if (!s || s.h < 0.15 || (s.w < 0.7 && s.d < 0.7) || s.roll || s.pitch) continue;
      const r = Math.hypot(s.w, s.d) / 2;
      for (let i = Math.floor((s.x - r) / C); i <= Math.floor((s.x + r) / C); i++) {
        for (let j = Math.floor((s.z - r) / C); j <= Math.floor((s.z + r) / C); j++) {
          const k = key(i, j);
          let a = grid.get(k);
          if (!a) grid.set(k, (a = []));
          a.push(s);
        }
      }
    }
    built = solids.length;
  }
  function at(x, z) {
    if (built !== (getSolids() || []).length) build();
    let y = groundAt ? groundAt(x, z) : 0;
    let roof = false;
    let solid = false;
    const a = grid.get(key(Math.floor(x / C), Math.floor(z / C)));
    if (a) {
      for (let n = 0; n < a.length; n++) {
        const s = a[n];
        let dx = x - s.x;
        let dz = z - s.z;
        if (s.yaw) { const c = Math.cos(-s.yaw), sn = Math.sin(-s.yaw); const rx = dx * c - dz * sn; dz = dx * sn + dz * c; dx = rx; }
        if (Math.abs(dx) > s.w / 2 || Math.abs(dz) > s.d / 2) continue;
        const top = s.y + s.h / 2;
        if (top > y) { y = top; solid = true; roof = top >= 3; }
      }
    }
    return { y, roof, solid };
  }
  return { at, rebuild: build, cells: () => grid.size };
}

/* ---------------- the lens ---------------- */

/** One drop on the glass: beads (grows) for `bead` s, then slides down (accelerating, wobbling) with a trail. */
export function spawnLensDrop(rng, w, h) {
  const r = 3 + rng() * 7;
  return { x: rng() * w, y: rng() * h * 0.85, r: 0.8, rMax: r, age: 0, bead: 0.3 + rng() * 0.5, vy: 0, wob: rng() * 6.28, trail: [], sliding: false, gone: false };
}
/** Advance a drop; `clear` (0..1) wipes the glass (looking down): drops slide faster and fade. Returns the drop's alpha. */
export function stepLensDrop(d, dt, h, clear) {
  d.age += dt;
  if (d.age < d.bead) {
    d.r = Math.min(d.rMax, d.r + (d.rMax - d.r) * Math.min(1, dt * 7));
  } else {
    d.sliding = true;
    d.vy += (120 + d.rMax * 38 + clear * 400) * dt;
    d.vy = Math.min(d.vy, 420 + clear * 500);
    d.y += d.vy * dt;
    d.x += Math.sin(d.wob + d.y * 0.045) * dt * 9;
    d.r = Math.max(1.4, d.r - dt * 0.45);
    d.trail.push(d.x, d.y);
    if (d.trail.length > 28) d.trail.splice(0, 2);
    if (d.y - d.r > h + 6) d.gone = true;
  }
  return Math.max(0, 1 - clear * 0.7 - (d.sliding ? Math.max(0, (d.y - h * 0.7) / (h * 0.5)) : 0));
}

/** Drops per second for the rain, the camera's pitch (forward y) and the quality's cap. */
export function lensRate(rain, forwardY, cap) {
  if (!cap) return 0;
  const facing = 0.25 + 0.75 * sstep(-0.25, 0.0, forwardY); // level or up = all of it, looking down = a quarter
  return 11 * sstep(0.2, 0.8, rain || 0) * facing;
}

/* ---------------- a batch of quads in one dynamic mesh ---------------- */

/**
 * `max` quads in one mesh with vertex colours: flat (lying on a surface) or billboard (facing the camera).
 * begin(); flat()/billboard() ...; end(). One draw call for any number of hits.
 */
export function createQuadBatch(B, scene, name, max, material) {
  const pos = new Float32Array(max * 12);
  const col = new Float32Array(max * 16);
  const uv = new Float32Array(max * 8);
  const idx = new Uint32Array(max * 6);
  for (let i = 0; i < max; i++) {
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
  }
  const mesh = new B.Mesh(name, scene);
  const vd = new B.VertexData();
  vd.positions = pos;
  vd.colors = col;
  vd.uvs = uv;
  vd.indices = idx;
  vd.applyToMesh(mesh, true);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.setBoundingInfo(new B.BoundingInfo(new B.Vector3(-1e4, -1e4, -1e4), new B.Vector3(1e4, 1e4, 1e4)));
  mesh.doNotSyncBoundingInfo = true;
  let n = 0;
  let prev = 0;
  const put = (a, b, c, d, r, g, bl, al) => {
    if (n >= max) return false;
    pos.set(a, n * 12);
    pos.set(b, n * 12 + 3);
    pos.set(c, n * 12 + 6);
    pos.set(d, n * 12 + 9);
    for (let k = 0; k < 4; k++) { col[n * 16 + k * 4] = r; col[n * 16 + k * 4 + 1] = g; col[n * 16 + k * 4 + 2] = bl; col[n * 16 + k * 4 + 3] = al; }
    n++;
    return true;
  };
  return {
    mesh,
    begin() { n = 0; },
    count: () => n,
    /** A square of half-size `s` lying flat at (x, y, z). */
    flat(x, y, z, s, r, g, b, a) {
      return put([x - s, y, z - s], [x + s, y, z - s], [x + s, y, z + s], [x - s, y, z + s], r, g, b, a);
    },
    /** A quad facing the camera (right and up are its unit axes), w wide and h tall, centred. */
    billboard(x, y, z, w, h, right, up, r, g, b, a) {
      const rx = right.x * w / 2, ry = right.y * w / 2, rz = right.z * w / 2;
      const ux = up.x * h / 2, uy = up.y * h / 2, uz = up.z * h / 2;
      return put([x - rx - ux, y - ry - uy, z - rz - uz], [x + rx - ux, y + ry - uy, z + rz - uz], [x + rx + ux, y + ry + uy, z + rz + uz], [x - rx + ux, y - ry + uy, z - rz + uz], r, g, b, a);
    },
    end() {
      for (let i = n; i < prev; i++) { pos.fill(0, i * 12, i * 12 + 12); col.fill(0, i * 16, i * 16 + 16); }
      prev = n;
      mesh.updateVerticesData(B.VertexBuffer.PositionKind, pos);
      mesh.updateVerticesData(B.VertexBuffer.ColorKind, col);
      mesh.setEnabled(n > 0);
    },
  };
}

/* ---------------- the page ---------------- */

export function startRain(world, dayApi) {
  const day = dayApi || window.day;
  const B = window.BABYLON;
  if (!world) world = day && day.world && day.world();
  if (!world || !world.scene || world.__rain) return world && world.__rain;
  const scene = world.scene;
  const weather = window.weather || (day && day.weather);
  if (!weather || !B) return null;
  const rng = makeRng(20261111);
  const lowQ = () => !!(world.look && world.look.quality && world.look.quality() === "low") || (typeof window !== "undefined" && window.innerWidth <= 860 && window.innerHeight <= 440);
  const hmap = createHeightMap(() => world.solids, (x, z) => (world.surfaceAt ? world.surfaceAt(x, z) : 0.06));
  const st = {
    rain: 0, wind: 0, hits: [], drops: [], drips: [], spawnAcc: 0, dripAcc: 0, lensAcc: 0,
    made: { ripples: 0, splashes: 0 }, kinds: { ground: 0, roof: 0, puddle: 0, car: 0, umbrella: 0, shoulder: 0 },
    lens: { drops: [], spawned: 0, cleared: 0, w: 0, h: 0, ctx: null, el: null, facing: 0 },
    fogMul: 1, windowOn: false, curtainsShown: 0, awnings: [], awnT: -1, edgeT: 0, edges: [], puddleT: -9, puddleRects: [], windT: 0,
    afterLeft: 0, // Sun-break aftermath: gutters keep dripping after the rain stops (js/aftermath.js)
  };

  /* ---- materials: a soft ring, a dot, and the rain's streaky curtain ---- */
  function canvasTex(name, size, draw) {
    try {
      const t = new B.DynamicTexture(name, size, scene, true);
      const c = t.getContext();
      c.clearRect(0, 0, size, size);
      draw(c, size);
      t.hasAlpha = true;
      t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE;
      t.update();
      return t;
    } catch (e) { return null; }
  }
  const ringTex = canvasTex("rain-ring", 64, (c, s) => {
    c.strokeStyle = "rgba(255,255,255,0.95)";
    c.lineWidth = 3;
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 2;
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.28, 0, Math.PI * 2); c.stroke();
  });
  const dotTex = canvasTex("rain-dot", 32, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const drawCurtain = (c, s) => {
    const r = makeRng(55);
    for (let i = 0; i < 150; i++) {
      const x = r() * s, len = 20 + r() * 60, y = r() * s, a = 0.1 + r() * 0.32;
      const g = c.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, "rgba(220,232,250,0)"); g.addColorStop(0.5, `rgba(220,232,250,${a})`); g.addColorStop(1, "rgba(220,232,250,0)");
      c.fillStyle = g; c.fillRect(x, y, 1 + r() * 1.5, len);
      if (y + len > s) { c.fillStyle = g; c.save(); c.translate(0, -s); c.fillRect(x, y, 1.5, len); c.restore(); }
    }
    for (let i = 0; i < 8; i++) { // slow gusts in the sheet
      const x = r() * s, w = 14 + r() * 26;
      c.fillStyle = "rgba(200,214,236,0.08)"; c.fillRect(x, 0, w, s);
    }
  };
  const curtainTex = canvasTex("rain-curtain", 128, drawCurtain);
  function flatMat(name, tex, zo) {
    const m = new B.StandardMaterial(name, scene);
    m.disableLighting = true;
    m.emissiveColor = new B.Color3(1, 1, 1);
    m.specularColor = new B.Color3(0, 0, 0);
    m.diffuseTexture = tex;
    m.useAlphaFromDiffuseTexture = true;
    m.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    m.disableDepthWrite = true;
    m.backFaceCulling = false;
    m.fogEnabled = false;
    m.zOffset = zo;
    return m;
  }
  const rippleB = ringTex ? createQuadBatch(B, scene, "rain-ripples", RAIN_BUDGET.high.hits, flatMat("rain-ripple-mat", ringTex, -3)) : null;
  const splashB = dotTex ? createQuadBatch(B, scene, "rain-splashes", RAIN_BUDGET.high.hits * 3 + RAIN_BUDGET.high.drips, flatMat("rain-splash-mat", dotTex, -1)) : null;
  [rippleB, splashB].forEach((b) => b && b.mesh.setEnabled(false));

  /* ---- curtains ---- */
  const curtains = [];
  if (curtainTex) {
    CURTAIN_R.forEach((r, i) => {
      const m = B.MeshBuilder.CreateCylinder("rain-curtain-" + i, { diameter: r * 2, height: 64, tessellation: 40, subdivisions: 8, cap: B.Mesh.NO_CAP, sideOrientation: B.Mesh.BACKSIDE, updatable: true }, scene);
      { // fade the sheet out at the top and the foot: alpha by height
        const p = m.getVerticesData(B.VertexBuffer.PositionKind);
        const cols = new Float32Array((p.length / 3) * 4);
        for (let k = 0; k < p.length / 3; k++) {
          const u = (p[k * 3 + 1] + 32) / 64;
          cols.set([1, 1, 1, Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.6)], k * 4);
        }
        m.setVerticesData(B.VertexBuffer.ColorKind, cols);
        m.hasVertexAlpha = true;
      }
      const mat = new B.StandardMaterial("rain-curtain-mat-" + i, scene);
      const tx = canvasTex("rain-curtain-" + i, 128, drawCurtain);
      tx.uScale = 9 + i * 3; tx.vScale = 1.6;
      mat.disableLighting = true;
      mat.emissiveColor = new B.Color3(0.62, 0.7, 0.82);
      mat.opacityTexture = tx;
      mat.alpha = 0;
      mat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
      mat.disableDepthWrite = true;
      mat.backFaceCulling = true;
      mat.fogEnabled = false;
      m.material = mat;
      m.isPickable = false;
      m.setEnabled(false);
      m.alwaysSelectAsActiveMesh = true;
      curtains.push({ mesh: m, tex: tx, r, speed: 0.55 + i * 0.22 });
    });
  }

  /* ---- water on the windows: a plugin on the facade, shopfront and skyline materials ---- */
  const wr = { amt: 0, time: 0, hooked: 0, ok: false };
  try {
    if (B.MaterialPluginBase) {
      class WindowRain extends B.MaterialPluginBase {
        constructor(material) {
          super(material, "WindowRain", 210, { WINDOW_RAIN: false }, true, true);
        }
        getClassName() { return "WindowRain"; }
        isCompatible(shaderLanguage) { return shaderLanguage === B.ShaderLanguage.GLSL; }
        prepareDefines(defines) { defines.WINDOW_RAIN = true; }
        getUniforms() {
          return { ubo: [{ name: "wrAmt", size: 1, type: "float" }, { name: "wrTime", size: 1, type: "float" }], fragment: "#ifdef WINDOW_RAIN\nuniform float wrAmt;\nuniform float wrTime;\n#endif" };
        }
        bindForSubMesh(ub) { ub.updateFloat("wrAmt", wr.amt); ub.updateFloat("wrTime", wr.time); }
        getCustomCode(shaderType) {
          if (shaderType !== "fragment") return null;
          return {
            CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef WINDOW_RAIN
if (wrAmt > 0.02) {
  float along = vPositionW.x * 0.9 + vPositionW.z * 0.9;
  float col = floor(along * 5.0);
  float h1 = fract(sin(col * 12.9898) * 43758.5453);
  float h2 = fract(sin(col * 78.233 + 3.1) * 12345.678);
  float xin = abs(fract(along * 5.0) - 0.5 - (h2 - 0.5) * 0.3);
  float run = fract(wrTime * (0.07 + h1 * 0.13) + h2 * 7.0);
  float fall = fract((vPositionW.y * 0.16) + run);
  float head = smoothstep(0.0, 0.05, fall) * (1.0 - smoothstep(0.05, 0.6, fall));
  float line = (1.0 - smoothstep(0.015, 0.05 + h1 * 0.03, xin)) * step(0.35, h1);
  float film = (0.5 + 0.5 * sin(vPositionW.y * 6.0 + along * 3.0 + wrTime * 0.6)) * 0.04;
  float w = (line * head + film) * wrAmt;
  color.rgb = mix(color.rgb, color.rgb * 0.6 + vec3(0.16, 0.2, 0.27), clamp(w, 0.0, 0.8));
}
#endif`,
          };
        }
      }
      scene.materials.forEach((m) => {
        if (m && /^(facade-|shopfront|skyline)/.test(m.name) && m.getClassName && m.getClassName() === "StandardMaterial") {
          try { new WindowRain(m); wr.hooked++; } catch (e) { /* this one stays dry */ }
        }
      });
      wr.ok = wr.hooked > 0;
    }
  } catch (e) { wr.ok = false; }

  /* ---- lens canvas ---- */
  function ensureLens() {
    const L = st.lens;
    if (L.el || typeof document === "undefined" || !document.body) return L.el;
    const el = document.createElement("canvas");
    el.id = "rain-lens";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    L.el = el;
    L.ctx = el.getContext && el.getContext("2d");
    return el;
  }
  function sizeLens() {
    const L = st.lens;
    if (!L.el) return;
    const w = Math.max(2, Math.round(window.innerWidth / 2)), h = Math.max(2, Math.round(window.innerHeight / 2)); // half size, stretched by css
    if (L.w !== w || L.h !== h) { L.el.width = w; L.el.height = h; L.w = w; L.h = h; }
  }
  function drawLens(dt, rain, fy, on) {
    const L = st.lens;
    const cap = on ? budget("high").lens : 0;
    if (!cap) {
      if (L.drops.length || (L.el && L.el.style.display !== "none")) { L.drops.length = 0; if (L.ctx) L.ctx.clearRect(0, 0, L.w, L.h); if (L.el) L.el.style.display = "none"; }
      return;
    }
    if (!ensureLens() || !L.ctx) return;
    sizeLens();
    const clear = sstep(-0.3, -0.7, fy); // looking well down wipes the glass
    L.facing = Math.round((0.25 + 0.75 * sstep(-0.25, 0, fy)) * 100) / 100;
    L.lensAcc = (L.lensAcc || 0) + lensRate(rain, fy, cap) * dt;
    while (L.lensAcc >= 1 && L.drops.length < cap) { L.lensAcc -= 1; L.drops.push(spawnLensDrop(rng, L.w, L.h)); L.spawned++; }
    if (L.lensAcc > 3) L.lensAcc = 0;
    if (!L.drops.length) { if (L.el.style.display !== "none") { L.ctx.clearRect(0, 0, L.w, L.h); L.el.style.display = "none"; } return; }
    L.el.style.display = "block";
    const c = L.ctx;
    c.clearRect(0, 0, L.w, L.h);
    for (let i = L.drops.length - 1; i >= 0; i--) {
      const d = L.drops[i];
      const a = stepLensDrop(d, dt, L.h, clear);
      if (d.gone || a <= 0.02) { L.drops.splice(i, 1); L.cleared++; continue; }
      if (d.trail.length > 4) {
        c.strokeStyle = `rgba(200,220,245,${(0.2 * a).toFixed(3)})`;
        c.lineWidth = Math.max(1, d.r * 0.5);
        c.beginPath(); c.moveTo(d.trail[0], d.trail[1]);
        for (let k = 2; k < d.trail.length; k += 2) c.lineTo(d.trail[k], d.trail[k + 1]);
        c.stroke();
      }
      const g = c.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.1, d.x, d.y, d.r);
      g.addColorStop(0, `rgba(235,244,255,${(0.5 * a).toFixed(3)})`);
      g.addColorStop(0.7, `rgba(150,178,215,${(0.2 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(20,34,56,${(0.38 * a).toFixed(3)})`);
      c.fillStyle = g;
      c.beginPath(); c.ellipse(d.x, d.y, d.r, d.r * (d.sliding ? 1.25 : 1), 0, 0, Math.PI * 2); c.fill();
    }
  }

  /* ---- drip sources ---- */
  const RZ = (window.DAY_CONFIG && window.DAY_CONFIG.street && window.DAY_CONFIG.street.z) || 12.6;
  function refreshSources() {
    st.edges = ((window.DAY_CONFIG && window.DAY_CONFIG.city && window.DAY_CONFIG.city.blocks) || []).map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h }));
    st.awnings = [];
    const m = scene.getMeshByName("weather-awnings");
    if (m && m.thinInstanceGetWorldMatrices) {
      m.thinInstanceGetWorldMatrices().forEach((mt) => {
        const t = mt.getTranslation();
        st.awnings.push({ x: t.x, y: t.y, z: t.z, dz: RZ > t.z ? 0.575 : -0.575 });
      });
    }
    st.puddleRects = scene.meshes.filter((q) => /^(roof-)?puddle\d/.test(q.name) || /^roof-puddle-/.test(q.name)).map((q) => q);
  }

  const right = new B.Vector3(1, 0, 0);
  const up = new B.Vector3(0, 1, 0);
  const tmp = new B.Vector3();
  function addHit(x, y, z, kind, big) {
    const q = lowQ() ? RAIN_BUDGET.low : RAIN_BUDGET.high;
    if (st.hits.length >= q.hits) return;
    const hard = kind !== "puddle";
    st.hits.push({ x, y, z, kind, age: 0, life: kind === "puddle" ? 1.1 : 0.55 + rng() * 0.35, size: (big ? 0.5 : 0.28) * (0.8 + rng() * 0.5), crown: hard && kind !== "ground" ? 3 : (rng() < 0.4 ? 2 : 0), seed: rng() * 6.28 });
    st.made.ripples++;
    st.kinds[kind]++;
  }
  function focus() {
    const cam = scene.activeCamera;
    if (!cam) return null;
    const p = cam.target || cam.position;
    return { x: p.x, y: p.y, z: p.z, cam };
  }
  function control() {
    const C = day && day.control;
    if (!C || !C.mode || C.mode() !== "control" || !C.state) return null;
    return C.state();
  }
  function spawnHits(n, f) {
    const crowd = day && day.crowd && day.crowd.positions ? day.crowd.positions() : null;
    const ctl = control();
    for (let i = 0; i < n; i++) {
      const roll = rng();
      if (ctl && roll < 0.07) { // his shoulders
        const side = rng() < 0.5 ? -1 : 1;
        const yaw = ctl.yaw || 0;
        addHit(ctl.x + Math.cos(yaw) * 0.22 * side, (ctl.y || 0) + 1.42, ctl.z - Math.sin(yaw) * 0.22 * side, "shoulder", false);
      } else if (crowd && roll < 0.13 && crowd.cars.length) { // a car roof
        const c = crowd.cars[Math.floor(rng() * crowd.cars.length)];
        if (Math.hypot(c.x - f.x, c.z - f.z) < REACH + 4) addHit(c.x + (rng() - 0.5) * 1.2, 1.38, c.z + (rng() - 0.5) * 1.6, "car", false);
      } else if (crowd && roll < 0.19 && crowd.people.length) { // an umbrella
        const p = crowd.people[Math.floor(rng() * crowd.people.length)];
        if (Math.hypot(p.x - f.x, p.z - f.z) < REACH + 4) addHit(p.x + (rng() - 0.5) * 0.7, 2.0, p.z + (rng() - 0.5) * 0.7, "umbrella", false);
      } else if (roll < 0.3 && st.puddleRects.length) { // a puddle
        const m = st.puddleRects[Math.floor(rng() * st.puddleRects.length)];
        if (m.isEnabled() && Math.abs(m.position.x - f.x) < REACH + 6 && Math.abs(m.position.z - f.z) < REACH + 6) {
          addHit(m.position.x + (rng() - 0.5) * 1.8, m.position.y + 0.012, m.position.z + (rng() - 0.5) * 1.0, "puddle", true);
        }
      } else {
        const a = rng() * Math.PI * 2, r = REACH * Math.sqrt(rng());
        const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
        const h = hmap.at(x, z);
        addHit(x, h.y + 0.012, z, h.roof ? "roof" : "ground", false);
      }
    }
  }
  function spawnDrips(n, f) {
    const q = lowQ() ? RAIN_BUDGET.low : RAIN_BUDGET.high;
    for (let i = 0; i < n && st.drips.length < q.drips; i++) {
      let x, y, z;
      if (st.awnings.length && rng() < 0.5) {
        const a = st.awnings[Math.floor(rng() * st.awnings.length)];
        x = a.x + (rng() - 0.5) * 2.4; y = a.y - 0.08; z = a.z + a.dz;
      } else if (st.edges.length) {
        const b = st.edges[Math.floor(rng() * st.edges.length)];
        if (!(b.h > 3) || Math.abs(b.x - f.x) > 40 || Math.abs(b.z - f.z) > 40) continue;
        const sideZ = rng() < 0.5 ? -1 : 1;
        x = b.x + (rng() - 0.5) * b.w; z = b.z + sideZ * (b.d / 2 + 0.12); y = b.h - 0.08;
      } else continue;
      if (Math.hypot(x - f.x, z - f.z) > 30) continue;
      st.drips.push({ x, y, z, v: 0, ground: hmap.at(x, z).y + 0.012 });
    }
  }

  function frame(dt) {
    if (!(dt > 0)) return;
    const wn = weather.now();
    const rain = wn.rain || 0;
    st.rain = rain;
    st.wind = wn.wind || 0;
    st.windT += dt;
    const low = lowQ();
    const q = low ? RAIN_BUDGET.low : RAIN_BUDGET.high;
    const f = focus();
    const indoors = !!(f && world.indoorsAt && world.indoorsAt(f.x, f.z));
    const active = rain > 0.06 && !indoors && !!f;
    if (st.afterLeft > 0) st.afterLeft = Math.max(0, st.afterLeft - dt);
    const dripping = (active || st.afterLeft > 0) && !indoors && !!f;

    /* height fog: heavy rain closes the avenue in */
    const boost = active ? fogBoost(rain, st.wind) : 1;
    st.fogMul += (boost - st.fogMul) * (1 - Math.exp(-dt / 1.4));
    if (st.fogMul > 1.002) scene.fogDensity *= st.fogMul; // weather.js sets the base density again every frame
    wr.amt += ((active ? Math.min(1, rain * 1.25) : 0) - wr.amt) * (1 - Math.exp(-dt / 2.5));
    wr.time += dt;

    /* the camera's pitch and axes */
    let fy = 0;
    if (f) {
      const fw = f.cam.getForwardRay ? f.cam.getForwardRay(1).direction : null;
      if (fw) fy = fw.y;
      f.cam.getDirectionToRef(B.Axis.X, right);
      f.cam.getDirectionToRef(B.Axis.Y, up);
    }
    drawLens(dt, active ? rain : 0, fy, active && !low);

    /* curtains */
    st.curtainsShown = 0;
    curtains.forEach((c, i) => {
      const on = active && i < q.curtains;
      c.mesh.setEnabled(on);
      if (!on) return;
      c.mesh.position.set(f.x, Math.max(0, f.y - 10) + 32, f.z);
      c.mesh.material.alpha += (curtainAlpha(rain) * (1 - i * 0.18) - c.mesh.material.alpha) * (1 - Math.exp(-dt / 1.2));
      c.tex.vOffset -= dt * c.speed; // the sheet runs down
      c.tex.uOffset += dt * 0.012 * (1 + st.wind * 3) * (i % 2 ? -1 : 1);
      if (c.mesh.material.alpha > 0.04) st.curtainsShown++;
    });

    /* hits: ripples, crowns, drips (after-drip keeps gutters going through a Sun-break clearing) */
    if (st.edgeT <= 0) { st.edgeT = 20; refreshSources(); }
    st.edgeT -= dt;
    if (active) {
      st.spawnAcc += q.spawn * Math.min(1, rain * 1.1) * dt;
      const n = Math.min(20, Math.floor(st.spawnAcc));
      st.spawnAcc -= n;
      if (n > 0) spawnHits(n, f);
      st.dripAcc += (q.drips * 0.5 * Math.min(1, rain)) * dt;
      const dn = Math.floor(st.dripAcc);
      st.dripAcc -= dn;
      if (dn > 0) spawnDrips(dn, f);
    } else if (dripping) {
      st.spawnAcc = 0;
      const afterK = Math.min(1, st.afterLeft / 12);
      st.dripAcc += (q.drips * 0.45 * afterK) * dt;
      const dn = Math.floor(st.dripAcc);
      st.dripAcc -= dn;
      if (dn > 0) spawnDrips(dn, f);
    } else { st.spawnAcc = 0; st.dripAcc = 0; }

    for (let i = st.drips.length - 1; i >= 0; i--) {
      const d = st.drips[i];
      d.v += 9.8 * dt;
      d.y -= d.v * dt;
      if (d.y <= d.ground || !dripping) { if (dripping) addHit(d.x, d.ground, d.z, "ground", false); st.drips.splice(i, 1); }
    }
    for (let i = st.hits.length - 1; i >= 0; i--) {
      const h = st.hits[i];
      h.age += dt;
      if (h.age >= h.life) {
        st.hits.splice(i, 1);
        continue;
      }
      if (!h.crowned && h.crown) { h.crowned = true; st.made.splashes += h.crown; }
    }
    if (rippleB) {
      rippleB.begin();
      for (let i = 0; i < st.hits.length; i++) {
        const h = st.hits[i];
        const t = h.age / h.life;
        const s = h.size * (0.25 + t * 1.15);
        const a = Math.pow(1 - t, 1.4) * (h.kind === "puddle" ? 0.8 : 0.55);
        rippleB.flat(h.x, h.y, h.z, s, 0.82, 0.9, 1, a);
      }
      rippleB.end();
    }
    if (splashB) {
      splashB.begin();
      for (let i = 0; i < st.hits.length; i++) {
        const h = st.hits[i];
        if (!h.crown || h.age > 0.34) continue;
        for (let k = 0; k < h.crown; k++) { // the crown: droplets thrown up and out, back down
          const ang = h.seed + k * 2.1;
          const u = h.age;
          const sp = 0.7 + k * 0.25;
          const x = h.x + Math.cos(ang) * sp * u * 0.9, z = h.z + Math.sin(ang) * sp * u * 0.9;
          const y = h.y + 0.02 + 2.2 * u - 9 * u * u;
          if (y < h.y) continue;
          splashB.billboard(x, y, z, 0.045, 0.045, right, up, 0.9, 0.95, 1, 0.75 * (1 - u / 0.34));
        }
      }
      for (let i = 0; i < st.drips.length; i++) { // a drip is a short bright streak
        const d = st.drips[i];
        splashB.billboard(d.x, d.y, d.z, 0.035, 0.18, right, up, 0.85, 0.92, 1, 0.8);
      }
      splashB.end();
    }
  }

  const orig = world.update.bind(world);
  world.update = function (fr, dt, opts) {
    orig(fr, dt, opts);
    try { frame(dt); } catch (e) { if (!st.err) { st.err = String(e && e.message || e); console.warn("[rain]", st.err); } }
  };

  const api = {
    info() {
      const L = st.lens;
      const ps = scene.particleSystems.find((p) => p.name === "rain");
      return {
        rain: st.rain,
        quality: lowQ() ? "low" : "high",
        hits: { ripples: st.made.ripples, splashes: st.made.splashes, live: st.hits.length, kinds: Object.assign({}, st.kinds), cap: budget(lowQ() ? "low" : "high").hits },
        curtains: st.curtainsShown,
        curtainCount: curtains.length,
        drips: st.drips.length,
        afterLeft: Math.round(st.afterLeft * 100) / 100,
        lens: { enabled: !lowQ(), drops: L.drops.length, sliding: L.drops.filter((d) => d.sliding).length, spawned: L.spawned, cleared: L.cleared, facing: L.facing },
        window: { shader: wr.ok, materials: wr.hooked, amt: Math.round(wr.amt * 100) / 100 },
        fog: { mul: Math.round(st.fogMul * 100) / 100, density: scene.fogDensity, visibilityM: Math.round(visibilityM(scene.fogDensity)) },
        streaks: { cap: streakBudget(lowQ() ? "low" : "high"), alive: ps ? Math.round(ps.emitRate * ((ps.minLifeTime + ps.maxLifeTime) / 2)) : 0, gpu: !!(ps && ps.__gpu) },
        error: st.err || null,
      };
    },
    /** Keep gutters and awnings dripping for `sec` real seconds after the rain stops (Sun-break aftermath). */
    afterDrip(sec) {
      st.afterLeft = Math.max(st.afterLeft, Math.max(0, sec == null ? 30 : sec));
      if (st.edgeT > 2) st.edgeT = 0; // refresh awning / gutter sources soon
    },
    heightAt: (x, z) => hmap.at(x, z),
    budget,
  };
  world.__rain = api;
  window.rain = api;
  if (day) day.rain = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) startRain();
