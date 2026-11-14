/* ==========================================================================
   Filling the city out (J, 2026-11-05). Read by js/cityscape.js, which hands it the lots, roads and
   lamp spots it already worked out. Everything is generated, nothing is downloaded, no GPU:

   - Street props along the kerbs: trees, benches, hydrants, bins and bus stops (shelter, glass back,
     lit stop sign), a few of them solid (`world.addSolids`).
   - Shop signs and neon: lit wall signs on the lots that face an avenue (BAR, NOODLES, 24H ...), each
     with a coloured spill of light on the pavement. They glow with the shops (dim by day, full at night).
   - The park: lawn, pond, a bandstand with string lights, flowerbeds, lamps along the path, more benches.
   - A plaza with a fountain, paving, benches, cafe tables and lamps.
   - Three landmarks: the Clock Tower (in the plaza), the Needle (a tall spire with a lit deck and a
     red beacon) and the Storm Tank (a gasholder with a blue neon band and a lightning mast).
   - Rooftops: AC units, water tanks, vents, antennas and dishes on the lots, and on the three walkable roofs.
   - Night: sign neon, lamp globes, tower faces and bus stops follow the dusk / night weights; the bloom
     gets heavier at dusk and night. `day.cityscape.info().props` says what is there and what is lit.
   Merged into a handful of meshes (vertex-coloured), so it costs a few draw calls.
   ========================================================================== */
const B = window.BABYLON;

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

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

const SIDEWALK_TOP = 0.06; // world.js layWalk: 0.06 tall from the ground
const LAWN_TOP = 0.03; // the park lawn below
const PLAZA_TOP = 0.07; // the plaza's paving below

/* Where the plaza and the landmarks stand. cityscape.js keeps its filler buildings off these. */
export function reserved(cfg) {
  void cfg;
  return {
    plaza: { x0: 106, z0: 16.8, x1: 130, z1: 36 },
    needle: { x: 60, z: 86 },
    tank: { x: 190, z: 44 },
    rects: [
      [105, 16, 131, 37],
      [54, 80, 66, 92],
      [180, 34, 200, 54],
    ],
  };
}

/* A merged, vertex-coloured mesh builder. A frame (ox, oz, yaw) turns local coordinates into world ones. */
class Part {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.idx = [];
    this.prims = []; // world-space boxes of every box/cylinder/ball: the city audit (js/city-audit.js) clusters them into props
    this.f = { ox: 0, oz: 0, oy: 0, c: 1, s: 0 };
    this.bend = 0; // 0 = rigid; up to 1 = flexible in the wind: stored as the vertex alpha (1 - bend / 2), read by js/windfog.js's shader
  }
  frame(ox, oz, yaw, oy) {
    this.f = { ox, oz, oy: oy || 0, c: Math.cos(yaw || 0), s: Math.sin(yaw || 0) };
    return this;
  }
  w(x, y, z) {
    const f = this.f;
    return [f.ox + x * f.c + z * f.s, y + (f.oy || 0), f.oz - x * f.s + z * f.c];
  }
  wn(x, y, z) {
    const f = this.f;
    return [x * f.c + z * f.s, y, -x * f.s + z * f.c];
  }
  /* the world-space box round a local box, for the audit */
  prim(x0, y0, z0, x1, y1, z1) {
    const lo = [1e9, 1e9, 1e9];
    const hi = [-1e9, -1e9, -1e9];
    for (const x of [x0, x1]) for (const z of [z0, z1]) {
      const q = this.w(x, y0, z);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
    }
    lo[1] = y0 + (this.f.oy || 0);
    hi[1] = y1 + (this.f.oy || 0);
    this.prims.push([lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]]);
  }
  quad(a, b, c, d, n, col) {
    const base = this.pos.length / 3;
    [a, b, c, d].forEach((p) => {
      const q = this.w(p[0], p[1], p[2]);
      this.pos.push(q[0], q[1], q[2]);
      const m = this.wn(n[0], n[1], n[2]);
      this.nrm.push(m[0], m[1], m[2]);
      this.col.push(col[0], col[1], col[2], 1 - 0.5 * this.bend);
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /* centre (x, z), bottom y0, size w x d x h (h up) */
  box(x, y0, z, w, h, d, col) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h;
    this.prim(x0, y0, z0, x1, y1, z1);
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], col);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], col);
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], col);
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], col);
    return this;
  }
  /* one triangle or quad, wound to face along n (the same handedness as box()), flipped if given the other way */
  poly(pts, n, col) {
    const a = pts[0], b = pts[1], c = pts[2];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const p = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0 ? pts : pts.slice().reverse();
    const base = this.pos.length / 3;
    const m = this.wn(n[0], n[1], n[2]);
    p.forEach((q) => {
      const w = this.w(q[0], q[1], q[2]);
      this.pos.push(w[0], w[1], w[2]);
      this.nrm.push(m[0], m[1], m[2]);
      this.col.push(col[0], col[1], col[2], 1 - 0.5 * this.bend);
    });
    this.idx.push(base, base + 1, base + 2);
    if (p.length === 4) this.idx.push(base, base + 2, base + 3);
  }
  /* the bevelled kit's box: a chamfer of `bev` on the vertical and top edges (the foot stays square on its surface).
     Same footprint and bounds as box(), so colliders and the audit see the same prim; normals point out on every facet. */
  bbox(x, y0, z, w, h, d, col, bev) {
    bev = Math.min(bev == null ? 0.06 : bev, w * 0.3, d * 0.3, h * 0.3);
    if (!(bev > 0.004)) return this.box(x, y0, z, w, h, d, col);
    const lo = [x - w / 2, y0, z - d / 2];
    const hi = [x + w / 2, y0 + h, z + d / 2];
    this.prim(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
    const pt = (s, i) => (s < 0 ? (i === 0 ? lo[0] : i === 1 ? lo[1] : lo[2]) : i === 0 ? hi[0] : i === 1 ? hi[1] : hi[2]);
    const inn = (s, i) => (i === 1 && s < 0 ? lo[1] : pt(s, i) - s * bev); // the foot stays square: it sits on the roof
    const S = [-1, 1];
    // faces
    for (let ax = 0; ax < 3; ax++) {
      const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
      for (const s of S) {
        if (ax === 1 && s < 0) continue;
        const mk = (u, v) => { const q = [0, 0, 0]; q[ax] = pt(s, ax); q[a1] = u; q[a2] = v; return q; };
        const n = [0, 0, 0]; n[ax] = s;
        this.poly([mk(inn(-1, a1), inn(-1, a2)), mk(inn(1, a1), inn(-1, a2)), mk(inn(1, a1), inn(1, a2)), mk(inn(-1, a1), inn(1, a2))], n, col);
      }
    }
    // edge strips: along axis ax, between the faces at (sa on a1) and (sb on a2)
    const k = Math.SQRT1_2;
    for (let ax = 0; ax < 3; ax++) {
      const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
      for (const sa of S) for (const sb of S) {
        if ((a1 === 1 && sa < 0) || (a2 === 1 && sb < 0)) continue;
        const mk = (t, o1, o2) => { const q = [0, 0, 0]; q[ax] = t; q[a1] = o1; q[a2] = o2; return q; };
        const t0 = inn(-1, ax), t1 = inn(1, ax);
        const n = [0, 0, 0]; n[a1] = sa * k; n[a2] = sb * k;
        this.poly([mk(t0, pt(sa, a1), inn(sb, a2)), mk(t1, pt(sa, a1), inn(sb, a2)), mk(t1, inn(sa, a1), pt(sb, a2)), mk(t0, inn(sa, a1), pt(sb, a2))], n, col);
      }
    }
    // corners
    const r = 1 / Math.sqrt(3);
    for (const sx of S) for (const sy of S) for (const sz of S) {
      if (sy < 0) continue;
      this.poly([[pt(sx, 0), inn(sy, 1), inn(sz, 2)], [inn(sx, 0), pt(sy, 1), inn(sz, 2)], [inn(sx, 0), inn(sy, 1), pt(sz, 2)]], [sx * r, sy * r, sz * r], col);
    }
    return this;
  }
  /* a drum with a chamfered rim at the top and foot: radius r, height h */
  drum(x, y0, z, r, h, seg, col, bev) {
    bev = Math.min(bev == null ? 0.07 : bev, r * 0.4, h * 0.3);
    this.prim(x - r, y0, z - r, x + r, y0 + h, z + r);
    const was = this.prim;
    this.prim = () => {};
    this.cyl(x, y0, z, r - bev, r, bev, seg, col, false);
    this.cyl(x, y0 + bev, z, r, r, h - 2 * bev, seg, col, false);
    this.cyl(x, y0 + h - bev, z, r, r - bev, bev, seg, col, true);
    this.prim = was;
    return this;
  }
  /* a (tapered) cylinder or cone: radii r0 at the bottom, r1 at the top */
  cyl(x, y0, z, r0, r1, h, seg, col, cap) {
    const rm = Math.max(r0, r1);
    this.prim(x - rm, y0, z - rm, x + rm, y0 + h, z + rm);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const p = (r, a, y) => [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
      const slope = (r0 - r1) / (h || 1);
      const n = [Math.cos(am), slope, Math.sin(am)];
      this.quad(p(r0, a0, y0), p(r0, a1, y0), p(r1, a1, y0 + h), p(r1, a0, y0 + h), n, col); // wound like box(): faces out
      if (cap !== false && r1 > 0.001) {
        const top = this.pos.length / 3;
        const c = this.w(x, y0 + h, z);
        const up = this.wn(0, 1, 0);
        this.pos.push(c[0], c[1], c[2]);
        this.nrm.push(up[0], up[1], up[2]);
        this.col.push(col[0], col[1], col[2], 1 - 0.5 * this.bend);
        [p(r1, a0, y0 + h), p(r1, a1, y0 + h)].forEach((q) => {
          const wq = this.w(q[0], q[1], q[2]);
          this.pos.push(wq[0], wq[1], wq[2]);
          this.nrm.push(up[0], up[1], up[2]);
          this.col.push(col[0], col[1], col[2], 1 - 0.5 * this.bend);
        });
        this.idx.push(top, top + 1, top + 2); // the cap faces up (it was culled from above)
      }
    }
    return this;
  }
  /* a squashed low-poly ball */
  ball(x, y, z, r, sy, col, seg) {
    seg = seg || 6;
    this.prim(x - r, y - r * sy, z - r, x + r, y + r * sy, z + r);
    const rings = 4;
    for (let j = 0; j < rings; j++) {
      const t0 = (j / rings) * Math.PI;
      const t1 = ((j + 1) / rings) * Math.PI;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const P = (t, a) => [x + Math.cos(a) * Math.sin(t) * r, y + Math.cos(t) * r * sy, z + Math.sin(a) * Math.sin(t) * r];
        const am = (a0 + a1) / 2;
        const tm = (t0 + t1) / 2;
        this.quad(P(t0, a1), P(t0, a0), P(t1, a0), P(t1, a1), [Math.cos(am) * Math.sin(tm), Math.cos(tm), Math.sin(am) * Math.sin(tm)], col);
      }
    }
    return this;
  }
  get empty() {
    return !this.pos.length;
  }
  mesh(name, material, scene) {
    const m = new B.Mesh(name, scene);
    const vd = new B.VertexData();
    vd.positions = this.pos;
    vd.normals = this.nrm;
    vd.colors = this.col;
    vd.indices = this.idx;
    vd.applyToMesh(m);
    m.material = material;
    m.isPickable = false;
    m.metadata = { prims: this.prims };
    m.freezeWorldMatrix();
    return m;
  }
}

const SIGNS = [
  { word: "NOODLES", c: "#ff4d8d" },
  { word: "BAR", c: "#3ecbff" },
  { word: "24H", c: "#8eff9f" },
  { word: "CAFE", c: "#ffd36a" },
  { word: "ARCADE", c: "#c58bff" },
  { word: "BOOKS", c: "#ff9a4c" },
  { word: "HOTEL", c: "#3ecbff" },
  { word: "PHARMACY", c: "#8eff9f" },
];

export function installProps(ctx) {
  const { world, blocked, hitsSolid, fillers, roads, crossXs, avZs, lampSpots, canvasTexture, poolTexture, T } = ctx;
  const scene = world.scene;
  const cfg = window.DAY_CONFIG || {};
  const city = cfg.city || { blocks: [], park: null };
  const street = cfg.street || { z: 12.6 };
  const R = reserved(cfg);
  const rng = makeRng(31337);
  const solid = new Part(); // lit by the scene, vertex colours
  const warm = new Part(); // glows with the lamps: globes, tower faces, bus stop panels, string lights
  const colliders = [];
  const conductors = []; // tall things a bolt prefers (js/powers.js reads them through info().conductors)
  const stats = { trees: 0, benches: 0, hydrants: 0, bins: 0, busStops: 0, signs: 0, parkLamps: 0, plazaLamps: 0, roofUnits: 0, landmarks: 0, planters: 0 };
  const clear = (x, z, r) => !blocked(x - r, z - r, x + r, z + r, 0.15);
  const clearIn = (x, z, r) => !hitsSolid(x - r, z - r, x + r, z + r, 0.15); // inside the park or plaza, which cityscape keeps free of lots

  const WOOD = hex("#7a5638");
  const DARK = hex("#2b3038");
  const METAL = hex("#4b535c");
  const RED = hex("#b8382e");
  const GREEN = hex("#2f5a3c");
  const LEAF = ["#3f6e48", "#4a7a45", "#36603f", "#5b7f3e", "#6a8a46"].map(hex);
  const CREAM = hex("#efe6cc");
  const GLOBE = hex("#fff1c9");

  /* ---------------- single props, in a local frame whose +z faces the road ---------------- */
  // G: the height of the surface they stand on (the sidewalk's top on the kerbs, the plaza's paving, the lawn), so they
  // stand on it instead of 6-7 cm sunk into it.
  let G = 0;
  function tree(x, z, s) {
    solid.frame(x, z, 0, G);
    solid.cyl(0, 0, 0, 0.17 * s, 0.11 * s, 2.1 * s, 6, hex("#5a4230"));
    const lc = LEAF[Math.floor(rng() * LEAF.length)];
    solid.bend = 0.75; // the crown bends in the wind (a vertex shader, js/windfog.js)
    solid.ball(0, 3.0 * s, 0, 1.5 * s, 0.85, lc, 7);
    solid.ball(0.5 * s, 2.5 * s, 0.3 * s, 1.0 * s, 0.8, lc.map((v) => v * 0.9), 6);
    solid.bend = 0;
    colliders.push({ x, y: G + 1, z, w: 0.4, h: 2, d: 0.4 });
    stats.trees++;
  }
  function bench(x, z, yaw, solidToo) {
    solid.frame(x, z, yaw, G);
    solid.box(0, 0.42, 0, 1.6, 0.07, 0.46, WOOD);
    solid.box(0, 0.72, -0.2, 1.6, 0.34, 0.06, WOOD);
    // the back's two posts, from the seat's top up into the rail, so the back isn't floating over the seat
    solid.box(-0.7, 0.49, -0.2, 0.07, 0.25, 0.06, DARK);
    solid.box(0.7, 0.49, -0.2, 0.07, 0.25, 0.06, DARK);
    solid.box(-0.7, 0, 0, 0.07, 0.42, 0.4, DARK);
    solid.box(0.7, 0, 0, 0.07, 0.42, 0.4, DARK);
    if (solidToo !== false) {
      const f = solid.f;
      colliders.push({ x, y: G + 0.4, z, w: Math.abs(1.6 * f.c) + Math.abs(0.5 * f.s), h: 0.8, d: Math.abs(0.5 * f.c) + Math.abs(1.6 * f.s) });
    }
    stats.benches++;
  }
  function hydrant(x, z, yaw) {
    solid.frame(x, z, yaw, G);
    solid.cyl(0, 0, 0, 0.17, 0.15, 0.62, 8, RED);
    solid.cyl(0, 0.62, 0, 0.19, 0.1, 0.14, 8, RED);
    solid.box(0.22, 0.34, 0, 0.16, 0.12, 0.12, RED);
    solid.box(-0.22, 0.34, 0, 0.16, 0.12, 0.12, RED);
    solid.box(0, 0.32, 0.2, 0.14, 0.14, 0.14, hex("#d8c25a"));
    colliders.push({ x, y: G + 0.4, z, w: 0.4, h: 0.8, d: 0.4 });
    stats.hydrants++;
  }
  function bin(x, z, yaw) {
    solid.frame(x, z, yaw, G);
    solid.cyl(0, 0, 0, 0.27, 0.3, 0.85, 8, GREEN);
    solid.cyl(0, 0.85, 0, 0.32, 0.32, 0.06, 8, DARK);
    colliders.push({ x, y: G + 0.45, z, w: 0.6, h: 0.9, d: 0.6 });
    stats.bins++;
  }
  function busStop(x, z, yaw) {
    solid.frame(x, z, yaw, G);
    solid.box(0, 0, 0, 3.2, 0.05, 1.15, hex("#555b62")); // base slab, inside the sidewalk's 1.2 m
    [-1.55, 1.55].forEach((px) => solid.box(px, 0.05, -0.5, 0.08, 2.4, 0.08, METAL));
    solid.box(0, 2.42, -0.1, 3.4, 0.1, 1.5, hex("#2c333c")); // roof
    solid.box(0, 0.5, -0.4, 2.4, 0.07, 0.4, WOOD); // seat
    [-1.0, 1.0].forEach((sx) => solid.box(sx, 0, -0.4, 0.07, 0.5, 0.3, DARK)); // its two legs, standing in the slab
    solid.box(0, 0.5, -0.56, 0.1, 0.1, 0.1, DARK); // the stop's call button on the glass
    warm.frame(x, z, yaw, G);
    warm.box(0, 0.8, -0.5, 3.04, 1.5, 0.05, hex("#bfe3ff")); // lit ad panel / glass back, between the posts (it ends inside them)
    // the stop sign on its own pole, at the kerb end
    solid.box(1.9, 0, 0.1, 0.07, 3.0, 0.07, METAL);
    warm.box(1.9, 2.55, 0.1, 0.56, 0.56, 0.06, hex("#3ecbff"));
    colliders.push({ x, z, y: G + 1.2, w: Math.abs(3.2 * solid.f.c) + 1.15 * Math.abs(solid.f.s), h: 2.4, d: Math.abs(1.15 * solid.f.c) + 3.2 * Math.abs(solid.f.s) });
    stats.busStops++;
  }
  function lampGlobe(x, z, h) {
    solid.frame(x, z, 0, G);
    solid.cyl(0, 0, 0, 0.09, 0.07, h, 6, DARK);
    warm.frame(x, z, 0, G);
    warm.ball(0, h + 0.2, 0, 0.26, 1, GLOBE, 6);
    colliders.push({ x, y: G + h / 2, z, w: 0.22, h, d: 0.22 });
    return [x, z];
  }

  /* ---------------- along the kerbs ---------------- */
  const cycle = ["tree", "bench", "bus", "hydrant", "tree", "bus", "bin", "tree", "bench", "tree", "hydrant", "bus"];
  const allZ = avZs;
  const nearJ = (v, lines, pad) => lines.some((l) => Math.abs(v - l) < pad);
  const lampNear = (x, z) => lampSpots.some((p) => Math.abs(p[0] - x) < 1.6 && Math.abs(p[1] - z) < 1.6);
  let ci = 0;
  G = SIDEWALK_TOP;
  roads.forEach((r) => {
    const step = r.main ? 13 : 11;
    for (let t = r.from + 9; t < r.to - 6; t += step) {
      const kind = cycle[ci++ % cycle.length];
      const inter = r.along === "x" ? nearJ(t, crossXs, 9) : nearJ(t, allZ, 9);
      if (inter) continue;
      const s = ci % 2 ? 1 : -1;
      const off = (kind === "tree" ? 3.2 : kind === "bus" ? 2.9 : 3.0) * s; // a bus stop's slab fills the sidewalk's width
      const x = r.along === "x" ? t : r.c + off;
      const z = r.along === "x" ? r.c + off : t;
      const yaw = r.along === "x" ? (s > 0 ? Math.PI : 0) : -s * (Math.PI / 2);
      const pad = kind === "bus" ? 1.8 : 0.5;
      if (!clear(x, z, pad) || lampNear(x, z)) continue;
      if (kind === "tree") tree(x, z, 0.85 + rng() * 0.3);
      else if (kind === "bench") bench(x, z, yaw);
      else if (kind === "hydrant") hydrant(x, z, yaw);
      else if (kind === "bin") bin(x, z, yaw);
      else if (kind === "bus" && r.along === "x") busStop(x, z, yaw);
    }
  });

  G = 0;

  /* ---------------- shop signs and neon ----------------
     Canvas stand-ins always work; Gen textures at textures/neon/<word>.webp replace them when present
     (recipes neon-sign-* in hawkes.assets.json). Each sign flickers a little at night. */
  const neonGen = {};
  const signFlicker = SIGNS.map(() => ({ phase: Math.random() * 6.28, rate: 0.7 + Math.random() * 1.4, dead: 0 }));
  const signMats = SIGNS.map((sg, i) => {
    const W = 512;
    const H = 128;
    const draw = (emit) => (g) => {
      g.fillStyle = emit ? "#000" : "#14181f";
      g.fillRect(0, 0, W, H);
      g.lineWidth = 7;
      g.strokeStyle = emit ? sg.c : "#252b34";
      g.strokeRect(10, 10, W - 20, H - 20);
      g.font = "bold 74px Arial, Helvetica, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      if (emit) {
        g.shadowColor = sg.c;
        g.shadowBlur = 16;
      }
      g.fillStyle = emit ? sg.c : "#2d333c";
      g.fillText(sg.word, W / 2, H / 2 + 4);
    };
    const m = new B.StandardMaterial("sign-" + sg.word, scene);
    m.diffuseTexture = canvasTexture("sign-" + sg.word, 512, 128, draw(false));
    m.emissiveTexture = canvasTexture("sign-lit-" + sg.word, 512, 128, draw(true));
    m.emissiveColor = new B.Color3(0.3, 0.3, 0.3);
    m.specularColor = new B.Color3(0, 0, 0);
    // One-sided: a double-sided plane's back copy carries the same UVs (mirrored text) and, drawn second at the same
    // depth, won from the front. The back faces the wall 8 cm behind it, so nobody sees it.
    m.backFaceCulling = true;
    m.metadata = { neonWord: sg.word, neonGen: false };
    // Hawkes Gen cutout (textures/neon/<word>.webp): only fetch words listed in textures/neon/index.json (no 404s)
    return m;
  });
  // Lazy: one index fetch, then only the signs that are actually on disk
  try {
    if (typeof fetch === "function") {
      fetch("textures/neon/index.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((list) => {
        const have = new Set((Array.isArray(list) ? list : []).map((s) => String(s).toLowerCase()));
        signMats.forEach((m, i) => {
          const word = SIGNS[i].word.toLowerCase();
          if (!have.has(word)) return;
          const url = "textures/neon/" + word + ".webp";
          const tex = new B.Texture(url, scene, true, false, B.Texture.BILINEAR_SAMPLINGMODE, () => {
            m.diffuseTexture = tex;
            m.emissiveTexture = tex;
            m.useAlphaFromDiffuseTexture = true;
            m.opacityTexture = tex;
            m.metadata.neonGen = true;
            neonGen[SIGNS[i].word] = true;
          }, () => { /* canvas stand-in stays */ });
          tex.hasAlpha = true;
        });
      }).catch(() => { /* stand-ins */ });
    }
  } catch (e) { /* NullEngine */ }
  const signPlane = SIGNS.map((sg, i) => {
    const p = B.MeshBuilder.CreatePlane("sign-" + sg.word, { width: 1, height: 0.25 }, scene);
    p.material = signMats[i];
    p.isPickable = false;
    return p;
  });
  const spillMats = {};
  const spillMeshes = {};
  function spill(color) {
    if (spillMeshes[color]) return spillMeshes[color];
    const tex = poolTexture(color);
    const m = new B.StandardMaterial("spill-" + color, scene);
    m.diffuseTexture = tex;
    m.useAlphaFromDiffuseTexture = true;
    m.emissiveTexture = tex;
    m.emissiveColor = new B.Color3(0, 0, 0);
    m.disableLighting = true;
    m.alphaMode = B.Engine.ALPHA_ADD;
    m.backFaceCulling = false;
    m.zOffset = -2;
    m.disableDepthWrite = true; // a light decal: it must not hide the one under it
    const g = B.MeshBuilder.CreateGround("spill-" + color, { width: 6, height: 4 }, scene);
    g.position.y = 0.064;
    g.bakeCurrentTransformIntoVertices();
    g.material = m;
    g.isPickable = false;
    g.alphaIndex = 11;
    spillMats[color] = m;
    spillMeshes[color] = g;
    return g;
  }
  let signN = 0;
  fillers.forEach((f) => {
    if (!f.near || rng() > 0.85) return;
    // the face towards the nearest avenue, if the avenue is close
    let best = null;
    avZs.forEach((az) => {
      const face = f.z > az ? f.z - f.d / 2 : f.z + f.d / 2;
      const dist = Math.abs(face - az);
      if (!best || dist < best.dist) best = { az, face, dist, north: f.z > az };
    });
    if (!best || best.dist > 9 || f.w < 6) return;
    const si = signN++ % SIGNS.length;
    const sw = Math.min(f.w - 1.5, 3.2 + rng() * 1.6);
    const x = f.x + (rng() - 0.5) * Math.max(0, f.w - sw - 1);
    const out = best.north ? -1 : 1; // the sign faces the road
    const z = best.face + out * 0.08;
    const yaw = best.north ? 0 : Math.PI; // a plane faces -z by default
    const M = B.Matrix.Compose(new B.Vector3(sw, 1, 1), B.Quaternion.FromEulerAngles(0, yaw, 0), new B.Vector3(x, 3.7 + rng() * 0.9, z));
    signPlane[si].thinInstanceAdd(M);
    const c = SIGNS[si].c;
    spill(c).thinInstanceAdd(T(x, 0, best.az + (best.north ? 1 : -1) * 3.6, 0.7 + sw / 6, 1, 0.9));
    stats.signs++;
  });
  signPlane.forEach((p) => p.thinInstanceRefreshBoundingInfo(true));
  Object.values(spillMeshes).forEach((g) => g.thinInstanceRefreshBoundingInfo(true));

  /* ---------------- the park ---------------- */
  const flat = new Part();
  if (city.park) {
    const p = city.park;
    const cx = (p.x0 + p.x1) / 2;
    flat.box(cx, 0.005, (p.z0 + p.z1) / 2, p.x1 - p.x0 - 1, 0.025, p.z1 - p.z0 - 1, hex("#33543a")); // lawn
    // the lawn is something to stand on: he and the park's props stand on its top, not 3 cm into it
    colliders.push({ x: cx, y: LAWN_TOP / 2, z: (p.z0 + p.z1) / 2, w: p.x1 - p.x0 - 1, h: LAWN_TOP, d: p.z1 - p.z0 - 1 });
    const pond = { x: 15, z: 60, r: 5 };
    flat.frame(0, 0, 0);
    flat.cyl(pond.x, 0.03, pond.z, pond.r + 0.45, pond.r + 0.45, 0.04, 14, hex("#6b6a62")); // stone rim
    flat.cyl(pond.x, 0.075, pond.z, pond.r, pond.r, 0.02, 14, hex("#16303f")); // water
    // bandstand
    const bx = -18;
    const bz = 41;
    solid.frame(0, 0, 0, LAWN_TOP); // on the lawn, not 3 cm into it
    solid.cyl(bx, 0, bz, 3.2, 3.2, 0.3, 10, hex("#8a8174"));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      solid.box(bx + Math.cos(a) * 2.7, 0.3, bz + Math.sin(a) * 2.7, 0.14, 2.6, 0.14, CREAM);
    }
    solid.cyl(bx, 2.9, bz, 3.4, 0.2, 1.3, 10, hex("#a24a3d"));
    colliders.push({ x: bx, y: LAWN_TOP + 0.15, z: bz, w: 5.6, h: 0.3, d: 5.6 });
    // string lights round the eaves
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      warm.frame(0, 0, 0, LAWN_TOP);
      warm.ball(bx + Math.cos(a) * 3.2, 2.85, bz + Math.sin(a) * 3.2, 0.1, 1, i % 2 ? hex("#ffd98a") : hex("#ff9ac1"), 4);
    }
    solid.frame(0, 0, 0);
    warm.frame(0, 0, 0);
    // flowerbeds
    [[-11, 24, "#d85a7a"], [-5, 24, "#e6b84a"], [-11, 64, "#9a6ad8"], [-5, 64, "#e6b84a"], [4, 45, "#d85a7a"]].forEach(([x, z, c]) => {
      if (!clearIn(x, z, 0.8)) return;
      solid.bbox(x, LAWN_TOP, z, 2.6, 0.22, 1.3, hex("#5b4636"), 0.04);
      solid.bend = 0.8; // the flowers lean in the wind
      for (let k = 0; k < 7; k++) solid.ball(x - 1.1 + k * 0.37, LAWN_TOP + 0.3, z + ((k % 2) - 0.5) * 0.5, 0.17, 1, hex(c), 4);
      solid.bend = 0;
      stats.planters++;
    });
    // lamps and benches along the path (x = -8), on the lawn
    G = LAWN_TOP;
    for (let z = p.z0 + 5; z < p.z1 - 3; z += 9) {
      if (clearIn(-6.4, z, 0.3)) {
        lampGlobe(-6.4, z, 3.3);
        lampSpots.push([-6.4, z]);
        stats.parkLamps++;
      }
      if (clearIn(-9.8, z + 4.5, 0.9)) bench(-9.8, z + 4.5, Math.PI / 2 + Math.PI);
    }
    G = 0;
    flat.frame(0, 0, 0);
  }

  /* ---------------- the plaza ---------------- */
  const pl = R.plaza;
  const pcx = (pl.x0 + pl.x1) / 2;
  const pcz = (pl.z0 + pl.z1) / 2;
  {
    flat.frame(0, 0, 0);
    const tileA = hex("#7d8187");
    const tileB = hex("#6c7076");
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
      const w = (pl.x1 - pl.x0) / 6;
      const d = (pl.z1 - pl.z0) / 5;
      flat.box(pl.x0 + w * (i + 0.5), 0.0, pl.z0 + d * (j + 0.5), w - 0.1, PLAZA_TOP, d - 0.1, (i + j) % 2 ? tileA : tileB);
    }
    // the paving is something to stand on: he, Dex, the stalls and the spectators stand on it, not 7 cm into it
    colliders.push({ x: pcx, y: PLAZA_TOP / 2, z: pcz, w: pl.x1 - pl.x0, h: PLAZA_TOP, d: pl.z1 - pl.z0 });
    G = PLAZA_TOP;
    // fountain at the plaza's heart
    const fx = pcx;
    const fz = pl.z0 + 6.5;
    solid.frame(0, 0, 0);
    solid.cyl(fx, 0.07, fz, 3.4, 3.4, 0.55, 16, hex("#8d8a80"));
    flat.cyl(fx, 0.55, fz, 3.0, 3.0, 0.04, 16, hex("#1c4256"));
    solid.cyl(fx, 0.6, fz, 0.5, 0.35, 1.5, 8, hex("#8d8a80"));
    solid.cyl(fx, 2.0, fz, 1.2, 0.3, 0.2, 10, hex("#8d8a80"));
    warm.frame(0, 0, 0);
    warm.ball(fx, 2.5, fz, 0.35, 1.2, hex("#bfe8ff"), 6);
    colliders.push({ x: fx, y: 0.5, z: fz, w: 6.2, h: 1.1, d: 6.2 });
    // clock tower (landmark 1)
    const tx = pcx;
    const tz = pl.z1 - 4;
    solid.cyl(tx, 0.07, tz, 2.4, 2.1, 0.8, 4, hex("#6b5a4c"), true);
    solid.box(tx, 0.07, tz, 3.2, 12.5, 3.2, hex("#8c7360"));
    solid.box(tx, 12.5, tz, 3.8, 0.5, 3.8, hex("#6b5a4c"));
    solid.box(tx, 13.0, tz, 3.4, 4.2, 3.4, hex("#8c7360"));
    solid.box(tx, 17.2, tz, 4.0, 0.4, 4.0, hex("#6b5a4c"));
    solid.cyl(tx, 17.6, tz, 2.5, 0.05, 5.5, 4, hex("#3e5b66"), false);
    warm.frame(0, 0, 0);
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dz]) => {
      // a lit clock face on each side
      const e = 1.72;
      if (dx === 0) warm.box(tx, 14.4, tz + dz * e, 2.3, 2.3, 0.08, hex("#fff1c9"));
      else warm.box(tx + dx * e, 14.4, tz, 0.08, 2.3, 2.3, hex("#fff1c9"));
      solid.frame(0, 0, 0);
      // the hands: the minute hand stands 1.5 cm proud of the hour hand, so where they cross they don't share a face
      if (dx === 0) { solid.box(tx, 14.4, tz + dz * (e + 0.05), 0.12, 0.9, 0.06, DARK); solid.box(tx + 0.3, 14.4, tz + dz * (e + 0.065), 0.7, 0.1, 0.06, DARK); }
      else { solid.box(tx + dx * (e + 0.05), 14.4, tz, 0.06, 0.9, 0.12, DARK); solid.box(tx + dx * (e + 0.065), 14.4, tz + 0.3, 0.06, 0.1, 0.7, DARK); }
    });
    solid.box(tx, 22.9, tz, 0.12, 2.2, 0.12, METAL);
    colliders.push({ x: tx, y: 8.6, z: tz, w: 3.4, h: 17.2, d: 3.4 });
    stats.landmarks++;
    // benches, cafe tables, lamps and planters
    [[pl.x0 + 3, pcz + 2], [pl.x1 - 3, pcz + 2], [pl.x0 + 3, pcz - 2], [pl.x1 - 3, pcz - 2]].forEach(([x, z], i) => bench(x, z, i % 2 ? -Math.PI / 2 : Math.PI / 2));
    [[pl.x0 + 5, pl.z1 - 12], [pl.x1 - 5, pl.z1 - 12], [pl.x0 + 8, pl.z1 - 8]].forEach(([x, z]) => {
      solid.frame(x, z, 0);
      solid.cyl(0, 0.07, 0, 0.5, 0.5, 0.05, 8, hex("#c9c2b0"));
      solid.cyl(0, 2.0, 0, 1.3, 0.05, 0.45, 8, hex("#c04a46"));
      solid.cyl(0, 0.07, 0, 0.05, 0.05, 2.0, 6, METAL);
      [[0.9, 0], [-0.9, 0]].forEach(([dx, dz]) => solid.cyl(dx, 0.07, dz, 0.22, 0.22, 0.45, 6, DARK));
      colliders.push({ x, y: 0.4, z, w: 1.0, h: 0.8, d: 1.0 });
    });
    [[pl.x0 + 1.2, pl.z0 + 1.2], [pl.x1 - 1.2, pl.z0 + 1.2], [pl.x0 + 1.2, pl.z1 - 1.2], [pl.x1 - 1.2, pl.z1 - 1.2], [pcx - 6, pl.z0 + 12], [pcx + 6, pl.z0 + 12]].forEach(([x, z]) => {
      lampGlobe(x, z, 3.6);
      lampSpots.push([x, z]);
      stats.plazaLamps++;
    });
    [[pl.x0 + 1.4, pcz], [pl.x1 - 1.4, pcz]].forEach(([x, z]) => {
      solid.frame(0, 0, 0); // back to world coordinates: the box used the last lamp's frame and stood 100 m away
      solid.bbox(x, 0.07, z, 1.6, 0.5, 1.6, hex("#5b4636"), 0.05);
      tree(x, z, 0.7);
      colliders.pop();
      colliders.push({ x, y: 0.5, z, w: 1.6, h: 1, d: 1.6 });
      stats.planters++;
    });
    G = 0;
  }

  /* ---------------- landmark 2: the Needle ---------------- */
  {
    const nx = R.needle.x;
    const nz = R.needle.z;
    solid.frame(0, 0, 0);
    solid.cyl(nx, 0, nz, 3.2, 1.0, 44, 8, hex("#7d8791"));
    solid.cyl(nx, 0, nz, 3.8, 3.8, 1.2, 8, hex("#3a4350"));
    solid.cyl(nx, 40, nz, 5.4, 6.2, 1.1, 12, hex("#2c333c"));
    solid.cyl(nx, 41.1, nz, 5.0, 5.0, 2.4, 12, hex("#1d2a3a"));
    solid.cyl(nx, 43.5, nz, 6.0, 4.4, 0.7, 12, hex("#2c333c"));
    solid.cyl(nx, 44.2, nz, 0.7, 0.18, 24, 6, hex("#9aa3ab"));
    warm.frame(0, 0, 0);
    warm.cyl(nx, 41.2, nz, 5.08, 5.08, 2.1, 12, hex("#9fd6ff"), false); // the lit observation deck
    warm.cyl(nx, 39.6, nz, 6.3, 6.3, 0.16, 12, hex("#3ecbff"), false); // neon ring under it
    warm.ball(nx, 68.6, nz, 0.55, 1, hex("#ff4a3a"), 6); // beacon
    colliders.push({ x: nx, y: 6, z: nz, w: 5.4, h: 12, d: 5.4 });
    stats.landmarks++;
  }

  /* ---------------- landmark 3: the Storm Tank ---------------- */
  {
    const tx = R.tank.x;
    const tz = R.tank.z;
    solid.frame(0, 0, 0);
    solid.cyl(tx, 0, tz, 7.1, 7.1, 20, 16, hex("#4f5a66"));
    solid.cyl(tx, 20, tz, 7.2, 5.6, 2.2, 16, hex("#39424d"));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      solid.box(tx + Math.cos(a) * 7.25, 0, tz + Math.sin(a) * 7.25, 0.35, 21, 0.35, hex("#2c333c")); // lattice ribs
    }
    solid.box(tx, 22.2, tz, 0.3, 14, 0.3, METAL); // lightning mast
    solid.box(tx, 29, tz, 2.4, 0.18, 0.18, METAL);
    solid.box(tx, 27.6, tz, 1.6, 0.18, 0.18, METAL);
    warm.frame(0, 0, 0);
    warm.cyl(tx, 13.2, tz, 7.2, 7.2, 0.55, 16, hex("#3ecbff"), false); // blue neon band
    warm.cyl(tx, 6.1, tz, 7.2, 7.2, 0.28, 16, hex("#3e7bff"), false);
    warm.ball(tx, 36.4, tz, 0.5, 1, hex("#ff4a3a"), 6);
    colliders.push({ x: tx, y: 11, z: tz, w: 13.6, h: 22, d: 13.6 }, { x: tx, y: 11, z: tz, w: 13.6, h: 22, d: 13.6, yaw: Math.PI / 4 });
    stats.landmarks++;
  }

  /* ---------------- rooftops ---------------- */
  const roof = new Part();
  const GREY = [hex("#7b848d"), hex("#6a7078"), hex("#8a8f94")];
  /* the bevelled kit: every piece is built from Part.bbox / Part.drum (chamfered, normals out). On low quality (phones)
     the small detail (louvres, the fan grille, tank ribs, antenna spars) is left off and drums use fewer sides, so the
     merged roof mesh stays small; the footprints and the AC collider boxes are the same at both levels. */
  const lowKit = (() => {
    try {
      const lk = world.look || (window.day && window.day.look);
      return !!(lk && lk.quality && lk.quality() === "low");
    } catch (e) { return false; }
  })();
  const SEG = lowKit ? 8 : 12;
  function acUnit(x, y, z, yaw) {
    roof.frame(x, z, yaw);
    const body = GREY[Math.floor(rng() * GREY.length)];
    const trim = [body[0] * 0.7, body[1] * 0.7, body[2] * 0.7];
    const pipe = hex("#b07a4f");
    roof.bbox(0, y, 0, 1.5, 0.08, 1.1, trim, 0.025); // plinth the same footprint, so the collider stays right
    roof.bbox(0, y + 0.08, 0, 1.46, 0.78, 1.06, body, 0.07); // casing, set in 2 cm so the plinth and lid read as parts
    roof.bbox(0, y + 0.86, 0, 1.5, 0.05, 1.1, trim, 0.02); // lid
    // fan well on the lid: a ring wall round a dark floor
    roof.drum(-0.35, y + 0.91, 0, 0.34, 0.06, SEG, trim, 0.015);
    roof.cyl(-0.35, y + 0.915, 0, 0.29, 0.29, 0.01, SEG, DARK);
    if (!lowKit) {
      roof.bbox(-0.35, y + 0.93, 0, 0.56, 0.02, 0.04, trim, 0.008);
      roof.bbox(-0.35, y + 0.935, 0, 0.04, 0.02, 0.56, trim, 0.008);
      // louvres on both long faces
      for (let i = 0; i < 5; i++) {
        const ly = y + 0.2 + i * 0.1;
        roof.bbox(-0.2, ly, 0.54, 0.8, 0.05, 0.03, DARK, 0.012);
        roof.bbox(-0.2, ly, -0.54, 0.8, 0.05, 0.03, DARK, 0.012);
      }
    } else {
      roof.bbox(-0.2, y + 0.2, 0.54, 0.8, 0.45, 0.03, DARK, 0.012);
      roof.bbox(-0.2, y + 0.2, -0.54, 0.8, 0.45, 0.03, DARK, 0.012);
    }
    // service panel with its handle, and a copper line out of the side
    roof.bbox(0.5, y + 0.2, 0.54, 0.38, 0.4, 0.03, trim, 0.01);
    roof.bbox(0.5, y + 0.4, 0.56, 0.1, 0.03, 0.02, DARK, 0.006);
    roof.bbox(0.76, y + 0.3, -0.2, 0.08, 0.04, 0.04, pipe, 0.012);
    roof.bbox(0.8, y + 0.08, -0.2, 0.04, 0.26, 0.04, pipe, 0.012);
    stats.roofUnits++;
  }
  function waterTank(x, y, z) {
    roof.frame(x, z, 0);
    const wood = hex("#4a3b30");
    [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].forEach(([dx, dz]) => roof.bbox(dx, y, dz, 0.16, 1.6, 0.16, wood, 0.03));
    roof.bbox(0, y + 1.6, 0, 2.6, 0.12, 2.6, wood, 0.04);
    roof.drum(0, y + 1.72, 0, 1.2, 1.88, SEG, hex("#8a6a4c"), 0.1); // the barrel
    if (!lowKit) {
      roof.drum(0, y + 2.3, 0, 1.23, 0.07, SEG, hex("#3c3027"), 0.02); // iron hoops
      roof.drum(0, y + 3.0, 0, 1.23, 0.07, SEG, hex("#3c3027"), 0.02);
    }
    roof.cyl(0, y + 3.6, 0, 1.3, 0.12, 0.6, SEG, hex("#5b4636"), true); // the conical lid, overhanging the barrel
    stats.roofUnits++;
  }
  function antenna(x, y, z, tall) {
    conductors.push({ x, y: y + tall + 0.4, z, kind: "antenna" });
    roof.frame(x, z, 0);
    roof.bbox(0, y, 0, 0.12, tall, 0.12, METAL, 0.02);
    roof.bbox(0, y + tall * 0.7, 0, 1.4, 0.08, 0.08, METAL, 0.015);
    roof.bbox(0, y + tall * 0.85, 0, 0.9, 0.08, 0.08, METAL, 0.015);
    if (!lowKit) {
      roof.drum(0, y, 0, 0.2, 0.12, 8, DARK, 0.03); // the foot flange
      roof.bbox(0, y + tall, 0, 0.06, 0.4, 0.06, METAL, 0.01); // the whip
    }
    stats.roofUnits++;
  }
  function dish(x, y, z, yaw) {
    roof.frame(x, z, yaw);
    roof.bbox(0, y, 0, 0.1, 0.9, 0.1, METAL, 0.02);
    roof.cyl(0, y + 0.9, 0.2, 0.55, 0.12, 0.2, SEG, hex("#d8dde0"), true);
    stats.roofUnits++;
  }
  function vent(x, y, z) {
    roof.frame(x, z, 0);
    roof.drum(0, y, 0, 0.3, 0.8, Math.max(8, SEG), METAL, 0.05);
    roof.drum(0, y + 0.8, 0, 0.5, 0.14, Math.max(8, SEG), DARK, 0.04); // the rain cap
    stats.roofUnits++;
  }
  /* a stair bulkhead: the little hut where a stair comes out on a flat roof (filler roofs only: the walkable ones keep the ramp) */
  function stairHut(x, y, z, yaw) {
    roof.frame(x, z, yaw);
    const wall = hex("#8d8a82");
    roof.bbox(0, y, 0, 2.4, 2.3, 2.0, wall, 0.08);
    roof.bbox(0, y + 2.3, 0, 2.6, 0.14, 2.2, hex("#5d6168"), 0.05); // the cap, overhanging
    roof.bbox(0, y, 1.0, 0.9, 1.7, 0.06, hex("#3b4a5c"), 0.02); // the door
    roof.bbox(0, y + 1.7, 1.0, 1.06, 0.07, 0.1, hex("#5d6168"), 0.02); // its lintel
    stats.roofUnits++;
  }
  fillers.forEach((f) => {
    if (!f.near) return;
    const k = rng();
    const qx = f.w * 0.28;
    const qz = f.d * 0.28;
    if (f.w >= 7 && f.d >= 7) {
      if (k < 0.5) acUnit(f.x + qx * (rng() < 0.5 ? -1 : 1), f.h, f.z + qz * (rng() < 0.5 ? -1 : 1), rng() < 0.5 ? 0 : Math.PI / 2);
      if (k > 0.25 && k < 0.6) waterTank(f.x - qx, f.h, f.z - qz * (rng() < 0.5 ? -1 : 1));
      if (k > 0.55 && k < 0.8) dish(f.x + qx, f.h, f.z - qz, rng() * 6);
      if (k > 0.8) vent(f.x - qx, f.h, f.z + qz);
      if (f.w >= 11 && f.d >= 11 && Math.abs(Math.sin(f.x * 12.9898 + f.z * 78.233)) < 0.35) stairHut(f.x, f.h, f.z, 0); // dead centre, clear of the corner units (own hash: the rng sequence is untouched)
      if (f.h > 24 && rng() < 0.6) antenna(f.x + f.w * 0.3, f.h, f.z + f.d * 0.3, 6 + rng() * 5);
    }
  });
  /* the walkable roofs: a few units on the south half, away from the ramp's landing on the north,
     plus distinct surface zones (gravel deck, metal grating, tar membrane, and roof-drain puddle basin) */
  (city.blocks || []).forEach((b) => {
    const sx = b.w * 0.28;
    if (b.stair) {
      // along the back (south) parapet, clear of the ramp's landing and of the roof-to-roof glide down the middle
      const zb = b.z - b.d / 2 + 1.4;
      acUnit(b.x - sx, b.h, zb, 0);
      acUnit(b.x + sx * 0.2, b.h, zb, 0);
      vent(b.x + sx * 1.1, b.h, zb);
      colliders.push({ x: b.x - sx, y: b.h + 0.45, z: zb, w: 1.5, h: 0.9, d: 1.1 }, { x: b.x + sx * 0.2, y: b.h + 0.45, z: zb, w: 1.5, h: 0.9, d: 1.1 });
      // Walkable rooftop surface zones (non-overlapping, 3-4 cm pads merged into props-roof):
      roof.frame(b.x, b.z, 0);
      // 1. Central gravel ballast bed (dx = 0, dz = 0)
      roof.box(0, b.h, 0, 3.1, 0.032, 2.8, hex("#726d64"));
      // 2. East metal grating catwalk (dx = 3.0, dz = 0)
      roof.box(3.0, b.h, 0, 2.2, 0.038, 2.8, METAL);
      for (let gz = -1.1; gz <= 1.11; gz += 0.55) {
        roof.box(3.0, b.h + 0.038, gz, 2.0, 0.012, 0.12, DARK);
      }
      // 3. West tar membrane patch (dx = -4.2, dz = -0.2)
      roof.box(-4.2, b.h, -0.2, 2.3, 0.028, 3.0, hex("#232730"));
      // 4. Roof-drain puddle basin + metal gutter scupper (dx = -2.2, dz = 1.6)
      roof.box(-2.25, b.h, 1.6, 1.3, 0.034, 2.1, hex("#2c4e6b")); // between the gravel (to -1.55) and the tar (from -3.05): no shared tops
      roof.cyl(-2.25, b.h + 0.034, 1.6, 0.28, 0.28, 0.016, 8, METAL);
      roof.box(-2.2, b.h, b.d / 2 - 0.35, 0.14, 0.22, 0.35, METAL); // gutter scupper at parapet, on the roof
    } else if (b.w >= 12) {
      acUnit(b.x - sx, b.h, b.z, 0);
      waterTank(b.x + sx, b.h, b.z + b.d * 0.1);
      antenna(b.x, b.h, b.z - b.d * 0.2, 5);
    }
  });

  /* ---------------- meshes and materials ---------------- */
  const solidMat = new B.StandardMaterial("props-solid", scene);
  solidMat.diffuseColor = new B.Color3(1, 1, 1);
  solidMat.specularColor = new B.Color3(0.04, 0.04, 0.05);
  solidMat.maxSimultaneousLights = 4;
  const warmMat = new B.StandardMaterial("props-glow", scene);
  warmMat.diffuseColor = new B.Color3(0.2, 0.2, 0.2);
  warmMat.specularColor = new B.Color3(0, 0, 0);
  warmMat.emissiveColor = new B.Color3(0.15, 0.15, 0.15);
  warmMat.maxSimultaneousLights = 2;
  const meshes = [];
  if (!solid.empty) meshes.push(solid.mesh("props-solid", solidMat, scene));
  if (!roof.empty) {
    /* Rooftop units are grey boxes lit only by the weak dusk/night hemisphere light, so they read as flat black
       cuboids next to the PBR roofs. Their own material adds an ambient fill (scene.ambientColor x this x the vertex
       colour), so they stay a dark grey with visible form at any hour. */
    const roofMat = solidMat.clone("props-roof-mat");
    roofMat.ambientColor = new B.Color3(3, 3, 3);
    meshes.push(roof.mesh("props-roof", roofMat, scene));
  }
  if (!flat.empty) {
    /* The paving, lawn and path tiles are lit only by the weak dusk/night hemisphere light (and the rain's grey), so the
       plaza read as a near-black floor with no detail (cold-start, bad lighting). Same ambient fill as the roof units, a
       little lower so the tiles stay darker than daylight and the lamp pools still show. */
    const flatMat = solidMat.clone("props-flat-mat");
    flatMat.ambientColor = new B.Color3(2, 2, 2.1);
    const fm = flat.mesh("props-flat", flatMat, scene);
    fm.receiveShadows = true;
    meshes.push(fm);
  }
  if (!warm.empty) meshes.push(warm.mesh("props-glow", warmMat, scene));
  meshes.forEach((m) => {
    m.useVertexColors = true;
    m.hasVertexAlpha = false;
  });
  if (colliders.length) world.addSolids(colliders);

  const pipeline = world.stage && world.stage.pipeline;
  const baseBloom = pipeline && pipeline.bloomWeight != null ? pipeline.bloomWeight : 0.16;
  let state = { neon: 0, glow: 0, bloom: baseBloom };

  let neonBuzzAcc = 0;
  /* called from the city's night loop (every 0.3 s) with the same weights it lights the windows by */
  function update(w, lit) {
    const neon = Math.min(1, lit.shops);
    const lamps = Math.min(1, lit.lamps);
    const t = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    signMats.forEach((m, i) => {
      const f = signFlicker[i];
      // occasional dead tube flicker, otherwise a soft 50–60 Hz shimmer
      if (f.dead > 0) f.dead -= 0.3;
      else if (Math.random() < 0.015 * neon) f.dead = 0.15 + Math.random() * 0.35;
      const shimmer = 0.85 + 0.15 * Math.sin(t * (8 + f.rate) + f.phase);
      const k = f.dead > 0 ? (Math.random() < 0.55 ? 0.08 : 0.55) : shimmer;
      const e = (0.3 + neon * 1.0) * k;
      m.emissiveColor.set(e, e, e);
    });
    Object.values(spillMats).forEach((m) => m.emissiveColor.set(neon * 0.8, neon * 0.8, neon * 0.8));
    warmMat.emissiveColor.set(0.15 + lamps * 1.35, 0.15 + lamps * 1.35, 0.15 + lamps * 1.2);
    // soft bloom swells as the light goes
    const bloom = baseBloom + 0.16 * Math.min(1, w.dusk * 0.6 + w.night);
    if (pipeline && Math.abs(bloom - pipeline.bloomWeight) > 0.003) pipeline.bloomWeight = bloom;
    // neon buzz: a quiet 120 Hz hum under the signs while Sound is on and neon is up
    neonBuzzAcc += 0.3;
    if (neonBuzzAcc > 2.4 && neon > 0.4) {
      neonBuzzAcc = 0;
      try {
        if (window.day && window.day.sfx && window.day.sfx.neonBuzz) window.day.sfx.neonBuzz(neon);
      } catch (e) { /* sfx optional */ }
    }
    state = { neon, glow: lamps, bloom, flicker: true, gen: Object.keys(neonGen).length };
  }

  return {
    update,
    info() {
      return {
        ...stats,
        meshes: meshes.length,
        colliders: colliders.length,
        signKinds: SIGNS.length,
        neonGen: Object.keys(neonGen).length,
        neonWords: SIGNS.map((s) => s.word),
        lit: { ...state },
        plaza: { ...R.plaza },
        needle: { ...R.needle },
        conductors: conductors.slice(),
        tank: { ...R.tank },
      };
    },
  };
}
