/* The Lightning bolt: a procedural forked channel, not four boxes (J, 2026-11-11; inFAMOUS 2's storm is the reference).

   Pure part (node-testable, no Babylon): `forkedBolt` makes a midpoint-displaced main channel from the sky to the
   target plus 3-6 forks, `pickConductor` snaps the strike to a tall thing within 3 m, `heatColor` is the scorch's
   orange-to-black cooling, `RESTRIKES` the re-strike times.

   Babylon part: `createBoltFx(B, scene, opts)` draws the channel as camera-facing emissive ribbons (core + halo, in the
   glow layer so they bloom), re-strikes it 3 times inside 300 ms, leaves a camera-facing afterimage that burns out
   over 0.5 s, pulses a scene-wide flash light for at least 2 frames (it reaches 48 m, so facades within 40 m light up),
   throws GPU sparks and a smoke puff (smoke keeps smouldering while the scorch cools), and lays a flush scorch decal
   (projected on the surface normal, offset 12 mm + zOffset) that cools from orange to black over 10 s.
   Low quality: at most 3 forks and half the particles. */

export const RESTRIKES = [0.09, 0.19, 0.3]; // seconds after the first strike; three re-strikes inside 300 ms
export const COOL_SEC = 10;
export const AFTERIMAGE_SEC = 0.5;
export const FLASH_RANGE = 48;
export const FLASH_MIN_FRAMES = 3;
export const CONDUCTOR_REACH = 3;

/** Small seeded rng (mulberry32) so a bolt can be rebuilt the same. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Midpoint displacement: split each segment, push its middle sideways by `amp`, halve `amp`, `depth` times. */
export function displace(a, b, depth, amp, rng) {
  let pts = [a, b];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const dir = norm(sub(q, p));
      let u = cross(dir, { x: 0, y: 1, z: 0 });
      if (len(u) < 0.2) u = cross(dir, { x: 1, y: 0, z: 0 });
      u = norm(u);
      const v = norm(cross(dir, u));
      const r1 = (rng() - 0.5) * 2 * amp;
      const r2 = (rng() - 0.5) * 2 * amp;
      next.push({
        x: (p.x + q.x) / 2 + u.x * r1 + v.x * r2,
        y: (p.y + q.y) / 2 + u.y * r1 + v.y * r2,
        z: (p.z + q.z) / 2 + u.z * r1 + v.z * r2,
      });
      next.push(q);
    }
    pts = next;
    amp *= 0.55;
  }
  return pts;
}

/**
 * A bolt from `top` to `end` ({x,y,z}). Returns { main: [pts], forks: [[pts]...] } with `forks` forks (clamped 3..6; the
 * caller passes its own max for low quality). The ends of the main channel are exactly `top` and `end`.
 */
export function forkedBolt(top, end, seed, opts) {
  const o = opts || {};
  const rng = makeRng(seed);
  const total = len(sub(top, end));
  const main = displace(top, end, o.depth || 5, total * 0.085, rng);
  const want = Math.max(1, Math.min(6, o.forks != null ? o.forks : 3 + Math.floor(rng() * 4)));
  const forks = [];
  for (let i = 0; i < want; i++) {
    const lo = Math.floor(main.length * 0.18);
    const hi = Math.floor(main.length * 0.82);
    const at = main[lo + Math.floor(rng() * (hi - lo))];
    const remain = Math.max(4, at.y - end.y);
    const L = remain * (0.35 + rng() * 0.45);
    const ang = rng() * Math.PI * 2;
    const spread = 0.45 + rng() * 0.6;
    const tip = {
      x: at.x + Math.cos(ang) * L * spread,
      y: Math.max(end.y + 0.4, at.y - L * (0.55 + rng() * 0.35)),
      z: at.z + Math.sin(ang) * L * spread,
    };
    forks.push(displace(at, tip, o.forkDepth || 3, L * 0.12, rng));
  }
  return { main, forks };
}

/** The tallest conductor within `reach` (horizontal) of the aim, else null. `list` = [{x,y,z,kind}]. */
export function pickConductor(list, x, z, reach) {
  let best = null;
  const r = reach == null ? CONDUCTOR_REACH : reach;
  (list || []).forEach((c) => {
    if (Math.hypot(c.x - x, c.z - z) > r) return;
    if (!best || c.y > best.y) best = c;
  });
  return best;
}

/** Scorch heat 1 -> 0 over COOL_SEC (fast at first, like a coal), and the emissive colour that goes with it. */
export function heatAt(t) {
  const k = Math.max(0, Math.min(1, t / COOL_SEC));
  return Math.pow(1 - k, 1.6);
}
export function heatColor(heat) {
  // white-hot -> orange -> deep red -> black; all channels reach 0 together
  return [Math.min(1, heat * 1.9), Math.min(1, heat * 1.05) * heat, Math.min(1, heat * 0.5) * heat * heat];
}

/** Flash intensity (0..1) at `t` seconds after the first strike: a spike at each (re)strike, 55 ms decay. */
export function flashAt(t) {
  let v = 0;
  [0].concat(RESTRIKES).forEach((s, i) => {
    if (t >= s) v = Math.max(v, Math.exp(-(t - s) / 0.055) * (i === 0 ? 1 : 0.8));
  });
  return v;
}

/* ------------------------------------------------------------------------------------------------------------- */

export function createBoltFx(B, scene, opts) {
  const o = opts || {};
  const quality = () => (o.quality ? o.quality() : "high");
  const getCam = () => (o.camera ? o.camera() : scene.activeCamera);
  const MAX_VERTS = 320;

  /* --- ribbons --- */
  function ribbonMat(name, color, alpha) {
    const m = new B.StandardMaterial(name, scene);
    m.disableLighting = true;
    m.emissiveColor = new B.Color3(color[0], color[1], color[2]);
    m.alpha = alpha;
    m.backFaceCulling = false;
    m.alphaMode = B.Engine && B.Engine.ALPHA_ADD != null ? B.Engine.ALPHA_ADD : 1;
    m.disableDepthWrite = true;
    return m;
  }
  function ribbonMesh(name, mat) {
    const m = new B.Mesh(name, scene);
    const vd = new B.VertexData();
    vd.positions = new Float32Array(MAX_VERTS * 3);
    vd.indices = [0, 1, 2];
    vd.applyToMesh(m, true);
    m.material = mat;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
    m.setEnabled(false);
    return m;
  }
  const coreMat = ribbonMat("bolt-core-mat", [1.4, 1.6, 2], 1);
  const haloMat = ribbonMat("bolt-halo-mat", [0.35, 0.55, 1.2], 0.45);
  const afterMat = ribbonMat("bolt-after-mat", [0.5, 0.7, 1.3], 0.5);
  const core = ribbonMesh("strike-bolt-core", coreMat);
  const halo = ribbonMesh("strike-bolt-halo", haloMat);
  const after = ribbonMesh("strike-bolt-after", afterMat);
  const glow = o.glow;
  if (glow && glow.addIncludedOnlyMesh) { glow.addIncludedOnlyMesh(core); glow.addIncludedOnlyMesh(halo); }

  /** Fill `mesh` with camera-facing strips for each polyline. widths: [main, fork]. */
  function fillRibbon(mesh, bolt, mainW, forkW) {
    const cam = getCam();
    const cp = cam ? cam.position : { x: 0, y: 5, z: 0 };
    const pos = [];
    const idx = [];
    const strip = (pts, w) => {
      const base = pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dir = norm(sub(b, a));
        let side = cross(dir, norm({ x: cp.x - p.x, y: cp.y - p.y, z: cp.z - p.z }));
        side = len(side) < 1e-4 ? { x: 1, y: 0, z: 0 } : norm(side);
        const taper = 1 - 0.55 * (i / (pts.length - 1)); // thicker at the cloud, thinner at the ground
        const ww = w * taper;
        pos.push(p.x - side.x * ww, p.y - side.y * ww, p.z - side.z * ww, p.x + side.x * ww, p.y + side.y * ww, p.z + side.z * ww);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    };
    if (pos.length / 3 + bolt.main.length * 2 <= MAX_VERTS) strip(bolt.main, mainW);
    bolt.forks.forEach((f) => { if (pos.length / 3 + f.length * 2 <= MAX_VERTS) strip(f, forkW); });
    const arr = new Float32Array(MAX_VERTS * 3);
    arr.set(pos);
    mesh.updateVerticesData(B.VertexBuffer.PositionKind, arr);
    mesh.setIndices(idx.length ? idx : [0, 0, 0]);
    mesh.refreshBoundingInfo();
    mesh.setEnabled(true);
  }

  /* --- scorch texture and decals --- */
  const scorchTex = new B.DynamicTexture("strike-scorch-tex", { width: 128, height: 128 }, scene, true);
  {
    const c = scorchTex.getContext();
    const rng = makeRng(77);
    c.clearRect(0, 0, 128, 128);
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,246,222,0.97)");
    g.addColorStop(0.3, "rgba(236,170,110,0.92)");
    g.addColorStop(0.62, "rgba(92,62,44,0.72)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = "rgba(210,120,60,0.55)";
    for (let i = 0; i < 11; i++) { // the branching burn lines of a ground strike
      const a = rng() * Math.PI * 2;
      c.lineWidth = 1 + rng() * 1.6;
      c.beginPath();
      c.moveTo(64 + Math.cos(a) * 8, 64 + Math.sin(a) * 8);
      c.lineTo(64 + Math.cos(a + (rng() - 0.5) * 0.5) * (34 + rng() * 26), 64 + Math.sin(a + (rng() - 0.5) * 0.5) * (34 + rng() * 26));
      c.stroke();
    }
    scorchTex.hasAlpha = true;
    scorchTex.update();
  }
  const decals = [];
  const MAX_DECALS = 6;
  function scorchAt(point, normal) {
    const m = B.MeshBuilder.CreateDisc("strike-scorch", { radius: 1.3, tessellation: 28 }, scene);
    const mat = new B.StandardMaterial("strike-scorch-mat", scene);
    mat.diffuseTexture = scorchTex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    mat.disableLighting = true;
    mat.specularColor = new B.Color3(0, 0, 0);
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    mat.zOffset = -2;
    mat.emissiveColor = new B.Color3(1, 0.6, 0.2);
    m.material = mat;
    m.isPickable = false;
    const n = norm(normal || { x: 0, y: 1, z: 0 });
    const q = new B.Quaternion();
    B.Quaternion.FromUnitVectorsToRef(new B.Vector3(0, 1, 0), new B.Vector3(n.x, n.y, n.z), q);
    m.rotationQuaternion = q.multiply(B.Quaternion.RotationAxis(new B.Vector3(1, 0, 0), Math.PI / 2)); // disc lies in the surface plane
    m.position.set(point.x + n.x * 0.012, point.y + n.y * 0.012, point.z + n.z * 0.012);
    const d = { mesh: m, mat, t: 0, x: point.x, y: point.y, z: point.z, nx: n.x, ny: n.y, nz: n.z, heat: 1 };
    decals.push(d);
    while (decals.length > MAX_DECALS) { const old = decals.shift(); old.mesh.dispose(); old.mat.dispose(); }
    return d;
  }

  /* --- particles: GPU where the device has it, else CPU; low quality is half --- */
  const dotTex = new B.DynamicTexture("strike-dot", { width: 64, height: 64 }, scene, true);
  {
    const c = dotTex.getContext();
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    dotTex.hasAlpha = true;
    dotTex.update();
  }
  const low = () => quality() === "low";
  function makePs(name, cap) {
    let ps = null;
    try {
      if (B.GPUParticleSystem && B.GPUParticleSystem.IsSupported) ps = new B.GPUParticleSystem(name, { capacity: cap }, scene);
    } catch (e) { ps = null; }
    const gpu = !!ps;
    if (!ps) ps = new B.ParticleSystem(name, cap, scene);
    ps.particleTexture = dotTex;
    ps.emitter = new B.Vector3(0, 0, 0);
    ps.emitRate = 0;
    ps.isLocal = false;
    ps.gpu = gpu;
    return ps;
  }
  let sparks = null;
  let smoke = null;
  const psInfo = { gpu: false, sparkCap: 0, smokeCap: 0, particles: 0 };
  function buildParticles() {
    const half = low();
    const sc = half ? 70 : 140;
    const mc = half ? 20 : 40;
    try {
      sparks = makePs("strike-sparks", sc);
      sparks.minEmitBox = new B.Vector3(-0.3, 0, -0.3);
      sparks.maxEmitBox = new B.Vector3(0.3, 0.1, 0.3);
      sparks.direction1 = new B.Vector3(-1.2, 2.2, -1.2);
      sparks.direction2 = new B.Vector3(1.2, 3.6, 1.2);
      sparks.minEmitPower = 3;
      sparks.maxEmitPower = 8;
      sparks.minLifeTime = 0.35;
      sparks.maxLifeTime = 0.95;
      sparks.minSize = 0.05;
      sparks.maxSize = 0.14;
      sparks.color1 = new B.Color4(1, 0.9, 0.6, 1);
      sparks.color2 = new B.Color4(1, 0.55, 0.2, 1);
      sparks.colorDead = new B.Color4(0.6, 0.1, 0, 0);
      sparks.gravity = new B.Vector3(0, -9.8, 0);
      sparks.blendMode = B.ParticleSystem.BLENDMODE_ONEONE;
      smoke = makePs("strike-smoke", mc);
      smoke.minEmitBox = new B.Vector3(-0.5, 0, -0.5);
      smoke.maxEmitBox = new B.Vector3(0.5, 0.2, 0.5);
      smoke.direction1 = new B.Vector3(-0.3, 1.2, -0.3);
      smoke.direction2 = new B.Vector3(0.3, 2, 0.3);
      smoke.minEmitPower = 0.6;
      smoke.maxEmitPower = 1.4;
      smoke.minLifeTime = 1.3;
      smoke.maxLifeTime = 2.4;
      smoke.minSize = 0.9;
      smoke.maxSize = 1.8;
      smoke.minScaleX = 1; smoke.maxScaleX = 1;
      smoke.color1 = new B.Color4(0.34, 0.34, 0.36, 0.34);
      smoke.color2 = new B.Color4(0.22, 0.22, 0.25, 0.28);
      smoke.colorDead = new B.Color4(0.2, 0.2, 0.22, 0);
      smoke.gravity = new B.Vector3(0.25, 0.55, 0.1);
      smoke.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
      sparks.start();
      smoke.start();
      psInfo.gpu = !!sparks.gpu;
      psInfo.sparkCap = sc;
      psInfo.smokeCap = mc;
    } catch (e) {
      sparks = smoke = null;
    }
  }
  buildParticles();
  let builtLow = low();

  /* --- the flash light: scene-wide for the facades around the strike --- */
  const light = o.flashLight;
  const rng0 = makeRng((Date.now() & 0xffff) + 1);

  /* --- state --- */
  const st = {
    active: false, t: 0, seed: 1, id: 0, target: null, top: null,
    restrikes: 0, nextRe: 0, forks: 0, flashFrames: 0, flashFramesLeft: 0, flashPeak: 0, litFrames: 0,
    sparkLeft: 0, lightI: 0, smoulder: 0, afterAlpha: 0, conductor: null, count: 0, lastEvent: null, bolt: null,
  };
  const emit = (name, detail) => {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) { /* node */ }
  };

  function build(first) {
    const lowQ = low();
    const forks = lowQ ? Math.min(3, 1 + Math.floor(rng0() * 3)) : 3 + Math.floor(rng0() * 4);
    st.bolt = forkedBolt(st.top, st.target, st.seed * 31 + (first ? 0 : st.restrikes * 977), { forks, depth: lowQ ? 4 : 5, forkDepth: lowQ ? 2 : 3 });
    st.forks = st.bolt.forks.length;
    fillRibbon(core, st.bolt, 0.11, 0.05);
    fillRibbon(halo, st.bolt, 0.55, 0.22);
    if (first) fillRibbon(after, st.bolt, 0.4, 0.14); // the afterimage keeps the first channel
  }

  function strike(target, topY, opts2) {
    const q = opts2 || {};
    const cam = getCam();
    const tx = target.x;
    const tz = target.z;
    st.seed = ((Math.imul(Math.floor(tx * 100) | 0, 73856093) ^ Math.imul(Math.floor(tz * 100) | 0, 19349663) ^ (st.count * 2654435761)) >>> 0) || 1;
    st.count++;
    st.id++;
    st.target = { x: tx, y: target.y, z: tz };
    st.top = { x: tx + (cam ? (cam.position.x - tx) * 0.03 : 0) + 1.5, y: topY != null ? topY : target.y + 48, z: tz + (cam ? (cam.position.z - tz) * 0.03 : 0) - 1.5 };
    st.conductor = q.conductor || null;
    st.active = true;
    st.t = 0;
    st.restrikes = 0;
    st.nextRe = 0;
    st.flashFramesLeft = FLASH_MIN_FRAMES;
    st.flashFrames = 0;
    st.litFrames = 0;
    st.afterAlpha = 0.6;
    st.sparkLeft = 0.12;
    st.smoulder = COOL_SEC;
    if (low() !== builtLow) { // quality changed since the last bolt: rebuild the particle systems at the new size
      [sparks, smoke].forEach((p) => { try { p && p.dispose(); } catch (e) { /* */ } });
      buildParticles();
      builtLow = low();
    }
    build(true);
    coreMat.alpha = 1;
    haloMat.alpha = 0.45;
    afterMat.alpha = 0.6;
    after.setEnabled(true);
    if (sparks) { sparks.emitter.set(tx, target.y + 0.15, tz); sparks.emitRate = low() ? 700 : 1300; }
    if (smoke) { smoke.emitter.set(tx, target.y + 0.2, tz); smoke.emitRate = low() ? 25 : 55; }
    if (light) { light.position.set(tx, target.y + 10, tz); light.range = FLASH_RANGE; }
    const dy = q.decalY != null ? q.decalY : target.y; // a conductor's channel ends at its tip, the scorch lies on the roof under it
    const d = scorchAt({ x: tx, y: dy, z: tz }, q.normal || null);
    d.t = 0;
    st.lastEvent = { id: st.id, forks: st.forks, restrikes: 0, x: tx, y: target.y, z: tz, conductor: st.conductor ? st.conductor.kind : null, quality: low() ? "low" : "high" };
    emit("day:strike", { action: "strike", id: st.id, forks: st.forks, x: tx, y: target.y, z: tz, quality: st.lastEvent.quality, conductor: st.lastEvent.conductor });
    // the crowd flinches: everyone within 40 m stops and ducks for a moment (js/crowd.js listens)
    emit("day:crowd", { action: "flinch", x: tx, z: tz, radius: 40, id: st.id });
    return st.lastEvent;
  }

  function update(dt) {
    // scorch cooling (runs after the bolt is done too)
    for (let i = decals.length - 1; i >= 0; i--) {
      const d = decals[i];
      d.t += dt;
      d.heat = heatAt(d.t);
      const c = heatColor(d.heat);
      d.mat.emissiveColor.set(c[0], c[1], c[2]);
      if (d.t > COOL_SEC) { // cooled: it has joined js/memory.js's mark underneath; fade out over a second
        d.mat.alpha = Math.max(0, 1 - (d.t - COOL_SEC));
        d.mesh.visibility = d.mat.alpha;
        if (d.t > COOL_SEC + 1) {
          d.mesh.dispose(); d.mat.dispose(); decals.splice(i, 1);
          emit("day:strike", { action: "cooled", x: d.x, y: d.y, z: d.z });
        }
      }
    }
    if (smoke && st.smoulder > 0) {
      st.smoulder -= dt;
      smoke.emitRate = st.smoulder > 0 ? (low() ? 4 : 9) * Math.min(1, st.smoulder / 3) + 1 : 0;
    }
    if (sparks && st.sparkLeft > 0) {
      st.sparkLeft -= dt;
      if (st.sparkLeft <= 0) sparks.emitRate = 0;
    }
    if (!st.active) { st.lightI = 0; return; }
    st.t += dt;
    // re-strikes: a fresh jittered channel at each
    while (st.nextRe < RESTRIKES.length && st.t >= RESTRIKES[st.nextRe]) {
      st.nextRe++;
      st.restrikes++;
      build(false);
      st.flashFramesLeft = Math.max(st.flashFramesLeft, 2);
      coreMat.alpha = 1;
      if (st.lastEvent) st.lastEvent.restrikes = st.restrikes;
      emit("day:strike", { action: "restrike", id: st.id, n: st.restrikes, at: Math.round(st.t * 1000), forks: st.forks });
    }
    const f = flashAt(st.t);
    const flashK = st.flashFramesLeft > 0 ? Math.max(f, 0.9) : f;
    if (st.flashFramesLeft > 0) {
      st.flashFramesLeft--;
      st.flashFrames++;
    }
    st.flashPeak = Math.max(st.flashPeak, flashK);
    st.lightI = flashK * 62;
    if (flashK > 0.5) st.litFrames++;
    const vis = Math.min(1, f * 1.25 + 0.06);
    core.visibility = vis;
    halo.visibility = vis;
    // the afterimage: burns out over AFTERIMAGE_SEC
    const ak = Math.max(0, 1 - st.t / AFTERIMAGE_SEC);
    afterMat.alpha = 0.6 * ak * ak;
    if (st.t > RESTRIKES[RESTRIKES.length - 1] + 0.12) { core.setEnabled(false); halo.setEnabled(false); }
    if (st.t > AFTERIMAGE_SEC) {
      after.setEnabled(false);
      st.active = false;
      st.lightI = 0;
    }
  }

  function dispose() {
    [core, halo, after].forEach((m) => m.dispose());
    decals.splice(0).forEach((d) => { d.mesh.dispose(); d.mat.dispose(); });
    [sparks, smoke].forEach((p) => { try { p && p.dispose(); } catch (e) { /* */ } });
  }

  return {
    strike,
    update,
    lightI: () => st.lightI,
    dispose,
    meshes: [core, halo, after],
    materials: [coreMat, haloMat, afterMat],
    warm() { // compile the shaders before the first cast
      const jobs = [];
      [[core, coreMat], [halo, haloMat], [after, afterMat]].forEach(([m, mat]) => { try { if (mat.forceCompilationAsync) jobs.push(mat.forceCompilationAsync(m).catch(() => {})); } catch (e) { /* */ } });
      // the scorch decal's material is made per strike: compile the same one on a hidden disc now, then drop it
      try {
        const d = scorchAt({ x: 0, y: -50, z: 0 }, null);
        d.mesh.setEnabled(false);
        jobs.push(d.mat.forceCompilationAsync(d.mesh).catch(() => {}).then(() => {
          const i = decals.indexOf(d);
          if (i >= 0) decals.splice(i, 1);
          d.mesh.dispose(); d.mat.dispose();
        }));
      } catch (e) { /* */ }
      return Promise.all(jobs);
    },
    info() {
      return {
        active: st.active, id: st.id, count: st.count, t: st.t, forks: st.forks, restrikes: st.restrikes,
        flashFrames: st.flashFrames, litFrames: st.litFrames, flashPeak: st.flashPeak, afterimage: afterMat.alpha, afterVisible: after.isEnabled(),
        smoulder: st.smoulder > 0, particles: { ...psInfo, quality: low() ? "low" : "high" },
        decals: decals.map((d) => ({ x: d.x, y: d.y, z: d.z, t: d.t, heat: d.heat, black: d.t >= COOL_SEC - 0.001 || d.heat < 0.02, normal: [d.nx, d.ny, d.nz], zOffset: d.mat.zOffset })),
        conductor: st.conductor ? st.conductor.kind : null,
        lastEvent: st.lastEvent ? { ...st.lastEvent } : null,
      };
    },
  };
}
