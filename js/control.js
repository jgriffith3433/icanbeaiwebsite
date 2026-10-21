/* ==========================================================================
   Taking control: the player moves Small Weather in third person.

   "Take control" (or Enter, or a gamepad's Start) takes him off his day at that
   moment. The clock and the day keep going; he goes where the player says:
   WASD or the arrows, a gamepad's left stick, or the touch stick on a phone,
   Shift (a bumper, the stick pushed to its edge) to run, Space (A, the touch
   button) to jump and twice more in the air, held to ride the wind (glide).
   Updrafts (weather columns, or a Gust) lift him; the camera pulls back while
   he glides. "Let go" (or Esc, B) and he walks back, by the day's own routes,
   to where his day says he should be by now, then carries on.

   The lines and the feel are in day.config.js (`control`). He's drawn through
   world.avatar, the box-built stand-in; js/avatar.js says how a rigged GLB drops in.
   createMover() is the movement itself, without the page: npm test drives it too.
   ========================================================================== */

const TAU = Math.PI * 2;
const damp = (cur, target, dt, speed) => cur + (target - cur) * (1 - Math.exp(-speed * dt));
const dampAngle = (cur, target, dt, speed) => {
  const d = ((((target - cur + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return cur + d * (1 - Math.exp(-speed * dt));
};

export const MOVE_DEFAULTS = {
  walk: 2.4,
  sprint: 5.6,
  jumpHeight: 1.5,
  airJumps: 2,
  airJumpHeight: 1.2,
  gravity: 14.5,
  jumpSpeed: 6.8,
  airJumpSpeed: 6.4,
  maxFall: 9,
  floatFall: 1.6, // legacy slow fall (glide uses glideFall when riding)
  glideFall: 0.85, // hold jump in the air: ride the wind, fall this slowly
  glideSpeed: 9.5, // horizontal ride speed while gliding and steering
  airControl: 0.65,
  glideAirControl: 0.9,
  softLand: 2.4, // horizontal speed after a soft glide landing
  updraftCeiling: 22, // rooftop ceiling (~22m, just above the 16.6m rooftops)
};

/* ---------------- the movement (no page needed) ---------------- */
/* world: js/world.js's world (physics may be off: then he moves without colliders, on the floor).
   step(dt, input) moves him for the player; input = { x, z } (a world direction, length 0..1), sprint, jump
   (presses since the last step), hold (jump held). walkBack(dt, target) walks him to target = { x, z, room }
   by the day's routes; it says "walking", "arrived" or "too-far". */
export function createMover(world, cfg) {
  const B = window.BABYLON;
  const E = window.DayEngine;
  const M = Object.assign({}, MOVE_DEFAULTS, cfg.control && cfg.control.move);
  const H = 1.7; // capsule height
  const R = 0.28; // and radius
  const walkBackSpeed = Math.max(((cfg.person && cfg.person.walkSpeed) || 1.25) * 1.6, 1.6);
  const GRAV = new B.Vector3(0, -M.gravity, 0);
  const DOWN = new B.Vector3(0, -1, 0);
  const jumpVel = M.jumpSpeed || Math.sqrt(2 * M.gravity * M.jumpHeight);
  const airJumpVel = M.airJumpSpeed || Math.sqrt(2 * M.gravity * M.airJumpHeight);
  const s = {
    x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0,
    grounded: true, coyote: 0, airTime: 0, jumpsLeft: M.airJumps, jumps: 0, takeoffY: 0, peak: 0,
    floating: false, gliding: false, softLand: false, lift: 0, anim: "idle", speed: 0,
    flights: 0, lastFlight: null, // { jumps, height, soft?, glide? } of the last time he was in the air
  };
  let cc = null;
  let route = null; // the walk back: { path, i, room, catchUp }
  let updrafts = []; // { x, z, r, lift, until? } — ambient columns and player gusts
  let age = 0;
  const ray = new B.PhysicsRaycastResult();
  const physics = () => (world.physics && world.physics()) || null;

  function liftAt(x, z) {
    let best = 0;
    for (let i = 0; i < updrafts.length; i++) {
      const u = updrafts[i];
      if (u.until != null && age >= u.until) continue;
      const d = Math.hypot(x - u.x, z - u.z);
      if (d >= u.r) continue;
      const t = 1 - d / u.r;
      best = Math.max(best, u.lift * t * t);
    }
    return best;
  }

  const buildings = Object.values(cfg.buildings || {}).filter((b) => b.bounds);
  function guessFloor(x, z) {
    // without physics: the floors are 0.1 up inside a building, the ground is 0
    return buildings.some((b) => {
      const o = b.origin || [0, 0];
      return x >= b.bounds[0] + o[0] && x <= b.bounds[2] + o[0] && z >= b.bounds[1] + o[1] && z <= b.bounds[3] + o[1];
    }) ? 0.1 : 0;
  }
  /* The first surface straight down from (x, fromY, z), not counting him. */
  function floorAt(x, z, fromY) {
    const p = physics();
    if (!p) return guessFloor(x, z);
    p.plugin.raycast(new B.Vector3(x, fromY, z), new B.Vector3(x, -1, z), ray, cc ? { ignoreBody: cc._body } : undefined);
    return ray.hasHit ? ray.hitPoint.y : guessFloor(x, z);
  }
  /* Room to stand: nothing knee-high where his capsule would be. */
  function clear(x, z) {
    if (!physics()) return true;
    return [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]].every(([dx, dz]) => floorAt(x + dx, z + dz, 2.3) < 0.3);
  }
  function freeSpotNear(x, z) {
    if (clear(x, z)) return { x, z };
    for (const r of [0.45, 0.7, 1.0, 1.4, 1.9]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const px = x + Math.sin(a) * r;
        const pz = z + Math.cos(a) * r;
        if (clear(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }

  /* He's the player's from (x, z): if the day had him in a chair or in bed, he stands up beside it. */
  function start(x, z, yaw) {
    const p = freeSpotNear(x, z);
    s.x = p.x;
    s.z = p.z;
    s.y = floorAt(p.x, p.z, 2.3);
    s.yaw = yaw;
    s.vx = s.vy = s.vz = 0;
    s.grounded = true;
    s.jumpsLeft = M.airJumps;
    s.jumps = 0;
    s.anim = "idle";
    s.speed = 0;
    route = null;
    if (physics()) {
      const at = new B.Vector3(s.x, s.y + H / 2 + 0.02, s.z);
      if (!cc) {
        cc = new B.PhysicsCharacterController(at, { capsuleHeight: H, capsuleRadius: R }, world.scene);
        cc.maxStepHeight = 0.3; // the step up into the house, a curb
        cc.footOffset = H / 2;
      } else cc.setPosition(at);
      cc.setVelocity(B.Vector3.Zero());
    }
    return { x: s.x, z: s.z };
  }

  function sub(h, input, jumpPresses) {
    let support = null;
    let onGround;
    if (cc) {
      support = cc.checkSupport(h, DOWN);
      onGround = support.supportedState === B.CharacterSupportedState.SUPPORTED && s.vy <= 0.05;
    } else onGround = s.y <= guessFloor(s.x, s.z) + 1e-3 && s.vy <= 0.05;

    if (onGround) {
      if (!s.grounded && s.jumps) {
        s.lastFlight = {
          jumps: s.jumps,
          height: Math.round((s.peak - s.takeoffY) * 100) / 100,
          soft: !!s.gliding,
          glide: !!s.gliding,
        };
        s.flights++;
        if (s.gliding) {
          s.softLand = true;
          const hs = Math.hypot(s.vx, s.vz);
          if (hs > M.softLand) {
            const k = M.softLand / hs;
            s.vx *= k;
            s.vz *= k;
          }
        }
      }
      s.grounded = true;
      s.coyote = 0.12;
      s.airTime = 0;
      s.jumpsLeft = M.airJumps;
      s.jumps = 0;
    } else {
      if (s.grounded) s.takeoffY = s.y; // walked off an edge
      s.grounded = false;
      s.coyote = Math.max(0, s.coyote - h);
      s.airTime += h;
      s.softLand = false;
    }
    for (let j = 0; j < jumpPresses; j++) {
      if (s.grounded || s.coyote > 0) {
        s.vy = jumpVel;
        s.takeoffY = s.y;
        s.peak = s.y;
        s.jumps = 1;
        s.airTime = 0;
        s.grounded = false;
        s.coyote = 0;
        onGround = false;
      } else if (s.jumpsLeft > 0) {
        s.vy = Math.max(s.vy, 0) + airJumpVel * (s.vy > 0 ? 0.65 : 1);
        s.jumpsLeft--;
        s.jumps++;
      }
    }

    const ceiling = M.updraftCeiling || 22;
    const rawLift = onGround || !input.hold ? 0 : liftAt(s.x, s.z);
    const lift = rawLift > 0 && s.y < ceiling ? rawLift * Math.min(1, (ceiling - s.y) / 2.5) : 0;
    s.lift = lift;

    /* Storm-gliding engages when holding jump after (a) performing a mid-air jump,
       (b) passing the jump apex / airborne > 0.22s while holding Space, or (c) riding an updraft. */
    const canGlide = !onGround && !!input.hold && (s.jumpsLeft < M.airJumps || s.vy <= 0.5 || s.airTime > 0.22 || lift > 0.35);
    const ix = input.x || 0;
    const iz = input.z || 0;
    const steered = Math.hypot(ix, iz) > 0.1;
    // Do NOT auto-propel forward when gliding without directional input; only fly at glideSpeed when steering!
    const top = canGlide ? (steered ? M.glideSpeed : 0) : input.sprint ? M.sprint : M.walk;
    const wantX = steered ? ix * top : 0;
    const wantZ = steered ? iz * top : 0;
    const accel = onGround ? 14 : canGlide ? (steered ? 14 * M.glideAirControl : 4) : 14 * M.airControl;
    s.vx = damp(s.vx, wantX, h, accel);
    s.vz = damp(s.vz, wantZ, h, accel);

    if (onGround && s.vy <= 0) {
      s.vy = 0;
      s.floating = false;
      s.gliding = false;
    } else {
      if (lift > 0.35) {
        // lift is m/s upward at the column centre: climb at that rate up to ceiling
        s.vy = Math.max(s.vy, lift);
      } else {
        s.vy -= M.gravity * h;
      }
      s.floating = canGlide && (s.vy <= 0.5 || lift > 0.35);
      s.gliding = canGlide;
      const fallCap = s.floating ? -M.glideFall : -M.maxFall;
      s.vy = Math.max(s.vy, fallCap);
    }

    const x0 = s.x;
    const z0 = s.z;
    if (cc) {
      if (lift > 0.35) {
        // Kinematic climb: Havok's character integrate fights a sustained updraft, so move him ourselves.
        s.x += s.vx * h;
        s.z += s.vz * h;
        s.y += s.vy * h;
        cc.setPosition(new B.Vector3(s.x, s.y + H / 2, s.z));
        cc.setVelocity(new B.Vector3(s.vx, s.vy, s.vz));
      } else {
        cc.setVelocity(new B.Vector3(s.vx, s.vy, s.vz));
        cc.integrate(h, support, GRAV);
        const p = cc.getPosition();
        const v = cc.getVelocity();
        s.x = p.x;
        s.y = p.y - H / 2;
        s.z = p.z;
        if (s.vy > 0 && v.y < s.vy - 0.5) s.vy = Math.max(0, v.y); // bumped his head
      }
    } else {
      s.x += s.vx * h;
      s.z += s.vz * h;
      s.y = Math.max(guessFloor(s.x, s.z), s.y + s.vy * h);
    }
    s.peak = Math.max(s.peak, s.y);
    return Math.hypot(s.x - x0, s.z - z0) / h;
  }

  function pickAnim(speed) {
    if (!s.grounded) return s.vy > 0.4 && !s.gliding ? "jump" : s.floating || s.gliding ? "float" : "fall";
    if (speed < 0.25) return "idle";
    return speed > (M.walk + M.sprint) / 2 ? "run" : "walk";
  }

  function step(dt, input) {
    age += dt;
    if (updrafts.length) updrafts = updrafts.filter((u) => u.until == null || age < u.until);
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    let speed = 0;
    for (let i = 0; i < n; i++) speed += sub(dt / n, input, i === 0 ? input.jump || 0 : 0) / n;
    s.speed = damp(s.speed, speed, dt, 10);
    if (Math.hypot(input.x || 0, input.z || 0) > 0.1) s.yaw = dampAngle(s.yaw, Math.atan2(input.x, input.z), dt, 12);
    s.anim = pickAnim(s.speed);
    return s;
  }

  /* ---------- the walk back to his day ---------- */
  function planBack(target) {
    const here = E.roomAt(world.rooms, s.x, s.z);
    const far = Math.hypot(target.x - s.x, target.z - s.z);
    const sameBuilding = here && target.room && world.rooms[here] && world.rooms[target.room] && world.rooms[here].building === world.rooms[target.room].building;
    route = { path: E.route(world.rooms, { x: s.x, z: s.z, room: here }, target), i: 1, room: target.room, catchUp: !!target.inCar || (!sameBuilding && far > 40) };
  }
  function walkBack(dt, target) {
    if (!route || route.room !== target.room) planBack(target);
    if (route.catchUp || target.inCar) return "too-far";
    // the day may be walking him somewhere itself: the last point follows it
    route.path[route.path.length - 1] = { x: target.x, z: target.z };
    let left = walkBackSpeed * dt;
    let moved = 0;
    while (left > 1e-6 && route.i < route.path.length) {
      const p = route.path[route.i];
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) {
        route.i++;
        continue;
      }
      const go = Math.min(d, left);
      s.x += (dx / d) * go;
      s.z += (dz / d) * go;
      s.yaw = dampAngle(s.yaw, Math.atan2(dx, dz), dt, 10);
      left -= go;
      moved += go;
      if (go >= d - 1e-6) route.i++;
    }
    // down off whatever he was standing on, gently; never up onto furniture (the ray starts inside it)
    let floor = floorAt(s.x, s.z, s.y + 0.35);
    if (floor > s.y + 0.3) floor = s.y;
    s.vy = s.y > floor + 0.01 ? Math.max(-M.maxFall, s.vy - M.gravity * dt) : 0;
    s.y = Math.max(floor, s.y + s.vy * dt);
    s.grounded = s.y <= floor + 0.01;
    s.speed = moved / Math.max(dt, 1e-6);
    s.anim = s.grounded ? (s.speed > 0.2 ? "walk" : "idle") : "fall";
    const there = Math.hypot(target.x - s.x, target.z - s.z) < 0.02 && route.i >= route.path.length;
    if (there) route = null;
    return there ? "arrived" : "walking";
  }

  return {
    state: s,
    move: M,
    start,
    step,
    walkBack,
    walkBackSpeed,
    route: () => route,
    hasPhysics: () => !!cc,
    /** Replace ambient + lasting columns. Player gusts use spawnUpdraft. */
    setUpdrafts(list) {
      updrafts = (list || []).map((u) => ({
        x: u.x,
        z: u.z,
        r: u.r != null ? u.r : 4.2,
        lift: u.lift != null ? u.lift : 6,
        until: u.until,
        kind: u.kind || "ambient",
      }));
    },
    spawnUpdraft(x, z, opt) {
      const o = opt || {};
      const life = o.life != null ? o.life : 7;
      const draft = {
        x,
        z,
        r: o.r != null ? o.r : 4.2,
        lift: o.lift != null ? o.lift : 8,
        until: age + life,
        kind: o.kind || "gust",
      };
      updrafts.push(draft);
      return draft;
    },
    updrafts: () => updrafts.slice(),
    age: () => age,
    stop() {
      route = null;
    },
  };
}

/* ---------------- the page: buttons, keys, gamepad, touch, camera ---------------- */
function install() {
  const B = window.BABYLON;
  const cfg = window.DAY_CONFIG;
  const day = window.day;
  const world = day.world();
  if (!world || !world.avatar || !day.pilot) return;
  const C = cfg.control || {};
  const L = Object.assign({
    take: "You take over. His day keeps going without him.",
    steering: ["You have him."],
    letGo: "You let go. He walks back to his day.",
    back: "Back where his day says. He carries on.",
    catchUp: "He catches up with his day.",
    driving: "He's driving.",
  }, C.lines);
  const steeringLines = [].concat(L.steering);
  const mover = createMover(world, cfg);
  const s = mover.state;
  let avatar = world.avatar;
  let mode = "schedule"; // schedule | control | returning
  let since = 0; // seconds in this mode
  let catchUpAt = 0;
  let lastFrame = null;
  const log = []; // what happened, for the playtest: { t, what }
  const mark = (what, detail) => {
    log.push({ t: performance.now(), what, detail });
    if (log.length > 50) log.shift();
    window.dispatchEvent(new CustomEvent("day:control", { detail: { action: what, ...(detail || {}) } }));
  };

  /* ---------- the page's pieces ---------- */
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "control";
  btn.className = "control-btn";
  const hint = document.createElement("p");
  hint.className = "control-hint";
  hint.textContent = "WASD or arrows to move · Shift to run · Space to jump (three times, hold in the air to glide) · drag to look · hold F for a storm, E lightning, G a gust (and an updraft), T a tornado · 1–7 or hold Q for the weather · Esc to let go";
  const pad = document.createElement("div");
  pad.className = "touchpad";
  pad.hidden = true;
  pad.innerHTML = `<div class="stick" id="stick" aria-label="Move"><i></i></div><button type="button" class="jump" id="jump-btn">Jump</button>`;
  document.body.append(btn, hint, pad);
  const stickEl = pad.querySelector(".stick");
  const knob = stickEl.querySelector("i");
  const jumpBtn = pad.querySelector(".jump");

  let forcedTouch = /[?&]touch=1\b/.test(location.search);
  const touchMode = () => forcedTouch || window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 700;

  function syncUi() {
    const fr = lastFrame;
    const driving = mode === "schedule" && fr && fr.person.inCar;
    btn.textContent = mode === "schedule" ? "Take control" : mode === "control" ? "Let go" : "Walking back…";
    btn.disabled = !!driving || mode === "returning";
    btn.title = driving ? L.driving : mode === "schedule" ? "Take control (Enter)" : mode === "control" ? "Let go (Esc)" : "";
    btn.setAttribute("aria-pressed", mode === "control" ? "true" : "false");
    document.documentElement.classList.toggle("in-control", mode === "control");
    document.documentElement.classList.toggle("touch-ui", touchMode());
    pad.hidden = !(mode === "control" && touchMode());
    hint.hidden = !(mode === "control" && !touchMode());
  }
  let lastDriving = null;

  btn.addEventListener("click", (e) => {
    const via = e.pointerType === "touch" || touchMode() ? "touch" : e.detail === 0 ? "key" : "button";
    if (mode === "schedule") take(via);
    else if (mode === "control") letGo(via);
    btn.blur(); // Space and Enter belong to him now, not to the button
  });

  /* ---------- the camera ---------- */
  const camera = world.camera;
  const kb = camera.inputs.attached.keyboard;
  const saved = {};
  let wantRadius = 5.5;
  let lastRadius = null;
  let glidePull = 0;
  const camRay = new B.PhysicsRaycastResult();
  const RIDE = Object.assign({
    cameraPull: 3.4,
    whoosh: "audio/sfx/glide-whoosh.mp3",
    trails: true,
    updraft: { radius: 4.2, lift: 8, life: 7, ambient: true, weather: { clear: 0.08, clouds: 0.15, rain: 0.35, storm: 1, fog: 0.1, wind: 0.92, snow: 0.2 } },
  }, C.ride || {});
  const UD = Object.assign({ radius: 4.2, lift: 8, life: 7, ambient: true, weather: {} }, RIDE.updraft || {});
  function cameraTake() {
    ["lowerRadiusLimit", "upperRadiusLimit", "lowerBetaLimit", "upperBetaLimit"].forEach((k) => (saved[k] = camera[k]));
    if (kb) ["keysUp", "keysDown", "keysLeft", "keysRight"].forEach((k) => ((saved[k] = kb[k]), (kb[k] = [])));
    camera.lowerRadiusLimit = 1.2;
    camera.upperRadiusLimit = 16;
    camera.lowerBetaLimit = 0.25;
    camera.upperBetaLimit = 1.62;
    wantRadius = Math.max(3.5, Math.min(6.5, camera.radius));
    camera.beta = Math.min(camera.beta, 1.3);
    lastRadius = null;
    glidePull = 0;
  }
  function cameraGive() {
    ["lowerRadiusLimit", "upperRadiusLimit", "lowerBetaLimit", "upperBetaLimit"].forEach((k) => (camera[k] = saved[k]));
    if (kb) ["keysUp", "keysDown", "keysLeft", "keysRight"].forEach((k) => (kb[k] = saved[k] || kb[k]));
    glidePull = 0;
  }
  function cameraFollow(dt, look) {
    // the player's zoom (wheel, pinch) since the last frame is what they want; walls only ever shorten it
    if (lastRadius != null && Math.abs(camera.radius - lastRadius) > 1e-3) wantRadius = Math.max(1.5, Math.min(16, camera.radius - glidePull));
    camera.alpha -= look.x * 2.4 * dt;
    camera.beta = Math.max(camera.lowerBetaLimit, Math.min(camera.upperBetaLimit, camera.beta - look.y * 1.5 * dt));
    const t = camera.target;
    t.x = damp(t.x, s.x, dt, 14);
    t.z = damp(t.z, s.z, dt, 14);
    t.y = damp(t.y, s.y + 1.35, dt, s.grounded ? 10 : 4);
    const pullWant = s.gliding ? (RIDE.cameraPull || 3.4) : 0;
    glidePull = damp(glidePull, pullWant, dt, 2.4);
    let r = wantRadius + glidePull;
    const p = world.physics && world.physics();
    if (p) {
      const dir = new B.Vector3(Math.cos(camera.alpha) * Math.sin(camera.beta), Math.cos(camera.beta), Math.sin(camera.alpha) * Math.sin(camera.beta));
      const from = t.add(dir.scale(0.45)); // outside his own capsule
      p.plugin.raycast(from, t.add(dir.scale(r + 0.3)), camRay);
      if (camRay.hasHit) r = Math.max(1.2, B.Vector3.Distance(t, camRay.hitPoint) - 0.3);
    }
    camera.radius = r < camera.radius ? r : damp(camera.radius, r, dt, 3);
    lastRadius = camera.radius;
  }

  /* ---------- wind trails + whoosh while he glides ---------- */
  const trailRoot = new B.TransformNode("glide-trails", world.scene);
  let trailPs = null;
  let wasGliding = false;
  let whooshAt = 0;
  let trailCount = 0;
  if (RIDE.trails !== false) {
    try {
      const ps = new B.ParticleSystem("glide-wind", 280, world.scene);
      ps.particleTexture = new B.Texture("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", world.scene, false, false, B.Texture.NEAREST_SAMPLINGMODE);
      ps.emitter = trailRoot;
      ps.minEmitBox = new B.Vector3(-0.35, 0.4, -0.2);
      ps.maxEmitBox = new B.Vector3(0.35, 1.4, 0.2);
      ps.color1 = new B.Color4(0.72, 0.86, 1, 0.55);
      ps.color2 = new B.Color4(0.45, 0.7, 1, 0.2);
      ps.colorDead = new B.Color4(0.3, 0.5, 0.8, 0);
      ps.minSize = 0.08;
      ps.maxSize = 0.28;
      ps.minLifeTime = 0.25;
      ps.maxLifeTime = 0.55;
      ps.emitRate = 0;
      ps.blendMode = B.ParticleSystem.BLENDMODE_ADD;
      ps.direction1 = new B.Vector3(-1.2, -0.2, -2.5);
      ps.direction2 = new B.Vector3(1.2, 0.4, -0.8);
      ps.minEmitPower = 3;
      ps.maxEmitPower = 7;
      ps.updateSpeed = 0.02;
      ps.gravity = new B.Vector3(0, -0.4, 0);
      ps.billboardMode = B.ParticleSystem.BILLBOARDMODE_STRETCHED;
      ps.start();
      trailPs = ps;
    } catch (err) {
      trailPs = null;
    }
  }
  function playWhoosh() {
    const score = day.score;
    if (score && score.whoosh) return score.whoosh();
    // fallback: reuse wind amb buffer via score.crack-style unlock path is fine; else silent
    return false;
  }
  function tickGlideFx(dt) {
    trailRoot.position.set(s.x, s.y, s.z);
    trailRoot.rotation.y = s.yaw;
    const on = !!s.gliding;
    if (trailPs) {
      trailPs.emitRate = on ? 90 + Math.min(80, s.speed * 6) : 0;
      trailCount = trailPs.getActiveCount ? trailPs.getActiveCount() : on ? 40 : 0;
    } else trailCount = on ? 1 : 0;
    if (on && !wasGliding) {
      playWhoosh();
      whooshAt = performance.now();
      mark("glide", { via: "hold", y: Math.round(s.y * 100) / 100, speed: Math.round(s.speed * 100) / 100 });
    }
    if (!on && wasGliding && s.softLand) mark("soft-land", { y: Math.round(s.y * 100) / 100 });
    wasGliding = on;
  }

  /* Ambient updraft columns at avenue × cross (only active in wind / storm / rain). */
  function weatherLiftScale() {
    const w = (window.weather && window.weather.now && window.weather.now()) || { state: "clear" };
    const table = UD.weather || {};
    if (table[w.state] != null) return table[w.state] * (w.intensity != null ? 0.7 + 0.3 * w.intensity : 1);
    if (w.state === "storm") return 1;
    if (w.state === "wind") return 0.92;
    if (w.state === "rain") return 0.25;
    return 0;
  }
  function refreshAmbientUpdrafts() {
    if (UD.ambient === false) return;
    const city = cfg.city || {};
    const avenues = city.avenues || (cfg.street ? [cfg.street] : []);
    const crosses = city.crosses || [];
    const scale = weatherLiftScale();
    const base = (UD.lift != null ? UD.lift : 8) * 0.85;
    const list = [];
    if (scale > 0.01) {
      avenues.forEach((av) => {
        crosses.forEach((cr) => {
          if (cr.x < (av.from != null ? av.from : -1e9) || cr.x > (av.to != null ? av.to : 1e9)) return;
          if (av.z < (cr.from != null ? cr.from : -1e9) || av.z > (cr.to != null ? cr.to : 1e9)) return;
          list.push({ x: cr.x, z: av.z, r: UD.radius || 4.2, lift: base * scale, kind: "ambient" });
        });
      });
    }
    // Keep player-spawned gust columns.
    const kept = mover.updrafts().filter((u) => u.kind === "gust");
    mover.setUpdrafts(list.concat(kept));
  }
  let ambientAge = 0;

  /* ---------- input ---------- */
  const keys = new Set();
  let jumps = 0; // presses since the last frame
  const stick = { x: 0, y: 0, id: null };
  let touchJumpHeld = false;
  const KEY = {
    w: "f", arrowup: "f", s: "b", arrowdown: "b", a: "l", arrowleft: "l", d: "r", arrowright: "r",
    shift: "run", " ": "jump", spacebar: "jump",
  };
  const keyOf = (e) => KEY[(e.key || "").toLowerCase()] || (e.code === "Space" ? "jump" : null);
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.target && e.target.tagName === "INPUT" && e.target.type !== "range") return;
      if (mode === "schedule") {
        if (e.key === "Enter" && !(e.target && (e.target.tagName === "BUTTON" || e.target.tagName === "A")) && !btn.disabled) {
          take("key");
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (mode !== "control") return;
      if (e.key === "Escape") {
        letGo("key");
      } else {
        const k = keyOf(e);
        if (!k) {
          if (e.key === "Enter") e.preventDefault();
          return; // speeds, H and the rest still work
        }
        if (k === "jump" && !e.repeat) jumps++;
        keys.add(k);
        if (e.shiftKey) keys.add("run");
      }
      e.preventDefault();
      e.stopImmediatePropagation(); // not the day's keys (← → step through time, Space pauses, Esc goes live)
    },
    true
  );
  window.addEventListener(
    "keyup",
    (e) => {
      const k = keyOf(e);
      if (k) keys.delete(k);
      if (!e.shiftKey) keys.delete("run");
    },
    true
  );
  window.addEventListener("blur", () => keys.clear());

  // The touch stick: drag from its middle; to the edge runs.
  const STICK_R = 52;
  function stickMove(e) {
    const r = stickEl.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / STICK_R;
    let dy = (e.clientY - (r.top + r.height / 2)) / STICK_R;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    stick.x = dx;
    stick.y = dy;
    knob.style.transform = `translate(${dx * STICK_R}px, ${dy * STICK_R}px)`;
  }
  function stickEnd(e) {
    if (e.pointerId !== stick.id) return;
    stick.id = null;
    stick.x = stick.y = 0;
    knob.style.transform = "";
    stickEl.classList.remove("held");
  }
  stickEl.addEventListener("pointerdown", (e) => {
    stick.id = e.pointerId;
    stickEl.classList.add("held");
    try {
      stickEl.setPointerCapture(e.pointerId);
    } catch (err) {}
    stickMove(e);
    e.preventDefault();
  });
  window.addEventListener("pointermove", (e) => e.pointerId === stick.id && stickMove(e));
  window.addEventListener("pointerup", stickEnd);
  window.addEventListener("pointercancel", stickEnd);
  jumpBtn.addEventListener("pointerdown", (e) => {
    jumps++;
    touchJumpHeld = true;
    jumpBtn.classList.add("held");
    e.preventDefault();
  });
  const jumpUp = () => {
    touchJumpHeld = false;
    jumpBtn.classList.remove("held");
  };
  jumpBtn.addEventListener("pointerup", jumpUp);
  jumpBtn.addEventListener("pointerleave", jumpUp);
  jumpBtn.addEventListener("pointercancel", jumpUp);

  // Gamepads: left stick moves, right stick looks, A jumps, a bumper or L3 runs, Start takes/lets go, B lets go.
  const padPrev = {};
  function readGamepad() {
    const out = { x: 0, y: 0, lx: 0, ly: 0, run: false, jump: 0, hold: false };
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    for (const g of pads) {
      if (!g || !g.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      const pressed = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
      const edge = (i) => {
        const was = padPrev[g.index + ":" + i];
        const now = pressed(i);
        padPrev[g.index + ":" + i] = now;
        return now && !was;
      };
      out.x += dz(g.axes[0] || 0);
      out.y += dz(g.axes[1] || 0);
      out.lx += dz(g.axes[2] || 0);
      out.ly += dz(g.axes[3] || 0);
      out.run = out.run || pressed(4) || pressed(5) || pressed(10);
      if (edge(0)) out.jump++;
      out.hold = out.hold || pressed(0);
      if (edge(9)) {
        if (mode === "schedule" && !btn.disabled) take("gamepad");
        else if (mode === "control") letGo("gamepad");
      }
      if (edge(1) && mode === "control") letGo("gamepad");
    }
    return out;
  }

  function readInput(gp) {
    // forward/right from the camera, flat on the ground
    const fx = -Math.cos(camera.alpha);
    const fz = -Math.sin(camera.alpha);
    let f = (keys.has("f") ? 1 : 0) - (keys.has("b") ? 1 : 0) - stick.y - gp.y;
    let r = (keys.has("r") ? 1 : 0) - (keys.has("l") ? 1 : 0) + stick.x + gp.x;
    const m = Math.hypot(f, r);
    if (m > 1) {
      f /= m;
      r /= m;
    }
    const sprint = keys.has("run") || gp.run || Math.hypot(stick.x, stick.y) > 0.92;
    const input = { x: fx * f + fz * r, z: fz * f - fx * r, sprint, jump: jumps + gp.jump, hold: keys.has("jump") || touchJumpHeld || gp.hold };
    jumps = 0;
    return input;
  }

  /* ---------- taking and giving back ---------- */
  function take(via) {
    const fr = lastFrame || day.now().frame;
    if (mode !== "schedule" || !fr || fr.person.inCar) return false;
    if (day.now().mode === "pause") {
      const play = document.getElementById("play");
      if (play) play.click(); // the clock keeps running while he's the player's
    }
    const at = mover.start(fr.person.x, fr.person.z, world.person.rotation.y);
    mode = "control";
    since = 0;
    keys.clear();
    jumps = 0;
    cameraTake();
    refreshAmbientUpdrafts();
    ambientAge = 0;
    wasGliding = false;
    day.note(L.take);
    mark("take", { via, at: `${at.x.toFixed(2)},${at.z.toFixed(2)}`, physics: mover.hasPhysics() });
    syncUi();
    return true;
  }
  function letGo(via) {
    if (mode !== "control") return false;
    mode = "returning";
    since = 0;
    catchUpAt = 0;
    keys.clear();
    stick.x = stick.y = 0;
    day.note(L.letGo);
    mark("let-go", { via });
    syncUi();
    return true;
  }
  function backOnDay(how) {
    mode = "schedule";
    mover.stop();
    if (avatar !== world.avatar) {
      avatar.show(false);
      world.avatar.show(true);
    }
    cameraGive();
    document.documentElement.classList.remove("catching-up");
    day.note(how === "catch-up" ? L.catchUp : L.back);
    mark("back", { how });
    syncUi();
  }

  /* ---------- every frame (main.js calls this before drawing) ---------- */
  day.pilot((fr, dt) => {
    lastFrame = fr;
    const driving = !!(fr && fr.person.inCar);
    if (driving !== lastDriving) {
      lastDriving = driving;
      syncUi();
    }
    const gp = readGamepad();
    if (mode === "schedule") return null;
    since += dt;
    let text;
    if (mode === "control") {
      ambientAge += dt;
      if (ambientAge > 0.45) {
        ambientAge = 0;
        refreshAmbientUpdrafts();
      }
      mover.step(dt, readInput(gp));
      tickGlideFx(dt);
      text = steeringLines[Math.floor(since / 9) % steeringLines.length];
    } else {
      const target = { x: fr.person.x, z: fr.person.z, room: fr.room, inCar: fr.person.inCar };
      const r = catchUpAt ? "too-far" : mover.walkBack(dt, target);
      if (r === "arrived") {
        backOnDay("walk");
        return null;
      }
      if (r === "too-far" || since > 60) {
        // the day has him somewhere he can't walk to now (driving, the other building): a quick fade
        if (!catchUpAt) {
          catchUpAt = since;
          document.documentElement.classList.add("catching-up");
        }
        if (since - catchUpAt > 0.45) {
          backOnDay("catch-up");
          return null;
        }
      }
      text = L.letGo;
    }
    if (avatar !== world.avatar) {
      world.avatar.show(false);
      avatar.show(true);
    }
    avatar.place(s.x, s.y, s.z, s.yaw);
    // cast / throw while a power is in his hands (js/powers.js); the walk pose otherwise
    const posed = day.powers && day.powers.pose ? day.powers.pose() : null;
    avatar.play(posed || s.anim, posed ? 1 : s.speed, dt);
    cameraFollow(dt, { x: gp.lx, y: gp.ly });
    return { x: s.x, y: s.y, z: s.z, yaw: s.yaw, speed: s.speed, anim: posed || s.anim, text };
  });

  syncUi();
  window.addEventListener("resize", syncUi);

  /* for the console and the playtest (js/playtest.js): reading, plus one setup shortcut (the phone's controls) */
  day.control = {
    mode: () => mode,
    state: () => ({
      mode, x: s.x, y: s.y, z: s.z, yaw: s.yaw, speed: s.speed, anim: s.anim, grounded: s.grounded, jumps: s.jumps,
      flights: s.flights, lastFlight: s.lastFlight, floating: s.floating, gliding: s.gliding, softLand: s.softLand,
      lift: s.lift, trails: trailCount, whooshAt, physics: mover.hasPhysics(), touch: touchMode(),
      route: mover.route() ? mover.route().path.length : 0,
      updrafts: mover.updrafts().length,
      cameraPull: Math.round(glidePull * 100) / 100,
    }),
    move: mover.move,
    ride: RIDE,
    log: () => log.slice(),
    take: () => take("console"),
    letGo: () => letGo("console"),
    spawnUpdraft: (x, z, opt) => {
      const d = mover.spawnUpdraft(x != null ? x : s.x, z != null ? z : s.z, Object.assign({
        r: UD.radius, lift: UD.lift, life: UD.life, kind: "gust",
      }, opt || {}));
      mark("updraft", { x: d.x, z: d.z, lift: d.lift, kind: d.kind });
      return d;
    },
    updrafts: () => mover.updrafts(),
    refreshUpdrafts: refreshAmbientUpdrafts,
    touch: (on) => {
      forcedTouch = on !== false;
      syncUi();
      return touchMode();
    },
    /* the rigged model, when it comes (js/avatar.js). The day's own figure (world.avatar) is hidden while he's the player's. */
    setAvatar(a) {
      avatar = a || world.avatar;
      avatar.show(mode !== "schedule");
    },
  };
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined" && document.body) install();
