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

/* A turn never exceeds this (deg/s): a reversal of the stick used to swing his heading ~1900 deg/s in one frame. */
export const TURN_MAX_DEG = 600;
const wrapAng = (d) => ((((d + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const turnToward = (cur, target, dt, speed, maxDeg) => {
  const d = wrapAng(target - cur);
  const step = d * (1 - Math.exp(-speed * dt));
  const cap = (maxDeg * Math.PI / 180) * dt;
  return cur + Math.max(-cap, Math.min(cap, step));
};
/* The turn-in-place before a cast: 600 deg/s, so 90 deg takes 0.15 s and 180 deg 0.3 s. */
export const turnSeconds = (deg) => Math.min(0.3, Math.max(0.15, Math.abs(deg) / TURN_MAX_DEG));

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
  const R = 0.36; // and radius: wide enough that his shoulders and swinging arms stay off furniture (0.28 let them sink into the dresser/TV and armchair)
  const STEP_DOWN = 0.45; // the deepest drop he steps down without leaving the ground (stairs, ramps, kerbs)
  const walkBackSpeed = Math.max(((cfg.person && cfg.person.walkSpeed) || 1.25) * 1.6, 1.6);
  const GRAV = new B.Vector3(0, -M.gravity, 0);
  const DOWN = new B.Vector3(0, -1, 0);
  const jumpVel = M.jumpSpeed || Math.sqrt(2 * M.gravity * M.jumpHeight);
  const airJumpVel = M.airJumpSpeed || Math.sqrt(2 * M.gravity * M.airJumpHeight);
  const s = {
    x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0,
    grounded: true, coyote: 0, airTime: 0, jumpsLeft: M.airJumps, jumps: 0, takeoffY: 0, peak: 0,
    floating: false, gliding: false, softLand: false, lift: 0, anim: "idle", speed: 0,
    jumpId: 0, landId: 0, landDrop: 0, // counters the skin and the camera read: each take-off press, each touchdown and how far it fell
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
  function start(x, z, yaw, from) {
    // `from` (a roof's height + a little): stand on whatever is under that height, not the street (the opening's roof)
    const p = from != null ? { x, z } : freeSpotNear(x, z);
    s.x = p.x;
    s.z = p.z;
    s.y = floorAt(p.x, p.z, from != null ? from : 2.3);
    s.yaw = yaw;
    s.face = null;
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
    // Down a stair or a ramp he walks off a ledge lower than a step every few centimetres: keep his feet on it (it used
    // to read as a hop and a "fall" pose on 3 frames in 4 of every descent). A real drop, or a jump, still falls.
    if (cc && !onGround && s.grounded && !jumpPresses && s.vy <= 0.05) {
      const f = floorAt(s.x, s.z, s.y + 0.3);
      const drop = s.y - f;
      if (drop > -0.05 && drop < STEP_DOWN) {
        s.y = f;
        s.vy = 0;
        cc.setPosition(new B.Vector3(s.x, f + H / 2 + 0.01, s.z));
        support = cc.checkSupport(h, DOWN);
        onGround = true;
        s.snaps = (s.snaps || 0) + 1;
      }
    }

    if (onGround) {
      if (!s.grounded && s.airTime > 0.08) { s.landId++; s.landDrop = Math.max(0, s.peak - s.y); }
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
      if (s.grounded) { s.takeoffY = s.y; s.peak = s.y; } // walked off an edge
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
        s.jumpId++;
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
    // a moment off the ground without a jump (a kerb, the edge of a step) keeps the walk: "fall" only once it's a fall
    if (!s.grounded && !s.jumps && !s.gliding && s.airTime < 0.15 && (s.anim === "walk" || s.anim === "run" || s.anim === "idle")) return s.anim;
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
    if (Math.hypot(input.x || 0, input.z || 0) > 0.1) {
      s.yaw = turnToward(s.yaw, Math.atan2(input.x, input.z), dt, 12, TURN_MAX_DEG);
      s.face = null;
    } else if (s.face) {
      // turn in place toward the cast (linear: the rate is the cap, never a snap)
      const f = s.face;
      f.t = Math.min(f.dur, f.t + dt);
      s.yaw = f.from + f.d * (f.t / f.dur);
      if (f.t >= f.dur) s.face = null;
    }
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
      s.yaw = turnToward(s.yaw, Math.atan2(dx, dz), dt, 10, TURN_MAX_DEG);
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
    /* Turn in place to face `yaw` (a cast's aim): linear at TURN_MAX_DEG, 0.15-0.3 s. Returns { deg, dur, step } (step: over 90 deg). */
    face(yaw) {
      const d = wrapAng(yaw - s.yaw);
      const deg = Math.abs(d) * 180 / Math.PI;
      if (deg < 4) { s.face = null; return { deg, dur: 0, step: false }; }
      const dur = turnSeconds(deg);
      s.face = { from: s.yaw, d, t: 0, dur, step: deg > 90 };
      return { deg, dur, step: deg > 90 };
    },
    walkBack,
    walkBackSpeed,
    route: () => route,
    hasPhysics: () => !!cc,
    /** Height of the first surface straight down from (x, fromY, z), not counting him. */
    floorAt,
    /** Raycast query for anything that isn't him: his own capsule is a body too, and the camera's rays must not hit it. */
    rayQuery: () => (cc ? { ignoreBody: cc._body } : undefined),
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
  hint.textContent = "WASD or arrows to move · Shift to run · Space to jump (three times, hold in the air to glide) · drag to look · E Lightning (hold for Storm), R Rain, V Wind (tap Gust, hold Gale, full Tornado), C Fog, X Sun · Esc to let go";
  const HINT_KEYS = hint.textContent;
  const HINT_TOUCH = "Left stick: move · Jump · five verbs on the right (Lightning, Rain, Wind, Fog, Sun) · tap the street to aim · drag the right side to look";
  const HINT_SEEN_KEY = "icanbe.controlHint";
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
    hint.textContent = touchMode() ? HINT_TOUCH : HINT_KEYS;
    let hintSeen = false;
    try { hintSeen = localStorage.getItem(HINT_SEEN_KEY) === "1"; } catch (e) { /* private */ }
    hint.hidden = mode !== "control" || hintSeen;
    if (mode === "control" && !hintSeen) {
      hint.classList.add("hint-once");
      clearTimeout(hint._fade);
      hint._fade = setTimeout(() => {
        hint.classList.add("hint-faded");
        try { localStorage.setItem(HINT_SEEN_KEY, "1"); } catch (e) { /* private */ }
      }, 5500);
    }
  }
  let lastDriving = null;
  // The hint is a first-time pill: once he has cast anything it has done its job, so it goes away for good.
  window.addEventListener("day:power", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "denied" || d.action === "unlock") return;
    hint.classList.add("hint-faded");
    hint.hidden = true;
    clearTimeout(hint._fade);
    try { localStorage.setItem(HINT_SEEN_KEY, "1"); } catch (err) { /* private */ }
  });

  // Touch acts on pointerdown/up, not on the click that follows (a click can lag or never come): the press takes control at once,
  // and the click that follows the same tap is swallowed so it doesn't let go again.
  let touchActed = 0;
  const pressBtn = (via) => {
    if (btn.disabled) return;
    if (mode === "schedule") take(via);
    else if (mode === "control") letGo(via);
    btn.blur(); // Space and Enter belong to him now, not to the button
  };
  btn.style.touchAction = "manipulation";
  btn.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    btn.classList.add("pressed");
  });
  btn.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    btn.classList.remove("pressed");
    touchActed = performance.now();
    pressBtn("touch");
  });
  btn.addEventListener("pointercancel", () => btn.classList.remove("pressed"));
  btn.addEventListener("click", (e) => {
    if (performance.now() - touchActed < 800) return; // the click of a tap already handled on pointerup
    pressBtn(e.pointerType === "touch" || touchMode() ? "touch" : e.detail === 0 ? "key" : "button");
  });

  /* ---------- the camera ---------- */
  const camera = world.camera;
  const kb = camera.inputs.attached.keyboard;
  const saved = {};
  let wantRadius = 5.5;
  let lastRadius = null;
  let glidePull = 0;
  let screenLift = 0; // metres (view space) the orbit target is shifted up on screen, clear of the HUD along the bottom
  let hudTop = null; // CSS px: top of the lowest-centre HUD piece he would hide behind (hint, Let go, ability bar)
  let hudAt = 0;
  const camRay = new B.PhysicsRaycastResult();
  const CAM_LIFT = 1.4; // least height of the camera over the surface under it
  const RIDE = Object.assign({
    cameraPull: 3.4,
    whoosh: "audio/sfx/glide-whoosh.mp3",
    trails: true,
    updraft: { radius: 4.2, lift: 8, life: 7, ambient: true, weather: { clear: 0.08, clouds: 0.15, rain: 0.35, storm: 1, fog: 0.1, wind: 0.92, snow: 0.2 } },
  }, C.ride || {});
  const UD = Object.assign({ radius: 4.2, lift: 8, life: 7, ambient: true, weather: {} }, RIDE.updraft || {});
  /* The third-person camera (rewritten): a critically damped spring follows him (with a look-ahead when he runs), the yaw is
     capped (CAM.yawCapDeg), a sphere cast against the buildings, roofs and stair huts pulls it in before it can enter
     geometry and eases it out after, every cast frames him and where it lands for about 1.6 s, and taking control blends
     over CAM.blendSecs from the watch camera. Touch: a one-finger drag on the right half looks, and it recentres behind him
     after CAM.recenterAfter s of no look input. The numbers are in day.config.js control.camera (CAM below). */
  const CAM = Object.assign({
    yawCapDeg: 150, // the most the camera turns about its axis per second (the playtest's limit is 180)
    pitchCapDeg: 70,
    follow: 14, followY: 10, followAir: 4, // spring rates (1/s), critically damped
    ahead: 1.1, aheadFrom: 3, aheadTo: 7, // look-ahead metres at a run (speed in m/s)
    sphere: 0.3, // the camera's collision radius (its near plane is 0.2)
    stepM: 1.3, // the most the camera moves by turning, tilting or a pull-in in one frame, metres (the sensor's limit is 3)
    blendSecs: 0.6,
    dipFrom: 2, dipBase: 0.1, dipPer: 0.03, dipMax: 0.25, dipDown: 0.09, dipUp: 0.35, // the landing dip (a fall over 2 m)
    recenterAfter: 1.5, recenterRate: 5, touchSens: 420,
    minDist: 2.2, liftMax: 0.9, easeOut: 10, // keep at least this much camera distance by lifting over the obstacle; ease-out spring rate
    castSecs: 1.8, castRise: 0.3, castFall: 0.5,
    glanceSecs: 2.25, glanceRise: 0.35, glanceFall: 0.45,
    cast: {},
  }, C.camera || {});
  const CAST = Object.assign({
    default: { rad: 0.6, beta: 0, align: 0.9 },
    bolt: { rad: -0.7, beta: -0.03, align: 0.9 }, // a slight push in
    storm: { rad: 0.4, beta: -0.02, align: 0.9 },
    tornado: { rad: 1.3, beta: 0.24, align: 0.85 }, // a low angle, up at the funnel
    gale: { rad: 0.9, beta: 0.1, align: 0.85 },
    gust: { rad: 0.6, beta: 0.06, align: 0.85 },
    rain: { rad: 0.5, beta: 0.04, align: 0.9 },
    fog: { rad: 0.5, beta: 0, align: 0.9 },
    sunbreak: { rad: 0.7, beta: 0.1, align: 0.9 },
    look: { rad: 1.6, beta: 0.1, align: 0.95 }, // a tap on an ask's marker (day.control.frame)
  }, CAM.cast || {});
  const TAU2 = Math.PI * 2;
  const wrapPi = (a) => ((((a + Math.PI) % TAU2) + TAU2) % TAU2) - Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth01 = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  /** One axis of a critically damped spring: [position, velocity]. */
  const spring1 = (p, v, goal, w, dt) => {
    const x = p - goal;
    const e = Math.exp(-w * dt);
    const tt = (v + w * x) * dt;
    return [goal + (x + tt) * e, (v - w * tt) * e];
  };
  const cs = {
    aimA: null, shownA: null, shownB: null, // the yaw asked for (his heading, the player's drag) and the yaw drawn
    tp: null, tv: { x: 0, y: 0, z: 0 }, ahead: { x: 0, z: 0 },
    appliedB: 0, liftB: 0, rv: 0, lastFinalA: null, lastFinalB: null, lastMs: 0, lookAt: 0, lookDown: false,
    blend: null, cast: null,
    fresh: true, // the next frame follows a cut (take, place): no yaw rate sample
  };
  const camStats = { frames: 0, inside: 0, blocked: 0, maxYawDegPerSec: 0, maxPitchDegPerSec: 0, minClear: 99, casts: [], glances: [], lastGlanceCancelMs: null, recentres: 0, lookDrags: 0, dipMax: 0 };
  const firstCastSeen = new Set();
  const canonVerb = (id) => {
    if (id === "storm" || id === "bolt") return "bolt";
    if (id === "gust" || id === "gale" || id === "wind") return "wind";
    return id || "default";
  };
  /* Pitch (camera.beta) that places a world reaction spot (gx, gy, gz) into the middle third of the screen above the controls. */
  function glanceBeta(gx, gy, gz, rad) {
    const r0 = rad || wantRadius || 5.6;
    const d = Math.max(2, Math.hypot(gx - s.x, gz - s.z));
    const dy = (s.y + 1.35) - (gy == null ? 0.06 : gy);
    const thetaRay = Math.atan2(dy + r0 * Math.cos(1.28), d + r0 * Math.sin(1.28));
    return clamp(Math.PI * 0.5 - thetaRay - 0.035, 1.02, 1.38);
  }
  /* Pick the spot that reacts to a cast: an open ask (or the cold open's park lawn, pots and pond), else the first cast of each power. */
  function resolveGlanceSpot(id, aim) {
    const canon = canonVerb(id);
    const isFirst = !firstCastSeen.has(id) && !firstCastSeen.has(canon);
    firstCastSeen.add(id);
    firstCastSeen.add(canon);
    const inCold = !!(day.coldopen && day.coldopen.active && day.coldopen.active());
    const inFirstRain = !!(day.firstrain && day.firstrain.now && day.firstrain.now().active);
    const streetOpen = (day.street && day.street.open && day.street.open()) || null;
    const askMarks = (day.asks && day.asks.now && day.asks.now().marks) || [];
    const curA = cs.aimA != null ? cs.aimA : camera.alpha;
    if (canon === "rain") {
      const hasRainAsk = inCold || inFirstRain || (streetOpen && streetOpen.verb === "rain") || askMarks.some((m) => m.verb === "rain");
      if (hasRainAsk || (isFirst && s.x < 35 && s.z < 75)) {
        const gx = s.y > 3 ? -1 : -3;
        const gz = s.y > 3 ? 39 : 35;
        const parkA = Math.atan2(gz - s.z, gx - s.x) + Math.PI;
        const offA = Math.abs(wrapPi(parkA - curA));
        if (inCold || inFirstRain || (streetOpen && streetOpen.verb === "rain") || offA <= 1.35) {
          return {
            glance: true, x: gx, y: 0.06, z: gz,
            reason: inCold ? "coldopen" : hasRainAsk ? "ask" : "first-cast",
            spots: [
              { name: "lawn", x: -6, y: 0.06, z: 33 },
              { name: "pond", x: 15, y: 0.07, z: 60 },
              { name: "pots", x: -18.9, y: 0.4, z: 9.15 },
            ],
          };
        }
      }
    }
    const mk = askMarks.find((m) => m.verb === canon && m.place && Math.hypot(m.place.x - s.x, m.place.z - s.z) < 65);
    if (mk && mk.place) {
      const mkA = Math.atan2(mk.place.z - s.z, mk.place.x - s.x) + Math.PI;
      if ((streetOpen && streetOpen.verb === canon) || Math.abs(wrapPi(mkA - curA)) <= 1.35) {
        return {
          glance: true, x: mk.place.x, y: mk.place.y || 0.4, z: mk.place.z, reason: "ask",
          spots: [{ name: mk.key || (mk.who + "-" + canon), x: mk.place.x, y: mk.place.y || 0.4, z: mk.place.z }],
        };
      }
    }
    if (streetOpen && streetOpen.verb === canon) {
      const places = (day.asks && day.asks.places && day.asks.places()) || {};
      const pl = (places[streetOpen.who] && places[streetOpen.who][streetOpen.verb]) || { x: streetOpen.x, y: 0.4, z: streetOpen.z };
      return {
        glance: true, x: pl.x, y: pl.y || 0.4, z: pl.z, reason: "ask",
        spots: [{ name: streetOpen.id || canon, x: pl.x, y: pl.y || 0.4, z: pl.z }],
      };
    }
    const gy = aim.y == null ? s.y : aim.y;
    if (isFirst) {
      return {
        glance: true, x: aim.x, y: gy, z: aim.z, reason: "first-cast",
        spots: [{ name: id, x: aim.x, y: gy, z: aim.z }],
      };
    }
    return { glance: false, x: aim.x, y: gy, z: aim.z, reason: "cast", spots: [] };
  }
  function cancelGlance(why, inputAt) {
    if (!cs.cast || !cs.cast.glance) return false;
    const c = cs.cast;
    const nowMs = performance.now();
    const cancelMs = Math.max(1, Math.round(nowMs - (inputAt || c.inputAt || nowMs)));
    if (cs.shownA != null) cs.aimA = cs.shownA;
    if (cs.shownB != null) {
      camera.beta = clamp(cs.shownB, camera.lowerBetaLimit, camera.upperBetaLimit);
      cs.appliedB = 0;
    }
    cs.cast = null;
    cs.lookAt = nowMs;
    const rec = {
      power: c.power,
      reason: c.reason || "glance",
      spot: { x: c.x, y: c.y, z: c.z },
      seconds: Math.round(c.t * 100) / 100,
      framedSeconds: Math.round(c.best * 100) / 100,
      cancelled: true,
      cancelWhy: why || "input",
      cancelMs,
    };
    camStats.glances.push(rec);
    if (camStats.glances.length > 40) camStats.glances.shift();
    camStats.lastGlanceCancelMs = cancelMs;
    window.dispatchEvent(new CustomEvent("day:camera", { detail: { action: "glance-cancel", ...rec } }));
    return true;
  }
  function camReset() {
    cs.aimA = cs.shownA = cs.shownB = null;
    cs.tp = null;
    cs.tv = { x: 0, y: 0, z: 0 };
    cs.ahead = { x: 0, z: 0 };
    cs.appliedB = 0;
    cs.blend = null;
    cs.cast = null;
    cs.fresh = true;
    cs.lastFinalA = null;
    cs.lookAt = performance.now();
  }
  function cameraTake() {
    ["lowerRadiusLimit", "upperRadiusLimit", "lowerBetaLimit", "upperBetaLimit", "angularSensibilityX", "angularSensibilityY"].forEach((k) => (saved[k] = camera[k]));
    const watch = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, x: camera.target.x, y: camera.target.y, z: camera.target.z };
    if (kb) ["keysUp", "keysDown", "keysLeft", "keysRight"].forEach((k) => ((saved[k] = kb[k]), (kb[k] = [])));
    camera.lowerRadiusLimit = 0.2; // a wall behind him may pull the camera in this close, inside his own head (the wheel stops at 1.5)
    camera.upperRadiusLimit = 16;
    camera.lowerBetaLimit = 0.25;
    camera.upperBetaLimit = 1.62;
    if (touchMode()) camera.angularSensibilityX = camera.angularSensibilityY = CAM.touchSens;
    wantRadius = Math.max(3.5, Math.min(6.5, camera.radius));
    camera.beta = Math.min(camera.beta, 1.3);
    lastRadius = null;
    glidePull = 0;
    screenLift = 0;
    hudAt = 0;
    camReset();
    cs.watch = watch;
  }
  /* Taken outside (the day's camera is a cutaway shot looking into the house): put the camera along the street,
     on the side with the most room, so he, the street and the sky are what show, not the bedroom behind him. */
  function frameOutdoors(fr, at) {
    const rm = fr.room && world.rooms && world.rooms[fr.room];
    if (rm && rm.building) return;
    const bd = window.DAY_CONFIG && window.DAY_CONFIG.buildings;
    const x = at && at.x != null ? at.x : fr.person.x;
    const z = at && at.z != null ? at.z : fr.person.z;
    // inside a cutaway building's footprint the day's own shot is right
    if (bd) {
      for (const k of Object.keys(bd)) {
        const b = bd[k];
        if (!b || !b.bounds) continue;
        const o = b.origin || [0, 0];
        if (x > b.bounds[0] + o[0] && x < b.bounds[2] + o[0] && z > b.bounds[1] + o[1] && z < b.bounds[3] + o[1]) return;
      }
    }
    const beta = 1.1;
    let best = null;
    const pl = world.physics && world.physics();
    // Distance to anything solid along a ray, ramps and lips included (clearRadius only knows the big boxes): the stair's
    // slab beside the street is a dark plane the shot would otherwise be framed against.
    const hitDist = (dx, dy, dz, max) => {
      if (!pl) return max;
      const o = new B.Vector3(x, 1.35, z);
      pl.plugin.raycast(o, o.add(new B.Vector3(dx, dy, dz).scale(max)), camRay, mover.rayQuery());
      return camRay.hasHit ? B.Vector3.Distance(o, camRay.hitPoint) : max;
    };
    [0.5, Math.PI - 0.5, 0, Math.PI, 1.5708 + 0.9, 1.5708 - 0.9].forEach((a) => {
      const sb = Math.sin(beta);
      let clear = world.clearRadius ? world.clearRadius(x, 1.35, z, Math.cos(a) * sb, Math.cos(beta), Math.sin(a) * sb, wantRadius, 0.6) : wantRadius;
      clear = Math.min(clear, hitDist(Math.cos(a) * sb, Math.cos(beta), Math.sin(a) * sb, wantRadius + 0.3) - 0.35);
      // What the shot looks at behind him: a facade a few metres back fills the frame with one dark slab, so open street wins among the clear sides.
      let behind = world.clearRadius ? world.clearRadius(x, 1.35, z, -Math.cos(a), 0, -Math.sin(a), 14, 0.6) : 14;
      behind = Math.min(behind, hitDist(-Math.cos(a), 0, -Math.sin(a), 14));
      const score = Math.min(clear, wantRadius) * 4 + Math.min(behind, 14);
      if (!best || score > best.score + 0.3) best = { a, clear, score };
    });
    if (best) {
      camera.alpha = best.a;
      camera.beta = beta;
    }
  }
  let himVis = 1;
  function setHimVis(v) {
    himVis = v;
    if (world.person) world.person.getChildMeshes(false).forEach((m) => (m.visibility = v));
  }
  function cameraGive() {
    if (himVis !== 1) setHimVis(1);
    ["lowerRadiusLimit", "upperRadiusLimit", "lowerBetaLimit", "upperBetaLimit", "angularSensibilityX", "angularSensibilityY"].forEach((k) => (camera[k] = saved[k]));
    camReset();
    if (kb) ["keysUp", "keysDown", "keysLeft", "keysRight"].forEach((k) => (kb[k] = saved[k] || kb[k]));
    glidePull = 0;
    screenLift = 0;
    camera.targetScreenOffset.y = 0;
  }
  /* The orbit camera centres his chest, so at 1280 x 720 his legs and body sit at the bottom centre of the screen,
     right behind the hint line, Let go and the ability bar (the playtest saw him "lost behind the HUD"). Shift the
     target up on screen, smoothly, until his feet sit just above the top of that bottom stack. The reference is the
     damped target, not his feet, so a jump doesn't swing the shot. Phones keep the centre (their pads are at the sides). */
  function hudLiftGoal() {
    if (cs.cast && cs.cast.glance) return 0;
    const cv = world.scene.getEngine().getRenderingCanvas();
    const ch = cv ? cv.clientHeight : 0;
    const cw = cv ? cv.clientWidth : 0;
    if (touchMode()) {
      // Phone portrait: the verb arc and stick fill the lower half, so he sits in the upper-middle (chest at ~36% of the
      // screen height), clear of the arc. Landscape keeps the centre (the arc is at the right edge, he is left of it).
      if (ch < 300 || ch <= cw) return 0;
      const tt = camera.target;
      const dd = Math.max(1, B.Vector3.Distance(camera.globalPosition, new B.Vector3(tt.x, tt.y, tt.z)));
      const ppm = ch / 2 / (dd * Math.tan((camera.fov || 0.78) / 2));
      return (0.14 * ch) / ppm;
    }
    if (ch < 300) return 0;
    const now = performance.now();
    if (hudTop == null || now - hudAt > 250) {
      hudAt = now;
      hudTop = ch;
      [".control-hint", "#control", "#abilitybar"].forEach((q) => {
        const el = document.querySelector(q);
        if (!el || el.hidden || !el.offsetParent) return;
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.left < cw / 2 + 60 && r.right > cw / 2 - 60) hudTop = Math.min(hudTop, r.top);
      });
    }
    if (hudTop >= ch - 40) return 0;
    const t = camera.target;
    const feet = new B.Vector3(t.x, t.y - 1.35, t.z);
    const clip = B.Vector3.TransformCoordinates(feet, world.scene.getTransformMatrix());
    const d = Math.max(1, B.Vector3.Distance(camera.globalPosition, feet));
    const pxPerM = ch / 2 / (d * Math.tan((camera.fov || 0.78) / 2));
    const feetY = (1 - clip.y) / 2 * ch + screenLift * pxPerM; // where they'd be with no shift
    const headY = feetY - 1.8 * pxPerM;
    const px = Math.max(0, Math.min(feetY - (hudTop - 12), headY - 56)); // head stays on screen
    return px / pxPerM;
  }
  /* The take-over push: the camera starts wide and fast-pushes in to his shoulder (js/moments.js asks for it).
     Any move, jump or stick input, or push(null), ends it. */
  let holdIn = false; // a moment is playing (js/moments.js): he stands still, input is ignored
  const push = { on: false, t: 0, secs: 1.4, extra: 0, fov: 0, baseFov: 0 };
  function pushStart(spec) {
    if (!spec) return pushEnd();
    push.on = true;
    push.t = 0;
    push.secs = spec.secs || 1.4;
    push.extra = Math.max(0, (spec.from || 14) - wantRadius);
    push.fov = spec.fov || 0;
    push.baseFov = camera.fov;
    return true;
  }
  function pushEnd() {
    if (!push.on) return false;
    push.on = false;
    camera.fov = push.baseFov || camera.fov;
    return true;
  }
  /* The take-over blend: the watch camera's own pose is where the orbit starts, and it eases to his shoulder over CAM.blendSecs. */
  function startBlend() {
    const w = cs.watch;
    cs.watch = null;
    if (!w) return;
    cs.aimA = camera.alpha; // the heading the framing chose
    cs.shownA = w.alpha;
    cs.shownB = w.beta;
    cs.blend = { t: 0, a: wrapPi(w.alpha - camera.alpha), b: w.beta - camera.beta, r: Math.min(16, w.radius) };
    cs.appliedB = w.beta - camera.beta;
    cs.tp = { x: w.x, y: w.y, z: w.z };
    camera.alpha = w.alpha;
    camera.beta = w.beta;
    camera.radius = cs.blend.r;
    camera.target.set(w.x, w.y, w.z);
    lastRadius = null;
  }
  /* A cast frames him and where it lands: the camera eases (rise, hold, fall: about 1.8 s) round behind him so the target is
     ahead of it, and changes its angle by the power (a slight push for Lightning, low for a Tornado). On the first cast of each
     power (and any cast aimed at an ask), it glances for ~1.5 s to the reacting spot in the world and eases back; any input cancels it. */
  window.addEventListener("day:power", (e) => {
    const d = e.detail || {};
    if (mode !== "control" || d.action === "denied" || cine()) return;
    const pw = window.powers || day.powers;
    let aim = null;
    try { aim = pw && pw.now ? pw.now().aim : null; } catch (err) { aim = null; }
    const id = d.power || d.action || "default";
    if (!aim) aim = { x: s.x + Math.sin(s.yaw) * 6, z: s.z + Math.cos(s.yaw) * 6, y: s.y };
    const gl = resolveGlanceSpot(id, aim);
    const nowMs = performance.now();
    if (cs.cast && cs.cast.frames > 0) {
      camStats.casts.push({ power: cs.cast.power, framedSeconds: Math.round(cs.cast.best * 100) / 100, frames: cs.cast.frames, glance: !!cs.cast.glance });
      if (camStats.casts.length > 40) camStats.casts.shift();
    }
    cs.cast = {
      t: 0, power: id, x: gl.x, y: gl.y == null ? s.y : gl.y, z: gl.z,
      glance: !!gl.glance, reason: gl.reason || "cast", spots: gl.spots || [],
      aimBeta: gl.glance ? glanceBeta(gl.x, gl.y, gl.z, wantRadius) : null,
      secs: gl.glance ? CAM.glanceSecs : CAM.castSecs,
      rise: gl.glance ? CAM.glanceRise : CAM.castRise,
      fall: gl.glance ? CAM.glanceFall : CAM.castFall,
      startedAt: nowMs, inputAt: 0, inFrame: false, middleThird: false, framedEventSent: false,
      run: 0, best: 0, frames: 0, framedFrames: 0,
    };
    if (gl.glance) {
      window.dispatchEvent(new CustomEvent("day:camera", {
        detail: { action: "glance-start", power: id, reason: gl.reason, spot: { x: gl.x, y: gl.y, z: gl.z } },
      }));
    }
  });
  const cine = () => !!(world.cineOn && world.cineOn());
  /* One-finger drag on the right half of the screen looks round; the left half is the stick's, so it does nothing there. */
  const ptr = camera.inputs && camera.inputs.attached && camera.inputs.attached.pointers;
  if (ptr && typeof ptr.onTouch === "function") {
    const orig = ptr.onTouch.bind(ptr);
    ptr.onTouch = (pt, dx, dy) => {
      const touchy = pt && (pt.type === "touch" || pt.type === "pen" || (pt.type == null && touchMode()));
      if (mode === "control" && touchy) {
        const cv = world.scene.getEngine().getRenderingCanvas();
        const r = cv ? cv.getBoundingClientRect() : { left: 0, width: window.innerWidth };
        if (pt.x < r.left + r.width / 2) return; // the left half belongs to the stick
        camStats.lookDrags++;
      }
      orig(pt, dx, dy);
    };
  }
  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" && e.target && e.target.tagName === "CANVAS") cs.lookDown = (cs.lookDown || 0) + 1;
  }, true);
  const lookUp = (e) => { if (e.pointerType === "touch" && cs.lookDown) cs.lookDown = Math.max(0, cs.lookDown - 1); };
  window.addEventListener("pointerup", lookUp, true);
  window.addEventListener("pointercancel", lookUp, true);

  /* Distance the camera may go along `dir` from `o` (to `r` at most) without its sphere touching anything: the centre ray and
     four more that end on a ring of CAM.sphere round the camera, each scaled back by its margin. */
  const sphereRight = new B.Vector3();
  function sphereClear(ox, oy, oz, dx, dy, dz, r) {
    const pl = world.physics && world.physics();
    const rad = CAM.sphere;
    const h = Math.hypot(dx, dz) || 1;
    sphereRight.set(dz / h, 0, -dx / h);
    const ux = -dy * sphereRight.z, uy = dz * sphereRight.x - dx * sphereRight.z, uz = dy * sphereRight.x;
    const offs = [[0, 0, 0], [sphereRight.x, 0, sphereRight.z], [-sphereRight.x, 0, -sphereRight.z], [ux, uy, uz], [-ux, -uy, -uz]];
    let best = r;
    for (let i = 0; i < offs.length; i++) {
      const k = i ? rad : 0;
      const ex = dx * r + offs[i][0] * k, ey = dy * r + offs[i][1] * k, ez = dz * r + offs[i][2] * k;
      const L = Math.hypot(ex, ey, ez) || 1;
      const qx = ex / L, qy = ey / L, qz = ez / L;
      let ri = r;
      if (world.clearRadius) ri = Math.min(ri, (world.clearRadius(ox, oy, oz, qx, qy, qz, L, 0.6) / L) * r);
      if (pl) {
        const from = new B.Vector3(ox + qx * 0.05, oy + qy * 0.05, oz + qz * 0.05);
        pl.plugin.raycast(from, new B.Vector3(ox + qx * (L + 0.3), oy + qy * (L + 0.3), oz + qz * (L + 0.3)), camRay, mover.rayQuery());
        if (camRay.hasHit) ri = Math.min(ri, (Math.max(0.2, B.Vector3.Distance(new B.Vector3(ox, oy, oz), camRay.hitPoint) - 0.35) / L) * r);
      }
      best = Math.min(best, ri);
    }
    return Math.max(0.2, best);
  }
  /* The camera behind geometry from his head (the feel sensor's camera-blocked): a ray from his head to the camera hits something. */
  function cameraBlockedNow(head, pos) {
    const pl = world.physics && world.physics();
    if (!pl) return false;
    const d = B.Vector3.Distance(head, pos);
    if (d < 0.5) return false;
    const dirv = pos.subtract(head).normalize();
    pl.plugin.raycast(head.add(dirv.scale(0.1)), pos, camRay, mover.rayQuery());
    return !!(camRay.hasHit && B.Vector3.Distance(head, camRay.hitPoint) < d - 0.12);
  }
  /* The scene's own pick from his head to the camera (what the feel sensor casts): the colliders and clearRadius miss thin walls,
     small blocks and meshes with no collider, so the camera could sit behind one. Returns r pulled in until the head sees it. */
  const headPickRay = new B.Ray(new B.Vector3(), new B.Vector3(0, 1, 0), 1);
  const notHim = (m) => m.isPickable !== false && m.isEnabled() && m.isVisible !== false && !(world.person && m.isDescendantOf(world.person));
  function headClear(t, dx, dy, dz, r) {
    const hx = s.x, hy = s.y + 1.5, hz = s.z;
    for (let i = 0; i < 3; i++) {
      const cx = t.x + dx * r, cy = t.y + dy * r, cz = t.z + dz * r;
      const len = Math.hypot(cx - hx, cy - hy, cz - hz);
      if (len < 0.5) return r;
      headPickRay.origin.set(hx, hy, hz);
      headPickRay.direction.set((cx - hx) / len, (cy - hy) / len, (cz - hz) / len);
      headPickRay.length = len;
      const hit = world.scene.pickWithRay(headPickRay, notHim, true);
      if (!hit || !hit.hit || hit.distance >= len - 0.3) return r;
      r = Math.max(0.2, r * Math.max(0.1, (hit.distance - 0.6) / len));
    }
    return r;
  }
  function cameraFollow(dt, look) {
    if (cine()) return; // a moment's cut-away camera (js/moments.js) has the view
    const nowMs = performance.now();
    const realDt = cs.lastMs ? Math.min(0.25, (nowMs - cs.lastMs) / 1000) : dt;
    cs.lastMs = nowMs;
    if (cs.watch) startBlend();
    if (cs.aimA == null) { cs.aimA = cs.shownA = camera.alpha; cs.shownB = camera.beta; }
    // what the player did to the camera since the last frame (a drag, its inertia): the orbit's own drift, not mine
    const drag = wrapPi(camera.alpha - cs.shownA - (camera.shakeAlpha || 0));
    if (Math.abs(drag) > 1e-5) { cs.aimA += drag; cs.lookAt = nowMs; }
    camera.beta -= cs.appliedB;
    if (look.x || look.y) cs.lookAt = nowMs;
    cs.aimA -= look.x * 2.4 * dt;
    camera.beta = Math.max(camera.lowerBetaLimit, Math.min(camera.upperBetaLimit, camera.beta - look.y * 1.5 * dt));
    if (cs.cast && cs.cast.glance && nowMs - (cs.cast.startedAt || 0) > 40) {
      if (Math.abs(drag) > 1e-3 || Math.hypot(look.x, look.y) > 0.05 || keys.size > 0 || stick.id != null || Math.hypot(stick.x, stick.y) > 0.05 || touchJumpHeld || jumps > 0) {
        cancelGlance("input", nowMs);
      }
    }
    // the player's zoom (wheel, pinch) since the last frame is what they want; walls only ever shorten it
    if (!push.on && lastRadius != null && !cs.blend && Math.abs(camera.radius - lastRadius) > 1e-3) wantRadius = Math.max(1.5, Math.min(16, camera.radius - glidePull));
    if (cs.lookDown || Math.abs(stick.x) > 0.35 || keys.has("l") || keys.has("r")) cs.lookAt = nowMs; // steering sideways is turning, not idling (the camera would chase him round)
    const touch = touchMode();
    if (!push.on && !cs.cast && !cs.blend && nowMs - cs.lookAt > CAM.recenterAfter * 1000) {
      // idle after a look: swing round behind him, and level the pitch
      const behind = Math.atan2(-Math.cos(s.yaw), -Math.sin(s.yaw));
      const k = Math.min(1, CAM.recenterRate * dt);
      const dA = wrapPi(behind - cs.aimA);
      if (Math.abs(dA) > 0.02 || Math.abs(camera.beta - 1.12) > 0.02) camStats.recentres += Math.abs(dA) > 0.2 ? 1 : 0;
      cs.aimA += dA * k;
      camera.beta += (1.12 - camera.beta) * k;
    }
    // ---- the spring follow, with a look-ahead at a run ----
    const bl = cs.blend;
    let ek = 1;
    if (bl) {
      bl.t += dt;
      ek = smooth01(bl.t / CAM.blendSecs);
      if (bl.t >= CAM.blendSecs) cs.blend = null;
    }
    if (!cs.tp) cs.tp = { x: camera.target.x, y: camera.target.y, z: camera.target.z };
    const run = clamp((s.speed - CAM.aheadFrom) / Math.max(0.1, CAM.aheadTo - CAM.aheadFrom), 0, 1) * (s.grounded ? 1 : 0.5);
    let gx = 0, gz = 0;
    if (run > 0 && s.speed > 0.1) {
      let reach = CAM.ahead * run;
      const plA = world.physics && world.physics();
      if (plA) { // a wall right ahead: no look-ahead into it
        const o = new B.Vector3(s.x, s.y + 1.35, s.z);
        const dx = s.vx / s.speed, dz = s.vz / s.speed;
        plA.plugin.raycast(o, o.add(new B.Vector3(dx, 0, dz).scale(reach + 0.5)), camRay, mover.rayQuery());
        if (camRay.hasHit) reach = Math.max(0, Math.min(reach, B.Vector3.Distance(o, camRay.hitPoint) - 0.6));
      }
      gx = (s.vx / s.speed) * reach;
      gz = (s.vz / s.speed) * reach;
    }
    cs.ahead.x = damp(cs.ahead.x, gx, dt, 3);
    cs.ahead.z = damp(cs.ahead.z, gz, dt, 3);
    const wxz = bl ? 5 + (CAM.follow - 5) * ek : CAM.follow;
    const wy = s.grounded ? CAM.followY : CAM.followAir;
    [cs.tp.x, cs.tv.x] = spring1(cs.tp.x, cs.tv.x, s.x + cs.ahead.x, wxz, dt);
    [cs.tp.z, cs.tv.z] = spring1(cs.tp.z, cs.tv.z, s.z + cs.ahead.z, wxz, dt);
    [cs.tp.y, cs.tv.y] = spring1(cs.tp.y, cs.tv.y, s.y + 1.35, bl ? Math.min(wy, wxz) : wy, dt);
    /* a light dip when he lands from over 2 m: the view sinks with the squash (down 0.09 s, back up over 0.35 s) */
    if (s.landId !== cs.landSeen) {
      if (cs.landSeen != null && s.landDrop > CAM.dipFrom) cs.dip = { t: 0, depth: Math.min(CAM.dipMax, CAM.dipBase + CAM.dipPer * (s.landDrop - CAM.dipFrom)) };
      cs.landSeen = s.landId;
    }
    let dipY = 0;
    if (cs.dip) {
      cs.dip.t += dt;
      const dd = cs.dip.t < CAM.dipDown ? smooth01(cs.dip.t / CAM.dipDown) : 1 - smooth01((cs.dip.t - CAM.dipDown) / CAM.dipUp);
      dipY = cs.dip.depth * dd;
      if (cs.dip.t >= CAM.dipDown + CAM.dipUp) cs.dip = null;
    }
    camStats.dipMax = Math.max(camStats.dipMax || 0, dipY);
    const t = camera.target;
    t.set(cs.tp.x, cs.tp.y - dipY, cs.tp.z);
    const pullWant = s.gliding ? (RIDE.cameraPull || 3.4) : 0;
    glidePull = damp(glidePull, pullWant, dt, 2.4);
    let r = wantRadius + glidePull;
    if (push.on) {
      push.t += dt;
      const k = Math.min(1, push.t / push.secs);
      const e = 1 - Math.pow(1 - k, 3);
      r += push.extra * (1 - e);
      camera.fov = push.baseFov + push.fov * (1 - e);
      if (k >= 1) pushEnd();
    }
    // ---- a cast frames him and the target (and a reaction glance eases to the reacting spot for ~1.5 s) ----
    let castA = 0, castB = 0, castR = 0;
    const cst = cs.cast;
    if (cst) {
      cst.t += dt;
      const dur = cst.glance ? (cst.secs || CAM.glanceSecs) : CAM.castSecs;
      const rise = cst.glance ? (cst.rise || CAM.glanceRise) : CAM.castRise;
      const fall = cst.glance ? (cst.fall || CAM.glanceFall) : CAM.castFall;
      if (cst.t >= dur) {
        camStats.casts.push({ power: cst.power, framedSeconds: Math.round(cst.best * 100) / 100, frames: cst.frames, glance: !!cst.glance });
        if (camStats.casts.length > 40) camStats.casts.shift();
        if (cst.glance) {
          const rec = {
            power: cst.power,
            reason: cst.reason || "glance",
            spot: { x: cst.x, y: cst.y, z: cst.z },
            seconds: Math.round(cst.t * 100) / 100,
            framedSeconds: Math.round(cst.best * 100) / 100,
            cancelled: false,
          };
          camStats.glances.push(rec);
          if (camStats.glances.length > 40) camStats.glances.shift();
          window.dispatchEvent(new CustomEvent("day:camera", { detail: { action: "glance-end", ...rec } }));
        }
        window.dispatchEvent(new CustomEvent("day:camera", { detail: { action: "cast-framed", power: cst.power, seconds: cst.best, glance: !!cst.glance } }));
        cs.cast = null;
      } else {
        const env = smooth01(cst.t / rise) * (1 - smooth01((cst.t - (dur - fall)) / fall));
        const P = CAST[cst.power] || CAST.default;
        const wr = wrapPi(Math.atan2(cst.z - s.z, cst.x - s.x) + Math.PI - cs.aimA); // the heading that puts the target dead ahead
        if (cst.glance) {
          castA = wr * (cst.align != null ? cst.align : 1.0) * env;
          const wantBeta = cst.aimBeta != null ? cst.aimBeta : glanceBeta(cst.x, cst.y, cst.z, r);
          castB = (wantBeta - camera.beta) * env;
          castR = (cst.rad != null ? cst.rad : 0.4) * env;
        } else {
          castA = clamp(wr, -2.4, 2.4) * smooth01((Math.abs(wr) - 0.12) / 0.4) * P.align * env;
          castB = P.beta * env;
          const D = Math.hypot(cst.x - s.x, cst.z - s.z);
          castR = (P.rad + 0.16 * Math.max(0, D - 10)) * env;
        }
      }
    }
    r += Math.max(-1.2, Math.min(2.4, castR));
    /* Low over a slope or roof (the ramp up a block, the parapets): a camera skimming the slab shows only dark planes.
       Look down from where the surface under it is at least CAM_LIFT below: lift the pitch (smoothly) until it is. */
    camera.alpha = cs.aimA;
    const pl = world.physics && world.physics();
    const groundUnder = (alpha, beta) => {
      const sb = Math.sin(beta);
      const cx = t.x + Math.cos(alpha) * sb * r;
      const cy = t.y + Math.cos(beta) * r;
      const cz = t.z + Math.sin(alpha) * sb * r;
      pl.plugin.raycast(new B.Vector3(cx, cy + 0.5, cz), new B.Vector3(cx, cy - CAM_LIFT - 0.5, cz), camRay, mover.rayQuery());
      return camRay.hasHit ? camRay.hitPoint.y : null;
    };
    if (pl && !push.on) {
      let lift = camera.beta;
      for (let i = 0; i < 6; i++) {
        const gy = groundUnder(cs.aimA, lift);
        const cy = t.y + Math.cos(lift) * r;
        if (gy == null || cy - gy >= CAM_LIFT || lift <= camera.lowerBetaLimit + 0.01) break;
        lift = Math.max(camera.lowerBetaLimit, lift - 0.14);
      }
      if (lift < camera.beta) {
        const nb = damp(camera.beta, lift, dt, 6);
        camera.beta = Math.max(nb, camera.beta - 0.1, lift);
      }
    }
    /* Walking at a wall with the camera on its far side squeezes the camera in to his head (a wall in front of him, the
       camera behind the wall). Swing the orbit round, at a capped rate, to the nearest heading with room, as a
       third-person camera does, rather than only pulling in. Not while the player is turning the camera themselves. */
    if (world.clearRadius && !push.on && !cs.cast && Math.abs(look.x) < 0.05 && Math.abs(drag) < 1e-3) {
      const want = Math.min(r, 3.5);
      const sb0 = Math.sin(camera.beta);
      const plr = world.physics && world.physics();
      // The big boxes (clearRadius) don't know the ramp's slab, its end wall or the lips: ask the colliders too, so walking at
      // the ramp's end swings the camera round to open street instead of squeezing it into his head against the slab.
      const room = (a) => {
        const ca = Math.cos(a) * sb0, cb = Math.cos(camera.beta), sa = Math.sin(a) * sb0;
        let rm = world.clearRadius(t.x, t.y, t.z, ca, cb, sa, want, 0.6);
        if (plr) {
          const o = new B.Vector3(t.x, t.y, t.z);
          plr.plugin.raycast(o.add(new B.Vector3(ca, cb, sa).scale(0.05)), o.add(new B.Vector3(ca, cb, sa).scale(want + 0.3)), camRay, mover.rayQuery());
          if (camRay.hasHit) rm = Math.min(rm, B.Vector3.Distance(o, camRay.hitPoint) - 0.35);
        }
        return rm;
      };
      if (room(cs.aimA) < want - 0.3) {
        let pick = null;
        for (let k = 1; k <= 12 && pick == null; k++) {
          for (const sg of [1, -1]) {
            const a = cs.aimA + sg * k * 0.2618;
            if (room(a) >= want - 0.05) { pick = a; break; }
          }
        }
        if (pick != null) cs.aimA += Math.max(-2.2 * dt, Math.min(2.2 * dt, pick - cs.aimA));
      }
    }
    // ---- the drawn yaw and pitch: the asked-for ones plus the cast's and the blend's, turning at most the capped rate ----
    const blA = cs.blend ? cs.blend.a * (1 - smooth01(cs.blend.t / CAM.blendSecs)) : 0;
    const wantA = cs.aimA + castA + blA;
    // Also capped by arc length: on a long frame (shader compile, first casts) dt is large and a 150 deg/s turn at a
    // wide radius swung the camera metres in one frame (the feel sensor's camera-jump). At most CAM.stepM per frame.
    const arcCap = CAM.stepM / Math.max(2, r);
    const capA = Math.min((CAM.yawCapDeg * Math.PI / 180) * dt, arcCap);
    cs.shownA += clamp(wrapPi(wantA - cs.shownA), -capA, capA);
    let wantB = camera.beta + castB + (cs.blend ? cs.blend.b * (1 - smooth01(cs.blend.t / CAM.blendSecs)) : 0);
    wantB = clamp(wantB, camera.lowerBetaLimit, camera.upperBetaLimit);
    const base = camera.beta;
    const capB = Math.min((CAM.pitchCapDeg * Math.PI / 180) * dt, arcCap);
    cs.shownB += clamp(wantB - cs.shownB, -capB, capB);
    // a low angle never puts the camera on the slab or the road
    if (pl && !push.on && cs.shownB > base) {
      for (let i = 0; i < 4; i++) {
        const gy = groundUnder(cs.shownA, cs.shownB);
        if (gy == null || t.y + Math.cos(cs.shownB) * r - gy >= CAM_LIFT * 0.7) break;
        cs.shownB = Math.max(base, cs.shownB - 0.1);
      }
    }
    camera.alpha = cs.shownA;
    /* Lift over what is close: when the camera would have to come in under CAM.minDist (a facade at his shoulder, a low wall),
       raise it (a smaller beta) until the cast has room, so he stays in frame and the view is the street and the roof, not the
       wall. The lift is rate-limited (the pitch cap) and eases back out when the room is there again. */
    const needR = Math.min(r, CAM.minDist);
    const castAt = (lift) => {
      const b = Math.max(camera.lowerBetaLimit, cs.shownB - lift);
      const sb = Math.sin(b);
      return sphereClear(t.x, t.y, t.z, Math.cos(camera.alpha) * sb, Math.cos(b), Math.sin(camera.alpha) * sb, needR);
    };
    let liftWant = cs.liftB;
    if (!push.on && !cs.blend && !cs.cast) {
      if (castAt(cs.liftB) < needR - 0.05) {
        liftWant = CAM.liftMax;
        for (let L = cs.liftB + 0.12; L <= CAM.liftMax; L += 0.12) {
          if (castAt(L) >= needR - 0.05) { liftWant = L; break; }
        }
      } else if (cs.liftB > 0.01 && castAt(Math.max(0, cs.liftB - 0.12)) >= needR - 0.05) {
        liftWant = Math.max(0, cs.liftB - 0.12); // room again: ease down a step at a time
      }
    } else liftWant = 0;
    const liftCap = (CAM.pitchCapDeg * 0.8 * Math.PI / 180) * dt;
    cs.liftB += liftWant > cs.liftB ? Math.min(liftWant - cs.liftB, liftCap) : (liftWant - cs.liftB) * Math.min(1, 4 * dt);
    cs.liftB = clamp(cs.liftB, 0, Math.max(0, cs.shownB - camera.lowerBetaLimit));
    camera.beta = cs.shownB - cs.liftB;
    cs.appliedB = camera.beta - base;
    // ---- the sphere cast, with the final heading ----
    const sbF = Math.sin(camera.beta);
    const dx = Math.cos(camera.alpha) * sbF;
    const dy = Math.cos(camera.beta);
    const dz = Math.sin(camera.alpha) * sbF;
    r = Math.min(r, sphereClear(t.x, t.y, t.z, dx, dy, dz, r));
    if (r > 0.3) r = headClear(t, dx, dy, dz, r);
    /* Pull in fast but never in one jump: a thin edge entering the cast used to cut the radius by metres in a single frame, a
       visible camera snap. A slow frame (dt up to 0.1 s) is capped at 2.4 m so it stays under the feel sensor's 3 m, and it eases
       out slowly after. */
    if (cs.blend) camera.radius = Math.min(r, cs.blend.r + (r - cs.blend.r) * smooth01(cs.blend.t / CAM.blendSecs));
    else if (push.on) camera.radius = r;
    else if (r < camera.radius) camera.radius = Math.max(r, camera.radius - Math.min(CAM.stepM, Math.max(0.5, 60 * dt)));
    else { // eases out on a critically damped spring (about 0.4 s to settle), never overshooting the room there is
      let nr;
      [nr, cs.rv] = spring1(camera.radius, cs.rv, r, CAM.easeOut, dt);
      camera.radius = Math.min(r, Math.max(camera.radius, nr));
      if (camera.radius >= r) cs.rv = 0;
    }
    if (r < camera.radius || cs.blend || push.on) cs.rv = 0;
    lastRadius = camera.radius;
    screenLift = damp(screenLift, hudLiftGoal(), dt, 3);
    camera.targetScreenOffset.y = screenLift;
    // Pulled in tight against a wall, he fades so the camera isn't looking at the inside of his head.
    const vis = Math.max(0.15, Math.min(1, (camera.radius - 0.5) / 0.5)); // 0.15 at 0.5 m and closer
    if (world.person && Math.abs(vis - himVis) > 0.02) setHimVis(vis);
    // ---- what the playtest reads: the turn rate, the camera-inside frames, the cast framing ----
    const head = new B.Vector3(s.x, s.y + 1.35, s.z);
    const cpos = new B.Vector3(t.x + dx * camera.radius, t.y + dy * camera.radius, t.z + dz * camera.radius);
    if (!cs.fresh && cs.lastFinalA != null && realDt > 0.004) {
      const yawRate = (Math.abs(wrapPi(camera.alpha - cs.lastFinalA)) / realDt) * 180 / Math.PI;
      const pitchRate = (Math.abs(camera.beta - cs.lastFinalB) / realDt) * 180 / Math.PI;
      camStats.maxYawDegPerSec = Math.max(camStats.maxYawDegPerSec, Math.round(yawRate * 10) / 10);
      camStats.maxPitchDegPerSec = Math.max(camStats.maxPitchDegPerSec, Math.round(pitchRate * 10) / 10);
    }
    cs.lastFinalA = camera.alpha;
    cs.lastFinalB = camera.beta;
    cs.fresh = false;
    camStats.frames++;
    const here = world.cameraInside ? world.cameraInside(cpos) : false;
    if (here) camStats.inside++;
    camStats.minClear = Math.min(camStats.minClear, Math.round(camera.radius * 100) / 100);
    if (camStats.frames % 2 === 0 && cameraBlockedNow(head, cpos)) camStats.blocked++;
    if (cst) {
      cst.frames++;
      const eng = world.scene.getEngine();
      const rw = eng.getRenderWidth(), rh = eng.getRenderHeight();
      const m = world.scene.getTransformMatrix();
      const vp = camera.viewport.toGlobal(rw, rh);
      const proj = (x, y, z) => B.Vector3.Project(new B.Vector3(x, y, z), B.Matrix.Identity(), m, vp);
      const on = (x, y, z) => {
        const p = proj(x, y, z);
        return p.z > 0 && p.z < 1 && p.x > rw * 0.02 && p.x < rw * 0.98 && p.y > rh * 0.04 && p.y < rh * 0.96;
      };
      const mid = (x, y, z) => {
        const p = proj(x, y, z);
        return p.z > 0 && p.z < 1 && p.x > rw * 0.08 && p.x < rw * 0.92 && p.y >= rh * 0.25 && p.y <= rh * 0.68;
      };
      const spotOn = on(cst.x, cst.y + 0.3, cst.z) || (cst.spots && cst.spots.some((sp) => on(sp.x, (sp.y || 0) + 0.3, sp.z)));
      const spotMid = mid(cst.x, cst.y + 0.3, cst.z) || (cst.spots && cst.spots.some((sp) => mid(sp.x, (sp.y || 0) + 0.3, sp.z)));
      if (spotOn) cst.inFrame = true;
      if (spotMid) cst.middleThird = true;
      const both = on(s.x, s.y + 1.0, s.z) && spotOn;
      if (both) {
        cst.run += dt;
        cst.best = Math.max(cst.best, cst.run);
        cst.framedFrames++;
        if (cst.glance && !cst.framedEventSent && spotMid && cst.run >= 0.05) {
          cst.framedEventSent = true;
          window.dispatchEvent(new CustomEvent("day:camera", {
            detail: { action: "glance-framed", power: cst.power, reason: cst.reason, secondsToFrame: Math.round(cst.t * 100) / 100, spot: { x: cst.x, y: cst.y, z: cst.z } },
          }));
        }
      } else cst.run = 0;
    }
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
          // Enter on the title is Play (a new player's first Play is the cold open), not a bare take
          if (day.title && day.title.showing && day.title.showing()) day.title.play("key");
          else take("key");
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (mode === "returning") {
        // A second Esc while he walks back must not reach the day's Esc = "go live", which
        // would throw a scrubbed or sped-up clock to the real time.
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (mode !== "control") return;
      if (holdIn && e.key === "Escape") {
        // a turning-point moment is playing: Esc skips it (js/moments.js), it doesn't let him go
        e.preventDefault();
        e.stopImmediatePropagation();
        if (day.moments && day.moments.skip) day.moments.skip();
        return;
      }
      if (e.key === "Escape") {
        letGo("key");
      } else {
        const k = keyOf(e);
        if (!k) {
          if (e.key === "Enter") e.preventDefault();
          return; // speeds, H and the rest still work
        }
        if (cs.cast && cs.cast.glance && performance.now() - (cs.cast.startedAt || 0) > 25) {
          cancelGlance("key:" + k, performance.now());
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
    if (cs.cast && cs.cast.glance && performance.now() - (cs.cast.startedAt || 0) > 25) {
      cancelGlance("touch:stick", performance.now());
    }
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
    if (cs.cast && cs.cast.glance && performance.now() - (cs.cast.startedAt || 0) > 25) {
      cancelGlance("touch:jump", performance.now());
    }
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
    frameOutdoors(fr, at);
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
    pushEnd();
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
    pushEnd();
    cameraGive();
    day.note(how === "catch-up" ? L.catchUp : L.back);
    mark("back", { how });
    syncUi();
  }

  /* ---------- every frame (main.js calls this before drawing) ---------- */
  // Game seconds he has really been simulated as the player's (each control step's dt, which main.js caps at 0.1 s a
  // frame): the clock a playtest measures a climb in, so a slow browser doesn't read as a stuck one.
  let simT = 0;
  let animOverride = null; // a staged beat (js/wakeup.js) names the clip he plays while it holds him
  const pilotFrame = (fr, dt) => {
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
      const inp = holdIn ? { x: 0, z: 0, sprint: false, jump: 0, hold: false } : readInput(gp);
      if (push.on && (inp.jump || inp.x || inp.z)) pushEnd();
      mover.step(dt, inp);
      simT += dt;
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
        // Day has him somewhere he can't walk to (driving, the other building). Hold returning briefly so the
        // status card stays On foot / Your move through the handback (smoke checks it), then cut — no CSS
        // fade (that blacked the canvas). ~0.35 s covers a few frames at main.js's 0.1 s dt cap.
        if (!catchUpAt) catchUpAt = since;
        if (since - catchUpAt > 0.35) {
          try { window.hawkesPlaytest && window.hawkesPlaytest.cut && window.hawkesPlaytest.cut(); } catch (e) { /* no sensor */ }
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
    /* On a slope the capsule's base sits on the surface under his middle, so the uphill foot (a stride ahead or behind)
       is inside the slab: lift the figure by how much higher the ground is a foot-length either side, eased in and out. */
    let lift = 0;
    if (s.grounded && mover.hasPhysics()) {
      // the stride grows with speed (a run's foot lands ~0.5 m ahead), so look further and allow a bigger lift
      const reach = 0.3 + Math.min(0.25, s.speed * 0.05);
      const fx = Math.sin(s.yaw) * reach;
      const fz = Math.cos(s.yaw) * reach;
      const up = Math.max(mover.floorAt(s.x + fx, s.z + fz, s.y + 0.5), mover.floorAt(s.x - fx, s.z - fz, s.y + 0.5)) - s.y;
      lift = Math.min(0.14 + (reach - 0.3), Math.max(0, up));
    }
    // up fast (landing on a ramp: the uphill foot must not sink for the frames it takes to ease in), down slowly
    const cur = s.slopeLift || 0;
    s.slopeLift = cur + (lift - cur) * Math.min(1, dt * (lift > cur ? 40 : 14));
    avatar.place(s.x, s.y + s.slopeLift, s.z, s.yaw);
    // cast / throw while a power is in his hands (js/powers.js); the walk pose otherwise
    // The cast and throw poses stand still: on the move or in the air he keeps his walk, run, jump or float (a
    // standing pose sliding along the ground reads as gliding feet).
    const wantPose = day.powers && day.powers.pose ? day.powers.pose() : null;
    const posed = wantPose && s.grounded && s.speed < 0.8 ? wantPose : null;
    // a turn of more than 90 deg is a step: he walks round (his feet move) instead of spinning on the spot
    const stepping = s.face && s.face.step && s.grounded && s.speed < 0.8;
    const shownAnim = (stepping ? "walk" : null) || posed || (animOverride && mode === "control" ? animOverride : null) || s.anim;
    avatar.play(shownAnim, posed && !stepping ? 1 : stepping ? 1.6 : s.speed, dt);
    cameraFollow(dt, { x: gp.lx, y: gp.ly });
    return { x: s.x, y: s.y, z: s.z, yaw: s.yaw, speed: s.speed, anim: shownAnim, text };
  };
  /* main.js runs this inside the render loop: a throw here stops the loop, so the clock freezes and the HUD is left in
     control mode for good. Give the day back to him instead (the error is still raised, on its own turn, so the
     playtest and the console see it) and the page keeps running. */
  day.pilot((fr, dt) => {
    try {
      return pilotFrame(fr, dt);
    } catch (err) {
      setTimeout(() => {
        throw err;
      });
      if (mode !== "schedule") {
        mode = "schedule";
        try {
          backOnDay("catch-up");
        } catch (e2) {
          syncUi();
        }
      }
      return null;
    }
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
      jumpId: s.jumpId, landId: s.landId, landDrop: s.landDrop, vy: s.vy, airTime: s.airTime || 0, slopeLift: s.slopeLift || 0,
    }),
    move: mover.move,
    /** Swing the camera so the point (x, z) is ahead of him (a tap on a neighbor's ask marker, or a world reaction): eased ~1.5 s glance. */
    frame: (x, z, y, opts) => {
      if (mode !== "control" || cine()) return false;
      const o = opts || {};
      // If a cast's own reaction glance just started (< 1.2 s ago) and this is a secondary automatic frame call (e.g. garden pots), keep the cast's sightline.
      if (!o.force && cs.cast && cs.cast.glance && cs.cast.power !== "look" && cs.cast.t < 1.2) return true;
      const gy = y == null ? 0.06 : y;
      const nowMs = performance.now();
      cs.cast = {
        t: 0, power: "look", x, y: gy, z,
        glance: true, reason: o.reason || "frame", spots: o.spots || [{ name: "frame", x, y: gy, z }],
        aimBeta: glanceBeta(x, gy, z, wantRadius),
        secs: o.secs || CAM.glanceSecs, rise: o.rise || CAM.glanceRise, fall: o.fall || CAM.glanceFall,
        startedAt: nowMs, inputAt: 0, inFrame: false, middleThird: false, framedEventSent: false,
        run: 0, best: 0, frames: 0, framedFrames: 0,
      };
      return true;
    },
    cancelGlance: (why) => cancelGlance(why || "api", performance.now()),
    /** Game seconds simulated while he's the player's (sum of the control steps' dt). */
    simTime: () => simT,
    /** The figure he's drawn as while he's the player's (the playtest's feel sensor follows its root). */
    avatar: () => avatar,
    // Playtest hook: stand him at x,z (street level) while he's the player's, so a scenario needn't walk a slow bot there.
    // opts (the cold open's roof): { from: ray start height, alpha, beta, radius: the camera behind him }
    place: (x, z, yaw, opts) => {
      if (mode !== "control") return null;
      const o = opts || {};
      const r = mover.start(x, z, yaw == null ? s.yaw : yaw, o.from);
      // A placement is a cut, not a walk: the camera's target would glide metres to him (a visible camera jump) and could be left
      // facing the wall he now stands at. Snap it to him, frame the side with the most room, and tell the playtest it was intended.
      camera.target.set(s.x, s.y + 1.35, s.z);
      if (o.alpha != null) {
        camera.alpha = o.alpha;
        if (o.beta != null) camera.beta = o.beta;
        if (o.radius != null) wantRadius = o.radius;
      } else frameOutdoors({}, { x: s.x, z: s.z });
      lastRadius = null;
      camReset();
      // A take with no frame since (cs.watch still holds the day camera's pose, maybe the office, 40 m away): the placement
      // supersedes it, or the next frame's startBlend would snap the camera back there and blend in from it.
      cs.watch = null;
      try { window.hawkesPlaytest && window.hawkesPlaytest.cut && window.hawkesPlaytest.cut(); } catch (e) { /* no sensor */ }
      return r;
    },
    ride: RIDE,
    /** The camera's own report (the playtest): turn rate, camera-inside frames, cast framing, the numbers it runs on. */
    camera: () => ({
      ...camStats, casts: camStats.casts.slice(), glances: camStats.glances.slice(),
      yawCapDeg: CAM.yawCapDeg, blendSecs: CAM.blendSecs, recenterAfter: CAM.recenterAfter,
      blending: !!cs.blend, casting: cs.cast ? cs.cast.power : null,
      glancing: !!(cs.cast && cs.cast.glance),
      glance: cs.cast && cs.cast.glance ? {
        power: cs.cast.power, reason: cs.cast.reason, t: Math.round(cs.cast.t * 100) / 100,
        x: cs.cast.x, y: cs.cast.y, z: cs.cast.z, spots: cs.cast.spots || [],
        inFrame: !!cs.cast.inFrame, middleThird: !!cs.cast.middleThird,
        framedSeconds: Math.round(cs.cast.best * 100) / 100,
      } : null,
      alpha: camera.alpha, beta: camera.beta, radius: camera.radius,
      behind: Math.atan2(-Math.cos(s.yaw), -Math.sin(s.yaw)), lookDown: cs.lookDown || 0,
    }),
    resetCameraStats: () => {
      firstCastSeen.clear();
      Object.assign(camStats, { frames: 0, inside: 0, blocked: 0, maxYawDegPerSec: 0, maxPitchDegPerSec: 0, minClear: 99, casts: [], glances: [], lastGlanceCancelMs: null, recentres: 0, lookDrags: 0, dipMax: 0 });
    },
    log: () => log.slice(),
    take: () => take("console"),
    push: (spec) => pushStart(spec),
    hold: (on) => { holdIn = !!on; return holdIn; },
    /** A staged beat shows this clip instead of his movement clip (null clears it). */
    /** Turn in place toward a world yaw (js/powers.js before a cast). */
    face: (yaw) => (mode === "control" ? mover.face(yaw) : null),
    anim: (name) => { animOverride = name || null; return animOverride; },
    pushing: () => push.on,
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
