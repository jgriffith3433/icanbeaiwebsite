/* ==========================================================================
   Vertical slice: West Avenue Home Block + the Park (docs/world-bible.md).
   Always-on dressing and life, not owned by an episode: the apt crown light strip and Birdie's tomato wall, a
   day-keyed lawn (straw, then damp once Birdie's rain is answered), pond ripples, pigeons on the bandstand that
   scatter when he walks up or a Gust / bolt lands, a coin toss at the pond (Y) and the bandstand's creak.
   Every one is an event on `day:slice` (the playtest's quiet-gap meter listens). `day.slice.now()`.
   ========================================================================== */
const B = typeof window !== "undefined" ? window.BABYLON : null;

export const BAND = { x: -18, z: 41 };
export const POND = { x: 15, z: 60 };

export function installSlice(day, world) {
  if (!day || !world || !world.scene || !B) return null;
  const scene = world.scene;
  const mat = (name, hex, glow) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    m.specularColor = B.Color3.Black();
    if (glow) m.emissiveColor = B.Color3.FromHexString(hex).scale(glow);
    return m;
  };
  const st = { lawn: "straw", lawnK: 0, lawnShown: 0, pond: 0.78, goal: 0, easing: false, tomatoes: 0, scattered: 0, coins: 0, creaks: 0, ripples: 0, drinks: 0 };
  const emit = (action, detail) => {
    try { window.dispatchEvent(new window.CustomEvent("day:slice", { detail: Object.assign({ action }, detail) })); } catch (e) { /* node */ }
  };
  const sfx = (n, ...a) => { try { day.sfx && day.sfx.play(n, ...a); } catch (e) { /* no sound */ } };

  // apt crown: a warm light strip on the parapet (roof 6.16) and a tomato wall of red fruit on the north face
  const strip = B.MeshBuilder.CreateBox("slice-crown", { width: 15.6, height: 0.16, depth: 0.16 }, scene);
  strip.position.set(-24, 6.16 + 0.55, 6.4);
  strip.material = mat("slice-crown-m", "#ffcf7a", 0.9);
  strip.isPickable = false;
  const wallM = mat("slice-tomato-m", "#c23a2a", 0.25);
  const leafM = mat("slice-leaf-m", "#3f7a3a");
  /* The wall stays west of the roof ramp (x -28.5..-17, z 6.475..8.2): the ramp's slab and its wedge fill that part of
     the north face, so the vines and fruit that used to run along it were buried in the wedge and poked through the
     ramp, and clipped into him as he walked up (playtest: "lower body passes into the green wall and red slab").
     The panels are solid from the wall out (flush at z 6.5, so the facade's window panes behind them are covered, not
     poking through), and the fruit sits on them. */
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const f = B.MeshBuilder.CreateSphere("slice-tom", { diameter: 0.34, segments: 4 }, scene);
      f.position.set(-31.5 + i * 0.8 + (j % 2) * 0.2, 0.9 + j * 0.8, 6.78);
      f.material = wallM;
      f.isPickable = false;
    }
    const l = B.MeshBuilder.CreateBox("slice-vine", { width: 0.7, height: 3.5, depth: 0.2 }, scene);
    l.position.set(-31.5 + i * 0.8, 0.08 + 1.75, 6.6);
    l.material = leafM;
    l.isPickable = false;
  }

  // lawn overlay (a thin cover on the park lawn: straw by day-key start, damp after the rain)
  const lawn = B.MeshBuilder.CreateBox("slice-lawn", { width: 62, height: 0.012, depth: 46 }, scene);
  lawn.position.set(-2, 0.057, 44);
  const strawM = mat("slice-straw", "#8a7c45");
  const dampM = mat("slice-damp", "#2f5a38");
  lawn.material = strawM;
  lawn.isPickable = false;
  lawn.visibility = 0.55;
  /* `k` (0..1) is how fresh the water is (js/memory.js fades it over three real days); `quiet` = a restore, no event. */
  const blendM = mat("slice-blend", "#8a7c45");
  const strawC = B.Color3.FromHexString("#8a7c45");
  const dampC = B.Color3.FromHexString("#2f5a38");
  /* The lawn greens and the pond fills over a few seconds (LAWN_SECS) toward `goal`; `instant` (a reload, a restore, a quality
     change) jumps. `quiet` = no event. The pond is a mud ring (the dry bed, 5 mm over the old water) with a water disc on
     top that grows from 78% to the full 5 m and rises 4 mm (planes 5 and 10 mm clear of each other: no z-fighting). */
  const LAWN_SECS = 5;
  const paint = (f) => {
    st.lawnShown = +f.toFixed(3);
    if (f >= 1) lawn.material = dampM;
    else if (f <= 0) lawn.material = strawM;
    else { blendM.diffuseColor = B.Color3.Lerp(strawC, dampC, f); lawn.material = blendM; }
    lawn.visibility = 0.55 + (0.3 - 0.55) * f;
    const e = f * f * (3 - 2 * f);
    pondWater.scaling.set(0.78 + 0.22 * e, 1, 0.78 + 0.22 * e);
    pondWater.position.y = 0.1 + 0.004 * e;
    mudM.alpha = 1 - 0.85 * e;
    st.pond = +(0.78 + 0.22 * e).toFixed(3);
  };
  const setLawn = (s, k, quiet, instant) => {
    const f = s === "damp" ? (k == null ? 1 : Math.max(0, Math.min(1, k))) : 0;
    st.lawn = s === "damp" && f > 0 ? "damp" : "straw";
    st.lawnK = +f.toFixed(2);
    st.goal = f;
    if (instant || scene.getEngine().getDeltaTime == null) { cur = f; paint(f); }
    else if (!quiet || Math.abs(cur - f) > 1e-3) st.easing = true;
    if (!quiet) emit("lawn", { state: st.lawn });
  };
  let cur = 0;
  /* The wet layer: a Rain cast darkens the lawn and spreads the pond within WET_SECS (1.6 s), wherever he stands, and it dries
     off over WET_DRY s once the player's rain is gone. It sits on top of the slower lawn above (the shown value is the larger). */
  const WET_SECS = 1.6;
  const WET_DRY = 24;
  const WET_LEVEL = 0.85;
  let wet = 0;
  let wetOn = false;
  let wetAt = 0;
  const mudM = mat("slice-mud", "#5a4a30");
  mudM.alpha = 1;
  const pondMud = B.MeshBuilder.CreateCylinder("slice-pond-mud", { diameter: 10, height: 0.004, tessellation: 40 }, scene);
  pondMud.position.set(15, 0.092, 60);
  pondMud.material = mudM;
  pondMud.isPickable = false;
  const pondWater = B.MeshBuilder.CreateCylinder("slice-pond-water", { diameter: 10, height: 0.004, tessellation: 40 }, scene);
  pondWater.position.set(15, 0.1, 60);
  pondWater.material = mat("slice-pond-water", "#1d4a63", 0.25);
  pondWater.isPickable = false;
  paint(0);
  // fuller tomato wall after Birdie's rain: a second set of fruit between the first (js/memory.js sets how many by freshness)
  const extra = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    const f = B.MeshBuilder.CreateSphere("slice-tom-extra", { diameter: 0.4, segments: 4 }, scene);
    f.position.set(-31.1 + i * 0.8 + (j % 2) * 0.2, 1.3 + j * 0.8, 6.8);
    f.material = wallM;
    f.isPickable = false;
    f.setEnabled(false);
    extra.push(f);
  }
  const setTomatoes = (k) => {
    const n = Math.round(extra.length * Math.max(0, Math.min(1, k || 0)));
    extra.forEach((f, i) => f.setEnabled(i < n));
    st.tomatoes = n;
  };

  // pond ripples: rings that grow and fade
  const rings = [];
  const ringM = mat("slice-ring", "#9fd2e8", 0.6);
  for (let i = 0; i < 3; i++) {
    const r = B.MeshBuilder.CreateTorus("slice-ripple", { diameter: 1, thickness: 0.06, tessellation: 20 }, scene);
    r.material = ringM.clone("slice-ring" + i);
    r.material.alpha = 0;
    r.isPickable = false;
    rings.push({ m: r, t: i * 1.4, ox: 0, oz: 0 });
  }

  // pigeons on the bandstand rail
  const birdM = mat("slice-pigeon", "#8d93a0");
  const pigeons = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const root = new B.TransformNode("slice-pigeon", scene);
    const body = B.MeshBuilder.CreateSphere("slice-pb", { diameterX: 0.3, diameterY: 0.2, diameterZ: 0.2, segments: 4 }, scene);
    body.parent = root;
    body.material = birdM;
    const head = B.MeshBuilder.CreateSphere("slice-ph", { diameter: 0.12, segments: 4 }, scene);
    head.parent = root;
    head.position.set(0.17, 0.1, 0);
    head.material = birdM;
    const hx = BAND.x + Math.cos(a) * 2.7;
    const hz = BAND.z + Math.sin(a) * 2.7;
    root.position.set(hx, 0.3 + 2.6 + 0.1, hz);
    root.rotation.y = -a;
    pigeons.push({ root, hx, hz, a, fly: -1, vx: Math.cos(a), vz: Math.sin(a), wait: 0 });
  }
  const scatter = (why) => {
    const live = pigeons.filter((p) => p.fly < 0);
    if (!live.length) return;
    live.forEach((p) => (p.fly = 0));
    st.scattered++;
    sfx("blip");
    sfx("lift");
    emit("pigeons", { why });
  };
  /** Bring pigeons back to a perch (bandstand rail, or fly them onto the apt roof after a Sun-break clearing). */
  const land = (why) => {
    const APT = { x: -24, y: 12.35, z: 0.5 };
    let n = 0;
    pigeons.forEach((p, i) => {
      if (why === "aftermath") {
        const a = (i / pigeons.length) * Math.PI * 2;
        p.fromX = p.root.position.x;
        p.fromY = Math.max(p.root.position.y, 3);
        p.fromZ = p.root.position.z;
        p.hx = APT.x + Math.cos(a) * 2.4;
        p.hz = APT.z + Math.sin(a) * 2.4;
        p.homeY = APT.y;
        p.fly = 0;
        p.landHome = true;
        n++;
      } else if (p.fly >= 0) {
        p.root.position.set(p.hx, p.homeY != null ? p.homeY : 3.0, p.hz);
        p.fly = -1;
        n++;
      }
    });
    if (n) {
      st.landed = (st.landed || 0) + n;
      sfx("blip");
      emit("pigeons-land", { why, n });
    }
    return n;
  };

  const me = () => (day.control && day.control.mode() === "control" ? day.control.state() : null);
  let t = 0;
  let nextRipple = 0;
  let creakCool = 0;
  let wasOn = false;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    t += dt;
    if (st.easing) {
      const d = st.goal - cur;
      const stp = dt / LAWN_SECS;
      cur = Math.abs(d) <= stp ? st.goal : cur + Math.sign(d) * stp;
      paint(Math.max(cur, drench));
      if (cur === st.goal) { st.easing = false; emit("lawn-done", { k: st.goal }); }
    }
    const w = (window.weather && window.weather.now && window.weather.now()) || { state: "clear" };
    const wet = w.state === "rain" || w.state === "storm";
    if (drenchOn && !(w.manual && wet)) drenchOn = false;
    const dGoal = drenchOn ? DRENCH_LEVEL : 0;
    if (drench !== dGoal) {
      const stp = (dt / (drenchOn ? DRENCH_SECS : DRENCH_DRY)) * DRENCH_LEVEL;
      drench = Math.abs(dGoal - drench) <= stp ? dGoal : drench + Math.sign(dGoal - drench) * stp;
      if (!st.easing) paint(Math.max(cur, drench));
      st.drench = +drench.toFixed(3);
    }
    // ripples
    rings.forEach((r) => {
      r.t += dt * (wet ? 1.6 : 0.7);
      const k = (r.t % 3) / 3;
      if (k < dt * 0.7 && r.t > 1) { r.ox = (Math.random() - 0.5) * 6; r.oz = (Math.random() - 0.5) * 6; st.ripples++; }
      r.m.position.set(POND.x + r.ox, 0.11, POND.z + r.oz);
      r.m.scaling.set(0.4 + k * 2.6, 1, 0.4 + k * 2.6);
      r.m.material.alpha = (1 - k) * 0.7;
    });
    if (t > nextRipple) { nextRipple = t + 6; emit("ripple", {}); }
    // pigeons
    pigeons.forEach((p) => {
      const homeY = p.homeY != null ? p.homeY : 3.0;
      if (p.fly >= 0) {
        p.fly += dt;
        if (p.landHome) {
          // arc toward the roof perch (Sun-break aftermath)
          const u = Math.min(1, p.fly / 3.2);
          const ease = u * u * (3 - 2 * u);
          const loft = Math.sin(u * Math.PI) * 4.5;
          p.root.position.x = p.fromX + (p.hx - p.fromX) * ease;
          p.root.position.z = p.fromZ + (p.hz - p.fromZ) * ease;
          p.root.position.y = p.fromY + (homeY - p.fromY) * ease + loft;
          if (u >= 1) {
            p.root.position.set(p.hx, homeY, p.hz);
            p.fly = -1;
            p.landHome = false;
          }
        } else {
          p.root.position.x += p.vx * dt * 6;
          p.root.position.z += p.vz * dt * 6;
          p.root.position.y += (p.fly < 1.2 ? 4 : -0.2) * dt;
          if (p.fly > 14) { p.root.position.set(p.hx, homeY, p.hz); p.fly = -1; }
        }
      } else p.root.position.y = homeY + Math.sin(t * 2 + p.a) * 0.01 + (Math.sin(t * 0.7 + p.a * 3) > 0.96 ? 0.03 : 0);
    });
    const s = me();
    if (s) {
      if (Math.hypot(s.x - BAND.x, s.z - BAND.z) < 6.5) scatter("walk-up");
      const on = Math.hypot(s.x - BAND.x, s.z - BAND.z) < 3.2 && s.y < 0.9;
      creakCool -= dt;
      if (on && !wasOn && creakCool <= 0) {
        creakCool = 4; st.creaks++;
        sfx("thud");
        sfx("tick");
        emit("creak", {});
      }
      wasOn = on;
    }
  });

  // coin toss at the pond (Y), a non-weather verb: it costs no Pressure
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyY" || e.repeat) return;
    const s = me();
    if (!s || Math.hypot(s.x - POND.x, s.z - POND.z) > 9) return;
    st.coins++;
    sfx("chimeUp");
    const r = rings[st.coins % rings.length];
    r.t = 0; r.ox = (s.x - POND.x) * 0.4; r.oz = (s.z - POND.z) * 0.4;
    emit("coin", { n: st.coins });
  });

  // reactions to the player's weather, and Birdie's rain as the slice's story beat
  window.addEventListener("day:power", (e) => {
    const d = e.detail || {};
    if (d.action === "denied") return;
    const p = d.power || d.id || d.name;
    if (p === "gust" || p === "bolt" || p === "lightning" || p === "storm") {
      const c = me();
      if (c && Math.hypot(c.x - BAND.x, c.z - BAND.z) < 40) scatter(p);
    }
  });
  window.addEventListener("day:neighbor", (e) => {
    const d = e.detail || {};
    if (d.action === "reward" && (d.id === "birdie" || d.neighbor === "birdie" || d.who === "birdie")) {
      st.drinks++;
      if (!(day.memory && day.memory.now)) setLawn("damp"); // js/memory.js (if it's up) sets the lawn and the fruit from the store
      sfx("pad");
      sfx("rumble");
      emit("birdie-rain", {});
    }
  });

  const api = {
    now: () => ({ ...st, pigeons: pigeons.filter((p) => p.fly < 0).length, landed: st.landed || 0 }),
    scatter,
    land,
    setLawn,
    setTomatoes,
    /** A Rain cast: the lawn darkens and the pond spreads within 1.6 s (js/powers.js `weatherCall`). */
    drench: (on) => { drenchOn = on !== false; if (drenchOn) emit("drench", {}); },
  };
  day.slice = api;
  return api;
}

const live = typeof window !== "undefined" && window.day && window.day.world && window.day.world();
if (live) installSlice(window.day, live);
