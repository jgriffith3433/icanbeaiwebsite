/* ==========================================================================
   The city's people and cars (J, 2026-11-05: a lightweight citizen and vehicle simulation).
   Read after js/cityscape.js. Everything is a thin instance of a handful of shared meshes, so the
   whole crowd is ~10 draw calls whatever its size, and the sim is plain arrays.

   - The clock rules it. `day.config.js` `crowd.curve` gives, per hour, how full the sidewalks and
     the lanes are (0..1): commuters in the morning, a lunch crowd, the evening commute and dinner,
     and a quiet city at night. Weather thins it (rain, storm), and the quality scale and a frame-time
     guard thin it more. Jumping the clock re-seeds the city for that hour at once.
   - People walk a graph of corner nodes (the sidewalks of every avenue and cross street). At a
     corner they go on, turn, or wait for the signal and cross at the crosswalk. Along the way they
     step into a building at a door site (a shrink into the doorway) and others come out of one
     (a grow). Over budget, the surplus walk to the next door and go in.
   - Cars drive two lanes on every avenue and cross street, follow the car ahead, and stop at the
     stop lines on red (a signal per junction, in step with the people crossing). They slow for
     rain, snow and fog, light their lamps at dusk, and brake for him if he stands in the lane.
   - Reactions (J, 2026-11-05): when the weather was set by an ability (`weather.now().manual`), people
     answer it for as long as it lasts: lightning (a storm) stops them and they look up, then they run;
     rain sends them running, the ones without an umbrella ducking into the nearest door; a gale slows
     them, leaning, one hand on the hat; fog slows the walkers and the cars; a sun break slows them to a
     stroll with a hop and hands up. Each person blends in after a small random delay (`rdelay`) and
     out within ~0.8 s of the ability weather ending. No new meshes per person: one shared "hands/hat" instance.
   - It never changes the day: it reads the clock, the weather and where he is. Playtest: `crowd`.
     `day.crowd.info()` says what's out.
   ========================================================================== */
const B = typeof window !== "undefined" ? window.BABYLON : null;

export const SIDE = 2.6; // how far from a road's centre line people walk: on the sidewalk (2.3 to 3.5), road side of the kerb props
const LANE = 1.2; // how far from the centre line a car's lane is
const CYCLE = 36; // signal cycle, seconds
const STOP = 5.6; // a stop line, metres before the junction centre (front bumper)
const CAR_LEN = 4.3;
const PED_Y = 0.06; // the sidewalk's top
const TURN_RATE = 10; // how fast people swing round to a new heading (per second)

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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

/* Row-major matrix for Babylon's thin instances: uniform scale s horizontally, sy vertically, yaw about Y. */
function put(arr, i, x, y, z, yaw, s, sy) {
  const c = Math.cos(yaw);
  const n = Math.sin(yaw);
  const o = i * 16;
  arr[o] = c * s; arr[o + 1] = 0; arr[o + 2] = -n * s; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = n * s; arr[o + 9] = 0; arr[o + 10] = c * s; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}
function hide(arr, i) {
  const o = i * 16;
  arr.fill(0, o, o + 16);
  arr[o + 15] = 1;
}

/** Hour of day -> { people, cars } fullness from the curve (keypoints [hour, people, cars], wrapping at 24). */
export function densityAt(curve, hour) {
  const h = ((hour % 24) + 24) % 24;
  let a = curve[curve.length - 1];
  let b = curve[0];
  for (let i = 0; i < curve.length; i++) {
    if (curve[i][0] > h) { b = curve[i]; a = curve[i - 1] || curve[curve.length - 1]; break; }
    a = curve[i];
    b = curve[(i + 1) % curve.length];
  }
  let span = b[0] - a[0];
  let off = h - a[0];
  if (span <= 0) span += 24;
  if (off < 0) off += 24;
  const k = clamp(off / span, 0, 1);
  const e = k * k * (3 - 2 * k);
  return { people: lerp(a[1], b[1], e), cars: lerp(a[2], b[2], e) };
}

export function phaseAt(phases, hour) {
  const h = ((hour % 24) + 24) % 24;
  let p = phases[phases.length - 1];
  for (let i = 0; i < phases.length; i++) if (phases[i][0] <= h) p = phases[i];
  return p[1];
}

/** Signal phase for a junction at time t: which road has the green. */
export function signalAt(t, offset) {
  const p = (((t + offset) % CYCLE) + CYCLE) % CYCLE;
  if (p < 14) return { avenue: "go", cross: "stop" };
  if (p < 16) return { avenue: "amber", cross: "stop" };
  if (p < 18) return { avenue: "stop", cross: "stop" };
  if (p < 32) return { avenue: "stop", cross: "go" };
  if (p < 34) return { avenue: "stop", cross: "amber" };
  return { avenue: "stop", cross: "stop" };
}

export function installCrowd(world) {
  if (!world || !world.scene || !B) return null;
  if (world.crowd) return world.crowd;
  const scene = world.scene;
  const cfg = window.DAY_CONFIG || {};
  const cc = cfg.crowd || {};
  const city = cfg.city || { avenues: [], crosses: [] };
  const street = cfg.street || { z: 12.6, from: -48, to: 210 };
  const RZ = street.z;
  const look = world.look || (window.day && window.day.look);
  const rng = makeRng(20261105);
  const MAXP = (cc.budget && cc.budget.people) || 260;
  const MAXC = (cc.budget && cc.budget.cars) || 64;
  const curve = cc.curve || [[0, 0.03, 0.05], [8.5, 0.8, 1], [12.5, 0.95, 0.6], [18, 0.8, 1], [24, 0.03, 0.05]];
  const phases = cc.phases || [[0, "night"]];

  /* ---------------- the street grid ---------------- */
  const avs = [{ z: RZ, from: street.from, to: street.to }]
    .concat((city.avenues || []).filter((a) => Math.abs(a.z - RZ) > 1))
    .sort((a, b) => a.z - b.z);
  const crs = (city.crosses || []).slice().sort((a, b) => a.x - b.x);

  /* Corner nodes at every junction: (cross x +- SIDE, avenue z +- SIDE). */
  const nodes = [];
  const nodeAt = {};
  const junctions = []; // { x, z, ai, ci, offset }
  avs.forEach((a, ai) => crs.forEach((c, ci) => {
    if (c.x < a.from + 6 || c.x > a.to - 6 || a.z < c.from || a.z > c.to) return;
    junctions.push({ x: c.x, z: a.z, ai, ci, offset: (ai * 9 + ci * 5) % CYCLE });
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      const n = { id: nodes.length, x: c.x + sx * SIDE, z: a.z + sz * SIDE, ai, ci, sx, sz, edges: [] };
      nodeAt[`${ai},${ci},${sx},${sz}`] = n;
      nodes.push(n);
    }));
  }));
  const edges = [];
  function link(a, b, kind, nx, nz) {
    if (!a || !b) return;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const e = { a, b, kind, len, nx, nz, doors: [] };
    edges.push(e);
    a.edges.push({ to: b, e, dir: 1 });
    b.edges.push({ to: a, e, dir: -1 });
  }
  const N = (ai, ci, sx, sz) => nodeAt[`${ai},${ci},${sx},${sz}`];
  junctions.forEach((j) => {
    // across the avenue (walking in z) and across the cross street (walking in x)
    [-1, 1].forEach((s) => {
      link(N(j.ai, j.ci, s, -1), N(j.ai, j.ci, s, 1), "cross-av", 0, 0);
      link(N(j.ai, j.ci, -1, s), N(j.ai, j.ci, 1, s), "cross-st", 0, 0);
    });
    // along the avenue to the next junction east
    const nx = junctions.find((k) => k.ai === j.ai && k.ci === j.ci + 1);
    if (nx) [-1, 1].forEach((sz) => link(N(j.ai, j.ci, 1, sz), N(nx.ai, nx.ci, -1, sz), "walk", 0, sz));
    // along the cross street to the next avenue north
    const nz = junctions.find((k) => k.ci === j.ci && k.ai === j.ai + 1);
    if (nz) [-1, 1].forEach((sx) => link(N(j.ai, j.ci, sx, 1), N(nz.ai, nz.ci, sx, -1), "walk", sx, 0));
  });

  /* Doors: where a building stands at the sidewalk's back, every few metres. */
  const solids = (world.solids || []).filter((s) => !s.roll && s.w >= 4 && s.d >= 4);
  const inBuilding = (x, z) => solids.some((s) => Math.abs(x - s.x) < s.w / 2 && Math.abs(z - s.z) < s.d / 2);
  const doorSites = [];
  edges.forEach((e, ei) => {
    if (e.kind !== "walk") return;
    for (let d = 3 + rng() * 3; d < e.len - 3; d += 5 + rng() * 5) {
      const t = d / e.len;
      const px = lerp(e.a.x, e.b.x, t);
      const pz = lerp(e.a.z, e.b.z, t);
      if (![3.0, 4.2, 5.4].some((o) => inBuilding(px + e.nx * o, pz + e.nz * o))) continue;
      const site = { e, t, px, pz, dx: px + e.nx * 2.3, dz: pz + e.nz * 2.3 };
      e.doors.push(site);
      doorSites.push(site);
    }
  });

  /* Lanes for the cars: two on every avenue, two on every cross street. */
  const lanes = [];
  avs.forEach((a, ai) => [1, -1].forEach((dir) => {
    lanes.push({ axis: "x", c: a.z - dir * LANE, dir, from: -44, to: 208, ai, main: Math.abs(a.z - RZ) < 1, cars: [], stops: [] });
  }));
  crs.forEach((c, ci) => [1, -1].forEach((dir) => {
    lanes.push({ axis: "z", c: c.x + dir * LANE, dir, from: Math.max(-46, c.from), to: Math.min(90, c.to), ci, main: false, cars: [], stops: [] });
  }));
  lanes.forEach((l) => {
    l.len = l.to - l.from;
    l.cruise = 9 + rng() * 3;
    // distance along the lane (s) at which a front bumper has to stop for each junction
    l.stops = junctions
      .filter((j) => (l.axis === "x" ? j.ai === l.ai : j.ci === l.ci))
      .map((j) => {
        const centre = l.axis === "x" ? j.x : j.z;
        const s = l.dir > 0 ? centre - l.from - STOP : l.to - centre - STOP;
        return { s, j, road: l.axis === "x" ? "avenue" : "cross" };
      })
      .filter((st) => st.s > 0)
      .sort((p, q) => p.s - q.s);
  });
  const laneWeight = lanes.map((l) => (l.main ? 2.2 : l.axis === "x" ? 1.2 : 0.7) * l.len);
  const laneWeightSum = laneWeight.reduce((p, q) => p + q, 0);
  const laneXZ = (l, s) => (l.axis === "x"
    ? { x: l.dir > 0 ? l.from + s : l.to - s, z: l.c }
    : { x: l.c, z: l.dir > 0 ? l.from + s : l.to - s });

  /* ---------------- meshes: all thin instances ---------------- */
  const stdMat = (name, color, emissive) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = new B.Color3(1, 1, 1);
    m.specularColor = new B.Color3(0.06, 0.06, 0.07);
    if (emissive) m.emissiveColor = emissive;
    m.maxSimultaneousLights = 4;
    return m;
  };
  const colorsFor = (n, pick) => {
    const arr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const c = B.Color3.FromHexString(pick(i));
      arr.set([c.r, c.g, c.b, 1], i * 4);
    }
    return arr;
  };
  function instanced(name, mesh, count, colors, mat) {
    mesh.name = name;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.doNotSyncBoundingInfo = true;
    mesh.thinInstanceEnablePicking = false;
    const buf = new Float32Array(count * 16);
    for (let i = 0; i < count; i++) hide(buf, i);
    mesh.thinInstanceSetBuffer("matrix", buf, 16, false);
    if (colors) mesh.thinInstanceSetBuffer("color", colors, 4, true);
    mesh.thinInstanceCount = count;
    return buf;
  }
  const cyl = (h, d, tess) => B.MeshBuilder.CreateCylinder("c", { height: h, diameter: d, tessellation: tess || 8 }, scene);
  const box = (w, h, d, x, y, z) => {
    const m = B.MeshBuilder.CreateBox("b", { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z);
    m.bakeCurrentTransformIntoVertices(); // the offset belongs to the shape: an instance's matrix turns it with the car
    return m;
  };
  const merge = (list) => B.Mesh.MergeMeshes(list, true, true);

  const TOPS = ["#5a6d82", "#8a5a4a", "#4a6b5a", "#6a5a78", "#7a6a4a", "#3a5a6a", "#a05a5a", "#c9c2b0", "#2f3a4a", "#b08a4a", "#4f6f8f", "#7a3f58"];
  const SKINS = ["#e2b394", "#c9967a", "#d4a574", "#b8896a", "#e8c4a8", "#8d5c42", "#6b4532", "#f0cdb4"];
  const PANTS = ["#2e333c", "#3a3e46", "#22262e", "#4a4438", "#2c3a52"];
  const CARS = ["#7d8a96", "#b55a3c", "#e4e0d6", "#3e4a5c", "#567a62", "#8a6aa0", "#c2c7cc", "#4b4b4b", "#a63d3d", "#d9b13b", "#2f5f8f", "#1f2328"];

  /* Each person's look is drawn once from a themed outfit (top, trousers, bag go together; hair is a natural tone) so the
     street varies but stays one palette. Everything stays a shared material + thin instance. */
  const HAIRS = ["#1c1814", "#2b1d14", "#4a3322", "#6b4a2a", "#a8803f", "#c9b27a", "#8a8a8c", "#5a2a1e", "#0f0f12"];
  const THEMES = [
    ["#5a6d82", "#2c3a52", "#8a5a4a"], ["#8a5a4a", "#2e333c", "#3a5a6a"], ["#4a6b5a", "#4a4438", "#c9c2b0"], ["#6a5a78", "#22262e", "#b08a4a"],
    ["#c9c2b0", "#3a3e46", "#7a3f58"], ["#a05a5a", "#2c3a52", "#2f3a4a"], ["#3a5a6a", "#4a4438", "#a05a5a"], ["#b08a4a", "#22262e", "#4f6f8f"],
    ["#2f3a4a", "#3a3e46", "#8a5a4a"], ["#4f6f8f", "#2e333c", "#c9c2b0"], ["#7a3f58", "#22262e", "#7a6a4a"], ["#7a6a4a", "#2c3a52", "#5a6d82"],
  ];
  const looks = [];
  const lrng = makeRng(77123);
  for (let i = 0; i < MAXP; i++) {
    const th = THEMES[Math.floor(lrng() * THEMES.length)];
    looks.push({
      top: th[0], pants: th[1], bagC: th[2], skin: SKINS[Math.floor(lrng() * SKINS.length)], hair: HAIRS[Math.floor(lrng() * HAIRS.length)],
      hairLong: lrng() < 0.35 ? 1 : 0, bald: lrng() < 0.07, bag: lrng() < 0.5 ? (lrng() < 0.55 ? 1 : 2) : 0, dog: lrng() < 0.09,
      girth: 0.9 + lrng() * 0.25, dogC: ["#8a6a45", "#2a2622", "#d8c9a8", "#b5602f"][Math.floor(lrng() * 4)],
    });
  }
  const people = [];
  const pTop = colorsFor(MAXP, (i) => looks[i].top);
  const pSkin = colorsFor(MAXP, (i) => looks[i].skin);
  const pPants = colorsFor(MAXP, (i) => looks[i].pants);
  /* Closer to the player's model: two legs with a gap, shoes, and arms at the sides (still thin instances, +2 draw calls). */
  const legPart = (x) => { const m = cyl(0.8, 0.15, 6); m.position.set(x, 0, 0); m.bakeCurrentTransformIntoVertices(); return m; };
  const legsMesh = merge([legPart(-0.085), legPart(0.085)]);
  const shoesMesh = merge([box(0.15, 0.09, 0.27, -0.085, -0.355, 0.05), box(0.15, 0.09, 0.27, 0.085, -0.355, 0.05)]);
  const armPart = (x) => { const m = cyl(0.56, 0.1, 6); m.position.set(x, 0, 0); m.bakeCurrentTransformIntoVertices(); return m; };
  const armsMesh = merge([armPart(-0.27), armPart(0.27)]);
  const torsoMesh = cyl(0.6, 0.42, 8);
  const headMesh = B.MeshBuilder.CreateSphere("h", { diameter: 0.25, segments: 6 }, scene);
  const umbMesh = cyl(0.07, 0.95, 10);
  // the same umbrella blown inside out: a cup, open to the sky, on its stick (js/windfog.js's gusts flip them)
  const umbFlipMesh = merge([
    B.MeshBuilder.CreateCylinder("uf", { height: 0.4, diameterTop: 0.95, diameterBottom: 0.1, tessellation: 10, cap: B.Mesh.NO_CAP }, scene),
    box(0.03, 0.9, 0.03, 0, -0.45, 0),
  ]);
  const handMesh = cyl(0.06, 0.3, 8); // a hand on the hat in a gale, hands up in the sun
  const mHand = instanced("crowd-hand", handMesh, MAXP, colorsFor(MAXP, (i) => SKINS[(i * 5 + 1) % SKINS.length]), stdMat("crowd-hand"));
  handMesh.setEnabled(false);
  const mLegs = instanced("crowd-legs", legsMesh, MAXP, pPants, stdMat("crowd-legs"));
  const mShoes = instanced("crowd-shoes", shoesMesh, MAXP, colorsFor(MAXP, (i) => ["#1b1a1c", "#2a2420", "#d8d4cc", "#3a2a22"][(i * 7) % 4]), stdMat("crowd-shoes"));
  const mArms = instanced("crowd-arms", armsMesh, MAXP, pTop, stdMat("crowd-arms"));
  const mTorso = instanced("crowd-torso", torsoMesh, MAXP, pTop, stdMat("crowd-torso"));
  const mHead = instanced("crowd-head", headMesh, MAXP, pSkin, stdMat("crowd-head"));
  const umbColors = colorsFor(MAXP, (i) => ["#1a2740", "#5a2a2a", "#2a4a3a", "#3a3a48", "#7a5a1e", "#4a2a5a", "#a63d3d", "#2f5f8f"][i % 8]);
  const hairMesh = B.MeshBuilder.CreateSphere("hair", { diameter: 0.29, segments: 6 }, scene);
  const bagMesh = box(0.24, 0.3, 0.12, 0, 0, 0);
  const dogParts = [box(0.2, 0.2, 0.5, 0, 0.32, 0), box(0.14, 0.15, 0.17, 0, 0.42, 0.32), box(0.04, 0.04, 0.2, 0, 0.4, -0.33)];
  [[-0.07, 0.2], [0.07, 0.2], [-0.07, -0.2], [0.07, -0.2]].forEach((l) => dogParts.push(box(0.05, 0.22, 0.05, l[0], 0.11, l[1])));
  const leadM = B.MeshBuilder.CreateBox("lead", { width: 0.02, height: 0.02, depth: 0.95 }, scene);
  leadM.rotation.y = Math.PI / 2 - 0.2; leadM.rotation.z = 0.5; leadM.position.set(-0.3, 0.65, 0.2);
  leadM.bakeCurrentTransformIntoVertices();
  dogParts.push(leadM);
  const dogMesh = merge(dogParts);
  const mHair = instanced("crowd-hair", hairMesh, MAXP, colorsFor(MAXP, (i) => looks[i].hair), stdMat("crowd-hair"));
  const mBag = instanced("crowd-bag", bagMesh, MAXP, colorsFor(MAXP, (i) => looks[i].bagC), stdMat("crowd-bag"));
  const mDog = instanced("crowd-dog", dogMesh, MAXP, colorsFor(MAXP, (i) => looks[i].dogC), stdMat("crowd-dog"));
  const mUmb = instanced("crowd-umbrella", umbMesh, MAXP, umbColors, stdMat("crowd-umbrella"));
  umbMesh.setEnabled(false);
  const mUmbF = instanced("crowd-umbrella-flipped", umbFlipMesh, MAXP, umbColors, stdMat("crowd-umbrella-flipped"));
  umbFlipMesh.setEnabled(false);
  umbFlipMesh.material.backFaceCulling = false; // an open cup: the inside shows from above

  const cars = [];
  const cBody = colorsFor(MAXC, (i) => CARS[(i * 5 + 2) % CARS.length]);
  /* The body reaches down to 0.2 m (it was 0.28): the wheels are near-black, so at night a pale body showed as a flat white slab
     hovering over the road with a dark gap under it. */
  const bodyMesh = box(1.78, 0.68, CAR_LEN, 0, 0.54, 0);
  const cabinMesh = box(1.55, 0.52, 2.1, 0, 1.15, -0.25);
  const lampF = merge([box(0.4, 0.14, 0.05, -0.6, 0.72, 2.16), box(0.4, 0.14, 0.05, 0.6, 0.72, 2.16)]);
  const lampR = merge([box(0.4, 0.12, 0.05, -0.6, 0.74, -2.16), box(0.4, 0.12, 0.05, 0.6, 0.74, -2.16)]);
  const wiperMesh = merge([box(0.035, 0.02, 0.7, -0.32, 1.02, 0.78), box(0.035, 0.02, 0.7, 0.32, 1.02, 0.78)]);
  const wheelsMesh = merge([box(0.26, 0.7, 0.7, -0.9, 0.36, 1.3), box(0.26, 0.7, 0.7, 0.9, 0.36, 1.3), box(0.26, 0.7, 0.7, -0.9, 0.36, -1.35), box(0.26, 0.7, 0.7, 0.9, 0.36, -1.35)]);
  const mBody = instanced("crowd-car", bodyMesh, MAXC, cBody, stdMat("crowd-car"));
  const mCabin = instanced("crowd-cabin", cabinMesh, MAXC, colorsFor(MAXC, () => "#26303a"), stdMat("crowd-cabin"));
  const mWheels = instanced("crowd-wheels", wheelsMesh, MAXC, colorsFor(MAXC, () => "#2a2c33"), stdMat("crowd-wheels"));
  const lampMatF = stdMat("crowd-headlamp", null, new B.Color3(0.05, 0.05, 0.04));
  const lampMatR = stdMat("crowd-taillamp", null, new B.Color3(0.1, 0.02, 0.02));
  const mLampF = instanced("crowd-headlamps", lampF, MAXC, colorsFor(MAXC, () => "#fff6dc"), lampMatF);
  const mLampR = instanced("crowd-taillamps", lampR, MAXC, colorsFor(MAXC, () => "#8a1d1d"), lampMatR);
  /* Lens-flare sprites for the nearest cars at night (emissive billboards — no extra point lights). */
  const FLARE_N = 4;
  const flareMat = new B.StandardMaterial("crowd-flare", scene);
  flareMat.diffuseColor = new B.Color3(0, 0, 0);
  flareMat.emissiveColor = new B.Color3(1.0, 0.92, 0.7);
  flareMat.disableLighting = true;
  flareMat.alpha = 0.55;
  flareMat.alphaMode = B.Engine.ALPHA_ADD;
  flareMat.backFaceCulling = false;
  flareMat.disableDepthWrite = true;
  try {
    const ft = new B.DynamicTexture("crowd-flare-tex", 64, scene, false);
    const fg = ft.getContext();
    const grd = fg.createRadialGradient(32, 32, 1, 32, 32, 30);
    grd.addColorStop(0, "rgba(255,245,210,1)");
    grd.addColorStop(0.35, "rgba(255,210,120,0.55)");
    grd.addColorStop(1, "rgba(255,180,80,0)");
    fg.clearRect(0, 0, 64, 64);
    fg.fillStyle = grd;
    fg.fillRect(0, 0, 64, 64);
    // cross streak
    fg.fillStyle = "rgba(255,240,200,0.55)";
    fg.fillRect(2, 30, 60, 4);
    fg.fillRect(30, 2, 4, 60);
    ft.hasAlpha = true;
    ft.update();
    flareMat.diffuseTexture = ft;
    flareMat.emissiveTexture = ft;
    flareMat.opacityTexture = ft;
    flareMat.useAlphaFromDiffuseTexture = true;
  } catch (e) { /* NullEngine */ }
  const flares = [];
  for (let i = 0; i < FLARE_N; i++) {
    const f = B.MeshBuilder.CreatePlane("crowd-flare-" + i, { size: 1.4 }, scene);
    f.material = flareMat;
    f.isPickable = false;
    f.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    f.setEnabled(false);
    f.alphaIndex = 20;
    flares.push(f);
  }
  let flareCount = 0;
  const mWipers = instanced("crowd-wipers", wiperMesh, MAXC, colorsFor(MAXC, () => "#101012"), stdMat("crowd-wipers"));
  wiperMesh.setEnabled(false);
  [legsMesh, shoesMesh, armsMesh, torsoMesh, headMesh, hairMesh, bagMesh, dogMesh, umbMesh, umbFlipMesh, handMesh, bodyMesh, cabinMesh, wheelsMesh, lampF, lampR, wiperMesh].forEach((m) => {
    m.receiveShadows = false;
    m.checkCollisions = false;
  });
  const bufs = [[hairMesh, "matrix"], [bagMesh, "matrix"], [dogMesh, "matrix"], [legsMesh, "matrix"], [shoesMesh, "matrix"], [armsMesh, "matrix"], [torsoMesh, "matrix"], [headMesh, "matrix"], [umbMesh, "matrix"], [umbFlipMesh, "matrix"], [handMesh, "matrix"], [bodyMesh, "matrix"], [cabinMesh, "matrix"], [wheelsMesh, "matrix"], [lampF, "matrix"], [lampR, "matrix"], [wiperMesh, "matrix"]];

  for (let i = 0; i < MAXP; i++) {
    people.push({
      i, active: false, state: "off", leaving: false, x: 0, z: 0, yaw: 0, scale: 0,
      ax: 0, az: 0, bx: 0, bz: 0, t: 0, len: 1, from: null, to: null, edge: null, dir: 1, door: null,
      speed: 1.3, rk: 0, rdelay: 0, look: 0, phase: rng() * 6.28, height: 0.9 + rng() * 0.2, wait: 0, hasUmb: (i % 10) < 7, umb: "closed", umbT: 0.5 + ((i * 37) % 100) / 100 * 0.4, umbAt: 0,
    });
  }
  for (let i = 0; i < MAXC; i++) {
    cars.push({ i, active: false, lane: null, s: 0, v: 0, x: 0, z: 0, yaw: 0, stuck: 0, wiper: rng() * 6 });
  }

  /* ---------------- people ---------------- */
  function setSeg(p, ax, az, bx, bz) {
    p.ax = ax; p.az = az; p.bx = bx; p.bz = bz;
    p.len = Math.max(0.01, Math.hypot(bx - ax, bz - az));
    p.t = 0;
  }
  function nextEdge(p) {
    const from = p.to;
    const opts = from.edges.filter((o) => o.to !== p.from);
    const list = opts.length ? opts : from.edges;
    const ix = from.x - p.from.x;
    const iz = from.z - p.from.z;
    const il = Math.hypot(ix, iz) || 1;
    let tot = 0;
    const w = list.map((o) => {
      const ox = o.to.x - from.x;
      const oz = o.to.z - from.z;
      const straight = (ix * ox + iz * oz) / (il * (Math.hypot(ox, oz) || 1)) > 0.9;
      const k = o.e.kind === "walk" ? (straight ? 5 : 2.2) : straight ? 4 : 1.1;
      tot += k;
      return k;
    });
    let r = rng() * tot;
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function beginEdge(p, o) {
    p.from = p.to;
    p.to = o.to;
    p.edge = o.e;
    p.dir = o.dir;
    p.door = null;
    p.state = o.e.kind === "walk" ? "walk" : "wait";
    p.wait = 0;
    setSeg(p, p.from.x, p.from.z, p.to.x, p.to.z);
    if (o.e.kind === "walk") {
      // a stop at a door on this stretch: always when leaving, sometimes when not
      const ds = o.e.doors;
      if (ds.length && (p.leaving || rng() < 0.12)) {
        const d = ds[Math.floor(rng() * ds.length)];
        p.door = d;
        p.leaving = true;
      }
    }
  }
  function spawnWalker(p, site, snap) {
    p.active = true;
    p.fresh = true; // face the first heading at once
    p.leaving = false;
    p.speed = 1.15 + rng() * 0.5;
    if (snap || !site) {
      // seed a walker anywhere on a sidewalk
      const walks = edges.filter((e) => e.kind === "walk");
      const e = walks[Math.floor(rng() * walks.length)];
      const dir = rng() < 0.5 ? 1 : -1;
      p.from = dir > 0 ? e.a : e.b;
      p.to = dir > 0 ? e.b : e.a;
      p.edge = e;
      p.dir = dir;
      p.state = "walk";
      setSeg(p, p.from.x, p.from.z, p.to.x, p.to.z);
      p.t = rng();
      p.scale = 1;
      p.door = null;
    } else {
      // come out of a door and join the sidewalk, going either way
      const dir = rng() < 0.5 ? 1 : -1;
      p.edge = site.e;
      p.dir = dir;
      p.from = dir > 0 ? site.e.a : site.e.b;
      p.to = dir > 0 ? site.e.b : site.e.a;
      p.state = "door-out";
      p.scale = 0;
      setSeg(p, site.dx, site.dz, site.px, site.pz);
      p.door = null;
    }
    p.x = lerp(p.ax, p.bx, p.t);
    p.z = lerp(p.az, p.bz, p.t);
  }
  const crossOpen = (p) => {
    // a crossing opens when the road it crosses has no green
    const e = p.edge;
    const j = junctions.find((q) => q.ai === p.to.ai && q.ci === p.to.ci);
    if (!j) return true;
    const sig = signalAt(clock, j.offset);
    return (e.kind === "cross-av" ? sig.avenue : sig.cross) === "stop";
  };
  /* Local fright: a bolt landing, a tornado setting off or a gust near them sends the people within reach running
     away from it for a few seconds (turning back along their sidewalk if they were walking towards it). */
  const scares = []; // { x, z, r, until }
  function scare(x, z, r, secs) {
    if (!isFinite(x) || !isFinite(z)) return;
    scares.push({ x, z, r, until: clock + secs });
    if (scares.length > 8) scares.shift();
    info.scares = (info.scares || 0) + 1;
  }
  function fright(p, dt) {
    if (p.flee > 0) p.flee -= dt;
    for (let i = 0; i < scares.length; i++) {
      const s = scares[i];
      if (clock > s.until) continue;
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      if (dx * dx + dz * dz > s.r * s.r) continue;
      if (!(p.flee > 0)) {
        p.flee = 2.5 + rng() * 1.5;
        info.fled = (info.fled || 0) + 1;
        // heading towards it on a plain stretch of sidewalk: turn round
        const toward = (p.bx - p.ax) * -dx + (p.bz - p.az) * -dz > 0;
        if (toward && p.state === "walk" && p.edge && p.edge.kind === "walk" && p.from && p.ax === p.from.x && p.az === p.from.z) {
          const t = p.t;
          const f = p.from;
          p.from = p.to;
          p.to = f;
          p.dir = -p.dir;
          p.door = null;
          setSeg(p, p.bx, p.bz, p.ax, p.az);
          p.t = 1 - t;
        }
      }
    }
    return p.flee > 0;
  }
  function stepPerson(p, dt, run) {
    if (scares.length && fright(p, dt)) run = true;
    else if (p.flee > 0) { p.flee -= dt; run = true; }
    // reaction blend: in after its small delay, out fast once the ability weather is gone
    if (p.flinch > 0) { // stopped by a bolt
      p.flinch -= dt;
      p.phase += dt * 3;
      return;
    }
    if (p.celebrate && celebrateLeft > 0) {
      // plaza rain-dance: blend in like a sun cheer without switching district weather reaction
      if (p.rdelay > 0) p.rdelay -= dt;
      else p.rk = Math.min(1, p.rk + dt / 0.25);
    } else if (rKind) {
      if (p.rdelay > 0) p.rdelay -= dt;
      else p.rk = Math.min(1, p.rk + dt / 0.25);
    } else p.rk = Math.max(0, p.rk - dt / REACT_SEC);
    const rk = p.rk;
    const dancing = !!(p.celebrate && celebrateLeft > 0 && rk > 0.2);
    if (rKind === "rain" && !dancing) run = run || rk > 0.5;
    if (rKind === "lookup" && p.look > 0 && rk > 0.5 && p.state !== "door-in" && p.state !== "door-out") {
      p.look -= dt; // stop and look up at the flash
      p.phase += dt * 2;
      return;
    }
    if (p.state === "wait") {
      p.wait += dt;
      if (crossOpen(p) || p.wait > 40) { p.state = "walk"; p.wait = 0; }
      else { p.phase += dt * 2; return; }
    }
    const reactK = rKind === "gale" ? 1 - 0.35 * rk : rKind === "fog" ? 1 - 0.2 * rk : (rKind === "sun" || dancing) ? 1 - 0.4 * rk : 1;
    const hurry = wxK.raining && !run && !dancing ? 1.3 : 1; // rain: everyone walks quicker (dancers stroll)
    const sp = p.speed * hurry * (run ? 1.9 : 1) * reactK * (p.state === "door-in" || p.state === "door-out" ? 0.8 : 1);
    // step cadence from the speed they actually move at, so feet keep pace (a run takes longer strides)
    p.phase += dt * (run ? 11 / 1.9 : 7.5) * (sp / 1.3) * ((rKind === "sun" || dancing) ? 1 + rk * 0.3 : 1);
    p.t += (sp * dt) / p.len;
    if (p.state === "door-out") p.scale = Math.min(1, p.t * 1.8);
    if (p.state === "door-in") p.scale = Math.max(0, 1 - Math.max(0, p.t - 0.35) / 0.65);
    if (p.state === "walk" && p.door && p.edge.kind === "walk") {
      // walk to the door's place on the stretch, then in
      const tt = p.dir > 0 ? p.door.t : 1 - p.door.t;
      if (p.t >= tt) {
        p.state = "door-in";
        setSeg(p, p.door.px, p.door.pz, p.door.dx, p.door.dz);
        p.x = p.ax; p.z = p.az;
        return;
      }
    }
    if (p.t >= 1) {
      if (p.state === "door-in") { p.active = false; p.state = "off"; return; }
      if (p.state === "door-out") {
        // on the sidewalk now, walk on to the end of the stretch
        p.state = "walk";
        setSeg(p, p.bx, p.bz, p.to.x, p.to.z);
      } else {
        beginEdge(p, nextEdge(p));
      }
    }
    p.x = lerp(p.ax, p.bx, Math.min(1, p.t));
    p.z = lerp(p.az, p.bz, Math.min(1, p.t));
    const dx = p.bx - p.ax;
    const dz = p.bz - p.az;
    if (dx || dz) {
      // turn toward the new heading over a few frames, not in one
      const want = Math.atan2(dx, dz);
      const d = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
      p.yaw += p.fresh ? d : d * Math.min(1, dt * TURN_RATE);
      p.fresh = false;
    }
  }

  /* ---------------- cars ---------------- */
  function laneCarsSorted(l) { l.cars.sort((p, q) => q.s - p.s); }
  function spawnCar(c, lane, s, snap) {
    c.active = true;
    c.lane = lane;
    c.s = s;
    c.v = snap ? lane.cruise * (0.6 + rng() * 0.4) : lane.cruise;
    c.stuck = 0;
    lane.cars.push(c);
    const p = laneXZ(lane, s);
    c.x = p.x; c.z = p.z;
    c.yaw = lane.axis === "x" ? (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : lane.dir > 0 ? 0 : Math.PI;
  }
  function dropCar(c) {
    const l = c.lane;
    if (l) l.cars.splice(l.cars.indexOf(c), 1);
    c.active = false;
    c.lane = null;
  }
  function pickLane() {
    let r = rng() * laneWeightSum;
    for (let i = 0; i < lanes.length; i++) { r -= laneWeight[i]; if (r <= 0) return lanes[i]; }
    return lanes[0];
  }
  function laneFree(l, s, gap) {
    return l.cars.every((c) => Math.abs(c.s - s) > gap);
  }

  /* ---------------- the clock, weather and budget ---------------- */
  let clock = 0; // real seconds of sim, advances by dt (pauses with the day)
  let lastMin = null;
  let targetP = 0;
  let targetC = 0;
  let quality = "high";
  let guard = 1; // frame-time guard: thins the crowd when frames run long
  let ema = 16;
  let slow = 0;
  let fast = 0;
  let spawnAcc = 0;
  let markAcc = 0;
  let wxK = { people: 1, cars: 1, speed: 1, raining: false, storm: false, lights: false };
  /* reaction to ability weather: "" | lookup | rain | gale | fog | sun */
  let rKind = "";
  const REACT_SEC = 0.8; // how fast a person settles back to routine once the ability weather is gone
  let hourNow = 12;
  const lastPos = new Float32Array(MAXP * 2);
  let sampleAcc = 0;
  let sampleMoved = 0;

  function qualityNow() {
    try { return look && look.quality ? look.quality() : "high"; } catch (e) { return "high"; }
  }
  const budgetScale = () => (quality === "low" ? cc.lowScale || 0.4 : 1) * guard;

  function weatherK() {
    const wx = (typeof window !== "undefined" && window.weather && window.weather.now && window.weather.now()) || null;
    if (!wx) return wxK;
    const rain = wx.rain > 0.35 || wx.state === "rain" || wx.state === "storm";
    const storm = wx.state === "storm" || (wx.lightning || 0) > 0.4;
    const snow = wx.snow > 0.4 || wx.state === "snow";
    const fog = wx.state === "fog" || (wx.fog || 0) > 0.05;
    const sky = (look && look.info && look.info().sky) || { night: 0, dusk: 0 };
    let kind = "";
    // celebrate is per-person (plaza dance in the rain); don't force a district-wide sun reaction
    if (hushLeft > 0) kind = "rain";
    else if (wx.manual) {
      if (wx.state === "storm") kind = "lookup";
      else if (wx.state === "rain") kind = "rain";
      else if (wx.state === "wind") kind = "gale";
      else if (wx.state === "fog") kind = "fog";
      else if ((wx.sun || 0) > 0.25) kind = "sun";
    }
    if (kind !== rKind) startReaction(kind);
    wxK = {
      people: storm ? 0.4 : rain ? 0.7 : snow ? 0.75 : fog ? 0.9 : 1,
      cars: storm ? 0.7 : rain ? 0.85 : snow ? 0.7 : 1,
      speed: (rain ? 0.7 : snow ? 0.6 : fog ? 0.8 : 1) * (rKind === "fog" ? 0.6 : rKind === "gale" ? 0.8 : rKind === "lookup" ? 0.75 : 1),
      raining: rain,
      storm,
      lights: sky.night > 0.25 || sky.dusk > 0.45 || rain || fog,
    };
    return wxK;
  }

  /* A bolt cracks (js/lightning.js): everyone within its radius stops and flinches for a moment, the near ones longest. */
  let flinching = 0;
  let umbrellasClosed = 0;
  let shopsOut = 0;
  let prevUmbs = 0;
  let aftermathClose = 0; // frames to force-count umbrella closings after a Sun-break clearing
  let celebrateLeft = 0; // ending A: hop and cheer in the rain for a few seconds
  let hushLeft = 0; // ending C: silent under umbrellas
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("day:crowd", (e) => {
      const d = (e && e.detail) || {};
      if (d.action === "scatter" && d.x != null && d.z != null) {
        scare(d.x, d.z, d.r || 22, 4);
        info.screams = (info.screams || 0) + 1;
        return;
      }
      if (d.action === "celebrate") {
        // Fair Weather ending: dance in the rain on the plaza only (hop + hands up; fold umbrellas in-zone)
        celebrateLeft = Math.max(4, d.secs || 12);
        hushLeft = 0;
        const cx = d.x != null ? +d.x : 118;
        const cz = d.z != null ? +d.z : 26;
        const cr = d.r != null ? +d.r : 22;
        for (let i = 0; i < MAXP; i++) {
          const p = people[i];
          if (!p || !p.active) continue;
          const inZone = Math.hypot(p.x - cx, p.z - cz) < cr;
          p.celebrate = inZone;
          if (!inZone) continue;
          p.leaving = false;
          p.umbForceClose = true;
          p.rdelay = rng() * 0.25;
          p.rk = Math.max(p.rk, 0.15);
        }
        return;
      }
      if (d.action === "hush") {
        // Overcast ending: crowd under umbrellas, no cheer — rain reaction, stay put
        hushLeft = Math.max(4, d.secs || 14);
        celebrateLeft = 0;
        for (let i = 0; i < MAXP; i++) {
          const p = people[i];
          if (!p || !p.active) continue;
          p.celebrate = false;
          p.leaving = false;
          p.umbForceClose = false;
          p.hasUmb = true;
          p.umb = "open";
          p.rdelay = rng() * 0.2;
        }
        startReaction("rain");
        for (let i = 0; i < MAXP; i++) {
          const p = people[i];
          if (p && p.active) p.leaving = false;
        }
        return;
      }
      if (d.action === "aftermath") {
        // Sun break after rain: fold open umbrellas (count only after they close), a few shop doors open
        aftermathClose = 5.5; // long enough for the rain blend to drop
        umbrellasClosed = 0;
        let open = 0;
        for (let i = 0; i < MAXP; i++) {
          const p = people[i];
          if (!p || !p.active) continue;
          if (p.hasUmb && (p.umb === "open" || p.umb === "flipped")) {
            open++;
            p.umbForceClose = true; // fold even if a light wind would keep every 3rd open
          }
        }
        prevUmbs = open;
        // shop owners step out near the camera / hero
        const want = Math.max(1, Math.min(4, d.shops || 3));
        let out = 0;
        const cam = world.camera && world.camera.position;
        const free = people.filter((p) => !p.active);
        const sites = doorSites.slice().sort((a, b) => {
          if (!cam) return 0;
          return Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z);
        });
        for (let n = 0; n < want && free.length && sites.length; n++) {
          const site = sites[n % sites.length];
          const p = free.pop();
          spawnWalker(p, site, false);
          out++;
        }
        shopsOut = Math.max(shopsOut, out);
        try {
          window.dispatchEvent(new CustomEvent("day:crowd", { detail: { action: "shops-out", count: shopsOut } }));
        } catch (err) { /* */ }
        return;
      }
      if (d.action !== "flinch") return;
      const R = d.radius || 40;
      flinching = 0;
      for (let i = 0; i < MAXP; i++) {
        const p = people[i];
        if (!p || !p.active) continue;
        const dd = Math.hypot(p.x - d.x, p.z - d.z);
        if (dd > R) continue;
        p.flinch = 0.45 + (1 - dd / R) * 0.7 + rng() * 0.3;
        flinching++;
      }
    });
  }

  function startReaction(kind) {
    rKind = kind;
    try { window.dispatchEvent(new CustomEvent("day:crowd", { detail: { action: "reaction", kind } })); } catch (e) { /* node */ }
    for (let i = 0; i < MAXP; i++) {
      const p = people[i];
      p.rdelay = rng() * (kind === "rain" ? 0.25 : 0.6);
      p.look = kind === "lookup" ? 1.6 + rng() * 1.4 : 0;
      // under rain, the ones with no umbrella run for the nearest door
      if (kind === "rain" && p.active && !p.hasUmb && !p.leaving && p.state === "walk" && rng() < 0.7) {
        p.leaving = true;
        if (!p.door && p.edge && p.edge.kind === "walk" && p.edge.doors && p.edge.doors.length) {
          let best = null, bestD = 1e9;
          for (const d of p.edge.doors) {
            const ahead = p.dir > 0 ? d.s - p.s : p.s - d.s;
            if (ahead > 0.6 && ahead < bestD) { best = d; bestD = ahead; }
          }
          if (best) p.door = best;
        }
      }
    }
  }

  function reseed(nP, nC) {
    people.forEach((p) => { p.active = false; p.state = "off"; });
    lanes.forEach((l) => { l.cars.length = 0; });
    cars.forEach((c) => { c.active = false; c.lane = null; });
    for (let i = 0; i < nP; i++) spawnWalker(people[i], null, true);
    for (let i = 0, tries = 0; i < nC && tries < nC * 8; tries++) {
      const l = pickLane();
      const s = rng() * l.len;
      if (!laneFree(l, s, 9)) continue;
      spawnCar(cars[i], l, s, true);
      i++;
    }
    lanes.forEach(laneCarsSorted);
  }

  const obstacles = [];
  /* the neighbors (Birdie, Dex, Ines) stand and walk on the same sidewalks; a crowd walker on a fixed path would
     pass through them, so walkers are nudged sideways out of this radius when they draw (the path is untouched) */
  const bystanders = [];
  const BYSTANDER_R = 0.9;
  const WSPACE = 0.55; // m between two walkers' centres: they slide apart rather than overlap
  function gatherObstacles() {
    obstacles.length = 0;
    bystanders.length = 0;
    try {
      const NB = window.day && window.day.neighbors;
      if (NB && NB.now) for (const n of NB.now().people) if (!n.inside && Number.isFinite(n.x)) bystanders.push(n);
      const C = window.day && window.day.control;
      if (C && C.mode && C.mode() === "control") {
        const st = C.state();
        if (st && Number.isFinite(st.x) && st.y < 1.5) obstacles.push({ x: st.x, z: st.z, r: 0.9 });
      }
      if (world.car && world.car.isEnabled && world.car.isEnabled()) obstacles.push({ x: world.car.position.x, z: world.car.position.z, r: 2.4 });
    } catch (e) { /* not up yet */ }
  }

  function stepCars(dt) {
    const speedK = wxK.speed;
    for (let li = 0; li < lanes.length; li++) {
      const l = lanes[li];
      if (!l.cars.length) continue;
      laneCarsSorted(l);
      for (let k = 0; k < l.cars.length; k++) {
        const c = l.cars[k];
        const lead = k > 0 ? l.cars[k - 1] : null;
        let vt = l.cruise * speedK;
        // the car ahead
        if (lead) {
          const gap = lead.s - c.s - CAR_LEN - 1.2;
          vt = Math.min(vt, Math.max(0, gap * 1.1), lead.v + Math.max(0, gap) * 0.4);
        }
        // a red light ahead (a stop line the front bumper hasn't crossed)
        let signalStop = false;
        for (let q = 0; q < l.stops.length; q++) {
          const st = l.stops[q];
          const d = st.s - (c.s + CAR_LEN / 2);
          if (d < -0.8 || d > 60) continue;
          const sig = signalAt(clock, st.j.offset)[st.road];
          const needed = (c.v * c.v) / (2 * 4.5);
          if (sig === "stop" || (sig === "amber" && d > needed + 1.5)) {
            vt = Math.min(vt, Math.max(0, d - 0.3) * 1.3);
            if (d < 6 && d > -0.8) signalStop = true;
          }
        }
        // him, or his car, in the lane ahead
        let blocked = false;
        if (c.stuck < 10) {
          for (let o = 0; o < obstacles.length; o++) {
            const ob = obstacles[o];
            const along = (l.axis === "x" ? (ob.x - c.x) * l.dir : (ob.z - c.z) * l.dir);
            const across = l.axis === "x" ? Math.abs(ob.z - l.c) : Math.abs(ob.x - l.c);
            if (along > 0 && along < 9 + c.v * 0.5 && across < 1.3 + ob.r) {
              vt = Math.min(vt, Math.max(0, along - CAR_LEN / 2 - ob.r - 1) * 1.2);
              blocked = true;
            }
          }
        }
        c.stuck = blocked && c.v < 0.3 && !signalStop ? c.stuck + dt : 0;
        const a = vt > c.v ? 3.2 : 7;
        c.v += clamp(vt - c.v, -a * dt, a * dt);
        if (c.v < 0.02 && vt <= 0.02) c.v = 0;
        c.s += c.v * dt;
        const p = laneXZ(l, c.s);
        c.x = p.x; c.z = p.z;
      }
      // drove off the end of the map
      for (let k = l.cars.length - 1; k >= 0; k--) if (l.cars[k].s > l.len) dropCar(l.cars[k]);
    }
    // his own car drives by the day's script and the crowd can't brake for it from behind (or give up after
    // `stuck`): a crowd car that ends up on top of it is taken off the road instead of drawn through it
    if (obstacles.length && world.car && world.car.isEnabled && world.car.isEnabled()) {
      const mx = world.car.position.x, mz = world.car.position.z;
      for (let li = 0; li < lanes.length; li++) {
        const cs = lanes[li].cars;
        for (let k = cs.length - 1; k >= 0; k--) {
          if (Math.hypot(cs[k].x - mx, cs[k].z - mz) < CAR_LEN * 0.8) dropCar(cs[k]);
        }
      }
    }
  }

  /* ---------------- per frame ---------------- */
  let flipEvents = 0;
  const info = { people: 0, cars: 0, targetPeople: 0, targetCars: 0, walking: 0, waiting: 0, crossing: 0, entering: 0, leaving: 0, moving: 0, stopped: 0, near: { people: 0, cars: 0 }, phase: "", scale: 1, quality: "high", umbrellas: 0, wipers: 0, carSpeed: 0, hour: 12, reaction: "", reacting: 0, lookingUp: 0, hats: 0, cheering: 0, running: 0 };
  /* spacing nudges stay within 0.2 m of the walker's path, so they never leave the sidewalk */
  function holdPath(p) {
    const t = Math.min(1, p.t);
    const cx = lerp(p.ax, p.bx, t);
    const cz = lerp(p.az, p.bz, t);
    const ox = clamp(p.x - cx, -0.2, 0.2);
    const oz = clamp(p.z - cz, -0.2, 0.2);
    p.x = cx + ox; p.z = cz + oz;
  }
  function frame(dtReal) {
    const dayNow = window.day && window.day.now ? window.day.now() : null;
    if (!dayNow || dayNow.minutes == null) return;
    const paused = dayNow.mode === "pause";
    const dt = paused ? 0 : clamp(dtReal, 0, 0.1);
    clock += dt;
    quality = qualityNow();

    // frame-time guard: thin the crowd when frames run long, bring it back slowly
    ema = lerp(ema, dtReal * 1000, 0.05);
    const floor = quality === "low" ? 0.3 : 0.5; // a phone may thin the crowd to 30% of its (already 0.4x) budget before it drops frames
    if (ema > 40) { slow += dtReal; fast = 0; } else if (ema < 22) { fast += dtReal; slow = 0; } else { slow = 0; fast = 0; }
    if (slow > 3) { guard = Math.max(floor, guard * 0.85); slow = 0; }
    if (fast > 10) { guard = Math.min(1, guard * 1.1); fast = 0; }

    const minutes = dayNow.minutes;
    hourNow = ((minutes % 1440) + 1440) % 1440 / 60;
    if (celebrateLeft > 0) {
      celebrateLeft = Math.max(0, celebrateLeft - dt);
      if (celebrateLeft === 0) {
        for (let i = 0; i < MAXP; i++) {
          const p = people[i];
          if (p) { p.celebrate = false; p.umbForceClose = false; }
        }
      }
    }
    if (hushLeft > 0) hushLeft = Math.max(0, hushLeft - dt);
    const d = densityAt(curve, hourNow);
    const w = weatherK();
    const sc = budgetScale();
    targetP = Math.round(MAXP * d.people * w.people * sc);
    targetC = Math.round(MAXC * d.cars * w.cars * sc);

    const jumped = lastMin != null && Math.abs(minutes - lastMin) > 3;
    if (lastMin == null || jumped) {
      reseed(targetP, targetC);
    }
    lastMin = minutes;

    gatherObstacles();
    const run = w.storm;

    // people
    let nAct = 0;
    let nKeep = 0;
    for (let i = 0; i < MAXP; i++) {
      const p = people[i];
      if (!p.active) continue;
      nAct++;
      if (!p.leaving) nKeep++;
    }
    spawnAcc += dt;
    markAcc += dt;
    if (dt > 0) {
      // fill from doors (a few a second), and send the surplus to the nearest door
      if (nKeep < targetP && spawnAcc > 0.12 && doorSites.length) {
        spawnAcc = 0;
        const free = people.find((p) => !p.active);
        if (free) spawnWalker(free, doorSites[Math.floor(rng() * doorSites.length)], false);
      }
      if (nKeep > targetP + 1 && markAcc > 0.1) {
        markAcc = 0;
        const pool = people.filter((p) => p.active && !p.leaving && p.state === "walk");
        if (pool.length) pool[Math.floor(rng() * pool.length)].leaving = true;
      }
      // churn: a little coming and going even when the count holds
      if (nKeep >= targetP * 0.9 && targetP > 6 && rng() < dt * 0.8) {
        const pool = people.filter((p) => p.active && !p.leaving && p.state === "walk");
        if (pool.length) pool[Math.floor(rng() * pool.length)].leaving = true;
      }
      // a walker that is leaving with no door in sight will pick one on its next stretch
      for (let i = 0; i < MAXP; i++) {
        const p = people[i];
        if (p.active) stepPerson(p, dt, run);
      }
      // cars
      let cNow = 0;
      for (let li = 0; li < lanes.length; li++) cNow += lanes[li].cars.length;
      if (cNow < targetC) {
        let tries = 0;
        const rate = Math.min(3, Math.ceil((targetC - cNow) / 8));
        for (let n = 0; n < rate && tries < 6; tries++) {
          const l = pickLane();
          const last = l.cars.length ? l.cars.reduce((m, c) => Math.min(m, c.s), 1e9) : 1e9;
          if (last < 14) continue;
          const free = cars.find((c) => !c.active);
          if (!free) break;
          spawnCar(free, l, 0, false);
          n++;
        }
      }
      // surplus cars simply drive out the far end; the spawner stops
      stepCars(dt);
    }

    // ---- write the instances ----
    const sky = look && look.info ? look.info().sky : null;
    let moving = 0;
    let walking = 0, waiting = 0, crossing = 0, entering = 0, leaving = 0, active = 0, umbs = 0, flipped = 0, flippedNow = 0;
    const wfog = (typeof window !== "undefined" && window.windfog) || null;
    const windK = wfog && wfog.strength ? wfog.strength() : 0;
    const windDir = wfog && wfog.direction ? wfog.direction() : { x: 1, z: 0 };
    const clockNow = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
    const cam = world.camera && world.camera.position;
    let nearP = 0;
    let reacting = 0, lookingUp = 0, hats = 0, cheering = 0;
    for (let i = 0; i < MAXP; i++) {
      const p = people[i];
      if (!p.active || p.scale <= 0.01) { hide(mLegs, i); hide(mShoes, i); hide(mArms, i); hide(mTorso, i); hide(mHead, i); hide(mUmb, i); hide(mUmbF, i); hide(mHand, i); hide(mHair, i); hide(mBag, i); hide(mDog, i); continue; }
      active++;
      if (bystanders.length && (p.state === "walk" || p.state === "wait")) {
        for (let b = 0; b < bystanders.length; b++) {
          const bx = p.x - bystanders[b].x;
          const bz = p.z - bystanders[b].z;
          const bd = Math.hypot(bx, bz);
          if (bd < BYSTANDER_R) {
            const k = bd > 0.01 ? BYSTANDER_R / bd : 0;
            p.x = bystanders[b].x + (k ? bx * k : BYSTANDER_R);
            p.z = bystanders[b].z + bz * k;
          }
        }
      }
      if (dt > 0 && (p.state === "walk" || p.state === "wait")) {
        for (let j = 0; j < i; j++) {
          const q = people[j];
          if (!q.active || q.scale < 0.9 || (q.state !== "walk" && q.state !== "wait")) continue;
          const sx = p.x - q.x;
          if (sx > WSPACE || sx < -WSPACE) continue;
          const sz = p.z - q.z;
          const sd = Math.hypot(sx, sz);
          if (sd < WSPACE) {
            const push = Math.min(0.08, (WSPACE - sd) * 0.5);
            const ux = sd > 0.01 ? sx / sd : Math.cos(p.yaw);
            const uz = sd > 0.01 ? sz / sd : -Math.sin(p.yaw);
            p.x += ux * push; p.z += uz * push;
            q.x -= ux * push; q.z -= uz * push;
            holdPath(p); holdPath(q);
          }
        }
      }
      if (p.state === "wait") waiting++;
      else if (p.state === "door-in") leaving++;
      else if (p.state === "door-out") entering++;
      else if (p.edge && p.edge.kind !== "walk") crossing++;
      else walking++;
      const h = p.height * p.scale;
      const rk = p.rk;
      const looking = rKind === "lookup" && p.look > 0 && rk > 0.5;
      if (rk > 0.3) reacting++;
      if (rk > 0.3 && rKind === "lookup" && looking) lookingUp++;
      const dancing = !!(p.celebrate && celebrateLeft > 0);
      const cheer = (rKind === "sun" || dancing) ? rk * 0.16 * Math.abs(Math.sin(p.phase * 0.9)) : 0;
      const bob = Math.abs(Math.sin(p.phase)) * 0.035 * (p.state === "wait" ? 0 : 1) + cheer;
      const gale = rKind === "gale" ? rk : 0;
      const sway = Math.sin(p.phase) * (p.state === "wait" ? 0 : 0.13) + gale * (0.16 + 0.1 * Math.sin(clock * 9 + p.phase));
      const y = PED_Y + bob;
      const lean = gale * 0.07; // leaning into the wind
      const hx = looking ? -Math.sin(p.yaw) * 0.07 * rk : 0;
      const hz = looking ? -Math.cos(p.yaw) * 0.07 * rk : 0;
      put(mLegs, i, p.x, PED_Y + 0.4 * h, p.z, p.yaw, p.scale, h); // feet stay on the ground; the bob is the upper body
      put(mShoes, i, p.x, PED_Y + 0.4 * h, p.z, p.yaw, p.scale, h);
      put(mArms, i, p.x + Math.sin(p.yaw) * lean, y + 1.12 * h, p.z + Math.cos(p.yaw) * lean, p.yaw + sway, p.scale * looks[i].girth, h);
      put(mTorso, i, p.x + Math.sin(p.yaw) * lean, y + 1.1 * h, p.z + Math.cos(p.yaw) * lean, p.yaw + sway, p.scale * looks[i].girth, h);
      put(mHead, i, p.x + Math.sin(p.yaw) * lean * 1.6 + hx, y + (1.58 + (looking ? 0.05 * rk : 0)) * h, p.z + Math.cos(p.yaw) * lean * 1.6 + hz, p.yaw, p.scale, h);
      const lk = looks[i];
      const near = !cam || (Math.abs(p.x - cam.x) < 45 && Math.abs(p.z - cam.z) < 45);
      // Keep hair/bags in to 32 m on low so nothing pops inside the 30 m seamless-transition bar.
      const lod = quality === "low" ? near && (!cam || Math.abs(p.x - cam.x) < 32) : near;
      const hw = lk.girth;
      if (lk.bald || !lod) hide(mHair, i);
      else put(mHair, i, p.x + Math.sin(p.yaw) * lean * 1.6 + hx - Math.sin(p.yaw) * 0.02, y + (lk.hairLong ? 1.6 : 1.63) * h, p.z + Math.cos(p.yaw) * lean * 1.6 + hz - Math.cos(p.yaw) * 0.02, p.yaw, p.scale, h * (lk.hairLong ? 0.9 : 0.62));
      if (!lk.bag || !lod) hide(mBag, i);
      else if (lk.bag === 1) put(mBag, i, p.x - Math.sin(p.yaw) * 0.2, y + 1.15 * h, p.z - Math.cos(p.yaw) * 0.2, p.yaw + sway, p.scale * hw, h);
      else put(mBag, i, p.x + Math.cos(p.yaw) * -0.26, y + 0.9 * h, p.z + Math.sin(p.yaw) * 0.26, p.yaw, p.scale, h);
      if (!lk.dog || quality === "low" || !near) hide(mDog, i);
      else put(mDog, i, p.x + Math.cos(p.yaw) * 0.65 + Math.sin(p.yaw) * 0.3, PED_Y + Math.abs(Math.sin(p.phase * 2)) * 0.015, p.z - Math.sin(p.yaw) * 0.65 + Math.cos(p.yaw) * 0.3, p.yaw, 1, 1);
      if (gale > 0.3) { put(mHand, i, p.x + Math.sin(p.yaw) * lean * 1.6, y + 1.76 * h, p.z + Math.cos(p.yaw) * lean * 1.6, p.yaw, p.scale * 1.1, 1); hats++; }
      else if ((rKind === "sun" || dancing) && rk > 0.3) { put(mHand, i, p.x, y + 1.95 * h + cheer, p.z, p.yaw, p.scale * 2.2, 1); cheering++; }
      else hide(mHand, i);
      /* Umbrellas: up in the rain; a strong gust (js/windfog.js) snatches the ones carried open, then turns each inside out
         once the wind passes its own threshold (0.5-0.9), and it stays flipped until the wind is nearly gone.
         Sun-break aftermath (p.umbForceClose) folds them as the street clears. */
      const wkNow = windK;
      let ustate = "closed";
      if (p.umbForceClose) {
        ustate = "closed";
        if (p.umb === "open" || p.umb === "flipped") { /* counted below via prevUmbs drop */ }
      } else if (p.hasUmb && (wxK.raining || (i % 3) === 0)) {
        if (p.umb === "flipped") ustate = wkNow > 0.28 ? "flipped" : (wxK.raining ? "open" : "closed");
        else if (wkNow >= p.umbT) ustate = "flipped";
        else ustate = wxK.raining || wkNow >= 0.3 ? "open" : "closed";
      }
      if (ustate === "flipped" && p.umb !== "flipped") { flippedNow++; flipEvents++; }
      p.umb = ustate;
      if (ustate === "open") { put(mUmb, i, p.x + Math.cos(p.yaw) * 0.18, y + 2.0 * h, p.z - Math.sin(p.yaw) * 0.18, p.yaw, p.scale, 1); hide(mUmbF, i); umbs++; }
      else if (ustate === "flipped") {
        // wrenched downwind and spinning on its stick
        put(mUmbF, i, p.x + Math.cos(p.yaw) * 0.18 + windDir.x * 0.3, y + 2.15 * h, p.z - Math.sin(p.yaw) * 0.18 + windDir.z * 0.3, p.yaw + clockNow * 3 + i, p.scale, 1);
        hide(mUmb, i); umbs++; flipped++;
      } else { hide(mUmb, i); hide(mUmbF, i); }
      if (cam && Math.abs(p.x - cam.x) < 70 && Math.abs(p.z - cam.z) < 70) nearP++;
      const dx = p.x - lastPos[i * 2];
      const dz = p.z - lastPos[i * 2 + 1];
      const m = Math.hypot(dx, dz);
      if (m > 0.0005 && m < 5) { moving++ }
      lastPos[i * 2] = p.x;
      lastPos[i * 2 + 1] = p.z;
    }
    let nCars = 0, stopped = 0, nearC = 0, sumV = 0;
    const lampK = wxK.lights ? 1.5 : 0.08;
    const flareCand = [];
    for (let i = 0; i < MAXC; i++) {
      const c = cars[i];
      if (!c.active) { hide(mBody, i); hide(mCabin, i); hide(mWheels, i); hide(mLampF, i); hide(mLampR, i); hide(mWipers, i); continue; }
      nCars++;
      if (c.v < 0.3) stopped++;
      sumV += c.v;
      put(mBody, i, c.x, 0.04, c.z, c.yaw, 1, 1);
      put(mCabin, i, c.x, 0.04, c.z, c.yaw, 1, 1);
      put(mWheels, i, c.x, 0.04, c.z, c.yaw, 1, 1);
      put(mLampF, i, c.x, 0.04, c.z, c.yaw, 1, 1);
      put(mLampR, i, c.x, 0.04, c.z, c.yaw, 1, 1);
      if (wxK.raining) {
        c.wiper += dt * 7;
        put(mWipers, i, c.x, 0.04, c.z, c.yaw + Math.sin(c.wiper) * 0.1, 1, 1);
      } else hide(mWipers, i);
      if (cam && Math.abs(c.x - cam.x) < 90 && Math.abs(c.z - cam.z) < 90) nearC++;
      if (wxK.lights && cam) {
        const dx = c.x - cam.x;
        const dz = c.z - cam.z;
        flareCand.push({ d2: dx * dx + dz * dz, x: c.x, z: c.z, yaw: c.yaw });
      }
    }
    // headlight / taillight lens flares on the nearest cars
    flareCand.sort((a, b) => a.d2 - b.d2);
    flareCount = 0;
    for (let i = 0; i < flares.length; i++) {
      const f = flares[i];
      if (i < flareCand.length && wxK.lights) {
        const c = flareCand[i];
        const fx = c.x + Math.sin(c.yaw) * 2.15;
        const fz = c.z + Math.cos(c.yaw) * 2.15;
        f.position.set(fx, 0.85, fz);
        f.scaling.setAll(0.9 + Math.min(1.4, 18 / Math.sqrt(c.d2 + 4)));
        f.setEnabled(true);
        flareCount++;
      } else f.setEnabled(false);
    }
    flareMat.emissiveColor.set(lampK * 0.7, lampK * 0.62, lampK * 0.45);
    for (let n = 0; n < bufs.length; n++) bufs[n][0].thinInstanceBufferUpdated("matrix");
    umbMesh.setEnabled(wxK.raining || windK >= 0.3);
    umbFlipMesh.setEnabled(flipped > 0);
    if (flippedNow > 0 && typeof window !== "undefined" && window.dispatchEvent) window.dispatchEvent(new CustomEvent("day:wind", { detail: { action: "umbrella-flip", count: flippedNow, flipped } }));
    // Sun-break aftermath: count only open → closed (peak at start minus live open now)
    if (aftermathClose > 0) {
      aftermathClose = Math.max(0, aftermathClose - dt);
      const closedNow = Math.max(0, prevUmbs - umbs);
      if (closedNow > umbrellasClosed) {
        umbrellasClosed = closedNow;
        try { window.dispatchEvent(new CustomEvent("day:crowd", { detail: { action: "umbrellas-closed", count: umbrellasClosed } })); } catch (e) { /* */ }
      }
      if (aftermathClose <= 0) {
        for (let i = 0; i < MAXP; i++) if (people[i]) people[i].umbForceClose = false;
      }
    }
    handMesh.setEnabled(rKind === "gale" || rKind === "sun" || celebrateLeft > 0);
    wiperMesh.setEnabled(wxK.raining);
    lampMatF.emissiveColor.set(lampK * 0.9, lampK * 0.85, lampK * 0.7);
    lampMatR.emissiveColor.set(lampK * 0.7, lampK * 0.07, lampK * 0.07);

    sampleAcc += dtReal;
    if (sampleAcc > 0.5) {
      sampleMoved = active ? moving / active : 0;
      sampleAcc = 0;
    }
    Object.assign(info, {
      people: active, cars: nCars, targetPeople: targetP, targetCars: targetC, walking, waiting, crossing, entering, leaving,
      moving: sampleMoved, stopped, near: { people: nearP, cars: nearC }, phase: phaseAt(phases, hourNow), scale: Math.round(budgetScale() * 100) / 100,
      reaction: rKind, flinching, reacting, lookingUp, hats, cheering, running: rKind === "rain" ? reacting : 0,
      umbrellasClosed, shopsOut,
      quality, umbrellas: umbs, flipped, flips: flipEvents, wipers: wxK.raining ? nCars : 0, carSpeed: nCars ? sumV / nCars : 0, hour: Math.round(hourNow * 100) / 100,
      flares: flareCount, lights: !!wxK.lights,
    });
  }

  scene.onBeforeRenderObservable.add(() => {
    try { frame(scene.getEngine().getDeltaTime() / 1000); } catch (err) { if (!frame.warned) { frame.warned = true; console.warn("[crowd]", err); } }
  });

  const api = {
    /** Advance by dt seconds without a render (the checks use it). */
    step: (dt) => frame(dt),
    info: () => ({
      ...info,
      near: { ...info.near },
      budget: { people: MAXP, cars: MAXC },
      junctions: junctions.length,
      doors: doorSites.length,
      lanes: lanes.length,
      sidewalks: edges.filter((e) => e.kind === "walk").length,
    }),
    /** The cars' signal state at the junction nearest (x, z): for the playtest and the console. */
    signal: (x, z) => {
      let best = null;
      junctions.forEach((j) => { const d = Math.hypot(j.x - x, j.z - z); if (!best || d < best.d) best = { d, j }; });
      return best ? signalAt(clock, best.j.offset) : null;
    },
    /** Every moving person and car as plain positions (console, playtest). */
    positions: () => ({
      people: people.filter((p) => p.active && p.scale > 0.01).map((p) => ({ id: p.i, x: p.x, z: p.z, state: p.state })),
      cars: cars.filter((c) => c.active).map((c) => ({ id: c.i, x: c.x, z: c.z, v: c.v, yaw: c.yaw })),
    }),
    /** What the sim would aim for at an hour (0..24) with clear weather at full quality. */
    targets: (hour) => {
      const d = densityAt(curve, hour);
      return { people: Math.round(MAXP * d.people), cars: Math.round(MAXC * d.cars), phase: phaseAt(phases, hour) };
    },
  };
  api.scare = scare;
  if (typeof window.addEventListener === "function") {
    window.addEventListener("day:power", (e) => {
      const d = (e && e.detail) || {};
      if (d.action === "denied") return;
      const act = d.power || d.action || "";
      if (act === "rain") startReaction("rain");
      else if (act === "storm") startReaction("lookup");
      const P = window.day && window.day.powers;
      if (!P || !P.now || !/^(bolt|tornado|gust)$/.test(d.action || "")) return;
      let n = null;
      try { n = P.now(); } catch (err) { return; }
      if (d.action === "bolt" && n.strike) scare(n.strike.x, n.strike.z, 14, 1.5);
      else if (d.action === "tornado" && n.tornado) scare(n.tornado.x, n.tornado.z, 22, 4);
      else if (d.action === "gust" && n.aim) scare(n.aim.x, n.aim.z, 9, 1);
    });
  }
  world.crowd = api;
  if (window.day) window.day.crowd = api;
  return api;
}

const live = typeof window !== "undefined" && window.day && window.day.world && window.day.world();
if (live) installCrowd(live);
