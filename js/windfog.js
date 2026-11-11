/* ==========================================================================
   Wind and fog you can see (js/windfog.js, numbers in day.config.js `windfog`).

   The invisible verbs made visible. Wind (Gust tap, Gale hold, Tornado) is ONE global wind field (direction,
   strength, time) that everything reads:
     - a vertex-shader bend (a Babylon MaterialPlugin) on the street trees and the park's and plaza's planters (props-solid,
       weighted by the vertex alpha: 1 = rigid), on the world's trunks and crowns, on the shopfront awnings (a flap) and
       on every flag and laundry piece below: no cloth sim, so it costs the same on a phone;
     - wind ribbons: short camera-facing trail meshes that streak along the gust direction;
     - leaves, papers and litter: thin instances swirled through three moving eddies;
     - flags on the roof corners and plaza poles, laundry lines on the walkable roofs (shader), and three hero pieces
       (the apt roof's flag and its bedsheet, the plaza's flag) as a small verlet cloth, desktop only;
     - walkers' umbrellas (js/crowd.js reads `strength()`): opened against a strong gust, then flipped inside out.
   Fog is ground fog as layered noise slices (6; 2 on low quality) that slide in from the river (north) and hug the
   streets, drifting with the wind; lamp light shafts at dusk and night, headlight cones on the cars, and veil rings that
   fade the skyline into it a ring at a time. All of it eases with the weather's own timing (`weather.now()`).

   Pure helpers are exported for scripts/check-windfog.mjs; `createWindFog(B, scene, deps)` builds the lot.
   ========================================================================== */

export const RIBBONS_HIGH = 28;
export const RIBBONS_LOW = 10;
export const LEAVES_HIGH = 72;
export const LEAVES_LOW = 26;
export const SLICES_HIGH = 6;
export const SLICES_LOW = 2;
export const FLIP_MIN = 0.5; // a walker's umbrella flips somewhere between FLIP_MIN and FLIP_MAX of the wind
export const FLIP_MAX = 0.9;
export const GUST_TAU = 2.6; // seconds a Gust takes to die away (about 1.6 s of it above 0.55)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const counts = (quality) => ({
  ribbons: quality === "low" ? RIBBONS_LOW : RIBBONS_HIGH,
  leaves: quality === "low" ? LEAVES_LOW : LEAVES_HIGH,
  slices: quality === "low" ? SLICES_LOW : SLICES_HIGH,
  cloth: quality !== "low",
});

/** Total wind (0..1.6) from the weather's wind and a gust's decaying pulse. */
export const windStrength = (ambient, gust) => clamp((ambient || 0) * 0.9 + (gust || 0) * 1.25, 0, 1.6);

/** Fog presence (0..1) from the weather's scene-fog density: 0.0065 clear, 0.09 in a fog bank. */
export const fogPresence = (density) => clamp(((density || 0) - 0.012) / 0.07, 0, 1);

/** A walker's umbrella: closed, open (the wind is up) or flipped (past its own threshold; it stays flipped until the wind is nearly gone). */
export function umbrellaState(wind, threshold, was) {
  if (was === "flipped") return wind > 0.28 ? "flipped" : "open";
  if (wind >= threshold) return "flipped";
  if (wind >= 0.3) return "open";
  return "closed";
}

/** Tileable value noise, 0..1, as a flat array (size x size). */
export function noiseField(size, seed) {
  const cell = (period, s) => {
    const g = new Float32Array(period * period);
    let t = (seed * 977 + s * 131) >>> 0;
    for (let i = 0; i < g.length; i++) {
      t = (Math.imul(t ^ (t >>> 15), 1 | t) + 0x6d2b79f5) >>> 0;
      g[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return g;
  };
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < 4; o++) {
    const period = 4 << o;
    const g = cell(period, o);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * period;
      const y0 = Math.floor(fy);
      const ty = smooth(0, 1, fy - y0);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * period;
        const x0 = Math.floor(fx);
        const tx = smooth(0, 1, fx - x0);
        const a = g[(y0 % period) * period + (x0 % period)];
        const b = g[(y0 % period) * period + ((x0 + 1) % period)];
        const c = g[((y0 + 1) % period) * period + (x0 % period)];
        const d = g[((y0 + 1) % period) * period + ((x0 + 1) % period)];
        out[y * size + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/* ---------------- the vertex-shader bend ---------------- */

const BEND_FUNC = {
  // vertex alpha is the weight: 1 = rigid, down to 0.5 = fully flexible (props.js `Part.bend`)
  alpha: "float wgt = clamp((1.0 - colorUpdated.a) * 2.0, 0.0, 1.0);",
  // a tree: the crown (high) moves, the trunk barely
  tree: "float wgt = clamp(pp.y / 2.4, 0.0, 1.0); wgt = wgt * wgt;",
  // an awning flaps whole
  cloth: "float wgt = 1.0;",
};

const bendCode = (mode) => `
#ifdef WINDBEND
{
  vec3 pp = positionUpdated;
  float wk = windA.z;
  float wt = windA.w;
  vec2 wd = windA.xy;
#ifdef INSTANCES
  vec2 anchor = vec2(world3.x, world3.z);
#else
  vec2 anchor = vec2(world[3][0], world[3][2]);
#endif
  vec2 at = anchor + pp.xz;
${mode === "hang" ? `
  float hw = clamp(-pp.y / 0.9, 0.0, 1.0);
  float bias = dot(wd, windB.yz);
  positionUpdated.z += (bias * 0.35 * wk + sin(wt * 6.0 + anchor.x * 1.3 + anchor.y * 0.9 + pp.x * 3.0) * 0.1 * wk) * hw;
  positionUpdated.x += sin(wt * 4.5 + anchor.y * 1.1) * 0.04 * wk * hw;
` : mode === "flag" ? `
  float u = clamp(pp.x / windB.x, 0.0, 1.0);
  float calm = clamp(wk * 1.6, 0.0, 1.0);
  float th = (calm - 1.0) * 1.25;
  float px = pp.x * cos(th);
  float py = pp.y + pp.x * sin(th);
  float ripple = sin(wt * 8.0 - pp.x * 4.5 + anchor.x * 0.7) * 0.1 * calm * u;
  positionUpdated = vec3(px, py + cos(wt * 6.0 - pp.x * 3.0) * 0.04 * calm * u, pp.z + ripple);
` : `
  ${BEND_FUNC[mode]}
  float front = dot(at, wd) * 0.18;
  float sway = 0.5 + 0.5 * sin(wt * 1.7 - front * 4.0);
  float flutter = sin(wt * 9.0 + at.x * 1.9 + at.y * 2.3 + pp.y * 3.1);
  float amp = wgt * wk;
  vec2 off = wd * (0.10 + 0.55 * sway) * amp + vec2(-wd.y, wd.x) * flutter * 0.05 * amp;
${mode === "cloth" ? "  positionUpdated.y += sin(wt * 7.0 + pp.x * 2.6 + at.x * 0.7) * 0.07 * wk;" : ""}
  positionUpdated.xz += off;
  positionUpdated.y -= (off.x * off.x + off.y * off.y) * 0.35;
`}
}
#endif
`;

function makeBendPlugin(B, material, mode, U, extra) {
  const Base = B.MaterialPluginBase;
  if (!Base) return null;
  class WindBend extends Base {
    constructor(mat) {
      super(mat, "WindBend", 210, { WINDBEND: false });
      this.mode = mode;
      this.flagW = (extra && extra.flagW) || 1.6;
      this.nx = (extra && extra.nx) || 0;
      this.nz = (extra && extra.nz) || 0;
      this.registerForExtraEvents = true;
      this._enable(true);
    }
    getClassName() { return "WindBend"; }
    isCompatible(shaderLanguage) { return shaderLanguage === 0; } // GLSL only: the page runs WebGL
    prepareDefines(defines) { defines.WINDBEND = true; }
    getUniforms() {
      const decl = "uniform vec4 windA;\nuniform vec4 windB;";
      return { ubo: [{ name: "windA", size: 4, type: "vec4" }, { name: "windB", size: 4, type: "vec4" }], vertex: decl };
    }
    bindForSubMesh(uniformBuffer) {
      uniformBuffer.updateFloat4("windA", U.x, U.y, U.z, U.w);
      uniformBuffer.updateFloat4("windB", this.flagW, this.nx, this.nz, 0);
    }
    getCustomCode(shaderType) {
      if (shaderType !== "vertex") return null;
      return { CUSTOM_VERTEX_UPDATE_POSITION: bendCode(this.mode) };
    }
  }
  try {
    return new WindBend(material);
  } catch (err) {
    return null;
  }
}

/* ---------------- cell meshes: a cloth of unshared quads, one colour per cell, so a stripe stays a stripe ---------------- */

function cellData(cols, rows, w, h, colorAt) {
  const positions = [];
  const colors = [];
  const indices = [];
  const dx = w / cols;
  const dy = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const base = positions.length / 3;
      const col = colorAt(c, r);
      for (const [i, j] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        positions.push((c + i) * dx, -(r + j) * dy, 0);
        colors.push(col[0], col[1], col[2], 1);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { positions, colors, indices };
}

function cellMesh(B, scene, name, cols, rows, w, h, colorAt, mat, updatable) {
  const d = cellData(cols, rows, w, h, colorAt);
  const mesh = new B.Mesh(name, scene);
  const vd = new B.VertexData();
  vd.positions = d.positions;
  vd.colors = d.colors;
  vd.indices = d.indices;
  vd.normals = [];
  B.VertexData.ComputeNormals(d.positions, d.indices, vd.normals);
  vd.applyToMesh(mesh, !!updatable);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.doNotSyncBoundingInfo = false;
  return { mesh, cols, rows, indices: d.indices, normals: vd.normals };
}

/** A small verlet cloth: pinned along a side, hung from the wind. Desktop only. */
function makeCloth(B, scene, opts) {
  const { name, cols, rows, w, h, origin, along, pin, mat, colorAt } = opts;
  const nx = cols + 1;
  const ny = rows + 1;
  const n = nx * ny;
  const p = new Float32Array(n * 3);
  const q = new Float32Array(n * 3);
  const pinned = new Uint8Array(n);
  const [ax, ay, az] = along; // the cloth's width runs along this
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      const u = (i / cols) * w;
      const v = (j / rows) * h;
      p[k] = origin[0] + ax * u;
      p[k + 1] = origin[1] + ay * u - v; // the width runs along `along`, the cloth hangs from its top row
      p[k + 2] = origin[2] + az * u;
      q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
      if ((pin === "left" && i === 0) || (pin === "top" && j === 0)) pinned[j * nx + i] = 1;
    }
  }
  const rest = [];
  const link = (a, b) => {
    const dx = p[a * 3] - p[b * 3];
    const dy = p[a * 3 + 1] - p[b * 3 + 1];
    const dz = p[a * 3 + 2] - p[b * 3 + 2];
    rest.push([a, b, Math.hypot(dx, dy, dz)]);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * nx + i;
      if (i + 1 < nx) link(a, a + 1);
      if (j + 1 < ny) link(a, a + nx);
      if (i + 1 < nx && j + 1 < ny) { link(a, a + nx + 1); link(a + 1, a + nx); }
    }
  }
  const cm = cellMesh(B, scene, name, cols, rows, w, h, colorAt, mat, true);
  const mesh = cm.mesh;
  mesh.alwaysSelectAsActiveMesh = true;
  const pos = new Float32Array(cols * rows * 12);
  const nrm = new Float32Array(cols * rows * 12);
  const idx = cm.indices;
  const pt = (i, j) => (j * nx + i) * 3;
  let acc = 0;
  let t = 0;
  function write() {
    let o = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const [i, j] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          const k = pt(c + i, r + j);
          pos[o++] = p[k]; pos[o++] = p[k + 1]; pos[o++] = p[k + 2];
        }
      }
    }
    B.VertexData.ComputeNormals(pos, idx, nrm);
    mesh.updateVerticesData(B.VertexBuffer.PositionKind, pos, false, false);
    mesh.updateVerticesData(B.VertexBuffer.NormalKind, nrm, false, false);
  }
  write();
  return {
    mesh,
    particles: n,
    step(dt, U, wdx, wdz) {
      acc = Math.min(acc + dt, 1 / 20);
      let moved = false;
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        t += 1 / 60;
        moved = true;
        const k = U.z;
        for (let i = 0; i < n; i++) {
          if (pinned[i]) continue;
          const o = i * 3;
          const gust = 0.55 + 0.45 * Math.sin(t * 3.4 + i * 0.37 + p[o] * 0.5);
          const push = (0.4 + 16 * k) * gust;
          const vx = (p[o] - q[o]) * 0.985;
          const vy = (p[o + 1] - q[o + 1]) * 0.985;
          const vz = (p[o + 2] - q[o + 2]) * 0.985;
          q[o] = p[o]; q[o + 1] = p[o + 1]; q[o + 2] = p[o + 2];
          const dt2 = (1 / 60) * (1 / 60);
          p[o] += vx + wdx * push * dt2;
          p[o + 1] += vy + (-9.8 * 0.4 + Math.sin(t * 6 + i) * k * 3) * dt2;
          p[o + 2] += vz + wdz * push * dt2;
        }
        for (let it = 0; it < 3; it++) {
          for (let r = 0; r < rest.length; r++) {
            const [a, b, len] = rest[r];
            const ao = a * 3;
            const bo = b * 3;
            const dx = p[bo] - p[ao];
            const dy = p[bo + 1] - p[ao + 1];
            const dz = p[bo + 2] - p[ao + 2];
            const dist = Math.hypot(dx, dy, dz) || 1e-6;
            const diff = (dist - len) / dist;
            const wa = pinned[a] ? 0 : pinned[b] ? 1 : 0.5;
            const wb = pinned[b] ? 0 : pinned[a] ? 1 : 0.5;
            p[ao] += dx * diff * wa; p[ao + 1] += dy * diff * wa; p[ao + 2] += dz * diff * wa;
            p[bo] -= dx * diff * wb; p[bo + 1] -= dy * diff * wb; p[bo + 2] -= dz * diff * wb;
          }
        }
      }
      if (moved) write();
    },
    /** How far the free edge is from where it hangs: proof it is moving (the check). */
    spread() {
      const last = pt(cols, rows);
      return Math.hypot(p[last] - p[0], p[last + 2] - p[2]);
    },
    dispose() { mesh.dispose(); },
  };
}

/* ---------------- the lot ---------------- */

export function createWindFog(B, scene, deps) {
  const d = Object.assign({
    quality: () => "high",
    focus: () => ({ x: 0, y: 1, z: 0 }),
    cameraPos: () => ({ x: 0, y: 5, z: 0 }),
    sky: () => ({ day: 1, dusk: 0, night: 0 }),
    cars: () => [],
    lamps: () => [],
    blocks: [],
    plaza: { x0: 106, z0: 16.8, x1: 130, z1: 36 },
    plazaTop: 0.07,
    cfg: {},
  }, deps || {});
  const cfg = d.cfg;
  const prevailing = cfg.prevailing || [0.82, -0.57];
  const river = cfg.river || [0, 1]; // the river lies to the north: the fog comes in from there
  let quality = d.quality();
  let cnt = counts(quality);

  const U = new B.Vector4(prevailing[0], prevailing[1], 0.05, 0);
  const W = { dx: prevailing[0], dz: prevailing[1], tx: prevailing[0], tz: prevailing[1], ambient: 0, gust: 0, k: 0.05, t: 0, flips: 0, lastGustAt: -99, gusts: 0 };
  const F = { target: 0, k: 0, bank: 0, drift: 0, density: 0 };
  const stats = { plugins: 0, ribbons: 0, leaves: 0, flags: 0, laundry: 0, cloth: 0, slices: 0, shafts: 0, cones: 0, veils: 0 };
  const hold = []; // everything to dispose

  /* ---- shared things ---- */
  const std = (name, o) => {
    const m = new B.StandardMaterial(name, scene);
    m.disableLighting = !!(o && o.unlit);
    m.specularColor = new B.Color3(0, 0, 0);
    if (o && o.emissive) m.emissiveColor = new B.Color3(o.emissive[0], o.emissive[1], o.emissive[2]);
    if (o && o.diffuse) m.diffuseColor = new B.Color3(o.diffuse[0], o.diffuse[1], o.diffuse[2]);
    if (o && o.alpha != null) { m.alpha = o.alpha; m.transparencyMode = B.Material.MATERIAL_ALPHABLEND; }
    if (o && o.double) { m.backFaceCulling = false; m.twoSidedLighting = true; }
    if (o && o.add) m.alphaMode = B.Engine.ALPHA_ADD;
    if (o && o.noFog) m.fogEnabled = false;
    if (o && o.noDepth) m.disableDepthWrite = true;
    return m;
  };

  /* ---- the vertex-shader bend on the world's own materials ---- */
  function bendMaterial(mat, mode, extra) {
    if (!mat || mat.__windBend) return mat;
    const pl = makeBendPlugin(B, mat, mode, U, extra);
    if (pl) { mat.__windBend = pl; stats.plugins++; }
    return mat;
  }
  const bent = new Set();
  scene.meshes.forEach((m) => {
    if (m.name === "props-solid" && m.material) bent.add(bendMaterial(m.material, "alpha"));
    else if (m.name === "weather-awnings" && m.material) bent.add(bendMaterial(m.material, "cloth"));
    else if (m.thinInstanceCount && (m.name === "trunk" || m.name.indexOf("crown") === 0) && m.material) bent.add(bendMaterial(m.material, "tree"));
  });

  /* ---- flags and laundry (shader), and three hero cloths (verlet, desktop) ---- */
  const FLAG_W = 1.6;
  const flagMat = bendMaterial(std("wf-flag", { diffuse: [1, 1, 1], double: true }), "flag", { flagW: FLAG_W });
  const lineW = 1.2;
  const lineMat = bendMaterial(std("wf-laundry", { diffuse: [1, 1, 1], double: true }), "hang", { nx: -1, nz: 0 }); // every line runs along z: a piece's local +z is world -x
  const poleMat = std("wf-pole", { diffuse: [0.55, 0.57, 0.6] });
  const flags = []; // { mesh, yaw }
  const cloths = [];
  const stripe = (a, b) => (c, r) => ((c + r) % 2 === 0 ? a : b);
  const FLAGS = [[0.8, 0.22, 0.2], [0.95, 0.9, 0.78]];
  const FLAG2 = [[0.2, 0.42, 0.7], [0.95, 0.78, 0.25]];

  function pole(x, y0, z, h) {
    const c = B.MeshBuilder.CreateCylinder("wf-pole", { height: h, diameter: 0.07, tessellation: 6 }, scene);
    c.position.set(x, y0 + h / 2, z);
    c.material = poleMat;
    c.isPickable = false;
    hold.push(c);
    return c;
  }
  function shaderFlag(x, y0, z, h, colors) {
    pole(x, y0, z, h);
    const cm = cellMesh(B, scene, "wf-flag", 8, 5, FLAG_W, 0.95, stripe(colors[0], colors[1]), flagMat, false);
    cm.mesh.position.set(x, y0 + h - 0.02, z);
    cm.mesh.alwaysSelectAsActiveMesh = true;
    flags.push({ mesh: cm.mesh, yaw: 0, ph: x * 0.7 + z });
    hold.push(cm.mesh);
    stats.flags++;
  }
  function laundryLine(x0, z0, x1, z1, y0, h, pieces) {
    pole(x0, y0, z0, h); pole(x1, y0, z1, h);
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const rope = B.MeshBuilder.CreateCylinder("wf-rope", { height: len, diameter: 0.02, tessellation: 4 }, scene);
    rope.position.set((x0 + x1) / 2, y0 + h - 0.05, (z0 + z1) / 2);
    rope.rotation.set(Math.PI / 2, Math.atan2(dx, dz), 0);
    rope.material = poleMat;
    rope.isPickable = false;
    hold.push(rope);
    const cols = [[0.88, 0.88, 0.9], [0.8, 0.42, 0.36], [0.35, 0.55, 0.78], [0.9, 0.8, 0.45], [0.55, 0.7, 0.5]];
    for (let i = 0; i < pieces; i++) {
      const u = (i + 0.5) / pieces;
      const cm = cellMesh(B, scene, "wf-laundry", 4, 3, lineW * 0.8, 0.9 - (i % 3) * 0.12, () => cols[i % cols.length], lineMat, false);
      cm.mesh.position.set(x0 + dx * u - (dx / len) * lineW * 0.4, y0 + h - 0.06, z0 + dz * u - (dz / len) * lineW * 0.4);
      cm.mesh.rotation.y = Math.atan2(-dz, dx); // the cloth's +x runs along the line
      cm.mesh.alwaysSelectAsActiveMesh = true;
      hold.push(cm.mesh);
      stats.laundry++;
    }
  }
  function heroCloth(name, origin, along, w, h, pin, colorAt) {
    const mat = std(name + "-mat", { diffuse: [1, 1, 1], double: true });
    const c = makeCloth(B, scene, { name, cols: 8, rows: 5, w, h, origin, along, pin, mat, colorAt });
    cloths.push(c);
    hold.push(c.mesh);
    stats.cloth++;
    return c;
  }

  const blocks = d.blocks || [];
  const find = (id) => blocks.find((b) => b.id === id);
  const apt = find("apt");
  // rooftop flags on the corners of nine blocks (the walkable ones carry the hero pieces instead of one)
  blocks.forEach((b, i) => {
    if (b.w < 10 || b.h < 3) return;
    if (b.id === "apt") return;
    const cx = b.x + b.w / 2 - 0.7;
    const cz = b.z - b.d / 2 + 0.7;
    shaderFlag(cx, b.h, cz, 3.0, i % 2 ? FLAG2 : FLAGS);
  });
  // laundry on the shop's and the annex's west edge (clear of their south units and the middle gravel deck)
  ["shop", "annex"].forEach((id) => {
    const b = find(id);
    if (!b) return;
    laundryLine(b.x - b.w / 2 + 0.8, b.z - 1.8, b.x - b.w / 2 + 0.8, b.z + 2.6, b.h, 1.9, 4);
  });
  if (apt) {
    const top = apt.h;
    const px = apt.x + apt.w / 2 - 0.7;
    const pz = apt.z - apt.d / 2 + 0.7;
    const lx = apt.x - apt.w / 2 + 0.8;
    pole(px, top, pz, 3.6);
    pole(lx, top, apt.z - 1.6, 1.9);
    pole(lx, top, apt.z + 2.2, 1.9);
    if (cnt.cloth) {
      heroCloth("wf-hero-flag", [px, top + 3.58, pz], [1, 0, 0], 1.9, 1.15, "left", stripe(FLAGS[0], FLAGS[1]));
      heroCloth("wf-hero-sheet", [lx, top + 1.82, apt.z - 1.6], [0, 0, 1], 3.0, 1.2, "top", () => [0.92, 0.92, 0.95]);
    } else {
      shaderFlag(px, top, pz, 3.6, FLAGS);
      laundryLine(lx, apt.z - 1.6, lx, apt.z + 2.2, top, 1.9, 4);
    }
  }
  if (d.plaza) {
    const pl = d.plaza;
    const gx = pl.x0 + 1.2;
    const gz = pl.z0 + 1.4;
    pole(gx, d.plazaTop, gz, 4.2);
    if (cnt.cloth) heroCloth("wf-hero-plaza", [gx, d.plazaTop + 4.18, gz], [1, 0, 0], 2.2, 1.3, "left", stripe(FLAG2[0], FLAG2[1]));
    else shaderFlag(gx, d.plazaTop, gz, 4.2, FLAG2);
    shaderFlag(pl.x1 - 1.2, d.plazaTop, pl.z0 + 1.4, 4.0, FLAGS);
  }

  /* ---- wind ribbons ---- */
  const RK = 9; // points per trail
  const rib = { n: RIBBONS_HIGH, mesh: null, pos: null, col: null, heads: [], t: 0 };
  {
    const N = RIBBONS_HIGH;
    const verts = N * RK * 2;
    rib.pos = new Float32Array(verts * 3);
    rib.col = new Float32Array(verts * 4);
    const nrm = new Float32Array(verts * 3);
    const idx = [];
    for (let r = 0; r < N; r++) {
      for (let k = 0; k < RK - 1; k++) {
        const a = (r * RK + k) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    for (let i = 0; i < verts; i++) { nrm[i * 3 + 1] = 1; rib.col[i * 4] = 1; rib.col[i * 4 + 1] = 1; rib.col[i * 4 + 2] = 1; }
    const mesh = new B.Mesh("wf-ribbons", scene);
    const vd = new B.VertexData();
    vd.positions = Array.from(rib.pos);
    vd.normals = Array.from(nrm);
    vd.colors = Array.from(rib.col);
    vd.indices = idx;
    vd.applyToMesh(mesh, true);
    mesh.hasVertexAlpha = true;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isPickable = false;
    mesh.material = std("wf-ribbon-mat", { unlit: true, emissive: [0.92, 0.97, 1], alpha: 1, double: true, noFog: true, noDepth: true });
    mesh.isVisible = false;
    rib.mesh = mesh;
    hold.push(mesh);
    for (let r = 0; r < N; r++) {
      const trail = new Float32Array(RK * 3);
      rib.heads.push({ trail, age: 9, life: 1, x: 0, y: 0, z: 0, sp: 0, ph: Math.random() * 6.28, amp: 1, w: 0.12, acc: 0, on: false });
    }
  }
  const tmpA = { x: 0, y: 0, z: 0 };

  function respawnRibbon(h, f, k, cam) {
    const ax = -W.dz; // across the wind
    const az = W.dx;
    const along = -26 + Math.random() * 10; // start upwind of the view, so the streak crosses it
    const across = (Math.random() - 0.5) * 36;
    h.x = f.x + W.dx * along + ax * across;
    h.z = f.z + W.dz * along + az * across;
    h.y = 0.6 + Math.random() * 6.5;
    h.sp = (12 + Math.random() * 12) * (0.6 + 0.4 * Math.min(1, k));
    h.life = 1.1 + Math.random() * 0.9;
    h.age = 0;
    h.ph = Math.random() * 6.28;
    h.amp = 0.6 + Math.random() * 1.4;
    h.w = 0.07 + Math.random() * 0.1;
    h.on = true;
    for (let i = 0; i < RK; i++) { h.trail[i * 3] = h.x; h.trail[i * 3 + 1] = h.y; h.trail[i * 3 + 2] = h.z; }
  }
  function stepRibbons(dt, f, cam, k) {
    const active = Math.round(cnt.ribbons * smooth(0.08, 0.7, k));
    let live = 0;
    const view = { x: cam.x - f.x, y: cam.y - f.y, z: cam.z - f.z };
    for (let r = 0; r < RIBBONS_HIGH; r++) {
      const h = rib.heads[r];
      if (r >= active) { h.on = false; }
      if (!h.on) {
        if (r < active && Math.random() < dt * 5) respawnRibbon(h, f, k, cam);
      } else {
        h.age += dt;
        if (h.age > h.life) { h.on = false; }
        else {
          h.acc += dt;
          const t = h.age;
          const sp = h.sp * (0.8 + 0.2 * Math.sin(t * 5 + h.ph));
          h.x += W.dx * sp * dt + (-W.dz) * Math.sin(t * 6 + h.ph) * h.amp * dt * 2.2;
          h.z += W.dz * sp * dt + W.dx * Math.sin(t * 6 + h.ph) * h.amp * dt * 2.2;
          h.y += Math.cos(t * 4.4 + h.ph) * h.amp * dt * 1.6;
          // shift the trail every 1/45 s
          while (h.acc >= 1 / 45) {
            h.acc -= 1 / 45;
            for (let i = RK - 1; i > 0; i--) {
              h.trail[i * 3] = h.trail[(i - 1) * 3]; h.trail[i * 3 + 1] = h.trail[(i - 1) * 3 + 1]; h.trail[i * 3 + 2] = h.trail[(i - 1) * 3 + 2];
            }
          }
          h.trail[0] = h.x; h.trail[1] = h.y; h.trail[2] = h.z;
        }
      }
      // the strip: camera-facing, tapering to the tail
      const fade = h.on ? Math.min(1, h.age / 0.15) * Math.min(1, (h.life - h.age) / 0.3) : 0;
      if (h.on) live++;
      for (let i = 0; i < RK; i++) {
        const a = Math.max(0, i - 1);
        const b = Math.min(RK - 1, i + 1);
        let tx = h.trail[a * 3] - h.trail[b * 3];
        let ty = h.trail[a * 3 + 1] - h.trail[b * 3 + 1];
        let tz = h.trail[a * 3 + 2] - h.trail[b * 3 + 2];
        // side = tangent x (head - camera)
        const vx = h.trail[i * 3] - cam.x;
        const vy = h.trail[i * 3 + 1] - cam.y;
        const vz = h.trail[i * 3 + 2] - cam.z;
        let sx = ty * vz - tz * vy;
        let sy = tz * vx - tx * vz;
        let sz = tx * vy - ty * vx;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const width = h.w * (1 - i / RK) * (h.on ? 1 : 0);
        sx = (sx / sl) * width; sy = (sy / sl) * width; sz = (sz / sl) * width;
        const o = (r * RK + i) * 2;
        const px = h.trail[i * 3];
        const py = h.trail[i * 3 + 1];
        const pz = h.trail[i * 3 + 2];
        rib.pos.set([px + sx, py + sy, pz + sz, px - sx, py - sy, pz - sz], o * 3);
        const al = fade * (1 - i / (RK - 1)) * 0.55 * Math.min(1, k * 1.4);
        rib.col[o * 4 + 3] = al;
        rib.col[(o + 1) * 4 + 3] = al;
      }
    }
    void view; void tmpA;
    rib.mesh.isVisible = live > 0;
    rib.mesh.updateVerticesData(B.VertexBuffer.PositionKind, rib.pos, false, false);
    rib.mesh.updateVerticesData(B.VertexBuffer.ColorKind, rib.col, false, false);
    stats.ribbons = live;
  }

  /* ---- leaves, papers and litter, swirled through three eddies ---- */
  const LV = { mesh: null, buf: null, col: null, p: [], t: 0 };
  {
    const N = LEAVES_HIGH;
    const m = B.MeshBuilder.CreatePlane("wf-leaves", { width: 0.17, height: 0.12 }, scene);
    m.rotation.x = Math.PI / 2; // lies flat; thin instance rotations tumble it
    m.bakeCurrentTransformIntoVertices();
    m.material = std("wf-leaf-mat", { diffuse: [1, 1, 1], double: true });
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
    m.doNotSyncBoundingInfo = true;
    m.thinInstanceEnablePicking = false;
    LV.buf = new Float32Array(N * 16);
    LV.col = new Float32Array(N * 4);
    const palette = [[0.35, 0.55, 0.22], [0.55, 0.62, 0.2], [0.78, 0.5, 0.16], [0.7, 0.3, 0.12], [0.93, 0.92, 0.86], [0.88, 0.84, 0.7], [0.78, 0.8, 0.84], [0.5, 0.36, 0.2]];
    for (let i = 0; i < N; i++) {
      const c = palette[(i * 5 + 1) % palette.length];
      LV.col.set([c[0], c[1], c[2], 1], i * 4);
      LV.p.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, sx: (Math.random() - 0.5) * 9, sy: (Math.random() - 0.5) * 9, s: 0, on: false, sc: 0.8 + Math.random() * 0.8 });
      LV.buf.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -50, 0, 1], i * 16);
    }
    m.thinInstanceSetBuffer("matrix", LV.buf, 16, false);
    m.thinInstanceSetBuffer("color", LV.col, 4, true);
    m.thinInstanceCount = N;
    LV.mesh = m;
    hold.push(m);
  }
  const eddies = [{ a: 0, r: 9, w: 0.5, g: 1 }, { a: 2.1, r: 14, w: -0.37, g: -1 }, { a: 4.2, r: 6, w: 0.8, g: 1 }];
  const ID = new B.Quaternion();
  const tmpV = new B.Vector3(1, 1, 1);
  const tmpP = new B.Vector3();
  const tmpM = new B.Matrix();
  function stepLeaves(dt, f, k) {
    const active = Math.round(cnt.leaves * smooth(0.06, 0.6, k));
    const ex = eddies.map((e) => {
      e.a += e.w * dt;
      return { x: f.x + Math.cos(e.a) * e.r, z: f.z + Math.sin(e.a) * e.r, g: e.g, R: 5.5 };
    });
    let swirling = 0;
    for (let i = 0; i < LEAVES_HIGH; i++) {
      const l = LV.p[i];
      const want = i < active;
      if (!want) {
        if (l.on) {
          l.s = Math.max(0, l.s - dt * 3);
          if (l.s <= 0) l.on = false;
        }
      } else if (!l.on || Math.hypot(l.x - f.x, l.z - f.z) > 30) {
        // appear upwind of the view and ride in through it
        const across = (Math.random() - 0.5) * 40;
        const along = -(8 + Math.random() * 22);
        l.x = f.x + W.dx * along - W.dz * across;
        l.z = f.z + W.dz * along + W.dx * across;
        l.y = 0.2 + Math.random() * 2.2;
        l.vx = W.dx * 2; l.vz = W.dz * 2; l.vy = 0.5;
        l.on = true;
        l.s = 0;
      }
      if (!l.on) { tmpP.set(0, -50, 0); tmpM.copyFrom(B.Matrix.Compose(tmpV.set(0, 0, 0), ID, tmpP)); tmpM.copyToArray(LV.buf, i * 16); continue; }
      if (want) l.s = Math.min(1, l.s + dt * 3);
      // the fluid: the wind along its direction (gusting), plus the eddies' swirl and uplift
      const gustK = 0.65 + 0.35 * Math.sin(LV.t * 1.9 + i * 0.6);
      let ux = W.dx * (1.5 + 10 * k) * gustK;
      let uz = W.dz * (1.5 + 10 * k) * gustK;
      let up = 0;
      for (let e = 0; e < ex.length; e++) {
        const rx = l.x - ex[e].x;
        const rz = l.z - ex[e].z;
        const r2 = rx * rx + rz * rz;
        const fall = Math.exp(-r2 / (ex[e].R * ex[e].R));
        const r = Math.sqrt(r2) + 0.4;
        const sw = ex[e].g * (3 + 9 * k) * fall;
        ux += (-rz / r) * sw + (-rx / r) * sw * 0.25;
        uz += (rx / r) * sw + (-rz / r) * sw * 0.25;
        up += fall * (1 + 4 * k);
        if (fall > 0.35) swirling++;
      }
      const follow = Math.min(1, dt * 2.6);
      l.vx += (ux - l.vx) * follow;
      l.vz += (uz - l.vz) * follow;
      l.vy += ((up - 0.9 + Math.sin(LV.t * 5 + i) * 0.5) - l.vy) * follow;
      l.x += l.vx * dt; l.y += l.vy * dt; l.z += l.vz * dt;
      if (l.y < 0.1) { l.y = 0.1; l.vy = Math.max(0, l.vy) * 0.4; l.vx *= 0.9; l.vz *= 0.9; }
      if (l.y > 9) l.vy = -1;
      l.rx += l.sx * dt * (0.3 + k); l.ry += l.sy * dt * (0.3 + k); l.rz += (l.sx + l.sy) * 0.4 * dt;
      tmpP.set(l.x, l.y, l.z);
      const q = B.Quaternion.RotationYawPitchRoll(l.ry, l.rx, l.rz);
      const sc = l.sc * l.s;
      B.Matrix.ComposeToRef(tmpV.set(sc, sc, sc), q, tmpP, tmpM);
      tmpM.copyToArray(LV.buf, i * 16);
    }
    LV.mesh.thinInstanceBufferUpdated("matrix");
    stats.leaves = active;
    stats.swirling = swirling;
  }

  /* ---- fog: slices, veils, shafts, headlight cones ---- */
  const FOG = { slices: [], tex: null, veils: [], shaft: null, shaftBuf: null, cone: null, coneBuf: null };
  const SLICE_H = [0.25, 0.8, 1.5, 2.4, 3.6, 5.2];
  const SLICE_H_LOW = [0.6, 2.2];
  const SLICE_R = 105;
  function buildFog() {
    const size = quality === "low" ? 128 : 256;
    const noise = noiseField(size, 7);
    const tex = new B.DynamicTexture("wf-fog-noise", { width: size, height: size }, scene, true);
    try {
      const ctx = tex.getContext();
      const img = ctx.createImageData ? ctx.createImageData(size, size) : null;
      if (img) {
        for (let i = 0; i < size * size; i++) {
          // thresholded so the banks have clear gaps: the streets show through
          const v = smooth(0.32, 0.78, noise[i]);
          const c = Math.round(v * 255);
          img.data[i * 4] = c; img.data[i * 4 + 1] = c; img.data[i * 4 + 2] = c; img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      tex.update();
    } catch (err) { /* headless */ }
    tex.wrapU = B.Texture.WRAP_ADDRESSMODE;
    tex.wrapV = B.Texture.WRAP_ADDRESSMODE;
    tex.getAlphaFromRGB = true;
    FOG.tex = tex;
    const heights = quality === "low" ? SLICE_H_LOW : SLICE_H;
    heights.forEach((h, i) => {
      const disc = B.MeshBuilder.CreateDisc("wf-fog-slice" + i, { radius: SLICE_R, tessellation: 28 }, scene);
      disc.rotation.x = Math.PI / 2; // facing up
      disc.bakeCurrentTransformIntoVertices();
      // alpha 1 at the centre, 0 at the rim: a soft edge
      const n = disc.getTotalVertices();
      const pos = disc.getVerticesData(B.VertexBuffer.PositionKind);
      const cols = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) {
        const r = Math.hypot(pos[v * 3], pos[v * 3 + 2]) / SLICE_R;
        cols[v * 4] = 1; cols[v * 4 + 1] = 1; cols[v * 4 + 2] = 1; cols[v * 4 + 3] = 1 - smooth(0.45, 1, r);
      }
      disc.setVerticesData(B.VertexBuffer.ColorKind, cols);
      disc.hasVertexAlpha = true;
      disc.isPickable = false;
      disc.alwaysSelectAsActiveMesh = true;
      disc.alphaIndex = 10 + i;
      const mat = std("wf-fog-mat" + i, { unlit: true, emissive: [0.78, 0.8, 0.82], alpha: 0, double: true, noFog: true, noDepth: true });
      let ot = tex;
      if (i > 0) {
        try { ot = tex.clone(); } catch (err) { ot = tex; }
        ot.wrapU = B.Texture.WRAP_ADDRESSMODE; ot.wrapV = B.Texture.WRAP_ADDRESSMODE; ot.getAlphaFromRGB = true;
      }
      mat.opacityTexture = ot;
      mat.opacityTexture.uScale = (SLICE_R * 2) / (34 + i * 9);
      mat.opacityTexture.vScale = (SLICE_R * 2) / (34 + i * 9);
      disc.material = mat;
      disc.isVisible = false;
      FOG.slices.push({ mesh: disc, mat, h, i, tile: 34 + i * 9 });
      hold.push(disc);
    });
    stats.slices = heights.length;
    // veil rings: open cylinders around the district with a vertical alpha gradient; each ring hides the skyline a little more
    const rings = quality === "low" ? [[120, 60]] : [[70, 28], [140, 62], [250, 130]];
    rings.forEach(([radius, height], i) => {
      const c = B.MeshBuilder.CreateCylinder("wf-veil" + i, { height, diameter: radius * 2, tessellation: 32, cap: B.Mesh.NO_CAP }, scene);
      c.position.y = height / 2;
      const n = c.getTotalVertices();
      const pos = c.getVerticesData(B.VertexBuffer.PositionKind);
      const cols = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) {
        const t = (pos[v * 3 + 1] + height / 2) / height; // 0 at the foot, 1 at the top
        cols[v * 4] = 1; cols[v * 4 + 1] = 1; cols[v * 4 + 2] = 1; cols[v * 4 + 3] = Math.pow(1 - t, 1.6);
      }
      c.setVerticesData(B.VertexBuffer.ColorKind, cols);
      c.hasVertexAlpha = true;
      c.isPickable = false;
      c.alwaysSelectAsActiveMesh = true;
      c.alphaIndex = 30 + i;
      c.material = std("wf-veil-mat" + i, { unlit: true, emissive: [0.78, 0.8, 0.83], alpha: 0, noFog: true, noDepth: true, double: true });
      c.isVisible = false;
      FOG.veils.push({ mesh: c, i, max: [0.36, 0.5, 0.7][i] != null ? [0.36, 0.5, 0.7][i] : 0.5 });
      hold.push(c);
    });
    stats.veils = rings.length;
    // a lamp's light shaft (a cone, wide at the foot, fading up into the head) and a car's headlight cone
    const shaft = B.MeshBuilder.CreateCylinder("wf-shaft", { height: 4.2, diameterTop: 0.2, diameterBottom: 3.6, tessellation: 10, cap: B.Mesh.NO_CAP }, scene);
    shaft.position.y = 2.1;
    shaft.bakeCurrentTransformIntoVertices();
    {
      const n = shaft.getTotalVertices();
      const pos = shaft.getVerticesData(B.VertexBuffer.PositionKind);
      const cols = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) {
        const t = pos[v * 3 + 1] / 4.2; // 1 at the head
        cols[v * 4] = 1; cols[v * 4 + 1] = 0.92; cols[v * 4 + 2] = 0.7; cols[v * 4 + 3] = 0.55 * (0.25 + 0.75 * t);
      }
      shaft.setVerticesData(B.VertexBuffer.ColorKind, cols);
    }
    shaft.hasVertexAlpha = true;
    shaft.material = std("wf-shaft-mat", { unlit: true, emissive: [1, 0.92, 0.7], alpha: 0.0, add: true, noFog: true, noDepth: true, double: true });
    shaft.isPickable = false;
    shaft.alwaysSelectAsActiveMesh = true;
    shaft.doNotSyncBoundingInfo = true;
    shaft.thinInstanceEnablePicking = false;
    FOG.shaftBuf = new Float32Array(14 * 16);
    shaft.thinInstanceSetBuffer("matrix", FOG.shaftBuf, 16, false);
    shaft.thinInstanceCount = 14;
    shaft.isVisible = false;
    FOG.shaft = shaft;
    hold.push(shaft);
    const cone = B.MeshBuilder.CreateCylinder("wf-cone", { height: 14, diameterTop: 5, diameterBottom: 0.5, tessellation: 10, cap: B.Mesh.NO_CAP }, scene);
    cone.rotation.x = Math.PI / 2; // the narrow end at the car, the wide end ahead (+z)
    cone.bakeCurrentTransformIntoVertices();
    {
      const n = cone.getTotalVertices();
      const pos = cone.getVerticesData(B.VertexBuffer.PositionKind);
      const cols = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) {
        const t = clamp(pos[v * 3 + 2] / 14 + 0.5, 0, 1); // 0 at the lamps, 1 at the far end
        cols[v * 4] = 1; cols[v * 4 + 1] = 0.96; cols[v * 4 + 2] = 0.8; cols[v * 4 + 3] = 0.6 * (1 - t);
      }
      cone.setVerticesData(B.VertexBuffer.ColorKind, cols);
    }
    cone.hasVertexAlpha = true;
    cone.material = std("wf-cone-mat", { unlit: true, emissive: [1, 0.95, 0.8], alpha: 0.0, add: true, noFog: true, noDepth: true, double: true });
    cone.isPickable = false;
    cone.alwaysSelectAsActiveMesh = true;
    cone.doNotSyncBoundingInfo = true;
    cone.thinInstanceEnablePicking = false;
    FOG.coneBuf = new Float32Array(10 * 16);
    cone.thinInstanceSetBuffer("matrix", FOG.coneBuf, 16, false);
    cone.thinInstanceCount = 10;
    cone.isVisible = false;
    FOG.cone = cone;
    hold.push(cone);
  }
  buildFog();

  let lastShaftAt = -9;
  const fogCol = new B.Color3();
  function stepFog(dt, f, cam, sky) {
    const dens = F.density;
    F.target = fogPresence(dens);
    F.k += (F.target - F.k) * (1 - Math.exp(-dt / (F.target > F.k ? 0.9 : 1.6)));
    F.bank += (F.target - F.bank) * (1 - Math.exp(-dt / (F.target > F.bank ? 1.3 : 2.4)));
    if (F.k < 0.004 && F.target === 0) F.k = 0;
    const show = F.k > 0.01;
    const sc = scene.fogColor;
    fogCol.copyFromFloats(clamp(sc.r * 1.02 + 0.04, 0, 1), clamp(sc.g * 1.02 + 0.04, 0, 1), clamp(sc.b * 1.04 + 0.05, 0, 1));
    F.drift += dt;
    const sn = Math.hypot(sc.r, sc.g, sc.b);
    void sn;
    const gx = Math.round(f.x / 8) * 8;
    const gz = Math.round(f.z / 8) * 8;
    FOG.slices.forEach((s) => {
      s.mesh.isVisible = show;
      if (!show) return;
      const ord = s.i / Math.max(1, FOG.slices.length - 1);
      const arrive = smooth(0, 1, clamp(F.bank * 1.3 - ord * 0.25, 0, 1));
      const away = (1 - arrive) * 90; // the bank slides in from the river
      s.mesh.position.set(f.x + river[0] * away, s.h, f.z + river[1] * away);
      // pattern fixed in the world (the plane follows the camera), drifting with the wind and in off the river
      const sp = (0.9 + s.i * 0.35) * (0.4 + 1.4 * Math.min(1, W.k));
      const ox = (s.mesh.position.x + W.dx * sp * F.drift - river[0] * 1.2 * F.drift * 0.3) / s.tile;
      const oz = (s.mesh.position.z + W.dz * sp * F.drift - river[1] * 1.2 * F.drift * 0.3) / s.tile;
      s.mat.opacityTexture.uOffset = ox;
      s.mat.opacityTexture.vOffset = -oz;
      const nearCam = smooth(0.3, 1.8, Math.abs(cam.y - s.h)); // never a hard plane across the lens
      const base = quality === "low" ? 0.36 : 0.2 + 0.05 * (1 - ord);
      s.mat.alpha = base * F.k * arrive * nearCam;
      s.mat.emissiveColor.copyFrom(fogCol);
    });
    FOG.veils.forEach((v) => {
      v.mesh.isVisible = show;
      if (!show) return;
      v.mesh.position.x = f.x; v.mesh.position.z = f.z;
      v.mat = v.mat || v.mesh.material;
      v.mat.alpha = v.max * F.k * (0.35 + 0.65 * F.bank);
      v.mat.emissiveColor.copyFrom(fogCol);
    });
    /* lamp shafts, by night and dusk: the lamps near the camera */
    const lampK = Math.min(1, sky.dusk * 0.8 + sky.night * 1.1);
    const shaftA = F.k * lampK;
    FOG.shaft.isVisible = shaftA > 0.02;
    if (FOG.shaft.isVisible) {
      FOG.shaft.material.emissiveColor.set(1 * shaftA * 0.55, 0.92 * shaftA * 0.55, 0.7 * shaftA * 0.55);
      if (F.drift - lastShaftAt > 0.4) {
        lastShaftAt = F.drift;
        const lamps = d.lamps() || [];
        const near = [];
        for (let i = 0; i < lamps.length; i++) {
          const dx = lamps[i][0] - f.x;
          const dz = lamps[i][1] - f.z;
          const dist = dx * dx + dz * dz;
          if (dist < 55 * 55) near.push([dist, lamps[i]]);
        }
        near.sort((a, b) => a[0] - b[0]);
        const cap = quality === "low" ? 6 : 14;
        let c = 0;
        for (let i = 0; i < 14; i++) {
          const e = i < Math.min(cap, near.length) ? near[i][1] : null;
          if (e) {
            // hung out over the road, toward the nearest avenue
            let tz = 0;
            let best = 99;
            (d.avenues || []).forEach((a) => { const dz = a - e[1]; if (Math.abs(dz) < Math.abs(best)) best = dz; });
            if (Math.abs(best) < 8) tz = Math.sign(best) * 1.6;
            B.Matrix.ComposeToRef(tmpV.set(1, 1, 1), ID, tmpP.set(e[0], 0.12, e[1] + tz), tmpM);
            c++;
          } else B.Matrix.ComposeToRef(tmpV.set(0, 0, 0), ID, tmpP.set(0, -20, 0), tmpM);
          tmpM.copyToArray(FOG.shaftBuf, i * 16);
        }
        FOG.shaft.thinInstanceBufferUpdated("matrix");
        stats.shafts = c;
      }
    } else stats.shafts = 0;
    /* headlights: the cars near the camera cut a cone */
    const headA = F.k * (0.28 + 0.72 * lampK);
    const cars = show ? d.cars() || [] : [];
    const cap = quality === "low" ? 4 : 10;
    let cn = 0;
    const list = [];
    for (let i = 0; i < cars.length; i++) {
      const dx = cars[i].x - f.x;
      const dz = cars[i].z - f.z;
      const dist = dx * dx + dz * dz;
      if (dist < 70 * 70 && Number.isFinite(cars[i].yaw)) list.push([dist, cars[i]]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < 10; i++) {
      if (i < Math.min(cap, list.length)) {
        const c = list[i][1];
        const q = B.Quaternion.FromEulerAngles(0.04, c.yaw, 0);
        // the cone's centre is 7 m ahead of the lamps; its narrow end is at the car's nose
        B.Matrix.ComposeToRef(tmpV.set(1, 1, 1), q, tmpP.set(c.x + Math.sin(c.yaw) * 9.1, 0.75, c.z + Math.cos(c.yaw) * 9.1), tmpM);
        cn++;
      } else B.Matrix.ComposeToRef(tmpV.set(0, 0, 0), ID, tmpP.set(0, -20, 0), tmpM);
      tmpM.copyToArray(FOG.coneBuf, i * 16);
    }
    FOG.cone.isVisible = headA > 0.02 && cn > 0;
    FOG.cone.thinInstanceBufferUpdated("matrix");
    FOG.cone.material.emissiveColor.set(headA * 0.6, headA * 0.57, headA * 0.48);
    stats.cones = cn;
  }

  /* ---- the frame ---- */
  function gust(power, dir) {
    W.gust = Math.max(W.gust, power === "tornado" ? 1.4 : 1);
    W.gusts++;
    W.lastGustAt = W.t;
    if (dir && Number.isFinite(dir.x) && Number.isFinite(dir.z)) {
      const l = Math.hypot(dir.x, dir.z) || 1;
      W.tx = dir.x / l; W.tz = dir.z / l;
    }
  }
  function update(dt, ctx) {
    dt = clamp(dt || 0, 0, 0.1);
    const c = ctx || {};
    const q = d.quality();
    if (q !== quality) { quality = q; cnt = counts(q); }
    W.t += dt;
    W.ambient = c.wind != null ? c.wind : W.ambient;
    F.density = c.fog != null ? c.fog : F.density;
    W.gust *= Math.exp(-dt / GUST_TAU);
    if (W.gust < 0.002) W.gust = 0;
    // the direction turns toward the cast's, never snaps
    const turn = 1 - Math.exp(-dt / 0.35);
    W.dx += (W.tx - W.dx) * turn; W.dz += (W.tz - W.dz) * turn;
    const l = Math.hypot(W.dx, W.dz) || 1;
    W.dx /= l; W.dz /= l;
    if (W.gust === 0) { // drift back to the prevailing wind
      const back = 1 - Math.exp(-dt / 6);
      W.tx += (prevailing[0] - W.tx) * back; W.tz += (prevailing[1] - W.tz) * back;
    }
    const want = windStrength(W.ambient, W.gust);
    W.k += (want - W.k) * (1 - Math.exp(-dt / (want > W.k ? 0.18 : 0.6)));
    U.x = W.dx; U.y = W.dz; U.z = W.k; U.w = W.t % 600;
    const f = d.focus();
    const cam = d.cameraPos();
    const sky = d.sky();
    stepRibbons(dt, f, cam, W.k);
    LV.t += dt;
    stepLeaves(dt, f, W.k);
    // flags stream downwind
    const yawWant = Math.atan2(-W.dz, W.dx);
    flags.forEach((fl) => {
      let dy = yawWant - fl.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      fl.yaw += dy * (1 - Math.exp(-dt / 0.5));
      fl.mesh.rotation.y = fl.yaw;
    });
    cloths.forEach((cl) => cl.step(dt, U, W.dx, W.dz));
    stepFog(dt, f, cam, sky);
  }

  const api = {
    update,
    gust,
    /** The wind's total strength now (0..1.6); js/crowd.js flips umbrellas at it. */
    strength: () => W.k,
    direction: () => ({ x: W.dx, z: W.dz }),
    fogK: () => F.k,
    note(n) { W.flips += n || 0; },
    info() {
      return {
        quality, wind: Number(W.k.toFixed(3)), gust: Number(W.gust.toFixed(3)), gusts: W.gusts, dir: [Number(W.dx.toFixed(3)), Number(W.dz.toFixed(3))],
        ambient: W.ambient, fog: Number(F.k.toFixed(3)), bank: Number(F.bank.toFixed(3)), flips: W.flips,
        ribbons: stats.ribbons, leaves: stats.leaves, swirling: stats.swirling || 0, flags: stats.flags, laundry: stats.laundry, cloth: stats.cloth,
        clothSpread: cloths.map((c) => Number(c.spread().toFixed(2))), plugins: stats.plugins,
        slices: stats.slices, visibleSlices: FOG.slices.filter((s) => s.mesh.isVisible).length, veils: stats.veils, shafts: stats.shafts, cones: stats.cones,
        bent: [...bent].filter(Boolean).map((m) => m.name),
      };
    },
    counts: () => ({ ...cnt }),
    dispose() { hold.forEach((m) => { try { m.dispose(); } catch (e) { /* gone */ } }); },
  };
  return api;
}

/* ---------------- on the page ---------------- */

function install(world) {
  const B = window.BABYLON;
  const day = window.day;
  const scene = world.scene;
  const cfg = (window.DAY_CONFIG && window.DAY_CONFIG.windfog) || {};
  const city = (window.DAY_CONFIG && window.DAY_CONFIG.city) || {};
  const fx = createWindFog(B, scene, {
    cfg,
    quality: () => (world.look && world.look.quality ? world.look.quality() : "high"),
    focus: () => {
      const cam = scene.activeCamera;
      const t = cam && cam.target ? cam.target : cam && cam.position ? cam.position : { x: 0, y: 1, z: 0 };
      return { x: t.x, y: t.y, z: t.z };
    },
    cameraPos: () => {
      const cam = scene.activeCamera;
      const p = cam && cam.globalPosition ? cam.globalPosition : cam && cam.position ? cam.position : { x: 0, y: 5, z: 0 };
      return { x: p.x, y: p.y, z: p.z };
    },
    sky: () => (world.look && world.look.info ? world.look.info().sky : null) || { day: 1, dusk: 0, night: 0 },
    cars: () => (day.crowd && day.crowd.positions ? day.crowd.positions().cars : []),
    lamps: () => (day.cityscape && day.cityscape.lampSpots ? day.cityscape.lampSpots() : []),
    blocks: city.blocks || [],
    avenues: (city.avenues || []).map((a) => a.z),
  });
  world.__windfog = fx;
  const engine = scene.getEngine();
  scene.onBeforeRenderObservable.add(() => {
    const w = window.weather && window.weather.now ? window.weather.now() : null;
    fx.update(engine.getDeltaTime() / 1000, { wind: w ? w.wind : 0, fog: w ? w.fog : 0 });
  });
  window.addEventListener("day:power", (e) => {
    const dt = (e && e.detail) || {};
    if (dt.action === "denied") return;
    if (dt.action !== "gust" && dt.action !== "gale" && dt.action !== "tornado" && dt.action !== "wind") return;
    const p = window.powers && window.powers.now ? window.powers.now() : null;
    let dir = p && p.gust ? { x: p.gust.dirX, z: p.gust.dirZ } : null;
    if (!dir && world.camera && Number.isFinite(world.camera.alpha)) dir = { x: -Math.cos(world.camera.alpha), z: -Math.sin(world.camera.alpha) };
    fx.gust(dt.action, dir);
    window.dispatchEvent(new CustomEvent("day:wind", { detail: { action: "gust", power: dt.action, strength: fx.strength() } }));
  });
  window.addEventListener("day:weather", (e) => {
    const s = e && e.detail && e.detail.state;
    if (s === "fog" || s === "wind") window.dispatchEvent(new CustomEvent("day:wind", { detail: { action: s === "fog" ? "fog" : "wind" } }));
  });
  if (day) day.windfog = fx;
  window.windfog = fx;
  return fx;
}

const live = typeof window !== "undefined" && window.day && window.day.world && window.day.world();
if (live && live.scene && !live.__windfog) install(live);
