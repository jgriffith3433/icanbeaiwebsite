/* ==========================================================================
   People kit — low-poly articulated figures built in code (docs/characters.md).
   buildFigure(B, scene, id, look, scale) -> { root, nodes, meshes, legs, arms, pose, step, anim, ... }.
   Every limb is a named TransformNode (<id>:hipL, :kneeL, :ankleL, :shoulderR, :elbowR, :wristR, :neck, :head ...)
   with smooth-shaded Babylon primitives hanging off it, so all faces point outward. Figures face +z, feet at y 0,
   about 1.8 m tall before `scale`. Procedural gait: stride rate follows real ground speed (WALK_STRIDE), plant-lock
   keeps a supporting foot from sliding, plus idles, beat gestures, sit and weather posture.
   Pure data in, no globals: scripts/check-neighbors.mjs builds them in a NullEngine.
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

/** Metres of ground covered by one full walk cycle (left + right) at amount 1. Calibrated so plant-lock stays quiet. */
export const WALK_STRIDE = 0.92;

/** Max slide (m) a planted foot may travel before detectors count a failure. */
export const FOOT_SLIDE_LIMIT = 0.05;

const TWO_PI = Math.PI * 2;

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
  const carry = L.carry;

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
    legs.push({ hip, knee, ankle, dir: s, side });
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
    arms.push({ sh, el, wr, dir: s, side });
  });

  /* ---- carried / worn things ---- */
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

  /* umbrella (left hand): hidden until rain / storm weather pose raises it */
  const umb = node("umbrella", nodes.wristL, 0.02, -0.06, 0.02);
  const umbStick = cyl("umbStick", umb, 0.018, 0.018, 0.55, 0, 0.2, 0, "#3a2a1a");
  const umbCanopy = cyl("umbCanopy", umb, 0.42, 0.08, 0.12, 0, 0.48, 0, L.top === "#f2c230" ? "#4a7fc0" : L.top);
  umbStick.isVisible = false;
  umbCanopy.isVisible = false;
  const umbrellaMeshes = [umbStick, umbCanopy];

  meshes.forEach((m) => {
    m.freezeNormals && m.freezeNormals();
  });

  const anim = {
    phase: 0,
    state: "idle",
    amount: 0,
    idleT: Math.random() * 10,
    idleKind: (id.charCodeAt(0) || 0) % 4,
    gesture: null,
    gestureT: 0,
    lookK: 0,
    lookY: 0,
    lookX: 0,
    lookNow: 0,
    sitBlend: 0,
    weather: "clear",
    weatherK: 0,
    plant: { L: null, R: null },
    prevFoot: { L: null, R: null },
    hipsHome: { x: 0, y: 0, z: 0 },
  };
  hips.position.set(0, H.hip, 0);

  function footWorld(side) {
    const ankle = nodes["ankle" + side];
    ankle.computeWorldMatrix(true);
    const m = ankle.getWorldMatrix().m;
    return { x: m[12], y: m[13], z: m[14] };
  }

  function zeroJoints() {
    legs.forEach((l) => {
      l.hip.rotation.set(0, 0, 0);
      l.knee.rotation.set(0, 0, 0);
      l.ankle.rotation.set(0, 0, 0);
    });
    arms.forEach((a) => {
      a.sh.rotation.set(0, 0, 0);
      a.el.rotation.set(0, 0, 0);
      a.wr.rotation.set(0, 0, 0);
    });
    torso.rotation.set(0, 0, 0);
    neck.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    hips.position.set(0, H.hip, 0);
    hips.rotation.set(0, 0, 0);
    if (carry === "basket") arms[1].sh.rotation.x = -0.35;
  }

  /* phase is the walk cycle in radians, amount 0..1 how much of it to show (kept for NullEngine smoke) */
  function pose(phase, amount, swing = 0.65) {
    const s = Math.sin(phase) * swing * amount;
    legs.forEach((l) => {
      l.hip.rotation.x = s * l.dir;
      l.knee.rotation.x = Math.max(0, -s * l.dir) * 0.9;
    });
    arms.forEach((a) => {
      if (carry === "basket" && a.side === "R") {
        a.sh.rotation.x = -0.35 - s * a.dir * 0.15 * amount;
      } else {
        a.sh.rotation.x = -s * a.dir * 0.85;
        a.el.rotation.x = -0.15 - Math.max(0, s * a.dir) * 0.45 * amount;
      }
    });
    torso.rotation.y = s * 0.1;
    head.rotation.y = -s * 0.08;
  }

  function applyWalk(phase, amount, hurry) {
    const swing = 0.55 + hurry * 0.22;
    pose(phase, amount, swing);
    // a slight forward lean when hurrying in the rain
    torso.rotation.x = hurry * 0.18 * amount;
    hips.position.y = H.hip - (H.thigh + H.shin) * (1 - Math.cos(Math.sin(phase) * swing * amount)) * 0.55;
  }

  function applyTurn(phase, amount) {
    const s = Math.sin(phase) * 0.35 * amount;
    legs.forEach((l) => {
      l.hip.rotation.y = s * l.dir * 0.6;
      l.hip.rotation.x = Math.abs(s) * 0.25;
      l.knee.rotation.x = Math.abs(s) * 0.4;
    });
    arms.forEach((a) => {
      a.sh.rotation.z = s * a.dir * 0.3;
      a.el.rotation.x = -0.2;
    });
    torso.rotation.y = s * 0.2;
  }

  function applySit(blend) {
    const b = blend;
    hips.position.y = H.hip - 0.42 * b;
    legs.forEach((l) => {
      l.hip.rotation.x = -1.15 * b;
      l.knee.rotation.x = 1.35 * b;
      l.ankle.rotation.x = -0.2 * b;
    });
    torso.rotation.x = 0.08 * b;
    arms.forEach((a) => {
      a.sh.rotation.x = -0.35 * b;
      a.el.rotation.x = -0.55 * b;
    });
    if (carry === "basket") arms[1].sh.rotation.x = -0.45;
  }

  function applyIdle(kind, t, personality) {
    const breath = Math.sin(t * 1.7) * 0.02;
    torso.rotation.x = breath;
    hips.position.y = H.hip + breath * 0.5;
    // personality owns a couple of the idle slots so each neighbour stays themselves
    if (personality === "phone" && (kind === 2 || kind === 3)) {
      arms[0].sh.rotation.x = -1.1;
      arms[0].sh.rotation.z = 0.35;
      arms[0].el.rotation.x = -1.4;
      head.rotation.x = -0.35;
      head.rotation.y = -0.25;
      return;
    }
    if (personality === "plants" && (kind === 2 || kind === 3)) {
      torso.rotation.x = 0.28;
      arms[1].sh.rotation.x = -0.7;
      arms[1].el.rotation.x = -0.9;
      arms[0].sh.rotation.x = -0.25;
      head.rotation.x = 0.25;
      return;
    }
    if (personality === "scope" && (kind === 2 || kind === 3)) {
      // Ines: aim the sky, one hand on the scope
      head.rotation.x = -0.55 + Math.sin(t * 0.35) * 0.08;
      neck.rotation.x = -0.15;
      arms[1].sh.rotation.x = -1.5;
      arms[1].sh.rotation.z = -0.35;
      arms[1].el.rotation.x = -0.4;
      arms[0].sh.rotation.x = -0.4;
      return;
    }
    if (kind === 0) {
      const wgt = Math.sin(t * 0.7) * 0.12;
      legs[0].hip.rotation.z = wgt;
      legs[1].hip.rotation.z = -wgt;
      hips.position.x = wgt * 0.04;
    } else {
      head.rotation.y = Math.sin(t * 0.55) * 0.55;
      neck.rotation.y = head.rotation.y * 0.35;
      head.rotation.x = Math.sin(t * 0.4) * 0.12;
    }
  }

  function applyGesture(name, t, dur, personality) {
    const u = Math.min(1, t / 0.25);
    const out = t > dur - 0.35 ? Math.max(0, (dur - t) / 0.35) : 1;
    const k = u * out;
    if (name === "ask") {
      // wave toward the sky with the free arm
      const a = carry === "basket" ? arms[0] : arms[1];
      a.sh.rotation.x = -2.1 * k;
      a.sh.rotation.z = (a.dir < 0 ? 0.4 : -0.4) * k;
      a.el.rotation.x = -0.35 * k;
      a.wr.rotation.z = Math.sin(t * 10) * 0.45 * k;
      head.rotation.x = -0.35 * k;
      head.rotation.y = 0.15 * k;
    } else if (name === "thanks") {
      // cheer / clap
      arms.forEach((a) => {
        a.sh.rotation.x = -1.6 * k;
        a.sh.rotation.z = -a.dir * 0.55 * k;
        a.el.rotation.x = -0.7 * k;
      });
      const clap = Math.abs(Math.sin(t * 12)) * 0.25 * k;
      arms[0].sh.rotation.z += clap;
      arms[1].sh.rotation.z -= clap;
      head.rotation.x = -0.2 * k;
      torso.rotation.x = -0.08 * k;
    } else if (name === "surprise") {
      // character-shaped offer / point, with a small step back
      legs.forEach((l) => {
        l.hip.rotation.x = (l.dir < 0 ? 0.25 : -0.4) * k;
        l.knee.rotation.x = 0.3 * k;
      });
      torso.rotation.x = -0.12 * k;
      if (personality === "plants") {
        // Birdie: offer the tomato basket forward
        arms[1].sh.rotation.x = -0.9 * k;
        arms[1].sh.rotation.z = -0.35 * k;
        arms[1].el.rotation.x = -0.5 * k;
        arms[0].sh.rotation.x = -0.3 * k;
        head.rotation.x = 0.15 * k;
      } else if (personality === "phone") {
        // Dex: present the parcel with both hands
        arms.forEach((a) => {
          a.sh.rotation.x = -0.85 * k;
          a.sh.rotation.z = -a.dir * 0.25 * k;
          a.el.rotation.x = -0.6 * k;
        });
        head.rotation.x = 0.1 * k;
      } else {
        // Ines: point at the sky / a star
        arms[1].sh.rotation.x = -2.2 * k;
        arms[1].sh.rotation.z = -0.2 * k;
        arms[1].el.rotation.x = -0.15 * k;
        arms[0].sh.rotation.x = -0.35 * k;
        head.rotation.x = -0.55 * k;
        neck.rotation.x = -0.2 * k;
      }
    } else if (name === "wave") {
      // a small hello: free hand up beside the head, wrist waggle, head toward him (the look is added after)
      const a = arms[1];
      a.sh.rotation.x = -2.0 * k;
      a.sh.rotation.z = -a.dir * 0.3 * k;
      a.el.rotation.x = -0.9 * k;
      a.wr.rotation.z = Math.sin(t * 11) * 0.5 * k;
      torso.rotation.x = -0.04 * k;
    } else if (name === "nod") {
      // two small nods and a hand half raised
      head.rotation.x = Math.sin(Math.min(t, 1.1) * 8) * 0.28 * k;
      arms[1].sh.rotation.x = -0.5 * k;
      arms[1].el.rotation.x = -0.6 * k;
    } else if (name === "point") {
      // point at the sky he made, eyes following the arm
      arms[1].sh.rotation.x = -2.35 * k;
      arms[1].sh.rotation.z = -arms[1].dir * 0.1 * k;
      arms[1].el.rotation.x = -0.1 * k;
      arms[0].sh.rotation.x = -0.25 * k;
      head.rotation.x = -0.5 * k;
      neck.rotation.x = -0.15 * k;
    } else if (name === "duck") {
      // flinch from a bolt: crouch, both arms over the head
      legs.forEach((l) => { l.hip.rotation.x = -0.7 * k; l.knee.rotation.x = 1.2 * k; });
      hips.position.y = H.hip - 0.2 * k;
      torso.rotation.x = 0.45 * k;
      head.rotation.x = 0.3 * k;
      arms.forEach((a) => {
        a.sh.rotation.x = -2.5 * k;
        a.sh.rotation.z = -a.dir * 0.1 * k;
        a.el.rotation.x = -1.9 * k;
      });
    } else if (name === "react") {
      // look up / flinch at a bolt or storm he called
      head.rotation.x = -0.7 * k;
      neck.rotation.x = -0.25 * k;
      arms.forEach((a) => {
        a.sh.rotation.x = -0.55 * k;
        a.sh.rotation.z = -a.dir * 0.25 * k;
      });
      torso.rotation.x = -0.1 * k;
    } else if (name === "work") {
      // Dex patching a turbine: reach up along a blade, lean in, a small twist of the wrist
      const twist = Math.sin(t * 7) * 0.18 * k;
      arms[1].sh.rotation.x = -2.35 * k;
      arms[1].sh.rotation.z = (-0.15 + twist) * k;
      arms[1].el.rotation.x = -0.45 * k;
      arms[1].wr.rotation.z = twist * 1.4;
      arms[0].sh.rotation.x = -1.1 * k;
      arms[0].sh.rotation.z = 0.35 * k;
      arms[0].el.rotation.x = -0.55 * k;
      head.rotation.x = -0.55 * k;
      neck.rotation.x = -0.18 * k;
      torso.rotation.x = -0.14 * k;
      torso.rotation.z = 0.08 * k;
      legs[0].hip.rotation.x = 0.18 * k;
      legs[1].hip.rotation.x = -0.12 * k;
    }
  }

  function applyWeather(weather, k) {
    if (k < 0.01) {
      umbrellaMeshes.forEach((m) => (m.isVisible = false));
      return;
    }
    if (weather === "rain" || weather === "storm") {
      // hunch, free arm up holding the umbrella
      torso.rotation.x += 0.22 * k;
      head.rotation.x += 0.2 * k;
      const a = arms[0];
      a.sh.rotation.x = -2.0 * k;
      a.sh.rotation.z = 0.55 * k;
      a.el.rotation.x = -0.2 * k;
      umbrellaMeshes.forEach((m) => (m.isVisible = true));
      umb.rotation.x = -0.4;
      umb.rotation.z = 0.3;
    } else if (weather === "wind") {
      // lean into it, one hand pinning the hat
      torso.rotation.x += 0.12 * k;
      const a = arms[1];
      a.sh.rotation.x = -2.55 * k;
      a.sh.rotation.z = -a.dir * 0.15 * k;
      a.el.rotation.x = -1.6 * k;
      head.rotation.x += 0.12 * k;
      umbrellaMeshes.forEach((m) => (m.isVisible = false));
    } else if (weather === "sun" || weather === "clear") {
      // shield eyes when the sky is bright (sun break / clear with sun weight)
      arms[0].sh.rotation.x = -1.5 * k;
      arms[0].sh.rotation.z = 0.7 * k;
      arms[0].el.rotation.x = -1.1 * k;
      head.rotation.x = -0.25 * k;
      umbrellaMeshes.forEach((m) => (m.isVisible = false));
    } else {
      umbrellaMeshes.forEach((m) => (m.isVisible = false));
    }
  }

  function plantedSides(phase, amount) {
    if (amount < 0.35) return { L: false, R: false };
    const s = Math.sin(phase);
    // supporting foot is the rear one (hip rotation pulls that leg back)
    return { L: s * -1 < -0.55, R: s * 1 < -0.55 };
  }

  function plantLock(phase, amount) {
    root.computeWorldMatrix(true);
    const planted = plantedSides(phase, amount);
    let slide = 0;
    ["L", "R"].forEach((side) => {
      const fw = footWorld(side);
      if (!planted[side]) {
        anim.plant[side] = null;
        anim.prevFoot[side] = fw;
        return;
      }
      if (!anim.plant[side]) anim.plant[side] = { x: fw.x, z: fw.z };
      const dx = fw.x - anim.plant[side].x;
      const dz = fw.z - anim.plant[side].z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001) {
        // pull hips in world XZ so the planted ankle stays put
        const inv = root.getWorldMatrix().clone().invert();
        const a = B.Vector3.TransformCoordinates(new B.Vector3(fw.x, 0, fw.z), inv);
        const b = B.Vector3.TransformCoordinates(new B.Vector3(anim.plant[side].x, 0, anim.plant[side].z), inv);
        hips.position.x += b.x - a.x;
        hips.position.z += b.z - a.z;
        root.computeWorldMatrix(true);
        const after = footWorld(side);
        slide = Math.max(slide, Math.hypot(after.x - anim.plant[side].x, after.z - anim.plant[side].z));
      }
      anim.prevFoot[side] = footWorld(side);
    });
    return { planted, slide };
  }

  /**
   * One animation frame. ctx:
   *   dt, speed (m/s ground), moving, yawErr (rad), sit, weather ('rain'|'storm'|'sun'|...),
   *   sunShield (0..1), gesture ('ask'|'thanks'|'surprise'|'work'|null), personality ('phone'|'plants'|...),
   *   jump (true = big teleport: reset plants)
   */
  function step(ctx) {
    const dt = Math.max(0, Math.min(0.1, ctx.dt || 0.016));
    const speed = Math.max(0, ctx.speed || 0);
    const moving = !!ctx.moving && speed > 0.08;
    const yawErr = ctx.yawErr || 0;
    const turning = moving && Math.abs(yawErr) > 0.55;
    const hurry = ctx.weather === "rain" || ctx.weather === "storm" ? 1 : 0;

    if (ctx.jump) {
      anim.plant.L = anim.plant.R = null;
      anim.prevFoot.L = anim.prevFoot.R = null;
    }

    // flinch / look-up once when ability weather cracks nearby (crowd-style; cools 4 s)
    if (anim.reactCool > 0) anim.reactCool -= dt;
    if (ctx.react && !anim.gesture && !(anim.reactCool > 0)) {
      anim.gesture = "react";
      anim.gestureT = 0;
      anim.reactCool = 4;
    }
    // a small greeting (wave / nod) or a reaction to his weather (point / duck) when they are free
    if (ctx.greet && !anim.gesture && ["wave", "nod", "point", "duck"].includes(ctx.greet)) {
      anim.gesture = ctx.greet;
      anim.gestureT = 0;
    } else if (ctx.greet === "duck" && anim.gesture && anim.gesture !== "duck" && anim.gesture !== "work") {
      anim.gesture = "duck";
      anim.gestureT = 0;
    }
    // gesture request
    if (ctx.gesture && ctx.gesture !== anim.gesture && ctx.gesture !== "react") {
      anim.gesture = ctx.gesture;
      anim.gestureT = 0;
    }
    const gestDur = anim.gesture === "thanks" ? 1.8
      : anim.gesture === "surprise" ? 1.5
      : anim.gesture === "react" ? 1.2
      : anim.gesture === "wave" ? 1.9
      : anim.gesture === "nod" ? 1.3
      : anim.gesture === "point" ? 2.1
      : anim.gesture === "duck" ? 1.3
      : anim.gesture === "work" ? 6.5
      : 2.2;
    if (anim.gesture) {
      anim.gestureT += dt;
      // work loops while the ending still wants it (ctx.gesture stays "work")
      if (anim.gestureT > gestDur) {
        if (anim.gesture === "work" && ctx.gesture === "work") anim.gestureT = 0;
        else anim.gesture = null;
      }
    }

    // weather blend
    const wantWeather = ctx.weather === "rain" || ctx.weather === "storm" || ctx.weather === "wind" ? ctx.weather
      : (ctx.sunShield || 0) > 0.4 ? "sun" : "clear";
    anim.weather = wantWeather;
    const wTarget = wantWeather === "clear" ? 0 : 1;
    anim.weatherK += (wTarget - anim.weatherK) * Math.min(1, dt * 3);

    // sit blend
    const sitTarget = ctx.sit && !moving && !anim.gesture ? 1 : 0;
    anim.sitBlend += (sitTarget - anim.sitBlend) * Math.min(1, dt * 4);

    // walk amount + phase from real speed
    const walkTarget = moving && !turning && anim.sitBlend < 0.4 && !anim.gesture ? 1 : 0;
    anim.amount += (walkTarget - anim.amount) * Math.min(1, dt * (walkTarget ? 6 : 5));
    if (turning) {
      anim.phase += dt * 7;
      anim.state = "turn";
    } else if (anim.amount > 0.05 && moving) {
      const stride = WALK_STRIDE * (hurry ? 1.12 : 1);
      anim.phase += (speed / Math.max(0.2, stride)) * TWO_PI * dt;
      anim.state = hurry ? "hurry" : "walk";
    } else if (anim.gesture) {
      anim.state = "gesture-" + anim.gesture;
    } else if (anim.sitBlend > 0.5) {
      anim.state = "sit";
    } else {
      anim.state = "idle";
      anim.idleT += dt;
      if (anim.idleT > 4.5 + (id.length % 3)) {
        anim.idleT = 0;
        anim.idleKind = (anim.idleKind + 1) % 4;
      }
    }

    zeroJoints();
    if (anim.sitBlend > 0.02) applySit(anim.sitBlend);
    if (turning && moving) applyTurn(anim.phase, Math.min(1, Math.abs(yawErr)));
    else if (anim.amount > 0.02) applyWalk(anim.phase, anim.amount, hurry);
    else if (anim.state === "idle") {
      applyIdle(anim.idleKind, anim.idleT, ctx.personality || null);
    }
    if (anim.gesture) applyGesture(anim.gesture, anim.gestureT, gestDur, ctx.personality || null);
    // weather on top (umbrella / shield) when not mid-gesture, or lightly during walk
    if (!anim.gesture || anim.gesture === "surprise" || (anim.gesture === "nod" && anim.weather !== "wind")) {
      applyWeather(anim.weather, anim.weatherK * (anim.gesture === "surprise" && (anim.weather === "rain" || anim.weather === "storm") ? 1 : anim.gesture ? 0.35 : 1));
    } else {
      umbrellaMeshes.forEach((m) => (m.isVisible = false));
    }

    // head look-at with limits: yaw +-62 deg (the neck takes a third), pitch +-0.3, eased in and out
    {
      const want = ctx.look ? 1 : 0;
      anim.lookK += (want - anim.lookK) * Math.min(1, dt * 7);
      if (ctx.look) {
        anim.lookY += (Math.max(-1.08, Math.min(1.08, ctx.look.yaw)) - anim.lookY) * Math.min(1, dt * 10);
        anim.lookX += (Math.max(ctx.look.wide ? -0.66 : -0.3, Math.min(0.3, ctx.look.pitch || 0)) - anim.lookX) * Math.min(1, dt * 10);
      }
      const lk = anim.lookK * (anim.gesture === "duck" || anim.gesture === "point" ? 0.2 : 1);
      head.rotation.y += anim.lookY * 0.68 * lk;
      neck.rotation.y += anim.lookY * 0.32 * lk;
      head.rotation.x += anim.lookX * lk;
      anim.lookNow = anim.lookY * lk;
    }

    let plant = { planted: { L: false, R: false }, slide: 0 };
    if (anim.amount > 0.3 && !turning && !ctx.jump) plant = plantLock(anim.phase, anim.amount);
    else {
      anim.plant.L = anim.plant.R = null;
      root.computeWorldMatrix(true);
    }

    const footL = footWorld("L");
    const footR = footWorld("R");
    return {
      state: anim.state,
      phase: anim.phase,
      amount: anim.amount,
      speed,
      gesture: anim.gesture,
      look: anim.lookNow,
      lookPitch: anim.lookX * anim.lookK,
      weather: anim.weather,
      weatherK: anim.weatherK,
      sit: anim.sitBlend,
      plantedL: plant.planted.L,
      plantedR: plant.planted.R,
      footL,
      footR,
      plantSlide: plant.slide,
      stride: WALK_STRIDE,
    };
  }

  zeroJoints();
  pose(0, 0);

  return {
    root,
    nodes,
    meshes,
    legs,
    arms,
    pose,
    step,
    anim,
    footWorld,
    height: 1.84 * scale,
    legLen: (H.thigh + H.shin) * scale,
    stride: WALK_STRIDE,
  };
}

/** Compare a step sample to previous foot positions; returns { footSlide, mismatch }. */
export function detectAnimProblems(sample, prev, opts = {}) {
  const limit = opts.limit != null ? opts.limit : FOOT_SLIDE_LIMIT;
  const out = { footSlide: false, mismatch: false, slideM: 0 };
  if (!sample || !prev) return out;
  if (sample.jump || prev.jump) return out;
  // planted foot must not travel more than `limit` metres along the ground this frame
  [["plantedL", "footL"], ["plantedR", "footR"]].forEach(([pKey, fKey]) => {
    if (!sample[pKey] || !prev[pKey] || !sample[fKey] || !prev[fKey]) return;
    const d = Math.hypot(sample[fKey].x - prev[fKey].x, sample[fKey].z - prev[fKey].z);
    out.slideM = Math.max(out.slideM, d);
    if (d > limit) out.footSlide = true;
  });
  // state / motion mismatch: idle or sit while moving, or walk while nearly still
  const moving = sample.speed > 0.25;
  if ((sample.state === "idle" || sample.state === "sit") && moving) out.mismatch = true;
  if ((sample.state === "walk" || sample.state === "hurry") && sample.speed < 0.05 && sample.amount > 0.5) out.mismatch = true;
  return out;
}
