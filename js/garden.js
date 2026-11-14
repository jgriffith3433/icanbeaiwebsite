/* ==========================================================================
   Birdie's garden, told as action (docs/world-bible.md, the street teaches). Before anyone says a word the apt stoop
   shows what she is asking for: a row of planters whose leaves hang brown and limp, tomato stems bent over, and tufts of
   dry grass lying flat on the park lawn. The player's Rain (within `RANGE` m of the stoop) revives them in front of him:
   the leaves lift and go green pot by pot, the tufts stand up, red fruit swells. Her voiced thanks (js/street.js) is the
   afterthought: it lands 1.1 s after the cast, while they are still lifting. It wilts again on the next real date
   (localStorage `icanbe.garden` = the date it was revived). Pure maths exported for scripts/check-garden.mjs.
   `day.garden`: now(), revive(), wilt(). Events `day:garden` (seen / revive / done).
   ========================================================================== */

/** Pose at freshness k (0 wilted .. 1 revived): leaf droop (rad, 0 = out), stem lean (rad), leaf colour, fruit scale. */
export function gardenPose(k) {
  const e = Math.max(0, Math.min(1, k || 0));
  const s = e * e * (3 - 2 * e);
  return { droop: 1.45 - 1.1 * s, lean: 0.55 * (1 - s), grow: 0.78 + 0.22 * s, fruit: Math.min(1, Math.max(0, (s - 0.55) / 0.45)), color: [0.54 + (0.22 - 0.54) * s, 0.46 + (0.62 - 0.46) * s, 0.2 + (0.26 - 0.2) * s] };
}
/** Each planter lifts a little after the one before it (stagger 0..1 over the row). */
export function staggerK(k, i, n, spread) {
  const sp = spread == null ? 0.35 : spread;
  const d = n > 1 ? (i / (n - 1)) * sp : 0;
  return Math.max(0, Math.min(1, (k - d) / (1 - sp)));
}

export const POTS = [-20.1, -19.3, -18.5, -17.7].map((x) => ({ x, z: 9.15 }));
export const RANGE = 45;
export const REVIVE_SECS = 2.4;
const KEY = "icanbe.garden";

export function installGarden(day, world) {
  const B = typeof window !== "undefined" ? window.BABYLON : null;
  if (!day || !world || !world.scene || !B) return null;
  const scene = world.scene;
  const surf = (x, z) => { try { return world.surfaceAt ? world.surfaceAt(x, z) : 0; } catch (e) { return 0; } };
  const date = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
  const mat = (name, hex) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    m.specularColor = B.Color3.Black();
    return m;
  };
  const leafM = mat("garden-leaf", "#8a7633");
  const tuftM = mat("garden-tuft", "#9a8a44");
  const stemM = mat("garden-stem", "#6e5a2e");
  const potM = mat("garden-pot", "#7a4a2a");
  const fruitM = mat("garden-fruit", "#c23a2a");
  fruitM.emissiveColor = B.Color3.FromHexString("#c23a2a").scale(0.15);
  const soilM = mat("garden-soil", "#3a2a1a");
  const mk = (m, parent) => { m.isPickable = false; if (parent) m.parent = parent; return m; };

  const plants = POTS.map((p, i) => {
    const y = surf(p.x, p.z);
    const pot = mk(B.MeshBuilder.CreateCylinder("garden-pot-" + i, { diameterTop: 0.5, diameterBottom: 0.38, height: 0.4, tessellation: 12 }, scene));
    pot.position.set(p.x, y + 0.2, p.z);
    pot.material = potM;
    const soil = mk(B.MeshBuilder.CreateCylinder("garden-soil-" + i, { diameter: 0.42, height: 0.02, tessellation: 12 }, scene));
    soil.position.set(p.x, y + 0.4 + 0.012, p.z);
    soil.material = soilM;
    // the stem pivots at the soil; leaves pivot at its top
    const root = new B.TransformNode("garden-plant-" + i, scene);
    root.position.set(p.x, y + 0.42, p.z);
    root.rotation.y = i * 1.3;
    const stem = mk(B.MeshBuilder.CreateBox("garden-stem-" + i, { width: 0.05, height: 0.7, depth: 0.05 }, scene), root);
    stem.position.y = 0.35;
    stem.material = stemM;
    const top = new B.TransformNode("garden-top-" + i, scene);
    top.parent = root;
    top.position.y = 0.7;
    const leaves = [];
    for (let j = 0; j < 4; j++) {
      const piv = new B.TransformNode("garden-piv-" + i + j, scene);
      piv.parent = top;
      piv.rotation.y = (j * Math.PI) / 2;
      const lf = mk(B.MeshBuilder.CreateBox("garden-leaf-" + i + j, { width: 0.1, height: 0.02, depth: 0.34 }, scene), piv);
      lf.position.set(0, 0, 0.17);
      lf.material = leafM;
      leaves.push(piv);
    }
    const fruit = [0, 1].map((f) => {
      const t = mk(B.MeshBuilder.CreateSphere("garden-tom-" + i + f, { diameter: 0.17, segments: 4 }, scene), root);
      t.position.set(f ? -0.12 : 0.12, 0.58 - f * 0.1, 0.04);
      t.material = fruitM;
      return t;
    });
    return { root, top, leaves, fruit };
  });

  // dry tufts on the park lawn (overlay top 6.3 cm): they lie flat and straw-coloured until the rain
  const tufts = [];
  for (let i = 0; i < 40; i++) {
    const a = i * 2.399;
    const r = 3 + ((i * 37) % 22);
    const x = -6 + Math.cos(a) * r * 1.2, z = 33 + Math.sin(a) * r * 0.55;
    const piv = new B.TransformNode("garden-tuft-" + i, scene);
    piv.position.set(x, 0.066, z);
    piv.rotation.y = a * 3;
    const blade = mk(B.MeshBuilder.CreateBox("garden-blade-" + i, { width: 0.05, height: 0.4, depth: 0.02 }, scene), piv);
    blade.position.y = 0.2;
    blade.material = tuftM;
    const blade2 = mk(B.MeshBuilder.CreateBox("garden-blade2-" + i, { width: 0.05, height: 0.32, depth: 0.02 }, scene), piv);
    blade2.position.set(0.07, 0.16, 0);
    blade2.rotation.z = -0.25;
    blade2.material = tuftM;
    tufts.push(piv);
  }

  const st = { k: 0, goal: 0, seen: false, revived: false, rest: 0, revives: 0, castAt: 0 };
  const emit = (action, extra) => { try { window.dispatchEvent(new window.CustomEvent("day:garden", { detail: Object.assign({ action }, extra || {}) })); } catch (e) { /* node */ } };
  let revivedOn = null;
  try { revivedOn = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (revivedOn && revivedOn === date()) { st.revived = true; st.rest = 1; st.k = st.goal = 1; }

  const apply = () => {
    const base = gardenPose(st.k);
    leafM.diffuseColor.set(base.color[0], base.color[1], base.color[2]);
    tuftM.diffuseColor.set(base.color[0] + 0.04, base.color[1] + 0.02, base.color[2]);
    plants.forEach((p, i) => {
      const k = staggerK(st.k, i, plants.length);
      const q = gardenPose(k);
      p.root.rotation.z = q.lean * (i % 2 ? -1 : 1);
      p.root.rotation.x = q.lean * 0.4;
      p.root.scaling.y = q.grow;
      p.leaves.forEach((l) => { l.rotation.x = q.droop; });
      p.fruit.forEach((f) => { f.scaling.setAll(Math.max(0.001, q.fruit)); });
    });
    tufts.forEach((t, i) => {
      const q = gardenPose(staggerK(st.k, i % 8, 8, 0.5));
      t.rotation.x = q.lean * 1.5; // lying over, then standing
    });
  };
  apply();

  const hero = () => { try { return day.control && day.control.mode() === "control" ? day.control.state() : null; } catch (e) { return null; } };
  const near = () => { const h = hero(); return !!h && Math.hypot(h.x - POTS[0].x, h.z - POTS[0].z) < RANGE; };
  let was = false;
  let seenT = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    const w = (window.weather && window.weather.now && window.weather.now()) || {};
    const raining = !!w.manual && (w.state === "rain" || w.state === "storm");
    if (raining && !was && near()) {
      st.goal = 1;
      st.castAt = performance.now();
      emit("revive", { from: +st.k.toFixed(2) });
      try { day.sfx && day.sfx.play && day.sfx.play("chimeUp"); } catch (e) { /* no sound */ }
      // the camera swings to the stoop so the player watches them lift (the cast's own eased framing)
      try { day.control && day.control.frame && day.control.frame(POTS[1].x, POTS[1].z); } catch (e) { /* no control */ }
    }
    was = raining;
    if (!st.seen && hero() && near()) { seenT += dt; if (seenT > 1) { st.seen = true; emit("seen", { k: +st.k.toFixed(2) }); } }
    const goal = st.goal; // once revived it stays so for the real day
    if (st.k !== goal) {
      const stp = dt / REVIVE_SECS;
      st.k = Math.abs(goal - st.k) <= stp ? goal : st.k + Math.sign(goal - st.k) * stp;
      apply();
      if (st.k >= 1 && !st.revived) {
        st.revived = true;
        st.rest = 1;
        try { localStorage.setItem(KEY, date()); } catch (e) { /* private mode */ }
        emit("done", { secs: +((performance.now() - st.castAt) / 1000).toFixed(1) });
      }
    }
  });

  const api = {
    now: () => ({ k: +st.k.toFixed(3), goal: st.goal, seen: st.seen, revived: st.revived, plants: plants.length, tufts: tufts.length, leafG: +leafM.diffuseColor.g.toFixed(2), droop: +gardenPose(st.k).droop.toFixed(2) }),
    revive() { st.goal = 1; },
    wilt() { st.goal = 0; st.k = 0; st.revived = false; st.rest = 0; try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ } apply(); },
  };
  day.garden = api;
  window.garden = api;
  return api;
}

const live = typeof window !== "undefined" && window.day && window.day.world && window.day.world();
if (live) installGarden(window.day, live);
