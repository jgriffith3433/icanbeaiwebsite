/* ==========================================================================
   People kit — low-poly articulated figures built in code (docs/characters.md).
   buildFigure(B, scene, id, look, scale) -> { root, nodes, meshes, legs, arms, pose(phase, amount) }.
   Every limb is a named TransformNode (<id>:hipL, :kneeL, :ankleL, :shoulderR, :elbowR, :wristR, :neck, :head ...)
   with smooth-shaded Babylon primitives hanging off it, so all faces point outward. Figures face +z, feet at y 0,
   about 1.8 m tall before `scale`. Pure data in, no globals: scripts/check-neighbors.mjs builds them in a NullEngine.
   ========================================================================== */

const H = {
  hip: 0.9, // hip joint height
  thigh: 0.45,
  shin: 0.4,
  shoulder: 1.42,
  upperArm: 0.3,
  foreArm: 0.27,
  head: 0.18, // head radius
};

export function buildFigure(B, scene, id, look, scale = 1) {
  const root = new B.TransformNode("neighbor-" + id, scene);
  root.scaling.setAll(scale);
  const nodes = {};
  const meshes = [];
  const mats = {};
  const mat = (hex, glow = 0.22) => {
    const k = hex + glow;
    if (!mats[k]) {
      const m = new B.StandardMaterial("pk-" + id + k, scene);
      const c = B.Color3.FromHexString(hex);
      m.diffuseColor = c;
      m.emissiveColor = c.scale(glow);
      m.specularColor = new B.Color3(0.05, 0.05, 0.05);
      mats[k] = m;
    }
    return mats[k];
  };
  const node = (name, parent, x, y, z) => {
    const n = new B.TransformNode(id + ":" + name, scene);
    n.parent = parent;
    n.position.set(x, y, z);
    nodes[name] = n;
    return n;
  };
  const add = (m, parent, x, y, z, hex, glow) => {
    m.parent = parent;
    m.position.set(x, y, z);
    m.material = mat(hex, glow);
    m.isPickable = false;
    meshes.push(m);
    return m;
  };
  /* a capsule hanging down from its node, `len` long in total */
  const limb = (name, parent, len, r, hex, rx = 0) => add(B.MeshBuilder.CreateCapsule(id + ":" + name, { radius: r, height: len, tessellation: 10, capSubdivisions: 3 }, scene), parent, rx, -len / 2, 0, hex);
  const ball = (name, parent, d, x, y, z, hex, sy = 1, sz = 1) => {
    const m = B.MeshBuilder.CreateSphere(id + ":" + name, { diameter: d, segments: 10 }, scene);
    m.scaling.set(1, sy, sz);
    return add(m, parent, x, y, z, hex);
  };
  const cyl = (name, parent, dTop, dBot, h, x, y, z, hex) => add(B.MeshBuilder.CreateCylinder(id + ":" + name, { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: 16 }, scene), parent, x, y, z, hex);

  const L = Object.assign({ skin: "#e0b794", top: "#888888", pants: "#333333", shoes: "#222222", build: 1 }, look);
  const w = L.build; // shoulder width factor

  /* ---- hips, legs, feet ---- */
  const hips = node("hips", root, 0, H.hip, 0);
  const legs = [];
  [-1, 1].forEach((s) => {
    const side = s < 0 ? "L" : "R";
    const hip = node("hip" + side, hips, s * 0.1, 0, 0);
    limb("thigh" + side, hip, H.thigh + 0.1, 0.085 * w, L.pants);
    const knee = node("knee" + side, hip, 0, -H.thigh, 0);
    limb("shin" + side, knee, H.shin + 0.1, 0.07 * w, L.pants);
    const ankle = node("ankle" + side, knee, 0, -H.shin, 0);
    ball("foot" + side, ankle, 0.14, 0, 0.0, 0.05, L.shoes, 0.62, 1.7).position.y = 0.045;
    legs.push({ hip, knee, dir: s });
  });
  ball("pelvis", hips, 0.3 * w, 0, 0.02, 0, L.pants, 0.7, 0.75);

  /* ---- torso, with a coat that hangs to the knee if asked ---- */
  const torso = node("torso", hips, 0, 0.02, 0);
  add(B.MeshBuilder.CreateCapsule(id + ":chest", { radius: 0.19 * w, height: 0.62, tessellation: 12, capSubdivisions: 3 }, scene), torso, 0, 0.27, 0, L.top);
  torso.getChildMeshes().forEach((m) => (m.scaling.z = 0.78));
  if (L.coat) {
    const c = cyl("coat", hips, 0.4 * w, 0.52 * w, L.coat, 0, -L.coat / 2 + 0.06, 0, L.top);
    c.scaling.z = 0.8;
  }
  if (L.belt) {
    const b = cyl("belt", hips, 0.4 * w, 0.4 * w, 0.06, 0, 0.1, 0, L.belt);
    b.scaling.z = 0.8;
  }

  /* ---- neck, head, face ---- */
  const neck = node("neck", torso, 0, 0.6, 0);
  cyl("neckMesh", neck, 0.09, 0.1, 0.12, 0, 0.03, 0, L.skin);
  const head = node("head", neck, 0, 0.2, 0.01);
  ball("skull", head, H.head * 2, 0, 0, 0, L.skin, 1.06);
  [-1, 1].forEach((s) => ball("eye" + (s < 0 ? "L" : "R"), head, 0.05, s * 0.07, 0.01, 0.152, "#15151c", 1.15, 0.5));
  ball("mouth", head, 0.06, 0, -0.08, 0.16, "#7a3a3a", 0.35, 0.4);
  ball("nose", head, 0.035, 0, -0.03, 0.18, L.skin);
  [-1, 1].forEach((s) => ball("ear" + (s < 0 ? "L" : "R"), head, 0.06, s * 0.18, 0, 0, L.skin, 1, 0.6));
  if (L.hair) {
    // a cap over the back and top of the skull, face and forehead left clear
    ball("hair", head, H.head * 2.1, 0, 0.035, -0.035, L.hair, 0.9);
    if (L.bun) ball("bun", head, 0.14, 0, 0.17, -0.12, L.hair);
  }
  if (L.glasses) {
    [-1, 1].forEach((s) => {
      const r = B.MeshBuilder.CreateTorus(id + ":lens" + (s < 0 ? "L" : "R"), { diameter: 0.1, thickness: 0.014, tessellation: 18 }, scene);
      r.rotation.x = Math.PI / 2;
      add(r, head, s * 0.07, 0.02, 0.16, L.glasses, 0.7);
    });
    add(B.MeshBuilder.CreateBox(id + ":bridge", { width: 0.04, height: 0.012, depth: 0.012 }, scene), head, 0, 0.025, 0.17, L.glasses, 0.7);
  }
  const hat = L.hat;
  if (hat && hat.type === "straw") {
    // brim no wider than 1.8x the head, set back and high so eyes and mouth stay clear from above and the side
    cyl("brim", head, hat.brim, hat.brim, 0.025, 0, 0.13, -0.02, hat.color);
    cyl("crown", head, hat.brim * 0.46, hat.brim * 0.5, 0.11, 0, 0.19, -0.02, hat.color);
    cyl("band", head, hat.brim * 0.52, hat.brim * 0.52, 0.03, 0, 0.15, -0.02, hat.band || "#8a4a2a");
  } else if (hat && hat.type === "helmet") {
    ball("helmet", head, 0.4, 0, 0.1, -0.025, hat.color, 0.62);
    cyl("visor", head, 0.2, 0.2, 0.02, 0, 0.12, 0.17, hat.color);
  }

  /* ---- arms and hands ---- */
  const arms = [];
  [-1, 1].forEach((s) => {
    const side = s < 0 ? "L" : "R";
    const sh = node("shoulder" + side, torso, s * 0.25 * w, 0.54, 0);
    ball("shoulderCap" + side, sh, 0.15 * w, 0, 0, 0, L.top);
    limb("upper" + side, sh, H.upperArm + 0.08, 0.06 * w, L.top);
    const el = node("elbow" + side, sh, 0, -H.upperArm, 0);
    limb("fore" + side, el, H.foreArm + 0.08, 0.052 * w, L.sleeve || L.top);
    const wr = node("wrist" + side, el, 0, -H.foreArm, 0);
    ball("hand" + side, wr, 0.1, 0, -0.04, 0, L.gloves || L.skin);
    arms.push({ sh, el, wr, dir: s });
  });

  /* ---- carried / worn things ---- */
  const carry = L.carry;
  if (carry === "basket") {
    // a basket of tomatoes in her right hand
    const wr = nodes.wristR;
    add(B.MeshBuilder.CreateBox(id + ":basket", { width: 0.22, height: 0.13, depth: 0.16 }, scene), wr, 0.05, -0.12, 0.02, "#8a5a2a");
    [-0.06, 0.02, 0.09].forEach((x, i) => ball("tomato" + i, wr, 0.085, 0.05 + x * 0.8, -0.04, 0.02, "#d83a2a"));
  } else if (carry === "parcel") {
    add(B.MeshBuilder.CreateBox(id + ":parcel", { width: 0.46, height: 0.4, depth: 0.22 }, scene), torso, 0, 0.3, -0.27, "#c8a070");
    add(B.MeshBuilder.CreateBox(id + ":tape", { width: 0.06, height: 0.41, depth: 0.225 }, scene), torso, 0, 0.3, -0.27, "#e8d9b0");
    [-1, 1].forEach((s) => add(B.MeshBuilder.CreateBox(id + ":strap" + (s < 0 ? "L" : "R"), { width: 0.05, height: 0.5, depth: 0.24 }, scene), torso, s * 0.13, 0.3, -0.03, "#2a2c34"));
  } else if (carry === "telescope") {
    // a brass-and-silver tube slung on her back, one end over the shoulder
    const t = cyl("scope", torso, 0.07, 0.1, 0.75, 0.12, 0.35, -0.24, "#cfd4dc");
    t.rotation.z = -0.35;
    const cap = cyl("scopeCap", torso, 0.11, 0.11, 0.05, 0.215, 0.73, -0.24, "#b08a4a");
    cap.rotation.z = -0.35;
  }
  meshes.forEach((m) => {
    m.freezeNormals && m.freezeNormals();
  });

  /* phase is the walk cycle in radians, amount 0..1 how much of it to show */
  function pose(phase, amount, swing = 0.7) {
    const s = Math.sin(phase) * swing * amount;
    legs.forEach((l) => {
      l.hip.rotation.x = s * l.dir;
      l.knee.rotation.x = Math.max(0, -s * l.dir) * 0.9;
    });
    arms.forEach((a) => {
      a.sh.rotation.x = -s * a.dir * 0.8;
      a.el.rotation.x = -0.15 - Math.max(0, s * a.dir) * 0.5 * amount;
    });
    torso.rotation.y = s * 0.12;
    head.rotation.y = -s * 0.08;
  }
  pose(0, 0);
  if (carry === "basket") arms[1].sh.rotation.x = -0.35; // basket arm held out a little

  return { root, nodes, meshes, legs, arms, pose, height: 1.84 * scale, legLen: (H.thigh + H.shin) * scale };
}
