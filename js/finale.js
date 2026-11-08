/* ==========================================================================
   The finale's stage (episode "night", the Light show): the city gathers on the plaza and the show it
   watches. Visuals only; js/episodes.js decides the cues, timing and score and calls in here.

   - spectators: simple figures that walk in from the plaza's edge, look up and cheer on a hit
   - beams: searchlight cones from the rooftops round the plaza, sweeping; they swell in fog and strobe on a bolt
   - fireworks: particle bursts over the plaza (colour by ability), a salvo for the grand finish
   - aurora: a wavy ribbon of green, teal and violet across the north sky, which grows with the show
   - washes: neon pools on the paving that flip colour on the beat (the "neon reflections" of the rain act)
   Everything is built when the show starts and disposed when it ends. `info()` is for the playtest.
   Data: day.config.js `episodes.list` night `finale`.
   ========================================================================== */

export function createFinale(world, B, cfg) {
  const scene = world && world.scene;
  if (!B || !scene) return null;
  const F = cfg || {};
  const C = F.center || [118, 26];
  const rand = mulberry(7);
  const nodes = []; // everything to dispose
  const track = (n) => { nodes.push(n); return n; };

  const state = { on: false, gathered: 0, beams: 0, aurora: 0, auroraTo: 0, fog: 0, bursts: 0, cheer: 0, lastBurst: null, wash: 0, flash: 0, strobe: 0, hits: 0 };
  let spectators = [];
  let beams = [];
  let washes = [];
  let aurora = null;
  let pss = [];
  let tex = null;
  let t = 0;

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mat(name, hex, glow, alpha, add) {
    const m = new B.StandardMaterial("fin-" + name, scene);
    const c = B.Color3.FromHexString(hex);
    m.diffuseColor = c.scale(add ? 0 : 1);
    m.emissiveColor = c.scale(glow == null ? 0.2 : glow);
    m.specularColor = new B.Color3(0, 0, 0);
    if (alpha != null && alpha < 1) m.alpha = alpha;
    if (add) { m.disableLighting = true; m.alphaMode = B.Engine.ALPHA_ADD; }
    m.backFaceCulling = false;
    return m;
  }
  function dotTexture() {
    if (tex) return tex;
    const dt = new B.DynamicTexture("fin-dot", { width: 64, height: 64 }, scene, false);
    const g = dt.getContext();
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,.6)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    dt.update();
    dt.hasAlpha = true;
    tex = dt;
    return tex;
  }

  /* ---- spectators ---- */
  const COATS = ["#d9604a", "#4a7fc0", "#a65bb5", "#e0a53c", "#4f9a5b", "#d9a05a", "#7aa0d4", "#c46a8a"];
  function buildSpectators(n) {
    const ring = F.ring || [5.5, 10.5];
    for (let i = 0; i < n; i++) {
      const root = track(new B.TransformNode("fin-spec-" + i, scene));
      const ang = (i / n) * Math.PI * 2 + rand() * 0.4;
      const r = ring[0] + rand() * (ring[1] - ring[0]);
      const home = { x: C[0] + Math.cos(ang) * r * 1.15, z: C[1] + Math.sin(ang) * r * 0.9 };
      // they come in from the plaza's edge (the avenue side and the cross street)
      const from = { x: C[0] + Math.cos(ang) * 22, z: C[1] + Math.sin(ang) * 18 };
      const h = 1.45 + rand() * 0.4;
      const body = B.MeshBuilder.CreateCylinder("fin-body-" + i, { diameterTop: 0.34, diameterBottom: 0.44, height: h * 0.62, tessellation: 8 }, scene);
      body.parent = root; body.position.y = h * 0.31; body.isPickable = false;
      body.material = mat("coat" + (i % COATS.length), COATS[i % COATS.length], 0.18);
      const head = B.MeshBuilder.CreateSphere("fin-head-" + i, { diameter: 0.3, segments: 6 }, scene);
      head.parent = root; head.position.y = h * 0.62 + 0.18; head.isPickable = false;
      head.material = mat("skin" + (i % 3), ["#e4b894", "#c58c62", "#8d5a3c"][i % 3], 0.2);
      const arms = B.MeshBuilder.CreateBox("fin-arms-" + i, { width: 0.7, height: 0.1, depth: 0.1 }, scene);
      arms.parent = root; arms.position.y = h * 0.5; arms.isPickable = false;
      arms.material = body.material;
      root.position.set(from.x, 0, from.z);
      spectators.push({ root, body, head, arms, home, from, delay: 0.3 + rand() * (F.gatherSec || 6), walk: 0, phase: rand() * 6.28, hop: 0, h });
    }
  }

  /* ---- beams ---- */
  function buildBeams(n) {
    const P = F.beamAt || [[104, 15], [132, 15], [104, 38], [132, 38], [118, 14], [118, 40]];
    const hex = F.beamColors || ["#7ec8ff", "#c98bff", "#ffd27a", "#7affd0", "#ff8ac0", "#9fb7ff"];
    for (let i = 0; i < Math.min(n, P.length); i++) {
      const len = 90;
      const cone = B.MeshBuilder.CreateCylinder("fin-beam-" + i, { diameterTop: 7, diameterBottom: 0.5, height: len, tessellation: 14, cap: B.Mesh.NO_CAP }, scene);
      cone.isPickable = false;
      cone.material = mat("beam" + i, hex[i % hex.length], 1, 0.0, true);
      const pivot = track(new B.TransformNode("fin-beam-pivot-" + i, scene));
      pivot.position.set(P[i][0], 14 + (i % 3) * 2, P[i][1]);
      cone.parent = pivot;
      cone.position.y = len / 2; // base at the pivot, tip upward
      beams.push({ pivot, cone, base: 0.18, phase: i * 1.1, dir: i % 2 ? 1 : -1 });
    }
  }

  /* ---- neon washes on the paving ---- */
  function buildWashes() {
    const hex = F.washColors || ["#ff4fa8", "#4fd8ff", "#ffd24f", "#8a6bff", "#4fffa0"];
    const pts = [[-6, -4], [6, -4], [-6, 5], [6, 5], [0, 0]];
    pts.forEach((p, i) => {
      const d = B.MeshBuilder.CreateDisc("fin-wash-" + i, { radius: 4.2, tessellation: 28 }, scene);
      d.rotation.x = Math.PI / 2;
      d.position.set(C[0] + p[0], 0.09 + i * 0.002, C[1] + p[1]);
      d.isPickable = false;
      d.material = mat("wash" + i, hex[i % hex.length], 1, 0.0, true);
      d.material.alpha = 0;
      d.material.disableDepthWrite = true; // stacked light washes 2 mm apart: none may hide another
      washes.push({ mesh: d, hex, i, level: 0 });
      track(d);
    });
  }

  /* ---- aurora ---- */
  function buildAurora() {
    const W = 15, H = 5;
    const ribbon = B.MeshBuilder.CreateGround("fin-aurora", { width: F.auroraW || 320, height: F.auroraH || 80, subdivisionsX: W * 4, subdivisionsY: H * 2, updatable: true }, scene);
    ribbon.rotation.x = -Math.PI / 2 + 0.25;
    ribbon.rotation.y = Math.PI; // faces the plaza (south) from the north sky
    ribbon.position.set(C[0], F.auroraY || 105, C[1] + (F.auroraDist || 170));
    ribbon.isPickable = false;
    ribbon.alwaysSelectAsActiveMesh = true;
    const dt = new B.DynamicTexture("fin-aurora-tex", { width: 64, height: 256 }, scene, false);
    const g = dt.getContext();
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "rgba(120,60,220,0)");
    grd.addColorStop(0.25, "rgba(150,90,255,.55)");
    grd.addColorStop(0.55, "rgba(60,255,200,.85)");
    grd.addColorStop(0.85, "rgba(80,255,120,.45)");
    grd.addColorStop(1, "rgba(80,255,120,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 256);
    dt.update();
    dt.hasAlpha = true;
    const m = new B.StandardMaterial("fin-aurora-mat", scene);
    m.diffuseTexture = dt;
    m.emissiveTexture = dt;
    m.opacityTexture = dt;
    m.disableLighting = true;
    m.backFaceCulling = false;
    m.alphaMode = B.Engine.ALPHA_ADD;
    m.alpha = 0;
    m.fogEnabled = false;
    ribbon.material = m;
    ribbon.setEnabled(false);
    const base = ribbon.getVerticesData(B.VertexBuffer.PositionKind).slice();
    aurora = { mesh: ribbon, mat: m, base, tex: dt };
    track(ribbon);
  }

  /* ---- fireworks ---- */
  function buildFireworks() {
    for (let i = 0; i < 3; i++) {
      const ps = new B.ParticleSystem("fin-fw-" + i, 600, scene);
      ps.particleTexture = dotTexture();
      ps.emitter = new B.Vector3(C[0], 60, C[1]);
      ps.createSphereEmitter(1, 1);
      ps.minEmitPower = 14; ps.maxEmitPower = 26;
      ps.minLifeTime = 1.2; ps.maxLifeTime = 2.3;
      ps.minSize = 0.7; ps.maxSize = 1.6;
      ps.gravity = new B.Vector3(0, -9, 0);
      ps.emitRate = 0;
      ps.manualEmitCount = 0;
      ps.blendMode = B.ParticleSystem.BLENDMODE_ADD;
      ps.addColorGradient(0, new B.Color4(1, 1, 1, 1));
      ps.addColorGradient(0.5, new B.Color4(1, 1, 1, 0.8));
      ps.addColorGradient(1, new B.Color4(1, 1, 1, 0));
      ps.color1 = new B.Color4(1, 1, 1, 1);
      ps.color2 = new B.Color4(1, 1, 1, 1);
      ps.colorDead = new B.Color4(0, 0, 0, 0);
      ps.updateSpeed = 0.016;
      ps.start();
      pss.push({ ps, ttl: 0 });
    }
  }

  const BURSTS = {
    bolt: { c1: [0.7, 0.85, 1, 1], c2: [1, 1, 1, 1], n: 90, h: 62, spread: 22, power: [16, 30] },
    rain: { c1: [1, 0.3, 0.7, 1], c2: [0.3, 0.85, 1, 1], n: 110, h: 46, spread: 26, power: [10, 20] },
    fog: { c1: [0.7, 0.6, 1, 1], c2: [0.8, 0.9, 1, 1], n: 80, h: 54, spread: 18, power: [8, 16] },
    gale: { c1: [0.4, 1, 0.7, 1], c2: [0.9, 1, 0.5, 1], n: 120, h: 50, spread: 34, power: [12, 26] },
    sunbreak: { c1: [1, 0.78, 0.3, 1], c2: [1, 0.55, 0.2, 1], n: 150, h: 64, spread: 14, power: [18, 34] },
    grand: { c1: [1, 0.85, 0.5, 1], c2: [0.7, 0.9, 1, 1], n: 170, h: 70, spread: 40, power: [20, 40] },
  };
  function burst(kind, at) {
    const b = BURSTS[kind] || BURSTS.bolt;
    const slot = pss[state.bursts % Math.max(1, pss.length)];
    state.bursts++;
    state.lastBurst = kind;
    if (!slot) return;
    const ps = slot.ps;
    const dx = at && at.dx != null ? at.dx : (rand() - 0.5) * b.spread;
    const dz = at && at.dz != null ? at.dz : (rand() - 0.5) * b.spread * 0.6;
    ps.emitter = new B.Vector3(C[0] + dx, b.h + rand() * 8, C[1] + dz);
    ps.color1 = new B.Color4(b.c1[0], b.c1[1], b.c1[2], b.c1[3]);
    ps.color2 = new B.Color4(b.c2[0], b.c2[1], b.c2[2], b.c2[3]);
    ps.minEmitPower = b.power[0];
    ps.maxEmitPower = b.power[1];
    ps.manualEmitCount = b.n;
  }

  /* ---- public ---- */
  const api = {
    /** Build the stage: spectators start walking in, the beams and washes sit dark. */
    start(n) {
      if (state.on) return;
      state.on = true;
      t = 0;
      // each part on its own: a texture or particle failure costs that part, not the show
      [() => buildSpectators(n || F.spectators || 30), () => buildBeams(F.beams || 6), buildWashes, buildAurora, buildFireworks].forEach((build) => {
        try {
          build();
        } catch (err) {
          console.error("[finale]", err);
        }
      });
    },
    /** One beat of the show for an ability: `grade` is "perfect", "good" or "miss". */
    cue(power, grade) {
      if (!state.on) return;
      if (grade === "miss") {
        state.beams = Math.max(0, state.beams - 0.15);
        spectators.forEach((s) => { s.hop = 0; });
        return;
      }
      const k = grade === "perfect" ? 1 : 0.65;
      state.hits++;
      state.cheer = 1.4 * k + 0.4;
      spectators.forEach((s, i) => { if (rand() < 0.35 + 0.5 * k) s.hop = 0.5 + rand() * 0.4; });
      burst(power, null);
      if (grade === "perfect") burst(power === "bolt" ? "gale" : power, null);
      if (power === "bolt") state.strobe = 1;
      if (power === "rain") state.wash = 1;
      if (power === "fog") state.fog = 1;
      if (power === "gale") state.wash = 0.7;
      if (power === "sunbreak") state.strobe = 0.7;
      state.beams = Math.min(1, state.beams + 0.14 * k + 0.05);
      state.auroraTo = Math.min(1, Math.max(state.auroraTo, state.auroraTo + 0.07 * k));
    },
    /** The grand finish: a salvo of fireworks and the full aurora. */
    grand(strength) {
      if (!state.on) return;
      const k = strength == null ? 1 : strength;
      state.auroraTo = Math.max(state.auroraTo, 0.55 + 0.45 * k);
      state.beams = Math.max(state.beams, 0.7 + 0.3 * k);
      state.cheer = 2.5;
      spectators.forEach((s) => { s.hop = 0.6; });
      const salvo = Math.round(4 + 6 * k);
      for (let i = 0; i < salvo; i++) setTimeout(() => state.on && burst("grand", null), i * 260);
    },
    /** Called every frame while the stage is up. `fog` is the weather's fog weight 0..1 from the caller. */
    update(dt, fogK) {
      if (!state.on) return;
      t += dt;
      // spectators: walk in, face the centre, look up, bob and hop
      let there = 0;
      spectators.forEach((s) => {
        const k = Math.max(0, Math.min(1, (t - s.delay) / 3.4));
        const e = k * k * (3 - 2 * k);
        s.walk = e;
        if (e >= 1) there++;
        s.root.position.x = s.from.x + (s.home.x - s.from.x) * e;
        s.root.position.z = s.from.z + (s.home.z - s.from.z) * e;
        const face = Math.atan2(C[0] - s.root.position.x, C[1] - s.root.position.z);
        s.root.rotation.y = face;
        s.hop = Math.max(0, s.hop - dt * 1.6);
        const hopY = Math.abs(Math.sin(s.hop * 6.28)) * s.hop * 0.7;
        // feet on the plaza's paving; the walk's bob and the idle sway move the body and head, not the feet
        const gx = s.root.position.x;
        const gz = s.root.position.z;
        if (s.gx == null || Math.abs(gx - s.gx) > 0.05 || Math.abs(gz - s.gz) > 0.05) {
          s.gx = gx;
          s.gz = gz;
          s.gy = world.surfaceAt ? world.surfaceAt(gx, gz) : 0;
        }
        const bob = e < 1 ? Math.abs(Math.sin(t * 8 + s.phase)) * 0.06 : (1 + Math.sin(t * 2 + s.phase)) * 0.01;
        s.root.position.y = s.gy + hopY;
        s.body.position.y = s.h * 0.31 + bob;
        s.head.position.y = s.h * 0.62 + 0.18 + bob;
        s.head.rotation.x = e >= 1 ? -0.55 - Math.min(0.35, state.cheer * 0.2) : 0; // looking up
        s.arms.position.y = s.h * 0.5 + bob + (state.cheer > 0.3 && e >= 1 ? 0.5 + Math.sin(t * 9 + s.phase) * 0.12 : 0);
        s.arms.rotation.z = state.cheer > 0.3 && e >= 1 ? Math.sin(t * 9 + s.phase) * 0.5 : 0;
      });
      state.gathered = there;
      state.cheer = Math.max(0, state.cheer - dt * 0.7);
      state.strobe = Math.max(0, state.strobe - dt * 2.2);
      state.wash = Math.max(0, state.wash - dt * 0.5);
      state.fog = Math.max(0, state.fog - dt * 0.35);
      // beams
      const fogBoost = 1 + (fogK || 0) * 1.4 + state.fog * 1.2;
      beams.forEach((b, i) => {
        const sweep = t * 0.35 * b.dir + b.phase;
        b.pivot.rotation.z = Math.sin(sweep) * 0.5 + (b.dir > 0 ? 0.15 : -0.15);
        b.pivot.rotation.x = Math.cos(sweep * 0.8 + i) * 0.45;
        const strobe = state.strobe > 0 ? (Math.sin(t * 40 + i) > 0 ? state.strobe : 0) : 0;
        b.cone.material.alpha = Math.min(0.9, (b.base * state.beams * fogBoost + strobe * 0.5) * (state.on ? 1 : 0));
      });
      // washes flip colour on the beat
      washes.forEach((w) => {
        const target = state.wash * (0.5 + 0.5 * Math.sin(t * 5 + w.i * 1.3));
        w.level += (target - w.level) * Math.min(1, dt * 8);
        w.mesh.material.alpha = Math.max(0, Math.min(0.75, w.level * 0.8));
        w.mesh.material.emissiveColor = B.Color3.FromHexString(w.hex[(Math.floor(t * 1.5) + w.i) % w.hex.length]);
      });
      // aurora
      if (aurora) {
        state.aurora += (state.auroraTo - state.aurora) * Math.min(1, dt * 0.9);
        const on = state.aurora > 0.01;
        aurora.mesh.setEnabled(on);
        if (on) {
          aurora.mat.alpha = state.aurora;
          const pos = aurora.base.slice();
          for (let i = 0; i < pos.length; i += 3) {
            const x = pos[i], z = pos[i + 2];
            pos[i + 1] += Math.sin(x * 0.03 + t * 0.9) * 7 + Math.sin(x * 0.08 - t * 1.7 + z * 0.1) * 3;
          }
          aurora.mesh.updateVerticesData(B.VertexBuffer.PositionKind, pos);
          aurora.tex.uOffset = Math.sin(t * 0.1) * 0.1;
        }
      }
    },
    info() {
      return { on: state.on, spectators: spectators.length, gathered: state.gathered, beams: +state.beams.toFixed(2), beamsLit: beams.filter((b) => b.cone.material.alpha > 0.02).length, aurora: +state.aurora.toFixed(2), bursts: state.bursts, lastBurst: state.lastBurst, cheer: +state.cheer.toFixed(2), washes: washes.filter((w) => w.mesh.material.alpha > 0.02).length, hits: state.hits, particles: pss.reduce((n, p) => n + (p.ps.getActiveCount ? p.ps.getActiveCount() : 0), 0) };
    },
    /** Take the stage down (the crowd goes home, the beams and aurora fade out with the scene). */
    stop() {
      state.on = false;
      spectators.forEach((s) => s.root.dispose(false, true));
      beams.forEach((b) => { b.cone.dispose(); b.pivot.dispose(); });
      washes.forEach((w) => w.mesh.dispose());
      if (aurora) { aurora.mesh.dispose(); aurora.tex.dispose(); }
      pss.forEach((p) => p.ps.dispose());
      if (tex) tex.dispose();
      spectators = []; beams = []; washes = []; aurora = null; pss = []; tex = null;
      Object.assign(state, { gathered: 0, beams: 0, aurora: 0, auroraTo: 0, fog: 0, cheer: 0, wash: 0, strobe: 0, hits: 0, bursts: 0 });
    },
    active: () => state.on,
  };
  return api;
}
