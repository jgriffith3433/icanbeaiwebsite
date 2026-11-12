/* ==========================================================================
   Neighbor personal arcs — 3-beat heart events for Birdie, Dex and Ines
   (data in day.config.js `neighbors.arcs`; progress in js/memory.js `arcs`).
   Each beat leaves a persistent world prop; beat 3 is the lasting mark.
   Pure helpers exported for scripts/check-neighbors.mjs.
   ========================================================================== */

/** Empty progress map (0 = not started). */
export function emptyArcs() {
  return { birdie: 0, dex: 0, quill: 0 };
}

/** Clamp a beat index 0..3. */
export function clampBeat(n) {
  const v = Number(n) || 0;
  return v < 0 ? 0 : v > 3 ? 3 : (v | 0);
}

/** Next beat number to play (1..3), or 0 if the arc is done. */
export function nextBeat(progress) {
  const p = clampBeat(progress);
  return p >= 3 ? 0 : p + 1;
}

/** Does this power answer an ask beat? */
export function powerMatches(beat, power, action) {
  if (!beat) return false;
  const p = power || action;
  if (!p) return false;
  if (beat.ability && (p === beat.ability || action === beat.ability)) return true;
  const list = beat.abilities || [];
  return list.includes(p) || list.includes(action);
}

/** All voiced lines across the arcs config (for dialogue sync + checks). */
export function arcLines(arcsCfg) {
  const out = [];
  const list = (arcsCfg && arcsCfg.list) || {};
  Object.keys(list).forEach((id) => {
    (list[id].beats || []).forEach((b) => {
      (b.lines || []).forEach((L) => out.push({ id: b.id, who: L.who, text: L.text }));
      if (b.text) out.push({ id: b.id + "-ask", who: null, text: b.text, neighborId: id });
      if (b.thanks) out.push({ id: b.id + "-thanks", who: null, text: b.thanks, neighborId: id });
    });
  });
  return out;
}

/** Hex → Color3 helper that works with a BABYLON namespace. */
function col(B, hex, emis) {
  const m = new B.StandardMaterial("arc-m-" + hex + (emis || ""), null);
  m.diffuseColor = B.Color3.FromHexString(hex);
  m.specularColor = B.Color3.Black();
  if (emis) m.emissiveColor = B.Color3.FromHexString(hex).scale(emis);
  return m;
}

/**
 * Build (or rebuild) the world props that show each neighbour's arc progress.
 * Returns { root, info } where info lists visible marks for the playtest.
 */
export function buildArcProps(B, scene, world, arcs, progress) {
  const root = new B.TransformNode("nb-arc-props", scene);
  const mats = {};
  const mat = (hex, emis) => {
    const k = hex + ":" + (emis || 0);
    if (!mats[k]) {
      const m = new B.StandardMaterial("arc-" + k, scene);
      m.diffuseColor = B.Color3.FromHexString(hex);
      m.specularColor = B.Color3.Black();
      if (emis) m.emissiveColor = B.Color3.FromHexString(hex).scale(emis);
      mats[k] = m;
    }
    return mats[k];
  };
  const surf = (x, z) => {
    try { return world && world.surfaceAt ? world.surfaceAt(x, z) : 0; } catch (e) { return 0; }
  };
  const box = (name, w, h, d, x, y, z, m) => {
    const q = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    q.position.set(x, y, z);
    q.material = m;
    q.isPickable = false;
    q.parent = root;
    return q;
  };
  const cyl = (name, r, h, x, y, z, m) => {
    const q = B.MeshBuilder.CreateCylinder(name, { diameter: r * 2, height: h, tessellation: 10 }, scene);
    q.position.set(x, y, z);
    q.material = m;
    q.isPickable = false;
    q.parent = root;
    return q;
  };
  const info = { birdie: [], dex: [], quill: [], ribbon: false, openSign: false, chartBeacon: false };
  const p = {
    birdie: clampBeat(progress && progress.birdie),
    dex: clampBeat(progress && progress.dex),
    quill: clampBeat(progress && progress.quill),
  };

  /* ---- Birdie: pots at −21, 9.5 (wilted until rain saves them, including before beat 1); balcony ribbon; basket ---- */
  {
    const wilt = p.birdie < 2;
    const potM = mat(wilt ? "#6a4a2a" : "#3f7a3a");
    const fruitM = mat(wilt ? "#5a4030" : "#c23a2a", wilt ? 0 : 0.15);
    for (let i = 0; i < 3; i++) {
      const x = -22.2 + i * 0.85;
      const z = 9.15;
      const y = surf(x, z);
      cyl("arc-pot-" + i, 0.22, 0.35, x, y + 0.18, z, mat("#5a3a22"));
      // plant / wilted stem — visible before she speaks so the crisis is in the world
      box("arc-stem-" + i, 0.06, wilt ? 0.25 : 0.55, 0.06, x, y + 0.35 + (wilt ? 0.12 : 0.28), z, potM);
      if (!wilt) {
        const f = B.MeshBuilder.CreateSphere("arc-tom-" + i, { diameter: 0.22, segments: 4 }, scene);
        f.position.set(x + 0.08, y + 0.85, z);
        f.material = fruitM;
        f.isPickable = false;
        f.parent = root;
      }
    }
    info.birdie.push(wilt ? "wiltPots" : "greenPots");
  }
  if (p.birdie >= 3) {
    // ribbon on the apt balcony / north face (west of the ramp), readable from the stoop
    const rx = -29.2, rz = 6.72, ry = 3.35;
    box("arc-ribbon-bow", 0.55, 0.18, 0.08, rx, ry, rz, mat("#c23a2a", 0.35));
    box("arc-ribbon-tail-l", 0.12, 0.55, 0.05, rx - 0.18, ry - 0.28, rz, mat("#c23a2a", 0.25));
    box("arc-ribbon-tail-r", 0.12, 0.55, 0.05, rx + 0.18, ry - 0.28, rz, mat("#c23a2a", 0.25));
    // basket at his door (apt stoop)
    const bx = -26.2, bz = 9.35, by = surf(bx, bz);
    cyl("arc-basket", 0.28, 0.32, bx, by + 0.16, bz, mat("#8a5a2a"));
    box("arc-basket-handle", 0.32, 0.04, 0.04, bx, by + 0.42, bz, mat("#6a4020"));
    for (let i = 0; i < 4; i++) {
      const f = B.MeshBuilder.CreateSphere("arc-basket-tom-" + i, { diameter: 0.16, segments: 4 }, scene);
      f.position.set(bx + (i % 2) * 0.12 - 0.06, by + 0.28 + (i > 1 ? 0.1 : 0), bz + (i > 1 ? 0.08 : -0.04));
      f.material = mat("#c23a2a", 0.2);
      f.isPickable = false;
      f.parent = root;
    }
    info.birdie.push("ribbon", "basket");
    info.ribbon = true;
  }

  /* ---- Dex: shop-roof turbines (stalled until a gust, including before beat 1) + lit OPEN sign ---- */
  const turbines = [];
  {
    const spin = p.dex >= 2;
    for (let i = 0; i < 2; i++) {
      const x = 48 + i * 3.2, z = 1.2, y = 3.55;
      cyl("arc-turb-pole-" + i, 0.06, 1.1, x, y + 0.55, z, mat("#8a8f98"));
      const hub = cyl("arc-turb-hub-" + i, 0.12, 0.16, x, y + 1.15, z, mat("#c8cdd6"));
      hub.rotation.z = Math.PI / 2;
      const blades = new B.TransformNode("arc-turb-blades-" + i, scene);
      blades.parent = root;
      blades.position.set(x, y + 1.15, z);
      for (let b = 0; b < 3; b++) {
        const blade = B.MeshBuilder.CreateBox("arc-blade-" + i + "-" + b, { width: 0.08, height: 0.9, depth: 0.12 }, scene);
        blade.parent = blades;
        blade.position.y = 0.35;
        blade.rotation.z = (b * Math.PI * 2) / 3;
        blade.material = mat(spin ? "#e8eef8" : "#5a6068", spin ? 0.15 : 0);
        blade.isPickable = false;
      }
      turbines.push({ blades, spin });
    }
    info.dex.push(spin ? "turbinesSpin" : "turbinesStill");
  }
  if (p.dex >= 3) {
    // lit OPEN sign on the shop front (south face toward the avenue)
    const sx = 50, sz = 6.55, sy = 2.4;
    const board = box("arc-open-board", 1.6, 0.55, 0.08, sx, sy, sz, mat("#1a1020"));
    // letter bars as emissive blocks spelling OPEN (readable left-to-right from the avenue)
    const letterM = mat("#ff9a3a", 0.95);
    const letters = [
      // O
      [sx - 0.55, sy, 0.28, 0.28],
      // P
      [sx - 0.18, sy, 0.18, 0.32],
      // E
      [sx + 0.18, sy, 0.18, 0.32],
      // N
      [sx + 0.55, sy, 0.22, 0.32],
    ];
    letters.forEach((L, i) => {
      box("arc-open-L" + i, L[2], L[3], 0.06, L[0], L[1], sz + 0.06, letterM);
    });
    info.dex.push("openSign");
    info.openSign = true;
    void board;
  }

  /* ---- Ines: blank chart easel before she speaks; filled after the fog reading ---- */
  {
    const filled = p.quill >= 2;
    const cx = 152.8, cz = 9.6, cy = surf(cx, cz);
    box("arc-easel-leg-l", 0.06, 1.1, 0.06, cx - 0.25, cy + 0.55, cz, mat("#5a4030"));
    box("arc-easel-leg-r", 0.06, 1.1, 0.06, cx + 0.25, cy + 0.55, cz, mat("#5a4030"));
    const chart = box("arc-chart", 0.7, 0.55, 0.04, cx, cy + 1.15, cz + 0.05, mat(filled ? "#1a2038" : "#d8d2c4"));
    if (filled) {
      box("arc-chart-mark", 0.35, 0.08, 0.03, cx, cy + 1.2, cz + 0.08, mat("#9fd4ff", 0.55));
      box("arc-chart-dot", 0.1, 0.1, 0.03, cx + 0.15, cy + 1.05, cz + 0.08, mat("#c8b0ff", 0.7));
    }
    info.quill.push(filled ? "readingChart" : "blankChart");
    void chart;
  }
  if (p.quill >= 3) {
    // chart also "in the window" — a lit panel on the annex face
    box("arc-win-chart", 0.9, 0.7, 0.06, 154, 2.6, 6.55, mat("#1a2038", 0.2));
    box("arc-win-mark", 0.5, 0.1, 0.04, 154, 2.7, 6.6, mat("#9fd4ff", 0.8));
    // violet roof beacon
    const bx = 157, bz = 2.5, by = 5.9;
    cyl("arc-beacon-pole", 0.05, 0.8, bx, by + 0.4, bz, mat("#4a4060"));
    const glow = B.MeshBuilder.CreateSphere("arc-beacon", { diameter: 0.35, segments: 8 }, scene);
    glow.position.set(bx, by + 0.95, bz);
    glow.material = mat("#a078ff", 1.1);
    glow.isPickable = false;
    glow.parent = root;
    info.quill.push("chartBeacon");
    info.chartBeacon = true;
  }

  return { root, info, turbines, mats };
}

/** Spin Dex's turbines each frame when beat >= 2. */
export function stepArcProps(built, dt) {
  if (!built || !built.turbines) return;
  built.turbines.forEach((t) => {
    if (t.spin && t.blades) t.blades.rotation.x += dt * 4.2;
  });
}

void col;
