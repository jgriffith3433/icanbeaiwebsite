/* Sun-break aftermath (J, 2026-11-12): when Sun break follows rain or a storm within 2 game
   minutes, the street answers — steam off wet roofs / asphalt / car bonnets (~20 s), a rainbow
   arc opposite the sun at 42°, gutters and awnings drip (~30 s), puddle sparkles, pigeons back
   to a roof, umbrellas close and shop doors open. Tied to day:crowd so Dex can say his dry-parcels
   line. Phone: half steam/drips; rainbow always on. Pure math in js/aftermath-core.js. */

import {
  AFTERMATH, wetWindowOk, rainbowAnti, rainbowArc, rainbowRgb, envelope, budgets,
  steamEmitRate,
} from "./aftermath-core.js";
import { createQuadBatch } from "./rain.js";

function cfg() {
  const c = (window.DAY_CONFIG && window.DAY_CONFIG.aftermath) || {};
  return Object.assign({}, AFTERMATH, c);
}

function quality() {
  try { return (window.look && window.look.quality && window.look.quality()) || "high"; } catch (e) { return "high"; }
}

function minutesNow() {
  const n = window.day && window.day.now && window.day.now();
  return n && typeof n.minutes === "number" ? n.minutes : null;
}

function emit(action, extra) {
  try {
    window.dispatchEvent(new CustomEvent("day:aftermath", { detail: Object.assign({ action }, extra || {}) }));
  } catch (e) { /* node */ }
}

export function startAftermath(world, dayApi) {
  const day = dayApi || window.day;
  if (!world) world = day && day.world && day.world();
  if (!world || !world.scene || world.__aftermath) return world && world.__aftermath;
  const B = window.BABYLON;
  const scene = world.scene;
  const C = cfg();

  const st = {
    on: false,
    age: 0,
    steamLeft: 0,
    dripLeft: 0,
    rainbowLeft: 0,
    sparkleLeft: 0,
    birdLeft: 0,
    lastWetMin: null,
    startedAt: null,
    steamPeak: 0,
    dripPeak: 0,
    rainbowPeak: 0,
    sparklePeak: 0,
    birdsLanded: 0,
    umbrellasClosed: 0,
    shopsOut: 0,
    neighborSaid: false,
    gradeWarm: 0,
    err: null,
  };

  /* ---- rainbow ribbon (always built; alpha 0 when off) ---- */
  const ARC_N = 40;
  const BAND = 5; // spectral bands across the arc width
  const rainbowRoot = new B.TransformNode("aftermath-rainbow", scene);
  const rainbowMesh = B.MeshBuilder.CreateRibbon(
    "aftermath-rainbow-arc",
    {
      pathArray: (() => {
        // placeholder paths; rewritten each frame from the live anti-solar axis
        const paths = [];
        for (let b = 0; b < BAND; b++) {
          const path = [];
          for (let i = 0; i <= ARC_N; i++) path.push(new B.Vector3(i * 0.1, b * 0.05, 0));
          paths.push(path);
        }
        return paths;
      })(),
      updatable: true,
      closeArray: false,
      closePath: false,
    },
    scene,
  );
  rainbowMesh.parent = rainbowRoot;
  rainbowMesh.isPickable = false;
  rainbowMesh.applyFog = false;
  rainbowMesh.renderingGroupId = 1;
  rainbowMesh.alwaysSelectAsActiveMesh = true;
  const rMat = new B.StandardMaterial("aftermath-rainbow-mat", scene);
  rMat.disableLighting = true;
  rMat.backFaceCulling = false;
  rMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  rMat.alpha = 0;
  rMat.disableDepthWrite = true;
  rMat.emissiveColor = new B.Color3(1, 1, 1);
  rainbowMesh.material = rMat;
  rainbowMesh.setEnabled(false);
  // colour the bands once
  const cols = new Float32Array((ARC_N + 1) * BAND * 4);
  for (let b = 0; b < BAND; b++) {
    const rgb = rainbowRgb(b / (BAND - 1));
    for (let i = 0; i <= ARC_N; i++) {
      const o = (b * (ARC_N + 1) + i) * 4;
      cols[o] = rgb[0]; cols[o + 1] = rgb[1]; cols[o + 2] = rgb[2]; cols[o + 3] = 1;
    }
  }
  rainbowMesh.setVerticesData(B.VertexBuffer.ColorKind, cols, true);

  /* ---- steam / sparkle batches ---- */
  const softTex = (() => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      grd.addColorStop(0, "rgba(255,255,255,0.85)");
      grd.addColorStop(0.45, "rgba(220,235,255,0.35)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      return new B.Texture(c.toDataURL("image/png"), scene, true, false, B.Texture.BILINEAR_SAMPLINGMODE);
    } catch (e) { return null; }
  })();
  function flatMat(name, tex) {
    const m = new B.StandardMaterial(name, scene);
    m.disableLighting = true;
    m.emissiveColor = new B.Color3(1, 1, 1);
    m.backFaceCulling = false;
    m.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    m.disableDepthWrite = true;
    if (tex) { m.diffuseTexture = tex; m.opacityTexture = tex; m.useAlphaFromDiffuseTexture = true; }
    return m;
  }
  const steamB = softTex ? createQuadBatch(B, scene, "aftermath-steam", 120, flatMat("aftermath-steam-mat", softTex)) : null;
  const sparkB = softTex ? createQuadBatch(B, scene, "aftermath-sparkle", 64, flatMat("aftermath-sparkle-mat", softTex)) : null;
  if (steamB) steamB.mesh.setEnabled(false);
  if (sparkB) sparkB.mesh.setEnabled(false);

  const steams = []; // {x,y,z,age,life,kind}
  const sparkles = [];
  const birds = [];
  const birdMat = new B.StandardMaterial("aftermath-bird-mat", scene);
  birdMat.diffuseColor = new B.Color3(0.55, 0.58, 0.62);
  birdMat.emissiveColor = new B.Color3(0.08, 0.08, 0.1);
  birdMat.specularColor = new B.Color3(0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const root = new B.TransformNode("aftermath-bird-" + i, scene);
    const body = B.MeshBuilder.CreateSphere("aftermath-bb-" + i, { diameterX: 0.28, diameterY: 0.16, diameterZ: 0.18, segments: 4 }, scene);
    body.parent = root; body.material = birdMat; body.isPickable = false;
    const head = B.MeshBuilder.CreateSphere("aftermath-bh-" + i, { diameter: 0.1, segments: 4 }, scene);
    head.parent = root; head.position.set(0.14, 0.06, 0); head.material = birdMat; head.isPickable = false;
    root.setEnabled(false);
    birds.push({ root, t: -1, from: null, to: null });
  }

  // The rainbow, steam, sparkle and bird shaders were first compiled when Sun break followed rain (a stall on a throttled phone).
  setTimeout(() => {
    [rainbowMesh, steamB && steamB.mesh, sparkB && sparkB.mesh, birds[0] && birds[0].root.getChildMeshes()[0]].forEach((m) => {
      try { if (m && m.material && m.material.forceCompilationAsync) m.material.forceCompilationAsync(m).catch(() => {}); } catch (e) { /* headless */ }
    });
  }, 3000);

  const ROOFS = [
    { x: -24, y: 12.2, z: 0.5 }, // apt
    { x: 50, y: 12.2, z: 0.5 },  // shop
    { x: 157, y: 12.2, z: 0.5 }, // annex
  ];

  function markWet() {
    const m = minutesNow();
    if (m != null) st.lastWetMin = m;
  }

  function start(via) {
    const Cfg = cfg();
    st.on = true;
    st.age = 0;
    st.steamLeft = Cfg.steamSec;
    st.dripLeft = Cfg.dripSec;
    st.rainbowLeft = Cfg.rainbowSec;
    st.sparkleLeft = Cfg.sparkleSec;
    st.birdLeft = Cfg.birdSec;
    st.startedAt = minutesNow();
    st.steamPeak = 0;
    st.dripPeak = 0;
    st.rainbowPeak = 0;
    st.sparklePeak = 0;
    st.birdsLanded = 0;
    st.umbrellasClosed = 0;
    st.shopsOut = 0;
    st.neighborSaid = false;
    st.gradeWarm = 1;
    steams.length = 0;
    sparkles.length = 0;

    // weather steam burst (~20 s off wet roofs)
    try {
      const W = window.weather || (day && day.weather);
      if (W && W.boostSteam) W.boostSteam(Cfg.steamSec);
    } catch (e) { /* */ }

    // rain module keeps gutters dripping after the sky clears
    try {
      const R = window.rain || (day && day.rain);
      if (R && R.afterDrip) R.afterDrip(Cfg.dripSec);
    } catch (e) { /* */ }

    // pigeons: scatter then land on a roof (slice + our birds)
    try {
      if (day.slice && day.slice.scatter) day.slice.scatter("aftermath");
      if (day.slice && day.slice.land) day.slice.land("aftermath");
    } catch (e) { /* */ }

    launchBirds();
    emit("start", { via: via || "sunbreak", lastWetMin: st.lastWetMin, minutes: st.startedAt });
    try {
      window.dispatchEvent(new CustomEvent("day:crowd", {
        detail: { action: "aftermath", steam: Cfg.steamSec, drip: Cfg.dripSec, rainbow: true, shops: Cfg.shopOut },
      }));
    } catch (e) { /* */ }
  }

  function launchBirds() {
    const q = budgets(quality());
    const n = q.birds;
    const cam = scene.activeCamera;
    const cx = cam ? cam.position.x : 0;
    const cz = cam ? cam.position.z : 12;
    let roof = ROOFS[0];
    let best = 1e9;
    for (const r of ROOFS) {
      const d = Math.hypot(r.x - cx, r.z - cz);
      if (d < best) { best = d; roof = r; }
    }
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      if (i >= n) { b.root.setEnabled(false); b.t = -1; continue; }
      const a = (i / n) * Math.PI * 2;
      const from = {
        x: roof.x + Math.cos(a) * (18 + (i % 3) * 4),
        y: 4 + (i % 4),
        z: roof.z + Math.sin(a) * (18 + (i % 3) * 4),
      };
      const to = {
        x: roof.x + Math.cos(a + 0.4) * (2.2 + (i % 3) * 0.6),
        y: roof.y + 0.15,
        z: roof.z + Math.sin(a + 0.4) * (2.2 + (i % 3) * 0.6),
      };
      b.from = from; b.to = to; b.t = 0; b.landed = false;
      b.root.position.set(from.x, from.y, from.z);
      b.root.setEnabled(true);
    }
  }

  function maybeStartFromPower(d) {
    const power = d && (d.power || d.id || d.name || d.action);
    if (power !== "sunbreak" && power !== "sun") return;
    if (d && d.action === "denied") return;
    const now = minutesNow();
    // Strict: Sun break must land within rainWindowMin game minutes of the last rain/storm
    if (!wetWindowOk(st.lastWetMin, now, cfg().rainWindowMin)) {
      emit("skip", { why: "dry", lastWetMin: st.lastWetMin, minutes: now });
      return;
    }
    start(d.via || "power");
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("day:power", (e) => {
      try { maybeStartFromPower((e && e.detail) || {}); } catch (err) { st.err = String(err && err.message || err); }
    });
    window.addEventListener("day:crowd", (e) => {
      const d = (e && e.detail) || {};
      if (d.action === "umbrellas-closed" && st.on) {
        st.umbrellasClosed = Math.max(st.umbrellasClosed, d.count | 0);
      }
      if (d.action === "shops-out" && st.on) {
        st.shopsOut = Math.max(st.shopsOut, d.count | 0);
      }
    });
    window.addEventListener("day:aftermath", (e) => {
      const d = (e && e.detail) || {};
      if (d.action === "neighbor" && st.on) st.neighborSaid = true;
    });
  }

  const right = new B.Vector3(1, 0, 0);
  const up = new B.Vector3(0, 1, 0);

  function sunDir() {
    // prefer the sky's sun-break hole (opposite side gets the rainbow); else the sun light
    try {
      const info = day.sky && day.sky.info && day.sky.info();
      if (info && info.hole) {
        const h = info.hole;
        const L = Math.hypot(h.x, h.y, h.z) || 1;
        return { x: h.x / L, y: h.y / L, z: h.z / L };
      }
    } catch (e) { /* */ }
    const sun = (world.stage && world.stage.sun) || scene.getLightByName("sun");
    if (sun && sun.getDirection) {
      const d = sun.getDirection();
      // light direction points toward the scene; sun is opposite
      const L = Math.hypot(d.x, d.y, d.z) || 1;
      return { x: -d.x / L, y: -d.y / L, z: -d.z / L };
    }
    return { x: 0.35, y: 0.75, z: 0.55 };
  }

  function updateRainbow(k) {
    const cam = scene.activeCamera;
    if (!cam || k < 0.02) {
      rainbowMesh.setEnabled(false);
      rMat.alpha = 0;
      return;
    }
    const sd = sunDir();
    // opposite the sun at 42°, lifted enough that the arc clears the skyline
    const a = rainbowAnti(sd.x, sd.y, sd.z);
    const dirs = rainbowArc(a, ARC_N);
    if (dirs.length < 6) { rainbowMesh.setEnabled(false); return; }
    const dist = 95;
    const bandW = 2.4;
    const paths = [];
    for (let b = 0; b < BAND; b++) {
      const path = [];
      const off = (b / (BAND - 1) - 0.5) * bandW;
      for (let i = 0; i <= ARC_N; i++) {
        const t = i / ARC_N;
        const idx = Math.min(dirs.length - 1, Math.floor(t * (dirs.length - 1)));
        const d0 = dirs[idx];
        const d1 = dirs[Math.min(dirs.length - 1, idx + 1)];
        const f = t * (dirs.length - 1) - idx;
        const dx = d0.x + (d1.x - d0.x) * f;
        const dy = d0.y + (d1.y - d0.y) * f;
        const dz = d0.z + (d1.z - d0.z) * f;
        path.push(new B.Vector3(
          cam.position.x + dx * (dist + off),
          Math.max(cam.position.y + 4, cam.position.y + dy * (dist + off)),
          cam.position.z + dz * (dist + off),
        ));
      }
      paths.push(path);
    }
    B.MeshBuilder.CreateRibbon("aftermath-rainbow-arc", { pathArray: paths, instance: rainbowMesh, updatable: true });
    let cover = 0;
    try {
      const ov = window.look && window.look.override && window.look.override();
      if (ov && ov.cover != null) cover = ov.cover;
      const wx = window.weather && window.weather.now && window.weather.now();
      if (wx && wx.cover != null) cover = Math.max(cover, wx.cover);
    } catch (e) { /* */ }
    const cloudFade = 1 - Math.max(0, Math.min(0.85, cover * 0.9));
    rMat.alpha = 0.55 * k * cloudFade;
    rainbowMesh.setEnabled(true);
    st.rainbowPeak = Math.max(st.rainbowPeak, rMat.alpha);
  }

  function spawnSteam(dt, k) {
    const q = budgets(quality());
    const rate = steamEmitRate(st.steamLeft, cfg().steamSec, quality());
    st.steamPeak = Math.max(st.steamPeak, rate);
    const cam = scene.activeCamera;
    if (!cam || rate < 1) return;
    const want = Math.min(6, Math.floor(rate * dt));
    const crowd = day.crowd && day.crowd.positions ? day.crowd.positions() : null;
    for (let i = 0; i < want && steams.length < q.steam; i++) {
      const roll = Math.random();
      let x, y, z, kind;
      if (roll < 0.35 && crowd && crowd.cars && crowd.cars.length) {
        const c = crowd.cars[Math.floor(Math.random() * crowd.cars.length)];
        x = c.x + (Math.random() - 0.5) * 1.2;
        y = 1.15 + Math.random() * 0.2;
        z = c.z + (Math.random() - 0.5) * 1.6;
        kind = "car";
      } else if (roll < 0.6) {
        x = cam.position.x + (Math.random() - 0.5) * 28;
        y = 0.08;
        z = cam.position.z + (Math.random() - 0.5) * 28;
        kind = "asphalt";
      } else {
        const roof = ROOFS[Math.floor(Math.random() * ROOFS.length)];
        x = roof.x + (Math.random() - 0.5) * 10;
        y = roof.y + 0.05;
        z = roof.z + (Math.random() - 0.5) * 8;
        kind = "roof";
      }
      steams.push({ x, y, z, age: 0, life: 1.6 + Math.random() * 1.4, kind, seed: Math.random() * 6.28 });
    }
  }

  function spawnSparkles(dt, k) {
    const q = budgets(quality());
    const rate = k * q.sparkles * 0.7;
    st.sparklePeak = Math.max(st.sparklePeak, rate);
    const cam = scene.activeCamera;
    if (!cam) return;
    const want = Math.min(4, Math.floor(rate * dt));
    for (let i = 0; i < want && sparkles.length < q.sparkles; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 18;
      sparkles.push({
        x: cam.position.x + Math.cos(a) * r,
        y: 0.09 + Math.random() * 0.04,
        z: cam.position.z + Math.sin(a) * r,
        age: 0,
        life: 0.45 + Math.random() * 0.55,
        seed: Math.random() * 6.28,
      });
    }
  }

  function stepBirds(dt) {
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      if (b.t < 0 || !b.from) continue;
      b.t += dt;
      const u = Math.min(1, b.t / 3.2);
      const ease = u * u * (3 - 2 * u);
      const x = b.from.x + (b.to.x - b.from.x) * ease;
      const z = b.from.z + (b.to.z - b.from.z) * ease;
      const loft = Math.sin(u * Math.PI) * 5.5;
      const y = b.from.y + (b.to.y - b.from.y) * ease + loft;
      b.root.position.set(x, y, z);
      b.root.rotation.y = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
      if (u >= 1 && !b.landed) {
        b.landed = true;
        st.birdsLanded++;
        emit("bird-land", { n: st.birdsLanded, x: b.to.x, z: b.to.z });
      }
      if (b.t > 14) { b.root.setEnabled(false); b.t = -1; }
    }
  }

  function frame(dt) {
    if (!(dt > 0)) return;
    // track rain/storm on the game clock so a later Sun break can find the wet window
    try {
      const wx = window.weather && window.weather.now && window.weather.now();
      if (wx && (wx.state === "rain" || wx.state === "storm" || (wx.rain || 0) > 0.25)) markWet();
    } catch (e) { /* */ }

    if (!st.on) {
      if (steamB) { steamB.begin(); steamB.end(); }
      if (sparkB) { sparkB.begin(); sparkB.end(); }
      updateRainbow(0);
      return;
    }

    st.age += dt;
    st.steamLeft = Math.max(0, st.steamLeft - dt);
    st.dripLeft = Math.max(0, st.dripLeft - dt);
    st.rainbowLeft = Math.max(0, st.rainbowLeft - dt);
    st.sparkleLeft = Math.max(0, st.sparkleLeft - dt);
    st.birdLeft = Math.max(0, st.birdLeft - dt);
    st.gradeWarm = envelope(Math.max(st.steamLeft, st.rainbowLeft), cfg().rainbowSec, 5);

    const sk = envelope(st.steamLeft, cfg().steamSec, 5);
    const rk = envelope(st.rainbowLeft, cfg().rainbowSec, 5);
    const pk = envelope(st.sparkleLeft, cfg().sparkleSec, 4);

    spawnSteam(dt, sk);
    spawnSparkles(dt, pk);
    stepBirds(dt);
    updateRainbow(rk);

    // drip peak from rain module
    try {
      const R = window.rain || (day && day.rain);
      if (R && R.info) st.dripPeak = Math.max(st.dripPeak, R.info().drips || 0);
    } catch (e) { /* */ }

    const cam = scene.activeCamera;
    if (cam) {
      cam.getDirectionToRef(B.Axis.X, right);
      cam.getDirectionToRef(B.Axis.Y, up);
    }
    if (steamB) {
      steamB.begin();
      for (let i = steams.length - 1; i >= 0; i--) {
        const s = steams[i];
        s.age += dt;
        if (s.age >= s.life) { steams.splice(i, 1); continue; }
        const u = s.age / s.life;
        const y = s.y + u * 2.4;
        const a = (1 - u) * (0.35 + sk * 0.35);
        const w = 0.55 + u * 1.1;
        steamB.billboard(s.x + Math.sin(s.seed + s.age) * 0.15, y, s.z + Math.cos(s.seed + s.age) * 0.15, w, w * 1.2, right, up, 0.85, 0.9, 0.95, a);
      }
      steamB.end();
    }
    if (sparkB) {
      sparkB.begin();
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        s.age += dt;
        if (s.age >= s.life) { sparkles.splice(i, 1); continue; }
        const u = s.age / s.life;
        const pulse = 0.5 + 0.5 * Math.sin(s.age * 18 + s.seed);
        const a = (1 - u) * pulse * 0.9 * pk;
        const sz = 0.12 + pulse * 0.1;
        sparkB.billboard(s.x, s.y, s.z, sz, sz, right, up, 1, 0.95, 0.7, a);
      }
      sparkB.end();
    }

    if (st.steamLeft <= 0 && st.dripLeft <= 0 && st.rainbowLeft <= 0 && st.sparkleLeft <= 0 && st.birdLeft <= 0) {
      st.on = false;
      st.gradeWarm = 0;
      updateRainbow(0);
      emit("end", { seconds: st.age, umbrellas: st.umbrellasClosed, birds: st.birdsLanded });
    }
  }

  const orig = world.update.bind(world);
  world.update = function (fr, dt, opts) {
    orig(fr, dt, opts);
    try { frame(dt); } catch (e) { if (!st.err) { st.err = String(e && e.message || e); console.warn("[aftermath]", st.err); } }
  };

  const api = {
    info() {
      const q = quality();
      const R = window.rain && window.rain.info ? window.rain.info() : { drips: 0 };
      const W = window.weather && window.weather.now ? window.weather.now() : {};
      return {
        on: st.on,
        age: Math.round(st.age * 100) / 100,
        lastWetMin: st.lastWetMin,
        steamLeft: Math.round(st.steamLeft * 100) / 100,
        dripLeft: Math.round(st.dripLeft * 100) / 100,
        rainbowLeft: Math.round(st.rainbowLeft * 100) / 100,
        steam: Math.max(st.steamPeak > 0 ? Math.min(1, st.steamPeak / 40) : 0, W.steam || 0),
        steamLive: steams.length,
        drips: Math.max(st.dripPeak, R.drips || 0),
        rainbow: st.rainbowPeak,
        rainbowOn: rainbowMesh.isEnabled() && rMat.alpha > 0.05,
        sparkles: sparkles.length,
        birdsLanded: st.birdsLanded,
        umbrellasClosed: st.umbrellasClosed,
        shopsOut: st.shopsOut,
        neighborSaid: st.neighborSaid,
        gradeWarm: st.gradeWarm,
        quality: q,
        budgets: budgets(q),
        angleDeg: 42,
        error: st.err,
      };
    },
    start: (via) => start(via || "api"),
    markWet,
    active: () => st.on,
  };
  world.__aftermath = api;
  window.aftermath = api;
  if (day) day.aftermath = api;
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) {
  const w = window.day.world && window.day.world();
  if (w && w.scene) startAftermath(w, window.day);
}
