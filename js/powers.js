/* ==========================================================================
   Small Weather's powers, while the player has him.

   Pressure fills over time and faster in a storm. Hold to call a storm down
   on him (the cloud gathers over his head, then the sky he already commands
   in js/weather.js spreads and it rains). Aim and throw lightning. A gust
   shoves bins and people's umbrellas in a cone. A tornado runs the street.

   The numbers and the lines are day.config.js `powers`. createGauge() is the
   meter with no scene, so npm test can spend it dry. startPowers() is the page.
   ========================================================================== */

export const POWER_NAMES = ["storm", "bolt", "gust", "tornado"];

const DEFAULTS = {
  max: 100,
  regen: 12,
  stormRegen: 14,
  hold: 0.7,
  aim: 3.6,
  cone: 52,
  reach: 11,
  costs: { storm: 40, bolt: 24, gust: 16, tornado: 48 },
  keys: { storm: "f", bolt: "e", gust: "g", tornado: "t" },
  lines: {
    gather: "The sky draws in over him.",
    storm: "He calls the storm down.",
    bolt: "Lightning. Where he aimed.",
    gust: "A hard gust.",
    tornado: "He sends a tornado down the street.",
    dry: "Not enough pressure.",
  },
};

/** Flat unit forward of an orbit camera. Alpha is the Babylon yaw: the camera sits at (cos α, sin α), looking back along it. */
export function cameraForward(alpha) {
  const x = -Math.cos(alpha);
  const z = -Math.sin(alpha);
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

/** True when (px, pz) lies in the cone from (ox, oz) along a unit (dx, dz). */
export function inCone(ox, oz, dx, dz, px, pz, length, cosMin) {
  const vx = px - ox;
  const vz = pz - oz;
  const dist = Math.hypot(vx, vz);
  if (dist < 0.35 || dist > length) return false;
  return (vx * dx + vz * dz) / dist >= cosMin;
}

/** Seconds between the flash and the thunder. Farther strikes wait. */
export function thunderDelay(distance) {
  return Math.min(1.6, 0.06 + Math.max(0, distance) / 85);
}

/**
 * The Pressure meter. step(dt, storming) fills it. spend(name) returns false
 * when the call costs more than he has, and does not change the meter.
 */
export function createGauge(opt) {
  opt = Object.assign({}, DEFAULTS, opt || {});
  const costs = Object.assign({}, DEFAULTS.costs, opt.costs);
  const max = opt.max > 0 ? opt.max : 100;
  let value = Math.max(0, Math.min(max, opt.start || 0));

  function step(dt, storming) {
    const rate = (opt.regen || 0) + (storming ? opt.stormRegen || 0 : 0);
    value = Math.min(max, value + rate * Math.max(0, dt));
  }
  function spend(name) {
    const cost = costs[name];
    if (cost == null || value < cost - 1e-4) return false;
    value -= cost;
    return true;
  }
  function now() {
    return { value, max, costs: Object.assign({}, costs) };
  }
  return { step, spend, now };
}

/** Nearest city block or cutaway building to a point. */
export function nearestStructure(cfg, x, z) {
  let best = null;
  const consider = (hit) => {
    if (!best || hit.d < best.d) best = hit;
  };
  ((cfg.city && cfg.city.blocks) || []).forEach((b) => {
    consider({ d: Math.hypot(x - b.x, z - b.z), kind: "block", id: b.id, block: b });
  });
  Object.entries(cfg.buildings || {}).forEach(([id, b]) => {
    if (!b.bounds) return;
    const o = b.origin || [0, 0];
    const cx = (b.bounds[0] + b.bounds[2]) / 2 + o[0];
    const cz = (b.bounds[1] + b.bounds[3]) / 2 + o[1];
    consider({ d: Math.hypot(x - cx, z - cz), kind: "rooms", id, building: b });
  });
  return best;
}

/** Which street he's on, and which way `dir` sends a tornado along it. */
export function streetCourse(cfg, x, z, dirX, dirZ) {
  const street = cfg.street || { z: 12.6, from: -48, to: 210 };
  const avenues = (cfg.city && cfg.city.avenues) || [{ z: street.z, from: street.from, to: street.to }];
  const crosses = (cfg.city && cfg.city.crosses) || [];
  let best = null;
  avenues.forEach((a) => {
    const d = Math.abs(z - a.z);
    if (!best || d < best.d) best = { d, axis: "x", x, z: a.z, from: a.from, to: a.to };
  });
  crosses.forEach((c) => {
    const d = Math.abs(x - c.x);
    if (!best || d < best.d) best = { d, axis: "z", x: c.x, z, from: c.from, to: c.to };
  });
  if (!best) best = { d: 0, axis: "x", x, z: street.z, from: street.from, to: street.to };
  const along = best.axis === "x" ? dirX : dirZ;
  best.dir = along < -0.08 ? -1 : 1;
  return best;
}

export function startPowers(world, dayApi) {
  const day = dayApi || window.day;
  if (!world || !world.scene || world.__powers) return world && world.__powers;
  const B = window.BABYLON;
  const scene = world.scene;
  const cfg = Object.assign({}, DEFAULTS, (window.DAY_CONFIG && window.DAY_CONFIG.powers) || {});
  cfg.costs = Object.assign({}, DEFAULTS.costs, cfg.costs);
  cfg.keys = Object.assign({}, DEFAULTS.keys, cfg.keys);
  cfg.lines = Object.assign({}, DEFAULTS.lines, cfg.lines);
  const gauge = createGauge(cfg);
  const cosMin = Math.cos(((cfg.cone || 52) * Math.PI) / 180);
  const reach = cfg.reach || 11;
  const aimDist = cfg.aim || 3.6;

  const props = [];
  let propsReady = false;
  let age = 0;
  let keyStorm = false;
  let touchStorm = false;
  let wantStorm = false;
  let charge = 0;
  let holdResolved = false;
  let gatherNoted = false;
  let localStorm = false;
  let castFor = 0;
  let throwFor = 0;
  let flash = 0;
  let shake = 0;
  const shaken = { a: 0, b: 0 };
  let strike = null;
  let strikeSnap = null;
  let gustFx = null;
  let tornado = null;
  let blocked = null;
  let blackout = null;
  let alarm = null;
  let pointerAimed = false;
  let aimClient = null;
  let wasControl = false;
  const padPrev = {};
  const pendingThunder = [];
  let audio = null;
  let alarmBeeps = 0;

  const canDom = !!(document.body && typeof document.body.append === "function" && document.head);
  const stub = () => ({ hidden: true, style: {}, textContent: "", classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, appendChild() {}, addEventListener() {} });
  let meter = stub();
  let meterFill = stub();
  let reticle = stub();
  let pad = stub();
  const buttons = {};

  function mode() {
    return day.control && day.control.mode ? day.control.mode() : "schedule";
  }
  function who() {
    const s = day.control && day.control.state ? day.control.state() : null;
    return s || { x: 0, y: 0, z: 0, yaw: 0, mode: mode() };
  }
  function wx() {
    return window.weather || world.__weather || null;
  }
  function storming() {
    const w = wx();
    return !!(localStorm || (w && w.now && w.now().state === "storm"));
  }
  function line(key) {
    return cfg.lines[key] || "";
  }
  function note(text) {
    if (text && day.note) day.note(text);
  }
  function emit(detail) {
    if (typeof window.CustomEvent !== "function" || !window.dispatchEvent) return;
    try {
      window.dispatchEvent(new window.CustomEvent("day:power", { detail }));
    } catch (err) {
      /* the test's window has no events */
    }
  }
  function say(action, via, power) {
    const g = gauge.now();
    emit({ action, via: via || "key", power: power || action, pressure: Math.round(g.value) });
  }

  /* ---- look: a cloud over him, a bolt, a scorch, the gust's shape, the tornado ---- */
  const cloudMat = new B.StandardMaterial("power-cloud", scene);
  cloudMat.disableLighting = true;
  cloudMat.emissiveColor = new B.Color3(0.04, 0.05, 0.1);
  cloudMat.alpha = 0.78;
  cloudMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  cloudMat.backFaceCulling = false;
  const cloud = B.MeshBuilder.CreateSphere("power-cloud", { diameter: 1, segments: 10 }, scene);
  cloud.material = cloudMat;
  cloud.isPickable = false;
  cloud.setEnabled(false);
  const shelf = B.MeshBuilder.CreateCylinder("power-shelf", { diameter: 1, height: 0.35, tessellation: 12 }, scene);
  shelf.material = cloudMat;
  shelf.isPickable = false;
  shelf.setEnabled(false);

  const boltMat = new B.StandardMaterial("power-bolt", scene);
  boltMat.disableLighting = true;
  boltMat.emissiveColor = new B.Color3(0.75, 0.9, 1);
  const boltParts = [0, 1, 2, 3].map((i) => {
    const m = B.MeshBuilder.CreateBox("strike-bolt-" + i, { width: 0.14, height: 1, depth: 0.14 }, scene);
    m.material = boltMat;
    m.isPickable = false;
    m.setEnabled(false);
    return m;
  });
  const impact = B.MeshBuilder.CreateSphere("strike-impact", { diameter: 0.7, segments: 8 }, scene);
  impact.material = boltMat;
  impact.isPickable = false;
  impact.setEnabled(false);
  const scorchMat = new B.StandardMaterial("power-scorch", scene);
  scorchMat.diffuseColor = new B.Color3(0.08, 0.07, 0.06);
  scorchMat.specularColor = new B.Color3(0, 0, 0);
  scorchMat.emissiveColor = new B.Color3(0.02, 0.015, 0.01);
  const scorches = [];
  const flashLight = new B.PointLight("strike-flash", B.Vector3.Zero(), scene);
  flashLight.diffuse = new B.Color3(0.75, 0.86, 1);
  flashLight.intensity = 0;
  flashLight.range = 28;

  const gustMat = new B.StandardMaterial("power-gust", scene);
  gustMat.disableLighting = true;
  gustMat.emissiveColor = new B.Color3(0.55, 0.7, 0.85);
  gustMat.alpha = 0.28;
  gustMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  gustMat.backFaceCulling = false;
  const gustMesh = B.MeshBuilder.CreateBox("power-gust", { width: 1, height: 1, depth: 1 }, scene);
  gustMesh.material = gustMat;
  gustMesh.isPickable = false;
  gustMesh.setEnabled(false);

  const funMat = new B.StandardMaterial("power-funnel", scene);
  funMat.disableLighting = true;
  funMat.emissiveColor = new B.Color3(0.12, 0.16, 0.26);
  funMat.alpha = 0.72;
  funMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
  const funnel = new B.TransformNode("power-tornado", scene);
  const funnelBits = [0, 1, 2, 3, 4].map((i) => {
    const m = B.MeshBuilder.CreateBox("funnel-" + i, { width: 0.35 + i * 0.45, height: 1.15, depth: 0.35 + i * 0.45 }, scene);
    m.parent = funnel;
    m.position.y = 0.6 + i * 1.15;
    m.material = funMat;
    m.isPickable = false;
    return m;
  });
  const debris = [0, 1, 2, 3, 4, 5].map((i) => {
    const m = B.MeshBuilder.CreateBox("debris-" + i, { size: 0.18 }, scene);
    m.parent = funnel;
    m.material = boltMat;
    m.isPickable = false;
    return m;
  });
  funnel.setEnabled(false);
  let funnelSpin = 0;

  let rainPs = null;
  try {
    rainPs = new B.ParticleSystem("power-rain", 700, scene);
    rainPs.emitter = new B.Vector3(0, 8, 0);
    rainPs.minEmitBox = new B.Vector3(-4, 0, -4);
    rainPs.maxEmitBox = new B.Vector3(4, 1, 4);
    rainPs.color1 = new B.Color4(0.7, 0.82, 1, 0.55);
    rainPs.color2 = new B.Color4(0.85, 0.9, 1, 0.25);
    rainPs.colorDead = new B.Color4(1, 1, 1, 0);
    rainPs.minSize = 0.08;
    rainPs.maxSize = 0.2;
    rainPs.minLifeTime = 0.35;
    rainPs.maxLifeTime = 0.6;
    rainPs.emitRate = 0;
    rainPs.direction1 = new B.Vector3(-0.2, -1, -0.1);
    rainPs.direction2 = new B.Vector3(0.2, -1, 0.15);
    rainPs.minEmitPower = 14;
    rainPs.maxEmitPower = 20;
    rainPs.gravity = new B.Vector3(0, -6, 0);
    rainPs.start();
  } catch (err) {
    rainPs = null;
  }

  const glow = (scene.effectLayers || []).find((l) => l.name === "glow");
  if (glow && glow.addIncludedOnlyMesh) {
    boltParts.forEach((m) => glow.addIncludedOnlyMesh(m));
    glow.addIncludedOnlyMesh(impact);
  }

  let cloudR = 0;
  let cloudTarget = 0;

  function forward() {
    const cam = world.camera;
    if (cam && Number.isFinite(cam.alpha)) return cameraForward(cam.alpha);
    const p = who();
    return { x: Math.sin(p.yaw || 0), z: Math.cos(p.yaw || 0) };
  }

  function groundAim() {
    const p = who();
    if (pointerAimed && aimClient && world.engine && world.engine.getRenderWidth) {
      const canvas = scene.getEngine().getRenderingCanvas && scene.getEngine().getRenderingCanvas();
      const rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      if (rect && rect.width > 2 && rect.height > 2) {
        try {
          const rw = world.engine.getRenderWidth();
          const rh = world.engine.getRenderHeight();
          const rx = ((aimClient.x - rect.left) / rect.width) * rw;
          const ry = ((aimClient.y - rect.top) / rect.height) * rh;
          const ray = scene.createPickingRay(rx, ry, B.Matrix.Identity(), world.camera);
          if (ray && ray.direction.y < -0.04) {
            const t = (0.05 - ray.origin.y) / ray.direction.y;
            if (t > 0 && t < 80) {
              const hit = ray.origin.add(ray.direction.scale(t));
              const d = Math.hypot(hit.x - p.x, hit.z - p.z);
              if (d > 0.8 && d < 32) return { x: hit.x, z: hit.z, y: surfaceY(hit.x, hit.z) };
            }
          }
        } catch (err) {
          /* fall through to the resting aim */
        }
      }
    }
    const f = forward();
    return { x: p.x + f.x * aimDist, z: p.z + f.z * aimDist, y: surfaceY(p.x + f.x * aimDist, p.z + f.z * aimDist) };
  }

  function surfaceY(x, z) {
    let y = 0.08;
    ((window.DAY_CONFIG.city && window.DAY_CONFIG.city.blocks) || []).forEach((b) => {
      if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2) y = Math.max(y, b.h + 0.06);
    });
    return y;
  }

  function shove(prop, ix, iy, iz) {
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

  function ensureProps() {
    if (propsReady) return;
    const phys = world.physics && world.physics();
    if (!phys && age < 1.5) return;
    propsReady = true;
    const street = (window.DAY_CONFIG && window.DAY_CONFIG.street) || { z: 12.6 };
    const list = cfg.loose || [];
    list.forEach((spec, i) => {
      const kind = spec.kind === "bin" ? "bin" : "umbrella";
      const root = B.MeshBuilder.CreateBox("loose-" + kind + "-" + i, { width: 0.5, height: kind === "bin" ? 0.85 : 0.7, depth: 0.5 }, scene);
      const z = street.z + (spec.dz || 0);
      root.position.set(spec.x, kind === "bin" ? 0.5 : 0.42, z);
      root.isPickable = false;
      const mat = new B.StandardMaterial("loose-mat-" + i, scene);
      mat.diffuseColor = kind === "bin" ? new B.Color3(0.1, 0.28, 0.2) : new B.Color3(0.25, 0.32, 0.48);
      mat.specularColor = new B.Color3(0.04, 0.04, 0.05);
      root.material = mat;
      let body = null;
      if (phys) {
        try {
          const agg = new B.PhysicsAggregate(root, B.PhysicsShapeType.BOX, { mass: kind === "bin" ? 9 : 6.5, friction: 0.55, restitution: 0.02 }, scene);
          body = agg.body;
          body.setLinearDamping(0.42);
          body.setAngularDamping(0.45);
        } catch (err) {
          body = null;
        }
      }
      if (kind === "umbrella") {
        const skin = new B.StandardMaterial("loose-skin-" + i, scene);
        skin.diffuseColor = new B.Color3(0.72, 0.55, 0.42);
        const head = B.MeshBuilder.CreateSphere("loose-head-" + i, { diameter: 0.28, segments: 6 }, scene);
        head.parent = root;
        head.position.y = 0.55;
        head.material = skin;
        head.isPickable = false;
        const cloth = new B.StandardMaterial("loose-cloth-" + i, scene);
        cloth.diffuseColor = new B.Color3(0.08, 0.12, 0.22);
        cloth.emissiveColor = new B.Color3(0.02, 0.05, 0.12);
        const cap = B.MeshBuilder.CreateSphere("loose-cap-" + i, { diameter: 1.15, segments: 8 }, scene);
        cap.parent = root;
        cap.position.y = 0.95;
        cap.scaling.y = 0.22;
        cap.material = cloth;
        cap.isPickable = false;
        const pole = B.MeshBuilder.CreateCylinder("loose-pole-" + i, { diameter: 0.04, height: 0.7 }, scene);
        pole.parent = root;
        pole.position.y = 0.7;
        pole.material = mat;
        pole.isPickable = false;
      }
      props.push({ mesh: root, body, kind, i });
    });
  }

  function propPositions() {
    return props.map((p) => ({ kind: p.kind, x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z }));
  }

  /* ---- calls ---- */
  function refuse(power, via) {
    blocked = { power, pressure: Math.round(gauge.now().value), at: age };
    note(line("dry"));
    say("denied", via, power);
    return false;
  }

  function summon(via) {
    if (!gauge.spend("storm")) return refuse("storm", via);
    localStorm = true;
    cloudTarget = 34;
    castFor = 1.05;
    const w = wx();
    if (w && w.set) w.set("storm", 1, "power");
    note(line("storm"));
    say("storm", via, "storm");
    burst(160, 1.1, 0.45, "lowpass");
    return true;
  }

  function bolt(via) {
    if (mode() !== "control") return false;
    if (!gauge.spend("bolt")) return refuse("bolt", via);
    const aim = groundAim();
    const p = who();
    throwFor = 0.55;
    flash = 1;
    const dist = Math.hypot(aim.x - (world.camera ? world.camera.position.x : p.x), aim.z - (world.camera ? world.camera.position.z : p.z));
    const delay = thunderDelay(dist);
    shake = Math.max(shake, 0.02 + 0.03 * (1 - Math.min(1, dist / 36)));
    showBolt(aim);
    const scorch = B.MeshBuilder.CreateCylinder("scorch", { diameter: 1.7, height: 0.03, tessellation: 12 }, scene);
    scorch.position.set(aim.x, aim.y + 0.02, aim.z);
    scorch.material = scorchMat;
    scorch.isPickable = false;
    scorches.push({ mesh: scorch, until: age + 14 });
    flashLight.position.set(aim.x, aim.y + 1.4, aim.z);
    const hit = nearestStructure(window.DAY_CONFIG || {}, aim.x, aim.z);
    if (hit) beginBlackout(hit);
    const car = nearestCar(aim.x, aim.z);
    const alarmed = !!(car && car.d < 28);
    if (alarmed) beginAlarm(car.node);
    strikeSnap = propPositions();
    let knocked = 0;
    props.forEach((prop) => {
      const dx = prop.mesh.position.x - aim.x;
      const dz = prop.mesh.position.z - aim.z;
      const d = Math.hypot(dx, dz);
      if (d > 7.5) return;
      const k = (1 - d / 7.5) * 78;
      const n = d < 0.2 ? 1 : d;
      shove(prop, (dx / n) * k, 26 + (1 - d / 7.5) * 30, (dz / n) * k);
      knocked++;
    });
    strike = {
      id: (strike ? strike.id : 0) + 1,
      x: aim.x,
      y: aim.y,
      z: aim.z,
      aimX: aim.x,
      aimZ: aim.z,
      delay,
      thunder: false,
      alarm: alarmed,
      blackout: hit ? hit.id : null,
      knocked,
      at: age,
    };
    pendingThunder.push({ at: age + delay, id: strike.id, dist });
    note(line("bolt"));
    say("bolt", via, "bolt");
    return true;
  }

  function gust(via) {
    if (mode() !== "control") return false;
    if (!gauge.spend("gust")) return refuse("gust", via);
    const p = who();
    const f = forward();
    let pushes = 0;
    props.forEach((prop) => {
      if (!inCone(p.x, p.z, f.x, f.z, prop.mesh.position.x, prop.mesh.position.z, reach, cosMin)) return;
      const k = prop.kind === "umbrella" ? 70 : 58;
      shove(prop, f.x * k, 16, f.z * k);
      pushes++;
    });
    gustMesh.setEnabled(true);
    gustMesh.scaling.set(3.2, 1.15, reach);
    gustMesh.position.set(p.x + f.x * (reach * 0.45), 1.05, p.z + f.z * (reach * 0.45));
    gustMesh.rotation.y = Math.atan2(f.x, f.z);
    gustFx = { id: (gustFx ? gustFx.id : 0) + 1, until: age + 0.42, pushes, dirX: f.x, dirZ: f.z, at: age };
    // A hard gust also plants a short updraft he can ride (storm-riding traversal).
    if (day.control && day.control.spawnUpdraft) {
      const ride = (window.DAY_CONFIG && window.DAY_CONFIG.control && window.DAY_CONFIG.control.ride && window.DAY_CONFIG.control.ride.updraft) || {};
      day.control.spawnUpdraft(p.x, p.z, {
        r: ride.radius != null ? ride.radius : 4.2,
        lift: ride.lift != null ? ride.lift : 8,
        life: ride.life != null ? ride.life : 7,
        kind: "gust",
      });
    }
    shake = Math.max(shake, 0.012);
    note(line("gust"));
    say("gust", via, "gust");
    burst(700, 0.4, 0.4, "bandpass");
    return true;
  }

  function sendTornado(via) {
    if (mode() !== "control") return false;
    if (tornado && tornado.life > 0) return false;
    if (!gauge.spend("tornado")) return refuse("tornado", via);
    const p = who();
    const f = forward();
    const course = streetCourse(window.DAY_CONFIG || {}, p.x, p.z, f.x, f.z);
    tornado = {
      x: course.axis === "x" ? p.x : course.x,
      z: course.axis === "z" ? p.z : course.z,
      axis: course.axis,
      dir: course.dir,
      from: course.from,
      to: course.to,
      life: 5.4,
      age: 0,
      startX: course.axis === "x" ? p.x : course.x,
      startZ: course.axis === "z" ? p.z : course.z,
    };
    funnel.setEnabled(true);
    note(line("tornado"));
    say("tornado", via, "tornado");
    burst(90, 0.8, 0.5, "lowpass");
    return true;
  }

  const commands = { storm: summon, bolt, gust, tornado: sendTornado };
  function command(name, via) {
    const fn = commands[name];
    if (!fn || mode() !== "control") return false;
    return fn(via || "key");
  }

  function showBolt(aim) {
    const top = aim.y + 15;
    const jag = [0, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, 0];
    const jagz = [0, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, 0];
    boltParts.forEach((m, i) => {
      const y0 = top + ((aim.y - top) * i) / boltParts.length;
      const y1 = top + ((aim.y - top) * (i + 1)) / boltParts.length;
      m.position.set(aim.x + jag[i], (y0 + y1) / 2, aim.z + jagz[i]);
      m.scaling.y = Math.max(0.4, Math.abs(y1 - y0));
      m.setEnabled(true);
    });
    impact.position.set(aim.x, aim.y + 0.4, aim.z);
    impact.setEnabled(true);
  }

  function beginBlackout(hit) {
    const covers = [];
    if (hit.kind === "block" && hit.block) {
      const b = hit.block;
      const x0 = b.x - b.w / 2;
      const x1 = b.x + b.w / 2;
      const z0 = b.z - b.d / 2;
      const z1 = b.z + b.d / 2;
      const floors = Math.max(1, Math.floor((b.h - 0.8) / 3));
      const mat = new B.StandardMaterial("blackout-" + b.id, scene);
      mat.disableLighting = true;
      mat.emissiveColor = new B.Color3(0.01, 0.012, 0.02);
      for (let f = 0; f < floors; f++) {
        const wy = 1.7 + f * 3;
        if (wy > b.h - 0.9) continue;
        for (let wx = x0 + 1.7; wx < x1 - 0.8; wx += 3.1) {
          if (b.stair && wx > b.stair.x0 - 0.3 && wx < b.stair.x1 + 0.3) continue;
          [z1 + 0.14, z0 - 0.14].forEach((wz) => {
            const m = B.MeshBuilder.CreateBox("blackout-win", { width: 1.25, height: 1.35, depth: 0.08 }, scene);
            m.position.set(wx, wy, wz);
            m.material = mat;
            m.isPickable = false;
            covers.push(m);
          });
        }
      }
    }
    const area = areaOf(hit);
    const dims = [];
    if (area) {
      scene.meshes.forEach((m) => {
        if (!m.material || !m.material.emissiveColor) return;
        if (!/^(wg|lampshade|flshade|clockface|screenface|btvface)$/.test(m.name)) return;
        const p = m.getAbsolutePosition();
        if (p.x < area.x0 - 0.4 || p.x > area.x1 + 0.4 || p.z < area.z0 - 0.4 || p.z > area.z1 + 0.4) return;
        dims.push(m);
      });
    }
    const lights = lightsOf(hit.id);
    blackout = { id: hit.id, until: age + 8, covers, dims, lights };
  }

  function areaOf(hit) {
    if (hit.kind === "block" && hit.block) {
      const b = hit.block;
      return { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 };
    }
    const b = hit.building;
    if (!b || !b.bounds) return null;
    const o = b.origin || [0, 0];
    return { x0: b.bounds[0] + o[0], x1: b.bounds[2] + o[0], z0: b.bounds[1] + o[1], z1: b.bounds[3] + o[1] };
  }

  function lightsOf(id) {
    const rooms = (window.DAY_CONFIG && window.DAY_CONFIG.rooms) || {};
    return scene.lights.filter((L) => {
      if (id === "office" && /^office\d/.test(L.name)) return true;
      if (!L.name.startsWith("light-")) return false;
      const room = rooms[L.name.slice(6)];
      return !!(room && room.building === id);
    });
  }

  function nearestCar(x, z) {
    let best = null;
    (scene.transformNodes || []).forEach((n) => {
      if (n.name !== "car" || !n.isEnabled()) return;
      const p = n.getAbsolutePosition();
      const d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.d) best = { node: n, d, position: p };
    });
    return best;
  }

  function beginAlarm(node) {
    alarm = { node, until: age + 6.2, phase: 0 };
    alarmBeeps = age;
  }

  /* ---- sound, the same idea as the weather: noise, not a file ---- */
  function soundOn() {
    const btn = document.getElementById && document.getElementById("sound");
    return !!(btn && btn.getAttribute("aria-pressed") === "true");
  }
  function ensureAudio() {
    if (audio || (!window.AudioContext && !window.webkitAudioContext)) return audio;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.97 * b0 + 0.1 * w;
        data[i] = Math.max(-1, Math.min(1, b0 * 2.6));
      }
      audio = { ctx, master, buf };
    } catch (err) {
      audio = null;
    }
    return audio;
  }
  function burst(freq, dur, vol, type) {
    const a = ensureAudio();
    if (!a || !soundOn()) return;
    if (a.ctx.state === "suspended") a.ctx.resume();
    const t = a.ctx.currentTime;
    const src = a.ctx.createBufferSource();
    src.buffer = a.buf;
    const filter = a.ctx.createBiquadFilter();
    filter.type = type || "lowpass";
    filter.frequency.setValueAtTime(Math.max(30, freq), t);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(a.master);
    src.start(t);
    src.stop(t + dur + 0.03);
  }
  function beepAlarm() {
    const a = ensureAudio();
    if (!a || !soundOn() || !alarm) return;
    if (age < alarmBeeps) return;
    alarmBeeps = age + 0.28;
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = "square";
    o.frequency.value = alarm.phase % 2 < 1 ? 740 : 520;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g);
    g.connect(a.master);
    o.start(t);
    o.stop(t + 0.18);
  }

  /* ---- the meter, the reticle, the phone buttons ---- */
  if (canDom) {
    const style = document.createElement("style");
    style.textContent = `
.pressure{position:fixed;z-index:6;left:18px;bottom:168px;width:228px;pointer-events:none;font:600 0.78rem/1.2 system-ui,sans-serif;color:#e7eef8}
.pressure[hidden]{display:none}
.pressure .bar{margin-top:4px;height:8px;border-radius:99px;background:rgba(8,12,20,.55);border:1px solid rgba(126,200,255,.45);overflow:hidden}
.pressure .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#1a4c7a,#7ec8ff);border-radius:99px}
.pressure.dry .bar i{background:#c4554a}
.power-reticle{position:fixed;z-index:5;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid #9fd4ff;border-radius:50%;box-shadow:0 0 8px rgba(80,160,255,.8);pointer-events:none}
.power-reticle[hidden]{display:none}
.powerpad{position:fixed;z-index:6;right:max(18px,env(safe-area-inset-right));bottom:268px;display:grid;grid-template-columns:1fr 1fr;gap:8px;width:168px}
.powerpad[hidden]{display:none}
.powerpad button{appearance:none;border:1px solid rgba(126,200,255,.55);background:rgba(10,14,22,.55);color:#d5e8ff;border-radius:12px;padding:10px 6px;font:600 0.78rem system-ui,sans-serif;touch-action:none}
.powerpad button.held{background:#7ec8ff;color:#102033}
.preview-public .pressure{bottom:92px}
html.touch-ui .pressure,html.touch-ui.public .pressure,html.touch-ui.preview-public .pressure{left:max(12px,env(safe-area-inset-left));right:auto;bottom:auto;top:max(78px,calc(env(safe-area-inset-top) + 72px));width:min(148px,40vw);min-height:44px;box-sizing:border-box;padding:6px 10px;border-radius:12px;background:rgba(10,14,22,.55);display:flex;flex-direction:column;justify-content:center}
html.touch-ui .pressure[hidden]{display:none}
html.touch-ui.in-control .side{display:none}
html.touch-ui .powerpad{right:max(12px,env(safe-area-inset-right));bottom:max(150px,calc(env(safe-area-inset-bottom) + 138px));width:148px;gap:6px}
html.touch-ui .powerpad button{min-height:44px;padding:11px 4px}
`;
    document.head.appendChild(style);
    meter = document.createElement("div");
    meter.className = "pressure";
    meter.id = "pressure";
    meter.hidden = true;
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", String(cfg.max));
    meter.setAttribute("aria-label", "Pressure");
    meter.innerHTML = `Pressure<div class="bar"><i></i></div>`;
    meterFill = meter.querySelector("i");
    reticle = document.createElement("div");
    reticle.className = "power-reticle";
    reticle.id = "power-reticle";
    reticle.hidden = true;
    pad = document.createElement("div");
    pad.className = "powerpad";
    pad.id = "powerpad";
    pad.hidden = true;
    [["storm", "Storm"], ["bolt", "Bolt"], ["gust", "Gust"], ["tornado", "Tornado"]].forEach(([name, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "power-" + name;
      b.textContent = label;
      b.setAttribute("aria-label", label);
      pad.appendChild(b);
      buttons[name] = b;
    });
    document.body.append(meter, reticle, pad);
    const holdBtn = buttons.storm;
    holdBtn.addEventListener("pointerdown", (e) => {
      touchStorm = true;
      holdBtn.classList.add("held");
      e.preventDefault();
    });
    const holdUp = () => {
      touchStorm = false;
      holdBtn.classList.remove("held");
    };
    holdBtn.addEventListener("pointerup", holdUp);
    holdBtn.addEventListener("pointercancel", holdUp);
    holdBtn.addEventListener("pointerleave", (e) => {
      if (e.buttons) holdUp();
    });
    ["bolt", "gust", "tornado"].forEach((name) => {
      buttons[name].addEventListener("pointerdown", (e) => {
        command(name, "touch");
        e.preventDefault();
      });
    });
  }

  function paintMeter() {
    if (!canDom) return;
    const on = mode() === "control";
    const g = gauge.now();
    meter.hidden = !on;
    meter.setAttribute("aria-valuenow", String(Math.round(g.value)));
    meterFill.style.width = Math.max(0, Math.min(100, (g.value / g.max) * 100)) + "%";
    const dry = blocked && age - blocked.at < 0.7;
    meter.classList.toggle("dry", !!dry || g.value < (cfg.costs.gust || 16));
    const touch = on && (who().touch || (window.matchMedia && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 700)));
    pad.hidden = !touch;
    if (!on) reticle.hidden = true;
  }

  function placeReticle(aim) {
    if (!canDom || mode() !== "control" || !world.camera) {
      reticle.hidden = true;
      return;
    }
    try {
      const rw = world.engine.getRenderWidth();
      const rh = world.engine.getRenderHeight();
      const canvas = world.engine.getRenderingCanvas();
      const rect = canvas.getBoundingClientRect();
      const v = B.Vector3.Project(new B.Vector3(aim.x, aim.y + 0.15, aim.z), B.Matrix.Identity(), scene.getTransformMatrix(), world.camera.viewport.toGlobal(rw, rh));
      if (v.z < 0 || v.z > 1) {
        reticle.hidden = true;
        return;
      }
      reticle.hidden = false;
      reticle.style.left = rect.left + (v.x / rw) * rect.width + "px";
      reticle.style.top = rect.top + (v.y / rh) * rect.height + "px";
    } catch (err) {
      reticle.hidden = true;
    }
  }

  /* ---- keys, mouse, gamepad ---- */
  const keyName = {};
  Object.entries(cfg.keys).forEach(([name, k]) => (keyName[String(k).toLowerCase()] = name));
  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT" && e.target.type !== "range") return;
    const name = keyName[(e.key || "").toLowerCase()];
    if (!name || mode() !== "control") return;
    if (name === "storm") {
      if (!e.repeat) keyStorm = true;
    } else if (!e.repeat) command(name, "key");
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  window.addEventListener("keyup", (e) => {
    if (keyName[(e.key || "").toLowerCase()] === "storm") keyStorm = false;
  }, true);
  window.addEventListener("pointermove", (e) => {
    const canvas = world.engine && world.engine.getRenderingCanvas && world.engine.getRenderingCanvas();
    if (!canvas || e.target !== canvas) return;
    pointerAimed = true;
    aimClient = { x: e.clientX, y: e.clientY };
  }, true);
  window.addEventListener("pointerdown", (e) => {
    const a = ensureAudio();
    if (a && a.ctx.state === "suspended") a.ctx.resume();
    if (e.button !== 2 || mode() !== "control") return;
    const canvas = world.engine && world.engine.getRenderingCanvas && world.engine.getRenderingCanvas();
    if (canvas && e.target !== canvas) return;
    pointerAimed = true;
    aimClient = { x: e.clientX, y: e.clientY };
    command("bolt", "mouse");
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  window.addEventListener("contextmenu", (e) => {
    if (mode() === "control") e.preventDefault();
  }, true);

  function pollPad() {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    let hold = false;
    for (const g of pads) {
      if (!g || !g.connected) continue;
      const pressed = (i) => {
        const b = g.buttons[i];
        return !!(b && (b.pressed || b.value > 0.55));
      };
      const edge = (i) => {
        const now = pressed(i);
        const was = padPrev[g.index + ":" + i];
        padPrev[g.index + ":" + i] = now;
        return now && !was;
      };
      if (pressed(3)) hold = true; // Y: hold for the storm
      if (edge(2)) command("bolt", "gamepad"); // X
      if (edge(6)) command("gust", "gamepad"); // LT
      if (edge(7)) command("tornado", "gamepad"); // RT
    }
    return hold;
  }

  /* ---- each frame, after the day and the weather have had the scene ---- */
  function tick(dt) {
    dt = Math.max(0, Math.min(0.1, dt || 0));
    age += dt;
    ensureProps();
    const on = mode() === "control";
    if (on && !wasControl) pointerAimed = false;
    if (!on) {
      keyStorm = false;
      touchStorm = false;
      wantStorm = false;
      localStorm = false;
      cloudTarget = 0;
      holdResolved = false;
      gatherNoted = false;
    }
    wasControl = on;
    if (on) gauge.step(dt, storming());

    const padHolding = on && pollPad();
    // F, the Storm button, or a gamepad's Y — any of them holds the call
    wantStorm = on && (keyStorm || touchStorm || padHolding);

    if (wantStorm) {
      if (!gatherNoted) {
        gatherNoted = true;
        charge = 0;
        holdResolved = false;
        note(line("gather"));
      }
      charge += dt;
      if (!holdResolved) cloudTarget = Math.max(cloudTarget, 2.2 + 7 * Math.min(1, charge / (cfg.hold || 0.7)));
      if (!holdResolved && charge >= (cfg.hold || 0.7)) {
        holdResolved = true;
        const via = padHolding ? "gamepad" : touchStorm ? "touch" : "key";
        summon(via);
        if (!localStorm) cloudTarget = 0;
      }
    } else {
      charge = 0;
      holdResolved = false;
      gatherNoted = false;
      if (!localStorm) cloudTarget = 0;
    }
    if (localStorm) cloudTarget = Math.max(cloudTarget, 34);

    cloudR += (cloudTarget - cloudR) * (1 - Math.exp(-2.6 * dt));
    const showCloud = cloudR > 0.8;
    cloud.setEnabled(showCloud);
    shelf.setEnabled(showCloud);
    if (showCloud) {
      const p = who();
      cloud.scaling.set(cloudR * 2, cloudR * 0.85, cloudR * 2);
      cloud.position.set(p.x, 4.2 + cloudR * 0.22, p.z);
      shelf.scaling.set(cloudR * 2.4, 1, cloudR * 2.4);
      shelf.position.set(p.x, 6.5 + cloudR * 0.18, p.z);
      cloudMat.alpha = Math.min(0.84, 0.35 + cloudR / 40);
    }
    if (rainPs) {
      const p = who();
      rainPs.emitter.set(p.x, 9, p.z);
      const w = wx();
      const globalRain = w && w.now ? w.now().rain : 0;
      rainPs.emitRate = localStorm ? (globalRain > 0.72 ? 60 : 900) : 0;
    }

    castFor = Math.max(0, castFor - dt);
    throwFor = Math.max(0, throwFor - dt);
    flash = Math.max(0, flash - dt * 3.1);
    flashLight.intensity = flash * 36;
    if (flash < 0.05) {
      boltParts.forEach((m) => m.setEnabled(false));
      impact.setEnabled(false);
    } else if (impact.isEnabled()) impact.scaling.setAll(0.6 + flash * 1.4);

    if (flash > 0) {
      const c = scene.clearColor;
      const k = flash * 0.72;
      c.r += (1 - c.r) * k;
      c.g += (1 - c.g) * k;
      c.b += (1 - c.b) * k;
      const stage = world.stage || {};
      if (stage.pipeline && stage.pipeline.imageProcessing) stage.pipeline.imageProcessing.exposure *= 1 + flash * 1.5;
    }

    if (gustFx && age > gustFx.until) {
      gustMesh.setEnabled(false);
      gustFx = gustFx.pushes != null ? Object.assign(gustFx, { alive: false }) : gustFx;
    }
    if (strike && strikeSnap && age < strike.at + 1.2) {
      let n = 0;
      props.forEach((prop, i) => {
        const s = strikeSnap[i];
        if (!s) return;
        if (Math.hypot(prop.mesh.position.x - s.x, prop.mesh.position.z - s.z) > 0.35) n++;
      });
      strike.knocked = Math.max(strike.knocked, n);
    }
    for (let i = pendingThunder.length - 1; i >= 0; i--) {
      const th = pendingThunder[i];
      if (age < th.at) continue;
      pendingThunder.splice(i, 1);
      if (strike && strike.id === th.id) strike.thunder = true;
      flash = Math.max(flash, 0.28);
      shake = Math.max(shake, 0.018 + 0.04 * (1 - Math.min(1, th.dist / 40)));
      burst(140, 1.35, 0.85, "lowpass");
      say("thunder", "world", "bolt");
    }

    if (tornado && tornado.life > 0) {
      const step = 9.2 * dt * tornado.dir;
      if (tornado.axis === "x") tornado.x = Math.max(tornado.from + 2, Math.min(tornado.to - 2, tornado.x + step));
      else tornado.z = Math.max(tornado.from + 2, Math.min(tornado.to - 2, tornado.z + step));
      tornado.life -= dt;
      tornado.age += dt;
      funnel.position.set(tornado.x, 0, tornado.z);
      funnelSpin += dt * 5.5;
      funnel.rotation.y = funnelSpin;
      funnelBits.forEach((m, i) => (m.rotation.y = funnelSpin * (i % 2 ? -1.4 : 1)));
      debris.forEach((m, i) => {
        const a = funnelSpin * 1.6 + i;
        const rad = 0.7 + (i % 3) * 0.45;
        m.position.set(Math.sin(a) * rad, 0.4 + i * 0.85, Math.cos(a) * rad);
      });
      shake = Math.max(shake, 0.008);
      props.forEach((prop) => {
        const dx = tornado.x - prop.mesh.position.x;
        const dz = tornado.z - prop.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 4.6 || d < 0.05) return;
        const pull = (1 - d / 4.6) * 22;
        shove(prop, (dx / d) * pull + -dz * 8, 14, (dz / d) * pull + dx * 8);
      });
      if (tornado.life <= 0) {
        funnel.setEnabled(false);
        tornado.life = 0;
      }
    }

    if (blackout) {
      if (age > blackout.until) {
        blackout.covers.forEach((m) => m.dispose());
        blackout = null;
      } else {
        blackout.lights.forEach((L) => (L.intensity = 0));
        blackout.dims.forEach((m) => m.material.emissiveColor.set(0.012, 0.012, 0.016));
      }
    }
    if (alarm) {
      alarm.phase += dt * 14;
      if (age > alarm.until) alarm = null;
      else {
        const onLamp = Math.sin(alarm.phase) > 0;
        alarm.node.getChildMeshes(false).forEach((m) => {
          if (!m.material || !m.material.emissiveColor) return;
          if (!/^(hl|tl)/.test(m.name)) return;
          const k = onLamp ? 2.4 : 0.02;
          if (m.name.startsWith("hl")) m.material.emissiveColor.set(k, k * 0.95, k * 0.75);
          else m.material.emissiveColor.set(k, k * 0.08, k * 0.05);
        });
        beepAlarm();
      }
    }
    for (let i = scorches.length - 1; i >= 0; i--) {
      if (age > scorches[i].until) {
        scorches[i].mesh.dispose();
        scorches.splice(i, 1);
      }
    }

    const cam = world.camera;
    if (cam) {
      cam.alpha -= shaken.a;
      cam.beta -= shaken.b;
      shaken.a = (Math.random() - 0.5) * shake;
      shaken.b = (Math.random() - 0.5) * shake * 0.6;
      cam.alpha += shaken.a;
      cam.beta += shaken.b;
      shake = Math.max(0, shake - dt * 1.6);
    }

    const aim = on ? groundAim() : null;
    if (aim) placeReticle(aim);
    paintMeter();
  }

  const prev = world.update.bind(world);
  world.update = function (fr, dt, opts) {
    prev(fr, dt, opts);
    try {
      tick(dt);
    } catch (err) {
      console.error("[powers]", err);
    }
  };

  function pose() {
    if (mode() !== "control") return null;
    if (throwFor > 0) return "throw";
    if (keyStorm || touchStorm || wantStorm || charge > 0 || castFor > 0) return "cast";
    return null;
  }

  function now() {
    const g = gauge.now();
    const aim = mode() === "control" ? groundAim() : null;
    return {
      pressure: g.value,
      max: g.max,
      costs: g.costs,
      storming: storming(),
      called: localStorm,
      radius: cloudR,
      charging: wantStorm && !holdResolved,
      flash,
      aim: aim ? { x: aim.x, z: aim.z, y: aim.y } : null,
      strike: strike ? Object.assign({}, strike) : null,
      gust: gustFx ? { id: gustFx.id, pushes: gustFx.pushes, dirX: gustFx.dirX, dirZ: gustFx.dirZ, alive: gustMesh.isEnabled() } : null,
      tornado: tornado
        ? { x: tornado.x, z: tornado.z, axis: tornado.axis, dir: tornado.dir, life: tornado.life, travelled: Math.hypot(tornado.x - tornado.startX, tornado.z - tornado.startZ) }
        : null,
      blocked: blocked ? Object.assign({}, blocked) : null,
      blackout: blackout ? blackout.id : null,
      alarm: !!(alarm && age < alarm.until),
      props: propPositions(),
      localRain: localStorm,
    };
  }

  const api = {
    now,
    pose,
    command,
    hold(on) {
      wantStorm = !!on;
      return wantStorm;
    },
  };
  world.__powers = api;
  window.powers = api;
  if (day) day.powers = api;
  return api;
}

if (typeof window !== "undefined" && window.day && window.day.world && typeof document !== "undefined" && document.body) {
  const w = window.day.world();
  if (w) startPowers(w);
}
