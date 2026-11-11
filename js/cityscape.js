/* ==========================================================================
   The city's density (J: dense and full like PH Origins' Going Home city).
   Read after js/look.js. Everything is generated, nothing is downloaded:

   - Facades: four procedural styles (brick, concrete, glass curtain, stone), each a canvas
     texture of window bays with a matching emissive "lit windows" map. The shells of
     day.config.js `city.blocks` wear them (blocks and their roof/stair data are untouched).
   - Fillers: the lots between the avenues and cross streets that no block, house, park or
     lot uses get buildings of varied height and style, merged into a few meshes per region
     (a handful of draw calls). Inner ones get colliders; the outer ring is only seen.
   - Shopfronts: a lit ground-floor band round each filler and block.
   - Skyline: a ring of tall towers 130-230 m out, with red aircraft lights, so the horizon
     is never empty; the base plane under them is a dark city floor.
   - Streets: crosswalks and stop lines at every junction, centre dashes and edge lines on
     the side streets, and street lamps with a light pool on the road along all of them.
   - Night: windows, shopfronts, skyline and lamps follow look.js's sky weights, so they
     come on at dusk (about half lit as the sun goes) and are full at night, and come on in
     a storm too. `day.cityscape.info()` says what is lit.
   Quality low drops the outer fill and the skyline's far half.
   ========================================================================== */
const B = window.BABYLON;
import { installProps, reserved } from "./props.js";
import { runCityAudit } from "./city-audit.js";
let world = null;

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE_W = 24; // metres of wall one facade texture covers: 8 bays of 3 m
const TILE_H = 25.6; // 8 floors of 3.2 m
const BAYS = 8;
const FLOORS = 8;
const CELL = 64; // px per bay/floor in the 512 px texture
const SHOP_W = 12; // shopfront texture: 4 shops of 3 m
const SHOP_H = 3.2;

const STYLES = [
  { id: "brick", wall: "#5d4240", wall2: "#4a3436", pane: "#16202e", sill: "#8a7f74", w: 36, h: 44, lit: 0.55, warm: 0.7 },
  { id: "concrete", wall: "#69727c", wall2: "#59616b", pane: "#18222f", sill: "#9aa3ab", w: 50, h: 28, lit: 0.5, warm: 0.5 },
  { id: "glass", wall: "#1c2532", wall2: "#161d29", pane: "#233a56", sill: "#0e141d", w: 58, h: 54, lit: 0.45, warm: 0.3 },
  { id: "stone", wall: "#8c8472", wall2: "#767061", pane: "#1b2431", sill: "#b3ab99", w: 26, h: 42, lit: 0.6, warm: 0.85 },
];

function canvasTexture(name, w, h, draw) {
  const tex = new B.DynamicTexture(name, { width: w, height: h }, world.scene, true);
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.update(true);
  tex.wrapU = B.Texture.WRAP_ADDRESSMODE;
  tex.wrapV = B.Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

/* One facade style: the albedo (wall + dark panes) and the emissive map (only the lit panes). */
function facadeTextures(st, seed) {
  const rng = makeRng(seed);
  const lit = [];
  for (let f = 0; f < FLOORS; f++) {
    for (let b = 0; b < BAYS; b++) lit.push(rng() < st.lit ? (rng() < st.warm ? 1 : 2) : 0);
  }
  const rect = (b, f) => {
    const x = b * CELL + (CELL - st.w) / 2;
    const y = (FLOORS - 1 - f) * CELL + (CELL - st.h) / 2; // floor 0 is the bottom row
    return [x, y, st.w, st.h];
  };
  const albedo = canvasTexture("facade-" + st.id, 512, 512, (g, W, H) => {
    g.fillStyle = st.wall;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rng() < 0.5 ? st.wall2 : st.wall;
      g.globalAlpha = 0.35;
      g.fillRect(rng() * W, rng() * H, 2 + rng() * 6, 1 + rng() * 3);
    }
    g.globalAlpha = 1;
    if (st.id === "brick") {
      g.fillStyle = "rgba(20,14,14,0.35)";
      for (let y = 0; y < H; y += 8) g.fillRect(0, y, W, 1);
    }
    for (let f = 0; f < FLOORS; f++) {
      g.fillStyle = st.wall2;
      g.fillRect(0, (FLOORS - 1 - f) * CELL + CELL - 5, W, 5); // floor slab line
      for (let b = 0; b < BAYS; b++) {
        const [x, y, w, h] = rect(b, f);
        g.fillStyle = st.sill;
        g.fillRect(x - 3, y + h, w + 6, 4);
        const k = rng();
        g.fillStyle = st.pane;
        g.fillRect(x, y, w, h);
        g.fillStyle = "rgba(150,190,230," + (0.1 + k * 0.18).toFixed(2) + ")"; // daylight sheen on the pane
        g.fillRect(x, y, w, h * (0.35 + k * 0.3));
        g.fillStyle = "rgba(10,14,20,0.8)";
        g.fillRect(x + w / 2 - 1, y, 2, h); // mullion
      }
    }
  });
  const emissive = canvasTexture("facade-lit-" + st.id, 512, 512, (g, W, H) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    for (let f = 0; f < FLOORS; f++) {
      for (let b = 0; b < BAYS; b++) {
        const kind = lit[f * BAYS + b];
        if (!kind) continue;
        const [x, y, w, h] = rect(b, f);
        const grd = g.createLinearGradient(0, y, 0, y + h);
        if (kind === 1) {
          grd.addColorStop(0, "#ffd998");
          grd.addColorStop(1, "#ff9c52");
        } else {
          grd.addColorStop(0, "#bfe6ff");
          grd.addColorStop(1, "#6fb8f0");
        }
        g.globalAlpha = 0.55 + rng() * 0.45;
        g.fillStyle = grd;
        g.fillRect(x, y, w, h);
        g.globalAlpha = 1;
        g.fillStyle = "#000"; // mullion
        g.fillRect(x + w / 2 - 1, y, 2, h);
      }
    }
  });
  return { albedo, emissive };
}

/* Ground-floor shops: dark glass, a warm lit interior, a coloured awning and a neon sign strip. */
function shopTextures(seed) {
  const rng = makeRng(seed);
  const W = 512;
  const H = 128;
  const awn = ["#9b3a3a", "#2f6f8f", "#c08a2e", "#3d7a58", "#7a4a8a"];
  const shops = [0, 1, 2, 3].map(() => ({ awn: awn[Math.floor(rng() * awn.length)], on: rng() < 0.85, sign: ["#3ecbff", "#ff4d8d", "#ffd36a", "#8eff9f"][Math.floor(rng() * 4)] }));
  const draw = (emit) => (g) => {
    g.fillStyle = emit ? "#000" : "#2a2e34";
    g.fillRect(0, 0, W, H);
    shops.forEach((s, i) => {
      const x = i * 128;
      if (!emit) {
        g.fillStyle = "#12171e";
        g.fillRect(x + 6, 40, 116, 88);
        g.fillStyle = s.awn;
        g.fillRect(x + 2, 24, 124, 18);
        g.fillStyle = "rgba(160,200,230,0.18)";
        g.fillRect(x + 8, 46, 58, 74);
        g.fillStyle = "#1a1e24";
        g.fillRect(x + 78, 52, 30, 76); // door
        g.fillStyle = "#cfd6db";
        g.fillRect(x + 4, 4, 120, 16); // sign board
      } else if (s.on) {
        const grd = g.createLinearGradient(0, 46, 0, 124);
        grd.addColorStop(0, "#ffe2a8");
        grd.addColorStop(1, "#ff9a4c");
        g.fillStyle = grd;
        g.fillRect(x + 8, 46, 58, 74);
        g.fillRect(x + 84, 56, 18, 64);
        g.fillStyle = s.sign;
        g.fillRect(x + 12, 8, 100, 8);
        g.fillStyle = s.awn;
        g.globalAlpha = 0.35;
        g.fillRect(x + 2, 24, 124, 18);
        g.globalAlpha = 1;
      }
    });
  };
  return { albedo: canvasTexture("shopfront", W, H, draw(false)), emissive: canvasTexture("shopfront-lit", W, H, draw(true)) };
}

/* ---------------- geometry: boxes with world-aligned UVs, merged ---------------- */
class Batch {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  /* mode "facade": u = metres / TILE_W + du, v = metres / TILE_H + dv; "shop": v = y / SHOP_H; roof/floor sample the plain wall corner. */
  box(cx, cz, w, d, y0, y1, mode, du, dv, tint) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const faces = [
      // normal, then 4 corners (x, y, z) counter-clockwise seen from outside, then the horizontal coord index
      [[0, 0, 1], [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]], 0],
      [[0, 0, -1], [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 0],
      [[1, 0, 0], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], 2],
      [[-1, 0, 0], [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], 2],
      [[0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], -1],
    ];
    const tw = mode === "shop" ? SHOP_W : TILE_W;
    const th = mode === "shop" ? SHOP_H : TILE_H;
    faces.forEach(([n, c, axis]) => {
      const base = this.pos.length / 3;
      c.forEach((p) => {
        this.pos.push(p[0], p[1], p[2]);
        this.nrm.push(n[0], n[1], n[2]);
        if (axis < 0) this.uv.push(0.012, mode === "shop" ? 0.985 : 0.012);
        else this.uv.push(p[axis] / tw + du, p[1] / th + dv);
        this.col.push(tint[0], tint[1], tint[2], 1);
      });
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
  }
  get empty() {
    return !this.pos.length;
  }
  mesh(name, material) {
    const m = new B.Mesh(name, world.scene);
    const vd = new B.VertexData();
    vd.positions = this.pos;
    vd.normals = this.nrm;
    vd.uvs = this.uv;
    vd.colors = this.col;
    vd.indices = this.idx;
    vd.applyToMesh(m);
    m.material = material;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = false;
    m.freezeWorldMatrix();
    return m;
  }
}

export function installCityscape(w) {
  world = w;
  if (w && w.cityscape) return w.cityscape;
  if (!world || !world.scene || !B) return null;
  const scene = world.scene;
  const cfg = window.DAY_CONFIG || {};
  const city = cfg.city || { avenues: [], crosses: [], blocks: [], park: null };
  const street = cfg.street || { z: 12.6, from: -48, to: 210 };
  const RZ = street.z;
  const look = world.look || (window.day && window.day.look);
  const low = () => !!look && look.quality && look.quality() === "low";
  const rng = makeRng(77031);
  const lowStart = low();

  /* ---------------- materials ---------------- */
  const facadeMats = STYLES.map((st, i) => {
    const t = facadeTextures(st, 900 + i * 31);
    const m = new B.StandardMaterial("facade-" + st.id, scene);
    m.diffuseTexture = t.albedo;
    m.emissiveTexture = t.emissive;
    m.emissiveColor = new B.Color3(0, 0, 0);
    m.diffuseColor = new B.Color3(1.35, 1.35, 1.35); // lifts the walls: shaded faces were near-black
    m.specularColor = new B.Color3(0.05, 0.05, 0.06);
    m.maxSimultaneousLights = 4;
    return m;
  });
  const shopTex = shopTextures(4242);
  const shopMat = new B.StandardMaterial("shopfront", scene);
  shopMat.diffuseTexture = shopTex.albedo;
  shopMat.emissiveTexture = shopTex.emissive;
  shopMat.emissiveColor = new B.Color3(0, 0, 0);
  shopMat.specularColor = new B.Color3(0.08, 0.08, 0.1);
  shopMat.maxSimultaneousLights = 4;

  const skyTex = facadeTextures(STYLES[2], 5150);
  const skyMat = new B.StandardMaterial("skyline", scene);
  skyMat.diffuseTexture = skyTex.albedo;
  skyMat.emissiveTexture = skyTex.emissive;
  skyMat.emissiveColor = new B.Color3(0, 0, 0);
  skyMat.specularColor = new B.Color3(0, 0, 0);
  skyMat.maxSimultaneousLights = 2;
  skyMat.fogEnabled = true; // by day only: switched off at dusk below so the far lights stay bright at night

  /* ---------------- what's free to build on ---------------- */
  const homeB = cfg.buildings && cfg.buildings.home;
  const officeB = cfg.buildings && cfg.buildings.office;
  const fixed = [];
  [homeB, officeB].forEach((b) => {
    if (!b || !b.bounds) return;
    const o = b.origin || [0, 0];
    fixed.push([b.bounds[0] + o[0] - 4, b.bounds[1] + o[1] - 4, b.bounds[2] + o[0] + 4, b.bounds[3] + o[1] + 4]);
  });
  fixed.push([-12, 2, 16, 12]); // his yard and driveway
  const officeO = (officeB && officeB.origin) || [128, 0];
  fixed.push([officeO[0] - 3, 3, officeO[0] + 22, RZ + 1]); // the work lot
  if (city.park) fixed.push([city.park.x0 - 3, city.park.z0 - 3, city.park.x1 + 3, city.park.z1 + 3]);
  fixed.push([-16, -6.5, 43, 7.5]); // the roof-to-roof glide corridor (apt to shop)
  fixed.push([street.from + 30 - 5, street.z + 40 - 5, street.from + 30 + 5, street.z + 40 + 5]); // the check's open grass
  reserved(cfg).rects.forEach((r) => fixed.push(r)); // the plaza and the landmarks (js/props.js)
  const solids = world.solids || [];
  function blocked(x0, z0, x1, z1, pad) {
    for (let i = 0; i < fixed.length; i++) {
      const f = fixed[i];
      if (x1 > f[0] && x0 < f[2] && z1 > f[1] && z0 < f[3]) return true;
    }
    return hitsSolid(x0, z0, x1, z1, pad);
  }
  function hitsSolid(x0, z0, x1, z1, pad) {
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      const p = s.roll ? 3.6 : pad;
      if (x1 > s.x - s.w / 2 - p && x0 < s.x + s.w / 2 + p && z1 > s.z - s.d / 2 - p && z0 < s.z + s.d / 2 + p) return true;
    }
    return false;
  }

  /* ---------------- fillers ---------------- */
  const crossXs = (city.crosses || []).map((c) => c.x).sort((a, b) => a - b);
  const avZs = [RZ].concat((city.avenues || []).map((a) => a.z)).filter((z, i, a) => a.indexOf(z) === i).sort((a, b) => a - b);
  const GX0 = -48;
  const GX1 = 210;
  const GZ0 = -48;
  const GZ1 = 90;
  const OUT = lowStart ? 60 : 150; // how far past the street grid the fill goes
  const xl = [GX0 - OUT].concat(GX0, crossXs, GX1, GX1 + OUT);
  const zl = [GZ0 - OUT].concat(GZ0, avZs, GZ1, GZ1 + OUT);
  const downtown = { x: 100, z: 50 };
  const setX = 5.8;
  const setZ = 5.8;
  const chunks = {}; // key -> { facade: Batch[4], shop: Batch, near }
  function chunkFor(x, z) {
    const key = Math.floor(x / 140) + "," + Math.floor(z / 140);
    if (!chunks[key]) chunks[key] = { facade: STYLES.map(() => new Batch()), shop: new Batch(), cx: x, cz: z };
    return chunks[key];
  }
  const newSolids = [];
  const fillerList = []; // the lots built on, for the rooftops and shop signs (js/props.js)
  const stats = { fillers: 0, tall: 0, blocks: 0 };
  function addBuilding(x, z, w, d, h, styleIdx, shop, collide) {
    const c = chunkFor(x, z);
    const tint = [0.78 + rng() * 0.4, 0.78 + rng() * 0.4, 0.78 + rng() * 0.4];
    const du = rng();
    const dv = Math.floor(rng() * FLOORS) / FLOORS;
    c.facade[styleIdx].box(x, z, w, d, 0, h, "facade", du, dv, tint);
    if (shop) c.shop.box(x, z, w + 0.14, d + 0.14, 0, SHOP_H, "shop", rng(), 0, [1, 1, 1]);
    // roof clutter: a plant box, a water tank, an antenna on the tall ones
    const roofTint = [0.55, 0.57, 0.6];
    if (rng() < 0.7) {
      const bw = Math.min(w * 0.3, 2 + rng() * 2.5);
      const bd = Math.min(d * 0.3, 2 + rng() * 2.5);
      c.facade[styleIdx].box(x + (rng() - 0.5) * w * 0.4, z + (rng() - 0.5) * d * 0.4, bw, bd, h, h + 1 + rng() * 1.4, "facade", 0, 0, roofTint);
    }
    if (h > 22) c.facade[styleIdx].box(x + (rng() - 0.5) * w * 0.3, z + (rng() - 0.5) * d * 0.3, 0.4, 0.4, h, h + 5 + rng() * 6, "facade", 0, 0, roofTint);
    fillerList.push({ x, z, w, d, h, near: !!collide });
    stats.fillers++;
    if (h > 20) stats.tall++;
    if (collide) newSolids.push({ x, y: h / 2, z, w, h, d });
  }
  function heightFor(x, z) {
    const dist = Math.hypot((x - downtown.x) / 1.1, (z - downtown.z) / 0.8);
    const core = Math.max(0, 1 - dist / 170); // 1 downtown, 0 far out
    const r = rng();
    let h = 5 + r * r * 14 + core * (6 + rng() * 34);
    if (rng() < 0.08 + core * 0.12) h += 14 + rng() * 26; // an occasional tower
    return Math.round(h * 10) / 10;
  }
  function styleFor(h) {
    const r = rng();
    if (h > 26) return r < 0.7 ? 2 : 1;
    if (h > 14) return r < 0.4 ? 2 : r < 0.7 ? 1 : 3;
    return r < 0.4 ? 0 : r < 0.7 ? 3 : 1;
  }
  for (let i = 0; i < xl.length - 1; i++) {
    for (let j = 0; j < zl.length - 1; j++) {
      const inner = i > 0 && i < xl.length - 2 && j > 0 && j < zl.length - 2;
      const ax0 = xl[i] + (i === 0 ? 0 : setX);
      const ax1 = xl[i + 1] - (i === xl.length - 2 ? 0 : setX);
      const az0 = zl[j] + (j === 0 ? 0 : setZ);
      const az1 = zl[j + 1] - (j === zl.length - 2 ? 0 : setZ);
      if (ax1 - ax0 < 7 || az1 - az0 < 7) continue;
      // rows of lots across the cell
      let z = az0;
      while (z < az1 - 7) {
        const d = Math.min(az1 - z, 9 + rng() * 6);
        let x = ax0;
        while (x < ax1 - 6) {
          const w = Math.min(ax1 - x, 8 + rng() * 8);
          const cx = x + w / 2;
          const cz = z + d / 2;
          const bw = w - 0.8 - rng() * 1.4;
          const bd = d - 0.8 - rng() * 1.4;
          x += w;
          if (bw < 5 || bd < 5) continue;
          const h0 = heightFor(cx, cz);
          const empty = rng() < (inner ? 0.1 : 0.2);
          if (empty) continue;
          if (blocked(cx - bw / 2, cz - bd / 2, cx + bw / 2, cz + bd / 2, 0.8)) continue;
          const near = cx > -90 && cx < 255 && cz > -90 && cz < 135;
          addBuilding(cx, cz, bw, bd, h0, styleFor(h0), inner || near, near);
        }
        z += d;
      }
    }
  }
  /* the hand-placed blocks: their shells wear a facade and a shopfront (the data and stairs are unchanged) */
  (city.blocks || []).forEach((b, i) => {
    const shell = scene.getMeshByName("block-" + b.id);
    const styleIdx = b.h >= 10 ? 2 : [0, 3, 1][i % 3];
    const c = chunkFor(b.x, b.z);
    const t = [0.9 + (i % 3) * 0.07, 0.9 + ((i + 1) % 3) * 0.07, 0.9 + ((i + 2) % 3) * 0.07];
    if (shell) shell.setEnabled(false);
    c.facade[styleIdx].box(b.x, b.z, b.w, b.d, 0, b.h - 0.05, "facade", (i * 0.37) % 1, 0, t);
    /* No shopfront band on a block with a roof ramp: the ramp climbs the north face through the band, so its lit sign
       strip (waist height beside the walker) read as a glowing slab floating beside the ramp. */
    if (b.h > 3.4 && !b.stair) c.shop.box(b.x, b.z, b.w + 0.14, b.d + 0.14, 0, SHOP_H, "shop", (i * 0.21) % 1, 0, [1, 1, 1]);
    stats.blocks++;
  });
  const bwin = scene.getMeshByName("bwin");
  if (bwin) bwin.setEnabled(false); // the old flat window quads: the facade has real ones now
  if (newSolids.length) world.addSolids(newSolids);

  const meshes = { facade: [], shop: [] };
  Object.keys(chunks).forEach((key) => {
    const c = chunks[key];
    c.facade.forEach((bt, i) => {
      if (bt.empty) return;
      const m = bt.mesh("city-" + STYLES[i].id + "-" + key, facadeMats[i]);
      m.receiveShadows = Math.abs(c.cx - 90) < 140;
      meshes.facade.push(m);
    });
    if (!c.shop.empty) meshes.shop.push(c.shop.mesh("city-shops-" + key, shopMat));
  });

  /* ---------------- the base plane and the skyline ---------------- */
  const base = B.MeshBuilder.CreateGround("city-base", { width: 1400, height: 1400 }, scene);
  base.position.set(84, -0.1, 20);
  const baseMat = new B.StandardMaterial("city-base", scene);
  baseMat.diffuseColor = new B.Color3(0.075, 0.095, 0.1);
  baseMat.specularColor = new B.Color3(0, 0, 0);
  base.material = baseMat;
  base.isPickable = false;
  base.freezeWorldMatrix();

  const sky = new Batch();
  const beacons = new Batch();
  const ring = lowStart ? 28 : 64;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + (rng() - 0.5) * 0.08;
    const r = 130 + rng() * 100;
    const x = 84 + Math.cos(a) * r * 1.15;
    const z = 20 + Math.sin(a) * r * 0.85;
    if (x > GX0 - OUT * 0.3 && x < GX1 + OUT * 0.3 && z > GZ0 - OUT * 0.3 && z < GZ1 + OUT * 0.3 && rng() < 0.7) continue;
    const w = 14 + rng() * 22;
    const d = 14 + rng() * 22;
    const h = 40 + rng() * rng() * 130;
    sky.box(x, z, w, d, 0, h, "facade", rng(), Math.floor(rng() * FLOORS) / FLOORS, [0.9, 0.95, 1]);
    if (h > 80) beacons.box(x, z, 1.2, 1.2, h + 2, h + 3.2, "facade", 0, 0, [1, 1, 1]);
  }
  const skyline = sky.empty ? null : sky.mesh("city-skyline", skyMat);
  const beaconMat = new B.StandardMaterial("beacon", scene);
  beaconMat.diffuseColor = new B.Color3(0.3, 0.02, 0.02);
  beaconMat.emissiveColor = new B.Color3(0, 0, 0);
  beaconMat.disableLighting = true;
  beaconMat.fogEnabled = false;
  if (!beacons.empty) beacons.mesh("city-beacons", beaconMat);

  /* ---------------- streets: crosswalks, lane lines, lamps ---------------- */
  const paintM = new B.StandardMaterial("road-paint", scene);
  paintM.diffuseColor = new B.Color3(0.86, 0.84, 0.76);
  paintM.emissiveColor = new B.Color3(0.1, 0.1, 0.09);
  paintM.specularColor = new B.Color3(0.05, 0.05, 0.05);
  const yelM = new B.StandardMaterial("road-yellow", scene);
  yelM.diffuseColor = new B.Color3(0.82, 0.62, 0.16);
  yelM.emissiveColor = new B.Color3(0.1, 0.07, 0.01);
  yelM.specularColor = new B.Color3(0.04, 0.04, 0.03);
  const mkInst = (name, w, h, d, m) => {
    const mesh = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.material = m;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.thinInstanceEnablePicking = false;
    return mesh;
  };
  const zebraX = mkInst("zebra-x", 2.6, 0.012, 0.42, paintM); // stripes of a crosswalk on an east-west road (cars drive along x)
  const zebraZ = mkInst("zebra-z", 0.42, 0.012, 2.6, paintM);
  const stopX = mkInst("stop-x", 0.4, 0.012, 4.0, paintM);
  const stopZ = mkInst("stop-z", 4.0, 0.012, 0.4, paintM);
  const dashX = mkInst("lane-x", 1.8, 0.012, 0.12, yelM);
  const dashZ = mkInst("lane-z", 0.12, 0.012, 1.8, yelM);
  const edgeX = mkInst("edge-x", 1, 0.012, 0.09, paintM);
  const edgeZ = mkInst("edge-z", 0.09, 0.012, 1, paintM);
  const T = (x, y, z, sx, sy, sz) => B.Matrix.Compose(new B.Vector3(sx || 1, sy || 1, sz || 1), B.Quaternion.Identity(), new B.Vector3(x, y, z));
  const roads = [];
  const avs = [{ z: RZ, from: street.from, to: street.to, main: true }].concat((city.avenues || []).filter((a) => Math.abs(a.z - RZ) > 1));
  let crossings = 0;
  avs.forEach((a) => crossXs.forEach((cx) => {
    if (cx < a.from + 4 || cx > a.to - 4) return;
    const crs = (city.crosses || []).find((c) => c.x === cx);
    if (!crs || a.z < crs.from || a.z > crs.to) return;
    crossings++;
    // crosswalks: west and east of the junction across the avenue, north and south across the cross street
    [-1, 1].forEach((s) => {
      // bars run the way people walk (across the road) and stack along it, 0.55 m apart, none touching the stop line
      for (let k = -2; k <= 2; k++) {
        zebraZ.thinInstanceAdd(T(cx + s * 3.5 + k * 0.55, 0.05, a.z, 1, 1, 1.6));
        zebraX.thinInstanceAdd(T(cx, 0.05, a.z + s * 3.5 + k * 0.55, 1.6, 1, 1));
      }
      stopX.thinInstanceAdd(T(cx + s * 5.1, 0.05, a.z - s * 1.05, 1, 1, 0.5));
      stopZ.thinInstanceAdd(T(cx + s * 1.05, 0.05, a.z + s * 5.1, 0.5, 1, 1));
    });
  }));
  const nearJunction = (v, lines, pad) => lines.some((l) => Math.abs(v - l) < pad);
  avs.forEach((a) => {
    if (!a.main) for (let x = a.from + 1; x < a.to; x += 6) if (!nearJunction(x, crossXs, 7)) dashX.thinInstanceAdd(T(x, 0.05, a.z));
    // edge lines between junctions
    const cuts = crossXs.filter((c) => c >= a.from + 4 && c <= a.to - 4); // where the crosswalks are
    const pts = [a.from].concat(cuts, [a.to]);
    for (let p = 0; p < pts.length - 1; p++) {
      const x0 = pts[p] + (p === 0 ? 1 : 6.4);
      const x1 = pts[p + 1] - (p === pts.length - 2 ? 1 : 6.4);
      if (x1 - x0 < 3) continue;
      [-1.95, 1.95].forEach((o) => edgeX.thinInstanceAdd(T((x0 + x1) / 2, 0.05, a.z + o, x1 - x0, 1, 1)));
    }
    roads.push({ along: "x", c: a.z, from: a.from, to: a.to, main: !!a.main });
  });
  (city.crosses || []).forEach((c) => {
    const zs = avs.map((a) => a.z).filter((z) => z > c.from && z < c.to).sort((a, b) => a - b);
    for (let z = c.from + 1; z < c.to; z += 6) if (!nearJunction(z, zs, 7)) dashZ.thinInstanceAdd(T(c.x, 0.05, z));
    const pts = [c.from].concat(zs, [c.to]);
    for (let p = 0; p < pts.length - 1; p++) {
      const z0 = pts[p] + (p === 0 ? 1 : 6.4);
      const z1 = pts[p + 1] - (p === pts.length - 2 ? 1 : 6.4);
      if (z1 - z0 < 3) continue;
      [-1.95, 1.95].forEach((o) => edgeZ.thinInstanceAdd(T(c.x + o, 0.05, (z0 + z1) / 2, 1, 1, z1 - z0)));
    }
    roads.push({ along: "z", c: c.x, from: c.from, to: c.to, main: false });
  });

  /* lamps: a post and head on the kerb, a light pool on the road below; on every road, 22 m apart, alternating sides */
  const poleM = new B.StandardMaterial("cs-pole", scene);
  poleM.diffuseColor = new B.Color3(0.2, 0.22, 0.25);
  poleM.specularColor = new B.Color3(0.05, 0.05, 0.05);
  const headM = new B.StandardMaterial("cs-lamphead", scene);
  headM.diffuseColor = new B.Color3(0.9, 0.85, 0.7);
  headM.emissiveColor = new B.Color3(0, 0, 0);
  headM.disableLighting = false;
  const poolTex = canvasTexture("cs-pool", 128, 128, (g, W, H) => {
    const grd = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
    grd.addColorStop(0, "rgba(255,230,170,0.95)");
    grd.addColorStop(0.45, "rgba(255,200,120,0.4)");
    grd.addColorStop(1, "rgba(255,190,110,0)");
    g.clearRect(0, 0, W, H);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  });
  poolTex.hasAlpha = true;
  const poolM = new B.StandardMaterial("cs-poolmat", scene);
  poolM.diffuseTexture = poolTex;
  poolM.useAlphaFromDiffuseTexture = true;
  poolM.emissiveTexture = poolTex;
  poolM.emissiveColor = new B.Color3(0, 0, 0);
  poolM.disableLighting = true;
  poolM.alphaMode = B.Engine.ALPHA_ADD;
  poolM.backFaceCulling = false;
  poolM.zOffset = -2;
  poolM.disableDepthWrite = true; // a light decal: it must not hide the one under it
  const poleMesh = B.MeshBuilder.CreateCylinder("cs-pole", { height: 4.4, diameterTop: 0.09, diameterBottom: 0.14, tessellation: 6 }, scene);
  poleMesh.position.y = 2.2;
  poleMesh.bakeCurrentTransformIntoVertices();
  poleMesh.material = poleM;
  poleMesh.isPickable = false;
  const headMesh = B.MeshBuilder.CreateBox("cs-lamphead", { width: 0.5, height: 0.12, depth: 0.32 }, scene);
  headMesh.position.set(0, 4.42, 0.35);
  headMesh.bakeCurrentTransformIntoVertices();
  headMesh.material = headM;
  headMesh.isPickable = false;
  const poolMesh = B.MeshBuilder.CreateGround("cs-pool", { width: 9, height: 9 }, scene);
  poolMesh.position.y = 0.062;
  poolMesh.bakeCurrentTransformIntoVertices();
  poolMesh.material = poolM;
  poolMesh.isPickable = false;
  poolMesh.alphaIndex = 10;
  const lampSpots = [];
  const lampSolids = [];
  let side = 0;
  roads.forEach((r) => {
    const step = r.main ? 32 : 14;
    const off = r.main ? 26 : 9;
    for (let t = r.from + off; t < r.to - 4; t += step) {
      side++;
      const s = side % 2 ? -1 : 1;
      const inter = r.along === "x" ? nearJunction(t, crossXs, 8) : nearJunction(t, avs.map((a) => a.z), 8);
      if (inter) continue;
      const off2 = 3.55 * s;
      const x = r.along === "x" ? t : r.c + off2;
      const z = r.along === "x" ? r.c + off2 : t;
      if (blocked(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0.2)) continue;
      const yaw = r.along === "x" ? (s > 0 ? Math.PI : 0) : s > 0 ? -Math.PI / 2 : Math.PI / 2;
      const m = B.Matrix.Compose(B.Vector3.One(), B.Quaternion.FromEulerAngles(0, yaw, 0), new B.Vector3(x, 0, z));
      poleMesh.thinInstanceAdd(m);
      headMesh.thinInstanceAdd(m);
      // the head hangs out over the road: put the pool under it
      const px = r.along === "x" ? x : x - s * 1.6;
      const pz = r.along === "x" ? z - s * 1.6 : z;
      poolMesh.thinInstanceAdd(T(px, 0, pz));
      lampSpots.push([x, z]);
      lampSolids.push({ x, y: 2.2, z, w: 0.28, h: 4.4, d: 0.28 });
    }
  });
  if (lampSolids.length) world.addSolids(lampSolids);
  headMesh.thinInstanceRefreshBoundingInfo(true);
  poolMesh.thinInstanceRefreshBoundingInfo(true);
  poleMesh.thinInstanceRefreshBoundingInfo(true);
  [zebraX, zebraZ, stopX, stopZ, dashX, dashZ, edgeX, edgeZ].forEach((m) => m.thinInstanceRefreshBoundingInfo(true));

  /* ---------------- props, signs, park, plaza, landmarks, rooftops (js/props.js) ---------------- */
  const props = installProps({
    world,
    blocked,
    hitsSolid,
    fillers: fillerList,
    roads,
    crossXs,
    avZs,
    lampSpots,
    canvasTexture,
    T,
    poolTexture: (color) => {
      const t = canvasTexture("cs-spill-" + color, 128, 128, (g, W, H) => {
        const grd = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
        grd.addColorStop(0, color + "e0");
        grd.addColorStop(0.5, color + "50");
        grd.addColorStop(1, color + "00");
        g.clearRect(0, 0, W, H);
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
      });
      t.hasAlpha = true;
      return t;
    },
  });

  /* ---------------- night ---------------- */
  const fogV = new B.Color3();
  let lit = { windows: 0, lamps: 0, shops: 0 };
  let acc = 1;
  function weights() {
    try {
      const i = look && look.info && look.info();
      if (i && i.sky) return i.sky;
    } catch (e) { /* not up yet */ }
    return { day: 1, dusk: 0, night: 0 };
  }
  scene.onBeforeRenderObservable.add(() => {
    acc += scene.getEngine().getDeltaTime() / 1000;
    if (acc < 0.3) return;
    acc = 0;
    const w = weights();
    // windows start around dusk and are full a little after: dusk alone is about 55%
    const windows = Math.min(1, w.dusk * 0.62 + w.night * 1.05) + 0;
    const lamps = Math.min(1, w.dusk * 0.8 + w.night * 1.1);
    const shops = Math.min(1, w.dusk * 0.7 + w.night * 1.0);
    lit = { windows, lamps, shops };
    props.update(w, lit);
    facadeMats.forEach((m) => m.emissiveColor.set(windows * 1.15, windows * 1.15, windows * 1.15));
    shopMat.emissiveColor.set(shops * 1.1, shops * 1.1, shops * 1.1);
    skyMat.emissiveColor.set(windows * 1.3, windows * 1.3, windows * 1.3);
    headM.emissiveColor.set(lamps * 1.5, lamps * 1.35, lamps * 1.05);
    poolM.emissiveColor.set(lamps * 0.85, lamps * 0.85, lamps * 0.85);
    poolM.alpha = 1;
    poolMesh.setEnabled(lamps > 0.02);
    beaconMat.emissiveColor.set(w.night * 1.3 + w.dusk * 0.7, 0, 0);
    // the skyline fades to the sky's colour by day and goes dark blue at night
    fogV.copyFrom(scene.fogColor);
    const dayK = Math.max(0, 1 - windows);
    // by day the far towers take the scene's fog like every other building (else they stay dark slabs against the pale sky);
    // once the windows come on, fog goes off so the far lights stay bright
    skyMat.fogEnabled = windows < 0.3;
    skyMat.diffuseColor.set(fogV.r * 0.55 + 0.16 * dayK, fogV.g * 0.6 + 0.18 * dayK, fogV.b * 0.65 + 0.22 * dayK);
  });

  /* the lamps stutter for a moment (the opening's first bolt: `day.cityscape.flicker(secs)`); the 0.3 s tick above restores them */
  let flickerLeft = 0;
  let flickerOn = false;
  scene.onBeforeRenderObservable.add(() => {
    if (flickerLeft <= 0) { flickerOn = false; return; }
    flickerLeft -= scene.getEngine().getDeltaTime() / 1000;
    flickerOn = true;
    const k = Math.random() < 0.45 ? 0.12 : 1;
    const l = lit.lamps;
    headM.emissiveColor.set(l * 1.5 * k, l * 1.35 * k, l * 1.05 * k);
    poolM.emissiveColor.set(l * 0.85 * k, l * 0.85 * k, l * 0.85 * k);
  });

  const api = {
    flicker(secs) { flickerLeft = Math.max(flickerLeft, secs || 1.2); return true; },
    flickering: () => flickerOn,
    /* the city audit (js/city-audit.js; scripts/check-city.mjs runs the same under the NullEngine): floating or sunk props,
       coplanar faces, bad normals, the walkable roofs' AC colliders. `day.cityscape.audit()` -> { failures, counts } */
    audit() {
      const r = runCityAudit(scene, B, cfg, { solids: world.solids });
      return { failures: r.failures, counts: r.counts };
    },
    info() {
      return {
        fillers: stats.fillers,
        tall: stats.tall,
        blocks: stats.blocks,
        chunks: Object.keys(chunks).length,
        facadeMeshes: meshes.facade.length,
        shopMeshes: meshes.shop.length,
        skylineTowers: ring,
        crossings,
        lamps: lampSpots.length,
        lit: { ...lit },
        props: props.info(),
        colliders: newSolids.length + lampSolids.length,
      };
    },
  };
  world.cityscape = api;
  if (window.day) window.day.cityscape = api;
  return api;
}

const live = window.day && window.day.world && window.day.world();
if (live) installCityscape(live);
