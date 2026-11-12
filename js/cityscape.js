/* ==========================================================================
   The city's density (J: dense and full like PH Origins' Going Home city).
   Read after js/look.js. Everything is generated, nothing is downloaded:

   - Facades: four procedural styles (brick, concrete, glass curtain, stone), each a canvas
     texture of window bays with a matching emissive "lit windows" map. The shells of
     day.config.js `city.blocks` wear them (blocks and their roof/stair data are untouched).
   - Window schedules: each bay lights on its occupants' dusk/bedtime curve (18:00 on,
     23:30 off); the apt and office blocks follow Small Weather's own day. Lit panes are
     painted as cheap interior-mapped rooms (wall, floor, furniture silhouette), not flat colour.
   - Fillers: the lots between the avenues and cross streets that no block, house, park or
     lot uses get buildings of varied height and style, merged into a few meshes per region
     (a handful of draw calls). Inner ones get colliders; the outer ring is only seen.
   - Shopfronts: a lit ground-floor band round each filler and block.
   - Skyline: a ring of tall towers 130-230 m out, with red aircraft lights, so the horizon
     is never empty; the base plane under them is a dark city floor.
   - Streets: crosswalks and stop lines at every junction, centre dashes and edge lines on
     the side streets, and street lamps with a light pool on the road along all of them.
     The 8 nearest lamps (4 on a phone) are real point lights; the rest stay emissive pools.
   - Night: windows, shopfronts, skyline and lamps follow look.js's sky weights and the
     schedules above. A lightning flicker stutters lamps and nearby windows
     (`day.cityscape.flicker`). `day.cityscape.info()` says what is lit.
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

function hash01(a, b, c) {
  let n = (a * 374761393 + b * 668265263 + (c || 0) * 1274126177) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smooth01(a, b, x) {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const TILE_W = 24; // metres of wall one facade texture covers: 8 bays of 3 m
const TILE_H = 25.6; // 8 floors of 3.2 m
const BAYS = 8;
const FLOORS = 8;
const CELL = 64; // px per bay/floor in the 512 px texture
const SHOP_W = 12; // shopfront texture: 4 shops of 3 m
const SHOP_H = 3.2;
const LAMP_DYNAMIC_HIGH = 8;
const LAMP_DYNAMIC_LOW = 4;

const STYLES = [
  { id: "brick", wall: "#5d4240", wall2: "#4a3436", pane: "#16202e", sill: "#8a7f74", w: 36, h: 44, lit: 0.55, warm: 0.7, role: "home" },
  { id: "concrete", wall: "#69727c", wall2: "#59616b", pane: "#18222f", sill: "#9aa3ab", w: 50, h: 28, lit: 0.5, warm: 0.5, role: "office" },
  { id: "glass", wall: "#1c2532", wall2: "#161d29", pane: "#233a56", sill: "#0e141d", w: 58, h: 54, lit: 0.45, warm: 0.3, role: "office" },
  { id: "stone", wall: "#8c8472", wall2: "#767061", pane: "#1b2431", sill: "#b3ab99", w: 26, h: 42, lit: 0.6, warm: 0.85, role: "home" },
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

/* Occupants' schedules: dusk on, bedtime off. Apt / office follow Small Weather's day. */
function scheduleChance(role, hour, floor, bay, seed, special) {
  const h = ((hour % 24) + 24) % 24;
  const stagger = hash01(seed, floor * 17 + bay, 3) * 0.9; // up to ~54 min
  const duskOn = smooth01(17.6 + stagger * 0.4, 19.4 + stagger * 0.5, h);
  const bedOff = 1 - smooth01(22.8 + stagger * 0.5, 24.2 + stagger * 0.4, h < 5 ? h + 24 : h);
  const dawnOff = 1 - smooth01(5.2, 7.0, h);
  let chance = 0;
  if (role === "office") {
    // Emissive night glow only: towers light at dusk (daylight glass is the albedo), hold through evening, fade after bedtime
    const evening = smooth01(17.6, 19.2, h) * (1 - smooth01(22.8, 24.2, h < 5 ? h + 24 : h));
    const graveyard = (h >= 0 && h < 5) ? 0.12 : 0;
    chance = Math.max(evening * 0.78, graveyard);
  } else {
    // homes: rise through dusk, hold early night, drop after bedtime
    chance = duskOn * bedOff * dawnOff * 0.92;
    if (h >= 0 && h < 5) chance = Math.min(chance, 0.22);
  }
  if (special === "apt") {
    let activity = "";
    let chapter = "";
    let things = {};
    try {
      const n = window.day && window.day.now && window.day.now();
      const fr = n && n.frame;
      if (fr) {
        activity = fr.activity || "";
        chapter = fr.chapter || (fr.block && fr.block.chapter) || "";
        things = fr.things || {};
      }
    } catch (e) { /* day not up */ }
    const asleep = activity === "sleep" || chapter === "sleep" || chapter === "bedtime";
    const atWork = chapter === "work" || chapter === "commute" || chapter === "lunch";
    const homeLit = things.pc === "on" || things.tv === "on" || activity === "work" || activity === "sit" || activity === "rest";
    if (asleep) chance = floor === 0 && bay % 3 === 0 ? 0.35 : 0.08; // one night light
    else if (atWork) chance = 0.12;
    else if (homeLit || chapter === "computer" || chapter === "evening") chance = Math.max(chance, 0.85);
    else chance = Math.max(chance, duskOn * 0.7);
  } else if (special === "office") {
    let officeOn = true;
    try {
      const n = window.day && window.day.now && window.day.now();
      const fr = n && n.frame;
      const th = (fr && fr.things) || {};
      if (th.officeLights === "off") officeOn = false;
      const chapter = (fr && (fr.chapter || (fr.block && fr.block.chapter))) || "";
      if (chapter === "sleep" || chapter === "bedtime") officeOn = false;
    } catch (e) { /* */ }
    chance = officeOn ? Math.max(chance, smooth01(7.5, 9, h) * (1 - smooth01(18, 19.5, h)) * 0.9) : 0.05;
  }
  return Math.max(0, Math.min(1, chance));
}

/* Paint a lit bay as a tiny room (wall, floor, furniture) — the cheap interior map the shader parallaxes. */
function paintRoom(g, x, y, w, h, kind, seed) {
  const warm = kind === 1;
  const wall = warm ? "#3a2a1c" : "#1a2430";
  const floor = warm ? "#2a1c12" : "#121820";
  const furn = warm ? "#6a4530" : "#2e3c4c";
  const lamp = warm ? "#ffd998" : "#bfe6ff";
  g.fillStyle = wall;
  g.fillRect(x, y, w, h);
  g.fillStyle = floor;
  g.fillRect(x, y + h * 0.62, w, h * 0.38);
  // back wall depth cue
  g.fillStyle = warm ? "rgba(255,200,120,0.22)" : "rgba(140,190,255,0.18)";
  g.fillRect(x + 2, y + 2, w - 4, h * 0.55);
  // furniture silhouette
  const fhash = hash01(seed, 11, kind);
  if (fhash < 0.55) {
    g.fillStyle = furn;
    g.fillRect(x + w * 0.12, y + h * 0.42, w * 0.32, h * 0.28); // couch / desk
    g.fillRect(x + w * 0.55, y + h * 0.28, w * 0.28, h * 0.42); // wardrobe / shelf
  } else {
    g.fillStyle = furn;
    g.fillRect(x + w * 0.18, y + h * 0.35, w * 0.55, h * 0.12);
    g.fillRect(x + w * 0.2, y + h * 0.47, w * 0.1, h * 0.25);
    g.fillRect(x + w * 0.62, y + h * 0.47, w * 0.1, h * 0.25);
  }
  // ceiling lamp glow
  const grd = g.createRadialGradient(x + w * 0.5, y + h * 0.18, 1, x + w * 0.5, y + h * 0.18, w * 0.55);
  grd.addColorStop(0, lamp);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.globalAlpha = 0.55 + hash01(seed, 7, 0) * 0.4;
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 1;
  // curtain edge
  if (hash01(seed, 19, 2) > 0.45) {
    g.fillStyle = warm ? "rgba(180,90,60,0.55)" : "rgba(60,90,130,0.5)";
    g.fillRect(x, y, 3, h);
    g.fillRect(x + w - 3, y, 3, h);
  }
}

/* One facade style: albedo + a schedule-driven emissive DynamicTexture of interior-mapped rooms. */
function facadeTextures(st, seed, special) {
  const rng = makeRng(seed);
  const tint = []; // 0 = never a room (dead pane), 1 = warm, 2 = cool — schedule decides on/off
  for (let f = 0; f < FLOORS; f++) {
    for (let b = 0; b < BAYS; b++) {
      const occupied = rng() < (st.lit + 0.25);
      tint.push(occupied ? (rng() < st.warm ? 1 : 2) : 0);
    }
  }
  const rect = (b, f) => {
    const x = b * CELL + (CELL - st.w) / 2;
    const y = (FLOORS - 1 - f) * CELL + (CELL - st.h) / 2;
    return [x, y, st.w, st.h];
  };
  const albedo = canvasTexture("facade-" + st.id + (special ? "-" + special : ""), 512, 512, (g, W, H) => {
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
      g.fillRect(0, (FLOORS - 1 - f) * CELL + CELL - 5, W, 5);
      for (let b = 0; b < BAYS; b++) {
        const [x, y, w, h] = rect(b, f);
        g.fillStyle = st.sill;
        g.fillRect(x - 3, y + h, w + 6, 4);
        const k = rng();
        g.fillStyle = st.pane;
        g.fillRect(x, y, w, h);
        g.fillStyle = "rgba(150,190,230," + (0.1 + k * 0.18).toFixed(2) + ")";
        g.fillRect(x, y, w, h * (0.35 + k * 0.3));
        g.fillStyle = "rgba(10,14,20,0.8)";
        g.fillRect(x + w / 2 - 1, y, 2, h);
      }
    }
  });
  const emissive = new B.DynamicTexture("facade-lit-" + st.id + (special ? "-" + special : ""), { width: 512, height: 512 }, world.scene, true);
  emissive.wrapU = B.Texture.WRAP_ADDRESSMODE;
  emissive.wrapV = B.Texture.WRAP_ADDRESSMODE;
  emissive.anisotropicFilteringLevel = 4;
  let lastKey = "";
  let stats = { on: 0, off: 0, rooms: 0 };
  function paintEmissive(hour, flickerMask) {
    const key = (Math.round(hour * 20) / 20).toFixed(2) + "|" + (flickerMask || 0).toFixed(2) + "|" + (special || "");
    if (key === lastKey && !flickerMask) return stats;
    lastKey = flickerMask ? "" : key; // don't cache mid-flicker
    const g = emissive.getContext();
    g.fillStyle = "#000";
    g.fillRect(0, 0, 512, 512);
    let on = 0;
    let off = 0;
    let warm = 0;
    let cool = 0;
    for (let f = 0; f < FLOORS; f++) {
      for (let b = 0; b < BAYS; b++) {
        const kind = tint[f * BAYS + b];
        if (!kind) { off++; continue; }
        const chance = scheduleChance(st.role, hour, f, b, seed + f * 8 + b, special);
        const roll = hash01(seed, f * BAYS + b, 91);
        let lit = roll < chance;
        if (flickerMask > 0 && lit) {
          // lightning: nearby windows blink off (mask 0..1 is strength)
          if (hash01(seed, f * BAYS + b, Math.floor(performance.now() / 40)) < flickerMask * 0.7) lit = false;
        }
        if (!lit) { off++; continue; }
        on++;
        if (kind === 1) warm++; else cool++;
        const [x, y, w, h] = rect(b, f);
        paintRoom(g, x, y, w, h, kind, seed + f * 13 + b * 7);
        g.fillStyle = "#000";
        g.fillRect(x + w / 2 - 1, y, 2, h);
      }
    }
    emissive.update(true);
    // rooms = lit panes that received an interior paint (warm+cool); distinct from raw occupancy tint
    stats = { on, off, rooms: warm + cool, warm, cool };
    return stats;
  }
  paintEmissive(12, 0);
  return { albedo, emissive, paintEmissive, getStats: () => stats, special: special || null, style: st };
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
  const facadeTex = STYLES.map((st, i) => facadeTextures(st, 900 + i * 31, null));
  const aptTex = facadeTextures(STYLES[0], 44001, "apt");
  const officeTex = facadeTextures(STYLES[2], 44017, "office");
  function makeFacadeMat(name, tex, lights) {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseTexture = tex.albedo;
    m.emissiveTexture = tex.emissive;
    m.emissiveColor = new B.Color3(0, 0, 0);
    m.diffuseColor = new B.Color3(1.35, 1.35, 1.35);
    m.specularColor = new B.Color3(0.05, 0.05, 0.06);
    m.maxSimultaneousLights = lights;
    return m;
  }
  const facadeMats = facadeTex.map((t, i) => makeFacadeMat("facade-" + STYLES[i].id, t, 4));
  const aptMat = makeFacadeMat("facade-apt", aptTex, 4);
  const officeMat = makeFacadeMat("facade-office", officeTex, 4);
  const allWindowTex = facadeTex.concat([aptTex, officeTex]);
  const shopTex = shopTextures(4242);
  const shopMat = new B.StandardMaterial("shopfront", scene);
  shopMat.diffuseTexture = shopTex.albedo;
  shopMat.emissiveTexture = shopTex.emissive;
  shopMat.emissiveColor = new B.Color3(0, 0, 0);
  shopMat.specularColor = new B.Color3(0.08, 0.08, 0.1);
  shopMat.maxSimultaneousLights = 4;

  const skyTex = facadeTextures(STYLES[2], 5150, null);
  allWindowTex.push(skyTex);
  const skyMat = new B.StandardMaterial("skyline", scene);
  skyMat.diffuseTexture = skyTex.albedo;
  skyMat.emissiveTexture = skyTex.emissive;
  skyMat.emissiveColor = new B.Color3(0, 0, 0);
  skyMat.specularColor = new B.Color3(0, 0, 0);
  skyMat.maxSimultaneousLights = 2;
  skyMat.fogEnabled = true; // by day only: switched off at dusk below so the far lights stay bright at night

  /* Cheap interior-mapping: parallax tint on lit panes so rooms read with depth. */
  let interiorOk = false;
  try {
    if (B.MaterialPluginBase) {
      class WindowInterior extends B.MaterialPluginBase {
        constructor(material) {
          super(material, "WindowInterior", 200, { WINDOW_INTERIOR: false }, true, true);
        }
        getClassName() { return "WindowInterior"; }
        isCompatible(shaderLanguage) { return shaderLanguage === B.ShaderLanguage.GLSL; }
        prepareDefines(defines) { defines.WINDOW_INTERIOR = true; }
        getCustomCode(shaderType) {
          if (shaderType !== "fragment") return null;
          return {
            CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef WINDOW_INTERIOR
{
  float emit = max(color.r, max(color.g, color.b));
  if (emit > 0.12) {
    vec3 viewDirW = normalize(vEyePosition.xyz - vPositionW);
    vec3 nW = normalize(vNormalW);
    float ndv = max(0.05, dot(nW, viewDirW));
    vec3 offset = viewDirW - nW * ndv;
    vec2 para = vec2(dot(offset, vec3(1.0, 0.0, 0.0)), offset.y) * (0.045 / ndv);
    float rim = smoothstep(0.12, 0.55, emit);
    color.rgb *= mix(0.72, 1.08, rim);
    color.rgb += vec3(para.x, para.y * 0.5, -para.x) * 0.08 * rim;
  }
}
#endif`,
          };
        }
      }
      [facadeMats[0], facadeMats[1], facadeMats[2], facadeMats[3], aptMat, officeMat, shopMat, skyMat].forEach((m) => {
        try { new WindowInterior(m); interiorOk = true; } catch (e) { /* keep flat rooms */ }
      });
    }
  } catch (e) { interiorOk = false; }

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
  /* the hand-placed blocks: their shells wear a facade and a shopfront (the data and stairs are unchanged).
     Apt and office get their own materials so the windows follow Small Weather's day. */
  const specialBlocks = [];
  (city.blocks || []).forEach((b, i) => {
    const shell = scene.getMeshByName("block-" + b.id);
    const styleIdx = b.h >= 10 ? 2 : [0, 3, 1][i % 3];
    const t = [0.9 + (i % 3) * 0.07, 0.9 + ((i + 1) % 3) * 0.07, 0.9 + ((i + 2) % 3) * 0.07];
    if (shell) shell.setEnabled(false);
    const special = b.id === "apt" ? "apt" : (b.id === "south-office" || /office/i.test(b.id || "") ? "office" : null);
    if (special) {
      const batch = new Batch();
      batch.box(b.x, b.z, b.w, b.d, 0, b.h - 0.05, "facade", (i * 0.37) % 1, 0, t);
      specialBlocks.push({ batch, mat: special === "apt" ? aptMat : officeMat, id: b.id });
    } else {
      const c = chunkFor(b.x, b.z);
      c.facade[styleIdx].box(b.x, b.z, b.w, b.d, 0, b.h - 0.05, "facade", (i * 0.37) % 1, 0, t);
      /* No shopfront band on a block with a roof ramp: the ramp climbs the north face through the band, so its lit sign
         strip (waist height beside the walker) read as a glowing slab floating beside the ramp. */
      if (b.h > 3.4 && !b.stair) c.shop.box(b.x, b.z, b.w + 0.14, b.d + 0.14, 0, SHOP_H, "shop", (i * 0.21) % 1, 0, [1, 1, 1]);
    }
    if (b.h > 3.4 && !b.stair && special) {
      const c = chunkFor(b.x, b.z);
      c.shop.box(b.x, b.z, b.w + 0.14, b.d + 0.14, 0, SHOP_H, "shop", (i * 0.21) % 1, 0, [1, 1, 1]);
    }
    stats.blocks++;
  });
  const bwin = scene.getMeshByName("bwin");
  if (bwin) bwin.setEnabled(false); // the old flat window quads: the facade has real ones now
  if (newSolids.length) world.addSolids(newSolids);

  const meshes = { facade: [], shop: [] };
  specialBlocks.forEach((sb) => {
    if (!sb.batch.empty) meshes.facade.push(sb.batch.mesh("facade-" + sb.id, sb.mat));
  });
  Object.keys(chunks).forEach((key) => {
    const c = chunks[key];    c.facade.forEach((bt, i) => {
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
  const lampPools = []; // [px, pz] under the head — for dynamic point lights
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
      lampPools.push([px, pz, x, z]);
      lampSolids.push({ x, y: 2.2, z, w: 0.28, h: 4.4, d: 0.28 });
    }
  });
  if (lampSolids.length) world.addSolids(lampSolids);

  /* Dynamic lamp point lights: 8 nearest on desktop high, 4 on phone/low; the rest stay emissive pools. */
  const lampDynCap = () => (low() ? LAMP_DYNAMIC_LOW : LAMP_DYNAMIC_HIGH);
  const lampLights = [];
  for (let i = 0; i < LAMP_DYNAMIC_HIGH; i++) {
    const L = new B.PointLight("cs-lamp-dyn-" + i, new B.Vector3(0, 4.2, 0), scene);
    L.diffuse = new B.Color3(1.0, 0.86, 0.62);
    L.specular = new B.Color3(0.4, 0.35, 0.25);
    L.intensity = 0;
    L.range = 14;
    L.falloffType = B.Light.FALLOFF_STANDARD;
    try { L.shadowEnabled = false; } catch (e) { /* */ }
    lampLights.push(L);
  }
  let lampDynActive = 0;
  function updateLampLights(lampsK) {
    const cam = scene.activeCamera;
    const cx = cam && cam.globalPosition ? cam.globalPosition.x : (cam && cam.position ? cam.position.x : 0);
    const cz = cam && cam.globalPosition ? cam.globalPosition.z : (cam && cam.position ? cam.position.z : 0);
    const cap = lampDynCap();
    const ranked = lampPools.map((p, i) => {
      const dx = p[0] - cx;
      const dz = p[1] - cz;
      return { i, d2: dx * dx + dz * dz, p };
    }).sort((a, b) => a.d2 - b.d2);
    lampDynActive = 0;
    for (let i = 0; i < lampLights.length; i++) {
      const L = lampLights[i];
      if (i < cap && lampsK > 0.05 && ranked[i]) {
        const p = ranked[i].p;
        L.position.set(p[0], 4.15, p[1]);
        L.intensity = 0.55 * lampsK;
        L.setEnabled(true);
        lampDynActive++;
      } else {
        L.intensity = 0;
        L.setEnabled(false);
      }
    }
  }
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
  let windowStats = { on: 0, off: 0, rooms: 0, hour: 12 };
  let acc = 1;
  let winAcc = 1;
  function weights() {
    try {
      const i = look && look.info && look.info();
      if (i && i.sky) return i.sky;
    } catch (e) { /* not up yet */ }
    return { day: 1, dusk: 0, night: 0 };
  }
  function clockHour() {
    try {
      const n = window.day && window.day.now && window.day.now();
      if (n && typeof n.minutes === "number") return ((n.minutes % 1440) + 1440) % 1440 / 60;
    } catch (e) { /* */ }
    return 12;
  }
  function repaintWindows(hour, flickerMask) {
    let on = 0;
    let off = 0;
    let rooms = 0;
    allWindowTex.forEach((tex) => {
      const s = tex.paintEmissive(hour, flickerMask || 0);
      on += s.on;
      off += s.off;
      rooms += s.rooms;
    });
    windowStats = { on, off, rooms, hour };
    return windowStats;
  }
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    acc += dt;
    winAcc += dt;
    if (acc < 0.3) return;
    acc = 0;
    const w = weights();
    const hour = clockHour();
    // global emissive scale still follows dusk/night so daytime stays dark even if a schedule glitch fires
    const windows = Math.min(1, w.dusk * 0.62 + w.night * 1.05) + 0;
    const lamps = Math.min(1, w.dusk * 0.8 + w.night * 1.1);
    const shops = Math.min(1, w.dusk * 0.7 + w.night * 1.0);
    lit = { windows, lamps, shops };
    props.update(w, lit);
    // schedule-driven emissive maps (repaint ~every 2 s, or every frame while flickering)
    if (winAcc >= 2 || flickerLeft > 0) {
      winAcc = 0;
      repaintWindows(hour, flickerLeft > 0 ? 0.85 : 0);
    }
    const winK = windows > 0.02 ? 1.15 : 0;
    facadeMats.forEach((m) => m.emissiveColor.set(winK, winK, winK));
    aptMat.emissiveColor.set(winK, winK, winK);
    officeMat.emissiveColor.set(winK, winK, winK);
    shopMat.emissiveColor.set(shops * 1.1, shops * 1.1, shops * 1.1);
    const fillK = Math.max(0, 1 - windows) * (0.4 + 0.35 * w.day);
    skyMat.emissiveColor.set(windows * 1.3 + scene.fogColor.r * fillK, windows * 1.3 + scene.fogColor.g * fillK, windows * 1.3 + scene.fogColor.b * fillK);
    skyMat.ambientColor.set(1.2, 1.25, 1.35);
    headM.emissiveColor.set(lamps * 1.5, lamps * 1.35, lamps * 1.05);
    poolM.emissiveColor.set(lamps * 0.85, lamps * 0.85, lamps * 0.85);
    poolM.alpha = 1;
    poolMesh.setEnabled(lamps > 0.02);
    beaconMat.emissiveColor.set(w.night * 1.3 + w.dusk * 0.7, 0, 0);
    fogV.copyFrom(scene.fogColor);
    const dayK = Math.max(0, 1 - windows);
    skyMat.fogEnabled = windows < 0.3;
    skyMat.diffuseColor.set(fogV.r * 0.6 + 0.2 * dayK, fogV.g * 0.65 + 0.22 * dayK, fogV.b * 0.7 + 0.26 * dayK);
    updateLampLights(lamps);
  });

  /* the lamps and nearby windows stutter (the opening's first bolt: `day.cityscape.flicker(secs)`) */
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
    lampLights.forEach((L) => { if (L.isEnabled()) L.intensity = 0.55 * l * k; });
    const winK = (lit.windows > 0.02 ? 1.15 : 0) * (Math.random() < 0.4 ? 0.15 : 1);
    facadeMats.forEach((m) => m.emissiveColor.set(winK, winK, winK));
    aptMat.emissiveColor.set(winK, winK, winK);
    officeMat.emissiveColor.set(winK, winK, winK);
  });

  /* Every bolt in range stutters lamps and windows (brief: lightning flicker; cold open still calls flicker() too). */
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("day:strike", (e) => {
      const d = (e && e.detail) || {};
      if (d.action && d.action !== "strike" && d.action !== "restrike") return;
      const cam = scene.activeCamera;
      const cx = (cam && (cam.globalPosition || cam.position) || {}).x || 0;
      const cz = (cam && (cam.globalPosition || cam.position) || {}).z || 0;
      const sx = d.x != null ? d.x : cx;
      const sz = d.z != null ? d.z : cz;
      const dist = Math.hypot(sx - cx, sz - cz);
      if (dist > 55) return; // out of earshot / sight of the district glow
      const secs = d.action === "restrike" ? 0.55 : 1.2;
      flickerLeft = Math.max(flickerLeft, secs * (1 - dist / 70));
    });
  }

  const api = {
    flicker(secs) { flickerLeft = Math.max(flickerLeft, secs || 1.2); return true; },
    flickering: () => flickerOn,
    /** Force a window-schedule repaint for the playtest / checks. */
    paintWindows(hour) { return repaintWindows(typeof hour === "number" ? hour : clockHour(), 0); },
    /* the city audit (js/city-audit.js; scripts/check-city.mjs runs the same under the NullEngine): floating or sunk props,
       coplanar faces, bad normals, the walkable roofs' AC colliders. `day.cityscape.audit()` -> { failures, counts } */
    audit() {
      const r = runCityAudit(scene, B, cfg, { solids: world.solids });
      return { failures: r.failures, counts: r.counts };
    },
    /** The street lamps' [x, z] (js/windfog.js hangs light shafts under them in fog). */
    lampSpots: () => lampSpots,
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
        windows: { ...windowStats, interior: interiorOk },
        dynamicLights: { active: lampDynActive, cap: lampDynCap(), max: LAMP_DYNAMIC_HIGH },
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
