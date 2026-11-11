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
  const st = { lawn: "straw", scattered: 0, coins: 0, creaks: 0, ripples: 0, drinks: 0 };
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
  const setLawn = (s) => {
    st.lawn = s;
    lawn.material = s === "damp" ? dampM : strawM;
    lawn.visibility = s === "damp" ? 0.3 : 0.55;
    emit("lawn", { state: s });
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

  const me = () => (day.control && day.control.mode() === "control" ? day.control.state() : null);
  let t = 0;
  let nextRipple = 0;
  let creakCool = 0;
  let wasOn = false;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    t += dt;
    const w = (window.weather && window.weather.now && window.weather.now()) || { state: "clear" };
    const wet = w.state === "rain" || w.state === "storm";
    // ripples
    rings.forEach((r) => {
      r.t += dt * (wet ? 1.6 : 0.7);
      const k = (r.t % 3) / 3;
      if (k < dt * 0.7 && r.t > 1) { r.ox = (Math.random() - 0.5) * 6; r.oz = (Math.random() - 0.5) * 6; st.ripples++; }
      r.m.position.set(POND.x + r.ox, 0.095, POND.z + r.oz);
      r.m.scaling.set(0.4 + k * 2.6, 1, 0.4 + k * 2.6);
      r.m.material.alpha = (1 - k) * 0.7;
    });
    if (t > nextRipple) { nextRipple = t + 6; emit("ripple", {}); }
    // pigeons
    pigeons.forEach((p) => {
      if (p.fly >= 0) {
        p.fly += dt;
        p.root.position.x += p.vx * dt * 6;
        p.root.position.z += p.vz * dt * 6;
        p.root.position.y += (p.fly < 1.2 ? 4 : -0.2) * dt;
        if (p.fly > 14) { p.root.position.set(p.hx, 3.0, p.hz); p.fly = -1; }
      } else p.root.position.y = 3.0 + Math.sin(t * 2 + p.a) * 0.01 + (Math.sin(t * 0.7 + p.a * 3) > 0.96 ? 0.03 : 0);
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
      setLawn("damp");
      sfx("pad");
      sfx("rumble");
      emit("birdie-rain", {});
    }
  });

  const api = {
    now: () => ({ ...st, pigeons: pigeons.filter((p) => p.fly < 0).length }),
    scatter,
    setLawn,
  };
  day.slice = api;
  return api;
}

const live = typeof window !== "undefined" && window.day && window.day.world && window.day.world();
if (live) installSlice(window.day, live);
