/* The Tornado: a procedural funnel and a pooled Havok debris set (J, 2026-11-11; Just Cause 4's
   funnel that tears fences and cars is the reference).

   Pure part (node-testable, no Babylon): shell counts and debris caps by quality, ground-gap settle
   checks, plaza course when he casts from the plaza.

   Babylon part: `createTornadoFx(B, scene, opts)` draws 3 twisted cylinder shells (2 on low quality)
   with scrolling noise alpha at different speeds, a dense condensation core, a debris band, a ground
   dust ring (spray over water/puddles), and a rotating cloud deck that leans with the path. Debris
   bodies (bins, cones, café chairs, planters, signs, awning cloth, papers, leaves) are pooled with a
   cap of 30 (12 on low/phone), lifted and orbited, then flung and settled onto the ground with a
   raycast so nothing floats or sinks. Neighbours and Small Weather stay out of the debris set. */

export const DEBRIS_CAP_HIGH = 30;
export const DEBRIS_CAP_LOW = 12;
export const SHELLS_HIGH = 3;
export const SHELLS_LOW = 2;
export const SETTLE_FLOAT_MAX = 0.02; // 2 cm above is floating
export const SETTLE_SUNK_MAX = 0.05; // 5 cm below is sunk
export const FUNNEL_LIFE = 5.4;
export const PULL_R = 5.2;
export const PLAZA = { x0: 106, z0: 16.8, x1: 130, z1: 36 };

export const DEBRIS_KINDS = ["bin", "cone", "chair", "planter", "sign", "awning", "paper", "leaf"];

/** How many Havok debris bodies may be live at once. */
export function debrisCap(quality) {
  return quality === "low" ? DEBRIS_CAP_LOW : DEBRIS_CAP_HIGH;
}

/** How many funnel shells to draw. */
export function shellCount(quality) {
  return quality === "low" ? SHELLS_LOW : SHELLS_HIGH;
}

/** Feet-to-ground gap: positive = floating, negative = sunk. */
export function groundGap(feetY, groundY) {
  return (feetY || 0) - (groundY || 0);
}

/** True when a settled prop sits within the ground-contact bar. */
export function isGrounded(gap) {
  return gap <= SETTLE_FLOAT_MAX && gap >= -SETTLE_SUNK_MAX;
}

/** Plaza rect (with a small pad) — a cast from here sends the funnel through the plaza. */
export function inPlaza(x, z, pad) {
  const p = pad != null ? pad : 4;
  return x >= PLAZA.x0 - p && x <= PLAZA.x1 + p && z >= PLAZA.z0 - p && z <= PLAZA.z1 + p;
}

/**
 * Course through the plaza when he casts there; otherwise null (caller uses streetCourse).
 * Travels along x at the plaza's mid-z so café chairs and bins are in the pull.
 */
export function plazaCourse(x, z, dirX) {
  if (!inPlaza(x, z, 4)) return null;
  return {
    axis: "x",
    x,
    z: (PLAZA.z0 + PLAZA.z1) / 2,
    from: PLAZA.x0 + 1.5,
    to: PLAZA.x1 - 1.5,
    dir: dirX < -0.08 ? -1 : 1,
    zone: "plaza",
  };
}

/** A soft noise pixel for the funnel's alpha map (procedural, no files). */
export function noisePixel(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + (seed || 0) * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

function makeNoiseCanvas(size, seed, soft) {
  const c = typeof document !== "undefined" && document.createElement
    ? document.createElement("canvas")
    : { width: size, height: size, getContext: () => null };
  c.width = size;
  c.height = size;
  const ctx = c.getContext && c.getContext("2d");
  if (!ctx) return c;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noisePixel(x / size, y / size, seed);
      const n2 = noisePixel(x / size * 3.1, y / size * 2.7, seed + 1);
      const v = Math.floor(40 + (n * 0.65 + n2 * 0.35) * (soft ? 160 : 200));
      const a = Math.floor((soft ? 90 : 140) + n * (soft ? 80 : 100));
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v + 8;
      img.data[i + 2] = v + 18;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function kindMass(kind) {
  if (kind === "bin" || kind === "planter") return 9;
  if (kind === "chair" || kind === "cone" || kind === "sign") return 6.5;
  if (kind === "awning") return 3.5;
  return 1.2; // paper, leaf
}

/** Half-height / pivot-to-foot for each kind (matches buildMesh). */
function kindFeet(kind) {
  if (kind === "bin") return 0.425; // cyl height 0.85
  if (kind === "cone") return 0.45; // cyl height 0.9
  if (kind === "chair") return 0.275; // box height 0.55
  if (kind === "planter") return 0.25; // box height 0.5
  if (kind === "sign") return 0.9; // pole height 1.8
  if (kind === "awning") return 0.03; // box height 0.06
  if (kind === "paper") return 0.005;
  return 0.01; // leaf
}

/** Lowest world Y of a debris mesh (after tipping). */
export function meshSoleY(mesh) {
  try {
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo();
    if (bi && bi.boundingBox) return bi.boundingBox.minimumWorld.y;
  } catch (err) { /* fall through */ }
  return mesh.position.y;
}

/**
 * Builds the funnel look and a pooled debris set. opts:
 *   quality(): "high"|"low"
 *   physics(): Havok plugin or null
 *   surfaceAt(x,z) -> y
 *   wetAt(x,z) -> bool (spray instead of dust)
 *   onLand(list) -> void (persist marks)
 *   exclude(mesh) -> bool (neighbours / Small Weather)
 */
export function createTornadoFx(B, scene, opts) {
  const o = opts || {};
  const quality = () => (o.quality ? o.quality() : "high");
  const surfaceAt = (x, z) => (o.surfaceAt ? o.surfaceAt(x, z) : 0.08);
  const wetAt = (x, z) => !!(o.wetAt && o.wetAt(x, z));
  const exclude = (m) => !!(o.exclude && o.exclude(m));

  const root = new B.TransformNode("power-tornado", scene);
  root.setEnabled(false);

  const shells = [];
  const shellMats = [];
  const shellSpeeds = [0.55, -0.9, 1.25];
  const maxShells = SHELLS_HIGH;
  for (let i = 0; i < maxShells; i++) {
    const bot = 0.55 + i * 0.55;
    const top = 2.4 + i * 1.6;
    const h = 4.2;
    const m = B.MeshBuilder.CreateCylinder("funnel-shell-" + i, {
      diameterBottom: bot * 2,
      diameterTop: top * 2,
      height: h,
      tessellation: quality() === "low" ? 12 : 20,
      updatable: false,
    }, scene);
    m.parent = root;
    m.position.y = 1.1 + i * 2.6;
    m.isPickable = false;
    const mat = new B.StandardMaterial("funnel-mat-" + i, scene);
    mat.disableLighting = true;
    mat.emissiveColor = new B.Color3(0.1 + i * 0.04, 0.14 + i * 0.03, 0.22 + i * 0.04);
    mat.alpha = 0.55 - i * 0.08;
    mat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    mat.backFaceCulling = false;
    try {
      const dyn = new B.DynamicTexture("tornado-noise-" + i, { width: 64, height: 64 }, scene, false);
      const ctx = dyn.getContext();
      if (ctx && ctx.putImageData) {
        const c = makeNoiseCanvas(64, 11 + i * 17, i > 0);
        if (c.getContext) ctx.drawImage(c, 0, 0);
        else {
          const img = ctx.createImageData(64, 64);
          for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
            const n = noisePixel(x / 64, y / 64, 11 + i * 17);
            const j = (y * 64 + x) * 4;
            const v = Math.floor(40 + n * 180);
            img.data[j] = v; img.data[j + 1] = v + 8; img.data[j + 2] = v + 18; img.data[j + 3] = Math.floor(100 + n * 100);
          }
          ctx.putImageData(img, 0, 0);
        }
      }
      dyn.update();
      dyn.hasAlpha = true;
      dyn.wrapU = B.Texture.WRAP_ADDRESSMODE;
      dyn.wrapV = B.Texture.WRAP_ADDRESSMODE;
      mat.diffuseTexture = dyn;
      mat.opacityTexture = dyn;
      mat.useAlphaFromDiffuseTexture = true;
    } catch (err) {
      /* NullEngine / no canvas: solid alpha still reads as a layer */
    }
    m.material = mat;
    shells.push(m);
    shellMats.push(mat);
  }

  const coreMat = new B.StandardMaterial("funnel-core", scene);
  coreMat.disableLighting = true;
  coreMat.emissiveColor = new B.Color3(0.55, 0.62, 0.78);
  coreMat.alpha = 0.78;
  coreMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  coreMat.backFaceCulling = false;
  const core = B.MeshBuilder.CreateCylinder("funnel-core", {
    diameterBottom: 0.35,
    diameterTop: 1.4,
    height: 10,
    tessellation: 10,
  }, scene);
  core.parent = root;
  core.position.y = 5.2;
  core.material = coreMat;
  core.isPickable = false;

  const band = [];
  const bandN = 10;
  const bandMat = new B.StandardMaterial("funnel-band", scene);
  bandMat.disableLighting = true;
  bandMat.emissiveColor = new B.Color3(0.45, 0.4, 0.35);
  for (let i = 0; i < bandN; i++) {
    const b = B.MeshBuilder.CreateBox("funnel-band-" + i, { size: 0.22 + (i % 3) * 0.08 }, scene);
    b.parent = root;
    b.material = bandMat;
    b.isPickable = false;
    band.push(b);
  }

  const dustMat = new B.StandardMaterial("funnel-dust", scene);
  dustMat.disableLighting = true;
  dustMat.emissiveColor = new B.Color3(0.42, 0.36, 0.28);
  dustMat.alpha = 0.45;
  dustMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  dustMat.backFaceCulling = false;
  const dust = B.MeshBuilder.CreateDisc("funnel-dust", { radius: 3.4, tessellation: 28 }, scene);
  dust.parent = root;
  dust.rotation.x = Math.PI / 2;
  dust.position.y = 0.06;
  dust.material = dustMat;
  dust.isPickable = false;

  const sprayMat = new B.StandardMaterial("funnel-spray", scene);
  sprayMat.disableLighting = true;
  sprayMat.emissiveColor = new B.Color3(0.55, 0.72, 0.9);
  sprayMat.alpha = 0.4;
  sprayMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  sprayMat.backFaceCulling = false;
  const spray = B.MeshBuilder.CreateDisc("funnel-spray", { radius: 3.6, tessellation: 28 }, scene);
  spray.parent = root;
  spray.rotation.x = Math.PI / 2;
  spray.position.y = 0.08;
  spray.material = sprayMat;
  spray.isPickable = false;
  spray.setEnabled(false);

  const deckMat = new B.StandardMaterial("funnel-deck", scene);
  deckMat.disableLighting = true;
  deckMat.emissiveColor = new B.Color3(0.08, 0.09, 0.14);
  deckMat.alpha = 0.72;
  deckMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  deckMat.backFaceCulling = false;
  const deck = B.MeshBuilder.CreateSphere("funnel-deck", { diameterX: 9, diameterY: 1.6, diameterZ: 9, segments: 10 }, scene);
  deck.parent = root;
  deck.position.y = 12.2;
  deck.material = deckMat;
  deck.isPickable = false;

  let spin = 0;
  let leanX = 0;
  let leanZ = 0;
  let active = null; // { x, z, axis, dir, from, to, life, age, startX, startZ, zone, lifted, landed, shells }
  let settleTimer = 0;
  let lastShake = 0;

  /* ---- debris pool ---- */
  const pool = [];
  let propsReady = false;
  let ageBoot = 0;

  function buildMesh(kind, i) {
    const name = "loose-" + kind + "-" + i;
    let rootM;
    if (kind === "bin") {
      rootM = B.MeshBuilder.CreateCylinder(name, { diameter: 0.56, height: 0.85, tessellation: 10 }, scene);
    } else if (kind === "cone") {
      rootM = B.MeshBuilder.CreateCylinder(name, { diameterBottom: 0.42, diameterTop: 0.08, height: 0.9, tessellation: 8 }, scene);
    } else if (kind === "chair") {
      rootM = B.MeshBuilder.CreateBox(name, { width: 0.48, height: 0.55, depth: 0.48 }, scene);
      const back = B.MeshBuilder.CreateBox(name + "-back", { width: 0.48, height: 0.55, depth: 0.06 }, scene);
      back.parent = rootM;
      back.position.set(0, 0.35, -0.21);
      back.isPickable = false;
    } else if (kind === "planter") {
      rootM = B.MeshBuilder.CreateBox(name, { width: 0.7, height: 0.5, depth: 0.7 }, scene);
    } else if (kind === "sign") {
      rootM = B.MeshBuilder.CreateCylinder(name, { diameter: 0.08, height: 1.8, tessellation: 6 }, scene);
      const board = B.MeshBuilder.CreateBox(name + "-board", { width: 0.7, height: 0.45, depth: 0.06 }, scene);
      board.parent = rootM;
      board.position.y = 0.7;
      board.isPickable = false;
    } else if (kind === "awning") {
      rootM = B.MeshBuilder.CreateBox(name, { width: 1.2, height: 0.06, depth: 0.7 }, scene);
    } else if (kind === "paper") {
      rootM = B.MeshBuilder.CreateBox(name, { width: 0.28, height: 0.01, depth: 0.2 }, scene);
    } else {
      rootM = B.MeshBuilder.CreateBox(name, { width: 0.18, height: 0.02, depth: 0.12 }, scene);
    }
    const mat = new B.StandardMaterial("loose-mat-" + kind + "-" + i, scene);
    const cols = {
      bin: [0.1, 0.28, 0.2],
      cone: [0.85, 0.35, 0.08],
      chair: [0.55, 0.32, 0.18],
      planter: [0.35, 0.28, 0.2],
      sign: [0.55, 0.55, 0.5],
      awning: [0.55, 0.12, 0.18],
      paper: [0.9, 0.88, 0.8],
      leaf: [0.25, 0.45, 0.18],
    };
    const c = cols[kind] || [0.4, 0.4, 0.4];
    mat.diffuseColor = new B.Color3(c[0], c[1], c[2]);
    mat.specularColor = new B.Color3(0.04, 0.04, 0.05);
    rootM.material = mat;
    rootM.isPickable = false;
    rootM.getChildMeshes(false).forEach((ch) => {
      ch.material = mat;
      ch.isPickable = false;
    });
    return rootM;
  }

  function attachBody(mesh, kind) {
    const phys = o.physics ? o.physics() : null;
    if (!phys) return null;
    try {
      const shape = kind === "bin" || kind === "cone" || kind === "sign"
        ? B.PhysicsShapeType.CYLINDER
        : B.PhysicsShapeType.BOX;
      const agg = new B.PhysicsAggregate(mesh, shape, {
        mass: kindMass(kind),
        friction: 0.55,
        restitution: 0.02,
      }, scene);
      agg.body.setLinearDamping(0.4);
      agg.body.setAngularDamping(0.45);
      return agg.body;
    } catch (err) {
      return null;
    }
  }

  function ensurePool(specs) {
    if (propsReady) return;
    const phys = o.physics ? o.physics() : null;
    const list = specs || [];
    // Wait for Havok so we don't lock the session into mesh-only debris; after 1.5 s build without bodies.
    if (!phys && ageBoot < 1.5) return;
    propsReady = true;
    const cap = DEBRIS_CAP_HIGH;
    list.slice(0, cap).forEach((spec, i) => {
      const kind = DEBRIS_KINDS.includes(spec.kind) ? spec.kind : "bin";
      const mesh = buildMesh(kind, i);
      const feet = kindFeet(kind);
      const y = (spec.y != null ? spec.y : surfaceAt(spec.x, spec.z)) + feet;
      mesh.position.set(spec.x, y, spec.z);
      if (spec.yaw) mesh.rotation.y = spec.yaw;
      const body = attachBody(mesh, kind);
      pool.push({
        mesh,
        body,
        kind,
        i,
        feet,
        home: { x: spec.x, y, z: spec.z, yaw: spec.yaw || 0 },
        state: "rest", // rest | lift | orbit | fling | settle | done
        orbitA: Math.random() * Math.PI * 2,
        orbitR: 1.2 + Math.random() * 1.8,
        orbitH: 1.2 + Math.random() * 3.5,
        lifted: false,
        landed: false,
      });
    });
  }

  /** Wake a settled prop so a later tornado can lift it again. */
  function wakeProp(prop) {
    prop.state = "rest";
    prop.lifted = false;
    prop.landed = false;
    prop.mesh.rotation.x = 0;
    prop.mesh.rotation.z = 0;
    prop.mesh.rotation.y = prop.home.yaw || 0;
    prop.mesh.position.set(prop.home.x, prop.home.y, prop.home.z);
    if (prop.body && prop.body.setMotionType && B.PhysicsMotionType) {
      try {
        prop.body.setMotionType(B.PhysicsMotionType.DYNAMIC);
        prop.body.setLinearVelocity(B.Vector3.Zero());
        prop.body.setAngularVelocity(B.Vector3.Zero());
      } catch (err) { /* */ }
    } else if (!prop.body) {
      prop.body = attachBody(prop.mesh, prop.kind);
    }
  }

  function propPositions() {
    return pool.map((p) => ({
      kind: p.kind,
      x: p.mesh.position.x,
      y: p.mesh.position.y,
      z: p.mesh.position.z,
      state: p.state,
      lifted: !!p.lifted,
      landed: !!p.landed,
    }));
  }

  function shove(prop, ix, iy, iz) {
    if (exclude(prop.mesh)) return;
    const at = prop.mesh.getAbsolutePosition();
    if (prop.body) {
      try {
        prop.body.applyImpulse(new B.Vector3(ix, iy, iz), at);
      } catch (err) {
        prop.mesh.position.addInPlace(new B.Vector3(ix, iy, iz).scale(0.015));
      }
    } else {
      prop.mesh.position.addInPlace(new B.Vector3(ix, iy, iz).scale(0.02));
    }
  }

  function groundYUnder(x, y, z) {
    let gy = surfaceAt(x, z);
    try {
      const ray = new B.Ray(new B.Vector3(x, y + 6, z), new B.Vector3(0, -1, 0), 80);
      const hit = scene.pickWithRay(ray, (m) => m.isPickable !== false && m.isEnabled()
        && !/^(loose-|funnel-|power-|strike-|debris-|mem-|cast-)/.test(m.name));
      if (hit && hit.hit && hit.pickedPoint) gy = hit.pickedPoint.y;
    } catch (err) { /* surfaceAt stands */ }
    return gy;
  }

  function settleOne(prop) {
    const x = prop.mesh.position.x;
    const z = prop.mesh.position.z;
    // tip first so the sole after tipping is what we snap
    if (prop.kind === "bin" || prop.kind === "cone" || prop.kind === "chair" || prop.kind === "planter") {
      prop.mesh.rotation.z = (Math.random() > 0.5 ? 1 : -1) * (1.05 + Math.random() * 0.35);
      prop.mesh.rotation.x = (Math.random() - 0.5) * 0.35;
    } else if (prop.kind === "sign") {
      prop.mesh.rotation.z = 0.7 + Math.random() * 0.35;
    } else if (prop.kind === "awning") {
      prop.mesh.rotation.x = (Math.random() - 0.5) * 0.8;
      prop.mesh.rotation.z = (Math.random() - 0.5) * 0.6;
    }
    const gy = groundYUnder(x, prop.mesh.position.y, z);
    prop.mesh.computeWorldMatrix(true);
    const sole = meshSoleY(prop.mesh);
    const lift = gy - sole;
    // only nudge: Havok should have dropped them; correct millimetres-to-centimetres of drift
    prop.mesh.position.y += lift;
    if (prop.body) {
      try {
        prop.body.setLinearVelocity(B.Vector3.Zero());
        prop.body.setAngularVelocity(B.Vector3.Zero());
        // sync the body to the snapped mesh, then freeze
        if (prop.body.disablePreStep != null) prop.body.disablePreStep = false;
        if (prop.body.setMotionType && B.PhysicsMotionType) {
          prop.body.setMotionType(B.PhysicsMotionType.STATIC);
        }
      } catch (err) { /* keep the mesh pose */ }
    }
    prop.state = "done";
    prop.landed = true;
    return { kind: prop.kind, x: +x.toFixed(2), z: +z.toFixed(2), y: +prop.mesh.position.y.toFixed(2), yaw: prop.mesh.rotation.y || 0 };
  }

  function groundCheck() {
    let floating = 0;
    let sunk = 0;
    const landed = pool.filter((p) => p.landed);
    landed.forEach((p) => {
      const gy = groundYUnder(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
      const sole = meshSoleY(p.mesh);
      const gap = groundGap(sole, gy);
      if (gap > SETTLE_FLOAT_MAX) floating++;
      else if (gap < -SETTLE_SUNK_MAX) sunk++;
    });
    return { floating, sunk, landed: landed.length, grounded: landed.length - floating - sunk };
  }

  function start(course) {
    const q = quality();
    const nShells = shellCount(q);
    active = {
      x: course.x,
      z: course.z,
      axis: course.axis,
      dir: course.dir,
      from: course.from,
      to: course.to,
      life: course.life != null ? course.life : FUNNEL_LIFE,
      age: 0,
      startX: course.x,
      startZ: course.z,
      zone: course.zone || "street",
      shells: nShells,
      lifted: 0,
      landed: 0,
      dustRing: !!(dust && dust.isEnabled()),
      spray: false,
      debrisCap: debrisCap(q),
      layers: nShells + (core && core.isEnabled() ? 1 : 0),
    };
    settleTimer = 0;
    root.setEnabled(true);
    dust.setEnabled(true);
    spray.setEnabled(false);
    shells.forEach((m, i) => m.setEnabled(i < nShells));
    if (core) core.setEnabled(true);
    // wake wrecked props so a second cast can lift them again
    pool.forEach((p) => wakeProp(p));
    try {
      window.dispatchEvent(new CustomEvent("day:crowd", {
        detail: { action: "scatter", kind: "tornado", x: active.x, z: active.z, r: 22 },
      }));
    } catch (err) { /* node */ }
    return active;
  }

  function stop() {
    if (!active) return;
    const marks = [];
    pool.forEach((p) => {
      if (!p.lifted || p.landed) return;
      marks.push(settleOne(p));
    });
    active.landed = pool.filter((p) => p.landed).length;
    if (marks.length && o.onLand) {
      try { o.onLand(marks); } catch (err) { /* memory optional */ }
    }
    root.setEnabled(false);
    const ended = active;
    active = null;
    settleTimer = 10; // playtest waits 10 s after fade for ground check
    return ended;
  }

  function update(dt, camPos) {
    ageBoot += dt;
    if (!propsReady && o.specs) ensurePool(o.specs());

    if (settleTimer > 0) settleTimer = Math.max(0, settleTimer - dt);

    if (!active || active.life <= 0) {
      if (active && active.life <= 0) stop();
      return active;
    }

    const step = 9.2 * dt * active.dir;
    if (active.axis === "x") active.x = Math.max(active.from + 2, Math.min(active.to - 2, active.x + step));
    else active.z = Math.max(active.from + 2, Math.min(active.to - 2, active.z + step));
    active.life -= dt;
    active.age += dt;

    const gy = surfaceAt(active.x, active.z);
    const wet = wetAt(active.x, active.z);
    active.spray = wet;
    dust.setEnabled(!wet);
    spray.setEnabled(!!wet);
    dust.position.y = gy + 0.06 - root.position.y;
    spray.position.y = gy + 0.08 - root.position.y;

    // lean into the travel direction
    const wantLeanX = active.axis === "x" ? 0 : active.dir * 0.18;
    const wantLeanZ = active.axis === "x" ? -active.dir * 0.18 : 0;
    leanX += (wantLeanX - leanX) * Math.min(1, dt * 3);
    leanZ += (wantLeanZ - leanZ) * Math.min(1, dt * 3);
    root.position.set(active.x, gy, active.z);
    root.rotation.x = leanZ;
    root.rotation.z = leanX;

    spin += dt * 5.5;
    const nShells = active.shells;
    shells.forEach((m, i) => {
      if (i >= nShells) return;
      m.rotation.y = spin * shellSpeeds[i];
      const mat = shellMats[i];
      if (mat && mat.diffuseTexture) {
        mat.diffuseTexture.vOffset = (mat.diffuseTexture.vOffset + dt * shellSpeeds[i] * 0.35) % 1;
        mat.diffuseTexture.uOffset = (mat.diffuseTexture.uOffset + dt * Math.abs(shellSpeeds[i]) * 0.12) % 1;
      }
    });
    core.rotation.y = -spin * 1.8;
    deck.rotation.y = spin * 0.35;
    dust.rotation.z = spin * 0.8;
    spray.rotation.z = -spin * 1.1;
    band.forEach((m, i) => {
      const a = spin * 1.7 + i * ((Math.PI * 2) / bandN);
      const rad = 0.9 + (i % 3) * 0.55;
      m.position.set(Math.sin(a) * rad, 1.2 + (i % 5) * 0.85, Math.cos(a) * rad);
      m.rotation.y = a;
    });

    // camera shake by distance
    if (camPos && o.onShake) {
      const d = Math.hypot(camPos.x - active.x, camPos.z - active.z);
      const amp = 0.014 + 0.04 * (1 - Math.min(1, d / 36));
      if (amp > lastShake * 0.7) {
        lastShake = amp;
        o.onShake(amp);
      }
    }
    lastShake = Math.max(0, lastShake - dt * 1.2);

    // debris: pull nearby rest props into orbit, then fling
    const cap = active.debrisCap;
    let live = pool.filter((p) => p.lifted && !p.landed).length;
    pool.forEach((prop) => {
      if (exclude(prop.mesh)) return;
      if (prop.state === "done") return;
      const dx = active.x - prop.mesh.position.x;
      const dz = active.z - prop.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (prop.state === "rest") {
        if (d > PULL_R || live >= cap) return;
        prop.state = "lift";
        prop.lifted = true;
        live++;
        active.lifted++;
        // wake a frozen body from a prior settle if we somehow reused it
        if (prop.body && prop.body.setMotionType && B.PhysicsMotionType) {
          try { prop.body.setMotionType(B.PhysicsMotionType.DYNAMIC); } catch (err) { /* */ }
        }
        shove(prop, dx * 2, 28, dz * 2);
        return;
      }
      if (prop.state === "lift" || prop.state === "orbit") {
        prop.state = "orbit";
        prop.orbitA += dt * (2.8 + (prop.i % 5) * 0.35) * active.dir;
        const rad = prop.orbitR * (0.7 + 0.3 * Math.sin(prop.orbitA * 0.5));
        const tx = active.x + Math.sin(prop.orbitA) * rad;
        const tz = active.z + Math.cos(prop.orbitA) * rad;
        const ty = gy + prop.orbitH + Math.sin(prop.orbitA * 1.3) * 0.6;
        const px = prop.mesh.position.x;
        const py = prop.mesh.position.y;
        const pz = prop.mesh.position.z;
        shove(prop, (tx - px) * 14, (ty - py) * 10 + 4, (tz - pz) * 14);
        // late in life: fling outward and let Havok drop them
        if (active.life < 1.6) {
          prop.state = "fling";
          const outX = Math.sin(prop.orbitA);
          const outZ = Math.cos(prop.orbitA);
          shove(prop, outX * 55, 8, outZ * 55);
        }
        return;
      }
      if (prop.state === "fling") {
        // wait until near the ground (or the funnel is almost gone), then snap and freeze
        const gy = groundYUnder(prop.mesh.position.x, prop.mesh.position.y, prop.mesh.position.z);
        const sole = meshSoleY(prop.mesh);
        if (sole < gy + 0.55 || active.life < 0.25) {
          settleOne(prop);
          active.landed++;
        }
      }
    });

    if (active.life <= 0) stop();
    return active;
  }

  function info() {
    const q = quality();
    const gc = groundCheck();
    const n = active
      ? {
          x: active.x,
          z: active.z,
          axis: active.axis,
          dir: active.dir,
          life: active.life,
          age: active.age,
          travelled: Math.hypot(active.x - active.startX, active.z - active.startZ),
          zone: active.zone,
          shells: active.shells,
          layers: active.shells + 1, // shells + core (+ deck/dust read in the clip)
          dustRing: !!active.dustRing,
          spray: !!active.spray,
          lifted: active.lifted,
          landed: active.landed,
          debrisCap: active.debrisCap,
        }
      : null;
    return {
      active: n,
      shells: shellCount(q),
      debrisCap: debrisCap(q),
      props: propPositions(),
      lifted: pool.filter((p) => p.lifted).length,
      landed: pool.filter((p) => p.landed).length,
      floating: gc.floating,
      sunk: gc.sunk,
      settleLeft: settleTimer,
      ground: gc,
    };
  }

  function warm() {
    shellMats.forEach((mat, i) => {
      if (mat.forceCompilationAsync) mat.forceCompilationAsync(shells[i]).catch(() => {});
    });
    [coreMat, dustMat, sprayMat, deckMat, bandMat].forEach((mat) => {
      if (mat.forceCompilationAsync) mat.forceCompilationAsync(core).catch(() => {});
    });
  }

  return {
    start,
    stop,
    update,
    info,
    warm,
    ensurePool,
    shove,
    propPositions,
    groundCheck,
    get root() { return root; },
    get pool() { return pool; },
  };
}
